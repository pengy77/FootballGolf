import { categoriesFor } from './data';
import { newCourse, type Game, type Hole } from './game';

/**
 * The daily challenge: one fixed course per calendar day, the same for everyone. It's an ordinary
 * challenge game with a predictable id (d + yyyymmdd), so a friend's daily link merges straight
 * into your own card for that day.
 */
export const DAILY_HOLES = 5;
const LAUNCH = Date.UTC(2026, 10, 16); // daily #1

export function dailyKey(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export const dailyId = (key = dailyKey()) => `d${key}`;

export function isDailyId(id: string): boolean {
  return /^d\d{8}$/.test(id);
}

export function dailyNumber(key: string): number {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(4, 6)) - 1;
  const d = Number(key.slice(6, 8));
  return Math.round((Date.UTC(y, m, d) - LAUNCH) / 86_400_000) + 1;
}

/** "Daily #12", for a game id or null if it isn't a daily. */
export function dailyLabel(id: string): string | null {
  return isDailyId(id) ? `Daily #${dailyNumber(id.slice(1))}` : null;
}

function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Each list gets a score from hash(date, list id) and the day takes the lowest five. That's the same
 * on every phone whatever its language or list order, and adding or retiring a list only changes
 * the days where that list would have made the cut. Each hole's target is seeded the same way.
 */
export function dailyHoles(key = dailyKey()): Hole[] {
  const ranked = categoriesFor('mixed')
    .map((c) => ({ c, score: seeded(`football-golf-daily:${key}:${c.id}`)() }))
    .sort((a, b) => a.score - b.score || (a.c.id < b.c.id ? -1 : 1))
    .slice(0, DAILY_HOLES);
  return ranked.map(({ c }) => newCourse('mixed', 1, seeded(`football-golf-daily:${key}:${c.id}:pin`), [c])[0]);
}

export function newDailyGame(name: string, key = dailyKey()): Game {
  const holes = dailyHoles(key);
  const now = Date.now();
  return {
    id: dailyId(key),
    mode: 'challenge',
    course: 'mixed',
    holes,
    players: [{ name, picks: holes.map(() => null) }],
    me: 0,
    revealed: 0,
    seen: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Time until the next daily unlocks (local midnight). */
export function msUntilNextDaily(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function formatCountdown(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}
