import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { donePlayers, isDone, ordinal, playerTotal, standings, type Game } from '../lib/game';
import { CATEGORIES } from '../lib/data';
import { DAILY_HOLES, dailyId, dailyKey, dailyLabel, dailyNumber, formatCountdown, msUntilNextDaily, newDailyGame } from '../lib/daily';
import { findGame } from '../lib/store';
import { asGame } from '../live/room';
import { loadRooms, roomCode, type RoomRecord } from '../live/rooms';
import { Logo, Ordinal } from '../components/ui';

type Row = { key: string; names: string; line: string; href: string; tone?: 'live' | 'wait'; meta: string; at: number };

function gameStatus(g: Game): { line: string; href: string; tone?: 'live' | 'wait' } {
  const done = donePlayers(g);
  if (g.mode === 'local') {
    if (done.length < g.players.length) return { line: `Pass & play · hole ${Math.min(...g.players.map((p) => p.picks.filter(Boolean).length)) + 1}`, href: `/play/${g.id}`, tone: 'live' };
    const s = standings(g);
    const lead = s.filter((x) => x.place === 1);
    return { line: lead.length > 1 ? 'Pass & play · all square' : `Pass & play · ${g.players[lead[0].index].name} won`, href: `/results/${g.id}` };
  }
  if (g.me === null) return { line: 'Challenge waiting for you', href: `/join/${g.id}`, tone: 'live' };
  if (!isDone(g, g.me)) return { line: `In progress · hole ${g.players[g.me].picks.filter(Boolean).length + 1}`, href: `/play/${g.id}`, tone: 'live' };
  if (done.length < 2) return { line: `Waiting for a friend · you scored ${playerTotal(g, g.me)}`, href: `/results/${g.id}`, tone: 'wait' };
  const s = standings(g);
  const mine = s.find((x) => x.index === g.me)!;
  const tied = s.filter((x) => x.place === mine.place).length > 1;
  return { line: mine.place === 1 ? (tied ? 'All square' : 'You won') : `You came ${['', '1st', '2nd', '3rd', '4th'][mine.place] ?? `${mine.place}th`}`, href: `/results/${g.id}` };
}

function roomRow(r: RoomRecord): Row | null {
  const s = r.state;
  if (!s || !r.name) return null;
  const href = `/r/${roomCode(r)}`;
  const names = s.players.map((p) => p.name).join(' v ');
  let line = 'Live · in the lobby';
  if (s.phase === 'hole' || s.phase === 'reveal') line = `Live · hole ${s.hole + 1} of ${s.holes.length}`;
  if (s.phase === 'done' && s.inRound.length) {
    const g = asGame(s, r.id, r.playerId);
    const st = standings(g, g.players.map((_, i) => i));
    const lead = st.filter((x) => x.place === 1);
    line = lead.length > 1 ? 'Live · all square' : `Live · ${g.players[lead[0].index].name} won`;
  }
  return { key: `r:${r.id}`, names, line, href, tone: s.phase === 'done' ? undefined : 'live', meta: `${s.holeCount} holes`, at: r.updatedAt };
}

function DailyCard() {
  const { saved, go, saveGame } = useApp();
  const key = dailyKey();
  const id = dailyId(key);
  const g = findGame(saved, id);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const played = !!g && g.me !== null && isDone(g, g.me);
  const started = !!g && g.me !== null && !played;
  const rivals = g ? donePlayers(g).filter((i) => i !== g.me) : [];

  // "You beat Jay 98–111" once a mate has played it too.
  let versus = '';
  if (played && g && g.me !== null && rivals.length) {
    const st = standings(g, [g.me, ...rivals]);
    const mine = st.find((x) => x.index === g.me)!;
    if (rivals.length === 1) {
      const them = st.find((x) => x.index === rivals[0])!;
      const name = g.players[rivals[0]].name;
      versus = mine.total === them.total ? `All square with ${name}` : mine.total < them.total ? `You beat ${name} ${mine.total}–${them.total}` : `${name} beat you ${them.total}–${mine.total}`;
    } else versus = `You came ${ordinal(mine.place)} of ${st.length}`;
  }

  const play = () => {
    if (g) return go(g.me === null ? `/join/${id}` : played ? `/results/${id}` : `/play/${id}`);
    if (!saved.name) return go('/daily');
    saveGame(newDailyGame(saved.name, key));
    go(`/play/${id}`);
  };

  return (
    <section className="card daily-card" aria-label="Daily challenge">
      <div className="daily-top">
        <span className="chip chip-ink">Daily #{dailyNumber(key)}</span>
        <span className="daily-date">{new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>
      <h2 className="daily-title">Daily challenge</h2>
      {played && g && g.me !== null ? (
        <>
          <p className="daily-score">
            You went round in <b>{playerTotal(g, g.me)}</b>
            {versus && <span className="daily-versus">{versus}</span>}
          </p>
          <button type="button" className="btn btn-secondary btn-block" onClick={play}>
            See your card &amp; share
          </button>
          <p className="daily-next">Next daily in {formatCountdown(msUntilNextDaily())}</p>
        </>
      ) : (
        <>
          <p className="daily-blurb">
            {g && g.me === null && rivals.length
              ? `${g.players[rivals[0]].name} has played today's holes. Your turn.`
              : `${DAILY_HOLES} holes, the same for everyone today. Play any time, then send your card to a mate.`}
          </p>
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={play}>
            {started && g?.me != null ? `Carry on · hole ${g.players[g.me].picks.filter(Boolean).length + 1}` : "Play today's holes"}
          </button>
        </>
      )}
    </section>
  );
}

export default function Home() {
  const { go, saved, showHowTo } = useApp();
  const [rooms] = useState(loadRooms);
  const rows: Row[] = [
    ...Object.values(saved.games).map((g) => {
      const st = gameStatus(g);
      const names = g.players.map((p) => p.name).join(' v ');
      const label = dailyLabel(g.id);
      return { key: g.id, names: label ? `${label}${names ? ` · ${names}` : ''}` : names || 'New challenge', ...st, meta: `${g.holes.length} holes`, at: g.updatedAt };
    }),
    ...Object.values(rooms)
      .map(roomRow)
      .filter((r): r is Row => !!r),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 6);

  return (
    <main className="screen home">
      <div className="home-hero">
        <Logo size={64} />
        <h1 className="wordmark">
          Football <span>Golf</span>
        </h1>
        <p className="lead">
          Name the thing closest to the target rank, like the <Ordinal n={42} /> most Champions League wins. Every place you're off is a stroke.
        </p>
      </div>

      <DailyCard />

      <section className="card mode-card" aria-label="Challenge mode">
        <div className="daily-top">
          <span className="chip chip-live">
            <span className="live-dot" aria-hidden="true" /> Live
          </span>
        </div>
        <h2 className="daily-title">Challenge mode</h2>
        <p className="daily-blurb">Play your mates head to head, right now: everyone on their phones at once, same holes, a shot clock on every hole. 2–8 players.</p>
        <button type="button" className="btn btn-dark btn-block btn-lg" onClick={() => go('/new/live')}>
          Start a live challenge
        </button>
      </section>

      <div className="home-actions">
        <button type="button" className="btn btn-ghost btn-block" onClick={() => go('/new/local')}>
          Pass &amp; play on one phone
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={showHowTo}>
          How to play
        </button>
      </div>

      {rows.length > 0 && (
        <section className="recent" aria-label="Your games">
          <h2 className="section-title">Your games</h2>
          <ul>
            {rows.map((r) => (
              <li key={r.key}>
                <button type="button" className="recent-row" onClick={() => go(r.href)}>
                  <span className="recent-names">{r.names}</span>
                  <span className={`recent-status${r.tone ? ` is-${r.tone}` : ''}`}>{r.line}</span>
                  <span className="recent-meta">{r.meta}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="home-foot">
        {CATEGORIES.length} ranked lists · data from Wikipedia (CC BY-SA)
      </footer>
    </main>
  );
}
