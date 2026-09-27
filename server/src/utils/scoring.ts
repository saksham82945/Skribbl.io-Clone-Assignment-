export const MAX_GUESS_POINTS = 500;
export const MIN_GUESS_POINTS = 50;
export const MAX_DRAWER_POINTS = 250;
const ORDER_BONUS = [50, 25, 10];

/**
 * Faster guesses score more. The first few guessers get a small bonus,
 * so the first correct guess always earns the most.
 */
export function guesserPoints(timeLeftMs: number, drawTimeMs: number, order: number): number {
  const ratio = Math.max(0, Math.min(1, timeLeftMs / drawTimeMs));
  const base = Math.max(MIN_GUESS_POINTS, Math.round(MAX_GUESS_POINTS * ratio));
  return base + (ORDER_BONUS[order] ?? 0);
}

/** The drawer earns a share based on how many guessers got it. */
export function drawerPoints(correctGuessers: number, totalGuessers: number): number {
  if (totalGuessers <= 0 || correctGuessers <= 0) return 0;
  return Math.round((MAX_DRAWER_POINTS * correctGuessers) / totalGuessers);
}
