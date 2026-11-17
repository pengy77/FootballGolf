import { useCallback, useState } from 'react';
import { CATEGORY_BY_ID } from '../lib/data';
import { holeResult, ordinal, pickLabel, rankLabel, type Game, type HoleResult } from '../lib/game';
import { HoleSheet } from './HoleSheet';
import { colorOf } from './ui';

/**
 * Pencil marks, the way a golf card is marked, keyed off the hole's verdict: a gold double ring for
 * a hole in one, circled when it landed within 5 places (tap-in or on the green), double-boxed when
 * it was off the list, and a plain number otherwise.
 */
export function markOf(r: HoleResult): string {
  switch (r.played ? r.verdict?.tone : undefined) {
    case 'ace':
      return 'mk-ace';
    case 'great':
    case 'good':
      return 'mk-circle';
    case 'ob':
      return 'mk-box2';
    default:
      return 'mk-plain';
  }
}

/** Where their pick sits on the list (or why it doesn't), then who it was. Off-list wording matches the reveal. */
function Guess({ r, size }: { r: HoleResult; size: number }) {
  if (!r.played) return <span className="sc-g">–</span>;
  if (r.item) {
    return (
      <span className="sc-g">
        <b>{rankLabel(r.item)}</b>
        <span>{r.item.name}</span>
      </span>
    );
  }
  if (r.timedOut || !r.offList) {
    return (
      <span className="sc-g">
        <em>{pickLabel(r)}</em>
      </span>
    );
  }
  return (
    <span className="sc-g">
      <em>Not in top {size}</em>
      <span>{r.offList}</span>
    </span>
  );
}

/** Places off, in the reveal's verdict colour. Capped holes say so, since 40 is less than the real gap. */
function Off({ r }: { r: HoleResult }) {
  if (!r.played) return <span className="sc-off">–</span>;
  const tone = r.verdict?.tone === 'ob' ? 'bad' : (r.verdict?.tone ?? 'ok');
  return (
    <span className="sc-off" style={{ color: `var(--${tone})` }}>
      {r.strokes}
      {r.capped && <small>max</small>}
    </span>
  );
}

/**
 * The final card, laid out like a golf scorecard: holes left to right, a row of strokes per player
 * (in finishing order) and their totals. The holes themselves are listed under the card with the
 * target, the guess and how far off it was; tap one (or its number on the card) for everyone's
 * picks and the full list.
 */
export function Scorecard({ game, players }: { game: Game; players: number[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const solo = players.length === 1;
  const results = players.map((p) => game.holes.map((h, i) => holeResult(h, game.players[p].picks[i] ?? null)));
  const totals = results.map((row) => row.reduce((s, r) => s + r.strokes, 0));
  const best = Math.min(...totals);

  return (
    <section className="sc-block" aria-label="Scorecard">
      <div className={`card-sc${game.holes.length <= 6 ? ' is-roomy' : ''}`}>
        <table className="csc">
          <thead>
            <tr>
              <th scope="col" className="csc-label">
                Hole
              </th>
              {game.holes.map((_, i) => (
                <th scope="col" key={i}>
                  <button type="button" aria-label={`Hole ${i + 1} details`} onClick={() => setOpen(i)}>
                    {i + 1}
                  </button>
                </th>
              ))}
              <th scope="col" className="csc-tot">
                Tot
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, row) => (
              <tr key={p} className="csc-player">
                <th scope="row" className={`csc-label csc-name${solo ? '' : ` sc-${colorOf(p)}`}`}>
                  {game.players[p].name}
                </th>
                {results[row].map((r, i) => (
                  <td key={i} className={`csc-s ${markOf(r)}`}>
                    <i>{r.played ? r.strokes : ''}</i>
                  </td>
                ))}
                <td className={`csc-tot${!solo && totals[row] === best ? ' is-best' : ''}`}>
                  <b>{totals[row]}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="csc-key">
          <span className="csc-s mk-ace" aria-hidden="true">
            <i />
          </span>
          Hole in one
          <span className="csc-s mk-circle" aria-hidden="true">
            <i />
          </span>
          Within 5
          <span className="csc-s mk-box2" aria-hidden="true">
            <i />
          </span>
          Not on the list
        </p>
      </div>

      {/* Each hole: the question, then the target, where the guess landed and how far off it was. */}
      <div className={`sc-holes${solo ? ' is-solo' : ''}`}>
        <div className="sc-head" aria-hidden="true">
          <span className="sc-t">Target</span>
          {solo && <span className="sc-g">Your guess</span>}
          {solo && <span className="sc-off">Off</span>}
        </div>
        <ol>
          {game.holes.map((h, i) => {
            const cat = CATEGORY_BY_ID.get(h.cat);
            const r = results[0][i];
            const said = solo
              ? `, target ${ordinal(h.target)}, ${r.item ? `you guessed ${r.item.name}, ${rankLabel(r.item)}` : pickLabel(r)}, ${r.strokes} off`
              : `, target ${ordinal(h.target)}`;
            return (
              <li key={i}>
                <button type="button" onClick={() => setOpen(i)} aria-label={`Hole ${i + 1}: ${cat?.prompt}${said}`}>
                  <span className="sc-n">{i + 1}</span>
                  <span className="sc-prompt">{cat?.prompt}</span>
                  <span className="sc-t">{ordinal(h.target)}</span>
                  {solo && <Guess r={r} size={cat?.size ?? 0} />}
                  {solo && <Off r={r} />}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <HoleSheet game={game} hole={open ?? 0} players={players} open={open !== null} onClose={close} />
    </section>
  );
}
