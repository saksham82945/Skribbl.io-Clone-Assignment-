import { create } from 'zustand';

/** Client-side mute: hides chat from a player for you only (like skribbl's mute). */
interface MuteState {
  muted: Set<string>;
  toggle: (playerId: string) => void;
}

export const useMutes = create<MuteState>()((set) => ({
  muted: new Set(),
  toggle: (playerId) =>
    set((s) => {
      const muted = new Set(s.muted);
      if (muted.has(playerId)) muted.delete(playerId);
      else muted.add(playerId);
      return { muted };
    }),
}));
