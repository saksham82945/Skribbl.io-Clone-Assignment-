import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, GameOverPayload, GameStateDTO, RoundEndPayload, RoundStartPayload } from '../../shared/types';
import { DEFAULT_TIMING } from '../src/config';
import { join, makeRoom, startDrawing, WORD } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const letters = (hints: string | null) => (hints ?? '').replace(/_/g, '').length;

describe('Game: turn flow', () => {
  it('starts with the first player drawing; only the drawer receives word options', () => {
    const t = makeRoom();
    t.game.start();
    expect(t.game.phase).toBe('choosing');
    expect(t.game.drawerId).toBe(t.players[0].id);
    expect(t.last(t.privately<RoundStartPayload>(t.players[0], 'round_start')).wordOptions).toEqual([WORD]);
    expect(t.last(t.privately<RoundStartPayload>(t.players[1], 'round_start')).wordOptions).toEqual([]);
  });

  it('ignores word choices from non-drawers and words that were not offered', () => {
    const t = makeRoom();
    t.game.start();
    t.game.chooseWord(t.players[1].id, WORD);
    t.game.chooseWord(t.players[0].id, 'giraffe');
    expect(t.game.phase).toBe('choosing');
    t.game.chooseWord(t.players[0].id, WORD);
    expect(t.game.phase).toBe('drawing');
  });

  it('auto-picks a word when the drawer does not choose in time', () => {
    const t = makeRoom();
    t.game.start();
    vi.advanceTimersByTime(DEFAULT_TIMING.chooseTimeMs);
    expect(t.game.phase).toBe('drawing');
  });

  it('sends the word to the drawer only; guessers get blanks', () => {
    const t = makeRoom();
    startDrawing(t);
    const drawerView = t.game.stateFor(t.players[0]);
    const guesserView = t.game.stateFor(t.players[1]);
    expect(drawerView.word).toBe(WORD);
    expect(guesserView.word).toBeNull();
    expect(guesserView.hints).toBe('________');
  });

  it('reveals hint letters on schedule (e.g. 30 s turn, 2 hints → at 10 s and 20 s)', () => {
    const t = makeRoom({ settings: { drawTime: 30, hints: 2 } });
    startDrawing(t);
    vi.advanceTimersByTime(9_600);
    expect(letters(t.game.stateFor(t.players[1]).hints)).toBe(0);
    vi.advanceTimersByTime(1_000);
    expect(letters(t.game.stateFor(t.players[1]).hints)).toBe(1);
    vi.advanceTimersByTime(10_000);
    expect(letters(t.game.stateFor(t.players[1]).hints)).toBe(2);
  });

  it('never reveals more than half the letters, and none when hints are off or in hidden mode', () => {
    const many = makeRoom({ settings: { drawTime: 60, hints: 5 } });
    startDrawing(many);
    vi.advanceTimersByTime(59_000);
    expect(letters(many.game.stateFor(many.players[1]).hints)).toBe(4); // "elephant" has 8 letters

    const off = makeRoom({ settings: { hints: 0 } });
    startDrawing(off);
    vi.advanceTimersByTime(29_000);
    expect(letters(off.game.stateFor(off.players[1]).hints)).toBe(0);

    const hidden = makeRoom({ settings: { wordMode: 'hidden' } });
    startDrawing(hidden);
    expect(hidden.game.stateFor(hidden.players[1]).hints).toBeNull();
  });

  it('ends the turn when time runs out; nobody scores if nobody guessed', () => {
    const t = makeRoom();
    startDrawing(t);
    vi.advanceTimersByTime(30_000);
    const end = t.last(t.broadcast<RoundEndPayload>('round_end'));
    expect(end.reason).toBe('time_up');
    expect(end.word).toBe(WORD);
    expect(end.scores.every((s) => s.gained === 0)).toBe(true);
    expect(t.game.stateFor(t.players[1]).word).toBe(WORD); // revealed to everyone at turn end
  });

  it('scores faster and earlier guesses higher; the drawer earns a share; the turn ends early when all guessed', () => {
    const t = makeRoom();
    startDrawing(t);
    vi.advanceTimersByTime(3_000);
    t.game.handleMessage(t.players[1], WORD);
    vi.advanceTimersByTime(15_000);
    t.game.handleMessage(t.players[2], 'ELEPHANT ');

    const [first, second] = t.broadcast('guess_result').filter((g) => g.correct);
    expect(first.playerId).toBe(t.players[1].id);
    expect(first.points).toBeGreaterThan(second.points);

    const end = t.last(t.broadcast<RoundEndPayload>('round_end'));
    expect(end.reason).toBe('all_guessed');
    expect(end.scores.find((s) => s.playerId === t.players[0].id)!.gained).toBe(250);
    expect(t.players[1].score).toBe(first.points);
  });

  it('rotates the drawer every turn and ends after the configured rounds, then returns to the lobby', () => {
    const t = makeRoom({ players: 2, settings: { rounds: 2 } });
    t.game.start();
    const drawers: string[] = [];
    for (let turn = 0; turn < 4; turn++) {
      drawers.push(t.game.drawerId!);
      const drawer = t.players.find((p) => p.id === t.game.drawerId)!;
      const guesser = t.players.find((p) => p.id !== drawer.id)!;
      t.game.chooseWord(drawer.id, WORD);
      vi.advanceTimersByTime(300);
      t.game.handleMessage(guesser, WORD);
      vi.advanceTimersByTime(DEFAULT_TIMING.turnEndDelayMs);
    }
    expect(drawers).toEqual([t.players[0].id, t.players[1].id, t.players[0].id, t.players[1].id]);
    expect(t.game.phase).toBe('game_over');

    const over = t.last(t.broadcast<GameOverPayload>('game_over'));
    expect(over.leaderboard).toHaveLength(2);
    expect(over.winner).toEqual(over.winners[0]);
    expect(over.leaderboard[0].score).toBeGreaterThanOrEqual(over.leaderboard[1].score);

    vi.advanceTimersByTime(DEFAULT_TIMING.gameOverDelayMs);
    expect(t.game.phase).toBe('lobby');
  });

  it('gives tied players the same rank and lists all of them as winners', () => {
    const t = makeRoom();
    t.game.start();
    t.players[0].score = 300;
    t.players[1].score = 300;
    t.players[2].score = 100;
    t.game.endGame();
    const over = t.last(t.broadcast<GameOverPayload>('game_over'));
    expect(over.winners.map((w) => w.name).sort()).toEqual(['P0', 'P1']);
    expect(over.leaderboard.map((e) => e.rank)).toEqual([1, 1, 3]);
  });
});

describe('Game: guessing & chat', () => {
  it('broadcasts a wrong guess as chat and tells only the guesser it was incorrect', () => {
    const t = makeRoom();
    startDrawing(t);
    t.game.handleMessage(t.players[1], 'giraffe');
    expect(t.broadcast<ChatMessage>('chat_message').some((m) => m.text === 'giraffe')).toBe(true);
    expect(t.privately(t.players[1], 'guess_result')).toEqual([expect.objectContaining({ correct: false })]);
    expect(t.privately(t.players[2], 'guess_result')).toEqual([]);
  });

  it('tells only the guesser when a guess is close', () => {
    const t = makeRoom();
    startDrawing(t);
    t.game.handleMessage(t.players[1], 'elephnat');
    expect(t.privately<ChatMessage>(t.players[1], 'chat_message').some((m) => m.kind === 'close')).toBe(true);
    expect(t.broadcast<ChatMessage>('chat_message').some((m) => m.kind === 'close')).toBe(false);
  });

  it('never broadcasts the correct word as text', () => {
    const t = makeRoom();
    startDrawing(t);
    t.game.handleMessage(t.players[1], WORD);
    const texts = t.broadcast<ChatMessage>('chat_message').map((m) => m.text);
    expect(texts).toContain('P1 guessed the word!');
    expect(texts.some((x) => x.toLowerCase().includes(WORD) && !x.startsWith('The word was'))).toBe(false);
  });

  it('blocks the drawer from leaking the word in chat', () => {
    const t = makeRoom();
    startDrawing(t);
    t.io.clear();
    t.game.handleMessage(t.players[0], 'it is an e l e p h a n t');
    expect(t.broadcast('chat_message')).toEqual([]);
    expect(t.privately<ChatMessage>(t.players[0], 'chat_message')[0].kind).toBe('warning');
  });

  it('keeps chat from players who already guessed private to the drawer and other guessers', () => {
    const t = makeRoom();
    startDrawing(t);
    t.game.handleMessage(t.players[1], WORD);
    t.io.clear();
    vi.advanceTimersByTime(300);
    t.game.handleMessage(t.players[1], 'that was easy');
    expect(t.broadcast('chat_message')).toEqual([]);
    expect(t.privately(t.players[0], 'chat_message')).toHaveLength(1);
    expect(t.privately(t.players[1], 'chat_message')).toHaveLength(1);
    expect(t.privately(t.players[2], 'chat_message')).toHaveLength(0);
  });

  it('rate-limits messages sent too quickly', () => {
    const t = makeRoom();
    t.game.handleMessage(t.players[1], 'hi');
    t.game.handleMessage(t.players[1], 'hi again');
    expect(t.broadcast<ChatMessage>('chat_message').filter((m) => m.playerId === t.players[1].id)).toHaveLength(1);
    expect(t.privately<ChatMessage>(t.players[1], 'chat_message')[0].text).toMatch(/slow down/i);
  });
});

describe('Game: drawing', () => {
  it('only the drawer can draw; strokes are sanitised and broadcast to everyone', () => {
    const t = makeRoom();
    startDrawing(t);
    t.game.drawStart(t.players[1], { strokeId: 'x', x: 0.5, y: 0.5, color: '#ff0000', size: 5, tool: 'brush' });
    expect(t.game.strokes).toHaveLength(0);

    t.game.drawStart(t.players[0], { strokeId: 's1', x: 5, y: -2, color: 'red; evil', size: 999, tool: 'laser' as never });
    t.game.drawMove(t.players[0], 's1', [[0.2, 0.3], [2, 2]]);
    const s = t.game.strokes[0];
    expect(s).toMatchObject({ id: 's1', tool: 'brush', color: '#000000', size: 60 });
    expect(s.points).toEqual([[1, 0], [0.2, 0.3], [1, 1]]);
    expect(t.broadcast('draw_data').map((e) => e.type)).toEqual(['start', 'move']);
  });

  it('ignores moves for a different stroke, and fill strokes take no moves', () => {
    const t = makeRoom();
    startDrawing(t);
    t.game.drawStart(t.players[0], { strokeId: 'f', x: 0.5, y: 0.5, color: '#ff0000', size: 1, tool: 'fill' });
    t.game.drawMove(t.players[0], 'f', [[0.1, 0.1]]);
    t.game.drawMove(t.players[0], 'other', [[0.1, 0.1]]);
    expect(t.game.strokes[0].points).toHaveLength(1);
  });

  it('undo removes the last stroke and clear removes all', () => {
    const t = makeRoom();
    startDrawing(t);
    for (const id of ['a', 'b']) t.game.drawStart(t.players[0], { strokeId: id, x: 0.1, y: 0.1, color: '#000000', size: 4, tool: 'brush' });
    t.game.undo(t.players[1]); // not the drawer
    expect(t.game.strokes).toHaveLength(2);
    t.game.undo(t.players[0]);
    expect(t.game.strokes.map((s) => s.id)).toEqual(['a']);
    expect(t.last(t.broadcast('draw_undo'))).toEqual({ strokeId: 'b' });
    t.game.clearCanvas(t.players[0]);
    expect(t.game.strokes).toHaveLength(0);
  });

  it('sends the current drawing to a player who joins mid-turn', () => {
    const t = makeRoom();
    startDrawing(t);
    t.game.drawStart(t.players[0], { strokeId: 'a', x: 0.1, y: 0.1, color: '#000000', size: 4, tool: 'brush' });
    const late = join(t.room, 'Late');
    expect(t.last(t.privately(late, 'canvas_state')).strokes).toHaveLength(1);
    expect(t.last(t.privately<GameStateDTO>(late, 'game_state')).phase).toBe('drawing');
  });
});

describe('Game: players leaving', () => {
  it('skips the turn when the drawer leaves', () => {
    const t = makeRoom();
    startDrawing(t);
    t.room.removePlayer(t.players[0].id, 'left');
    expect(t.last(t.broadcast<RoundEndPayload>('round_end')).reason).toBe('drawer_left');
    vi.advanceTimersByTime(DEFAULT_TIMING.turnEndDelayMs);
    expect(t.game.phase).toBe('choosing');
    expect(t.game.drawerId).toBe(t.players[1].id);
  });

  it('ends the game when fewer than 2 players remain', () => {
    const t = makeRoom({ players: 2 });
    startDrawing(t);
    t.room.removePlayer(t.players[1].id, 'left');
    expect(t.game.phase).toBe('game_over');
  });

  it('keeps a disconnected player\'s seat and score through the grace period', () => {
    const t = makeRoom();
    startDrawing(t);
    t.game.handleMessage(t.players[1], WORD);
    const score = t.players[1].score;
    t.room.handleDisconnect(t.players[1]);
    expect(t.room.players.has(t.players[1].id)).toBe(true);
    t.room.handleReconnect(t.players[1], 'sock-P1');
    vi.advanceTimersByTime(DEFAULT_TIMING.reconnectGraceMs + 1);
    expect(t.room.players.get(t.players[1].id)?.score).toBe(score);
  });

  it('removes a player who does not come back within the grace period', () => {
    const t = makeRoom();
    t.room.handleDisconnect(t.players[2]);
    vi.advanceTimersByTime(DEFAULT_TIMING.reconnectGraceMs + 1);
    expect(t.room.players.has(t.players[2].id)).toBe(false);
  });
});

describe('Game: spectators', () => {
  it('watch without taking part: no turn, no guessing, no score, no seat', () => {
    const t = makeRoom({ players: 2, settings: { maxPlayers: 2 } });
    const spec = join(t.room, 'Spec', { spectator: true });
    expect(t.room.isFull).toBe(true); // 2 seats taken by the players, not the spectator
    startDrawing(t);

    // Can't guess: the word is swallowed (so it can't leak), other chat goes through.
    t.game.handleMessage(spec, WORD);
    expect(spec.hasGuessed).toBe(false);
    expect(t.broadcast<ChatMessage>('chat_message').some((m) => m.playerId === spec.id)).toBe(false);
    vi.advanceTimersByTime(300);
    t.game.handleMessage(spec, 'nice drawing');
    expect(t.broadcast<ChatMessage>('chat_message').some((m) => m.text === 'nice drawing')).toBe(true);

    // The only real guesser guessing ends the turn: the spectator isn't waited for.
    t.game.handleMessage(t.players[1], WORD);
    expect(t.last(t.broadcast<RoundEndPayload>('round_end')).reason).toBe('all_guessed');

    t.game.endGame();
    const over = t.last(t.broadcast<GameOverPayload>('game_over'));
    expect(over.leaderboard.map((e) => e.name)).not.toContain('Spec');
  });
});
