import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Same origin by default (Vite proxy in dev, Express serves the app in prod).
// Set VITE_SERVER_URL when the frontend is hosted separately (e.g. Vercel → Render).
const url = import.meta.env.VITE_SERVER_URL as string | undefined;

export const socket: ClientSocket = url ? io(url) : io();
