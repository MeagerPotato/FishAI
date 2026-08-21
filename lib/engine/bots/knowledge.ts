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

/** Six seats in both rule sets — see the header; never derived from the deck. */
const FULL_MASK = 0b111111
const ORIGINAL = -1
const GONE = -2
const SEATS: readonly Seat[] = [0, 1, 2, 3, 4, 5]

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

/** Mutable working state while building. */
interface Work {
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

function fixX(w: Work, ci: number, s: Seat): void {
  if (w.xfix[ci] !== -1) return // keep the first derivation; conflicts = inconsistent input
  w.xfix[ci] = s
  w.cand[ci] = bit(s)
}

function clearCand(w: Work, ci: number, s: Seat): void {
  if (w.xfix[ci] !== -1) return
  const next = w.cand[ci] & ~bit(s)
  if (next === 0 || next === w.cand[ci]) {
    // Never empty a candidate set (inconsistent input under truncated logs);
    // leave the last belief in place rather than fabricating certainty.
    return
  }
  w.cand[ci] = next
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
 * Rebuild the knowledge state for `view.seat` from the public log, the public
 * counts, and the viewer's own hand. Pure and deterministic; never throws on
 * malformed input (degrades to weaker knowledge instead).
 */
export function buildKnowledge(view: SeatView, options: KnowledgeOptions = {}): Knowledge {
  const opts: Required<KnowledgeOptions> = {
    logWindow: options.logWindow ?? Number.POSITIVE_INFINITY,
    useConstraints: options.useConstraints ?? true,
  }
  const ownCardToggle = view.config?.toggles?.askOwnCardAllowed === true
  const log: readonly PublicEvent[] = Array.isArray(view.log) ? view.log : []
  const windowed = opts.logWindow < log.length
  const events = windowed ? log.slice(log.length - opts.logWindow) : log

  // Everything deck-shaped comes from here. `deckFor` is total: a view with no
  // config (or an unknown variant off the wire) yields the 48-card default,
  // which is exactly the behaviour every existing caller already had.
  const deck = deckFor(view.config)
  const n = deck.cards.length

  const w: Work = {
    deck,
    n,
    pos: new Array<number>(n).fill(ORIGINAL),
    cand: new Array<number>(n).fill(FULL_MASK),
    xfix: new Array<number>(n).fill(-1),
    constraints: [],
  }

  // Resolved books are public table state (view.books), not memory: their
  // cards are out of play regardless of how much log the viewer retains.
  // Under a truncated window the claim event may fall outside it, so GONE is
  // seeded from view.books BEFORE the walk. Under a full walk the claim events
  // handle it chronologically (seeding first would wrongly discard the real
  // asks that preceded the claim); books are re-applied after as a safety net
  // for views whose log is inconsistent with their books.
  //
  // The set list is the config's, not the 48-card one: under `us54` that is the
  // eight half-suits **plus EIGHTS** (RULES_US54.md §1 row 3). Missing EIGHTS
  // here would leave a resolved set's four 8s and both jokers circulating as
  // live cards, which is the silent-corruption failure this file guards against.
  const markResolvedGone = (): void => {
    for (const b of deck.books) {
      if (!view.books?.[b]) continue
      for (const c of setCards(w, b)) {
        const ci = deck.order.get(c)
        if (ci !== undefined) w.pos[ci] = GONE
      }
    }
  }

  // With a truncated window the replayed running counts would be wrong, so
  // historical count exhaustion is only applied when the whole log is walked.
  const trackCounts = !windowed
  if (windowed) markResolvedGone()
  // Deal-time hand size, from the deck: 8 under `pagat48`, 9 under `us54`
  // (RULES.md row 4 / RULES_US54.md §1 row 4). Seeding 8 for a 54-card game
  // would make every seat's count-exhaustion test fire one card early and start
  // eliminating seats that are still genuinely possible — false certainties,
  // with nothing thrown to notice them by.
  const runningCounts = new Array<number>(6).fill(deck.handSize)
  for (const ev of events) ingest(w, ev, runningCounts, opts, ownCardToggle, trackCounts)
  markResolvedGone()

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
 */
function pc(card: Card): string {
  if (card === 'XR') return 'the red joker'
  if (card === 'XB') return 'the black joker'
  return `${card[0]}${SUIT_SYMBOL[card[1]] ?? card[1]}`
}

/**
 * Probability estimate that `target` currently holds `card`: the target's
 * unidentified slots over the total unidentified slots of all candidate seats
 * (every unknown slot is, to first order, equally likely to be this card).
 */
export function askHitProbability(k: Knowledge, card: Card, target: Seat): number {
  return pHit(k, card, target)
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
  // Weight each candidate seat by its unidentified-card slots: every unknown
  // slot is (to first order) equally likely to be this card.
  let total = 0
  for (const s of cand) total += k.unknownSlots[s]
  if (total <= 0) return 1 / cand.length
  return k.unknownSlots[target] / total
}

/**
 * How many of the set's cards the viewer's team certainly accounts for.
 * `cards` is the set's membership under the *view's* deck, so EIGHTS resolves
 * to 8C·8D·8H·8S·XR·XB under `us54` and to [] under `pagat48`, which has no
 * such set (RULES_US54.md §1 row 3).
 */
function teamKnownOfBook(k: Knowledge, cards: readonly Card[]): number {
  const myTeam = seatTeam(k.seat)
  let n = 0
  for (const c of cards) {
    const h = k.holders[c]
    if (h !== undefined && seatTeam(h) === myTeam) n++
  }
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
 *   - narrowing: 1/(candidates-1) — a miss on a 2-candidate card pins the
 *     card outright, so tight candidate sets make even a miss informative.
 *   - gamble: the asker's team certainly accounts for every card of the set but
 *     this one, so a hit completes it outright.
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
    const narrowing = cand.length > 1 ? 1 / (cand.length - 1) : 1
    const certainBonus = p === 1 ? weights.certaintyBonus : 0
    // "Would complete": the team already certainly holds every other card of the set, so this
    // one ask is the whole remainder. `known` counts only certainly-team-held cards, and the
    // asked card is by construction not one of them (row 7 — you cannot ask for what you hold).
    const gamble =
      weights.gambleBonus !== 0 && bookMembers.length > 0 && known === bookMembers.length - 1
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
