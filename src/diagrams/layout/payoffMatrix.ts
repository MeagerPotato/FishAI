/**
 * DIAGRAM 1 — Payoff matrix.
 *
 * diagram-design's **DP security matrix**, verbatim geometry. Cells emit no
 * edges: a matrix has no connectors, and adding one is a different diagram
 * type.
 *
 * Budget note (SITE_SPEC.md §3.2): the type caps columns at 6, and there are
 * 9 styles. The resolution is a headline matrix of all 9 rows against a
 * chosen 2..6 opponent columns, with the full N×N living on `/lab/matrix`.
 * The caption always names which columns are shown — an unstated subset is
 * the same lie as a truncated axis.
 *
 * Score rate is encoded TWICE: quantised into the 4-level ink ramp and
 * printed numerically in every cell, so the ramp is redundant rather than
 * load-bearing.
 */

import { type Scene } from '../scene'
import { C } from '../tokens'
import { cellIndex, scoreOf, type MatrixCell, type StyleResults } from '../types'

export type CellLevel = 'full' | 'rw' | 'read' | 'none'

export interface PayoffCell {
  row: number
  col: number
  x: number
  y: number
  w: number
  h: number
  /** Printed score rate, always. `—` on the diagonal. */
  value: string
  level: CellLevel
  focal: boolean
  /** Second line, focal cell only. */
  sub?: string
  /** Not significant after Benjamini-Hochberg. */
  ns: boolean
  /** For the drill-down link on `/lab/matrix`. Absent on the diagonal. */
  cell?: MatrixCell
  /** Engineering-drawing address: `B3`. */
  address: string
}

export interface PayoffRow {
  id: string
  label: string
  hint: string
  x: number
  y: number
  w: number
  h: number
}

export interface PayoffCol {
  id: string
  label: string
  code: string
  x: number
  cx: number
  w: number
}

export interface PayoffModel {
  scene: Scene
  header: { y: number; h: number; labelX: number; labelW: number }
  rows: PayoffRow[]
  cols: PayoffCol[]
  cells: PayoffCell[]
}

/* -- constants, straight from the type reference ------------------------- */
const LEFT_PAD = 12
const RIGHT_PAD = 48
const COMP_COL_W = 208
const COMP_ROLE_GAP = 12
const ROLE_COL_W = 148
const ROLE_COL_GAP = 16
const HEADER_H = 52
const ROW_H = 36
const ROW_STRIDE = 40
const HEADER_Y = 72
const ROW_Y0 = 140

export interface PayoffInput {
  results: StyleResults
  /** Opponent columns, 2..6. Defaults to the 5 highest-mean-score styles. */
  columnIds?: string[]
  figNo?: string
}

const pct = (v: number): string => v.toFixed(3).replace(/^0/, '')

function levelOf(score: number): CellLevel {
  if (score >= 0.55) return 'full'
  if (score >= 0.51) return 'rw'
  if (score >= 0.49) return 'read'
  return 'none'
}

/** `B3` — column letter, row number. */
const address = (row: number, col: number): string =>
  `${String.fromCharCode(65 + col)}${row + 1}`

export function layoutPayoffMatrix({
  results,
  columnIds,
  figNo = 'FIG. 07',
}: PayoffInput): PayoffModel {
  const byId = new Map(results.styles.map((s) => [s.id, s]))
  const index = cellIndex(results.matrix)

  // Rows: every style, ordered by mean score rate. Stated in the caption.
  const rowIds = results.ranking.meanScore.map((m) => m.style).filter((id) => byId.has(id))
  const colIds = (columnIds ?? rowIds.slice(0, 5)).filter((id) => byId.has(id))

  if (colIds.length < 2 || colIds.length > 6) {
    throw new Error(`payoff matrix: ${colIds.length} columns, the type caps at 2..6`)
  }
  if (rowIds.length < 2 || rowIds.length > 14) {
    throw new Error(`payoff matrix: ${rowIds.length} rows, the type caps at 2..14`)
  }

  const nCols = colIds.length
  const nRows = rowIds.length

  const viewW =
    LEFT_PAD + COMP_COL_W + COMP_ROLE_GAP + nCols * ROLE_COL_W + (nCols - 1) * ROLE_COL_GAP + RIGHT_PAD
  const rowY = (k: number) => ROW_Y0 + k * ROW_STRIDE
  const rowsBottom = rowY(nRows - 1) + ROW_H
  const legendY = rowsBottom + 20
  const viewH = legendY + 44

  const colX = (j: number) =>
    LEFT_PAD + COMP_COL_W + COMP_ROLE_GAP + j * (ROLE_COL_W + ROLE_COL_GAP)

  const cols: PayoffCol[] = colIds.map((id, j) => ({
    id,
    label: byId.get(id)?.label ?? id,
    code: (byId.get(id)?.family ?? '').toUpperCase().slice(0, 12),
    x: colX(j),
    cx: colX(j) + ROLE_COL_W / 2,
    w: ROLE_COL_W,
  }))

  const rows: PayoffRow[] = rowIds.map((id, k) => ({
    id,
    label: byId.get(id)?.label ?? id,
    hint: (byId.get(id)?.family ?? '').toUpperCase(),
    x: LEFT_PAD,
    y: rowY(k),
    w: COMP_COL_W,
    h: ROW_H,
  }))

  // Build cells first, then pick the single focal one.
  const raw: PayoffCell[] = []
  for (let k = 0; k < nRows; k++) {
    for (let j = 0; j < nCols; j++) {
      const a = rowIds[k]
      const b = colIds[j]
      const base = {
        row: k,
        col: j,
        x: colX(j),
        y: rowY(k),
        w: ROLE_COL_W,
        h: ROW_H,
        focal: false,
        address: address(k, j),
      }
      if (a === b) {
        raw.push({ ...base, value: '—', level: 'read', ns: false })
        continue
      }
      const found = scoreOf(index, a, b)
      if (!found) {
        raw.push({ ...base, value: 'n/a', level: 'none', ns: true })
        continue
      }
      raw.push({
        ...base,
        value: pct(found.score),
        level: levelOf(found.score),
        ns: !found.cell.significant,
        cell: found.cell,
      })
    }
  }

  // Exactly one focal cell: the largest significant edge on the board.
  let focalIdx = -1
  let focalEdge = 0
  raw.forEach((c, i) => {
    if (!c.cell || c.ns || c.value === '—') return
    const edge = Math.abs(c.cell.aScore - 0.5)
    if (edge > focalEdge) {
      focalEdge = edge
      focalIdx = i
    }
  })
  if (focalIdx >= 0) {
    const c = raw[focalIdx]
    raw[focalIdx] = { ...c, focal: true, sub: `q ${c.cell?.qValue.toFixed(3) ?? '—'}` }
  }

  const rects = [
    { id: 'header-label', x: LEFT_PAD, y: HEADER_Y, w: COMP_COL_W, h: HEADER_H },
    ...cols.map((c, j) => ({ id: `header-col-${j}`, x: c.x, y: HEADER_Y, w: c.w, h: HEADER_H })),
    ...rows.map((r, k) => ({ id: `row-label-${k}`, x: r.x, y: r.y, w: r.w, h: r.h })),
    ...raw.map((c) => ({ id: `cell-${c.address}`, x: c.x, y: c.y, w: c.w, h: c.h })),
  ]

  const focal = focalIdx >= 0 ? raw[focalIdx] : undefined
  const shown = cols.map((c) => c.label).join(', ')

  const scene: Scene = {
    slug: 'payoff-matrix',
    title: 'Payoff matrix: score rate of each play style against five opponents',
    desc:
      `A ${nRows}-row by ${nCols}-column grid. Each cell prints the row style's score rate ` +
      `against the column style, shaded on a four-level ramp from "row loses" to "row wins ` +
      `clearly". Rows are ordered by mean score rate. ` +
      (focal
        ? `The single highlighted cell is ${focal.address}, the largest significant edge in the grid.`
        : 'No cell reaches significance, so none is highlighted.'),
    viewW,
    viewH,
    budget: { nodes: 0, arrows: 0, accents: focal ? 1 : 0 },
    rects,
    arrows: [],
    legendY,
    legend: [
      { key: 'full', label: 'ROW WINS >=.550', mark: 'swatch', fill: C.ink08, stroke: C.ink12 },
      { key: 'rw', label: 'EDGE .510-.549', mark: 'swatch', fill: C.sheet, stroke: C.ink12 },
      { key: 'read', label: 'EVEN .490-.509', mark: 'swatch', fill: C.ink03, stroke: C.ink12 },
      { key: 'none', label: 'ROW LOSES <.490', mark: 'swatch', fill: C.paper, stroke: C.ink12 },
      { key: 'ns', label: 'N.S. q>.05', mark: 'swatch', fill: C.paper, stroke: C.soft, dashed: true },
      { key: 'focal', label: 'LARGEST EDGE', mark: 'swatch', fill: C.accentTint, stroke: C.accent },
    ],
    fontSizes: [8, 12],
    fig:
      `${figNo} — PAYOFF MATRIX · ${results.matrix[0]?.pairs.toLocaleString('en-US') ?? '0'} PAIRS ` +
      `· SE <= ${results.matrix[0]?.se.toFixed(3) ?? '0.005'}`,
    caption:
      `Score rate for the ROW style against the COLUMN style; .500 is even. Rows sorted by mean ` +
      `score rate across all opponents, descending. Columns shown: ${shown} — the full ` +
      `${results.styles.length}x${results.styles.length} grid, with confidence intervals and ` +
      `BH q-values, is on /lab/matrix. Every cell prints its value, so the shading is redundant ` +
      `encoding. Rule set us54 (rulesHash ${results.meta.rulesHash}); ties are 0 by construction.`,
  }

  return {
    scene,
    header: { y: HEADER_Y, h: HEADER_H, labelX: LEFT_PAD, labelW: COMP_COL_W },
    rows,
    cols,
    cells: raw,
  }
}
