import { useCallback, useState } from 'react';
import { CATEGORY_BY_ID } from '../lib/data';
import { holeResult, ordinal, pickLabel, rankLabel, type Game, type HoleResult } from '../lib/game';
import { coursePar, parFor, toPar } from '../lib/par';
import { HoleSheet } from './HoleSheet';
import { colorOf } from './ui';

/**
 * Pencil marks, the way a golf card is marked: circled under par, boxed over par,
 * double-boxed for double par or worse (or off the list). A hole in one gets the gold double ring.
 */
function markOf(r: HoleResult, par: number): string {
  if (!r.played) return 'mk-plain';
  if (r.verdict?.tone === 'ob') return 'mk-box2';
  if (r.strokes === 0) return 'mk-ace';
  if (r.strokes < par) return 'mk-circle';
  if (r.strokes === par) return 'mk-plain';
  return r.strokes > par * 2 ? 'mk-box2' : 'mk-box';
}

const diffTone = (d: number) => (d < 0 ? 'is-under' : d > 0 ? 'is-over' : 'is-level');

/** What they answered and where it sits on the list, so the strokes explain themselves (pin 8th, picked 9th → 1). */
function pickLine(r: HoleResult): string {
  return r.item ? `${r.item.name} · ${rankLabel(r.item)}` : `${pickLabel(r)} · not on the list`;
}

/**
 * The final card, laid out like a golf scorecard: holes left to right, a par row, a row per player
 * (in finishing order), totals and how far over or under par. The holes themselves are listed under
 * the card; tap one (or its number on the card) for everyone's picks and the full list.
 */
export function Scorecard({ game, players }: { game: Game; players: number[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const solo = players.length === 1;
  const pars = game.holes.map(parFor);
  const parTotal = coursePar(game.holes);
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
            <tr className="csc-par">
              <th scope="row" className="csc-label">
                Par
              </th>
              {pars.map((p, i) => (
                <td key={i}>{p}</td>
              ))}
              <td className="csc-tot">{parTotal}</td>
            </tr>
            {players.map((p, row) => (
              <tr key={p} className="csc-player">
                <th scope="row" className={`csc-label csc-name${solo ? '' : ` sc-${colorOf(p)}`}`}>
                  {game.players[p].name}
                </th>
                {results[row].map((r, i) => (
                  <td key={i} className={`csc-s ${markOf(r, pars[i])}`}>
                    <i>{r.played ? r.strokes : ''}</i>
                  </td>
                ))}
                <td className={`csc-tot${!solo && totals[row] === best ? ' is-best' : ''}`}>
                  <b>{totals[row]}</b>
                  {!solo && <small className={diffTone(totals[row] - parTotal)}>{toPar(totals[row] - parTotal)}</small>}
                </td>
              </tr>
            ))}
            {solo && (
              <tr className="csc-diff">
                <th scope="row" className="csc-label">
                  +/−
                </th>
                {results[0].map((r, i) => (
                  <td key={i} className={diffTone(r.strokes - pars[i])}>
                    {toPar(r.strokes - pars[i])}
                  </td>
                ))}
                <td className={`csc-tot ${diffTone(totals[0] - parTotal)}`}>{toPar(totals[0] - parTotal)}</td>
              </tr>
            )}
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
          Under par
          <span className="csc-s mk-box" aria-hidden="true">
            <i />
          </span>
          Over par
        </p>
      </div>

      <ol className="sc-holes">
        {game.holes.map((h, i) => {
          const cat = CATEGORY_BY_ID.get(h.cat);
          return (
            <li key={i}>
              <button type="button" onClick={() => setOpen(i)}>
                <span className="sc-n">{i + 1}</span>
                <span className="sc-q">
                  <span className="sc-prompt">
                    <b>{ordinal(h.target)}</b> {cat?.prompt}
                  </span>
                  {solo && <span className="sc-pick">{pickLine(results[0][i])}</span>}
                </span>
                <span className="sc-par">Par {pars[i]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <HoleSheet game={game} hole={open ?? 0} players={players} open={open !== null} onClose={close} />
    </section>
  );
}
