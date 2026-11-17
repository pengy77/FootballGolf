import { describe, expect, it } from 'vitest';
import { coursePar, parFor, toPar, toParWords } from './par';

const hole = (target: number) => ({ cat: 'x', target });

describe('par', () => {
  it('is at least 3 and grows with the depth of the pin', () => {
    expect(parFor(hole(2))).toBe(3);
    expect(parFor(hole(8))).toBe(3);
    expect(parFor(hole(17))).toBe(5);
    expect(parFor(hole(56))).toBe(17);
    expect(parFor(hole(100))).toBe(30);
  });

  it('adds up over a course', () => {
    expect(coursePar([hole(8), hole(56), hole(17)])).toBe(25);
  });

  it('reads like golf', () => {
    expect(toPar(0)).toBe('E');
    expect(toPar(4)).toBe('+4');
    expect(toPar(-2)).toBe('−2');
    expect(toParWords(0)).toBe('Level par');
    expect(toParWords(30)).toBe('30 over par');
    expect(toParWords(-1)).toBe('1 under par');
  });
});
