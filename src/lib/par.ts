import type { Hole } from './game';

/**
 * Par for a hole: how many places off a decent guess usually lands. It grows with the pin's depth,
 * because the further down a list you go, the less anyone knows it (8th most PL goals is par 3;
 * 56th biggest stadium is par 17). Display only: the winner is still whoever has fewest strokes.
 */
export const PAR_PER_PLACE = 0.3;
export const PAR_MIN = 3;

export function parFor(hole: Hole): number {
  return Math.max(PAR_MIN, Math.round(hole.target * PAR_PER_PLACE));
}

export function coursePar(holes: Hole[]): number {
  return holes.reduce((s, h) => s + parFor(h), 0);
}

/** Golf style: "−2", "E", "+5". */
export function toPar(diff: number): string {
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `−${-diff}`;
}

export function toParWords(diff: number): string {
  if (diff === 0) return 'Level par';
  return diff > 0 ? `${diff} over par` : `${-diff} under par`;
}
