import { useEffect, useRef, useState } from 'react';
import { funName, normalizeAvatar, randomAvatar } from '../lib/avatar';
import { setProfile, useStore } from '../lib/store';
import {
  AVATAR_ACCESSORIES,
  AVATAR_COLORS,
  AVATAR_EFFECTS,
  AVATAR_EMOJI_GROUPS,
  AVATAR_EMOJIS,
  AVATAR_PATTERNS,
  type Avatar as AvatarT,
} from '../shared/types';
import { Avatar } from './Avatar';

const cycle = <T,>(arr: readonly T[], current: T, dir: number) => arr[(arr.indexOf(current) + dir + arr.length) % arr.length];

const TABS = ['Face', 'Color', 'Pattern', 'Hat', 'Effect'] as const;
type Tab = (typeof TABS)[number];

/**
 * Name + avatar customiser. skribbl.io-style arrows for quick changes, plus tabs
 * for every option. Saved to localStorage so returning players keep their look.
 */
export function ProfileForm({ onSubmit }: { onSubmit?: () => void }) {
  const profile = useStore((s) => s.profile);
  const avatar = normalizeAvatar(profile.avatar);
  const [tab, setTab] = useState<Tab>('Face');
  const [dir, setDir] = useState<'next' | 'prev' | 'pop'>('pop');
  const [preview, setPreview] = useState<AvatarT | null>(null); // shown while the dice "rolls"
  const [boops, setBoops] = useState<number[]>([]);
  const rollTimer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => () => clearInterval(rollTimer.current), []);

  const update = (patch: Partial<AvatarT>, direction: 'next' | 'prev' | 'pop' = 'pop') => {
    setDir(direction);
    setProfile({ ...profile, avatar: { ...avatar, ...patch } });
  };

  const stepFace = (d: number) => update({ emoji: cycle(AVATAR_EMOJIS, avatar.emoji, d) }, d > 0 ? 'next' : 'prev');
  const stepColor = (d: number) => update({ color: cycle(AVATAR_COLORS, avatar.color, d) });

  /** Slot-machine roll: flick through random looks, then land on one. */
  const roll = () => {
    if (rollTimer.current) return;
    let ticks = 0;
    rollTimer.current = setInterval(() => {
      ticks++;
      if (ticks < 9) return setPreview(randomAvatar());
      clearInterval(rollTimer.current);
      rollTimer.current = undefined;
      setPreview(null);
      update(randomAvatar());
    }, 70);
  };

  const boop = () => {
    const id = Date.now();
    setBoops((b) => [...b, id]);
    setTimeout(() => setBoops((b) => b.filter((x) => x !== id)), 700);
  };

  const shown = preview ?? avatar;

  return (
    <div className="profile-form">
      <div className="name-row">
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
        <button className="name-dice" title="Random fun name" aria-label="Random fun name" onClick={() => setProfile({ ...profile, name: funName() })}>
          🎲
        </button>
      </div>

      <div className="avatar-picker">
        <div className="picker-col">
          <button className="arrow" aria-label="Previous face" onClick={() => stepFace(-1)}>‹</button>
          <button className="arrow" aria-label="Previous color" onClick={() => stepColor(-1)}>‹</button>
        </div>

        <button className={`avatar-stage ${boops.length ? 'booped' : ''}`} onClick={boop} title="Boop!" aria-label="Your avatar (click me)">
          <span className="stage-glow" style={{ background: shown.color }} />
          {/* The wrapper plays the entry animation; the avatar inside keeps its own idle effect. */}
          <span key={preview ? 'roll' : `${shown.emoji}-${dir}`} className={`enter-wrap enter-${preview ? 'roll' : dir}`}>
            <Avatar avatar={shown} size={92} animated />
          </span>
          {boops.map((id) => (
            <span key={id} className="boop-burst" aria-hidden>
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className="spark" style={{ ['--a' as string]: `${i * 45}deg` }}>
                  ✦
                </span>
              ))}
            </span>
          ))}
        </button>

        <div className="picker-col">
          <button className="arrow" aria-label="Next face" onClick={() => stepFace(1)}>›</button>
          <button className="arrow" aria-label="Next color" onClick={() => stepColor(1)}>›</button>
        </div>
        <button className={`dice ${preview ? 'spinning' : ''}`} title="Surprise me!" aria-label="Randomize avatar" onClick={roll}>
          🎲
        </button>
      </div>

      <div className="avatar-tabs" role="tablist" aria-label="Customise your avatar">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`avatar-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="avatar-options" role="tabpanel" aria-label={`${tab} options`}>
        {tab === 'Face' &&
          AVATAR_EMOJI_GROUPS.map((g) => (
            <div key={g.label} className="option-group">
              <span className="option-group-label">{g.label}</span>
              <div className="option-grid">
                {g.emojis.map((e) => (
                  <button key={e} className={`opt opt-emoji ${avatar.emoji === e ? 'selected' : ''}`} aria-label={`Face ${e}`} onClick={() => update({ emoji: e })}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}

        {tab === 'Color' && (
          <div className="option-grid colors">
            {AVATAR_COLORS.map((c) => (
              <button key={c} className={`opt opt-color ${avatar.color === c ? 'selected' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => update({ color: c })} />
            ))}
          </div>
        )}

        {tab === 'Pattern' && (
          <div className="option-grid labelled">
            {AVATAR_PATTERNS.map((p) => (
              <button key={p.id} className={`opt opt-labelled ${avatar.pattern === p.id ? 'selected' : ''}`} aria-label={`Pattern ${p.label}`} onClick={() => update({ pattern: p.id })}>
                <Avatar avatar={{ ...avatar, pattern: p.id, accessory: 'none' }} size={34} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'Hat' && (
          <div className="option-grid labelled">
            {AVATAR_ACCESSORIES.map((a) => (
              <button key={a.id} className={`opt opt-labelled ${avatar.accessory === a.id ? 'selected' : ''}`} aria-label={`Hat ${a.label}`} onClick={() => update({ accessory: a.id })}>
                <Avatar avatar={{ ...avatar, accessory: a.id }} size={34} />
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'Effect' && (
          <div className="option-grid labelled">
            {AVATAR_EFFECTS.map((f) => (
              <button key={f.id} className={`opt opt-labelled ${avatar.effect === f.id ? 'selected' : ''}`} aria-label={`Effect ${f.label}`} onClick={() => update({ effect: f.id })}>
                <Avatar avatar={{ ...avatar, effect: f.id, accessory: 'none' }} size={34} animated />
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="picker-hint">Arrows: face / colour · click the avatar · 🎲 surprise me</p>
    </div>
  );
}
