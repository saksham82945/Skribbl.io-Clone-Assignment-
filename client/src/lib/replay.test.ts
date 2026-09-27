import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasModel } from './canvasModel';
import { playReplay, replayModel, saveLastDrawing, useReplay } from './replay';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('replay', () => {
  it('re-animates the saved drawing on its own model, ending identical to the original', () => {
    canvasModel.setAll([
      { id: 'a', tool: 'brush', color: '#ff0000', size: 4, points: Array.from({ length: 10 }, (_, i) => [i / 10, i / 10] as [number, number]) },
      { id: 'b', tool: 'fill', color: '#00ff00', size: 1, points: [[0.5, 0.5]] },
    ]);
    saveLastDrawing('apple', 'Alice');
    expect(useReplay.getState().last).toMatchObject({ word: 'apple', drawerName: 'Alice' });

    canvasModel.clear(); // next turn starts; the saved copy is unaffected
    const done = vi.fn();
    playReplay(done);
    expect(replayModel.strokes[0].points.length).toBeLessThan(10); // animating, not instant
    vi.runAllTimers();
    expect(done).toHaveBeenCalledOnce();
    expect(replayModel.strokes.map((s) => [s.id, s.points.length])).toEqual([
      ['a', 10],
      ['b', 1],
    ]);
    expect(canvasModel.strokes).toEqual([]); // the live board was never touched
  });
});
