import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setProfile, useStore } from '../../lib/store';
import { AVATAR_EMOJIS } from '../../shared/types';
import { ProfileForm } from '../ProfileForm';

vi.mock('../../lib/socket', () => ({ socket: { emit: vi.fn(), on: vi.fn(), connected: true } }));

const avatar = () => useStore.getState().profile.avatar;

beforeEach(() => setProfile({ name: '', avatar: { color: '#f94144', emoji: '😀', pattern: 'solid', accessory: 'none', effect: 'none' } }));
afterEach(() => vi.useRealTimers());

describe('ProfileForm', () => {
  it('arrows step through faces', () => {
    render(<ProfileForm />);
    fireEvent.click(screen.getByLabelText('Next face'));
    expect(avatar().emoji).toBe(AVATAR_EMOJIS[1]);
    fireEvent.click(screen.getByLabelText('Previous face'));
    fireEvent.click(screen.getByLabelText('Previous face'));
    expect(avatar().emoji).toBe(AVATAR_EMOJIS[AVATAR_EMOJIS.length - 1]);
  });

  it('each tab changes its part of the avatar and it is saved', () => {
    render(<ProfileForm />);
    fireEvent.click(screen.getByRole('tab', { name: 'Hat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hat Crown' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pattern Rainbow' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Effect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Effect Wiggle' }));
    expect(avatar()).toMatchObject({ accessory: 'crown', pattern: 'rainbow', effect: 'wiggle' });
    expect(JSON.parse(localStorage.getItem('scribble:profile')!).avatar.accessory).toBe('crown');
  });

  it('shows the chosen hat on the big avatar', () => {
    render(<ProfileForm />);
    fireEvent.click(screen.getByRole('tab', { name: 'Hat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hat Top hat' }));
    expect(document.querySelector('.avatar-stage .avatar-acc')?.textContent).toBe('🎩');
  });

  it('the dice rolls through looks, then lands on one', () => {
    vi.useFakeTimers();
    render(<ProfileForm />);
    fireEvent.click(screen.getByLabelText('Randomize avatar'));
    act(() => void vi.advanceTimersByTime(150));
    expect(document.querySelector('.enter-roll')).not.toBeNull(); // rolling
    act(() => void vi.advanceTimersByTime(1000));
    expect(document.querySelector('.enter-roll')).toBeNull(); // landed
  });

  it('the name dice fills in a fun name', () => {
    render(<ProfileForm />);
    fireEvent.click(screen.getByLabelText('Random fun name'));
    expect(useStore.getState().profile.name).toMatch(/^\w+ \w+$/);
  });
});
