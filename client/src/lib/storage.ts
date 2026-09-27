import { AVATAR_COLORS, AVATAR_EMOJIS, type Avatar } from '../shared/types';

export interface Profile {
  name: string;
  avatar: Avatar;
}

const PROFILE_KEY = 'scribble:profile';
const sessionKey = (roomId: string) => `scribble:session:${roomId}`;

// Storage can throw in private windows / blocked cookies; everything here is best-effort.
function read<T>(key: string, store: () => Storage = () => localStorage): T | null {
  try {
    const raw = store().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown, store: () => Storage = () => localStorage) {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

export function loadProfile(): Profile {
  return read<Profile>(PROFILE_KEY) ?? { name: '', avatar: { color: pick(AVATAR_COLORS), emoji: pick(AVATAR_EMOJIS) } };
}

export const saveProfile = (p: Profile) => write(PROFILE_KEY, p);

const DEVICE_KEY = 'scribble:device';
let memoryDeviceId: string | null = null;

/**
 * A random id for this browser, kept across visits. The server uses it only so a
 * host's "ban" also covers new tabs; it identifies nothing about the person.
 */
export function getDeviceId(): string {
  const saved = read<string>(DEVICE_KEY) ?? memoryDeviceId;
  if (saved) return saved;
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else bytes.forEach((_, i) => (bytes[i] = Math.floor(Math.random() * 256)));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  memoryDeviceId = id;
  write(DEVICE_KEY, id);
  return id;
}

export interface SavedSession {
  playerId: string;
  token: string;
}

// Per-tab (sessionStorage): survives a refresh, but a second tab gets its own seat.
const tab = () => sessionStorage;
export const loadSession = (roomId: string) => read<SavedSession>(sessionKey(roomId), tab);
export const saveSession = (roomId: string, s: SavedSession) => write(sessionKey(roomId), s, tab);
export const clearSession = (roomId: string) => write(sessionKey(roomId), null, tab);
