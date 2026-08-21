/**
 * The committed fixture.
 *
 * SITE_SPEC.md §5 ("Build order") requires a fixture that satisfies the
 * schema and covers BOTH verdict paths, so the cyclic and dominant renderers
 * are both exercised before any real simulator output exists.
 *
 * The numbers here are SYNTHETIC and every consumer must say so. They are
 * generated deterministically (seeded PRNG, no Math.random) so two builds
 * produce byte-identical output and a diff means someone changed the model,
 * not the weather.
 *
 * Roster: the 9 styles of STYLES.md §3 — nine is deliberate, it is exactly
 * the counter-graph node budget.
 */

import type { MatrixCell, SeatMetrics, StyleDef, StyleResults } from './types'

export const STYLE_DEFS: StyleDef[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    family: 'control',
    thesis: 'The tuned us54 baseline every other style is read against',
    rationale: 'STYLES.md §3 row 1 — the control, clinchAggression 0.5',
  },
  {
    id: 'blitz',
    label: 'Blitz',
    family: 'aggressive',
    thesis: 'Tempo and sets now; information is cheap',
    rationale: 'RULES_US54 row 9 — a hit keeps the turn, so tempo compounds',
  },
  {
    id: 'punter',
    label: 'Punter',
    family: 'aggressive',
    thesis: 'Chase the completing card; accept the gift risk',
    rationale: 'RULES_US54 row 14 — a wrong declare gifts the set, a 2-point swing',
  },
  {
    id: 'banker',
    label: 'Banker',
    family: 'conservative',
    thesis: 'Never gift a set; bank only certainties',
    rationale: 'RULES_US54 row 14 — the gift is the whole cost model',
  },
  {
    id: 'turtle',
    label: 'Turtle',
    family: 'passive',
    thesis: 'Minimum risk; declare only sets wholly in hand',
    rationale: 'STYLES.md §3.1 — the stall risk, gated by avgMoves',
  },
  {
    id: 'hoarder',
    label: 'Hoarder',
    family: 'optionality',
    thesis: 'Keep ask-licences, stay alive, delay',
    rationale: 'RULES_US54 row 6 — holding a card is the licence to ask into that set',
  },
  {
    id: 'scout',
    label: 'Scout',
    family: 'information',
    thesis: 'Deduce first, collect later',
    rationale: 'RULES_US54 row 17 — the public log is the whole information channel',
  },
  {
    id: 'ghost',
    label: 'Ghost',
    family: 'information',
    thesis: 'Deny opponents the read',
    rationale: 'RULES_US54 row 17 — every ask leaks; Ghost prices the leak',
  },
  {
    id: 'archivist',
    label: 'Archivist',
    family: 'information',
    thesis: 'Track sets you hold nothing in, and declare them for teammates',
    rationale: 'RULES_US54 row 15 — declaring without holding is legal and now live',
  },
]

/* ------------------------------------------------------------------------ */
/* Deterministic generation                                                   */
/* ------------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const r4 = (v: number): number => Math.round(v * 10000) / 10000
const r2 = (v: number): number => Math.round(v * 100) / 100

function metricsFor(styleId: string, aggression: number): SeatMetrics {
  const rnd = mulberry32(hash(styleId))
  const j = (spread: number) => (rnd() - 0.5) * spread
  return {
    askHitRate: r2(0.36 + aggression * 0.1 + j(0.04)),
    claimPrecision: r2(0.94 - aggression * 0.18 + j(0.03)),
    claimYield: r2(0.58 + aggression * 0.2 + j(0.05)),
    concedeRate: r2(0.04 + aggression * 0.16 + j(0.02)),
    leakIndex: r2(0.18 + aggression * 0.14 + j(0.04)),
    hoardIndex: r2(4.2 - aggression * 2.4 + j(0.5)),
    turnRetention: r2(1.5 + aggression * 0.5 + j(0.2)),
    avgMoves: Math.round(96 + (1 - aggression) * 44 + j(12)),
    foreignDeclareRate: r2(Math.max(0, (styleId === 'archivist' ? 0.31 : 0.03) + j(0.02))),
    declareLatency: r2(1.2 + (1 - aggression) * 2.6 + j(0.4)),
  }
}

/** How aggressive each style is, 0..1 — drives the metric block only. */
const AGGRESSION: Record<string, number> = {
  balanced: 0.5,
  blitz: 0.95,
  punter: 0.85,
  banker: 0.2,
  turtle: 0.05,
  hoarder: 0.15,
  scout: 0.4,
  ghost: 0.45,
  archivist: 0.6,
}

const PAIRS = 2600
const GAMES = PAIRS * 2
const SE = 0.0049

interface Model {
  /** Latent strength per style; the score rate is a function of the gap. */
  strength: Record<string, number>
  /** Explicit overrides that install the intransitive edges, if any. */
  override: Record<string, number>
  cycles: Array<{ styles: string[]; minEdge: number }>
  cyclicEnergy: number
  verdict: 'dominant' | 'cyclic'
}

function buildMatrix(model: Model): MatrixCell[] {
  const cells: MatrixCell[] = []
  const ids = STYLE_DEFS.map((s) => s.id)

  for (let i = 0; i < ids.length; i++) {
    for (let k = i + 1; k < ids.length; k++) {
      const a = ids[i]
      const b = ids[k]
      const key = `${a}>${b}`
      const mirror = `${b}>${a}`

      let score: number
      if (model.override[key] !== undefined) {
        score = model.override[key]
      } else if (model.override[mirror] !== undefined) {
        score = 1 - model.override[mirror]
      } else {
        const gap = model.strength[a] - model.strength[b]
        score = 0.5 + Math.max(-0.16, Math.min(0.16, gap * 0.42))
      }
      score = r4(score)

      const edge = Math.abs(score - 0.5)
      const significant = edge > 1.96 * SE
      const z = edge / SE
      const qValue = r4(Math.max(0.0001, Math.min(0.9, 2 * Math.exp(-0.72 * z))))
      const aWins = Math.round(GAMES * score)

      cells.push({
        a,
        b,
        pairs: PAIRS,
        games: GAMES,
        aScore: score,
        se: SE,
        ci95: [r4(score - 1.96 * SE), r4(score + 1.96 * SE)],
        aWins,
        bWins: GAMES - aWins,
        ties: 0,
        bookMargin: r2((score - 0.5) * 6),
        significant,
        qValue,
        metrics: {
          a: metricsFor(a, AGGRESSION[a]),
          b: metricsFor(b, AGGRESSION[b]),
        },
      })
    }
  }
  return cells
}

function rankingOf(model: Model, matrix: MatrixCell[]): StyleResults['ranking'] {
  const ids = STYLE_DEFS.map((s) => s.id)
  const totals = new Map<string, number[]>(ids.map((id) => [id, []]))

  for (const c of matrix) {
    totals.get(c.a)?.push(c.aScore)
    totals.get(c.b)?.push(1 - c.aScore)
  }

  const meanScore = ids
    .map((id) => {
      const xs = totals.get(id) ?? []
      const value = r4(xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length))
      const half = r4(1.96 * (SE / Math.sqrt(Math.max(1, xs.length))))
      return { style: id, value, ci95: [r4(value - half), r4(value + half)] as [number, number] }
    })
    .sort((p, q) => q.value - p.value)

  const maximin = ids
    .map((id) => {
      const xs = totals.get(id) ?? []
      const opponents = ids.filter((o) => o !== id)
      let worst = 1
      let worstVs = opponents[0]
      xs.forEach((v, i) => {
        if (v < worst) {
          worst = v
          worstVs = opponents[i]
        }
      })
      return { style: id, value: r4(worst), worstVs }
    })
    .sort((p, q) => q.value - p.value)

  return {
    meanScore,
    maximin,
    cyclicEnergy: model.cyclicEnergy,
    cycles: model.cycles,
    verdict: model.verdict,
  }
}

function resultsFor(model: Model, tag: string): StyleResults {
  const matrix = buildMatrix(model)
  return {
    meta: {
      schemaVersion: 1,
      generatedAt: '2026-08-21T00:00:00.000Z',
      engineCommit: `fixture-${tag}`,
      rulesHash: '4f2ad0c1b9e37a58',
      gamesTotal: matrix.length * GAMES,
      seedSet: { count: PAIRS, prefix: `style-v1-${tag}` },
      ruleSet: 'us54',
    },
    styles: STYLE_DEFS,
    matrix,
    ranking: rankingOf(model, matrix),
  }
}

/* ------------------------------------------------------------------------ */
/* Case 1 — CYCLIC. The headline is the counter-graph.                        */
/*                                                                            */
/* Blitz > Banker  — tempo punishes a bot that waits for certainty            */
/* Banker > Hoarder — banked sets beat delayed ones in a race to 5            */
/* Hoarder > Blitz — holding ask-licences starves Blitz of legal asks         */
/* ------------------------------------------------------------------------ */

const CYCLIC_MODEL: Model = {
  strength: {
    balanced: 0.24,
    blitz: 0.16,
    punter: -0.12,
    banker: 0.12,
    turtle: -0.34,
    hoarder: 0.08,
    scout: 0.1,
    ghost: -0.04,
    archivist: -0.02,
  },
  override: {
    'blitz>banker': 0.546,
    'banker>hoarder': 0.538,
    'hoarder>blitz': 0.532,
  },
  cycles: [
    { styles: ['blitz', 'banker', 'hoarder'], minEdge: 0.532 },
    { styles: ['punter', 'ghost', 'archivist'], minEdge: 0.514 },
  ],
  cyclicEnergy: 0.07,
  verdict: 'cyclic',
}

/* ------------------------------------------------------------------------ */
/* Case 2 — DOMINANT. Strengths are monotone; no back-edge exists, so the     */
/* counter-graph spends its accent on the dominant node instead.              */
/* ------------------------------------------------------------------------ */

const DOMINANT_MODEL: Model = {
  strength: {
    balanced: 0.38,
    scout: 0.22,
    blitz: 0.14,
    banker: 0.06,
    archivist: -0.02,
    ghost: -0.1,
    hoarder: -0.18,
    punter: -0.26,
    turtle: -0.36,
  },
  override: {},
  cycles: [],
  cyclicEnergy: 0.004,
  verdict: 'dominant',
}

/** Verdict `cyclic` — exercises the highlighted-cycle render path. */
export const FIXTURE_CYCLIC: StyleResults = resultsFor(CYCLIC_MODEL, 'cyclic')

/** Verdict `dominant` — exercises the no-cycle render path. */
export const FIXTURE_DOMINANT: StyleResults = resultsFor(DOMINANT_MODEL, 'dominant')

/** Both cases, for tests and for the site's fixture switch. */
export const FIXTURES = {
  cyclic: FIXTURE_CYCLIC,
  dominant: FIXTURE_DOMINANT,
} as const

/** Stamped on every figure so a synthetic run can never be mistaken for real. */
export const FIXTURE_NOTICE = 'SYNTHETIC FIXTURE · NOT SIMULATION OUTPUT'
