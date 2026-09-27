import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';
import { useStore } from '../lib/store';

/** Thumbs up / down on the current drawing (guessers only, once per turn). */
export function RateButtons() {
  const game = useStore((s) => s.game);
  const myId = useStore((s) => s.session?.playerId);
  const spectating = useStore((s) => !!s.room?.players.find((p) => p.id === s.session?.playerId)?.isSpectator);
  const [rated, setRated] = useState(false);
  const turnKey = `${game?.round}-${game?.drawerId}`;

  useEffect(() => setRated(false), [turnKey]);

  if (!game || game.phase !== 'drawing' || game.drawerId === myId || spectating || rated) return null;

  const rate = (like: boolean) => {
    socket.emit('rate_drawing', { like });
    setRated(true);
  };

  return (
    <div className="rate-buttons">
      <button onClick={() => rate(true)} title="Like this drawing" aria-label="Like drawing">👍</button>
      <button onClick={() => rate(false)} title="Dislike this drawing" aria-label="Dislike drawing">👎</button>
    </div>
  );
}
