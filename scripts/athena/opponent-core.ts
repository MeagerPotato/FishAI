/**
 * opponent-core.ts: the rules half of ATHENA P0's Node opponent service (ATHENA.md §4.5 item 4, §4.6 G0c).
 *
 * The service (`scripts/athena/opponent-service.mjs`) keeps the reference's `GameState` of every game the port is
 * playing, applies the port's actions to it, and answers the Monet seats' decisions from it. This module is
 * everything in that loop except the policy, so the tests can pin it without loading the bots:
 *
 * - **The action codes** of `athena-env/API.md` §4, relative to the acting seat, in both directions. The service
 *   speaks the port's codes, so an action crosses the process boundary as one integer.
 * - **`ReferenceGame`**: one reference game with the replay format's rolling state digest d
 *   (`scripts/athena/replay-format.md` §5), kept exactly as `GameRecorder` keeps it, plus the legal-move digest l and
 *   the view digest v of the acting seat on request. The port's `BatchEnv(track_digests=True).digests()` returns the
 *   same three values, so every answer the service gives is also a live replay check (§4.5 item 4).
 * - **The reveal regime** of the game (ATHENA.md §8.2 G1b, `replay-format.md` §12.4). A `ReferenceGame` is opened
 *   `'full'` (the home regime: the default, and P0's only regime) or `'reduced'` (the bridge regime). Under
 *   `'reduced'` the view a policy is shown is the one the bridge's host publishes: a wrong declare shows only the
 *   holders a hit had already located, in the set block and in the log's claims alike. The reduction itself is
 *   `facts-codec.ts`'s `ReducedReveal`, G1b's reference, so nothing here re-derives it.
 *   - The rules, the actions, the state digest d and the legal-move digest l do NOT depend on the regime; only the
 *     view does, and with it the view digest v (`athena-env/API.md` §3.5). So a reduced game's d and l still equal
 *     the port's, and its v equals the port's bridge-regime v.
 * - **The move seed** of the lab: `hashSeed(`${seed}:${moveIndex}`)()`, as `duplicate-pairs.mjs` and the corpus
 *   emitter seed every decision.
 *
 * It imports the rules core, the replay codec and the facts codec's reduced reveal only. Nothing here changes the
 * engine.
 */
import type { Card, GameAction, GameState, ReduceResult, Seat } from '../../lib/engine/types.ts'
import { newGame, reduce, us54Config } from '../../lib/engine/reduce.ts'
import { legalActionsSummary, legalAsks } from '../../lib/engine/helpers.ts'
import { seatView } from '../../lib/engine/views.ts'
import { hashSeed } from '../../lib/engine/rng.ts'
import {
  ByteDigest,
  ByteWriter,
  CARDS,
  FORMAT,
  SETS,
  SET_CARDS,
  STEP_CAP,
  cardIndex,
  checkSeed,
  digestBytes,
  encodeAction,
  encodeEvent,
  encodeEvents,
  encodeLegal,
  encodeState,
  encodeView,
  legalKinds,
  setIndex,
  type Reveal,
} from './replay-codec.ts'
import { ReducedReveal } from './facts-codec.ts'

/** The reveal regimes an opponent game can be opened in, as the wire spells them (ATHENA.md §8.2 G1b). */
export const REVEALS: readonly Reveal[] = ['full', 'reduced']

/** `x` as a reveal regime; anything else is refused by name. */
export function checkReveal(x: unknown): Reveal {
  if (x === 'full' || x === 'reduced') return x
  throw new Error(`opponent-core: reveal ${JSON.stringify(x)} is not one of ${REVEALS.join(', ')}`)
}

/* ------------------------------------------------------------- action codes --- */

/** API.md §4: 162 asks (3 opponents x 54 cards), the decline, 2 passes, 9 sets x 729 assignments. */
export const N_ASK = 162
export const A_DECLINE = 162
export const A_PASS = 163
export const A_DECLARE = 165
export const N_ASSIGN = 729
export const N_ACTIONS = A_DECLARE + 9 * N_ASSIGN

function isSeat(x: unknown): x is Seat {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 5
}

/** A seat relative to `me`: (seat - me) mod 6. */
function rel(seat: number, me: number): number {
  return (seat - me + 6) % 6
}

/**
 * The action code of an action, relative to its own seat (API.md §4), or null when the encoding has none: an ask of
 * a teammate or oneself, a pass to anyone but a teammate, a declare that states an opponent. Every action the
 * reducer can accept has a code, so a null here means the action would be refused.
 */
export function actionCode(a: GameAction): number | null {
  const me = a.seat
  if (!isSeat(me)) return null
  switch (a.type) {
    case 'ask': {
      if (!isSeat(a.target) || typeof a.card !== 'string' || !CARDS.includes(a.card)) return null
      const r = rel(a.target, me)
      if (r % 2 === 0) return null
      return ((r - 1) / 2) * 54 + cardIndex(a.card)
    }
    case 'decline':
      return A_DECLINE
    case 'pass': {
      if (!isSeat(a.to)) return null
      const r = rel(a.to, me)
      return r === 2 ? A_PASS : r === 4 ? A_PASS + 1 : null
    }
    case 'claim': {
      if (typeof a.book !== 'string' || !SETS.includes(a.book)) return null
      const b = setIndex(a.book)
      const cards = SET_CARDS[b]
      const keys = Object.keys(a.assignments ?? {})
      if (keys.length !== 6 || !cards.every((c) => keys.includes(c))) return null
      let x = 0
      for (let j = 5; j >= 0; j--) {
        const s = a.assignments[cards[j]]
        if (!isSeat(s)) return null
        const r = rel(s, me)
        if (r % 2 === 1) return null
        x = 3 * x + r / 2
      }
      return A_DECLARE + b * N_ASSIGN + x
    }
    default:
      return null
  }
}

/** The action a code means for the acting seat `me` (absolute seats; a claim's keys in set card order). */
export function actionOfCode(me: number, code: number): GameAction {
  if (!isSeat(me)) throw new Error(`opponent-core: ${me} is not a seat`)
  if (!Number.isInteger(code) || code < 0 || code >= N_ACTIONS)
    throw new Error(`opponent-core: action code ${code} is not in 0..${N_ACTIONS - 1}`)
  if (code < A_DECLINE) {
    const k = Math.floor(code / 54)
    return { type: 'ask', seat: me, target: ((me + 2 * k + 1) % 6) as Seat, card: CARDS[code % 54] }
  }
  if (code === A_DECLINE) return { type: 'decline', seat: me }
  if (code < A_DECLARE) return { type: 'pass', seat: me, to: ((me + 2 * (code - A_PASS + 1)) % 6) as Seat }
  const x = code - A_DECLARE
  const b = Math.floor(x / N_ASSIGN)
  let digits = x % N_ASSIGN
  const assignments = {} as Record<Card, Seat>
  for (const c of SET_CARDS[b]) {
    assignments[c] = ((me + 2 * (digits % 3)) % 6) as Seat
    digits = Math.floor(digits / 3)
  }
  return { type: 'claim', seat: me, book: SETS[b], assignments }
}

/* ----------------------------------------------------------- reference game --- */

/** The lab's move seed: `hashSeed(`${seed}:${moveIndex}`)()` (duplicate-pairs.mjs, emit-replay-corpus.mjs). */
export function moveSeed(seed: string, moveIndex: number): number {
  return hashSeed(`${seed}:${moveIndex}`)()
}

export type ApplyOutcome = { ok: true } | { ok: false; error: string }

/**
 * One reference game, as the opponent service keeps it: the TypeScript `GameState` and the replay format's digest
 * streams (replay-format.md §5), fed exactly as `GameRecorder` feeds them. `d` after t applied actions is the
 * corpus's d_{t-1} (the deal digest before any), so it equals the port's `digests()[0]` whenever the port has
 * applied the same actions to the same deal.
 */
export class ReferenceGame {
  readonly seed: string
  readonly startSeat: Seat
  readonly deal: string
  /** The game's reveal regime: `'full'` at home, `'reduced'` at the bridge (ATHENA.md §8.2 G1b). */
  readonly reveal: Reveal
  state: GameState
  steps = 0
  private readonly chain = new ByteDigest()
  private readonly logDigest = new ByteDigest()
  private logLength = 0
  /** The bridge regime's published log, its digest and its set block; null under the full reveal. */
  private readonly red: ReducedReveal | null
  private readonly w = new ByteWriter(1024)
  /** A decision's reduce result, kept so the apply of the same action does not reduce twice (reduce is pure). */
  private pending: { seat: number; code: number; result: ReduceResult } | null = null

  constructor(seed: string, startSeat: number, reveal: Reveal = 'full') {
    checkSeed(seed)
    if (!isSeat(startSeat)) throw new Error(`opponent-core: start seat ${startSeat} is not a seat`)
    this.seed = seed
    this.startSeat = startSeat
    this.reveal = checkReveal(reveal)
    this.red = this.reveal === 'reduced' ? new ReducedReveal() : null
    this.state = newGame(seed, us54Config, startSeat)
    this.chain.pushAscii(`${FORMAT}|${startSeat}|${seed}`)
    this.w.reset()
    encodeState(this.w, this.state)
    this.chain.push(this.w.buf, this.w.n)
    this.deal = this.chain.hex()
    for (const e of this.state.log) this.absorb(e)
  }

  /**
   * Take one log event. Under the full reveal the event's own encoding feeds the log digest, as `GameRecorder` feeds
   * it; under the reduced reveal `ReducedReveal` republishes the event and keeps the reduced log and its digest,
   * which is what `encodeView(..., 'reduced')` must be given (replay-format.md §12.3).
   */
  private absorb(e: GameState['log'][number]): void {
    if (this.red) {
      this.red.push(e)
      return
    }
    this.w.reset()
    encodeEvent(this.w, e)
    this.logDigest.push(this.w.buf, this.w.n)
    this.logLength++
  }

  /** The number of published log events (the same under either reveal; only a claim's holders are reduced). */
  private get logLen(): number {
    return this.red ? this.red.log.length : this.logLength
  }

  /** The rolling log digest under this game's reveal. */
  private logDigestHex(): string {
    return this.red ? this.red.logDigest.hex() : this.logDigest.hex()
  }

  /** The rolling state digest after the last applied action (the deal digest before any). */
  get d(): string {
    return this.chain.hex()
  }

  get finished(): boolean {
    return this.state.phase === 'finished'
  }

  /**
   * How many true holders this game's reveal has withheld so far, and from how many wrong declares. Both are 0
   * under the full reveal, always: it publishes every holder. Information, for the reads; nothing reads them to
   * play.
   */
  get hidden(): { holders: number; wrongDeclares: number } {
    return this.red
      ? { holders: this.red.hiddenHolders, wrongDeclares: this.red.wrongDeclares }
      : { holders: 0, wrongDeclares: 0 }
  }

  /** The seat that acts now: the window's option seat when a window is open, else the turn seat. */
  acting(): Seat {
    return legalActionsSummary(this.state).seat
  }

  /**
   * The acting seat's view: all a policy is shown. Under the reduced reveal it is the view the bridge's host
   * publishes — the same seat, hand, counts and score, with the reduced log and set block (replay-format.md §12.4).
   */
  view(): ReturnType<typeof seatView> {
    const acting = this.acting()
    return this.red ? this.red.view(this.state, acting) : seatView(this.state, acting)
  }

  /** The move seed of the current state. */
  moveSeed(): number {
    return moveSeed(this.seed, this.state.moveIndex)
  }

  /** The legal-move digest l of the current state for its acting seat (replay-format.md §4.6). */
  legalDigest(): string {
    const acting = this.acting()
    const asks = legalAsks(this.state, acting)
    this.w.reset()
    encodeLegal(this.w, acting, legalKinds(this.state, acting, asks), asks)
    return digestBytes(this.w.buf, this.w.n)
  }

  /**
   * The view digest v of the current state for its acting seat (replay-format.md §4.7), under this game's reveal:
   * the port's `digests()[2]` in the same regime (`athena-env/API.md` §3.5).
   */
  viewDigest(view: ReturnType<typeof seatView> = this.view()): string {
    this.w.reset()
    encodeView(this.w, view, this.logLen, this.logDigestHex(), this.reveal)
    return digestBytes(this.w.buf, this.w.n)
  }

  /**
   * Judge an action the acting seat would take, without applying it: its code (null if it has none) and whether
   * the reference accepts it. The result is kept, and `applyCode` of the same seat and code reuses it. That keeps the
   * reference state exactly the one `duplicate-pairs.mjs` builds from the policy's own action object (a declare's
   * assignment map in the policy's key order), not from its re-decoded code (keys in set card order); the digests
   * cannot tell the two apart, but a policy reading the state later could.
   */
  judge(action: GameAction): { code: number | null; error: string | null } {
    this.pending = null
    const r = reduce(this.state, action)
    const code = actionCode(action)
    if (!r.ok) return { code, error: r.error.code }
    if (code === null) return { code, error: 'NO_ACTION_CODE' }
    this.pending = { seat: action.seat, code, result: r }
    return { code, error: null }
  }

  /**
   * Apply the port's action: `code` for the seat that acted in the port. A refused action changes nothing and
   * returns the reference's error code; that is a divergence between the port and the reference, and the caller
   * reports it.
   */
  applyCode(seat: number, code: number): ApplyOutcome {
    if (this.finished) return { ok: false, error: 'GAME_FINISHED' }
    if (this.steps >= STEP_CAP) return { ok: false, error: 'STEP_CAP' }
    let action: GameAction
    try {
      action = actionOfCode(seat, code)
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
    const p = this.pending
    this.pending = null
    const r = p && p.seat === seat && p.code === code ? p.result : reduce(this.state, action)
    if (!r.ok) return { ok: false, error: r.error.code }
    this.w.reset()
    encodeAction(this.w, action)
    this.chain.push(this.w.buf, this.w.n)
    this.w.reset()
    encodeEvents(this.w, r.events)
    this.chain.push(this.w.buf, this.w.n)
    this.w.reset()
    encodeState(this.w, r.state)
    this.chain.push(this.w.buf, this.w.n)
    for (const e of r.events) this.absorb(e)
    this.state = r.state
    this.steps++
    return { ok: true }
  }
}
