import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AckResult, JoinResult, PublicRoomInfo } from '../shared/types';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../shared/types';
import { Avatar } from '../components/Avatar';
import { ProfileForm } from '../components/ProfileForm';
import { extractCode } from '../lib/roomCode';
import { socket } from '../lib/socket';
import { createRoom, quickPlay, showToast, useStore } from '../lib/store';

const LOGO = 'scribble.io'.split('');
const LOGO_COLORS = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#4d908e', '#577590', '#277da1', '#9b5de5', '#f15bb5', '#f94144'];

export function Home() {
  const navigate = useNavigate();
  const name = useStore((s) => s.profile.name.trim());
  const connected = useStore((s) => s.connected);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<PublicRoomInfo[]>([]);

  const refreshRooms = () => socket.emit('get_public_rooms', setRooms);
  useEffect(() => {
    refreshRooms();
    const id = setInterval(refreshRooms, 5000);
    return () => clearInterval(id);
  }, []);

  const go = async (action: () => Promise<AckResult<JoinResult>>) => {
    if (!name) return showToast('Please enter a name first');
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (res.ok) navigate(`/room/${res.roomId}`);
    else showToast(res.error);
  };

  const joinByCode = () => {
    const c = extractCode(code);
    if (c.length !== 6) return showToast('Room codes are 6 characters');
    if (!name) return showToast('Please enter a name first');
    navigate(`/room/${c}`, { state: { autoJoin: true } });
  };

  return (
    <main className="home">
      <h1 className="logo rainbow" aria-label="scribble.io">
        {LOGO.map((ch, i) => (
          <span key={i} style={{ color: LOGO_COLORS[i] }}>
            {ch}
          </span>
        ))}
        <span className="logo-pencil" aria-hidden>
          ✏️
        </span>
      </h1>
      <div className="avatar-row" aria-hidden>
        {AVATAR_EMOJIS.slice(0, 8).map((e, i) => (
          <Avatar key={e} avatar={{ emoji: e, color: AVATAR_COLORS[i] }} size={40} />
        ))}
      </div>

      <section className="card home-card play-card">
          <ProfileForm onSubmit={() => go(quickPlay)} />
          <button className="btn btn-green btn-big" disabled={busy || !connected} onClick={() => go(quickPlay)}>
            Play!
          </button>
          <button className="btn btn-blue btn-wide" disabled={busy || !connected} onClick={() => go(() => createRoom())}>
            Create Private Room
          </button>
          <div className="join-row">
            <input
              className="input"
              placeholder="Room code or invite link"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinByCode()}
              aria-label="Room code"
            />
            <button className="btn btn-yellow" onClick={joinByCode}>
              Join
            </button>
          </div>
          {!connected && <p className="muted">Connecting to server…</p>}
          <p className="muted center small">Hit Play! to jump straight into a game.</p>
      </section>

      <div className="home-grid">
        <section className="card info-card">
          <h2>❓ About</h2>
          <p>
            <b>scribble.io</b> is a free online multiplayer drawing and guessing pictionary game.
          </p>
          <p>
            A normal game consists of a few rounds, where every round a player has to draw their chosen word and others have to guess it to
            gain points!
          </p>
          <p>The person with the most points at the end of the game will be crowned the winner!</p>
        </section>

        <section className="card info-card">
          <h2>✏️ How to play</h2>
          <ol className="how-to">
            <li>When it's your turn, choose a word and draw it.</li>
            <li>Everyone else types guesses in the chat. No spelling it out!</li>
            <li>Guess fast: earlier guesses score more, and the drawer scores for every correct guess.</li>
            <li>Letters are revealed as hints while time runs out.</li>
            <li>Most points after the last round wins 🏆</li>
          </ol>
        </section>

        <section className="card info-card">
          <div className="section-head">
            <h2>Public rooms</h2>
            <button className="btn btn-small btn-ghost" onClick={refreshRooms}>
              Refresh
            </button>
          </div>
          {rooms.length === 0 ? (
            <p className="muted">No open public rooms right now. Hit “Play!” to start one.</p>
          ) : (
            <ul className="room-list">
              {rooms.map((r) => (
                <li key={r.roomId}>
                  <div>
                    <b>{r.hostName ? `${r.hostName}'s room` : `Room ${r.roomId}`}</b>
                    <small>
                      {r.players}/{r.maxPlayers} players · {r.phase === 'lobby' ? 'in lobby' : 'playing'}
                    </small>
                  </div>
                  <div className="room-actions">
                    <button className="btn btn-small btn-green" onClick={() => (name ? navigate(`/room/${r.roomId}`, { state: { autoJoin: true } }) : showToast('Please enter a name first'))}>
                      Join
                    </button>
                    <button
                      className="btn btn-small btn-ghost"
                      title="Watch without playing"
                      onClick={() => (name ? navigate(`/room/${r.roomId}`, { state: { autoJoin: true, spectator: true } }) : showToast('Please enter a name first'))}
                    >
                      Watch
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
