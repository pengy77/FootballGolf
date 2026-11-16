import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import { CATEGORY_BY_ID, COURSES } from '../lib/data';
import { cleanName, NAME_MAX, obStrokes, ordinal, sameName, standings, type Game } from '../lib/game';
import { buzz, copyText, shareLink } from '../lib/share';
import { asGame, canStart, MIN_PLAYERS, onlineInRound, type LiveState } from '../live/room';
import { parseRoomCode, roomUrl } from '../live/rooms';
import { useRoom, type RoomApi } from '../live/useRoom';
import { Confetti } from '../components/Confetti';
import { HoleCard } from '../components/HoleCard';
import { HowToSteps } from '../components/HowTo';
import { PickBox, type Selection } from '../components/PickBox';
import { Reveal, RevealCta } from '../components/Reveal';
import { Scorecard } from '../components/Scorecard';
import { Icons, IconButton, Logo, Tag, TopBar } from '../components/ui';
import { HoleRecap } from './Results';
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

const secsLabel = (ms: number) => `${Math.round(ms / 1000)}-second`;
const courseName = (s: LiveState) => COURSES.find((c) => c.id === s.course)?.name ?? 'Mixed';
const nameOf = (s: LiveState, id: string) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
const listNames = (names: string[]) => (names.length <= 2 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`);

function Room({ id, secret }: { id: string; secret: string }) {
  const room = useRoom(id, secret);
  const { rec, state: s, error } = room;

  if (error === 'insecure')
    return <Message title="Live games need a secure link" body="Open the link that starts with https:// (the one your mate sent) and try again." />;
  if (error) return <Message title="Couldn't open the room" body="Check your connection, then open the link again." />;
  // Find the room before asking for a name, so a dead link says so straight away.
  if (!s) return <FindingRoom room={room} />;
  if (!rec.name) return <JoinRoom room={room} />;
  const me = rec.playerId;
  if (!s.players.some((p) => p.id === me) && s.players.length >= 8)
    return <Message title="This room is full" body="Live rooms take up to 8 players. Start your own room from the home screen." />;
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
        <IconButton label="Leave room" onClick={leave}>
          {Icons.close}
        </IconButton>
      }
      title={
        inGame ? (
          <div className="progress" aria-label={`Hole ${s.hole + 1} of ${s.holes.length}`}>
            <span className="progress-label">
              <span className="live-dot" aria-hidden="true" /> {label ?? 'Live'}
            </span>
            <span className="progress-dots" aria-hidden="true">
              {s.holes.map((_, i) => (
                <i key={i} className={i < s.hole ? 'is-done' : i === s.hole ? 'is-now' : undefined} />
              ))}
            </span>
          </div>
        ) : (
          <span className="topbar-label">
            <span className="live-dot" aria-hidden="true" /> {label ?? 'Live room'}
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
    const out = await shareLink({ title: 'Football Golf', text: `⛳ ${hostName} wants a live game of Football Golf, right now. Tap to join:`, url });
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
    if (s?.players.some((p) => sameName(p.name, n))) return setErr(`There's already a ${n} in this room. Try a nickname.`);
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
        title={<span className="topbar-label">Live challenge</span>}
      />
      <div className="join-hero">
        <Logo size={56} />
        <p className="kicker">You're invited to play live</p>
        <h1 className="join-title">{hostName ? `${hostName}'s room` : 'Football Golf live'}</h1>
        {s && (
          <>
            <div className="join-players">
              {s.players.map((p, i) => (
                <Tag key={p.id} name={p.name} index={i} small />
              ))}
            </div>
            <p className="join-course">
              {s.holeCount} holes · {courseName(s)} · {secsLabel(s.turnMs)} shot clock
            </p>
          </>
        )}
        {!s && room.status !== 'online' && <p className="join-course">Connecting…</p>}
      </div>

      <form
        className="card form-card join-form"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        <label className="field-title" htmlFor="join-name">
          Your name
        </label>
        {s && s.phase !== 'lobby' && <p className="field-help">A round's already under way. Join now and you're in the next one.</p>}
        <input
          id="join-name"
          className={`input${err ? ' is-error' : ''}`}
          value={name}
          maxLength={NAME_MAX}
          placeholder="Your name"
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
          Join the room
        </button>
      </form>

      <section className="card howto-card">
        <h2 className="field-title">How it works</h2>
        <HowToSteps />
        <p className="fine">
          Live: everyone plays the same hole at the same time, with {s ? `a ${secsLabel(s.turnMs)}` : 'a'} shot clock. Miss it and that hole counts as out of
          bounds.
        </p>
      </section>
    </main>
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
        <h1 className="join-title">Finding the room</h1>
        {slow && room.status === 'online' ? (
          <>
            <p className="lead">
              Can't find this room. The host may have closed the game, or the link is from more than a day ago. Ask them to send a fresh link.
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
      <div className="join-hero">
        <p className="kicker">{s.round > 1 ? `Round ${s.round}` : 'Live challenge'}</p>
        <h1 className="join-title">{isHost ? 'Get your mates in' : `${hostName}'s room`}</h1>
        <p className="join-course">
          {s.holeCount} holes · {courseName(s)} · {secsLabel(s.turnMs)} shot clock
        </p>
      </div>

      {!isHost && (
        <p className="youre-in" role="status">
          <span aria-hidden="true">✓</span> You're in. {hostName} starts the game once everyone's here.
        </p>
      )}

      <section className="card roster" aria-label="Players">
        <h2 className="field-title roster-title">
          Players <span>{onlineCount} online</span>
        </h2>
        <ul className="roster-list">
          {players.map((p) => {
            const i = s.players.indexOf(p);
            const on = isOn(p.id);
            return (
              <li key={p.id} className={on ? 'is-on' : 'is-away'}>
                <span className="presence" aria-hidden="true" />
                <Tag name={p.name} index={i} small />
                <span className="roster-note">
                  {[p.id === room.rec.playerId && 'you', p.id === s.hostId && 'host'].filter(Boolean).join(' · ')}
                </span>
                <span className="roster-state">{on ? 'Here' : 'Away'}</span>
              </li>
            );
          })}
          {!meListed && (
            <li className="is-on">
              <span className="presence" aria-hidden="true" />
              <Tag name={room.rec.name} index={s.players.length} small />
              <span className="roster-note">you</span>
              <span className="roster-state">Joining…</span>
            </li>
          )}
        </ul>
        {need > 0 && (
          <p className="roster-wait">
            <span className="spinner" aria-hidden="true" />
            {isHost ? `Waiting for ${need === 1 ? 'a mate' : `${need} players`} to open your link` : 'Waiting for more players'}
          </p>
        )}
      </section>

      <section className="card share-card">
        <button type="button" className={`btn btn-block ${isHost && s.players.length < MIN_PLAYERS ? 'btn-primary btn-lg' : 'btn-secondary'}`} onClick={invite}>
          {Icons.share} {isHost ? 'Send the invite link' : 'Invite someone else'}
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={copy}>
          {Icons.copy} Copy link
        </button>
        {box}
        <p className="fine">Anyone with this link can join, up to 8 players. Keep this screen open: you'll tee off together.</p>
      </section>

      <section className="card howto-card">
        <h2 className="field-title">How live works</h2>
        <ol className="howto">
          <li>
            <span className="howto-n">1</span>
            <div>
              <b>Same hole, same time.</b> Everyone gets the same target rank and list.
            </div>
          </li>
          <li>
            <span className="howto-n">2</span>
            <div>
              <b>{Math.round(s.turnMs / 1000)} seconds to lock in.</b> Miss the clock and the hole counts as out of bounds.
            </div>
          </li>
          <li>
            <span className="howto-n">3</span>
            <div>
              <b>Reveal together.</b> Picks stay hidden until everyone's in, then you all see the answers at once.
            </div>
          </li>
        </ol>
      </section>

      <div className="sticky-cta">
        {isHost ? (
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!startable} onClick={room.hostStart}>
            {startable ? `Tee off · ${onlineCount} players` : !room.engine ? 'This room is open in another tab' : `Need ${need} more player${need === 1 ? '' : 's'} online`}
          </button>
        ) : (
          <p className="wait-pill">
            <span className="spinner" aria-hidden="true" />
            {onlineCount >= MIN_PLAYERS ? `Waiting for ${hostName} to tee off` : 'Waiting for more players'}
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

function LockStatus({ s, game, hostAway }: { s: LiveState; game: Game; hostAway?: boolean }) {
  return (
    <ul className="lock-status" aria-label="Who's locked in">
      {s.inRound.map((pid, i) => {
        const done = s.picks[pid]?.[s.hole] != null;
        const away = !s.online.includes(pid) || (pid === s.hostId && !!hostAway);
        return (
          <li key={pid} className={done ? 'is-in' : away ? 'is-away' : undefined}>
            <Tag name={game.players[i].name} index={i} small />
            <span className="lock-word">{done ? 'Locked in' : away ? 'Away' : 'Thinking…'}</span>
          </li>
        );
      })}
    </ul>
  );
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
  const waitingOn = s.inRound.filter((pid) => pid !== me && s.picks[pid]?.[s.hole] == null).map((pid) => nameOf(s, pid));
  const all = s.inRound.map((_, i) => i);

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

  // Picked something but didn't tap "Lock it in" before the buzzer: lock it in for them.
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
          <p className="kicker">
            Hole {s.hole + 1} of {s.holes.length}
          </p>
          <p className="get-ready-n" key={n}>
            {n}
          </p>
          <p className="lead">{playing ? `Get ready: ${Math.round(s.turnMs / 1000)} seconds on the clock` : 'Next hole coming up'}</p>
        </div>
        {s.hole > 0 && <Scorecard game={game} players={all} upTo={s.hole} current={s.hole} />}
      </main>
    );
  }

  const endRound = room.engine && s.deadline === null && (
    <button
      type="button"
      className="link-btn give-up"
      onClick={() => window.confirm('End this round for everyone and go back to the room?') && room.hostToLobby()}
    >
      Stop waiting: end this round
    </button>
  );

  if (!playing) {
    return (
      <main className="screen play live">
        <LiveTop s={s} label="Watching" />
        <ConnNote room={room} s={s} />
        <ShotClock s={s} now={room.now} away={away} hostAway={hostAway} />
        <p className="spectate-note">
          {listNames(s.inRound.map((pid) => nameOf(s, pid)))} {s.inRound.length === 1 ? 'is' : 'are'} playing. You're in from the next round.
        </p>
        <HoleCard hole={h} index={s.hole} count={s.holes.length} />
        <LockStatus s={s} game={game} hostAway={!!hostAway} />
        {s.hole > 0 && <Scorecard game={game} players={all} upTo={s.hole} current={s.hole} />}
      </main>
    );
  }

  return (
    <main className={`screen play picking live${searching ? ' is-searching' : ''}`}>
      <LiveTop s={s} confirmLeave={leaveWarning} />
      <ConnNote room={room} s={s} />
      <ShotClock s={s} now={room.now} away={away} hostAway={hostAway} />
      <HoleCard hole={h} index={s.hole} count={s.holes.length} compact={searching || !!mine} />

      {mine ? (
        <section className="card locked-card" aria-live="polite">
          <p className="kicker-ink">Locked in</p>
          <p className="locked-name">{mine === '~' ? 'No answer (penalty)' : mine.startsWith('~') ? `“${mine.slice(1)}”` : (cat.byId.get(mine)?.name ?? mine)}</p>
          <p className="fine">{waitingOn.length ? `Waiting for ${listNames(waitingOn)}. Picks stay hidden till everyone's in.` : 'Everyone is in. Here comes the reveal…'}</p>
        </section>
      ) : timeUp ? (
        <section className="card locked-card is-late" aria-live="assertive">
          <p className="kicker-ink">Time's up</p>
          <p className="locked-name">Out of bounds (+{obStrokes(cat, h.target)})</p>
          <p className="fine">No pick in time. The reveal's coming up…</p>
        </section>
      ) : (
        <>
          <PickBox key={`${s.round}:${s.hole}`} cat={cat} selection={selection} onSelect={setSelection} onSearching={onSearching} autoFocus />
          {!selection && !searching && (
            <button type="button" className="link-btn give-up" onClick={() => setSelection({ offList: '' })}>
              No idea? Take the penalty (+{obStrokes(cat, h.target)})
            </button>
          )}
        </>
      )}

      {!searching && <LockStatus s={s} game={game} hostAway={!!hostAway} />}
      {!searching && endRound}
      {!searching && s.hole > 0 && <Scorecard game={game} players={all} upTo={s.hole} current={s.hole} />}

      {!mine && !timeUp && !searching && (
        <div className="sticky-cta">
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!selection} onClick={() => lock(selection)}>
            {selection ? 'Lock it in' : `Pick a ${cat.noun}`}
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
    <main className="screen play live">
      <LiveTop s={s} label={playing ? 'Live' : 'Watching'} confirmLeave={isHost ? 'Leaving pauses the game for everyone until you come back. Leave anyway?' : undefined} />
      <ConnNote room={room} s={s} />
      <Reveal
        game={game}
        hole={s.hole}
        players={all}
        animate
        onSettled={onSettled}
        after={<Scorecard game={game} players={all} upTo={s.hole + 1} current={s.hole} />}
      />
      {playing && !iAmReady && (
        <RevealCta
          armed={armed}
          label={`${last ? 'See final scores' : `Ready for hole ${s.hole + 2}`}${readyCount > 0 ? ` · ${readyCount}/${online.length}` : ''}`}
          onNext={() => room.ready(s.hole)}
        />
      )}
      {(!playing || iAmReady) && (
        <div className="sticky-cta">
          <p className="wait-pill">
            <span className="spinner" aria-hidden="true" />
            {waitingOn.length ? `Waiting for ${listNames(waitingOn)} · ${readyCount} of ${online.length} ready` : last ? 'Adding up the cards…' : 'Teeing up the next hole…'}
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
  const { go } = useApp();
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
  const { toast } = useApp();

  if (!s.holes.length || !st.length) return <Lobby room={room} s={s} />;

  const winnerName = game.players[winners[0].index].name;
  const mine = game.me !== null ? st.find((x) => x.index === game.me) : undefined;
  let personal = '';
  if (mine) {
    const best = st[0].total;
    const runnerUp = st.find((x) => x.total > best)?.total;
    if (mine.place === 1 && winners.length > 1) personal = `You tied for the win on ${mine.total}`;
    else if (mine.place === 1) personal = runnerUp !== undefined ? `You won by ${runnerUp - best} stroke${runnerUp - best === 1 ? '' : 's'}` : 'You won';
    else personal = `You came ${ordinal(mine.place)}, ${mine.total - best} behind ${winners.length > 1 ? 'the leaders' : winnerName}`;
  }
  const shareResult = async () => {
    const line = st.map((x) => `${game.players[x.index].name} ${x.total}`).join(', ');
    const out = await shareLink({
      title: 'Football Golf',
      text: `⛳ Football Golf live, ${s.holes.length} holes: ${line}. ${winners.length > 1 ? 'All square!' : `${winnerName} wins!`}`,
      url: `${location.origin}${location.pathname}`,
    });
    if (out === 'copied') toast('Result copied. Paste it into your chat.');
  };

  return (
    <main className="screen results live">
      <LiveTop label="Full time" />
      <ConnNote room={room} s={s} />
      <section className="banner">
        <p className="banner-kicker">{iWon && winners.length === 1 ? 'Get in!' : 'Full time'}</p>
        <p className={`banner-big${winnerName.length > 8 ? ' is-long' : ''}`}>{winners.length > 1 ? 'All square!' : `${winnerName} wins!`}</p>
        <p className="banner-sub">{personal || `${st.map((x) => x.total).join(' v ')} · fewest strokes wins`}</p>
      </section>

      <Scorecard game={game} players={st.map((x) => x.index)} upTo={s.holes.length} />

      {st.length > 2 && (
        <ol className="standings card">
          {st.map((x) => (
            <li key={x.index}>
              <span className="st-place">{ordinal(x.place)}</span>
              <Tag name={game.players[x.index].name} index={x.index} small />
              <span className="st-total">{x.total}</span>
            </li>
          ))}
        </ol>
      )}

      <section>
        <h2 className="section-title">Hole by hole</h2>
        <ol className="recaps">
          {s.holes.map((_, i) => (
            <HoleRecap key={i} game={game} hole={i} players={st.map((x) => x.index)} />
          ))}
        </ol>
      </section>

      <div className="end-actions">
        <button type="button" className="btn btn-secondary btn-block" onClick={shareResult}>
          {Icons.share} Share the result
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={() => go('/')}>
          Home
        </button>
      </div>

      <div className="sticky-cta">
        {isHost ? (
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!room.engine} onClick={room.hostRematch}>
            {onlineCount >= MIN_PLAYERS ? 'Rematch: new holes' : 'Back to the room'}
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
