import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { socket } from '../../lib/socket';
import { useMutes } from '../../lib/mute';
import { useStore } from '../../lib/store';
import { gameState, player, roomState, setScene } from '../../test/fixtures';
import { Chat } from '../Chat';

vi.mock('../../lib/socket', () => ({ socket: { emit: vi.fn(), on: vi.fn(), connected: true } }));
const emit = socket.emit as unknown as ReturnType<typeof vi.fn>;

function send(text: string) {
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form')!);
}

beforeEach(() => {
  emit.mockClear();
  useMutes.setState({ muted: new Set() });
});

describe('Chat', () => {
  const drawing = gameState({ phase: 'drawing', drawerId: 'a', round: 1 });

  it('sends a guess while guessing', () => {
    setScene('b', roomState([player('a', { isDrawing: true }), player('b')]), drawing);
    render(<Chat />);
    expect(screen.getByPlaceholderText('Type your guess here…')).toBeInTheDocument();
    send('  apple ');
    expect(emit).toHaveBeenCalledWith('guess', { text: 'apple' });
  });

  it('sends plain chat after guessing, while drawing, when spectating, and in the lobby', () => {
    for (const [me, extra, game] of [
      ['b', { hasGuessed: true }, drawing],
      ['a', { isDrawing: true }, drawing],
      ['b', { isSpectator: true }, drawing],
      ['b', {}, gameState()],
    ] as const) {
      emit.mockClear();
      setScene(me, roomState([player('a', me === 'a' ? extra : {}), player('b', me === 'b' ? extra : {})]), game);
      const { unmount } = render(<Chat />);
      send('hello');
      expect(emit).toHaveBeenCalledWith('chat', { text: 'hello' });
      unmount();
    }
  });

  it('ignores empty messages', () => {
    setScene('b', roomState([player('a'), player('b')]), drawing);
    render(<Chat />);
    send('   ');
    expect(emit).not.toHaveBeenCalled();
  });

  it('hides messages from players I muted', () => {
    setScene('b', roomState([player('a'), player('b'), player('c')]), gameState());
    useStore.setState({
      messages: [
        { id: '1', kind: 'chat', playerId: 'a', playerName: 'A', text: 'spam spam' },
        { id: '2', kind: 'chat', playerId: 'c', playerName: 'C', text: 'hi all' },
      ],
    });
    useMutes.setState({ muted: new Set(['a']) });
    render(<Chat />);
    expect(screen.queryByText('spam spam')).not.toBeInTheDocument();
    expect(screen.getByText('hi all')).toBeInTheDocument();
  });
});
