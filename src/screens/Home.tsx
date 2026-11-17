import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../App';
import { cleanName, donePlayers, holeResult, isDone, NAME_MAX, ordinal, playerTotal, standings, type Game } from '../lib/game';
import { dailyId, dailyKey, dailyLabel, dailyNumber, formatCountdown, msUntilNextDaily, newDailyGame, DAILY_HOLES } from '../lib/daily';
import { findGame } from '../lib/store';
import { asGame } from '../live/room';
import { loadRooms, roomCode, type RoomRecord } from '../live/rooms';
import { Ball, BALL_FILL, ModeIcon } from '../components/art';
import { BallRow, type BallEntry } from '../components/BallRow';
import { CourseMap, type MapMark } from '../components/CourseMap';
import { ShareRow, useGameShare } from '../components/GameShare';
import { HoleSheet } from '../components/HoleSheet';
import { markOf } from '../components/Scorecard';
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

/**
 * Today's daily, drawn as its course. Before you play, your ball's on the first tee and the shot
 * button is beside it; part-way round it waits on the next tee with your strokes marked on the
 * greens behind it; once you're round, it's in the last cup and the top of the course holds your
 * score, your mates' and the button to send it.
 */
function Today({ askName }: { askName?: boolean }) {
  const { saved, go, saveGame, setName } = useApp();
  const key = dailyKey();
  const id = dailyId(key);
  const g = findGame(saved, id);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const [asking, setAsking] = useState(!!askName && !saved.name);
  const [name, setNameInput] = useState(saved.name);
  const [nameErr, setNameErr] = useState(false);
  const [sheet, setSheet] = useState<number | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  const me = g?.me ?? null;
  const played = !!g && me !== null && isDone(g, me);
  const rivals = g ? donePlayers(g).filter((i) => i !== me) : [];
  const { share, copyLink, urlBox, label: shareLabel } = useGameShare(played ? g : undefined);

  const n = g?.holes.length ?? DAILY_HOLES;
  const picked = g && me !== null ? g.players[me].picks.filter((x) => x !== null).length : 0;
  // The ball waits where play picks up: the next reveal you haven't seen, or the next hole.
  const at = played ? n : g && me !== null ? Math.min(picked, g.revealed) : 0;
  const marks: (MapMark | null)[] = Array.from({ length: n }, (_, i) => {
    if (!g || me === null) return null;
    const pick = g.players[me].picks[i];
    // Only holes whose reveal you've seen show a score.
    if (pick === null || !(played || i < g.revealed)) return null;
    const r = holeResult(g.holes[i], pick);
    return { strokes: r.strokes, mark: markOf(r), label: `Hole ${i + 1}: ${r.strokes} ${r.strokes === 1 ? 'stroke' : 'strokes'}. Show the list` };
  });

  const play = () => {
    if (g) return go(g.me === null ? `/join/${id}` : played ? `/results/${id}` : `/play/${id}`);
    if (!saved.name) return setAsking(true);
    saveGame(newDailyGame(saved.name, key));
    go(`/play/${id}`);
  };

  const teeOff = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) return setNameErr(true);
    setName(clean);
    saveGame(newDailyGame(clean, key));
    go(`/play/${id}`);
  };

  const date = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  const cta = asking ? (
    <form className="cm-name" onSubmit={teeOff}>
      <input
        id="daily-name"
        className={`input${nameErr ? ' is-error' : ''}`}
        value={name}
        maxLength={NAME_MAX}
        placeholder="Your name"
        aria-label="Your name"
        autoCapitalize="words"
        autoComplete="nickname"
        enterKeyHint="go"
        autoFocus
        onChange={(e) => {
          setNameInput(e.target.value);
          setNameErr(false);
        }}
      />
      <button type="submit" className="btn btn-primary">
        Tee off
      </button>
    </form>
  ) : (
    <button type="button" className="btn btn-primary cm-go" onClick={play}>
      {at > 0 ? `Hole ${at + 1}` : 'Tee off'}
      <span aria-hidden="true">›</span>
    </button>
  );

  let head;
  if (played && g && me !== null) {
    const st = standings(g, [me, ...rivals]);
    const mine = st.find((x) => x.index === me)!;
    const lead = st.filter((x) => x.place === 1);
    const entries: BallEntry[] = st.map((x) => ({
      key: x.index,
      name: g.players[x.index].name,
      total: x.total,
      fill: rivals.length ? BALL_FILL[x.index % BALL_FILL.length] : '#fff',
      you: x.index === me,
      lead: rivals.length > 0 && lead.length === 1 && x.place === 1,
    }));
    // "You beat Jay" once a mate has played it too.
    let versus = '';
    if (rivals.length === 1) {
      const them = st.find((x) => x.index === rivals[0])!;
      const who = g.players[rivals[0]].name;
      versus = mine.total === them.total ? `All square with ${who}` : mine.total < them.total ? `You beat ${who}` : `${who} beat you`;
    } else if (rivals.length > 1) versus = lead.length > 1 && mine.place === 1 ? 'Tied for 1st' : `You came ${ordinal(mine.place)} of ${st.length}`;

    head = (
      <div className="today-head is-played">
        <p className="today-date">
          Daily #{dailyNumber(key)} · {date}
        </p>
        <BallRow entries={entries} onInvite={share} big />
        {versus && <p className="today-versus">{versus}</p>}
        <ShareRow label={shareLabel} onShare={share} onCopy={copyLink} />
        {urlBox}
        <p className="today-next">
          <button type="button" className="link-btn" onClick={() => go(`/results/${id}`)}>
            Your card
          </button>
          <span>Next daily in {formatCountdown(msUntilNextDaily())}</span>
        </p>
      </div>
    );
  } else {
    head = (
      <div className="today-head">
        <h2 className="today-title">Daily #{dailyNumber(key)}</h2>
        <p className="today-date">{date}</p>
        {g && rivals.length > 0 && (
          <p className="today-rival">
            {rivals.slice(0, 3).map((i) => (
              <Ball key={i} size={18} fill={BALL_FILL[i % BALL_FILL.length]} />
            ))}
            {rivals.length === 1 ? `${g.players[rivals[0]].name} has played it` : `${rivals.length} mates have played it`}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className={`today${played ? ' is-played' : ''}`} aria-label="Daily challenge">
      {head}
      <CourseMap
        count={n}
        at={at}
        marks={marks}
        cta={played ? undefined : cta}
        onBall={played ? undefined : play}
        onHole={g && me !== null ? setSheet : undefined}
        others={g && !played ? rivals.map((i) => ({ key: i, fill: BALL_FILL[i % BALL_FILL.length], name: g.players[i].name })) : undefined}
        label={played ? `Today's ${n} holes, played` : `Today's ${n} holes`}
      />
      {g && me !== null && <HoleSheet game={g} hole={sheet ?? 0} players={played ? [me, ...rivals] : [me]} open={sheet !== null} onClose={closeSheet} />}
    </section>
  );
}

export default function Home({ askName }: { askName?: boolean }) {
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
    <main className={`screen home${rows.length ? ' has-recent' : ''}`}>
      <div className="home-stage">
        <header className="home-top">
          <h1 className="wordmark">
            <Logo size={30} />
            <span>
              Football <em>Golf</em>
            </span>
          </h1>
          <IconButton label="How to play" onClick={showHowTo}>
            {Icons.help}
          </IconButton>
        </header>

        <Today askName={askName} />

        <nav className="modes" aria-label="More ways to play">
          <button type="button" className="mode" onClick={() => go('/new/live')}>
            <span className="mode-icon">
              {ModeIcon.live}
              <span className="live-dot" aria-hidden="true" />
            </span>
            <span className="mode-name">Live</span>
            <span className="mode-sub">Mates, right now</span>
          </button>
          <button type="button" className="mode" onClick={() => go('/new/local')}>
            <span className="mode-icon">{ModeIcon.pass}</span>
            <span className="mode-name">Pass &amp; play</span>
            <span className="mode-sub">One phone</span>
          </button>
        </nav>
      </div>

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
    </main>
  );
}
