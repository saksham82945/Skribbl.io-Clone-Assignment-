import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { gameState, player, roomState, setScene } from '../../test/fixtures';
import { TopBar } from '../TopBar';

vi.mock('../../lib/socket', () => ({ socket: { emit: vi.fn(), on: vi.fn(), connected: true } }));

const players = [player('a', { isHost: true, isDrawing: true }), player('b')];

describe('TopBar', () => {
  it('shows WAITING and the round count in the lobby', () => {
    setScene('a', roomState(players), gameState({ phase: 'lobby' }));
    render(<TopBar onLeave={() => {}} />);
    expect(screen.getByText('WAITING')).toBeInTheDocument();
    expect(screen.getByText('Round 1 of 3')).toBeInTheDocument();
  });

  it('shows guessers blanks, revealed hint letters and the letter count', () => {
    setScene('b', roomState(players), gameState({ phase: 'drawing', round: 1, drawerId: 'a', hints: '_c_ c____', timeLeftMs: 50_000 }));
    const { container } = render(<TopBar onLeave={() => {}} />);
    expect(screen.getByText('Guess this')).toBeInTheDocument();
    expect(container.querySelectorAll('.blank')).toHaveLength(6);
    expect(container.querySelectorAll('.letter')).toHaveLength(2);
    expect(screen.getByText('3 5')).toBeInTheDocument();
    expect(screen.getByLabelText('Time left')).toHaveTextContent('50');
  });

  it('shows the drawer the word itself', () => {
    setScene('a', roomState(players), gameState({ phase: 'drawing', round: 1, drawerId: 'a', word: 'ice cream', hints: '___ _____' }));
    render(<TopBar onLeave={() => {}} />);
    expect(screen.getByText('Draw this')).toBeInTheDocument();
    expect(screen.getByText('ice cream')).toBeInTheDocument();
  });

  it('tells a guesser who got it that they guessed it', () => {
    setScene('b', roomState(players), gameState({ phase: 'drawing', round: 1, drawerId: 'a', word: 'apple', hints: '_____' }));
    render(<TopBar onLeave={() => {}} />);
    expect(screen.getByText('You guessed it!')).toBeInTheDocument();
  });

  it('hides the word length in Hidden mode', () => {
    const room = roomState(players);
    room.settings.wordMode = 'hidden';
    setScene('b', room, gameState({ phase: 'drawing', round: 1, drawerId: 'a', hints: null }));
    render(<TopBar onLeave={() => {}} />);
    expect(screen.getByText('? ? ?')).toBeInTheDocument();
  });
});
