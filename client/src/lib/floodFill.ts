export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Summed per-channel difference that still counts as "the same colour" (swallows anti-aliased edges). */
export const FILL_TOLERANCE = 60;

/**
 * Bucket fill (scanline flood fill) on raw RGBA pixels. Pure: it only reads and
 * writes `data`, so replaying the same stroke list gives the same picture on
 * every client, and it can be unit-tested without a real canvas.
 * Returns false if nothing changed (the seed pixel already had the fill colour).
 */
export function floodFillPixels(data: Uint8ClampedArray, width: number, height: number, x0: number, y0: number, rgb: [number, number, number]): boolean {
  const d = data;
  const start = (y0 * width + x0) * 4;
  const target = [d[start], d[start + 1], d[start + 2], d[start + 3]];
  const [r, g, b] = rgb;
  if (target[0] === r && target[1] === g && target[2] === b && target[3] === 255) return false;

  const seen = new Uint8Array(width * height);
  const matches = (i: number) =>
    Math.abs(d[i] - target[0]) + Math.abs(d[i + 1] - target[1]) + Math.abs(d[i + 2] - target[2]) + Math.abs(d[i + 3] - target[3]) <= FILL_TOLERANCE;

  const stack = [x0, y0];
  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    while (x > 0 && !seen[y * width + x - 1] && matches((y * width + x - 1) * 4)) x--;
    let up = false;
    let down = false;
    for (; x < width; x++) {
      const p = y * width + x;
      if (seen[p] || !matches(p * 4)) break;
      seen[p] = 1;
      d[p * 4] = r;
      d[p * 4 + 1] = g;
      d[p * 4 + 2] = b;
      d[p * 4 + 3] = 255;
      // Queue one seed per new run of fillable pixels on the rows above and below.
      if (y > 0) {
        const q = (y - 1) * width + x;
        const ok = !seen[q] && matches(q * 4);
        if (ok && !up) stack.push(x, y - 1);
        up = ok;
      }
      if (y < height - 1) {
        const q = (y + 1) * width + x;
        const ok = !seen[q] && matches(q * 4);
        if (ok && !down) stack.push(x, y + 1);
        down = ok;
      }
    }
  }
  return true;
}
