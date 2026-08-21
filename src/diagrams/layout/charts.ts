/**
 * DIAGRAM 5 — Per-style metric charts: bar, line, dumbbell.
 *
 * All three share one canvas and one margin set so a row of them reads as a
 * single system: `0 0 1000 512`, margins L80 / T40 / R40 / B60, plot band
 * y 40 -> 420, tick labels at 440.
 *
 * ONE GRID CORRECTION to the type references: the house legend rhythm is
 * y=462 / y=478 inside a 500-tall canvas, which the reference itself flags
 * as off-grid. The 4px rule wins here, so the legend rule sits at 464 and
 * the canvas is 512 tall. Nothing else moves.
 *
 * AXIS HONESTY IS LOAD-BEARING ON A RESEARCH SITE.
 *   - The BAR chart is always zero-anchored. A truncated baseline distorts
 *     the ratio between bars, which is the whole reading.
 *   - The LINE chart may use a disclosed band around .500, because what it
 *     encodes is direction and rate of change, not magnitude against zero —
 *     and the .500 reference line gives the reader the calibration. The
 *     bounds go in the caption.
 *   - The DUMBBELL derives floor and ceil from the data's RANGE, never from
 *     its observed extremes; `niceDomain` implements all four sign cases.
 * Every chart states its sort order in the caption.
 */

import { bandDomain, niceDomain, scaleTo, snap, ticks, type Domain } from '../geometry'
import type { Scene, SceneRect } from '../scene'
import { C } from '../tokens'
import { cellIndex, scoreOf, type SeatMetrics, type StyleResults } from '../types'

export const PLOT = {
  left: 80,
  right: 960,
  top: 40,
  bottom: 420,
  tickY: 440,
  viewW: 1000,
  legendY: 464,
  viewH: 512,
  /** Dumbbell replaces the 80px left margin with 200px of row labels. */
  dumbbellLeft: 200,
} as const

/* ========================================================================= */
/* Bar                                                                        */
/* ========================================================================= */

export interface Bar {
  key: string
  label: string
  value: number
  x: number
  y: number
  w: number
  h: number
  focal: boolean
  /** Printed above the bar. */
  text: string
}

export interface BarModel {
  scene: Scene
  bars: Bar[]
  domain: Domain
  gridlines: Array<{ y: number; label: string }>
}

export interface BarInput {
  title: string
  desc: string
  fig: string
  caption: string
  slug: string
  unitLabel: string
  data: Array<{ key: string; label: string; value: number }>
  /** Exactly one. Everything else is muted. */
  focalKey?: string
  format?: (v: number) => string
}

export function layoutBar({
  title,
  desc,
  fig,
  caption,
  slug,
  unitLabel,
  data,
  focalKey,
  format = (v) => v.toFixed(2),
}: BarInput): BarModel {
  if (data.length < 4 || data.length > 8) {
    throw new Error(`bar chart: ${data.length} bars, the type caps at 4..8`)
  }

  // Zero-anchored, always. Never truncate a bar baseline.
  const domain = niceDomain([0, ...data.map((d) => d.value)])
  const span = PLOT.right - PLOT.left
  const pitch = Math.floor(span / data.length / 4) * 4
  const barW = Math.min(pitch - 40, 96)
  const x0 = snap(PLOT.left + (pitch - barW) / 2)

  const bars: Bar[] = data.map((d, i) => {
    const yTop = scaleTo(d.value, domain, PLOT.bottom, PLOT.top)
    return {
      key: d.key,
      label: d.label,
      value: d.value,
      x: x0 + i * pitch,
      y: yTop,
      w: barW,
      h: Math.max(0, PLOT.bottom - yTop),
      focal: d.key === focalKey,
      text: format(d.value),
    }
  })

  const gridlines = ticks(domain, 5).map((v) => ({
    y: scaleTo(v, domain, PLOT.bottom, PLOT.top),
    label: format(v),
  }))

  const rects: SceneRect[] = bars.map((b) => ({
    id: `bar-${b.key}`,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    dataScaled: true,
  }))

  const scene: Scene = {
    slug,
    title,
    desc,
    viewW: PLOT.viewW,
    viewH: PLOT.viewH,
    budget: { nodes: 0, arrows: 0, accents: focalKey ? 1 : 0 },
    rects,
    arrows: [],
    legendY: PLOT.legendY,
    legend: [
      { key: 'other', label: unitLabel, mark: 'swatch', fill: C.ink08, stroke: C.muted },
      { key: 'focal', label: 'FOCAL', mark: 'swatch', fill: C.accentTint, stroke: C.accent },
    ],
    fontSizes: [8, 12],
    fig,
    caption,
  }

  return { scene, bars, domain, gridlines }
}

/* ========================================================================= */
/* Line                                                                       */
/* ========================================================================= */

export interface LineSeries {
  key: string
  label: string
  points: Array<{ x: number; y: number }>
  focal: boolean
  color: string
  /**
   * Dash pattern. Non-focal series are separated by DASH, not hue — this
   * system has one accent, and a five-colour ramp would be a second palette
   * (SITE_SPEC.md §3.1). Dash also survives greyscale and colour-vision
   * deficiency, which hue does not.
   */
  dash?: string
}

export interface LineModel {
  scene: Scene
  series: LineSeries[]
  domain: Domain
  xLabels: Array<{ x: number; label: string }>
  gridlines: Array<{ y: number; label: string }>
  /** The .500 calibration rule, when the domain brackets it. */
  referenceY?: number
}

export interface LineInput {
  title: string
  desc: string
  fig: string
  caption: string
  slug: string
  xLabels: string[]
  data: Array<{ key: string; label: string; values: number[] }>
  focalKey?: string
  /** Disclosed band; the caption must state the bounds. */
  band?: { step: number; anchor: number }
  format?: (v: number) => string
}

export function layoutLine({
  title,
  desc,
  fig,
  caption,
  slug,
  xLabels,
  data,
  focalKey,
  band,
  format = (v) => v.toFixed(2),
}: LineInput): LineModel {
  if (data.length > 5) throw new Error(`line chart: ${data.length} series, the type caps at 5`)
  if (xLabels.length < 4 || xLabels.length > 12) {
    throw new Error(`line chart: ${xLabels.length} points, the type wants 4..12`)
  }

  const flat = data.flatMap((d) => d.values)
  const domain = band ? bandDomain(flat, band.step, band.anchor) : niceDomain([0, ...flat])

  const n = xLabels.length
  const step = Math.floor((PLOT.right - PLOT.left) / (n - 1) / 4) * 4
  const xAt = (i: number) => PLOT.left + i * step

  let nonFocal = 0
  const series: LineSeries[] = data.map((d) => {
    const focal = d.key === focalKey
    const ramp = C.series[nonFocal % C.series.length]
    if (!focal) nonFocal++
    return {
      key: d.key,
      label: d.label,
      focal,
      color: focal ? C.accent : ramp.stroke,
      dash: focal ? undefined : ramp.dash,
      points: d.values.map((v, i) => ({ x: xAt(i), y: scaleTo(v, domain, PLOT.bottom, PLOT.top) })),
    }
  })

  const gridlines = ticks(domain, 5).map((v) => ({
    y: scaleTo(v, domain, PLOT.bottom, PLOT.top),
    label: format(v),
  }))

  const referenceY =
    band && band.anchor > domain.floor && band.anchor < domain.ceil
      ? scaleTo(band.anchor, domain, PLOT.bottom, PLOT.top)
      : undefined

  const scene: Scene = {
    slug,
    title,
    desc,
    viewW: PLOT.viewW,
    viewH: PLOT.viewH,
    budget: { nodes: 0, arrows: 0, accents: focalKey ? 1 : 0 },
    rects: [],
    arrows: [],
    legendY: PLOT.legendY,
    legend: series.map((s) => ({
      key: s.key,
      label: s.label.toUpperCase(),
      mark: 'line' as const,
      stroke: s.color,
      dashPattern: s.dash,
    })),
    fontSizes: [8, 12],
    fig,
    caption,
  }

  return { scene, series, domain, xLabels: xLabels.map((l, i) => ({ x: xAt(i), label: l })), gridlines, referenceY }
}

/* ========================================================================= */
/* Dumbbell                                                                   */
/* ========================================================================= */

/** Pitch and origin per row count, so the block stays inside the plot band. */
const DUMBBELL_ROWS: Record<number, { pitch: number; first: number }> = {
  4: { pitch: 88, first: 96 },
  5: { pitch: 64, first: 96 },
  6: { pitch: 64, first: 76 },
  7: { pitch: 52, first: 72 },
  8: { pitch: 48, first: 68 },
}

export interface DumbbellRow {
  key: string
  label: string
  y: number
  refValue: number
  focalValue: number
  refX: number
  focalX: number
  /** Left/right by geometry, not by series — a falling row reverses the dots. */
  leftX: number
  rightX: number
  leftText: string
  rightText: string
  /** Below ~16px of centre separation the pair reads as one blob. */
  tooClose: boolean
  /** A value on the domain floor collides with its own row label. */
  leftOnFloor: boolean
}

export interface DumbbellModel {
  scene: Scene
  rows: DumbbellRow[]
  domain: Domain
  gridlines: Array<{ x: number; label: string }>
  axisTitle: string
}

export interface DumbbellInput {
  title: string
  desc: string
  fig: string
  caption: string
  slug: string
  axisTitle: string
  refLabel: string
  focalLabel: string
  data: Array<{ key: string; label: string; ref: number; focal: number }>
  format?: (v: number) => string
}

export function layoutDumbbell({
  title,
  desc,
  fig,
  caption,
  slug,
  axisTitle,
  refLabel,
  focalLabel,
  data,
  format = (v) => v.toFixed(2),
}: DumbbellInput): DumbbellModel {
  const geom = DUMBBELL_ROWS[data.length]
  if (!geom) throw new Error(`dumbbell: ${data.length} rows, the type caps at 4..8`)

  const domain = niceDomain(data.flatMap((d) => [d.ref, d.focal]))
  const x0 = PLOT.dumbbellLeft
  const x1 = PLOT.right

  const rows: DumbbellRow[] = data.map((d, i) => {
    const y = geom.first + i * geom.pitch
    const refX = scaleTo(d.ref, domain, x0, x1)
    const focalX = scaleTo(d.focal, domain, x0, x1)
    const leftIsRef = refX <= focalX
    return {
      key: d.key,
      label: d.label,
      y,
      refValue: d.ref,
      focalValue: d.focal,
      refX,
      focalX,
      leftX: Math.min(refX, focalX),
      rightX: Math.max(refX, focalX),
      leftText: format(leftIsRef ? d.ref : d.focal),
      rightText: format(leftIsRef ? d.focal : d.ref),
      tooClose: Math.abs(refX - focalX) < 16,
      leftOnFloor: Math.min(refX, focalX) - 12 < x0,
    }
  })

  const gridlines = ticks(domain, 5).map((v) => ({
    x: scaleTo(v, domain, x0, x1),
    label: format(v),
  }))

  const scene: Scene = {
    slug,
    title,
    desc,
    viewW: PLOT.viewW,
    viewH: PLOT.viewH,
    budget: { nodes: 0, arrows: 0, accents: 1 },
    rects: [],
    arrows: [],
    legendY: PLOT.legendY,
    legend: [
      { key: 'ref', label: refLabel.toUpperCase(), mark: 'dot', hollow: true, stroke: C.muted },
      { key: 'focal', label: focalLabel.toUpperCase(), mark: 'dot', fill: C.accent, stroke: C.ink },
    ],
    fontSizes: [8, 12],
    fig,
    caption,
  }

  return { scene, rows, domain, gridlines, axisTitle }
}

/* ========================================================================= */
/* Fixture-derived inputs — what the site actually plots                      */
/* ========================================================================= */

const label = (r: StyleResults, id: string) => r.styles.find((s) => s.id === id)?.label ?? id

/** Mean of a per-seat metric for one style, across every cell it appears in. */
export function meanMetric(
  results: StyleResults,
  styleId: string,
  key: keyof SeatMetrics,
): number {
  const xs: number[] = []
  for (const c of results.matrix) {
    if (c.a === styleId) xs.push(c.metrics.a[key])
    else if (c.b === styleId) xs.push(c.metrics.b[key])
  }
  if (xs.length === 0) return 0
  return xs.reduce((s, v) => s + v, 0) / xs.length
}

/** BAR — concede rate per style. Zero-anchored; zero is a real value here. */
export function concedeRateBar(results: StyleResults, figNo = 'FIG. 12'): BarModel {
  const ids = results.ranking.meanScore.map((m) => m.style).slice(0, 6)
  const data = ids
    .map((id) => ({ key: id, label: label(results, id), value: meanMetric(results, id, 'concedeRate') }))
    .sort((p, q) => q.value - p.value)
  const focalKey = data[0]?.key

  return layoutBar({
    slug: 'concede-rate-bar',
    title: 'Concede rate by play style',
    desc:
      'A zero-anchored bar chart of concede rate for six play styles, sorted highest first. ' +
      'The tallest bar is highlighted.',
    fig: `${figNo} — CONCEDE RATE · ZERO-ANCHORED`,
    caption:
      'Concede rate: declares that handed the set to the opponents, as a share of declares. ' +
      'Under us54 this REPLACES the old void rate — the void outcome is abolished, so the ' +
      'event being counted is a different one and the two are not comparable. Six of nine ' +
      `styles shown (the six highest mean score rate); ${results.styles.length - 6} omitted, ` +
      'full table on /lab/matrix. Sorted by concede rate, descending. Baseline is zero.',
    unitLabel: 'CONCEDE RATE',
    data,
    focalKey,
  })
}

/** LINE — how a style's score rate holds up as the opponent gets stronger. */
export function degradationLine(results: StyleResults, figNo = 'FIG. 13'): LineModel {
  const index = cellIndex(results.matrix)
  const ranked = results.ranking.meanScore.map((m) => m.style)
  const opponents = ranked.slice(0, 8)
  const picks = [ranked[0], ranked[1], ranked[Math.floor(ranked.length / 2)], ranked[ranked.length - 1]]
    .filter((v, i, arr): v is string => typeof v === 'string' && arr.indexOf(v) === i)
    .slice(0, 5)

  const data = picks.map((id) => ({
    key: id,
    label: label(results, id),
    values: opponents.map((opp) => (opp === id ? 0.5 : (scoreOf(index, id, opp)?.score ?? 0.5))),
  }))

  return layoutLine({
    slug: 'degradation-line',
    title: 'Score rate against progressively stronger opponents',
    desc:
      'Four play styles plotted against the eight opponents ordered by mean score rate, ' +
      'strongest first. A flat line degrades gracefully; a steep fall means the style only ' +
      'beats weak opposition. A rule at .500 marks an even match-up.',
    fig: `${figNo} — DEGRADATION CURVE · 4 OF 9 STYLES`,
    caption:
      'X axis is the opponent, ordered by that opponent’s own mean score rate, strongest ' +
      'first — a rank index, not time. Y axis is a DISCLOSED BAND around .500 rather than a ' +
      '0-to-1 axis: what this figure encodes is the direction and rate of change, and the ' +
      'rule at .500 supplies the calibration. Self-play cells are plotted at .500 by ' +
      'definition. Four of nine styles shown — best, second, median and worst by mean score ' +
      'rate.',
    xLabels: opponents.map((id) => label(results, id).toUpperCase().slice(0, 9)),
    data,
    focalKey: picks[0],
    band: { step: 0.05, anchor: 0.5 },
    format: (v) => v.toFixed(2).replace(/^0/, ''),
  })
}

/** DUMBBELL — every style against the Balanced control on one metric. */
export function claimPrecisionDumbbell(results: StyleResults, figNo = 'FIG. 14'): DumbbellModel {
  const control = 'balanced'
  const controlValue = meanMetric(results, control, 'claimPrecision')
  const data = results.styles
    .filter((s) => s.id !== control)
    .map((s) => ({
      key: s.id,
      label: s.label,
      ref: controlValue,
      focal: meanMetric(results, s.id, 'claimPrecision'),
    }))
    .sort((p, q) => p.focal - q.focal)
    .slice(0, 8)

  return layoutDumbbell({
    slug: 'claim-precision-dumbbell',
    title: 'Claim precision: each style against the Balanced control',
    desc:
      'One row per play style. A hollow dot marks the Balanced control and a solid amber dot ' +
      'marks the style; the hairline between them is the gap. Rows are sorted by the style’s ' +
      'own value, lowest first.',
    fig: `${figNo} — CLAIM PRECISION vs BALANCED · 8 OF 9 STYLES`,
    caption:
      'Sorted by the style’s own claim precision, ASCENDING — not by gap. The connector is a ' +
      'gap, not a trajectory: it says how far apart two values are and nothing about what lies ' +
      'between them. Both ends are labelled with their real value and share one scale, and the ' +
      'axis runs from zero, so the gaps are not magnified by a narrowed frame.',
    axisTitle: 'CLAIM PRECISION',
    refLabel: 'Balanced (control)',
    focalLabel: 'Style',
    data,
    format: (v) => v.toFixed(2).replace(/^0/, ''),
  })
}
