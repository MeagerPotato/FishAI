/**
 * report.ts — the console rendering of a run.
 *
 * Deliberately *only* rendering plus the two trivially-derived rankings (mean score, maximin).
 * The real BOT_LAB.md §4.4 analysis — Hodge/Schur cyclic energy, Bradley-Terry, Nash averaging,
 * alpha-Rank, BH correction — is phase S3 and reads the emitted JSON; computing a ranking here
 * would invite reading it as the answer. §4.4 is explicit that a mean-score table is *"naive
 * ranking — only valid if transitive"*, so it is printed with that caveat attached and no
 * verdict is claimed.
 */
import type { StyleId } from '../engine/index.ts'
import type { LabCellAggregate, LabRunOutput } from './types.ts'

function pad(s: string | number, w: number, right = false): string {
  const t = String(s)
  return right ? t.padEnd(w) : t.padStart(w)
}

function f(n: number, d = 3): string {
  return Number.isFinite(n) ? n.toFixed(d) : '-'
}

/**
 * The payoff matrix `P[i][j]` of BOT_LAB.md §4.4: the duplicate-averaged score rate of style *i*
 * against style *j*. Antisymmetric by construction — `P[i][j] + P[j][i] == 1` — because every
 * game contributes `aResult` to one side and `1 - aResult` to the other. The diagonal is not
 * measured (no mirror cells; see `plan.ts`) and renders as `-`.
 */
export function payoffMatrix(
  styles: readonly StyleId[],
  cells: readonly LabCellAggregate[],
): (number | null)[][] {
  const idx = new Map<StyleId, number>()
  styles.forEach((s, i) => idx.set(s, i))
  const p: (number | null)[][] = styles.map(() => styles.map(() => null))
  for (const c of cells) {
    const i = idx.get(c.a)
    const j = idx.get(c.b)
    if (i === undefined || j === undefined) continue
    p[i][j] = c.aScore
    p[j][i] = 1 - c.aScore
  }
  return p
}

export interface StyleSummary {
  style: StyleId
  meanScore: number
  maximin: number
  worstVs: StyleId | null
}

/** Mean score and maximin over the measured (off-diagonal) row. */
export function styleSummaries(styles: readonly StyleId[], cells: readonly LabCellAggregate[]): StyleSummary[] {
  const p = payoffMatrix(styles, cells)
  return styles.map((style, i) => {
    let sum = 0
    let n = 0
    let worst = Number.POSITIVE_INFINITY
    let worstVs: StyleId | null = null
    for (let j = 0; j < styles.length; j++) {
      const v = p[i][j]
      if (v === null) continue
      sum += v
      n++
      if (v < worst) {
        worst = v
        worstVs = styles[j]
      }
    }
    return {
      style,
      meanScore: n === 0 ? 0 : sum / n,
      maximin: worstVs === null ? 0 : worst,
      worstVs,
    }
  })
}

function renderMatrix(out: LabRunOutput): string[] {
  const styles = out.meta.config.styles
  const p = payoffMatrix(styles, out.cells)
  const w = 10
  const lines: string[] = []
  lines.push(`${pad('P[row][col]', 12, true)}${styles.map((s) => pad(s.slice(0, 9), w)).join('')}`)
  lines.push('-'.repeat(12 + w * styles.length))
  styles.forEach((s, i) => {
    const row = styles.map((_, j) => pad(p[i][j] === null ? '-' : f(p[i][j] as number), w)).join('')
    lines.push(`${pad(s, 12, true)}${row}`)
  })
  return lines
}

function renderRanking(out: LabRunOutput): string[] {
  const rows = styleSummaries(out.meta.config.styles, out.cells).sort((a, b) => b.meanScore - a.meanScore)
  const lines: string[] = []
  lines.push(
    `${pad('style', 12, true)}${pad('meanScore', 11)}${pad('maximin', 10)}${pad('  worst vs', 12, true)}`,
  )
  lines.push('-'.repeat(45))
  for (const r of rows) {
    lines.push(
      `${pad(r.style, 12, true)}${pad(f(r.meanScore, 4), 11)}${pad(f(r.maximin, 4), 10)}  ${pad(r.worstVs ?? '-', 10, true)}`,
    )
  }
  return lines
}

function renderCells(out: LabRunOutput): string[] {
  const lines: string[] = []
  const header =
    `${pad('cell', 22, true)}${pad('pairs', 7)}${pad('aScore', 9)}${pad('se', 8)}${pad('ci95lo', 9)}` +
    `${pad('ci95hi', 9)}${pad('varRatio', 10)}${pad('  A-B', 10, true)}${pad('margin', 9)}${pad('avgMoves', 10)}` +
    `${pad('maxMoves', 10)}`
  lines.push(header)
  lines.push('-'.repeat(header.length))
  for (const c of out.cells) {
    lines.push(
      `${pad(c.id, 22, true)}${pad(c.pairs, 7)}${pad(f(c.aScore, 4), 9)}${pad(f(c.se, 4), 8)}` +
        `${pad(f(c.ci95[0], 4), 9)}${pad(f(c.ci95[1], 4), 9)}${pad(f(c.varianceRatio, 2), 10)}` +
        `  ${pad(`${c.aWins}-${c.bWins}`, 8, true)}${pad(f(c.setMargin, 2), 9)}${pad(f(c.avgMoves, 1), 10)}` +
        `${pad(c.maxMoves, 10)}`,
    )
  }
  return lines
}

/** Per-style diagnostics, pooled over every cell the style appears in (BOT_LAB.md §4.2). */
function renderDiagnostics(out: LabRunOutput): string[] {
  const styles = out.meta.config.styles
  const acc = new Map<StyleId, { n: number; m: Record<string, number> }>()
  const keys = [
    'askHitRate',
    'turnRetention',
    'claimPrecision',
    'concedeRate',
    'concedeRateChosen',
    'foreignDeclareRate',
    'foreignDeclareRateChosen',
    'declareLatency',
    'raceLossesPerGame',
    'clinchDenialsPerGame',
    'leakIndex',
    'hoardIndex',
    'declaresPerGame',
    'forcedDeclareRate',
    'giftsPerGame',
    'dropoutRate',
  ] as const
  for (const s of styles) acc.set(s, { n: 0, m: Object.fromEntries(keys.map((k) => [k, 0])) })
  for (const c of out.cells) {
    for (const [style, m] of [
      [c.a, c.metrics.a],
      [c.b, c.metrics.b],
    ] as const) {
      const slot = acc.get(style)
      if (!slot) continue
      slot.n++
      for (const k of keys) slot.m[k] += m[k]
    }
  }
  const lines: string[] = []
  const header =
    `${pad('style', 11, true)}${pad('hitRate', 9)}${pad('turnRet', 9)}${pad('precis', 8)}${pad('concede', 9)}` +
    `${pad('concCh', 8)}${pad('foreign', 9)}${pad('forgnCh', 9)}${pad('latency', 9)}${pad('race/g', 8)}` +
    `${pad('deny/g', 8)}${pad('leak', 7)}${pad('hoard', 7)}${pad('decl/g', 8)}${pad('forced', 8)}` +
    `${pad('gift/g', 8)}${pad('dropout', 9)}`
  lines.push(header)
  lines.push('-'.repeat(header.length))
  for (const s of styles) {
    const slot = acc.get(s)
    if (!slot || slot.n === 0) continue
    const v = (k: (typeof keys)[number], d = 3): string => f(slot.m[k] / slot.n, d)
    lines.push(
      `${pad(s, 11, true)}${pad(v('askHitRate'), 9)}${pad(v('turnRetention', 2), 9)}${pad(v('claimPrecision'), 8)}` +
        `${pad(v('concedeRate'), 9)}${pad(v('concedeRateChosen'), 8)}${pad(v('foreignDeclareRate'), 9)}` +
        `${pad(v('foreignDeclareRateChosen'), 9)}${pad(v('declareLatency', 2), 9)}${pad(v('raceLossesPerGame'), 8)}` +
        `${pad(v('clinchDenialsPerGame'), 8)}${pad(v('leakIndex'), 7)}${pad(v('hoardIndex', 2), 7)}` +
        `${pad(v('declaresPerGame', 2), 8)}${pad(v('forcedDeclareRate'), 8)}${pad(v('giftsPerGame', 2), 8)}` +
        `${pad(v('dropoutRate'), 9)}`,
    )
  }
  return lines
}

/** The health block. Capped games are named individually — RULES_US54.md §3.2. */
export function renderHealth(out: LabRunOutput): string[] {
  const h = out.health
  const lines: string[] = []
  lines.push(
    `health: illegalActions=${h.illegalActions} cappedGames=${h.cappedGames} ` +
      `invariantViolations=${h.invariantViolations} ties=${h.ties} voids=${h.voids} ` +
      `nonClinch=${h.nonClinch} distinctSeeds=${h.distinctSeeds}/${h.expectedSeeds}`,
  )
  if (h.capped.length > 0) {
    lines.push('')
    lines.push(`!!! ${h.capped.length} GAME(S) HIT THE ${out.meta.config.stepCap}-STEP CAP — REPORTED, NOT DISCARDED:`)
    for (const g of h.capped.slice(0, 50)) {
      lines.push(`      ${g.cell} seed=${g.seed} orient=${g.orient} startSeat=${g.startSeat} steps=${g.steps}`)
    }
    if (h.capped.length > 50) lines.push(`      ... and ${h.capped.length - 50} more (see the JSON)`)
  }
  if (!h.ok) {
    lines.push('')
    lines.push('*** RUN VOID — BOT_LAB.md §4.3 health gate failed. Do not publish these numbers. ***')
    for (const v of h.violations) lines.push(`      - ${v}`)
  }
  return lines
}

/** The whole console report. */
export function renderRun(out: LabRunOutput): string {
  const m = out.meta
  const lines: string[] = []
  lines.push(
    `Canadian Fish style lab — ${m.config.variant}, ${m.cells} cells x ${m.config.pairs} duplicate pairs ` +
      `= ${m.gamesTotal} games`,
  )
  lines.push(
    `seeds ${m.config.seedPrefix}-000000..${String(m.config.pairs - 1).padStart(6, '0')} (shared by every cell) · ` +
      `startSeat = pair mod 6 · invariants ${m.config.invariantCheck} · stepCap ${m.config.stepCap}`,
  )
  lines.push(
    `workers ${m.workers} · wall ${(m.wallMs / 1000).toFixed(1)}s · ` +
      `${m.gamesPerSecond.toFixed(1)} games/s · ${Math.round(m.movesPerSecond).toLocaleString('en-US')} moves/s · ` +
      `${m.movesTotal.toLocaleString('en-US')} reduce steps`,
  )
  lines.push(`recordsDigest ${m.recordsDigest} (reproducible from the seed set alone)`)
  lines.push('')
  lines.push(...renderHealth(out))
  lines.push('')
  lines.push('PAYOFF MATRIX — duplicate-averaged score rate of ROW vs COLUMN (BOT_LAB.md §4.4)')
  lines.push(...renderMatrix(out))
  lines.push('')
  lines.push('NAIVE RANKING — BOT_LAB.md §4.4: valid only if the matrix is transitive.')
  lines.push('Cyclic energy, Nash averaging and alpha-Rank are phase S3 and read the emitted JSON.')
  lines.push(...renderRanking(out))
  lines.push('')
  lines.push('CELLS')
  lines.push(...renderCells(out))
  lines.push('')
  lines.push('DIAGNOSTICS — per style, pooled over every cell it appears in (BOT_LAB.md §4.2 + STYLES.md §4)')
  lines.push(...renderDiagnostics(out))
  return lines.join('\n')
}
