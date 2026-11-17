import { CATEGORIES } from '../lib/data';
import { HOLE_MAX } from '../lib/game';
import { Ball, PinFlag, Trophy } from './art';
import { Sheet } from './ui';

/** A tiny slice of the fairway: ranks down the side, the flag at one, the ball at another. */
function Strip({ ball }: { ball?: number }) {
  const rows = [5, 6, 7, 8, 9];
  return (
    <div className="ht-strip" aria-hidden="true">
      {rows.map((r) => (
        <div key={r} className={`ht-row${r === 8 ? ' is-pin' : ''}`}>
          <span className="ht-rank">{r}</span>
          <span className="ht-lane">
            {r === 8 && <PinFlag height={22} />}
            {ball === r && <Ball size={16} />}
          </span>
        </div>
      ))}
      {ball !== undefined && <span className="ht-gap">{Math.abs(8 - ball)}</span>}
    </div>
  );
}

export function HowToSteps() {
  return (
    <ol className="howto">
      <li>
        <Strip />
        <p>
          <b>The flag is a rank.</b> Like the 8th most Premier League goals.
        </p>
      </li>
      <li>
        <Strip ball={5} />
        <p>
          <b>Name who's closest.</b> Every place off is a stroke.
        </p>
      </li>
      <li>
        <div className="ht-trophy">
          <Trophy size={44} />
        </div>
        <p>
          <b>Fewest strokes wins.</b>
        </p>
      </li>
    </ol>
  );
}

export function HowToSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play">
      <HowToSteps />
      <p className="fine">
        Not on the list? Out of bounds: 1 stroke worse than the furthest answer on it. No hole costs more than {HOLE_MAX}. Tied entries share a place.
      </p>
      <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
        Got it
      </button>
      <p className="fine howto-credit">
        {CATEGORIES.length} lists · data from Wikipedia (CC BY-SA)
      </p>
    </Sheet>
  );
}
