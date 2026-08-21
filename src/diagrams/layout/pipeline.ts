/**
 * DIAGRAM 3 — Analysis pipeline.
 *
 * diagram-design's **data flow** (role-scoped lanes), not Architecture: the
 * subject is a pipeline with typed payloads and a hand-off between owners,
 * which is exactly what data flow is for.
 *
 * Lanes = Sim / Aggregate / Analyze / Site — 4, at the type's cap.
 * Steps = Seed, Play, Record, Aggregate, Analyze, Emit — 6, at the cap.
 *
 * Two grid corrections to the type reference, both forced by the 4px rule:
 * `step_slot_w` 112 -> 128 and `node_w` 100 -> 104, because 112/100 puts
 * every node_x on an odd multiple of 2. `lane_h` 80 -> 96 opens the 32px of
 * canvas a cross-lane elbow needs for an r=8 arc.
 *
 * Accent budget is spent on the focal NODE (Analyze) and the focal ARROW
 * (the artifact hand-off) — not additionally on the step chip, which would
 * be a third.
 */

import type { Pt } from '../geometry'
import { withLabelMask, type Scene, type SceneArrow, type SceneRect } from '../scene'
import { C } from '../tokens'

const LABEL_COL_W = 140
const STEP_SLOT_W = 128
const RIGHT_PAD = 28
const HEADER_H = 36
const LANE_H = 96
const NODE_W = 104
const NODE_H = 64

export interface PipelineLane {
  key: string
  name: [string, string]
  y: number
  mid: number
}

export interface PipelineStep {
  number: string
  label: string
  cx: number
  chipX: number
}

export interface PipelineNode {
  id: string
  lane: number
  step: number
  title: string
  sub: string
  tool: string
  x: number
  y: number
  w: number
  h: number
  focal: boolean
}

export interface PipelineModel {
  scene: Scene
  lanes: PipelineLane[]
  steps: PipelineStep[]
  nodes: PipelineNode[]
  labelColW: number
  headerH: number
}

const LANES: Array<{ key: string; name: [string, string] }> = [
  { key: 'SIM', name: ['SIMULATOR', 'node'] },
  { key: 'AGG', name: ['AGGREGATE', 'node'] },
  { key: 'ANL', name: ['ANALYSIS', 'node'] },
  { key: 'WEB', name: ['SITE', 'browser'] },
]

const STEPS: Array<{ number: string; label: string }> = [
  { number: '01', label: 'SEED' },
  { number: '02', label: 'PLAY' },
  { number: '03', label: 'RECORD' },
  { number: '04', label: 'AGGREGATE' },
  { number: '05', label: 'ANALYZE' },
  { number: '06', label: 'EMIT' },
]

interface NodeSpec {
  id: string
  lane: number
  step: number
  title: string
  sub: string
  tool: string
  focal?: boolean
}

const NODES: NodeSpec[] = [
  { id: 'seed', lane: 0, step: 0, title: 'Seed Set', sub: 'shared list', tool: 'style-v1' },
  { id: 'play', lane: 0, step: 1, title: 'Duplicate', sub: 'both sides', tool: 'reduce()' },
  { id: 'record', lane: 0, step: 2, title: 'Record', sub: 'actions only', tool: 'GameAction[]' },
  { id: 'agg', lane: 1, step: 3, title: 'Aggregate', sub: 'score rate', tool: 'SE <= .005' },
  {
    id: 'analyze',
    lane: 2,
    step: 4,
    title: 'Analyze',
    sub: 'BH q · Nash',
    tool: 'verdict',
    focal: true,
  },
  { id: 'emit', lane: 3, step: 5, title: 'Emit', sub: 'one artifact', tool: 'import' },
]

export function layoutPipeline(figNo = 'FIG. 09'): PipelineModel {
  const viewW = LABEL_COL_W + STEPS.length * STEP_SLOT_W + RIGHT_PAD
  const laneTop = (k: number) => HEADER_H + k * LANE_H
  const stepCx = (j: number) => LABEL_COL_W + j * STEP_SLOT_W + STEP_SLOT_W / 2

  const lanes: PipelineLane[] = LANES.map((l, k) => ({
    key: l.key,
    name: l.name,
    y: laneTop(k),
    mid: laneTop(k) + LANE_H / 2,
  }))

  const steps: PipelineStep[] = STEPS.map((s, j) => ({
    number: s.number,
    label: s.label,
    cx: stepCx(j),
    chipX: stepCx(j) - 16,
  }))

  const nodes: PipelineNode[] = NODES.map((n) => ({
    ...n,
    focal: n.focal === true,
    x: stepCx(n.step) - NODE_W / 2,
    y: laneTop(n.lane) + 16,
    w: NODE_W,
    h: NODE_H,
  }))

  const at = (id: string): PipelineNode => {
    const n = nodes.find((x) => x.id === id)
    if (!n) throw new Error(`pipeline: unknown node "${id}"`)
    return n
  }

  /* -- connectors. Within-lane runs share a y, so a straight line is legal;
        cross-lane hops are rounded right-angle elbows through the 32px band
        between lanes, offset 4px off the divider so the two never merge. -- */
  const hop = (fromId: string, toId: string, offset: number): Pt[] => {
    const a = at(fromId)
    const b = at(toId)
    const mid = a.y + a.h + offset
    return [
      { x: a.x + a.w / 2, y: a.y + a.h },
      { x: a.x + a.w / 2, y: mid },
      { x: b.x + b.w / 2, y: mid },
      { x: b.x + b.w / 2, y: b.y },
    ]
  }

  const inLane = (fromId: string, toId: string): Pt[] => {
    const a = at(fromId)
    const b = at(toId)
    return [
      { x: a.x + a.w, y: a.y + a.h / 2 },
      { x: b.x, y: b.y + b.h / 2 },
    ]
  }

  const analyze = at('analyze')
  const focalMid: Pt = { x: analyze.x + analyze.w / 2, y: analyze.y + analyze.h + 6 }

  const arrows: SceneArrow[] = [
    { id: 'seed-play', points: inLane('seed', 'play') },
    { id: 'play-record', points: inLane('play', 'record') },
    { id: 'record-agg', points: hop('record', 'agg', 12) },
    { id: 'agg-analyze', points: hop('agg', 'analyze', 12) },
    withLabelMask({
      id: 'analyze-emit',
      points: hop('analyze', 'emit', 12),
      label: 'RESULTS.JSON',
      labelGap: 8,
      labelSide: 'left',
      labelMid: focalMid,
      accent: true,
    }),
  ]

  const rects: SceneRect[] = nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    w: n.w,
    h: n.h,
    node: true,
  }))

  const legendY = HEADER_H + LANES.length * LANE_H
  const viewH = legendY + 48

  const scene: Scene = {
    slug: 'analysis-pipeline',
    title: 'Analysis pipeline: from a shared seed list to one committed artifact',
    desc:
      'Four horizontal lanes — simulator, aggregate, analysis, site — crossed by six numbered ' +
      'steps: seed, play, record, aggregate, analyze, emit. Work moves left to right and hands ' +
      'down a lane at each boundary. The analysis step is highlighted, as is the arrow carrying ' +
      'the results artifact into the site.',
    viewW,
    viewH,
    budget: { nodes: nodes.length, arrows: arrows.length, accents: 2 },
    rects,
    arrows,
    legendY,
    legend: [
      { key: 'step', label: 'PIPELINE STEP', mark: 'swatch', fill: C.sheet, stroke: C.ink },
      { key: 'focal', label: 'FOCAL STEP', mark: 'swatch', fill: C.accentTint, stroke: C.accent },
      { key: 'flow', label: 'HAND-OFF', mark: 'line', stroke: C.muted },
      { key: 'artifact', label: 'ARTIFACT', mark: 'line', stroke: C.accent },
    ],
    fontSizes: [8, 12],
    fig: `${figNo} — ANALYSIS PIPELINE · 4 LANES · 6 STEPS`,
    caption:
      'Simulations never run in the browser. The site is a pure reader of one committed ' +
      'artifact, so the only edge that crosses into the browser lane is the results file. ' +
      'Replays store actions rather than states — the engine is deterministic, so a seed plus ' +
      'an action list reconstructs every position.',
  }

  return { scene, lanes, steps, nodes, labelColW: LABEL_COL_W, headerH: HEADER_H }
}
