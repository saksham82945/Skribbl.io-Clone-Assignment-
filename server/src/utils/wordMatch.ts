export type GuessResult = 'correct' | 'close' | 'wrong';

/** Lowercase, strip accents, turn hyphens/underscores into spaces, trim and collapse whitespace. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Exact match after normalisation is correct.
 * One typo away (two for long words) is "close" — the guesser is told privately.
 */
export function checkGuess(guess: string, word: string): GuessResult {
  const g = normalize(guess);
  const w = normalize(word);
  if (!g) return 'wrong';
  if (g === w) return 'correct';
  const allowed = w.length >= 8 ? 2 : 1;
  if (w.length >= 3 && Math.abs(g.length - w.length) <= allowed && levenshtein(g, w) <= allowed) return 'close';
  return 'wrong';
}

/** True if the text contains the word, e.g. the drawer trying to leak it in chat. */
export function containsWord(text: string, word: string): boolean {
  const t = normalize(text).replace(/\s/g, '');
  const w = normalize(word).replace(/\s/g, '');
  return w.length > 0 && t.includes(w);
}
