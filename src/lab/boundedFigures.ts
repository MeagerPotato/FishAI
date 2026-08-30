/**
 * The `/lab/bounded` figure models and derived readings — pure functions from the parsed
 * bounded artifact to chart models, kept out of the page component so the Node-environment
 * vitest config can run `verifyScene` over the real committed data, exactly as
 * [adaptiveFigures.ts](adaptiveFigures.ts) does for `/lab/adaptive`.
 *
 * Three honesty decisions live here rather than in the page, because they shape the figures:
 *
 * - **The ladder's x axis is a budget index, not a bits scale.** The rungs are the registered
 *   grid {0, 8, 16, 24, 32, 48, 64, 96, 128, ∞} at equal pitch; drawing them linear in bits
 *   would pile seven rungs into the left tenth of the plot and put ∞ nowhere at all. The
 *   caption says so, and the per-rung SEs live in the table beside the figure — at 3,000
 *   pairs they are hairline-thin at this plot size, and a mark smaller than the stroke that
 *   draws it is decoration, not disclosure.
 * - **The evidence-age figure drops the thin top bands.** Ages 97+ hold at most a few hundred
 *   pooled observations — and single digits for the tighter budgets — so the figure shows the
 *   bands through age 96 and the caption states the cut; the full rows, counts included, are
 *   printed in the table. Plotting a seven-observation rate as a confident point would be the
 *   exact lie the axis rules exist to prevent.
 * - **The E4/E4b figure plots both designs on one frame.** The whole-ecology curve (both teams
 *   bounded) and the single-seat curve (one bounded read seat, 300 seeds) answer different
 *   questions, and the page's attribution argument IS their divergence — so the figure shows
 *   them together, labelled, with chance drawn flat.
 */

import { BOUNDED_INF_BITS } from '../../lib/lab/bounded-types.ts'
import type { BoundedResults, EvidenceCurve } from '../../lib/lab/bounded-types.ts'
import { layoutLine, type LineModel } from '../diagrams/layout/charts'
import { trim4 } from './adaptiveFigures.ts'

/** `∞` for the sentinel budget, the number otherwise — every surface prints rungs one way. */
export function bitsLabel(bits: number): string {
  return bits === BOUNDED_INF_BITS ? '∞' : String(bits)
}

/* ==========================================================================
   FIG — the ladder: set-share against the memory budget
   ========================================================================== */

export function ladderLine(results: BoundedResults, figNo = 'FIG. 01'): LineModel {
  const rungs = results.ladder
  const data = [
    {
      key: 'bounded',
      label: 'Bounded team set-share',
      values: rungs.map((r) => r.share),
    },
    {
      key: 'even',
      label: 'Even split (.5)',
      values: rungs.map(() => 0.5),
    },
  ]

  return layoutLine({
    slug: 'bounded-ladder-line',
    title: 'Duplicate-pair set-share of the bounded team against the memory budget',
    desc:
      'One rising polyline over the ten budget rungs from 0 bits to infinity, against a flat ' +
      'rule at one half. Set-share climbs steeply through the low budgets — .131 at 0 bits, ' +
      '.245 at 8, .392 at 16 — then flattens toward the even split, reaching .500 exactly at ' +
      '128 bits and infinity.',
    fig: `${figNo} — THE LADDER · ${rungs.length} BUDGETS · ${trim4(rungs[0]?.share ?? 0)} → ${trim4(
      rungs[rungs.length - 1]?.share ?? 0,
    )}`,
    caption:
      'X is the registered budget grid at equal pitch — a rung index, not a bits scale; a ' +
      'linear-bits axis would pile seven rungs into the left tenth of the plot. ∞ is a ' +
      '1,000,000-bit budget provably above the maximum derivable fact pool. Y runs from zero. ' +
      '3,000 duplicate pairs per rung on one shared seed list; per-rung SEs (at most .0026) ' +
      'and the nine adjacent-rung deltas are printed in the tables beside this figure — at ' +
      'this plot size they are thinner than the stroke. Sorted by budget, ascending, as the ' +
      'grid is registered.',
    xLabels: rungs.map((r) => bitsLabel(r.bits)),
    data,
    focalKey: 'bounded',
    format: trim4,
  })
}

/* ==========================================================================
   FIG — evidence age: exploit rate against the age of the certain ask
   ========================================================================== */

/** The four E3 curves the figure draws, in legend order. The page names the same four. */
export const EVIDENCE_FIGURE_POLICIES = [
  'reference',
  'bounded-32',
  'bounded-8',
  'tier-easy',
] as const

/** Age bands through 96 events; the thin 97+ bands are the table's job (see the header). */
export const EVIDENCE_FIGURE_BANDS = 11

function evidenceCurveOf(results: BoundedResults, policy: string): EvidenceCurve {
  const curve = results.evidence.find((c) => c.policy === policy)
  if (!curve) {
    throw new Error(`evidence figure: the artifact carries no "${policy}" curve`)
  }
  return curve
}

/** `1–2`, `9–12`, `129+` — one band label, en dash, no spaces. */
export function bandLabel(lo: number, hi: number | null): string {
  return hi === null ? `${lo}+` : `${lo}–${hi}`
}

export function evidenceLine(results: BoundedResults, figNo = 'FIG. 02'): LineModel {
  const curves = EVIDENCE_FIGURE_POLICIES.map((p) => evidenceCurveOf(results, p))

  // Every curve must band identically, or "the same x" would be a lie drawn in ink.
  const bands = curves[0].rows.slice(0, EVIDENCE_FIGURE_BANDS)
  for (const curve of curves) {
    bands.forEach((band, i) => {
      const row = curve.rows[i]
      if (!row || row.lo !== band.lo || row.hi !== band.hi) {
        throw new Error(
          `evidence figure: "${curve.policy}" bands diverge from "${curves[0].policy}" at index ${i}`,
        )
      }
    })
  }

  const labels: Record<(typeof EVIDENCE_FIGURE_POLICIES)[number], string> = {
    reference: 'Full memory (reference)',
    'bounded-32': '32-bit budget',
    'bounded-8': '8-bit budget',
    'tier-easy': 'Old easy tier (noise)',
  }

  const data = curves.map((curve) => ({
    key: curve.policy,
    label: labels[curve.policy as (typeof EVIDENCE_FIGURE_POLICIES)[number]],
    values: curve.rows.slice(0, EVIDENCE_FIGURE_BANDS).map((r) => r.exploitRate),
  }))

  return layoutLine({
    slug: 'bounded-evidence-line',
    title: 'Certain-ask exploit rate against the age of the evidence',
    desc:
      'Four polylines over eleven age bands. The full-memory reference is near-flat around ' +
      '.45–.61; the 32-bit and 8-bit curves start close to it and decay smoothly with age; ' +
      'the old noise-based easy tier holds a high plateau through age 6 and then falls off a ' +
      'cliff to under .04 the moment the evidence leaves its 6-event log window.',
    fig: `${figNo} — EVIDENCE AGE · ${EVIDENCE_FIGURE_BANDS} BANDS · 4 OF ${results.evidence.length} CURVES`,
    caption:
      'X is the age of the certain ask in public-log events — how long ago a hit established ' +
      'the card’s location — banded as the artifact bands it, at equal pitch; not time. Y is ' +
      'the share of decisions that took the certain ask while one was available. Bands past ' +
      'age 96 are omitted here for sparseness (a few hundred pooled observations, single ' +
      'digits on the tighter budgets) and printed in the table below with their counts. Four ' +
      'of the artifact’s curves shown — the full set, half-lives included, is in the table. ' +
      'Sorted left to right by age, youngest first.',
    xLabels: bands.map((b) => bandLabel(b.lo, b.hi)),
    data,
    focalKey: 'tier-easy',
    format: trim4,
  })
}

/* ==========================================================================
   FIG — style under memory pressure: E4 and E4b on one frame
   ========================================================================== */

export function accuracyLine(results: BoundedResults, figNo = 'FIG. 03'): LineModel {
  const e4 = results.accuracy.cells
  const e4b = results.accuracySingle.cells
  if (e4.length !== e4b.length || e4.some((c, i) => c.bits !== e4b[i].bits)) {
    throw new Error('accuracy figure: E4 and E4b are on different budget grids')
  }
  const chance = 1 / 9

  const data = [
    { key: 'e4', label: 'E4 — both teams bounded', values: e4.map((c) => c.top1) },
    { key: 'e4b', label: 'E4b — read seat only (300 seeds)', values: e4b.map((c) => c.top1) },
    { key: 'chance', label: 'Chance (1/9)', values: e4.map(() => chance) },
  ]

  return layoutLine({
    slug: 'bounded-accuracy-line',
    title: 'Classifier top-1 accuracy against the memory budget, in both designs',
    desc:
      'Three polylines over the four budgets 16, 32, 64 and infinity. The whole-ecology E4 ' +
      'curve falls to .154 at 16 bits, rises through .210 and peaks at .230 at 64 bits before ' +
      'settling at .224 at infinity — the P7 violation. The single-seat E4b curve is flat ' +
      'between .162 and .170 everywhere. Chance is flat at one ninth.',
    fig: `${figNo} — STYLE UNDER PRESSURE · E4 vs E4b · 4 BUDGETS`,
    caption:
      'X is the registered budget grid at equal pitch. Y runs from zero; chance is 1/9 ≈ ' +
      '.111. E4 bounds BOTH teams (10,800 end-of-game seat reads per cell), so its curve ' +
      'moves ecology and signature together; E4b bounds only the read seat inside a ' +
      'full-strength table (10,800 single-seat reads per cell, 300 seeds), holding the ' +
      'ecology at the distribution the fingerprints were calibrated on. The E4 64→∞ fall is ' +
      'the violated P7 rung; the E4b curve’s three rungs all pass. Sorted by budget, ' +
      'ascending.',
    xLabels: e4.map((c) => bitsLabel(c.bits)),
    data,
    focalKey: 'e4',
    format: trim4,
  })
}

/* ==========================================================================
   Derived readings the page prints
   ========================================================================== */

/**
 * Mean game length across the E1 ladder — the artifact's own `avgMoves` column. The E4
 * attribution caveat leans on this: game length is itself a function of the budget, so the
 * both-teams design changes the whole ecology the classifier reads, not only the one seat's
 * signature. The ladder alone is used, deliberately: its cells vary EXACTLY one thing — the
 * budget, on one team — so the spread is attributable, where the tier cells' opposition
 * differs in kind. E4's own per-cell move counts were never aggregated into the artifact, so
 * this one-team spread is the committed, checkable lower bound on the both-teams shift —
 * quoted as that, never as a measurement of E4's cells.
 */
export interface MoveSpread {
  /** Shortest mean game across the ladder cells, in engine steps. */
  min: number
  /** Longest mean game. */
  max: number
  /** `max/min − 1` — the relative spread. */
  spread: number
}

export function gridMoveSpread(results: BoundedResults): MoveSpread {
  const moves = results.ladder.map((c) => c.avgMoves)
  const min = Math.min(...moves)
  const max = Math.max(...moves)
  return { min, max, spread: max / min - 1 }
}
