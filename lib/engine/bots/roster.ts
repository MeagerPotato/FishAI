/**
 * roster.ts — the nine `us54` play styles of [STYLES.md](../../../STYLES.md) §3, as named
 * `StyleParams` presets over the vector in [style.ts](style.ts).
 *
 * ## The thresholds are re-derived, not ported
 *
 * STYLES.md §5.1 is explicit: *"Do not port the 48-card tuning. §1.1 makes every inherited
 * threshold wrong."* §1.1 says why — under [RULES.md](../../../RULES.md) row 15 a bad declare
 * **voided** the set (0 for everyone); under [RULES_US54.md](../../../RULES_US54.md) row 14 it
 * **gifts** the set to the opponents (−1 us, +1 them, a 2-point swing in a race to 5).
 *
 * Write the speculative declare as a choice between acting now and waiting. `p` is the plan's
 * success probability; `q` is the probability the set gets banked correctly anyway if this seat
 * waits — which is high, because `evClaim` only ever fires on a set that is *certainly* the
 * team's, so the teammate who actually holds the guessed card sees all six as CERTAIN from its
 * own view and will declare it correctly.
 *
 * |  | declare now | wait | declare iff |
 * |---|---|---|---|
 * | `pagat48` (void) | `p·(+1) + (1−p)·0 = p` | `q·(+1)` | `p > q` |
 * | `us54` (gift) | `p·(+1) + (1−p)·(−1−1)/2 → 2p − 1` | `q·(+1)` | `p > (1 + q)/2` |
 *
 * The shipped 48-card policy declares at `0.80`, so its implied risk appetite is `q = 0.80`.
 * **Carrying the same appetite through the `us54` arithmetic gives `(1 + 0.80)/2 = 0.90`**, and
 * that — not 0.80 — is Balanced's threshold here. Every other style's number is the same map
 * `t_us54 = (1 + t_pagat48)/2` applied to the appetite STYLES.md §3 states for it:
 *
 * | style | §3 appetite (48-card units) | `declareThreshold` here |
 * |---|---|---|
 * | Balanced | 0.80 | **0.90** |
 * | Blitz | 0.70 | **0.85** |
 * | Punter | 0.55 | **0.775** |
 * | Hoarder | 0.95 | **0.975** |
 * | Archivist (foreign) | 0.90 | **0.95** |
 *
 * The **stalled** threshold falls out of the same equation with `q = 0`: a provably dead board
 * will never bank the set for you, so waiting is worth nothing and the condition collapses to
 * `2p − 1 > 0`, i.e. **`p > 0.50`**. That is a hard floor, not a taste: under `us54` a
 * speculative declare below 0.5 is negative-EV even on a dead board, so no style in this roster
 * sits under it. The cautious styles sit above it by the margin they want against the fact that
 * `p` is a count-consistency *estimate*, not a probability.
 *
 * The **foreign** bar (STYLES.md §1.3) is the same map on a different `q`. For a set this seat
 * holds no card of, the whole plan is public inference — while the teammates who actually hold
 * the cards see far more than the declarer does, so `q_foreign` is *higher* than ordinary `q`
 * and the bar is correspondingly higher. A generalist takes `q_foreign = 0.95 → 0.975`. The
 * Archivist's whole thesis is that this is too pessimistic — a teammate holding two of six
 * cannot prove the set either — so it takes `q_foreign = 0.90 → 0.95` and declares the band in
 * between, which is precisely the "memorize half-suits you do not own" strategy the project
 * owner asked for and exactly where its unit test lives.
 *
 * ## `containedPass` — one appetite, uniform, and why
 *
 * [CONTAINMENT.md](../../../CONTAINMENT.md) C3–C5 measure a repeatable turn-pass that no style
 * used. It is now a policy option ([contained.ts](contained.ts)) whose trigger is derived from
 * public data at every call, so the style contributes only an **appetite**: the expected number
 * of uses the licence gets before the book is banked.
 *
 * Every entry carries **1** — the single-use break-even the derivation prices — except the
 * Hoarder, whose 1.33 is read off this repo's own measurement of how much longer it holds a set
 * (STYLES.md §3.1.1, `declareLatency` 31.02 vs 23.39). Uniform on purpose: the interesting
 * question is which styles *reach* a contained book and *aim* at all, and both answers are
 * already determined by knobs this roster had before — `hoardBooks`/`minHandSize` and
 * `declareOnlyOwnHand` decide how long a book stays unclaimed, and `missTarget` decides whether
 * aiming is worth anything (Blitz's `'most'` makes the aiming gain non-positive, so the mechanism
 * is off for it without a single bespoke number). Handing each style its own appetite would have
 * hidden that behind nine tuned constants.
 *
 * The Turtle also delays — `declareOnlyOwnHand` means it never banks a set split across its
 * teammates — but that delay has never been measured here, so its appetite stays at the
 * conservative 1. If it fires more often than the Hoarder, that is because it *reaches* the state
 * more often, not because it prices it higher.
 *
 * ## What is NOT tuned here
 *
 * The stall-breaker (`POLICY_CONSTANTS.stall`), the signalling look-back, the clinch response
 * span, the clinch loss magnifier, the race weights and the miss-target window are all global
 * mechanism constants. STYLES.md §3.1: *"If the stall-breaker needs tuning, tune it once,
 * globally — never per-style. A per-style stall rule is a hidden style parameter that
 * contaminates the whole comparison."* The same argument covers the rest — see the
 * `POLICY_CONSTANTS` doc comments.
 *
 * Nothing here is mutable: every entry is frozen at construction and only ever read.
 */
import type { StyleFamily, StyleParams } from './style.ts'

/** The stable id of each roster entry. */
export type StyleId =
  | 'balanced'
  | 'blitz'
  | 'punter'
  | 'banker'
  | 'turtle'
  | 'hoarder'
  | 'scout'
  | 'ghost'
  | 'archivist'

/**
 * Balanced — STYLES.md §3 row 1, *"the tuned `us54` baseline every other style is read
 * against"*. Every other entry below is written as a spread of this vector plus the settings §3
 * names for it, so a diff between two styles is exactly their listed differences.
 */
const BALANCED: StyleParams = {
  id: 'balanced',
  label: 'Balanced',
  family: 'control',
  thesis: 'The tuned us54 baseline every other style is read against.',

  // Ask scoring: the shipped weights, which are rule-set independent — the 2-point swing of
  // §1.1 is a property of DECLARES, and nothing about which card to chase changed.
  wHit: 70,
  wProgress: 18,
  wNarrow: 12,
  certaintyBonus: 20,
  // MONET.md §3.2. A floor at one part in a billion is a DEAD-ASK filter, not a taste. It
  // separates the asks this seat's own knowledge proves are misses from every other ask, and it
  // separates nothing else, because `pHit` (knowledge.ts) returns either 0 or a ratio of small
  // integers bounded by the deck — at worst 1 / (the unidentified card slots across the asked
  // card's candidate seats) — so no ask can land strictly inside (0, 1e-9). `decide` waives the
  // floor when EVERY legal ask is below it, so a genuinely starved turn still acts (the two
  // filter sites are decide.ts:985 and decide.ts:1109-1112).
  //
  // "Refuses every dead ask" would be too strong, and the exception is a mechanism rather than a
  // leak: CONTAINMENT.md's turn-pass *deliberately* plays a guaranteed miss to hand the turn to a
  // chosen opponent, and it is chosen after the filter has run (`planContainedPass`, decide.ts).
  // Measured over 40 whole games, every avoidable dead ask the shipped Punter still plays is that
  // mechanism, identified by trace kind.
  //
  // Deliberately a deviation from STYLES.md §3, which lists `minHitP 0` for every style that
  // takes the knob from this base. 0 reads as "consider every legal ask", and that reading
  // included asks with no chance of taking a card at all. Since nothing sits between 0 and
  // 1e-9, the long-shot appetite the knob expresses is unchanged for every style carrying one.
  //
  // ROSTER-ONLY, and pinned as such. `style.ts`'s `BASELINE_ASK_WEIGHTS` — and so
  // `STYLE_PRESETS.easy/medium/hard` — still carries `minHitP: 0`, because the three shipped
  // tiers are frozen and every mechanism since CONTAINMENT.md has been introduced switched off
  // there and carried at its measured appetite here. What makes that safe rather than merely
  // conventional is that the same milestone's two `rankAsksWith` corrections DO reach the tiers,
  // and measured over 40 whole games they already take the tiers' avoidable dead asks to zero
  // (`tests/bots/roster.test.ts`, MONET.md §3.2).
  minHitP: 1e-9,
  gambleBonus: 0,

  // (1 + 0.80)/2 — the 48-card appetite through the us54 arithmetic. See the file header.
  declareThreshold: 0.9,
  // 0.50 is the break-even on a dead board; +0.05 because p is an estimate, not a probability.
  declareThresholdStalled: 0.55,
  declareMaxUncertain: 1,
  declareOnlyWhenCertain: false,
  declareOnlyOwnHand: false,

  // Mid-window patience: the actual holder of the guessed card usually banks it correctly, so
  // waiting is worth something — but not everything, because a teammate may guess it wrongly
  // first (RULES_US54.md §3's race). `eagerEnoughToDeclare` turns this into the trade-off.
  declareEagerness: 0.5,
  foreignDeclare: true,
  // (1 + 0.95)/2 — a generalist assumes the teammates who hold the cards will see the set.
  foreignDeclareThreshold: 0.975,

  // Exactly neutral, which is what §3 row 1 pins for the control.
  clinchAggression: 0.5,
  denialWeight: 0.5,

  leakEpsilon: 0.5,
  leakThreshold: 4,
  signalling: true,

  missTarget: 'fewest',
  passTarget: 'most',

  hoardBooks: 0,
  minHandSize: 0,

  // The CONTAINMENT.md turn-pass, at the derived break-even: take the guaranteed-miss ask into a
  // team-contained book exactly when the cards-per-turn arithmetic says it beats the best
  // ordinary ask, and never otherwise. 1 = "one use of the licence", which is what a style that
  // banks the book at its next opportunity gets. See the header note below.
  containedPass: 1,

  // The CONCESSION.md defusal term, at its fitted break-even: when an opponent has publicly shown
  // a basis in a set this team holds cards of, prefer the ask that takes that card back — a hit
  // removes the licence and row 9 keeps the turn. 1 credits the hit with exactly the cards it
  // protects, on the measured slope; the appetite curve is an inverted U peaking at 1–2.
  //
  // Uniform across the roster, on the same argument `containedPass` is uniform: the interesting
  // question is which styles *reach* the position and how their other knobs interact with it, and
  // nine tuned constants would hide that behind tuning. Measured at 1 for every style —
  // CONCESSION.md §3.1's per-style table has the whole roster positive, from the Ghost's +0.83 to
  // the Archivist's +1.94 sets per duplicate pair, every interval excluding zero.
  defuse: 1,
}

function style(over: Partial<StyleParams> & { id: StyleId; label: string; family: StyleFamily; thesis: string }): StyleParams {
  return Object.freeze({ ...BALANCED, ...over })
}

/**
 * The nine styles of STYLES.md §3, in table order. Frozen; `validateStyle` accepts every entry
 * and `tests/bots/roster.test.ts` proves each one is distinguishable from Balanced on a
 * constructed position — *"a style that cannot be distinguished from the control is not a
 * style"*.
 */
export const STYLE_ROSTER: Readonly<Record<StyleId, StyleParams>> = Object.freeze({
  balanced: Object.freeze(BALANCED),

  /**
   * §3 row 2. `wHit 90, wProgress 30, declareThreshold 0.70→0.85, declareEagerness 0.9,
   * leakEpsilon 0, signalling false, missTarget 'most'`.
   *
   * `missTarget 'most'` with `leakEpsilon 0` is the combination that used to be unreachable —
   * miss-targeting now has its own `POLICY_CONSTANTS.missTargetEpsilon` window, so "information
   * is cheap" and "promote the opponent with the most cards" can both be true at once.
   */
  blitz: style({
    id: 'blitz',
    label: 'Blitz',
    family: 'aggressive',
    thesis: 'Tempo and sets now; information is cheap.',
    wHit: 90,
    wProgress: 30,
    declareThreshold: 0.85,
    declareThresholdStalled: 0.5, // the break-even itself: takes every non-negative gamble
    declareEagerness: 0.9,
    leakEpsilon: 0,
    signalling: false,
    missTarget: 'most',
    clinchAggression: 0.8,
    denialWeight: 0.65,
  }),

  /**
   * §3 row 3. `gambleBonus +25, minHitP 0, declareThreshold 0.55→0.775, declareMaxUncertain 2`.
   *
   * The `minHitP` restated here is the one setting that no longer matches §3's row: it is the
   * dead-ask floor of MONET.md §3.2, at the same 1e-9 the BALANCED base carries and for the same
   * reason (see there). Punter is the style that most needed it — `gambleBonus 25` is the term
   * that used to push a guaranteed miss to the top of the ranking — and it is spelled out rather
   * than inherited because §3 names `minHitP` as one of this row's defining settings, so a
   * reader comparing the roster against STYLES.md has to be able to see the deviation here.
   */
  punter: style({
    id: 'punter',
    label: 'Punter',
    family: 'aggressive',
    thesis: 'Chase the completing card; accept the gift risk.',
    gambleBonus: 25,
    minHitP: 1e-9,
    declareThreshold: 0.775,
    declareThresholdStalled: 0.5,
    declareMaxUncertain: 2,
    declareEagerness: 0.9,
    clinchAggression: 0.9,
    denialWeight: 0.7,
  }),

  /**
   * §3 row 4. `declareOnlyWhenCertain, minHitP 0.25, declareEagerness 0.2, missTarget 'fewest'`.
   * The thresholds are stated rather than left at the baseline even though
   * `declareOnlyWhenCertain` skips the EV path entirely — STYLES.md §5.5's ablation turns that
   * flag off, and the vector has to mean something when it does.
   */
  banker: style({
    id: 'banker',
    label: 'Banker',
    family: 'conservative',
    thesis: 'Never gift a set; bank only certainties.',
    declareOnlyWhenCertain: true,
    minHitP: 0.25,
    declareEagerness: 0.2,
    declareThreshold: 0.95,
    declareThresholdStalled: 0.75,
    foreignDeclareThreshold: 0.99,
    clinchAggression: 0.4,
  }),

  /** §3 row 5. `declareOnlyOwnHand, minHitP 0.4, signalling false, foreignDeclare false`. */
  turtle: style({
    id: 'turtle',
    label: 'Turtle',
    family: 'passive',
    thesis: 'Minimum risk; declare only sets wholly in hand.',
    declareOnlyWhenCertain: true,
    declareOnlyOwnHand: true,
    minHitP: 0.4,
    signalling: false,
    foreignDeclare: false,
    foreignDeclareThreshold: 1,
    declareThreshold: 0.98,
    declareThresholdStalled: 0.8,
    declareEagerness: 0.1,
    clinchAggression: 0.3,
    denialWeight: 0.3,
  }),

  /**
   * §3 row 6. `hoardBooks 3, minHandSize 2, declareThreshold 0.95→0.975, declareEagerness 0.1`.
   * RULES_US54.md row 6 makes holding >= 1 card of a set the only licence to ask into it, so
   * declaring revokes the seat's own asking rights there — which is what the two hoard knobs
   * price. They gate SPECULATIVE declares only; a certain set is still banked (§3's race makes
   * refusing free points a giveaway) and a forced one is still made (§3.2 would hang the table).
   */
  hoarder: style({
    id: 'hoarder',
    label: 'Hoarder',
    family: 'optionality',
    thesis: 'Keep ask-licences, stay alive, delay.',
    hoardBooks: 3,
    minHandSize: 2,
    // CONTAINMENT.md §3.1 — the benefit the style pays for. The appetite is the expected number
    // of uses the licence gets before the book is banked, and this roster's own measurement
    // supplies it: STYLES.md §3.1.1 puts the Hoarder's `declareLatency` at 31.02 against
    // Balanced's 23.39, so it holds every set 1.33x as long and gets 1.33x the uses. Read off a
    // measured ratio, not tuned — and it is the highest number in the roster because it is the
    // only style whose delay has actually been measured.
    containedPass: 1.33,
    declareThreshold: 0.975,
    declareThresholdStalled: 0.7,
    declareEagerness: 0.1,
    clinchAggression: 0.4,
    denialWeight: 0.4,
  }),

  /** §3 row 7. `wNarrow 40, wHit 55, declareOnlyWhenCertain`. */
  scout: style({
    id: 'scout',
    label: 'Scout',
    family: 'information',
    thesis: 'Deduce first, collect later.',
    wNarrow: 40,
    wHit: 55,
    declareOnlyWhenCertain: true,
    declareThresholdStalled: 0.65,
    declareEagerness: 0.4,
    denialWeight: 0.6,
  }),

  /** §3 row 8. `leakEpsilon 6, leakThreshold 3, signalling false`. */
  ghost: style({
    id: 'ghost',
    label: 'Ghost',
    family: 'information',
    thesis: 'Deny opponents the read.',
    leakEpsilon: 6,
    leakThreshold: 3,
    signalling: false,
  }),

  /**
   * §3 row 9. `foreignDeclare true, foreignDeclareThreshold 0.90→0.95, wNarrow 30,
   * declareEagerness 0.7` — the style `us54` created (STYLES.md §1.3).
   *
   * The eagerness is deliberately above Balanced's: a foreign set is the *most* race-prone kind
   * there is, because the declarer holds no private information in it, so every teammate is
   * reading the same public position and may reach a different, wrong conclusion first.
   * `raceRisk` charges exactly that, and this is the style that pays it.
   */
  archivist: style({
    id: 'archivist',
    label: 'Archivist',
    family: 'information',
    thesis: 'Track sets you hold nothing in, and declare them for your teammates.',
    foreignDeclare: true,
    foreignDeclareThreshold: 0.95,
    wNarrow: 30,
    declareEagerness: 0.7,
    denialWeight: 0.7,
  }),
})

/** The roster in STYLES.md §3 table order. */
export const STYLE_IDS: readonly StyleId[] = Object.freeze([
  'balanced',
  'blitz',
  'punter',
  'banker',
  'turtle',
  'hoarder',
  'scout',
  'ghost',
  'archivist',
] as const)

/** The roster as a list, in §3 table order. */
export function rosterStyles(): StyleParams[] {
  return STYLE_IDS.map((id) => STYLE_ROSTER[id])
}
