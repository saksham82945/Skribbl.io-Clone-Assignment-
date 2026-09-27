import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { socket } from '../../lib/socket';
import { useStore } from '../../lib/store';
import { gameState, player, roomState, setScene } from '../../test/fixtures';
import { BoardOverlay } from '../BoardOverlay';

vi.mock('../../lib/socket', () => ({ socket: { emit: vi.fn(), on: vi.fn(), connected: true } }));
const players = [player('a', { isHost: true }), player('b')];

describe('BoardOverlay', () => {
  it('lets the drawer pick one of the offered words', () => {
    setScene('a', roomState(players), gameState({ phase: 'choosing', drawerId: 'a', round: 1, timeLeftMs: 15_000 }));
    useStore.setState({ wordOptions: ['cat', 'rocket', 'pizza'], roundBanner: null });
    render(<BoardOverlay />);
    fireEvent.click(screen.getByRole('button', { name: 'rocket' }));
    expect(socket.emit).toHaveBeenCalledWith('word_chosen', { word: 'rocket' });
  });

  it('shows everyone else who is choosing', () => {
    setScene('b', roomState(players), gameState({ phase: 'choosing', drawerId: 'a', round: 1 }));
    useStore.setState({ roundBanner: null });
    render(<BoardOverlay />);
    expect(screen.getByText('A is choosing a word…')).toBeInTheDocument();
  });

  it('shows the round banner first', () => {
    setScene('b', roomState(players), gameState({ phase: 'choosing', drawerId: 'a', round: 2 }));
    useStore.setState({ roundBanner: 2 });
    render(<BoardOverlay />);
    expect(screen.getByText('Round 2')).toBeInTheDocument();
  });

  it('reveals the word and points at the end of a turn', () => {
    setScene('b', roomState(players), gameState({ phase: 'turn_end', drawerId: 'a', round: 1 }));
    useStore.setState({
      roundEnd: { word: 'apple', reason: 'all_guessed', nextDrawer: 'b', scores: [{ playerId: 'b', name: 'B', gained: 420, total: 420 }] },
    });
    render(<BoardOverlay />);
    expect(screen.getByText('apple')).toBeInTheDocument();
    expect(screen.getByText('Everybody guessed the word!')).toBeInTheDocument();
    expect(screen.getByText('+420')).toBeInTheDocument();
  });

  it('shows the winner and podium at game over', () => {
    setScene('a', roomState(players), gameState({ phase: 'game_over', timeLeftMs: 12_000 }));
    const entry = (id: string, rank: number, score: number) => ({ playerId: id, name: id.toUpperCase(), avatar: players[0].avatar, score, rank });
    useStore.setState({ gameOver: { winner: entry('a', 1, 900), winners: [entry('a', 1, 900)], leaderboard: [entry('a', 1, 900), entry('b', 2, 300)] } });
    render(<BoardOverlay />);
    expect(screen.getByText('🏆 A won!')).toBeInTheDocument();
    expect(screen.getByText('900 pts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to lobby/i })).toBeInTheDocument(); // host only
  });
});
