import { describe, expect, it } from 'vitest';
import { floodFillPixels, hexToRgb } from './floodFill';

const W = 10;
const H = 10;
const blank = () => new Uint8ClampedArray(W * H * 4); // fully transparent
const px = (d: Uint8ClampedArray, x: number, y: number) => Array.from(d.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
function box(d: Uint8ClampedArray) {
  // black square outline from (2,2) to (7,7)
  for (let i = 2; i <= 7; i++)
    for (const [x, y] of [[i, 2], [i, 7], [2, i], [7, i]]) d.set([0, 0, 0, 255], (y * W + x) * 4);
}

describe('floodFillPixels', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
  });

  it('fills the enclosed area but not across the outline', () => {
    const d = blank();
    box(d);
    expect(floodFillPixels(d, W, H, 4, 4, [255, 0, 0])).toBe(true);
    expect(px(d, 4, 4)).toEqual([255, 0, 0, 255]); // inside
    expect(px(d, 3, 6)).toEqual([255, 0, 0, 255]); // inside corner
    expect(px(d, 2, 2)).toEqual([0, 0, 0, 255]); // outline untouched
    expect(px(d, 0, 0)).toEqual([0, 0, 0, 0]); // outside untouched
  });

  it('fills the whole canvas when nothing is in the way', () => {
    const d = blank();
    floodFillPixels(d, W, H, 0, 0, [0, 0, 255]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) expect(px(d, x, y)).toEqual([0, 0, 255, 255]);
  });

  it('does nothing when the seed already has the fill colour', () => {
    const d = blank();
    floodFillPixels(d, W, H, 0, 0, [0, 0, 255]);
    expect(floodFillPixels(d, W, H, 5, 5, [0, 0, 255])).toBe(false);
  });

  it('treats slightly different (anti-aliased) pixels as the same region', () => {
    const d = blank();
    d.set([10, 10, 10, 10], (5 * W + 5) * 4); // faint smudge
    floodFillPixels(d, W, H, 0, 0, [0, 255, 0]);
    expect(px(d, 5, 5)).toEqual([0, 255, 0, 255]);
  });
});
