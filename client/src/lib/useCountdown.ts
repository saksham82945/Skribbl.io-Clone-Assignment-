import { useEffect, useState } from 'react';
import { useStore } from './store';

/** Seconds left in the current phase, counted down locally from the server's `timeLeftMs`. */
export function useCountdown(): number | null {
  const timeLeftMs = useStore((s) => s.game?.timeLeftMs ?? null);
  const receivedAt = useStore((s) => s.gameReceivedAt);
  const compute = () => (timeLeftMs === null ? null : Math.max(0, Math.ceil((timeLeftMs - (Date.now() - receivedAt)) / 1000)));
  const [left, setLeft] = useState(compute);

  useEffect(() => {
    setLeft(compute());
    if (timeLeftMs === null) return;
    const id = setInterval(() => setLeft(compute()), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeftMs, receivedAt]);

  return left;
}
