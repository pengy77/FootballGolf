import { useCallback, useEffect, useState } from 'react';
import { HOST_HAS_CLOSE, NavGuard, useApp, useCanonicalUrl } from '../App';
import { CATEGORY_BY_ID } from '../lib/data';
import { donePlayers, isDone, isPlayable, obStrokes, ordinal, type Game } from '../lib/game';
import { findGame, type Saved } from '../lib/store';
import { buzz } from '../lib/share';
import { Ball, BALL_FILL } from '../components/art';
import { Course, wholeList } from '../components/Course';
import { HoleCard } from '../components/HoleCard';
import { PickBox, type Selection } from '../components/PickBox';
import { Reveal, RevealCta } from '../components/Reveal';
import { TeeBalls, type TeeBall } from '../components/Tee';
import { HoleDots, Icons, IconButton, TopBar } from '../components/ui';
import Message from './Message';

type State = { kind: 'pick'; hole: number; player: number } | { kind: 'reveal'; hole: number } | { kind: 'done' };

function stateOf(game: Game): State {
  const n = game.holes.length;
  if (game.mode === 'challenge' && game.me !== null) {
    const picks = game.players[game.me].picks;
    const next = picks.findIndex((x) => x === null);
    const played = next < 0 ? n : next;
    if (game.revealed < played) return { kind: 'reveal', hole: game.revealed };
    if (played < n) return { kind: 'pick', hole: played, player: game.me };
    return { kind: 'done' };
  }
  const h = game.holes.findIndex((_, i) => game.players.some((p) => p.picks[i] === null));
  const complete = h < 0 ? n : h;
  if (game.revealed < complete) return { kind: 'reveal', hole: game.revealed };
  if (complete < n) return { kind: 'pick', hole: complete, player: game.players.findIndex((p) => p.picks[complete] === null) };
  return { kind: 'done' };
}

/** Who appears on this device's cards: in a challenge, me plus anyone who already finished. */
function visiblePlayers(game: Game): number[] {
  if (game.mode === 'local' || game.me === null) return game.players.map((_, i) => i);
  const done = donePlayers(game);
  return game.players.map((_, i) => i).filter((i) => i === game.me || done.includes(i));
}

function contextLabel(game: Game): string | undefined {
  if (game.mode === 'local') return undefined;
  const others = game.players.filter((_, i) => i !== game.me && isDone(game, i)).map((p) => p.name);
  if (!others.length) return undefined;
  return others.length === 1 ? `vs ${others[0]}` : `vs ${others.length}`;
}

/** Nobody's finished a game on this phone yet: worth a one-line nudge on their first hole. */
export function isNewcomer(saved: Saved): boolean {
  if (saved.seenHowTo) return false;
  return !Object.values(saved.games).some((g) => (g.me !== null ? isDone(g, g.me) : g.players.every((_, i) => isDone(g, i))));
}

export default function Play({ id }: { id: string }) {
  const { saved, saveGame, go, showHowTo } = useApp();
  const found = findGame(saved, id);
  const game = found && isPlayable(found) ? found : undefined;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [armed, setArmed] = useState(false);
  useCanonicalUrl(game);
  const [searching, setSearching] = useState(false);
  const [readyFor, setReadyFor] = useState('');
  const [newcomer] = useState(() => isNewcomer(saved));
  const onSearching = useCallback((b: boolean) => setSearching(b), []);

  const state = game ? stateOf(game) : null;
  const stateKey = state ? `${state.kind}:${'hole' in state ? state.hole : ''}:${state.kind === 'pick' ? state.player : ''}` : '';

  useEffect(() => {
    setSelection(null);
    setSearching(false);
    // The reveal arms its "next" button itself once everything's on screen (see Reveal onSettled).
    setArmed(false);
  }, [stateKey]);
  const onSettled = useCallback(() => setArmed(true), []);

  useEffect(() => {
    if (!game || state?.kind !== 'done') return;
    saveGame({ ...game, seen: donePlayers(game).map((i) => game.players[i].name) });
    go(`/results/${id}`, { replace: true });
  }, [state?.kind, game, id, go, saveGame]);

  if (found && !game)
    return <Message title="This course has closed" body="One of the lists this game used has been removed since it was made. Start a fresh game instead." />;
  if (!game || !state) return <Message title="Game not found" body="This game isn't saved on this phone any more." />;
  if (game.mode === 'challenge' && game.me === null) return <NavGuard to={`/join/${id}`} />;
  if (state.kind === 'done') return null;

  const players = visiblePlayers(game);
  // No "saved" toast: home shows the ball waiting on the next tee.
  const quit = () => go('/');
  const top = (current: number) => (
    <TopBar
      left={
        HOST_HAS_CLOSE ? undefined : (
          <IconButton label="Leave game" onClick={quit}>
            {Icons.close}
          </IconButton>
        )
      }
      title={<HoleDots count={game.holes.length} current={current} label={contextLabel(game)} />}
      right={
        <IconButton label="How to play" onClick={showHowTo}>
          {Icons.help}
        </IconButton>
      }
    />
  );

  if (state.kind === 'reveal') {
    const last = state.hole === game.holes.length - 1;
    const revealPlayers = game.mode === 'local' ? players : players.filter((p) => game.players[p].picks[state.hole] !== null);
    return (
      <main className="screen play revealing">
        {top(state.hole)}
        <Reveal key={state.hole} game={game} hole={state.hole} players={revealPlayers} animate onSettled={onSettled} />
        <RevealCta
          armed={armed}
          label={last ? 'Final scores' : `Hole ${state.hole + 2}`}
          onNext={() => {
            saveGame({ ...game, revealed: game.revealed + 1 });
            window.scrollTo({ top: 0 });
          }}
        />
      </main>
    );
  }

  // Picking
  const { hole, player } = state;
  const h = game.holes[hole];
  const cat = CATEGORY_BY_ID.get(h.cat)!;
  const turnKey = `${hole}:${player}`;
  const needsHandoff = game.mode === 'local' && readyFor !== turnKey && !(hole === 0 && player === 0);
  const solo = players.length === 1;

  if (needsHandoff) {
    return (
      <main className="screen play handoff">
        {top(hole)}
        <div className="handoff-body">
          <Ball size={84} fill={BALL_FILL[player % BALL_FILL.length]} className="handoff-ball" />
          <p className="kicker">Pass to</p>
          <h1 className="handoff-name">{game.players[player].name}</h1>
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => setReadyFor(turnKey)}>
            Show me the hole
          </button>
        </div>
      </main>
    );
  }

  const lock = () => {
    if (!selection) return;
    const pick = 'item' in selection ? selection.item.id : `~${selection.offList}`;
    saveGame({
      ...game,
      players: game.players.map((pl, i) => (i === player ? { ...pl, picks: pl.picks.map((x, k) => (k === hole ? pick : x)) } : pl)),
    });
    buzz();
    window.scrollTo({ top: 0 });
  };

  const tag = selection ? ('item' in selection ? (selection.shown?.name ?? selection.item.name) : selection.shown?.name || selection.offList || 'No answer') : undefined;
  const tee: TeeBall[] =
    game.mode === 'challenge'
      ? players.map((p) => ({
          key: p,
          fill: solo ? '#fff' : BALL_FILL[p % BALL_FILL.length],
          state: p === player ? 'active' : 'locked',
          name: solo ? undefined : game.players[p].name,
          tag: p === player ? tag : undefined,
        }))
      : game.players.map((pl, p) => ({
          key: p,
          fill: BALL_FILL[p % BALL_FILL.length],
          state: p === player ? 'active' : pl.picks[hole] !== null ? 'locked' : 'waiting',
          name: pl.name,
          tag: p === player ? tag : undefined,
        }));

  return (
    <main className={`screen play picking${searching ? ' is-searching' : ''}${selection ? ' has-pick' : ''}`}>
      {top(hole)}
      <HoleCard key={hole} hole={h} index={hole} count={game.holes.length} compact={searching} />
      {newcomer && hole === 0 && (
        <p className="coach">
          Name the {cat.noun} you think is {ordinal(h.target)}. Every place off is a stroke.
        </p>
      )}
      <PickBox key={turnKey} cat={cat} selection={selection} onSelect={setSelection} onSearching={onSearching} autoFocus />
      {/* Searching and confirming are one screen: nothing here unmounts or moves when a name is picked.
          Give up keeps its slot once a pick is in, and the course stays put under the suggestions. */}
      <button
        type="button"
        className={`give-up${selection ? ' is-hidden' : ''}`}
        onClick={() => setSelection({ offList: '' })}
        tabIndex={selection ? -1 : undefined}
      >
        Give up <span>+{obStrokes(cat, h.target)}</span>
      </button>
      <Course size={cat.size} target={h.target} view={wholeList(cat.size)} tee className="is-aim">
        {() => <TeeBalls balls={tee} />}
      </Course>
      {!searching && selection && (
        <div className="sticky-cta">
          <button type="button" className="btn btn-primary btn-block btn-lg cta-in" onClick={lock}>
            Take the shot
          </button>
        </div>
      )}
    </main>
  );
}
