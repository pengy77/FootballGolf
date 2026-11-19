import { describe, expect, it } from 'vitest';
import { layoutRows } from './Reveal';

// Southampton (11th) one place off Blackburn's flag (12th), zoomed to ranks 6–17 at 32px a place:
// the guess used to lose its row because it would have overlapped the flag's.
const at = (pos: number) => 40 + (pos - 6) * 32;
const base = { first: 6, last: 17, target: 12, pin: 12, at, lo: 18, hi: 500 };

describe('reveal leaderboard rows', () => {
  it('a guess one place off the flag still gets its row, nudged clear, with the flag on its rank', () => {
    const rows = layoutRows({ ...base, picks: [11] });
    const pin = rows.find((r) => r.pos === 12)!;
    const pick = rows.find((r) => r.pos === 11)!;
    expect(pin).toMatchObject({ y: at(12), jog: 0 });
    expect(pick).toBeDefined();
    expect(pin.y - pick.y).toBeGreaterThanOrEqual(36);
    expect(pick.jog).toBe(at(11) - pick.y);
    expect(pick.jog).toBeGreaterThan(0);
  });

  it('every row keeps clear of the others', () => {
    const rows = layoutRows({ ...base, picks: [11, 13, 10] }).sort((a, b) => a.y - b.y);
    expect(rows.map((r) => r.pos)).toEqual(expect.arrayContaining([10, 11, 12, 13]));
    for (let i = 1; i < rows.length; i++) expect(rows[i].y - rows[i - 1].y).toBeGreaterThanOrEqual(24);
  });

  it('far apart, nothing moves', () => {
    const rows = layoutRows({ ...base, picks: [7] });
    for (const r of rows) expect(r.jog).toBe(0);
  });

  it('stays inside the scene', () => {
    const rows = layoutRows({ ...base, first: 1, target: 2, pin: 2, picks: [1], at: (p) => 20 + (p - 1) * 10 });
    for (const r of rows) expect(r.y).toBeGreaterThanOrEqual(18);
    expect(rows.find((r) => r.pos === 1)).toBeDefined();
  });
});
