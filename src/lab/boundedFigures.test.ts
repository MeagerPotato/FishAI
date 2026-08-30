/**
 * The `/lab/bounded` figure gates, run over the REAL committed artifact rather than a
 * fixture — the page draws these exact models, so the geometry gate and the three honesty
 * decisions (the index x-axis, the dropped thin bands, the two-design accuracy frame) are
 * checked against the bytes that ship.
 *
 * Also here: the page's recomputed claims. `/lab/bounded` states that exactly one P7 rung
 * violates and survives its Bonferroni correction, that the E4 ∞ cell reproduces the committed
 * v1.0 anchor exactly, that the easy tier prices below the 0-bit floor, and that the
 * cross-design block's derived numbers are actually derived — each is re-checked from the
 * artifact here so the prose cannot outlive the data.
 *
 * Pure modules only — no React, no DOM.
 */

import { describe, expect, it } from 'vitest'
import { BOUNDED_INF_BITS } from '../../lib/lab/bounded-types.ts'
import type { BoundedResults } from '../../lib/lab/bounded-types.ts'
import { verifyScene } from '../diagrams/verify'
import { loadBoundedArtifact } from './bounded-artifact.ts'
import {
  EVIDENCE_FIGURE_BANDS,
  EVIDENCE_FIGURE_POLICIES,
  accuracyLine,
  bandLabel,
  bitsLabel,
  evidenceLine,
  gridMoveSpread,
  ladderLine,
} from './boundedFigures.ts'

function artifact(): BoundedResults {
  const loaded = loadBoundedArtifact()
  if (!loaded.ok) throw new Error(`committed bounded artifact failed to parse: ${loaded.detail}`)
  return loaded.artifact
}

describe('the committed bounded artifact', () => {
  it('parses at the boundary', () => {
    expect(loadBoundedArtifact().ok).toBe(true)
  })
})

describe('the ladder line', () => {
  const model = ladderLine(artifact())

  it('passes the geometry gate', () => {
    expect(verifyScene(model.scene)).toEqual([])
  })

  it('is zero-anchored and labels the whole registered grid, ∞ last', () => {
    expect(model.domain.floor).toBe(0)
    expect(model.xLabels.map((l) => l.label)).toEqual([
      '0',
      '8',
      '16',
      '24',
      '32',
      '48',
      '64',
      '96',
      '128',
      '∞',
    ])
  })

  it('discloses the index axis — the rungs are NOT drawn linear in bits', () => {
    expect(model.scene.caption).toMatch(/rung index, not a bits scale/i)
    expect(model.scene.caption.toLowerCase()).toMatch(/sorted by/)
  })

  it('plots a non-decreasing focal series, as P1 measured', () => {
    const bounded = model.series.find((s) => s.key === 'bounded')
    expect(bounded?.focal).toBe(true)
    const a = artifact()
    for (let i = 1; i < a.ladder.length; i++) {
      expect(a.ladder[i].share, `rung ${bitsLabel(a.ladder[i].bits)}`).toBeGreaterThanOrEqual(
        a.ladder[i - 1].share,
      )
    }
  })
})

describe('the evidence-age line', () => {
  const a = artifact()
  const model = evidenceLine(a)

  it('passes the geometry gate', () => {
    expect(verifyScene(model.scene)).toEqual([])
  })

  it('draws exactly the four named curves over the artifact’s own bands', () => {
    expect(model.series.map((s) => s.key)).toEqual([...EVIDENCE_FIGURE_POLICIES])
    const reference = a.evidence.find((c) => c.policy === 'reference')
    expect(reference).toBeDefined()
    expect(model.xLabels.map((l) => l.label)).toEqual(
      (reference?.rows ?? []).slice(0, EVIDENCE_FIGURE_BANDS).map((r) => bandLabel(r.lo, r.hi)),
    )
  })

  it('drops the thin 97+ bands and says so in the caption', () => {
    expect(model.xLabels).toHaveLength(EVIDENCE_FIGURE_BANDS)
    expect(model.xLabels.at(-1)?.label).toBe('65–96')
    expect(model.scene.caption).toMatch(/past age 96 are omitted/i)
  })

  it('shows the noise tier’s cliff: high through age 6, collapsed just past it', () => {
    const easy = a.evidence.find((c) => c.policy === 'tier-easy')
    expect(easy).toBeDefined()
    const inWindow = easy?.rows[2] // ages 5–6, the last band inside the 6-event window
    const outside = easy?.rows[3] // ages 7–8, the first band past the edge
    expect(inWindow?.exploitRate ?? 0).toBeGreaterThan(0.4)
    expect(outside?.exploitRate ?? 1).toBeLessThan(0.05)
  })
})

describe('the two-design accuracy line', () => {
  const model = accuracyLine(artifact())

  it('passes the geometry gate', () => {
    expect(verifyScene(model.scene)).toEqual([])
  })

  it('plots a flat chance series at one ninth, never as the focal series', () => {
    const chance = model.series.find((s) => s.key === 'chance')
    expect(chance).toBeDefined()
    expect(chance?.focal).toBe(false)
    const ys = new Set(chance?.points.map((p) => p.y))
    expect(ys.size).toBe(1)
  })

  it('labels both designs and the budget grid, ∞ last', () => {
    expect(model.xLabels.map((l) => l.label)).toEqual(['16', '32', '64', '∞'])
    expect(model.scene.caption).toMatch(/BOTH teams/)
    expect(model.scene.caption).toMatch(/only the read seat/i)
  })
})

describe('the page’s recomputed claims hold against the artifact', () => {
  const a = artifact()

  it('exactly one P7 rung violates — 64→∞, negative — and survives Bonferroni ×3', () => {
    const violated = a.accuracy.deltas.filter((d) => !d.pass)
    expect(violated).toHaveLength(1)
    expect(violated[0].fromBits).toBe(64)
    expect(violated[0].toBits).toBe(BOUNDED_INF_BITS)
    expect(violated[0].delta).toBeLessThan(0)

    const family = a.multiplicity.find((f) => f.id === 'P7')
    const rung = family?.rungs.find((r) => r.violatesRaw)
    expect(rung?.fromBits).toBe(64)
    expect(rung?.violatesBonferroni).toBe(true)
    expect(rung?.pBonferroni ?? 1).toBeLessThan(family?.alpha ?? 0.05)
  })

  it('the P8 run of record violates no rung, at 10,800 reads per cell', () => {
    expect(a.accuracySingle.deltas.every((d) => d.pass)).toBe(true)
    for (const cell of a.accuracySingle.cells) expect(cell.reads).toBe(10800)
    expect(a.accuracySingle.infReproduction.deviations).toBe(0)
  })

  it('the E4 ∞ cell reproduces the committed v1.0 anchor exactly', () => {
    const inf = a.accuracy.cells.find((c) => c.bits === BOUNDED_INF_BITS)
    expect(inf?.top1).toBe(a.meta.baseline?.endTop1)
  })

  it('the cross-design block’s derived numbers are actually derived', () => {
    const c = a.crossDesign
    expect(c.diffOfDeltas).toBeCloseTo(c.p8.delta - c.p7.delta, 12)
    expect(c.se).toBeCloseTo(Math.sqrt(c.p7.se ** 2 + c.p8.se ** 2), 12)
    expect(c.z).toBeCloseTo(c.diffOfDeltas / c.se, 12)
    expect(c.mde).toBeCloseTo(2 * c.p8.se, 12)
    expect(c.effect).toBeCloseTo(Math.abs(c.p7.delta), 12)
  })

  it('the tier headline: easy below the 0-bit floor, medium finite, hard not', () => {
    const floor = a.ladder.find((r) => r.bits === 0)
    const easy = a.tiers.find((t) => t.tier === 'easy')
    const medium = a.tiers.find((t) => t.tier === 'medium')
    const hard = a.tiers.find((t) => t.tier === 'hard')
    expect(easy?.share ?? 1).toBeLessThan(floor?.share ?? 0)
    expect(easy?.bitsEquivalent.bits).toBe(0)
    expect(medium?.bitsEquivalent.finite).toBe(true)
    expect(hard?.bitsEquivalent.finite).toBe(false)
  })

  it('the move spread behind the ecology caveat is a real, bounded spread', () => {
    const spread = gridMoveSpread(a)
    expect(spread.min).toBeGreaterThan(0)
    expect(spread.max).toBeGreaterThan(spread.min)
    expect(spread.spread).toBeGreaterThan(0.1)
    expect(spread.spread).toBeLessThan(0.5)
  })
})
