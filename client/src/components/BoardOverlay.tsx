import { socket } from '../lib/socket';
import { useStore } from '../lib/store';
import { useCountdown } from '../lib/useCountdown';
import { Avatar } from './Avatar';

const REASONS = {
  time_up: "Time's up!",
  all_guessed: 'Everybody guessed the word!',
  drawer_left: 'The drawer left the game.',
} as const;

/** Modal content drawn over the canvas between phases. */
export function BoardOverlay() {
  const game = useStore((s) => s.game);
  const room = useStore((s) => s.room);
  const myId = useStore((s) => s.session?.playerId);
  const wordOptions = useStore((s) => s.wordOptions);
  const roundEnd = useStore((s) => s.roundEnd);
  const gameOver = useStore((s) => s.gameOver);
  const roundBanner = useStore((s) => s.roundBanner);
  const left = useCountdown();
  if (!game || !room) return null;

  if (roundBanner !== null && game.phase === 'choosing') {
    return (
      <div className="overlay">
        <h2 className="round-banner">Round {roundBanner}</h2>
      </div>
    );
  }

  const drawer = room.players.find((p) => p.id === game.drawerId);
  const isHost = room.hostId === myId;

  if (game.phase === 'choosing') {
    const isDrawer = game.drawerId === myId;
    return (
      <div className="overlay">
        {isDrawer && wordOptions.length ? (
          <>
            <h2>Choose a word</h2>
            <div className="word-options">
              {wordOptions.map((w) => (
                <button key={w} className="btn btn-word" onClick={() => socket.emit('word_chosen', { word: w })}>
                  {w}
                </button>
              ))}
            </div>
            <p className="muted-light">{left ?? ''}s left to choose</p>
          </>
        ) : (
          <>
            {drawer && <Avatar avatar={drawer.avatar} size={72} animated />}
            <h2>{drawer?.name ?? 'Someone'} is choosing a word…</h2>
          </>
        )}
      </div>
    );
  }

  if (game.phase === 'turn_end' && roundEnd) {
    return (
      <div className="overlay">
        <p className="overlay-sub">{REASONS[roundEnd.reason]}</p>
        <h2>
          The word was <span className="highlight">{roundEnd.word ?? '—'}</span>
        </h2>
        <ul className="gains">
          {roundEnd.scores.map((s) => (
            <li key={s.playerId}>
              <span>{s.name}</span>
              <span className={s.gained > 0 ? 'plus' : 'zero'}>{s.gained > 0 ? `+${s.gained}` : '0'}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (game.phase === 'game_over' && gameOver) {
    const podium = gameOver.leaderboard.slice(0, 3);
    return (
      <div className="overlay">
        <p className="overlay-sub">Results</p>
        <h2>🏆 {gameOver.winners.map((w) => w.name).join(' & ')} won!</h2>
        <div className="podium">
          {podium.map((e) => (
            <div key={e.playerId} className={`podium-place place-${e.rank}`}>
              <Avatar avatar={e.avatar} size={e.rank === 1 ? 72 : 56} animated />
              <b>#{e.rank} {e.name}</b>
              <span>{e.score} pts</span>
            </div>
          ))}
        </div>
        {gameOver.leaderboard.length > 3 && (
          <ol className="gains rest" start={4}>
            {gameOver.leaderboard.slice(3).map((e) => (
              <li key={e.playerId}>
                <span>#{e.rank} {e.name}</span>
                <span>{e.score}</span>
              </li>
            ))}
          </ol>
        )}
        {isHost && (
          <button className="btn btn-green" onClick={() => socket.emit('return_to_lobby')}>
            Back to lobby now
          </button>
        )}
        <p className="muted-light">Returning to the lobby in {left ?? 0}s…</p>
      </div>
    );
  }

  return null;
}
