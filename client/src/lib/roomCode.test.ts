import { describe, expect, it } from 'vitest';
import { extractCode } from './roomCode';

describe('extractCode', () => {
  it.each([
    ['abc123', 'ABC123'],
    ['  XY7Z9Q ', 'XY7Z9Q'],
    ['https://scribble.onrender.com/room/K8PQ2M', 'K8PQ2M'],
    ['http://localhost:5173/room/k8pq2m/', 'K8PQ2M'],
  ])('%s → %s', (input, code) => expect(extractCode(input)).toBe(code));
});
