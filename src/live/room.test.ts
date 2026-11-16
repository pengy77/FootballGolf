import { describe, expect, it } from 'vitest';
import { holeResult, obStrokes, playerTotal } from '../lib/game';
import { CATEGORY_BY_ID } from '../lib/data';
import { GRACE_MS, READY_MS, TIMED_OUT, asGame, canStart, newDoc, newRoom, start, step, toLobby, type LiveState, type PlayerDoc } from './room';
import { parseRoomCode } from './rooms';

const T0 = 1_000_000;
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function room(turnMs = 60_000) {
  return newRoom({ hostId: 'host', hostName: 'Hanif', course: 'mixed', holeCount: 3, turnMs, now: T0 });
}

const docs = (...d: PlayerDoc[]) => Object.fromEntries(d.map((x) => [x.id, x]));
const on = (...ids: string[]) => new Set(ids);

function lobbyWithJay(): { s: LiveState; host: PlayerDoc; jay: PlayerDoc } {
  const host = newDoc('host', 'Hanif', 1);
  const jay = newDoc('jay', 'Jay', 1);
  const s = step(room(), docs(host, jay), on('host', 'jay'), T0);
  return { s, host, jay };
}

describe('live room', () => {
  it('needs two players online before it can start', () => {
    const solo = step(room(), docs(newDoc('host', 'Hanif', 1)), on('host'), T0);
    expect(canStart(solo)).toBe(false);
    expect(start(solo, T0)).toBe(solo);

    // Jay has joined but his phone is closed: he isn't counted, and can't be started with.
    const away = step(room(), docs(newDoc('host', 'Hanif', 1), newDoc('jay', 'Jay', 1)), on('host'), T0);
    expect(away.players.map((p) => p.name)).toEqual(['Hanif']);
    expect(canStart(away)).toBe(false);

    const { s } = lobbyWithJay();
    expect(canStart(s)).toBe(true);
    const go = start(s, T0, seeded(7));
    expect(go.phase).toBe('hole');
    expect(go.holes).toHaveLength(3);
    expect(go.inRound).toEqual(['host', 'jay']);
    expect(go.opensAt).toBe(T0 + READY_MS);
    expect(go.deadline).toBe(T0 + READY_MS + 60_000);
  });

  it('closes the hole as soon as everyone has locked in', () => {
    const { s, host, jay } = lobbyWithJay();
    let g = start(s, T0, seeded(3));
    g = step(g, docs({ ...host, picks: { 0: '~Wembley' } }, jay), on('host', 'jay'), T0 + 5000);
    expect(g.phase).toBe('hole');
    expect(g.picks.host[0]).toBe('~Wembley');
    g = step(g, docs({ ...host, picks: { 0: '~Wembley' } }, { ...jay, picks: { 0: '~Anfield' } }), on('host', 'jay'), T0 + 9000);
    expect(g.phase).toBe('reveal');
    expect(g.picks.jay[0]).toBe('~Anfield');
  });

  it('voids a pick that misses the shot clock: timed out costs the same as out of bounds', () => {
    const { s, host, jay } = lobbyWithJay();
    let g = start(s, T0, seeded(5));
    const d = docs({ ...host, picks: { 0: '~x' } }, jay);
    g = step(g, d, on('host', 'jay'), T0 + READY_MS + 60_000 + GRACE_MS); // inside the grace window
    expect(g.phase).toBe('hole');
    g = step(g, d, on('host', 'jay'), T0 + READY_MS + 60_000 + GRACE_MS + 1);
    expect(g.phase).toBe('reveal');
    expect(g.picks.jay[0]).toBe(TIMED_OUT);
    // A pick that arrives after the hole closed doesn't count.
    g = step(g, docs({ ...host, picks: { 0: '~x' } }, { ...jay, picks: { 0: '~late' } }), on('host', 'jay'), T0 + 70_000);
    expect(g.picks.jay[0]).toBe(TIMED_OUT);

    const r = holeResult(g.holes[0], TIMED_OUT);
    expect(r.timedOut).toBe(true);
    expect(r.verdict?.label).toBe('Out of time');
    expect(r.strokes).toBe(obStrokes(CATEGORY_BY_ID.get(g.holes[0].cat)!, g.holes[0].target));
  });

  it('pauses the clock when a player drops out, and gives at least 10 seconds when they are back', () => {
    const { s, host, jay } = lobbyWithJay();
    let g = start(s, T0, seeded(9));
    g = step(g, docs(host, jay), on('host'), T0 + READY_MS + 55_000); // Jay's phone went to sleep with 5s left
    expect(g.deadline).toBeNull();
    expect(g.remainingMs).toBe(5000);
    g = step(g, docs(host, jay), on('host'), T0 + 300_000); // ages later: still paused, nobody timed out
    expect(g.phase).toBe('hole');
    g = step(g, docs(host, jay), on('host', 'jay'), T0 + 301_000);
    expect(g.deadline).toBe(T0 + 311_000);
    expect(g.remainingMs).toBeNull();
  });

  it("doesn't pause for a player who has already locked in", () => {
    const { s, host, jay } = lobbyWithJay();
    let g = start(s, T0, seeded(4));
    // Jay locks in at 3s, then switches to WhatsApp.
    g = step(g, docs(host, { ...jay, picks: { 0: '~x' } }), on('host', 'jay'), T0 + 3000);
    g = step(g, docs(host, { ...jay, picks: { 0: '~x' } }), on('host'), T0 + 4000);
    expect(g.deadline).toBe(T0 + READY_MS + 60_000);
    g = step(g, docs(host, { ...jay, picks: { 0: '~x' } }), on('host'), T0 + READY_MS + 62_000);
    expect(g.phase).toBe('reveal');
    expect(g.picks.host[0]).toBe(TIMED_OUT);
  });

  it('players who left drop out of the lobby, and their names are free again', () => {
    const { s, host, jay } = lobbyWithJay();
    const g = step(start(s, T0, seeded(6)), docs(host, jay), on('host'), T0 + 1000);
    expect(g.players.map((p) => p.id)).toEqual(['host', 'jay']); // still in the round
    const lobby = toLobby(g);
    expect(lobby.players.map((p) => p.id)).toEqual(['host']);
    // Jay comes back from another browser with a new id but the same name.
    const back = step(lobby, docs(host, jay, newDoc('jay2', 'Jay', 2)), on('host', 'jay2'), T0 + 2000);
    expect(back.players.map((p) => p.name)).toEqual(['Hanif', 'Jay']);
  });

  it('with three players, one dropping out does not stop the clock', () => {
    const host = newDoc('host', 'Hanif', 1);
    const jay = newDoc('jay', 'Jay', 1);
    const sam = newDoc('sam', 'Sam', 1);
    let g = step(room(), docs(host, jay, sam), on('host', 'jay', 'sam'), T0);
    g = start(g, T0, seeded(2));
    g = step(g, docs({ ...host, picks: { 0: '~a' } }, { ...jay, picks: { 0: '~b' } }, sam), on('host', 'jay'), T0 + 10_000);
    expect(g.deadline).toBe(T0 + READY_MS + 60_000);
    g = step(g, docs({ ...host, picks: { 0: '~a' } }, { ...jay, picks: { 0: '~b' } }, sam), on('host', 'jay'), T0 + READY_MS + 62_000);
    expect(g.phase).toBe('reveal');
    expect(g.picks.sam[0]).toBe(TIMED_OUT);
  });

  it('moves on when everyone online is ready, and finishes after the last hole', () => {
    const { s, host, jay } = lobbyWithJay();
    let g = start(s, T0, seeded(11));
    for (let hole = 0; hole < 3; hole++) {
      const picked = { ...Object.fromEntries([...Array(hole + 1)].map((_, i) => [i, '~x'])) };
      g = step(g, docs({ ...host, picks: picked, ready: hole - 1 }, { ...jay, picks: picked, ready: hole - 1 }), on('host', 'jay'), T0);
      expect(g.phase).toBe('reveal');
      g = step(g, docs({ ...host, picks: picked, ready: hole }, { ...jay, picks: picked, ready: hole - 1 }), on('host', 'jay'), T0);
      expect(g.phase).toBe('reveal'); // waiting for Jay
      expect(g.ready).toEqual(['host']);
      // Jay's phone dies: don't wait for him.
      g = step(g, docs({ ...host, picks: picked, ready: hole }, { ...jay, picks: picked, ready: hole - 1 }), on('host'), T0);
      expect(g.phase).toBe(hole < 2 ? 'hole' : 'done');
      if (hole < 2) expect(g.hole).toBe(hole + 1);
    }
    const game = asGame(g, 'room1', 'jay');
    expect(game.me).toBe(1);
    expect(game.players.map((p) => p.name)).toEqual(['Hanif', 'Jay']);
    expect(playerTotal(game, 0)).toBe(playerTotal(game, 1));
  });

  it('late joiners watch, then play the rematch; stale picks from the last round are ignored', () => {
    const { s, host, jay } = lobbyWithJay();
    let g = start(s, T0, seeded(13));
    g = step(g, docs(host, jay, newDoc('sam', 'Sam', 1)), on('host', 'jay', 'sam'), T0 + 1000);
    expect(g.players.map((p) => p.id)).toEqual(['host', 'jay', 'sam']);
    expect(g.inRound).toEqual(['host', 'jay']);

    const lobby = toLobby(g);
    expect(lobby.round).toBe(2);
    let r2 = start(lobby, T0 + 2000, seeded(17));
    expect(r2.inRound).toEqual(['host', 'jay', 'sam']);
    // Jay's doc still says round 1 with a pick for hole 0: it mustn't count.
    r2 = step(r2, docs(host, { ...jay, picks: { 0: '~old' } }, newDoc('sam', 'Sam', 2)), on('host', 'jay', 'sam'), T0 + 3000);
    expect(r2.picks.jay[0]).toBeNull();
  });

  it('keeps names unique and caps the room', () => {
    const extra = Array.from({ length: 10 }, (_, i) => newDoc(`p${i}`, i === 0 ? 'hanif' : `P${i}`, 1));
    const g = step(room(), docs(newDoc('host', 'Hanif', 1), ...extra), on('host', ...extra.map((d) => d.id)), T0);
    expect(g.players).toHaveLength(8);
    expect(g.players[1].name).toBe('hanif (2)');
  });

  it('parses room links', () => {
    expect(parseRoomCode('abcdefgh2345.AAAAAAAAAAAAAAAAAAAAAA')).toEqual({ id: 'abcdefgh2345', secret: 'AAAAAAAAAAAAAAAAAAAAAA' });
    expect(parseRoomCode('abc.AAAAAAAAAAAAAAAAAAAAAA')).toBeNull();
    expect(parseRoomCode('abcdefgh2345')).toBeNull();
    expect(parseRoomCode('abcdefgh2345.short')).toBeNull();
  });
});
