import { CATEGORY_BY_ID, categoriesFor, targetRange, type Category, type CourseId, type Item } from './data';

export interface Hole {
  cat: string;
  /** 1-based target rank ("the pin") */
  target: number;
}

/** item id, "~free text" for an off-the-list answer ("~" alone = gave up), "!" = ran out of time (live), or null = not played yet */
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
/** Most finished cards a share link carries (and so the most people who can join one course). */
export const MAX_LINK_PLAYERS = 8;
export const NAME_MAX = 14;

/** False if a list this game uses has since been removed from the data. */
export function isPlayable(game: { holes: Hole[] }): boolean {
  return game.holes.every((h) => CATEGORY_BY_ID.has(h.cat));
}

export function randomId(len = 8): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

export function randInt(min: number, max: number, rand: () => number = Math.random): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

export { targetRange } from './data';

export function newCourse(course: CourseId, count: number, rand: () => number = Math.random, pool?: Category[]): Hole[] {
  const cats = [...(pool ?? categoriesFor(course))];
  // Fisher–Yates
  for (let i = cats.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cats[i], cats[j]] = [cats[j], cats[i]];
  }
  // Pins only go where exactly one entry sits, so every hole has one clear answer (never a tie, never a 0).
  return cats.slice(0, Math.min(count, cats.length)).map((c) => {
    if (!c.pins.length) {
      const [lo, hi] = targetRange(c.size);
      return { cat: c.id, target: randInt(lo, hi, rand) };
    }
    return { cat: c.id, target: c.pins[randInt(0, c.pins.length - 1, rand)] };
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

/** No hole costs more than this, so one long list (e.g. 211 nations) can't decide a match on its own. */
export const HOLE_MAX = 40;

/** Out of bounds: 1 worse than the worst answer on the list, capped at the hole maximum. */
export function obStrokes(cat: Category, target: number): number {
  return Math.min(Math.max(target - 1, cat.size - target) + 1, HOLE_MAX);
}

/** The rank inside an item's (possibly tied) range that sits closest to the target. */
export function nearestRank(item: Item, target: number): number {
  return Math.min(Math.max(target, item.lo), item.hi);
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

export function verdictFor(strokes: number, size: number, ob: boolean, timedOut = false): Verdict {
  if (timedOut) return { label: 'Out of time', tone: 'ob' };
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
  /** Strokes before the per-hole cap */
  raw: number;
  capped: boolean;
  /** Live mode: the shot clock ran out before they locked anything in */
  timedOut?: boolean;
  verdict?: Verdict;
}

export function holeResult(hole: Hole, pick: Pick): HoleResult {
  const cat = CATEGORY_BY_ID.get(hole.cat);
  if (pick === null || !cat) return { played: false, strokes: 0, raw: 0, capped: false };
  const item = pick.startsWith('~') ? undefined : cat.byId.get(pick);
  if (!item) {
    const strokes = obStrokes(cat, hole.target);
    const timedOut = pick === '!';
    return {
      played: true,
      offList: pick.startsWith('~') ? pick.slice(1) : '',
      strokes,
      raw: strokes,
      capped: strokes === HOLE_MAX,
      timedOut,
      verdict: verdictFor(strokes, cat.size, true, timedOut),
    };
  }
  const raw = distance(item, hole.target);
  const strokes = Math.min(raw, HOLE_MAX);
  return { played: true, item, strokes, raw, capped: raw > HOLE_MAX, verdict: verdictFor(raw, cat.size, false) };
}

/** What someone answered, in words. */
export function pickLabel(r: HoleResult): string {
  if (r.item) return r.item.name;
  if (r.timedOut) return 'Ran out of time';
  return r.offList ? `“${r.offList}”` : 'No answer';
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

/** "35th", or "20–21st" for a tie (tied entries share every place in the range). */
export function rankLabel(item: Item): string {
  return item.lo === item.hi ? ordinal(item.pos) : `${item.lo}\u2060–\u2060${ordinal(item.hi)}`; // word joiners: never wrap a range
}

export function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Merge an incoming copy of a game (from a link) into the local one. Never loses local progress.
 * Links only carry finished cards, so a same-named card with different picks is a different person.
 */
export function mergeGame(local: Game, incoming: { players: Player[] }): Game {
  const players = local.players.map((p) => ({ ...p, picks: [...p.picks] }));
  let changed = false;
  for (const inc of incoming.players) {
    const same = players.find((p) => sameName(p.name, inc.name));
    if (same && JSON.stringify(same.picks) === JSON.stringify(inc.picks)) continue;
    if (players.some((p) => JSON.stringify(p.picks) === JSON.stringify(inc.picks) && inc.picks.every((x) => x !== null))) continue;
    if (players.length >= MAX_LINK_PLAYERS) break;
    let name = inc.name;
    for (let n = 2; players.some((p) => sameName(p.name, name)); n++) name = `${inc.name} (${n})`;
    players.push({ name, picks: [...inc.picks] });
    changed = true;
  }
  return changed ? { ...local, players, updatedAt: Date.now() } : local;
}
