import { describe, expect, it } from 'vitest';
import { clearSession, getDeviceId, loadProfile, loadSession, saveProfile, saveSession } from './storage';

describe('storage', () => {
  it('gives a new visitor an empty name and a random valid avatar', () => {
    const p = loadProfile();
    expect(p.name).toBe('');
    expect(p.avatar.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('remembers the profile across visits (localStorage)', () => {
    saveProfile({ name: 'Alice', avatar: { color: '#000000', emoji: '😎' } });
    expect(loadProfile().name).toBe('Alice');
  });

  it('keeps the rejoin token per tab (sessionStorage) and per room', () => {
    saveSession('ROOM01', { playerId: 'p', token: 't' });
    expect(loadSession('ROOM01')).toEqual({ playerId: 'p', token: 't' });
    expect(localStorage.getItem('scribble:session:ROOM01')).toBeNull();
    expect(loadSession('OTHER1')).toBeNull();
    clearSession('ROOM01');
    expect(loadSession('ROOM01')).toBeNull();
  });

  it('gives each browser one stable device id (used only for bans)', () => {
    const id = getDeviceId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(getDeviceId()).toBe(id);
    expect(localStorage.getItem('scribble:device')).toBe(JSON.stringify(id));
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('scribble:profile', '{not json');
    expect(loadProfile().name).toBe('');
  });
});
