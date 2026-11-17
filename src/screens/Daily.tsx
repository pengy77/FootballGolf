import { useState } from 'react';
import { NavGuard, useApp } from '../App';
import { DAILY_HOLES, dailyId, dailyKey, dailyNumber, newDailyGame } from '../lib/daily';
import { cleanName, isDone, NAME_MAX } from '../lib/game';
import { findGame } from '../lib/store';
import { HeroArt } from '../components/art';
import { Icons, IconButton, TopBar } from '../components/ui';

/** Today's daily: straight into it if we know your name, otherwise ask for it first. */
export default function Daily() {
  const { saved, saveGame, setName, go, showHowTo } = useApp();
  const key = dailyKey();
  const id = dailyId(key);
  const existing = findGame(saved, id);
  const [name, setNameInput] = useState(saved.name);
  const [error, setError] = useState('');

  if (existing && existing.me !== null) return <NavGuard to={isDone(existing, existing.me) ? `/results/${id}` : `/play/${id}`} />;
  // A friend's daily link got here first: join their card.
  if (existing) return <NavGuard to={`/join/${id}`} />;

  const teeOff = () => {
    const n = cleanName(name);
    if (!n) return setError('Pop your name in first.');
    setName(n);
    saveGame(newDailyGame(n, key));
    go(`/play/${id}`, { replace: true });
  };

  return (
    <main className="screen join">
      <TopBar
        left={
          <IconButton label="Home" onClick={() => go('/')}>
            {Icons.back}
          </IconButton>
        }
        right={
          <IconButton label="How to play" onClick={showHowTo}>
            {Icons.help}
          </IconButton>
        }
      />
      <div className="join-hero">
        <HeroArt />
        <p className="kicker">Daily #{dailyNumber(key)}</p>
        <h1 className="join-title">{DAILY_HOLES} holes</h1>
      </div>
      <form
        className="join-form"
        onSubmit={(e) => {
          e.preventDefault();
          teeOff();
        }}
      >
        <input
          id="daily-name"
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
      </form>
    </main>
  );
}
