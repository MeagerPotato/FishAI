/**
 * adaptive.ts — FishAI v1.0: best-response style selection over the measured counter table
 * (SPEC Stage 1C; BOT_LAB.md §4-5; the observation and classification layers are
 * [observe.ts](observe.ts) and [classify.ts](classify.ts), the payoffs are
 * [data/counter-table.ts](data/counter-table.ts)).
 *
 * `chooseStyle(view, spec)` reads the three opponent seats off the public log, forms a style
 * posterior per seat, and picks the roster style with the highest expected score rate against
 * that belief. The chosen style is then *played* by the ordinary v0.5 engine — decide.ts maps
 * an `AdaptiveSpec` to `{ skill: SKILL_PRESETS.hard, style: STYLE_ROSTER[choice.style] }` and
 * proceeds exactly as for any static style. Everything here is a pure function of
 * `(view, spec)`: no Date, no Math.random, no state between calls.
 *
 * ## THE MEASURED FINDING THIS FILE MUST BE READ AGAINST (2026-08-23, committed counter table)
 *
 * Punter is the argmax of `P[·][s]` for **every** column `s` of the table — BR(balanced) =
 * punter 0.5190, BR(blitz) = punter 0.5198, BR(punter) = punter 0.5000 (no style beats
 * punter), and so on down the roster. The expected payoff below is linear in the opponent
 * posterior, so one row weakly dominating every column means best-response adaptation over
 * this roster **provably selects Punter under every belief** — the warm adaptive engine
 * degenerates to always-Punter, whatever the classifier says. The margin also covers the
 * anchor bias: the smallest gap of the punter row over the balanced row is ~0.016, above the
 * default `switchMargin` of 0.01, so not even the anchor tie-break can rescue another choice.
 *
 * The mechanism is built in full anyway, on purpose. The architecture is the contribution and
 * the degeneracy is the *result*: `tests/bots/adaptive.test.ts` pins it per oracle opponent
 * (and re-derives the argmax from the table rather than hard-coding 'punter', so a future
 * counter table with an intransitive cycle flows through this file unchanged and simply makes
 * the adaptation non-trivial). What would make adaptation valuable — an intransitive roster,
 * off-roster opponents, rule-set shifts — is a question for the Stage-2 experiments and the
 * v1.0 paper, never for a knob hidden here.
 *
 * ## The selection rule, exactly
 *
 * Opponents are the three seats of the other team. For each candidate style `i` (every row of
 * the counter table),
 *
 *     expected[i] = mean over opponent seats of  Σ_s posterior(s) · P[i][s]
 *
 * then `expected[anchor] += switchMargin` (hysteresis as an anchor bias — a candidate must
 * beat the anchor by the margin, not merely tie it), and the choice is the argmax, ties to
 * the earlier row in table order. During warmup (fewer than `warmupEvents` observed events)
 * the anchor plays unconditionally: an early posterior is mostly the damping prior, and a
 * best response to ignorance is noise.
 *
 * ## Statelessness, and the phase quantisation that stands in for memory
 *
 * A stateful bot would remember its last choice and demand a margin to move off it. This bot
 * deliberately owns no state — `decide` is pure per call, and two adaptive seats with the
 * same public information MUST reach the same read, or the "one shared engine" discipline
 * (STYLES.md §2) dies here. So hysteresis is expressed statelessly, twice over:
 *
 *  - the **anchor bias** above, which is memoryless; and
 *  - **phase quantisation**: the choice may only change when `floor(events / 30)` changes.
 *    Expressed as truncation, not memory: the posterior is evaluated on the log CUT to the
 *    last multiple of {@link ADAPTIVE_PHASE_EVENTS} events, so every view inside one phase —
 *    and every seat looking at it — evaluates the identical prefix and reaches the identical
 *    choice. A seat therefore cannot flip styles mid-phase, which is the behavioural point of
 *    hysteresis, without a single byte of remembered state.
 *
 * The **warmup gate reads the truncated length too**, for the same reason: gating on the raw
 * log length would let the choice flip from anchor to warm mid-phase the moment event 40
 * lands. With both gates on the truncation, the whole selection is a function of the phase
 * alone. (Consequence, stated honestly: with the defaults, the first warm phase begins at 60
 * observed events — the first multiple of 30 at or above `warmupEvents` 40.)
 *
 * `switched` reports whether the current phase's choice differs from the previous phase's,
 * recomputed the only way a stateless function can: by evaluating the previous phase's
 * truncation as well. That costs one extra observe+classify pass per call once past phase 0
 * — both passes are O(truncated log), and `observeSeats` is a single cheap scan, measured at
 * well under a millisecond per decision at real game lengths.
 *
 * ## Oracle mode (lab only)
 *
 * `oracleStyles` bypasses the classifier with a point-mass posterior per non-null seat — the
 * Stage-2 ablation that prices what perfect classification would buy. Oracle reads still
 * carry the truncated event count, so warmup and phase behaviour are identical in both modes
 * and the ablation isolates exactly one thing: the posterior.
 *
 * ## Where `PolicySpec` widens, and why here
 *
 * The v0.5 union (`BotDifficulty | StyleParams | BotPolicy`) lives in [style.ts](style.ts)
 * and stays there. This file re-exports it widened with `AdaptiveSpec`. The arrangement is
 * chosen for acyclicity: this module imports classify → roster → style (roster's style import
 * is type-only), so style.ts importing anything back from here would close a cycle. Instead,
 * style.ts keeps zero knowledge of this module — `resolvePolicy` refuses the adaptive shape
 * *structurally* (a `TypeError`: adaptive policies resolve inside decide, with a view) — and
 * decide.ts plus both barrels import the widened `PolicySpec` from here. The dependency
 * between decide.ts and this file is strictly one-way: decide imports adaptive, never the
 * reverse.
 */
import type { Seat } from '../types.ts'
import { seatTeam, teamSeats } from '../cards.ts'
import type { SeatView } from './types.ts'
import type { StyleId } from './roster.ts'
import { classifySeats } from './classify.ts'
import type { SeatClassification } from './classify.ts'
import { COUNTER_TABLE } from './data/counter-table.ts'
import type { PolicySpec as StaticPolicySpec } from './style.ts'

/** The fourth `PolicySpec` shape: FishAI v1.0, the adaptive policy. */
export interface AdaptiveSpec {
  adaptive: true
  /** Lab-only oracle: true styles per seat (null for non-styled seats). Bypasses the classifier. */
  oracleStyles?: readonly (StyleId | null)[]
  /** Observed events required before any switch is allowed; below it the anchor style plays. */
  warmupEvents?: number
  /** Minimum expected-payoff gain (in score-rate units) required to switch off the anchor. */
  switchMargin?: number
  /** The style played during warmup and favoured by the switch margin. */
  anchor?: StyleId
}

/**
 * The full policy union `decide` accepts — the v0.5 shapes of [style.ts](style.ts) plus the
 * adaptive one. Defined here rather than in style.ts to keep the module graph acyclic (see
 * the file header); the barrels re-export this as THE `PolicySpec`.
 */
export type PolicySpec = StaticPolicySpec | AdaptiveSpec

/** What `chooseStyle` decided, and the evidence it decided it on. */
export interface AdaptiveChoice {
  style: StyleId
  /** Expected score rate per candidate style against the read opponents (anchor bias included). */
  expected: Record<StyleId, number>
  /** The three opponent seats' reads, evaluated on the phase-truncated log. */
  reads: SeatClassification[]
  /** Did this phase's choice move off the previous phase's? (False in phase 0.) */
  switched: boolean
}

/**
 * The phase length: the chosen style may only change when `floor(events / 30)` changes.
 * 30 public events is roughly one us54 window-and-ask cycle for the table — long enough that
 * a style is not flapped per decision, short enough that a mid-game read is acted on.
 */
export const ADAPTIVE_PHASE_EVENTS = 30

/** The `AdaptiveSpec` defaults, exported so trace prose and tests state the same numbers. */
export const ADAPTIVE_DEFAULTS = Object.freeze({
  warmupEvents: 40,
  switchMargin: 0.01,
  anchor: 'balanced' as StyleId,
})

/**
 * Is this policy spec the adaptive shape? The one narrow question decide.ts asks before
 * resolving. `Object.hasOwn` rather than `in`: the flag must be the spec's own, not something
 * a prototype smuggled in.
 */
export function isAdaptiveSpec(spec: unknown): spec is AdaptiveSpec {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    Object.hasOwn(spec, 'adaptive') &&
    (spec as { adaptive: unknown }).adaptive === true
  )
}

/** Row/column index per style id in the committed counter table, built once from frozen data. */
const STYLE_INDEX: ReadonlyMap<StyleId, number> = new Map(
  COUNTER_TABLE.styles.map((s, i) => [s, i]),
)

/**
 * The anchor actually used: the spec's, when the counter table knows it as a candidate row;
 * the default otherwise. Degrading rather than throwing matches `resolvePolicy`'s treatment
 * of an unrecognised tier name — this function runs inside a bot that must never throw for a
 * mis-typed knob.
 */
function anchorOf(spec: AdaptiveSpec): StyleId {
  const a = spec.anchor ?? ADAPTIVE_DEFAULTS.anchor
  return STYLE_INDEX.has(a) ? a : ADAPTIVE_DEFAULTS.anchor
}

/** A lab-oracle read: the whole posterior on one style, carrying the truncated event count. */
function pointMassRead(seat: Seat, style: StyleId, events: number): SeatClassification {
  const posterior = {} as Record<StyleId, number>
  for (const s of COUNTER_TABLE.styles) posterior[s] = s === style ? 1 : 0
  return { seat, events, posterior, top: style, confidence: 1 }
}

interface PhaseChoice {
  style: StyleId
  expected: Record<StyleId, number>
  reads: SeatClassification[]
}

/**
 * The selection rule of the file header, evaluated on the log truncated to `cut` events.
 * Pure; called once for the current phase and (past phase 0) once for the previous one.
 */
function chooseAtCut(view: SeatView, spec: AdaptiveSpec, cut: number): PhaseChoice {
  const opponents = teamSeats(seatTeam(view.seat) === 0 ? 1 : 0)
  const truncated: SeatView = cut < view.log.length ? { ...view, log: view.log.slice(0, cut) } : view

  // Reads: oracle point mass where given (and recognised by the table), classifier otherwise.
  // The classifier pass is skipped entirely when every opponent is oracle-assigned, which is
  // what makes the Stage-2 oracle ablation cheap. `Object.hasOwn` guards the untrusted id.
  const oracle = spec.oracleStyles
  const oracleFor = (seat: Seat): StyleId | null => {
    const s = oracle?.[seat] ?? null
    return s !== null && STYLE_INDEX.has(s) ? s : null
  }
  let classified: SeatClassification[] | null = null
  const reads: SeatClassification[] = opponents.map((seat) => {
    const o = oracleFor(seat)
    if (o !== null) return pointMassRead(seat, o, truncated.log.length)
    if (classified === null) classified = classifySeats(truncated)
    return classified[seat]
  })

  // expected[i] = mean over opponent seats of Σ_s posterior(s) · P[i][s]. A posterior style
  // the table carries no column for contributes nothing — dropping unknown mass is the
  // conservative reading, and with the committed table the two sets are identical (pinned).
  const k = COUNTER_TABLE.styles.length
  const acc = new Array<number>(k).fill(0)
  for (const read of reads) {
    for (let j = 0; j < k; j++) {
      const s = COUNTER_TABLE.styles[j]
      const mass = Object.hasOwn(read.posterior, s) ? read.posterior[s] : 0
      if (mass === 0) continue
      for (let i = 0; i < k; i++) acc[i] += mass * COUNTER_TABLE.p[i][j]
    }
  }
  const expected = {} as Record<StyleId, number>
  for (let i = 0; i < k; i++) expected[COUNTER_TABLE.styles[i]] = acc[i] / reads.length

  const anchor = anchorOf(spec)
  expected[anchor] += spec.switchMargin ?? ADAPTIVE_DEFAULTS.switchMargin

  // Warmup gates on the TRUNCATED length (file header): the whole choice is a function of
  // the phase, so a seat cannot flip from anchor to warm mid-phase either.
  if (cut < (spec.warmupEvents ?? ADAPTIVE_DEFAULTS.warmupEvents)) {
    return { style: anchor, expected, reads }
  }

  let best = COUNTER_TABLE.styles[0]
  for (const s of COUNTER_TABLE.styles) {
    if (expected[s] > expected[best]) best = s
  }
  return { style: best, expected, reads }
}

/**
 * The FishAI v1.0 style choice for this view — see the file header for the whole rule. Pure
 * and deterministic over `(view, spec)`; never reads the clock, the rng, or anything but the
 * public log, the seat and the config. `decide` calls this at every adaptive decision; the
 * truncation makes that affordable (one `observeSeats` scan of at most `events` log entries
 * per pass, two passes once past phase 0 — the second is the price of `switched`).
 */
export function chooseStyle(view: SeatView, spec: AdaptiveSpec): AdaptiveChoice {
  const cut = Math.floor(view.log.length / ADAPTIVE_PHASE_EVENTS) * ADAPTIVE_PHASE_EVENTS
  const now = chooseAtCut(view, spec, cut)
  const prevCut = Math.max(0, cut - ADAPTIVE_PHASE_EVENTS)
  const switched = prevCut === cut ? false : now.style !== chooseAtCut(view, spec, prevCut).style
  return { style: now.style, expected: now.expected, reads: now.reads, switched }
}
