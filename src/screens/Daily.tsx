import { useState } from 'react';
import { NavGuard, useApp } from '../App';
import { DAILY_HOLES, dailyId, dailyKey, dailyNumber, newDailyGame } from '../lib/daily';
import { cleanName, isDone, NAME_MAX } from '../lib/game';
import { findGame } from '../lib/store';
import { HowToSteps } from '../components/HowTo';
import { Icons, IconButton, Logo, TopBar } from '../components/ui';

/** Today's daily: straight into it if we know your name, otherwise ask for it first. */
export default function Daily() {
  const { saved, saveGame, setName, go } = useApp();
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
    if (!n) return setError('Pop your name in first. Friends see it when you share your card.');
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
        title={<span className="topbar-label">Daily challenge</span>}
      />
      <div className="join-hero">
        <Logo size={64} />
        <p className="kicker">Daily #{dailyNumber(key)}</p>
        <h1 className="join-title">Today's {DAILY_HOLES} holes</h1>
        <p className="lead">Same holes for everyone today. Play once, then send your card to a mate to see who's better.</p>
      </div>
      <form
        className="card form-card join-form"
        onSubmit={(e) => {
          e.preventDefault();
          teeOff();
        }}
      >
        <label className="field-title" htmlFor="daily-name">
          Your name
        </label>
        <input
          id="daily-name"
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
    </main>
  );
}
