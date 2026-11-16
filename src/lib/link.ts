import { CATEGORY_BY_ID, COURSES, type CourseId } from './data';
import { cleanName, isDone, MAX_PLAYERS, type Game, type Hole, type Player } from './game';

/**
 * A share link carries the whole course plus every finished player's card, so there's no server.
 * Format: #/c/<base64url(JSON)>  where JSON = { v, i, c, h: [[cat, target]...], p: [[name, [pick...]]...] }
 */

interface Payload {
  v: 1;
  i: string;
  c: CourseId;
  h: [string, number][];
  p: [string, string[]][];
}

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeGame(game: Game): string {
  const payload: Payload = {
    v: 1,
    i: game.id,
    c: game.course,
    h: game.holes.map((h) => [h.cat, h.target]),
    p: game.players.filter((_, i) => isDone(game, i)).map((p) => [p.name, p.picks as string[]]),
  };
  return toB64Url(JSON.stringify(payload));
}

export function shareUrl(game: Game): string {
  const base = location.href.split('#')[0];
  return `${base}#/c/${encodeGame(game)}`;
}

/** Returns a partial game (no local fields) or null if the link is broken. */
export function decodeGame(code: string): LinkedGame | null {
  try {
    const raw = JSON.parse(fromB64Url(code)) as Payload;
    if (!raw || raw.v !== 1 || typeof raw.i !== 'string' || !/^[a-z0-9]{4,16}$/.test(raw.i)) return null;
    if (!Array.isArray(raw.h) || raw.h.length < 1 || raw.h.length > 18) return null;
    const holes: Hole[] = [];
    for (const h of raw.h) {
      if (!Array.isArray(h)) return null;
      const [cat, target] = h;
      const c = CATEGORY_BY_ID.get(cat);
      if (!c || !Number.isInteger(target) || target < 1 || target > c.size) return null;
      holes.push({ cat, target });
    }
    const players: Player[] = [];
    for (const p of Array.isArray(raw.p) ? raw.p.slice(0, MAX_PLAYERS * 2) : []) {
      if (!Array.isArray(p) || typeof p[0] !== 'string' || !Array.isArray(p[1]) || p[1].length !== holes.length) continue;
      const name = cleanName(p[0]);
      if (!name || players.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
      const picks = p[1].map((x, i) => {
        if (typeof x !== 'string') return '~';
        if (x.startsWith('~')) return '~' + x.slice(1, 60);
        return CATEGORY_BY_ID.get(holes[i].cat)!.byId.has(x) ? x : '~';
      });
      players.push({ name, picks });
    }
    const course = COURSES.some((c) => c.id === raw.c) ? raw.c : 'mixed';
    return { id: raw.i, course, holes, players };
  } catch {
    return null;
  }
}

export type LinkedGame = Pick<Game, 'id' | 'course' | 'holes' | 'players'>;
