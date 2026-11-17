import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { donePlayers, holeResult, isDone, ordinal, playerTotal, standings, type Game } from '../lib/game';
import { CATEGORIES } from '../lib/data';
import { dailyId, dailyKey, dailyLabel, dailyNumber, formatCountdown, msUntilNextDaily, newDailyGame, DAILY_HOLES } from '../lib/daily';
import { findGame } from '../lib/store';
import { asGame } from '../live/room';
import { loadRooms, roomCode, type RoomRecord } from '../live/rooms';
import { HeroArt, ModeIcon } from '../components/art';
import { Icons, IconButton, Logo } from '../components/ui';

type Row = { key: string; names: string; line: string; href: string; tone?: 'live' | 'wait'; at: number };

function gameStatus(g: Game): { line: string; href: string; tone?: 'live' | 'wait' } {
  const done = donePlayers(g);
  if (g.mode === 'local') {
    if (done.length < g.players.length) return { line: `Hole ${Math.min(...g.players.map((p) => p.picks.filter(Boolean).length)) + 1}`, href: `/play/${g.id}`, tone: 'live' };
    const s = standings(g);
    const lead = s.filter((x) => x.place === 1);
    return { line: lead.length > 1 ? 'All square' : `${g.players[lead[0].index].name} won`, href: `/results/${g.id}` };
  }
  if (g.me === null) return { line: 'Your turn', href: `/join/${g.id}`, tone: 'live' };
  if (!isDone(g, g.me)) return { line: `Hole ${g.players[g.me].picks.filter(Boolean).length + 1}`, href: `/play/${g.id}`, tone: 'live' };
  if (done.length < 2) return { line: `${playerTotal(g, g.me)} · waiting`, href: `/results/${g.id}`, tone: 'wait' };
  const s = standings(g);
  const mine = s.find((x) => x.index === g.me)!;
  const tied = s.filter((x) => x.place === mine.place).length > 1;
  return { line: mine.place === 1 ? (tied ? 'All square' : 'You won') : `You came ${ordinal(mine.place)}`, href: `/results/${g.id}` };
}

function roomRow(r: RoomRecord): Row | null {
  const s = r.state;
  if (!s || !r.name) return null;
  const href = `/r/${roomCode(r)}`;
  const names = s.players.map((p) => p.name).join(' v ');
  let line = 'Lobby';
  if (s.phase === 'hole' || s.phase === 'reveal') line = `Hole ${s.hole + 1}`;
  if (s.phase === 'done' && s.inRound.length) {
    const g = asGame(s, r.id, r.playerId);
    const st = standings(g, g.players.map((_, i) => i));
    const lead = st.filter((x) => x.place === 1);
    line = lead.length > 1 ? 'All square' : `${g.players[lead[0].index].name} won`;
  }
  return { key: `r:${r.id}`, names: `Live · ${names}`, line, href, tone: s.phase === 'done' ? undefined : 'live', at: r.updatedAt };
}

function DailyHero() {
  const { saved, go, saveGame } = useApp();
  const key = dailyKey();
  const id = dailyId(key);
  const g = findGame(saved, id);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const me = g?.me ?? null;
  const played = !!g && me !== null && isDone(g, me);
  const started = !!g && me !== null && !played && g.players[me].picks.some(Boolean);
  const rivals = g ? donePlayers(g).filter((i) => i !== me) : [];

  // "You beat Jay 98–111" once a mate has played it too.
  let versus = '';
  if (played && g && me !== null && rivals.length) {
    const st = standings(g, [me, ...rivals]);
    const mine = st.find((x) => x.index === me)!;
    if (rivals.length === 1) {
      const them = st.find((x) => x.index === rivals[0])!;
      const name = g.players[rivals[0]].name;
      versus = mine.total === them.total ? `All square with ${name}` : mine.total < them.total ? `You beat ${name}` : `${name} beat you`;
    } else versus = `You came ${ordinal(mine.place)} of ${st.length}`;
  }

  const play = () => {
    if (g) return go(g.me === null ? `/join/${id}` : played ? `/results/${id}` : `/play/${id}`);
    if (!saved.name) return go('/daily');
    saveGame(newDailyGame(saved.name, key));
    go(`/play/${id}`);
  };

  const holes = g?.holes.length ?? DAILY_HOLES;
  const strokes = Array.from({ length: holes }, (_, i) => {
    if (!g || me === null) return null;
    const pick = g.players[me].picks[i];
    // Only holes whose reveal you've seen show a score.
    return pick !== null && (played || i < g.revealed) ? holeResult(g.holes[i], pick).strokes : null;
  });

  return (
    <section className={`daily${played ? ' is-played' : ''}`} aria-label="Daily challenge">
      <HeroArt />
      <p className="daily-kicker">
        Daily #{dailyNumber(key)}
        <span>{new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </p>
      <ol className="daily-holes" aria-label={`${holes} holes`}>
        {strokes.map((v, i) => (
          <li key={i} className={v === null ? undefined : v === 0 ? 'is-ace' : 'is-done'}>
            {v === null ? i + 1 : v}
          </li>
        ))}
      </ol>
      {played && g && me !== null ? (
        <>
          <p className="daily-score">
            <b>{playerTotal(g, me)}</b>
            <span>strokes</span>
          </p>
          {versus && <p className="daily-versus">{versus}</p>}
          <button type="button" className="btn btn-secondary btn-block" onClick={play}>
            Your card
          </button>
          <p className="daily-next">Next daily in {formatCountdown(msUntilNextDaily())}</p>
        </>
      ) : (
        <>
          {g && me === null && rivals.length > 0 && <p className="daily-versus">{g.players[rivals[0]].name} has played it. Your turn.</p>}
          <button type="button" className="btn btn-primary btn-block btn-xl" onClick={play}>
            {started && me !== null ? `Carry on · hole ${g!.players[me].picks.filter(Boolean).length + 1}` : 'Play'}
          </button>
        </>
      )}
    </section>
  );
}

export default function Home() {
  const { go, saved, showHowTo } = useApp();
  const [rooms] = useState(loadRooms);
  const today = dailyId();
  const rows: Row[] = [
    ...Object.values(saved.games)
      .filter((g) => g.id !== today)
      .map((g) => {
        const st = gameStatus(g);
        const names = g.players.map((p) => p.name).join(' v ');
        const label = dailyLabel(g.id);
        return { key: g.id, names: label ? `${label}${names ? ` · ${names}` : ''}` : names || 'New game', ...st, at: g.updatedAt };
      }),
    ...Object.values(rooms)
      .map(roomRow)
      .filter((r): r is Row => !!r),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 5);

  return (
    <main className="screen home">
      <header className="home-top">
        <h1 className="wordmark">
          <Logo size={36} />
          <span>
            Football <em>Golf</em>
          </span>
        </h1>
        <IconButton label="How to play" onClick={showHowTo}>
          {Icons.help}
        </IconButton>
      </header>

      <DailyHero />

      <nav className="modes" aria-label="More ways to play">
        <button type="button" className="mode" onClick={() => go('/new/live')}>
          <span className="mode-icon">{ModeIcon.live}</span>
          <span className="mode-name">
            <span className="live-dot" aria-hidden="true" /> Live
          </span>
          <span className="mode-sub">Your mates, right now</span>
        </button>
        <button type="button" className="mode" onClick={() => go('/new/local')}>
          <span className="mode-icon">{ModeIcon.pass}</span>
          <span className="mode-name">Pass &amp; play</span>
          <span className="mode-sub">One phone</span>
        </button>
      </nav>

      {rows.length > 0 && (
        <section className="recent" aria-label="Your games">
          <ul>
            {rows.map((r) => (
              <li key={r.key}>
                <button type="button" className="recent-row" onClick={() => go(r.href)}>
                  <span className="recent-names">{r.names}</span>
                  <span className={`recent-status${r.tone ? ` is-${r.tone}` : ''}`}>{r.line}</span>
                  <span className="recent-go" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="home-foot">{CATEGORIES.length} lists · data from Wikipedia</footer>
    </main>
  );
}
