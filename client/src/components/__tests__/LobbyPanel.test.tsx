import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { socket } from '../../lib/socket';
import { gameState, player, roomState, setScene } from '../../test/fixtures';
import { LobbyPanel } from '../LobbyPanel';

vi.mock('../../lib/socket', () => ({ socket: { emit: vi.fn(), on: vi.fn(), connected: true } }));
const emit = socket.emit as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => emit.mockClear());

describe('LobbyPanel', () => {
  it('host cannot start until everyone else is ready', () => {
    setScene('a', roomState([player('a', { isHost: true }), player('b')]), gameState());
    render(<LobbyPanel />);
    expect(screen.getByRole('button', { name: 'Start!' })).toBeDisabled();
    expect(screen.getByText('Waiting for B to be ready.')).toBeInTheDocument();
  });

  it('host can start when everyone is ready', () => {
    setScene('a', roomState([player('a', { isHost: true }), player('b', { isReady: true })]), gameState());
    render(<LobbyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Start!' }));
    expect(emit).toHaveBeenCalledWith('start_game');
  });

  it('non-hosts ready up in private rooms and cannot edit settings', () => {
    setScene('b', roomState([player('a', { isHost: true }), player('b')]), gameState());
    render(<LobbyPanel />);
    fireEvent.click(screen.getByRole('button', { name: "I'm ready!" }));
    expect(emit).toHaveBeenCalledWith('player_ready', { ready: true });
    expect(screen.getByRole('group')).toBeDisabled(); // the settings fieldset
  });

  it('host edits settings, including the word language', () => {
    setScene('a', roomState([player('a', { isHost: true })]), gameState());
    render(<LobbyPanel />);
    fireEvent.change(screen.getByDisplayValue('English'), { target: { value: 'hi' } });
    expect(emit).toHaveBeenCalledWith('update_settings', { language: 'hi' });
  });

  it('spectators are told they are watching', () => {
    setScene('w', roomState([player('a', { isHost: true }), player('w', { isSpectator: true })]), gameState());
    render(<LobbyPanel />);
    expect(screen.getByText(/You're spectating/)).toBeInTheDocument();
  });
});
