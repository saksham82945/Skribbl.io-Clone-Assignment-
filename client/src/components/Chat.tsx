import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutes } from '../lib/mute';
import { socket } from '../lib/socket';
import { useMe, useStore } from '../lib/store';

export function Chat() {
  const allMessages = useStore((s) => s.messages);
  const mutedIds = useMutes((s) => s.muted);
  // Muted players' chat is hidden for this viewer only; system lines still show.
  const messages = mutedIds.size ? allMessages.filter((m) => !m.playerId || !mutedIds.has(m.playerId) || m.kind === 'correct') : allMessages;
  const game = useStore((s) => s.game);
  const me = useMe();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const isGuessing = game?.phase === 'drawing' && !!me && !me.isDrawing && !me.hasGuessed && !me.isSpectator;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    socket.emit(isGuessing ? 'guess' : 'chat', { text: t });
    setText('');
  };

  const placeholder = me?.isSpectator
    ? 'Spectating: chat only…'
    : isGuessing
    ? 'Type your guess here…'
    : me?.isDrawing && game?.phase === 'drawing'
      ? 'Chat with players who guessed…'
      : me?.hasGuessed && game?.phase === 'drawing'
        ? 'You guessed it! Chat privately…'
        : 'Type a message…';

  return (
    <section className="chat card" aria-label="Chat">
      <div className="chat-list" ref={listRef} role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={m.id} className={`msg msg-${m.kind} ${i % 2 ? 'odd' : ''}`}>
            {m.playerName && (m.kind === 'chat' || m.kind === 'guessed') && <b>{m.playerName}: </b>}
            <span>{m.text}</span>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="chat-form">
        <input
          className="input"
          value={text}
          maxLength={100}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </form>
    </section>
  );
}
