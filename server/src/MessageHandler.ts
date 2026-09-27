import type { Ack, Avatar, JoinResult, Point } from '../../shared/types';
import { MIN_PLAYERS } from './config';
import { Player } from './models/Player';
import type { Room } from './models/Room';
import type { RoomManager } from './RoomManager';
import type { IOSocket } from './types';
import { sanitizeAvatar, sanitizeName, sanitizeText } from './utils/sanitize';

/**
 * Translates socket events into Room / Game method calls.
 * This is the only place that trusts nothing: every payload is validated
 * and every action is checked against the sender's role (host / drawer).
 */
export class MessageHandler {
  constructor(private readonly rooms: RoomManager) {}

  attach(socket: IOSocket) {
    // ---------- room & lobby ----------
    socket.on('create_room', (p, ack) =>
      this.safe(socket, () => {
        const room = this.rooms.create({ ...p?.settings });
        this.join(socket, room, p?.hostName, p?.avatar, undefined, ack);
      }, ack),
    );

    socket.on('join_room', (p, ack) =>
      this.safe(socket, () => {
        const room = this.rooms.get(p?.roomId);
        if (!room) return reply(ack, 'Room not found. Check the code or link.');
        this.join(socket, room, p.playerName, p.avatar, p.token, ack, !!p.spectator);
      }, ack),
    );

    socket.on('quick_play', (p, ack) =>
      this.safe(socket, () => this.join(socket, this.rooms.findOrCreatePublic(), p?.playerName, p?.avatar, undefined, ack), ack),
    );

    socket.on('get_public_rooms', (ack) => typeof ack === 'function' && ack(this.rooms.listPublic()));

    socket.on('leave_room', () => this.safe(socket, () => this.leave(socket)));

    socket.on('update_settings', (settings) =>
      this.withHost(socket, (room) => {
        if (room.game.phase === 'lobby') room.updateSettings(settings ?? {});
      }),
    );

    socket.on('player_ready', (p) =>
      this.withPlayer(socket, (room, player) => {
        if (room.game.phase !== 'lobby' || player.isSpectator) return;
        player.isReady = !!p?.ready;
        room.broadcastRoomState();
      }),
    );

    socket.on('start_game', () =>
      this.withHost(socket, (room, host) => {
        if (room.game.phase !== 'lobby') return;
        const connected = room.connectedPlayers.filter((pl) => !pl.isSpectator);
        if (connected.length < MIN_PLAYERS) return this.error(socket, `Need at least ${MIN_PLAYERS} players to start.`);
        if (connected.some((pl) => pl.id !== host.id && !pl.isBot && !pl.isReady)) return this.error(socket, 'Waiting for everyone to be ready.');
        room.game.start();
      }),
    );

    socket.on('return_to_lobby', () =>
      this.withHost(socket, (room) => {
        if (room.game.phase === 'game_over') room.game.resetToLobby();
      }),
    );

    // ---------- game ----------
    socket.on('word_chosen', (p) => this.withPlayer(socket, (room, player) => room.game.chooseWord(player.id, String(p?.word))));

    socket.on('draw_start', (p) => this.withPlayer(socket, (room, player) => p && room.game.drawStart(player, p)));
    socket.on('draw_move', (p) =>
      this.withPlayer(socket, (room, player) => {
        if (!p) return;
        const points = Array.isArray(p.points) ? p.points : typeof p.x === 'number' && typeof p.y === 'number' ? [[p.x, p.y] as Point] : [];
        room.game.drawMove(player, p.strokeId ?? room.game.currentStrokeId() ?? '', points);
      }),
    );
    socket.on('draw_end', (p) => this.withPlayer(socket, (room, player) => room.game.drawEnd(player, String(p?.strokeId))));
    socket.on('draw_undo', () => this.withPlayer(socket, (room, player) => room.game.undo(player)));
    socket.on('canvas_clear', () => this.withPlayer(socket, (room, player) => room.game.clearCanvas(player)));

    // `guess` and `chat` share one pipeline so a chat message can never leak or bypass the word check.
    const onText = (p: { text: string }) =>
      this.withPlayer(socket, (room, player) => {
        const text = sanitizeText(p?.text);
        if (text) room.game.handleMessage(player, text);
      });
    socket.on('guess', onText);
    socket.on('chat', onText);

    // ---------- moderation ----------
    socket.on('kick_player', (p) =>
      this.withHost(socket, (room, host) => {
        if (p?.playerId && p.playerId !== host.id) room.removePlayer(p.playerId, 'kicked');
      }),
    );
    socket.on('report_player', (p) =>
      this.withPlayer(socket, (room, player) => room.reportPlayer(player, String(p?.playerId), sanitizeText(p?.reason, 200))),
    );
    socket.on('rate_drawing', (p) => this.withPlayer(socket, (room, player) => room.game.rateDrawing(player, !!p?.like)));
    socket.on('vote_kick', (p) => this.withPlayer(socket, (room, player) => room.voteKick(player, String(p?.playerId))));

    socket.on('disconnect', () => {
      const ctx = this.context(socket);
      if (ctx) ctx.room.handleDisconnect(ctx.player);
    });
  }

  private join(socket: IOSocket, room: Room, name: unknown, avatar: unknown, token: string | undefined, ack: Ack<JoinResult>, spectator = false) {
    if (typeof ack !== 'function') return;
    if (socket.data.roomId === room.id && socket.data.playerId && room.players.has(socket.data.playerId)) {
      const me = room.players.get(socket.data.playerId)!;
      return ack({ ok: true, roomId: room.id, playerId: me.id, token: me.token });
    }
    this.leave(socket);

    if (room.isBanned(token)) return reply(ack, 'You were kicked from this room.');

    // Reclaim a seat after refresh / network drop.
    const existing = room.findByToken(token);
    if (existing) {
      const oldSocketId = existing.socketId;
      socket.join(room.id);
      socket.data = { roomId: room.id, playerId: existing.id };
      ack({ ok: true, roomId: room.id, playerId: existing.id, token: existing.token });
      room.handleReconnect(existing, socket.id);
      // Same seat opened in a new tab: drop the old socket. Its disconnect is ignored
      // because the seat now points at the new socket (see `context`).
      if (oldSocketId && oldSocketId !== socket.id) socket.nsp.sockets.get(oldSocketId)?.disconnect(true);
      return;
    }

    if (!spectator && room.isFull && !room.evictBot()) return reply(ack, 'This room is full.');

    const player = new Player(sanitizeName(name), sanitizeAvatar(avatar as Avatar), socket.id, false, spectator);
    socket.join(room.id);
    socket.data = { roomId: room.id, playerId: player.id };
    ack({ ok: true, roomId: room.id, playerId: player.id, token: player.token });
    room.addPlayer(player);
  }

  private leave(socket: IOSocket) {
    const ctx = this.context(socket);
    socket.data = {};
    if (!ctx) return;
    socket.leave(ctx.room.id);
    ctx.room.removePlayer(ctx.player.id, 'left');
  }

  private context(socket: IOSocket): { room: Room; player: Player } | null {
    const room = this.rooms.get(socket.data.roomId);
    const player = room?.players.get(socket.data.playerId ?? '');
    // Ignore sockets that were replaced by a newer connection for the same seat.
    if (!room || !player || player.socketId !== socket.id) return null;
    return { room, player };
  }

  private withPlayer(socket: IOSocket, fn: (room: Room, player: Player) => unknown) {
    this.safe(socket, () => {
      const ctx = this.context(socket);
      if (ctx) fn(ctx.room, ctx.player);
    });
  }

  private withHost(socket: IOSocket, fn: (room: Room, host: Player) => unknown) {
    this.withPlayer(socket, (room, player) => {
      if (room.hostId !== player.id) return this.error(socket, 'Only the host can do that.');
      fn(room, player);
    });
  }

  private error(socket: IOSocket, message: string) {
    socket.emit('error_message', { message });
  }

  private safe(socket: IOSocket, fn: () => void, ack?: Ack<JoinResult>) {
    try {
      fn();
    } catch (err) {
      console.error('[socket error]', err);
      if (typeof ack === 'function') reply(ack, 'Something went wrong.');
      else this.error(socket, 'Something went wrong.');
    }
  }
}

function reply(ack: Ack<JoinResult>, error: string) {
  if (typeof ack === 'function') ack({ ok: false, error });
}
