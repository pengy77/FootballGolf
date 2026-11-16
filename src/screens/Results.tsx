import { useCallback, useEffect, useState } from 'react';
import { NavGuard, useApp, useCanonicalUrl } from '../App';
import { CATEGORY_BY_ID } from '../lib/data';
import { createGame, donePlayers, holeResult, isDone, isPlayable, ordinal, rankLabel, standings, type Game } from '../lib/game';
import { findGame } from '../lib/store';
import { shareUrl } from '../lib/link';
import { copyText, shareLink } from '../lib/share';
import { Confetti } from '../components/Confetti';
import { RankedList, type Mark } from '../components/RankedList';
import { Reveal, RevealCta } from '../components/Reveal';
import { Scorecard } from '../components/Scorecard';
import { FlagIcon, Icons, IconButton, Tag, TopBar } from '../components/ui';
import Message from './Message';

function HoleRecap({ game, hole, players }: { game: Game; hole: number; players: number[] }) {
  const h = game.holes[hole];
  const cat = CATEGORY_BY_ID.get(h.cat);
  const [open, setOpen] = useState(false);
  if (!cat) return null;
  const rows = players.map((p) => ({ p, r: holeResult(h, game.players[p].picks[hole] ?? null) }));
  const marks = new Map<string, Mark[]>();
  rows.forEach(({ p, r }) => r.item && marks.set(r.item.id, [...(marks.get(r.item.id) ?? []), { name: game.players[p].name, index: p }]));
  return (
    <li className="recap">
      <button type="button" className="recap-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="recap-n">{hole + 1}</span>
        <span className="recap-q">
          <b>{ordinal(h.target)}</b> {cat.prompt}
        </span>
        <span className={`recap-caret${open ? ' is-open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>
      <ul className="recap-picks">
        {rows.map(({ p, r }) => (
          <li key={p}>
            <Tag name={game.players[p].name} index={p} small />
            <span className="recap-pick">{r.item ? r.item.name : r.offList ? `“${r.offList}”` : 'No answer'}</span>
            <span className="recap-rank">{r.item ? rankLabel(r.item) : 'OB'}</span>
            <span className="recap-strokes">{r.strokes}</span>
          </li>
        ))}
      </ul>
      {open && <RankedList cat={cat} target={h.target} marks={marks} />}
    </li>
  );
}

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

  if (!summary) {
    return (
      <main className="screen play">
        <TopBar
          left={
            <IconButton label="Home" onClick={() => go('/')}>
              {Icons.close}
            </IconButton>
          }
          title={
            <div className="progress" aria-label={`Replay, hole ${step + 1} of ${n}`}>
              <span className="progress-label">Replay</span>
              <span className="progress-dots" aria-hidden="true">
                {game.holes.map((_, i) => (
                  <i key={i} className={i < step ? 'is-done' : i === step ? 'is-now' : undefined} />
                ))}
              </span>
            </div>
          }
          right={
            <button type="button" className="link-btn skip" onClick={() => setStep(n)}>
              Skip
            </button>
          }
        />
        {step === 0 && unseen.length > 0 && game.me !== null && (
          <p className="replay-note">
            <b>{unseen.map((i) => game.players[i].name).join(' & ')}</b> played your course. Here's how it went, hole by hole.
          </p>
        )}
        <Reveal
          key={step}
          game={game}
          hole={step}
          players={done}
          animate
          onSettled={onSettled}
          after={<Scorecard game={game} players={done} upTo={step + 1} current={step} />}
        />
        <RevealCta
          armed={armed}
          label={step === n - 1 ? 'See final scores' : `On to hole ${step + 2}`}
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
    ? `⛳ I've just played a ${n}-hole round of Football Golf. Your turn: can you beat me?`
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

  const urlBox = showUrl && (
    <p className="share-url" aria-label="Game link">
      {url}
    </p>
  );

  const rematch = () => {
    const names = game.mode === 'local' ? game.players.map((p) => p.name) : [game.players[meIndex ?? 0]?.name ?? saved.name];
    if (game.mode === 'challenge' && meIndex === null) return go('/new/challenge');
    const g = createGame({
      mode: game.mode,
      course: game.course,
      holes: n,
      names,
      me: game.mode === 'challenge' ? 0 : null,
    });
    saveGame(g);
    go(`/play/${g.id}`);
  };

  return (
    <main className="screen results">
      <TopBar
        left={
          <IconButton label="Home" onClick={() => go('/')}>
            {Icons.close}
          </IconButton>
        }
        title={<span className="topbar-label">Final card</span>}
      />

      <section className={`banner${solo ? ' is-solo' : ''}`}>
        {solo ? (
          <>
            <p className="banner-kicker">{game.me !== null ? 'You went round in' : `${game.players[done[0]].name} went round in`}</p>
            <p className="banner-big">
              {s[0].total} <span>strokes</span>
            </p>
            <p className="banner-sub">
              {game.me !== null ? 'Now send it to a friend. They play the same holes, then send you the result.' : 'Lowest score wins.'}
            </p>
          </>
        ) : (
          <>
            <p className="banner-kicker">{iWon && winners.length === 1 ? 'Get in!' : 'Full time'}</p>
            <p className="banner-big">
              {winners.length > 1 ? 'All square!' : `${game.players[winners[0].index].name} wins!`}
            </p>
            <p className="banner-sub">
              {s.map((x) => x.total).join(' v ')} · fewest strokes wins
            </p>
          </>
        )}
      </section>

      {game.me !== null && solo && (
        <section className="card share-card">
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={share}>
            {Icons.share} Send to a friend
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={copy}>
            {Icons.copy} Copy link
          </button>
          {urlBox}
          <p className="fine">They play the same holes without seeing your answers. Their result comes back to you as a link: open it to watch the head-to-head.</p>
        </section>
      )}

      <Scorecard game={game} players={s.map((x) => x.index)} upTo={n} />

      {s.length > 2 && (
        <ol className="standings card">
          {s.map((x) => (
            <li key={x.index}>
              <span className="st-place">{ordinal(x.place)}</span>
              <Tag name={game.players[x.index].name} index={x.index} small />
              <span className="st-total">{x.total}</span>
            </li>
          ))}
        </ol>
      )}

      {!solo && (
        <section className="card share-card">
          {returning && (
            <p className="share-lead">
              <b>{sendTo ?? otherNames.join(' & ')}</b> won't see how it went until you send this.
            </p>
          )}
          <button type="button" className={`btn btn-block ${returning || game.mode === 'local' ? 'btn-primary btn-lg' : 'btn-secondary'}`} onClick={share}>
            {Icons.share} {sendTo ? `Send to ${sendTo}` : returning ? 'Send the result back' : game.mode === 'local' ? 'Challenge someone else' : 'Share the card'}
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={copy}>
            {Icons.copy} Copy link
          </button>
          {urlBox}
          <p className="fine">Anyone with the link can also play the same course and join the card.</p>
        </section>
      )}

      <section>
        <h2 className="section-title">
          <FlagIcon size={16} /> Hole by hole
        </h2>
        <ol className="recaps">
          {game.holes.map((_, i) => (
            <HoleRecap key={i} game={game} hole={i} players={s.map((x) => x.index)} />
          ))}
        </ol>
      </section>

      <div className="end-actions">
        <button type="button" className="btn btn-secondary btn-block" onClick={rematch}>
          {game.mode === 'local' ? 'Rematch on a new course' : meIndex !== null ? 'New course, new challenge' : 'Start your own game'}
        </button>
        {!summary || done.length < 2 ? null : (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setStep(0)}>
            Watch the reveal again
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-block" onClick={() => go('/')}>
          Home
        </button>
      </div>
      <Confetti fire={confetti} />
    </main>
  );
}
