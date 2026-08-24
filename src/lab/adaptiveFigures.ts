/**
 * The `/lab/adaptive` figure models and derived tables — pure functions from the parsed
 * artifact (and the committed counter table) to chart models, kept out of the page component
 * so the Node-environment vitest config can run `verifyScene` over the real committed data.
 *
 * Two honesty decisions live here rather than in the page, because they shape the figures:
 *
 * - **The gauntlet dumbbell shows 8 of 9 cells.** The dumbbell type caps at 8 rows, and the
 *   punter cell is the one whose benchmark is not a measured row: punter-vs-punter is the
 *   duplicate-pair identity, exactly 0.5000 by construction. The omission is stated in the
 *   caption and the cell is fully printed in the table beside the figure.
 * - **The classifier line drops empty checkpoints.** The 250-event checkpoint recorded zero
 *   seats — no game in the run produced 250 observable events — and plotting a recorded-nothing
 *   as a measured zero would be the exact lie the axis rules exist to prevent. The caption
 *   states the omission, and flags the 150-event checkpoint's survivorship (672 of 10,800
 *   seats) for the same reason.
 */

import type { StyleId } from '../../lib/engine/index.ts'
import { COUNTER_TABLE, STYLE_ROSTER } from '../../lib/engine/index.ts'
import type { AdaptiveResults } from '../../lib/lab/adaptive-types.ts'
import {
  layoutDumbbell,
  layoutLine,
  type DumbbellModel,
  type LineModel,
} from '../diagrams/layout/charts'

/** Display label for a roster style — the roster itself is the site's single source of names. */
export function styleName(id: StyleId): string {
  return STYLE_ROSTER[id].label
}

/** `.5114` — four places, trailing zeros trimmed for axis ticks (`.25`, `1`, `0`). */
export function trim4(v: number): string {
  const s = v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  return s.replace(/^0\./, '.').replace(/^-0\./, '-.')
}

/* ==========================================================================
   The best-response table — recomputed from the committed counter table
   ========================================================================== */

export interface BestResponseColumn {
  opponent: StyleId
  best: StyleId
  bestP: number
  bestSe: number
  runnerUp: StyleId
  runnerUpP: number
  /** bestP − runnerUpP: how far the argmax is from flipping. */
  margin: number
}

/**
 * For each opponent column of the counter table, the row that maximises score rate, with the
 * runner-up and the margin. Recomputed here from `COUNTER_TABLE` — the same constant the
 * engine plays from — rather than read off any prose claim, so the page's degeneracy statement
 * is checked against the numbers every build.
 */
export function bestResponseColumns(): BestResponseColumn[] {
  const { styles, p, se } = COUNTER_TABLE
  return styles.map((opponent, j) => {
    let bi = 0
    for (let i = 1; i < styles.length; i++) if (p[i][j] > p[bi][j]) bi = i
    let ri = bi === 0 ? 1 : 0
    for (let i = 0; i < styles.length; i++) {
      if (i !== bi && p[i][j] > p[ri][j]) ri = i
    }
    return {
      opponent,
      best: styles[bi],
      bestP: p[bi][j],
      bestSe: se[bi][j],
      runnerUp: styles[ri],
      runnerUpP: p[ri][j],
      margin: p[bi][j] - p[ri][j],
    }
  })
}

/* ==========================================================================
   FIG — gauntlet dumbbell: adaptive vs the paired punter benchmark
   ========================================================================== */

export function gauntletDumbbell(results: AdaptiveResults, figNo = 'FIG. 02'): DumbbellModel {
  const data = results.gauntlet
    .filter((g) => g.opponent !== 'punter')
    .map((g) => ({
      key: g.opponent,
      label: styleName(g.opponent),
      ref: g.punterBenchmark,
      focal: g.score,
    }))
    .sort((a, b) => a.focal - b.focal)

  return layoutDumbbell({
    slug: 'adaptive-gauntlet-dumbbell',
    title: 'Gauntlet score against the paired punter benchmark, per opponent',
    desc:
      'One row per pure opponent. A hollow dot marks punter’s matrix-v2 score on the same ' +
      'seed list and a solid amber dot marks the adaptive team’s score; on the zero-anchored ' +
      'axis every pair nearly coincides, with the adaptive dot marginally lower in all eight ' +
      'rows shown.',
    fig: `${figNo} — GAUNTLET vs PUNTER BENCHMARK · 8 OF 9 CELLS`,
    caption:
      'Sorted by the adaptive team’s own score, ascending. Eight of nine cells: the punter ' +
      'cell is omitted because its benchmark is the .5000 duplicate-pair identity rather than ' +
      'a measured row — it is printed in full in the table above, and it is the one cell that ' +
      'rejects at the Bonferroni bound. The axis runs from zero, so the pairs nearly ' +
      'coincide by construction: the shortfall is a hundredth-scale effect, resolved by the ' +
      'table’s z column rather than by this figure. Both ends share one scale and both are ' +
      'labelled with their real value.',
    axisTitle: 'SCORE RATE · 4,300 DUPLICATE PAIRS PER CELL',
    refLabel: 'Punter row (matrix v2)',
    focalLabel: 'Adaptive (v1.0)',
    data,
    format: trim4,
  })
}

/* ==========================================================================
   FIG — classifier top-1 accuracy against events observed
   ========================================================================== */

export function classifierLine(results: AdaptiveResults, figNo = 'FIG. 03'): LineModel {
  // Zero-seat checkpoints recorded nothing; plotting them as zero would invent a measurement.
  const rows = results.classifier.accuracy.filter((r) => r.seats > 0)
  const xLabels = rows.map((r) => (r.events === 0 ? 'END' : String(r.events)))
  const chance = 1 / 9

  const data = [
    { key: 'overall', label: 'Overall top-1', values: rows.map((r) => r.top1) },
    { key: 'ghost', label: 'Ghost (best read)', values: rows.map((r) => r.byStyle.ghost.top1) },
    {
      key: 'balanced',
      label: 'Balanced (worst read)',
      values: rows.map((r) => r.byStyle.balanced.top1),
    },
    { key: 'chance', label: 'Chance (1/9)', values: rows.map(() => chance) },
  ]

  return layoutLine({
    slug: 'classifier-accuracy-line',
    title: 'Classifier top-1 accuracy against events observed',
    desc:
      'Four polylines over four log-truncation checkpoints: the classifier’s overall top-1 ' +
      'accuracy, its best-read style (Ghost), its worst (Balanced), and the flat chance line ' +
      'at one ninth. Overall accuracy ends at .224 — twice chance, and far from a reliable ' +
      'read.',
    fig: `${figNo} — CLASSIFIER ACCURACY · ${xLabels.length} CHECKPOINTS`,
    caption:
      'X is the classifier’s log truncation in observed events, checkpoints at equal pitch — ' +
      'an index, not time; END is the full log. The 250-event checkpoint recorded zero seats ' +
      '(no game in the run produced 250 observable events) and is omitted rather than plotted ' +
      'as zero. The 150 checkpoint covers only 672 of 10,800 seats — the longest games — so ' +
      'its rise is survivorship, not learning. Y axis runs from zero to one; chance is ' +
      '1/9 ≈ .111. 10,800 opponent-seat reads per full checkpoint.',
    xLabels,
    data,
    focalKey: 'overall',
    format: trim4,
  })
}
