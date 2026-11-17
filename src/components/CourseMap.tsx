import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Ball } from './art';

/**
 * A round's course seen from above, the way a course guide draws it: hole 1's tee at the bottom,
 * each hole doglegging across and up the screen to its green, the last green at the top. It's the
 * home screen's play surface, so it isn't a picture with buttons under it: your ball sits on the
 * next tee and the shot button rides beside it, played greens carry their strokes as the scorecard's
 * pencil marks, and a finished round leaves the ball in the last cup.
 *
 * Everything is laid out in pixels from the box's measured size, so the art never stretches and the
 * HTML on top (ball, marks, button) lines up with the SVG underneath at any phone size.
 */

type P = { x: number; y: number };

export interface MapMark {
  strokes: number;
  /** Pencil mark class from the scorecard: mk-ace, mk-circle, mk-box2 or mk-plain. */
  mark: string;
  label: string;
}

interface Geo {
  tee: P;
  bend: P;
  green: P;
  ltr: boolean;
  fairway: string;
}

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

function layout(n: number, w: number, h: number) {
  const top = 44;
  const bottom = 34;
  const band = (h - top - bottom) / n;
  const fw = Math.max(13, Math.min(30, band * 0.3, w * 0.075));
  const holes: Geo[] = [];
  for (let i = 0; i < n; i++) {
    const yb = h - bottom - i * band;
    const yt = yb - band;
    const ltr = i % 2 === 0;
    const x = (f: number) => (ltr ? w * f : w * (1 - f));
    const tee = { x: x(0.18), y: yb - band * 0.22 };
    const green = { x: x(0.78), y: yt + band * 0.42 };
    // Runs flat off the tee, then bends up to the green: a dogleg.
    const bend = { x: x(0.66), y: tee.y };
    holes.push({ tee, bend, green, ltr, fairway: `M${tee.x} ${tee.y} Q${bend.x} ${bend.y} ${green.x} ${green.y}` });
  }
  return { holes, fw, band };
}

/** A clump of trees: a few overlapping canopies, the same every render. */
function Trees({ at, r, seed }: { at: P; r: number; seed: number }) {
  const offs = [
    [0, 0, 1],
    [0.9, 0.35, 0.8],
    [-0.75, 0.45, 0.72],
    [0.25, -0.75, 0.66],
  ].slice(0, 2 + (seed % 3));
  return (
    <g className="cm-trees">
      {offs.map(([dx, dy, k], i) => (
        <g key={i}>
          <circle cx={at.x + dx * r} cy={at.y + dy * r + r * 0.25} r={r * k} fill="#072611" opacity="0.55" />
          <circle cx={at.x + dx * r} cy={at.y + dy * r} r={r * k} fill="#0d3a1b" />
          <circle cx={at.x + dx * r - r * k * 0.3} cy={at.y + dy * r - r * k * 0.3} r={r * k * 0.45} fill="#1a5228" />
        </g>
      ))}
    </g>
  );
}

export function CourseMap({
  count,
  at,
  marks,
  cta,
  onBall,
  onHole,
  label,
  className,
  others,
}: {
  count: number;
  /** The hole whose tee the ball is on; `count` once the round's done (the ball's in the last cup). */
  at: number;
  /** Strokes per hole, null where it hasn't been played (or its reveal hasn't been seen). */
  marks: (MapMark | null)[];
  /** The shot button (or the name field that stands in for it), placed beside the ball. */
  cta?: ReactNode;
  onBall?: () => void;
  onHole?: (i: number) => void;
  label: string;
  className?: string;
  /** Players who've already gone round: their balls sit by the last cup. */
  others?: { key: string | number; fill: string; name: string }[];
}) {
  const [ref, { w, h }] = useBox<HTMLDivElement>();
  const ready = w > 0 && h > 0;
  const { holes, fw, band } = ready ? layout(count, w, h) : { holes: [] as Geo[], fw: 20, band: 80 };
  const done = at >= count;
  const cur = holes[Math.min(at, count - 1)];
  const ballAt = cur ? (done ? { x: cur.green.x, y: cur.green.y } : cur.tee) : null;
  const tree = Math.max(7, Math.min(13, fw * 0.48));

  return (
    <div className={`cmap${done ? ' is-done' : ''}${className ? ` ${className}` : ''}`} ref={ref} role="group" aria-label={label}>
      {ready && (
        <svg className="cm-art" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          {/* Trees in the spare ground beside each hole, then the cart path from green to next tee. */}
          {holes.map((g, i) => {
            const x = (f: number) => (g.ltr ? w * f : w * (1 - f));
            return (
              <g key={`t${i}`}>
                <Trees at={{ x: x(0.36), y: g.green.y - band * 0.02 }} r={tree} seed={i} />
                <Trees at={{ x: x(0.05), y: g.tee.y - band * 0.42 }} r={tree * 0.9} seed={i + 1} />
                {i % 2 === 1 && <Trees at={{ x: x(0.96), y: g.tee.y + band * 0.05 }} r={tree * 0.8} seed={i + 2} />}
              </g>
            );
          })}
          {holes.slice(0, -1).map((g, i) => (
            <path
              key={`p${i}`}
              className="cm-path"
              d={`M${g.green.x} ${g.green.y + fw * 0.7} C${g.green.x + (g.ltr ? 1 : -1) * fw * 1.6} ${g.green.y + fw * 0.4}, ${holes[i + 1].tee.x + (g.ltr ? 1 : -1) * fw} ${holes[i + 1].tee.y + fw}, ${holes[i + 1].tee.x} ${holes[i + 1].tee.y + fw * 0.45}`}
            />
          ))}
          {holes.map((g, i) => {
            const played = !!marks[i];
            const out = g.ltr ? 1 : -1;
            // A pond off the far side of some greens, a bunker beside the rest.
            const pond = i % 3 === 1;
            return (
              <g key={i} className={`cm-hole${played ? ' is-played' : ''}${i === at ? ' is-next' : ''}`}>
                {pond && (
                  <g className="cm-water">
                    <ellipse cx={g.green.x + out * fw * 1.3} cy={g.green.y + fw * 0.35} rx={fw * 0.85} ry={fw * 0.58} />
                    <path d={`M${g.green.x + out * fw * 1.3 - fw * 0.1} ${g.green.y + fw * 0.3}h${fw * 0.45}M${g.green.x + out * fw * 1.3 - fw * 0.35} ${g.green.y + fw * 0.55}h${fw * 0.3}`} />
                  </g>
                )}
                <path className="cm-edge" d={g.fairway} strokeWidth={fw + 9} />
                <path className="cm-rough" d={g.fairway} strokeWidth={fw + 5} />
                <path className="cm-fairway" d={g.fairway} strokeWidth={fw} />
                <path className="cm-mow" d={g.fairway} strokeWidth={fw} strokeDasharray={`${fw * 0.45} ${fw * 0.45}`} />
                {!pond && <ellipse className="cm-sand" cx={g.green.x + out * fw * 1.05} cy={g.green.y + fw * 0.55} rx={fw * 0.5} ry={fw * 0.3} />}
                <ellipse className="cm-green" cx={g.green.x} cy={g.green.y} rx={fw * 1.02} ry={fw * 0.74} />
                <rect className="cm-tee" x={g.tee.x - fw * 0.5} y={g.tee.y - fw * 0.28} width={fw} height={fw * 0.56} rx={fw * 0.16} />
                <ellipse className="cm-cup" cx={g.green.x} cy={g.green.y} rx={Math.max(2.6, fw * 0.14)} ry={Math.max(1.4, fw * 0.08)} />
                <path className="cm-pole" d={`M${g.green.x} ${g.green.y}V${g.green.y - fw * 1.25}`} />
                <path
                  className="pin-pennant cm-pennant"
                  d={`M${g.green.x + 1} ${g.green.y - fw * 1.24}l${fw * 0.62} ${fw * 0.2}l${-fw * 0.62} ${fw * 0.2}Z`}
                  style={{ animationDelay: `${-i * 0.37}s` }}
                />
              </g>
            );
          })}
          {/* The next shot: a dotted line from the ball to the flag. */}
          {!done && cur && (
            <path
              className="cm-aim"
              d={`M${cur.tee.x} ${cur.tee.y} Q${(cur.tee.x + cur.green.x) / 2} ${Math.min(cur.tee.y, cur.green.y) - band * 0.45} ${cur.green.x} ${cur.green.y - 2}`}
            />
          )}
        </svg>
      )}

      {ready &&
        holes.map((g, i) => {
          const m = marks[i];
          const hole = (
            <span className="cm-num" style={{ left: g.tee.x + (g.ltr ? -1 : 1) * fw * 1.05, top: g.tee.y }} aria-hidden="true">
              {i + 1}
            </span>
          );
          if (!m) return <span key={i}>{hole}</span>;
          // Sized to the hole and set just clear of the green, on the side facing the middle of the course.
          const mz = Math.round(Math.max(30, Math.min(38, fw * 1.45)));
          const style = {
            left: g.green.x + (g.ltr ? -1 : 1) * (fw * 1.02 + mz / 2 + 3),
            top: g.green.y - fw * 0.1,
            width: mz,
            height: mz,
            '--mk-size': `${mz - 12}px`,
            '--mk-font': `${Math.round(mz * 0.42)}px`,
            animationDelay: `${i * 70}ms`,
          } as CSSProperties;
          return (
            <span key={i}>
              {hole}
              {onHole ? (
                <button type="button" className={`cm-mark csc-s ${m.mark}`} style={style} aria-label={m.label} onClick={() => onHole(i)}>
                  <i>{m.strokes}</i>
                </button>
              ) : (
                <span className={`cm-mark csc-s ${m.mark}`} style={style} aria-label={m.label}>
                  <i>{m.strokes}</i>
                </span>
              )}
            </span>
          );
        })}

      {ready && ballAt && (
        <button
          type="button"
          className={`cm-ball${done ? ' is-holed' : ''}`}
          style={{ left: ballAt.x, top: ballAt.y }}
          onClick={onBall}
          tabIndex={-1}
          aria-hidden="true"
        >
          <Ball size={done ? 18 : Math.round(Math.max(24, Math.min(32, fw * 1.1)))} />
        </button>
      )}

      {ready &&
        others &&
        holes.length > 0 &&
        others.slice(0, 4).map((o, j) => {
          const last = holes[holes.length - 1];
          const spread = (j - (Math.min(others.length, 4) - 1) / 2) * 15;
          return (
            <span
              key={o.key}
              className="cm-other"
              style={{ left: last.green.x + spread + (last.ltr ? -fw * 0.35 : fw * 0.35), top: last.green.y + fw * 0.3, animationDelay: `${j * 90}ms` }}
              title={o.name}
            >
              <Ball size={17} fill={o.fill} />
            </span>
          );
        })}

      {ready && cta && cur && !done && (
        <div
          className={`cm-cta${cur.ltr ? ' is-right' : ' is-left'}`}
          style={cur.ltr ? { left: cur.tee.x + fw * 0.6 + 14, top: cur.tee.y } : { right: w - cur.tee.x + fw * 0.6 + 14, top: cur.tee.y }}
        >
          {cta}
        </div>
      )}
    </div>
  );
}
