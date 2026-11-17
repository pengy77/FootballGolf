import { describe, expect, it } from 'vitest';
import { buildCategory, CATEGORIES, CATEGORY_BY_ID, type RawCategory } from './data';
import { distance, HOLE_MAX, holeResult, mergeGame, newCourse, obBreakdown, obStrokes, ordinal, rankLabel, standings, targetRange, type Game } from './game';
import { decodeGame, encodeGame } from './link';
import { norm, searchItems } from './search';
import { findGame, mergeSaved } from './store';

const raw: RawCategory = {
  id: 'test',
  title: 'Test',
  prompt: 'most test things',
  noun: 'thing',
  nounPlural: 'things',
  kind: 'club',
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
    expect(rankLabel(cat.byId.get('c')!).replace(/\u2060/g, '')).toBe('2–4th');
    expect(rankLabel(cat.byId.get('e')!)).toBe('5th');
  });
  it('scores 0 anywhere inside a tie and distance to the nearest edge outside it', () => {
    const c = cat.byId.get('c')!;
    expect(distance(c, 3)).toBe(0);
    expect(distance(c, 2)).toBe(0);
    expect(distance(c, 6)).toBe(2);
    expect(distance(cat.byId.get('a')!, 5)).toBe(4);
  });
  it('makes out of bounds worse than any listed answer (up to the hole cap)', () => {
    for (let t = 1; t <= cat.size; t++) {
      const worst = Math.max(...cat.items.map((it) => distance(it, t)));
      expect(obStrokes(cat, t)).toBe(Math.min(worst + 1, HOLE_MAX));
    }
  });
  it('explains out of bounds with the furthest answer on the list', () => {
    // The Ancelotti hole: 53 managers, flag on 45th. 1st is 44 off, so 45, capped at 40.
    const m = CATEGORY_BY_ID.get('pl-manager-matches')!;
    const pin = 45;
    const ob = obBreakdown(m, pin);
    const furthest = m.items.find((it) => it.lo <= ob.rank && ob.rank <= it.hi)!;
    expect(distance(furthest, pin)).toBe(ob.off);
    expect(ob.strokes).toBe(obStrokes(m, pin));
    expect(ob.capped).toBe(ob.off + 1 > HOLE_MAX);
    expect(obBreakdown(cat, 2)).toEqual({ rank: cat.size, off: cat.size - 2, strokes: cat.size - 1, capped: false });
  });
  it('caps every hole at HOLE_MAX', () => {
    for (const c of CATEGORIES) {
      for (const t of [1, Math.ceil(c.size / 2), c.size]) {
        expect(obStrokes(c, t)).toBeLessThanOrEqual(HOLE_MAX);
        for (const it of c.items) expect(holeResult({ cat: c.id, target: t }, it.id).strokes).toBeLessThanOrEqual(HOLE_MAX);
      }
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

describe('review fixes', () => {
  const holes = newCourse('mixed', 3);
  const id = (h: number, k: number) => CATEGORY_BY_ID.get(holes[h].cat)!.items[k].id;
  const base: Game = {
    id: 'abcd2345', mode: 'challenge', course: 'mixed', holes,
    players: [{ name: 'Ann', picks: [id(0, 0), id(1, 0), id(2, 0)] }],
    me: 0, revealed: 3, seen: ['Ann'], createdAt: 0, updatedAt: 1,
  };

  it('keeps two different people who chose the same name', () => {
    const b = { players: [base.players[0], { name: 'Sam', picks: [id(0, 1), id(1, 1), id(2, 1)] }] };
    const c = { players: [base.players[0], { name: 'Sam', picks: [id(0, 2), id(1, 2), id(2, 2)] }] };
    const merged = mergeGame(mergeGame(base, b), c);
    expect(merged.players.map((p) => p.name)).toEqual(['Ann', 'Sam', 'Sam (2)']);
    // Re-opening the same links changes nothing.
    expect(mergeGame(mergeGame(merged, b), c).players.length).toBe(3);
  });

  it('scrambles links so picks are not readable, and still reads plain v1 links', () => {
    const code = encodeGame(base);
    expect(code.startsWith('2')).toBe(true);
    expect(atob(code.slice(1).replace(/-/g, '+').replace(/_/g, '/'))).not.toContain(id(0, 0));
    expect(decodeGame(code)!.players[0].picks).toEqual(base.players[0].picks);
    const v1 = btoa(JSON.stringify({ v: 1, i: 'abcd2345', c: 'mixed', h: holes.map((h) => [h.cat, h.target]), p: [] }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeGame(v1)!.holes).toEqual(holes);
  });

  it('clamps a target that no longer fits a shrunken list instead of rejecting the link', () => {
    const cat = CATEGORY_BY_ID.get(holes[0].cat)!;
    const v1 = btoa(JSON.stringify({ v: 1, i: 'abcd2345', c: 'mixed', h: [[cat.id, cat.size + 50]], p: [] }));
    expect(decodeGame(v1)!.holes[0].target).toBe(cat.size);
  });

  it("can't be crashed by a game id like 'constructor'", () => {
    expect(findGame({ name: '', seenHowTo: false, games: {} }, 'constructor')).toBeUndefined();
  });

  it('merges saved state from two tabs, keeping the newest copy of each game', () => {
    const older = { ...base, updatedAt: 1 };
    const newer = { ...base, updatedAt: 2, players: [...base.players, { name: 'Bo', picks: base.players[0].picks }] };
    const tabA = { name: 'Ann', seenHowTo: true, games: { [base.id]: older } };
    const tabB = { name: 'Ann', seenHowTo: false, games: { [base.id]: newer, other1: { ...base, id: 'other1' } } };
    const m = mergeSaved(tabA, tabB);
    expect(m.games[base.id].players.length).toBe(2);
    expect(Object.keys(m.games).sort()).toEqual([base.id, 'other1'].sort());
  });
});
