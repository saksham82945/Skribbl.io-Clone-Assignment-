import { randomUUID } from 'node:crypto';
import type { Avatar, PlayerDTO } from '../shared/types';

export class Player {
  readonly id = randomUUID();
  /** Secret handed to this client only; lets it reclaim the seat after a refresh. */
  readonly token = randomUUID();
  socketId: string | null;
  connected = true;
  score = 0;
  isReady = false;
  hasGuessed = false;
  lastMessageAt = 0;
  disconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    public name: string,
    public avatar: Avatar,
    socketId: string | null,
    /** Server-controlled player: no socket, always connected and ready. */
    readonly isBot = false,
    /** Watching only: never draws or guesses, not on the leaderboard. */
    readonly isSpectator = false,
  ) {
    this.socketId = socketId;
    if (isBot) this.isReady = true;
  }

  attach(socketId: string) {
    this.socketId = socketId;
    this.connected = true;
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
  }

  detach() {
    this.socketId = null;
    this.connected = false;
  }

  toDTO(hostId: string, drawerId: string | null): PlayerDTO {
    return {
      id: this.id,
      name: this.name,
      avatar: this.avatar,
      score: this.score,
      isHost: this.id === hostId,
      isReady: this.isReady,
      hasGuessed: this.hasGuessed,
      isDrawing: this.id === drawerId,
      isConnected: this.connected,
      isSpectator: this.isSpectator,
    };
  }
}
