import { useCallback, useEffect, useState } from 'react';
import { NavGuard, useApp, useCanonicalUrl } from '../App';
import { createGame, donePlayers, isDone, isPlayable, standings } from '../lib/game';
import { findGame } from '../lib/store';
import { dailyId, dailyLabel, formatCountdown, msUntilNextDaily } from '../lib/daily';
import { shareUrl } from '../lib/link';
import { coursePar, toParWords } from '../lib/par';
import { copyText, shareLink } from '../lib/share';
import { Ball, BALL_FILL, Trophy } from '../components/art';
import { Confetti } from '../components/Confetti';
import { Reveal, RevealCta } from '../components/Reveal';
import { Scorecard } from '../components/Scorecard';
import { HoleDots, Icons, IconButton, TopBar } from '../components/ui';
import Message from './Message';

export default function Results({ id }: { id: string }) {
  const { saved, saveGame, go, toast } = useApp();
  const found = findGame(saved, id);
  const game = found && isPlayable(found) ? found : undefined;
  useCanonicalUrl(game);
  const done = game ? donePlayers(game) : [];
  const unseen = game ? done.filter((i) => !game.seen.includes(game.players[i].name)) : [];
  const [step, setStep] = useState(() => (game && unseen.length > 0 ? 0 : (game?.holes.length ?? 0)));
  const [confetti, setConfetti] = useState(0);
  const [armed, setArmed] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const summary = !!game && step >= game.holes.length;
  const onSettled = useCallback(() => setArmed(true), []);

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
  const url = shareUrl(game);
  // Am I the latest finisher? Then the others are waiting for me to send the card back.
  const others = done.filter((i) => i !== meIndex);
  const returning = game.mode === 'challenge' && meIndex !== null && !solo && done[done.length - 1] === meIndex;
  const otherNames = others.map((i) => game.players[i].name);
  const sendTo = returning && otherNames.length === 1 ? otherNames[0] : null;

  // Share text never includes scores, so the chat preview doesn't spoil the reveal.
  const shareText = solo
    ? daily
      ? `⛳ Football Golf ${daily}: I've played today's ${n} holes. Can you beat me?`
      : `⛳ I've just played a ${n}-hole round of Football Golf. Your turn: can you beat me?`
    : game.mode === 'local'
      ? `⛳ We've just played ${n} holes of Football Golf. Think you can beat us? Play the same course:`
      : returning
        ? `⛳ I've played your Football Golf course${sendTo ? `, ${sendTo}` : ''}. Tap to see who won:`
        : `⛳ Football Golf: see who won, or play the same ${n} holes yourself:`;

  const share = async () => {
    const out = await shareLink({ title: 'Football Golf', text: shareText, url });
    if (out === 'copied') toast('Link copied. Paste it into your chat.');
    if (out === 'failed') {
      setShowUrl(true);
      toast("Couldn't share. Long-press the link below to copy it.");
    }
  };

  const copy = async () => {
    if (await copyText(url)) return toast('Link copied. Paste it into your chat.');
    setShowUrl(true);
    toast("Couldn't copy. Long-press the link below to copy it.");
  };

  const rematch = () => {
    if (game.mode === 'challenge') return go('/new/live');
    const g = createGame({ mode: 'local', course: game.course, holes: n, names: game.players.map((p) => p.name), me: null });
    saveGame(g);
    go(`/play/${g.id}`);
  };

  const shareLabel = solo
    ? game.me !== null
      ? 'Challenge a mate'
      : 'Share'
    : sendTo
      ? `Send to ${sendTo}`
      : returning
        ? 'Send the result back'
        : game.mode === 'local'
          ? 'Challenge someone else'
          : 'Share the card';
  const sharePrimary = solo ? game.me !== null : returning || game.mode === 'local';
  // The main ask stays pinned to the bottom, so the card can sit right under the total.
  const shareRow = (game.me !== null || !solo) && (
    <div className="share-row">
      <button type="button" className={`btn btn-block ${sharePrimary ? 'btn-primary btn-lg' : 'btn-secondary'}`} onClick={share}>
        {Icons.share} {shareLabel}
      </button>
      <IconButton label="Copy link" onClick={copy}>
        {Icons.copy}
      </IconButton>
    </div>
  );

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

      <section className={`final${solo ? ' is-solo' : ''}`}>
        {solo ? (
          <>
            <p className="final-kicker">{game.me !== null ? 'You went round in' : `${game.players[done[0]].name} went round in`}</p>
            <p className="final-big">{s[0].total}</p>
            <p className="final-unit">strokes</p>
            <p className={`final-par ${s[0].total - coursePar(game.holes) > 0 ? 'is-over' : 'is-under'}`}>
              {toParWords(s[0].total - coursePar(game.holes))}
            </p>
          </>
        ) : (
          <>
            <Trophy size={52} />
            <p className={`final-big is-name${winners.length === 1 && game.players[winners[0].index].name.length > 7 ? ' is-long' : ''}`}>
              {winners.length > 1 ? 'All square' : iWon ? 'You win!' : `${game.players[winners[0].index].name} wins`}
            </p>
            <ol className="duel">
              {s.map((x) => (
                <li key={x.index} className={x.place === 1 ? 'is-win' : undefined}>
                  <Ball size={22} fill={BALL_FILL[x.index % BALL_FILL.length]} />
                  <span className="duel-name">{game.players[x.index].name}</span>
                  <b>{x.total}</b>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <Scorecard game={game} players={s.map((x) => x.index)} />

      {shareRow && !sharePrimary && shareRow}
      {showUrl && (
        <p className="share-url" aria-label="Game link">
          {url}
        </p>
      )}
      {isToday && solo && <p className="fine center">Next daily in {formatCountdown(msUntilNextDaily())}</p>}

      <div className="end-actions">
        <button type="button" className="btn btn-secondary btn-block" onClick={rematch}>
          {game.mode === 'local' ? 'Rematch' : 'Play your mates live'}
        </button>
        {done.length >= 2 && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setStep(0)}>
            Watch the reveal again
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-block" onClick={() => go('/')}>
          Home
        </button>
      </div>
      {shareRow && sharePrimary && <div className="sticky-cta">{shareRow}</div>}
      <Confetti fire={confetti} />
    </main>
  );
}
