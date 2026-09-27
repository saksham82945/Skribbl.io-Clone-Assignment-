import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, DrawEvent, JoinResult, ServerToClientEvents } from '../../shared/types';
import { BOT_DRAWINGS, BOT_WORDS } from '../src/bots/drawings';
import { createApp } from '../src/app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const avatar = { color: '#f94144', emoji: '😀' };

let url = '';
let close: () => void;
const clients: Client[] = [];

beforeAll(async () => {
  // botSpeed 0.02 makes bots act ~50x faster so a whole turn takes well under a second.
  const { httpServer, io } = createApp({ chooseTimeMs: 3000, turnEndDelayMs: 100, autoStartDelayMs: 50, botSpeed: 0.02, botJoinDelayMs: 1500 });
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

const waitFor = async (cond: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('bots', () => {
  it('every bot doodle produces valid, in-bounds strokes', () => {
    expect(BOT_WORDS.length).toBeGreaterThanOrEqual(20);
    for (const word of BOT_WORDS) {
      const strokes = BOT_DRAWINGS[word]();
      expect(strokes.length, word).toBeGreaterThan(0);
      for (const s of strokes) {
        expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
        for (const [x, y] of s.points) {
          expect(x, word).toBeGreaterThanOrEqual(0);
          expect(x, word).toBeLessThanOrEqual(1);
          expect(y, word).toBeGreaterThanOrEqual(0);
          expect(y, word).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('Play! puts a solo player in a public room that fills to 4 and starts by itself', async () => {
    const me = connect();
    let playerCount = 0;
    let firstTurn: { drawerId: string; wordOptions: string[] } | null = null;
    me.on('room_state', (s) => (playerCount = s.players.length));
    me.on('round_start', (s) => (firstTurn ??= s));

    const res = (await me.emitWithAck('quick_play', { playerName: 'Solo', avatar })) as { ok: true } & JoinResult;
    expect(res.ok).toBe(true);
    await waitFor(() => playerCount === 4); // me + 3 automatic players
    await waitFor(() => firstTurn !== null); // auto-start, no Start button needed
    expect(firstTurn!.drawerId).toBe(res.playerId); // I joined first, so I draw first
    expect(firstTurn!.wordOptions.length).toBeGreaterThan(0);
  });

  it('automatic players guess my drawing and then draw their own turn', async () => {
    const me = connect();
    const draws: DrawEvent[] = [];
    let options: string[] = [];
    let playerCount = 0;
    let turnEnds = 0;
    const drawers: string[] = [];
    me.on('room_state', (s) => (playerCount = s.players.length));
    me.on('round_start', (s) => {
      drawers.push(s.drawerId);
      if (s.wordOptions.length) options = s.wordOptions;
    });
    me.on('round_end', () => turnEnds++);
    me.on('draw_data', (e) => draws.push(e));

    const res = (await me.emitWithAck('create_room', { hostName: 'Me', avatar, settings: { drawTime: 15 } })) as { ok: true } & JoinResult;
    await waitFor(() => playerCount === 4);
    me.emit('start_game');
    await waitFor(() => options.length > 0);
    me.emit('word_chosen', { word: options[0] });

    // My turn ends (everyone guessed or 15 s ran out), then an automatic player draws.
    await waitFor(() => turnEnds >= 1, 17000);
    await waitFor(() => draws.some((d) => d.type === 'end'), 5000);
    expect(drawers[1]).not.toBe(res.playerId);
    expect(draws.some((d) => d.type === 'move')).toBe(true);
  }, 25000);

  it('a private room fills itself to 4 players and a real player replaces an automatic one', async () => {
    const host = connect();
    const res = (await host.emitWithAck('create_room', { hostName: 'Host', avatar })) as { ok: true } & JoinResult;
    let names: string[] = [];
    host.on('room_state', (s) => (names = s.players.map((p) => p.name)));
    await waitFor(() => names.length === 4);
    // Nothing in the public data marks them as automatic.
    expect(names).not.toContain(expect.stringMatching(/bot/i));

    const friend = connect();
    const joined = await friend.emitWithAck('join_room', { roomId: res.roomId, playerName: 'Friend', avatar });
    expect(joined.ok).toBe(true);
    await waitFor(() => names.includes('Friend') && names.length === 4);

    // Automatic players are always ready, so only the real friend needs to ready up.
    friend.emit('player_ready', { ready: true });
    let started = false;
    host.on('round_start', () => (started = true));
    await new Promise((r) => setTimeout(r, 100));
    host.emit('start_game');
    await waitFor(() => started);
  });
});
