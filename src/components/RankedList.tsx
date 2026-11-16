import { useMemo, useState } from 'react';
import { formatValue, type Category } from '../lib/data';
import { FlagIcon, Tag } from './ui';

export interface Mark {
  name: string;
  index: number;
}

/**
 * The full ranked list with the pin and everyone's picks highlighted.
 * Starts as a window around the interesting rows; one tap shows everything.
 */
export function RankedList({ cat, target, marks }: { cat: Category; target: number; marks: Map<string, Mark[]> }) {
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
    // Don't hide a gap of one or two rows: just show them.
    const sorted = [...keep].sort((a, b) => a - b);
    for (let k = 0; k < sorted.length; k++) {
      const prev = k === 0 ? -1 : sorted[k - 1];
      if (sorted[k] - prev - 1 <= 2) for (let i = prev + 1; i < sorted[k]; i++) keep.add(i);
    }
    const last = sorted[sorted.length - 1] ?? -1;
    if (cat.size - 1 - last <= 2) for (let i = last + 1; i < cat.size; i++) keep.add(i);
    return keep;
  }, [cat, target, marks]);

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
    <section className="card ranked" aria-label={`${cat.title}, full list`}>
      <header className="ranked-head">
        <div>
          <div className="ranked-title">{cat.title}</div>
          <div className="ranked-meta">
            {cat.size} {cat.nounPlural} · ranked by {cat.metric.toLowerCase()}
            {cat.items.some((x) => x.lo !== x.hi) && ' · ties share places'}
          </div>
        </div>
        <button type="button" className="chip chip-btn" onClick={() => setAll((a) => !a)} aria-pressed={all}>
          {all ? 'Show less' : 'Full list'}
        </button>
      </header>
      <ol className="ranked-list">
        {rows.map((r, k) => {
          if ('gap' in r)
            return (
              <li key={`g${k}`} className="rl-gap">
                <button type="button" onClick={() => setAll(true)}>
                  ··· {r.gap} more
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
                <span className="rl-name">{it.name}</span>
                {(m || isPin) && (
                  <span className="rl-tags">
                    {isPin && (
                      <span className="pin-badge">
                        <FlagIcon size={11} /> Pin
                      </span>
                    )}
                    {m?.map((p) => <Tag key={p.index} name={p.name} index={p.index} small />)}
                  </span>
                )}
                {it.sub && <span className="rl-sub">{it.sub}</span>}
              </span>
              <span className="rl-val">{formatValue(cat, it)}</span>
            </li>
          );
        })}
      </ol>
      <footer className="ranked-foot">
        <a href={cat.source.url} target="_blank" rel="noreferrer">
          {cat.source.name}
        </a>
      </footer>
    </section>
  );
}
