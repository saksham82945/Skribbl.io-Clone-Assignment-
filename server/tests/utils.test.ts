import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import { effectiveHintCount, hintSchedule, maskWord, pickLetterToReveal } from '../src/utils/hints';
import { sanitizeAvatar, sanitizeSettings } from '../src/utils/sanitize';
import { drawerPoints, guesserPoints } from '../src/utils/scoring';
import { checkGuess, containsWord, normalize } from '../src/utils/wordMatch';
import { WordBank } from '../src/words/WordBank';

describe('wordMatch', () => {
  it('normalises case, whitespace, accents and hyphens', () => {
    expect(normalize('  Ice   CREAM ')).toBe('ice cream');
    expect(normalize('Café')).toBe('cafe');
    expect(normalize('hot-dog')).toBe('hot dog');
  });

  it('accepts exact guesses regardless of case/spacing', () => {
    expect(checkGuess('APPLE', 'apple')).toBe('correct');
    expect(checkGuess(' ice  cream ', 'ice cream')).toBe('correct');
  });

  it('flags near misses as close, not correct', () => {
    expect(checkGuess('aple', 'apple')).toBe('close');
    expect(checkGuess('elephnat', 'elephant')).toBe('close');
    expect(checkGuess('banana', 'apple')).toBe('wrong');
  });

  it('does not accept partial words', () => {
    expect(checkGuess('ice', 'ice cream')).toBe('wrong');
    expect(checkGuess('app', 'apple')).toBe('wrong');
    expect(checkGuess('', 'apple')).toBe('wrong');
  });

  it('detects the word hidden in a sentence', () => {
    expect(containsWord('it is an A P P L E', 'apple')).toBe(true);
    expect(containsWord('nice drawing', 'apple')).toBe(false);
  });
});

describe('hints', () => {
  it('masks letters but keeps spaces', () => {
    expect(maskWord('ice cream', new Set())).toBe('___ _____');
    expect(maskWord('ice cream', new Set([0, 4]))).toBe('i__ c____');
  });

  it('never reveals more than half the letters', () => {
    expect(effectiveHintCount('cat', 5)).toBe(1);
    expect(effectiveHintCount('elephant', 2)).toBe(2);
    expect(effectiveHintCount('ox', 0)).toBe(0);
  });

  it('spaces hints evenly through the turn', () => {
    expect(hintSchedule(90_000, 2)).toEqual([30_000, 60_000]);
    expect(hintSchedule(90_000, 0)).toEqual([]);
  });

  it('only picks hidden letters', () => {
    const idx = pickLetterToReveal('ab', new Set([0]));
    expect(idx).toBe(1);
    expect(pickLetterToReveal('ab', new Set([0, 1]))).toBeNull();
  });
});

describe('scoring', () => {
  it('rewards faster guesses and the first guesser', () => {
    const fast = guesserPoints(70_000, 80_000, 0);
    const slow = guesserPoints(10_000, 80_000, 1);
    expect(fast).toBeGreaterThan(slow);
    expect(guesserPoints(0, 80_000, 5)).toBe(50);
  });

  it('gives the drawer a share of correct guessers', () => {
    expect(drawerPoints(0, 3)).toBe(0);
    expect(drawerPoints(3, 3)).toBe(250);
    expect(drawerPoints(1, 2)).toBe(125);
  });
});

describe('avatars', () => {
  it('keeps valid patterns, hats and effects', () => {
    const a = sanitizeAvatar({ color: '#00bbf9', emoji: '🦖', pattern: 'rainbow', accessory: 'crown', effect: 'bounce' });
    expect(a).toEqual({ color: '#00bbf9', emoji: '🦖', pattern: 'rainbow', accessory: 'crown', effect: 'bounce' });
  });

  it('replaces anything not on the published lists with safe defaults', () => {
    const a = sanitizeAvatar({ color: 'red;}', emoji: '<img>', pattern: 'url(evil)', accessory: '💣', effect: 'crash' });
    expect(a.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(a.emoji).not.toBe('<img>');
    expect(a).toMatchObject({ pattern: 'solid', accessory: 'none', effect: 'none' });
  });

  it('upgrades old two-field avatars', () => {
    expect(sanitizeAvatar({ color: '#f94144', emoji: '😀' })).toEqual({ color: '#f94144', emoji: '😀', pattern: 'solid', accessory: 'none', effect: 'none' });
  });
});

describe('settings', () => {
  it('clamps values into allowed ranges', () => {
    const s = sanitizeSettings({ maxPlayers: 99, rounds: 1, drawTime: 5, wordCount: 9, hints: -1, wordMode: 'weird' as never });
    expect(s).toMatchObject({ maxPlayers: 20, rounds: 2, drawTime: 15, wordCount: 5, hints: 0, wordMode: 'normal' });
  });

  it('parses custom words', () => {
    const s = sanitizeSettings({ customWords: 'Pizza, pizza , x, rocket ship' as never });
    expect(s.customWords).toEqual(['pizza', 'rocket ship']);
  });
});

describe('WordBank', () => {
  const bank = new WordBank();

  it('returns the requested number of distinct options', () => {
    const opts = bank.getOptions({ ...DEFAULT_SETTINGS, wordCount: 5 });
    expect(opts).toHaveLength(5);
    expect(new Set(opts).size).toBe(5);
  });

  it('uses only custom words when asked', () => {
    const opts = bank.getOptions({ ...DEFAULT_SETTINGS, wordCount: 2, customWords: ['foo', 'bar'], customWordsOnly: true });
    expect(opts.sort()).toEqual(['bar', 'foo']);
  });

  it('combines two words in combination mode', () => {
    const opts = bank.getOptions({ ...DEFAULT_SETTINGS, wordCount: 3, wordMode: 'combination' });
    expect(opts).toHaveLength(3);
    opts.forEach((o) => expect(o.split(' ').length).toBeGreaterThanOrEqual(2));
  });
});
