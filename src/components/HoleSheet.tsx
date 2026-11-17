import { CATEGORY_BY_ID } from '../lib/data';
import { HOLE_MAX, holeResult, obBreakdown, ordinal, pickLabel, rankLabel, type Game } from '../lib/game';
import { Ball, BALL_FILL } from './art';
import { RankedList, type Mark, type Outside } from './RankedList';
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
  // Guesses that aren't on the list sit just past its last entry, so you can see where it stops.
  const outside: Outside[] = [];
  rows.forEach(({ p, r }) => {
    if (!r.played || r.item || !r.offList) return;
    const mark = { name: game.players[p].name, index: p };
    const same = outside.find((o) => o.guess.trim().toLowerCase() === r.offList!.trim().toLowerCase());
    if (same) same.marks.push(mark);
    else outside.push({ guess: r.offList, marks: [mark] });
  });
  const anyOb = rows.some(({ r }) => r.played && !r.item);
  const ob = obBreakdown(cat, h.target);
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
            <span className="hs-rank">{r.item ? rankLabel(r.item) : r.played ? 'OB' : ''}</span>
            <b className="hs-strokes">+{r.strokes}</b>
          </li>
        ))}
      </ul>
      {anyOb && (
        <p className="hs-ob">
          <b>OB</b> costs 1 more than the furthest answer on the list: {ordinal(ob.rank)} is {ob.off} places off, so {ob.off + 1}
          {ob.capped ? `, capped at ${HOLE_MAX}` : ''}.
        </p>
      )}
      <RankedList cat={cat} target={h.target} marks={marks} outside={outside} />
    </Sheet>
  );
}
