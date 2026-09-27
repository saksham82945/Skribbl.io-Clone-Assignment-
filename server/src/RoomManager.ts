import type { PublicRoomInfo, RoomSettings } from './shared/types';
import type { GameTiming } from './config';
import { Room } from './models/Room';
import type { IOServer } from './types';
import { WordBank } from './words/WordBank';

// No 0/O/1/I so codes are easy to read out loud.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly words = new WordBank();

  constructor(
    private readonly io: IOServer,
    private readonly timing: GameTiming,
  ) {}

  create(settings?: Partial<RoomSettings>): Room {
    const id = this.newCode();
    const room = new Room(id, this.io, settings, this.words, this.timing, (r) => this.rooms.delete(r.id));
    this.rooms.set(id, room);
    return room;
  }

  get(id: string | undefined): Room | undefined {
    return id ? this.rooms.get(String(id).trim().toUpperCase()) : undefined;
  }

  get size() {
    return this.rooms.size;
  }

  listPublic(): PublicRoomInfo[] {
    return [...this.rooms.values()]
      .filter((r) => !r.settings.isPrivate && r.humans.length < r.settings.maxPlayers)
      .map((r) => r.toPublicInfo())
      .sort((a, b) => b.players - a.players);
  }

  /**
   * "Play!": join the public room with the most real people (automatic players
   * make way), or open a new one — it fills itself up to 4 players.
   */
  findOrCreatePublic(deviceId?: string): Room {
    const open = [...this.rooms.values()].filter(
      (r) => !r.settings.isPrivate && r.humans.length < r.settings.maxPlayers && !r.isDeviceBanned(deviceId),
    );
    open.sort((a, b) => b.humans.length - a.humans.length || Number(b.game.phase === 'lobby') - Number(a.game.phase === 'lobby'));
    return open[0] ?? this.create({ isPrivate: false });
  }

  private newCode(): string {
    let code: string;
    do {
      code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    return code;
  }
}
