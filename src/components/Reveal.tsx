import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CATEGORY_BY_ID, formatValue } from '../lib/data';
import { holeResult, nearestRank, ordinal, perfectAnswers, pickLabel, type Game } from '../lib/game';
import { buzz } from '../lib/share';
import { Ball, BALL_FILL } from './art';
import { Confetti } from './Confetti';
import { Course, framing, scale, terrainFor, wholeList, type Terrain, type YScale } from './Course';
import { HoleCard } from './HoleCard';
import { HoleSheet } from './HoleSheet';
import { TEE_Y, teeX } from './Tee';
import { Icons } from './ui';

/**
 * The payoff. Told in the order a player wants it:
 *   1. how close was I?  the ball flies, lands at its rank, the camera frames ball and flag, the gap is measured
 *   2. who was right?    the flag's row turns over
 *   3. what's the list?  the ranks around it fill in, lined up with the fairway
 *   4. my score          the gap flies down into the scorecard and the total ticks up
 * Tap anywhere to skip to the end. `onSettled` fires once it's all on screen.
 */

const LAUNCH = 200;
const STAGGER = 380;
const FLY = 950;
const ZOOM = 650;
const COUNT = 520;

const SKIP_EVENT = 'fg:reveal-skip';

function strokesBefore(game: Game, p: number, hole: number): number {
  return game.holes.slice(0, hole).reduce((s, h, i) => s + holeResult(h, game.players[p].picks[i] ?? null).strokes, 0);
}

/** Counts up from `from` to `to` once `run` is set. */
function CountUp({ from = 0, to, run, instant, ms = COUNT }: { from?: number; to: number; run: boolean; instant?: boolean; ms?: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (instant) return;
    if (!run) return setV(from);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setV(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, from, to, ms, instant]);
  return <>{instant ? (run ? to : from) : v}</>;
}

function useHeight<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [h, setH] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setH(el.clientHeight || fallback);
    const ro = new ResizeObserver(() => setH(el.clientHeight || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, h] as const;
}

type Flight = { key: number; x: number; y: number; dx: number; dy: number; text: string; fill: string };

type Span = [number, number];

/** The spot nearest `want` where something `size` tall fits inside [lo, hi] without touching any of `taken`. */
function nearestClear(want: number, size: number, taken: Span[], lo: number, hi: number): number | null {
  const half = size / 2;
  const fits = (c: number) => c - half >= lo - 0.01 && c + half <= hi + 0.01 && taken.every(([a, b]) => c + half <= a + 0.01 || c - half >= b - 0.01);
  const options = [want, ...taken.flatMap(([a, b]) => [a - half, b + half])].filter(fits);
  return options.length ? options.reduce((best, c) => (Math.abs(c - want) < Math.abs(best - want) ? c : best)) : null;
}

/**
 * Where each ball comes down and where its count sits, in % of the scene's height.
 * A pick on the list lands at its rank, with its count on the tape halfway to the flag, or past the
 * ball when they're too close for it to fit between. Out of bounds lands in the trees, clear of the flag.
 * With several players everything shares one narrow column, so each count and each out-of-bounds ball
 * moves to the nearest clear spot rather than covering someone else's ball, count or tape.
 */
function placeShots(
  shots: { i: number; r: { offList?: string }; rank: number | null; terrain: Terrain }[],
  solo: boolean,
  target: number,
  y: YScale,
  top: number,
  bottom: number,
  sceneH: number,
): { ball: number; bubble: number }[] {
  const px = (p: number) => (p / 100) * sceneH;
  const pin = px(y(target));
  const half = solo ? 58 : 28; // half the count's height when it sits on the tape
  const out = shots.map((s) => {
    const ball = s.rank !== null ? px(y(s.rank)) : pin;
    if (s.rank === null || s.terrain === 'cup') return { ball, bubble: ball };
    if (Math.abs(ball - pin) >= half * 2) return { ball, bubble: (ball + pin) / 2 };
    const past = ball + (ball >= pin ? 1 : -1) * (half + 4);
    return { ball, bubble: Math.max(half, Math.min(sceneH - half, past)) };
  });
  const onList = shots.filter((s) => s.rank !== null);
  const pinAbove = pin > px(52);

  if (solo) {
    // Out of bounds: on whichever side of the flag has more room.
    for (const s of shots) {
      if (s.rank !== null) continue;
      const ball = pinAbove ? Math.max(px(14), pin - 100) : Math.min(px(88), pin + 100);
      out[s.i] = { ball, bubble: ball };
    }
  } else {
    const BALL = 13;
    const lo = px(top);
    const hi = px(bottom);
    const taken: Span[] = onList.map((s) => [out[s.i].ball - BALL, out[s.i].ball + BALL]);
    for (const s of onList) {
      if (s.terrain === 'cup') continue;
      const c = nearestClear(out[s.i].bubble, 30, taken, lo, hi) ?? out[s.i].bubble;
      out[s.i].bubble = c;
      taken.push([c - 15, c + 15]);
    }
    // Out-of-bounds counts reach across the whole fairway, so they also keep off the flag and every
    // tape, preferring the side of the flag the other balls aren't on.
    const flag: Span = [pin - 44, pin + 10];
    const tapes: Span[] = onList.map((s) => [Math.min(out[s.i].ball, pin) - BALL, Math.max(out[s.i].ball, pin) + BALL]);
    const ups = onList.some((s) => s.rank! < target);
    const downs = onList.some((s) => s.rank! > target);
    const above = ups !== downs ? downs : pinAbove;
    for (const s of shots) {
      if (s.rank !== null) continue;
      const size = s.r.offList ? 56 : 42; // strokes, the guess, and why it's out
      const want = pin + (above ? -80 : 80);
      const c =
        nearestClear(want, size, [...taken, ...tapes, flag], lo, hi) ??
        nearestClear(want, size, [...taken, flag], lo, hi) ??
        Math.max(lo + size / 2, Math.min(hi - size / 2, want));
      out[s.i] = { ball: c, bubble: c };
      taken.push([c - size / 2, c + size / 2]);
    }
  }
  const pct = (p: number) => (p / sceneH) * 100;
  return out.map((o) => ({ ball: pct(o.ball), bubble: pct(o.bubble) }));
}

export function Reveal({
  game,
  hole,
  players,
  animate,
  onSettled,
}: {
  game: Game;
  hole: number;
  players: number[];
  animate: boolean;
  onSettled?: () => void;
}) {
  const h = game.holes[hole];
  const cat = CATEGORY_BY_ID.get(h.cat)!;
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [instant, setInstant] = useState(!animate || reduced);
  const [t, setT] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [sceneRef, sceneH] = useHeight<HTMLDivElement>(420);
  const anchors = useRef<(HTMLElement | null)[]>([]);
  const targets = useRef<(HTMLElement | null)[]>([]);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const n = players.length;
  const solo = n === 1;
  const shots = players.map((p, i) => {
    const r = holeResult(h, game.players[p].picks[hole] ?? null);
    const terrain: Terrain = terrainFor(r, cat.size);
    const rank = r.item ? nearestRank(r.item, h.target) : null;
    // Across the fairway as a fraction of its width: left of the flag, the cup itself, or the trees.
    const fx = terrain === 'cup' ? 0.5 : terrain === 'ob' ? 1.1 : solo ? 0.3 : 0.38 - (i * 0.24) / Math.max(1, n - 1);
    const launch = LAUNCH + i * STAGGER;
    return { p, i, r, terrain, rank, fx, launch, land: launch + FLY, fill: solo ? '#fff' : BALL_FILL[p % BALL_FILL.length], before: strokesBefore(game, p, hole) };
  });

  const landed = LAUNCH + (n - 1) * STAGGER + FLY;
  const at = useMemo(() => {
    const zoom = landed + 200;
    const gap = zoom + ZOOM;
    const answer = gap + COUNT + 300;
    const list = answer + 420;
    const score = list + 380;
    const scored = score + 620;
    return { zoom, gap, answer, list, score, scored, done: scored + 150 };
  }, [landed]);
  const now = instant ? Infinity : t;

  useEffect(() => {
    if (instant) return;
    const marks = [...shots.flatMap((s) => [s.launch, s.land]), ...Object.values(at)];
    const ids = marks.map((m) => setTimeout(() => setT((x) => Math.max(x, m)), m));
    return () => ids.forEach(clearTimeout);
  }, [instant]); // eslint-disable-line react-hooks/exhaustive-deps

  // Skip from outside (the button where "next" will appear).
  useEffect(() => {
    const skip = () => setInstant(true);
    window.addEventListener(SKIP_EVENT, skip);
    return () => window.removeEventListener(SKIP_EVENT, skip);
  }, []);

  const landedCount = shots.filter((s) => now >= s.land).length;
  useEffect(() => {
    if (!instant && landedCount > 0) buzz(10);
  }, [landedCount, instant]);

  const aced = shots.some((s) => s.terrain === 'cup');
  const showGap = now >= at.gap;
  const firedConfetti = useRef(false);
  useEffect(() => {
    if (!showGap || !aced || firedConfetti.current) return;
    firedConfetti.current = true;
    setConfetti(Date.now());
    buzz(40);
  }, [showGap, aced]);

  const done = now >= at.done;
  useEffect(() => {
    if (!done) return;
    // When skipped, wait a beat so a double-tap can't fall through to the next button.
    const id = setTimeout(() => settledRef.current?.(), instant ? 450 : 0);
    return () => clearTimeout(id);
  }, [done, instant]);

  // The gaps fly down into the scorecard.
  const scoring = !instant && now >= at.score && now < at.scored;
  useLayoutEffect(() => {
    if (!scoring) return setFlights([]);
    const out: Flight[] = [];
    shots.forEach((s, i) => {
      const a = anchors.current[i]?.getBoundingClientRect();
      const b = targets.current[i]?.getBoundingClientRect();
      if (!a || !b) return;
      const x = a.left + a.width / 2;
      const y = a.top + a.height / 2;
      out.push({ key: i, x, y, dx: b.left + b.width / 2 - x, dy: b.top + b.height / 2 - y, text: `+${s.r.strokes}`, fill: s.fill });
    });
    setFlights(out);
    buzz(8);
  }, [scoring]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomed = now >= at.zoom;
  const answered = now >= at.answer;
  const listed = now >= at.list;
  const scored = now >= at.scored;
  const ranks = shots.filter((s) => s.rank !== null).map((s) => s.rank!);
  const view = zoomed ? framing(cat.size, h.target, ranks) : wholeList(cat.size);
  const top = 12;
  const bottom = zoomed ? 92 : 80;
  const pins = perfectAnswers(h);
  const pinItem = pins[0];

  // The leaderboard beside the fairway: the flag's row and every pick first, then the rest of the
  // list nearest the flag first, as long as there's room for a row.
  const rows = useMemo(() => {
    if (!zoomed) return [];
    const pxPerRank = (sceneH * (bottom - top)) / 100 / (view[1] - view[0]);
    const pickedBy = new Map<number, number[]>();
    shots.forEach((s) => s.r.item && pickedBy.set(s.r.item.pos, [...(pickedBy.get(s.r.item.pos) ?? []), s.p]));
    const chosen: number[] = [];
    const inView = (pos: number) => pos >= view[0] && pos <= view[1];
    const add = (pos: number, force = false) => {
      if (pos < 1 || pos > cat.size || chosen.includes(pos) || !inView(pos)) return;
      const tall = (p: number) => p === pinItem?.pos || pickedBy.has(p);
      if (!force && chosen.some((c) => Math.abs(c - pos) * pxPerRank < (tall(c) || tall(pos) ? 34 : 24))) return;
      chosen.push(pos);
    };
    if (pinItem) add(pinItem.pos, true);
    pickedBy.forEach((_, pos) => add(pos));
    const rest: number[] = [];
    for (let pos = Math.max(1, Math.ceil(view[0])); pos <= Math.min(cat.size, Math.floor(view[1])); pos++) rest.push(pos);
    rest.sort((a, b) => Math.abs(a - h.target) - Math.abs(b - h.target)).forEach((pos) => add(pos));
    return chosen.map((pos) => {
      const item = cat.items[pos - 1];
      const by = pickedBy.get(pos);
      return { pos, item, kind: item === pinItem ? 'pin' : by ? 'pick' : 'list', by };
    });
  }, [zoomed, sceneH, bottom, view[0], view[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const ballLeft = (fx: number) => `calc((var(--cl) + var(--cw) * ${fx}) * 1%)`;
  const yAt = scale(view, top, bottom);
  const yPin = yAt(h.target);
  const spots = placeShots(shots, solo, h.target, yAt, top, bottom, sceneH);

  return (
    <div className={`reveal${instant ? ' is-instant' : ''}${solo ? ' is-solo' : ''}`}>
      <HoleCard hole={h} index={hole} count={game.holes.length} compact />

      <Course
        size={cat.size}
        target={h.target}
        view={view}
        top={top}
        bottom={bottom}
        tee
        className={`${zoomed ? 'is-zoomed' : ''}${answered ? ' is-answered' : ''}`}
        sceneRef={sceneRef}
        onTap={() => setInstant(true)}
      >
        {(y) => (
          <>
            {rows.map(({ pos, item, kind, by }) => {
              const fill = by && !solo ? BALL_FILL[by[0] % BALL_FILL.length] : undefined;
              // Rows for the flag and for picks reach across to the fairway with a dotted line.
              const fx = kind === 'pin' ? 0.5 : kind === 'pick' ? (shots.find((x) => x.p === by![0])?.fx ?? 0.3) : 0;
              const hidden = kind === 'pin' ? false : kind === 'pick' ? false : !listed;
              return (
                <div
                  key={pos}
                  className={`lr is-${kind}${hidden ? ' is-hidden' : ''}${kind === 'pin' && answered ? ' is-flipped' : ''}`}
                  style={{ top: `${y(pos)}%`, '--fx': fx, '--d': Math.abs(pos - h.target), ...(fill ? { '--pick': fill } : {}) } as CSSProperties}
                >
                  <span className="lr-pos">{item.lo !== item.hi ? `${item.lo}–${item.hi}` : item.pos}</span>
                  <span className="lr-name">
                    {kind === 'pin' && !answered ? '?' : item.name}
                    {kind !== 'list' && (kind === 'pick' || answered) && item.sub && <small>{item.sub}</small>}
                  </span>
                  <span className="lr-val">{kind === 'pin' && !answered ? '' : formatValue(cat, item)}</span>
                </div>
              );
            })}

            {shots.map((s) => {
              const flying = now >= s.launch;
              const down = now >= s.land;
              const ob = s.terrain === 'ob';
              const { ball: yLand, bubble: yBubble } = spots[s.i];
              const style: CSSProperties = flying ? { left: ballLeft(s.fx), top: `${yLand}%` } : { left: `${teeX(s.i, n)}%`, top: `${TEE_Y}%` };
              const measure = showGap && s.rank !== null && s.terrain !== 'cup';
              const label = solo && down && (!zoomed || (ob && !showGap));
              return (
                <div key={s.p} className="shot">
                  {measure && (
                    <>
                      <span
                        className={`m-line${yLand < yPin ? ' is-up' : ''}`}
                        style={{ left: ballLeft(s.fx), top: `${Math.min(yLand, yPin)}%`, height: `${Math.abs(yLand - yPin)}%`, '--c': s.fill } as CSSProperties}
                      />
                      <span className="m-foot" style={{ left: ballLeft(s.fx), top: `${yPin}%`, width: `calc(var(--cw) * ${0.5 - s.fx} * 1%)`, '--c': s.fill } as CSSProperties} />
                    </>
                  )}
                  <div className={`fb t-${s.terrain}${flying ? ' is-air' : ''}${down ? ' is-down' : ''}`} style={style}>
                    <span className="fb-shadow" />
                    <span className="fb-arc">
                      <span className="fb-bounce">
                        <Ball size={solo ? 26 : 22} fill={s.fill} />
                      </span>
                    </span>
                    <span className="fb-fx" />
                    {label && (
                      <span className="fb-label">
                        {pickLabel(s.r)}
                        {s.r.item && <small>{ordinal(s.rank!)}</small>}
                      </span>
                    )}
                  </div>
                  {showGap && s.terrain !== 'cup' && (
                    <span
                      ref={(el) => {
                        anchors.current[s.i] = el;
                      }}
                      className={`m-bubble${ob ? ' is-ob' : ''}${scored || flights.length ? ' is-spent' : ''}`}
                      style={{ left: ballLeft(s.fx), top: `${yBubble}%`, '--c': s.fill } as CSSProperties}
                    >
                      {ob ? (
                        // Out of bounds still shows what it costs, and why: the list stops at its last entry.
                        <>
                          <b aria-label={`${s.r.timedOut ? 'Ran out of time' : 'Out of bounds'}, ${s.r.strokes} strokes`}>
                            <span className="m-ob-tag" aria-hidden="true">
                              {s.r.timedOut ? '⏱' : 'OB'}
                            </span>
                            <CountUp to={s.r.strokes} run={showGap} instant={instant} />
                          </b>
                          {s.r.offList && <small className="m-guess">{pickLabel(s.r)}</small>}
                          <small>{s.r.timedOut ? 'Out of time' : s.r.offList ? `Not in the top ${cat.size}` : 'No answer'}</small>
                        </>
                      ) : (
                        <b>
                          <CountUp to={s.r.raw} run={showGap} instant={instant} />
                        </b>
                      )}
                      {solo && !ob && <small>{s.r.raw === 1 ? 'place off' : 'places off'}</small>}
                      {solo && s.r.verdict && !ob && <i className={`tone-${s.r.verdict.tone}`}>{s.r.verdict.label}</i>}
                    </span>
                  )}
                  {showGap && s.terrain === 'cup' && (
                    <span
                      ref={(el) => {
                        anchors.current[s.i] = el;
                      }}
                      className="m-anchor"
                      style={{ left: ballLeft(0.5), top: `${yPin}%` }}
                    />
                  )}
                </div>
              );
            })}

            {aced && showGap && <div className="stamp tone-ace">Hole in one!</div>}
            {listed && (
              <button
                type="button"
                className="c-fulllist"
                onClick={(e) => {
                  e.stopPropagation();
                  setSheet(true);
                }}
              >
                {Icons.list} Full list
              </button>
            )}
          </>
        )}
      </Course>

      <ScoreBar game={game} hole={hole} shots={shots} solo={solo} scored={scored} instant={instant} targets={targets} />

      {flights.map((f) => (
        <span
          key={f.key}
          className="fly-chip"
          style={{ left: f.x, top: f.y, '--dx': `${f.dx}px`, '--dy': `${f.dy}px`, '--c': f.fill } as CSSProperties}
          aria-hidden="true"
        >
          {f.text}
        </span>
      ))}

      <p className="sr-only" aria-live="polite">
        {answered &&
          `${shots.map((s) => `${solo ? 'You' : game.players[s.p].name}: ${pickLabel(s.r)}${s.rank ? `, ${ordinal(s.rank)}` : s.r.offList ? `, not in the top ${cat.size}` : ''}, ${s.r.strokes} strokes.`).join(' ')} The answer was ${pins.map((x) => x.name).join(', ')}.`}
      </p>

      <HoleSheet game={game} hole={hole} players={players} open={sheet} onClose={() => setSheet(false)} />
      <Confetti fire={confetti} />
    </div>
  );
}

function ScoreBar({
  game,
  hole,
  shots,
  solo,
  scored,
  instant,
  targets,
}: {
  game: Game;
  hole: number;
  shots: { p: number; i: number; r: { strokes: number }; fill: string; before: number }[];
  solo: boolean;
  scored: boolean;
  instant: boolean;
  targets: React.MutableRefObject<(HTMLElement | null)[]>;
}) {
  if (solo) {
    const s = shots[0];
    const p = s.p;
    return (
      <div className="scorebar is-solo" aria-label="Your card">
        <ol className="sb-holes">
          {game.holes.map((hh, k) => {
            const v = k < hole || (k === hole && scored) ? holeResult(hh, game.players[p].picks[k] ?? null).strokes : null;
            return (
              <li
                key={k}
                ref={
                  k === hole
                    ? (el) => {
                        targets.current[0] = el;
                      }
                    : undefined
                }
                className={`${k === hole ? 'is-now' : ''}${v !== null ? ' is-filled' : ''}${v === 0 ? ' is-ace' : ''}`}
              >
                <small>{k + 1}</small>
                <b key={v === null ? 'e' : 'v'}>{v ?? ''}</b>
              </li>
            );
          })}
        </ol>
        <div className="sb-total">
          <small>Total</small>
          <b>
            <CountUp from={s.before} to={s.before + s.r.strokes} run={scored} instant={instant} />
          </b>
        </div>
      </div>
    );
  }
  const totals = shots.map((s) => (scored ? s.before + s.r.strokes : s.before));
  const best = Math.min(...totals);
  return (
    <ul className="scorebar is-multi" aria-label="Totals">
      {shots.map((s, i) => (
        <li
          key={s.p}
          ref={(el) => {
            targets.current[i] = el;
          }}
          className={scored && totals[i] === best ? 'is-lead' : undefined}
          style={{ '--c': s.fill } as CSSProperties}
        >
          <Ball size={16} fill={s.fill} />
          <span className="sb-name">{game.players[s.p].name}</span>
          <b>
            <CountUp from={s.before} to={s.before + s.r.strokes} run={scored} instant={instant} />
          </b>
        </li>
      ))}
    </ul>
  );
}

/** The reveal's "next" button. Until the reveal has played out, a skip button sits in its place. */
export function RevealCta({ armed, label, onNext }: { armed: boolean; label: string; onNext: () => void }) {
  return (
    <div className={`sticky-cta${armed ? '' : ' is-waiting'}`}>
      {armed ? (
        <button type="button" className="btn btn-primary btn-block btn-lg cta-in" onClick={onNext}>
          {label} <span aria-hidden="true">→</span>
        </button>
      ) : (
        <button type="button" className="btn btn-skip" onClick={() => window.dispatchEvent(new Event(SKIP_EVENT))}>
          Skip <span aria-hidden="true">»</span>
        </button>
      )}
    </div>
  );
}
