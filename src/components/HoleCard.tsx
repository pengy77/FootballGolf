import { useState } from 'react';
import { CATEGORY_BY_ID } from '../lib/data';
import type { Hole } from '../lib/game';
import { FlagIcon, Icons, Ordinal, Sheet } from './ui';

export function asOfLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function HoleCard({ hole, index, count, compact }: { hole: Hole; index: number; count: number; compact?: boolean }) {
  const cat = CATEGORY_BY_ID.get(hole.cat);
  const [info, setInfo] = useState(false);
  if (!cat) return null;
  return (
    <section className={`card hole-card${compact ? ' is-compact' : ''}`} aria-label={`Hole ${index + 1}`}>
      <div className="hole-top">
        <span className="chip chip-ink">
          <FlagIcon size={14} /> Hole {index + 1}
          <span className="chip-dim"> of {count}</span>
        </span>
        <button type="button" className="link-btn hole-info" onClick={() => setInfo(true)}>
          {Icons.info}
          <span>
            {cat.size} {cat.nounPlural}
          </span>
        </button>
      </div>
      <div className="hole-target">
        <span className="hole-target-label">Target</span>
        <Ordinal n={hole.target} className="hole-target-n" />
      </div>
      <h1 className="hole-prompt">{cat.prompt}</h1>
      <Sheet open={info} onClose={() => setInfo(false)} title={cat.title}>
        <p>{cat.description}</p>
        <dl className="facts">
          <div>
            <dt>On the list</dt>
            <dd>
              {cat.size} {cat.nounPlural}
            </dd>
          </div>
          <div>
            <dt>Ranked by</dt>
            <dd>{cat.metric}</dd>
          </div>
          <div>
            <dt>Correct as of</dt>
            <dd>{asOfLabel(cat.source.asOf)}</dd>
          </div>
        </dl>
        <p className="fine">
          Source:{' '}
          <a href={cat.source.url} target="_blank" rel="noreferrer">
            {cat.source.name}
          </a>{' '}
          (CC BY-SA). Tied {cat.nounPlural} share a place.
        </p>
      </Sheet>
    </section>
  );
}
