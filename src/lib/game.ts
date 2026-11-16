import { CATEGORY_BY_ID, categoriesFor, type Category, type CourseId, type Item } from './data';

export interface Hole {
  cat: string;
  /** 1-based target rank ("the pin") */
  target: number;
}

/** item id, "~free text" for an off-the-list answer ("~" alone = gave up), or null = not played yet */
export type Pick = string | null;

export interface Player {
  name: string;
  picks: Pick[];
}

export type Mode = 'challenge' | 'local';

export interface Game {
  id: string;
  mode: Mode;
  course: CourseId;
  holes: Hole[];
  players: Player[];
  /** Index of the person holding this phone (challenge mode). null in pass & play. */
  me: number | null;
  /** How many hole reveals have been dismissed on this device. */
  revealed: number;
  /** Names of finished players whose cards this device has already watched. */
  seen: string[];
  createdAt: number;
  updatedAt: number;
}

export const MAX_PLAYERS = 4;
export const NAME_MAX = 14;

export function randomId(len = 8): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

export function randInt(min: number, max: number, rand: () => number = Math.random): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

/** Sensible target range for a list: not trivially near the top, not lost in the depths. */
export function targetRange(size: number): [number, number] {
  const lo = Math.max(2, Math.ceil(size * 0.08));
  const hi = Math.max(lo, Math.min(Math.floor(size * 0.85), 100));
  return [lo, hi];
}

export function newCourse(course: CourseId, count: number, rand: () => number = Math.random, pool?: Category[]): Hole[] {
  const cats = [...(pool ?? categoriesFor(course))];
  // Fisher–Yates
  for (let i = cats.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cats[i], cats[j]] = [cats[j], cats[i]];
  }
  return cats.slice(0, Math.min(count, cats.length)).map((c) => {
    const [lo, hi] = targetRange(c.size);
    return { cat: c.id, target: randInt(lo, hi, rand) };
  });
}

export function createGame(opts: { mode: Mode; course: CourseId; holes: number; names: string[]; me: number | null }): Game {
  const holes = newCourse(opts.course, opts.holes);
  const now = Date.now();
  return {
    id: randomId(),
    mode: opts.mode,
    course: opts.course,
    holes,
    players: opts.names.map((name) => ({ name, picks: holes.map(() => null) })),
    me: opts.me,
    revealed: 0,
    seen: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function obStrokes(cat: Category, target: number): number {
  return Math.max(target - 1, cat.size - target) + 1;
}

export function distance(item: Item, target: number): number {
  if (target < item.lo) return item.lo - target;
  if (target > item.hi) return target - item.hi;
  return 0;
}

export type Tone = 'ace' | 'great' | 'good' | 'ok' | 'meh' | 'bad' | 'ob';

export interface Verdict {
  label: string;
  tone: Tone;
}

export function verdictFor(strokes: number, size: number, ob: boolean): Verdict {
  if (ob) return { label: 'Out of bounds', tone: 'ob' };
  if (strokes === 0) return { label: 'Hole in one!', tone: 'ace' };
  if (strokes <= 2) return { label: 'Tap-in', tone: 'great' };
  if (strokes <= 5) return { label: 'On the green', tone: 'good' };
  const f = strokes / size;
  if (f <= 0.15) return { label: 'Fairway', tone: 'ok' };
  if (f <= 0.3) return { label: 'In the rough', tone: 'meh' };
  if (f <= 0.5) return { label: 'Bunkered', tone: 'bad' };
  return { label: 'In the water', tone: 'bad' };
}

export interface HoleResult {
  played: boolean;
  item?: Item;
  /** Free text for an off-the-list answer ('' if they gave up) */
  offList?: string;
  strokes: number;
  verdict?: Verdict;
}

export function holeResult(hole: Hole, pick: Pick): HoleResult {
  const cat = CATEGORY_BY_ID.get(hole.cat);
  if (pick === null || !cat) return { played: false, strokes: 0 };
  const item = pick.startsWith('~') ? undefined : cat.byId.get(pick);
  if (!item) {
    const strokes = obStrokes(cat, hole.target);
    return { played: true, offList: pick.startsWith('~') ? pick.slice(1) : '', strokes, verdict: verdictFor(strokes, cat.size, true) };
  }
  const strokes = distance(item, hole.target);
  return { played: true, item, strokes, verdict: verdictFor(strokes, cat.size, false) };
}

export function perfectAnswers(hole: Hole): Item[] {
  const cat = CATEGORY_BY_ID.get(hole.cat);
  if (!cat) return [];
  return cat.items.filter((it) => it.lo <= hole.target && hole.target <= it.hi);
}

export function playerTotal(game: Game, p: number): number {
  return game.holes.reduce((sum, h, i) => sum + holeResult(h, game.players[p].picks[i] ?? null).strokes, 0);
}

export function isDone(game: Game, p: number): boolean {
  return game.players[p].picks.every((x) => x !== null);
}

export function donePlayers(game: Game): number[] {
  return game.players.map((_, i) => i).filter((i) => isDone(game, i));
}

export interface Standing {
  index: number;
  total: number;
  place: number;
}

export function standings(game: Game, among: number[] = donePlayers(game)): Standing[] {
  const rows = among.map((index) => ({ index, total: playerTotal(game, index), place: 0 }));
  rows.sort((a, b) => a.total - b.total);
  rows.forEach((r, i) => (r.place = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].place : i + 1));
  return rows;
}

export function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

export function ordinal(n: number): string {
  return `${n}${ordinalSuffix(n)}`;
}

export function rankLabel(item: Item): string {
  return item.lo === item.hi ? ordinal(item.pos) : `=${ordinal(item.lo)}`;
}

export function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Merge an incoming copy of a game (from a link) into the local one. Never loses local progress. */
export function mergeGame(local: Game, incoming: Game): Game {
  const players = local.players.map((p) => ({ ...p, picks: [...p.picks] }));
  for (const inc of incoming.players) {
    const mine = players.find((p) => sameName(p.name, inc.name));
    if (!mine) {
      players.push({ name: inc.name, picks: [...inc.picks] });
      continue;
    }
    const incDone = inc.picks.filter((x) => x !== null).length;
    const myDone = mine.picks.filter((x) => x !== null).length;
    const isMe = local.me !== null && sameName(local.players[local.me].name, inc.name);
    if (!isMe && incDone > myDone) mine.picks = [...inc.picks];
  }
  return { ...local, players, updatedAt: Date.now() };
}
