import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CATEGORY_BY_ID } from '../lib/data';
import { HOLE_MAX, holeResult, nearestRank, ordinal, perfectAnswers, rankLabel, type Game, type HoleResult } from '../lib/game';
import { buzz } from '../lib/share';
import { Confetti } from './Confetti';
import { HoleCard } from './HoleCard';
import { RankedList, type Mark } from './RankedList';
import { FlagIcon, Tag } from './ui';

const STEP = 650;

/** Spell out the sum so strokes always add up, including ties and the hole cap. */
function mathLine(r: HoleResult, target: number): string {
  if (!r.item) return r.capped ? `Hole maximum (${HOLE_MAX})` : '1 worse than the worst on the list';
  if (r.strokes === 0) return r.item.lo === r.item.hi ? 'Bang on the pin' : `Tied ${rankLabel(r.item)}, covers ${ordinal(target)}`;
  // For a tie, count from the end of the tied range nearest the target (the pill shows the range).
  const from = nearestRank(r.item, target);
  return `${ordinal(from)} → ${ordinal(target)}${r.capped ? `, capped at ${HOLE_MAX}` : ''}`;
}

/**
 * Hole reveal: everyone's pick, then their rank, then their strokes, one player at a time,
 * then the pin. Tap the cards to skip the drama. `onSettled` fires once the pin is showing.
 */
export function Reveal({
  game,
  hole,
  players,
  animate,
  after,
  onSettled,
}: {
  game: Game;
  hole: number;
  players: number[];
  animate: boolean;
  after?: ReactNode;
  onSettled?: () => void;
}) {
  const h = game.holes[hole];
  const cat = CATEGORY_BY_ID.get(h.cat)!;
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [instant, setInstant] = useState(!animate || reduced);
  const [confetti, setConfetti] = useState(0);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const results = players.map((p) => ({ p, r: holeResult(h, game.players[p].picks[hole] ?? null) }));
  const aceAt = results.findIndex((x) => x.r.played && x.r.strokes === 0 && !!x.r.item);
  const pins = perfectAnswers(h);
  const cardsDone = players.length * STEP + 500;

  useEffect(() => {
    if (aceAt < 0) return;
    const t = setTimeout(
      () => {
        setConfetti(Date.now());
        buzz(40);
      },
      instant ? 150 : aceAt * STEP + 600,
    );
    return () => clearTimeout(t);
    // Fire once per hole, not again when the reveal is skipped.
  }, [hole]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Even when skipped, wait a beat so a double-tap can't fall through to the next button.
    const t = setTimeout(() => settledRef.current?.(), instant ? 450 : cardsDone + 150);
    return () => clearTimeout(t);
  }, [instant, cardsDone, hole]);

  const marks = new Map<string, Mark[]>();
  results.forEach(({ p, r }) => {
    if (r.item) marks.set(r.item.id, [...(marks.get(r.item.id) ?? []), { name: game.players[p].name, index: p }]);
  });

  const d = (ms: number) => ({ animationDelay: `${ms}ms` });

  return (
    <div className={`reveal${instant ? ' is-instant' : ''}`}>
      <HoleCard hole={h} index={hole} count={game.holes.length} compact />
      <div
        className={`picks picks-${Math.min(players.length, 4)}`}
        onClick={() => setInstant(true)}
        role="group"
        aria-label="Everyone's picks"
      >
        {results.map(({ p, r }, i) => (
          <article key={p} className={`pick-card tone-${r.verdict?.tone ?? 'ob'}`}>
            <div className="pick-card-head">
              <Tag name={game.players[p].name} index={p} small />
            </div>
            <div className="pick-card-body pop" style={d(i * STEP)}>
              <div className="pick-card-name">{r.item ? r.item.name : r.offList ? `“${r.offList}”` : 'No answer'}</div>
              <div className="pick-card-sub">{r.item ? r.item.sub : 'Not on the list'}</div>
            </div>
            <div className="pick-card-foot">
              <span className="rank-pill pop" style={d(i * STEP + 280)}>
                {r.item ? rankLabel(r.item) : 'OB'}
              </span>
              <span className="strokes pop" style={d(i * STEP + 520)}>
                <b>{r.strokes === 0 ? '0' : `+${r.strokes}`}</b>
                <small>{r.strokes === 1 ? 'stroke' : 'strokes'}</small>
              </span>
            </div>
            <div className="pick-card-math pop" style={d(i * STEP + 520)}>
              {mathLine(r, h.target)}
            </div>
            <div className="verdict pop" style={d(i * STEP + 520)}>
              {r.verdict?.label}
            </div>
          </article>
        ))}
      </div>

      <div className="pin-banner pop" style={d(cardsDone - 150)}>
        <FlagIcon size={20} />
        <div>
          <div className="pin-banner-label">On the pin · {ordinal(h.target)}</div>
          <div className="pin-banner-name">
            {pins.slice(0, 3).map((x) => x.name).join(', ')}
            {pins.length > 3 && ` + ${pins.length - 3} more`}
            {pins.length > 1 && <span className="pin-tied"> (tied {rankLabel(pins[0])})</span>}
          </div>
        </div>
      </div>

      {after && (
        <div className="pop" style={d(cardsDone)}>
          {after}
        </div>
      )}

      <div className="pop" style={d(cardsDone + 150)}>
        <RankedList cat={cat} target={h.target} marks={marks} />
      </div>
      <Confetti fire={confetti} />
    </div>
  );
}

/** The reveal's "next" button. Hidden until the pin has shown, so nobody skips past the answer. */
export function RevealCta({ armed, label, onNext }: { armed: boolean; label: string; onNext: () => void }) {
  return (
    <div className={`sticky-cta${armed ? '' : ' is-waiting'}`}>
      {armed ? (
        <button type="button" className="btn btn-primary btn-block btn-lg cta-in" onClick={onNext}>
          {label}
        </button>
      ) : (
        <p className="skip-hint">Tap the cards to skip ahead</p>
      )}
    </div>
  );
}
