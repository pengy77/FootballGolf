import { useCallback, useEffect, useState } from 'react';
import { NavGuard, useApp, useCanonicalUrl } from '../App';
import { createGame, donePlayers, isDone, isPlayable, ordinal, standings } from '../lib/game';
import { findGame } from '../lib/store';
import { dailyId, dailyLabel, formatCountdown, msUntilNextDaily } from '../lib/daily';
import { Trophy } from '../components/art';
import { Confetti } from '../components/Confetti';
import { ShareButton, useGameShare } from '../components/GameShare';
import { Reveal, RevealCta } from '../components/Reveal';
import { Scorecard } from '../components/Scorecard';
import { HoleDots, Icons, IconButton, TopBar } from '../components/ui';
import Message from './Message';

export default function Results({ id }: { id: string }) {
  const { saved, saveGame, go } = useApp();
  const found = findGame(saved, id);
  const game = found && isPlayable(found) ? found : undefined;
  useCanonicalUrl(game);
  const done = game ? donePlayers(game) : [];
  const unseen = game ? done.filter((i) => !game.seen.includes(game.players[i].name)) : [];
  const [step, setStep] = useState(() => (game && unseen.length > 0 ? 0 : (game?.holes.length ?? 0)));
  const [confetti, setConfetti] = useState(0);
  const [armed, setArmed] = useState(false);
  const summary = !!game && step >= game.holes.length;
  const onSettled = useCallback(() => setArmed(true), []);
  const { share, urlBox, label: shareLabel, canShare } = useGameShare(game);

  useEffect(() => setArmed(false), [step]);

  useEffect(() => {
    if (!game || !summary) return;
    if (unseen.length) saveGame({ ...game, seen: done.map((i) => game.players[i].name) });
    const s0 = standings(game, done);
    const won = game.me !== null && s0.some((x) => x.place === 1 && x.index === game.me);
    if (done.length > 1 && (won || game.me === null)) setConfetti(Date.now());
    // Only when arriving at the summary.
  }, [summary]); // eslint-disable-line react-hooks/exhaustive-deps

  if (found && !game)
    return <Message title="This course has closed" body="One of the lists this game used has been removed since it was made. Start a fresh game instead." />;
  if (!game) return <Message title="Game not found" body="This game isn't saved on this phone any more." />;
  if (game.mode === 'challenge' && game.me !== null && !isDone(game, game.me)) return <NavGuard to={`/play/${id}`} />;
  if (done.length === 0) return <NavGuard to={`/join/${id}`} />;

  const n = game.holes.length;
  const daily = dailyLabel(game.id);
  const isToday = game.id === dailyId();

  if (!summary) {
    return (
      <main className="screen play revealing">
        <TopBar
          left={
            <IconButton label="Home" onClick={() => go('/')}>
              {Icons.close}
            </IconButton>
          }
          title={<HoleDots count={n} current={step} label="Replay" />}
          right={
            <button type="button" className="link-btn skip" onClick={() => setStep(n)}>
              Skip
            </button>
          }
        />
        {step === 0 && unseen.length > 0 && game.me !== null && (
          <p className="replay-note">
            <b>{unseen.map((i) => game.players[i].name).join(' & ')}</b> played your course
          </p>
        )}
        <Reveal key={step} game={game} hole={step} players={done} animate onSettled={onSettled} />
        <RevealCta
          armed={armed}
          label={step === n - 1 ? 'Final scores' : `Hole ${step + 2}`}
          onNext={() => {
            setStep(step + 1);
            window.scrollTo({ top: 0 });
          }}
        />
      </main>
    );
  }

  const s = standings(game, done);
  const winners = s.filter((x) => x.place === 1);
  const solo = done.length === 1;
  const meIndex = game.me;
  const iWon = meIndex !== null && winners.some((w) => w.index === meIndex);

  const rematch = () => {
    const g = createGame({ mode: 'local', course: game.course, holes: n, names: game.players.map((p) => p.name), me: null });
    saveGame(g);
    go(`/play/${g.id}`);
  };

  const winnerName = game.players[winners[0].index].name;
  const headline =
    winners.length > 1
      ? 'All square'
      : iWon
        ? 'You win!'
        : game.mode === 'challenge' && meIndex !== null && done.length > 2
          ? `You came ${ordinal(s.find((x) => x.index === meIndex)!.place)}`
          : `${winnerName} wins`;

  // Read top to bottom: the result, the card it came from, then the one thing to do with it.
  return (
    <main className="screen results">
      <TopBar
        left={
          <IconButton label="Home" onClick={() => go('/')}>
            {Icons.close}
          </IconButton>
        }
        title={<span className="topbar-label">{daily ?? 'Full time'}</span>}
      />

      {solo ? (
        <section className="final is-solo" aria-label="Your score">
          <p className="final-score">{s[0].total}</p>
          <p className="final-unit">{s[0].total === 1 ? 'stroke' : 'strokes'}</p>
        </section>
      ) : (
        <section className="final" aria-label="Result">
          <Trophy size={40} />
          <p className={`final-big is-name${headline.length > 12 ? ' is-long' : ''}`}>{headline}</p>
        </section>
      )}

      <Scorecard game={game} players={s.map((x) => x.index)} />

      <div className="sticky-cta results-cta">
        {canShare ? (
          <ShareButton label={shareLabel} onShare={share} />
        ) : (
          game.mode === 'local' && (
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={rematch}>
              Rematch
            </button>
          )
        )}
        {urlBox}
        {canShare && game.mode === 'local' ? (
          <button type="button" className="link-btn" onClick={rematch}>
            Rematch
          </button>
        ) : (
          isToday && meIndex !== null && <p className="today-next">Next daily in {formatCountdown(msUntilNextDaily())}</p>
        )}
      </div>
      <Confetti fire={confetti} />
    </main>
  );
}
