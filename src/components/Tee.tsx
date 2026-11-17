import { Ball } from './art';

/** Where the tee sits in the course scene (% of its height), and each ball's slot across it. */
export const TEE_Y = 90;
export const teeX = (i: number, n: number) => 50 + (i - (n - 1) / 2) * Math.min(11, 70 / Math.max(n, 1));

export interface TeeBall {
  key: string | number;
  fill: string;
  /** active: the one being aimed now · locked: picked, sealed · waiting/thinking: hasn't picked · away: offline */
  state: 'active' | 'locked' | 'waiting' | 'thinking' | 'away';
  name?: string;
  /** The pick riding on the ball, once chosen. */
  tag?: string;
}

/** Balls lined up on the tee before the shot (positioned inside a Course). */
export function TeeBalls({ balls }: { balls: TeeBall[] }) {
  const named = balls.length <= 4;
  return (
    <>
      {balls.map((b, i) => (
        <div
          key={b.key}
          className={`tb is-${b.state}`}
          style={{ left: `${teeX(i, balls.length)}%`, top: `${TEE_Y}%` }}
          title={b.name}
        >
          {b.tag && <span className="tb-tag">{b.tag}</span>}
          <span className="tb-ball">
            <Ball size={26} fill={b.fill} />
          </span>
          {b.state === 'locked' && <span className="tb-badge" aria-label="Locked in">✓</span>}
          {b.name && named && <span className="tb-name">{b.name}</span>}
        </div>
      ))}
    </>
  );
}
