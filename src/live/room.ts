import type { CourseId } from '../lib/data';
import { newCourse, type Game, type Hole } from '../lib/game';

/**
 * Live rooms. One phone (the host, who created the room) runs the clock and the rules; everyone
 * else's phone renders the host's published state. Each player owns a small "doc" with their name,
 * picks and ready flags. Everything is pure so it can be unit tested without a network.
 */

export const GRACE_MS = 1500;
/** "Get ready" countdown before every hole's clock starts, so nobody's dropped into a running clock. */
export const READY_MS = 3000;
export const MIN_PLAYERS = 2;
export const MAX_ROOM_PLAYERS = 8;
export const TIMED_OUT = '!';

export type Phase = 'lobby' | 'hole' | 'reveal' | 'done';

export interface LivePlayer {
  id: string;
  name: string;
}

export interface LiveState {
  v: 1;
  hostId: string;
  course: CourseId;
  holeCount: number;
  turnMs: number;
  phase: Phase;
  /** Increments with every rematch, so stale picks from a previous round are ignored. */
  round: number;
  holes: Hole[];
  hole: number;
  players: LivePlayer[];
  /** Ids playing this round (online when it started). Late joiners wait for the next round. */
  inRound: string[];
  picks: Record<string, (string | null)[]>;
  /** Host-clock time the hole is shown (after the get-ready countdown). */
  opensAt?: number;
  /** Host-clock time the current hole closes, or null while paused. */
  deadline: number | null;
  /** Time left on a paused clock. */
  remainingMs: number | null;
  ready: string[];
  online: string[];
  sentAt: number;
}

/** What each player publishes about themselves. */
export interface PlayerDoc {
  v: 1;
  id: string;
  name: string;
  round: number;
  /** hole index -> pick for the current round */
  picks: Record<number, string>;
  /** Highest hole index this player has tapped "ready" after (-1 = none). */
  ready: number;
  /** Bumped on every change, so the newest copy wins when the same player has two tabs open. */
  seq?: number;
}

export function newRoom(opts: { hostId: string; hostName: string; course: CourseId; holeCount: number; turnMs: number; now: number }): LiveState {
  return {
    v: 1,
    hostId: opts.hostId,
    course: opts.course,
    holeCount: opts.holeCount,
    turnMs: opts.turnMs,
    phase: 'lobby',
    round: 1,
    holes: [],
    hole: 0,
    players: [{ id: opts.hostId, name: opts.hostName }],
    inRound: [],
    picks: {},
    deadline: null,
    remainingMs: null,
    ready: [],
    online: [opts.hostId],
    sentAt: opts.now,
  };
}

export function newDoc(id: string, name: string, round: number): PlayerDoc {
  return { v: 1, id, name, round, picks: {}, ready: -1, seq: 0 };
}

const uniqueName = (players: LivePlayer[], id: string, name: string) => {
  let out = name;
  for (let n = 2; players.some((p) => p.id !== id && p.name.toLowerCase() === out.toLowerCase()); n++) out = `${name} (${n})`;
  return out;
};

export function onlineInRound(s: LiveState): string[] {
  return s.inRound.filter((id) => s.online.includes(id));
}

export function canStart(s: LiveState): boolean {
  return s.phase === 'lobby' && s.players.filter((p) => s.online.includes(p.id)).length >= MIN_PLAYERS;
}

/** Host command: tee off a new round with everyone who's online. */
export function start(s: LiveState, now: number, rand: () => number = Math.random): LiveState {
  if (!canStart(s)) return s;
  const holes = newCourse(s.course, s.holeCount, rand);
  const inRound = s.players.filter((p) => s.online.includes(p.id)).slice(0, MAX_ROOM_PLAYERS).map((p) => p.id);
  return {
    ...s,
    phase: 'hole',
    holes,
    hole: 0,
    inRound,
    picks: Object.fromEntries(inRound.map((id) => [id, holes.map(() => null)])),
    opensAt: now + READY_MS,
    deadline: now + READY_MS + s.turnMs,
    remainingMs: null,
    ready: [],
  };
}

/** Host command: skip waiting during a reveal. */
export function advance(s: LiveState, now: number): LiveState {
  if (s.phase !== 'reveal') return s;
  if (s.hole + 1 >= s.holes.length) return { ...s, phase: 'done', deadline: null, remainingMs: null, ready: [] };
  return { ...s, phase: 'hole', hole: s.hole + 1, opensAt: now + READY_MS, deadline: now + READY_MS + s.turnMs, remainingMs: null, ready: [] };
}

/** Host command: back to the lobby for a new round (rematch, or abandoning a stuck one). Anyone who's gone drops off. */
export function toLobby(s: LiveState): LiveState {
  const players = s.players.filter((p) => p.id === s.hostId || s.online.includes(p.id));
  return { ...s, phase: 'lobby', round: s.round + 1, players, holes: [], hole: 0, inRound: [], picks: {}, deadline: null, remainingMs: null, ready: [] };
}

function closeHole(s: LiveState): LiveState {
  const picks = { ...s.picks };
  for (const id of s.inRound) {
    const row = [...(picks[id] ?? s.holes.map(() => null))];
    if (row[s.hole] == null) row[s.hole] = TIMED_OUT;
    picks[id] = row;
  }
  return { ...s, picks, phase: 'reveal', deadline: null, remainingMs: null, ready: [] };
}

/**
 * The host's rules engine. Folds in players' docs and who's online, runs the shot clock,
 * pauses when fewer than 2 players are connected, voids picks that miss the clock.
 */
export function step(prev: LiveState, docs: Record<string, PlayerDoc>, online: Set<string>, now: number): LiveState {
  let s: LiveState = { ...prev };

  // Roster: everyone who's here, plus anyone in the current round even if their phone has dropped.
  // In the lobby only connected players count, so people who left don't linger or fill the room.
  const here = (id: string) => id === s.hostId || online.has(id);
  let players = s.players.filter((p) => here(p.id) || (s.phase !== 'lobby' && s.inRound.includes(p.id)));
  for (const d of Object.values(docs)) {
    if (!d?.name) continue;
    const existing = players.find((p) => p.id === d.id);
    if (!existing && (players.length >= MAX_ROOM_PLAYERS || !here(d.id))) continue;
    const name = uniqueName(players, d.id, d.name);
    if (!existing) players = [...players, { id: d.id, name }];
    else if (existing.name !== name && d.id !== s.hostId) players = players.map((p) => (p.id === d.id ? { ...p, name } : p));
  }
  s.players = players;
  s.online = players.map((p) => p.id).filter(here);

  if (s.phase === 'hole') {
    // Record picks that arrived in time.
    const open = s.deadline === null || now <= s.deadline + GRACE_MS;
    if (open) {
      let picks = s.picks;
      for (const id of s.inRound) {
        const d = docs[id];
        const pick = d && d.round === s.round ? d.picks[s.hole] : undefined;
        if (typeof pick === 'string' && pick && picks[id]?.[s.hole] == null) {
          const row = [...(picks[id] ?? s.holes.map(() => null))];
          row[s.hole] = pick.slice(0, 80);
          picks = { ...picks, [id]: row };
        }
      }
      s.picks = picks;
    }
    if (s.inRound.every((id) => s.picks[id]?.[s.hole] != null)) return closeHole(s);

    // Shot clock: if someone who still has to pick has dropped out and fewer than 2 are connected,
    // hold the clock till they're back. (Someone who's already locked in can leave the app freely.)
    const stranded = s.inRound.some((id) => !s.online.includes(id) && s.picks[id]?.[s.hole] == null);
    const enough = !stranded || onlineInRound(s).length >= MIN_PLAYERS;
    if (s.deadline !== null && !enough) {
      s.remainingMs = Math.max(0, s.deadline - now);
      s.deadline = null;
    } else if (s.deadline === null && enough) {
      s.deadline = now + Math.max(s.remainingMs ?? s.turnMs, 10_000);
      s.remainingMs = null;
    }
    if (s.deadline !== null && now > s.deadline + GRACE_MS) return closeHole(s);
  }

  if (s.phase === 'reveal') {
    s.ready = s.inRound.filter((id) => {
      const d = docs[id];
      return d && d.round === s.round && d.ready >= s.hole;
    });
    const waitingOn = onlineInRound(s).filter((id) => !s.ready.includes(id));
    if (onlineInRound(s).length > 0 && waitingOn.length === 0) return advance(s, now);
  }

  return s;
}

/** Comparable form (ignores the publish timestamp). */
export function fingerprint(s: LiveState): string {
  return JSON.stringify({ ...s, sentAt: 0 });
}

export function isPaused(s: LiveState): boolean {
  return s.phase === 'hole' && s.deadline === null;
}

/** The round as an ordinary Game, so the existing reveal/scorecard/results components work. */
export function asGame(s: LiveState, roomId: string, meId: string | null): Game {
  const ids = s.inRound;
  const meIdx = meId ? ids.indexOf(meId) : -1;
  return {
    id: `${roomId}r${s.round}`.slice(0, 16),
    mode: 'challenge',
    course: s.course,
    holes: s.holes,
    players: ids.map((id) => ({
      name: s.players.find((p) => p.id === id)?.name ?? 'Player',
      picks: s.holes.map((_, i) => s.picks[id]?.[i] ?? null),
    })),
    me: meIdx >= 0 ? meIdx : null,
    revealed: s.phase === 'done' ? s.holes.length : s.hole,
    seen: s.phase === 'done' ? ids.map((id) => s.players.find((p) => p.id === id)?.name ?? '') : [],
    createdAt: s.sentAt,
    updatedAt: s.sentAt,
  };
}

/** Sanity-check a decrypted state from the network before trusting it. */
export function isLiveState(x: unknown): x is LiveState {
  const s = x as LiveState;
  return (
    !!s &&
    s.v === 1 &&
    typeof s.hostId === 'string' &&
    ['lobby', 'hole', 'reveal', 'done'].includes(s.phase) &&
    Array.isArray(s.players) &&
    Array.isArray(s.holes) &&
    Array.isArray(s.inRound) &&
    typeof s.picks === 'object' &&
    typeof s.turnMs === 'number'
  );
}

export function isPlayerDoc(x: unknown): x is PlayerDoc {
  const d = x as PlayerDoc;
  return !!d && d.v === 1 && typeof d.id === 'string' && typeof d.name === 'string' && typeof d.round === 'number' && typeof d.picks === 'object';
}
