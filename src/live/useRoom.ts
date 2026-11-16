import { useCallback, useEffect, useRef, useState } from 'react';
import { cryptoAvailable, importSecret } from './crypto';
import { advance, canStart, fingerprint, isLiveState, isPlayerDoc, newDoc, start, step, toLobby, type LiveState, type PlayerDoc } from './room';
import { getRoom, guestRecord, putRoom, type RoomRecord } from './rooms';
import { openRoom, type ConnStatus, type RoomConn } from './transport';

/** Re-send the state this often mid-hole so everyone's clock stays in sync. */
const HEARTBEAT_MS = 8000;
const TICK_MS = 400;

export type RoomError = 'insecure' | 'badkey' | 'connect';

export interface RoomApi {
  rec: RoomRecord;
  status: ConnStatus;
  error: RoomError | null;
  state: LiveState | null;
  /** Players whose phones are connected right now. */
  online: Set<string>;
  /** This tab runs the room (the host's phone). */
  engine: boolean;
  /** The host's clock, which deadlines are measured against. */
  now: () => number;
  join: (name: string) => void;
  lockIn: (hole: number, pick: string) => void;
  ready: (hole: number) => void;
  hostStart: () => void;
  hostAdvance: () => void;
  hostRematch: () => void;
  hostToLobby: () => void;
}

export function useRoom(id: string, secret: string): RoomApi {
  const [rec, setRec] = useState<RoomRecord>(() => {
    const r = getRoom(id);
    if (r && r.secret === secret) return r;
    const g = guestRecord(id, secret);
    putRoom(g);
    return g;
  });
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [error, setError] = useState<RoomError | null>(null);
  const [state, setState] = useState<LiveState | null>(rec.state);
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  const [engine, setEngine] = useState(false);

  const recRef = useRef(rec);
  const stateRef = useRef<LiveState | null>(rec.state);
  const connRef = useRef<RoomConn | null>(null);
  const docsRef = useRef<Record<string, PlayerDoc>>({});
  const presenceRef = useRef(new Map<string, boolean>());
  const engineRef = useRef(false);
  const statusRef = useRef<ConnStatus>('connecting');
  const offsetsRef = useRef<number[]>([]);
  const lastSentRef = useRef(0);
  /** True once we've heard our own presence echo back after (re)connecting, which means the relay
   *  has already handed us everyone's retained docs and presence. Until then the host decides nothing. */
  const syncedRef = useRef(false);
  const lastTickRef = useRef(Date.now());

  const saveRec = useCallback((patch: Partial<RoomRecord>) => {
    const next = { ...recRef.current, ...patch };
    recRef.current = next;
    setRec(next);
    putRoom(next);
  }, []);

  const now = useCallback(() => {
    if (engineRef.current || !offsetsRef.current.length) return Date.now();
    return Date.now() + Math.max(...offsetsRef.current);
  }, []);

  /** Host only: adopt a new state, publish it if anything changed (or a heartbeat is due). */
  const commit = useCallback(
    (next: LiveState, force = false) => {
      const prev = stateRef.current;
      const t = Date.now();
      const changed = !prev || fingerprint(next) !== fingerprint(prev);
      const heartbeat = next.phase === 'hole' && t - lastSentRef.current > HEARTBEAT_MS;
      if (!changed && !force && !heartbeat) return;
      const out = { ...next, sentAt: t };
      stateRef.current = out;
      lastSentRef.current = t;
      if (changed) {
        setState(out);
        saveRec({ state: out });
      }
      connRef.current?.sendState(out);
    },
    [saveRec],
  );

  const onlineSet = () => new Set([...presenceRef.current].filter(([, on]) => on).map(([pid]) => pid));

  const runStep = useCallback(
    (force = false) => {
      const prev = stateRef.current;
      if (!prev || !engineRef.current) return;
      // Not connected, or not caught up yet (just reconnected, just woke up): we might be missing
      // picks that arrived in time, so hold the clock rather than time anyone out.
      if (statusRef.current !== 'online' || !syncedRef.current) {
        if (prev.phase === 'hole' && prev.deadline !== null)
          commit({ ...prev, deadline: null, remainingMs: Math.max(0, prev.deadline - Date.now()) });
        return;
      }
      const docs = { ...docsRef.current };
      const mine = recRef.current.doc;
      if (mine) docs[mine.id] = mine;
      commit(step(prev, docs, onlineSet(), Date.now()), force);
    },
    [commit],
  );

  const updateDoc = useCallback(
    (fn: (d: PlayerDoc) => PlayerDoc) => {
      const cur = recRef.current.doc;
      if (!cur) return;
      const next = fn(cur);
      if (next === cur) return;
      const d = { ...next, seq: (cur.seq ?? 0) + 1 };
      saveRec({ doc: d });
      connRef.current?.sendDoc(d);
      if (engineRef.current) runStep();
    },
    [saveRec, runStep],
  );

  const markSynced = useCallback(() => {
    if (syncedRef.current || statusRef.current !== 'online') return;
    syncedRef.current = true;
    // Republish my doc unless the relay already has this copy (or a newer one from my other tab).
    const d = recRef.current.doc;
    const net = docsRef.current[recRef.current.playerId];
    if (d && !(net && (net.seq ?? 0) >= (d.seq ?? 0))) connRef.current?.sendDoc(d);
    if (engineRef.current) runStep(true);
  }, [runStep]);

  /** Woke up or came back to the tab: check the line is really alive before deciding anything. */
  const resync = useCallback(() => {
    syncedRef.current = false;
    if (engineRef.current) runStep();
    connRef.current?.ping();
  }, [runStep]);

  // Connect to the relay.
  useEffect(() => {
    let dead = false;
    let conn: RoomConn | null = null;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      if (!cryptoAvailable()) return setError('insecure');
      const key = await importSecret(secret);
      if (!key) return setError('badkey');
      conn = await openRoom({
        roomId: id,
        key,
        playerId: recRef.current.playerId,
        handlers: {
          status: (s) => {
            if (dead) return;
            statusRef.current = s;
            if (s !== 'online') syncedRef.current = false;
            setStatus(s);
            if (engineRef.current) runStep();
          },
          connected: () => {
            syncedRef.current = false;
            clearTimeout(fallback);
            // Normally our presence echo marks us caught up; this is just a safety net.
            fallback = setTimeout(() => !dead && markSynced(), 4000);
          },
          state: (v, retained) => {
            if (dead || engineRef.current || !isLiveState(v)) return;
            const cur = stateRef.current;
            if (!retained) offsetsRef.current = [...offsetsRef.current.slice(-7), v.sentAt - Date.now()];
            if (retained && cur && v.sentAt < cur.sentAt) return;
            stateRef.current = v;
            setState(v);
            saveRec({ state: v });
          },
          doc: (pid, v) => {
            if (dead || !isPlayerDoc(v) || v.id !== pid) return;
            const known = docsRef.current[pid];
            if (known && (known.seq ?? 0) > (v.seq ?? 0)) return;
            docsRef.current[pid] = v;
            // My own doc, newer than mine: I've got this room open in another tab too. Take its copy.
            const mine = recRef.current;
            if (pid === mine.playerId && (!mine.doc || (v.seq ?? 0) > (mine.doc.seq ?? 0))) saveRec({ doc: v, name: v.name });
            if (engineRef.current) runStep();
          },
          presence: (pid, on) => {
            if (dead) return;
            presenceRef.current.set(pid, on);
            setOnline(onlineSet());
            if (pid === recRef.current.playerId && on) markSynced();
            if (engineRef.current) runStep();
          },
        },
      });
      if (dead) conn.close();
      else connRef.current = conn;
    })().catch(() => !dead && setError('connect'));
    return () => {
      dead = true;
      clearTimeout(fallback);
      conn?.close();
      connRef.current = null;
    };
  }, [id, secret, runStep, saveRec, markSynced]);

  // The host's phone runs the clock. A lock makes sure only one tab does, even if the link is open twice.
  useEffect(() => {
    if (!rec.host) return;
    let dead = false;
    let release: (() => void) | null = null;
    const abort = new AbortController();
    const become = () => {
      const latest = getRoom(id)?.state ?? recRef.current.state;
      if (!latest) return;
      // Coming back mid-hole: hold the clock until everyone's reconnected (it resumes with at least 10s).
      const s = latest.phase === 'hole' && latest.deadline !== null ? { ...latest, deadline: null, remainingMs: Math.max(0, latest.deadline - Date.now()) } : latest;
      stateRef.current = s;
      setState(s);
      engineRef.current = true;
      setEngine(true);
      runStep(true);
    };
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    // The tab you're looking at takes over (a suspended background tab can't run the clock).
    const acquire = () => {
      if (!locks?.request) return become();
      locks
        .request(`fgolf-host-${id}`, { steal: true }, () => {
          if (dead) return;
          become();
          return new Promise<void>((resolve) => (release = resolve));
        })
        .catch(() => {
          // Another tab took over: stop running the room here and just follow along.
          if (dead) return;
          engineRef.current = false;
          setEngine(false);
        });
    };
    if (document.visibilityState === 'visible') acquire();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || dead) return;
      if (!engineRef.current) acquire();
      else resync();
    };
    document.addEventListener('visibilitychange', onVisible);
    const t = setInterval(() => {
      if (!engineRef.current) return;
      // A long gap between ticks means the phone was asleep: our connection may be dead without
      // knowing it yet, so re-check before the clock can time anyone out.
      const now = Date.now();
      const gap = now - lastTickRef.current;
      lastTickRef.current = now;
      if (gap > TICK_MS * 6) resync();
      runStep();
    }, TICK_MS);
    return () => {
      dead = true;
      abort.abort();
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(t);
      engineRef.current = false;
      setEngine(false);
      release?.();
    };
  }, [id, rec.host, runStep, resync]);

  // A rematch started: wipe last round's picks from my doc.
  const round = state?.round;
  useEffect(() => {
    const r = recRef.current;
    if (round !== undefined && r.doc && round > r.doc.round) updateDoc(() => newDoc(r.playerId, r.name, round));
  }, [round, updateDoc]);

  const join = useCallback(
    (name: string) => {
      const r = recRef.current;
      const doc = newDoc(r.playerId, name, stateRef.current?.round ?? 1);
      saveRec({ name, doc });
      connRef.current?.sendDoc(doc);
    },
    [saveRec],
  );

  const lockIn = useCallback(
    (hole: number, pick: string) => {
      const s = stateRef.current;
      if (!s) return;
      updateDoc((d) => (d.round === s.round && d.picks[hole] ? d : { ...d, round: s.round, picks: { ...(d.round === s.round ? d.picks : {}), [hole]: pick } }));
    },
    [updateDoc],
  );

  const ready = useCallback((hole: number) => updateDoc((d) => (d.ready >= hole ? d : { ...d, ready: hole })), [updateDoc]);

  const hostDo = useCallback(
    (fn: (s: LiveState, t: number) => LiveState) => {
      const s = stateRef.current;
      if (!s || !engineRef.current) return;
      commit(fn(s, Date.now()));
      runStep();
    },
    [commit, runStep],
  );

  return {
    rec,
    status,
    error,
    state,
    online,
    engine,
    now,
    join,
    lockIn,
    ready,
    hostStart: () => hostDo((s, t) => start(s, t)),
    hostAdvance: () => hostDo((s, t) => advance(s, t)),
    hostRematch: () =>
      hostDo((s, t) => {
        const lobby = toLobby(s);
        return canStart(lobby) ? start(lobby, t) : lobby;
      }),
    hostToLobby: () => hostDo((s) => toLobby(s)),
  };
}
