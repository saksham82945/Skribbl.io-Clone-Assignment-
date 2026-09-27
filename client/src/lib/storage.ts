import { AVATAR_COLORS, AVATAR_EMOJIS, type Avatar } from '../../../shared/types';

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

export interface SavedSession {
  playerId: string;
  token: string;
}

// Per-tab (sessionStorage): survives a refresh, but a second tab gets its own seat.
const tab = () => sessionStorage;
export const loadSession = (roomId: string) => read<SavedSession>(sessionKey(roomId), tab);
export const saveSession = (roomId: string, s: SavedSession) => write(sessionKey(roomId), s, tab);
export const clearSession = (roomId: string) => write(sessionKey(roomId), null, tab);
