import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { DEFAULT_TIMING, type GameTiming } from './config';
import { MessageHandler } from './MessageHandler';
import { RoomManager } from './RoomManager';
import type { IOServer } from './types';

export function createApp(timing: Partial<GameTiming> = {}) {
  const app = express();
  const httpServer = createServer(app);

  // Only needed when the client is hosted on a different origin (e.g. Vercel + Render).
  const origins = process.env.CLIENT_ORIGIN?.split(',').map((s) => s.trim());
  const io: IOServer = new Server(httpServer, {
    cors: origins ? { origin: origins } : undefined,
    maxHttpBufferSize: 1e5,
  });

  const rooms = new RoomManager(io, { ...DEFAULT_TIMING, ...timing });
  const handler = new MessageHandler(rooms);
  io.on('connection', (socket) => handler.attach(socket));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, sockets: io.engine.clientsCount });
  });

  // In production the server also serves the built React app (single deploy, same origin).
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  return { app, httpServer, io, rooms };
}
