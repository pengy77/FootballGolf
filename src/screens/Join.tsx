import { useState } from 'react';
import { NavGuard, useApp, useCanonicalUrl } from '../App';
import { COURSES } from '../lib/data';
import { cleanName, donePlayers, isDone, isPlayable, MAX_LINK_PLAYERS, NAME_MAX, sameName } from '../lib/game';
import { findGame } from '../lib/store';
import { HowToSteps } from '../components/HowTo';
import { Icons, IconButton, Logo, Tag, TopBar } from '../components/ui';
import Message from './Message';

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function Join({ id }: { id: string }) {
  const { saved, saveGame, setName, go } = useApp();
  const game = findGame(saved, id);
  const [name, setNameInput] = useState(saved.name);
  const [error, setError] = useState('');
  const [claim, setClaim] = useState<number | null>(null);
  const [spoilerCheck, setSpoilerCheck] = useState(false);
  useCanonicalUrl(game);

  if (!game) return <Message title="Game not found" body="We couldn't find that game on this phone. Open the link your friend sent you again." />;
  if (!isPlayable(game))
    return <Message title="This course has closed" body="One of the lists this game used has been removed since the link was made. Start a fresh game instead." />;
  if (game.me !== null) return <NavGuard to={isDone(game, game.me) ? `/results/${id}` : `/play/${id}`} />;
  if (game.mode === 'local') return <NavGuard to={game.players.every((_, i) => isDone(game, i)) ? `/results/${id}` : `/play/${id}`} />;

  const done = donePlayers(game);
  const doneNames = done.map((i) => game.players[i].name);
  const course = COURSES.find((c) => c.id === game.course)?.name ?? 'Mixed';
  const full = game.players.length >= MAX_LINK_PLAYERS;

  // "That's me": the person who already played opens the link somewhere new (another browser, Home Screen app).
  const claimCard = (index: number) => {
    setName(game.players[index].name);
    saveGame({ ...game, me: index, revealed: game.holes.length, seen: [game.players[index].name] });
    go(`/results/${id}`, { replace: true });
  };

  const teeOff = () => {
    const n = cleanName(name);
    if (!n) return setError('Pop your name in first.');
    const existing = game.players.findIndex((p) => sameName(p.name, n));
    if (existing >= 0) {
      setClaim(existing);
      return setError('');
    }
    if (full) return setError(`This course already has ${MAX_LINK_PLAYERS} players. Have a look at the scores instead.`);
    setName(n);
    saveGame({
      ...game,
      players: [...game.players, { name: n, picks: game.holes.map(() => null) }],
      me: game.players.length,
      revealed: 0,
      seen: [],
    });
    go(`/play/${id}`, { replace: true });
  };

  return (
    <main className="screen join">
      <TopBar
        left={
          <IconButton label="Home" onClick={() => go('/')}>
            {Icons.close}
          </IconButton>
        }
      />
      <div className="join-hero">
        <Logo size={64} />
        <p className="kicker">Football Golf</p>
        <h1 className="join-title">
          {done.length === 0 ? 'Fancy a round?' : done.length === 1 ? `${doneNames[0]} has challenged you` : `${listNames(doneNames)} have played`}
        </h1>
        <p className="lead">
          {done.length === 1 ? (
            <>
              They've played a {game.holes.length}-hole course and their card is sealed until you finish yours.
            </>
          ) : done.length > 1 ? (
            <>Play the same {game.holes.length} holes and see where you finish, or just look at the scores.</>
          ) : (
            <>A {game.holes.length}-hole course is waiting for you.</>
          )}
        </p>
        {done.length > 0 && (
          <div className="join-players">
            {done.map((i) => (
              <Tag key={i} name={game.players[i].name} index={i} />
            ))}
            <span className="join-course">
              {game.holes.length} holes · {course}
            </span>
          </div>
        )}
      </div>

      {done.length >= 2 && (
        <section className="card form-card who-card" aria-label="Already played">
          <h2 className="field-title">Already played this one?</h2>
          <p className="field-help">Tap your name to watch the hole-by-hole reveal.</p>
          <div className="who-buttons">
            {done.map((i) => (
              <button key={i} type="button" className="btn btn-secondary who-btn" onClick={() => claimCard(i)}>
                I'm <Tag name={game.players[i].name} index={i} small />
              </button>
            ))}
          </div>
        </section>
      )}

      <form
        className="card form-card join-form"
        onSubmit={(e) => {
          e.preventDefault();
          teeOff();
        }}
      >
        <label className="field-title" htmlFor="join-name">
          {done.length >= 2 ? 'New player? Your name' : 'Your name'}
        </label>
        {done.length === 1 && <p className="field-help">Already played this one? Enter the same name to see your card.</p>}
        <input
          id="join-name"
          className={`input${error ? ' is-error' : ''}`}
          value={name}
          maxLength={NAME_MAX}
          placeholder="Your name"
          autoCapitalize="words"
          autoComplete="nickname"
          enterKeyHint="go"
          onChange={(e) => {
            setNameInput(e.target.value);
            setError('');
            setClaim(null);
          }}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {claim !== null ? (
          <div className="claim" role="alert">
            <p>
              <b>{game.players[claim].name}</b> has already played this course. Is that you?
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => claimCard(claim)}>
              Yes, that's me. Show my card
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => {
                setClaim(null);
                setNameInput('');
              }}
            >
              No, I'll use another name
            </button>
          </div>
        ) : (
          <button type="submit" className="btn btn-primary btn-block btn-lg">
            Tee off
          </button>
        )}
      </form>

      <section className="card howto-card">
        <h2 className="field-title">How it works</h2>
        <HowToSteps />
      </section>

      {done.length > 0 && (
        <div className="join-spectate">
          {!spoilerCheck ? (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setSpoilerCheck(true)}>
              {done.length === 1 ? `Not playing? See ${doneNames[0]}'s card` : 'Just show me the scores'}
            </button>
          ) : (
            <div className="spoiler">
              <p>This shows every answer, so you won't be able to play this course fairly.</p>
              <div className="row">
                <button type="button" className="btn btn-secondary" onClick={() => setSpoilerCheck(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-dark" onClick={() => go(`/results/${id}`)}>
                  Show me
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
