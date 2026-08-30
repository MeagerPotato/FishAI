/**
 * The wire, and the border it is crossed at.
 *
 * Every value in this file arrives from a browser nobody controls, so nothing here trusts a
 * shape it was handed. The rule throughout is RECONSTRUCT, never forward: a `GameAction` that
 * reaches the reducer was built here out of individually checked primitives, so a body carrying
 * extra keys, a prototype-polluting `__proto__`, a seat of `4.5`, or a card of `'constructor'`
 * cannot become part of one. Passing the parsed JSON through and letting the reducer sort it out
 * would have worked for every case the reducer happens to check and silently for the ones it
 * does not.
 *
 * `Object.hasOwn` rather than `in` or a bare property read, for the same reason `deckFor` uses it
 * (lib/engine/cards.ts): a JSON body is untrusted data, and an inherited `Object.prototype` key
 * must read as absent rather than as a function.
 */
import type { BookId, Card, GameAction, Seat, Team } from './engine/types.ts'
import { allBooks, isCard } from './engine/cards.ts'
import { us54Config } from './engine/reduce.ts'

/** A room plays the 54-card US student rule set — the variant the solo table runs. */
export const ROOM_CONFIG = us54Config

/** Six seats or no deal: 54 cards divide evenly among 6, and not among 4 or 5. */
export const SEAT_COUNT = 6

/** What a room is called in `room_private.seats` — a seat, who holds it, and what to call them. */
export interface SeatRecord {
  seat: Seat
  /** SHA-256 of the player's own token. The token itself never reaches the database. */
  tokenHash: string
  name: string
}

/** The public half of a lobby, stored on `rooms.lobby`, which anon may read. */
export interface LobbyState {
  players: { seat: Seat; name: string }[]
  /** Whose pace setting the room runs at — public, because a player may want to ask them. */
  hostSeat: Seat | null
}

export type Json = Record<string, unknown>

export function isObject(x: unknown): x is Json {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

export function str(body: Json, key: string): string | null {
  if (!Object.hasOwn(body, key)) return null
  const v = body[key]
  return typeof v === 'string' ? v : null
}

export function int(body: Json, key: string): number | null {
  if (!Object.hasOwn(body, key)) return null
  const v = body[key]
  return typeof v === 'number' && Number.isInteger(v) ? v : null
}

export function isSeat(x: unknown): x is Seat {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < SEAT_COUNT
}

export function isTeam(x: unknown): x is Team {
  return x === 0 || x === 1
}

/** A v4-shaped uuid, checked before it is used as a lookup key. */
export function isUuid(x: unknown): x is string {
  return typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)
}

/**
 * A player token: 32 bytes, hex, generated in the browser. Length is checked because a token is
 * the only thing standing between a reload and someone else's hand — a one-character "token"
 * must be refused at the door rather than stored and later matched.
 */
export function isToken(x: unknown): x is string {
  return typeof x === 'string' && /^[0-9a-f]{64}$/.test(x)
}

/**
 * What a player is called at this table. Names are typed by strangers and rendered to five other
 * people, so: no control characters (which can reorder a line visually), no runs of whitespace,
 * and a hard cap that is a length rather than an ellipsis — the seat card has room for 24.
 * An empty name is not an error, it is simply a player who did not give one.
 */
export function cleanName(raw: string | null, seat: Seat): string {
  // Filtered by code point rather than by a regex character class: these ranges are mostly
  // INVISIBLE characters, and a regex literal containing them is a line no reviewer can check.
  const visible = [...(raw ?? '')]
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0
      if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return false // C0 and C1 controls
      if (c >= 0x200b && c <= 0x200f) return false // zero-width spaces and directional marks
      if (c >= 0x202a && c <= 0x202e) return false // bidi embedding and override
      if (c >= 0x2066 && c <= 0x2069) return false // bidi isolates
      return true
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
  return visible.length > 0 ? visible : `Player ${seat + 1}`
}

/**
 * The pace the table advances at, in milliseconds — the creator's setting, clamped to what a
 * room can actually run. Zero is allowed and means "as fast as people can click"; the ceiling is
 * 30s, past which a room reads as broken rather than deliberate.
 */
export const PACE_MIN_MS = 0
export const PACE_MAX_MS = 30_000
export const PACE_DEFAULT_MS = 3_000

export function cleanPace(raw: number | null): number {
  if (raw === null) return PACE_DEFAULT_MS
  return Math.min(PACE_MAX_MS, Math.max(PACE_MIN_MS, raw))
}

/**
 * Rebuild a `GameAction` from untrusted JSON, or explain why it is not one.
 *
 * `seat` is NOT taken from the body — the caller passes the seat it resolved from the player's
 * token, so a body claiming to be another seat cannot become an action at all. Every other field
 * is validated against the engine's own vocabulary (`isCard` against the room's deck, `allBooks`
 * against the room's set list) rather than against a second copy of those lists kept here.
 */
export function parseAction(body: Json, seat: Seat): { action: GameAction } | { error: string } {
  const type = str(body, 'type')

  if (type === 'ask') {
    const target = body.target
    const card = body.card
    if (!isSeat(target)) return { error: 'ask.target is not a seat' }
    if (typeof card !== 'string' || !isCard(card, ROOM_CONFIG)) {
      return { error: `ask.card is not a card of this deck` }
    }
    return { action: { type: 'ask', seat, target, card } }
  }

  if (type === 'claim') {
    const book = body.book
    const books: readonly BookId[] = allBooks(ROOM_CONFIG)
    if (typeof book !== 'string' || !books.includes(book as BookId)) {
      return { error: 'claim.book is not a set of this rule set' }
    }
    const raw = body.assignments
    if (!isObject(raw)) return { error: 'claim.assignments is missing' }

    // Rebuilt entry by entry. `Object.entries` walks own enumerable keys only, so an inherited
    // key cannot arrive as a card, and each one still has to pass `isCard` to be kept.
    const assignments: Record<string, Seat> = {}
    for (const [card, holder] of Object.entries(raw)) {
      if (!isCard(card, ROOM_CONFIG)) return { error: `claim.assignments names ${card}, not a card` }
      if (!isSeat(holder)) return { error: `claim.assignments places ${card} at no seat` }
      assignments[card] = holder
    }
    return {
      action: { type: 'claim', seat, book: book as BookId, assignments: assignments as Record<Card, Seat> },
    }
  }

  if (type === 'pass' || type === 'designate') {
    const to = body.to
    if (!isSeat(to)) return { error: `${type}.to is not a seat` }
    return { action: { type, seat, to } }
  }

  if (type === 'decline') return { action: { type: 'decline', seat } }

  return { error: `${String(type)} is not an action this game has` }
}
