import type { CSSProperties } from 'react';
import { Ball } from './art';

export interface BallEntry {
  key: string | number;
  name: string;
  /** Strokes, or null when it's hidden (they've played, but you haven't yet). */
  total: number | null;
  fill: string;
  you?: boolean;
  lead?: boolean;
}

/** Everyone's round as their ball with the strokes under it, best first: the comparison at a glance. */
export function BallRow({ entries, big }: { entries: BallEntry[]; big?: boolean }) {
  return (
    <ol className={`ballrow${big ? ' is-big' : ''}`} aria-label="Scores">
      {entries.map((e, i) => (
        <li
          key={e.key}
          className={`${e.you ? 'is-you' : ''}${e.lead ? ' is-lead' : ''}`}
          style={{ animationDelay: `${i * 80}ms` } as CSSProperties}
          aria-label={`${e.you ? 'You' : e.name}: ${e.total === null ? 'played' : `${e.total} strokes`}${e.lead ? ', leading' : ''}`}
        >
          <span className="br-ball">
            <Ball size={big ? 34 : 28} fill={e.fill} />
          </span>
          <b className="br-total">{e.total ?? '✓'}</b>
          <span className="br-name">{e.you ? 'You' : e.name}</span>
        </li>
      ))}
    </ol>
  );
}
