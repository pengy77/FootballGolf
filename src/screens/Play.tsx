import { useCallback, useEffect, useState } from 'react';
import { NavGuard, useApp, useCanonicalUrl } from '../App';
import { CATEGORY_BY_ID } from '../lib/data';
import { donePlayers, isDone, isPlayable, obStrokes, type Game } from '../lib/game';
import { findGame } from '../lib/store';
import { buzz } from '../lib/share';
import { HoleCard } from '../components/HoleCard';
import { PickBox, type Selection } from '../components/PickBox';
import { Reveal, RevealCta } from '../components/Reveal';
import { Scorecard } from '../components/Scorecard';
import { Icons, IconButton, Tag, TopBar } from '../components/ui';
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

function contextLabel(game: Game): string {
  if (game.mode === 'local') return 'Pass & play';
  const others = game.players.filter((_, i) => i !== game.me && isDone(game, i)).map((p) => p.name);
  if (!others.length) return 'Your round';
  return others.length === 1 ? `vs ${others[0]}` : `vs ${others.length} players`;
}

function Progress({ game, current }: { game: Game; current: number }) {
  return (
    <div className="progress" aria-label={`Hole ${current + 1} of ${game.holes.length}`}>
      <span className="progress-label">{contextLabel(game)}</span>
      <span className="progress-dots" aria-hidden="true">
        {game.holes.map((_, i) => (
          <i key={i} className={i < current ? 'is-done' : i === current ? 'is-now' : undefined} />
        ))}
      </span>
    </div>
  );
}

export default function Play({ id }: { id: string }) {
  const { saved, saveGame, go, showHowTo, toast } = useApp();
  const found = findGame(saved, id);
  const game = found && isPlayable(found) ? found : undefined;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [armed, setArmed] = useState(false);
  useCanonicalUrl(game);
  const [searching, setSearching] = useState(false);
  const [readyFor, setReadyFor] = useState('');
  const onSearching = useCallback((b: boolean) => setSearching(b), []);

  const state = game ? stateOf(game) : null;
  const stateKey = state ? `${state.kind}:${'hole' in state ? state.hole : ''}:${state.kind === 'pick' ? state.player : ''}` : '';

  useEffect(() => {
    setSelection(null);
    setSearching(false);
    // The reveal arms its "next" button itself once the pin is showing (see Reveal onSettled).
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
  const showOthers = players.length > 1;
  const quit = () => {
    toast('Game saved. Pick it up from the home screen.');
    go('/');
  };
  const top = (current: number) => (
    <TopBar
      left={
        <IconButton label="Leave game" onClick={quit}>
          {Icons.close}
        </IconButton>
      }
      title={<Progress game={game} current={current} />}
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
      <main className="screen play">
        {top(state.hole)}
        <Reveal
          key={state.hole}
          game={game}
          hole={state.hole}
          players={revealPlayers}
          animate
          onSettled={onSettled}
          after={<Scorecard game={game} players={players} upTo={state.hole + 1} current={state.hole} />}
        />
        <RevealCta
          armed={armed}
          label={last ? 'See final scores' : `On to hole ${state.hole + 2}`}
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

  if (needsHandoff) {
    return (
      <main className="screen play handoff">
        {top(hole)}
        <div className="handoff-body">
          <p className="kicker">Pass the phone to</p>
          <div className="handoff-name">
            <Tag name={game.players[player].name} index={player} />
          </div>
          <p className="lead">Hole {hole + 1} of {game.holes.length}. No peeking, everyone else.</p>
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => setReadyFor(turnKey)}>
            I'm {game.players[player].name}, show me the hole
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

  const sealed =
    game.mode === 'challenge'
      ? players.filter((p) => p !== game.me)
      : game.players.map((_, i) => i).filter((i) => i !== player && game.players[i].picks[hole] !== null);

  return (
    <main className={`screen play picking${searching ? ' is-searching' : ''}`}>
      {top(hole)}
      <HoleCard key={hole} hole={h} index={hole} count={game.holes.length} compact={searching} />
      {game.mode === 'local' && (
        <p className="turn-line">
          <Tag name={game.players[player].name} index={player} small /> your pick
        </p>
      )}
      <PickBox key={turnKey} cat={cat} selection={selection} onSelect={setSelection} onSearching={onSearching} autoFocus />
      {!selection && !searching && (
        <button type="button" className="link-btn give-up" onClick={() => setSelection({ offList: '' })}>
          No idea? Take the penalty (+{obStrokes(cat, h.target)})
        </button>
      )}
      {!searching && sealed.length > 0 && (
        <p className="sealed">
          {sealed.map((p) => (
            <Tag key={p} name={game.players[p].name} index={p} small />
          ))}
          <span>{sealed.length === 1 ? 'has' : 'have'} picked. Sealed until you lock in.</span>
        </p>
      )}
      {!searching && (showOthers || game.revealed > 0) && (
        <Scorecard game={game} players={players} upTo={game.revealed} current={hole} />
      )}
      {!searching && (
        <div className="sticky-cta">
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!selection} onClick={lock}>
            {selection ? 'Lock it in' : `Pick a ${cat.noun}`}
          </button>
        </div>
      )}
    </main>
  );
}
