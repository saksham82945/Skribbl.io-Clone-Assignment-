import type { GameOverPayload, GameStateDTO, LeaderboardEntry, Phase, Point, Stroke, Tool, TurnEndReason } from '../../../shared/types';
import { MAX_POINTS_PER_MOVE, MAX_POINTS_PER_STROKE, MAX_STROKES, MIN_PLAYERS, type GameTiming } from '../config';
import { effectiveHintCount, hintSchedule, maskWord, pickLetterToReveal } from '../utils/hints';
import { clamp, sanitizeColor } from '../utils/sanitize';
import { drawerPoints, guesserPoints } from '../utils/scoring';
import { checkGuess, containsWord } from '../utils/wordMatch';
import { pickDrawableWords } from '../bots/drawings';
import { toLanguage } from '../bots/translations';
import type { WordBank } from '../words/WordBank';
import type { Player } from './Player';
import type { Room } from './Room';

/**
 * Server-authoritative game state machine:
 *
 *   lobby → choosing → drawing → turn_end → (choosing … ) → game_over → lobby
 *
 * A "round" = every player draws once. A "turn" = one drawer.
 * All timers live here; clients only receive `timeLeftMs` and count down locally.
 */
export class Game {
  phase: Phase = 'lobby';
  round = 0;
  drawerId: string | null = null;
  strokes: Stroke[] = [];

  private drawQueue: string[] = [];
  private word: string | null = null;
  private wordOptions: string[] = [];
  private revealed = new Set<number>();
  private pendingHints: number[] = [];
  private phaseStartedAt = 0;
  private phaseEndsAt = 0;
  private guessOrder = 0;
  private turnGains = new Map<string, number>();
  private usedWords = new Set<string>();
  private ratedBy = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private ticker: NodeJS.Timeout | null = null;

  constructor(
    private readonly room: Room,
    private readonly words: WordBank,
    private readonly timing: GameTiming,
  ) {}

  private get settings() {
    return this.room.settings;
  }

  private get drawer(): Player | undefined {
    return this.drawerId ? this.room.players.get(this.drawerId) : undefined;
  }

  get isRunning() {
    return this.phase !== 'lobby' && this.phase !== 'game_over';
  }

  // ---------- lifecycle ----------

  start() {
    if (this.phase !== 'lobby') return;
    this.round = 0;
    this.usedWords.clear();
    for (const p of this.room.players.values()) {
      p.score = 0;
      p.hasGuessed = false;
    }
    this.room.systemMessage('The game has started!', 'system');
    this.nextRound();
  }

  private nextRound() {
    this.round++;
    if (this.round > this.settings.rounds) return this.endGame();
    this.drawQueue = this.room.connectedPlayers.filter((p) => !p.isSpectator).map((p) => p.id);
    this.nextTurn();
  }

  private nextTurn() {
    this.clearTimers();
    if (this.room.activePlayers.length < MIN_PLAYERS) return this.endGame();

    let nextId: string | undefined;
    while (this.drawQueue.length) {
      const id = this.drawQueue.shift()!;
      if (this.room.players.get(id)?.connected) {
        nextId = id;
        break;
      }
    }
    if (!nextId) return this.nextRound();

    this.drawerId = nextId;
    this.word = null;
    this.revealed.clear();
    this.pendingHints = [];
    this.strokes = [];
    this.guessOrder = 0;
    this.turnGains.clear();
    this.ratedBy.clear();
    for (const p of this.room.players.values()) p.hasGuessed = false;

    // Bots can only draw words from their doodle library.
    this.wordOptions = this.drawer!.isBot
      ? pickDrawableWords(this.settings.wordCount, this.usedWords).map((w) => toLanguage(w, this.settings.language))
      : this.words.getOptions(this.settings, this.usedWords);
    this.setPhase('choosing', this.timing.chooseTimeMs);

    this.room.emitAll('canvas_clear');
    for (const p of this.room.players.values()) {
      this.room.emitTo(p, 'round_start', {
        drawerId: nextId,
        wordOptions: p.id === nextId ? this.wordOptions : [],
        drawTime: this.settings.drawTime,
        round: this.round,
        choiceTimeMs: this.timing.chooseTimeMs,
      });
    }
    this.room.systemMessage(`${this.drawer!.name} is choosing a word`, 'system');
    this.broadcastState();
    this.room.broadcastRoomState();
    this.room.bots.onChoosing(nextId, this.wordOptions);

    // Auto-pick if the drawer is AFK.
    this.timer = setTimeout(() => this.chooseWord(nextId!, this.wordOptions[0]), this.timing.chooseTimeMs);
  }

  chooseWord(playerId: string, word: string) {
    if (this.phase !== 'choosing' || playerId !== this.drawerId || !this.wordOptions.includes(word)) return;
    this.clearTimers();
    this.word = word;
    this.usedWords.add(word);

    const drawMs = this.settings.drawTime * 1000;
    this.setPhase('drawing', drawMs);
    const hints = this.settings.wordMode === 'hidden' ? 0 : effectiveHintCount(word, this.settings.hints);
    this.pendingHints = hintSchedule(drawMs, hints);

    this.timer = setTimeout(() => this.endTurn('time_up'), drawMs);
    this.ticker = setInterval(() => this.tick(), 500);
    this.room.systemMessage(`${this.drawer?.name} is drawing now!`, 'system');
    this.broadcastState();
    this.room.bots.onDrawing(word, playerId, drawMs);
  }

  /** Reveals hint letters when their scheduled time has passed. */
  private tick() {
    if (this.phase !== 'drawing' || !this.word) return;
    const elapsed = Date.now() - this.phaseStartedAt;
    let changed = false;
    while (this.pendingHints.length && elapsed >= this.pendingHints[0]) {
      this.pendingHints.shift();
      const idx = pickLetterToReveal(this.word, this.revealed);
      if (idx !== null) {
        this.revealed.add(idx);
        changed = true;
      }
    }
    if (changed) this.broadcastState();
  }

  endTurn(reason: TurnEndReason) {
    if (this.phase !== 'choosing' && this.phase !== 'drawing') return;
    this.clearTimers();
    this.room.bots.onTurnEnd();

    const drawer = this.drawer;
    if (drawer && reason !== 'drawer_left' && this.phase === 'drawing') {
      const guessers = this.room.activePlayers.filter((p) => p.id !== drawer.id && (p.connected || p.hasGuessed));
      const correct = guessers.filter((p) => p.hasGuessed).length;
      const pts = drawerPoints(correct, guessers.length);
      drawer.score += pts;
      this.turnGains.set(drawer.id, pts);
    }

    this.setPhase('turn_end', this.timing.turnEndDelayMs);
    const scores = this.room.activePlayers
      .map((p) => ({ playerId: p.id, name: p.name, gained: this.turnGains.get(p.id) ?? 0, total: p.score }))
      .sort((a, b) => b.gained - a.gained);

    this.room.emitAll('round_end', { word: this.word, reason, scores, nextDrawer: this.peekNextDrawer() });
    if (this.word) this.room.systemMessage(`The word was '${this.word}'`, 'system');
    this.broadcastState();
    this.room.broadcastRoomState();

    this.timer = setTimeout(() => this.nextTurn(), this.timing.turnEndDelayMs);
  }

  private peekNextDrawer(): string | null {
    const inQueue = this.drawQueue.find((id) => this.room.players.get(id)?.connected);
    if (inQueue) return inQueue;
    if (this.round >= this.settings.rounds) return null;
    return this.room.connectedPlayers.find((p) => !p.isSpectator)?.id ?? null;
  }

  endGame() {
    if (this.phase === 'lobby' || this.phase === 'game_over') return;
    this.clearTimers();
    this.room.bots.clear();
    this.setPhase('game_over', this.timing.gameOverDelayMs);
    this.drawerId = null;

    const sorted = this.room.activePlayers.sort((a, b) => b.score - a.score);
    const leaderboard: LeaderboardEntry[] = [];
    sorted.forEach((p, i) => {
      const prev = leaderboard[i - 1];
      const rank = prev && prev.score === p.score ? prev.rank : i + 1;
      leaderboard.push({ playerId: p.id, name: p.name, avatar: p.avatar, score: p.score, rank });
    });
    const winners = leaderboard.filter((e) => e.rank === 1);
    const payload: GameOverPayload = { winner: winners[0] ?? null, winners, leaderboard };

    this.room.emitAll('game_over', payload);
    this.room.systemMessage(`Game over! ${payload.winners.map((w) => w.name).join(' & ')} won!`, 'correct');
    this.broadcastState();
    this.room.broadcastRoomState();
    // Results screen, then everyone goes back to the lobby automatically.
    this.timer = setTimeout(() => this.resetToLobby(), this.timing.gameOverDelayMs);
  }

  resetToLobby() {
    this.clearTimers();
    this.phase = 'lobby';
    this.round = 0;
    this.drawerId = null;
    this.word = null;
    this.strokes = [];
    for (const p of this.room.players.values()) {
      p.isReady = p.isBot;
      p.hasGuessed = false;
    }
    this.room.emitAll('canvas_clear');
    this.broadcastState();
    this.room.broadcastRoomState();
    this.room.maybeAutoStart();
  }

  /** `removed` = seat is gone for good; otherwise the player just disconnected and may come back. */
  onPlayerLeft(playerId: string, removed: boolean) {
    if (!this.isRunning) return;
    if (removed && this.room.activePlayers.length < MIN_PLAYERS) return this.endGame();
    if (playerId === this.drawerId && (this.phase === 'choosing' || this.phase === 'drawing')) {
      this.room.systemMessage('The drawer left, skipping turn', 'warning');
      return this.endTurn('drawer_left');
    }
    if (this.phase === 'drawing') this.checkAllGuessed();
  }

  dispose() {
    this.clearTimers();
    this.room.bots.clear();
  }

  /** Thumbs up / down on the current drawing, once per player per turn. */
  rateDrawing(player: Player, like: boolean) {
    if (this.phase !== 'drawing' || player.id === this.drawerId || player.isSpectator || this.ratedBy.has(player.id)) return;
    this.ratedBy.add(player.id);
    this.room.systemMessage(`${player.name} ${like ? 'liked' : 'disliked'} the drawing!`, like ? 'like' : 'dislike');
  }

  // ---------- guessing & chat ----------

  /** Every chat line goes through here so the secret word can never leak. */
  handleMessage(player: Player, text: string) {
    const now = Date.now();
    if (!player.isBot && now - player.lastMessageAt < this.timing.chatCooldownMs) {
      this.room.emitTo(player, 'chat_message', this.room.message('warning', 'Slow down! Message not sent.'));
      return;
    }
    player.lastMessageAt = now;

    if (this.phase !== 'drawing' || !this.word) {
      this.room.emitAll('chat_message', this.room.message('chat', text, player));
      return;
    }

    // Spectators only chat; they can't score, and they can't leak the word either.
    if (player.isSpectator) {
      if (!containsWord(text, this.word)) this.room.emitAll('chat_message', this.room.message('chat', text, player));
      return;
    }

    if (player.id === this.drawerId || player.hasGuessed) {
      if (containsWord(text, this.word)) {
        this.room.emitTo(player, 'chat_message', this.room.message('warning', "You can't reveal the word!"));
        return;
      }
      // Drawer + players who already guessed talk in a private channel.
      this.emitToGuessedChannel(this.room.message('guessed', text, player));
      return;
    }

    const result = checkGuess(text, this.word);
    if (result === 'correct') return this.acceptGuess(player);

    this.room.emitTo(player, 'guess_result', { correct: false, playerId: player.id, playerName: player.name, points: 0 });
    this.room.emitAll('chat_message', this.room.message('chat', text, player));
    if (result === 'close') this.room.emitTo(player, 'chat_message', this.room.message('close', `'${text}' is close!`));
  }

  private acceptGuess(player: Player) {
    const drawMs = this.settings.drawTime * 1000;
    const points = guesserPoints(this.phaseEndsAt - Date.now(), drawMs, this.guessOrder++);
    player.score += points;
    player.hasGuessed = true;
    this.turnGains.set(player.id, points);

    this.room.emitAll('guess_result', { correct: true, playerId: player.id, playerName: player.name, points });
    this.room.emitAll('chat_message', this.room.message('correct', `${player.name} guessed the word!`, player));
    this.room.emitTo(player, 'game_state', this.stateFor(player));
    this.room.broadcastRoomState();
    this.checkAllGuessed();
  }

  private emitToGuessedChannel(msg: ReturnType<Room['message']>) {
    for (const p of this.room.players.values()) {
      if (p.id === this.drawerId || p.hasGuessed) this.room.emitTo(p, 'chat_message', msg);
    }
  }

  private checkAllGuessed() {
    const guessers = this.room.connectedPlayers.filter((p) => p.id !== this.drawerId && !p.isSpectator);
    if (guessers.length > 0 && guessers.every((p) => p.hasGuessed)) this.endTurn('all_guessed');
  }

  // ---------- drawing ----------

  /** Id of the stroke being drawn (lets the spec's `{ x, y }` draw_move omit the id). */
  currentStrokeId(): string | undefined {
    return this.strokes[this.strokes.length - 1]?.id;
  }

  canDraw(playerId: string) {
    return this.phase === 'drawing' && playerId === this.drawerId;
  }

  drawStart(player: Player, p: { strokeId: string; x: number; y: number; color: string; size: number; tool: Tool }) {
    if (!this.canDraw(player.id) || this.strokes.length >= MAX_STROKES) return;
    const stroke: Stroke = {
      id: String(p.strokeId).slice(0, 40),
      tool: p.tool === 'eraser' || p.tool === 'fill' ? p.tool : 'brush',
      color: sanitizeColor(p.color),
      size: clamp(Number(p.size) || 4, 1, 60),
      points: [normPoint(p.x, p.y)],
    };
    this.strokes.push(stroke);
    // Sent to everyone *including* the drawer (per the spec); the drawer's client ignores its own echoes.
    this.room.emitAll('draw_data', { type: 'start', stroke });
  }

  drawMove(player: Player, strokeId: string, points: Point[]) {
    if (!this.canDraw(player.id) || !Array.isArray(points)) return;
    const stroke = this.strokes[this.strokes.length - 1];
    if (!stroke || stroke.id !== strokeId || stroke.tool === 'fill' || stroke.points.length >= MAX_POINTS_PER_STROKE) return;
    const clean = points.slice(0, MAX_POINTS_PER_MOVE).map((pt) => normPoint(pt?.[0], pt?.[1]));
    stroke.points.push(...clean);
    this.room.emitAll('draw_data', { type: 'move', strokeId, points: clean });
  }

  drawEnd(player: Player, strokeId: string) {
    if (!this.canDraw(player.id)) return;
    this.room.emitAll('draw_data', { type: 'end', strokeId: String(strokeId) });
  }

  undo(player: Player) {
    if (!this.canDraw(player.id)) return;
    const stroke = this.strokes.pop();
    if (stroke) this.room.emitAll('draw_undo', { strokeId: stroke.id });
  }

  clearCanvas(player: Player) {
    if (!this.canDraw(player.id)) return;
    this.strokes = [];
    this.room.emitAll('canvas_clear');
  }

  // ---------- state sync ----------

  stateFor(player: Player): GameStateDTO {
    const reveal = this.phase === 'turn_end' || player.id === this.drawerId || player.hasGuessed;
    const running = this.phase !== 'lobby';
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.settings.rounds,
      drawerId: this.drawerId,
      word: reveal ? this.word : null,
      hints: this.word && this.settings.wordMode !== 'hidden' ? maskWord(this.word, this.revealed) : null,
      timeLeftMs: running ? Math.max(0, this.phaseEndsAt - Date.now()) : null,
      drawTime: this.settings.drawTime,
    };
  }

  broadcastState() {
    for (const p of this.room.players.values()) this.room.emitTo(p, 'game_state', this.stateFor(p));
  }

  /** Everything a (re)joining player needs to catch up mid-game. */
  sendSnapshot(player: Player) {
    this.room.emitTo(player, 'game_state', this.stateFor(player));
    this.room.emitTo(player, 'canvas_state', { strokes: this.strokes });
    if (this.phase === 'choosing' && this.drawerId) {
      this.room.emitTo(player, 'round_start', {
        drawerId: this.drawerId,
        wordOptions: player.id === this.drawerId ? this.wordOptions : [],
        drawTime: this.settings.drawTime,
        round: this.round,
        choiceTimeMs: Math.max(0, this.phaseEndsAt - Date.now()),
      });
    }
  }

  private setPhase(phase: Phase, durationMs: number) {
    this.phase = phase;
    this.phaseStartedAt = Date.now();
    this.phaseEndsAt = this.phaseStartedAt + durationMs;
  }

  private clearTimers() {
    if (this.timer) clearTimeout(this.timer);
    if (this.ticker) clearInterval(this.ticker);
    this.timer = null;
    this.ticker = null;
  }
}

function normPoint(x: unknown, y: unknown): Point {
  const nx = Number(x);
  const ny = Number(y);
  return [clamp(Number.isFinite(nx) ? nx : 0, 0, 1), clamp(Number.isFinite(ny) ? ny : 0, 0, 1)];
}
