/**
 * The geometry gate, run over every diagram built from the committed
 * fixture — BOTH verdict cases.
 *
 * This is the port of the source system's `scripts/verify-geometry.py` and
 * `scripts/self_check.py`. Hand-authored SVG geometry is exactly the kind of
 * thing that rots silently, so the checks run in CI rather than in review.
 *
 * Imports only pure layout modules — no React, no DOM — so it passes under
 * the repo's Node-environment vitest config.
 */

import { describe, expect, it } from 'vitest'
import { FIXTURES } from './fixture'
import { niceDomain, onGrid, orthoPath, placeLabel, scaleTo } from './geometry'
import { layoutAdaptiveMechanism } from './layout/adaptiveMechanism'
import { claimPrecisionDumbbell, concedeRateBar, degradationLine } from './layout/charts'
import { layoutCounterGraph } from './layout/counterGraph'
import { layoutDeck } from './layout/deck'
import { layoutPayoffMatrix } from './layout/payoffMatrix'
import { layoutPipeline } from './layout/pipeline'
import { layoutDeclareMachine, layoutTurnMachine } from './layout/stateMachines'
import type { Scene } from './scene'
import { assertUs54 } from './types'
import { verifyScene } from './verify'

const CASES = ['cyclic', 'dominant'] as const

function scenesFor(key: (typeof CASES)[number]): Record<string, Scene> {
  const results = FIXTURES[key]
  return {
    'payoff matrix': layoutPayoffMatrix({ results }).scene,
    'counter-graph': layoutCounterGraph({ results }).scene,
    'analysis pipeline': layoutPipeline().scene,
    'adaptive mechanism': layoutAdaptiveMechanism().scene,
    'turn machine': layoutTurnMachine().scene,
    'declare window': layoutDeclareMachine().scene,
    'bar chart': concedeRateBar(results).scene,
    'line chart': degradationLine(results).scene,
    'dumbbell chart': claimPrecisionDumbbell(results).scene,
    'deck assembly': layoutDeck().scene,
  }
}

describe.each(CASES)('fixture: %s verdict', (key) => {
  const results = FIXTURES[key]
  const scenes = scenesFor(key)

  it('satisfies the us54 data contract', () => {
    expect(() => assertUs54(results)).not.toThrow()
    expect(results.matrix.every((c) => c.ties === 0)).toBe(true)
    // voidRate is gone, not renamed.
    expect('voidRate' in results.matrix[0].metrics.a).toBe(false)
    expect(typeof results.matrix[0].metrics.a.concedeRate).toBe('number')
  })

  it('renders the verdict it claims', () => {
    expect(results.ranking.verdict).toBe(key)
  })

  for (const [name, scene] of Object.entries(scenes)) {
    it(`${name} passes the geometry gate`, () => {
      expect(verifyScene(scene)).toEqual([])
    })
  }
})

describe('both verdict render paths are exercised', () => {
  it('cyclic spends its accent on the back-edge and its CYCLE label', () => {
    const model = layoutCounterGraph({ results: FIXTURES.cyclic })
    const cycleEdge = model.scene.arrows.find((a) => a.id.startsWith('cycle-'))
    expect(cycleEdge).toBeDefined()
    expect(cycleEdge?.accent).toBe(true)
    expect(cycleEdge?.label).toBe('CYCLE')
    expect(model.scene.budget.accents).toBe(2)
    expect(model.nodes.some((n) => n.focal)).toBe(false)
  })

  it('dominant has no back-edge and accents the dominant node instead', () => {
    const model = layoutCounterGraph({ results: FIXTURES.dominant })
    expect(model.scene.arrows.some((a) => a.id.startsWith('cycle-'))).toBe(false)
    expect(model.scene.budget.accents).toBe(1)
    expect(model.nodes.filter((n) => n.focal)).toHaveLength(1)
  })
})

describe('complexity budget', () => {
  it.each(CASES)('%s: nothing exceeds 9 nodes / 12 arrows / 2 accents', (key) => {
    for (const scene of Object.values(scenesFor(key))) {
      expect(scene.budget.nodes).toBeLessThanOrEqual(9)
      expect(scene.budget.arrows).toBeLessThanOrEqual(12)
      expect(scene.budget.accents).toBeLessThanOrEqual(2)
    }
  })
})

describe('connector grammar', () => {
  it('refuses a diagonal outright', () => {
    expect(() =>
      orthoPath([
        { x: 0, y: 0 },
        { x: 40, y: 40 },
      ]),
    ).toThrow(/diagonal/i)
  })

  it('emits r=8 quarter-arcs at every bend', () => {
    const d = orthoPath([
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 120, y: 80 },
    ])
    expect(d).toContain('A 8 8 0 0')
    expect(d).not.toMatch(/[CQ]/)
  })

  it('shrinks the arc rather than overshooting a short segment', () => {
    const d = orthoPath([
      { x: 0, y: 0 },
      { x: 0, y: 8 },
      { x: 120, y: 8 },
    ])
    expect(d).toContain('A 4 4 0 0')
  })

  it.each(CASES)('%s: every drawn connector is axis-aligned', (key) => {
    for (const scene of Object.values(scenesFor(key))) {
      for (const a of scene.arrows) {
        expect(() => orthoPath(a.points)).not.toThrow()
      }
    }
  })
})

describe('arrow labels', () => {
  it.each(CASES)('%s: all-caps, <= 14 chars, 6-10px clear of the stroke', (key) => {
    for (const scene of Object.values(scenesFor(key))) {
      for (const a of scene.arrows) {
        if (a.label === undefined) continue
        expect(a.label).toBe(a.label.toUpperCase())
        expect(a.label.length).toBeLessThanOrEqual(14)
        expect(a.labelGap ?? 0).toBeGreaterThanOrEqual(6)
        expect(a.labelGap ?? 0).toBeLessThanOrEqual(10)
      }
    }
  })

  it('leaves a visible gap between the mask edge and the line', () => {
    const p = placeLabel({ x: 100, y: 200 }, 'above', 8, 'WRITE')
    expect(200 - (p.maskY + p.maskH)).toBe(8)
  })
})

describe('the accessible SVG contract', () => {
  it.each(CASES)('%s: title, desc and a slug-prefixed id on every diagram', (key) => {
    const slugs = new Set<string>()
    for (const scene of Object.values(scenesFor(key))) {
      expect(scene.title.length).toBeGreaterThan(0)
      expect(scene.desc.length).toBeGreaterThan(0)
      expect(scene.slug).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(slugs.has(scene.slug)).toBe(false)
      slugs.add(scene.slug)
    }
  })
})

describe('charts must not lie', () => {
  it('never truncates a value axis: all four sign cases are finite', () => {
    expect(niceDomain([0.2, 0.9])).toEqual({ floor: 0, ceil: 1 })
    expect(niceDomain([-4, -1])).toEqual({ floor: -5, ceil: 0 })
    const mixed = niceDomain([-3, 7])
    expect(mixed.floor).toBeLessThan(0)
    expect(mixed.ceil).toBeGreaterThan(7)
    // The case a sign-based rule drops: every value zero.
    const zero = niceDomain([0, 0, 0])
    expect(zero.ceil - zero.floor).toBeGreaterThan(0)
    expect(Number.isFinite(scaleTo(0, zero, 200, 960))).toBe(true)
  })

  it('anchors the bar baseline at zero', () => {
    const model = concedeRateBar(FIXTURES.cyclic)
    expect(model.domain.floor).toBe(0)
  })

  it('never prints two axis ticks with the same label on a narrow concede range', () => {
    // The measured v2 run's concede rates span ~0.015-0.025; at the old two-place format two
    // adjacent ticks rounded to the same "0.01", which both duplicated a React key and put a
    // dishonest axis on the page. Reproduce that range by shrinking the fixture's rates.
    const doc = structuredClone(FIXTURES.cyclic)
    for (const cell of doc.matrix) {
      cell.metrics.a.concedeRate *= 0.1
      cell.metrics.b.concedeRate *= 0.1
    }
    const labels = concedeRateBar(doc).gridlines.map((g) => g.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('accents the dumbbell series, not a row', () => {
    const model = claimPrecisionDumbbell(FIXTURES.cyclic)
    expect(model.scene.budget.accents).toBe(1)
    expect(model.domain.floor).toBe(0)
    for (const row of model.rows) {
      expect(Number.isFinite(row.refX)).toBe(true)
      expect(Number.isFinite(row.focalX)).toBe(true)
    }
  })

  it('states its sort order in every chart caption', () => {
    for (const key of CASES) {
      const results = FIXTURES[key]
      for (const model of [concedeRateBar(results), claimPrecisionDumbbell(results)]) {
        expect(model.scene.caption.toLowerCase()).toMatch(/sorted by/)
      }
      expect(degradationLine(results).scene.caption.toLowerCase()).toMatch(/ordered by/)
    }
  })
})

describe('the deck assembly teaches the 9-set structure', () => {
  const { sets, scene, arithmetic } = layoutDeck()

  it('is nine sets of six, fifty-four cards', () => {
    expect(sets).toHaveLength(9)
    for (const set of sets) expect(set.cards).toHaveLength(6)
    expect(sets.flatMap((s) => s.cards)).toHaveLength(54)
    expect(arithmetic).toBe('54 = 9 × 6')
  })

  it('names the ninth set as the eights and jokers', () => {
    const ninth = sets[8]
    expect(ninth.id).toBe('EIGHTS')
    expect(ninth.accent).toBe(true)
    expect(ninth.cards.map((c) => c.face)).toEqual(['8♣', '8♦', '8♥', '8♠', 'XR', 'XB'])
  })

  it('prints every card face, so the structure is readable and not implied', () => {
    const faces = new Set(sets.flatMap((s) => s.cards.map((c) => c.face)))
    expect(faces.size).toBe(54)
  })

  it('says in words what the figure shows', () => {
    expect(scene.desc).toMatch(/nine/i)
    expect(scene.caption).toMatch(/joker/i)
  })
})

describe('the 4px grid', () => {
  it.each(CASES)('%s: every designed coordinate is divisible by four', (key) => {
    for (const scene of Object.values(scenesFor(key))) {
      expect(onGrid(scene.viewW)).toBe(true)
      expect(onGrid(scene.viewH)).toBe(true)
      expect(onGrid(scene.legendY)).toBe(true)
      for (const r of scene.rects) {
        if (r.dataScaled) continue
        expect([r.x, r.y, r.w, r.h].every(onGrid)).toBe(true)
      }
    }
  })
})
