import { useEffect, useState } from 'react';
import type { Tool } from '../shared/types';
import { BoardOverlay } from '../components/BoardOverlay';
import { Canvas } from '../components/Canvas';
import { Chat } from '../components/Chat';
import { LobbyPanel } from '../components/LobbyPanel';
import { PlayerList } from '../components/PlayerList';
import { RateButtons } from '../components/RateButtons';
import { ReplayModal } from '../components/ReplayModal';
import { Toolbar } from '../components/Toolbar';
import { TopBar } from '../components/TopBar';
import { socket } from '../lib/socket';
import { useStore } from '../lib/store';

/**
 * One frame for the whole room, like skribbl.io: top bar, players on the left,
 * chat on the right, and the board in the middle (room settings while waiting).
 */
export function GameView({ onLeave }: { onLeave: () => void }) {
  const game = useStore((s) => s.game)!;
  const myId = useStore((s) => s.session?.playerId);
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(10);

  const inLobby = game.phase === 'lobby';
  const canDraw = game.phase === 'drawing' && game.drawerId === myId;

  // Keyboard shortcuts for the drawer (ignored while typing in chat).
  useEffect(() => {
    if (!canDraw) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        socket.emit('draw_undo');
      } else if (e.key === 'b') setTool('brush');
      else if (e.key === 'f') setTool('fill');
      else if (e.key === 'e') setTool('eraser');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canDraw]);

  return (
    <main className="game">
      <TopBar onLeave={onLeave} />
      <div className="game-grid">
        <PlayerList ranked={!inLobby} />
        <div className="board-col">
          <div className={`board-wrap ${inLobby ? 'is-lobby' : ''}`}>
            {inLobby ? (
              <LobbyPanel />
            ) : (
              <>
                <Canvas canDraw={canDraw} tool={tool} color={color} size={size} />
                <BoardOverlay />
                <RateButtons />
              </>
            )}
          </div>
          {canDraw && <Toolbar tool={tool} color={color} size={size} onTool={setTool} onColor={setColor} onSize={setSize} />}
        </div>
        <Chat />
      </div>
      <ReplayModal />
    </main>
  );
}
