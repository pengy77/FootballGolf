import { useCallback, useState } from 'react';
import { CATEGORY_BY_ID, offListReason } from '../lib/data';
import { holeResult, ordinal, pickLabel, rankLabel, type Game, type HoleResult } from '../lib/game';
import { HoleSheet } from './HoleSheet';

/** What you answered, in quiet words: the name and where it sits on the list, or why it isn't on it. */
function guessLine(r: HoleResult, why: string): string {
  if (!r.played) return 'Not played';
  if (r.item) return `${r.item.name} · ${rankLabel(r.item)}`;
  if (r.timedOut || !r.offList) return pickLabel(r);
  return `${r.offList} · ${why}`;
}

/**
 * The golf scorecard: holes left to right, each hole's target where a real card prints par, then a
 * row of strokes per player and their totals. Plain pencil numbers, nothing else.
 *
 * Under it, the holes in words: what each one asked and (alone) what you said. Numbers live on the
 * card, words in the list. Tap a hole on either for everyone's picks and the full list.
 */
export function Scorecard({ game, players }: { game: Game; players: number[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const solo = players.length === 1;
  const results = players.map((p) => game.holes.map((h, i) => holeResult(h, game.players[p].picks[i] ?? null)));
  const totals = results.map((row) => row.reduce((s, r) => s + r.strokes, 0));
  const name = (p: number) => (p === game.me ? 'You' : game.players[p].name);

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
            <tr className="csc-target">
              <th scope="row" className="csc-label">
                Target
              </th>
              {game.holes.map((h, i) => (
                <td key={i} aria-label={ordinal(h.target)}>
                  {h.target}
                </td>
              ))}
              <td className="csc-tot" />
            </tr>
            {players.map((p, row) => (
              <tr key={p} className="csc-player">
                <th scope="row" className="csc-label">
                  {name(p)}
                </th>
                {results[row].map((r, i) => (
                  <td key={i}>{r.played ? r.strokes : ''}</td>
                ))}
                <td className="csc-tot">{totals[row]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ol className="holes">
        {game.holes.map((h, i) => {
          const cat = CATEGORY_BY_ID.get(h.cat);
          const said = solo ? guessLine(results[0][i], cat ? offListReason(cat) : 'not on the list') : null;
          return (
            <li key={i}>
              <button type="button" onClick={() => setOpen(i)} aria-label={`Hole ${i + 1}: ${cat?.prompt}, target ${ordinal(h.target)}${said ? `, you said ${said}` : ''}`}>
                <span className="hl-n">{i + 1}</span>
                <span className="hl-q">{cat?.prompt}</span>
                {said && <span className="hl-g">{said}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <HoleSheet game={game} hole={open ?? 0} players={players} open={open !== null} onClose={close} />
    </section>
  );
}
