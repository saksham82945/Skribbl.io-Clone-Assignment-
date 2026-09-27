import { randomUUID } from 'node:crypto';
import type { ChatKind, ChatMessage, PublicRoomInfo, RoomSettings, RoomStateDTO } from '../shared/types';
import { BotController } from '../bots/BotController';
import type { GameTiming } from '../config';
import type { IOServer, ServerEvent, ServerEventArgs } from '../types';
import { sanitizeSettings } from '../utils/sanitize';
import type { WordBank } from '../words/WordBank';
import { Game } from './Game';
import type { Player } from './Player';

export type RemoveReason = 'left' | 'kicked' | 'banned' | 'timeout';

/**
 * A Room owns its players and settings, and knows how to talk to them.
 * All game rules live in `Game`; the Room is the transport + membership layer.
 */
export class Room {
  readonly players = new Map<string, Player>();
  readonly game: Game;
  readonly bots: BotController;
  hostId = '';
  settings: RoomSettings;
  /** tokens of kicked players, so a stale tab can't silently rejoin */
  private readonly bannedTokens = new Set<string>();
  /** browsers banned by the host: they can't rejoin this room, even from a new tab */
  private readonly bannedDevices = new Set<string>();
  /** targetId -> ids of players voting to kick them */
  private readonly kickVotes = new Map<string, Set<string>>();
  /** targetId -> ids of players who reported them */
  private readonly reports = new Map<string, Set<string>>();
  private autoStartTimer: NodeJS.Timeout | null = null;
  private botFillTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly id: string,
    private readonly io: IOServer,
    settings: Partial<RoomSettings> | undefined,
    words: WordBank,
    readonly timing: GameTiming,
    private readonly onEmpty: (room: Room) => void,
  ) {
    this.settings = sanitizeSettings(settings);
    this.bots = new BotController(this, timing.botSpeed);
    this.game = new Game(this, words, timing);
  }

  // ---------- membership ----------

  get connectedPlayers(): Player[] {
    return [...this.players.values()].filter((p) => p.connected);
  }

  /** Real people (connected or within their reconnect grace period), spectators included. */
  get humans(): Player[] {
    return [...this.players.values()].filter((p) => !p.isBot);
  }

  /** Everyone who actually plays (no spectators). */
  get activePlayers(): Player[] {
    return [...this.players.values()].filter((p) => !p.isSpectator);
  }

  get activeHumans(): Player[] {
    return this.humans.filter((p) => !p.isSpectator);
  }

  /** How many seats the room aims to have filled (4, or fewer if the room is smaller). */
  get targetSize(): number {
    return Math.min(this.timing.targetPlayers, this.settings.maxPlayers);
  }

  /** Spectators don't take up a seat. */
  get isFull(): boolean {
    return this.activePlayers.length >= this.settings.maxPlayers;
  }

  get host(): Player | undefined {
    return this.players.get(this.hostId);
  }

  /** Kicked seats can't be silently reclaimed (token); banned browsers can't come back at all (device). */
  isBanned(token?: string, deviceId?: string) {
    return (!!token && this.bannedTokens.has(token)) || this.isDeviceBanned(deviceId);
  }

  isDeviceBanned(deviceId?: string) {
    return !!deviceId && this.bannedDevices.has(deviceId);
  }

  findByToken(token?: string): Player | undefined {
    if (!token) return undefined;
    return [...this.players.values()].find((p) => p.token === token);
  }

  addPlayer(player: Player) {
    this.players.set(player.id, player);
    if (!player.isBot && !player.isSpectator && (!this.hostId || !this.players.has(this.hostId) || this.host?.isBot)) this.hostId = player.id;
    this.emitAll('player_joined', { player: this.playerDTO(player), players: this.playerDTOs() });
    this.systemMessage(player.isSpectator ? `${player.name} is watching` : `${player.name} joined the room`, 'join');
    this.broadcastRoomState();
    this.game.sendSnapshot(player);
    if (!player.isBot) this.balanceBots();
    this.maybeAutoStart();
  }

  // ---------- automatic players ----------

  /**
   * Keeps the room at `targetSize` players: automatic players drop in one by one
   * (like real people arriving) and leave again as real players join.
   */
  balanceBots() {
    const wanted = Math.max(0, this.targetSize - this.activeHumans.length);
    const bots = this.bots.bots;
    for (let extra = bots.length - wanted; extra > 0; extra--) {
      const leaving = this.bots.bots.find((b) => b.id !== this.game.drawerId) ?? this.bots.bots.at(-1);
      if (leaving) this.removePlayer(leaving.id, 'left');
    }
    if (bots.length < wanted) this.scheduleBotJoin();
  }

  private scheduleBotJoin() {
    if (this.botFillTimer) return;
    const delay = this.timing.botJoinDelayMs * this.timing.botSpeed * (0.5 + Math.random());
    this.botFillTimer = setTimeout(() => {
      this.botFillTimer = null;
      if (this.humans.length === 0) return;
      if (this.bots.bots.length < this.targetSize - this.activeHumans.length && !this.isFull) this.addPlayer(this.bots.createBot());
      if (this.bots.bots.length < this.targetSize - this.activeHumans.length) this.scheduleBotJoin();
    }, delay);
  }

  /** Makes space for a real player in a full room by having one automatic player leave. */
  evictBot(): boolean {
    const bot = this.bots.bots.find((b) => b.id !== this.game.drawerId) ?? this.bots.bots.at(-1);
    if (!bot) return false;
    this.removePlayer(bot.id, 'left');
    return true;
  }

  removePlayer(playerId: string, reason: RemoveReason) {
    const player = this.players.get(playerId);
    if (!player) return;
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    this.players.delete(playerId);
    this.kickVotes.delete(playerId);
    this.kickVotes.forEach((voters) => voters.delete(playerId));

    if (reason === 'kicked' || reason === 'banned') {
      this.bannedTokens.add(player.token);
      if (reason === 'banned' && player.deviceId) this.bannedDevices.add(player.deviceId);
      if (player.socketId) {
        const why = reason === 'banned' ? 'You were banned from the room.' : 'You were kicked from the room.';
        this.emitToSocket(player.socketId, 'kicked', { reason: why });
        this.io.sockets.sockets.get(player.socketId)?.leave(this.id);
      }
    }

    if (this.humans.length === 0) {
      // Only bots (or nobody) left: shut the room down.
      if (this.autoStartTimer) clearTimeout(this.autoStartTimer);
      if (this.botFillTimer) clearTimeout(this.botFillTimer);
      this.game.dispose();
      this.players.clear();
      this.onEmpty(this);
      return;
    }

    if (this.hostId === playerId) this.reassignHost();

    const text = {
      left: `${player.name} left the room`,
      kicked: `${player.name} was kicked`,
      banned: `${player.name} was banned`,
      timeout: `${player.name} lost connection`,
    }[reason];
    this.emitAll('player_left', { playerId, players: this.playerDTOs() });
    this.systemMessage(text, 'leave');
    this.game.onPlayerLeft(playerId, true);
    this.broadcastRoomState();
    // A real player left: an automatic player takes the free seat.
    if (!player.isBot) this.balanceBots();
  }

  /** Socket dropped: keep the seat for a grace period so a refresh doesn't lose your score. */
  handleDisconnect(player: Player) {
    player.detach();
    // Host keeps the crown through a refresh; it only moves if the seat is actually removed.
    this.systemMessage(`${player.name} disconnected`, 'leave');
    this.game.onPlayerLeft(player.id, false);
    this.broadcastRoomState();
    player.disconnectTimer = setTimeout(() => this.removePlayer(player.id, 'timeout'), this.timing.reconnectGraceMs);
  }

  handleReconnect(player: Player, socketId: string) {
    player.attach(socketId);
    this.systemMessage(`${player.name} reconnected`, 'join');
    this.broadcastRoomState();
    this.game.sendSnapshot(player);
  }

  private reassignHost() {
    const others = this.activeHumans.filter((p) => p.id !== this.hostId);
    const next = others.find((p) => p.connected) ?? others[0];
    if (!next) return;
    this.hostId = next.id;
    next.isReady = false;
    this.systemMessage(`${next.name} is now the host`, 'system');
  }

  updateSettings(partial: Partial<RoomSettings>) {
    this.settings = sanitizeSettings(partial, this.settings);
    this.broadcastRoomState();
    this.balanceBots();
    this.maybeAutoStart();
  }

  /** Public rooms start by themselves (like skribbl.io's "Play!"); private rooms wait for the host. */
  maybeAutoStart() {
    if (this.settings.isPrivate || this.game.phase !== 'lobby' || this.autoStartTimer) return;
    // Wait until the room is filled up so the game starts with everyone.
    const seated = this.connectedPlayers.filter((p) => !p.isSpectator);
    if (seated.length < Math.max(2, this.targetSize) || !this.activeHumans.some((p) => p.connected)) return;
    this.systemMessage(`Game starting in ${Math.round(this.timing.autoStartDelayMs / 1000)} seconds…`);
    this.autoStartTimer = setTimeout(() => {
      this.autoStartTimer = null;
      if (this.game.phase === 'lobby' && this.connectedPlayers.filter((p) => !p.isSpectator).length >= 2) this.game.start();
    }, this.timing.autoStartDelayMs);
  }

  /** Reports are logged server-side (for a moderator to review) and acknowledged privately. */
  reportPlayer(reporter: Player, targetId: string, reason: string) {
    const target = this.players.get(targetId);
    if (!target || target.id === reporter.id) return;
    const reports = this.reports.get(targetId) ?? new Set<string>();
    reports.add(reporter.id);
    this.reports.set(targetId, reports);
    console.log(`[report] room=${this.id} target=${target.name} by=${reporter.name} reason=${reason || '-'} total=${reports.size}`);
    this.emitTo(reporter, 'chat_message', this.message('report', `Thanks, your report of ${target.name} was sent.`));
  }

  voteKick(voter: Player, targetId: string) {
    const target = this.players.get(targetId);
    if (!target || target.id === voter.id) return;
    const voters = this.kickVotes.get(targetId) ?? new Set<string>();
    voters.add(voter.id);
    this.kickVotes.set(targetId, voters);
    const needed = Math.floor((this.connectedPlayers.filter((p) => !p.isSpectator).length - 1) / 2) + 1;
    this.systemMessage(`${voter.name} is voting to kick ${target.name} (${voters.size}/${needed})`, 'warning');
    if (voters.size >= needed) this.removePlayer(targetId, 'kicked');
  }

  // ---------- messaging ----------

  emitAll<E extends ServerEvent>(event: E, ...args: ServerEventArgs<E>) {
    this.io.to(this.id).emit(event, ...args);
  }

  emitTo<E extends ServerEvent>(player: Player, event: E, ...args: ServerEventArgs<E>) {
    if (player.socketId) this.emitToSocket(player.socketId, event, ...args);
  }

  private emitToSocket<E extends ServerEvent>(socketId: string, event: E, ...args: ServerEventArgs<E>) {
    this.io.to(socketId).emit(event, ...args);
  }

  message(kind: ChatKind, text: string, from?: Player): ChatMessage {
    return { id: randomUUID(), kind, text, playerId: from?.id, playerName: from?.name };
  }

  systemMessage(text: string, kind: ChatKind = 'system') {
    this.emitAll('chat_message', this.message(kind, text));
  }

  // ---------- serialisation ----------

  playerDTO(player: Player) {
    return player.toDTO(this.hostId, this.game.drawerId);
  }

  playerDTOs() {
    return [...this.players.values()].map((p) => this.playerDTO(p));
  }

  toDTO(): RoomStateDTO {
    return { roomId: this.id, hostId: this.hostId, settings: this.settings, players: this.playerDTOs() };
  }

  toPublicInfo(): PublicRoomInfo {
    return {
      roomId: this.id,
      hostName: this.host?.name ?? '',
      players: this.activePlayers.length,
      maxPlayers: this.settings.maxPlayers,
      phase: this.game.phase,
    };
  }

  broadcastRoomState() {
    this.emitAll('room_state', this.toDTO());
  }
}
