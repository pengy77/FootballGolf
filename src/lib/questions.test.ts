import { describe, expect, it } from 'vitest';
import { buildCategory, CATEGORIES, CATEGORY_BY_ID, LIVE_CATEGORIES, type RawCategory } from './data';
import { exactSuggestion, suggest, type Entity } from './entities';
import { newCourse, perfectAnswers } from './game';
import { norm } from './search';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 2 ** 32);
}

const base: Omit<RawCategory, 'items'> = {
  id: 't',
  title: 'T',
  prompt: 'most points',
  noun: 'nation',
  nounPlural: 'nations',
  kind: 'nation',
  metric: 'Points',
  order: 'desc',
  description: 'x',
  tags: ['international'],
  source: { name: 'x', url: 'https://x', asOf: '2026-01-01' },
};

describe('one clear answer per hole', () => {
  it('every live list has pins, and every pin is held by exactly one entry with a real value', () => {
    expect(LIVE_CATEGORIES.length).toBeGreaterThanOrEqual(12);
    for (const c of LIVE_CATEGORIES) {
      expect(c.pins.length, c.id).toBeGreaterThanOrEqual(12);
      for (const p of c.pins) {
        const at = c.items.filter((it) => it.lo <= p && p <= it.hi);
        expect(at.length, `${c.id} pin ${p}`).toBe(1);
        expect(at[0].value, `${c.id} pin ${p}`).not.toBe(0);
      }
    }
  });

  it('courses only ever target a pin, for every course and many seeds', () => {
    for (const course of ['mixed', 'premier-league', 'europe', 'international'] as const) {
      for (let seed = 1; seed <= 300; seed++) {
        for (const h of newCourse(course, 9, seeded(seed))) {
          const c = CATEGORY_BY_ID.get(h.cat)!;
          expect(c.retired, `${c.id} is retired`).toBeFalsy();
          expect(c.pins, `${c.id} target ${h.target}`).toContain(h.target);
          expect(perfectAnswers(h)).toHaveLength(1);
        }
      }
    }
  });

  it('is deterministic for a given random sequence (the daily relies on it)', () => {
    expect(newCourse('mixed', 5, seeded(42))).toEqual(newCourse('mixed', 5, seeded(42)));
  });

  it('retired lists still load, so old links keep scoring', () => {
    const retired = CATEGORIES.filter((c) => c.retired);
    expect(retired.length).toBeGreaterThan(0);
    for (const c of retired) expect(CATEGORY_BY_ID.get(c.id)).toBe(c);
  });

  it('an official tiebreak splits level points; identical records still share a place', () => {
    const c = buildCategory({
      ...base,
      tiebreak: 'goal difference, then goals scored',
      items: [
        { id: 'a', name: 'A', value: 10, tb: [5, 9] },
        { id: 'b', name: 'B', value: 10, tb: [3, 9] },
        { id: 'c', name: 'C', value: 10, tb: [3, 7] },
        { id: 'd', name: 'D', value: 8, tb: [0, 4] },
        { id: 'e', name: 'E', value: 8, tb: [0, 4] },
      ],
    });
    expect(c.items.map((it) => [it.lo, it.hi])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 5],
      [4, 5],
    ]);
  });

  it('never pins a zero or a tie', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, name: `I${i}`, value: i < 20 ? 100 - i : i < 30 ? 50 : 0 }));
    const c = buildCategory({ ...base, items });
    for (const p of c.pins) {
      expect(p).toBeLessThanOrEqual(20);
    }
  });
});

describe('search database', () => {
  const cat = buildCategory({
    ...base,
    kind: 'player',
    items: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, value: 100 - i, wd: `Q${i}` })),
  });
  const ents: Entity[] = [
    ['Q900', 'Cesc Fàbregas', 'Spain · b. 1987'],
    ['Q3', 'Player 3', 'England · b. 1990'],
    ['Q901', 'Danny Mills', 'England · b. 1977'],
    ['Q902', 'Danny Mills', 'England · b. 1980'],
    ['Q903', 'Fabrice Muamba', 'England · b. 1988'],
  ].map(([id, name, sub], rank) => {
    const keys = [norm(name)];
    return { id, name, sub, keys, words: keys.map((k) => k.split(' ')), compact: keys.map((k) => k.replace(/ /g, '')), rank };
  });

  it('finds names that are not on the list, without saying so', () => {
    const [s] = suggest(cat, ents, 'fabregas');
    expect(s.name).toBe('Cesc Fàbregas');
    expect(s.item).toBeUndefined();
  });

  it('links names that are on the list to the list entry', () => {
    const [s] = suggest(cat, ents, 'player 3');
    expect(s.item?.id).toBe('p3');
  });

  it('orders equal matches by fame, never by list position', () => {
    expect(suggest(cat, ents, 'fab').map((s) => s.name)).toEqual(['Cesc Fàbregas', 'Fabrice Muamba']);
  });

  it("doesn't guess between two people with the same name", () => {
    expect(exactSuggestion(cat, ents, 'Danny Mills')).toBeUndefined();
    expect(exactSuggestion(cat, ents, 'cesc fabregas')?.name).toBe('Cesc Fàbregas');
  });

  it('falls back to the list when the database is unavailable', () => {
    expect(suggest(cat, null, 'player 1').every((s) => s.item)).toBe(true);
  });
});
