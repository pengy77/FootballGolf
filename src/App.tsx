import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mergeGame, type Game } from './lib/game';
import { decodeGame, encodeGame } from './lib/link';
import { findGame, loadSaved, mergeSaved, persist, type Saved } from './lib/store';
import Home from './screens/Home';
import Setup from './screens/Setup';
import Join from './screens/Join';
import Play from './screens/Play';
import Results from './screens/Results';
import Message from './screens/Message';
import Daily from './screens/Daily';
import Live from './screens/Live';
import { HowToSheet } from './components/HowTo';
import { Toast } from './components/ui';

export type Route =
  | { name: 'home' }
  | { name: 'setup'; mode: 'live' | 'local' }
  | { name: 'daily' }
  | { name: 'live'; code: string }
  | { name: 'incoming'; code: string }
  | { name: 'join'; id: string }
  | { name: 'play'; id: string }
  | { name: 'results'; id: string }
  | { name: 'badlink' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  switch (parts[0]) {
    case 'new':
      return { name: 'setup', mode: parts[1] === 'local' ? 'local' : 'live' };
    case 'daily':
      return { name: 'daily' };
    case 'r':
      return parts[1] ? { name: 'live', code: parts[1] } : { name: 'badlink' };
    case 'c':
      return parts[1] ? { name: 'incoming', code: parts.slice(1).join('/') } : { name: 'badlink' };
    case 'join':
      return { name: 'join', id: parts[1] ?? '' };
    case 'play':
      return { name: 'play', id: parts[1] ?? '' };
    case 'results':
      return { name: 'results', id: parts[1] ?? '' };
    case 'badlink':
      return { name: 'badlink' };
    default:
      return { name: 'home' };
  }
}

interface Ctx {
  saved: Saved;
  route: Route;
  go: (hash: string, opts?: { replace?: boolean }) => void;
  saveGame: (g: Game) => void;
  setName: (name: string) => void;
  showHowTo: () => void;
  toast: (msg: string) => void;
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

/** Whether the page around the game already has its own close button (Reddit's expanded view does). */
export const HOST_HAS_CLOSE = false;

export default function App() {
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  const [howTo, setHowTo] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ msg: string; key: number } | null>(null);
  const savedRef = useRef(saved);
  savedRef.current = saved;

  // Always fold in what other tabs have saved first, so one tab can't wipe another's games.
  const update = useCallback((fn: (s: Saved) => Saved) => {
    setSaved((prev) => {
      const next = fn(mergeSaved(prev, loadSaved()));
      persist(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(location.hash));
    const onStorage = () => setSaved((prev) => mergeSaved(prev, loadSaved()));
    window.addEventListener('hashchange', onHash);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const go = useCallback((hash: string, opts?: { replace?: boolean }) => {
    const target = hash.startsWith('#') ? hash : `#${hash}`;
    if (opts?.replace) {
      history.replaceState(null, '', target);
      setRoute(parseHash(target));
    } else if (location.hash === target) {
      setRoute(parseHash(target));
    } else {
      location.hash = target;
    }
    window.scrollTo({ top: 0 });
  }, []);

  // A share link: unpack it, merge with anything we already know about that game, then show the invite.
  useEffect(() => {
    if (route.name !== 'incoming') return;
    const decoded = decodeGame(route.code);
    if (!decoded) {
      go('/badlink', { replace: true });
      return;
    }
    const all = mergeSaved(savedRef.current, loadSaved());
    const now = Date.now();
    const incoming: Game = { ...decoded, mode: 'challenge', me: null, revealed: 0, seen: [], createdAt: now, updatedAt: now };
    const sameHoles = (g: Game) => JSON.stringify(g.holes) === JSON.stringify(decoded.holes);
    const untouched = (g: Game) => g.me === null || g.players[g.me]?.picks.every((x) => x === null);
    // Cards are only ever merged when they're for exactly the same holes. If this phone has a game with
    // the same id but different holes (e.g. a daily made by an older version), keep them apart.
    let target = decoded.id;
    for (const c of '23456789') {
      const g = findGame(all, target);
      if (!g || sameHoles(g) || untouched(g)) break;
      target = `${decoded.id.slice(0, 15)}${c}`;
    }
    const existing = findGame(all, target);
    const fresh = { ...incoming, id: target };
    const game = existing && sameHoles(existing) ? mergeGame(existing, fresh) : fresh;
    update((s) => ({ ...s, games: { ...s.games, [game.id]: game } }));
    go(`/join/${game.id}`, { replace: true });
  }, [route, go, update]);

  const ctx = useMemo<Ctx>(
    () => ({
      saved,
      route,
      go,
      saveGame: (g) => update((s) => ({ ...s, games: { ...s.games, [g.id]: { ...g, updatedAt: Date.now() } } })),
      setName: (name) => update((s) => ({ ...s, name })),
      showHowTo: () => {
        setHowTo(true);
        update((s) => (s.seenHowTo ? s : { ...s, seenHowTo: true }));
      },
      toast: (msg) => setToastMsg({ msg, key: Date.now() }),
    }),
    [saved, route, go, update],
  );

  let screen: ReactNode;
  switch (route.name) {
    case 'setup':
      screen = <Setup key={route.mode} mode={route.mode} />;
      break;
    case 'daily':
      screen = <Daily />;
      break;
    case 'live':
      screen = <Live key={route.code} code={route.code} />;
      break;
    case 'join':
      screen = <Join key={route.id} id={route.id} />;
      break;
    case 'play':
      screen = <Play key={route.id} id={route.id} />;
      break;
    case 'results':
      screen = <Results key={route.id} id={route.id} />;
      break;
    case 'badlink':
      screen = (
        <Message
          title="That link's gone wide"
          body="It may have been cut off when it was copied. Ask your mate to send it again."
        />
      );
      break;
    case 'incoming':
      screen = null;
      break;
    default:
      screen = <Home />;
  }

  return (
    <AppCtx.Provider value={ctx}>
      {screen}
      <HowToSheet open={howTo} onClose={() => setHowTo(false)} />
      {toastMsg && <Toast key={toastMsg.key} msg={toastMsg.msg} onDone={() => setToastMsg(null)} />}
    </AppCtx.Provider>
  );
}

/**
 * Keep the address bar pointing at a link that rebuilds this game anywhere, so "Open in Safari",
 * copying the URL, or reloading never loses it. replaceState doesn't add history or fire hashchange.
 */
export function useCanonicalUrl(game: Game | undefined) {
  const code = game ? encodeGame(game) : '';
  useEffect(() => {
    if (!code) return;
    const target = `#/c/${code}`;
    if (location.hash !== target) history.replaceState(history.state, '', target);
  }, [code]);
}

export function NavGuard({ to }: { to: string }) {
  const { go } = useApp();
  useEffect(() => go(to, { replace: true }), [go, to]);
  return null;
}
