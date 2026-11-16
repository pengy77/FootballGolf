import type { Game } from './game';

const KEY = 'football-golf:v1';
const MAX_GAMES = 25;

export interface Saved {
  name: string;
  games: Record<string, Game>;
  seenHowTo: boolean;
}

const empty = (): Saved => ({ name: '', games: {}, seenHowTo: false });

export function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const s = JSON.parse(raw) as Partial<Saved>;
    return { ...empty(), ...s, games: s.games && typeof s.games === 'object' ? s.games : {} };
  } catch {
    return empty();
  }
}

export function persist(s: Saved): void {
  try {
    const games = Object.values(s.games)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_GAMES);
    localStorage.setItem(KEY, JSON.stringify({ ...s, games: Object.fromEntries(games.map((g) => [g.id, g])) }));
  } catch {
    /* private mode or storage full: the app still works for this session */
  }
}
