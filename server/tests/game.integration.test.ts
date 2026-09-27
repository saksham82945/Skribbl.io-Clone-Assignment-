import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AckResult,
  ChatMessage,
  ClientToServerEvents,
  GameOverPayload,
  GameStateDTO,
  JoinResult,
  ServerToClientEvents,
} from '../src/shared/types';
import { createApp } from '../src/app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const avatar = { color: '#f94144', emoji: '😀' };
let url = '';
let close: () => void;
const clients: Client[] = [];

beforeAll(async () => {
  const { httpServer, io } = createApp({ chooseTimeMs: 3000, turnEndDelayMs: 100, reconnectGraceMs: 200, gameOverDelayMs: 300, targetPlayers: 0 });
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

function once<E extends keyof ServerToClientEvents>(c: Client, event: E, pred: (...a: Parameters<ServerToClientEvents[E]>) => boolean = () => true) {
  return new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 4000);
    const handler = (...args: Parameters<ServerToClientEvents[E]>) => {
      if (!pred(...args)) return;
      clearTimeout(t);
      c.off(event, handler as never);
      resolve(args[0]);
    };
    c.on(event, handler as never);
  });
}

const ok = (res: AckResult<JoinResult>) => {
  if (!res.ok) throw new Error(res.error);
  return res;
};

describe('full game over sockets', () => {
  it('creates a room, plays every turn and ends with a winner', async () => {
    const alice = connect();
    const bob = connect();

    const created = ok(await alice.emitWithAck('create_room', { hostName: 'Alice', avatar, settings: { rounds: 2, drawTime: 60, hints: 1 } }));
    expect(created.roomId).toMatch(/^[A-Z0-9]{6}$/);

    const joined = ok(await bob.emitWithAck('join_room', { roomId: created.roomId.toLowerCase(), playerName: 'Bob', avatar }));
    const ids: Record<string, Client> = { [created.playerId]: alice, [joined.playerId]: bob };

    // Host can't start until Bob is ready.
    const notReady = once(alice, 'error_message');
    alice.emit('start_game');
    expect((await notReady).message).toMatch(/ready/i);

    const readyState = once(alice, 'room_state', (s) => s.players.every((p) => p.isHost || p.isReady));
    bob.emit('player_ready', { ready: true });
    await readyState;

    // Record every turn start as the drawer sees it (only the drawer gets word options).
    const starts: { drawerId: string; options: string[] }[] = [];
    for (const c of [alice, bob]) {
      c.on('round_start', (s) => {
        if (s.wordOptions.length) starts.push({ drawerId: s.drawerId, options: s.wordOptions });
        else expect(ids[s.drawerId]).not.toBe(c);
      });
    }
    const waitFor = async (cond: () => boolean) => {
      for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 20));
      if (!cond()) throw new Error('condition not met');
    };

    const gameOver = once(alice, 'game_over');
    alice.emit('start_game');
    let turns = 0;

    const playTurn = async () => {
      await waitFor(() => starts.length > turns);
      const start = starts[turns];
      const drawer = ids[start.drawerId];
      const guesser = drawer === alice ? bob : alice;
      turns++;

      const drawerState = once(drawer, 'game_state', (s) => s.phase === 'drawing');
      const guesserState = once(guesser, 'game_state', (s) => s.phase === 'drawing');
      const word = start.options[0];
      drawer.emit('word_chosen', { word });
      const ds = (await drawerState) as GameStateDTO;
      const gs = (await guesserState) as GameStateDTO;
      expect(ds.word).toBe(word);
      expect(gs.word).toBeNull(); // guesser must never receive the word
      expect(gs.hints?.replace(/_/g, '').trim()).toBe(word.replace(/[a-z]/gi, '').trim());

      // Drawing is relayed to the guesser.
      const stroke = once(guesser, 'draw_data', (e) => e.type === 'start');
      drawer.emit('draw_start', { strokeId: `s${turns}`, x: 0.1, y: 0.2, color: '#ff0000', size: 6, tool: 'brush' });
      drawer.emit('draw_move', { strokeId: `s${turns}`, points: [[0.2, 0.3], [0.3, 0.4]] });
      expect(await stroke).toMatchObject({ type: 'start', stroke: { color: '#ff0000' } });

      // Guesser can't draw.
      guesser.emit('canvas_clear');

      // A wrong guess is shown as chat, the right one scores.
      const wrong = once(drawer, 'chat_message', (m: ChatMessage) => m.kind === 'chat');
      guesser.emit('guess', { text: 'definitely-not-the-word' });
      await wrong;

      const result = once(drawer, 'guess_result');
      const end = once(drawer, 'round_end');
      await new Promise((r) => setTimeout(r, 300)); // chat cooldown
      guesser.emit('guess', { text: `  ${word.toUpperCase()} ` });
      const r = await result;
      expect(r.correct).toBe(true);
      expect(r.points).toBeGreaterThan(0);

      const e = await end;
      expect(e.reason).toBe('all_guessed');
      expect(e.word).toBe(word);
    };

    // 2 players × 2 rounds = 4 turns.
    for (let i = 0; i < 4; i++) await playTurn();

    const over = (await gameOver) as GameOverPayload;
    expect(turns).toBe(4);
    expect(over.leaderboard).toHaveLength(2);
    expect(over.winners.length).toBeGreaterThanOrEqual(1);
    expect(over.leaderboard[0].score).toBeGreaterThan(0);

    // After the results screen the room returns to the lobby by itself.
    const lobby = (await once(alice, 'game_state', (g) => g.phase === 'lobby')) as GameStateDTO;
    expect(lobby.phase).toBe('lobby');
  });

  it('rejects unknown rooms and lets a player reclaim their seat with the token', async () => {
    const c = connect();
    const bad = await c.emitWithAck('join_room', { roomId: 'NOPE00', playerName: 'X', avatar });
    expect(bad.ok).toBe(false);

    const host = ok(await c.emitWithAck('create_room', { hostName: 'Host', avatar }));
    c.disconnect();

    const again = connect();
    const back = ok(await again.emitWithAck('join_room', { roomId: host.roomId, playerName: 'Host', avatar, token: host.token }));
    expect(back.playerId).toBe(host.playerId);
  });
});
