/**
 * encode.ts: ATHENA's actor observation built from a `SeatView`, in the layout of the Rust port's batch environment
 * (`athena-env/src/vecenv.rs`, documented in `athena-env/API.md` §4-§5). ATHENA.md §4.5 item 6, G0d.
 *
 * A network trained on the port's observations must see the same bytes inside a package, so every function here
 * reproduces the Rust encoder exactly: the action codes (API.md §4), the legal row (§5.1), the obs row (§5.2), the
 * event rows (§5.3) and the facts row (§5.5). `scripts/athena/check-encoder.mjs` compares this encoder with
 * `athena_env.BatchEnv` on corpus games, byte for byte, in both regimes, and `tests/athena/stub.test.ts` pins a
 * sample of those comparisons.
 *
 * - **Relative seats.** Seat s is written `(s - me) mod 6` for the observer `me`: rel 0 is the observer, rels 2 and 4
 *   its teammates, rels 1, 3 and 5 its opponents. NONE (255) marks an absent value.
 * - **Events.** `encodeEventRows` encodes the whole log. The Rust environment delivers the rows logged since the
 *   observing seat's last observation; concatenated over a game they are the same rows, in log order.
 * - **The start seat** (ATHENA.md §8.2, both regimes). The bridge's host does not publish it, so the observation's
 *   start seat is unknown until the first event, then that event's actor: while the log holds only `game_started`
 *   it encodes as no rows, and after that its row names the actor of the log's second event.
 * - **The reveal regimes** (ATHENA.md §8.2 G1b). At home a declare publishes every true holder. At the bridge a
 *   wrong declare publishes only the holders a hit had already located (ATHENA.md §4.1;
 *   `scripts/athena/replay-format.md` §12.4). A holder absent from a view's `actualHolders` encodes as NONE in the
 *   event row, and a wrong declare whose "how" the published holders cannot settle encodes its how byte as NONE. The
 *   caller gives a bridge view its reduced holders and passes the regime, which the obs row carries (`O_REGIME`):
 *   the view alone cannot say which regime it is in.
 * - **One legal bit depends on a hidden hand: the decline** (API.md §6). It is computed from the view as the Rust
 *   tests prove it can be in every reachable state: the window opens on the turn-holder, so an option seat other than
 *   the turn-holder exists only after the turn-holder's legal decline, and declines move no cards.
 *
 * Pure over its inputs; no dependency beyond the engine's card tables.
 */
import type { BookId, Card, GameAction, PublicEvent, Seat } from '../engine/types.ts'
import type { Knowledge, SeatView } from '../engine/bots/types.ts'
import { allBooks, allCards, cardBook } from '../engine/cards.ts'
import { us54Config } from '../engine/reduce.ts'

/* ------------------------------------------------------------------------------------------ the tables --- */

export const NONE = 255
export const N_CARDS = 54
export const N_SETS = 9

/** The 54 cards in canonical order: suit-major C, D, H, S, ranks 2..A with the 8, then XR = 52 and XB = 53. */
export const CARDS: readonly Card[] = allCards(us54Config)
/** The nine sets: LOW-C, LOW-D, LOW-H, LOW-S, HIGH-C, HIGH-D, HIGH-H, HIGH-S, EIGHTS. */
export const SETS: readonly BookId[] = allBooks(us54Config)
const CARD_INDEX: ReadonlyMap<Card, number> = new Map(CARDS.map((c, i) => [c, i]))
const SET_INDEX: ReadonlyMap<BookId, number> = new Map(SETS.map((b, i) => [b, i]))
/** Each set's cards in ascending card index (API.md §4: EIGHTS is [6, 19, 32, 45, 52, 53]). */
export const SET_CARDS: readonly (readonly number[])[] = SETS.map((b) =>
  CARDS.map((_, i) => i).filter((i) => cardBook(CARDS[i]) === b),
)
/** The set of each card index. */
export const SET_OF: readonly number[] = CARDS.map((c) => SET_INDEX.get(cardBook(c)) as number)

export function cardIndex(c: Card): number {
  const i = CARD_INDEX.get(c)
  if (i === undefined) throw new Error(`not a us54 card: ${String(c)}`)
  return i
}

export function setIndex(b: BookId): number {
  const i = SET_INDEX.get(b)
  if (i === undefined) throw new Error(`not a us54 set: ${String(b)}`)
  return i
}

/* ---------------------------------------------------------------------------------- the action codes --- */

/** Ask codes: `k * 54 + card`, opponent k = 0, 1, 2 being seat `(me + 2k + 1) mod 6`. */
export const N_ASK = 3 * N_CARDS
export const A_DECLINE = N_ASK
/** `A_PASS` hands the turn to teammate rel 2, `A_PASS + 1` to teammate rel 4. */
export const A_PASS = A_DECLINE + 1
/** `A_DECLARE + set * 729 + sum_j d_j 3^j`: card j of the set (set card order) stated at teammate rel `2 d_j`. */
export const A_DECLARE = A_PASS + 2
export const N_ASSIGN = 729
export const N_ACTIONS = A_DECLARE + N_SETS * N_ASSIGN

/** A seat relative to the observer; any non-seat stays NONE. */
export function rel(seat: number | undefined, me: number): number {
  if (seat === undefined || !Number.isInteger(seat) || seat < 0 || seat > 5) return NONE
  return (seat + 6 - me) % 6
}

/** The absolute seat of a relative one. */
export function abs(r: number, me: number): Seat {
  return ((me + r) % 6) as Seat
}

const team = (s: number): number => s % 2

/** The action a code means for `seat` (API.md §4), or null for a code outside 0..N_ACTIONS. */
export function decodeAction(seat: Seat, code: number): GameAction | null {
  if (!Number.isInteger(code) || code < 0 || code >= N_ACTIONS) return null
  if (code < A_DECLINE) {
    const k = Math.floor(code / N_CARDS)
    return { type: 'ask', seat, target: abs(2 * k + 1, seat), card: CARDS[code % N_CARDS] }
  }
  if (code === A_DECLINE) return { type: 'decline', seat }
  if (code < A_DECLARE) return { type: 'pass', seat, to: abs(2 * (code - A_PASS + 1), seat) }
  const x = code - A_DECLARE
  const set = Math.floor(x / N_ASSIGN)
  let a = x % N_ASSIGN
  const assignments = {} as Record<Card, Seat>
  for (const ci of SET_CARDS[set]) {
    assignments[CARDS[ci]] = abs(2 * (a % 3), seat)
    a = Math.floor(a / 3)
  }
  return { type: 'claim', seat, book: SETS[set], assignments }
}

/** The code of an action relative to its own seat, or null when the encoding has none (an ask of a teammate, ...). */
export function encodeAction(a: GameAction): number | null {
  const seat = a.seat
  switch (a.type) {
    case 'ask': {
      const r = rel(a.target, seat)
      const ci = CARD_INDEX.get(a.card)
      if (r === NONE || r % 2 === 0 || ci === undefined) return null
      return ((r - 1) / 2) * N_CARDS + ci
    }
    case 'decline':
      return A_DECLINE
    case 'pass': {
      const r = rel(a.to, seat)
      return r === 2 ? A_PASS : r === 4 ? A_PASS + 1 : null
    }
    case 'claim': {
      const s = SET_INDEX.get(a.book)
      if (s === undefined) return null
      let x = 0
      const cards = SET_CARDS[s]
      for (let j = cards.length - 1; j >= 0; j--) {
        const r = rel(a.assignments[CARDS[cards[j]]], seat)
        if (r === NONE || r % 2 === 1) return null
        x = 3 * x + r / 2
      }
      return A_DECLARE + s * N_ASSIGN + x
    }
    default:
      return null
  }
}

/* ------------------------------------------------------------------------------------------ the rows --- */

export const L_ASK = 0
export const L_DECLARE = N_ASK
export const L_DECLINE = L_DECLARE + N_SETS
export const L_PASS = L_DECLINE + 1
export const LEGAL_LEN = L_PASS + 2

export const O_HAND = 0
export const O_COUNTS = O_HAND + N_CARDS
export const O_PHASE = O_COUNTS + 6
export const O_TURN = O_PHASE + 1
export const O_WINDOW = O_TURN + 1
export const O_OPTION = O_WINDOW + 1
export const O_DECLINED = O_OPTION + 1
export const O_SCORE = O_DECLINED + 1
export const O_SETS = O_SCORE + 2
export const SET_FIELDS = 3
/** The game's reveal regime: `REGIME_HOME` (0) or `REGIME_BRIDGE` (1). Added by P1 (ATHENA.md §8.2 G1b). */
export const O_REGIME = O_SETS + N_SETS * SET_FIELDS
export const OBS_LEN = O_REGIME + 1

export const REGIME_HOME = 0
export const REGIME_BRIDGE = 1

/** The facts row (API.md §5.5): each card's candidate seats now, relative, a six-bit mask (0 once out of play). */
export const F_CAND = 0
/** Each seat's unknown slots, in relative order. */
export const F_UNKNOWN = F_CAND + N_CARDS
/** Per set, its cards certain on the observer's team (NONE once resolved). */
export const F_SET_CERTAIN = F_UNKNOWN + 6
/** Per set, 1 if the facts prove it lost for the observer's team, else 0 (NONE once resolved). */
export const F_SET_LOST = F_SET_CERTAIN + N_SETS
/** The rules-certain declare (the rail): its set, or NONE. */
export const F_RAIL = F_SET_LOST + N_SETS
/** The rail's stated seat for each of the set's six cards, relative (NONE without a rail). */
export const F_RAIL_ASSIGN = F_RAIL + 1
/** The number of distinct set-membership constraints. */
export const F_NCONS = F_RAIL_ASSIGN + 6
/** The constraints, sorted: (seat relative, set, six-bit mask of the set's cards); NONE past the count. */
export const F_CONS = F_NCONS + 1
export const CONS_FIELDS = 3
export const MAX_CONS = 64
export const FACTS_LEN = F_CONS + MAX_CONS * CONS_FIELDS

export const E_TYPE = 0
export const E_ACTOR = 1
export const E_TARGET = 2
export const E_CARD = 3
export const E_HIT = 4
export const E_SET = 5
export const E_RESULT = 6
export const E_ASSIGN = 7
export const E_HOLDERS = E_ASSIGN + 6
export const EVENT_LEN = E_HOLDERS + 6

export const SET_OPEN = 0
export const SET_OURS = 1
export const SET_THEIRS = 2
export const HOW_RIGHT = 0
export const HOW_OPPONENT_HELD = 1
export const HOW_MISASSIGNED = 2

/** The phase byte: 0 playing, 1 awaitPass, 2 finished. The 48-card phases are refused. */
export function phaseByte(phase: SeatView['phase']): number {
  if (phase === 'playing') return 0
  if (phase === 'awaitPass') return 1
  if (phase === 'finished') return 2
  throw new Error(`phase ${phase} is not a us54 phase`)
}

function outcomeTeam(outcome: 'team0' | 'team1' | 'void'): number {
  return outcome === 'team0' ? 0 : outcome === 'team1' ? 1 : 2
}

/** The how byte of a resolved set: right, an opponent of the declarer held a card, misassigned, or NONE (reduced reveal, unsettled). */
function howByte(claimer: number, outcome: number, holders: Partial<Record<Card, Seat>>, set: number): number {
  const ct = team(claimer)
  if (outcome === ct) return HOW_RIGHT
  let known = 0
  for (const ci of SET_CARDS[set]) {
    const h = holders[CARDS[ci]]
    if (h === undefined) continue
    known++
    if (team(h) !== ct) return HOW_OPPONENT_HELD
  }
  return known === 6 ? HOW_MISASSIGNED : NONE
}

/**
 * Would `view.seat` have a legal ask if the window closed on it (`legalAsksFromView` without the window, restated as
 * a count: `turnHolderCanAsk` for the viewer)? Phase playing, a card in hand, an opponent with cards, and a set held
 * at one to five cards.
 */
export function viewerCouldAsk(view: SeatView): boolean {
  if (view.phase !== 'playing' || view.hand.length === 0) return false
  const me = view.seat
  let opp = false
  for (let s = 0; s < 6; s++) if (team(s) !== team(me) && view.counts[s] > 0) opp = true
  if (!opp) return false
  const per = new Array<number>(N_SETS).fill(0)
  for (const c of view.hand) per[SET_OF[cardIndex(c)]]++
  return per.some((n) => n > 0 && n < 6)
}

/**
 * The obs row (API.md §5.2) and the legal row (§5.1) of `view` for its own seat, written into `obs` (OBS_LEN bytes)
 * and `legal` (LEGAL_LEN bytes). `regime` is the game's (a bridge view's holders are the caller's to reduce).
 */
export function encodeObservation(view: SeatView, obs: Uint8Array, legal: Uint8Array, regime: number = REGIME_HOME): void {
  const me = view.seat
  const myTeam = team(me)
  obs.fill(0, 0, OBS_LEN)
  const handMask = new Uint8Array(N_CARDS)
  for (const c of view.hand) {
    const ci = cardIndex(c)
    obs[O_HAND + ci] = 1
    handMask[ci] = 1
  }
  for (let r = 0; r < 6; r++) obs[O_COUNTS + r] = view.counts[abs(r, me)]
  obs[O_PHASE] = phaseByte(view.phase)
  obs[O_TURN] = rel(view.turn, me)
  const w = view.declareWindow
  if (w) {
    obs[O_WINDOW] = 1
    obs[O_OPTION] = rel(w.option, me)
    obs[O_DECLINED] = w.declined
  } else {
    obs[O_WINDOW] = 0
    obs[O_OPTION] = NONE
    obs[O_DECLINED] = NONE
  }
  obs[O_SCORE] = view.score[myTeam]
  obs[O_SCORE + 1] = view.score[1 - myTeam]
  const resolved = new Array<boolean>(N_SETS).fill(false)
  for (let b = 0; b < N_SETS; b++) {
    const o = O_SETS + SET_FIELDS * b
    const r = view.books[SETS[b]]
    if (!r) {
      obs[o] = SET_OPEN
      obs[o + 1] = NONE
      obs[o + 2] = NONE
      continue
    }
    resolved[b] = true
    const t = outcomeTeam(r.outcome)
    obs[o] = t === myTeam ? SET_OURS : t === 1 - myTeam ? SET_THEIRS : 3
    obs[o + 1] = rel(r.claimer, me)
    obs[o + 2] = howByte(r.claimer, t, r.actualHolders ?? {}, b)
  }
  obs[O_REGIME] = regime

  // The legal row, by the reducer's rules restated over the view (API.md §5.1).
  legal.fill(0, 0, LEGAL_LEN)
  if (view.phase === 'finished') return
  if (w) {
    if (view.phase === 'playing' && w.option === me) {
      for (let b = 0; b < N_SETS; b++) legal[L_DECLARE + b] = resolved[b] ? 0 : 1
      // MUST_DECLARE: the turn-holder cannot ask. An option past the turn-holder means it declined legally.
      legal[L_DECLINE] = w.option !== view.turn || viewerCouldAsk(view) ? 1 : 0
    }
    return
  }
  if (view.phase === 'awaitPass') {
    if (view.turn === me) {
      for (let k = 0; k < 2; k++) legal[L_PASS + k] = view.counts[abs(2 * (k + 1), me)] > 0 ? 1 : 0
    }
    return
  }
  if (view.phase !== 'playing' || view.turn !== me || view.hand.length === 0) return
  // legalAsksFromView: cards of a set held at least once, not in hand, to an opponent with cards.
  const held = new Uint8Array(N_SETS)
  for (let ci = 0; ci < N_CARDS; ci++) if (handMask[ci]) held[SET_OF[ci]] = 1
  for (let k = 0; k < 3; k++) {
    if (view.counts[abs(2 * k + 1, me)] === 0) continue
    for (let ci = 0; ci < N_CARDS; ci++) {
      if (held[SET_OF[ci]] && !handMask[ci]) legal[L_ASK + k * N_CARDS + ci] = 1
    }
  }
}

/** One public event as a fixed-width row relative to `me` (API.md §5.3), written at `row[off .. off + EVENT_LEN)`. */
export function encodeEventRow(e: PublicEvent, me: number, row: Uint8Array, off: number): void {
  row.fill(NONE, off, off + EVENT_LEN)
  const myTeam = team(me)
  const result = (t: number): number => (t === myTeam ? 0 : t === 1 - myTeam ? 1 : 2)
  switch (e.type) {
    case 'game_started':
      row[off + E_TYPE] = 0
      row[off + E_ACTOR] = rel(e.startingSeat, me)
      return
    case 'ask':
      row[off + E_TYPE] = 1
      row[off + E_ACTOR] = rel(e.asker, me)
      row[off + E_TARGET] = rel(e.target, me)
      row[off + E_CARD] = cardIndex(e.card)
      row[off + E_HIT] = e.hit ? 1 : 0
      return
    case 'claim': {
      const s = setIndex(e.book)
      row[off + E_TYPE] = 2
      row[off + E_ACTOR] = rel(e.claimer, me)
      row[off + E_SET] = s
      row[off + E_RESULT] = result(outcomeTeam(e.outcome))
      const cards = SET_CARDS[s]
      for (let j = 0; j < 6; j++) {
        const c = CARDS[cards[j]]
        row[off + E_ASSIGN + j] = rel(e.assignments[c], me)
        row[off + E_HOLDERS + j] = rel(e.actualHolders?.[c], me)
      }
      return
    }
    case 'pass':
      row[off + E_TYPE] = 3
      row[off + E_ACTOR] = rel(e.from, me)
      row[off + E_TARGET] = rel(e.to, me)
      return
    case 'player_out':
      row[off + E_TYPE] = 4
      row[off + E_ACTOR] = rel(e.seat, me)
      return
    case 'game_over':
      row[off + E_TYPE] = 5
      row[off + E_RESULT] = e.winner === 'tie' ? 2 : result(e.winner)
      return
    default:
      throw new Error(`event ${e.type} is not a us54 event`)
  }
}

/** The seat an event is by: the start seat, asker, declarer, passer or emptied seat (undefined for game_over). */
export function eventActor(e: PublicEvent): Seat | undefined {
  switch (e.type) {
    case 'game_started':
      return e.startingSeat
    case 'ask':
      return e.asker
    case 'claim':
      return e.claimer
    case 'pass':
      return e.from
    case 'player_out':
      return e.seat
    default:
      return undefined
  }
}

/**
 * Every event of `log` as rows relative to `me`, under the start-seat rule (module header): no rows while the log
 * holds only `game_started`; after that `log.length * EVENT_LEN` bytes, the first row naming the second event's actor.
 */
export function encodeEventRows(log: readonly PublicEvent[], me: number): Uint8Array {
  if (log.length <= 1) return new Uint8Array(0)
  const out = new Uint8Array(log.length * EVENT_LEN)
  for (let i = 0; i < log.length; i++) {
    const e = log[i]
    const first = eventActor(log[1])
    const row = i === 0 && e.type === 'game_started' && first !== undefined ? { type: 'game_started' as const, startingSeat: first } : e
    encodeEventRow(row, me, out, i * EVENT_LEN)
  }
  return out
}

/* ------------------------------------------------------------------------------------- the facts row --- */

/**
 * The facts row (API.md §5.5) of `view` for its own seat, from `k`, the view's rules-derived facts
 * (`buildKnowledge(view)`, i.e. `lib/athena/policy.ts`'s `factsOf`), written into `row` (FACTS_LEN bytes): the Rust
 * port's facts buffer, byte for byte.
 */
export function encodeFactsRow(view: SeatView, k: Knowledge, row: Uint8Array): void {
  const me = view.seat
  const myTeam = team(me)
  row.fill(NONE, 0, FACTS_LEN)
  for (let ci = 0; ci < N_CARDS; ci++) {
    let m = 0
    for (const s of k.cands[CARDS[ci]] ?? []) m |= 1 << rel(s, me)
    row[F_CAND + ci] = m
  }
  for (let r = 0; r < 6; r++) row[F_UNKNOWN + r] = k.unknownSlots[abs(r, me)]
  let rail = -1
  for (let b = 0; b < N_SETS; b++) {
    if (view.books[SETS[b]]) continue
    let certain = 0
    let lost = 0
    let all = true
    for (const ci of SET_CARDS[b]) {
      const h = k.holders[CARDS[ci]]
      if (h !== undefined) {
        if (team(h) !== myTeam) {
          lost = 1
          all = false
        } else certain++
      } else {
        all = false
        if (!(k.cands[CARDS[ci]] ?? []).some((s) => team(s) === myTeam)) lost = 1
      }
    }
    row[F_SET_CERTAIN + b] = certain
    row[F_SET_LOST + b] = lost
    if (rail < 0 && all) rail = b
  }
  if (rail >= 0) {
    row[F_RAIL] = rail
    SET_CARDS[rail].forEach((ci, j) => (row[F_RAIL_ASSIGN + j] = rel(k.holders[CARDS[ci]], me)))
  }
  const seen = new Set<number>()
  for (const x of k.constraints) {
    if (x.cards.length === 0) continue
    const set = SET_OF[cardIndex(x.cards[0])]
    let m = 0
    for (const c of x.cards) m |= 1 << SET_CARDS[set].indexOf(cardIndex(c))
    seen.add((rel(x.seat, me) << 16) | (set << 8) | m)
  }
  const cons = [...seen].sort((a, b) => a - b)
  if (cons.length > MAX_CONS) throw new Error(`a view has ${cons.length} distinct constraints, above MAX_CONS = ${MAX_CONS}`)
  row[F_NCONS] = cons.length
  cons.forEach((v, i) => {
    row[F_CONS + CONS_FIELDS * i] = v >> 16
    row[F_CONS + CONS_FIELDS * i + 1] = (v >> 8) & 0xff
    row[F_CONS + CONS_FIELDS * i + 2] = v & 0xff
  })
}
