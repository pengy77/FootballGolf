import { Sheet } from './ui';

export function HowToSteps() {
  return (
    <ol className="howto">
      <li>
        <span className="howto-n">1</span>
        <div>
          <b>Every hole has a target.</b> Something like <i>“the 42nd most Champions League match wins”</i>.
        </div>
      </li>
      <li>
        <span className="howto-n">2</span>
        <div>
          <b>Name what you think sits closest to it.</b> Start typing: every player, manager, club and ground is in there, so you only find out at the reveal whether yours made the list.
        </div>
      </li>
      <li>
        <span className="howto-n">3</span>
        <div>
          <b>Every place you're off is a stroke.</b> Pick the 35th when the target is 42nd: 7 strokes. Bang on is a hole in one.
        </div>
      </li>
      <li>
        <span className="howto-n">4</span>
        <div>
          <b>Fewest strokes wins.</b> Not on the list? That's out of bounds: 1 worse than the worst answer on the list. No hole costs more than 40.
        </div>
      </li>
    </ol>
  );
}

export function HowToSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to play">
      <HowToSteps />
      <p className="fine">
        Tied entries share every place they cover: if three players are tied 20th–22nd, any of them scores 0 when the target is 21st. Lists come from Wikipedia, and each one shows the date it's correct to.
      </p>
      <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
        Got it
      </button>
    </Sheet>
  );
}
