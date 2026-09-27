import type { CSSProperties } from 'react';
import { accessoryOf } from '../lib/avatar';
import type { Avatar as AvatarT } from '../shared/types';

interface Props {
  avatar: AvatarT;
  size?: number;
  /** Play the avatar's idle effect (picker, lobby, podium). Off in busy places like the in-game list. */
  animated?: boolean;
  className?: string;
}

export function Avatar({ avatar, size = 40, animated = false, className = '' }: Props) {
  const accessory = accessoryOf(avatar.accessory);
  const effect = animated ? (avatar.effect ?? 'none') : 'none';
  const style = { '--c': avatar.color, width: size, height: size, fontSize: size * 0.6 } as CSSProperties;

  return (
    <span className={`avatar pattern-${avatar.pattern ?? 'solid'} effect-${effect} ${className}`} style={style} aria-hidden>
      <span className="avatar-face">{avatar.emoji}</span>
      {accessory.emoji && <span className={`avatar-acc acc-${accessory.slot}`}>{accessory.emoji}</span>}
    </span>
  );
}
