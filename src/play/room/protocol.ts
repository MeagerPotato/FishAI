/**
 * What the `room` endpoint says, read defensively.
 *
 * The server is trusted to be honest and NOT trusted to be reachable, current, or the version
 * this bundle was built against — a browser tab left open across a deploy is talking to a
 * function that has moved on. So every field is checked on arrival rather than asserted: the
 * cost is one narrowing function, and the alternative is a `TypeError` deep inside a render
 * whose stack trace names a component rather than the response that was wrong.
 *
 * `Object.hasOwn` for the same reason it appears in the Edge Function: these keys come off the
 * network, and an inherited `Object.prototype` member must read as absent.
 */
import type { BookId, Card, PublicState, Seat, Team } from '../../../lib/engine/index.ts'

/** The room's seat view — public state plus exactly this player's own hand. */
export type RoomSeatView = PublicState & { seat: Seat; hand: Card[] }

export interface RoomPlayer {
  seat: Seat
  name: string
}

export interface RoomLobby {
  players: RoomPlayer[]
  hostSeat: Seat | null
}

export interface RoomSnapshot {
  roomId: string
  status: 'lobby' | 'playing' | 'finished'
  version: number
  /** The creator's pace, in milliseconds between resolved steps. */
  paceMs: number
  /** How much of that is left, measured on the server so no browser clock is involved. */
  paceRemainingMs: number
  lobby: RoomLobby
  /** This browser's seat, or null when it is only watching. */
  seat: Seat | null
  /** Present exactly when `seat` is, and a game is running. */
  view: RoomSeatView | null
  /** The table without a hand — what a spectator gets. */
  publicState: PublicState | null
}

/** A refusal that travelled: the server's code and the server's sentence. */
export interface RoomRefusal {
  code: string
  message: string
}

export type RoomResult = { ok: true; room: RoomSnapshot; code?: string } | { ok: false; error: RoomRefusal }

/** The moves a seated player can send. `seat` is deliberately absent — the token decides that. */
export type RoomMove =
  | { type: 'ask'; target: Seat; card: Card }
  | { type: 'claim'; book: BookId; assignments: Record<Card, Seat> }
  | { type: 'decline' }

/* ------------------------------------------------------------- narrowing --- */

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function get(source: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(source, key) ? source[key] : undefined
}

function isSeat(x: unknown): x is Seat {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 5
}

/**
 * The lobby, or an empty one. A malformed lobby degrades to "nobody is here yet" rather than to a
 * crash: it is the least wrong thing a client can say, and the seat count on screen will simply
 * be behind until the next push corrects it.
 */
function readLobby(x: unknown): RoomLobby {
  if (!isObject(x)) return { players: [], hostSeat: null }
  const raw = get(x, 'players')
  const players: RoomPlayer[] = Array.isArray(raw)
    ? raw.flatMap((entry) => {
        if (!isObject(entry)) return []
        const seat = get(entry, 'seat')
        const name = get(entry, 'name')
        return isSeat(seat) ? [{ seat, name: typeof name === 'string' ? name : `Player ${seat + 1}` }] : []
      })
    : []
  const host = get(x, 'hostSeat')
  return { players, hostSeat: isSeat(host) ? host : null }
}

function readStatus(x: unknown): RoomSnapshot['status'] {
  return x === 'playing' || x === 'finished' ? x : 'lobby'
}

function num(x: unknown, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback
}

/**
 * A response, narrowed. Anything that is not recognisably one becomes a refusal with a real
 * message, because "the server said something I could not read" is a thing a player is entitled
 * to be told rather than a blank screen.
 */
export function readResult(payload: unknown): RoomResult {
  if (!isObject(payload)) {
    return { ok: false, error: { code: 'BAD_RESPONSE', message: 'The server sent something that is not a response.' } }
  }

  if (get(payload, 'ok') !== true) {
    const err = get(payload, 'error')
    if (isObject(err)) {
      const code = get(err, 'code')
      const message = get(err, 'message')
      return {
        ok: false,
        error: {
          code: typeof code === 'string' ? code : 'REFUSED',
          message: typeof message === 'string' ? message : 'The server refused, without saying why.',
        },
      }
    }
    return { ok: false, error: { code: 'REFUSED', message: 'The server refused, without saying why.' } }
  }

  const room = get(payload, 'room')
  if (!isObject(room)) {
    return { ok: false, error: { code: 'BAD_RESPONSE', message: 'The server reported success but sent no room.' } }
  }

  const roomId = get(room, 'roomId')
  if (typeof roomId !== 'string') {
    return { ok: false, error: { code: 'BAD_RESPONSE', message: 'The server sent a room with no id.' } }
  }

  const seat = get(room, 'seat')
  const view = get(room, 'view')
  const publicState = get(room, 'publicState')
  const code = get(payload, 'code')

  const snapshot: RoomSnapshot = {
    roomId,
    status: readStatus(get(room, 'status')),
    version: num(get(room, 'version'), 0),
    paceMs: num(get(room, 'paceMs'), 0),
    paceRemainingMs: num(get(room, 'paceRemainingMs'), 0),
    lobby: readLobby(get(room, 'lobby')),
    seat: isSeat(seat) ? seat : null,
    // The view is handed on without a field-by-field audit of the engine's own projection: it is
    // produced by `seatView` in the function and consumed by components that already accept a
    // SeatView. What matters at this boundary is that a seat and a hand are actually there —
    // rendering a hand of `undefined` is the failure this check exists to prevent.
    view: isObject(view) && isSeat(get(view, 'seat')) && Array.isArray(get(view, 'hand'))
      ? (view as unknown as RoomSeatView)
      : null,
    publicState: isObject(publicState) ? (publicState as unknown as PublicState) : null,
  }

  return typeof code === 'string' ? { ok: true, room: snapshot, code } : { ok: true, room: snapshot }
}

/* ------------------------------------------------------------------ code --- */

/**
 * The join-code alphabet, mirrored from supabase/functions/room/code.ts.
 *
 * Deliberately duplicated rather than shared. The server's copy lives in a Deno bundle this
 * bundle cannot import, and the two serve different jobs: the server MINTS codes and this one
 * only tells a player, before a round trip, that what they typed cannot be a code. A drift would
 * cost a needlessly rejected keystroke, never a wrong game — the server normalizes and validates
 * every code it is given, and is the only opinion that decides whether a room opens.
 * tests/room/code.test.ts pins the two lists against each other.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const CODE_LENGTH = 6

/** What a typed code means: case-insensitive, and the spaces and dashes people add are noise. */
export function normalizeCode(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[\s-]+/g, '')
  if (cleaned.length !== CODE_LENGTH) return null
  for (const ch of cleaned) {
    if (!CODE_ALPHABET.includes(ch)) return null
  }
  return cleaned
}

/* ------------------------------------------------------------------ team --- */

/**
 * The two sides, named for people rather than for the engine.
 *
 * `seatTeam` in lib/engine/cards.ts is the authority on which seats are which — team = seat % 2,
 * so 0/2/4 against 1/3/5 — and nothing here re-derives that. These are labels for the two values
 * it returns, and the seats they correspond to are read from `teamSeats`, never listed again.
 */
export const TEAM_LABEL: Record<Team, string> = { 0: 'Evens', 1: 'Odds' }
