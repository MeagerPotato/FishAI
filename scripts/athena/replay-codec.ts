/**
 * replay-codec.ts: the reference implementation of ATHENA P0's replay oracle (ATHENA.md §4.2, §4.6 G0a (i)).
 *
 * The specification is `scripts/athena/replay-format.md` (format `athena-replay-1`). This module is what the
 * emitter writes with, what the reference self-check replays with, and what the tests pin. A port (the Rust crate
 * `athena-env/`) implements the specification, not this file; `tests/athena/replay-codec.test.ts` asserts the
 * specification's test vectors against this file, so the two cannot drift silently.
 *
 * It imports the rules core only (`reduce`, `helpers`, `cards`, `views`, `rng`), never the bots, so the checker and
 * the tests load in milliseconds. Nothing here changes the engine: every rule is the reference's own function.
 *
 * What is hashed is the state's MEANING, never the TypeScript object (ATHENA.md §4.1 item 14): fixed-width
 * integers in a fixed field order, cards and sets by canonical index, maps by the set's canonical card order. A
 * state that carries the key `declareWindow: undefined` encodes exactly like one without the key.
 */
import type {
  BookId,
  BookResult,
  Card,
  DeclareWindow,
  ErrorCode,
  GameAction,
  GameState,
  Phase,
  PublicEvent,
  PublicState,
  ReduceResult,
  RulesConfig,
  Seat,
} from '../../lib/engine/types.ts'
import { newGame, reduce as referenceReduce, us54Config } from '../../lib/engine/reduce.ts'
import { legalActionsSummary, legalAsks } from '../../lib/engine/helpers.ts'
import { allBooks, allCards, bookCards } from '../../lib/engine/cards.ts'
import { seatView } from '../../lib/engine/views.ts'
import { randInt, rngFromSeed } from '../../lib/engine/rng.ts'

/* ------------------------------------------------------------------ constants --- */

/** The format tag. It is the first column of every corpus line and the first field of every chain header. */
export const FORMAT = 'athena-replay-1'
/** The harness's step cap (ATHENA.md §4.1 item 13): `duplicate-pairs.mjs` and `bench-decide.mjs` use 6,000. */
export const STEP_CAP = 6000
/** Probes are taken at every state S_t with t % PROBE_EVERY === 0 (t < T), and at the last state S_T. */
export const PROBE_EVERY = 10
export const PROBES_PER_STATE = 4
/** The byte for "no value": an unresolved set's fields, a closed window's fields, a resolved card's holder. */
export const NONE = 0xff
/** The view's rules byte: `us54`, every toggle off. The only rule set a port implements (§4.1 item 15). */
export const RULES_ID_US54 = 1

/** The 54 cards in canonical order: suit-major C, D, H, S; ranks 2..A with the 8; then XR, XB. */
export const CARDS: readonly Card[] = allCards(us54Config)
/** The 9 sets in canonical order: LOW-C..LOW-S, HIGH-C..HIGH-S, EIGHTS. */
export const SETS: readonly BookId[] = allBooks(us54Config)
if (CARDS.length !== 54 || SETS.length !== 9) throw new Error('replay-codec: the us54 deck is not 54 cards in 9 sets')

const CARD_INDEX: ReadonlyMap<string, number> = new Map(CARDS.map((c, i) => [c, i]))
const SET_INDEX: ReadonlyMap<string, number> = new Map(SETS.map((b, i) => [b, i]))
/** Each set's six cards, in the set's canonical order (EIGHTS: 8C, 8D, 8H, 8S, XR, XB). */
export const SET_CARDS: readonly (readonly Card[])[] = SETS.map((b) => bookCards(b, us54Config))
/** The set index of every card index. */
export const SET_OF_CARD: readonly number[] = CARDS.map((c) => SET_CARDS.findIndex((cs) => cs.includes(c)))

/** Error codes in the fixed order of `lib/engine/types.ts`. A refused verdict byte is 1 + the index. */
export const ERROR_CODES: readonly ErrorCode[] = [
  'WRONG_PHASE',
  'NOT_YOUR_TURN',
  'ASKER_OUT',
  'TARGET_TEAMMATE',
  'TARGET_SELF',
  'TARGET_OUT',
  'NO_CARD_OF_BOOK',
  'ASKING_OWN_CARD',
  'INVALID_CARD',
  'BOOK_RESOLVED',
  'BAD_ASSIGNMENTS',
  'ASSIGN_OPPONENT',
  'PASS_TARGET_OUT',
  'PASS_TARGET_NOT_TEAMMATE',
  'DESIGNATE_TARGET_INVALID',
  'DECLARE_WINDOW_OPEN',
  'NO_DECLARE_WINDOW',
  'NOT_YOUR_OPTION',
  'MUST_DECLARE',
  'INVALID_ACTION',
]

/** L_t's kind bits. */
export const KIND_ASK = 1
export const KIND_CLAIM = 2
export const KIND_PASS = 4
export const KIND_DECLINE = 8

/** Action and event tags. */
export const ACTION_TAG = { ask: 1, claim: 2, pass: 3, decline: 4 } as const
export const EVENT_TAG = { game_started: 0, ask: 1, claim: 2, pass: 3, player_out: 4, game_over: 5 } as const

export function cardIndex(c: string): number {
  const i = CARD_INDEX.get(c)
  if (i === undefined) throw new Error(`replay-codec: ${String(c)} is not a us54 card`)
  return i
}

export function setIndex(b: string): number {
  const i = SET_INDEX.get(b)
  if (i === undefined) throw new Error(`replay-codec: ${String(b)} is not a us54 set`)
  return i
}

function seatByte(x: unknown, what: string): number {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x > 5)
    throw new Error(`replay-codec: ${what} ${String(x)} is not a seat`)
  return x
}

/* --------------------------------------------------------------------- digest --- */

/**
 * The house digest over byte strings: `tests/bots/action-digest.ts`'s `ActionDigest`, element for element.
 *
 * `push(bytes)` is exactly `ActionDigest.push(s)` where `s` is the string whose UTF-16 code units are the bytes
 * (a Latin-1 string). The element text is the element's 1-based ordinal in ASCII decimal, a 0x00 byte, the bytes,
 * and a 0x01 byte; each unit is xor-multiplied into two 32-bit lanes with `Math.imul`. `hex()` is the same
 * avalanche and cross-mix. The test suite checks the equivalence against `ActionDigest` itself.
 */
export class ByteDigest {
  private h1 = 0xdeadbeef
  private h2 = 0x41c6ce57
  private n = 0

  private mix(c: number): void {
    this.h1 = Math.imul(this.h1 ^ c, 2654435761)
    this.h2 = Math.imul(this.h2 ^ c, 1597334677)
  }

  private open(): void {
    this.n++
    const ordinal = String(this.n)
    for (let i = 0; i < ordinal.length; i++) this.mix(ordinal.charCodeAt(i))
    this.mix(0x00)
  }

  push(bytes: ArrayLike<number>, length: number = bytes.length): this {
    this.open()
    let h1 = this.h1
    let h2 = this.h2
    for (let i = 0; i < length; i++) {
      const c = bytes[i]
      h1 = Math.imul(h1 ^ c, 2654435761)
      h2 = Math.imul(h2 ^ c, 1597334677)
    }
    this.h1 = h1
    this.h2 = h2
    this.mix(0x01)
    return this
  }

  /** Push an ASCII string as its bytes. Refuses any other character, so the element is a byte string. */
  pushAscii(s: string): this {
    this.open()
    let h1 = this.h1
    let h2 = this.h2
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c > 0x7f) throw new Error('replay-codec: pushAscii given a non-ASCII string')
      h1 = Math.imul(h1 ^ c, 2654435761)
      h2 = Math.imul(h2 ^ c, 1597334677)
    }
    this.h1 = h1
    this.h2 = h2
    this.mix(0x01)
    return this
  }

  get count(): number {
    return this.n
  }

  /** 16 lowercase hex characters: h2 then h1, each as 8, after the avalanche. Pure. */
  hex(): string {
    let h1 = Math.imul(this.h1 ^ (this.h1 >>> 16), 2246822507)
    let h2 = Math.imul(this.h2 ^ (this.h2 >>> 13), 3266489909)
    h1 ^= h2
    h2 ^= Math.imul(h1 ^ (h1 >>> 16), 2246822507)
    return hex32(h2) + hex32(h1)
  }
}

function hex32(x: number): string {
  return (x >>> 0).toString(16).padStart(8, '0')
}

/** A growable byte buffer with range-checked fixed-width writers (little-endian). */
export class ByteWriter {
  buf: Uint8Array
  n = 0

  constructor(capacity = 1024) {
    this.buf = new Uint8Array(capacity)
  }

  reset(): this {
    this.n = 0
    return this
  }

  private need(k: number): void {
    if (this.n + k <= this.buf.length) return
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.n + k))
    next.set(this.buf.subarray(0, this.n))
    this.buf = next
  }

  u8(x: number): this {
    if (!Number.isInteger(x) || x < 0 || x > 0xff) throw new Error(`replay-codec: ${x} does not fit a u8`)
    this.need(1)
    this.buf[this.n++] = x
    return this
  }

  u16(x: number): this {
    if (!Number.isInteger(x) || x < 0 || x > 0xffff) throw new Error(`replay-codec: ${x} does not fit a u16`)
    this.need(2)
    this.buf[this.n++] = x & 0xff
    this.buf[this.n++] = x >>> 8
    return this
  }

  u32(x: number): this {
    if (!Number.isInteger(x) || x < 0 || x > 0xffffffff) throw new Error(`replay-codec: ${x} does not fit a u32`)
    this.need(4)
    this.buf[this.n++] = x & 0xff
    this.buf[this.n++] = (x >>> 8) & 0xff
    this.buf[this.n++] = (x >>> 16) & 0xff
    this.buf[this.n++] = x >>> 24
    return this
  }

  ascii(s: string): this {
    this.need(s.length)
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c > 0x7f) throw new Error('replay-codec: non-ASCII text')
      this.buf[this.n++] = c
    }
    return this
  }

  append(bytes: ArrayLike<number>, length: number = bytes.length): this {
    this.need(length)
    for (let i = 0; i < length; i++) this.buf[this.n++] = bytes[i]
    return this
  }

  bytes(): Uint8Array {
    return this.buf.subarray(0, this.n)
  }
}

/** The digest of one byte string, as the single element of a fresh stream. */
export function digestBytes(bytes: ArrayLike<number>, length: number = bytes.length): string {
  return new ByteDigest().push(bytes, length).hex()
}

const HEX_PAIRS: readonly string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

export function toHex(bytes: ArrayLike<number>, length: number = bytes.length): string {
  let s = ''
  for (let i = 0; i < length; i++) s += HEX_PAIRS[bytes[i]]
  return s
}

export function fromHex(s: string): Uint8Array {
  if (s.length % 2 !== 0 || !/^[0-9a-f]*$/.test(s)) throw new Error('replay-codec: not lowercase hex of whole bytes')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16)
  return out
}

/* ------------------------------------------------------------------ encodings --- */

export function phaseCode(p: Phase): number {
  if (p === 'playing') return 0
  if (p === 'awaitPass') return 1
  if (p === 'finished') return 2
  throw new Error(`replay-codec: phase ${p} is pagat48-only; a us54 game never enters it`)
}

/** Three bytes: open (0/1), option seat, declined count; a closed window is 0, NONE, NONE. Truthiness, not key presence. */
function writeWindow(w: ByteWriter, dw: DeclareWindow | undefined): void {
  if (dw) {
    w.u8(1)
    w.u8(seatByte(dw.option, 'window option'))
    if (!Number.isInteger(dw.declined) || dw.declined < 0 || dw.declined > 5)
      throw new Error(`replay-codec: window declined ${dw.declined} out of range`)
    w.u8(dw.declined)
  } else {
    w.u8(0)
    w.u8(NONE)
    w.u8(NONE)
  }
}

function outcomeCode(o: BookResult['outcome']): number {
  if (o === 'team0') return 0
  if (o === 'team1') return 1
  if (o === 'void') return 2
  throw new Error(`replay-codec: outcome ${String(o)}`)
}

/**
 * The set block, 9 × 14 bytes: per set in canonical order, the outcome, the claimer, the six stated seats and the
 * six true holders (each in the set's card order). Memoised by the `books` object, which the reducer replaces
 * rather than mutates, and only on a declare.
 */
const SET_BLOCK_CACHE = new WeakMap<object, Uint8Array>()
function setBlock(books: GameState['books']): Uint8Array {
  const hit = SET_BLOCK_CACHE.get(books)
  if (hit) return hit
  const out = new Uint8Array(9 * 14).fill(NONE)
  for (let b = 0; b < 9; b++) {
    const r = books[SETS[b]]
    if (!r) continue
    const o = b * 14
    out[o] = outcomeCode(r.outcome)
    out[o + 1] = seatByte(r.claimer, 'claimer')
    const cards = SET_CARDS[b]
    for (let j = 0; j < 6; j++) {
      out[o + 2 + j] = seatByte(r.assignments[cards[j]], `stated seat of ${cards[j]}`)
      out[o + 8 + j] = seatByte(r.actualHolders[cards[j]], `true holder of ${cards[j]}`)
    }
  }
  SET_BLOCK_CACHE.set(books, out)
  return out
}

/** S_t: 191 bytes (replay-format.md §4.3). */
export function encodeState(w: ByteWriter, s: GameState): void {
  w.u32(s.moveIndex)
  w.u8(phaseCode(s.phase))
  w.u8(seatByte(s.turn, 'turn'))
  writeWindow(w, s.declareWindow)
  const holder = new Uint8Array(54).fill(NONE)
  if (s.hands.length !== 6) throw new Error('replay-codec: a state without six hands')
  for (let seat = 0; seat < 6; seat++) {
    for (const c of s.hands[seat]) {
      const i = cardIndex(c)
      if (holder[i] !== NONE) throw new Error(`replay-codec: ${c} is in two hands`)
      holder[i] = seat
    }
  }
  for (let i = 0; i < 54; i++) {
    const resolved = !!s.books[SETS[SET_OF_CARD[i]]]
    if (resolved === (holder[i] !== NONE))
      throw new Error(
        `replay-codec: ${CARDS[i]} is ${resolved ? 'in a hand but its set is resolved' : 'in no hand but its set is open'}`,
      )
  }
  w.append(holder)
  w.append(setBlock(s.books))
  w.u8(s.score[0])
  w.u8(s.score[1])
}

export function encodeEvent(w: ByteWriter, e: PublicEvent): void {
  switch (e.type) {
    case 'game_started':
      w.u8(EVENT_TAG.game_started).u8(seatByte(e.startingSeat, 'starting seat'))
      return
    case 'ask':
      w.u8(EVENT_TAG.ask)
        .u8(seatByte(e.asker, 'asker'))
        .u8(seatByte(e.target, 'target'))
        .u8(cardIndex(e.card))
        .u8(e.hit ? 1 : 0)
      return
    case 'claim': {
      const b = setIndex(e.book)
      w.u8(EVENT_TAG.claim).u8(seatByte(e.claimer, 'claimer')).u8(b)
      for (const c of SET_CARDS[b]) w.u8(seatByte(e.assignments[c], `stated seat of ${c}`))
      for (const c of SET_CARDS[b]) w.u8(seatByte(e.actualHolders[c], `true holder of ${c}`))
      w.u8(outcomeCode(e.outcome))
      return
    }
    case 'pass':
      w.u8(EVENT_TAG.pass).u8(seatByte(e.from, 'pass from')).u8(seatByte(e.to, 'pass to'))
      return
    case 'player_out':
      w.u8(EVENT_TAG.player_out).u8(seatByte(e.seat, 'player_out seat'))
      return
    case 'game_over':
      w.u8(EVENT_TAG.game_over)
        .u8(e.score[0])
        .u8(e.score[1])
        .u8(e.winner === 'tie' ? 2 : e.winner)
      return
    default:
      throw new Error(`replay-codec: event ${e.type} is pagat48-only`)
  }
}

/** E_t: a count byte, then the events in order. */
export function encodeEvents(w: ByteWriter, events: readonly PublicEvent[]): void {
  w.u8(events.length)
  for (const e of events) encodeEvent(w, e)
}

/** A_t (replay-format.md §4.4). Only well-formed us54 actions are encodable; a recorded action was accepted. */
export function encodeAction(w: ByteWriter, a: GameAction): void {
  switch (a.type) {
    case 'ask':
      w.u8(ACTION_TAG.ask)
        .u8(seatByte(a.seat, 'asker'))
        .u8(seatByte(a.target, 'target'))
        .u8(cardIndex(a.card))
      return
    case 'claim': {
      const b = setIndex(a.book)
      w.u8(ACTION_TAG.claim).u8(seatByte(a.seat, 'declarer')).u8(b)
      for (const c of SET_CARDS[b]) w.u8(seatByte(a.assignments[c], `stated seat of ${c}`))
      return
    }
    case 'pass':
      w.u8(ACTION_TAG.pass).u8(seatByte(a.seat, 'passer')).u8(seatByte(a.to, 'pass target'))
      return
    case 'decline':
      w.u8(ACTION_TAG.decline).u8(seatByte(a.seat, 'decliner'))
      return
    default:
      throw new Error(`replay-codec: action ${a.type} is pagat48-only`)
  }
}

/** Decode one action at `pos`; returns the action (canonical key order) and the next position. */
export function decodeAction(bytes: Uint8Array, pos: number): { action: GameAction; next: number } {
  const need = (k: number) => {
    if (pos + k > bytes.length) throw new Error(`replay-codec: truncated action at byte ${pos}`)
  }
  need(1)
  const tag = bytes[pos]
  const seat = (): Seat => seatByte(bytes[pos + 1], 'seat') as Seat
  switch (tag) {
    case ACTION_TAG.ask: {
      need(4)
      const card = bytes[pos + 3]
      if (card >= 54) throw new Error(`replay-codec: card index ${card}`)
      const target = seatByte(bytes[pos + 2], 'target') as Seat
      return { action: { type: 'ask', seat: seat(), target, card: CARDS[card] }, next: pos + 4 }
    }
    case ACTION_TAG.claim: {
      need(9)
      const b = bytes[pos + 2]
      if (b >= 9) throw new Error(`replay-codec: set index ${b}`)
      const assignments = {} as Record<Card, Seat>
      SET_CARDS[b].forEach((c, j) => {
        assignments[c] = seatByte(bytes[pos + 3 + j], 'stated seat') as Seat
      })
      return { action: { type: 'claim', seat: seat(), book: SETS[b], assignments }, next: pos + 9 }
    }
    case ACTION_TAG.pass: {
      need(3)
      const to = seatByte(bytes[pos + 2], 'pass target') as Seat
      return { action: { type: 'pass', seat: seat(), to }, next: pos + 3 }
    }
    case ACTION_TAG.decline:
      need(2)
      return { action: { type: 'decline', seat: seat() }, next: pos + 2 }
    default:
      throw new Error(`replay-codec: unknown action tag ${tag} at byte ${pos}`)
  }
}

function rulesId(config: RulesConfig): number {
  const t = config.toggles as unknown as Record<string, boolean>
  const anyToggle = Object.keys(t).some((k) => t[k])
  if (config.variant !== 'us54' || config.playerCount !== 6 || anyToggle)
    throw new Error('replay-codec: only us54 with every toggle off is in scope (ATHENA.md §4.1 item 15)')
  return RULES_ID_US54
}

export type SeatViewLike = PublicState & { seat: Seat; hand: readonly Card[] }

/**
 * V_t (replay-format.md §4.7): the canonical SeatView. The log enters as its length and its rolling digest (the
 * digest of every log event's encoding, in log order), so a port keeps a digest, not an event list.
 */
export function encodeView(w: ByteWriter, v: SeatViewLike, logLength: number, logDigestHex: string): void {
  if (v.log.length !== logLength)
    throw new Error(`replay-codec: view log has ${v.log.length} events, digest covers ${logLength}`)
  if (v.counts.length !== 6) throw new Error('replay-codec: a view without six counts')
  w.u8(rulesId(v.config))
  w.u8(seatByte(v.seat, 'view seat'))
  w.u32(v.moveIndex)
  w.u8(phaseCode(v.phase))
  w.u8(seatByte(v.turn, 'turn'))
  writeWindow(w, v.declareWindow)
  for (let i = 0; i < 6; i++) w.u8(v.counts[i])
  w.u8(v.score[0])
  w.u8(v.score[1])
  w.append(setBlock(v.books))
  w.u8(v.hand.length)
  for (const c of v.hand) w.u8(cardIndex(c))
  w.u32(logLength)
  w.ascii(logDigestHex)
}

/** The log digest of a whole log, from scratch (the recorder keeps it incrementally). */
export function logDigestOf(log: readonly PublicEvent[]): string {
  const d = new ByteDigest()
  const w = new ByteWriter(64)
  for (const e of log) {
    w.reset()
    encodeEvent(w, e)
    d.push(w.buf, w.n)
  }
  return d.hex()
}

/* ------------------------------------------------------------ legal-move record --- */

export type ReduceFn = (state: GameState, action: GameAction) => ReduceResult

/** Declare the first open set (canonical order) with all six cards stated at `seat`. */
function representativeClaim(s: GameState, seat: Seat): GameAction | null {
  const b = SETS.findIndex((id) => !s.books[id])
  if (b < 0) return null
  const assignments = {} as Record<Card, Seat>
  for (const c of SET_CARDS[b]) assignments[c] = seat
  return { type: 'claim', seat, book: SETS[b], assignments }
}

/**
 * L_t's kind bits, by the reducer's own verdict (replay-format.md §4.6): a kind is legal iff the reference accepts
 * that kind's representative action from the acting seat. The representatives are exact: ask, `legalAsks` is
 * non-empty; claim, the first open set stated wholly at the acting seat; pass, to the first teammate (ascending,
 * not the acting seat) holding cards; decline, the acting seat's decline.
 */
export function legalKinds(
  s: GameState,
  acting: Seat,
  asks: readonly { target: Seat; card: Card }[],
  reduceFn: ReduceFn = referenceReduce,
): number {
  let k = 0
  if (asks.length > 0) k |= KIND_ASK
  const claim = representativeClaim(s, acting)
  if (claim && reduceFn(s, claim).ok) k |= KIND_CLAIM
  const base = acting % 2
  for (const t of [base, base + 2, base + 4]) {
    if (t === acting || s.hands[t].length === 0) continue
    if (reduceFn(s, { type: 'pass', seat: acting, to: t as Seat }).ok) k |= KIND_PASS
    break
  }
  if (reduceFn(s, { type: 'decline', seat: acting }).ok) k |= KIND_DECLINE
  return k
}

/** L_t: acting seat, kind bits, the ask count (u16), then (target, card) per legal ask in `legalAsks` order. */
export function encodeLegal(
  w: ByteWriter,
  acting: Seat,
  kinds: number,
  asks: readonly { target: Seat; card: Card }[],
): void {
  w.u8(seatByte(acting, 'acting seat'))
  w.u8(kinds)
  w.u16(asks.length)
  for (const a of asks) {
    w.u8(seatByte(a.target, 'ask target'))
    w.u8(cardIndex(a.card))
  }
}

/* --------------------------------------------------------------------- probes --- */

/** One probe, in index form. `seat`, `target` and `to` may be 6 (not a seat); `card` 54 (not a card); `set` 9 (not a set). */
export interface Probe {
  kind: 0 | 1 | 2 | 3
  seat: number
  target: number
  card: number
  set: number
  assignments: number[]
  to: number
}

/**
 * The four probes at state S_t (replay-format.md §6). The generator is `rngFromSeed(`${seed}:probe:${t}`)`, the
 * deal's own PRNG, and every probe draws the same fifteen values in the same order whatever its kind, so a port
 * regenerates it with no branching on the draw sequence.
 */
export function generateProbes(
  seed: string,
  t: number,
  acting: number,
  asks: readonly { target: number; card: number }[],
): Probe[] {
  const rng = rngFromSeed(`${seed}:probe:${t}`)
  const out: Probe[] = []
  for (let k = 0; k < PROBES_PER_STATE; k++) {
    const kind = randInt(rng, 4) as Probe['kind']
    const seatMode = randInt(rng, 2)
    const randomSeat = randInt(rng, 7)
    const askMode = randInt(rng, 2)
    const askPick = randInt(rng, Math.max(1, asks.length))
    const seatOrTo = randInt(rng, 7)
    const card = randInt(rng, 55)
    const set = randInt(rng, 10)
    const assignMode = randInt(rng, 4)
    const raw: number[] = []
    for (let j = 0; j < 6; j++) raw.push(randInt(rng, 21))
    const seat = seatMode === 0 ? acting : randomSeat
    const useLegal = askMode === 0 && asks.length > 0
    out.push({
      kind,
      seat,
      target: useLegal ? asks[askPick].target : seatOrTo,
      card: useLegal ? asks[askPick].card : card,
      set,
      assignments: raw.map((r) => (assignMode === 0 ? r % 7 : (seat % 2) + 2 * (r % 3))),
      to: seatOrTo,
    })
  }
  return out
}

/** The probe as the TypeScript action the reference judges. Out-of-range indices become values no rule accepts. */
export function probeAction(p: Probe): GameAction {
  switch (p.kind) {
    case 0:
      return {
        type: 'ask',
        seat: p.seat,
        target: p.target,
        card: p.card < 54 ? CARDS[p.card] : '??',
      } as unknown as GameAction
    case 1: {
      const assignments: Record<string, number> = {}
      if (p.set < 9) SET_CARDS[p.set].forEach((c, j) => (assignments[c] = p.assignments[j]))
      return {
        type: 'claim',
        seat: p.seat,
        book: p.set < 9 ? SETS[p.set] : 'NONE',
        assignments,
      } as unknown as GameAction
    }
    case 2:
      return { type: 'decline', seat: p.seat } as unknown as GameAction
    case 3:
      return { type: 'pass', seat: p.seat, to: p.to } as unknown as GameAction
  }
}

/** The verdict byte: 0 accepted, else 1 + the error code's index in ERROR_CODES. */
export function verdictOf(reduceFn: ReduceFn, s: GameState, action: GameAction): number {
  const r = reduceFn(s, action)
  if (r.ok) return 0
  const i = ERROR_CODES.indexOf(r.error.code)
  if (i < 0) throw new Error(`replay-codec: unknown error code ${r.error.code}`)
  return 1 + i
}

/** How many probe states a game of T steps has: t = 0, 10, ... below T, plus T itself. */
export function probeStateCount(steps: number): number {
  return Math.ceil(steps / PROBE_EVERY) + 1
}

/** The probe states' step indices, in order. */
export function probeStates(steps: number): number[] {
  const out: number[] = []
  for (let t = 0; t < steps; t += PROBE_EVERY) out.push(t)
  out.push(steps)
  return out
}

/* ------------------------------------------------------------------- recorder --- */

export interface Observation {
  t: number
  acting: Seat
  kinds: number
  asks: readonly { target: Seat; card: Card }[]
  view: PublicState & { seat: Seat; hand: Card[] }
}

export type StepHook = (
  pre: GameState,
  action: GameAction,
  post: GameState,
  events: readonly PublicEvent[],
  obs: Observation,
) => void

export class RefusedAction extends Error {
  readonly code: string
  readonly step: number
  constructor(step: number, code: string, action: GameAction) {
    super(`step ${step}: the reference refused ${JSON.stringify(action)} (${code})`)
    this.code = code
    this.step = step
  }
}

export interface Columns {
  deal: string
  actions: string
  d: string
  l: string
  v: string
  probes: string
  steps: number
  end: 'finished' | 'capped'
  game: string
}

/** Seeds are printable ASCII without spaces, so every language hashes the same bytes and a TSV line stays one line. */
export function checkSeed(seed: string): void {
  if (!/^[\x21-\x7e]+$/.test(seed))
    throw new Error(`replay-codec: seed ${JSON.stringify(seed)} is not printable ASCII without spaces`)
}

/**
 * Plays one game's record: call `observe()` then `apply(action)` at each step, and `finish()` once the game is
 * finished or has taken STEP_CAP steps. The emitter and the checker both use it, the one with a policy's actions,
 * the other with the decoded actions of a record.
 */
export class GameRecorder {
  readonly seed: string
  readonly startSeat: Seat
  readonly deal: string
  state: GameState
  steps = 0
  private readonly reduceFn: ReduceFn
  private readonly chain = new ByteDigest()
  private readonly logDigest = new ByteDigest()
  private logLength = 0
  private readonly w = new ByteWriter(1024)
  private readonly actionBytes = new ByteWriter(4096)
  private readonly dHex: string[] = []
  private readonly lHex: string[] = []
  private readonly vHex: string[] = []
  private readonly probeBytes: number[] = []
  private pending: Observation | null = null
  private ended: 'finished' | 'capped' | null = null

  constructor(seed: string, startSeat: Seat, opts: { reduce?: ReduceFn } = {}) {
    checkSeed(seed)
    this.seed = seed
    this.startSeat = seatByte(startSeat, 'start seat') as Seat
    this.reduceFn = opts.reduce ?? referenceReduce
    this.state = newGame(seed, us54Config, startSeat)
    this.chain.pushAscii(`${FORMAT}|${startSeat}|${seed}`)
    this.w.reset()
    encodeState(this.w, this.state)
    this.chain.push(this.w.buf, this.w.n)
    this.deal = this.chain.hex()
    this.absorbLog(this.state.log)
  }

  private absorbLog(events: readonly PublicEvent[]): void {
    for (const e of events) {
      this.w.reset()
      encodeEvent(this.w, e)
      this.logDigest.push(this.w.buf, this.w.n)
      this.logLength++
    }
  }

  get end(): 'finished' | 'capped' | null {
    return this.ended
  }

  /** The digests and verdicts so far (a replay that stopped early compares its prefix). */
  partial(): { d: string; l: string; v: string; probes: readonly number[] } {
    return { d: this.dHex.join(''), l: this.lHex.join(''), v: this.vHex.join(''), probes: this.probeBytes }
  }

  /** Step t's legal-move record, view and (every tenth step) probes. Call once before each `apply`. */
  observe(): Observation {
    if (this.ended) throw new Error('replay-codec: observe() after finish()')
    if (this.pending) throw new Error('replay-codec: observe() twice without apply()')
    const s = this.state
    if (s.phase === 'finished') throw new Error('replay-codec: observe() on a finished game')
    if (this.steps >= STEP_CAP) throw new Error('replay-codec: observe() past the step cap')
    const t = this.steps
    const acting = legalActionsSummary(s).seat
    const asks = legalAsks(s, acting)
    const kinds = legalKinds(s, acting, asks, this.reduceFn)
    this.w.reset()
    encodeLegal(this.w, acting, kinds, asks)
    this.lHex.push(digestBytes(this.w.buf, this.w.n))
    const view = seatView(s, acting)
    this.w.reset()
    encodeView(this.w, view, this.logLength, this.logDigest.hex())
    this.vHex.push(digestBytes(this.w.buf, this.w.n))
    if (t % PROBE_EVERY === 0) this.probe(t, acting, asks)
    this.pending = { t, acting, kinds, asks, view }
    return this.pending
  }

  private probe(t: number, acting: Seat, asks: readonly { target: Seat; card: Card }[]): void {
    const idx = asks.map((a) => ({ target: a.target as number, card: cardIndex(a.card) }))
    for (const p of generateProbes(this.seed, t, acting, idx))
      this.probeBytes.push(verdictOf(this.reduceFn, this.state, probeAction(p)))
  }

  /** Apply A_t. Throws RefusedAction if the reference refuses it (a policy bug, or a corrupt record). */
  apply(action: GameAction, hook?: StepHook): readonly PublicEvent[] {
    const obs = this.pending
    if (!obs) throw new Error('replay-codec: apply() without observe()')
    const pre = this.state
    const r = this.reduceFn(pre, action)
    if (!r.ok) throw new RefusedAction(this.steps, r.error.code, action)
    this.pending = null
    this.w.reset()
    encodeAction(this.w, action)
    this.actionBytes.append(this.w.buf, this.w.n)
    this.chain.push(this.w.buf, this.w.n)
    this.w.reset()
    encodeEvents(this.w, r.events)
    this.chain.push(this.w.buf, this.w.n)
    this.w.reset()
    encodeState(this.w, r.state)
    this.chain.push(this.w.buf, this.w.n)
    this.dHex.push(this.chain.hex())
    this.absorbLog(r.events)
    if (r.state.log.length !== this.logLength)
      throw new Error(`replay-codec: the log has ${r.state.log.length} events, the events emitted add up to ${this.logLength}`)
    this.state = r.state
    this.steps++
    if (hook) hook(pre, action, r.state, r.events, obs)
    return r.events
  }

  /** Close the record: the terminal probes. The game must be finished, or have taken STEP_CAP steps. */
  finish(): void {
    if (this.pending) throw new Error('replay-codec: finish() with an observed step not applied')
    if (this.ended) throw new Error('replay-codec: finish() twice')
    const s = this.state
    if (s.phase === 'finished') this.ended = 'finished'
    else if (this.steps >= STEP_CAP) this.ended = 'capped'
    else throw new Error(`replay-codec: finish() at step ${this.steps}, before the game ended`)
    const acting = legalActionsSummary(s).seat
    this.probe(this.steps, acting, legalAsks(s, acting))
  }

  columns(): Columns {
    if (!this.ended) throw new Error('replay-codec: columns() before finish()')
    const deal = this.deal
    const d = this.dHex.join('')
    const l = this.lHex.join('')
    const v = this.vHex.join('')
    return {
      deal,
      actions: toHex(this.actionBytes.buf, this.actionBytes.n),
      d,
      l,
      v,
      probes: toHex(this.probeBytes),
      steps: this.steps,
      end: this.ended,
      game: gameDigest(deal, d, l, v, this.probeBytes, this.steps, this.ended),
    }
  }
}

/* --------------------------------------------------------------- corpus lines --- */

/** One accept/refuse character per probe: '1' accepted, '0' refused. Codes are information only (§4.6). */
export function acceptBits(probes: ArrayLike<number>): string {
  let s = ''
  for (let i = 0; i < probes.length; i++) s += probes[i] === 0 ? '1' : '0'
  return s
}

/** The game digest (replay-format.md §7.2): everything the gate compares, and nothing it treats as information. */
export function gameDigest(
  deal: string,
  d: string,
  l: string,
  v: string,
  probes: ArrayLike<number>,
  steps: number,
  end: string,
): string {
  return new ByteDigest()
    .pushAscii(deal)
    .pushAscii(d)
    .pushAscii(l)
    .pushAscii(v)
    .pushAscii(acceptBits(probes))
    .pushAscii(`${steps}|${end}`)
    .hex()
}

/** The population aggregate: the game digests in index order. */
export function aggregateDigest(gameDigests: readonly string[]): string {
  const g = new ByteDigest()
  for (const x of gameDigests) g.pushAscii(x)
  return g.hex()
}

export interface RecordMeta {
  population: string
  index: number
  driver: string
  revision: string
  rulesHash: string
}

export interface ParsedRecord extends RecordMeta {
  seed: string
  startSeat: Seat
  steps: number
  end: 'finished' | 'capped'
  deal: string
  actions: Uint8Array
  d: string
  l: string
  v: string
  probes: Uint8Array
  game: string
}

export const COLUMN_NAMES = [
  'format',
  'population',
  'index',
  'seed',
  'startSeat',
  'driver',
  'revision',
  'rulesHash',
  'steps',
  'end',
  'deal',
  'actions',
  'd',
  'l',
  'v',
  'probes',
  'game',
] as const

export function recordLine(rec: GameRecorder, meta: RecordMeta): string {
  for (const x of [meta.population, meta.driver, meta.revision, meta.rulesHash])
    if (/[\t\r\n]/.test(x)) throw new Error('replay-codec: a metadata field holds a tab or a newline')
  const c = rec.columns()
  return [
    FORMAT,
    meta.population,
    String(meta.index),
    rec.seed,
    String(rec.startSeat),
    meta.driver,
    meta.revision,
    meta.rulesHash,
    String(c.steps),
    c.end,
    c.deal,
    c.actions,
    c.d,
    c.l,
    c.v,
    c.probes,
    c.game,
  ].join('\t')
}

const HEX16 = /^[0-9a-f]{16}$/
const HEX_ONLY = /^[0-9a-f]*$/

export function parseLine(line: string): ParsedRecord {
  const f = line.replace(/\r$/, '').split('\t')
  if (f.length !== COLUMN_NAMES.length)
    throw new Error(`replay-codec: a line has ${f.length} columns, not ${COLUMN_NAMES.length}`)
  if (f[0] !== FORMAT) throw new Error(`replay-codec: format ${f[0]}, expected ${FORMAT}`)
  const steps = Number(f[8])
  if (!Number.isInteger(steps) || steps < 0 || steps > STEP_CAP) throw new Error(`replay-codec: steps ${f[8]}`)
  const end = f[9]
  if (end !== 'finished' && end !== 'capped') throw new Error(`replay-codec: end ${end}`)
  if (!HEX16.test(f[10]) || !HEX16.test(f[16])) throw new Error('replay-codec: deal or game is not 16 hex characters')
  for (const i of [12, 13, 14])
    if (f[i].length !== 16 * steps || !HEX_ONLY.test(f[i]))
      throw new Error(`replay-codec: column ${COLUMN_NAMES[i]} is not 16 hex characters a step`)
  const probes = fromHex(f[15])
  if (probes.length !== PROBES_PER_STATE * probeStateCount(steps))
    throw new Error(`replay-codec: ${probes.length} probe verdicts for ${steps} steps`)
  checkSeed(f[3])
  return {
    population: f[1],
    index: Number(f[2]),
    seed: f[3],
    startSeat: seatByte(Number(f[4]), 'start seat') as Seat,
    driver: f[5],
    revision: f[6],
    rulesHash: f[7],
    steps,
    end,
    deal: f[10],
    actions: fromHex(f[11]),
    d: f[12],
    l: f[13],
    v: f[14],
    probes,
    game: f[16],
  }
}

/* ---------------------------------------------------------------------- replay --- */

export interface Mismatch {
  /** 'deal' | 'd' | 'l' | 'v' | 'probe' | 'refused' | 'length' | 'end' | 'game' */
  what: string
  /** The step (for d, l, v, refused, length), or the probe's position in the probe column. */
  at: number
  detail: string
}

export interface ReplayResult {
  /** Every gated comparison held. */
  ok: boolean
  mismatches: Mismatch[]
  /** Probes whose accept/refuse agreed but whose error code did not (information only). */
  codeDiffs: number
  /** The first step at which d, l or v differed, or -1. */
  firstDivergentStep: number
  final: GameState
  steps: number
  end: 'finished' | 'capped' | null
  game: string
}

function firstBlockDiff(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i += 16) if (a.slice(i, i + 16) !== b.slice(i, i + 16)) return i / 16
  return a.length === b.length ? -1 : n / 16
}

/**
 * Replay a record from its seed, start seat and actions alone, recompute every digest and compare. `reduce` may be
 * replaced (the tests plant a mutant this way); `hook` sees every applied step (the coverage census).
 */
export function replayRecord(rec: ParsedRecord, opts: { reduce?: ReduceFn; hook?: StepHook } = {}): ReplayResult {
  const r = new GameRecorder(rec.seed, rec.startSeat, { reduce: opts.reduce })
  const mismatches: Mismatch[] = []
  let pos = 0
  let broke = false
  while (pos < rec.actions.length) {
    if (r.state.phase === 'finished' || r.steps >= STEP_CAP) {
      mismatches.push({ what: 'length', at: r.steps, detail: `the game ended at step ${r.steps} with actions left in the record` })
      broke = true
      break
    }
    const { action, next } = decodeAction(rec.actions, pos)
    pos = next
    r.observe()
    try {
      r.apply(action, opts.hook)
    } catch (e) {
      if (!(e instanceof RefusedAction)) throw e
      mismatches.push({ what: 'refused', at: e.step, detail: e.message })
      broke = true
      break
    }
  }
  let replayed: Columns | null = null
  if (!broke) {
    try {
      r.finish()
      replayed = r.columns()
    } catch (e) {
      mismatches.push({ what: 'length', at: r.steps, detail: (e as Error).message })
    }
  }
  const got = r.partial()
  if (r.deal !== rec.deal) mismatches.push({ what: 'deal', at: 0, detail: `${r.deal} vs recorded ${rec.deal}` })
  let first = -1
  const columns: [string, string, string][] = [
    ['d', got.d, rec.d],
    ['l', got.l, rec.l],
    ['v', got.v, rec.v],
  ]
  for (const [what, mine, want] of columns) {
    const at = firstBlockDiff(mine, want)
    if (at < 0) continue
    const cut = (s: string) => s.slice(16 * at, 16 * at + 16) || '(none)'
    mismatches.push({ what, at, detail: `${cut(mine)} vs recorded ${cut(want)}` })
    if (first < 0 || at < first) first = at
  }
  let codeDiffs = 0
  let probeMismatches = 0
  const n = Math.min(got.probes.length, rec.probes.length)
  for (let i = 0; i < n; i++) {
    const a = got.probes[i]
    const b = rec.probes[i]
    if ((a === 0) !== (b === 0)) {
      if (probeMismatches++ < 4) mismatches.push({ what: 'probe', at: i, detail: `verdict ${a} vs recorded ${b}` })
    } else if (a !== b) codeDiffs++
  }
  if (probeMismatches > 4) mismatches.push({ what: 'probe', at: -1, detail: `${probeMismatches} probe verdicts differ in all` })
  if (got.probes.length !== rec.probes.length)
    mismatches.push({ what: 'probe', at: n, detail: `${got.probes.length} verdicts vs recorded ${rec.probes.length}` })
  if (replayed) {
    if (replayed.steps !== rec.steps || replayed.end !== rec.end)
      mismatches.push({ what: 'end', at: replayed.steps, detail: `${replayed.steps} ${replayed.end} vs recorded ${rec.steps} ${rec.end}` })
    if (replayed.game !== rec.game) mismatches.push({ what: 'game', at: 0, detail: `${replayed.game} vs recorded ${rec.game}` })
  }
  return {
    ok: mismatches.length === 0,
    mismatches,
    codeDiffs,
    firstDivergentStep: first,
    final: r.state,
    steps: r.steps,
    end: r.end,
    game: replayed ? replayed.game : '',
  }
}

/* ------------------------------------------------------------ branch coverage --- */

/** §4.6's floor table, row for row. Every row's floor is FLOOR occurrences over the corpus. */
export const FLOOR = 50
export const BRANCHES = [
  { id: 'hitEmptiesTarget', label: 'hit empties the target (player_out on a hit)' },
  { id: 'windowClosedBySixDeclines', label: 'window closed by six declines' },
  { id: 'forcedDeclare', label: 'forced declare (the MUST_DECLARE window)' },
  { id: 'declareRight', label: 'declare right' },
  { id: 'declareWrongOpponentHeld', label: 'declare wrong, an opponent held a card' },
  { id: 'declareWrongMisassigned', label: 'declare wrong, own team held all six (misassigned)' },
  { id: 'outOfTurnDeclare', label: 'out-of-turn declare' },
  { id: 'cardlessDeclare', label: 'declare by a cardless seat' },
  { id: 'turnHolderDeclarerEmptiedAwaitPass', label: 'declarer who held the turn emptied -> awaitPass' },
  { id: 'otherDeclareEmptiesTurnHolderAwaitPass', label: "another seat's declare empties the turn-holder -> awaitPass" },
  { id: 'wholeTeamOutNextSeat', label: 'whole team out -> next seat with cards' },
  { id: 'pass', label: 'pass' },
  { id: 'finish5to0', label: 'finish 5-0' },
  { id: 'finish5to4', label: 'finish 5-4' },
  { id: 'declareAfterDecline', label: 'declare after at least one decline in the same window' },
  { id: 'cardlessSeatDeclines', label: 'cardless seat declines' },
] as const

/** The two rows §4.6 marks "not counted today": counted from P0 on. */
export const NEW_BRANCH_IDS: readonly string[] = ['declareAfterDecline', 'cardlessSeatDeclines']

export type Tally = Record<string, number>

function bump(t: Tally, k: string): void {
  t[k] = (t[k] ?? 0) + 1
}

/**
 * The census of one applied step (replay-format.md §9.2). Reads the reference states around the step, the action,
 * its events, and the decline bit of L_t.
 */
export function classifyStep(
  t: Tally,
  pre: GameState,
  action: GameAction,
  post: GameState,
  events: readonly PublicEvent[],
  kinds: number,
): void {
  bump(t, 'steps')
  bump(t, `action:${action.type}`)
  if (action.type === 'ask') {
    if (events.some((e) => e.type === 'player_out')) bump(t, 'hitEmptiesTarget')
  } else if (action.type === 'decline') {
    if (!post.declareWindow) bump(t, 'windowClosedBySixDeclines')
    if (pre.hands[action.seat].length === 0) bump(t, 'cardlessSeatDeclines')
  } else if (action.type === 'pass') {
    bump(t, 'pass')
  } else if (action.type === 'claim') {
    const ev = events[0]
    if (!ev || ev.type !== 'claim') throw new Error('replay-codec: a declare without its claim event')
    const team = action.seat % 2
    if (ev.outcome === (team === 0 ? 'team0' : 'team1')) bump(t, 'declareRight')
    else if (Object.values(ev.actualHolders).some((h) => h % 2 !== team)) bump(t, 'declareWrongOpponentHeld')
    else bump(t, 'declareWrongMisassigned')
    if ((kinds & KIND_DECLINE) === 0) bump(t, 'forcedDeclare')
    if (action.seat !== pre.turn) bump(t, 'outOfTurnDeclare')
    if (pre.hands[action.seat].length === 0) bump(t, 'cardlessDeclare')
    if (pre.declareWindow && pre.declareWindow.declined >= 1) bump(t, 'declareAfterDecline')
    if (post.phase === 'awaitPass')
      bump(t, action.seat === pre.turn ? 'turnHolderDeclarerEmptiedAwaitPass' : 'otherDeclareEmptiesTurnHolderAwaitPass')
    if (post.phase === 'playing' && post.turn !== pre.turn) bump(t, 'wholeTeamOutNextSeat')
  }
  for (const e of events) {
    if (e.type !== 'game_over') continue
    const hi = Math.max(e.score[0], e.score[1])
    const lo = Math.min(e.score[0], e.score[1])
    bump(t, `finish${hi}to${lo}`)
  }
}

/**
 * The end of a game: capped or finished, and which terminator fired. `fallbackAlone` counts finished games in
 * which no team holds 5 awarded sets (the `resolved === 9` terminator alone); it must stay 0.
 */
export function classifyEnd(t: Tally, final: GameState, end: 'finished' | 'capped' | null): void {
  bump(t, 'games')
  if (end === 'capped') {
    bump(t, 'capped')
    return
  }
  if (final.phase !== 'finished') return
  bump(t, 'finished')
  const won = [0, 0]
  let resolved = 0
  for (const b of SETS) {
    const r = final.books[b]
    if (!r) continue
    resolved++
    if (r.outcome === 'team0') won[0]++
    else if (r.outcome === 'team1') won[1]++
  }
  const clinched = Math.max(won[0], won[1]) >= 5
  if (!clinched) bump(t, 'fallbackAlone')
  else if (resolved === 9) bump(t, 'fallbackCoincided')
}

export function mergeTally(into: Tally, from: Tally): void {
  for (const k of Object.keys(from)) into[k] = (into[k] ?? 0) + from[k]
}
