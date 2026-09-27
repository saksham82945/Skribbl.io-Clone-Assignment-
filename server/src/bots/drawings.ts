import type { Point, Tool } from '../shared/types';

/**
 * Hand-made doodles the bots can draw, built from a few shape helpers.
 * Coordinates are normalised (0..1) like real strokes; the canvas is 4:3,
 * so horizontal radii are scaled by 0.75 to keep circles round.
 */
export interface BotStroke {
  tool: Tool;
  color: string;
  size: number;
  points: Point[];
}

const INK = '#000000';
const ASPECT = 0.75; // 600 / 800
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const pt = (x: number, y: number): Point => [r4(x), r4(y)];

function arc(cx: number, cy: number, r: number, from: number, to: number, color = INK, size = 6, steps = 36): BotStroke {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    points.push(pt(cx + r * ASPECT * Math.cos(a), cy + r * Math.sin(a)));
  }
  return { tool: 'brush', color, size, points };
}

const circle = (cx: number, cy: number, r: number, color = INK, size = 6) => arc(cx, cy, r, 0, Math.PI * 2, color, size, 44);

function ellipse(cx: number, cy: number, rx: number, ry: number, color = INK, size = 6): BotStroke {
  const points: Point[] = [];
  for (let i = 0; i <= 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    points.push(pt(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
  }
  return { tool: 'brush', color, size, points };
}

/** A solid disc painted as concentric thick rings (robust even when discs overlap). */
function disc(cx: number, cy: number, r: number, color: string, tool: Tool = 'brush'): BotStroke[] {
  const px = r * 600;
  const rings = Math.max(1, Math.ceil(px / 40));
  const width = Math.ceil((px / rings) * 1.3);
  return Array.from({ length: rings }, (_, k) => ({ ...circle(cx, cy, (r * (k + 0.5)) / rings, color, width), tool }));
}

const poly = (pts: [number, number][], color = INK, size = 6, close = false): BotStroke => ({
  tool: 'brush',
  color,
  size,
  points: (close ? [...pts, pts[0]] : pts).map(([x, y]) => pt(x, y)),
});

const line = (x1: number, y1: number, x2: number, y2: number, color = INK, size = 6) => poly([[x1, y1], [x2, y2]], color, size);
const rect = (x1: number, y1: number, x2: number, y2: number, color = INK, size = 6) =>
  poly([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], color, size, true);
const fill = (x: number, y: number, color: string): BotStroke => ({ tool: 'fill', color, size: 1, points: [pt(x, y)] });

function star(cx: number, cy: number, outer: number, inner: number): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [cx + r * ASPECT * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });
}

function wave(x1: number, x2: number, y: number, amp: number, color: string, size = 6): BotStroke {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const x = x1 + ((x2 - x1) * i) / 40;
    pts.push([x, y + amp * Math.sin(i / 3)]);
  }
  return poly(pts, color, size);
}

const RED = '#ef130b';
const ORANGE = '#ff7100';
const YELLOW = '#ffe400';
const GREEN = '#00cc00';
const DARK_GREEN = '#005510';
const BLUE = '#00b2ff';
const NAVY = '#231fd3';
const BROWN = '#a0522d';
const PINK = '#d37caa';
const GRAY = '#c1c1c1';

export const BOT_DRAWINGS: Record<string, () => BotStroke[]> = {
  sun: () => [
    ...disc(0.5, 0.5, 0.16, YELLOW),
    ...Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return line(0.5 + 0.22 * ASPECT * Math.cos(a), 0.5 + 0.22 * Math.sin(a), 0.5 + 0.32 * ASPECT * Math.cos(a), 0.5 + 0.32 * Math.sin(a), ORANGE, 8);
    }),
  ],
  moon: () => [
    ...disc(0.5, 0.5, 0.26, YELLOW),
    ...disc(0.6, 0.42, 0.22, '#000000', 'eraser'),
    poly(star(0.75, 0.75, 0.05, 0.02), YELLOW, 4, true),
    poly(star(0.25, 0.2, 0.04, 0.016), YELLOW, 4, true),
  ],
  star: () => [poly(star(0.5, 0.52, 0.34, 0.14), '#e8a200', 8, true), fill(0.5, 0.52, YELLOW)],
  house: () => [
    rect(0.3, 0.45, 0.7, 0.85),
    poly([[0.25, 0.45], [0.5, 0.17], [0.75, 0.45]], INK, 6, true),
    rect(0.45, 0.63, 0.55, 0.85),
    rect(0.34, 0.52, 0.42, 0.62),
    rect(0.58, 0.52, 0.66, 0.62),
    fill(0.36, 0.75, '#e8a200'),
    fill(0.5, 0.35, RED),
    fill(0.5, 0.75, '#63300d'),
    fill(0.38, 0.57, BLUE),
    fill(0.62, 0.57, BLUE),
    line(0.1, 0.86, 0.9, 0.86, GREEN, 10),
  ],
  tree: () => [
    rect(0.45, 0.55, 0.55, 0.88, BROWN),
    fill(0.5, 0.75, BROWN),
    ...disc(0.5, 0.36, 0.22, GREEN),
    line(0.15, 0.89, 0.85, 0.89, DARK_GREEN, 8),
  ],
  apple: () => [
    ...disc(0.5, 0.57, 0.22, RED),
    line(0.5, 0.36, 0.53, 0.2, BROWN, 9),
    ellipse(0.6, 0.27, 0.06, 0.035, DARK_GREEN, 5),
    fill(0.6, 0.27, GREEN),
  ],
  fish: () => [
    ellipse(0.46, 0.5, 0.2, 0.15),
    poly([[0.655, 0.5], [0.8, 0.36], [0.8, 0.64]], INK, 6, true),
    fill(0.46, 0.55, ORANGE),
    fill(0.75, 0.5, ORANGE),
    ...disc(0.35, 0.45, 0.025, INK),
    arc(0.3, 0.55, 0.04, -0.5, 1.2, INK, 4),
    wave(0.1, 0.9, 0.85, 0.02, BLUE, 5),
  ],
  cat: () => [
    circle(0.5, 0.56, 0.26),
    poly([[0.36, 0.38], [0.33, 0.15], [0.46, 0.31]]),
    poly([[0.64, 0.38], [0.67, 0.15], [0.54, 0.31]]),
    fill(0.5, 0.72, GRAY),
    fill(0.36, 0.28, GRAY),
    fill(0.64, 0.28, GRAY),
    ...disc(0.43, 0.52, 0.035, GREEN),
    ...disc(0.57, 0.52, 0.035, GREEN),
    poly([[0.48, 0.61], [0.52, 0.61], [0.5, 0.64]], PINK, 6, true),
    line(0.44, 0.65, 0.3, 0.62, INK, 3),
    line(0.44, 0.67, 0.3, 0.7, INK, 3),
    line(0.56, 0.65, 0.7, 0.62, INK, 3),
    line(0.56, 0.67, 0.7, 0.7, INK, 3),
  ],
  car: () => [
    rect(0.15, 0.5, 0.85, 0.7),
    poly([[0.3, 0.5], [0.38, 0.32], [0.62, 0.32], [0.72, 0.5]]),
    line(0.5, 0.32, 0.5, 0.5),
    fill(0.5, 0.6, RED),
    fill(0.42, 0.42, BLUE),
    fill(0.6, 0.42, BLUE),
    ...disc(0.32, 0.72, 0.08, INK),
    ...disc(0.68, 0.72, 0.08, INK),
    line(0.05, 0.81, 0.95, 0.81, GRAY, 6),
  ],
  flower: () => [
    line(0.5, 0.5, 0.5, 0.93, GREEN, 10),
    ellipse(0.58, 0.75, 0.07, 0.035, DARK_GREEN, 5),
    fill(0.58, 0.75, GREEN),
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return disc(0.5 + 0.15 * ASPECT * Math.cos(a), 0.37 + 0.15 * Math.sin(a), 0.08, PINK);
    }).flat(),
    ...disc(0.5, 0.37, 0.08, YELLOW),
  ],
  heart: () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([0.5 + x * 0.018, 0.47 - y * 0.024]);
    }
    return [poly(pts, RED, 7), fill(0.5, 0.5, RED)];
  },
  cloud: () => [
    ...disc(0.37, 0.53, 0.12, GRAY),
    ...disc(0.63, 0.53, 0.12, GRAY),
    ...disc(0.5, 0.44, 0.17, GRAY),
    ...disc(0.5, 0.58, 0.11, GRAY),
    ...[0.38, 0.5, 0.62].map((x) => line(x, 0.75, x - 0.02, 0.85, BLUE, 6)),
  ],
  rainbow: () =>
    [RED, ORANGE, YELLOW, GREEN, BLUE, '#a300ba'].map((c, i) => arc(0.5, 0.8, 0.46 - i * 0.045, Math.PI, Math.PI * 2, c, 20)),
  snowman: () => [
    circle(0.5, 0.76, 0.15),
    circle(0.5, 0.48, 0.11),
    circle(0.5, 0.27, 0.08),
    rect(0.45, 0.13, 0.55, 0.2),
    line(0.41, 0.2, 0.59, 0.2, INK, 8),
    fill(0.5, 0.16, INK),
    ...disc(0.475, 0.25, 0.012, INK),
    ...disc(0.525, 0.25, 0.012, INK),
    poly([[0.5, 0.28], [0.58, 0.3], [0.5, 0.31]], ORANGE, 5, true),
    ...[0.44, 0.52, 0.72].map((y) => disc(0.5, y, 0.015, INK)).flat(),
    line(0.42, 0.46, 0.28, 0.36, BROWN, 6),
    line(0.58, 0.46, 0.72, 0.36, BROWN, 6),
  ],
  balloon: () => [
    ellipse(0.5, 0.38, 0.15, 0.25, INK, 5),
    fill(0.5, 0.38, RED),
    poly([[0.48, 0.66], [0.52, 0.66], [0.5, 0.63]], INK, 5, true),
    poly([[0.5, 0.66], [0.47, 0.72], [0.53, 0.78], [0.47, 0.84], [0.53, 0.9], [0.5, 0.95]], INK, 3),
  ],
  umbrella: () => [
    arc(0.5, 0.5, 0.3, Math.PI, Math.PI * 2),
    line(0.275, 0.5, 0.725, 0.5),
    fill(0.5, 0.38, NAVY),
    line(0.5, 0.5, 0.5, 0.82, INK, 8),
    arc(0.46, 0.82, 0.05, 0, Math.PI, INK, 8),
  ],
  'ice cream': () => [
    poly([[0.4, 0.5], [0.6, 0.5], [0.5, 0.9]], INK, 5, true),
    fill(0.5, 0.6, '#e8a200'),
    line(0.44, 0.58, 0.55, 0.7, BROWN, 3),
    line(0.56, 0.58, 0.45, 0.7, BROWN, 3),
    ...disc(0.5, 0.42, 0.13, PINK),
    ...disc(0.5, 0.26, 0.03, RED),
  ],
  mushroom: () => [
    rect(0.44, 0.5, 0.56, 0.82),
    fill(0.5, 0.7, '#f5deb3'),
    arc(0.5, 0.5, 0.3, Math.PI, Math.PI * 2),
    line(0.275, 0.5, 0.725, 0.5),
    fill(0.5, 0.35, RED),
    ...disc(0.42, 0.37, 0.03, '#ffffff'),
    ...disc(0.56, 0.3, 0.035, '#ffffff'),
    ...disc(0.62, 0.43, 0.025, '#ffffff'),
  ],
  cactus: () => [
    line(0.5, 0.25, 0.5, 0.86, GREEN, 50),
    poly([[0.5, 0.6], [0.37, 0.6], [0.37, 0.42]], GREEN, 28),
    poly([[0.5, 0.5], [0.63, 0.5], [0.63, 0.35]], GREEN, 28),
    poly([[0.38, 0.84], [0.62, 0.84], [0.58, 0.97], [0.42, 0.97]], INK, 5, true),
    fill(0.5, 0.945, '#c23800'), // below the stem's rounded end, inside the pot
  ],
  glasses: () => [
    circle(0.35, 0.5, 0.13, INK, 8),
    circle(0.65, 0.5, 0.13, INK, 8),
    arc(0.5, 0.52, 0.06, Math.PI * 1.15, Math.PI * 1.85, INK, 6),
    line(0.253, 0.48, 0.12, 0.42, INK, 6),
    line(0.747, 0.48, 0.88, 0.42, INK, 6),
    fill(0.35, 0.5, '#b3e5fc'),
    fill(0.65, 0.5, '#b3e5fc'),
  ],
  lollipop: () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 120; i++) {
      const a = i * 0.2;
      const r = 0.012 + i * 0.0015;
      pts.push([0.5 + r * ASPECT * Math.cos(a), 0.35 + r * Math.sin(a)]);
    }
    return [line(0.5, 0.55, 0.5, 0.93, BROWN, 8), ...disc(0.5, 0.35, 0.2, '#ffffff'), poly(pts, PINK, 12), circle(0.5, 0.35, 0.2, RED, 6)];
  },
  cherry: () => [
    poly([[0.4, 0.62], [0.45, 0.45], [0.52, 0.3]], DARK_GREEN, 5),
    poly([[0.6, 0.64], [0.57, 0.45], [0.52, 0.3]], DARK_GREEN, 5),
    ellipse(0.6, 0.27, 0.06, 0.035, DARK_GREEN, 4),
    fill(0.6, 0.27, GREEN),
    ...disc(0.4, 0.7, 0.1, RED),
    ...disc(0.6, 0.72, 0.1, RED),
  ],
  boat: () => [
    poly([[0.2, 0.6], [0.8, 0.6], [0.7, 0.75], [0.3, 0.75]], INK, 6, true),
    fill(0.5, 0.67, BROWN),
    line(0.5, 0.6, 0.5, 0.18, INK, 6),
    poly([[0.52, 0.2], [0.52, 0.56], [0.72, 0.56]], INK, 5, true),
    fill(0.56, 0.45, '#ffffff'),
    poly([[0.48, 0.24], [0.48, 0.56], [0.32, 0.56]], INK, 5, true),
    fill(0.45, 0.47, RED),
    wave(0.05, 0.95, 0.8, 0.02, BLUE, 6),
    wave(0.05, 0.95, 0.88, 0.02, BLUE, 6),
  ],
  rocket: () => [
    poly([[0.5, 0.1], [0.58, 0.3], [0.58, 0.7], [0.42, 0.7], [0.42, 0.3]], INK, 6, true),
    fill(0.5, 0.55, GRAY),
    poly([[0.42, 0.55], [0.34, 0.72], [0.42, 0.7]], INK, 5, true),
    poly([[0.58, 0.55], [0.66, 0.72], [0.58, 0.7]], INK, 5, true),
    fill(0.39, 0.67, RED),
    fill(0.61, 0.67, RED),
    ...disc(0.5, 0.38, 0.05, BLUE),
    poly([[0.44, 0.72], [0.5, 0.9], [0.56, 0.72]], ORANGE, 8, true),
    fill(0.5, 0.77, YELLOW),
  ],
};

export const BOT_WORDS = Object.keys(BOT_DRAWINGS);

export function pickDrawableWords(count: number, exclude: Set<string>, random = Math.random): string[] {
  const fresh = BOT_WORDS.filter((w) => !exclude.has(w));
  const pool = fresh.length >= count ? fresh : [...BOT_WORDS];
  return [...pool].sort(() => random() - 0.5).slice(0, count);
}
