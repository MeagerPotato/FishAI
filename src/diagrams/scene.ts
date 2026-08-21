/**
 * The Scene — a diagram's geometry as data, before it is any SVG.
 *
 * Every diagram's layout is a pure function that returns one of these. The
 * renderer only turns it into elements. That split is what makes
 * `verify.ts` a real gate rather than a comment: the grammar rules are
 * checked against the numbers that will actually be drawn.
 *
 * (This is the port of the source repo's `scripts/verify-geometry.py` and
 * `scripts/self_check.py` — regex over emitted HTML there, typed data here.)
 */

import { longestSegmentMid, placeLabel } from './geometry'
import type { LabelSide, Pt } from './geometry'

/** A drawn rectangle: node box, matrix cell, chart bar, card. */
export interface SceneRect {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** Data-scaled rects (bar heights, dot positions) are 4px-grid exempt. */
  dataScaled?: boolean
  /**
   * True for rects painted AFTER the arrow labels — node boxes. A label mask
   * that lands partly inside one of these is clipped by the node fill and
   * the text renders as a fragment on the border.
   */
  node?: boolean
}

/** A connector. Waypoints are axis-aligned; bends become r=8 quarter-arcs. */
export interface SceneArrow {
  id: string
  points: Pt[]
  /** All-caps, <= 14 chars. */
  label?: string
  /** Distance from the label mask's near edge to the stroke. Must be 6..10. */
  labelGap?: number
  /** Which way the label sits off its segment. */
  labelSide?: LabelSide
  /** Segment midpoint the label hangs off. Defaults to the longest segment. */
  labelMid?: Pt
  /**
   * The opaque mask plate, resolved by `placeLabel`. Recorded here so the
   * gate can check it is not clipped by a node painted after it — the exact
   * defect `verify-geometry.py` exists for.
   */
  labelMask?: { x: number; y: number; w: number; h: number }
  accent?: boolean
  dashed?: boolean
  /** Transit past a non-endpoint box: must be dashed (connector rule 5). */
  transit?: boolean
}

export interface LegendItem {
  key: string
  label: string
  /** `swatch` = filled rect, `dot` = circle, `line` = stroke sample. */
  mark: 'swatch' | 'dot' | 'line'
  fill?: string
  stroke?: string
  dashed?: boolean
  /** Explicit dash pattern, for a series key that is identified by its dash. */
  dashPattern?: string
  hollow?: boolean
}

export interface Scene {
  /** Slug-prefixes every id in the emitted SVG so two inlined diagrams never collide. */
  slug: string
  /** SVG <title> — the literal first child, before <defs>. */
  title: string
  /** SVG <desc>. */
  desc: string

  viewW: number
  viewH: number

  /** Logical complexity, checked against the budget. */
  budget: {
    /** Nodes in the graph sense. Matrix cells and deck cards are not nodes. */
    nodes: number
    arrows: number
    accents: number
  }

  rects: SceneRect[]
  arrows: SceneArrow[]

  /** y of the legend's hairline. The legend is a bottom strip, never floating. */
  legendY: number
  legend: LegendItem[]

  /** Every font size used, for the 4px-grid gate. */
  fontSizes: number[]

  /** Engineering-drawing slug: `FIG. 07 — PAYOFF MATRIX · 2,600 PAIRS`. */
  fig: string
  /** Caption below the frame. States sort order, cuts, and provenance. */
  caption: string
}

/**
 * Resolve an arrow's label mask from its geometry.
 *
 * Layout and renderer both go through `placeLabel`, so the plate the gate
 * checks is the plate that gets drawn — they cannot drift apart.
 */
export function withLabelMask(arrow: SceneArrow): SceneArrow {
  if (arrow.label === undefined) return arrow
  const mid = arrow.labelMid ?? longestSegmentMid(arrow.points)
  const p = placeLabel(mid, arrow.labelSide ?? 'above', arrow.labelGap ?? 8, arrow.label)
  return { ...arrow, labelMask: { x: p.maskX, y: p.maskY, w: p.maskW, h: p.maskH } }
}

/** The complexity budget. Stricter than the source on arrows (12, not 14). */
export const BUDGET = {
  nodes: 9,
  arrows: 12,
  accents: 2,
  arrowLabelChars: 14,
  labelGapMin: 6,
  labelGapMax: 10,
} as const
