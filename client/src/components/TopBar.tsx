import { useEffect, useState } from 'react';
import { isMuted, setMuted, sounds } from '../lib/sound';
import { ReplayButton } from './ReplayModal';
import { useStore } from '../lib/store';
import { useCountdown } from '../lib/useCountdown';

function WordDisplay() {
  const game = useStore((s) => s.game);
  const hiddenMode = useStore((s) => s.room?.settings.wordMode === 'hidden');
  const myId = useStore((s) => s.session?.playerId);
  if (!game) return null;

  if (game.phase === 'lobby') return <div className="word-status">WAITING</div>;
  if (game.phase === 'choosing') return <div className="word-status">Choosing a word…</div>;
  if (game.phase === 'game_over') return <div className="word-status">RESULTS</div>;

  if (game.word) {
    return (
      <div className="word">
        <span className="word-label">{game.phase !== 'drawing' ? 'The word was' : game.drawerId === myId ? 'Draw this' : 'You guessed it!'}</span>
        <span className="word-letters revealed">{game.word}</span>
      </div>
    );
  }

  if (!game.hints || hiddenMode) {
    return (
      <div className="word">
        <span className="word-label">Guess this</span>
        <span className="word-letters">? ? ?</span>
      </div>
    );
  }

  const lengths = game.hints.split(' ').map((w) => w.length).join(' ');
  return (
    <div className="word">
      <span className="word-label">Guess this</span>
      <span className="word-letters" aria-label={`Word with ${lengths} letters`}>
        {[...game.hints].map((ch, i) => (
          <span key={i} className={ch === ' ' ? 'gap' : ch === '_' ? 'blank' : 'letter'}>
            {ch === '_' ? '' : ch}
          </span>
        ))}
        <sup className="word-len">{lengths}</sup>
      </span>
    </div>
  );
}

export function TopBar({ onLeave }: { onLeave: () => void }) {
  const game = useStore((s) => s.game);
  const totalRounds = useStore((s) => s.room?.settings.rounds ?? 0);
  const left = useCountdown();
  const urgent = game?.phase === 'drawing' && left !== null && left <= 10;
  const [muted, setMutedState] = useState(isMuted);

  // Clock ticks during the last 10 seconds of a turn.
  useEffect(() => {
    if (urgent && left! > 0) sounds.tick();
  }, [urgent, left]);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  return (
    <header className="topbar card">
      <div className="topbar-left">
        <div className={`clock ${urgent ? 'urgent' : ''}`} aria-label="Time left">
          {left ?? '–'}
        </div>
        <div className="round-label">
          Round {Math.max(1, Math.min(game?.round ?? 1, totalRounds))} of {totalRounds}
        </div>
      </div>
      <WordDisplay />
      <div className="topbar-right">
        <ReplayButton />
        <button className="icon-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="btn btn-small btn-ghost" onClick={onLeave}>
          Leave
        </button>
      </div>
    </header>
  );
}
