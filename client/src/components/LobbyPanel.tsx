import { useState } from 'react';
import { socket } from '../lib/socket';
import { showToast, useMe, useStore } from '../lib/store';
import { SettingsForm } from './SettingsForm';

/** Shown in the board area while the room is waiting — same place skribbl.io puts its room settings. */
export function LobbyPanel() {
  const room = useStore((s) => s.room)!;
  const me = useMe();
  const [copied, setCopied] = useState(false);
  const isHost = me?.isHost ?? false;

  const inviteLink = `${window.location.origin}/room/${room.roomId}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(inviteLink);
    }
  };

  const connected = room.players.filter((p) => p.isConnected);
  const notReady = connected.filter((p) => !p.isHost && !p.isReady && !p.isSpectator);
  const canStart = connected.length >= 2 && notReady.length === 0;

  return (
    <div className="lobby-panel">
      <SettingsForm settings={room.settings} editable={isHost} />

      <div className="lobby-actions">
        {me?.isSpectator ? (
          <p className="lobby-hint">👀 You're spectating. You'll watch the game without playing.</p>
        ) : isHost ? (
          <>
            <button className="btn btn-green btn-big" disabled={!canStart} onClick={() => socket.emit('start_game')}>
              Start!
            </button>
            <button className="btn btn-blue" onClick={copy}>
              {copied ? 'Link copied!' : 'Invite'}
            </button>
            <p className="lobby-hint">
              {connected.length < 2
                ? 'Waiting for players to join…'
                : notReady.length
                  ? `Waiting for ${notReady.map((p) => p.name).join(', ')} to be ready.`
                  : 'Everyone is ready!'}
            </p>
          </>
        ) : room.settings.isPrivate ? (
          <>
            <button
              className={`btn btn-big ${me?.isReady ? 'btn-yellow' : 'btn-green'}`}
              onClick={() => socket.emit('player_ready', { ready: !me?.isReady })}
            >
              {me?.isReady ? "I'm not ready" : "I'm ready!"}
            </button>
            <button className="btn btn-blue" onClick={copy}>
              {copied ? 'Link copied!' : 'Invite'}
            </button>
            <p className="lobby-hint">The host starts the game when everyone is ready.</p>
          </>
        ) : (
          <p className="lobby-hint">Public room — the game starts automatically when enough players are here.</p>
        )}
        <p className="room-code-line">
          Room code <b>{room.roomId}</b>
        </p>
      </div>
    </div>
  );
}
