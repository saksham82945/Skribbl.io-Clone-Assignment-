import { AVATAR_COLORS, AVATAR_EMOJIS } from '../shared/types';
import { Player } from '../models/Player';
import type { Room } from '../models/Room';
import { BOT_DRAWINGS, BOT_WORDS, type BotStroke } from './drawings';
import { toEnglish, toLanguage } from './translations';

// Ordinary-looking usernames: automatic players should feel like real people.
const BOT_NAMES = [
  'Aarav', 'priya_22', 'Rohan', 'emma.k', 'Liam', 'sofia', 'Kabir07', 'Ananya', 'noah_draws', 'Mia',
  'arjun', 'Zara', 'lucas', 'Isha', 'Ethan', 'meera.s', 'Oliver', 'Chloe', 'Vikram', 'nina',
  'potato', 'sam_uel', 'Aditi', 'jake', 'Riya', 'leo_art', 'Diya', 'max', 'Tara', 'Kian',
];
const IDLE_CHAT = ['hmm 🤔', 'what is that 😂', 'no idea lol', 'nice drawing!', 'ooh I think I know', 'so close…', 'wait what'];
const AFTER_GUESS = ['ez 😎', 'got it!', 'nice one', 'gg'];

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
const between = (a: number, b: number) => a + Math.random() * (b - a);

/** Makes a plausible typo of a word so bots sometimes trigger "is close!". */
function typo(word: string): string {
  if (word.length < 4) return word + word[word.length - 1];
  const i = 1 + Math.floor(Math.random() * (word.length - 2));
  return word.slice(0, i) + word.slice(i + 1);
}

/**
 * Drives every bot in a room. Bots are ordinary `Player`s with no socket;
 * they act only through the same Game methods a human's socket events call
 * (chooseWord / drawStart / handleMessage…), so they obey all the same rules.
 */
export class BotController {
  private timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly room: Room,
    private readonly speed: number,
  ) {}

  get bots(): Player[] {
    return [...this.room.players.values()].filter((p) => p.isBot);
  }

  createBot(): Player {
    const taken = new Set([...this.room.players.values()].map((p) => p.name.toLowerCase()));
    const free = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
    const name = free.length ? pick(free) : `player${Math.floor(100 + Math.random() * 900)}`;
    return new Player(name, { color: pick(AVATAR_COLORS), emoji: pick(AVATAR_EMOJIS) }, null, true);
  }

  // ---------- game hooks ----------

  onChoosing(drawerId: string, options: string[]) {
    this.clear();
    const drawer = this.room.players.get(drawerId);
    if (!drawer?.isBot) return;
    const lang = this.room.settings.language;
    const drawable = options.find((w) => toEnglish(w, lang) in BOT_DRAWINGS) ?? options[0];
    this.later(between(1200, 3000), () => this.room.game.chooseWord(drawer.id, drawable));
  }

  onDrawing(word: string, drawerId: string, drawTimeMs: number) {
    this.clear();
    const drawer = this.room.players.get(drawerId);
    if (drawer?.isBot) this.animateDrawing(drawer, word);

    for (const bot of this.bots) {
      if (bot.id === drawerId) continue;
      this.planGuesses(bot, word, drawTimeMs);
    }
  }

  onTurnEnd() {
    this.clear();
    const bots = this.bots;
    if (bots.length && Math.random() < 0.3) {
      const bot = pick(bots);
      this.later(between(800, 2500), () => this.room.game.handleMessage(bot, pick(['gg', 'haha', 'nice', 'lol', '👏'])));
    }
  }

  clear() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  // ---------- behaviour ----------

  /** A few wrong guesses (sometimes a near miss), then usually the right answer. */
  private planGuesses(bot: Player, word: string, drawTimeMs: number) {
    const willGuess = Math.random() < 0.85;
    const correctAt = drawTimeMs * between(0.2, 0.75);
    const horizon = willGuess ? correctAt : drawTimeMs * 0.9;

    const wrongCount = Math.floor(between(0, 3));
    for (let i = 0; i < wrongCount; i++) {
      const at = horizon * between(0.15, 0.9);
      const lang = this.room.settings.language;
      const text = Math.random() < 0.3 ? typo(word) : toLanguage(pick(BOT_WORDS.filter((w) => toLanguage(w, lang) !== word)), lang);
      this.later(at, () => this.room.game.handleMessage(bot, text));
    }
    if (Math.random() < 0.25) this.later(horizon * between(0.1, 0.9), () => this.room.game.handleMessage(bot, pick(IDLE_CHAT)));

    if (willGuess) {
      this.later(correctAt, () => this.room.game.handleMessage(bot, word));
      if (Math.random() < 0.3) this.later(correctAt + between(1500, 4000), () => this.room.game.handleMessage(bot, pick(AFTER_GUESS)));
    }
  }

  /** Replays a doodle stroke by stroke, a few points at a time, so it looks hand-drawn. */
  private animateDrawing(bot: Player, word: string) {
    const make = BOT_DRAWINGS[toEnglish(word, this.room.settings.language)];
    const strokes: BotStroke[] = make ? make() : [];
    if (!make) {
      // Unknown word (custom-only rooms): admit it and scribble a question mark.
      this.later(800, () => this.room.game.handleMessage(bot, 'idk how to draw this lol'));
      strokes.push({ tool: 'brush', color: '#000000', size: 10, points: [[0.42, 0.3], [0.5, 0.22], [0.58, 0.3], [0.5, 0.45], [0.5, 0.58]] });
      strokes.push({ tool: 'brush', color: '#000000', size: 12, points: [[0.5, 0.7]] });
    }

    const game = this.room.game;
    let t = 900;
    strokes.forEach((s, idx) => {
      const id = `bot${Date.now().toString(36)}${idx}`;
      const [x, y] = s.points[0];
      this.later(t, () => game.drawStart(bot, { strokeId: id, x, y, color: s.color, size: s.size, tool: s.tool }));
      for (let i = 1; i < s.points.length; i += 3) {
        t += 28;
        const chunk = s.points.slice(i, i + 3);
        this.later(t, () => game.drawMove(bot, id, chunk));
      }
      t += 20;
      this.later(t, () => game.drawEnd(bot, id));
      t += s.tool === 'fill' ? 250 : 140;
    });
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      try {
        fn();
      } catch (err) {
        console.error('[bot error]', err);
      }
    }, ms * this.speed);
    this.timers.add(t);
  }
}
