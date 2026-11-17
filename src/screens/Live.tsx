import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import { CATEGORY_BY_ID, COURSES } from '../lib/data';
import { cleanName, NAME_MAX, obStrokes, sameName, standings, type Game } from '../lib/game';
import { buzz, copyText, shareLink } from '../lib/share';
import { asGame, canStart, MIN_PLAYERS, onlineInRound, type LiveState } from '../live/room';
import { parseRoomCode, roomUrl } from '../live/rooms';
import { useRoom, type RoomApi } from '../live/useRoom';
import { Ball, BALL_FILL, HeroArt, Trophy } from '../components/art';
import { BallRow } from '../components/BallRow';
import { Confetti } from '../components/Confetti';
import { Course, wholeList } from '../components/Course';
import { HoleCard } from '../components/HoleCard';
import { PickBox, type Selection } from '../components/PickBox';
import { Reveal, RevealCta } from '../components/Reveal';
import { Scorecard } from '../components/Scorecard';
import { TeeBalls, type TeeBall } from '../components/Tee';
import { HoleDots, Icons, IconButton, TopBar } from '../components/ui';
import Message from './Message';

export default function Live({ code }: { code: string }) {
  const parsed = parseRoomCode(code);
  if (!parsed)
    return (
      <Message
        title="That link's gone wide"
        body="This room link doesn't work. It may have been cut off when it was copied. Ask your mate to send it again."
      />
    );
  return <Room key={parsed.id} id={parsed.id} secret={parsed.secret} />;
}

/** Re-render on an interval (for the shot clock). */
function useTicker(ms: number, active = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms, active]);
}

const courseName = (s: LiveState) => COURSES.find((c) => c.id === s.course)?.name ?? 'Mixed';
const nameOf = (s: LiveState, id: string) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
const listNames = (names: string[]) => (names.length <= 2 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`);

function Room({ id, secret }: { id: string; secret: string }) {
  const room = useRoom(id, secret);
  const { rec, state: s, error } = room;

  if (error === 'insecure')
    return <Message title="Online games need a secure link" body="Open the link that starts with https:// (the one your mate sent) and try again." />;
  if (error) return <Message title="Couldn't open the game" body="Check your connection, then open the link again." />;
  // Find the room before asking for a name, so a dead link says so straight away.
  if (!s) return <FindingRoom room={room} />;
  if (!rec.name) return <JoinRoom room={room} />;
  const me = rec.playerId;
  if (!s.players.some((p) => p.id === me) && s.players.length >= 8)
    return <Message title="This game is full" body="Online games take up to 8 players. Start your own from the home screen." />;
  if (s.phase === 'lobby') return <Lobby room={room} s={s} />;
  if (s.phase === 'done') return <Final room={room} s={s} />;
  if (s.phase === 'reveal') return <LiveReveal key={`${s.round}:${s.hole}`} room={room} s={s} />;
  return <LiveHole key={`${s.round}:${s.hole}`} room={room} s={s} />;
}

/* ---------- shared bits ---------- */

function LiveTop({ s, label, confirmLeave }: { s?: LiveState; label?: string; confirmLeave?: string }) {
  const { go, showHowTo } = useApp();
  const leave = () => {
    if (confirmLeave && !window.confirm(confirmLeave)) return;
    go('/');
  };
  const inGame = s && (s.phase === 'hole' || s.phase === 'reveal');
  return (
    <TopBar
      left={
        <IconButton label="Leave game" onClick={leave}>
          {Icons.close}
        </IconButton>
      }
      title={
        inGame ? (
          <HoleDots
            count={s.holes.length}
            current={s.hole}
            label={
              <>
                <span className="live-dot" aria-hidden="true" /> {label ?? 'Live'}
              </>
            }
          />
        ) : (
          <span className="topbar-label">
            <span className="live-dot" aria-hidden="true" /> {label ?? 'Play online'}
          </span>
        )
      }
      right={
        <IconButton label="How to play" onClick={showHowTo}>
          {Icons.help}
        </IconButton>
      }
    />
  );
}

/** Connection trouble, mine or the host's. Quiet for the first moment so a normal connect doesn't flash. */
function ConnNote({ room, s }: { room: RoomApi; s: LiveState | null }) {
  const offline = room.status !== 'online';
  const [show, setShow] = useState(false);
  const wasOnline = useRef(false);
  if (!offline) wasOnline.current = true;
  useEffect(() => {
    if (!offline) return setShow(false);
    const t = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(t);
  }, [offline]);
  if (offline)
    return show ? (
      <p className="conn-note" role="status">
        <span className="spinner" aria-hidden="true" /> {wasOnline.current ? 'Reconnecting…' : 'Connecting…'}
      </p>
    ) : null;
  if (s && !room.engine && s.hostId !== room.rec.playerId && !room.online.has(s.hostId) && s.phase !== 'done')
    return (
      <p className="conn-note" role="status">
        {nameOf(s, s.hostId)}'s phone has dropped out. The game picks up when they're back.
      </p>
    );
  return null;
}

function useInvite(id: string, secret: string, hostName: string) {
  const { toast } = useApp();
  const [showUrl, setShowUrl] = useState(false);
  const url = roomUrl({ id, secret });
  const invite = async () => {
    const out = await shareLink({ title: 'Football Golf', text: `⛳ ${hostName} wants to play Football Golf with you, right now. Tap to join:`, url });
    if (out === 'copied') toast('Link copied. Paste it into your chat.');
    if (out === 'failed') {
      setShowUrl(true);
      toast("Couldn't share. Long-press the link below to copy it.");
    }
  };
  const copy = async () => {
    if (await copyText(url)) return toast('Link copied. Paste it into your chat.');
    setShowUrl(true);
    toast("Couldn't copy. Long-press the link below to copy it.");
  };
  const box = showUrl ? (
    <p className="share-url" aria-label="Room link">
      {url}
    </p>
  ) : null;
  return { invite, copy, box };
}

/* ---------- joining ---------- */

function JoinRoom({ room }: { room: RoomApi }) {
  const { saved, setName, go } = useApp();
  const s = room.state;
  const [name, setNameInput] = useState(saved.name);
  const [err, setErr] = useState('');
  const hostName = s ? nameOf(s, s.hostId) : null;

  const join = () => {
    const n = cleanName(name);
    if (!n) return setErr('Add your name so the others know who you are.');
    if (s?.players.some((p) => sameName(p.name, n))) return setErr(`There's already a ${n} in this game. Try a nickname.`);
    setName(n);
    room.join(n);
    buzz();
  };

  return (
    <main className="screen join">
      <TopBar
        left={
          <IconButton label="Home" onClick={() => go('/')}>
            {Icons.close}
          </IconButton>
        }
        title={<span className="topbar-label">Play online</span>}
      />
      <div className="join-hero">
        {s ? <Roster names={s.players.map((p) => p.name)} /> : <HeroArt />}
        <p className="kicker">
          {s ? `${s.holeCount} holes · ${Math.round(s.turnMs / 1000)}s to answer` : 'Football Golf'}
        </p>
        <h1 className="join-title">{hostName ? `${hostName}'s game` : 'Play online'}</h1>
        {!s && room.status !== 'online' && <p className="join-course">Connecting…</p>}
      </div>

      <form
        className="join-form"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        {s && s.phase !== 'lobby' && <p className="field-help">Round under way: you're in from the next one.</p>}
        <input
          id="join-name"
          className={`input${err ? ' is-error' : ''}`}
          value={name}
          maxLength={NAME_MAX}
          placeholder="Your name"
          aria-label="Your name"
          autoCapitalize="words"
          autoComplete="nickname"
          enterKeyHint="go"
          onChange={(e) => {
            setNameInput(e.target.value);
            setErr('');
          }}
        />
        {err && (
          <p className="field-error" role="alert">
            {err}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block btn-lg">
          Join
        </button>
      </form>

    </main>
  );
}

/** Players as balls in their colours. */
function Roster({ names }: { names: string[] }) {
  return (
    <ul className="roster-balls">
      {names.map((n, i) => (
        <li key={i}>
          <Ball size={40} fill={BALL_FILL[i % BALL_FILL.length]} />
          <span>{n}</span>
        </li>
      ))}
    </ul>
  );
}

function FindingRoom({ room }: { room: RoomApi }) {
  const { go } = useApp();
  const [slow, setSlow] = useState(false);
  const connected = room.status === 'online';
  useEffect(() => {
    if (!connected) return;
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [connected]);
  return (
    <main className="screen">
      <LiveTop />
      <div className="message">
        <span className="spinner spinner-lg" aria-hidden="true" />
        <h1 className="join-title">Finding the game</h1>
        {slow && room.status === 'online' ? (
          <>
            <p className="lead">
              Can't find this game. The host may have closed it, or the link is from more than a day ago. Ask them to send a fresh link.
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => go('/')}>
              Home
            </button>
          </>
        ) : (
          <p className="lead">{room.status === 'online' ? 'Waiting for the host’s phone…' : 'Connecting…'}</p>
        )}
      </div>
    </main>
  );
}

/* ---------- lobby ---------- */

function Lobby({ room, s }: { room: RoomApi; s: LiveState }) {
  const isHost = s.hostId === room.rec.playerId;
  const hostName = nameOf(s, s.hostId);
  const { invite, copy, box } = useInvite(room.rec.id, room.rec.secret, hostName);
  const isOn = (pid: string) => (room.engine ? s.online.includes(pid) : room.online.has(pid) || pid === room.rec.playerId);
  const onlineCount = s.players.filter((p) => isOn(p.id)).length;
  const need = Math.max(0, MIN_PLAYERS - onlineCount);
  const startable = room.engine && canStart(s);
  const players = [...s.players].sort((a, b) => Number(isOn(b.id)) - Number(isOn(a.id)));
  const meListed = s.players.some((p) => p.id === room.rec.playerId);

  return (
    <main className="screen live lobby">
      <LiveTop />
      <ConnNote room={room} s={s} />
      <div className="join-hero lobby-hero">
        <p className="kicker">
          {s.round > 1 ? `Round ${s.round} · ` : ''}
          {s.holeCount} holes · {courseName(s)} · {Math.round(s.turnMs / 1000)}s to answer
        </p>
        <h1 className="join-title">{isHost ? 'Get your mates in' : `${hostName}'s game`}</h1>
      </div>

      <section className="lobby-roster" aria-label={`Players, ${onlineCount} online`}>
        <ul className="roster-balls">
          {players.map((p) => {
            const i = s.players.indexOf(p);
            const on = isOn(p.id);
            return (
              <li key={p.id} className={on ? 'is-on' : 'is-away'}>
                <Ball size={44} fill={BALL_FILL[i % BALL_FILL.length]} />
                <span>
                  {p.name}
                  {p.id === room.rec.playerId ? ' (you)' : ''}
                </span>
              </li>
            );
          })}
          {!meListed && (
            <li className="is-on is-joining">
              <Ball size={44} fill={BALL_FILL[s.players.length % BALL_FILL.length]} />
              <span>{room.rec.name} (you)</span>
            </li>
          )}
          {need > 0 &&
            Array.from({ length: need }, (_, k) => (
              <li key={`empty${k}`} className="is-empty" aria-hidden="true">
                <span className="empty-ball">+</span>
                <span>&nbsp;</span>
              </li>
            ))}
        </ul>
      </section>

      <div className="share-row">
        <button type="button" className={`btn btn-block ${isHost && s.players.length < MIN_PLAYERS ? 'btn-primary btn-lg' : 'btn-secondary'}`} onClick={invite}>
          {Icons.share} {isHost ? 'Send the invite' : 'Invite someone'}
        </button>
        <IconButton label="Copy link" onClick={copy}>
          {Icons.copy}
        </IconButton>
      </div>
      {box}

      <div className="sticky-cta">
        {isHost ? (
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!startable} onClick={room.hostStart}>
            {startable ? `Start · ${onlineCount} players` : !room.engine ? 'This game is open in another tab' : `Need ${need} more player${need === 1 ? '' : 's'} online`}
          </button>
        ) : (
          <p className="wait-pill">
            <span className="spinner" aria-hidden="true" />
            {onlineCount >= MIN_PLAYERS ? `Waiting for ${hostName} to start` : 'Waiting for more players'}
          </p>
        )}
      </div>
    </main>
  );
}

/* ---------- playing a hole ---------- */

function ShotClock({ s, now, away, hostAway }: { s: LiveState; now: () => number; away: string[]; hostAway?: string | null }) {
  useTicker(250, true);
  const paused = s.deadline === null || !!hostAway;
  const left = paused ? (s.remainingMs ?? s.turnMs) : Math.max(0, s.deadline! - now());
  const secs = Math.ceil(left / 1000);
  const low = !paused && secs <= 10;
  const buzzed = useRef(false);
  useEffect(() => {
    if (low && secs > 0 && !buzzed.current) {
      buzzed.current = true;
      buzz(30);
    }
  }, [low, secs]);
  return (
    <div className={`shot-clock${low ? ' is-low' : ''}${paused ? ' is-paused' : ''}`} role="timer" aria-label={paused ? 'Clock paused' : `${secs} seconds left`}>
      <div className="shot-clock-row">
        <div className="shot-clock-bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${Math.min(1, left / s.turnMs)})` }} />
        </div>
        <span className="shot-clock-n">{paused ? '❚❚' : `0:${String(Math.min(secs, 99)).padStart(2, '0')}`}</span>
      </div>
      {paused && (
        <p className="shot-clock-note">
          {hostAway ? `Paused: waiting for ${hostAway}'s phone` : `Paused till ${away.length ? listNames(away) : 'everyone'} reconnect${away.length === 1 ? 's' : ''}`}
        </p>
      )}
      {low && secs > 0 && <p className="shot-clock-note is-hurry">{secs <= 5 ? 'Lock it in!' : '10 seconds left'}</p>}
      <span className="sr-only" aria-live="assertive">
        {low && secs > 0 ? '10 seconds left' : ''}
      </span>
    </div>
  );
}

/** Everyone in the round, as balls on the tee: thinking, locked in, or away. */
function teeFor(s: LiveState, game: Game, me: string, mine: boolean, hostAway: boolean, tag?: string): TeeBall[] {
  return s.inRound.map((pid, i) => {
    const done = pid === me ? mine : s.picks[pid]?.[s.hole] != null;
    const away = !s.online.includes(pid) || (pid === s.hostId && hostAway);
    return {
      key: pid,
      fill: BALL_FILL[i % BALL_FILL.length],
      state: done ? 'locked' : pid === me ? 'active' : away ? 'away' : 'thinking',
      name: game.players[i].name,
      tag: pid === me && !done ? tag : undefined,
    };
  });
}

function LiveHole({ room, s }: { room: RoomApi; s: LiveState }) {
  const me = room.rec.playerId;
  const game = useMemo(() => asGame(s, room.rec.id, me), [s, room.rec.id, me]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [searching, setSearching] = useState(false);
  const onSearching = useCallback((b: boolean) => setSearching(b), []);
  const opening = !!s.opensAt && room.now() < s.opensAt;
  useTicker(opening ? 200 : 500, s.deadline !== null);

  const h = s.holes[s.hole];
  const cat = CATEGORY_BY_ID.get(h.cat);
  const playing = s.inRound.includes(me);
  const doc = room.rec.doc;
  const mine = (doc && doc.round === s.round ? doc.picks[s.hole] : undefined) ?? s.picks[me]?.[s.hole] ?? null;
  // A guest can't know the hole's closed while the host's phone is away, so never call time on them then.
  const hostAway = !room.engine && s.hostId !== me && room.status === 'online' && !room.online.has(s.hostId) ? nameOf(s, s.hostId) : null;
  const timeUp = !hostAway && s.deadline !== null && room.now() > s.deadline;
  const away = s.inRound.filter((pid) => !s.online.includes(pid)).map((pid) => nameOf(s, pid));

  const lock = useCallback(
    (sel: Selection | null) => {
      if (!sel) return;
      room.lockIn(s.hole, 'item' in sel ? sel.item.id : `~${sel.offList}`);
      buzz();
      setSearching(false);
      window.scrollTo({ top: 0 });
    },
    [room, s.hole],
  );

  useEffect(() => {
    if (!opening) buzz(20);
  }, [opening]);

  // Picked something but didn't tap the button before the buzzer: lock it in for them.
  const buzzer = !mine && !hostAway && s.deadline !== null && room.now() > s.deadline - 400;
  useEffect(() => {
    if (buzzer && selection) lock(selection);
  }, [buzzer, selection, lock]);

  if (!cat) return <Message title="This hole's list is missing" body="Refresh the page to load the latest version of the game." />;
  const leaveWarning = room.engine ? 'Leaving pauses the game for everyone until you come back. Leave anyway?' : undefined;

  if (opening) {
    const n = Math.max(1, Math.ceil((s.opensAt! - room.now()) / 1000));
    return (
      <main className="screen play live">
        <LiveTop s={s} label={playing ? 'Live' : 'Watching'} confirmLeave={leaveWarning} />
        <ConnNote room={room} s={s} />
        <div className="get-ready" role="status" aria-live="polite">
          <p className="kicker">Hole {s.hole + 1}</p>
          <p className="get-ready-n" key={n}>
            {n}
          </p>
          <p className="get-ready-clock">{Math.round(s.turnMs / 1000)}s on the clock</p>
        </div>
      </main>
    );
  }

  const endRound = room.engine && s.deadline === null && (
    <button
      type="button"
      className="link-btn give-up"
      onClick={() => window.confirm('End this round for everyone and go back to the start?') && room.hostToLobby()}
    >
      End this round
    </button>
  );

  const tag = selection ? ('item' in selection ? (selection.shown?.name ?? selection.item.name) : selection.shown?.name || selection.offList || 'No answer') : undefined;
  const tee = teeFor(s, game, me, !!mine, !!hostAway, tag);
  const course = (
    <Course size={cat.size} target={h.target} view={wholeList(cat.size)} tee className="is-aim">
      {() => <TeeBalls balls={tee} />}
    </Course>
  );

  if (!playing) {
    return (
      <main className="screen play live">
        <LiveTop s={s} label="Watching" />
        <ConnNote room={room} s={s} />
        <ShotClock s={s} now={room.now} away={away} hostAway={hostAway} />
        <HoleCard hole={h} index={s.hole} count={s.holes.length} />
        <p className="spectate-note">You're in from the next round</p>
        {course}
      </main>
    );
  }

  const lockedName = mine ? (mine === '~' ? 'No answer' : mine.startsWith('~') ? `“${mine.slice(1)}”` : (cat.byId.get(mine)?.name ?? mine)) : '';

  return (
    <main className={`screen play picking live${searching ? ' is-searching' : ''}`}>
      <LiveTop s={s} confirmLeave={leaveWarning} />
      <ConnNote room={room} s={s} />
      <ShotClock s={s} now={room.now} away={away} hostAway={hostAway} />
      <HoleCard hole={h} index={s.hole} count={s.holes.length} compact={searching} />

      {mine ? (
        <p className="locked-note" aria-live="polite">
          <span className="kicker-ink">Locked in</span> {lockedName}
        </p>
      ) : timeUp ? (
        <p className="locked-note is-late" aria-live="assertive">
          <span className="kicker-ink">Time's up</span> Out of bounds +{obStrokes(cat, h.target)}
        </p>
      ) : (
        <>
          <PickBox key={`${s.round}:${s.hole}`} cat={cat} selection={selection} onSelect={setSelection} onSearching={onSearching} autoFocus />
          <button
            type="button"
            className={`give-up${selection ? ' is-hidden' : ''}`}
            onClick={() => setSelection({ offList: '' })}
            tabIndex={selection ? -1 : undefined}
          >
            Give up <span>+{obStrokes(cat, h.target)}</span>
          </button>
        </>
      )}

      {endRound}
      {course}

      {!mine && !timeUp && !searching && selection && (
        <div className="sticky-cta">
          <button type="button" className="btn btn-primary btn-block btn-lg cta-in" onClick={() => lock(selection)}>
            Take the shot
          </button>
        </div>
      )}
    </main>
  );
}

/* ---------- reveal ---------- */

function LiveReveal({ room, s }: { room: RoomApi; s: LiveState }) {
  const me = room.rec.playerId;
  const game = useMemo(() => asGame(s, room.rec.id, me), [s, room.rec.id, me]);
  const [armed, setArmed] = useState(false);
  const onSettled = useCallback(() => setArmed(true), []);
  const playing = s.inRound.includes(me);
  const doc = room.rec.doc;
  const iAmReady = !!doc && doc.round === s.round && doc.ready >= s.hole;
  const last = s.hole === s.holes.length - 1;
  const all = s.inRound.map((_, i) => i);
  const waitingOn = onlineInRound(s)
    .filter((pid) => pid !== me && !s.ready.includes(pid))
    .map((pid) => nameOf(s, pid));
  const isHost = room.engine;
  const online = onlineInRound(s);
  const readyCount = online.filter((pid) => s.ready.includes(pid) || (pid === me && iAmReady)).length;
  // The host can hurry things along, but only once the others have had a proper look.
  const [canSkip, setCanSkip] = useState(false);
  useEffect(() => {
    if (!isHost || !iAmReady) return;
    const t = setTimeout(() => setCanSkip(true), 8000);
    return () => clearTimeout(t);
  }, [isHost, iAmReady]);

  return (
    <main className="screen play live revealing">
      <LiveTop s={s} label={playing ? 'Live' : 'Watching'} confirmLeave={isHost ? 'Leaving pauses the game for everyone until you come back. Leave anyway?' : undefined} />
      <ConnNote room={room} s={s} />
      <Reveal game={game} hole={s.hole} players={all} animate onSettled={onSettled} />
      {playing && !iAmReady && (
        <RevealCta
          armed={armed}
          label={`${last ? 'Final scores' : `Ready for hole ${s.hole + 2}`}${readyCount > 0 ? ` · ${readyCount}/${online.length}` : ''}`}
          onNext={() => room.ready(s.hole)}
        />
      )}
      {(!playing || iAmReady) && (
        <div className="sticky-cta">
          <p className="wait-pill">
            <span className="spinner" aria-hidden="true" />
            {waitingOn.length ? `Waiting for ${listNames(waitingOn)} · ${readyCount}/${online.length}` : last ? 'Adding up the cards…' : 'Teeing up the next hole…'}
          </p>
          {isHost && canSkip && waitingOn.length > 0 && (
            <button type="button" className="link-btn wait-skip" onClick={room.hostAdvance}>
              {last ? 'Show final scores now' : `Start hole ${s.hole + 2} now`}
            </button>
          )}
        </div>
      )}
    </main>
  );
}

/* ---------- full time ---------- */

function Final({ room, s }: { room: RoomApi; s: LiveState }) {
  const { toast } = useApp();
  const me = room.rec.playerId;
  const game = useMemo(() => asGame(s, room.rec.id, me), [s, room.rec.id, me]);
  const all = s.inRound.map((_, i) => i);
  const st = standings(game, all);
  const winners = st.filter((x) => x.place === 1);
  const iWon = game.me !== null && winners.some((w) => w.index === game.me);
  const isHost = s.hostId === me;
  const hostName = nameOf(s, s.hostId);
  const [confetti, setConfetti] = useState(0);
  useEffect(() => {
    if (iWon) setConfetti(Date.now());
  }, [iWon]);
  const onlineCount = s.players.filter((p) => s.online.includes(p.id)).length;

  if (!s.holes.length || !st.length) return <Lobby room={room} s={s} />;

  const winnerName = game.players[winners[0].index].name;
  const shareResult = async () => {
    const line = st.map((x) => `${game.players[x.index].name} ${x.total}`).join(', ');
    const out = await shareLink({
      title: 'Football Golf',
      text: `⛳ Football Golf, ${s.holes.length} holes: ${line}. ${winners.length > 1 ? 'All square!' : `${winnerName} wins!`}`,
      url: `${location.origin}${location.pathname}`,
    });
    if (out === 'copied') toast('Result copied. Paste it into your chat.');
  };

  return (
    <main className="screen results live">
      <LiveTop label="Full time" />
      <ConnNote room={room} s={s} />
      <section className="final">
        <Trophy size={44} />
        <p className={`final-big is-name${winners.length === 1 && winnerName.length > 7 ? ' is-long' : ''}`}>
          {winners.length > 1 ? 'All square' : iWon ? 'You win!' : `${winnerName} wins`}
        </p>
        <BallRow
          big={game.me !== null}
          entries={st.map((x) => ({
            key: x.index,
            name: game.players[x.index].name,
            total: x.total,
            fill: BALL_FILL[x.index % BALL_FILL.length],
            you: x.index === game.me,
            lead: winners.length === 1 && x.place === 1,
          }))}
        />
        <button type="button" className="btn btn-secondary btn-block" onClick={shareResult}>
          {Icons.share} Share the result
        </button>
      </section>

      <Scorecard game={game} players={st.map((x) => x.index)} />

      <div className="sticky-cta">
        {isHost ? (
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!room.engine} onClick={room.hostRematch}>
            {onlineCount >= MIN_PLAYERS ? 'Rematch' : 'Back to the start'}
          </button>
        ) : (
          <p className="wait-pill">
            <span className="spinner" aria-hidden="true" />
            Waiting for {hostName} to start a rematch
          </p>
        )}
      </div>
      <Confetti fire={confetti} />
    </main>
  );
}
