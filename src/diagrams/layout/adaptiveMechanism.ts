/**
 * DIAGRAM 6 — The v1.0 mechanism: observe → classify → best-respond → play.
 *
 * diagram-design's smallest legal composition: one lane, four stages, three
 * hand-offs. The subject is a straight pipeline with no branching, so any
 * richer type (lanes, state machine) would be drawing structure the mechanism
 * does not have.
 *
 * The accent budget (2) is spent where the finding lives: the BEST-RESPOND
 * stage is focal — it is the stage where adaptation degenerates — and the
 * hand-off it emits is the accent arrow, labelled `PUNTER ALWAYS`, because
 * over this roster that label is a theorem, not a tendency: the committed
 * counter table's punter row weakly dominates every column, and the adaptive
 * expectation is linear in the opponent posterior, so the argmax is Punter
 * under every belief a game can produce.
 *
 * Geometry: nodes 168×88 at y=40; x = 24 / 276 / 528 / 856. The wider third
 * gap (160px against 84px) is not rhythm for its own sake — the accent
 * arrow's label mask must clear both endpoint boxes, and `verifyScene` checks
 * that it does. At the 12px arrow role `PUNTER ALWAYS` masks 128px wide
 * rather than the 92px it took at 8px, so the gap grew with it: 160 leaves
 * 16px of clearance on each side.
 */

import { withLabelMask, type Scene, type SceneArrow, type SceneRect } from '../scene'
import { C } from '../tokens'

const NODE_W = 168
const NODE_H = 88
const NODE_Y = 40
const ARROW_Y = NODE_Y + 44
const LEGEND_Y = 160
const VIEW_W = 1056
const VIEW_H = 208

export interface MechanismNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  title: string
  sub: string
  tool: string
  focal: boolean
}

export interface AdaptiveMechanismModel {
  scene: Scene
  nodes: MechanismNode[]
}

const SPECS: Array<Omit<MechanismNode, 'y' | 'w' | 'h'>> = [
  { id: 'observe', x: 24, title: 'Observe', sub: 'public log', focal: false, tool: 'observe.ts' },
  { id: 'classify', x: 276, title: 'Classify', sub: 'per-seat posterior', focal: false, tool: 'fingerprints' },
  { id: 'respond', x: 528, title: 'Best-respond', sub: 'counter table', focal: true, tool: 'argmax E[p]' },
  { id: 'play', x: 856, title: 'Play', sub: 'style engine', focal: false, tool: 'decide()' },
]

export function layoutAdaptiveMechanism(figNo = 'FIG. 01'): AdaptiveMechanismModel {
  const nodes: MechanismNode[] = SPECS.map((n) => ({ ...n, y: NODE_Y, w: NODE_W, h: NODE_H }))

  const between = (a: MechanismNode, b: MechanismNode): [{ x: number; y: number }, { x: number; y: number }] => [
    { x: a.x + a.w, y: ARROW_Y },
    { x: b.x, y: ARROW_Y },
  ]

  const arrows: SceneArrow[] = [
    { id: 'observe-classify', points: between(nodes[0], nodes[1]) },
    { id: 'classify-respond', points: between(nodes[1], nodes[2]) },
    withLabelMask({
      id: 'respond-play',
      points: between(nodes[2], nodes[3]),
      label: 'PUNTER ALWAYS',
      labelGap: 8,
      labelSide: 'above',
      accent: true,
    }),
  ]

  const rects: SceneRect[] = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, node: true }))

  const scene: Scene = {
    slug: 'adaptive-mechanism',
    title: 'The v1.0 mechanism: observe, classify, best-respond, play',
    desc:
      'Four stages left to right: observe the public log, classify each opponent seat into a ' +
      'style posterior, best-respond over the measured counter table, and play the chosen ' +
      'style. The best-respond stage is highlighted and its hand-off is labelled punter ' +
      'always: over this roster the lookup returns Punter under every belief, so everything ' +
      'the first two stages learn is discarded at the third.',
    viewW: VIEW_W,
    viewH: VIEW_H,
    budget: { nodes: nodes.length, arrows: arrows.length, accents: 2 },
    rects,
    arrows,
    legendY: LEGEND_Y,
    legend: [
      { key: 'stage', label: 'STAGE', mark: 'swatch', fill: C.sheet, stroke: C.ink },
      { key: 'focal', label: 'DEGENERATE STAGE', mark: 'swatch', fill: C.accentTint, stroke: C.accent },
      { key: 'flow', label: 'HAND-OFF', mark: 'line', stroke: C.muted },
      { key: 'delegate', label: 'WARM DELEGATION', mark: 'line', stroke: C.accent },
    ],
    fontSizes: [12, 16],
    fig: `${figNo} — THE V1.0 MECHANISM · 4 STAGES · 1 DEGENERACY`,
    caption:
      'One decision flows left to right. The counter table consulted at the third stage is ' +
      'committed and measured (style-results.v2.json, 4,300 pairs per cell), and its punter ' +
      'row weakly dominates every column; the adaptive expectation is linear in the ' +
      'classifier’s posterior, so the argmax is Punter whatever the first two stages report. ' +
      'The accented hand-off is a theorem about this roster, and the suite measured it: warm ' +
      'delegation was 100% Punter in every gauntlet cell.',
  }

  return { scene, nodes }
}
