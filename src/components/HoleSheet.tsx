import { CATEGORY_BY_ID } from '../lib/data';
import { holeResult, ordinal, pickLabel, rankLabel, type Game } from '../lib/game';
import { Ball, BALL_FILL } from './art';
import { RankedList, type Mark } from './RankedList';
import { Sheet } from './ui';

/** Second level for one hole: everyone's pick, then the full list. */
export function HoleSheet({ game, hole, players, open, onClose }: { game: Game; hole: number; players: number[]; open: boolean; onClose: () => void }) {
  const h = game.holes[hole];
  const cat = CATEGORY_BY_ID.get(h.cat);
  if (!cat) return null;
  const solo = players.length === 1;
  const rows = players.map((p) => ({ p, r: holeResult(h, game.players[p].picks[hole] ?? null) }));
  const marks = new Map<string, Mark[]>();
  rows.forEach(({ p, r }) => r.item && marks.set(r.item.id, [...(marks.get(r.item.id) ?? []), { name: game.players[p].name, index: p }]));
  return (
    <Sheet open={open} onClose={onClose} title={cat.title}>
      <p className="hs-target">
        <b>{ordinal(h.target)}</b> {cat.prompt}
      </p>
      <ul className="hs-picks">
        {rows.map(({ p, r }) => (
          <li key={p}>
            <Ball size={18} fill={solo ? '#fff' : BALL_FILL[p % BALL_FILL.length]} />
            {!solo && <span className="hs-who">{game.players[p].name}</span>}
            <span className="hs-pick">{pickLabel(r)}</span>
            <span className="hs-rank">{r.item ? rankLabel(r.item) : 'OB'}</span>
            <b className="hs-strokes">+{r.strokes}</b>
          </li>
        ))}
      </ul>
      <RankedList cat={cat} target={h.target} marks={marks} />
    </Sheet>
  );
}
