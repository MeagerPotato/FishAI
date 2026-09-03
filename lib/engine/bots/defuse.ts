/**
 * defuse.ts — the concession term on an ordinary ask ([CONCESSION.md](../../../CONCESSION.md) §3).
 *
 * ## The result this file exists to encode, including the half of it that failed
 *
 * The project owner asked for "off-limits" reasoning: identify the opponents who would punish a
 * conceded turn, and refuse to ask them. The threat model behind that request is sound and is
 * built in [threat.ts](threat.ts) — a seat's reach is real, measurable from the public log, and
 * the engine's existing hand-size proxy for it has the **wrong sign**.
 *
 * **The prescription is not sound, and was measured losing.** Penalising asks by the threat of
 * the seat they would concede to costs 4.5 to 11.7 points of win rate — and the paired
 * set-difference falls monotonically with the appetite, from -0.52 to -1.61 — on
 * duplicate deals against a control that reproduces `decide` byte-for-byte. An information-free
 * perturbation of the same magnitude costs nothing, so the loss is caused by the threat
 * information itself and not by the disturbance. CONCESSION.md §2 and §2.1 carry both tables.
 *
 * The reason is a confound that RULES_US54.md row 6 makes structural. A seat is dangerous exactly
 * when it holds a card of a set this team is heavily invested in — and that is the same fact that
 * makes it the seat most likely to be holding the card this team wants. Measured:
 * `corr(threat, best hit probability available at that seat) = +0.249` over 33,595 observations,
 * with mean best `p` of **0.471** at high-threat seats against **0.326** at low-threat ones.
 * Avoiding the dangerous seat means abandoning your own best set.
 *
 * So the threat model is kept and the prescription is inverted. The right answer to a seat with
 * reach into one of your sets is not to leave it alone; it is to **take the card back**. A hit
 * removes the very card the licence rests on, and row 9 keeps the turn while doing it. That is
 * this file: a bonus on the *hit* branch, not a penalty on the miss branch.
 *
 * Measured, appetite fixed at 1 on a tuning bank and then confirmed on two disjoint held-out
 * banks of 600 duplicate pairs each: **+1.50 [1.24, 1.75] and +1.65 [1.38, 1.91] sets per
 * duplicate pair**, 62.2% and 61.3% win rate. The sign replicates across all nine roster styles.
 *
 * ## The valuation
 *
 * For a legal ask of card `c` at seat `t`, where `B = cardBook(c)`:
 *
 * ```
 * bonus = defuse * wHit * p * (perPrey * prey(B)) / (1 + E)     if t has a licence in B
 *       = 0                                                     otherwise
 * ```
 *
 * Term by term:
 *
 *  - **`p`** — the seat's own hit estimate, refined where the skill can (`refinedHitProbability`).
 *    The card is only taken on a hit, so the credit is weighted by the chance of the hit. This is
 *    also what keeps the term from steering into hopeless asks: a defusal that will not land buys
 *    nothing and is priced at nothing.
 *  - **`prey(B)`** — cards of `B` certainly located on this team ({@link preyInBook}). This is
 *    what `t`'s licence in `B` actually threatens, and therefore what taking the card protects.
 *    Deliberately **per set, not per seat**: crediting the target's whole reach was measured too,
 *    and per-set is both better (+1.50 against +1.21 on the same bank) and the only version whose
 *    causal story is true — a hit on a card of `B` cannot protect a set it is not in.
 *  - **`perPrey`** — {@link THREAT_COEFFICIENTS}, the fitted cards-per-prey-card slope. Global,
 *    not a style knob: it is measured geometry, and STYLES.md §3.1 forbids a style from tuning
 *    its own trigger.
 *  - **`/(1 + E)`** — `E` is `turnYield`, cards a turn is worth. Dividing converts the credit
 *    from cards into the ranker's own units, where `wHit` buys one unit of hit probability and a
 *    turn is worth `1 + E` cards. Without it the term would grow with the roster's hit rate and
 *    the appetite would mean something different in every game.
 *  - **`defuse`** — the style's appetite, and the only thing a style contributes.
 *
 * The bonus is **added to the ranked score**, never used to build a separate branch, so
 * `minHitP` still filters the same pool and both near-tie windows still break the same ties.
 *
 * **Certain-hit dominance is NOT preserved by the arithmetic, and needs an explicit gate.** The
 * margin it used to rest on is thin — a certain hit scores at least `wHit + certaintyBonus +
 * wNarrow` = 102 against an uncertain ask's ceiling of 100 — while this bonus is bounded only by
 * `defuse * wHit * perPrey * prey / (1 + E)`, which reaches ~137 at `wHit` 70. Worse, the bonus is
 * proportional to `p * prey(B)`, so an uncertain ask into a high-prey set can collect far more
 * than a certain hit into a set whose holder has published nothing — the certain hit collects
 * exactly zero there. Measured: over 150 games x 9 roster styles the ungated term abandoned a
 * certain hit 9 times, against 0 for the `defuse: 0` control. That is a seat giving up riskless
 * material that keeps the turn (row 9) for a chance of conceding it (row 10), which is precisely
 * the trade CONCESSION.md §5 measures as losing. So `pickAsk` zeroes both concession terms for any
 * ask with `p < 1` whenever a certain hit is available; the credit stays live *among* certain hits,
 * so defusal still chooses which one to take.
 *
 * ## Where the owner's veto DOES belong, and why it is not here
 *
 * The confound above breaks completely for an ask that **cannot hit**. A guaranteed miss has no
 * defusal value by construction and pure concession cost, so there the threat model should be
 * read the way it was originally proposed — as an avoidance rule. Two such asks exist in this
 * engine and neither consults threat today: `signallingAsk` and the CONTAINMENT.md turn-pass,
 * whose `aimedTarget` picks by hand size, i.e. by the proxy §1.2 measured backwards. That is
 * handled in [contained.ts](contained.ts) and not in this file.
 *
 * Pure and deterministic over its arguments. Off at `defuse: 0`, which is what every shipped tier
 * carries, and refused outright under `pagat48` — the same compatibility gate `contained.ts`
 * documents, for the same reason: the 48-card game is held byte-identical, and the measurement
 * above was made under `us54` alone.
 */
import type { BookId, Seat } from '../types.ts'
import { allBooks, cardBook, deckFor, seatTeam } from '../cards.ts'
import { rulesFor } from '../variants.ts'
import { THREAT_COEFFICIENTS, preyInBook, seatLicences } from './threat.ts'
import type { StyleParams } from './style.ts'
import type { Knowledge, RankedAsk, SeatView } from './types.ts'

/**
 * Where a seat's published bases come from, passed in rather than derived inside the arithmetic.
 *
 * Exactly one source exists, {@link logLicences} — the whole public log — and `decide` uses it for
 * **every** seat, bounded or not. The parameter is not a promise of a second implementation; it is
 * what lets `decide` build one memoised scan per decision and hand the same object to both halves
 * of the concession layer, `defusalBonus` querying it at the ask's target and
 * `concealmentPenalty` ([conceal.ts](conceal.ts)) at the viewer's own seat.
 *
 * **State the limitation rather than the intention.** BOUNDED.md caps a v1.5 seat's retention in
 * bits, and a licence is a 1-bit `basis` fact in exactly that pool — but only the *retirement* half
 * of `seatLicences` is budgeted, because it reads that seat's restricted `k`; the ask history it
 * scans is not. So a bounded seat sees more published bases than its budget should allow. No test
 * pins any bounded/licence relation. Making the licence a first-class budgeted read is the correct
 * end state and is recorded as follow-up in CONCESSION.md §9; doing it now would move every
 * committed v1.5 number, which is not this change's business.
 */
export type LicenceLookup = (seat: Seat) => ReadonlySet<BookId>

/** The one source: the whole public log, memoised for the length of one decision. */
export function logLicences(view: SeatView, k: Knowledge): LicenceLookup {
  const cache = new Map<Seat, ReadonlySet<BookId>>()
  return (seat) => {
    let got = cache.get(seat)
    if (got === undefined) {
      got = seatLicences(view, k, seat)
      cache.set(seat, got)
    }
    return got
  }
}

/** Is the defusal term live for this seat at all? Cheap, and checked before any scan. */
export function defusalActive(view: SeatView, style: StyleParams): boolean {
  return style.defuse > 0 && rulesFor(view.config).wrongDeclare === 'opponents'
}

/**
 * MONET.md §3.6b — the appetite as a function of the public state, read once per decision.
 * `defuse` is multiplied by `max(0, 1 + threat·(T − 1) + score·S + late·L)`, where **T** counts
 * (capped at 2) the unresolved half-suits in which this team has certainly-located cards AND an
 * opponent with cards holds a live licence — the sets an opponent's reach actually threatens, the
 * same two facts `defusalBonus` credits per ask, summed over the position; **S** is this team's
 * set lead, signed and clipped to −1 / 0 / +1; **L** is 1 once fewer than half the deck's cards
 * are still in hands. Under `defusePolicy: 'scalar'` (or absent) the multiplier is 1 and the
 * number is `style.defuse`, byte for byte. Pure over `(view, k, style, licences)`; one scan of the
 * nine half-suits, on the licence lookup the ranking already built.
 */
export function defusalAppetite(view: SeatView, k: Knowledge, style: StyleParams, licences: LicenceLookup): number {
  const base = style.defuse
  if (style.defusePolicy !== 'state' || !(base > 0)) return base
  const slopes = style.defuseState ?? { threat: 0, score: 0, late: 0 }
  const me = seatTeam(view.seat)
  const opponents: Seat[] = []
  for (let s = 0; s < 6; s++) if (seatTeam(s as Seat) !== me && (view.counts[s] ?? 0) > 0) opponents.push(s as Seat)
  let threatened = 0
  for (const b of allBooks(view.config)) {
    if (view.books[b]) continue
    if (preyInBook(view, k, b) === 0) continue
    if (opponents.some((o) => licences(o).has(b))) threatened++
    if (threatened >= 2) break
  }
  let mine = 0
  let theirs = 0
  for (const r of Object.values(view.books)) {
    if (r === undefined || r.outcome === 'void') continue
    if ((r.outcome === 'team0' ? 0 : 1) === me) mine++
    else theirs++
  }
  const score = Math.sign(mine - theirs)
  let inHands = 0
  for (const c of view.counts) inHands += c
  const late = inHands * 2 < deckFor(view.config).handSize * 6 ? 1 : 0
  const m = Math.max(0, 1 + slopes.threat * (Math.min(2, threatened) - 1) + slopes.score * score + slopes.late * late)
  return base * m
}

/**
 * The defusal credit for one ask, in the ask ranker's own score units. See the file header for
 * the derivation. Returns 0 whenever the mechanism is off, the target has published no basis in
 * the asked set, or the ask protects nothing.
 *
 * `p` is supplied by the caller rather than recomputed, so the term is weighted by exactly the
 * probability the caller's skill actually believes — the refined one at hard skill, the slot
 * prior otherwise — instead of silently crediting a weak seat with a strong seat's inference.
 */
export function defusalBonus(
  view: SeatView,
  k: Knowledge,
  style: StyleParams,
  ask: RankedAsk,
  p: number,
  turn: number,
  licences: LicenceLookup,
  appetite: number = style.defuse,
): number {
  if (!defusalActive(view, style)) return 0
  if (!(appetite > 0)) return 0
  if (p <= 0) return 0
  const book = cardBook(ask.card)
  if (view.books[book]) return 0
  if (!licences(ask.target).has(book)) return 0
  const prey = preyInBook(view, k, book)
  if (prey === 0) return 0
  return (appetite * style.wHit * p * THREAT_COEFFICIENTS.perPrey * prey) / (1 + turn)
}
