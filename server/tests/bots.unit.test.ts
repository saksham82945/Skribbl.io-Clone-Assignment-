import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, LANGUAGES, type DrawEvent, type Language } from '../src/shared/types';
import { BOT_WORDS } from '../src/bots/drawings';
import { toEnglish, toLanguage } from '../src/bots/translations';
import { WordBank } from '../src/words/WordBank';
import { makeRoom, WORD } from './helpers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Room where P0 (human) is joined by automatic players; returns once it has 4. */
function roomWithBots(settings = {}) {
  const t = makeRoom({ players: 1, timing: { targetPlayers: 4, botJoinDelayMs: 100 }, settings });
  vi.advanceTimersByTime(2_000);
  const bots = [...t.room.players.values()].filter((p) => p.isBot);
  return { ...t, bots };
}

/** Advance fake time in small steps until `cond` holds (max 3 minutes of game time). */
function advanceUntil(cond: () => boolean) {
  for (let i = 0; i < 360 && !cond(); i++) vi.advanceTimersByTime(500);
  expect(cond()).toBe(true);
}

describe('Automatic players', () => {
  it('guess the word through the same chat pipeline as people', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // always decides to guess, no wrong guesses first
    const t = roomWithBots();
    t.game.start();
    t.game.chooseWord(t.players[0].id, WORD);
    advanceUntil(() => t.broadcast('round_end').length > 0);

    expect(t.last(t.broadcast('round_end')).reason).toBe('all_guessed');
    const correct = t.broadcast('guess_result').filter((g) => g.correct);
    expect(correct.map((g) => g.playerId).sort()).toEqual(t.bots.map((b) => b.id).sort());
    expect(t.bots.every((b) => b.score > 0)).toBe(true);
  });

  it('pick a word and draw a real doodle, stroke by stroke, on their turn', () => {
    const t = roomWithBots();
    t.game.start();
    t.game.chooseWord(t.players[0].id, WORD);
    advanceUntil(() => t.game.phase === 'drawing' && !!t.room.players.get(t.game.drawerId!)?.isBot);

    t.io.clear();
    vi.advanceTimersByTime(10_000);
    const draws = t.broadcast<DrawEvent>('draw_data');
    expect(draws.filter((d) => d.type === 'start').length).toBeGreaterThan(1);
    expect(draws.some((d) => d.type === 'move')).toBe(true);
  });

  it('offer and draw words in the room language', () => {
    const t = roomWithBots({ language: 'es' });
    t.game.start();
    t.game.chooseWord(t.players[0].id, WORD);
    advanceUntil(() => t.game.phase === 'drawing' && !!t.room.players.get(t.game.drawerId!)?.isBot);

    const bot = t.room.players.get(t.game.drawerId!)!;
    const word = t.game.stateFor(bot).word!;
    const english = toEnglish(word, 'es');
    expect(BOT_WORDS).toContain(english); // it's a word the bot can draw…
    expect(toLanguage(english, 'es')).toBe(word); // …shown in Spanish
  });
});

describe('Bot word translations', () => {
  const langs = Object.keys(LANGUAGES) as Language[];

  it.each(langs)('every doodle word round-trips for %s', (lang) => {
    for (const w of BOT_WORDS) expect(toEnglish(toLanguage(w, lang), lang)).toBe(w);
  });
});

describe('WordBank languages', () => {
  const bank = new WordBank();

  it.each(Object.keys(LANGUAGES) as Language[])('gives %s words from that language list', (language) => {
    const pool = new Set(bank.categoryWords('all', language));
    expect(pool.size).toBeGreaterThan(100);
    const options = bank.getOptions({ ...DEFAULT_SETTINGS, language, wordCount: 5 });
    options.forEach((o) => expect(pool.has(o)).toBe(true));
  });

  it('keeps categories per language', () => {
    expect(bank.categoryWords('animals', 'de')).toContain('katze');
    expect(bank.categoryWords('food', 'es')).toContain('manzana');
    expect(bank.categoryWords('food', 'hi')).toContain('samosa');
  });
});
