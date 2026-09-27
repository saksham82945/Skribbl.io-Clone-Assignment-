import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { gameState, player, roomState, setScene } from '../../test/fixtures';
import { PlayerList } from '../PlayerList';

vi.mock('../../lib/socket', () => ({ socket: { emit: vi.fn(), on: vi.fn(), connected: true } }));

const players = [
  player('a', { isHost: true, score: 100 }),
  player('b', { score: 450, isDrawing: true }),
  player('c', { score: 100, hasGuessed: true }),
  player('w', { isSpectator: true }),
];

describe('PlayerList', () => {
  it('ranks players by score during the game, ties share a rank', () => {
    setScene('a', roomState(players), gameState({ phase: 'drawing' }));
    const { container } = render(<PlayerList ranked />);
    const rows = [...container.querySelectorAll('.player-row')];
    expect(rows.map((r) => r.querySelector('.player-name')!.textContent)).toEqual(['B', 'A (You)', 'C']);
    expect(rows.map((r) => r.querySelector('.rank')!.textContent)).toEqual(['#1', '#2', '#2']);
    expect(rows[2]).toHaveClass('guessed');
  });

  it('lists spectators separately', () => {
    setScene('a', roomState(players), gameState());
    render(<PlayerList ranked={false} />);
    const watching = screen.getByText('👀 Watching').parentElement!;
    expect(within(watching).getByText('W')).toBeInTheDocument();
  });

  it('host gets Kick; others get Vote kick; everyone can Report and Mute', () => {
    setScene('a', roomState(players), gameState());
    const host = render(<PlayerList ranked={false} />);
    fireEvent.click(screen.getByLabelText('Options for B'));
    expect(screen.getByRole('menuitem', { name: /kick/i })).toHaveTextContent('Kick');
    expect(screen.getByRole('menuitem', { name: /report/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /mute/i })).toBeInTheDocument();
    host.unmount();

    setScene('c', roomState(players), gameState());
    render(<PlayerList ranked={false} />);
    fireEvent.click(screen.getByLabelText('Options for B'));
    expect(screen.getByRole('menuitem', { name: /vote kick/i })).toBeInTheDocument();
  });
});
