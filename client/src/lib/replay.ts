import { create } from 'zustand';
import type { Stroke } from '../shared/types';
import { CanvasModel, canvasModel } from './canvasModel';

/**
 * "Replay last round's drawing". The client already holds every stroke of the
 * turn, so at turn end we keep a copy and later re-feed it, a few points at a
 * time, into a separate CanvasModel shown in the replay viewer. The live board
 * is never touched, so a replay can't clash with the next turn.
 */
export const replayModel = new CanvasModel();

interface LastDrawing {
  word: string | null;
  drawerName: string | null;
  strokes: Stroke[];
}

export const useReplay = create<{ last: LastDrawing | null; open: boolean }>()(() => ({ last: null, open: false }));

export function saveLastDrawing(word: string | null, drawerName: string | null) {
  if (!canvasModel.strokes.length) return;
  useReplay.setState({ last: { word, drawerName, strokes: canvasModel.strokes.map((s) => ({ ...s, points: [...s.points] })) } });
}

let timer: ReturnType<typeof setTimeout> | null = null;

export function stopReplay() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Animates the saved drawing into `replayModel`. Calls `onDone` when finished. */
export function playReplay(onDone?: () => void, speed = 1) {
  stopReplay();
  const strokes = useReplay.getState().last?.strokes ?? [];
  replayModel.clear();
  if (!strokes.length) return onDone?.();

  let si = 0;
  let pi = 0; // points of the current stroke already drawn
  const step = () => {
    const s = strokes[si];
    if (!s) {
      timer = null;
      return onDone?.();
    }
    if (pi === 0) {
      replayModel.start({ ...s, points: [s.points[0]] });
      pi = 1;
    }
    const next = Math.min(s.points.length, pi + 3);
    if (next > pi) replayModel.append(s.id, s.points.slice(pi, next));
    pi = next;
    let delay = 16 / speed;
    if (pi >= s.points.length) {
      si++;
      pi = 0;
      delay = (s.tool === 'fill' ? 200 : 80) / speed;
    }
    timer = setTimeout(step, delay);
  };
  step();
}
