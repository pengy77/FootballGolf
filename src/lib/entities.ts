import type { Category, Item, Kind } from './data';
import { exactMatch, norm, scoreKey, searchItems } from './search';

/**
 * The search database: every notable player, manager, club, stadium and nation (data/entities, built by
 * scripts/build-entities.mjs). The pick box searches this rather than the hole's list, so a suggestion
 * never gives away whether a name is on the list. You only find out at the reveal.
 */
export interface Entity {
  id: string;
  name: string;
  sub: string;
  keys: string[];
  /** Key words, for word-prefix matching */
  words: string[][];
  /** Keys without spaces, for contains matching */
  compact: string[];
  /** 0 = most famous; familiar names come first among equally good matches */
  rank: number;
}

type Row = [id: string, name: string, sub: string, aliases?: string[]];

const files = import.meta.glob<Row[]>('../../data/entities/*.json', { import: 'default' });
const loading = new Map<Kind, Promise<Entity[] | null>>();
const loaded = new Map<Kind, Entity[] | null>();

function build(rows: Row[]): Entity[] {
  return rows.map(([id, name, sub, aliases], rank) => {
    const keys = [...new Set([name, ...(aliases ?? [])].map(norm).filter(Boolean))];
    return { id, name, sub, keys, words: keys.map((k) => k.split(' ')), compact: keys.map((k) => k.replace(/ /g, '')), rank };
  });
}

/** Starts loading a kind's names (call early, e.g. when a hole appears). Resolves null if there's no file or it failed. */
export function loadEntities(kind: Kind): Promise<Entity[] | null> {
  let p = loading.get(kind);
  if (!p) {
    const load = files[`../../data/entities/${kind}s.json`];
    p = (load ? load() : Promise.resolve(null))
      .then((rows) => (rows ? build(rows) : null))
      .catch(() => null)
      .then((ents) => {
        loaded.set(kind, ents);
        // A failed load (say, offline) can be retried next time.
        if (!ents) loading.delete(kind);
        return ents;
      });
    loading.set(kind, p);
  }
  return p;
}

/** undefined = still loading, null = unavailable (search falls back to the list itself). */
export function entitiesNow(kind: Kind): Entity[] | null | undefined {
  return loaded.get(kind);
}

export interface Suggestion {
  /** What the player sees, the same for on-list and off-list names */
  name: string;
  sub: string;
  /** Set when this name is on the hole's list */
  item?: Item;
  key: string;
}

function toSuggestion(cat: Category, e: Entity): Suggestion {
  return { name: e.name, sub: e.sub, item: cat.byWd.get(e.id), key: e.id };
}

function itemSuggestion(item: Item): Suggestion {
  return { name: item.name, sub: item.sub ?? '', item, key: item.id };
}

/**
 * Suggestions for the pick box: best match first, then the more famous name. List position never
 * affects the order, so the order can't leak the ranking.
 */
export function suggest(cat: Category, ents: Entity[] | null, query: string, limit = 6): Suggestion[] {
  if (!ents) return searchItems(cat, query, limit).map(itemSuggestion);
  const q = norm(query);
  if (q.length < 2) return [];
  const qWords = q.split(' ');
  const qCompact = q.replace(/ /g, '');
  const top: { e: Entity; s: number }[] = [];
  for (const e of ents) {
    let s = 0;
    for (let i = 0; i < e.keys.length && s < 100; i++) s = Math.max(s, scoreKey(e.keys[i], q, qWords, e.words[i], qCompact, e.compact[i]));
    if (!s) continue;
    // Keep only the best `limit` (lists are tens of thousands long).
    if (top.length === limit && (s < top[limit - 1].s || (s === top[limit - 1].s && e.rank > top[limit - 1].e.rank))) continue;
    top.push({ e, s });
    top.sort((a, b) => b.s - a.s || a.e.rank - b.e.rank);
    if (top.length > limit) top.pop();
  }
  return top.map(({ e }) => toSuggestion(cat, e));
}

/** Typed text that clearly names one thing: exactly one entity (or, without the database, one list entry). */
export function exactSuggestion(cat: Category, ents: Entity[] | null, query: string): Suggestion | undefined {
  const q = norm(query);
  if (!q) return undefined;
  if (!ents) {
    const it = exactMatch(cat, query);
    return it && itemSuggestion(it);
  }
  const hits = ents.filter((e) => e.keys.includes(q));
  if (hits.length === 1) return toSuggestion(cat, hits[0]);
  // Several people share the name: only resolve it if exactly one of them is the famous one by that exact name.
  const named = hits.filter((e) => e.keys[0] === q);
  return named.length === 1 ? toSuggestion(cat, named[0]) : undefined;
}

/** How an already-chosen list entry looks in the database (same name and subtitle as its suggestion). */
export function entityFor(item: Item, ents: Entity[] | null | undefined): { name: string; sub: string } {
  const e = item.wd && ents ? ents.find((x) => x.id === item.wd) : undefined;
  return e ? { name: e.name, sub: e.sub } : { name: item.name, sub: item.sub ?? '' };
}
