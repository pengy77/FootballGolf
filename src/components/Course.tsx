import type { CSSProperties, ReactNode, Ref } from 'react';
import { ordinal, type HoleResult } from '../lib/game';
import { PinFlag } from './art';

/**
 * The ranked list drawn as a golf hole, seen from above: rank 1 at the top, the last entry at the
 * bottom, the flag planted at the target. Terrain rings the flag in bands that match the verdicts in
 * lib/game (verdictFor), so wherever a ball lands is what the verdict says: on the green, in the
 * rough, in the water. Off the list is out of bounds, in the trees either side.
 */

export type Terrain = 'cup' | 'green' | 'fairway' | 'rough' | 'sand' | 'water' | 'ob';

/** Mirrors verdictFor: the terrain a pick this far off lands on. */
export function terrainFor(r: HoleResult, size: number): Terrain {
  if (!r.item) return 'ob';
  const d = r.raw;
  if (d === 0) return 'cup';
  if (d <= 5) return 'green';
  const f = d / size;
  if (f <= 0.15) return 'fairway';
  if (f <= 0.3) return 'rough';
  if (f <= 0.5) return 'sand';
  return 'water';
}

/** How far each band reaches from the pin, in places (whole places only, like the verdicts). */
function bands(size: number) {
  const green = 5;
  const fairway = Math.max(green, Math.floor(size * 0.15));
  const rough = Math.max(fairway, Math.floor(size * 0.3));
  const sand = Math.max(rough, Math.floor(size * 0.5));
  return { green, fairway, rough, sand };
}

/** A slice of the list in view, in rank units: [top edge, bottom edge]. */
export type View = [number, number];

export const wholeList = (size: number): View => [0.5, size + 0.5];

/** Frame the pin and every ball that landed on the list, with room around them: the "zoom to the green". */
export function framing(size: number, target: number, ranks: number[]): View {
  const all = [target, ...ranks];
  let lo = Math.min(...all) - 0.5;
  let hi = Math.max(...all) + 0.5;
  const pad = Math.max(2, (hi - lo) * 0.22);
  lo -= pad;
  hi += pad;
  const min = Math.min(11, size);
  if (hi - lo < min) {
    const c = (lo + hi) / 2;
    lo = c - min / 2;
    hi = c + min / 2;
  }
  const span = Math.min(hi - lo, size);
  if (lo < 0.5) [lo, hi] = [0.5, 0.5 + span];
  if (hi > size + 0.5) [lo, hi] = [size + 0.5 - span, size + 0.5];
  return [lo, hi];
}

/** Rank → % from the top of the scene. */
export type YScale = (rank: number) => number;

export function scale(view: View, top: number, bottom: number): YScale {
  return (rank) => top + ((rank - view[0]) / (view[1] - view[0])) * (bottom - top);
}

/** Yardage markers down the left edge. */
function markers(view: View, size: number, target: number): number[] {
  const span = view[1] - view[0];
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => span / s <= 8) ?? 100;
  const out: number[] = [];
  const from = Math.max(step, Math.ceil(view[0] / step) * step);
  for (let r = from; r <= Math.min(size, view[1]); r += step) out.push(r);
  if (view[0] <= 1 && step > 1) out.unshift(1);
  if (view[1] >= size && out[out.length - 1] !== size) {
    if (out.length && size - out[out.length - 1] < step * 0.5) out.pop();
    out.push(size);
  }
  // The pin has its own marker.
  return out.filter((r) => Math.abs(r - target) >= Math.max(1, step * 0.45));
}

const pct = (n: number) => `${n}%`;

export function Course({
  size,
  target,
  view,
  top = 12,
  bottom = 80,
  pin,
  tee,
  className,
  sceneRef,
  onTap,
  children,
}: {
  size: number;
  target: number;
  view: View;
  /** Where the top and bottom of the view sit, in % of the scene's height. */
  top?: number;
  bottom?: number;
  /** The answer on the pin's plate, once revealed. */
  pin?: { name: string; value?: string } | null;
  /** Show the tee box at the bottom. */
  tee?: boolean;
  className?: string;
  sceneRef?: Ref<HTMLDivElement>;
  onTap?: () => void;
  children?: (y: YScale) => ReactNode;
}) {
  const y = scale(view, top, bottom);
  const b = bands(size);
  const band = (half: number): CSSProperties => {
    const a = Math.max(0.5, target - half - 0.5);
    const z = Math.min(size + 0.5, target + half + 0.5);
    return { top: pct(y(a)), height: pct(y(z) - y(a)) };
  };
  const ticks = markers(view, size, target);

  return (
    <div className={`course c-scene${className ? ` ${className}` : ''}`} onClick={onTap} ref={sceneRef}>
      <div className="c-list" style={band(Infinity)}>
        <span className="c-stakes c-stakes-l" />
        <span className="c-stakes c-stakes-r" />
      </div>
      <div className="c-band c-sand" style={band(b.sand)} />
      <div className="c-band c-rough" style={band(b.rough)} />
      {b.fairway > b.green && <div className="c-band c-fairway" style={band(b.fairway)} />}
      <div className="c-band c-green" style={band(b.green)} />

      <div className="c-ticks" aria-hidden="true">
        {ticks.map((r) => (
          <span key={r} className="c-tick" style={{ top: pct(y(r)) }}>
            {r}
          </span>
        ))}
        <span className="c-tick is-pin" style={{ top: pct(y(target)) }}>
          {target}
        </span>
      </div>

      <div className="c-pin" style={{ top: pct(y(target)) }}>
        <span className="c-cup" />
        <PinFlag height={38} />
        <div className={`c-plate${pin ? ' is-open' : ''}`} aria-live="polite">
          <span className="c-plate-rank">{ordinal(target)}</span>
          {pin ? (
            <span className="c-plate-name" key="name">
              {pin.name}
              {pin.value && <small>{pin.value}</small>}
            </span>
          ) : (
            <span className="c-plate-q" aria-label="Hidden until the reveal">
              ?
            </span>
          )}
        </div>
      </div>

      {tee && (
        <div className="c-tee" aria-hidden="true">
          <i />
          <i />
        </div>
      )}
      {children?.(y)}
    </div>
  );
}
