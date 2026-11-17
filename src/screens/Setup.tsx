import { useState } from 'react';
import { useApp } from '../App';
import { COURSES, poolSize, type CourseId } from '../lib/data';
import { cleanName, createGame, MAX_PLAYERS, NAME_MAX, sameName } from '../lib/game';
import { newSecret } from '../live/crypto';
import { newDoc, newRoom } from '../live/room';
import { newRoomIds, putRoom, roomCode } from '../live/rooms';
import { Ball, BALL_FILL } from '../components/art';
import { Icons, IconButton, TopBar } from '../components/ui';

const HOLE_OPTIONS = [3, 6, 9];
const CLOCK_OPTIONS = [30, 60, 90];

export default function Setup({ mode }: { mode: 'live' | 'local' }) {
  const { go, saved, saveGame, setName } = useApp();
  const [names, setNames] = useState<string[]>(mode === 'local' ? [saved.name, ''] : [saved.name]);
  const [holes, setHoles] = useState(3);
  const [course, setCourse] = useState<CourseId>('mixed');
  const [clock, setClock] = useState(60);
  const [tried, setTried] = useState(false);

  // A league table's seasons count once: a round never has two seasons of the same table.
  const pool = poolSize(course);
  const holeCount = Math.min(holes, pool);
  const cleaned = names.map(cleanName);
  const dupes = cleaned.map((n, i) => !!n && cleaned.findIndex((m) => sameName(m, n)) !== i);
  const valid = cleaned.every(Boolean) && !dupes.some(Boolean);

  const start = () => {
    setTried(true);
    if (!valid) return;
    setName(cleaned[0]);
    if (mode === 'live') {
      const { id, playerId } = newRoomIds();
      const secret = newSecret();
      const now = Date.now();
      const state = newRoom({ hostId: playerId, hostName: cleaned[0], course, holeCount, turnMs: clock * 1000, now });
      putRoom({ id, secret, playerId, host: true, name: cleaned[0], doc: newDoc(playerId, cleaned[0], 1), state, updatedAt: now });
      return go(`/r/${roomCode({ id, secret })}`, { replace: true });
    }
    const g = createGame({ mode, course, holes: holeCount, names: cleaned, me: null });
    saveGame(g);
    go(`/play/${g.id}`, { replace: true });
  };

  return (
    <main className="screen setup">
      <TopBar
        left={
          <IconButton label="Back" onClick={() => go('/')}>
            {Icons.back}
          </IconButton>
        }
        title={<span className="topbar-label">{mode === 'live' ? 'Live challenge' : 'Pass & play'}</span>}
      />

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <section className="setup-group">
          <h2 className="field-title">{mode === 'live' ? 'You' : 'Players'}</h2>
          <div className="names">
            {names.map((n, i) => (
              <div key={i} className="name-row">
                <Ball size={26} fill={BALL_FILL[i % BALL_FILL.length]} className="name-ball" />
                <input
                  className={`input${tried && (!cleaned[i] || dupes[i]) ? ' is-error' : ''}`}
                  value={n}
                  maxLength={NAME_MAX}
                  placeholder={mode === 'live' ? 'Your name' : `Player ${i + 1}`}
                  aria-label={mode === 'live' ? 'Your name' : `Player ${i + 1} name`}
                  autoCapitalize="words"
                  autoComplete={i === 0 ? 'nickname' : 'off'}
                  enterKeyHint={i === names.length - 1 ? 'go' : 'next'}
                  onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {mode === 'local' && names.length > 2 && (
                  <IconButton label={`Remove player ${i + 1}`} onClick={() => setNames(names.filter((_, j) => j !== i))}>
                    {Icons.close}
                  </IconButton>
                )}
              </div>
            ))}
          </div>
          {tried && !valid && (
            <p className="field-error" role="alert">
              {cleaned.some((x) => !x) ? 'Every player needs a name.' : 'Names need to be different.'}
            </p>
          )}
          {mode === 'local' && names.length < MAX_PLAYERS && (
            <button type="button" className="link-btn add-player" onClick={() => setNames([...names, ''])}>
              {Icons.plus} Add player
            </button>
          )}
        </section>

        <section className="setup-group">
          <h2 className="field-title">Holes</h2>
          <div className="segmented" role="radiogroup" aria-label="Number of holes">
            {HOLE_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={holes === n}
                disabled={n > pool}
                className={holes === n ? 'is-on' : undefined}
                onClick={() => setHoles(n)}
              >
                <b>{n}</b>
                <small>{n === 3 ? '~3 min' : n === 6 ? '~6 min' : '~10 min'}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="setup-group">
          <h2 className="field-title">Course</h2>
          <div className="courses" role="radiogroup" aria-label="Course">
            {COURSES.map((c) => {
              const n = poolSize(c.id);
              if (!n) return null;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={course === c.id}
                  className={`course${course === c.id ? ' is-on' : ''}`}
                  onClick={() => {
                    setCourse(c.id);
                    if (holes > n) setHoles(HOLE_OPTIONS.filter((x) => x <= n).pop() ?? 3);
                  }}
                >
                  <span className="course-name">{c.name}</span>
                  <span className="course-blurb">{n} lists</span>
                </button>
              );
            })}
          </div>
        </section>

        {mode === 'live' && (
          <section className="setup-group">
            <h2 className="field-title">Shot clock</h2>
            <div className="segmented" role="radiogroup" aria-label="Shot clock">
              {CLOCK_OPTIONS.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={clock === n} className={clock === n ? 'is-on' : undefined} onClick={() => setClock(n)}>
                  <b>{n}s</b>
                  <small>{n === 30 ? 'Quick-fire' : n === 60 ? 'Standard' : 'Relaxed'}</small>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="sticky-cta">
          <button type="submit" className="btn btn-primary btn-block btn-lg">
            {mode === 'live' ? 'Open the room' : 'Tee off'}
          </button>
        </div>
      </form>
    </main>
  );
}
