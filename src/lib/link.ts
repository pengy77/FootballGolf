import { CATEGORY_BY_ID, COURSES, type CourseId } from './data';
import { isDone, MAX_LINK_PLAYERS, NAME_MAX, type Game, type Hole, type Player } from './game';

/**
 * A share link carries the whole course plus every finished player's card, so there's no server.
 * Format: #/c/2<scrambled base64url(JSON)>  where JSON = { v, i, c, h: [[cat, target]...], p: [[name, [pick...]]...] }
 * The scramble only stops answers being readable at a glance; it isn't security.
 */

interface Payload {
  v: 1;
  i: string;
  c: CourseId;
  h: [string, number][];
  p: [string, string[]][];
}

const KEY = [0x46, 0x6f, 0x6f, 0x74, 0x47, 0x6f, 0x6c, 0x66, 0x21, 0x9a, 0x3c];
const scramble = (bytes: Uint8Array) => bytes.map((b, i) => b ^ KEY[i % KEY.length] ^ (i * 7) % 256);

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function encodeGame(game: Game): string {
  const payload: Payload = {
    v: 1,
    i: game.id,
    c: game.course,
    h: game.holes.map((h) => [h.cat, h.target]),
    p: game.players
      .filter((_, i) => isDone(game, i))
      .slice(0, MAX_LINK_PLAYERS)
      .map((p) => [p.name, p.picks as string[]]),
  };
  return '2' + bytesToB64Url(scramble(new TextEncoder().encode(JSON.stringify(payload))));
}

export function shareUrl(game: Game): string {
  const base = location.href.split('#')[0];
  return `${base}#/c/${encodeGame(game)}`;
}

export type LinkedGame = Pick<Game, 'id' | 'course' | 'holes' | 'players'>;

/** Returns a partial game (no device-only fields) or null if the link is broken. */
export function decodeGame(code: string): LinkedGame | null {
  try {
    const bytes = code.startsWith('2') ? scramble(b64UrlToBytes(code.slice(1))) : b64UrlToBytes(code);
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as Payload;
    if (!raw || raw.v !== 1 || typeof raw.i !== 'string' || !/^[a-z0-9]{4,16}$/.test(raw.i)) return null;
    if (!Array.isArray(raw.h) || raw.h.length < 1 || raw.h.length > 18) return null;
    const holes: Hole[] = [];
    for (const h of raw.h) {
      if (!Array.isArray(h)) return null;
      const [cat, target] = h;
      const c = typeof cat === 'string' ? CATEGORY_BY_ID.get(cat) : undefined;
      if (!c || !Number.isInteger(target) || target < 1) return null;
      // A list may have shrunk since the link was made: keep the hole playable.
      holes.push({ cat, target: Math.min(target, c.size) });
    }
    const players: Player[] = [];
    for (const p of Array.isArray(raw.p) ? raw.p.slice(0, MAX_LINK_PLAYERS) : []) {
      if (!Array.isArray(p) || typeof p[0] !== 'string' || !Array.isArray(p[1]) || p[1].length !== holes.length) continue;
      const name = p[0].replace(/\s+/g, ' ').trim().slice(0, NAME_MAX + 4);
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
