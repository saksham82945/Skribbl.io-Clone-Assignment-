const isLetter = (ch: string) => /[\p{L}\p{N}]/u.test(ch);

/** Letters become '_' unless revealed; spaces and punctuation are shown as-is. */
export function maskWord(word: string, revealed: Set<number>): string {
  return [...word].map((ch, i) => (isLetter(ch) && !revealed.has(i) ? '_' : ch)).join('');
}

export function letterIndexes(word: string): number[] {
  return [...word].flatMap((ch, i) => (isLetter(ch) ? [i] : []));
}

/** Never reveal more than half the letters, whatever the room setting says. */
export function effectiveHintCount(word: string, requested: number): number {
  return Math.max(0, Math.min(requested, Math.floor(letterIndexes(word).length / 2)));
}

/** Elapsed-time thresholds (ms) at which a letter is revealed, evenly spaced through the turn. */
export function hintSchedule(drawTimeMs: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round((drawTimeMs * (i + 1)) / (count + 1)));
}

export function pickLetterToReveal(word: string, revealed: Set<number>, random = Math.random): number | null {
  const hidden = letterIndexes(word).filter((i) => !revealed.has(i));
  if (!hidden.length) return null;
  return hidden[Math.floor(random() * hidden.length)];
}
