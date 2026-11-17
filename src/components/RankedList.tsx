import { useMemo, useState } from 'react';
import { formatValue, type Category } from '../lib/data';
import { FlagIcon, Tag } from './ui';

export interface Mark {
  name: string;
  index: number;
}

/** A guess that isn't on the list, and who made it. */
export interface Outside {
  guess: string;
  marks: Mark[];
}

/**
 * The full ranked list with the pin and everyone's picks highlighted. Lives inside a sheet, so it's
 * flat rows, not another card. Starts as a window around the interesting rows; one tap shows everything.
 * Guesses that aren't on it go after its last row, so it's plain where the list stops.
 */
export function RankedList({ cat, target, marks, outside = [] }: { cat: Category; target: number; marks: Map<string, Mark[]>; outside?: Outside[] }) {
  const [all, setAll] = useState(false);

  const visible = useMemo(() => {
    const keep = new Set<number>();
    const add = (from: number, to: number) => {
      for (let i = Math.max(0, from); i <= Math.min(cat.size - 1, to); i++) keep.add(i);
    };
    add(target - 4, target + 2);
    cat.items.forEach((it, i) => {
      if (it.lo <= target && target <= it.hi) add(i - 1, i + 1);
      if (marks.has(it.id)) add(i - 1, i + 1);
    });
    if (outside.length) add(cat.size - 2, cat.size - 1);
    // Don't hide a gap of one or two rows: just show them.
    const sorted = [...keep].sort((a, b) => a - b);
    for (let k = 0; k < sorted.length; k++) {
      const prev = k === 0 ? -1 : sorted[k - 1];
      if (sorted[k] - prev - 1 <= 2) for (let i = prev + 1; i < sorted[k]; i++) keep.add(i);
    }
    const last = sorted[sorted.length - 1] ?? -1;
    if (cat.size - 1 - last <= 2) for (let i = last + 1; i < cat.size; i++) keep.add(i);
    return keep;
  }, [cat, target, marks, outside.length]);

  const rows: ({ gap: number } | { i: number })[] = [];
  let gap = 0;
  cat.items.forEach((_, i) => {
    if (all || visible.has(i)) {
      if (gap) rows.push({ gap });
      gap = 0;
      rows.push({ i });
    } else gap++;
  });
  if (gap) rows.push({ gap });

  return (
    <section className="ranked" aria-label={`${cat.title}, full list`}>
      <ol className="ranked-list">
        {rows.map((r, k) => {
          if ('gap' in r)
            return (
              <li key={`g${k}`} className="rl-gap">
                <button type="button" onClick={() => setAll(true)}>
                  {r.gap} more
                </button>
              </li>
            );
          const it = cat.items[r.i];
          const isPin = it.lo <= target && target <= it.hi;
          const m = marks.get(it.id);
          return (
            <li key={it.id} className={`rl-row${isPin ? ' is-pin' : ''}${m ? ' is-pick' : ''}`}>
              <span className={`rl-pos${it.lo !== it.hi ? ' is-tie' : ''}`} title={it.lo !== it.hi ? `Tied ${it.lo}–${it.hi}` : undefined}>
                {it.lo !== it.hi ? `${it.lo}–${it.hi}` : it.lo}
              </span>
              <span className="rl-main">
                <span className="rl-name">
                  {it.name}
                  {isPin && <FlagIcon size={13} className="rl-flag" />}
                  {m?.map((p) => <Tag key={p.index} name={p.name} index={p.index} small />)}
                </span>
                {it.sub && <span className="rl-sub">{it.sub}</span>}
              </span>
              <span className="rl-val">{formatValue(cat, it)}</span>
            </li>
          );
        })}
        {outside.length > 0 && (
          <li className="rl-end" aria-label={`End of the list: ${cat.size} ${cat.nounPlural}`}>
            <span>End of the list</span>
          </li>
        )}
        {outside.map((o) => (
          <li key={o.guess} className="rl-row is-out">
            <span className="rl-pos">OB</span>
            <span className="rl-main">
              <span className="rl-name">
                “{o.guess}”
                {o.marks.map((p) => <Tag key={p.index} name={p.name} index={p.index} small />)}
              </span>
              <span className="rl-sub">Not in the top {cat.size}</span>
            </span>
            <span className="rl-val" />
          </li>
        ))}
      </ol>
      <footer className="ranked-foot">
        {all ? (
          <button type="button" className="link-btn" onClick={() => setAll(false)}>
            Show less
          </button>
        ) : (
          <span />
        )}
        <a href={cat.source.url} target="_blank" rel="noreferrer">
          {cat.source.name}
        </a>
      </footer>
    </section>
  );
}
