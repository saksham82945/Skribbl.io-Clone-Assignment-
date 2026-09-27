/**
 * Types and constants shared by the client and the server: the Socket.IO event
 * contract and every payload shape.
 *
 * There are two identical copies, server/src/shared/types.ts and
 * client/src/shared/types.ts, so each folder is self-contained and can be
 * deployed on its own. Edit one, then copy it over the other;
 * server/tests/sharedTypes.test.ts fails if they ever differ.
 */

export type Phase = 'lobby' | 'choosing' | 'drawing' | 'turn_end' | 'game_over';
export type WordMode = 'normal' | 'hidden' | 'combination';
export type Tool = 'brush' | 'eraser' | 'fill';

export interface Avatar {
  color: string;
  emoji: string;
}

export const AVATAR_EMOJIS = ['😀', '😎', '🤓', '🥳', '😺', '🐶', '🦊', '🐼', '🐸', '🐵', '🦄', '🐙', '👻', '🤖', '👽', '🎃'];
export const AVATAR_COLORS = ['#f94144', '#f3722c', '#f9c74f', '#90be6d', '#43aa8b', '#4d908e', '#577590', '#277da1', '#9b5de5', '#f15bb5'];

export interface RoomSettings {
  maxPlayers: number;
  rounds: number;
  /** seconds */
  drawTime: number;
  /** number of words the drawer can choose from */
  wordCount: number;
  /** number of letters revealed over time (0 = disabled) */
  hints: number;
  wordMode: WordMode;
  category: WordCategory;
  language: Language;
  customWords: string[];
  customWordsOnly: boolean;
  isPrivate: boolean;
}

export const WORD_CATEGORIES = ['all', 'animals', 'food', 'objects', 'actions', 'places', 'nature'] as const;
export type WordCategory = (typeof WORD_CATEGORIES)[number];

export const LANGUAGES = { en: 'English', es: 'Español', de: 'Deutsch', hi: 'Hinglish' } as const;
export type Language = keyof typeof LANGUAGES;

export const SETTINGS_LIMITS = {
  maxPlayers: { min: 2, max: 20 },
  rounds: { min: 2, max: 10 },
  drawTime: { min: 15, max: 240 },
  wordCount: { min: 1, max: 5 },
  hints: { min: 0, max: 5 },
} as const;

export const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordCount: 3,
  hints: 2,
  wordMode: 'normal',
  category: 'all',
  language: 'en',
  customWords: [],
  customWordsOnly: false,
  isPrivate: true,
};

export interface PlayerDTO {
  id: string;
  name: string;
  avatar: Avatar;
  score: number;
  isHost: boolean;
  isReady: boolean;
  hasGuessed: boolean;
  isDrawing: boolean;
  isConnected: boolean;
  /** Watching only: never draws, can't guess, not on the leaderboard. */
  isSpectator: boolean;
}

export interface RoomStateDTO {
  roomId: string;
  hostId: string;
  settings: RoomSettings;
  players: PlayerDTO[];
}

/** Personalised per player: `word` is only filled for the drawer / players who guessed it / after the turn. */
export interface GameStateDTO {
  phase: Phase;
  round: number;
  totalRounds: number;
  drawerId: string | null;
  word: string | null;
  /** Masked word with revealed hint letters e.g. "_ a _" (letters as '_', spaces kept). null in hidden mode or when no word yet. */
  hints: string | null;
  /** ms left in the current phase (choosing / drawing / turn_end / game_over→lobby); null otherwise */
  timeLeftMs: number | null;
  drawTime: number;
}

/** Points are normalised to 0..1 so the drawing looks the same on any canvas size. */
export type Point = [number, number];

export interface Stroke {
  id: string;
  tool: Tool;
  color: string;
  /** line width in pixels of the 800x600 virtual canvas */
  size: number;
  points: Point[];
}

export type DrawEvent =
  | { type: 'start'; stroke: Stroke }
  | { type: 'move'; strokeId: string; points: Point[] }
  | { type: 'end'; strokeId: string };

export type ChatKind = 'chat' | 'guessed' | 'system' | 'correct' | 'close' | 'warning' | 'join' | 'leave' | 'like' | 'dislike' | 'report';

export interface ChatMessage {
  id: string;
  kind: ChatKind;
  playerId?: string;
  playerName?: string;
  text: string;
}

export interface TurnScore {
  playerId: string;
  name: string;
  gained: number;
  total: number;
}

export type TurnEndReason = 'time_up' | 'all_guessed' | 'drawer_left';

export interface RoundStartPayload {
  drawerId: string;
  /** Only filled for the drawer. */
  wordOptions: string[];
  drawTime: number;
  round: number;
  choiceTimeMs: number;
}

export interface RoundEndPayload {
  word: string | null;
  reason: TurnEndReason;
  scores: TurnScore[];
  nextDrawer: string | null;
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  avatar: Avatar;
  score: number;
  rank: number;
}

export interface GameOverPayload {
  /** Top of the leaderboard (first of `winners` when tied). */
  winner: LeaderboardEntry | null;
  /** Everyone sharing the top score. */
  winners: LeaderboardEntry[];
  leaderboard: LeaderboardEntry[];
}

export interface GuessResultPayload {
  correct: boolean;
  playerId: string;
  playerName: string;
  points: number;
}

export interface PublicRoomInfo {
  roomId: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  phase: Phase;
}

export interface JoinResult {
  roomId: string;
  playerId: string;
  /** secret used to reclaim the seat after a refresh / reconnect */
  token: string;
}

export type AckResult<T> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T> = (res: AckResult<T>) => void;

export interface ClientToServerEvents {
  /** `deviceId`: stable random id per browser, so a host's ban also covers new tabs. */
  create_room: (p: { hostName: string; avatar: Avatar; settings?: Partial<RoomSettings>; deviceId?: string }, ack: Ack<JoinResult>) => void;
  join_room: (p: { roomId: string; playerName: string; avatar: Avatar; token?: string; spectator?: boolean; deviceId?: string }, ack: Ack<JoinResult>) => void;
  quick_play: (p: { playerName: string; avatar: Avatar; deviceId?: string }, ack: Ack<JoinResult>) => void;
  get_public_rooms: (ack: (rooms: PublicRoomInfo[]) => void) => void;
  leave_room: () => void;
  update_settings: (settings: Partial<RoomSettings>) => void;
  player_ready: (p: { ready: boolean }) => void;
  start_game: () => void;
  return_to_lobby: () => void;
  word_chosen: (p: { word: string }) => void;
  draw_start: (p: { strokeId: string; x: number; y: number; color: string; size: number; tool: Tool }) => void;
  /** Batched `{ strokeId, points }` (what our client sends) or the single-point `{ x, y }` form from the spec. */
  draw_move: (p: { strokeId?: string; points?: Point[]; x?: number; y?: number }) => void;
  draw_end: (p: { strokeId: string }) => void;
  canvas_clear: () => void;
  draw_undo: () => void;
  guess: (p: { text: string }) => void;
  chat: (p: { text: string }) => void;
  /** Host only. `ban: true` also blocks that browser (and its seat token) from rejoining this room. */
  kick_player: (p: { playerId: string; ban?: boolean }) => void;
  report_player: (p: { playerId: string; reason?: string }) => void;
  rate_drawing: (p: { like: boolean }) => void;
  vote_kick: (p: { playerId: string }) => void;
}

export interface ServerToClientEvents {
  room_state: (state: RoomStateDTO) => void;
  game_state: (state: GameStateDTO) => void;
  player_joined: (p: { player: PlayerDTO; players: PlayerDTO[] }) => void;
  player_left: (p: { playerId: string; players: PlayerDTO[] }) => void;
  round_start: (p: RoundStartPayload) => void;
  round_end: (p: RoundEndPayload) => void;
  game_over: (p: GameOverPayload) => void;
  draw_data: (e: DrawEvent) => void;
  canvas_state: (p: { strokes: Stroke[] }) => void;
  canvas_clear: () => void;
  draw_undo: (p: { strokeId: string }) => void;
  guess_result: (p: GuessResultPayload) => void;
  chat_message: (m: ChatMessage) => void;
  kicked: (p: { reason: string }) => void;
  error_message: (p: { message: string }) => void;
}
