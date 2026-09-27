import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from './shared/types';

export interface SocketData {
  roomId?: string;
  playerId?: string;
}

export type IOServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type ServerEvent = keyof ServerToClientEvents;
export type ServerEventArgs<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>;
