import { create } from 'zustand';
import type {
  AckResult,
  ChatMessage,
  GameOverPayload,
  GameStateDTO,
  JoinResult,
  RoomSettings,
  RoomStateDTO,
  RoundEndPayload,
} from '../shared/types';
import { canvasModel } from './canvasModel';
import { socket } from './socket';
import { saveLastDrawing } from './replay';
import { sounds } from './sound';
import { clearSession, getDeviceId, loadProfile, saveProfile, saveSession, type Profile } from './storage';

interface State {
  profile: Profile;
  connected: boolean;
  session: JoinResult | null;
  room: RoomStateDTO | null;
  game: GameStateDTO | null;
  /** local time the last game_state arrived — the countdown is relative to this */
  gameReceivedAt: number;
  messages: ChatMessage[];
  wordOptions: string[];
  roundEnd: RoundEndPayload | null;
  gameOver: GameOverPayload | null;
  toast: string | null;
  kicked: boolean;
  /** "Round N" banner shown over the board when a new round begins */
  roundBanner: number | null;
}

const initialRoomState = {
  session: null,
  room: null,
  game: null,
  gameReceivedAt: 0,
  messages: [],
  wordOptions: [],
  roundEnd: null,
  gameOver: null,
};

export const useStore = create<State>()(() => ({
  profile: loadProfile(),
  connected: socket.connected,
  toast: null,
  kicked: false,
  roundBanner: null,
  ...initialRoomState,
}));

const set = useStore.setState;
const get = useStore.getState;

export function setProfile(profile: Profile) {
  saveProfile(profile);
  set({ profile });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string) {
  clearTimeout(toastTimer);
  set({ toast: message });
  toastTimer = setTimeout(() => set({ toast: null }), 3500);
}

// ---------- actions ----------

function onJoined(res: AckResult<JoinResult>) {
  if (!res.ok) return;
  saveSession(res.roomId, { playerId: res.playerId, token: res.token });
  const sameRoom = get().session?.roomId === res.roomId;
  if (!sameRoom) canvasModel.clear();
  set((s) => ({
    ...initialRoomState,
    // Keep chat history when we're only reclaiming our seat after a reconnect.
    messages: sameRoom ? s.messages : [],
    session: { roomId: res.roomId, playerId: res.playerId, token: res.token },
    kicked: false,
  }));
}

// Callback-style acks so state is reset *before* the room_state that follows the ack is handled.
export function createRoom(settings?: Partial<RoomSettings>) {
  const { profile } = get();
  return new Promise<AckResult<JoinResult>>((resolve) =>
    socket.emit('create_room', { hostName: profile.name, avatar: profile.avatar, settings, deviceId: getDeviceId() }, (res) => {
      onJoined(res);
      resolve(res);
    }),
  );
}

export function joinRoom(roomId: string, token?: string, spectator = false) {
  const { profile } = get();
  return new Promise<AckResult<JoinResult>>((resolve) =>
    socket.emit('join_room', { roomId, playerName: profile.name, avatar: profile.avatar, token, spectator, deviceId: getDeviceId() }, (res) => {
      onJoined(res);
      resolve(res);
    }),
  );
}

export function quickPlay() {
  const { profile } = get();
  return new Promise<AckResult<JoinResult>>((resolve) =>
    socket.emit('quick_play', { playerName: profile.name, avatar: profile.avatar, deviceId: getDeviceId() }, (res) => {
      onJoined(res);
      resolve(res);
    }),
  );
}

export function leaveRoom() {
  const { session } = get();
  socket.emit('leave_room');
  if (session) clearSession(session.roomId);
  canvasModel.clear();
  set({ ...initialRoomState });
}

// ---------- socket → store ----------

let bound = false;
export function bindSocket() {
  if (bound) return;
  bound = true;

  socket.on('connect', () => {
    set({ connected: true });
    // Network blip: the server saw our old socket drop, so reclaim the seat.
    const { session } = get();
    if (session) joinRoom(session.roomId, session.token);
  });
  socket.on('disconnect', () => set({ connected: false }));

  socket.on('room_state', (room) => set({ room }));
  socket.on('game_state', (game) =>
    set((s) => ({
      game,
      gameReceivedAt: Date.now(),
      wordOptions: game.phase === 'choosing' ? s.wordOptions : [],
      roundEnd: game.phase === 'turn_end' ? s.roundEnd : null,
      gameOver: game.phase === 'game_over' ? s.gameOver : null,
    })),
  );
  let lastRound = 0;
  let bannerTimer: ReturnType<typeof setTimeout> | undefined;
  socket.on('round_start', (p) => {
    set({ wordOptions: p.wordOptions, roundEnd: null });
    sounds.turnStart();
    if (p.round !== lastRound) {
      lastRound = p.round;
      clearTimeout(bannerTimer);
      set({ roundBanner: p.round });
      bannerTimer = setTimeout(() => set({ roundBanner: null }), 1800);
    }
  });
  socket.on('round_end', (roundEnd) => {
    const { room, game } = get();
    saveLastDrawing(roundEnd.word, room?.players.find((p) => p.id === game?.drawerId)?.name ?? null);
    set({ roundEnd, wordOptions: [] });
    sounds.turnEnd();
  });
  socket.on('game_over', (gameOver) => {
    lastRound = 0;
    set({ gameOver });
    sounds.gameOver();
  });
  socket.on('guess_result', (g) => g.correct && sounds.correct());
  socket.on('chat_message', (m) => {
    if (m.kind === 'join') sounds.join();
    else if (m.kind === 'leave') sounds.leave();
    set((s) => ({ messages: [...s.messages.slice(-199), m] }));
  });
  socket.on('error_message', ({ message }) => showToast(message));
  socket.on('kicked', ({ reason }) => {
    const { session } = get();
    if (session) clearSession(session.roomId);
    set({ ...initialRoomState, kicked: true });
    showToast(reason);
  });

  socket.on('canvas_state', ({ strokes }) => canvasModel.setAll(strokes));
  socket.on('canvas_clear', () => canvasModel.clear());
  socket.on('draw_undo', ({ strokeId }) => canvasModel.remove(strokeId));
  socket.on('draw_data', (e) => {
    // The server echoes the drawer's own strokes back (spec); they're already on screen.
    const id = e.type === 'start' ? e.stroke.id : e.strokeId;
    if (canvasModel.isLocal(id)) return;
    if (e.type === 'start') canvasModel.start(e.stroke);
    else if (e.type === 'move') canvasModel.append(e.strokeId, e.points);
  });
}

// ---------- selectors ----------

export function useMe() {
  return useStore((s) => s.room?.players.find((p) => p.id === s.session?.playerId) ?? null);
}
