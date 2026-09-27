import type { Language } from '../shared/types';

/**
 * The doodle library is keyed by English words. In other languages the bot is
 * offered (and the guessers must type) the translated word, while the drawing
 * is looked up by its English key.
 */
export const BOT_WORD_TRANSLATIONS: Record<Exclude<Language, 'en'>, Record<string, string>> = {
  es: {
    sun: 'sol', moon: 'luna', star: 'estrella', house: 'casa', tree: 'árbol', apple: 'manzana', fish: 'pez', cat: 'gato',
    car: 'coche', flower: 'flor', heart: 'corazón', cloud: 'nube', rainbow: 'arcoíris', snowman: 'muñeco de nieve',
    balloon: 'globo', umbrella: 'paraguas', 'ice cream': 'helado', mushroom: 'seta', cactus: 'cactus', glasses: 'gafas',
    lollipop: 'piruleta', cherry: 'cereza', boat: 'barco', rocket: 'cohete',
  },
  de: {
    sun: 'sonne', moon: 'mond', star: 'stern', house: 'haus', tree: 'baum', apple: 'apfel', fish: 'fisch', cat: 'katze',
    car: 'auto', flower: 'blume', heart: 'herz', cloud: 'wolke', rainbow: 'regenbogen', snowman: 'schneemann',
    balloon: 'luftballon', umbrella: 'regenschirm', 'ice cream': 'eis', mushroom: 'pilz', cactus: 'kaktus', glasses: 'brille',
    lollipop: 'lutscher', cherry: 'kirsche', boat: 'boot', rocket: 'rakete',
  },
  hi: {
    sun: 'suraj', moon: 'chaand', star: 'taara', house: 'ghar', tree: 'ped', apple: 'seb', fish: 'machli', cat: 'billi',
    car: 'gaadi', flower: 'phool', heart: 'dil', cloud: 'baadal', rainbow: 'indradhanush', snowman: 'snowman',
    balloon: 'gubbara', umbrella: 'chhata', 'ice cream': 'ice cream', mushroom: 'mushroom', cactus: 'cactus', glasses: 'chashma',
    lollipop: 'lollipop', cherry: 'cherry', boat: 'naav', rocket: 'rocket',
  },
};

export function toLanguage(englishWord: string, language: Language): string {
  return language === 'en' ? englishWord : (BOT_WORD_TRANSLATIONS[language][englishWord] ?? englishWord);
}

export function toEnglish(word: string, language: Language): string {
  if (language === 'en') return word;
  const entry = Object.entries(BOT_WORD_TRANSLATIONS[language]).find(([, translated]) => translated === word);
  return entry?.[0] ?? word;
}
