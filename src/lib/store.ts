import type { Game } from './game';

const KEY = 'football-golf:v1';
const MAX_GAMES = 100;

export interface Saved {
  name: string;
  games: Record<string, Game>;
  seenHowTo: boolean;
}

const empty = (): Saved => ({ name: '', games: {}, seenHowTo: false });

export function findGame(s: Saved, id: string): Game | undefined {
  return Object.hasOwn(s.games, id) ? s.games[id] : undefined;
}

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

/** Combine two copies (e.g. this tab and another tab), keeping the newest version of each game. */
export function mergeSaved(mine: Saved, other: Saved): Saved {
  const games: Record<string, Game> = { ...mine.games };
  for (const [id, g] of Object.entries(other.games)) {
    const cur = Object.hasOwn(games, id) ? games[id] : undefined;
    if (!cur || (g?.updatedAt ?? 0) > (cur.updatedAt ?? 0)) games[id] = g;
  }
  return { ...mine, name: mine.name || other.name, seenHowTo: mine.seenHowTo || other.seenHowTo, games };
}

export function persist(s: Saved): void {
  try {
    // Unfinished games and games waiting for a reply are kept ahead of old finished ones.
    const games = Object.values(s.games)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_GAMES);
    localStorage.setItem(KEY, JSON.stringify({ ...s, games: Object.fromEntries(games.map((g) => [g.id, g])) }));
  } catch {
    /* private mode or storage full: the app still works for this session */
  }
}
