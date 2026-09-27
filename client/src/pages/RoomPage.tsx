import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ProfileForm } from '../components/ProfileForm';
import { joinRoom, leaveRoom, showToast, useStore } from '../lib/store';
import { clearSession, loadSession } from '../lib/storage';
import { GameView } from './GameView';

/**
 * /room/:roomId — handles invite links, refreshes (rejoin with saved token)
 * and switches between the lobby and the game.
 */
export function RoomPage() {
  const { roomId = '' } = useParams();
  const code = roomId.toUpperCase();
  const navigate = useNavigate();
  const navState = useLocation().state as { autoJoin?: boolean; spectator?: boolean } | null;
  const autoJoin = !!navState?.autoJoin;
  const [spectator, setSpectator] = useState(!!navState?.spectator);
  const session = useStore((s) => s.session);
  const room = useStore((s) => s.room);
  const game = useStore((s) => s.game);
  const kicked = useStore((s) => s.kicked);
  const hasName = useStore((s) => !!s.profile.name.trim());
  const [needsProfile, setNeedsProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const tried = useRef(false);

  const inRoom = session?.roomId === code;

  const attemptJoin = async (token?: string) => {
    setJoining(true);
    const res = await joinRoom(code, token, spectator);
    setJoining(false);
    if (res.ok) {
      setNeedsProfile(false);
      return;
    }
    if (token) {
      // Stale token (room restarted / we were removed): join fresh instead.
      clearSession(code);
      setNeedsProfile(true);
      return;
    }
    setError(res.error);
  };

  useEffect(() => {
    if (inRoom || tried.current) return;
    tried.current = true;
    const saved = loadSession(code);
    if (saved && hasName) attemptJoin(saved.token);
    else if (hasName && autoJoin) attemptJoin();
    else setNeedsProfile(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, inRoom]);

  useEffect(() => {
    if (kicked) navigate('/');
  }, [kicked, navigate]);

  const onLeave = () => {
    leaveRoom();
    navigate('/');
  };

  if (error) {
    return (
      <main className="center-page">
        <div className="card narrow">
          <h2>Can't join room {code}</h2>
          <p>{error}</p>
          <Link className="btn btn-blue" to="/">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  if (!inRoom && needsProfile) {
    return (
      <main className="center-page">
        <div className="card narrow home-card">
          <h2>Join room {code}</h2>
          <ProfileForm onSubmit={() => hasName && attemptJoin()} />
          <label className="checkbox-line">
            <input type="checkbox" checked={spectator} onChange={(e) => setSpectator(e.target.checked)} />
            Just watch (spectator mode)
          </label>
          <button
            className="btn btn-green btn-big"
            disabled={joining}
            onClick={() => (hasName ? attemptJoin() : showToast('Please enter a name first'))}
          >
            Join game
          </button>
          <Link to="/" className="muted center">
            ← back
          </Link>
        </div>
      </main>
    );
  }

  if (!inRoom || !room || !game) {
    return (
      <main className="center-page">
        <div className="card narrow center">Joining room {code}…</div>
      </main>
    );
  }

  return <GameView onLeave={onLeave} />;
}
