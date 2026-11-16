import { norm } from './search';

export interface RawItem {
  id: string;
  name: string;
  sub?: string;
  value: number;
  display?: string;
  aliases?: string[];
}

export interface RawCategory {
  id: string;
  title: string;
  prompt: string;
  noun: string;
  nounPlural: string;
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
  size: number;
}

export type CourseId = 'mixed' | 'premier-league' | 'europe' | 'international';

export const COURSES: { id: CourseId; name: string; blurb: string; tags: string[] | null }[] = [
  { id: 'mixed', name: 'Mixed', blurb: 'A bit of everything', tags: null },
  { id: 'premier-league', name: 'Premier League', blurb: 'PL & English football', tags: ['premier-league', 'england'] },
  { id: 'europe', name: 'European clubs', blurb: 'Champions League, stadiums, transfers', tags: ['europe', 'champions-league', 'transfers'] },
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
  // Equal values share a rank range so a tie can't cost anyone strokes.
  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j + 1 < items.length && items[j + 1].value === items[i].value) j++;
    for (let k = i; k <= j; k++) {
      items[k].lo = i + 1;
      items[k].hi = j + 1;
    }
    i = j + 1;
  }
  return { ...raw, items, byId: new Map(items.map((it) => [it.id, it])), size: items.length };
}

const modules = import.meta.glob<RawCategory>('../../data/categories/*.json', { eager: true, import: 'default' });

export const CATEGORIES: Category[] = Object.values(modules)
  .map(buildCategory)
  .sort((a, b) => a.title.localeCompare(b.title));

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoriesFor(course: CourseId, from: Category[] = CATEGORIES): Category[] {
  const def = COURSES.find((c) => c.id === course);
  if (!def || !def.tags) return from;
  return from.filter((c) => c.tags.some((t) => def.tags!.includes(t)));
}

export function formatValue(_cat: Category, item: Item): string {
  return item.display ?? item.value.toLocaleString('en-GB');
}
