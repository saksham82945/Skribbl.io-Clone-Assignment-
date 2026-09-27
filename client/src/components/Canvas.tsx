import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point, Stroke, Tool } from '../../../shared/types';
import { canvasModel as liveModel, type CanvasModel } from '../lib/canvasModel';
import { floodFillPixels, hexToRgb } from '../lib/floodFill';
import { socket } from '../lib/socket';

export const CANVAS_W = 800;
export const CANVAS_H = 600;
const FLUSH_MS = 30;

/** Bucket fill: normalised seed point → pixel flood fill on the canvas bitmap. */
function floodFill(ctx: CanvasRenderingContext2D, nx: number, ny: number, hex: string) {
  const x0 = Math.min(CANVAS_W - 1, Math.max(0, Math.floor(nx * CANVAS_W)));
  const y0 = Math.min(CANVAS_H - 1, Math.max(0, Math.floor(ny * CANVAS_H)));
  const img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  if (floodFillPixels(img.data, CANVAS_W, CANVAS_H, x0, y0, hexToRgb(hex))) ctx.putImageData(img, 0, 0);
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, from = 0) {
  const pts = s.points;
  if (!pts.length) return;
  if (s.tool === 'fill') {
    if (from === 0) floodFill(ctx, pts[0][0], pts[0][1], s.color);
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = ctx.fillStyle = s.tool === 'eraser' ? '#000' : s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0] * CANVAS_W, pts[0][1] * CANVAS_H, s.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[from][0] * CANVAS_W, pts[from][1] * CANVAS_H);
    for (let i = from + 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * CANVAS_W, pts[i][1] * CANVAS_H);
    ctx.stroke();
  }
  ctx.restore();
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

interface Props {
  /** Which stroke list to render (the live board, or the replay viewer). */
  model?: CanvasModel;
  canDraw: boolean;
  tool: Tool;
  color: string;
  size: number;
}

/**
 * Renders `canvasModel` and, for the drawer, captures pointer input.
 * The drawer's strokes are drawn locally immediately (no round-trip lag) and
 * streamed to the server as draw_start → batched draw_move → draw_end.
 */
export function Canvas({ model = liveModel, canDraw, tool, color, size }: Props) {
  const canvasModel = model;
  const ref = useRef<HTMLCanvasElement>(null);
  const active = useRef<{ id: string; pending: Point[]; last: Point; timer: number | null } | null>(null);

  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    const redraw = () => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      canvasModel.strokes.forEach((s) => drawStroke(ctx, s));
    };
    redraw();
    return canvasModel.subscribe((c) => (c.type === 'full' ? redraw() : drawStroke(ctx, c.stroke, c.from)));
  }, [canvasModel]);

  // If the turn ends mid-stroke, drop it.
  useEffect(() => {
    if (!canDraw) active.current = null;
  }, [canDraw]);

  const toPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000];
  };

  const flush = () => {
    const a = active.current;
    if (!a) return;
    if (a.timer) clearTimeout(a.timer);
    a.timer = null;
    if (a.pending.length) socket.emit('draw_move', { strokeId: a.id, points: a.pending.splice(0) });
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toPoint(e);
    const id = newId();
    if (tool === 'fill') {
      canvasModel.startLocal({ id, tool, color, size: 1, points: [pt] });
      socket.emit('draw_start', { strokeId: id, x: pt[0], y: pt[1], color, size: 1, tool });
      socket.emit('draw_end', { strokeId: id });
      return;
    }
    active.current = { id, pending: [], last: pt, timer: null };
    canvasModel.startLocal({ id, tool, color, size, points: [pt] });
    socket.emit('draw_start', { strokeId: id, x: pt[0], y: pt[1], color, size, tool });
  };

  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const fresh: Point[] = [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const pt = toPoint(ev);
      if (Math.hypot(pt[0] - a.last[0], pt[1] - a.last[1]) < 0.002) continue;
      a.last = pt;
      fresh.push(pt);
    }
    if (!fresh.length) return;
    canvasModel.append(a.id, fresh);
    a.pending.push(...fresh);
    if (!a.timer) a.timer = window.setTimeout(flush, FLUSH_MS);
  };

  const onUp = () => {
    const a = active.current;
    if (!a) return;
    flush();
    socket.emit('draw_end', { strokeId: a.id });
    active.current = null;
  };

  return (
    <canvas
      ref={ref}
      className={`board ${canDraw ? `can-draw tool-${tool}` : ''}`}
      width={CANVAS_W}
      height={CANVAS_H}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      aria-label={canDraw ? 'Drawing canvas' : 'Drawing'}
    />
  );
}
