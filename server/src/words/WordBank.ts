import type { Language, RoomSettings, WordCategory } from '../shared/types';
import wordsDe from './words.de.json';
import wordsEs from './words.es.json';
import wordsHi from './words.hi.json';
import wordsEn from './words.json';

type WordLists = Record<Exclude<WordCategory, 'all'>, string[]>;
type Library = Record<Language, WordLists>;

const DEFAULT_LIBRARY: Library = {
  en: wordsEn as WordLists,
  es: wordsEs as WordLists,
  de: wordsDe as WordLists,
  hi: wordsHi as WordLists,
};

export class WordBank {
  private readonly all: Record<Language, string[]>;

  constructor(
    private readonly library: Library = DEFAULT_LIBRARY,
    private readonly random = Math.random,
  ) {
    this.all = Object.fromEntries(
      (Object.keys(library) as Language[]).map((lang) => [lang, [...new Set(Object.values(library[lang]).flat())]]),
    ) as Record<Language, string[]>;
  }

  categoryWords(category: WordCategory, language: Language = 'en'): string[] {
    const lists = this.library[language] ?? this.library.en;
    return category === 'all' ? this.all[language] ?? this.all.en : (lists[category] ?? this.all[language]);
  }

  /**
   * Returns `settings.wordCount` distinct options for the drawer, in the room's language.
   * Custom words are mixed in (or used exclusively), and recently used words are avoided when possible.
   * In combination mode each option is two words joined together, e.g. "fire truck".
   */
  getOptions(settings: RoomSettings, exclude: Set<string> = new Set()): string[] {
    const custom = settings.customWords;
    let pool =
      settings.customWordsOnly && custom.length >= settings.wordCount
        ? [...custom]
        : [...new Set([...this.categoryWords(settings.category, settings.language), ...custom])];

    const fresh = pool.filter((w) => !exclude.has(w));
    const needed = settings.wordMode === 'combination' ? settings.wordCount * 2 : settings.wordCount;
    if (fresh.length >= needed) pool = fresh;

    const picked = this.sample(pool, needed);
    if (settings.wordMode !== 'combination') return picked;

    const combos: string[] = [];
    for (let i = 0; i + 1 < picked.length; i += 2) combos.push(`${picked[i]} ${picked[i + 1]}`);
    return combos;
  }

  private sample(pool: string[], n: number): string[] {
    const copy = [...pool];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }
}
