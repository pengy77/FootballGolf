import { useState } from 'react';
import { NavGuard, useApp } from '../App';
import { COURSES } from '../lib/data';
import { cleanName, donePlayers, isDone, NAME_MAX, sameName } from '../lib/game';
import { HowToSteps } from '../components/HowTo';
import { Icons, IconButton, Logo, Tag, TopBar } from '../components/ui';
import Message from './Message';

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function Join({ id }: { id: string }) {
  const { saved, saveGame, setName, go } = useApp();
  const game = saved.games[id];
  const [name, setNameInput] = useState(saved.name);
  const [error, setError] = useState('');
  const [spoilerCheck, setSpoilerCheck] = useState(false);

  if (!game) return <Message title="Game not found" body="We couldn't find that game on this phone. Open the link your friend sent you again." />;
  if (game.me !== null) return <NavGuard to={isDone(game, game.me) ? `/results/${id}` : `/play/${id}`} />;

  const done = donePlayers(game);
  const doneNames = done.map((i) => game.players[i].name);
  const course = COURSES.find((c) => c.id === game.course)?.name ?? 'Mixed';

  const teeOff = () => {
    const n = cleanName(name);
    if (!n) return setError('Pop your name in first.');
    if (game.players.some((p) => sameName(p.name, n)))
      return setError(`${n} has already played this one. Pick a different name.`);
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

      <form
        className="card form-card join-form"
        onSubmit={(e) => {
          e.preventDefault();
          teeOff();
        }}
      >
        <label className="field-title" htmlFor="join-name">
          Your name
        </label>
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
          }}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block btn-lg">
          Tee off
        </button>
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
