import { useEffect, useState } from 'react';
import { playReplay, replayModel, stopReplay, useReplay } from '../lib/replay';
import { Canvas } from './Canvas';

/** "▶ Replay" button + viewer that re-animates the previous turn's drawing. */
export function ReplayButton() {
  const hasReplay = useReplay((s) => !!s.last);
  if (!hasReplay) return null;
  return (
    <button className="icon-btn" title="Replay the last drawing" aria-label="Replay the last drawing" onClick={() => useReplay.setState({ open: true })}>
      ▶
    </button>
  );
}

export function ReplayModal() {
  const open = useReplay((s) => s.open);
  const last = useReplay((s) => s.last);
  const [playing, setPlaying] = useState(false);

  const play = () => {
    setPlaying(true);
    playReplay(() => setPlaying(false));
  };

  useEffect(() => {
    if (open) play();
    return stopReplay;
  }, [open]);

  if (!open || !last) return null;
  const close = () => useReplay.setState({ open: false });

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Replay of the last drawing" onClick={close}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h2>
            Replay{last.word ? `: “${last.word}”` : ''}
            {last.drawerName && <small className="muted"> by {last.drawerName}</small>}
          </h2>
          <button className="icon-btn" onClick={close} aria-label="Close replay">
            ✕
          </button>
        </div>
        <div className="board-wrap">
          <Canvas model={replayModel} canDraw={false} tool="brush" color="#000000" size={1} />
        </div>
        <button className="btn btn-blue" disabled={playing} onClick={play}>
          {playing ? 'Playing…' : '↻ Play again'}
        </button>
      </div>
    </div>
  );
}
