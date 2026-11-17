import { useState } from 'react';
import { CATEGORY_BY_ID } from '../lib/data';
import type { Hole } from '../lib/game';
import { Icons, Ordinal, Sheet } from './ui';

export function asOfLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/**
 * The hole's question: a big target rank and what's being ranked. Sits straight on the course, no card.
 * Facts about the list (size, source, how ties work) are one tap away on the ⓘ, not on screen.
 */
export function HoleCard({ hole, index, count, compact }: { hole: Hole; index: number; count: number; compact?: boolean }) {
  const cat = CATEGORY_BY_ID.get(hole.cat);
  const [info, setInfo] = useState(false);
  if (!cat) return null;
  return (
    <section className={`hole-head${compact ? ' is-compact' : ''}`} aria-label={`Hole ${index + 1} of ${count}`}>
      <Ordinal n={hole.target} className="hole-n" />
      <h1 className="hole-prompt">{cat.prompt}</h1>
      <button type="button" className="hole-info" aria-label={`About this list (${cat.size} ${cat.nounPlural})`} onClick={() => setInfo(true)}>
        {Icons.info}
      </button>
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
          (CC BY-SA). {cat.tiebreak ? `Level on ${cat.metric.toLowerCase()}? Split by ${cat.tiebreak}.` : `Tied ${cat.nounPlural} share a place.`}
        </p>
      </Sheet>
    </section>
  );
}
