import { vi } from 'vitest';
import type { RoomSettings } from '../src/shared/types';
import { DEFAULT_TIMING, type GameTiming } from '../src/config';
import { Player } from '../src/models/Player';
import { Room } from '../src/models/Room';
import type { IOServer } from '../src/types';
import { WordBank } from '../src/words/WordBank';

interface Sent {
  target: string;
  event: string;
  args: unknown[];
}

/**
 * Stand-in for the Socket.IO server: records every emit instead of sending it,
 * so Room/Game logic can be unit-tested synchronously with fake timers.
 */
export class FakeIO {
  sent: Sent[] = [];
  sockets = { sockets: new Map<string, { leave: (room: string) => void }>() };

  to(target: string) {
    return {
      emit: (event: string, ...args: unknown[]) => {
        this.sent.push({ target, event, args });
      },
    };
  }

  clear() {
    this.sent = [];
  }
}

export const avatar = { color: '#f94144', emoji: '😀' };
export const WORD = 'elephant';

export function join(room: Room, name: string, opts: { spectator?: boolean } = {}) {
  const p = new Player(name, avatar, `sock-${name}`, false, !!opts.spectator);
  room.addPlayer(p);
  return p;
}

/**
 * A room with `players` humans (P0 joins first, so draws first). By default the
 * only word is "elephant" so tests can guess it, and automatic players are off.
 */
export function makeRoom(opts: { players?: number; settings?: Partial<RoomSettings>; timing?: Partial<GameTiming> } = {}) {
  const io = new FakeIO();
  const onEmpty = vi.fn();
  const room = new Room(
    'ROOM01',
    io as unknown as IOServer,
    { customWords: [WORD], customWordsOnly: true, wordCount: 1, drawTime: 30, hints: 2, ...opts.settings },
    new WordBank(),
    { ...DEFAULT_TIMING, targetPlayers: 0, ...opts.timing },
    onEmpty,
  );
  const players = Array.from({ length: opts.players ?? 3 }, (_, i) => join(room, `P${i}`));

  /** Payloads of `event` that reached `player` (sent to their socket or to the whole room). */
  const got = <T = any>(player: Player, event: string): T[] =>
    io.sent.filter((s) => s.event === event && (s.target === room.id || s.target === `sock-${player.name}`)).map((s) => s.args[0] as T);
  /** Payloads of `event` broadcast to the whole room. */
  const broadcast = <T = any>(event: string): T[] => io.sent.filter((s) => s.event === event && s.target === room.id).map((s) => s.args[0] as T);
  /** Payloads of `event` sent privately to one player's socket. */
  const privately = <T = any>(player: Player, event: string): T[] =>
    io.sent.filter((s) => s.event === event && s.target === `sock-${player.name}`).map((s) => s.args[0] as T);
  const last = <T = any>(arr: T[]) => arr[arr.length - 1];

  return { io, room, game: room.game, players, onEmpty, got, broadcast, privately, last };
}

/** Starts the game and has the first drawer pick the (only) word. */
export function startDrawing(ctx: ReturnType<typeof makeRoom>) {
  ctx.game.start();
  ctx.game.chooseWord(ctx.players[0].id, WORD);
}
