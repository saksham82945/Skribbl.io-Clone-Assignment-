import { useEffect, useRef, useState } from 'react';
import type { PlayerDTO } from '../shared/types';
import { useMutes } from '../lib/mute';
import { socket } from '../lib/socket';
import { showToast, useStore } from '../lib/store';
import { Avatar } from './Avatar';

/** Per-player moderation menu: kick (host), vote kick, report, mute (local only). */
function PlayerMenu({ player, amHost, onClose }: { player: PlayerDTO; amHost: boolean; onClose: () => void }) {
  const muted = useMutes((s) => s.muted.has(player.id));
  const toggleMute = useMutes((s) => s.toggle);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div className="player-menu" ref={ref} role="menu">
      {amHost ? (
        <>
          <button role="menuitem" onClick={act(() => confirm(`Kick ${player.name}? They can join again.`) && socket.emit('kick_player', { playerId: player.id }))}>
            🚪 Kick
          </button>
          <button
            role="menuitem"
            onClick={act(() => confirm(`Ban ${player.name}? They won't be able to rejoin this room.`) && socket.emit('kick_player', { playerId: player.id, ban: true }))}
          >
            ⛔ Ban
          </button>
        </>
      ) : (
        <button role="menuitem" onClick={act(() => socket.emit('vote_kick', { playerId: player.id }))}>
          👎 Vote kick
        </button>
      )}
      <button
        role="menuitem"
        onClick={act(() => {
          const reason = prompt(`Why are you reporting ${player.name}? (optional)`);
          if (reason !== null) socket.emit('report_player', { playerId: player.id, reason });
        })}
      >
        🚩 Report
      </button>
      <button
        role="menuitem"
        onClick={act(() => {
          toggleMute(player.id);
          showToast(muted ? `${player.name} unmuted` : `${player.name} muted (only for you)`);
        })}
      >
        {muted ? '🔈 Unmute' : '🔇 Mute'}
      </button>
    </div>
  );
}

export function PlayerList({ ranked }: { ranked: boolean }) {
  const room = useStore((s) => s.room);
  const myId = useStore((s) => s.session?.playerId);
  const mutedIds = useMutes((s) => s.muted);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  if (!room) return null;

  const active = room.players.filter((p) => !p.isSpectator);
  const spectators = room.players.filter((p) => p.isSpectator);
  const players = ranked ? [...active].sort((a, b) => b.score - a.score) : active;
  const amHost = room.hostId === myId;
  const rankOf = (p: PlayerDTO) => active.filter((o) => o.score > p.score).length + 1;

  return (
    <aside className="players card" aria-label="Players">
      {players.map((p) => (
        <div
          key={p.id}
          className={`player-row ${p.hasGuessed ? 'guessed' : ''} ${p.id === myId ? 'me' : ''} ${p.isConnected ? '' : 'offline'}`}
        >
          {ranked && <span className="rank">#{rankOf(p)}</span>}
          <div className="player-info">
            <span className="player-name">
              {p.name}
              {p.id === myId && ' (You)'}
            </span>
            <span className="player-score">{p.score} points</span>
          </div>
          <span className="player-badges">
            {p.isHost && <span title="Host">👑</span>}
            {p.isDrawing && <span title="Drawing">✏️</span>}
            {mutedIds.has(p.id) && <span title="Muted">🔇</span>}
            {!p.isConnected && <span title="Disconnected">📡</span>}
          </span>
          <Avatar avatar={p.avatar} size={40} />
          {p.id !== myId && (
            <button
              className="kick-btn"
              title="Player options"
              aria-label={`Options for ${p.name}`}
              onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
            >
              ⋯
            </button>
          )}
          {menuFor === p.id && <PlayerMenu player={p} amHost={amHost} onClose={() => setMenuFor(null)} />}
        </div>
      ))}
      {spectators.length > 0 && (
        <div className="spectators">
          <span className="spectators-label">👀 Watching</span>
          {spectators.map((p) => (
            <span key={p.id} className="spectator-name">
              {p.name}
              {p.id === myId && ' (You)'}
            </span>
          ))}
        </div>
      )}
    </aside>
  );
}
