/**
 * bounded.ts — Bass v1.5: the bounded-memory ladder (PLAYSTYLES.md S44–S48).
 *
 * Memory capacity capped **in bits**, with the eviction policy S47 names: rank facts by
 * contestability, not recency. The cost model is Sanjay Kannan's, verbatim from the S44
 * framework specification: **2 bits** per card fact ("player X has card Z" / "player X does not
 * have card Z"), **1 bit** per basis fact ("player X has a basis in book Y", and its negative).
 * The reference `ActivePlayer` refills memory from scratch each turn — full-fidelity derivation,
 * budget-capped retention — so the faithful implementation here is a stateless, pure
 * re-derivation from the whole public log at every decision, never an incremental store.
 *
 * ## The two passes
 *
 * 1. **Derivation** (`deriveBoundedFacts`): the full-fidelity recorded walk of
 *    [knowledge.ts](knowledge.ts) (`recordedWalk` — the identical ingestion `buildKnowledge`
 *    runs at hard skill), read back as timestamped atomic facts. Nothing is invented: a hit
 *    locates a card, an ask certifies the asker's basis and their lack of the named card, a
 *    miss certifies the target's lack, historical count exhaustion certifies eliminations, and
 *    a claim resolves its book and retires every fact on it — exactly the certifications
 *    [observe.ts](observe.ts) documents for the public log.
 * 2. **Reconstruction** (`restrictedKnowledge`): kept facts are replayed in log order onto a
 *    fresh working state through the same primitives (`fixX`, `clearCand`, the constraint
 *    list), then finished by `finishKnowledge` — the own-hand injection, the fixpoint
 *    propagation over the CURRENT public counts, and the materialization `buildKnowledge`
 *    itself runs. With every fact kept the replay reproduces the full walk's state, so the
 *    large-budget output is IDENTICAL to `buildKnowledge`'s by shared machinery, not by a
 *    parallel implementation staying in step (the anchor pin of tests/bots/bounded.test.ts).
 *
 * ## What is free, and the S45 subtlety
 *
 * Own hand is free (the seat can see it: the injection runs at every budget). The public board
 * state is free — resolved books are seeded GONE from `view.books`, current counts drive the
 * final propagation — because S48 keeps observation history and display policy separate axes.
 * The reconstruction never replays running hand counts at all: historical count exhaustion runs
 * only inside the full-fidelity derivation pass, and its eliminations reach the replay as kept
 * lacks-card facts. A fact-filtered replay of the counts themselves would be wrong the moment a
 * hit's fact was evicted — the same corruption knowledge.ts's logWindow path avoids by seeding
 * resolved books from public state rather than from a truncated walk.
 *
 * ## Retirement (what never enters the pool)
 *
 * Facts the free state reproduces at any budget are not enumerated, so the budget is never
 * spent on them: everything on a resolved book (claims retire their facts); the viewer's own
 * lacks ("I do not hold c" — the injection eliminates the viewer from every unheld card); a
 * card dealt to the viewer and still held; the viewer's own basis constraints (the injected
 * hand satisfies or exhausts them in the first propagation round, so they never survive to the
 * output either way). A card fact subsumes the eliminations on its card, and a no-basis fact
 * subsumes the per-card lacks facts it compresses — one bit instead of up to twelve.
 *
 * ## Spotlight ranking (S47) and the budget
 *
 * Each live book is scored by how much the seat's own hand plus the derived facts bear on it
 * (2 per held card — a held card is a card fact the seat gets for free — plus the bit cost of
 * every pool fact on the book), the `spotlight()` mechanism of the reference implementation.
 * Facts rank by (book score desc, recency desc, then a stable total order: card in deck order,
 * seat, kind), and the kept set is the longest ranked prefix whose total cost fits the budget.
 * Deterministic throughout: no Date, no Math.random, ties broken by construction.
 *
 * ## Where `PolicySpec` widens, and why here
 *
 * Same acyclic arrangement as [adaptive.ts](adaptive.ts), one layer further out: this module
 * imports the v1.0 union from adaptive.ts (type-only) and re-exports it widened with
 * `BoundedSpec`; decide.ts and the barrels import THE `PolicySpec` from here. adaptive.ts knows
 * nothing of this module, style.ts refuses the bounded shape structurally (a `TypeError` —
 * bounded policies resolve inside decide, with a view), and the dependency between decide.ts
 * and this file is strictly one-way: decide imports bounded, never the reverse.
 */
import type { BookId, Card, Seat } from '../types.ts'
import { cardBook, deckFor } from '../cards.ts'
import type { Knowledge, SeatView } from './types.ts'
import type { StyleId } from './roster.ts'
import type { PolicySpec as AdaptivePolicySpec } from './adaptive.ts'
import {
  POS_GONE,
  POS_ORIGINAL,
  clearCand,
  finishKnowledge,
  fixX,
  markResolvedGone,
  newWork,
  recordedWalk,
} from './knowledge.ts'

/** The fifth `PolicySpec` shape: Bass v1.5, the bounded-memory policy. */
export interface BoundedSpec {
  bounded: true
  /** The memory budget in bits. >= 0 integer; anything else degrades to 0, never throws. */
  bits: number
  /** The style whose policy runs over the restricted knowledge. Default 'balanced'. */
  style?: StyleId
}

/**
 * The full policy union `decide` accepts — the v1.0 union of [adaptive.ts](adaptive.ts) plus
 * the bounded shape. Defined here rather than there to keep the module graph acyclic (see the
 * file header); the barrels re-export this as THE `PolicySpec`.
 */
export type PolicySpec = AdaptivePolicySpec | BoundedSpec

/** The `BoundedSpec` defaults, exported so decide.ts, trace prose and tests state one value. */
export const BOUNDED_DEFAULTS = Object.freeze({
  style: 'balanced' as StyleId,
})

/**
 * Is this policy spec the bounded shape? The one narrow question decide.ts asks before
 * resolving. `Object.hasOwn` rather than `in`: the flag must be the spec's own, not something
 * a prototype smuggled in.
 */
export function isBoundedSpec(spec: unknown): spec is BoundedSpec {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    Object.hasOwn(spec, 'bounded') &&
    (spec as { bounded: unknown }).bounded === true
  )
}

/** The four S44 fact kinds. Card facts cost 2 bits, basis facts 1 — the framework's own prices. */
export type BoundedFactKind = 'has-card' | 'lacks-card' | 'basis' | 'no-basis'

/**
 * One derivable atomic fact. `at` is the absolute index of the certifying log event — the
 * recency axis — and `book` is the set the fact bears on — the spotlight axis. The payload
 * carries exactly what the replay needs to re-apply the certification and nothing more.
 */
export interface BoundedFact {
  kind: BoundedFactKind
  cost: 1 | 2
  book: BookId
  at: number
  /** The seat the fact is about (the holder, the lacker, or the basis holder). */
  seat: Seat
  /** has-card / lacks-card: the card. */
  card?: Card
  /** has-card: the current public location, present when the card has publicly moved. */
  pos?: Seat
  /** has-card: the revealed deal holder. Every public move fixes it, so moved cards carry it. */
  dealtTo?: Seat
  /** basis: the at-least-one-of disjunction as it stood when certified (record-time pruning). */
  cards?: readonly Card[]
}

/**
 * Every atomic fact the full public log certifies for this seat, in a deterministic
 * construction order (cards in deck order, then constraints in log order, then the no-basis
 * compression). See the file header for the retirement rules; the ranking is separate
 * (`rankBoundedFacts`) so tests can pin pool and order independently.
 */
export function deriveBoundedFacts(view: SeatView): BoundedFact[] {
  const { w, rec } = recordedWalk(view)
  const deck = w.deck
  const me = view.seat
  const held = new Set<Card>(Array.isArray(view.hand) ? view.hand : [])
  const facts: BoundedFact[] = []
  // Indices into `facts` of the lacks-card entries, keyed per (book, seat) so the no-basis
  // compression below can retire exactly the facts it subsumes.
  const lacksAt = new Map<string, number[]>()

  for (let ci = 0; ci < w.n; ci++) {
    if (w.pos[ci] === POS_GONE) continue
    const card = deck.cards[ci]
    const book = cardBook(card)
    if (view.books?.[book]) continue // resolved: the claim retired the book's facts
    if (w.pos[ci] !== POS_ORIGINAL) {
      // Publicly moved: one card fact carries the current location and the deal reveal the
      // first hit fixed. Intermediate transfers are superseded — only the current location is
      // rememberable — and the eliminations recorded before the fix are subsumed by the fact.
      const s = w.pos[ci] as Seat
      const f: BoundedFact = { kind: 'has-card', cost: 2, book, at: rec.movedAt[ci], seat: s, card, pos: s }
      if (w.xfix[ci] !== -1) f.dealtTo = w.xfix[ci] as Seat
      facts.push(f)
      continue
    }
    if (w.xfix[ci] !== -1) {
      // Dealt holder fixed and never moved: a card fact. Dealt to the viewer and still held is
      // retired — the own-hand injection reproduces it for free at every budget.
      const s = w.xfix[ci] as Seat
      if (s === me && held.has(card)) continue
      facts.push({ kind: 'has-card', cost: 2, book, at: rec.fixedAt[ci], seat: s, card, dealtTo: s })
      continue
    }
    if (held.has(card)) continue // the injection collapses a held card onto the viewer
    for (const s of [0, 1, 2, 3, 4, 5] as const) {
      if (s === me) continue // the injection eliminates the viewer from every unheld card
      if ((w.cand[ci] & (1 << s)) !== 0) continue
      const key = `${book}:${s}`
      const list = lacksAt.get(key)
      if (list) list.push(facts.length)
      else lacksAt.set(key, [facts.length])
      facts.push({ kind: 'lacks-card', cost: 2, book, at: rec.clearedAt[ci * 6 + s], seat: s, card })
    }
  }

  // Basis facts: the surviving record-time constraints, minus the viewer's own (the injected
  // hand satisfies or exhausts a self-constraint in the first propagation round, so it never
  // reaches the output at any budget) and minus resolved books (retired).
  for (let i = 0; i < w.constraints.length; i++) {
    const k = w.constraints[i]
    if (k.seat === me) continue
    if (k.cards.length === 0) continue
    const book = cardBook(deck.cards[k.cards[0]])
    if (view.books?.[book]) continue
    facts.push({
      kind: 'basis',
      cost: 1,
      book,
      at: rec.constraintAt[i],
      seat: k.seat,
      cards: k.cards.map((ci) => deck.cards[ci]),
    })
  }

  // No-basis compression: seat s provably was dealt no card of book Y and publicly holds none
  // of it. One 1-bit fact replaces the per-card lacks facts it subsumes (up to 12 bits). Only
  // emitted when at least one constituent is a log certification — a no-basis the viewer's own
  // hand proves alone is free knowledge the injection already yields.
  const out: BoundedFact[] = []
  const retired = new Set<number>()
  for (const book of deck.books) {
    if (view.books?.[book]) continue
    const cards = deck.bookCards.get(book) ?? []
    if (cards.length === 0) continue
    for (const s of [0, 1, 2, 3, 4, 5] as const) {
      if (s === me) continue
      let all = true
      let at = -1
      for (const c of cards) {
        const ci = deck.order.get(c)
        if (ci === undefined || w.pos[ci] === POS_GONE) {
          all = false
          break
        }
        if (w.pos[ci] !== POS_ORIGINAL) {
          // Moved: s neither holds it now nor was dealt it (every move fixes the deal holder).
          if (w.pos[ci] === s || w.xfix[ci] === s) {
            all = false
            break
          }
          at = Math.max(at, rec.movedAt[ci])
          continue
        }
        if (held.has(c)) continue // in the viewer's hand: free certification, no timestamp
        if (w.xfix[ci] !== -1) {
          if (w.xfix[ci] === s) {
            all = false
            break
          }
          at = Math.max(at, rec.fixedAt[ci])
          continue
        }
        if ((w.cand[ci] & (1 << s)) !== 0) {
          all = false
          break
        }
        at = Math.max(at, rec.clearedAt[ci * 6 + s])
      }
      if (!all || at < 0) continue
      for (const i of lacksAt.get(`${book}:${s}`) ?? []) retired.add(i)
      out.push({ kind: 'no-basis', cost: 1, book, at, seat: s })
    }
  }

  for (let i = 0; i < facts.length; i++) {
    if (!retired.has(i)) out.push(facts[i])
  }
  // Construction order is card-major with the compression appended; restore a single
  // deterministic order (the ranking imposes the real one, this keeps the pool itself stable).
  out.sort(factTotalOrder(deck.order, new Map(deck.books.map((b, i) => [b, i]))))
  return out
}

/** The stable total order shared by the pool and the ranking tiebreak. */
function factTotalOrder(
  order: ReadonlyMap<Card, number>,
  bookIndex: ReadonlyMap<BookId, number>,
): (a: BoundedFact, b: BoundedFact) => number {
  const KIND_RANK: Record<BoundedFactKind, number> = { 'has-card': 0, 'lacks-card': 1, basis: 2, 'no-basis': 3 }
  const cardRank = (f: BoundedFact): number =>
    f.card !== undefined ? (order.get(f.card) ?? 0) : (bookIndex.get(f.book) ?? 0) * 1000
  return (a, b) => {
    if (a.at !== b.at) return b.at - a.at
    const ca = cardRank(a)
    const cb = cardRank(b)
    if (ca !== cb) return ca - cb
    if (a.seat !== b.seat) return a.seat - b.seat
    return KIND_RANK[a.kind] - KIND_RANK[b.kind]
  }
}

/** The ranked pool plus the spotlight scores it was ranked by. */
export interface BoundedRanking {
  /** Every derivable fact: book score desc, then recency desc, then the stable total order. */
  ranked: BoundedFact[]
  /** Per live book: 2 per own-hand card plus the bit cost of every pool fact bearing on it. */
  scores: ReadonlyMap<BookId, number>
}

/**
 * S47's eviction policy: contestability, not recency. A book the seat's hand and evidence
 * already bear on is the book worth spending memory on — the `spotlight()` mechanism of the
 * S44 reference implementation, applied as a ranking over the whole pool rather than a single
 * focus so the budget degrades smoothly. Deterministic: the comparator is a total order.
 */
export function rankBoundedFacts(view: SeatView, facts: readonly BoundedFact[]): BoundedRanking {
  const deck = deckFor(view.config)
  const scores = new Map<BookId, number>()
  for (const b of deck.books) {
    if (!view.books?.[b]) scores.set(b, 0)
  }
  if (Array.isArray(view.hand)) {
    for (const c of view.hand as Card[]) {
      const b = cardBook(c)
      const s = scores.get(b)
      if (s !== undefined) scores.set(b, s + 2)
    }
  }
  for (const f of facts) {
    scores.set(f.book, (scores.get(f.book) ?? 0) + f.cost)
  }
  const bookIndex = new Map(deck.books.map((b, i) => [b, i]))
  const tail = factTotalOrder(deck.order, bookIndex)
  const ranked = [...facts].sort((a, b) => {
    const sa = scores.get(a.book) ?? 0
    const sb = scores.get(b.book) ?? 0
    if (sa !== sb) return sb - sa
    return tail(a, b)
  })
  return { ranked, scores }
}

/**
 * The kept set: the longest ranked prefix whose total cost fits the budget — the reference
 * implementation's "spend until the budget runs out", which stops at the first fact that no
 * longer fits rather than skipping past it for a cheaper one further down. A malformed budget
 * (negative, fractional, NaN) degrades to 0; this runs inside a bot that must never throw.
 */
export function keepWithinBudget(ranked: readonly BoundedFact[], bits: number): BoundedFact[] {
  const budget = Number.isFinite(bits) ? Math.max(0, Math.floor(bits)) : 0
  const kept: BoundedFact[] = []
  let spent = 0
  for (const f of ranked) {
    if (spent + f.cost > budget) break
    kept.push(f)
    spent += f.cost
  }
  return kept
}

/**
 * Replay the kept facts onto a fresh working state and finish it through the shared tail.
 * Resolved books are seeded GONE from the public board first (free state, the logWindow-path
 * precedent), facts apply in log order through the same primitives the full walk uses, and
 * `finishKnowledge` then injects the own hand, propagates over the CURRENT counts and
 * materializes — so the output is the SAME `Knowledge` shape every StyleParams policy already
 * consumes, built by the same code.
 */
function replayFacts(view: SeatView, kept: readonly BoundedFact[]): Knowledge {
  const w = newWork(view)
  markResolvedGone(w, view)
  const order = w.deck.order
  // Log order, not rank order: memory is applied the way it was laid down. Array.sort is
  // stable, so equal timestamps keep the ranked order, which is itself deterministic.
  const chrono = [...kept].sort((a, b) => a.at - b.at)
  for (const f of chrono) {
    switch (f.kind) {
      case 'has-card': {
        const ci = f.card !== undefined ? order.get(f.card) : undefined
        if (ci === undefined || w.pos[ci] === POS_GONE) break
        if (f.dealtTo !== undefined) fixX(w, ci, f.dealtTo)
        if (f.pos !== undefined && w.pos[ci] === POS_ORIGINAL) w.pos[ci] = f.pos
        break
      }
      case 'lacks-card': {
        const ci = f.card !== undefined ? order.get(f.card) : undefined
        if (ci === undefined || w.pos[ci] !== POS_ORIGINAL) break
        clearCand(w, ci, f.seat)
        break
      }
      case 'basis': {
        const cards: number[] = []
        for (const c of f.cards ?? []) {
          const ci = order.get(c)
          if (ci !== undefined) cards.push(ci)
        }
        if (cards.length > 0) w.constraints.push({ seat: f.seat, cards })
        break
      }
      case 'no-basis': {
        for (const c of w.deck.bookCards.get(f.book) ?? []) {
          const ci = order.get(c)
          if (ci === undefined || w.pos[ci] === POS_GONE) continue
          clearCand(w, ci, f.seat)
        }
        break
      }
    }
  }
  return finishKnowledge(w, view)
}

/** What one bounded derivation produced — the numbers the trace and the tests read. */
export interface BoundedRead {
  /** The restricted knowledge the style's policy runs over. */
  knowledge: Knowledge
  /** Derivable facts in the pool. */
  total: number
  /** Facts kept within the budget. */
  kept: number
  /** Bits the kept facts cost (<= the budget). */
  cost: number
  /** The top-scoring live book — the spotlight. Ties to the earlier book in canonical order. */
  spotlight: BookId | null
}

/**
 * The whole bounded pipeline for one decision: derive, rank, keep, replay. Pure over
 * `(view, spec)`; called by decide.ts at resolution time so `decide` and `decideExplained`
 * consume the identical restricted knowledge.
 */
export function boundedRead(view: SeatView, spec: BoundedSpec): BoundedRead {
  const facts = deriveBoundedFacts(view)
  const { ranked, scores } = rankBoundedFacts(view, facts)
  const kept = keepWithinBudget(ranked, spec.bits)
  let cost = 0
  for (const f of kept) cost += f.cost
  let spotlight: BookId | null = null
  let best = -1
  for (const b of deckFor(view.config).books) {
    const s = scores.get(b)
    if (s !== undefined && s > best) {
      best = s
      spotlight = b
    }
  }
  return { knowledge: replayFacts(view, kept), total: facts.length, kept: kept.length, cost, spotlight }
}

/** The restricted `Knowledge` alone — the shape `buildKnowledge` returns, budget-capped. */
export function restrictedKnowledge(view: SeatView, spec: BoundedSpec): Knowledge {
  return boundedRead(view, spec).knowledge
}
