/**
 * DIAGRAM 4 — Turn structure and the declare window.
 *
 * diagram-design's **state machine**, SPLIT INTO TWO. The us54 turn loop and
 * the declare window together run to 10 states and 17 transitions, which
 * breaks the type's own "transitions <= states x 2" rule and would have
 * meant a hairball. Split, each half sits comfortably inside it.
 *
 *   4a  TURN STRUCTURE   — 4 states, 7 transitions. Accent on DECLARE
 *                          WINDOW, which is the door into 4b.
 *   4b  DECLARE WINDOW   — 6 states, 10 transitions. Accent on DECLARE
 *                          RESOLVES and on the ANY ERROR edge, because
 *                          RULES_US54 row 14 is where this rule set actually
 *                          bites: any error at all gifts the set to the
 *                          opponents.
 *
 * Every transition is labelled `event [guard] / action`, all-caps, <= 14
 * characters. States are 160x80 and square (SITE_SPEC §3.1). The
 * turn loop is a dashed back-edge.
 *
 * Content source: RULES_US54.md rows 9-16 and §3-§5.
 */

import type { Pt } from '../geometry'
import { withLabelMask, type Scene, type SceneArrow, type SceneRect } from '../scene'
import { C } from '../tokens'

const SW = 160
const SH = 80

export interface MachineState {
  id: string
  x: number
  y: number
  w: number
  h: number
  tag: string
  name: string
  sub: string
  focal?: boolean
}

export interface Terminator {
  id: string
  kind: 'start' | 'end'
  cx: number
  cy: number
}

export interface MachineModel {
  scene: Scene
  states: MachineState[]
  terminators: Terminator[]
}

const rectsOf = (states: MachineState[]): SceneRect[] =>
  states.map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h, node: true }))

/* ========================================================================= */
/* 4a — Turn structure                                                        */
/* ========================================================================= */

export function layoutTurnMachine(figNo = 'FIG. 10'): MachineModel {
  const y = 120
  const cy = y + SH / 2

  const states: MachineState[] = [
    { id: 'holder', x: 96, y, w: SW, h: SH, tag: 'TURN', name: 'Turn Holder', sub: 'must ask' },
    { id: 'ask', x: 344, y, w: SW, h: SH, tag: 'ACTION', name: 'Ask Resolves', sub: 'hit or miss' },
    {
      id: 'window',
      x: 592,
      y,
      w: SW,
      h: SH,
      tag: 'PHASE',
      name: 'Declare Window',
      sub: 'see fig. 11',
      focal: true,
    },
    { id: 'clinch', x: 840, y, w: SW, h: SH, tag: 'CHECK', name: 'Clinch Check', sub: '5 sets ends it' },
  ]

  const terminators: Terminator[] = [
    { id: 'start', kind: 'start', cx: 48, cy },
    { id: 'end', kind: 'end', cx: 1072, cy },
  ]

  const line = (x1: number, x2: number): Pt[] => [
    { x: x1, y: cy },
    { x: x2, y: cy },
  ]

  const arrows: SceneArrow[] = [
    { id: 't-start', points: line(56, 96) },
    withLabelMask({ id: 't-ask', points: line(256, 344), label: 'ASK [LEGAL]', labelGap: 8 }),
    withLabelMask({ id: 't-reveal', points: line(504, 592), label: 'REVEAL', labelGap: 8 }),
    withLabelMask({ id: 't-close', points: line(752, 840), label: 'NO DECLARE', labelGap: 8 }),
    withLabelMask({ id: 't-end', points: line(1000, 1064), label: '[5 SETS]', labelGap: 8 }),
    // Hit keeps the turn (RULES_US54 row 9): back-edge routed above.
    withLabelMask({
      id: 't-hit',
      points: [
        { x: 424, y: 120 },
        { x: 424, y: 64 },
        { x: 176, y: 64 },
        { x: 176, y: 120 },
      ],
      label: 'HIT / KEEP',
      labelGap: 8,
    }),
    // Miss passes the turn (row 10): the dashed loop, routed below.
    withLabelMask({
      id: 't-miss',
      points: [
        { x: 920, y: 200 },
        { x: 920, y: 280 },
        { x: 216, y: 280 },
        { x: 216, y: 200 },
      ],
      label: 'MISS / PASS',
      labelGap: 8,
      labelSide: 'below',
      dashed: true,
    }),
  ]

  const legendY = 320
  const scene: Scene = {
    slug: 'turn-machine',
    title: 'Turn structure under the us54 rule set',
    desc:
      'Four states in a left-to-right row: turn holder, ask resolves, declare window, clinch ' +
      'check. A hit returns to the turn holder along a loop above the row, because the asker ' +
      'keeps the turn; a miss returns along a dashed loop below, because the turn passes to the ' +
      'player who was asked. The declare window is highlighted and is expanded in the next ' +
      'figure. Reaching five sets ends the game.',
    viewW: 1120,
    viewH: legendY + 48,
    budget: { nodes: states.length + terminators.length, arrows: arrows.length, accents: 1 },
    rects: rectsOf(states),
    arrows,
    legendY,
    legend: [
      { key: 'state', label: 'STATE', mark: 'swatch', fill: C.sheet, stroke: C.ink },
      { key: 'focal', label: 'EXPANDED IN FIG. 11', mark: 'swatch', fill: C.accentTint, stroke: C.accent },
      { key: 'edge', label: 'TRANSITION', mark: 'line', stroke: C.muted },
      { key: 'loop', label: 'TURN PASSES', mark: 'line', stroke: C.muted, dashed: true },
    ],
    fontSizes: [8, 12],
    fig: `${figNo} — TURN STRUCTURE · 4 STATES · 7 TRANSITIONS`,
    caption:
      'A hit keeps the turn and a miss passes it to the player who was asked (RULES_US54 rows ' +
      '9-10). The declare window opens after every action resolves, and an out-of-turn declare ' +
      'does not move the turn (row 16). Transitions read event [guard] / action.',
  }

  return { scene, states, terminators }
}

/* ========================================================================= */
/* 4b — The declare window and the clinch terminator                          */
/* ========================================================================= */

export function layoutDeclareMachine(figNo = 'FIG. 11'): MachineModel {
  const states: MachineState[] = [
    { id: 'open', x: 96, y: 96, w: SW, h: SH, tag: 'PHASE', name: 'Window Open', sub: 'from holder' },
    { id: 'seat', x: 344, y: 96, w: SW, h: SH, tag: 'OPTION', name: 'Seat Option', sub: 'in seat order' },
    {
      id: 'declare',
      x: 592,
      y: 96,
      w: SW,
      h: SH,
      tag: 'RESOLVE',
      name: 'Declare Resolves',
      sub: 'all six named',
      focal: true,
    },
    { id: 'team', x: 496, y: 256, w: SW, h: SH, tag: 'SCORE', name: 'Our Team +1', sub: 'row 13' },
    { id: 'opp', x: 720, y: 256, w: SW, h: SH, tag: 'SCORE', name: 'Opponents +1', sub: 'row 14' },
    { id: 'clinch', x: 608, y: 416, w: SW, h: SH, tag: 'CHECK', name: 'Clinch Check', sub: 'first to 5' },
  ]

  const terminators: Terminator[] = [
    { id: 'start', kind: 'start', cx: 48, cy: 120 },
    { id: 'end', kind: 'end', cx: 920, cy: 456 },
  ]

  const arrows: SceneArrow[] = [
    {
      id: 'd-start',
      points: [
        { x: 56, y: 120 },
        { x: 96, y: 120 },
      ],
    },
    withLabelMask({
      id: 'd-offer',
      points: [
        { x: 256, y: 136 },
        { x: 344, y: 136 },
      ],
      label: 'OFFER',
      labelGap: 8,
    }),
    // Declining is a move, and six in a row close the window (§3.2).
    withLabelMask({
      id: 'd-decline',
      points: [
        { x: 392, y: 96 },
        { x: 392, y: 48 },
        { x: 456, y: 48 },
        { x: 456, y: 96 },
      ],
      label: 'DECLINE',
      labelGap: 8,
    }),
    withLabelMask({
      id: 'd-declare',
      points: [
        { x: 504, y: 136 },
        { x: 592, y: 136 },
      ],
      label: 'DECLARE',
      labelGap: 8,
    }),
    withLabelMask({
      id: 'd-exact',
      points: [
        { x: 640, y: 176 },
        { x: 640, y: 216 },
        { x: 576, y: 216 },
        { x: 576, y: 256 },
      ],
      label: 'EXACT / +1',
      labelGap: 8,
    }),
    // RULES_US54 row 14: any error at all gifts the set. The one accent edge.
    withLabelMask({
      id: 'd-error',
      points: [
        { x: 704, y: 176 },
        { x: 704, y: 216 },
        { x: 800, y: 216 },
        { x: 800, y: 256 },
      ],
      label: 'ANY ERROR',
      labelGap: 8,
      accent: true,
    }),
    withLabelMask({
      id: 'd-team-clinch',
      points: [
        { x: 576, y: 336 },
        { x: 576, y: 376 },
        { x: 640, y: 376 },
        { x: 640, y: 416 },
      ],
      label: 'SCORED',
      labelGap: 8,
    }),
    withLabelMask({
      id: 'd-opp-clinch',
      points: [
        { x: 800, y: 336 },
        { x: 800, y: 376 },
        { x: 736, y: 376 },
        { x: 736, y: 416 },
      ],
      label: 'GIFTED',
      labelGap: 8,
    }),
    withLabelMask({
      id: 'd-end',
      points: [
        { x: 768, y: 456 },
        { x: 912, y: 456 },
      ],
      label: '[5 SETS]',
      labelGap: 8,
    }),
    // A declare re-opens the window from the top: the reveal is new public
    // information. Routed around the left gutter, never through the stack.
    withLabelMask({
      id: 'd-reopen',
      points: [
        { x: 608, y: 456 },
        { x: 24, y: 456 },
        { x: 24, y: 152 },
        { x: 96, y: 152 },
      ],
      label: 'REOPEN',
      labelGap: 8,
      labelSide: 'right',
      labelMid: { x: 24, y: 304 },
      dashed: true,
    }),
  ]

  const legendY = 520
  const scene: Scene = {
    slug: 'declare-window',
    title: 'The declare window and the clinch terminator',
    desc:
      'The window opens after every action. Each seat in turn order, starting from the turn ' +
      'holder, is offered the option; declining passes it along, and six declines close the ' +
      'window. A declare resolves immediately: exactly right and our team scores the set, any ' +
      'error at all and the opponents score it. Either way a set resolves, the clinch is ' +
      'checked, and the window re-opens from the top until a team reaches five sets.',
    viewW: 1000,
    viewH: legendY + 48,
    budget: { nodes: states.length + terminators.length, arrows: arrows.length, accents: 2 },
    rects: rectsOf(states),
    arrows,
    legendY,
    legend: [
      { key: 'state', label: 'STATE', mark: 'swatch', fill: C.sheet, stroke: C.ink },
      { key: 'focal', label: 'WHERE US54 BINDS', mark: 'swatch', fill: C.accentTint, stroke: C.accent },
      { key: 'gift', label: 'GIFT TO OPPONENTS', mark: 'line', stroke: C.accent },
      { key: 'reopen', label: 'WINDOW RE-OPENS', mark: 'line', stroke: C.muted, dashed: true },
    ],
    fontSizes: [8, 12],
    fig: `${figNo} — DECLARE WINDOW · 6 STATES · 10 TRANSITIONS`,
    caption:
      'RULES_US54 row 14 abolishes the void outcome: a declare that is wrong in ANY way — an ' +
      'opponent held one of the six, or a teammate was named for the wrong card — awards the ' +
      'set to the opponents. That is a two-point swing in a race to five, and it is why the ' +
      'metric here is concedeRate rather than voidRate. Declining is illegal when the turn ' +
      'holder has no legal ask (error MUST_DECLARE), which is what makes a window unable to stall.',
  }

  return { scene, states, terminators }
}
