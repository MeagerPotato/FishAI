/**
 * The diagram system.
 *
 * cathrynlavery/diagram-design v2.6 GRAMMAR — geometry formulas, the six
 * connector rules, the complexity budget, the accessible-SVG contract, the
 * 4px grid, one-accent discipline — re-skinned onto pleurat.com's warm-paper
 * palette and its one-family (General Sans) typography, where the
 * serif/sans/mono roles are carried by weight and letter-spacing instead of
 * by three families.
 *
 * See `skin.css` for the token mapping and the two accessibility-forced
 * deviations, and `verify.ts` for the gate that keeps the geometry honest.
 */

import './skin.css'

/* -- the five diagrams, plus the deck ------------------------------------ */
export { PayoffMatrix } from './PayoffMatrix'
export { CounterGraph } from './CounterGraph'
export { AnalysisPipeline } from './AnalysisPipeline'
export { TurnMachine, DeclareWindowMachine } from './StateMachines'
export { BarChart } from './charts/BarChart'
export { LineChart } from './charts/LineChart'
export { DumbbellChart } from './charts/DumbbellChart'
export { DeckAssembly } from './DeckAssembly'

/* -- layout (pure; safe to import from a Node test) ---------------------- */
export { layoutPayoffMatrix } from './layout/payoffMatrix'
export type { PayoffInput, PayoffModel, CellLevel } from './layout/payoffMatrix'
export { layoutCounterGraph } from './layout/counterGraph'
export type { CounterInput, CounterModel } from './layout/counterGraph'
export { layoutPipeline } from './layout/pipeline'
export type { PipelineModel } from './layout/pipeline'
export { layoutTurnMachine, layoutDeclareMachine } from './layout/stateMachines'
export type { MachineModel } from './layout/stateMachines'
export {
  layoutBar,
  layoutLine,
  layoutDumbbell,
  concedeRateBar,
  degradationLine,
  claimPrecisionDumbbell,
  meanMetric,
  PLOT,
} from './layout/charts'
export type { BarModel, LineModel, DumbbellModel } from './layout/charts'
export { layoutDeck } from './layout/deck'
export type { DeckModel } from './layout/deck'

/* -- primitives ---------------------------------------------------------- */
export { DiagramFrame, DiagramSvg, Label, LegendStrip, Markers } from './Frame'
export { NodeBox, Connector, StartDot, EndDot, TREATMENT } from './primitives'
export type { NodeKind } from './primitives'

/* -- contract, tokens, geometry, gate ------------------------------------ */
export { C, T, STROKE, RADIUS, FONT_SIZES } from './tokens'
export * from './geometry'
export { BUDGET, withLabelMask } from './scene'
export type { Scene, SceneArrow, SceneRect, LegendItem } from './scene'
export { verifyScene, assertScene } from './verify'
export * from './types'
export { FIXTURES, FIXTURE_CYCLIC, FIXTURE_DOMINANT, FIXTURE_NOTICE, STYLE_DEFS } from './fixture'
