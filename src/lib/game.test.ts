import { describe, expect, it } from 'vitest';
import { buildCategory, CATEGORIES, CATEGORY_BY_ID, type RawCategory } from './data';
import { distance, holeResult, mergeGame, newCourse, obStrokes, ordinal, rankLabel, standings, targetRange, type Game } from './game';
import { decodeGame, encodeGame } from './link';
import { norm, searchItems } from './search';

const raw: RawCategory = {
  id: 'test',
  title: 'Test',
  prompt: 'most test things',
  noun: 'thing',
  nounPlural: 'things',
  metric: 'Points',
  order: 'desc',
  description: 'x',
  tags: ['europe'],
  source: { name: 'x', url: 'https://x', asOf: '2026-01-01' },
  items: [
    { id: 'a', name: 'Alpha', value: 10 },
    { id: 'b', name: 'Bravo Ünited', value: 9, aliases: ['Bravo FC'] },
    { id: 'c', name: 'Charlie', value: 9 },
    { id: 'd', name: 'Delta', value: 9 },
    { id: 'e', name: 'Echo', value: 5 },
    { id: 'f', name: 'Foxtrot Østersund', value: 1 },
  ],
};
const cat = buildCategory(raw);

describe('ranking & ties', () => {
  it('gives tied items a shared range', () => {
    expect([cat.byId.get('b')!.lo, cat.byId.get('b')!.hi]).toEqual([2, 4]);
    expect([cat.byId.get('d')!.lo, cat.byId.get('d')!.hi]).toEqual([2, 4]);
    expect(rankLabel(cat.byId.get('c')!)).toBe('=2nd');
    expect(rankLabel(cat.byId.get('e')!)).toBe('5th');
  });
  it('scores 0 anywhere inside a tie and distance to the nearest edge outside it', () => {
    const c = cat.byId.get('c')!;
    expect(distance(c, 3)).toBe(0);
    expect(distance(c, 2)).toBe(0);
    expect(distance(c, 6)).toBe(2);
    expect(distance(cat.byId.get('a')!, 5)).toBe(4);
  });
  it('makes out of bounds strictly worse than any listed answer', () => {
    for (let t = 1; t <= cat.size; t++) {
      const worst = Math.max(...cat.items.map((it) => distance(it, t)));
      expect(obStrokes(cat, t)).toBeGreaterThan(worst);
    }
  });
});

describe('search', () => {
  it('ignores accents and special letters', () => {
    expect(norm('Østersund Ünited')).toBe('ostersund united');
    expect(searchItems(cat, 'oster').map((i) => i.id)).toEqual(['f']);
    expect(searchItems(cat, 'unit').map((i) => i.id)).toEqual(['b']);
  });
  it('matches aliases', () => {
    expect(searchItems(cat, 'bravo fc')[0].id).toBe('b');
  });
  it('needs 2+ letters', () => {
    expect(searchItems(cat, 'a')).toEqual([]);
  });
  it('never orders suggestions by rank (equal matches are alphabetical)', () => {
    const z = buildCategory({
      ...raw,
      items: [
        { id: 'zeta', name: 'Zeta Town', value: 3 },
        { id: 'zebra', name: 'Zebra', value: 2 },
        { id: 'zed', name: 'Zed', value: 1 },
      ],
    });
    expect(searchItems(z, 'ze').map((i) => i.id)).toEqual(['zebra', 'zed', 'zeta']);
  });
});

describe('ordinals', () => {
  it('handles teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th', '112th',
    ]);
  });
});

describe('real data', () => {
  it('loaded at least one category', () => {
    expect(CATEGORIES.length).toBeGreaterThan(0);
  });
  it('targets are always inside the list', () => {
    for (const c of CATEGORIES) {
      const [lo, hi] = targetRange(c.size);
      expect(lo).toBeGreaterThanOrEqual(1);
      expect(hi).toBeLessThanOrEqual(c.size);
      expect(lo).toBeLessThanOrEqual(hi);
    }
  });
  it('builds courses with distinct categories', () => {
    const holes = newCourse('mixed', 9);
    expect(new Set(holes.map((h) => h.cat)).size).toBe(holes.length);
    for (const h of holes) expect(CATEGORY_BY_ID.get(h.cat)!.items[h.target - 1]).toBeTruthy();
  });
});

describe('share links', () => {
  const holes = newCourse('mixed', 3);
  const first = (i: number) => CATEGORY_BY_ID.get(holes[i].cat)!.items[0].id;
  const game: Game = {
    id: 'abc123xy',
    mode: 'challenge',
    course: 'mixed',
    holes,
    players: [
      { name: 'Hanif', picks: [first(0), '~Wembley', '~'] },
      { name: 'Jay', picks: [null, null, null] },
    ],
    me: 0,
    revealed: 3,
    seen: [],
    createdAt: 0,
    updatedAt: 0,
  };

  it('round-trips finished players only', () => {
    const d = decodeGame(encodeGame(game))!;
    expect(d.id).toBe('abc123xy');
    expect(d.holes).toEqual(holes);
    expect(d.players).toEqual([{ name: 'Hanif', picks: [first(0), '~Wembley', '~'] }]);
  });
  it('scores off-list picks as out of bounds', () => {
    const r = holeResult(holes[1], '~Wembley');
    expect(r.offList).toBe('Wembley');
    expect(r.verdict?.tone).toBe('ob');
  });
  it('rejects garbage', () => {
    expect(decodeGame('not-a-real-code')).toBeNull();
    expect(decodeGame('')).toBeNull();
    const truncated = encodeGame(game).slice(0, 20);
    expect(decodeGame(truncated)).toBeNull();
  });
  it('merges a returned card without touching mine', () => {
    const mineDone: Game = { ...game, players: [game.players[0]] };
    const back: Game = { ...game, me: null, players: [game.players[0], { name: 'Jay', picks: [first(0), first(1), first(2)] }] };
    const merged = mergeGame(mineDone, back);
    expect(merged.players.map((p) => p.name)).toEqual(['Hanif', 'Jay']);
    expect(merged.players[0].picks).toEqual(game.players[0].picks);
    const s = standings(merged);
    expect(s.length).toBe(2);
  });
});
