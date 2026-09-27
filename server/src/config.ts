export interface GameTiming {
  /** how long the drawer has to pick a word before one is picked for them */
  chooseTimeMs: number;
  /** pause on the "the word was..." screen between turns */
  turnEndDelayMs: number;
  /** how long a disconnected player keeps their seat */
  reconnectGraceMs: number;
  /** minimum gap between two chat messages from the same player */
  chatCooldownMs: number;
  /** results screen before the room goes back to the lobby */
  gameOverDelayMs: number;
  /** public rooms start by themselves this long after 2+ players are present */
  autoStartDelayMs: number;
  /** multiplier for every bot delay (tests use a small value) */
  botSpeed: number;
  /** average gap between automatic players joining an under-filled room */
  botJoinDelayMs: number;
  /** rooms are topped up to this many players with automatic players (0 = off) */
  targetPlayers: number;
}

export const DEFAULT_TIMING: GameTiming = {
  chooseTimeMs: 15_000,
  turnEndDelayMs: 5_000,
  reconnectGraceMs: 30_000,
  chatCooldownMs: 250,
  gameOverDelayMs: 12_000,
  autoStartDelayMs: 4_000,
  botSpeed: 1,
  botJoinDelayMs: 1_500,
  // One person can always play a full 4-player game; real players replace automatic ones.
  targetPlayers: 4,
};

export const MAX_STROKES = 3_000;
export const MAX_POINTS_PER_STROKE = 5_000;
export const MAX_POINTS_PER_MOVE = 200;
export const MIN_PLAYERS = 2;
