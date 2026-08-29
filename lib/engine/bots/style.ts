/**
 * style.ts — the STYLE axis (STYLES.md §2) and the SKILL axis (BOT_LAB.md §1.3), kept
 * deliberately orthogonal, plus the `easy` / `medium` / `hard` presets expressed over both.
 *
 * ## Why two vectors and not one
 *
 * BOT_LAB.md §1.3 is blunt about the confound this file exists to design out:
 *
 * > The existing axis (`easy`/`medium`/`hard`) is **skill** — inference depth, memory window,
 * > error rate. Your new axis is **style**. If an "aggressive" bot loses, you must be able to
 * > say whether aggression is bad or whether you merely wrote a weaker bot.
 *
 * So: `SkillParams` carries everything about *how well the seat can see* — how much of the log
 * it remembers, whether it reasons with set-constraints, whether it applies the constraint-
 * refined hit probability, whether it can plan a claim at all, and how often it simply blunders.
 * `StyleParams` carries everything about *what it does with what it sees*. Every style is
 * expressible at every skill, and `decide()` takes the cross product — which is exactly what the
 * §1.3 skill-ablation ("every style also run at `medium`-strength inference") needs.
 *
 * ## What is deliberately NOT a style parameter
 *
 * `POLICY_CONSTANTS` holds the shared-mechanism numbers. They are global on purpose, and
 * STYLES.md §3.1 says why for the most important of them:
 *
 * > **If the stall-breaker needs tuning, tune it once, globally — never per-style.** A
 * > per-style stall rule is a hidden style parameter that contaminates the whole comparison.
 *
 * The same argument covers the signalling look-back and the clinch response span: they are the
 * *trigger geometry* of a mechanism whose on/off switch (`signalling`) or intensity
 * (`clinchAggression`, `denialWeight`) already IS a style parameter. Putting the geometry in the
 * vector too would let a style win by widening its own trigger rather than by playing better.
 *
 * Nothing here is mutable module-level state: every table is frozen at construction and only
 * ever read through a pure function of the arguments handed in (same discipline as
 * [variants.ts](../variants.ts), RULES_US54.md §2.4).
 */
import type { AskWeights, BotDifficulty } from './types.ts'

/** STYLES.md §2 family tag — reporting only; no policy reads it. */
export type StyleFamily =
  | 'control'
  | 'aggressive'
  | 'conservative'
  | 'passive'
  | 'information'
  | 'optionality'

/**
 * The play-style vector — STYLES.md §2, verbatim, plus one field §2 omits
 * (`declareThresholdStalled`; see its doc comment).
 *
 * `StyleParams` is structurally assignable to {@link AskWeights}, which is the slice
 * `rankAsksWith` consumes, so a style can be handed straight to the ranker.
 */
export interface StyleParams extends AskWeights {
  id: string
  label: string
  family: StyleFamily
  thesis: string

  // --- ask scoring (weights into the ranked-ask score) -----------------------
  /** baseline 70 — greed for the card. */
  wHit: number
  /** baseline 18 — bias toward nearly-secured sets. */
  wProgress: number
  /** baseline 12 — bias toward information gain. */
  wNarrow: number
  /**
   * baseline 20 — MUST stay >= 20 (STYLES.md §2): below that an uncertain ask can outrank a
   * *certain hit*, "not a style, a bug that will dominate the results". `validateStyle` checks it.
   */
  certaintyBonus: number
  /** 0 = consider every legal ask; >0 = refuse long shots (with a legality-preserving fallback). */
  minHitP: number
  /** extra score for an ask that would COMPLETE a set. */
  gambleBonus: number

  // --- declare policy -------------------------------------------------------
  /** Confidence required for a speculative declare. Baseline 0.80. */
  declareThreshold: number
  /**
   * Confidence required once the position is provably dead (`isDeepStalled`). Baseline 0.50.
   *
   * **Deviation from STYLES.md §2, which lists only `declareThreshold`.** The shipped policy has
   * always had two thresholds — 0.80 normally and 0.50 on a dead board — and a single field
   * cannot express both, so folding them together would have silently changed the baseline. Kept
   * as its own knob rather than as a global ratio because the *reason* the relaxed number exists
   * (a coin-flip set beats guaranteed zero progress) is a risk judgement, i.e. exactly a style.
   */
  declareThresholdStalled: number
  /** Guessed cards tolerated in a speculative declare. Baseline 1. */
  declareMaxUncertain: number
  /** Never declare on anything but a fully-located set (skips the EV path entirely). */
  declareOnlyWhenCertain: boolean
  /** Passive extreme: declare only sets held wholly in this seat's own hand. */
  declareOnlyOwnHand: boolean

  // --- NEW under us54: the declare window (STYLES.md §1.2) -------------------
  /**
   * 0..1 — how early in the RULES_US54.md §3 window to fire a *speculative* declare vs. waiting
   * for more information. 1 fires at the first offer; 0 waits until the option has travelled the
   * whole cycle. Certain declares ignore it (§3's race: waiting risks a teammate declaring the
   * same set wrongly first). Outside a window (`pagat48`, own-turn declares) it has no meaning
   * and is not consulted.
   */
  declareEagerness: number
  /** Will it declare sets it holds NO cards of? (STYLES.md §1.3 — the Archivist axis.) */
  foreignDeclare: boolean
  /**
   * Separate, usually higher, bar for those. Combined as `max(ordinaryThreshold, this)`, so 0
   * means "no separate bar" and the ordinary threshold governs — including its stalled
   * relaxation, which a plain override would have clobbered.
   */
  foreignDeclareThreshold: number

  // --- NEW under us54: the clinch (STYLES.md §1.4) ---------------------------
  /**
   * 0..1 — at `clinchTarget - 1` sets, how much to prefer the closing declare. **0.5 is exactly
   * neutral**: the declare threshold is scaled by `1 - (clinchAggression - 0.5) * clinchSpan`,
   * so a style is tuned by moving off 0.5 in either direction and the presets sit on the neutral
   * point. Only consulted when `rulesFor(config).winCondition === 'clinch'`.
   */
  clinchAggression: number
  /** 0..1 — weight on denying the opponent's 5th, same neutral-at-0.5 scaling. */
  denialWeight: number

  // --- information policy ---------------------------------------------------
  /**
   * baseline 0.5 — width of the info-protection tiebreak. **<= 0 disables the near-tie block
   * outright**, which is what Blitz's `leakEpsilon 0` means ("information is cheap"): with no
   * near-tie window there is nothing to break a tie over, so `missTarget` is inert too. See the
   * `missTarget` note.
   */
  leakEpsilon: number
  /** baseline 4 — "nearly secured" cutoff: team certainly accounts for >= N of the set's 6. */
  leakThreshold: number
  /** Spend a provably dead turn on the most informative signal instead. */
  signalling: boolean

  // --- tempo / targeting ----------------------------------------------------
  /**
   * Who to promote on a likely miss. **Wired as a tiebreak inside the `leakEpsilon` near-tie
   * window**, which is where the shipped policy has always applied it — so a style that wants
   * miss-targeting must carry a positive `leakEpsilon`. Flagged here rather than silently,
   * because STYLES.md §3 gives Blitz `missTarget 'most'` *and* `leakEpsilon 0`, a combination in
   * which the miss-target choice can never fire.
   */
  missTarget: 'fewest' | 'most' | 'random'
  /** RULES.md row 20 pass choice; also governs the `awaitDesignate` opponent choice. */
  passTarget: 'most' | 'fewest'

  // --- hoarding -------------------------------------------------------------
  /** 0 = off; N = keep >= 1 card in N sets. Refuses *speculative* declares that break it. */
  hoardBooks: number
  /** 0 = off; refuse speculative declares that drop this seat's hand below N cards. */
  minHandSize: number

  // --- the contained-book turn-pass (CONTAINMENT.md) -------------------------
  /**
   * Appetite for the guaranteed-miss ask into a team-contained unresolved book — the repeatable,
   * targetable turn-pass CONTAINMENT.md C3–C5 measures and C6 destroys.
   *
   * **0 = off**, which is what every shipped preset carries, so the three tiers (and therefore
   * every `pagat48` game they play) are bit-for-bit unchanged. **1 = act at the derived
   * break-even** — the move is taken exactly when it beats the best ordinary ask on the
   * cards-per-turn arithmetic in [contained.ts](contained.ts) `valueContainedPass`, and never
   * merely because it is legal. Above 1 the style credits the licence with more than one use
   * before the book is banked, which is the only thing the number means: it multiplies the
   * *aiming gain*, not the threshold, so a style cannot buy itself a cheaper ask with it.
   *
   * Deliberately a single scalar. The *geometry* of the trigger — the hit-rate estimate, the
   * hand-size proxy for a conceded turn, the §1.2 information price — is shared mechanism and is
   * derived from public data at every call, never per style (STYLES.md §3.1).
   */
  containedPass: number
}

/**
 * The skill vector — BOT_LAB.md §1.3's "inference depth, memory window, error rate", and
 * nothing else. Every field here is a statement about what the seat can *work out*, never about
 * what it is willing to risk.
 */
export interface SkillParams {
  id: string
  label: string
  /** Only the last N log events are read (easy: 6). Undefined = the whole log. */
  logWindow?: number
  /** Record and propagate ask set-constraints. */
  useConstraints: boolean
  /** Seeded probability of replacing the chosen ask with a uniformly random legal one. */
  errorRate: number
  /** Fold surviving set-constraints into the hit probability (`refinedHitProbability`). */
  refinedInference: boolean
  /**
   * Can this seat plan a claim from knowledge at all? False means it has no claim planner: it
   * guesses holders at random when the position forces a declare, and it therefore cannot weigh
   * a declare against an ask. That flow difference is a capability, not a preference — which is
   * why it sits here and not in `StyleParams`.
   */
  planClaims: boolean
  /** Use the public card counts when choosing a pass / designate / miss target. */
  countTargeting: boolean
}

/** A fully-resolved bot policy: what it can see, and what it does with it. */
export interface BotPolicy {
  skill: SkillParams
  style: StyleParams
}

/**
 * Shared mechanism constants — global by design (see the file header).
 */
export const POLICY_CONSTANTS = Object.freeze({
  /**
   * Stall-breaker thresholds `[noHitFor, noClaimFor, hardNoClaimFor]`, keyed by declare timing.
   *
   * `us54` (`anyTime`) is tighter for two structural reasons: a `decline` emits no public event,
   * so its log grows roughly six times more slowly per reduce, and there is no `endgame` cascade
   * to force claims out of a stuck table — a declare in the window is the only thing that can
   * ever resolve a set. Measured: at the 48-card thresholds an easy-tier `us54` table failed to
   * finish about a quarter of games inside 6,000 reduces; at these it always finishes.
   */
  stall: Object.freeze({
    ownTurn: Object.freeze([36, 120, 400] as const),
    anyTime: Object.freeze([12, 24, 60] as const),
  }),
  /** Log events searched for a recent hit before the signalling ask may fire. */
  signalLookback: 8,
  /**
   * Full swing of the clinch response, so `clinchAggression`/`denialWeight` scale the declare
   * threshold by `1 -/+ 0.5 * clinchSpan` at the extremes and by exactly 1 at the neutral 0.5.
   */
  clinchSpan: 0.5,
  /**
   * How many times more costly a *failed* speculative declare is while the OPPOSING team stands
   * at `clinchTarget - 1` (STYLES.md §1.4: *"a declare that would give the opponent their 5th is
   * catastrophic in a way no 48-card declare ever was"*).
   *
   * An ordinary failure gifts one of the five sets they need. A failure here gifts the **last**
   * one: the game ends, in their favour, immediately. So the tolerated failure probability
   * shrinks by this factor — `p >= 1 - (1 - t) / clinchLossMagnifier` — which is monotone in the
   * style's own threshold `t` and therefore preserves the ordering between styles instead of
   * flattening them all onto one floor.
   *
   * 4 is the round number inside the range the arithmetic gives: gifting one of five needed sets
   * costs ~1/5 of the remaining game, gifting the last costs all of it, so the ratio is between
   * 2.5 (a 2-point swing out of a race to 5) and 5 (the whole race).
   *
   * **Global, not a style field**, by the STYLES.md §3.1 argument: the *intensity* of the clinch
   * response already is a style parameter (`clinchAggression`, `denialWeight`), so putting the
   * magnitude of the rule consequence in the vector too would let a style win by discounting a
   * rule rather than by playing better.
   */
  clinchLossMagnifier: 4,
  /**
   * RULES_US54.md §3 declare-window race geometry, consumed by `declareEagerness`.
   *
   * A set this seat can *nearly* prove is a set a teammate may also be nearly able to prove, and
   * a teammate who is wrong gifts it (row 14). `certain` is charged for a teammate certainly
   * holding a card of the set — it is looking straight at part of it; `possible` for a teammate
   * merely in the candidate set of one of the plan's guessed cards. Both are fractions of the
   * style's patience, so eagerness 1 stays "fire at the first offer" whatever the race looks like.
   */
  race: Object.freeze({ certain: 0.4, possible: 0.15 }),
  /**
   * How much longer a style is willing to wait per still-unresolved card in its plan — the other
   * half of STYLES.md §1.2's trade-off (*"waiting one more ask may resolve your last uncertain
   * card"*). Multiplicative on the patience, so it too vanishes at eagerness 1.
   */
  infoPatience: 0.25,
  /**
   * Near-tie width for the `missTarget` choice when the style protects no information
   * (`leakEpsilon <= 0`).
   *
   * STYLES.md §3 gives Blitz `missTarget 'most'` **and** `leakEpsilon 0`. Wiring miss-targeting
   * purely inside the leak window makes that combination unreachable — the knob would be listed,
   * swept, and inert. Tempo targeting and information protection are different concerns, so the
   * tempo one gets its own window. Zero for `missTarget: 'fewest'`, which every shipped preset
   * carries, so the `easy`/`medium`/`hard` tiers take exactly the ask they always took.
   */
  missTargetEpsilon: 0.5,
})

/** The baseline ask-score weights: `70*pHit + 18*progress + 12*narrowing + 20 certainty`. */
export const BASELINE_ASK_WEIGHTS: AskWeights = Object.freeze({
  wHit: 70,
  wProgress: 18,
  wNarrow: 12,
  certaintyBonus: 20,
  minHitP: 0,
  gambleBonus: 0,
})

/**
 * The tuned baseline every preset and every STYLES.md §3 style is a delta from — the shipped
 * `hard` policy, value for value.
 */
const BASELINE: StyleParams = {
  id: 'baseline',
  label: 'Baseline',
  family: 'control',
  thesis: 'The shipped hard-tier policy, expressed as a parameter vector.',
  ...BASELINE_ASK_WEIGHTS,
  declareThreshold: 0.8,
  declareThresholdStalled: 0.5,
  declareMaxUncertain: 1,
  declareOnlyWhenCertain: false,
  declareOnlyOwnHand: false,
  // Fire the moment the option arrives: the shipped policy has no window patience, and §3
  // re-opens the window after every declare so there is no tempo cost to acting early.
  declareEagerness: 1,
  // The shipped claim search has always ranged over every unresolved set regardless of whether
  // the seat holds a card of it, so foreign declares are already on; 0 keeps their bar equal to
  // the ordinary one, stalled relaxation included.
  foreignDeclare: true,
  foreignDeclareThreshold: 0,
  clinchAggression: 0.5,
  denialWeight: 0.5,
  leakEpsilon: 0.5,
  leakThreshold: 4,
  signalling: true,
  missTarget: 'fewest',
  passTarget: 'most',
  hoardBooks: 0,
  minHandSize: 0,
  // The shipped policy has never played the CONTAINMENT.md turn-pass, and the three tiers must
  // keep playing exactly the games they played before it existed — under both rule sets.
  containedPass: 0,
}

/**
 * Style presets for the three shipped tiers. These are *styles*, not skills: what each tier is
 * willing to risk. Their inference differences live in {@link SKILL_PRESETS}.
 *
 * - `hard`   — the baseline verbatim.
 * - `medium` — `declareOnlyWhenCertain` (no EV declares), no information protection
 *              (`leakEpsilon 0`, which also retires the miss-target tiebreak), no signalling.
 * - `easy`   — medium's caution plus `declareOnlyOwnHand`: it declares only what it can see in
 *              its own hand.
 */
export const STYLE_PRESETS: Readonly<Record<BotDifficulty, StyleParams>> = Object.freeze({
  easy: Object.freeze({
    ...BASELINE,
    id: 'easy',
    label: 'Easy',
    family: 'passive' as StyleFamily,
    thesis: 'Declare only what is already in hand; never gamble on a teammate.',
    declareOnlyWhenCertain: true,
    declareOnlyOwnHand: true,
    leakEpsilon: 0,
    signalling: false,
  }),
  medium: Object.freeze({
    ...BASELINE,
    id: 'medium',
    label: 'Medium',
    family: 'conservative' as StyleFamily,
    thesis: 'Bank certainties only; never guess a holder, never spend a turn on signal.',
    declareOnlyWhenCertain: true,
    leakEpsilon: 0,
    signalling: false,
  }),
  hard: Object.freeze({ ...BASELINE, id: 'hard', label: 'Hard', family: 'control' as StyleFamily }),
})

/** Inference strength for the three shipped tiers — the SKILL axis, alone. */
export const SKILL_PRESETS: Readonly<Record<BotDifficulty, SkillParams>> = Object.freeze({
  easy: Object.freeze({
    id: 'easy',
    label: 'Easy (6-event memory, no constraints, 25% error)',
    logWindow: 6,
    useConstraints: false,
    errorRate: 0.25,
    refinedInference: false,
    planClaims: false,
    countTargeting: false,
  }),
  medium: Object.freeze({
    id: 'medium',
    label: 'Medium (full knowledge engine)',
    useConstraints: true,
    errorRate: 0,
    refinedInference: false,
    planClaims: true,
    countTargeting: true,
  }),
  hard: Object.freeze({
    id: 'hard',
    label: 'Hard (full knowledge engine + constraint-refined probabilities)',
    useConstraints: true,
    errorRate: 0,
    refinedInference: true,
    planClaims: true,
    countTargeting: true,
  }),
})

/**
 * The STATIC policy shapes: a tier name, a bare style (played at full strength, per STYLES.md
 * §2 — "every style shares one identical, full-strength inference engine"), or an explicit
 * skill x style pair for the §1.3 ablation.
 *
 * `decide()` accepts one shape more — the v1.0 `AdaptiveSpec` — and the widened union is
 * defined in [adaptive.ts](adaptive.ts), which the barrels re-export as THE `PolicySpec`.
 * It lives there, not here, to keep the module graph acyclic: adaptive.ts reaches this file
 * through classify -> roster, so this file must know nothing of adaptive.ts. `resolvePolicy`
 * below refuses the adaptive shape structurally instead.
 */
export type PolicySpec = BotDifficulty | StyleParams | BotPolicy

function isBotPolicy(p: PolicySpec): p is BotPolicy {
  return typeof p === 'object' && p !== null && 'style' in p && 'skill' in p
}

/** The structural signature of an `AdaptiveSpec`, tested without importing adaptive.ts. */
function isAdaptiveShaped(p: PolicySpec | { adaptive: true } | { bounded: true }): p is { adaptive: true } {
  return typeof p === 'object' && p !== null && Object.hasOwn(p, 'adaptive')
}

/** The structural signature of a `BoundedSpec`, tested without importing bounded.ts. */
function isBoundedShaped(p: PolicySpec | { adaptive: true } | { bounded: true }): p is { bounded: true } {
  return typeof p === 'object' && p !== null && Object.hasOwn(p, 'bounded')
}

/**
 * Resolve any accepted STATIC policy spec to a `{ skill, style }` pair. Total and pure over
 * the static shapes: an unrecognised tier name degrades to `medium`, matching how the rest of
 * the stack defaults a missing difficulty, rather than throwing inside a bot that must never
 * throw.
 *
 * The deliberate exceptions: an *adaptive* or *bounded* spec is refused with a `TypeError`.
 * Both resolve inside `decide`, with a view — the adaptive style is a function of the
 * opponents' observed behaviour, and a bounded seat's knowledge is a function of the log it is
 * budgeted against; this function has neither. Degrading either to some fixed pair here would
 * silently play the wrong engine and poison every measurement downstream; `decide` handles
 * both branches *before* ever calling this, so the throws are unreachable from the bot path
 * (and would be caught by decide's fallback if they were not).
 */
export function resolvePolicy(spec: PolicySpec | { adaptive: true } | { bounded: true }): BotPolicy {
  if (isAdaptiveShaped(spec)) {
    throw new TypeError(
      'adaptive policies resolve inside decide, with a view — resolvePolicy has no opponents to read',
    )
  }
  if (isBoundedShaped(spec)) {
    throw new TypeError(
      'bounded policies resolve inside decide, with a view — resolvePolicy has no log to budget against',
    )
  }
  if (typeof spec === 'string') {
    const key: BotDifficulty = Object.prototype.hasOwnProperty.call(STYLE_PRESETS, spec)
      ? spec
      : 'medium'
    return { skill: SKILL_PRESETS[key], style: STYLE_PRESETS[key] }
  }
  if (isBotPolicy(spec)) return spec
  // A bare style is played at full strength — the §1.3 rule that keeps the axes separable.
  return { skill: SKILL_PRESETS.hard, style: spec }
}

/**
 * Structural problems that would make a style's results meaningless rather than merely bad.
 * Returns [] for a sound vector. Not called from `decide()` (it runs per move); it is a
 * construction-time gate for the roster and its tests.
 */
export function validateStyle(style: StyleParams): string[] {
  const bad: string[] = []
  const unit: [string, number][] = [
    ['declareEagerness', style.declareEagerness],
    ['clinchAggression', style.clinchAggression],
    ['denialWeight', style.denialWeight],
    ['minHitP', style.minHitP],
  ]
  // STYLES.md §2: below 20 an uncertain ask can outrank a certain hit.
  if (style.certaintyBonus < 20) bad.push(`certaintyBonus ${style.certaintyBonus} < 20`)
  for (const [name, v] of unit) {
    if (!(v >= 0 && v <= 1)) bad.push(`${name} ${v} outside 0..1`)
  }
  for (const [name, v] of [
    ['declareThreshold', style.declareThreshold],
    ['declareThresholdStalled', style.declareThresholdStalled],
    ['foreignDeclareThreshold', style.foreignDeclareThreshold],
  ] as [string, number][]) {
    if (!(v >= 0 && v <= 1)) bad.push(`${name} ${v} outside 0..1`)
  }
  if (style.declareMaxUncertain < 0) bad.push(`declareMaxUncertain ${style.declareMaxUncertain} < 0`)
  if (style.leakThreshold < 0) bad.push(`leakThreshold ${style.leakThreshold} < 0`)
  // An appetite is a count of expected uses of the licence (CONTAINMENT.md C5), so it is
  // non-negative; a negative value would invert the derived comparison rather than express taste.
  if (!(style.containedPass >= 0)) bad.push(`containedPass ${style.containedPass} < 0`)
  return bad
}
