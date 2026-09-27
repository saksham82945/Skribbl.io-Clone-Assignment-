import { describe, expect, it } from 'vitest';
import { AVATAR_ACCESSORIES, AVATAR_COLORS, AVATAR_EFFECTS, AVATAR_EMOJIS, AVATAR_PATTERNS } from '../shared/types';
import { accessoryOf, funName, normalizeAvatar, randomAvatar } from './avatar';

describe('avatar helpers', () => {
  it('upgrades a profile saved before patterns/hats/effects existed', () => {
    expect(normalizeAvatar({ color: '#f94144', emoji: '🐶' })).toEqual({ color: '#f94144', emoji: '🐶', pattern: 'solid', accessory: 'none', effect: 'none' });
  });

  it('replaces unknown values instead of trusting them', () => {
    const a = normalizeAvatar({ color: 'nope', emoji: 'x', pattern: 'weird' as never });
    expect(AVATAR_COLORS).toContain(a.color);
    expect(AVATAR_EMOJIS).toContain(a.emoji);
    expect(a.pattern).toBe('solid');
  });

  it('random avatars only use published options', () => {
    for (let i = 0; i < 50; i++) {
      const a = randomAvatar();
      expect(AVATAR_EMOJIS).toContain(a.emoji);
      expect(AVATAR_COLORS).toContain(a.color);
      expect(AVATAR_PATTERNS.map((p) => p.id)).toContain(a.pattern);
      expect(AVATAR_ACCESSORIES.map((x) => x.id)).toContain(a.accessory);
      expect(AVATAR_EFFECTS.map((x) => x.id)).toContain(a.effect);
    }
  });

  it('fun names always fit the 20-character limit', () => {
    for (let i = 0; i < 100; i++) expect(funName().length).toBeLessThanOrEqual(20);
  });

  it('looks up hats, defaulting to none', () => {
    expect(accessoryOf('crown').emoji).toBe('👑');
    expect(accessoryOf(undefined).id).toBe('none');
  });
});
