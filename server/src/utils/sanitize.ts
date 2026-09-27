import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  DEFAULT_SETTINGS,
  LANGUAGES,
  SETTINGS_LIMITS,
  WORD_CATEGORIES,
  type Avatar,
  type Language,
  type RoomSettings,
  type WordCategory,
  type WordMode,
} from '../shared/types';

const HEX = /^#[0-9a-f]{6}$/i;

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function clampInt(value: unknown, fallback: number, { min, max }: { min: number; max: number }): number {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(Math.round(n), min, max) : fallback;
}

export function sanitizeName(name: unknown): string {
  const clean = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 20);
  return clean || `Player${Math.floor(Math.random() * 1000)}`;
}

export function sanitizeText(text: unknown, max = 100): string {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

export function sanitizeAvatar(avatar: unknown): Avatar {
  const a = (avatar ?? {}) as Partial<Avatar>;
  return {
    color: typeof a.color === 'string' && HEX.test(a.color) ? a.color : AVATAR_COLORS[0],
    emoji: typeof a.emoji === 'string' && AVATAR_EMOJIS.includes(a.emoji) ? a.emoji : AVATAR_EMOJIS[0],
  };
}

export function sanitizeColor(color: unknown): string {
  return typeof color === 'string' && HEX.test(color) ? color : '#000000';
}

export function parseCustomWords(input: unknown): string[] {
  const list = Array.isArray(input) ? input : String(input ?? '').split(',');
  const words = list
    .map((w) => sanitizeText(w, 32).toLowerCase().replace(/\s+/g, ' '))
    .filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, 500);
}

/** Merge a partial update into existing settings, clamping every value to the allowed range. */
export function sanitizeSettings(partial: Partial<RoomSettings> | undefined, base: RoomSettings = DEFAULT_SETTINGS): RoomSettings {
  const p = partial ?? {};
  const modes: WordMode[] = ['normal', 'hidden', 'combination'];
  return {
    maxPlayers: clampInt(p.maxPlayers ?? base.maxPlayers, base.maxPlayers, SETTINGS_LIMITS.maxPlayers),
    rounds: clampInt(p.rounds ?? base.rounds, base.rounds, SETTINGS_LIMITS.rounds),
    drawTime: clampInt(p.drawTime ?? base.drawTime, base.drawTime, SETTINGS_LIMITS.drawTime),
    wordCount: clampInt(p.wordCount ?? base.wordCount, base.wordCount, SETTINGS_LIMITS.wordCount),
    hints: clampInt(p.hints ?? base.hints, base.hints, SETTINGS_LIMITS.hints),
    wordMode: modes.includes(p.wordMode as WordMode) ? (p.wordMode as WordMode) : base.wordMode,
    category: WORD_CATEGORIES.includes(p.category as WordCategory) ? (p.category as WordCategory) : base.category,
    language: p.language !== undefined && p.language in LANGUAGES ? (p.language as Language) : base.language,
    customWords: p.customWords !== undefined ? parseCustomWords(p.customWords) : base.customWords,
    customWordsOnly: typeof p.customWordsOnly === 'boolean' ? p.customWordsOnly : base.customWordsOnly,
    isPrivate: typeof p.isPrivate === 'boolean' ? p.isPrivate : base.isPrivate,
  };
}
