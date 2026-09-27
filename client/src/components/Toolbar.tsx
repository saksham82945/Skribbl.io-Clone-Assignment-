import type { Tool } from '../shared/types';
import { socket } from '../lib/socket';

export const COLORS = [
  '#ffffff', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00b2ff', '#231fd3', '#a300ba', '#d37caa', '#a0522d',
  '#000000', '#4c4c4c', '#740b07', '#c23800', '#e8a200', '#005510', '#00569e', '#0e0865', '#550069', '#a75574', '#63300d',
];
export const SIZES = [4, 10, 20, 36];

interface Props {
  tool: Tool;
  color: string;
  size: number;
  onTool: (t: Tool) => void;
  onColor: (c: string) => void;
  onSize: (s: number) => void;
}

export function Toolbar({ tool, color, size, onTool, onColor, onSize }: Props) {
  return (
    <div className="toolbar">
      <div className="current-color" style={{ background: color }} title="Current color" />
      <div className="palette">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${c === color && tool !== 'eraser' ? 'selected' : ''}`}
            style={{ background: c }}
            aria-label={`Color ${c}`}
            onClick={() => {
              onColor(c);
              if (tool === 'eraser') onTool('brush');
            }}
          />
        ))}
      </div>
      <div className="tool-group">
        {SIZES.map((s) => (
          <button key={s} className={`tool-btn ${size === s ? 'active' : ''}`} onClick={() => onSize(s)} aria-label={`Brush size ${s}`}>
            <span className="size-dot" style={{ width: Math.max(4, s * 0.7), height: Math.max(4, s * 0.7) }} />
          </button>
        ))}
      </div>
      <div className="tool-group">
        <button className={`tool-btn ${tool === 'brush' ? 'active' : ''}`} onClick={() => onTool('brush')} title="Brush (B)">✏️</button>
        <button className={`tool-btn ${tool === 'fill' ? 'active' : ''}`} onClick={() => onTool('fill')} title="Fill (F)">🪣</button>
        <button className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`} onClick={() => onTool('eraser')} title="Eraser (E)">🩹</button>
        <button className="tool-btn" onClick={() => socket.emit('draw_undo')} title="Undo (Ctrl+Z)">↩️</button>
        <button className="tool-btn" onClick={() => socket.emit('canvas_clear')} title="Clear canvas">🗑️</button>
      </div>
    </div>
  );
}
