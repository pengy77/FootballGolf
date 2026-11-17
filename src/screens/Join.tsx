import { useState } from 'react';
import { NavGuard, useApp, useCanonicalUrl } from '../App';
import { COURSES } from '../lib/data';
import { cleanName, donePlayers, isDone, isPlayable, MAX_LINK_PLAYERS, NAME_MAX, sameName } from '../lib/game';
import { findGame } from '../lib/store';
import { dailyLabel } from '../lib/daily';
import { Ball, BALL_FILL, HeroArt } from '../components/art';
import { Icons, IconButton, Tag, TopBar } from '../components/ui';
import Message from './Message';

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function Join({ id }: { id: string }) {
  const { saved, saveGame, setName, go, showHowTo } = useApp();
  const game = findGame(saved, id);
  const [name, setNameInput] = useState(saved.name);
  const [editing, setEditing] = useState(!saved.name);
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
  const daily = dailyLabel(id);
  const course = daily ?? COURSES.find((c) => c.id === game.course)?.name ?? 'Mixed';
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
    if (full) return setError(`This course already has ${MAX_LINK_PLAYERS} players.`);
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
        right={
          <IconButton label="How to play" onClick={showHowTo}>
            {Icons.help}
          </IconButton>
        }
      />
      <div className="join-hero">
        {done.length > 0 ? (
          <div className="versus" aria-hidden="true">
            {done.slice(0, 3).map((i) => (
              <span key={i} className="vs-ball">
                <Ball size={done.length > 1 ? 44 : 60} fill={BALL_FILL[i % BALL_FILL.length]} />
                <small>{game.players[i].name}</small>
              </span>
            ))}
            <span className="vs-v">v</span>
            <span className="vs-ball is-you">
              <span className="vs-q">?</span>
              <small>You</small>
            </span>
          </div>
        ) : (
          <HeroArt />
        )}
        <p className="kicker">
          {course} · {game.holes.length} holes
        </p>
        <h1 className="join-title">
          {done.length === 0 ? 'Fancy a round?' : done.length === 1 ? `${doneNames[0]} challenged you` : `${listNames(doneNames)} have played`}
        </h1>
      </div>

      {done.length >= 2 && claim === null && (
        <div className="who-buttons" aria-label="Already played?">
          {done.map((i) => (
            <button key={i} type="button" className="btn btn-secondary who-btn" onClick={() => claimCard(i)}>
              I'm <Tag name={game.players[i].name} index={i} small />
            </button>
          ))}
        </div>
      )}

      <form
        className="join-form"
        onSubmit={(e) => {
          e.preventDefault();
          teeOff();
        }}
      >
        {claim !== null ? (
          <div className="claim" role="alert">
            <p>
              <b>{game.players[claim].name}</b> has already played this. Is that you?
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => claimCard(claim)}>
              Yes, show my card
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => {
                setClaim(null);
                setNameInput('');
                setEditing(true);
              }}
            >
              No, use another name
            </button>
          </div>
        ) : editing ? (
          <>
            <input
              id="join-name"
              className={`input${error ? ' is-error' : ''}`}
              value={name}
              maxLength={NAME_MAX}
              placeholder="Your name"
              aria-label="Your name"
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
          </>
        ) : (
          <>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block btn-lg">
              Tee off as {saved.name}
            </button>
            <button type="button" className="link-btn not-me" onClick={() => setEditing(true)}>
              Not {saved.name}?
            </button>
          </>
        )}
      </form>

      {done.length > 0 && (
        <div className="join-spectate">
          {!spoilerCheck ? (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setSpoilerCheck(true)}>
              Just show me the scores
            </button>
          ) : (
            <div className="spoiler">
              <p>This shows every answer, so you can't play it fairly after.</p>
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
