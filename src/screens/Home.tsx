import { useApp } from '../App';
import { donePlayers, isDone, standings, type Game } from '../lib/game';
import { CATEGORIES } from '../lib/data';
import { FlagIcon, Logo, Ordinal } from '../components/ui';

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
  if (done.length < 2) return { line: 'Waiting for a friend to play', href: `/results/${g.id}`, tone: 'wait' };
  const s = standings(g);
  const mine = s.find((x) => x.index === g.me)!;
  const tied = s.filter((x) => x.place === mine.place).length > 1;
  return { line: mine.place === 1 ? (tied ? 'All square' : 'You won') : `You came ${['', '1st', '2nd', '3rd', '4th'][mine.place] ?? `${mine.place}th`}`, href: `/results/${g.id}` };
}

export default function Home() {
  const { go, saved, showHowTo } = useApp();
  const recent = Object.values(saved.games)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  return (
    <main className="screen home">
      <div className="home-hero">
        <Logo size={72} />
        <h1 className="wordmark">
          Football <span>Golf</span>
        </h1>
        <p className="lead">Name the thing closest to the target rank. Every place you're off is a stroke. Fewest strokes wins.</p>
      </div>

      <div className="card demo-card" aria-hidden="true">
        <div className="hole-top">
          <span className="chip chip-ink">
            <FlagIcon size={14} /> Hole 1
          </span>
        </div>
        <div className="hole-target">
          <span className="hole-target-label">Target</span>
          <Ordinal n={60} className="hole-target-n" />
        </div>
        <div className="hole-prompt">biggest stadium in Europe's top 5 leagues</div>
        <div className="demo-answers">
          <span className="demo-pick">
            You: Stamford Bridge <b>35th · +25</b>
          </span>
          <span className="demo-pick">
            Mate: Vitality <b>93rd · +33</b>
          </span>
        </div>
      </div>

      <div className="home-actions">
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => go('/new/challenge')}>
          Challenge a friend
          <small>Play your round, then send them the link</small>
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => go('/new/local')}>
          Pass &amp; play on this phone
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={showHowTo}>
          How to play
        </button>
      </div>

      {recent.length > 0 && (
        <section className="recent" aria-label="Your games">
          <h2 className="section-title">Your games</h2>
          <ul>
            {recent.map((g) => {
              const st = gameStatus(g);
              const names = g.players.map((p) => p.name).join(' v ');
              return (
                <li key={g.id}>
                  <button type="button" className="recent-row" onClick={() => go(st.href)}>
                    <span className="recent-names">{names || 'New challenge'}</span>
                    <span className={`recent-status${st.tone ? ` is-${st.tone}` : ''}`}>{st.line}</span>
                    <span className="recent-meta">{g.holes.length} holes</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <footer className="home-foot">
        {CATEGORIES.length} ranked lists · data from Wikipedia (CC BY-SA)
      </footer>
    </main>
  );
}
