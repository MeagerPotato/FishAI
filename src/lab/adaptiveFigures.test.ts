/**
 * The `/lab/adaptive` figure gates, run over the REAL committed artifact rather than a
 * fixture — the page draws these exact models, so the geometry gate and the two honesty
 * decisions (the omitted punter cell, the dropped empty checkpoint) are checked against the
 * bytes that ship.
 *
 * Also here: the degeneracy claim itself. The page states that punter's counter-table row
 * weakly dominates every column; that statement is recomputed from `COUNTER_TABLE` — the
 * constant the engine plays from — so the claim cannot outlive the data.
 *
 * Pure modules only — no React, no DOM.
 */

import { describe, expect, it } from 'vitest'
import { COUNTER_TABLE } from '../../lib/engine/index.ts'
import type { AdaptiveResults } from '../../lib/lab/adaptive-types.ts'
import { verifyScene } from '../diagrams/verify'
import { loadAdaptiveArtifact } from './adaptive-artifact.ts'
import { bestResponseColumns, classifierLine, gauntletDumbbell, trim4 } from './adaptiveFigures.ts'

function artifact(): AdaptiveResults {
  const loaded = loadAdaptiveArtifact()
  if (!loaded.ok) throw new Error(`committed adaptive artifact failed to parse: ${loaded.detail}`)
  return loaded.artifact
}

describe('the committed adaptive artifact', () => {
  it('parses at the boundary', () => {
    expect(loadAdaptiveArtifact().ok).toBe(true)
  })
})

describe('the degeneracy claim is recomputed, not asserted', () => {
  it("punter's row weakly dominates every column of the counter table", () => {
    const { styles, p } = COUNTER_TABLE
    const punter = styles.indexOf('punter')
    for (let j = 0; j < styles.length; j++) {
      for (let i = 0; i < styles.length; i++) {
        expect(p[punter][j], `column ${styles[j]}, row ${styles[i]}`).toBeGreaterThanOrEqual(
          p[i][j],
        )
      }
    }
  })

  it('the best-response table answers punter for all nine columns, with positive margins', () => {
    const br = bestResponseColumns()
    expect(br).toHaveLength(9)
    for (const c of br) {
      expect(c.best, `vs ${c.opponent}`).toBe('punter')
      expect(c.margin).toBeGreaterThan(0)
      expect(c.runnerUp).not.toBe('punter')
    }
  })
})

describe('the gauntlet dumbbell', () => {
  const model = gauntletDumbbell(artifact())

  it('passes the geometry gate', () => {
    expect(verifyScene(model.scene)).toEqual([])
  })

  it('shows 8 of 9 cells, omitting the identity-benchmark punter cell, and says so', () => {
    expect(model.rows).toHaveLength(8)
    expect(model.rows.some((r) => r.key === 'punter')).toBe(false)
    expect(model.scene.caption).toMatch(/punter\s*cell is omitted/i)
    expect(model.scene.caption.toLowerCase()).toMatch(/sorted by/)
  })

  it('is zero-anchored — the axis-honesty rule for near-coincident pairs', () => {
    expect(model.domain.floor).toBe(0)
  })

  it('puts the adaptive dot below the benchmark in every row shown', () => {
    for (const row of model.rows) {
      expect(row.focalValue, row.key).toBeLessThan(row.refValue)
    }
  })
})

describe('the classifier accuracy line', () => {
  const model = classifierLine(artifact())

  it('passes the geometry gate', () => {
    expect(verifyScene(model.scene)).toEqual([])
  })

  it('drops the zero-seat 250-event checkpoint instead of plotting it as zero', () => {
    expect(model.xLabels.map((l) => l.label)).toEqual(['40', '80', '150', 'END'])
    expect(model.scene.caption).toMatch(/250-event checkpoint recorded zero seats/i)
  })

  it('plots a flat chance series at one ninth, never as the focal series', () => {
    const chance = model.series.find((s) => s.key === 'chance')
    expect(chance).toBeDefined()
    expect(chance?.focal).toBe(false)
    const ys = new Set(chance?.points.map((p) => p.y))
    expect(ys.size).toBe(1)
  })

  it('discloses the survivorship of the 150-event checkpoint', () => {
    expect(model.scene.caption).toMatch(/672 of 10,800/)
  })
})

describe('trim4', () => {
  it('trims trailing zeros without inventing precision', () => {
    expect(trim4(0.5114)).toBe('.5114')
    expect(trim4(0.25)).toBe('.25')
    expect(trim4(1)).toBe('1')
    expect(trim4(0)).toBe('0')
  })
})
