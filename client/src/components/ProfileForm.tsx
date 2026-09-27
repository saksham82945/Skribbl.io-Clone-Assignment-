import { AVATAR_COLORS, AVATAR_EMOJIS } from '../shared/types';
import { setProfile, useStore } from '../lib/store';
import { Avatar } from './Avatar';

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
const cycle = <T,>(arr: readonly T[], current: T, dir: number) => arr[(arr.indexOf(current) + dir + arr.length) % arr.length];

/** Name input + avatar picker. Saved to localStorage so returning players keep their identity. */
export function ProfileForm({ onSubmit }: { onSubmit?: () => void }) {
  const profile = useStore((s) => s.profile);
  const { avatar } = profile;

  return (
    <div className="profile-form">
      <input
        className="input name-input"
        placeholder="Enter your name"
        maxLength={20}
        value={profile.name}
        autoFocus
        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
        aria-label="Your name"
      />
      <div className="avatar-picker">
        <div className="picker-col">
          <button className="arrow" aria-label="Previous face" onClick={() => setProfile({ ...profile, avatar: { ...avatar, emoji: cycle(AVATAR_EMOJIS, avatar.emoji, -1) } })}>‹</button>
          <button className="arrow" aria-label="Previous color" onClick={() => setProfile({ ...profile, avatar: { ...avatar, color: cycle(AVATAR_COLORS, avatar.color, -1) } })}>‹</button>
        </div>
        <div className="avatar-stage">
          <Avatar avatar={avatar} size={88} />
          <button
            className="dice"
            title="Randomize avatar"
            aria-label="Randomize avatar"
            onClick={() => setProfile({ ...profile, avatar: { emoji: pick(AVATAR_EMOJIS), color: pick(AVATAR_COLORS) } })}
          >
            🎲
          </button>
        </div>
        <div className="picker-col">
          <button className="arrow" aria-label="Next face" onClick={() => setProfile({ ...profile, avatar: { ...avatar, emoji: cycle(AVATAR_EMOJIS, avatar.emoji, 1) } })}>›</button>
          <button className="arrow" aria-label="Next color" onClick={() => setProfile({ ...profile, avatar: { ...avatar, color: cycle(AVATAR_COLORS, avatar.color, 1) } })}>›</button>
        </div>
      </div>
      <p className="picker-hint">top arrows: face · bottom arrows: color</p>
    </div>
  );
}
