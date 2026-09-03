/**
 * knowledge.ts — deterministic knowledge-state inference from PUBLIC data only.
 *
 * Rebuilt from scratch on every call (stateless — required for the serverless
 * path) out of exactly three inputs, all present in a SeatView:
 *   1. the public log (asks with hit/miss, claim reveals, player_out, ...),
 *   2. the public per-seat card counts,
 *   3. the viewer's own hand.
 *
 * ## Model: deal-time variables
 *
 * Every card movement after the deal is public: a hit names the card and both
 * seats, a claim reveals all six actual holders and removes the cards. So the
 * only hidden quantity per card is WHO IT WAS DEALT TO. We track, per card c:
 *
 *   pos(c)  — public current location: ORIGINAL (never moved since the deal),
 *             a known seat (publicly transferred there), or GONE (claimed).
 *   X_c     — the deal-time holder: a candidate set over the 6 seats, possibly
 *             collapsed to a single fixed seat.
 *
 * While pos(c) is ORIGINAL, "s holds c right now" is equivalent to "X_c = s";
 * the moment c moves, its present location is a public constant forever after.
 * Every historical fact is translated into a constraint over the X variables
 * AT INGESTION TIME using the pos() map as of that log event, which makes the
 * stored facts immutable — transfers and claims never invalidate them. That is
 * how set-constraint bookkeeping "survives" card movement: a disjunct is
 * removed once its card is proven dealt elsewhere, the constraint is dropped
 * once some disjunct is proven true (satisfied) or none remain (exhausted).
 *
 * Facts ingested while walking the log (RULES.md §2/§3 semantics):
 *  - ask(a, t, c, miss): a did not hold c (askOwnCardAllowed off) and t did not
 *    hold c at that moment; a held >= 1 card of book(c) \ {c} at that moment.
 *  - ask(a, t, c, hit): t held c (if c was unmoved: X_c = t — the deal holder
 *    is revealed); the same >= 1-of-book constraint on a; then c moves to a.
 *  - claim: every actual holder is revealed (fixing X for unmoved cards), the
 *    six cards leave play.
 *  - running hand sizes (replayed from the log) bound everything: whenever a
 *    seat's replayed count equals its count of certainly-located cards, every
 *    still-unfixed card is NOT with that seat (historical count exhaustion —
 *    this also covers player_out, count 0).
 *
 * After the walk the viewer's own hand is injected (fully known: YES for me on
 * live held cards, NO for me elsewhere), and a propagation loop runs to
 * fixpoint over the CURRENT public counts:
 *  - count exhaustion: a seat whose count equals its certain cards holds
 *    nothing else; a seat whose free slots equal its remaining possible cards
 *    holds all of them;
 *  - single-candidate elimination: one possible seat left => that seat has it;
 *  - set-constraint forcing: when every disjunct of a constraint except one is
 *    dead, the survivor is fixed (asker provably still holds that card's book
 *    slot from the deal).
 *
 * The builder never throws: contradictory input (possible under the easy
 * tier's truncated log, or a malformed view) degrades to weaker knowledge
 * instead of failing. On consistent full views every certainty is sound —
 * tests/bots/knowledge.test.ts checks holderOf against ground truth at every
 * step of 300 full games, under both rule sets.
 *
 * ## Deck-awareness (RULES_US54.md §6)
 *
 * Every quantity below that used to be a 48-card literal is read off
 * `deckFor(view.config)` instead: the card count (48 vs 54), the card list and
 * its canonical index, the set list (8 half-suits vs 8 + EIGHTS), and the
 * deal-time hand size (8 vs 9). None of it is module-level state — the deck is
 * derived from the config handed to `buildKnowledge` and carried on the
 * per-call `Work` record, so two rooms on different variants cannot see each
 * other's deck (RULES_US54.md §2.4).
 *
 * This matters more here than anywhere else in the engine because it fails
 * *silently*. The running counts seed the historical count-exhaustion rule: a
 * seat whose replayed hand size equals its certainly-located cards is proven to
 * hold nothing else. Seeding 8 for a variant that deals 9 makes that test fire
 * one card early for every seat, which does not throw — it eliminates seats
 * that should have stayed candidates, and `holderOf` starts returning confident
 * wrong answers. The same is true of the set list: a resolved EIGHTS set whose
 * cards were never marked GONE leaves six phantom cards in circulation.
 *
 * The 6-seat quantities (`FULL_MASK`, `popcount6`, `SEATS`) are *not*
 * deck-derived: both rule sets are 6 players, 2 teams of 3, and nothing else
 * (RULES.md row 1 / RULES_US54.md §1 rows 1 and 22).
 */
import type { BookId, Card, PublicEvent, Seat } from '../types.ts'
import type { Deck } from '../cards.ts'
import { bookCards, cardBook, deckFor, seatTeam } from '../cards.ts'
import { legalAsksFromView } from '../helpers.ts'
import type { AskWeights, Knowledge, KnowledgeOptions, RankedAsk, SeatView } from './types.ts'
import { attachMarginal, marginalFor, marginalHitProbability } from './marginal.ts'

/** Six seats in both rule sets — see the header; never derived from the deck. */
const FULL_MASK = 0b111111
const ORIGINAL = -1
const GONE = -2
const SEATS: readonly Seat[] = [0, 1, 2, 3, 4, 5]

/**
 * The `Work.pos` sentinels, exported for the bounded arm ([bounded.ts](bounded.ts)), which
 * enumerates facts off a finished walk and applies kept facts to a fresh one. Engine-internal:
 * neither name is re-exported by the barrels.
 */
export const POS_ORIGINAL = ORIGINAL
export const POS_GONE = GONE

function bit(s: Seat): number {
  return 1 << s
}

function popcount6(m: number): number {
  let n = 0
  for (let s = 0; s < 6; s++) if (m & (1 << s)) n++
  return n
}

function soleSeat(m: number): Seat {
  for (let s = 0 as Seat; s < 6; s++) if (m === 1 << s) return s as Seat
  return 0
}

/**
 * Timestamps of the walk's atomic certifications, filled in only when a `Work` carries a
 * recorder (`recordedWalk`). The bounded arm reads these as the recency axis of its fact
 * ranking; `buildKnowledge` itself never allocates one, so its path is untouched.
 */
export interface WalkRecord {
  /** Per card index: the event index of the card's LAST public move (hit), -1 if never moved. */
  movedAt: number[]
  /** Per card index: the event index at which the deal holder was fixed, -1 while unfixed. */
  fixedAt: number[]
  /** Flattened `ci * 6 + seat`: the event index at which the seat was eliminated, -1 if never. */
  clearedAt: number[]
  /** Per recorded constraint (index-aligned with `Work.constraints` post-walk): its ask's event index. */
  constraintAt: number[]
}

/** Mutable working state while building. */
export interface Work {
  /**
   * The deck this build runs on, derived once from the view's config
   * (`deckFor`, itself memoized per variant). Read-only and per-call: the deck
   * travels with the working state instead of being looked up from a module
   * default, which is what keeps concurrent games on different variants
   * isolated (RULES_US54.md §2.4).
   */
  readonly deck: Deck
  /** `deck.cards.length` — 48 under `pagat48`, 54 under `us54`. Every ci loop runs 0..n-1. */
  readonly n: number
  /** ORIGINAL | seat | GONE — public current location per card. */
  pos: number[]
  /** Deal-holder candidate mask per card (meaningful while xfix is unset). */
  cand: number[]
  /** Deal holder once fixed, else -1. */
  xfix: number[]
  /** Live at-least-one-of-set constraints over deal variables. */
  constraints: { seat: Seat; cards: number[] }[]
  /** The event index the walk is currently ingesting — read only by the recorder. */
  at: number
  /** Certification timestamps, present only under `recordedWalk`. `buildKnowledge` never sets it. */
  rec?: WalkRecord
}

/**
 * The six cards of a set **within this build's deck** — exactly what
 * `bookCards(book, config)` reads, taking the already-derived deck. Ids the deck
 * does not define yield [], so `'EIGHTS'` is correctly empty under `pagat48`
 * (RULES_US54.md §1 row 3).
 */
function setCards(w: Work, book: BookId): readonly Card[] {
  return w.deck.bookCards.get(book) ?? []
}

/** Fix a card's deal holder. Exported as a bounded-arm application primitive (fact replay). */
export function fixX(w: Work, ci: number, s: Seat): void {
  if (w.xfix[ci] !== -1) return // keep the first derivation; conflicts = inconsistent input
  w.xfix[ci] = s
  w.cand[ci] = bit(s)
  if (w.rec) w.rec.fixedAt[ci] = w.at
}

/** Eliminate a deal candidate. Exported as a bounded-arm application primitive (fact replay). */
export function clearCand(w: Work, ci: number, s: Seat): void {
  if (w.xfix[ci] !== -1) return
  const next = w.cand[ci] & ~bit(s)
  if (next === 0 || next === w.cand[ci]) {
    // Never empty a candidate set (inconsistent input under truncated logs);
    // leave the last belief in place rather than fabricating certainty.
    return
  }
  w.cand[ci] = next
  if (w.rec) w.rec.clearedAt[ci * 6 + s] = w.at
  if (popcount6(next) === 1) fixX(w, ci, soleSeat(next))
}

/**
 * Historical count exhaustion at the current walk position: for each seat whose
 * replayed hand size equals the number of cards certainly located there, every
 * still-unfixed ORIGINAL card cannot be (and so was never) with that seat.
 */
function exhaustCounts(w: Work, runningCounts: number[]): void {
  for (const s of SEATS) {
    let certain = 0
    for (let ci = 0; ci < w.n; ci++) {
      if (w.pos[ci] === s || (w.pos[ci] === ORIGINAL && w.xfix[ci] === s)) certain++
    }
    if (runningCounts[s] === certain) {
      for (let ci = 0; ci < w.n; ci++) {
        if (w.pos[ci] === ORIGINAL && w.xfix[ci] === -1) clearCand(w, ci, s)
      }
    }
  }
}

/**
 * Record "asker held >= 1 card of `book` (minus the asked card, unless the
 * bluff toggle allowed asking an own card on a miss) at this walk position",
 * translated to deal variables via the current pos() map.
 *
 * Uniform across sets, EIGHTS included: RULES_US54.md §1 row 6 makes the ask
 * licence within EIGHTS the same "hold any card of the set" test as everywhere
 * else — holding either joker licenses asking for an 8 and vice versa — so the
 * disjunction is simply over the set's six cards, with no suit reasoning.
 */
function addAskConstraint(
  w: Work,
  asker: Seat,
  book: BookId,
  askedCi: number,
  includeAsked: boolean,
): void {
  const alive: number[] = []
  for (const c of setCards(w, book)) {
    const ci = w.deck.order.get(c)
    if (ci === undefined) continue
    if (ci === askedCi && !includeAsked) continue
    if (w.pos[ci] === asker) return // publicly with the asker right now: satisfied
    if (w.pos[ci] !== ORIGINAL) continue // elsewhere or gone: dead disjunct
    if (w.xfix[ci] === asker) return // dealt to the asker and unmoved: satisfied
    if (w.xfix[ci] !== -1) continue // dealt elsewhere: dead
    if ((w.cand[ci] & bit(asker)) === 0) continue // asker already excluded: dead
    alive.push(ci)
  }
  if (alive.length === 0) return // exhausted/inconsistent — no information kept
  if (alive.length === 1) {
    fixX(w, alive[0], asker)
    return
  }
  w.constraints.push({ seat: asker, cards: alive })
  if (w.rec) w.rec.constraintAt.push(w.at)
}

/** Walk one public event, updating the working state. */
function ingest(w: Work, ev: PublicEvent, runningCounts: number[], opts: Required<KnowledgeOptions>, ownCardToggle: boolean, trackCounts: boolean): void {
  switch (ev.type) {
    case 'ask': {
      // A card the config's deck does not contain cannot be reasoned about
      // (an `8H` in a `pagat48` log, say): skip rather than fabricate an index.
      const ci = w.deck.order.get(ev.card)
      if (ci === undefined) return
      // Under a truncated window a resolved book's cards are pre-marked GONE
      // even though this (older) ask predates the claim: out of play, skip.
      if (w.pos[ci] === GONE) return
      const book = cardBook(ev.card)
      if (ev.hit) {
        // Target held the card at this moment; if it never moved before, the
        // deal holder is revealed outright.
        if (w.pos[ci] === ORIGINAL) fixX(w, ci, ev.target)
        if (opts.useConstraints) addAskConstraint(w, ev.asker, book, ci, false)
        w.pos[ci] = ev.asker // public transfer target -> asker
        if (w.rec) w.rec.movedAt[ci] = w.at
        if (trackCounts) {
          runningCounts[ev.target]--
          runningCounts[ev.asker]++
          exhaustCounts(w, runningCounts)
        }
      } else {
        if (w.pos[ci] === ORIGINAL) {
          if (!ownCardToggle) clearCand(w, ci, ev.asker)
          clearCand(w, ci, ev.target)
        }
        if (opts.useConstraints) addAskConstraint(w, ev.asker, book, ci, ownCardToggle)
      }
      return
    }
    case 'claim': {
      // Any set of the config's deck, EIGHTS included: a declare reveals all six
      // actual holders and removes them from play in both rule sets. `us54` only
      // changes who *scores* a wrong one (RULES_US54.md §1 row 14), which carries
      // no card information the reveal has not already given.
      for (const c of setCards(w, ev.book)) {
        const ci = w.deck.order.get(c)
        if (ci === undefined) continue
        const actual = ev.actualHolders[c]
        if (w.pos[ci] === ORIGINAL && actual !== undefined) fixX(w, ci, actual)
        if (w.pos[ci] !== GONE && trackCounts && actual !== undefined) runningCounts[actual]--
        w.pos[ci] = GONE
      }
      if (trackCounts) exhaustCounts(w, runningCounts)
      return
    }
    case 'player_out': {
      if (trackCounts) exhaustCounts(w, runningCounts)
      return
    }
    // A `us54` decline is deliberately absent from this list: declining the
    // declare option emits no PublicEvent at all (RULES_US54.md §3), so it is
    // not merely information-free — it never reaches the log to be walked.
    default:
      return // game_started / pass / designate / endgame / game_over carry no card facts
  }
}

/**
 * Propagate to fixpoint over the CURRENT counts + constraints + candidates.
 *
 * The round cap is a safety net, not a schedule: a round that changes anything
 * fixes or eliminates at least one card, so 2 rounds per card is already far
 * past the fixpoint. It is derived from the deck (96 under `pagat48`, 108 under
 * `us54`) so that a larger deck cannot silently get *fewer* rounds per card
 * than the 48-card default had.
 */
function propagate(w: Work, counts: readonly number[]): void {
  for (let round = 0; round < 2 * w.n; round++) {
    let changed = false

    // Count exhaustion + count forcing per seat (current position).
    for (const s of SEATS) {
      let certain = 0
      const poss: number[] = []
      for (let ci = 0; ci < w.n; ci++) {
        if (w.pos[ci] === s || (w.pos[ci] === ORIGINAL && w.xfix[ci] === s)) certain++
        else if (w.pos[ci] === ORIGINAL && w.xfix[ci] === -1 && (w.cand[ci] & bit(s)) !== 0) poss.push(ci)
      }
      const need = (counts[s] ?? 0) - certain
      if (need <= 0) {
        for (const ci of poss) {
          clearCand(w, ci, s)
          changed = true
        }
      } else if (poss.length === need) {
        for (const ci of poss) {
          fixX(w, ci, s)
          changed = true
        }
      }
      // poss.length < need would be inconsistent input; keep what we have.
    }

    // Single-candidate elimination (also triggered eagerly inside clearCand).
    for (let ci = 0; ci < w.n; ci++) {
      if (w.pos[ci] === ORIGINAL && w.xfix[ci] === -1 && popcount6(w.cand[ci]) === 1) {
        fixX(w, ci, soleSeat(w.cand[ci]))
        changed = true
      }
    }

    // Set-constraint forcing: prune dead disjuncts; fix a lone survivor.
    const surviving: { seat: Seat; cards: number[] }[] = []
    for (const k of w.constraints) {
      let satisfied = false
      const alive: number[] = []
      for (const ci of k.cards) {
        if (w.xfix[ci] === k.seat) {
          satisfied = true
          break
        }
        if (w.xfix[ci] !== -1) continue
        if ((w.cand[ci] & bit(k.seat)) === 0) continue
        alive.push(ci)
      }
      if (satisfied) {
        changed = true
        continue // dropped: satisfied by a known YES
      }
      if (alive.length === 0) {
        changed = true
        continue // dropped: information exhausted
      }
      if (alive.length === 1) {
        fixX(w, alive[0], k.seat)
        changed = true
        continue
      }
      if (alive.length !== k.cards.length) changed = true
      surviving.push({ seat: k.seat, cards: alive })
    }
    w.constraints = surviving

    if (!changed) return
  }
}

/**
 * A fresh working state for the view's deck. Exported as a bounded-arm seam: the fact-replay
 * pass ([bounded.ts](bounded.ts)) applies kept facts to one of these and finishes it through
 * `finishKnowledge`, so its output is materialized by exactly the code `buildKnowledge` runs.
 */
export function newWork(view: SeatView): Work {
  // Everything deck-shaped comes from here. `deckFor` is total: a view with no
  // config (or an unknown variant off the wire) yields the 48-card default,
  // which is exactly the behaviour every existing caller already had.
  const deck = deckFor(view.config)
  const n = deck.cards.length
  return {
    deck,
    n,
    pos: new Array<number>(n).fill(ORIGINAL),
    cand: new Array<number>(n).fill(FULL_MASK),
    xfix: new Array<number>(n).fill(-1),
    constraints: [],
    at: 0,
  }
}

/**
 * Resolved books are public table state (view.books), not memory: their
 * cards are out of play regardless of how much log the viewer retains.
 * Under a truncated window the claim event may fall outside it, so GONE is
 * seeded from view.books BEFORE the walk. Under a full walk the claim events
 * handle it chronologically (seeding first would wrongly discard the real
 * asks that preceded the claim); books are re-applied after as a safety net
 * for views whose log is inconsistent with their books.
 *
 * The set list is the config's, not the 48-card one: under `us54` that is the
 * eight half-suits **plus EIGHTS** (RULES_US54.md §1 row 3). Missing EIGHTS
 * here would leave a resolved set's four 8s and both jokers circulating as
 * live cards, which is the silent-corruption failure this file guards against.
 */
export function markResolvedGone(w: Work, view: SeatView): void {
  for (const b of w.deck.books) {
    if (!view.books?.[b]) continue
    for (const c of setCards(w, b)) {
      const ci = w.deck.order.get(c)
      if (ci !== undefined) w.pos[ci] = GONE
    }
  }
}

/**
 * The full-fidelity recorded walk — the bounded arm's derivation pass. Identical to the walk
 * `buildKnowledge` runs at hard skill (whole log, constraints on, historical count exhaustion
 * live), plus a `WalkRecord` of when each atomic certification landed. The returned Work is
 * post-walk, pre-injection: `finishKnowledge` has NOT run, so the constraints are exactly the
 * recorded ones (index-aligned with `rec.constraintAt`) and the candidate masks carry only what
 * the log itself certifies.
 */
/**
 * MONET.md §3.6a A2 — the centre of the per-seat update: with ground truth on the six fit seeds
 * (240 mirror games of v0.4c, 1,798 successful declarations) a seat that had asked into the resolved
 * half-suit was dealt 1.576 of its six cards on average (1.185 when it held one and never asked). A
 * seat whose asks say exactly that keeps its multiplier at 1; only a seat whose asks say more, or
 * less, than everyone's moves.
 */
export const CHOICE_ADAPT_CENTRE = 1.58

export function recordedWalk(view: SeatView): { w: Work; rec: WalkRecord } {
  const opts: Required<KnowledgeOptions> = { logWindow: Number.POSITIVE_INFINITY, useConstraints: true, marginal: false, choiceKappa: 0, choiceAdapt: 0 }
  const ownCardToggle = view.config?.toggles?.askOwnCardAllowed === true
  const log: readonly PublicEvent[] = Array.isArray(view.log) ? view.log : []
  const w = newWork(view)
  const rec: WalkRecord = {
    movedAt: new Array<number>(w.n).fill(-1),
    fixedAt: new Array<number>(w.n).fill(-1),
    clearedAt: new Array<number>(w.n * 6).fill(-1),
    constraintAt: [],
  }
  w.rec = rec
  const runningCounts = new Array<number>(6).fill(w.deck.handSize)
  for (let i = 0; i < log.length; i++) {
    w.at = i
    ingest(w, log[i], runningCounts, opts, ownCardToggle, true)
  }
  markResolvedGone(w, view)
  return { w, rec }
}

/**
 * Rebuild the knowledge state for `view.seat` from the public log, the public
 * counts, and the viewer's own hand. Pure and deterministic; never throws on
 * malformed input (degrades to weaker knowledge instead).
 */
export function buildKnowledge(view: SeatView, options: KnowledgeOptions = {}): Knowledge {
  const opts: Required<KnowledgeOptions> = {
    logWindow: options.logWindow ?? Number.POSITIVE_INFINITY,
    useConstraints: options.useConstraints ?? true,
    marginal: options.marginal ?? false,
    choiceKappa: options.choiceKappa ?? 0,
    choiceAdapt: options.choiceAdapt ?? 0,
  }
  const ownCardToggle = view.config?.toggles?.askOwnCardAllowed === true
  const log: readonly PublicEvent[] = Array.isArray(view.log) ? view.log : []
  const windowed = opts.logWindow < log.length
  const events = windowed ? log.slice(log.length - opts.logWindow) : log

  const w = newWork(view)

  // With a truncated window the replayed running counts would be wrong, so
  // historical count exhaustion is only applied when the whole log is walked.
  const trackCounts = !windowed
  if (windowed) markResolvedGone(w, view)
  // Deal-time hand size, from the deck: 8 under `pagat48`, 9 under `us54`
  // (RULES.md row 4 / RULES_US54.md §1 row 4). Seeding 8 for a 54-card game
  // would make every seat's count-exhaustion test fire one card early and start
  // eliminating seats that are still genuinely possible — false certainties,
  // with nothing thrown to notice them by.
  const runningCounts = new Array<number>(6).fill(w.deck.handSize)
  for (const ev of events) ingest(w, ev, runningCounts, opts, ownCardToggle, trackCounts)
  const k = finishKnowledge(w, view)
  // MONET.md §3.6a: the ask-choice prior's evidence — asks per (book, seat) over the walked events,
  // every seat but the viewer — attached only when κ > 0, so every other build keeps its shape.
  // A2 (`choiceAdapt > 0`): the same walk, in order, also reads every SUCCESSFUL declaration — the
  // one event that publishes true holders on the host — and moves each asking seat's multiplier on
  // κ by η · (cards of that half-suit the seat was dealt − CHOICE_ADAPT_CENTRE), clipped to [0, 2].
  // The dealt count is the walk's own `xfix` (a card that never moved is fixed by the declaration,
  // one that moved by its first hit); a half-suit with any deal holder unknown is skipped.
  if (opts.marginal && opts.choiceKappa > 0) {
    const asksInto: NonNullable<Knowledge['asksInto']> = {}
    const seatMul = opts.choiceAdapt > 0 ? [1, 1, 1, 1, 1, 1] : undefined
    for (const ev of events) {
      if (ev.type === 'ask') {
        if (ev.asker === k.seat) continue
        if (w.deck.order.get(ev.card) === undefined) continue
        const b = cardBook(ev.card)
        const row = asksInto[b] ?? (asksInto[b] = [0, 0, 0, 0, 0, 0])
        row[ev.asker]++
      } else if (ev.type === 'claim' && seatMul !== undefined) {
        if (ev.outcome === 'void' || (ev.outcome === 'team0' ? 0 : 1) !== seatTeam(ev.claimer)) continue
        const row = asksInto[ev.book]
        if (row === undefined) continue
        const dealt = [0, 0, 0, 0, 0, 0]
        let known = true
        for (const c of setCards(w, ev.book)) {
          const ci = w.deck.order.get(c)
          const h = ci === undefined ? -1 : w.xfix[ci]
          if (h < 0) {
            known = false
            break
          }
          dealt[h]++
        }
        if (!known) continue
        for (let s = 0; s < 6; s++) {
          if (s === k.seat || (row[s] ?? 0) === 0) continue
          seatMul[s] = Math.min(2, Math.max(0, seatMul[s] + opts.choiceAdapt * (dealt[s] - CHOICE_ADAPT_CENTRE)))
        }
      }
    }
    k.asksInto = asksInto
    k.choiceKappa = opts.choiceKappa
    if (seatMul !== undefined) k.choiceSeat = seatMul
  }
  // MONET.md §3.4a: the calibrated marginal is derived here, on the unbounded path only — never
  // inside `finishKnowledge`, which the bounded arm's replay shares (the §3.4a scope decision).
  if (opts.marginal) attachMarginal(k)
  return k
}

/**
 * The shared tail: the post-walk resolved-book safety net, the own-hand injection, the
 * fixpoint propagation over the CURRENT public counts, and the materialization. Split from
 * `buildKnowledge` so the bounded arm's fact-replay finishes through the identical code — the
 * large-budget equivalence pin (tests/bots/bounded.test.ts) holds by construction here, not by
 * a parallel implementation staying in step.
 */
export function finishKnowledge(w: Work, view: SeatView): Knowledge {
  const deck = w.deck
  const n = w.n
  markResolvedGone(w, view)

  // Own hand: fully known. Held live cards are mine (if unmoved, they were
  // dealt to me); every other unmoved card was never mine.
  const me = view.seat
  const held = new Set<Card>(Array.isArray(view.hand) ? view.hand : [])
  for (let ci = 0; ci < n; ci++) {
    const c = deck.cards[ci]
    if (w.pos[ci] === GONE) continue
    if (held.has(c)) {
      if (w.pos[ci] === ORIGINAL) {
        if (w.xfix[ci] !== me) {
          w.xfix[ci] = me
          w.cand[ci] = bit(me)
        }
      } else {
        w.pos[ci] = me // trust the hand over an inconsistent (truncated) log
      }
    } else {
      if (w.pos[ci] === me) w.pos[ci] = ORIGINAL // inconsistent truncated log; forget
      if (w.pos[ci] === ORIGINAL) {
        if (w.xfix[ci] === me) {
          w.xfix[ci] = -1
          w.cand[ci] = FULL_MASK & ~bit(me)
        } else {
          clearCand(w, ci, me)
        }
      }
    }
  }

  const counts = Array.isArray(view.counts) ? view.counts : [0, 0, 0, 0, 0, 0]
  propagate(w, counts)

  // Materialize the plain serializable Knowledge object.
  const holders: Partial<Record<Card, Seat>> = {}
  const cands: Partial<Record<Card, Seat[]>> = {}
  const gone: Card[] = []
  const certainAt = [0, 0, 0, 0, 0, 0]
  for (let ci = 0; ci < n; ci++) {
    const c = deck.cards[ci]
    if (w.pos[ci] === GONE) {
      gone.push(c)
      continue
    }
    let holder: Seat | null = null
    if (w.pos[ci] !== ORIGINAL) holder = w.pos[ci] as Seat
    else if (w.xfix[ci] !== -1) holder = w.xfix[ci] as Seat
    if (holder !== null) {
      holders[c] = holder
      cands[c] = [holder]
      certainAt[holder]++
    } else {
      const list: Seat[] = []
      for (const s of SEATS) if ((w.cand[ci] & bit(s)) !== 0) list.push(s)
      cands[c] = list
    }
  }
  const unknownSlots = SEATS.map((s) => Math.max(0, (counts[s] ?? 0) - certainAt[s]))
  const constraints = w.constraints.map((k) => ({
    seat: k.seat,
    cards: k.cards.map((ci) => deck.cards[ci]),
  }))
  return { seat: me, counts: [...counts], holders, cands, gone, unknownSlots, constraints }
}

/* ----------------------------------------------------------- query fns --- */

/** The certainly-known current holder of a live card, else null (gone => null). */
export function holderOf(k: Knowledge, card: Card): Seat | null {
  return k.holders[card] ?? null
}

/** Current candidate holders of a card (certain => one entry; gone => []). */
export function candidates(k: Knowledge, card: Card): Seat[] {
  const c = k.cands[card]
  return c ? [...c] : []
}

/**
 * All live cards certainly located at `seat`, in canonical order.
 *
 * The deck is read off the Knowledge object rather than taken as a parameter:
 * `buildKnowledge` materializes `holders` by walking its deck 0..n-1, and card
 * ids are non-numeric string keys, so JS insertion order *is* that deck's
 * canonical order (and survives a JSON round-trip). That keeps the query
 * functions config-free while still listing a `us54` seat's 8s and jokers —
 * iterating a hardcoded 48-card list here would silently drop them.
 */
export function certainCards(k: Knowledge, seat: Seat): Card[] {
  const out: Card[] = []
  for (const c of Object.keys(k.holders) as Card[]) if (k.holders[c] === seat) out.push(c)
  return out
}

/* --------------------------------------------- foreign (unaskable) sets --- */

/**
 * The unresolved sets the viewer holds **no card of**, in canonical set order.
 *
 * RULES.md row 6 (= RULES_US54.md §1 row 6) makes holding >= 1 card of a set the *only* licence
 * to ask into it, so these are the sets this seat can never ask into: it can only ever watch
 * them. Under `pagat48` that made them nearly worthless to think about — a declare cost a turn
 * action, so spending inference on a set you could not collect was a bad trade. RULES_US54.md
 * row 11 moves declares out of the turn (STYLES.md §1.3), and the project owner's own framing
 * is that this is where the points are:
 *
 * > *"They may also declare for their teammates even if they do not hold a card from the
 * > half-suit, which gives importance to the players who choose to memorize half-suits they do
 * > not own."*
 *
 * Exposed from the inference layer rather than computed ad hoc in the policy layer because it
 * is a *knowledge* question (which sets am I structurally blind to acting on?), because the
 * STYLES.md §4 `foreignDeclareRate` metric needs the same list, and because a seat that is
 * cardless holds none of every set — the degenerate case a hand-rolled check tends to miss.
 *
 * Pure over the view; no knowledge state needed for membership itself (see
 * {@link foreignProvableBooks} for the ones that are actually declarable).
 */
export function unaskableBooks(view: SeatView): BookId[] {
  const deck = deckFor(view.config)
  const held = new Set<Card>(Array.isArray(view.hand) ? view.hand : [])
  const out: BookId[] = []
  for (const b of deck.books) {
    if (view.books?.[b]) continue
    const cards = deck.bookCards.get(b) ?? []
    if (cards.length === 0) continue
    if (!cards.some((c) => held.has(c))) out.push(b)
  }
  return out
}

/**
 * The subset of {@link unaskableBooks} whose six cards are **all certainly located on the
 * viewer's own team** — i.e. the foreign sets this seat can prove outright and declare for its
 * teammates (RULES_US54.md row 15). Exactly the Archivist's target list, and the numerator of
 * STYLES.md §4's `foreignDeclareRate`.
 */
export function foreignProvableBooks(k: Knowledge, view: SeatView): BookId[] {
  const myTeam = seatTeam(k.seat)
  const deck = deckFor(view.config)
  const out: BookId[] = []
  for (const b of unaskableBooks(view)) {
    const cards = deck.bookCards.get(b) ?? []
    let all = cards.length > 0
    for (const c of cards) {
      const h = k.holders[c]
      if (h === undefined || seatTeam(h) !== myTeam) {
        all = false
        break
      }
    }
    if (all) out.push(b)
  }
  return out
}

/* ------------------------------------------------------------ rankAsks --- */

const SUIT_SYMBOL: Record<string, string> = { C: '♣', D: '♦', H: '♥', S: '♠' }

/**
 * "9H" -> "9♥" for human-readable coach reasons.
 *
 * The `us54` EIGHTS set has **no suit structure** (RULES_US54.md §1 row 3): its
 * four 8s still render suited ("8♥"), but a joker id carries no suit at all —
 * `'XR'[1]` is `'R'`, not a `Suit` — so the jokers are named outright instead of
 * being run through the suit table, which would have printed "XR".
 *
 * Exported for the policy layer's `decideExplained` traces, so every prose surface renders a
 * card the same way and the assistant pane never shows "XR" beside "the red joker".
 */
export function pc(card: Card): string {
  if (card === 'XR') return 'the red joker'
  if (card === 'XB') return 'the black joker'
  return `${card[0]}${SUIT_SYMBOL[card[1]] ?? card[1]}`
}

/**
 * Probability estimate that `target` currently holds `card` — the model's own number. On a
 * Knowledge built without the marginal it is the slot prior: the target's unidentified slots over
 * the total unidentified slots of all candidate seats (every unknown slot is, to first order,
 * equally likely to be this card). On a Knowledge built with `marginal: true` (MONET.md §3.4a) it
 * is read off the scaled card × seat table instead. Certainties are the same on both: a card with
 * one candidate is 1 there and 0 elsewhere, a gone card is 0 everywhere.
 */
export function askHitProbability(k: Knowledge, card: Card, target: Seat): number {
  return pHit(k, card, target)
}

/**
 * The slot prior itself, whatever the Knowledge was built with. The calibration harness reads this
 * beside `askHitProbability` so the two models can be laid side by side on the same asks; nothing
 * on the decision path calls it.
 */
export function slotPriorHitProbability(k: Knowledge, card: Card, target: Seat): number {
  const cand = k.cands[card]
  if (!cand || cand.length === 0) return 0
  if (!cand.includes(target)) return 0
  if (cand.length === 1) return 1
  return slotPrior(k, cand, target)
}

/**
 * HARD-tier refinement of askHitProbability: surviving set-constraints are
 * folded in. If `target` provably was dealt at least one card of a set S and
 * `card` is one of the members still possibly with `target`, then
 * P(target holds card) is at least about 1/|S alive| on top of the slot prior:
 *   refined = max(base, base + (1 - base) / |S alive|)
 * over the tightest such constraint. First-order (ignores overlap between
 * constraints), monotone (never below base), and zero-cost when no constraint
 * mentions the card. This is the "deeper inference" edge the hard tier has
 * over medium's slot prior.
 */
export function refinedHitProbability(k: Knowledge, card: Card, target: Seat): number {
  const base = pHit(k, card, target)
  if (base === 0 || base === 1) return base
  // MONET.md §3.4a: a marginal table already carries every surviving constraint, folded on every
  // scaling round with the margins restored after each — so the first-order fold below would
  // count the same evidence twice. The ceiling is the same one the fold applies.
  if (marginalFor(k)) return Math.min(1 - 1e-9, base)
  let best = base
  for (const kc of k.constraints) {
    if (kc.seat !== target) continue
    // Only members that could still be with the target right now matter.
    const alive = kc.cards.filter((u) => {
      const cu = k.cands[u]
      return cu !== undefined && cu.length > 1 && cu.includes(target)
    })
    if (alive.length === 0 || !alive.includes(card)) continue
    const boosted = base + (1 - base) / alive.length
    if (boosted > best) best = boosted
  }
  return Math.min(1 - 1e-9, best) // never claim certainty from a probabilistic boost
}

/** Probability estimate that `target` currently holds `card`, given knowledge. */
function pHit(k: Knowledge, card: Card, target: Seat): number {
  const cand = k.cands[card]
  if (!cand || cand.length === 0) return 0
  if (!cand.includes(target)) return 0
  if (cand.length === 1) return 1
  // MONET.md §3.4a: a Knowledge built with the marginal answers from its table. `null` is a table
  // that could not be scaled (an inconsistent view), and `undefined` a Knowledge built without one;
  // both read the slot prior, so no reader ever sees a fabricated number.
  const table = marginalFor(k)
  if (table) {
    const m = marginalHitProbability(table, card, target)
    if (m !== undefined) return m
  }
  return slotPrior(k, cand, target)
}

/**
 * The slot prior over a card's candidate seats: weight each candidate seat by its
 * unidentified-card slots — every unknown slot is (to first order) equally likely to be this
 * card. The number every bot shipped before Monet v0.4a acted on.
 */
function slotPrior(k: Knowledge, cand: readonly Seat[], target: Seat): number {
  let total = 0
  for (const s of cand) total += k.unknownSlots[s]
  if (total <= 0) return 1 / cand.length
  return k.unknownSlots[target] / total
}

/**
 * Does the viewer's TEAM certainly hold `card` right now?
 *
 * "Certainly" in this layer's sense: the card has a single named holder, not a candidate set
 * that happens to be all teammates. The viewer's own hand counts — it is on the viewer's team —
 * and so does every teammate's, which is the part the `gambleBonus` guard in `rankAsksWith`
 * has to allow for. Factored out of `teamKnownOfBook` so that the count and the per-card test
 * cannot disagree about what "the team holds it" means.
 */
function teamCertainlyHolds(k: Knowledge, card: Card): boolean {
  const h = k.holders[card]
  return h !== undefined && seatTeam(h) === seatTeam(k.seat)
}

/**
 * How many of the set's cards the viewer's team certainly accounts for.
 * `cards` is the set's membership under the *view's* deck, so EIGHTS resolves
 * to 8C·8D·8H·8S·XR·XB under `us54` and to [] under `pagat48`, which has no
 * such set (RULES_US54.md §1 row 3).
 *
 * Whole-team, teammates included — see `teamCertainlyHolds`. A caller that needs "every card
 * of the set except the one I am asking for" must exclude the asked card itself; this total
 * will not do it for them.
 */
function teamKnownOfBook(k: Knowledge, cards: readonly Card[]): number {
  let n = 0
  for (const c of cards) if (teamCertainlyHolds(k, c)) n++
  return n
}

/**
 * The shipped ask-score weights: `70*pHit + 18*progress + 12*narrowing + 20 certainty`.
 *
 * Duplicated from [style.ts](style.ts)'s `BASELINE_ASK_WEIGHTS` rather than imported, so the
 * inference layer keeps its one-way dependency on the policy layer (nothing in `knowledge.ts`
 * imports `style.ts`). `tests/bots/style.test.ts` pins the two copies equal.
 */
const DEFAULT_ASK_WEIGHTS: AskWeights = Object.freeze({
  wHit: 70,
  wProgress: 18,
  wNarrow: 12,
  certaintyBonus: 20,
  minHitP: 0,
  gambleBonus: 0,
})

/**
 * Score every legal ask for the viewing seat against prebuilt knowledge.
 * Deterministic: sorted score-desc, then canonical card order, then target.
 *
 * Scoring (documented for the Phase-4 coach overlay), with the weights supplied by the caller's
 * play style (STYLES.md §2) and defaulting to the shipped baseline:
 *   score = wHit*pHit + wProgress*progress + wNarrow*narrowing
 *           (+certaintyBonus when the hit is CERTAIN) (+gambleBonus when it would COMPLETE)
 *   - pHit: probability the target holds the card; known misses contribute 0.
 *     The +20 certainty bonus makes a certain hit (>= 102) strictly dominate
 *     every uncertain ask (< 100), so "certain hits first" holds by sort order
 *     — which is why STYLES.md §2 requires `certaintyBonus >= 20` of every style.
 *   - progress: fraction of the asked book already certainly on the asker's
 *     team — winning a card of a nearly-secured book is worth more.
 *   - narrowing: 1/(candidates-1) when the target is one of the candidates —
 *     a miss on a 2-candidate card pins the card outright, so tight candidate
 *     sets make even a miss informative. Zero when it is not: an ask can only
 *     narrow the set by ruling out the seat it was addressed to, so a KNOWN
 *     MISS teaches this seat nothing whatever the set's size.
 *   - gamble: the asker's team certainly accounts for every card of the set
 *     EXCEPT THE ONE BEING ASKED FOR, so a hit completes it outright.
 *
 * `minHitP` is deliberately NOT applied here: dropping asks from the ranking would let a style
 * talk itself out of having a legal move. The policy layer filters with a fallback instead.
 */
export function rankAsksWith(
  view: SeatView,
  k: Knowledge,
  weights: AskWeights = DEFAULT_ASK_WEIGHTS,
): RankedAsk[] {
  const asks = legalAsksFromView(view)
  // Same deck the knowledge was built on: it supplies each set's membership and
  // the canonical index used as the deterministic sort tiebreak.
  const deck = deckFor(view.config)
  const out: RankedAsk[] = []
  for (const a of asks) {
    const cand = k.cands[a.card] ?? []
    const p = pHit(k, a.card, a.target)
    const book = cardBook(a.card)
    // Every set is six cards in both rule sets — only the *number* of sets
    // changes, 8 vs 9 (RULES_US54.md §1 row 3) — but the denominator is still
    // read off the deck rather than written as a literal.
    const bookMembers = bookCards(book, view.config)
    const known = teamKnownOfBook(k, bookMembers)
    const progress = bookMembers.length > 0 ? known / bookMembers.length : 0
    // How much the OUTCOME of this ask would narrow the card's candidate set.
    //
    // The test is MEMBERSHIP, not cardinality, and the distinction is the whole fix. An ask can
    // only narrow `cand` by removing the seat it was addressed to, so a target that is not in
    // `cand` narrows nothing WHATEVER the set's size — the miss is already priced in, and the
    // seat learns exactly what it knew before. Keying the credit off `cand.length` alone paid
    // full `wNarrow` to every provable miss on a card pinned to two or more seats, which is the
    // dominant class: a card pinned to the asker's own TEAMMATES scored the maximum 1 while no
    // opponent could possibly answer it. **A known miss narrows nothing**, and this is the line
    // that makes that true rather than merely stated.
    //
    // Among the asks that DO narrow — `target` a live candidate — the value is 1/(n - 1): a miss
    // on one of n candidates leaves n - 1, so a 2-candidate card is pinned outright (1) and a
    // wide one is worth proportionally less. `n === 1` is then `cand === [target]`, a CERTAIN
    // hit, and it takes the same 1: that is what puts the certain-hit floor at
    // `wHit + wNarrow + certaintyBonus` (102 on the shipped weights), the margin the "certain
    // hits first" note above argues from. It is also the guard against 1/0.
    //
    // Every case this reaches has `p === 0` (`pHit` returns 0 the moment `target` is outside
    // `cand`, empty set included), so no ask with a live hit probability moves — MONET.md §3.2
    // acceptance item 1.
    const narrowing = cand.includes(a.target) ? (cand.length > 1 ? 1 / (cand.length - 1) : 1) : 0
    const certainBonus = p === 1 ? weights.certaintyBonus : 0
    // "Would complete": the team certainly holds every card of the set except this one, so this
    // one ask is the whole remainder.
    //
    // The asked card has to be excluded EXPLICITLY. Row 7 forbids asking for a card *you* hold,
    // but `teamKnownOfBook` counts every card whose certain holder is on the asker's TEAM,
    // teammates included — so the asked card can perfectly well be one of the `known`. When it
    // is, the card the team is actually missing is a different one, a hit here would complete
    // nothing, and `known === bookMembers.length - 1` means only "five of six", not "this ask is
    // the sixth". (Such an ask is also dead by construction: a card a teammate certainly holds
    // cannot be with the opponent being asked, so `p` is 0 — which is what confines this fix, like
    // the narrowing one above, to the population MONET.md §3.2's acceptance item 1 excludes.) On
    // the shipped Punter weights it was 25 of the 52.00 an avoidable dead ask used to score; the
    // narrowing credit above was another 12 of it.
    //
    // With the asked card excluded, the test says exactly what its name claims: the one card of
    // the set this team does not certainly hold is the one being asked for.
    const gamble =
      weights.gambleBonus !== 0 &&
      bookMembers.length > 0 &&
      known === bookMembers.length - 1 &&
      !teamCertainlyHolds(k, a.card)
        ? weights.gambleBonus
        : 0
    const score =
      Math.round(
        (weights.wHit * p +
          weights.wProgress * progress +
          weights.wNarrow * narrowing +
          certainBonus +
          gamble) *
          100,
      ) / 100
    let reason: string
    if (p === 1) {
      reason = `Seat ${a.target} is known to hold ${pc(a.card)}`
    } else if (p === 0) {
      reason = `Seat ${a.target} is known not to hold ${pc(a.card)} — this ask hands over the turn`
    } else {
      const pct = Math.round(p * 100)
      const narrowNote =
        cand.length === 2
          ? 'a miss pins it on the other seat'
          : `a miss narrows ${pc(a.card)} to ${cand.length - 1} seats`
      reason = `${pct}% that seat ${a.target} holds ${pc(a.card)} (${cand.length} candidate seats); ${narrowNote}`
    }
    out.push({ target: a.target, card: a.card, score, p, reason })
  }
  out.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score
    const cx = deck.order.get(x.card) ?? 0
    const cy = deck.order.get(y.card) ?? 0
    if (cx !== cy) return cx - cy
    return x.target - y.target
  })
  return out
}

/**
 * Every legal ask for the viewing seat, scored. Public entry point for the
 * Phase-4 coach overlay: build knowledge from the view, then rank.
 */
export function rankAsks(view: SeatView): RankedAsk[] {
  return rankAsksWith(view, buildKnowledge(view))
}
