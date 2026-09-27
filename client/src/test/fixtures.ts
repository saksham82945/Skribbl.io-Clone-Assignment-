import { DEFAULT_SETTINGS, type GameStateDTO, type PlayerDTO, type RoomStateDTO } from '../../../shared/types';
import { useStore } from '../lib/store';

export function player(id: string, extra: Partial<PlayerDTO> = {}): PlayerDTO {
  return {
    id,
    name: id.toUpperCase(),
    avatar: { color: '#f94144', emoji: '😀' },
    score: 0,
    isHost: false,
    isReady: false,
    hasGuessed: false,
    isDrawing: false,
    isConnected: true,
    isSpectator: false,
    ...extra,
  };
}

export function roomState(players: PlayerDTO[], extra: Partial<RoomStateDTO> = {}): RoomStateDTO {
  return { roomId: 'ABC123', hostId: players.find((p) => p.isHost)?.id ?? players[0].id, settings: { ...DEFAULT_SETTINGS }, players, ...extra };
}

export function gameState(extra: Partial<GameStateDTO> = {}): GameStateDTO {
  return { phase: 'lobby', round: 0, totalRounds: 3, drawerId: null, word: null, hints: null, timeLeftMs: null, drawTime: 80, ...extra };
}

/** Puts the store in a given room/game state as player `meId`. */
export function setScene(meId: string, room: RoomStateDTO, game: GameStateDTO) {
  useStore.setState({
    session: { roomId: room.roomId, playerId: meId, token: 't' },
    room,
    game,
    gameReceivedAt: Date.now(),
    messages: [],
    wordOptions: [],
    roundEnd: null,
    gameOver: null,
  });
}
