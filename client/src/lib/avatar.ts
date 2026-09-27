import {
  AVATAR_ACCESSORIES,
  AVATAR_COLORS,
  AVATAR_EFFECTS,
  AVATAR_EMOJIS,
  AVATAR_PATTERNS,
  type Avatar,
  type AvatarAccessory,
} from '../shared/types';

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
const HEX = /^#[0-9a-f]{6}$/i;

/** Fills in missing fields (older saved profiles only had colour + emoji) and drops unknown values. */
export function normalizeAvatar(a: Partial<Avatar> | null | undefined): Avatar {
  const oneOf = <T extends string>(v: unknown, list: readonly { id: T }[], fallback: T): T =>
    list.some((o) => o.id === v) ? (v as T) : fallback;
  return {
    color: typeof a?.color === 'string' && HEX.test(a.color) ? a.color : pick(AVATAR_COLORS),
    emoji: typeof a?.emoji === 'string' && AVATAR_EMOJIS.includes(a.emoji) ? a.emoji : pick(AVATAR_EMOJIS),
    pattern: oneOf(a?.pattern, AVATAR_PATTERNS, 'solid'),
    accessory: oneOf(a?.accessory, AVATAR_ACCESSORIES, 'none'),
    effect: oneOf(a?.effect, AVATAR_EFFECTS, 'none'),
  };
}

export function randomAvatar(): Avatar {
  return {
    emoji: pick(AVATAR_EMOJIS),
    color: pick(AVATAR_COLORS),
    pattern: pick(AVATAR_PATTERNS).id,
    accessory: pick(AVATAR_ACCESSORIES).id,
    effect: pick(AVATAR_EFFECTS).id,
  };
}

export function accessoryOf(id: AvatarAccessory | undefined) {
  return AVATAR_ACCESSORIES.find((a) => a.id === id) ?? AVATAR_ACCESSORIES[0];
}

const ADJECTIVES = ['Sneaky', 'Happy', 'Turbo', 'Sleepy', 'Mighty', 'Fuzzy', 'Cosmic', 'Wobbly', 'Sparkly', 'Grumpy', 'Jolly', 'Ninja', 'Speedy', 'Brave', 'Silly', 'Lucky'];
const NOUNS = ['Panda', 'Pickle', 'Doodle', 'Taco', 'Rocket', 'Muffin', 'Otter', 'Pixel', 'Wizard', 'Noodle', 'Koala', 'Waffle', 'Dragon', 'Sprout', 'Comet', 'Penguin'];

/** e.g. "Sneaky Panda" — always fits the 20-character name limit. */
export function funName(): string {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}
