import { describe, expect, it } from 'vitest';
import { DAILY_HOLES, dailyHoles } from './daily';
import { buildCategory, CATEGORIES, CATEGORY_BY_ID, drawGroups, LIVE_CATEGORIES, poolSize, type RawCategory } from './data';
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
      // A fame floor trades variety for answers people know (scripts/validate-data.mjs: MIN_FAMOUS_PINS).
      expect(c.pins.length, c.id).toBeGreaterThanOrEqual(c.minFame === undefined ? 12 : 8);
      for (const p of c.pins) {
        const at = c.items.filter((it) => it.lo <= p && p <= it.hi);
        expect(at.length, `${c.id} pin ${p}`).toBe(1);
        expect(at[0].value, `${c.id} pin ${p}`).not.toBe(0);
      }
    }
  });

  it('a fame floor keeps holes on names people know, while the whole list still scores', () => {
    const c = buildCategory({
      ...base,
      minFame: 40,
      items: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, value: 100 - i, fame: i % 2 ? 80 : 10 })),
    });
    expect(c.pins.length).toBeGreaterThan(0);
    for (const p of c.pins) expect(c.items[p - 1].fame).toBe(80);
    expect(c.size).toBe(30);
    for (const cat of LIVE_CATEGORIES.filter((x) => x.minFame !== undefined))
      for (const p of cat.pins) expect(cat.items[p - 1].fame ?? 0, `${cat.id} pin ${p}`).toBeGreaterThanOrEqual(cat.minFame!);
  });

  it('every question says what to name (the hole shows that word in yellow)', () => {
    for (const c of CATEGORIES) expect(c.prompt, c.id).toMatch(new RegExp(`\\b${c.noun}\\b`, 'i'));
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

  it('standings never share a place, even level on points or out of points order', () => {
    // 2nd and 3rd are level (split by head-to-head); 5th has more points than 4th (points per game).
    const values = [80, 70, 70, 60, 61, ...Array.from({ length: 15 }, (_, i) => 50 - i)];
    const c = buildCategory({
      ...base,
      standings: true,
      tiebreak: 'head-to-head points',
      items: values.map((value, i) => ({ id: `c${i}`, name: `C${i}`, value })),
    });
    expect(c.items.every((it) => it.lo === it.pos && it.hi === it.pos)).toBe(true);
    expect(c.pins).toEqual(Array.from({ length: 16 }, (_, i) => i + 2)); // every place from 2nd to 17th
  });
});

describe('season tables', () => {
  const seasonal = LIVE_CATEGORIES.filter((c) => c.series);
  const seriesOf = (id: string) => CATEGORY_BY_ID.get(id)!.series ?? id;

  it('every season list is official standings with a tiebreak, one file per season', () => {
    expect(seasonal.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const c of seasonal) {
      expect(c.standings, c.id).toBe(true);
      expect(c.tiebreak, c.id).toBeTruthy();
      expect(seen.has(`${c.series}|${c.season}`), c.id).toBe(false);
      seen.add(`${c.series}|${c.season}`);
    }
  });

  it('counts a series once, so a course never deals two seasons of the same table', () => {
    const groups = drawGroups(LIVE_CATEGORIES);
    expect(groups.length).toBe(new Set(LIVE_CATEGORIES.map((c) => c.series ?? c.id)).size);
    expect(poolSize('mixed')).toBe(groups.length);
    let seasonsDealt = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const holes = newCourse('mixed', 9, seeded(seed));
      expect(new Set(holes.map((h) => seriesOf(h.cat))).size).toBe(holes.length);
      seasonsDealt += holes.filter((h) => CATEGORY_BY_ID.get(h.cat)!.series).length;
    }
    expect(seasonsDealt).toBeGreaterThan(0);
  });

  it('the daily takes at most one season per series, the same on every run', () => {
    for (let d = 1; d <= 60; d++) {
      const key = `202612${String((d % 28) + 1).padStart(2, '0')}`;
      const holes = dailyHoles(key);
      expect(holes).toHaveLength(DAILY_HOLES);
      expect(new Set(holes.map((h) => seriesOf(h.cat))).size).toBe(DAILY_HOLES);
      expect(dailyHoles(key)).toEqual(holes);
    }
  });

  it('a list outside any series keeps its own id as its draw key (so its daily score never changes)', () => {
    for (const g of drawGroups(LIVE_CATEGORIES)) {
      if (g.cats.length === 1 && !g.cats[0].series) expect(g.key).toBe(g.cats[0].id);
      else expect(g.cats.every((c) => c.series === g.key)).toBe(true);
    }
  });

  it('a pool without series deals exactly what it did before series existed', () => {
    const lone = LIVE_CATEGORIES.filter((c) => !c.series);
    // The old draw: shuffle the lists, then one rand() per hole for the pin.
    const old = (rand: () => number) => {
      const cats = [...lone];
      for (let i = cats.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [cats[i], cats[j]] = [cats[j], cats[i]];
      }
      return cats.slice(0, 5).map((c) => ({ cat: c.id, target: c.pins[Math.floor(rand() * c.pins.length)] }));
    };
    const byId = [...lone].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (let seed = 1; seed <= 50; seed++) {
      // drawGroups orders lone lists as given, so compare on the same input order.
      expect(newCourse('mixed', 5, seeded(seed), lone)).toEqual(old(seeded(seed)));
      expect(newCourse('mixed', 5, seeded(seed), byId).length).toBe(5);
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
