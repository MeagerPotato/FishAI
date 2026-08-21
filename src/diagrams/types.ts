/**
 * The results contract the diagrams read.
 *
 * Shape from BOT_LAB.md §7.1, with SITE_SPEC.md §5's two `us54` deltas
 * applied:
 *
 *   - `voidRate` is REPLACED by `concedeRate`. Not a rename: the void
 *     outcome is abolished (RULES_US54.md row 14) and the metric now counts
 *     gifts to the opponents. Pre-/post-decision matrices are not comparable,
 *     so the old key does not exist here at all.
 *   - `ties` is retained but is always 0 — arithmetically impossible under
 *     `us54` (RULES_US54.md §5). `assertUs54` asserts it rather than letting
 *     a diagram render a column that can never populate.
 */

export type StyleFamily =
  | 'control'
  | 'aggressive'
  | 'conservative'
  | 'passive'
  | 'information'
  | 'optionality'

export type Verdict = 'dominant' | 'cyclic' | 'inconclusive'

export interface StyleDef {
  id: string
  label: string
  family: StyleFamily
  thesis: string
  rationale?: string
}

export interface SeatMetrics {
  askHitRate: number
  claimPrecision: number
  claimYield: number
  /** us54: gifts to the opponents. Replaces the abolished `voidRate`. */
  concedeRate: number
  leakIndex: number
  hoardIndex: number
  turnRetention: number
  avgMoves: number
  /** us54, new: declares for sets the declarer held no card of. */
  foreignDeclareRate: number
  /** us54, new: window-cycles between provable and declared. */
  declareLatency: number
}

export interface MatrixCell {
  a: string
  b: string
  pairs: number
  games: number
  /** Score rate for `a`. 0.5 = even. */
  aScore: number
  se: number
  ci95: [number, number]
  aWins: number
  bWins: number
  /** Always 0 under us54. */
  ties: 0
  bookMargin: number
  significant: boolean
  /** Benjamini-Hochberg adjusted. */
  qValue: number
  metrics: { a: SeatMetrics; b: SeatMetrics }
}

export interface Cycle {
  styles: string[]
  minEdge: number
}

export interface Ranking {
  meanScore: Array<{ style: string; value: number; ci95: [number, number] }>
  maximin: Array<{ style: string; value: number; worstVs: string }>
  cyclicEnergy: number
  cycles: Cycle[]
  verdict: Verdict
}

export interface ResultsMeta {
  schemaVersion: 1
  generatedAt: string
  engineCommit: string
  rulesHash: string
  gamesTotal: number
  seedSet: { count: number; prefix: string }
  ruleSet: 'us54'
}

export interface StyleResults {
  meta: ResultsMeta
  styles: StyleDef[]
  matrix: MatrixCell[]
  ranking: Ranking
}

/* ------------------------------------------------------------------------ */

/** The us54 assertions SITE_SPEC.md §5 requires the site to make, not assume. */
export function assertUs54(r: StyleResults): void {
  if (r.meta.ruleSet !== 'us54') {
    throw new Error(`expected rule set us54, got "${r.meta.ruleSet}"`)
  }
  for (const cell of r.matrix) {
    if (cell.ties !== 0) {
      throw new Error(
        `${cell.a} vs ${cell.b}: ties=${cell.ties}. ` +
          'Ties are arithmetically impossible under us54 (RULES_US54.md §5).',
      )
    }
  }
}

/** Index the matrix for O(1) cell lookup in either orientation. */
export function cellIndex(matrix: readonly MatrixCell[]): Map<string, MatrixCell> {
  const m = new Map<string, MatrixCell>()
  for (const c of matrix) m.set(`${c.a}|${c.b}`, c)
  return m
}

/** Score rate for `a` against `b`, reading the mirror when needed. */
export function scoreOf(
  index: Map<string, MatrixCell>,
  a: string,
  b: string,
): { score: number; cell: MatrixCell } | undefined {
  const direct = index.get(`${a}|${b}`)
  if (direct) return { score: direct.aScore, cell: direct }
  const mirror = index.get(`${b}|${a}`)
  if (mirror) return { score: 1 - mirror.aScore, cell: mirror }
  return undefined
}
