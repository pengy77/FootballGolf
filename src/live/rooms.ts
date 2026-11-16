import { randomId } from '../lib/game';
import { isLiveState, isPlayerDoc, type LiveState, type PlayerDoc } from './room';

/** This phone's memory of the live rooms it has been in. */
export interface RoomRecord {
  id: string;
  secret: string;
  playerId: string;
  /** This phone created the room and runs its clock. */
  host: boolean;
  /** '' until they've joined. */
  name: string;
  doc: PlayerDoc | null;
  /** Host: the authoritative state. Everyone else: the last state seen. */
  state: LiveState | null;
  updatedAt: number;
}

const KEY = 'football-golf:rooms';
const MAX_ROOMS = 30;

export const ROOM_ID = /^[a-z0-9]{8,16}$/;
export const SECRET = /^[A-Za-z0-9_-]{22}$/;

export function parseRoomCode(code: string): { id: string; secret: string } | null {
  const [id, secret, ...rest] = code.split('.');
  if (rest.length || !id || !secret || !ROOM_ID.test(id) || !SECRET.test(secret)) return null;
  return { id, secret };
}

export const roomCode = (r: { id: string; secret: string }) => `${r.id}.${r.secret}`;

export function roomUrl(r: { id: string; secret: string }): string {
  return `${location.origin}${location.pathname}#/r/${roomCode(r)}`;
}

export function loadRooms(): Record<string, RoomRecord> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, RoomRecord>;
    const out: Record<string, RoomRecord> = {};
    for (const [id, r] of Object.entries(raw ?? {})) {
      if (!r || typeof r !== 'object' || !ROOM_ID.test(id) || !SECRET.test(r.secret) || typeof r.playerId !== 'string') continue;
      out[id] = {
        ...r,
        id,
        name: typeof r.name === 'string' ? r.name : '',
        doc: isPlayerDoc(r.doc) ? r.doc : null,
        state: isLiveState(r.state) ? r.state : null,
        updatedAt: Number(r.updatedAt) || 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function getRoom(id: string): RoomRecord | undefined {
  const all = loadRooms();
  return Object.hasOwn(all, id) ? all[id] : undefined;
}

export function putRoom(rec: RoomRecord): void {
  try {
    const all = { ...loadRooms(), [rec.id]: { ...rec, updatedAt: Date.now() } };
    const keep = Object.values(all)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ROOMS);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep.map((r) => [r.id, r]))));
  } catch {
    /* storage full or private mode: the room still works while the page is open */
  }
}

export function forgetRoom(id: string): void {
  try {
    const all = loadRooms();
    delete all[id];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** A fresh record for someone opening an invite link. */
export function guestRecord(id: string, secret: string): RoomRecord {
  return { id, secret, playerId: randomId(10), host: false, name: '', doc: null, state: null, updatedAt: Date.now() };
}

export function newRoomIds(): { id: string; playerId: string } {
  return { id: randomId(12), playerId: randomId(10) };
}
