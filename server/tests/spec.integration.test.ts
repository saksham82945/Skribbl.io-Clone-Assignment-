/**
 * Walks through every WebSocket event suggested in the assignment PDF and
 * checks the payload shapes it lists, over real Socket.IO connections.
 */
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, JoinResult, ServerToClientEvents } from '../../shared/types';
import { createApp } from '../src/app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Events = ServerToClientEvents;
const avatar = { color: '#f94144', emoji: '😀' };

let url = '';
let close: () => void;
const clients: Client[] = [];

beforeAll(async () => {
  const { httpServer, io } = createApp({ chooseTimeMs: 5000, turnEndDelayMs: 150, gameOverDelayMs: 300, targetPlayers: 0 });
  await new Promise<void>((r) => httpServer.listen(0, r));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  close = () => {
    io.close();
    httpServer.close();
  };
});

afterAll(() => {
  clients.forEach((c) => c.disconnect());
  close();
});

function connect(): Client {
  const c: Client = ioClient(url, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  return c;
}

/** Records every event a client receives so tests can wait on / inspect them. */
function recorder(c: Client) {
  const log: { event: string; payload: any }[] = [];
  c.onAny((event, payload) => log.push({ event, payload }));
  const all = <E extends keyof Events>(event: E) => log.filter((l) => l.event === event).map((l) => l.payload as Parameters<Events[E]>[0]);
  /** Resolves with the n-th (1-based) event of this type matching `pred`, whether it already arrived or not. */
  const next = <E extends keyof Events>(event: E, pred: (p: any) => boolean = () => true, n = 1) =>
    new Promise<Parameters<Events[E]>[0]>((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        const hits = log.filter((l) => l.event === event && pred(l.payload));
        if (hits.length >= n) return resolve(hits[n - 1].payload);
        if (Date.now() - t0 > 8000) return reject(new Error(`timed out waiting for ${event} #${n}`));
        setTimeout(tick, 10);
      };
      tick();
    });
  return { log, all, next };
}

const ok = (res: any) => {
  if (!res.ok) throw new Error(res.error);
  return res as { ok: true } & JoinResult;
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Spec: Room & Lobby events', () => {
  it('create_room { hostName, settings } → host gets the room with those settings', async () => {
    const host = connect();
    const h = recorder(host);
    const res = ok(await host.emitWithAck('create_room', { hostName: 'Host', avatar, settings: { rounds: 4, drawTime: 60, maxPlayers: 5 } }));
    const state = await h.next('room_state');
    expect(state.roomId).toBe(res.roomId);
    expect(state.settings).toMatchObject({ rounds: 4, drawTime: 60, maxPlayers: 5 });
    expect(state.hostId).toBe(res.playerId);
  });

  it('join_room { roomId, playerName } → player_joined { player, players } / player_left { playerId, players }', async () => {
    const host = connect();
    const h = recorder(host);
    const room = ok(await host.emitWithAck('create_room', { hostName: 'Host', avatar }));
    const guest = connect();
    const g = ok(await guest.emitWithAck('join_room', { roomId: room.roomId, playerName: 'Guest', avatar }));

    const joined = await h.next('player_joined', (p) => p.player.name === 'Guest');
    expect(joined.player.id).toBe(g.playerId);
    expect(joined.players.map((p) => p.name)).toEqual(['Host', 'Guest']);

    guest.emit('leave_room');
    const left = await h.next('player_left', (p) => p.playerId === g.playerId);
    expect(left.players.map((p) => p.name)).toEqual(['Host']);
  });

  it('start_game is host-only and needs everyone ready', async () => {
    const host = connect();
    const room = ok(await host.emitWithAck('create_room', { hostName: 'Host', avatar }));
    const guest = connect();
    const g = recorder(guest);
    ok(await guest.emitWithAck('join_room', { roomId: room.roomId, playerName: 'Guest', avatar }));

    guest.emit('start_game');
    expect((await g.next('error_message')).message).toMatch(/host/i);
  });

  it('rejects unknown codes and full rooms; accepts invite codes in any case', async () => {
    const host = connect();
    const room = ok(await host.emitWithAck('create_room', { hostName: 'Host', avatar, settings: { maxPlayers: 2 } }));
    expect((await connect().emitWithAck('join_room', { roomId: 'ZZZZZZ', playerName: 'X', avatar })).ok).toBe(false);
    expect((await connect().emitWithAck('join_room', { roomId: room.roomId.toLowerCase(), playerName: 'A', avatar })).ok).toBe(true);
    const full = await connect().emitWithAck('join_room', { roomId: room.roomId, playerName: 'B', avatar });
    expect(full).toEqual({ ok: false, error: 'This room is full.' });
  });

  it('public rooms are listed; private rooms are not', async () => {
    const pub = ok(await connect().emitWithAck('create_room', { hostName: 'Pub', avatar, settings: { isPrivate: false } }));
    const priv = ok(await connect().emitWithAck('create_room', { hostName: 'Priv', avatar, settings: { isPrivate: true } }));
    const rooms = await connect().emitWithAck('get_public_rooms');
    expect(rooms.map((r) => r.roomId)).toContain(pub.roomId);
    expect(rooms.map((r) => r.roomId)).not.toContain(priv.roomId);
  });
});

describe('Spec: game, drawing, chat & guessing events', () => {
  it('plays a full game with every suggested event and payload', { timeout: 20000 }, async () => {
    const host = connect();
    const guest = connect();
    const h = recorder(host);
    const g = recorder(guest);

    const room = ok(await host.emitWithAck('create_room', { hostName: 'Host', avatar, settings: { rounds: 2, drawTime: 30 } }));
    const me = ok(await guest.emitWithAck('join_room', { roomId: room.roomId, playerName: 'Guest', avatar }));
    guest.emit('player_ready', { ready: true });
    await h.next('room_state', (s) => s.players.every((p: any) => p.isHost || p.isReady));
    host.emit('start_game');

    // round_start { drawerId, wordOptions, drawTime } — options only for the drawer
    const start = await h.next('round_start');
    expect(start).toMatchObject({ drawerId: room.playerId, drawTime: 30 });
    expect(start.wordOptions.length).toBe(3);
    expect((await g.next('round_start')).wordOptions).toEqual([]);

    // word_chosen { word } → game_state { phase, round, drawerId, word, hints }
    const word = start.wordOptions[0];
    host.emit('word_chosen', { word });
    const hostState = await h.next('game_state', (s) => s.phase === 'drawing');
    const guestState = await g.next('game_state', (s) => s.phase === 'drawing');
    expect(hostState).toMatchObject({ phase: 'drawing', round: 1, drawerId: room.playerId, word });
    expect(guestState).toMatchObject({ phase: 'drawing', round: 1, drawerId: room.playerId, word: null });
    expect(typeof guestState.hints).toBe('string');

    // draw_start { x, y, color, size } → draw_move { x, y } (spec form) → draw_end → draw_data to all (incl. drawer)
    host.emit('draw_start', { strokeId: 's1', x: 0.1, y: 0.1, color: '#ff0000', size: 8, tool: 'brush' });
    host.emit('draw_move', { x: 0.2, y: 0.2 });
    host.emit('draw_move', { strokeId: 's1', points: [[0.3, 0.3], [0.4, 0.4]] });
    host.emit('draw_end', { strokeId: 's1' });
    await g.next('draw_data', (e) => e.type === 'end');
    const guestDraws = g.all('draw_data');
    expect(guestDraws[0]).toMatchObject({ type: 'start', stroke: { id: 's1', color: '#ff0000', size: 8 } });
    expect(guestDraws.filter((e) => e.type === 'move').flatMap((e: any) => e.points)).toEqual([[0.2, 0.2], [0.3, 0.3], [0.4, 0.4]]);
    await h.next('draw_data', (e) => e.type === 'end'); // echoed to the drawer as well

    // draw_undo / canvas_clear broadcast
    host.emit('draw_start', { strokeId: 's2', x: 0.5, y: 0.5, color: '#000000', size: 4, tool: 'brush' });
    host.emit('draw_undo');
    expect(await g.next('draw_undo')).toEqual({ strokeId: 's2' });
    const clears = g.all('canvas_clear').length; // one already came with the turn start
    host.emit('canvas_clear');
    await g.next('canvas_clear', () => true, clears + 1);

    // chat { text } → chat_message { playerId, playerName, text }
    guest.emit('chat', { text: 'hello there' });
    expect(await h.next('chat_message', (m) => m.text === 'hello there')).toMatchObject({ playerId: me.playerId, playerName: 'Guest' });

    // guess { text } wrong → guess_result { correct: false } to the guesser only
    await pause(300);
    guest.emit('guess', { text: 'definitely not it' });
    expect(await g.next('guess_result')).toMatchObject({ correct: false, playerId: me.playerId });
    expect(h.all('guess_result')).toEqual([]);

    // guess { text } right → guess_result { correct, playerId, playerName, points } to everyone
    await pause(300);
    guest.emit('guess', { text: word.toUpperCase() });
    const result = await h.next('guess_result', (r) => r.correct);
    expect(result).toMatchObject({ correct: true, playerId: me.playerId, playerName: 'Guest' });
    expect(result.points).toBeGreaterThan(0);
    expect(await h.next('chat_message', (m) => m.kind === 'correct')).toMatchObject({ text: 'Guest guessed the word!' });

    // round_end { word, scores, nextDrawer }
    const end = await h.next('round_end');
    expect(end).toMatchObject({ word, reason: 'all_guessed', nextDrawer: me.playerId });
    expect(end.scores.map((s) => s.name).sort()).toEqual(['Guest', 'Host']);

    // Play the remaining 3 turns, then game_over { winner, leaderboard }
    for (let turn = 2; turn <= 4; turn++) {
      const drawer = turn % 2 === 0 ? guest : host;
      const guesser = drawer === guest ? host : guest;
      const dr = drawer === guest ? g : h;
      const myTurn = Math.ceil(turn / 2); // this is the drawer's 1st or 2nd turn
      const s = await dr.next('round_start', (p) => p.wordOptions.length > 0, myTurn);
      drawer.emit('word_chosen', { word: s.wordOptions[0] });
      await pause(350);
      guesser.emit('guess', { text: s.wordOptions[0] });
      await h.next('round_end', () => true, turn);
    }
    const over = await h.next('game_over');
    expect(over.leaderboard).toHaveLength(2);
    expect(over.winner).toEqual(over.leaderboard[0]);
    await h.next('game_state', (s) => s.phase === 'lobby');
  });
});

describe('Spec: moderation, spectators, languages', () => {
  it('host can kick; the kicked tab cannot silently rejoin with its token', async () => {
    const host = connect();
    const room = ok(await host.emitWithAck('create_room', { hostName: 'Host', avatar }));
    const bad = connect();
    const b = recorder(bad);
    const seat = ok(await bad.emitWithAck('join_room', { roomId: room.roomId, playerName: 'Bad', avatar }));
    host.emit('kick_player', { playerId: seat.playerId });
    await b.next('kicked');
    const again = await bad.emitWithAck('join_room', { roomId: room.roomId, playerName: 'Bad', avatar, token: seat.token });
    expect(again.ok).toBe(false);
  });

  it('report_player is acknowledged privately', async () => {
    const host = connect();
    const room = ok(await host.emitWithAck('create_room', { hostName: 'Host', avatar }));
    const other = connect();
    const o = recorder(other);
    const h = recorder(host);
    ok(await other.emitWithAck('join_room', { roomId: room.roomId, playerName: 'Other', avatar }));
    other.emit('report_player', { playerId: room.playerId, reason: 'spam' });
    expect((await o.next('chat_message', (m) => m.kind === 'report')).text).toMatch(/report/i);
    await pause(100);
    expect(h.all('chat_message').some((m) => m.kind === 'report')).toBe(false);
  });

  it('spectators join without a seat and are shown as watching', async () => {
    const host = connect();
    const h = recorder(host);
    const room = ok(await host.emitWithAck('create_room', { hostName: 'Host', avatar, settings: { maxPlayers: 2 } }));
    ok(await connect().emitWithAck('join_room', { roomId: room.roomId, playerName: 'P2', avatar }));
    const watcher = ok(await connect().emitWithAck('join_room', { roomId: room.roomId, playerName: 'Watcher', avatar, spectator: true }));
    const state = await h.next('room_state', (s) => s.players.some((p: any) => p.id === watcher.playerId));
    expect(state.players.find((p) => p.id === watcher.playerId)!.isSpectator).toBe(true);
    expect(await h.next('chat_message', (m) => m.text === 'Watcher is watching')).toBeTruthy();
  });

  it('word options follow the room language', async () => {
    const host = connect();
    const h = recorder(host);
    const room = ok(await host.emitWithAck('create_room', { hostName: 'Host', avatar, settings: { language: 'de', category: 'animals', wordCount: 5 } }));
    const guest = connect();
    ok(await guest.emitWithAck('join_room', { roomId: room.roomId, playerName: 'Gast', avatar }));
    guest.emit('player_ready', { ready: true });
    await h.next('room_state', (s) => s.players.every((p: any) => p.isHost || p.isReady));
    host.emit('start_game');
    const start = await h.next('round_start');
    const germanAnimals = ['katze', 'hund', 'elefant', 'giraffe', 'pinguin', 'känguru', 'oktopus', 'schlange', 'schildkröte', 'hase', 'löwe', 'tiger', 'zebra', 'affe', 'delfin', 'hai', 'wal', 'eule', 'adler', 'papagei', 'frosch', 'spinne', 'schmetterling', 'biene', 'schnecke', 'krabbe', 'pferd', 'kuh', 'schwein', 'schaf', 'huhn', 'ente', 'fledermaus', 'kamel', 'koala', 'panda', 'fuchs', 'wolf', 'bär', 'eichhörnchen'];
    start.wordOptions.forEach((w) => expect(germanAnimals).toContain(w));
  });
});
