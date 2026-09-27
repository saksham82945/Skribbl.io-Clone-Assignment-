import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, RoomStateDTO } from '../../shared/types';
import { DEFAULT_TIMING } from '../src/config';
import { join, makeRoom } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Room: host & membership', () => {
  it('the first player is host; the host moves to another real player when they leave', () => {
    const t = makeRoom();
    expect(t.room.hostId).toBe(t.players[0].id);
    t.room.removePlayer(t.players[0].id, 'left');
    expect(t.room.hostId).toBe(t.players[1].id);
  });

  it('a refresh (disconnect) does not take the crown away', () => {
    const t = makeRoom();
    t.room.handleDisconnect(t.players[0]);
    expect(t.room.hostId).toBe(t.players[0].id);
  });

  it('clamps settings into the allowed ranges', () => {
    const t = makeRoom();
    t.room.updateSettings({ maxPlayers: 50, rounds: 1, drawTime: 999, language: 'klingon' as never });
    expect(t.room.settings).toMatchObject({ maxPlayers: 20, rounds: 2, drawTime: 240, language: 'en' });
  });

  it('closes the room when the last real player leaves', () => {
    const t = makeRoom({ players: 1 });
    t.room.removePlayer(t.players[0].id, 'left');
    expect(t.onEmpty).toHaveBeenCalledOnce();
  });
});

describe('Room: moderation', () => {
  it('vote-kick needs a majority of the other players, and the kicked seat cannot be reclaimed', () => {
    const t = makeRoom({ players: 4 });
    const [a, b, , target] = t.players;
    t.room.voteKick(a, target.id);
    t.room.voteKick(a, target.id); // voting twice doesn't count twice
    expect(t.room.players.has(target.id)).toBe(true);
    t.room.voteKick(b, target.id); // 2 of the other 3 = majority
    expect(t.room.players.has(target.id)).toBe(false);
    expect(t.room.isBanned(target.token)).toBe(true);
    expect(t.privately(target, 'kicked')).toHaveLength(1);
  });

  it('reports are acknowledged privately and never announced to the room', () => {
    const t = makeRoom();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    t.room.reportPlayer(t.players[1], t.players[2].id, 'rude');
    expect(t.privately<ChatMessage>(t.players[1], 'chat_message')[0].kind).toBe('report');
    expect(t.broadcast<ChatMessage>('chat_message').some((m) => m.kind === 'report')).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[report]'));
    log.mockRestore();
  });
});

describe('Room: automatic players', () => {
  const timing = { targetPlayers: 4, botJoinDelayMs: 1000 };

  it('fills a room to 4 players one by one, and they look like normal players', () => {
    const t = makeRoom({ players: 1, timing });
    expect(t.room.players.size).toBe(1);
    vi.advanceTimersByTime(1600);
    expect(t.room.players.size).toBeGreaterThanOrEqual(2);
    vi.advanceTimersByTime(10_000);
    expect(t.room.players.size).toBe(4);

    const state = t.last(t.broadcast<RoomStateDTO>('room_state'));
    expect(Object.keys(state.players[1])).not.toContain('isBot');
    expect(state.hostId).toBe(t.players[0].id); // an automatic player is never host
  });

  it('an automatic player leaves when a real player joins, and comes back when they leave', () => {
    const t = makeRoom({ players: 1, timing });
    vi.advanceTimersByTime(10_000);
    const friend = join(t.room, 'Friend');
    expect(t.room.players.size).toBe(4);
    expect(t.room.players.has(friend.id)).toBe(true);

    t.room.removePlayer(friend.id, 'left');
    vi.advanceTimersByTime(10_000);
    expect(t.room.players.size).toBe(4);
  });

  it('public rooms start by themselves once filled', () => {
    const t = makeRoom({ players: 1, timing, settings: { isPrivate: false } });
    vi.advanceTimersByTime(10_000 + DEFAULT_TIMING.autoStartDelayMs);
    expect(t.game.phase).not.toBe('lobby');
  });

  it('private rooms wait for the host', () => {
    const t = makeRoom({ players: 1, timing, settings: { isPrivate: true } });
    vi.advanceTimersByTime(20_000);
    expect(t.game.phase).toBe('lobby');
  });
});
