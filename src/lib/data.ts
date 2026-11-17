import { norm } from './search';

export interface RawItem {
  id: string;
  name: string;
  sub?: string;
  value: number;
  display?: string;
  aliases?: string[];
  /** Official tiebreak values after `value` (e.g. goal difference, goals scored), compared the same way. */
  tb?: number[];
  /** Search-database entity this entry is (see data/entities). */
  wd?: string;
}

/** What an answer is. Search offers every known entity of this kind, not just the list. */
export type Kind = 'player' | 'manager' | 'club' | 'stadium' | 'nation';

export interface RawCategory {
  id: string;
  title: string;
  prompt: string;
  noun: string;
  nounPlural: string;
  kind: Kind;
  /** Kept so old links still score, but never used for new courses. */
  retired?: boolean;
  /** How entries level on `value` are separated, e.g. "goal difference, then goals scored". */
  tiebreak?: string;
  /**
   * Official final standings (a season's league table): the items are in the competition's own finishing
   * order, so every entry holds its own place, even when level on `value` (head-to-head, points per game, …).
   */
  standings?: boolean;
  /** Lists that are editions of the same thing, e.g. "serie-a-table". A course draws the series once, then one edition. */
  series?: string;
  /** Which edition of its series this list is, e.g. "2015–16". */
  season?: string;
  metric: string;
  order: 'asc' | 'desc';
  description: string;
  tags: string[];
  source: { name: string; url: string; asOf: string };
  items: RawItem[];
}

export interface Item extends RawItem {
  /** 1-based position in the list */
  pos: number;
  /** Tied items share a rank range [lo, hi]. Untied items have lo === hi === pos. */
  lo: number;
  hi: number;
  keys: string[];
  subKey: string;
}

export interface Category extends Omit<RawCategory, 'items'> {
  items: Item[];
  byId: Map<string, Item>;
  byWd: Map<string, Item>;
  size: number;
  /** Ranks a hole may target: inside the target range, held by exactly one entry, with a real value. One clear answer each. */
  pins: number[];
}

export type CourseId = 'mixed' | 'premier-league' | 'europe' | 'international';

export const COURSES: { id: CourseId; name: string; blurb: string; tags: string[] | null }[] = [
  { id: 'mixed', name: 'Mixed', blurb: 'A bit of everything', tags: null },
  { id: 'premier-league', name: 'Premier League', blurb: 'PL & English football', tags: ['premier-league', 'england'] },
  { id: 'europe', name: 'European clubs', blurb: 'Top leagues, Champions League, transfers', tags: ['europe', 'champions-league', 'transfers'] },
  { id: 'international', name: 'International', blurb: 'World Cup & national teams', tags: ['international', 'world-cup'] },
];

export function buildCategory(raw: RawCategory): Category {
  const items: Item[] = raw.items.map((it, i) => ({
    ...it,
    // "Málaga · Málaga" (club · city) reads as a glitch: drop repeated segments.
    sub: it.sub ? [...new Set(it.sub.split(' · ').map((x) => x.trim()))].join(' · ') : it.sub,
    pos: i + 1,
    lo: i + 1,
    hi: i + 1,
    keys: [it.name, ...(it.aliases ?? [])].map(norm).filter(Boolean),
    subKey: norm(it.sub ?? ''),
  }));
  // Equal values (and equal tiebreaks) share a rank range so a tie can't cost anyone strokes.
  // Official standings never share a place: the finishing order already settled every tie.
  const level = (a: Item, b: Item) => !raw.standings && a.value === b.value && (a.tb ?? []).join() === (b.tb ?? []).join();
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j + 1 < items.length && level(items[j + 1], items[i])) j++;
    for (let k = i; k <= j; k++) {
      items[k].lo = i + 1;
      items[k].hi = j + 1;
    }
    i = j + 1;
  }
  const [lo, hi] = targetRange(items.length);
  const pins = items.filter((it) => it.pos >= lo && it.pos <= hi && it.lo === it.hi && it.value !== 0).map((it) => it.pos);
  return {
    ...raw,
    items,
    byId: new Map(items.map((it) => [it.id, it])),
    byWd: new Map(items.filter((it) => it.wd).map((it) => [it.wd!, it])),
    size: items.length,
    pins,
  };
}

/** Where a pin may sit: not trivially near the top, not lost in the depths. (scripts/validate-data.mjs mirrors this.) */
export function targetRange(size: number): [number, number] {
  const lo = Math.max(2, Math.ceil(size * 0.08));
  const hi = Math.max(lo, Math.min(Math.floor(size * 0.85), 100));
  return [lo, hi];
}

const modules = import.meta.glob<RawCategory>('../../data/categories/*.json', { eager: true, import: 'default' });

export const CATEGORIES: Category[] = Object.values(modules)
  .map(buildCategory)
  .sort((a, b) => a.title.localeCompare(b.title));

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Lists new courses draw from. Retired lists stay in CATEGORY_BY_ID so old links still play. */
export const LIVE_CATEGORIES = CATEGORIES.filter((c) => !c.retired && c.pins.length > 0);

export function categoriesFor(course: CourseId, from: Category[] = LIVE_CATEGORIES): Category[] {
  const def = COURSES.find((c) => c.id === course);
  if (!def || !def.tags) return from;
  return from.filter((c) => c.tags.some((t) => def.tags!.includes(t)));
}

export interface DrawGroup {
  /** The series name, or the list id for a list that isn't part of one. */
  key: string;
  /** The lists in the group, by id (so oldest season first). */
  cats: Category[];
}

/**
 * Lists the way courses draw them: a series (every season of a league table) is one group, every other list
 * its own. Drawing groups instead of lists keeps 16 seasons of Serie A from crowding out everything else,
 * and a round never has two seasons of the same table.
 */
export function drawGroups(cats: Category[]): DrawGroup[] {
  const groups = new Map<string, Category[]>();
  for (const c of cats) {
    const key = c.series ?? c.id;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups].map(([key, list]) => ({ key, cats: list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) }));
}

/** How many different holes a course can deal: one per group. */
export function poolSize(course: CourseId): number {
  return drawGroups(categoriesFor(course)).length;
}

export function formatValue(_cat: Category, item: Item): string {
  return item.display ?? item.value.toLocaleString('en-GB');
}
