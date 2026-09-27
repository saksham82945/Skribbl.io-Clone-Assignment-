import { describe, expect, it, vi } from 'vitest';
import { CanvasModel } from './canvasModel';

const stroke = (id: string) => ({ id, tool: 'brush' as const, color: '#000000', size: 4, points: [[0.1, 0.1]] as [number, number][] });

describe('CanvasModel', () => {
  it('builds strokes from start/append and notifies incremental segments', () => {
    const m = new CanvasModel();
    const seen = vi.fn();
    m.subscribe(seen);
    m.start(stroke('a'));
    m.append('a', [[0.2, 0.2], [0.3, 0.3]]);
    expect(m.strokes[0].points).toHaveLength(3);
    expect(seen).toHaveBeenLastCalledWith({ type: 'segment', stroke: m.strokes[0], from: 0 });
  });

  it('asks for a full redraw on undo (remove), clear and sync (setAll)', () => {
    const m = new CanvasModel();
    const seen = vi.fn();
    m.subscribe(seen);
    m.start(stroke('a'));
    m.start(stroke('b'));
    m.remove('a');
    expect(m.strokes.map((s) => s.id)).toEqual(['b']);
    expect(seen).toHaveBeenLastCalledWith({ type: 'full' });
    m.setAll([stroke('x'), stroke('y')]);
    expect(m.strokes.map((s) => s.id)).toEqual(['x', 'y']);
    m.clear();
    expect(m.strokes).toEqual([]);
  });

  it('remembers strokes drawn locally so the server echo can be skipped', () => {
    const m = new CanvasModel();
    m.startLocal(stroke('mine'));
    expect(m.isLocal('mine')).toBe(true);
    expect(m.isLocal('theirs')).toBe(false);
    m.clear();
    expect(m.isLocal('mine')).toBe(false);
  });

  it('does not share point arrays with the caller', () => {
    const m = new CanvasModel();
    const s = stroke('a');
    m.start(s);
    s.points.push([0.9, 0.9]);
    expect(m.strokes[0].points).toHaveLength(1);
  });

  it('stops notifying after unsubscribe', () => {
    const m = new CanvasModel();
    const seen = vi.fn();
    const off = m.subscribe(seen);
    off();
    m.start(stroke('a'));
    expect(seen).not.toHaveBeenCalled();
  });
});
