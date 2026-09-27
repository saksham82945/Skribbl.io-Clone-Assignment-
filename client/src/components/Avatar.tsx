import type { Avatar as AvatarT } from '../shared/types';

export function Avatar({ avatar, size = 40 }: { avatar: AvatarT; size?: number }) {
  return (
    <span className="avatar" style={{ background: avatar.color, width: size, height: size, fontSize: size * 0.6 }} aria-hidden>
      {avatar.emoji}
    </span>
  );
}
