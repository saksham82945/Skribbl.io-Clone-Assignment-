import type { Point, Stroke } from '../shared/types';

export type CanvasChange = { type: 'full' } | { type: 'segment'; stroke: Stroke; from: number };
type Listener = (change: CanvasChange) => void;

/**
 * The canvas is a pure function of this stroke list.
 * Socket events (and the drawer's own input) mutate it; the <Canvas> component
 * draws incremental segments for live strokes and does a full redraw on undo/clear/sync.
 * It lives outside React so events that arrive before the canvas mounts aren't lost.
 */
export class CanvasModel {
  strokes: Stroke[] = [];
  private listeners = new Set<Listener>();
  /** Strokes this client drew itself; the server echoes them back and we skip the echo. */
  private localIds = new Set<string>();

  isLocal(strokeId: string) {
    return this.localIds.has(strokeId);
  }

  startLocal(stroke: Stroke) {
    this.localIds.add(stroke.id);
    this.start(stroke);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(change: CanvasChange) {
    this.listeners.forEach((l) => l(change));
  }

  setAll(strokes: Stroke[]) {
    this.localIds.clear();
    this.strokes = strokes.map((s) => ({ ...s, points: [...s.points] }));
    this.emit({ type: 'full' });
  }

  clear() {
    this.localIds.clear();
    this.strokes = [];
    this.emit({ type: 'full' });
  }

  start(stroke: Stroke) {
    const copy = { ...stroke, points: [...stroke.points] };
    this.strokes.push(copy);
    this.emit({ type: 'segment', stroke: copy, from: 0 });
  }

  append(strokeId: string, points: Point[]) {
    const stroke = this.find(strokeId);
    if (!stroke || !points.length) return;
    const from = Math.max(0, stroke.points.length - 1);
    stroke.points.push(...points);
    this.emit({ type: 'segment', stroke, from });
  }

  remove(strokeId: string) {
    this.strokes = this.strokes.filter((s) => s.id !== strokeId);
    this.emit({ type: 'full' });
  }

  private find(id: string) {
    for (let i = this.strokes.length - 1; i >= 0; i--) if (this.strokes[i].id === id) return this.strokes[i];
    return undefined;
  }
}

export const canvasModel = new CanvasModel();
