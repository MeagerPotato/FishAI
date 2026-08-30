/**
 * decide.ts — the deterministic bot POLICY layer (SPEC.md §5, BOT_LAB.md §1.3, STYLES.md §2).
 *
 * `decide(view, policy, seed) -> GameAction`. Consumes ONLY the public SeatView (the same
 * payload a human client gets), is pure and deterministic (same view+policy+seed => same
 * action; the only randomness is the engine's mulberry32 over `seed`), never throws, and never
 * returns an illegal action: every choice is validated against the view and falls back to a
 * legal-by-construction placeholder policy if anything is off.
 *
 * ## Two orthogonal vectors, never one
 *
 * `policy` resolves (see [style.ts](style.ts)) to a `{ skill, style }` pair:
 *
 *  - **skill** (`SkillParams`) — inference depth, memory window, error rate: what the seat can
 *    work out. `easy` remembers 6 log events, skips set-constraints, blunders 25% of asks and
 *    has no claim planner; `medium` runs the full knowledge engine; `hard` adds the
 *    constraint-refined hit probability.
 *  - **style** (`StyleParams`) — STYLES.md §2: what it does with what it works out. Every
 *    hardcoded policy constant this file used to carry is now a field of that vector.
 *
 * BOT_LAB.md §1.3 is the reason they are separate: *"If an 'aggressive' bot loses, you must be
 * able to say whether aggression is bad or whether you merely wrote a weaker bot."* A style is
 * expressible at any skill, and a skill at any style. `decide(view, 'hard', seed)` is exactly
 * `decide(view, { skill: SKILL_PRESETS.hard, style: STYLE_PRESETS.hard }, seed)`, so the three
 * shipped tiers survive as named presets over the vector and nothing about their play changed.
 *
 * The one place the two axes touch is the *shape* of the decision, not its content: a seat with
 * `planClaims: false` has no claim planner at all, so it cannot weigh a declare against an ask
 * and instead guesses holders when the position forces a declare. That is a capability, so it
 * lives on the skill vector; every preference inside either flow is read from the style.
 *
 * ## Rule sets
 *
 * Every deck- and set-shaped quantity is read from `view.config` (RULES_US54.md §6), so the
 * same policies play both rule sets. The one structural difference is the RULES_US54.md §3
 * declare window: it moves "whose move it is" off the turn-holder, splits the decision into
 * declare-or-decline inside a window and ask-only outside one, and is dispatched at the top of
 * `decideInner`. `pagat48` never opens a window and `allBooks(defaultConfig)` /
 * `bookCards(b, defaultConfig)` are the same values `ALL_BOOKS` / `bookCards(b)` always were,
 * so the 48-card tiers are bit-for-bit the policies they were before the variant existed.
 *
 * ## The contained-book turn-pass
 *
 * One ask-time option lives outside this file: [contained.ts](contained.ts), the CONTAINMENT.md
 * turn-pass. It is offered on the `us54` ask path only (`decideUs54Ask`), after the ordinary ask
 * has been chosen and only where it beats it on that file's derivation, and it is refused
 * outright at `containedPass: 0` — which every shipped preset carries — and under `pagat48`,
 * whose row 15 voids a wrong declare instead of gifting it and so does not make a contained book
 * absorbing. Every 48-card game, at every style, is therefore bit-for-bit unchanged by it.
 *
 * ## The explained surface — `decideExplained`
 *
 * The assistant pane needs the *reasoning*, not only the move, and the reasoning already exists:
 * every branch below is taken for a reason this file states in prose in its comments. Rather than
 * maintain a second, describe-only pipeline that would drift from the real one, the private
 * helpers accept an optional trace sink (`Sink`) as their last parameter and narrate into it at
 * the point each decision is actually made. `decide` passes nothing — the sink is `undefined` on
 * every call it makes, every trace statement is guarded on it, and no trace statement draws from
 * the seeded rng — so `decide`'s code path and its output are bit-for-bit what they were, which
 * the digest tests pin and `tests/bots/explain.test.ts` re-proves by fuzz equivalence.
 * `decideExplained` is the same wrapper as `decide` (same try/catch shape, same view-legality
 * check, same fallback), so it inherits "never throws" and "never illegal" by construction
 * rather than by a parallel promise.
 *
 * The trace reuses what the stack already computes instead of re-deriving it: the ranked-ask
 * `reason` strings from `rankAsksWith`, the `ClaimPlan` p / uncertain counts, and the
 * `PassValuation` the contained-book turn-pass prices its move with (previously discarded at the
 * call site — now the arithmetic a player is told is exactly the arithmetic the bot used).
 *
 * ## The adaptive layer — FishAI v1.0
 *
 * An `AdaptiveSpec` policy resolves *here*, not in `resolvePolicy`, because it needs the view:
 * [adaptive.ts](adaptive.ts) reads the opponents off the public log, best-responds over the
 * measured counter table, and this file then plays the chosen roster style at hard skill —
 * the whole pipeline below is unchanged, the adaptive engine merely picks which vector enters
 * it. The `chooseStyle` call sits inside the same try/catch as everything else, so a throwing
 * classifier lands in the same fallback and both wrappers keep their never-throws /
 * never-illegal contract by construction. `decideExplained` prepends the read — the chosen
 * style with its expected payoff, and each opponent seat's top classification — before the
 * ordinary branch narration, so the assistant pane shows *why this style* above *why this
 * move*. The dependency is strictly one-way: this file imports adaptive.ts, never the reverse.
 *
 * ## The bounded-memory layer — FishAI v1.5
 *
 * A `BoundedSpec` policy also resolves here, with the view: [bounded.ts](bounded.ts) derives
 * the fact pool from the full public log, keeps what a bit budget affords, and hands back the
 * SAME `Knowledge` shape `buildKnowledge` returns — so the chosen style (hard skill, per the
 * "bare style at full strength" rule) runs the ordinary pipeline below over a restricted
 * memory rather than a restricted policy. The one plumbing consequence: every knowledge build
 * below goes through `knowledgeFor`, which consults the resolved policy's override before
 * falling back to `buildKnowledge`. The restricted knowledge is computed once, eagerly, at
 * resolution — for BOTH wrappers, so a malformed view that makes the derivation throw lands in
 * the same fallback on the same path and the explain-parity contract holds by construction.
 * The dependency is strictly one-way here too: this file imports bounded.ts, never the reverse.
 */
import type { BookId, Card, GameAction, Seat } from '../types.ts'
import { allBooks, bookCards, cardBook, isCard, seatTeam, teamSeats } from '../cards.ts'
import { legalAsksFromView } from '../helpers.ts'
import { clinchTarget, rulesFor } from '../variants.ts'
import { mulberry32, randInt } from '../rng.ts'
import {
  askHitProbability,
  buildKnowledge,
  holderOf,
  pc,
  rankAsksWith,
  refinedHitProbability,
  unaskableBooks,
} from './knowledge.ts'
import { planContainedPass } from './contained.ts'
import type { ContainedPassPlan, PassValuation } from './contained.ts'
import { POLICY_CONSTANTS, SKILL_PRESETS, resolvePolicy } from './style.ts'
import type { BotPolicy, SkillParams, StyleParams } from './style.ts'
import { STYLE_ROSTER } from './roster.ts'
import { ADAPTIVE_DEFAULTS, chooseStyle, isAdaptiveSpec } from './adaptive.ts'
import type { AdaptiveChoice, AdaptiveSpec } from './adaptive.ts'
import { BOUNDED_DEFAULTS, boundedRead, isBoundedSpec } from './bounded.ts'
import type { BoundedRead, BoundedSpec, PolicySpec } from './bounded.ts'
import type { Knowledge, KnowledgeOptions, RankedAsk, SeatView } from './types.ts'

type Rng = () => number

/* ------------------------------------------------------- the decision trace --- */

/**
 * The reasoning record `decideExplained` returns beside its action — one per decision, written
 * for a human player in the assistant pane, in the same register as the `RankedAsk.reason`
 * strings (cards through the `pc` renderer: 9♥, the red joker; probabilities with their
 * thresholds beside them, so a number is never shown without the bar it was measured against).
 *
 * The shape is contractual for the play UI: fields are only ever *added*, never renamed.
 */
export interface DecisionTrace {
  /** Which pipeline branch produced the action. */
  kind:
    | 'own-book-claim'
    | 'certain-claim'
    | 'ev-claim'
    | 'forced-claim'
    | 'guess-claim'
    | 'certain-hit'
    | 'ranked-ask'
    | 'signalling-ask'
    | 'contained-pass'
    | 'decline'
    | 'must-declare'
    | 'pass'
    | 'designate'
    | 'error-branch'
    | 'fallback'
  /** One-sentence headline, human-readable, e.g. "Declared LOW-H — all six cards are certain." */
  headline: string
  /** Ordered supporting notes. Plain prose; card names via the pc() renderer (9♥, the red joker). */
  notes: string[]
  /** Top ranked asks at the moment of decision (<= 5), when an ask was considered. */
  ranked?: RankedAsk[]
  /** The claim plan (book, p, uncertain count) when a declare was considered/made. */
  claim?: { book: BookId; p: number; uncertain: number; foreign: boolean }
  /** Contained-pass valuation when that mechanism fired (the existing PassValuation, plumbed). */
  passValue?: PassValuation
  /** Branches that were considered and refused, in order, with the reason. */
  refused: { kind: string; reason: string }[]
}

/** A decision and the reasoning that produced it — the `decideExplained` return shape. */
export interface ExplainedDecision {
  action: GameAction
  trace: DecisionTrace
}

/**
 * The module-internal mutable collector the helpers narrate into. `undefined` on every call
 * `decide` makes; a fresh object on every `decideExplained` call, sealed into a `DecisionTrace`
 * on the way out. Kept separate from `DecisionTrace` so the public shape can require `kind` and
 * `headline` while the in-flight object is honest about not having them yet.
 */
interface Sink {
  kind: DecisionTrace['kind'] | null
  headline: string
  notes: string[]
  ranked?: RankedAsk[]
  claim?: DecisionTrace['claim']
  passValue?: PassValuation
  refused: { kind: string; reason: string }[]
}

function newSink(): Sink {
  return { kind: null, headline: '', notes: [], refused: [] }
}

/** Stamp the branch verdict. Called exactly once per decision, at the point the action is made. */
function conclude(t: Sink, kind: DecisionTrace['kind'], headline: string): void {
  t.kind = kind
  t.headline = headline
}

/** The in-flight sink, made contractual. Defensive defaults: a trace is never empty. */
function sealTrace(t: Sink): DecisionTrace {
  const out: DecisionTrace = {
    kind: t.kind ?? 'error-branch',
    headline:
      t.headline !== ''
        ? t.headline
        : 'No explanation was recorded for this branch — a tracing gap, worth reporting.',
    notes: t.notes,
    refused: t.refused,
  }
  if (t.ranked !== undefined) out.ranked = t.ranked
  if (t.claim !== undefined) out.claim = t.claim
  if (t.passValue !== undefined) out.passValue = t.passValue
  return out
}

/** Probabilities and thresholds for prose: at most three decimals, no trailing zeros. */
function fp(x: number): string {
  return String(Math.round(x * 1000) / 1000)
}

/** Simple English pluralisation for counted nouns in trace prose. */
function n_(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/* ------------------------------------------------------------ utilities --- */

function opponentTeamSeats(seat: Seat): readonly Seat[] {
  return teamSeats(seatTeam(seat) === 0 ? 1 : 0)
}

function teammateSeats(seat: Seat): Seat[] {
  return teamSeats(seatTeam(seat)).filter((s) => s !== seat)
}

/** Total cards held by the viewer's own team, from the public counts. */
function ownTeamCards(view: SeatView): number {
  return teamSeats(seatTeam(view.seat)).reduce<number>((n, s) => n + view.counts[s], 0)
}

/** The inference settings of a skill, in the shape `buildKnowledge` wants. */
function knowledgeOptions(skill: SkillParams): KnowledgeOptions {
  return { logWindow: skill.logWindow, useConstraints: skill.useConstraints }
}

/**
 * A resolved policy, plus the bounded arm's knowledge override. `resolveWithView` attaches the
 * override for a `BoundedSpec` only; everything else carries a plain `{ skill, style }` and the
 * pipeline is byte-for-byte what it was. Internal to this file — the public resolution shape
 * stays `BotPolicy`.
 */
interface ActivePolicy extends BotPolicy {
  /** The budget-restricted knowledge for THIS decision's view, computed at resolution time. */
  boundedK?: () => Knowledge
}

/**
 * The one knowledge build the pipeline performs, policy-aware: the bounded arm's restricted
 * knowledge where an override is present, the ordinary skill-shaped `buildKnowledge` otherwise.
 */
function knowledgeFor(view: SeatView, pol: ActivePolicy): Knowledge {
  return pol.boundedK !== undefined ? pol.boundedK() : buildKnowledge(view, knowledgeOptions(pol.skill))
}

/** First unresolved book fully contained in the viewer's own hand. */
function completeOwnBook(view: SeatView): BookId | null {
  const held = new Set(view.hand)
  for (const b of allBooks(view.config)) {
    if (view.books[b]) continue
    if (bookCards(b, view.config).every((c) => held.has(c))) return b
  }
  return null
}

/**
 * The wholly-in-hand set a style is actually willing to declare.
 *
 * At most one can ever exist — a set is six cards and no hand in either rule set is larger than
 * nine (RULES_US54.md row 4; RULES.md row 4) — so there is nothing to search past.
 *
 * `forced` is the RULES_US54.md §3.2 escape: where `decline` is illegal the hoard gate is not
 * consulted, because a style's reluctance there would hang the table rather than express a
 * preference. Everywhere else a Hoarder may keep the hand and decline, which is the whole point
 * of the style — and is safe precisely because §3.2's second case (*"the turn-holder's hand is a
 * union of complete unresolved sets"*) is exactly a position with no legal ask, which
 * `mustDeclareNow` reports.
 *
 * `forced` is a thunk because on the `ownTurn` path it costs a `legalAsksFromView` (up to 3 x 54
 * entries), and every style but the Hoarder answers `withinHoardLimits` from the knobs alone.
 */
function declarableOwnBook(
  view: SeatView,
  style: StyleParams,
  forced: () => boolean,
  t?: Sink,
): BookId | null {
  const b = completeOwnBook(view)
  if (b === null) return b
  if (withinHoardLimits(view, b, style)) return b
  if (forced()) {
    if (t) t.notes.push(`The hoard gate would keep ${b} in hand, but declining is not on offer here.`)
    return b
  }
  if (t) t.refused.push({ kind: 'own-book-claim', reason: `${b} is wholly in this hand, but ${hoardReason(view, b, style)}` })
  return null
}

function claimAllSelf(view: SeatView, book: BookId): GameAction {
  const assignments = {} as Record<Card, Seat>
  for (const c of bookCards(book, view.config)) assignments[c] = view.seat
  return { type: 'claim', seat: view.seat, book, assignments }
}

/** Sets awarded to [own team, opposing team] so far, from the public book results. */
function teamSetCounts(view: SeatView): [own: number, opp: number] {
  const mine = seatTeam(view.seat)
  let own = 0
  let opp = 0
  for (const b of allBooks(view.config)) {
    const o = view.books[b]?.outcome
    if (o !== 'team0' && o !== 'team1') continue
    if ((o === 'team0' ? 0 : 1) === mine) own++
    else opp++
  }
  return [own, opp]
}

/**
 * Stall detection over the public log. Claims are the only permanent progress
 * (books resolve monotonically); hits at least move information. A position is
 * declared dead when the table has produced neither for a long stretch —
 * cross-book deadlocks exist (every possible ask by every seat can be a known
 * miss forever), and the only way out is claiming on best evidence. Thresholds
 * are deliberately conservative so normal miss-heavy midgames never trigger.
 *
 * The thresholds live in `POLICY_CONSTANTS.stall` and are keyed by the rule set's declare
 * timing, never by the acting style — STYLES.md §3.1: *"If the stall-breaker needs tuning, tune
 * it once, globally — never per-style. A per-style stall rule is a hidden style parameter that
 * contaminates the whole comparison."* See that table for why `us54` is the tighter of the two.
 */
function isDeepStalled(view: SeatView): boolean {
  const log = view.log
  let lastHit = -1
  let lastClaim = -1
  for (let i = log.length - 1; i >= 0; i--) {
    const ev = log[i]
    if (lastHit === -1 && ev.type === 'ask' && ev.hit) lastHit = i
    if (lastClaim === -1 && ev.type === 'claim') lastClaim = i
    if (lastHit !== -1 && lastClaim !== -1) break
  }
  const last = log.length - 1
  const noHitFor = last - lastHit // lastHit -1 => "forever"
  const noClaimFor = last - lastClaim
  const [hitLimit, claimLimit, hardLimit] = POLICY_CONSTANTS.stall[rulesFor(view.config).declareTiming]
  return (noHitFor >= hitLimit && noClaimFor >= claimLimit) || noClaimFor >= hardLimit
}

/** No hit anywhere in the last `n` log events (stalemate-breaker trigger). */
function noRecentHit(view: SeatView, n: number): boolean {
  const log = view.log
  for (let i = log.length - 1; i >= 0 && i > log.length - 1 - n; i--) {
    const ev = log[i]
    if (ev.type === 'ask' && ev.hit) return false
  }
  return true
}

/* -------------------------------------------------------- claim planning --- */

interface ClaimPlan {
  book: BookId
  assignments: Record<Card, Seat>
  /** Estimated probability the claim scores for the claimer's team. */
  p: number
  /** Cards whose holder was guessed rather than known. */
  uncertain: Card[]
}

/**
 * Plan a claim of `book` for the viewer's team using knowledge + counts.
 * Certain cards go to their known holders. Uncertain cards are assigned by
 * COUNT-CONSISTENCY: greedily to the candidate teammate with the most
 * remaining unidentified slots (a card is a-priori equally likely to sit in
 * any unidentified slot), decrementing a working capacity map so multiple
 * guesses stay jointly consistent with the public hand sizes. p multiplies
 * per-card success estimates (certain-on-team = 1; certain-on-opponent = 0;
 * uncertain = chosen capacity / total candidate capacity).
 */
function planClaim(view: SeatView, k: Knowledge, book: BookId): ClaimPlan {
  const me = view.seat
  const myTeam = seatTeam(me)
  const mates = teamSeats(myTeam)
  const capacity = [...k.unknownSlots]
  const assignments = {} as Record<Card, Seat>
  const uncertain: Card[] = []
  let p = 1
  for (const c of bookCards(book, view.config)) {
    const h = holderOf(k, c)
    if (h !== null) {
      if (seatTeam(h) === myTeam) {
        assignments[c] = h
      } else {
        // Certainly with an opponent: the claim would hand them the book.
        // Assign legally (own team) but the plan is worthless.
        assignments[c] = me
        p = 0
      }
      continue
    }
    const cand = k.cands[c] ?? []
    const teamCand = cand.filter((s) => seatTeam(s) === myTeam)
    if (teamCand.length === 0) {
      assignments[c] = me
      p = 0
      uncertain.push(c)
      continue
    }
    // Deterministic greedy: highest remaining capacity, then lowest seat.
    let best = teamCand[0]
    for (const s of teamCand) {
      if (capacity[s] > capacity[best]) best = s
    }
    let totalCap = 0
    for (const s of cand) totalCap += Math.max(0, capacity[s])
    p *= totalCap > 0 ? Math.max(0, capacity[best]) / totalCap : 1 / cand.length
    if (capacity[best] > 0) capacity[best]--
    assignments[c] = best
    uncertain.push(c)
  }
  // Guard: every card must be assigned to an own-team seat (mates is
  // guaranteed non-empty; `me` is always legal).
  for (const c of bookCards(book, view.config)) {
    const s = assignments[c]
    if (s === undefined || !mates.includes(s)) assignments[c] = me
  }
  return { book, assignments, p, uncertain }
}

/**
 * The unresolved sets this seat holds no card of — a *foreign* declare's targets
 * (STYLES.md §1.3). Delegated to the inference layer's `unaskableBooks`, which states the same
 * fact the way it matters: RULES row 6 makes holding a card the only licence to ask, so these
 * are the sets the seat can never act on, only watch.
 *
 * Built once per declare search rather than per candidate set: both `certainClaim` and
 * `evClaim` loop over every unresolved set, and the membership test is over the whole hand.
 */
function foreignBookSet(view: SeatView): Set<BookId> {
  return new Set(unaskableBooks(view))
}

/**
 * STYLES.md §2 hoarding — the ask-licence gate, applied to **every declare the style is free to
 * refuse**: the speculative one (`evClaim`), the certain one (`certainClaim`), and the
 * wholly-in-hand one (`completeOwnBook`). Never to a *forced* declare, where RULES_US54.md §3.2
 * makes `decline` illegal and a style's reluctance cannot be honoured without hanging the table.
 *
 * ## Why it is no longer speculative-only
 *
 * It used to gate `evClaim` alone, on the argument that refusing *free points* to protect an
 * ask-licence is a giveaway rather than optionality. Measured, that argument left the style with
 * no behaviour at all: across 51,420 decisions of real `us54` play no speculative declare ever
 * cleared even `declareThreshold 0.775`, so `evClaim` never returned and every knob behind it —
 * including both hoard knobs — was unreachable. See STYLES.md §3.1.
 *
 * The move is also the more faithful reading of the style. The owner's description is *"holds
 * onto a single card until the rest are revealed"*, and the card a declare actually spends is
 * usually a card of a set the seat is **certain** of: that is the moment the licence is real and
 * the trade-off is real. Refusing has a genuine cost (the set is not banked yet, and
 * RULES_US54.md §3's race means a teammate may declare it *wrongly* first — row 14 then gifts
 * it) against a genuine benefit (row 6: the seat keeps the right to ask into the sets it still
 * holds cards of, and row 18's elimination is deferred).
 *
 * ## Two knobs, two different rules
 *
 * - **`minHandSize`** prices RULES_US54.md row 18: at 0 cards the seat can no longer ask or be
 *   asked. That is the only hand-size discontinuity in the rule set, so the elimination boundary
 *   is 1 and every larger N is a buffer against the fact that *hits are compulsory* (BOT_LAB.md
 *   §2.2) — an opponent can strip a card the seat wanted to keep. `N = 2` is therefore the
 *   smallest hand that survives one involuntary strip and still holds a licence, which is
 *   exactly the value STYLES.md §3 pins for the Hoarder.
 * - **`hoardBooks`** prices row 6 directly: holding >= 1 card of a set is the only licence to
 *   ask into it. Counted over the hand that would REMAIN, and a set the seat would hold
 *   *entirely* is not counted — row 7 forbids asking for a card you hold, so six-of-six is a
 *   licence with no legal ask behind it. That same fact is why `completeOwnBook` costs a Hoarder
 *   nothing in licences and is refused only when `minHandSize` bites.
 *
 * A declare of a set the seat holds no card of spends nothing and is never gated: it cannot drop
 * the hand and cannot cost a licence, so vetoing it would be caution, not hoarding.
 *
 * Both knobs are 0 in every preset and in eight of the nine roster styles, so this returns true
 * before touching the hand for everything except the Hoarder.
 */
function withinHoardLimits(view: SeatView, book: BookId, style: StyleParams): boolean {
  if (style.hoardBooks <= 0 && style.minHandSize <= 0) return true
  const members = new Set<Card>(bookCards(book, view.config))
  const remaining = view.hand.filter((c) => !members.has(c))
  // Foreign declare: the hand is untouched, so there is nothing to hoard against.
  if (remaining.length === view.hand.length) return true
  if (style.minHandSize > 0 && remaining.length < style.minHandSize) return false
  if (style.hoardBooks > 0) {
    const perBook = new Map<BookId, number>()
    for (const c of remaining) {
      const b = cardBook(c)
      perBook.set(b, (perBook.get(b) ?? 0) + 1)
    }
    let licences = 0
    // Row 6 grants the licence; row 7 takes every ask back when the seat holds all six.
    for (const n of perBook.values()) if (n < 6) licences++
    if (licences < style.hoardBooks) return false
  }
  return true
}

/**
 * Is a declare compulsory for THIS seat right now, on the public view alone?
 *
 * RULES_US54.md §3.2 makes `decline` illegal (`MUST_DECLARE`) while the turn-holder has no legal
 * ask, because the window has nothing to close into. §3.2 names two ways that happens, and both
 * are covered here:
 *
 *  1. every opponent of the turn-holder is out of cards — `windowCannotClose`, computed from the
 *     public counts, and visible to *any* option seat;
 *  2. the turn-holder's hand is a union of complete unresolved sets — visible only to the
 *     turn-holder itself, which is fine, because §3 offers the option to the turn-holder
 *     **first** in every window (and re-opens from the top after every declare), so a
 *     turn-holder that cannot ask is refused its decline before the option can ever travel.
 *
 * Existed implicitly before as *"`completeOwnBook` makes that seat declare"*. It has to be
 * explicit now that a style may refuse `completeOwnBook`.
 */
function mustDeclareNow(view: SeatView): boolean {
  if (windowCannotClose(view)) return true
  return view.turn === view.seat && !viewerCouldAskIfWindowClosed(view)
}

/**
 * Would this seat have a legal ask **if the declare window closed onto it**?
 *
 * Not `legalAsksFromView`, which answers "may this seat ask *right now*" and is therefore `[]`
 * for every seat while a window is open (RULES_US54.md §3 — nobody asks inside a window). The
 * question §3.2 actually keys `MUST_DECLARE` on is the counterfactual one, and it is exactly the
 * engine's own `turnHolderCanAsk`, restated over the public view: row 8 needs an opponent with
 * cards, and rows 6-7 need a set the seat holds at least one but not all of.
 */
function viewerCouldAskIfWindowClosed(view: SeatView): boolean {
  if (view.phase !== 'playing') return false
  if (view.hand.length === 0) return false
  if (!opponentTeamSeats(view.seat).some((s) => view.counts[s] > 0)) return false
  if (view.config.toggles.askOwnCardAllowed) return true
  const perBook = new Map<BookId, number>()
  for (const c of view.hand) {
    const b = cardBook(c)
    perBook.set(b, (perBook.get(b) ?? 0) + 1)
  }
  for (const [b, n] of perBook) {
    if (n < bookCards(b, view.config).length) return true
  }
  return false
}

/**
 * STYLES.md §1.4 — the clinch is a race, not an accumulation. Two separate effects, both only
 * under a `clinch` rule set and both applied to *speculative* declares (the only ones that can
 * fail):
 *
 *  1. **Style preference.** When either team stands one set from ending the game, a style may
 *     want its speculative declares cheaper (bank the winner / grab sets before they do) or
 *     dearer. Both knobs are **neutral at 0.5**, which is what every preset carries.
 *  2. **The rule consequence, which is not a preference.** With the OPPONENTS at
 *     `clinchTarget - 1`, a failed declare does not cost a set — row 14 gifts them the set that
 *     ENDS THE GAME. The tolerated failure probability therefore shrinks by
 *     `POLICY_CONSTANTS.clinchLossMagnifier`: `p >= 1 - (1 - t) / m`. Monotone in `t`, so a
 *     bolder style is still bolder here than a cautious one; it is the whole scale that moves.
 *
 * Returns `t` unchanged under `pagat48` (`winCondition !== 'clinch'`), where a failed declare
 * merely voids and no game can end early — which is why the 48-card tiers are untouched.
 */
function clinchAdjustedThreshold(view: SeatView, style: StyleParams, t: number): number {
  if (rulesFor(view.config).winCondition !== 'clinch') return t
  const target = clinchTarget(view.config)
  const [own, opp] = teamSetCounts(view)
  let factor = 1
  const span = POLICY_CONSTANTS.clinchSpan
  if (own >= target - 1) factor -= (style.clinchAggression - 0.5) * span
  if (opp >= target - 1) factor -= (style.denialWeight - 0.5) * span
  let out = t * Math.max(0, factor)
  if (opp >= target - 1) out = 1 - (1 - out) / POLICY_CONSTANTS.clinchLossMagnifier
  return Math.max(0, Math.min(1, out))
}

/**
 * STYLES.md §1.2 `declareEagerness` — **the race, as a trade-off rather than a clock.**
 *
 * §1.2 states both halves of it:
 *
 * > *A set you can prove is a set a teammate may also be able to prove. Waiting risks nothing
 * > from opponents (they cannot declare for your team) but risks a teammate declaring it
 * > wrongly first. Conversely, waiting one more ask may resolve your last uncertain card.*
 *
 * So patience is not a constant number of window ticks. It is a budget, in ticks of the
 * RULES_US54.md §3 window (`declined` runs 0..5, since the option is offered to six seats and a
 * sixth decline closes the window), scaled by the two forces §1.2 names:
 *
 *  - **more unresolved cards => wait longer.** The set is *certainly* the team's (that is
 *    `evClaim`'s gate); the only thing in doubt is which teammate holds the guessed card — and
 *    the teammate who actually holds it sees the whole set as CERTAIN from its own view and will
 *    bank it correctly. Waiting converts a `p < 1` guess into someone else's `p = 1`, which is
 *    exactly the `q` in the threshold derivation. Charged per guessed card, and only while
 *    information can still arrive (a proven-dead board resolves nothing, so the bonus is off).
 *  - **more teammates who might beat me to it => wait less.** `raceRisk` charges each teammate
 *    that can see part of the set, most for one certainly holding a card of it. This is what
 *    makes a *foreign* declare the most urgent kind: the seat has no private information in it,
 *    so every teammate is reading the same public position and may reach a different, wrong
 *    conclusion first.
 *
 * Both terms are multiplicative on `(1 - eagerness)`, so **eagerness 1 is still "fire at the
 * first offer" unconditionally** — which is what every shipped preset carries, and why the
 * tiers' behaviour is unchanged. Outside a window (`pagat48`, own-turn declares) there is no
 * clock to wait on and this returns true.
 */
function eagerEnoughToDeclare(
  view: SeatView,
  k: Knowledge,
  style: StyleParams,
  plan: ClaimPlan,
  stalled: boolean,
): boolean {
  const w = view.declareWindow
  if (!w) return true
  return w.declined >= windowTicksWanted(view, k, style, plan, stalled)
}

/**
 * The number of window ticks this style wants to see pass before firing `plan` — the arithmetic
 * of `eagerEnoughToDeclare`, factored out so the trace can state the same number the decision
 * used ("waited 1 of the 3 declines its patience wants") instead of re-deriving an approximation.
 */
function windowTicksWanted(
  view: SeatView,
  k: Knowledge,
  style: StyleParams,
  plan: ClaimPlan,
  stalled: boolean,
): number {
  const eagerness = Math.max(0, Math.min(1, style.declareEagerness))
  // Both rule sets are 6 players (RULES.md row 1 / RULES_US54.md §1 rows 1 and 22), and the
  // window closes after all six decline, so the option can travel at most five seats.
  let ticks = (1 - eagerness) * 5
  if (ticks <= 0) return 0
  if (!stalled && plan.uncertain.length > 0) {
    ticks *= 1 + POLICY_CONSTANTS.infoPatience * plan.uncertain.length
  }
  ticks *= Math.max(0, 1 - raceRisk(view, k, plan))
  return Math.round(Math.min(5, ticks))
}

/**
 * How much of this seat's patience the RULES_US54.md §3 race eats: 0 = nobody else is looking at
 * this set, 1 = wait at all and expect to be beaten to it. See `eagerEnoughToDeclare`.
 */
function raceRisk(view: SeatView, k: Knowledge, plan: ClaimPlan): number {
  const members = bookCards(plan.book, view.config)
  let risk = 0
  for (const s of teammateSeats(view.seat)) {
    // A cardless teammate is deliberately NOT skipped: row 15 lets it declare too, and §4's
    // "cardless declarer" case is precisely a seat with nothing to lose by guessing.
    if (members.some((c) => holderOf(k, c) === s)) {
      risk += POLICY_CONSTANTS.race.certain
    } else if (plan.uncertain.some((c) => (k.cands[c] ?? []).includes(s))) {
      risk += POLICY_CONSTANTS.race.possible
    }
  }
  return Math.min(1, risk)
}

/** Claim whose six cards are all CERTAIN and on the viewer's team, if any. */
function certainClaim(view: SeatView, k: Knowledge, style: StyleParams, t?: Sink): GameAction | null {
  const foreign = style.foreignDeclare ? null : foreignBookSet(view)
  for (const b of allBooks(view.config)) {
    if (view.books[b]) continue
    // STYLES.md §1.3: a style that refuses to track sets it owns nothing in must not declare
    // them either. Every preset has `foreignDeclare: true` — the shipped claim search has
    // always ranged over every unresolved set — so this never fires for the tiers.
    if (foreign !== null && foreign.has(b)) continue
    const plan = planClaim(view, k, b)
    if (plan.uncertain.length === 0 && plan.p === 1) {
      // `continue`, not `return null`: a style that refuses to spend its licences on THIS set
      // has said nothing about the next one, and a certain set it can bank for free is still
      // free. See `withinHoardLimits` for why the gate reaches a certain declare at all.
      if (!withinHoardLimits(view, b, style)) {
        if (t) t.refused.push({ kind: 'certain-claim', reason: `${b} is certainly located on this team, but ${hoardReason(view, b, style)}` })
        continue
      }
      return { type: 'claim', seat: view.seat, book: b, assignments: plan.assignments }
    }
  }
  return null
}

/**
 * Risk-weighted EV (speculative) declare. Trigger: an unresolved book with all but
 * `declareMaxUncertain` cards certainly on the team, every uncertain card's candidates all
 * teammates. The book is then guaranteed to belong to the team — an opponent can never score it
 * (and, holding none of its cards, can never even ask into it) — so under `pagat48` the only
 * risk is a void. EV analysis: claiming costs no tempo (RULES row 17 — the claimant's turn
 * continues) and the candidate teammate who ACTUALLY holds the card usually sees all six as
 * certain from its own view and will bank the book safely on its next turn, so a premature guess
 * mostly converts a ~1.0-expectation book into p < 1. Claiming is favorable only when p is very
 * high (the holder may never get a turn before the endgame) — baseline threshold
 * `declareThreshold` 0.8 — or once the position is provably dead, where a coin-flip book beats
 * guaranteed zero progress (`declareThresholdStalled` 0.5). p is the best teammate's free
 * (unidentified) slots / total candidate free slots.
 *
 * Under `us54` the downside is sharper still — STYLES.md §1.1, a bad declare *gifts* the set
 * instead of burning it, a 2-point swing in a race to 5 — which is exactly why the threshold is
 * a style knob and why STYLES.md §5 forbids porting the 48-card tuning to the new roster.
 *
 * The four gates layered on top (`foreignDeclare`, hoarding, the clinch response, and window
 * eagerness) are all no-ops at the preset values; each says so at its own definition.
 */
function evClaim(
  view: SeatView,
  k: Knowledge,
  style: StyleParams,
  stalled: boolean,
  t?: Sink,
  barTag?: string,
): GameAction | null {
  const myTeam = seatTeam(view.seat)
  const base = clinchAdjustedThreshold(
    view,
    style,
    stalled ? style.declareThresholdStalled : style.declareThreshold,
  )
  const foreignSets = foreignBookSet(view)
  let best: ClaimPlan | null = null
  let bestBar = 0
  // Trace only: the highest-p plan that met every structural test but sat below its bar — the
  // honest content of "nothing declarable above the bar".
  let nearMiss: { plan: ClaimPlan; bar: number } | null = null
  for (const b of allBooks(view.config)) {
    if (view.books[b]) continue
    const foreign = foreignSets.has(b)
    if (foreign && !style.foreignDeclare) continue
    const plan = planClaim(view, k, b)
    if (plan.uncertain.length < 1 || plan.uncertain.length > style.declareMaxUncertain) continue
    // Every guessed card must be guessable onto a teammate, or the set is not certainly ours.
    let allOnTeam = true
    for (const c of plan.uncertain) {
      const cand = k.cands[c] ?? []
      if (cand.length === 0 || !cand.every((s) => seatTeam(s) === myTeam)) {
        allOnTeam = false
        break
      }
    }
    if (!allOnTeam) continue
    // `max`, not override: a 0 foreign bar means "no separate bar", and the ordinary threshold
    // (stalled relaxation included) governs — which a plain assignment would have clobbered.
    const threshold = foreign ? Math.max(base, style.foreignDeclareThreshold) : base
    if (plan.p < threshold) {
      if (t && (nearMiss === null || plan.p > nearMiss.plan.p)) nearMiss = { plan, bar: threshold }
      continue
    }
    if (!withinHoardLimits(view, b, style)) {
      if (t) t.refused.push({ kind: 'ev-claim', reason: `${b} clears the bar at p = ${fp(plan.p)}, but ${hoardReason(view, b, style)}` })
      continue
    }
    if (best === null || plan.p > best.p) {
      best = plan
      bestBar = threshold
    }
  }
  if (best === null) {
    if (t) {
      t.refused.push({
        kind: 'ev-claim',
        reason:
          nearMiss !== null
            ? `the best speculative plan is ${nearMiss.plan.book} at p = ${fp(nearMiss.plan.p)}, below the bar of ${fp(nearMiss.bar)}${stalled ? ` (${barTag ?? 'stalled'})` : ''}`
            : `no unresolved set qualifies for a speculative declare (every guessed card must sit with a teammate, at most ${n_(style.declareMaxUncertain, 'guess')})`,
      })
    }
    return null
  }
  // The RULES_US54.md §3 race, decided against the plan actually on the table: how much waiting
  // could still resolve, against how likely a teammate is to reach the same set first. Checked
  // here rather than at the top of the search because both halves are properties of the plan.
  // No window (`pagat48`, or a closed one) => nothing to wait for, and this is always true.
  if (!eagerEnoughToDeclare(view, k, style, best, stalled)) {
    if (t) {
      const wanted = windowTicksWanted(view, k, style, best, stalled)
      const declined = view.declareWindow?.declined ?? 0
      t.refused.push({
        kind: 'ev-claim',
        reason: `${best.book} clears the bar at p = ${fp(best.p)}, but the style is waiting for information: ${declined} of the ${n_(wanted, 'decline')} its patience wants have passed`,
      })
    }
    return null
  }
  if (t) {
    const foreign = foreignSets.has(best.book)
    t.claim = { book: best.book, p: best.p, uncertain: best.uncertain.length, foreign }
    conclude(
      t,
      'ev-claim',
      `Declared ${best.book} speculatively — p = ${fp(best.p)} against a bar of ${fp(bestBar)}${stalled ? ` (${barTag ?? 'stalled'})` : ''}; ${n_(best.uncertain.length, 'card')} guessed (limit ${style.declareMaxUncertain}).`,
    )
    t.notes.push(`Holders: ${assignmentNote(view, best)}.`)
    t.notes.push(`Guessed: ${best.uncertain.map(pc).join(', ')} — every candidate is a teammate, assigned to the one with the most unidentified cards.`)
    if (foreign) t.notes.push('A foreign declare: this hand holds no card of the set, so the whole plan is public inference.')
  }
  return { type: 'claim', seat: view.seat, book: best.book, assignments: best.assignments }
}

/**
 * Forced claim: the position demands SOME claim (no legal ask, endgame, or a
 * proven-dead deadlock). Pick the unresolved book with the highest estimated
 * success probability (ties: fewer guessed cards, then canonical book order)
 * and its count-consistent assignment.
 *
 * No style gate applies: this is the branch where declining is not a move, so a style's
 * reluctance cannot be honoured without hanging the table (RULES_US54.md §3.2).
 */
function forcedClaim(view: SeatView, k: Knowledge): GameAction {
  let best: ClaimPlan | null = null
  for (const b of allBooks(view.config)) {
    if (view.books[b]) continue
    const plan = planClaim(view, k, b)
    if (
      best === null ||
      plan.p > best.p ||
      (plan.p === best.p && plan.uncertain.length < best.uncertain.length)
    ) {
      best = plan
    }
  }
  if (best === null) {
    // No unresolved book should be impossible pre-'finished'; stay legal-ish.
    return claimAllSelf(view, allBooks(view.config)[0])
  }
  return { type: 'claim', seat: view.seat, book: best.book, assignments: best.assignments }
}

/* ------------------------------------------------------------- passing --- */

/**
 * Who to hand the turn to. `passTarget` (STYLES.md §2) picks the direction; a skill without
 * `countTargeting` cannot reason about hand sizes at all and takes the first candidate, which is
 * exactly what the easy tier has always done.
 */
function targetByCount(
  view: SeatView,
  pool: readonly Seat[],
  style: StyleParams,
  skill: SkillParams,
): Seat {
  let to = pool[0]
  if (!skill.countTargeting) return to
  for (const s of pool) {
    const better = style.passTarget === 'most' ? view.counts[s] > view.counts[to] : view.counts[s] < view.counts[to]
    if (better) to = s
  }
  return to
}

/** RULES.md row 20 pass. */
function passAction(view: SeatView, pol: BotPolicy, t?: Sink): GameAction {
  const mates = teammateSeats(view.seat).filter((s) => view.counts[s] > 0)
  const pool = mates.length > 0 ? mates : teammateSeats(view.seat)
  const to = targetByCount(view, pool, pol.style, pol.skill)
  if (t) conclude(t, 'pass', `Passed the hand to seat ${to}${targetWhy(view, to, pol)}.`)
  return { type: 'pass', seat: view.seat, to }
}

/** RULES.md §4 endgame designate — the same "who to hand it to" heuristic, mirrored. */
function designateAction(view: SeatView, pol: BotPolicy, t?: Sink): GameAction {
  const opps = opponentTeamSeats(view.seat).filter((s) => view.counts[s] > 0)
  const pool = opps.length > 0 ? opps : [...opponentTeamSeats(view.seat)]
  const to = targetByCount(view, pool, pol.style, pol.skill)
  if (t) conclude(t, 'designate', `Designated seat ${to} to act for the opponents${targetWhy(view, to, pol)}.`)
  return { type: 'designate', seat: view.seat, to }
}

/* ------------------------------------------------ low-skill (no planner) --- */

/**
 * The flow for a skill with no claim planner (`planClaims: false`, the easy tier): it cannot
 * weigh a declare against an ask, so it declares only what it can literally see in its own hand
 * and otherwise asks, guessing holders at random when the position forces a declare.
 *
 * The style still governs everything it chooses: the ask weights, and (through `errorRate` on
 * the skill side) how often the choice is thrown away for a uniformly random legal ask.
 */
function decideNoPlanner(view: SeatView, pol: ActivePolicy, rng: Rng, t?: Sink): GameAction {
  const seat = view.seat
  if (view.phase === 'endgame') {
    const g = guessClaim(view, rng)
    if (t && g.type === 'claim') concludeGuess(t, g.book, 'the endgame leaves claims as the only moves, and this skill has no claim planner.')
    return g
  }
  // No legal ask is this rule set's version of "declining is not a move": the seat has to claim
  // something, so the hoard gate is off (see `declarableOwnBook`). Lazily, so a style without
  // hoard knobs still reaches `claimAllSelf` on exactly the path it always took.
  const complete = declarableOwnBook(view, pol.style, () => legalAsksFromView(view).length === 0, t)
  if (complete !== null) {
    if (t) conclude(t, 'own-book-claim', `Declared ${complete} — all six cards are in this hand.`)
    return claimAllSelf(view, complete)
  }
  if (isDeepStalled(view)) {
    const g = guessClaim(view, rng)
    if (t && g.type === 'claim') concludeGuess(t, g.book, `the position is ${stallNote(view)}, and a claim is the only progress left.`)
    return g
  }
  const asks = legalAsksFromView(view)
  if (asks.length === 0) {
    const g = guessClaim(view, rng)
    if (t && g.type === 'claim') concludeGuess(t, g.book, 'no legal ask remains, so a claim is the only move.')
    return g
  }
  if (rng() < pol.skill.errorRate) {
    const a = asks[randInt(rng, asks.length)]
    if (t) {
      conclude(t, 'ranked-ask', `Asked seat ${a.target} for ${pc(a.card)} — a blunder: this skill misplays ${Math.round(pol.skill.errorRate * 100)}% of asks, and the seeded roll replaced the deliberate choice with a random legal one.`)
    }
    return { type: 'ask', seat, target: a.target, card: a.card }
  }
  const k = knowledgeFor(view, pol)
  const ranked = rankAsksWith(view, k, pol.style)
  if (t) t.ranked = ranked.slice(0, 5)
  const top = preferredAsk(ranked, pol.style, t)
  if (t) concludeAsk(t, k, top)
  return { type: 'ask', seat, target: top.target, card: top.card }
}

/** Forced claim without a planner: most-held unresolved book, missing cards guessed. */
function guessClaim(view: SeatView, rng: Rng): GameAction {
  const seat = view.seat
  const held = new Set(view.hand)
  const unresolved = allBooks(view.config).filter((b) => !view.books[b])
  let best = unresolved[0]
  let bestHeld = -1
  for (const b of unresolved) {
    const n = bookCards(b, view.config).filter((c) => held.has(c)).length
    if (n > bestHeld) {
      best = b
      bestHeld = n
    }
  }
  const mates = teammateSeats(seat)
  const assignments = {} as Record<Card, Seat>
  for (const c of bookCards(best, view.config)) {
    assignments[c] = held.has(c) ? seat : mates[randInt(rng, mates.length)]
  }
  return { type: 'claim', seat, book: best, assignments }
}

/* ------------------------------------------------------------ ask policy --- */

/**
 * STYLES.md §2 `minHitP` — refuse long shots. Applied here rather than inside `rankAsksWith`
 * because dropping asks from the ranking would let a style talk itself out of having a legal
 * move: when every ask is below the bar the unfiltered list is used, so the seat always acts.
 * Baseline 0 returns the list unchanged without allocating.
 */
function preferredAsk(ranked: RankedAsk[], style: StyleParams, t?: Sink): RankedAsk {
  if (style.minHitP > 0) {
    const viable = ranked.filter((r) => r.p >= style.minHitP)
    if (viable.length > 0) {
      if (t && viable.length < ranked.length) {
        t.notes.push(`${n_(ranked.length - viable.length, 'ask')} below the ${fp(style.minHitP)} hit floor set aside.`)
      }
      return viable[0]
    }
    if (t) t.notes.push(`Every legal ask sits below the ${fp(style.minHitP)} hit floor; the floor is waived so the seat still acts.`)
  }
  return ranked[0]
}

/**
 * Information protection. An ask is a public announcement of interest in a book; once the team
 * certainly accounts for >= `leakThreshold` of a book's cards, asking into it tells opponents
 * which book the team is about to complete (they can count it out and defend their remaining
 * cards).
 */
function leaky(k: Knowledge, view: SeatView, book: BookId, style: StyleParams): boolean {
  const myTeam = seatTeam(view.seat)
  const held = new Set(view.hand)
  let n = 0
  for (const c of bookCards(book, view.config)) {
    const h = holderOf(k, c)
    if (held.has(c) || (h !== null && seatTeam(h) === myTeam)) n++
  }
  return n >= style.leakThreshold
}

/**
 * Ask selection over the ranked list:
 *  1. with `refinedInference` skill, every entry is re-scored with the constraint-refined hit
 *     probability (`refinedHitProbability`) — surviving "holds >= 1 of set" constraints raise
 *     the estimate for their members, an inference a weaker skill skips. The re-score uses the
 *     style's own `wHit`, because it is the same pHit term being corrected;
 *  2. near-ties within `leakEpsilon` prefer non-leaky books (see `leaky`);
 *  3. among known-miss near-ties, `missTarget` picks who to promote — 'fewest' (the shipped
 *     choice) hands the turn to the opponent with the smallest hand, which can ask into fewer
 *     books, so the surrendered turn is worth less to them.
 *
 * The two tiebreaks get **separate** windows. `leakEpsilon <= 0` retires the leak preference
 * outright — which is precisely what Blitz's `leakEpsilon 0` ("information is cheap") asks for —
 * while `missTarget` keeps `POLICY_CONSTANTS.missTargetEpsilon` of its own, because tempo
 * targeting and information protection are different concerns and STYLES.md §3 gives Blitz both
 * settings at once. `missTarget: 'fewest'` (every shipped preset) contributes zero width, so the
 * `medium`/`easy` presets still take the plain top-ranked ask they always took and `hard` still
 * breaks ties over exactly 0.5.
 *
 * The margin is deliberately tiny at baseline: information protection is a tiebreak, never a
 * reason to play a materially worse ask (a wider margin measurably loses games — the best ask
 * into a strong book is usually the ask that completes it).
 *
 * Deterministic: refined score desc, then the base ranked order.
 */
function pickAsk(view: SeatView, k: Knowledge, ranked: RankedAsk[], pol: BotPolicy, t?: Sink): RankedAsk {
  const { skill, style } = pol
  interface Scored {
    r: RankedAsk
    refined: number
    s: number
    idx: number
  }
  const scored: Scored[] = ranked.map((r, idx) => {
    if (!skill.refinedInference) return { r, refined: r.p, s: r.score, idx }
    const base = askHitProbability(k, r.card, r.target)
    const refined = refinedHitProbability(k, r.card, r.target)
    return { r, refined, s: r.score + style.wHit * (refined - base), idx }
  })
  scored.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.idx - b.idx))
  // `minHitP` is a hard preference, so it is applied to the re-scored order before the tiebreaks.
  const pool =
    style.minHitP > 0 && scored.some((x) => x.r.p >= style.minHitP)
      ? scored.filter((x) => x.r.p >= style.minHitP)
      : scored
  if (t && style.minHitP > 0) {
    if (pool.length < scored.length) {
      t.notes.push(`${n_(scored.length - pool.length, 'ask')} below the ${fp(style.minHitP)} hit floor set aside.`)
    } else if (pool === scored && !scored.some((x) => x.r.p >= style.minHitP)) {
      t.notes.push(`Every legal ask sits below the ${fp(style.minHitP)} hit floor; the floor is waived so the seat still acts.`)
    }
  }
  const top = pool[0]
  if (t && skill.refinedInference && top.r !== ranked[0]) {
    t.notes.push(`Constraint-refined probabilities promoted ${pc(top.r.card)} at seat ${top.r.target} over the slot-prior favourite ${pc(ranked[0].card)} at seat ${ranked[0].target}.`)
  }
  // Two independent near-tie windows, deliberately not one. Information protection is worth
  // `leakEpsilon` of score; tempo targeting is worth `missTargetEpsilon` and is off entirely for
  // the shipped `missTarget: 'fewest'`, so every preset takes exactly the width it always took.
  const missWidth = style.missTarget === 'fewest' ? 0 : POLICY_CONSTANTS.missTargetEpsilon
  const width = Math.max(style.leakEpsilon, missWidth)
  if (width <= 0) return top.r
  const near = pool.filter((x) => x.s >= top.s - width)
  if (near.length === 1) return top.r
  near.sort((a, b) => {
    if (style.leakEpsilon > 0) {
      const la = leaky(k, view, cardBook(a.r.card), style) ? 1 : 0
      const lb = leaky(k, view, cardBook(b.r.card), style) ? 1 : 0
      if (la !== lb) return la - lb
    }
    if (a.refined === 0 && b.refined === 0 && style.missTarget !== 'random') {
      const ca = view.counts[a.r.target]
      const cb = view.counts[b.r.target]
      if (ca !== cb) return style.missTarget === 'fewest' ? ca - cb : cb - ca
    }
    return a.idx - b.idx
  })
  if (t && near[0] !== top) {
    const chosen = near[0]
    if (style.leakEpsilon > 0 && leaky(k, view, cardBook(top.r.card), style) && !leaky(k, view, cardBook(chosen.r.card), style)) {
      t.notes.push(`A near-tie (within ${fp(width)} of score) broken for information protection: asking into ${cardBook(top.r.card)} would announce a set this team nearly accounts for, so the quieter ${pc(chosen.r.card)} is preferred.`)
    } else {
      t.notes.push(`A near-tie (within ${fp(width)} of score) broken by miss-targeting: the expected miss hands the turn to seat ${chosen.r.target} (${n_(view.counts[chosen.r.target], 'card')}${style.missTarget === 'fewest' ? ' — the smallest hand, so the surrendered turn is worth least' : ' — the largest hand'}).`)
    }
  }
  return near[0].r
}

/**
 * Stalemate breaker. When every ranked ask is a KNOWN miss (the asked seat provably lacks the
 * card) and nothing has hit recently, no ask can gain material — but an ask still generates the
 * public constraint "I hold at least one card of this book". A `signalling` style then asks into
 * the book it holds MOST of: the tighter the remainder set, the more its teammates (running the
 * same inference) learn about its hand, converting a dead turn into signal. The miss is given
 * according to `missTarget` — 'fewest' (the shipped choice) is deterministic and picks the seat
 * with the fewest options.
 *
 * The look-back that arms it is `POLICY_CONSTANTS.signalLookback`, global on purpose: the
 * on/off switch is already a style parameter, and letting a style widen its own trigger too
 * would let it win by geometry rather than by play.
 */
function signallingAsk(view: SeatView, style: StyleParams): GameAction | null {
  const asks = legalAsksFromView(view)
  if (asks.length === 0) return null
  const held = view.hand
  const heldOfBook = new Map<BookId, number>()
  for (const c of held) {
    const b = cardBook(c)
    heldOfBook.set(b, (heldOfBook.get(b) ?? 0) + 1)
  }
  let best = asks[0]
  let bestScore = -Infinity
  for (const a of asks) {
    const nHeld = heldOfBook.get(cardBook(a.card)) ?? 0
    // Prefer strongest own book; among those, the style's miss target.
    const tie =
      style.missTarget === 'fewest'
        ? -view.counts[a.target]
        : style.missTarget === 'most'
          ? view.counts[a.target]
          : 0
    const score = nHeld * 100 + tie
    if (score > bestScore) {
      best = a
      bestScore = score
    }
  }
  return { type: 'ask', seat: view.seat, target: best.target, card: best.card }
}

/* ------------------------------------------------- full-skill (planner) --- */

/**
 * The flow for a skill that can plan claims (`planClaims: true`). Every branch below is gated
 * by the style, so this one function is `medium`, `hard`, and every STYLES.md §3 roster entry.
 */
function decideWithPlanner(view: SeatView, pol: ActivePolicy, t?: Sink): GameAction {
  const seat = view.seat
  const { style } = pol
  const k = knowledgeFor(view, pol)

  if (view.phase === 'endgame') {
    // Endgame counting: every remaining card is with the claimer's own team; knowledge + count
    // exhaustion locate most of them outright, and the rest are assigned by count-consistency
    // (planClaim). Claim the most-certain book first — its reveal feeds the next
    // buildKnowledge call and pins further cards.
    const a = forcedClaim(view, k)
    if (t && a.type === 'claim') {
      concludeForced(t, view, k, a.book, 'forced-claim', 'the endgame: every remaining card is with the claiming team, and claims are the only moves left.')
    }
    return a
  }

  // 1. Books fully in own hand are free certainty at every style but the Hoarder, for which
  //    `minHandSize` prices the six cards it costs (see `withinHoardLimits`). Under `ownTurn`
  //    timing the escape hatch is "no legal ask left", which is also the branch that reaches
  //    `forcedClaim` below, so refusing here can never leave the seat without a move.
  const complete = declarableOwnBook(view, style, () => legalAsksFromView(view).length === 0, t)
  if (complete !== null) {
    if (t) conclude(t, 'own-book-claim', `Declared ${complete} — all six cards are in this hand.`)
    return claimAllSelf(view, complete)
  }

  // 2. Claim as soon as a whole book is certainly located on the team — unless the style
  //    declares only what is wholly in its own hand (the passive extreme, handled at step 1).
  if (!style.declareOnlyOwnHand) {
    const refusedBefore = t ? t.refused.length : 0
    const certain = certainClaim(view, k, style, t)
    if (certain !== null) {
      if (t && certain.type === 'claim') concludeCertain(t, view, k, certain.book)
      return certain
    }
    if (t && t.refused.length === refusedBefore) {
      t.refused.push({ kind: 'certain-claim', reason: 'no unresolved set is certainly located on this team' })
    }
  } else if (t) {
    t.refused.push({ kind: 'certain-claim', reason: 'this style declares only sets held wholly in its own hand' })
  }

  const stalled = isDeepStalled(view)
  const ranked = rankAsksWith(view, k, style)
  if (t && ranked.length > 0) t.ranked = ranked.slice(0, 5)

  // 3. A certain hit is riskless progress — take it before any speculative declare.
  if (ranked.length > 0) {
    const top = ranked[0]
    if (holderOf(k, top.card) === top.target) {
      // Certain hits sort strictly above everything else (`certaintyBonus >= 20`); the style
      // still applies its near-tie information-protection choice among them.
      const pick = pickAsk(view, k, ranked, pol, t)
      if (t) concludeAsk(t, k, pick)
      return { type: 'ask', seat, target: pick.target, card: pick.card }
    }
  }

  // 4. Speculative declare (see evClaim). Skipped entirely by a certainty-only style.
  if (!style.declareOnlyWhenCertain && !style.declareOnlyOwnHand) {
    const ev = evClaim(view, k, style, stalled, t)
    if (ev !== null) return ev
  } else if (t) {
    t.refused.push({
      kind: 'ev-claim',
      reason: style.declareOnlyOwnHand
        ? 'this style declares only sets held wholly in its own hand'
        : 'this style never declares on a guess (certainty only)',
    })
  }

  // 5. Dead position: claiming on best evidence is the only progress left.
  if (stalled) {
    const a = forcedClaim(view, k)
    if (t && a.type === 'claim') {
      concludeForced(t, view, k, a.book, 'forced-claim', `the position is ${stallNote(view)}, and claiming on best evidence is the only progress left.`)
    }
    return a
  }

  if (ranked.length === 0) {
    const a = forcedClaim(view, k)
    if (t && a.type === 'claim') {
      concludeForced(t, view, k, a.book, 'forced-claim', 'no legal ask remains, so a claim is the only move.')
    }
    return a
  }

  // 6. The stalemate breaker: every legal ask is a KNOWN miss and nothing has hit recently —
  //    no ask can gain material, so a signalling style spends the dead turn on the most
  //    informative signal instead (see signallingAsk).
  if (style.signalling) {
    const allKnownMiss = ranked.every((r) => !(k.cands[r.card] ?? []).includes(r.target))
    if (allKnownMiss && noRecentHit(view, POLICY_CONSTANTS.signalLookback)) {
      const sig = signallingAsk(view, style)
      if (sig !== null) {
        if (t && sig.type === 'ask') concludeSignal(t, view, sig.target, sig.card)
        return sig
      }
    }
  }

  // 7. Best-ranked ask, re-scored and tie-broken per the style (see pickAsk).
  //
  //    The CONTAINMENT.md turn-pass is deliberately NOT offered here. This function is the
  //    `ownTurn` flow, i.e. `pagat48` (its other caller, `endgame`, is unreachable under
  //    `us54` — RULES_US54.md §4), and CONTAINMENT.md C1–C6 are measured under `us54` alone.
  //    `planContainedPass` refuses the 48-card rule set for the reason stated there: row 15
  //    voids a wrong declare instead of gifting it, so an opponent CAN take a contained book
  //    off the board and the licence is not the free, absorbing asset C2 measures.
  const pick = pickAsk(view, k, ranked, pol, t)
  if (t) concludeAsk(t, k, pick)
  return { type: 'ask', seat, target: pick.target, card: pick.card }
}

/* ------------------------------------------------ the us54 declare window --- */

/**
 * Could the RULES_US54.md §3 window close on this action? It closes only when the turn-holder
 * can actually ask, and the turn-holder can only ask an OPPONENT who holds cards — so when
 * every seat opposing the turn-holder is empty, `reduceDecline`'s §5 safety-requirement-2
 * guard re-opens the window instead of closing it, forever.
 *
 * That is not a hang in the engine (a declare is always available, because every unresolved
 * set's six cards are in hands), but it *is* a livelock if every bot declines out of caution.
 * Somebody has to declare, and by construction it is the team still holding cards: this is the
 * "whole team out" case of §4, where "the team holding cards simply declares the remaining
 * sets in the ordinary window".
 *
 * Computed from the public view alone — `counts` and `turn` are both public (row 17). The
 * other way to have no legal ask, a turn-holder whose hand is a union of complete sets, needs
 * no detection here: that seat holds the option first in every window and `completeOwnBook`
 * makes it declare.
 */
function windowCannotClose(view: SeatView): boolean {
  return opponentTeamSeats(view.turn).every((s) => view.counts[s] === 0)
}

/**
 * The option-holder's move inside a declare window (RULES_US54.md §3): declare, or `decline`
 * and pass the option to the next seat.
 *
 * The bots' standing bias is to decline. §3 offers the option to every seat within one cycle
 * and re-opens the window from the top after every declare, so declining costs nothing but a
 * tempo-free tick, while a wrong declare permanently gifts a set to the opponents (row 14 —
 * there is no `void` to fall back on here). The policy therefore declares only what it would
 * have claimed on its own turn under RULES.md, with one extra hard rule from §4:
 *
 * > **A cardless player's declare is nearly always self-harming** and the bots must know it:
 * > every card must be assigned to an own-team seat, so if your whole team is cardless, any
 * > declare you make is necessarily wrong and gifts the set to the opponents.
 *
 * Encoded as the first test below, and deliberately on the whole team rather than on the
 * seat: a cardless seat whose teammates hold the set can still declare it perfectly well
 * (row 15, §7 vector 9), and refusing there would throw away the variant's best play. It is a
 * RULE consequence, not a style preference, so no style knob can switch it off.
 */
function decideWindow(view: SeatView, pol: ActivePolicy, rng: Rng, t?: Sink): GameAction {
  const decline: GameAction = { type: 'decline', seat: view.seat }
  const { skill, style } = pol

  // §4: with the whole team cardless every assignment names an empty seat, so every declare
  // is necessarily wrong. Never declare — not even to break a stuck window, where declaring
  // would hand the opponents the very set they are about to win anyway.
  if (ownTeamCards(view) === 0) {
    if (t) {
      conclude(t, 'decline', 'Declined — this whole team is out of cards, so any declare would name an empty seat, necessarily fail, and gift the set (RULES_US54.md §4).')
    }
    return decline
  }

  // The situations in which declining is no longer free, and somebody must declare on best
  // evidence or the table never progresses: the two §3.2 `MUST_DECLARE` positions
  // (`mustDeclareNow`), and the ordinary dead position `isDeepStalled` detects. Under RULES.md
  // the latter is broken by a forced claim on the stalled seat's own turn; under §3 the window
  // is where that happens, and without it a `us54` table of pure decliners would run forever —
  // the engine's own `resolved === nBooks` fallback cannot save it, because nothing ever
  // resolves. Computed *before* the declare branches now, because every one of them may be
  // refused by a style and this is the flag that says refusing is not on offer. (Both tests are
  // pure reads of the view, so evaluating them unconditionally rather than short-circuited
  // changes nothing about the decision — and gives the trace the true reason, not the first.)
  const stalled = isDeepStalled(view)
  const must = mustDeclareNow(view)
  const forced = stalled || must
  if (t && forced) {
    t.notes.push(
      must
        ? mustDeclareNote(view)
        : `Declining is still legal, but the position is ${stallNote(view)} — somebody must claim on best evidence or the table never progresses.`,
    )
  }

  // A set entirely in the viewer's own hand is certain and free; take it the moment it is
  // offered, at every style. Racing for it also matters more here than under `pagat48`
  // (§3, "a slower teammate can be beaten to a set"), which is why `declareEagerness` does
  // not gate it. `minHandSize` does, because six cards is the largest spend a declare can
  // make and row 18 is a real cliff — but only where declining is a legal move at all.
  const complete = declarableOwnBook(view, style, () => forced, t)
  if (complete !== null) {
    if (t) conclude(t, 'own-book-claim', `Declared ${complete} — all six cards are in this hand, and the §3 race makes waiting the only way to lose it.`)
    return claimAllSelf(view, complete)
  }

  if (!skill.planClaims) {
    // Without a claim planner the seat declares only what it can see outright (handled above).
    // It breaks a forced window with the same guess-the-holders claim it uses when RULES.md
    // forces one on it.
    if (forced) {
      const g = guessClaim(view, rng)
      if (t && g.type === 'claim') {
        conclude(t, must ? 'must-declare' : 'guess-claim', `Declared ${g.book} with guessed holders — ${must ? 'declining is illegal here (MUST_DECLARE)' : 'the stalled position demands a claim'}, and this skill has no claim planner.`)
        t.notes.push('Cards in this hand are assigned here; every other card of the set is guessed onto a random teammate.')
      }
      return g
    }
    if (t) conclude(t, 'decline', 'Declined — this skill has no claim planner and no complete set in hand, so declining is its only window move.')
    return decline
  }

  const k = knowledgeFor(view, pol)
  if (!style.declareOnlyOwnHand) {
    const refusedBefore = t ? t.refused.length : 0
    const certain = certainClaim(view, k, style, t)
    if (certain !== null) {
      if (t && certain.type === 'claim') concludeCertain(t, view, k, certain.book)
      return certain
    }
    if (t && t.refused.length === refusedBefore) {
      t.refused.push({ kind: 'certain-claim', reason: 'no unresolved set is certainly located on this team' })
    }
  } else if (t) {
    t.refused.push({ kind: 'certain-claim', reason: 'this style declares only sets held wholly in its own hand' })
  }
  if (!style.declareOnlyWhenCertain && !style.declareOnlyOwnHand) {
    // A `us54` window re-opens after every declare, so there is no tempo pressure to guess
    // early and the downside is a gifted set rather than a void — the un-stalled threshold
    // stays the style's own, and only a proven-dead position relaxes it, exactly as under
    // RULES.md.
    const ev = evClaim(view, k, style, forced, t, must && !stalled ? 'forced' : undefined)
    if (ev !== null) return ev
  } else if (t) {
    t.refused.push({
      kind: 'ev-claim',
      reason: style.declareOnlyOwnHand
        ? 'this style declares only sets held wholly in its own hand'
        : 'this style never declares on a guess (certainty only)',
    })
  }
  if (forced) {
    const a = forcedClaim(view, k)
    if (t && a.type === 'claim') {
      concludeForced(
        t,
        view,
        k,
        a.book,
        must ? 'must-declare' : 'forced-claim',
        must
          ? 'declining is illegal here (MUST_DECLARE), so the least-bad claim is made.'
          : `the position is ${stallNote(view)}, and a claim in the window is the only thing that can ever resolve a set.`,
      )
    }
    return a
  }
  if (t) conclude(t, 'decline', declineHeadline(view))
  return decline
}

/**
 * The option-holder's move with the window CLOSED. Under RULES_US54.md §3 a declare is illegal
 * there (`NO_DECLARE_WINDOW`), so unlike `pagat48` the turn-holder's only move is an ask, and
 * every claim branch of the ordinary flow has to be skipped rather than merely deprioritised.
 */
function decideUs54Ask(view: SeatView, pol: ActivePolicy, rng: Rng, t?: Sink): GameAction {
  const seat = view.seat
  const { skill, style } = pol
  const asks = legalAsksFromView(view)
  // `reduceDecline` never closes the window into a state with no legal ask, so this is
  // unreachable; `checkInvariants` reports it as "no legal action exists ... not finished".
  // Emit the declare the engine will refuse rather than an ask that cannot be built.
  if (asks.length === 0) {
    if (t) {
      conclude(t, 'error-branch', 'No legal ask exists with the window closed — an engine invariant is broken; emitted the decline the engine will refuse so the failure stays visible.')
    }
    return { type: 'decline', seat }
  }
  if (!skill.planClaims) {
    if (rng() < skill.errorRate) {
      const a = asks[randInt(rng, asks.length)]
      if (t) {
        conclude(t, 'ranked-ask', `Asked seat ${a.target} for ${pc(a.card)} — a blunder: this skill misplays ${Math.round(skill.errorRate * 100)}% of asks, and the seeded roll replaced the deliberate choice with a random legal one.`)
      }
      return { type: 'ask', seat, target: a.target, card: a.card }
    }
    const kLow = knowledgeFor(view, pol)
    const rankedLow = rankAsksWith(view, kLow, style)
    if (t) t.ranked = rankedLow.slice(0, 5)
    const topLow = preferredAsk(rankedLow, style, t)
    if (t) concludeAsk(t, kLow, topLow)
    return { type: 'ask', seat, target: topLow.target, card: topLow.card }
  }
  const k = knowledgeFor(view, pol)
  const ranked = rankAsksWith(view, k, style)
  if (ranked.length === 0) {
    if (t) conclude(t, 'error-branch', 'The ranking is empty though legal asks exist — a defensive branch; played the first legal ask.')
    return { type: 'ask', seat, target: asks[0].target, card: asks[0].card }
  }
  if (t) t.ranked = ranked.slice(0, 5)
  const pick = pickAsk(view, k, ranked, pol, t)
  // The CONTAINMENT.md turn-pass, considered against the ask the style would otherwise play.
  // This is the branch that matters under `us54`: the window is closed here, so a declare is
  // illegal (`NO_DECLARE_WINDOW`) and the seat's only move is an ask — which is precisely the
  // move a contained book converts from "spend a turn badly" into "hand the turn to a chosen
  // opponent for nothing". Off at `containedPass: 0`.
  const why: { reason?: string } | undefined = t ? {} : undefined
  const pass = planContainedPass(view, k, style, skill, pick, why)
  if (pass !== null) {
    if (t) concludeContainedPass(t, view, k, skill, pick, pass)
    return { type: 'ask', seat, target: pass.target, card: pass.card }
  }
  if (t) {
    if (why !== undefined && why.reason !== undefined) {
      t.refused.push({ kind: 'contained-pass', reason: why.reason })
    }
    concludeAsk(t, k, pick)
  }
  return { type: 'ask', seat, target: pick.target, card: pick.card }
}

/* ---------------------------------------------------------- trace prose --- */
/*
 * Everything below is narration: pure read-only prose over quantities the decision above
 * already computed (or recomputes verbatim — `planClaim` and the stall scan are deterministic,
 * so re-deriving a plan for its holders costs a few comparisons and can never disagree with the
 * plan that was played). None of it is reachable from `decide`, none of it draws from the rng,
 * and none of it writes to the view — the frozen-view test in tests/bots/explain.test.ts holds
 * these functions to the same standard as the decision itself.
 */

/** Which hoard knob bit, in prose — the reason a Hoarder refused a declare it could make. */
function hoardReason(view: SeatView, book: BookId, style: StyleParams): string {
  const members = new Set<Card>(bookCards(book, view.config))
  const remaining = view.hand.filter((c) => !members.has(c))
  if (style.minHandSize > 0 && remaining.length < style.minHandSize) {
    return `declaring it would drop this hand to ${n_(remaining.length, 'card')}, below the style's floor of ${style.minHandSize} (row 18: an empty hand is out of the game)`
  }
  const perBook = new Map<BookId, number>()
  for (const c of remaining) {
    const b = cardBook(c)
    perBook.set(b, (perBook.get(b) ?? 0) + 1)
  }
  let licences = 0
  for (const n of perBook.values()) if (n < 6) licences++
  return `declaring it would leave ask-licences into only ${n_(licences, 'set')}, below the style's floor of ${style.hoardBooks} (row 6: holding a card is the only licence to ask)`
}

/** The `isDeepStalled` evidence, restated with its numbers for the trace. */
function stallNote(view: SeatView): string {
  const log = view.log
  let lastHit = -1
  let lastClaim = -1
  for (let i = log.length - 1; i >= 0; i--) {
    const ev = log[i]
    if (lastHit === -1 && ev.type === 'ask' && ev.hit) lastHit = i
    if (lastClaim === -1 && ev.type === 'claim') lastClaim = i
    if (lastHit !== -1 && lastClaim !== -1) break
  }
  const last = log.length - 1
  const noHitFor = last - lastHit
  const noClaimFor = last - lastClaim
  const [hitLimit, claimLimit, hardLimit] = POLICY_CONSTANTS.stall[rulesFor(view.config).declareTiming]
  return `provably dead: no hit for ${n_(noHitFor, 'event')} and no declare for ${noClaimFor} (limits ${hitLimit}/${claimLimit}, hard limit ${hardLimit})`
}

/** Which RULES_US54.md §3.2 case made the decline illegal. */
function mustDeclareNote(view: SeatView): string {
  return windowCannotClose(view)
    ? 'Declining is illegal here (MUST_DECLARE): every opponent of the turn-holder is out of cards, so the window can never close into an ask.'
    : 'Declining is illegal here (MUST_DECLARE): the turn-holder has no legal ask, so the window has nothing to close into.'
}

/** The ordinary decline, with where the option goes next. */
function declineHeadline(view: SeatView): string {
  const w = view.declareWindow
  const declined = w?.declined ?? 0
  return declined >= 5
    ? `Declined — nothing declarable above the bar; the window closes and seat ${view.turn} asks.`
    : `Declined — nothing declarable above the bar; the option passes on (decline ${declined + 1} of 6), and once the window closes seat ${view.turn} asks.`
}

/** "2♥, 3♥ in this hand; 6♥ with seat 2" — a claim's assignments, grouped by seat in seat order. */
function assignmentNote(view: SeatView, plan: ClaimPlan): string {
  const bySeat = new Map<Seat, Card[]>()
  for (const c of bookCards(plan.book, view.config)) {
    const s = plan.assignments[c]
    const list = bySeat.get(s)
    if (list) list.push(c)
    else bySeat.set(s, [c])
  }
  const parts: string[] = []
  for (const [s, cards] of [...bySeat.entries()].sort((a, b) => a[0] - b[0])) {
    parts.push(`${cards.map(pc).join(', ')} ${s === view.seat ? 'in this hand' : `with seat ${s}`}`)
  }
  return parts.join('; ')
}

/** Why `targetByCount` chose the seat it chose — shared by the pass and designate verdicts. */
function targetWhy(view: SeatView, to: Seat, pol: BotPolicy): string {
  if (!pol.skill.countTargeting) return ' — the first candidate; this skill does not compare hand sizes'
  return pol.style.passTarget === 'most'
    ? ` — the candidate with the most cards (${view.counts[to]}), who can convert the turn best`
    : ` — the candidate with the fewest cards (${view.counts[to]})`
}

/** One-sentence ask verdicts, matching the RankedAsk reason register. */
function askHeadline(r: RankedAsk): string {
  if (r.p === 1) return `Asked seat ${r.target} for ${pc(r.card)} — a certain hit.`
  if (r.p === 0) return `Asked seat ${r.target} for ${pc(r.card)} — a known miss, conceding the turn there.`
  return `Asked seat ${r.target} for ${pc(r.card)} — ${Math.round(r.p * 100)}% to hit.`
}

/** Verdict for an ordinary chosen ask (certain hits get their own kind — the pane treats them differently). */
function concludeAsk(t: Sink, k: Knowledge, pick: RankedAsk): void {
  const certain = holderOf(k, pick.card) === pick.target
  conclude(t, certain ? 'certain-hit' : 'ranked-ask', askHeadline(pick))
  t.notes.push(pick.reason)
  if (certain) t.notes.push('Riskless material: a hit takes the card and keeps the turn (row 9).')
}

/** Verdict for a certain declare — recomputes the (deterministic) plan for its holder list. */
function concludeCertain(t: Sink, view: SeatView, k: Knowledge, book: BookId): void {
  const plan = planClaim(view, k, book)
  const foreign = !view.hand.some((c) => cardBook(c) === book)
  t.claim = { book, p: 1, uncertain: 0, foreign }
  conclude(t, 'certain-claim', `Declared ${book} — every card is certainly located on this team.`)
  t.notes.push(`Holders, all certain: ${assignmentNote(view, plan)}.`)
  if (foreign) t.notes.push('A foreign declare: this hand holds no card of the set — the whole proof is public inference.')
}

/** Verdict for a claim the position demanded (endgame, stall, no legal ask, MUST_DECLARE). */
function concludeForced(
  t: Sink,
  view: SeatView,
  k: Knowledge,
  book: BookId,
  kind: 'forced-claim' | 'must-declare',
  why: string,
): void {
  const plan = planClaim(view, k, book)
  t.claim = { book, p: plan.p, uncertain: plan.uncertain.length, foreign: !view.hand.some((c) => cardBook(c) === book) }
  conclude(t, kind, `Declared ${book} on best evidence — ${why}`)
  t.notes.push(`The strongest available plan: p = ${fp(plan.p)} with ${n_(plan.uncertain.length, 'guessed card')}; holders: ${assignmentNote(view, plan)}.`)
}

/** Verdict for the plannerless guess-the-holders claim. */
function concludeGuess(t: Sink, book: BookId, why: string): void {
  conclude(t, 'guess-claim', `Declared ${book} with guessed holders — ${why}`)
  t.notes.push('This skill has no claim planner: cards in this hand are assigned here, and every other card of the set is guessed onto a random teammate.')
}

/** Verdict for the stalemate-breaking signalling ask. */
function concludeSignal(t: Sink, view: SeatView, target: Seat, card: Card): void {
  const book = cardBook(card)
  const held = view.hand.filter((c) => cardBook(c) === book).length
  conclude(t, 'signalling-ask', `Asked seat ${target} for ${pc(card)} — a known miss spent on signal.`)
  t.notes.push(`Every legal ask is a known miss and nothing has hit in the last ${POLICY_CONSTANTS.signalLookback} events, so no ask can gain material.`)
  t.notes.push(`The ask still publishes that this hand holds at least one card of ${book} — it holds ${held}, its strongest set, so teammates running the same inference learn the most from it.`)
}

/** Verdict for the contained-book turn-pass, with the arithmetic that chose it. */
function concludeContainedPass(
  t: Sink,
  view: SeatView,
  k: Knowledge,
  skill: SkillParams,
  ordinary: RankedAsk,
  pass: ContainedPassPlan,
): void {
  // The same estimate the valuation compared against (contained.ts): the refined probability
  // for a refinedInference skill, the slot prior otherwise.
  const p = skill.refinedInference ? refinedHitProbability(k, ordinary.card, ordinary.target) : ordinary.p
  const v = pass.value
  t.passValue = v
  t.refused.push({
    kind: 'ranked-ask',
    reason: `the ordinary ask — ${pc(ordinary.card)} at seat ${ordinary.target}, ${Math.round(p * 100)}% to hit — is worth less than aiming the conceded turn`,
  })
  conclude(t, 'contained-pass', `Passed the turn — asked seat ${pass.target} for ${pc(pass.card)}, a guaranteed miss: every card of ${pass.book} is certainly on this team.`)
  t.notes.push(`A conceded turn yields about ${fp(v.E)} cards (hit rate measured from the public log); the mean live hand is ${fp(v.meanHand)} cards.`)
  t.notes.push(`Aiming the miss at seat ${pass.target} (${n_(view.counts[pass.target], 'card')}) instead of seat ${ordinary.target} (${view.counts[ordinary.target]}) saves ${fp(v.gain)} cards against a tempo cost of ${fp(v.tempo)}.`)
  t.notes.push(`The pass wins while the ordinary ask hits below ${fp(v.threshold)}; this one sits at ${fp(p)}.`)
  t.notes.push(
    pass.reused
      ? `${pc(pass.card)} is already publicly missing from this hand, so repeating it publishes nothing new.`
      : `First use: the ask publishes that this hand lacks ${pc(pass.card)}${v.infoCost > 0 ? ` (priced at ${fp(v.infoCost)} cards)` : ''}.`,
  )
}

/**
 * The adaptive read, prepended before any branch narration (this runs at resolution time, so
 * its lines are the first the pane shows): which style the v1.0 engine chose and why, then
 * one line per opponent seat with its top classification. The numbers are the ones the
 * decision used — `choice.expected` includes the anchor bias, and the read's `events` is the
 * phase-truncated count the posterior was actually evaluated on, not the raw log length.
 */
function noteAdaptive(t: Sink, spec: AdaptiveSpec, choice: AdaptiveChoice): void {
  const observed = choice.reads[0]?.events ?? 0
  const warmup = observed < (spec.warmupEvents ?? ADAPTIVE_DEFAULTS.warmupEvents)
  const label = Object.hasOwn(STYLE_ROSTER, choice.style) ? STYLE_ROSTER[choice.style].label : choice.style
  const ev = choice.expected[choice.style]
  t.notes.push(
    warmup
      ? `Adaptive: in warmup (${observed} of ${n_(spec.warmupEvents ?? ADAPTIVE_DEFAULTS.warmupEvents, 'event')} observed) — playing the ${label} anchor (expected score rate ${fp(ev)}).`
      : `Adaptive: playing ${label} — expected score rate ${fp(ev)} against the current reads, warm after ${n_(observed, 'observed event')}${choice.switched ? '; switched off the previous phase choice' : ''}.`,
  )
  for (const r of choice.reads) {
    t.notes.push(`Seat ${r.seat} reads as ${r.top} (${fp(r.confidence)}) after ${n_(r.events, 'event')}.`)
  }
}

/**
 * The bounded-memory read, prepended before any branch narration: the budget, what survived
 * eviction, and where the spotlight sat — the numbers this decision actually ran on, so the
 * /play advisor can stay honest about what a k-bit seat could still remember.
 */
function noteBounded(t: Sink, spec: BoundedSpec, read: BoundedRead, style: StyleParams): void {
  const bits = Number.isFinite(spec.bits) ? Math.max(0, Math.floor(spec.bits)) : 0
  t.notes.push(
    `Bounded: ${bits}-bit memory — kept ${read.kept} of ${n_(read.total, 'derivable fact')} (${read.cost} bits)${read.spotlight !== null ? `, spotlight on ${read.spotlight}` : ''}; playing ${style.label} over the restricted knowledge.`,
  )
}

/* ----------------------------------------------------------- validation --- */

/** View-side legality check for the chosen action; anything false => fallback. */
function isViewLegal(view: SeatView, action: GameAction): boolean {
  if (action.seat !== view.seat) return false
  const w = view.declareWindow
  // Whose move it is. RULES_US54.md §3 moves it off the turn-holder and onto the seat holding
  // the declare option whenever a window is open — and §3.1 removes NOT_YOUR_TURN as a declare
  // error entirely, which is exactly why this is not folded into the per-action checks.
  // `pagat48` never opens a window, so it always takes the `else` and is unchanged.
  if (w) {
    if (w.option !== view.seat) return false
  } else if (view.turn !== view.seat) return false
  const myTeam = seatTeam(view.seat)
  switch (action.type) {
    case 'ask': {
      // §3: while the window is open nobody asks, not even the turn-holder.
      if (w) return false
      if (view.phase !== 'playing') return false
      if (view.hand.length === 0) return false
      if (typeof action.card !== 'string' || !isCard(action.card, view.config)) return false
      if (seatTeam(action.target) === myTeam) return false
      if (view.counts[action.target] <= 0) return false
      const book = cardBook(action.card)
      if (!view.hand.some((c) => cardBook(c) === book)) return false
      if (!view.config.toggles.askOwnCardAllowed && view.hand.includes(action.card)) return false
      return true
    }
    case 'claim': {
      if (view.phase !== 'playing' && view.phase !== 'endgame') return false
      // RULES_US54.md §3.1: under `anyTime` a declare needs an open window at this seat (the
      // check above), and nothing else — the turn is irrelevant. Under `ownTurn` the turn
      // check above is the rule (RULES.md row 11) and no window ever exists.
      if (rulesFor(view.config).declareTiming === 'anyTime' && !w) return false
      if (view.books[action.book]) return false
      const cards = bookCards(action.book, view.config)
      if (cards.length !== 6) return false
      const keys = Object.keys(action.assignments)
      if (keys.length !== 6) return false
      for (const c of cards) {
        const s = action.assignments[c]
        if (s === undefined || seatTeam(s) !== myTeam) return false
      }
      return true
    }
    case 'pass':
      return (
        view.phase === 'awaitPass' &&
        seatTeam(action.to) === myTeam &&
        action.to !== view.seat &&
        view.counts[action.to] > 0
      )
    case 'designate':
      return (
        view.phase === 'awaitDesignate' &&
        seatTeam(action.to) !== myTeam &&
        view.counts[action.to] > 0
      )
    // RULES_US54.md §3: legal exactly when this seat holds the option, which the mover check
    // above already established. `pagat48` reaches this with `w` undefined and refuses.
    case 'decline':
      return w !== undefined
    default:
      return false
  }
}

/**
 * Legal-by-construction last resort (the Phase-2 placeholder policy): first
 * teammate/opponent with cards for pass/designate; complete-own-hand claim,
 * else seeded-random legal ask, else most-held book with seeded guesses.
 *
 * Style-free by design: this branch exists because the styled policy produced something the
 * engine would refuse, so it must not consult the vector that just failed.
 */
function fallbackAction(view: SeatView, seed: number): GameAction {
  const rng = mulberry32(seed >>> 0)
  const seat = view.seat
  switch (view.phase) {
    case 'awaitPass': {
      const mates = teammateSeats(seat)
      const to = mates.find((s) => view.counts[s] > 0) ?? mates[0]
      return { type: 'pass', seat, to }
    }
    case 'awaitDesignate': {
      const opps = opponentTeamSeats(seat)
      const to = opps.find((s) => view.counts[s] > 0) ?? opps[0]
      return { type: 'designate', seat, to }
    }
    case 'endgame':
    case 'playing': {
      // RULES_US54.md §3 narrows the set of legal shapes so far that the 48-card placeholder
      // is no longer legal-by-construction: inside a window only declare/decline are, and
      // outside one only an ask is. Both branches stay legal here.
      const anyTime = rulesFor(view.config).declareTiming === 'anyTime'
      if (anyTime && view.declareWindow) return { type: 'decline', seat }
      if (view.phase === 'playing') {
        if (!anyTime) {
          const complete = completeOwnBook(view)
          if (complete !== null) return claimAllSelf(view, complete)
        }
        const asks = legalAsksFromView(view)
        if (asks.length > 0) {
          const a = asks[randInt(rng, asks.length)]
          return { type: 'ask', seat, target: a.target, card: a.card }
        }
      }
      // Under `us54` with the window closed and no legal ask the position has no legal action
      // at all — an engine bug `checkInvariants` reports. Emit something the reducer refuses
      // rather than a claim it would refuse anyway, so the failure stays visible.
      if (anyTime) return { type: 'decline', seat }
      return guessClaim(view, rng)
    }
    case 'finished':
      // Unreachable through the bot chain; return an action the reducer will
      // reject rather than throwing.
      return { type: 'pass', seat, to: seat }
  }
}

/* --------------------------------------------------------------- decide --- */

/**
 * Resolve a policy spec *with the view in hand* — the one resolution `resolvePolicy` cannot
 * do. A static spec passes straight through; an `AdaptiveSpec` is answered by `chooseStyle`
 * and played as the chosen roster style at hard skill (STYLES.md §2's "every style shares one
 * identical, full-strength inference engine" — the adaptive engine picks the style, never a
 * weaker inference); a `BoundedSpec` is answered by `boundedRead` and played as its named
 * roster style at hard skill over the restricted knowledge (the budget caps the memory, never
 * the policy). Called inside the wrappers' existing try/catch, so a throwing classifier or
 * derivation degrades to the same fallback as any other policy failure. `Object.hasOwn` guards
 * both roster lookups because the chosen id comes from table data or the wire; the documented
 * default is the degrade, not a new policy.
 *
 * The bounded read is computed eagerly, for both wrappers alike — laziness in one and not the
 * other would let a malformed view throw on different branches and break the explain parity.
 */
function resolveWithView(view: SeatView, policy: PolicySpec, t?: Sink): ActivePolicy {
  if (isBoundedSpec(policy)) {
    const wanted = policy.style ?? BOUNDED_DEFAULTS.style
    const style = Object.hasOwn(STYLE_ROSTER, wanted)
      ? STYLE_ROSTER[wanted]
      : STYLE_ROSTER[BOUNDED_DEFAULTS.style]
    const read = boundedRead(view, policy)
    if (t) noteBounded(t, policy, read, style)
    return { skill: SKILL_PRESETS.hard, style, boundedK: () => read.knowledge }
  }
  if (!isAdaptiveSpec(policy)) return resolvePolicy(policy)
  const choice = chooseStyle(view, policy)
  if (t) noteAdaptive(t, policy, choice)
  const style = Object.hasOwn(STYLE_ROSTER, choice.style)
    ? STYLE_ROSTER[choice.style]
    : STYLE_ROSTER[ADAPTIVE_DEFAULTS.anchor]
  return { skill: SKILL_PRESETS.hard, style }
}

/**
 * The bot decision function. Pure over (view, policy, seed); never throws; never emits an
 * action the engine's reduce() would reject (validated against the view, with the placeholder
 * policy as final fallback).
 *
 * `policy` is a difficulty tier name (the three shipped presets), a bare `StyleParams` (played
 * at full-strength inference, STYLES.md §2), an explicit `{ skill, style }` pair for the
 * BOT_LAB.md §1.3 skill ablation, the FishAI v1.0 `AdaptiveSpec`, or the FishAI v1.5
 * `BoundedSpec` (both resolved against this view — see `resolveWithView`).
 */
export function decide(view: SeatView, policy: PolicySpec, seed: number): GameAction {
  let action: GameAction | null = null
  try {
    action = decideInner(view, resolveWithView(view, policy), seed)
  } catch {
    // decideInner failed; action stays null and the fallback takes over.
  }
  try {
    if (action !== null && (view.phase === 'finished' || isViewLegal(view, action))) return action
    return fallbackAction(view, seed)
  } catch {
    const seat = view !== null && typeof view === 'object' && typeof view.seat === 'number' ? view.seat : (0 as Seat)
    return { type: 'pass', seat, to: seat }
  }
}

/**
 * `decide`, with the reasoning attached — the v0.5 assistant surface.
 *
 * The wrapper is deliberately shaped statement-for-statement like `decide`: the same
 * `decideInner` call (plus a sink), the same view-legality check, the same fallback ladder.
 * That is what makes the two promises inherited rather than re-argued:
 *
 *  - **`action` is bit-identical to `decide(view, policy, seed)`.** The sink is only ever
 *    *written to*, every write is behind an `if (t)` guard, and no trace statement draws from
 *    the seeded rng — so the decision path consumes exactly the values it consumes when the
 *    sink is absent. `tests/bots/explain.test.ts` fuzzes the equivalence across both rule sets,
 *    every roster style and every tier.
 *  - **It never throws and never returns an illegal action**, because the try/catch shape and
 *    `isViewLegal` gate are `decide`'s own. A failure inside the styled decision (or, in
 *    principle, inside the narration) lands in the same fallback, and the trace then says so
 *    honestly (`kind: 'fallback'`) instead of describing a move that was not played.
 */
export function decideExplained(view: SeatView, policy: PolicySpec, seed: number): ExplainedDecision {
  const t = newSink()
  let action: GameAction | null = null
  try {
    action = decideInner(view, resolveWithView(view, policy, t), seed, t)
  } catch {
    // decideInner failed; action stays null and the fallback takes over.
  }
  try {
    if (action !== null && (view.phase === 'finished' || isViewLegal(view, action))) {
      return { action, trace: sealTrace(t) }
    }
    // The styled decision failed or produced something the engine would refuse. Start the trace
    // afresh: whatever the sink collected describes a decision that was NOT played, and showing
    // its notes beside the placeholder would attribute reasoning to a move that has none.
    const fb = fallbackAction(view, seed)
    const f = newSink()
    conclude(
      f,
      'fallback',
      action === null
        ? 'The styled policy failed outright; a legal-by-construction placeholder action was played instead.'
        : `The styled policy chose ${action.type === 'ask' ? 'an ask' : `a ${action.type}`} the engine would refuse; a legal-by-construction placeholder was played instead.`,
    )
    f.notes.push('The placeholder consults no style: it exists because the styled decision failed, so it must not lean on the vector that just failed.')
    return { action: fb, trace: sealTrace(f) }
  } catch {
    const seat = view !== null && typeof view === 'object' && typeof view.seat === 'number' ? view.seat : (0 as Seat)
    return {
      action: { type: 'pass', seat, to: seat },
      trace: {
        kind: 'error-branch',
        headline: 'The view itself is malformed — emitted a pass the engine will refuse rather than throwing.',
        notes: [],
        refused: [],
      },
    }
  }
}

function decideInner(view: SeatView, pol: ActivePolicy, seed: number, t?: Sink): GameAction {
  // One stream per decision, drawn in the order the taken branch consumes it. Only a skill
  // with a non-zero error rate or no claim planner ever draws from it.
  const rng = mulberry32(seed >>> 0)
  // RULES_US54.md §3 splits the `playing` decision in two, and neither half is the `pagat48`
  // one: inside a declare window the choice is declare-or-decline (and the acting seat is the
  // option holder, not the turn-holder); outside one the only legal move is an ask. `endgame`
  // is unreachable under this rule set (§4), so `playing` is the whole story.
  if (rulesFor(view.config).declareTiming === 'anyTime' && view.phase === 'playing') {
    if (view.declareWindow) return decideWindow(view, pol, rng, t)
    return decideUs54Ask(view, pol, rng, t)
  }
  switch (view.phase) {
    case 'awaitPass':
      return passAction(view, pol, t)
    case 'awaitDesignate':
      return designateAction(view, pol, t)
    case 'finished':
      if (t) conclude(t, 'error-branch', 'The game is over — there is nothing to decide, and this placeholder pass will be refused by the engine.')
      return { type: 'pass', seat: view.seat, to: view.seat }
    case 'playing':
    case 'endgame': {
      if (!pol.skill.planClaims) return decideNoPlanner(view, pol, rng, t)
      return decideWithPlanner(view, pol, t)
    }
  }
}
