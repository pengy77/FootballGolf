import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CATEGORY_BY_ID } from '../lib/data';
import { holeResult, ordinal, perfectAnswers, rankLabel, type Game } from '../lib/game';
import { buzz } from '../lib/share';
import { Confetti } from './Confetti';
import { HoleCard } from './HoleCard';
import { RankedList, type Mark } from './RankedList';
import { FlagIcon, Tag } from './ui';

const STEP = 650;

/**
 * Hole reveal: everyone's pick, then their rank, then their strokes, one player at a time,
 * followed by the pin and the full list. Tap anywhere on the cards to skip the drama.
 */
export function Reveal({ game, hole, players, animate, after }: { game: Game; hole: number; players: number[]; animate: boolean; after?: ReactNode }) {
  const h = game.holes[hole];
  const cat = CATEGORY_BY_ID.get(h.cat)!;
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [instant, setInstant] = useState(!animate || reduced);
  const [confetti, setConfetti] = useState(0);

  const results = players.map((p) => ({ p, r: holeResult(h, game.players[p].picks[hole] ?? null) }));
  const aceAt = results.findIndex((x) => x.r.played && x.r.strokes === 0 && !x.r.offList && x.r.item);
  const pins = perfectAnswers(h);
  const cardsDone = players.length * STEP + 500;

  useEffect(() => {
    if (aceAt < 0) return;
    const t = setTimeout(() => {
      setConfetti(Date.now());
      buzz(40);
    }, instant ? 150 : aceAt * STEP + 600);
    return () => clearTimeout(t);
    // Fire once per hole, not when the reveal is skipped.
  }, [hole]); // eslint-disable-line react-hooks/exhaustive-deps

  const marks = new Map<string, Mark[]>();
  results.forEach(({ p, r }) => {
    if (r.item) marks.set(r.item.id, [...(marks.get(r.item.id) ?? []), { name: game.players[p].name, index: p }]);
  });

  const d = (ms: number) => ({ animationDelay: `${ms}ms` });

  return (
    <div className={`reveal${instant ? ' is-instant' : ''}`}>
      <HoleCard hole={h} index={hole} count={game.holes.length} />
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
            <div className="verdict pop" style={d(i * STEP + 520)}>
              {r.verdict?.label}
            </div>
          </article>
        ))}
      </div>

      {after && (
        <div className="pop" style={d(cardsDone - 200)}>
          {after}
        </div>
      )}

      <div className="pin-banner pop" style={d(cardsDone)}>
        <FlagIcon size={18} />
        <div>
          <div className="pin-banner-label">On the pin · {ordinal(h.target)}</div>
          <div className="pin-banner-name">
            {pins.slice(0, 3).map((x) => x.name).join(', ')}
            {pins.length > 3 && ` + ${pins.length - 3} more`}
            {pins.length > 1 && <span className="pin-tied"> (tied)</span>}
          </div>
        </div>
      </div>

      <div className="pop" style={d(cardsDone + 200)}>
        <RankedList cat={cat} target={h.target} marks={marks} />
      </div>
      <Confetti fire={confetti} />
    </div>
  );
}
