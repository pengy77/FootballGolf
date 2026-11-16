import { holeResult, ordinal, type Game } from '../lib/game';
import { colorOf } from './ui';

/**
 * Golf-style scorecard. Only the first `upTo` holes show scores, so nobody sees a
 * rival's strokes before their own reveal. `current` highlights the hole in play.
 */
export function Scorecard({ game, players, upTo, current }: { game: Game; players: number[]; upTo: number; current?: number }) {
  const totals = players.map((p) => game.holes.slice(0, upTo).reduce((s, h, i) => s + holeResult(h, game.players[p].picks[i] ?? null).strokes, 0));
  const best = upTo > 0 && players.length > 1 ? Math.min(...totals) : null;
  return (
    <div className="scorecard-wrap">
      <table className="scorecard">
        <thead>
          <tr>
            <th scope="col" className="sc-name">Hole</th>
            {game.holes.map((_, i) => (
              <th scope="col" key={i} className={i === current ? 'is-current' : undefined}>
                {i + 1}
              </th>
            ))}
            <th scope="col" className="sc-total">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="sc-pin">
            <th scope="row" className="sc-name">Target</th>
            {game.holes.map((h, i) => (
              <td key={i} className={i === current ? 'is-current' : undefined}>
                {current === undefined || i <= current ? ordinal(h.target) : '?'}
              </td>
            ))}
            <td className="sc-total" />
          </tr>
          {players.map((p, row) => (
            <tr key={p} className={best !== null && totals[row] === best ? 'is-leading' : undefined}>
              <th scope="row" className={`sc-name sc-${colorOf(p)}`}>
                {game.players[p].name}
              </th>
              {game.holes.map((h, i) => {
                const r = i < upTo ? holeResult(h, game.players[p].picks[i] ?? null) : null;
                return (
                  <td key={i} className={`${i === current ? 'is-current' : ''}${r?.strokes === 0 && r.played ? ' is-ace' : ''}`}>
                    {r?.played ? r.strokes : ''}
                  </td>
                );
              })}
              <td className="sc-total">{upTo > 0 ? totals[row] : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
