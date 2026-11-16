import type { Category, Item } from './data';

const SPECIAL: Record<string, string> = { ø: 'o', Ø: 'o', æ: 'ae', Æ: 'ae', ß: 'ss', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd', ı: 'i', œ: 'oe', Œ: 'oe', þ: 'th', ð: 'd' };

/** Lowercase, accent-free, punctuation collapsed to single spaces. */
export function norm(s: string): string {
  return s
    .replace(/[øØæÆßłŁđĐıœŒþð]/g, (ch) => SPECIAL[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * How well a normalised key matches a normalised query: exact 100, a whole word 90 ("kane" → Harry Kane),
 * start of the name or any word 75 (first name and surname count the same, so fame can decide), every
 * query word starts a word 55, contains 35.
 */
export function scoreKey(
  key: string,
  q: string,
  qWords: string[],
  words = key.split(' '),
  qCompact = q.replace(/ /g, ''),
  keyCompact = key.replace(/ /g, ''),
): number {
  if (key === q) return 100;
  if (words.includes(q)) return 90;
  if (key.startsWith(q) || words.some((w) => w.startsWith(q))) return 75;
  if (qWords.length > 1 && qWords.every((qw) => words.some((w) => w.startsWith(qw)))) return 55;
  if (q.length >= 3 && keyCompact.includes(qCompact)) return 35;
  return 0;
}

/**
 * List-only suggestions (fallback when the search database can't load; see entities.ts). Ties are broken alphabetically, never by list position,
 * so the order of suggestions can't leak anything about the ranking.
 */
export function searchItems(cat: Category, query: string, limit = 8): Item[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const qWords = q.split(' ');
  const scored: { item: Item; s: number }[] = [];
  for (const item of cat.items) {
    let s = 0;
    for (const key of item.keys) s = Math.max(s, scoreKey(key, q, qWords));
    if (!s && q.length >= 3 && item.subKey) {
      const sub = scoreKey(item.subKey, q, qWords);
      if (sub >= 55) s = 20;
    }
    if (s) scored.push({ item, s });
  }
  scored.sort((a, b) => b.s - a.s || a.item.name.localeCompare(b.item.name));
  return scored.slice(0, limit).map((x) => x.item);
}

/** True when the query clearly names exactly this item (used to auto-resolve typed text). */
export function exactMatch(cat: Category, query: string): Item | undefined {
  const q = norm(query);
  if (!q) return undefined;
  const hits = cat.items.filter((it) => it.keys.includes(q));
  return hits.length === 1 ? hits[0] : undefined;
}
