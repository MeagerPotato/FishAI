/**
 * The lab site's gates.
 *
 * These are the claims the three routes make that a reader cannot check by looking, so they are
 * checked here instead:
 *
 *   · every committed case parses, and BOTH VERDICT PATHS render differently;
 *   · the verdict is honest — `dominant` requires all four §4.4 criteria, and removing the
 *     evidence for one of them removes the verdict;
 *   · the counter-graph is drawn from `significant`, never from a raw p-value;
 *   · the `us54` contract holds: no ties, no `voidRate`, and an artifact carrying either is
 *     refused at the boundary rather than rendered;
 *   · the rule-set guard actually refuses something;
 *   · a stored replay reproduces its recorded outcome through the shipped reducer.
 *
 * Pure modules only — no React, no DOM — so this passes under the repo's Node-environment
 * vitest config.
 */

import { describe, expect, it } from 'vitest'
import { cellIndex, scoreOf } from '../diagrams/index.ts'
import { layoutCounterGraph } from '../diagrams/layout/counterGraph.ts'
import {
  ARTIFACT_CASES,
  ArtifactError,
  caseFromSearch,
  loadArtifact,
  parseArtifact,
  type LabArtifact,
} from './artifact.ts'
import { labModel } from './model.ts'
import { replayGame } from './replay.ts'
import { checkRules, SHIPPED_RULES_HASH } from './rules.ts'
import { derive, findCycles, reconcile, significantEdges } from './verdict.ts'

function artifactOf(which: 'cyclic' | 'v2' | 'stale'): LabArtifact {
  const loaded = loadArtifact(which)
  if (!loaded.ok) throw new Error(`${which} failed to parse: ${loaded.detail}`)
  return loaded.artifact
}

describe('the committed artifacts', () => {
  it('all four parse', () => {
    for (const which of ARTIFACT_CASES) {
      const loaded = loadArtifact(which)
      expect(loaded.ok, `${which}: ${loaded.ok ? '' : loaded.detail}`).toBe(true)
    }
  })

  it('carry the us54 roster and a complete round robin', () => {
    for (const which of ARTIFACT_CASES) {
      const a = artifactOf(which)
      const n = a.styles.length
      expect(a.meta.ruleSet).toBe('us54')
      // One stored orientation per unordered pair.
      expect(a.matrix).toHaveLength((n * (n - 1)) / 2)
      const index = cellIndex(a.matrix)
      for (const x of a.styles) {
        for (const y of a.styles) {
          if (x.id === y.id) continue
          expect(scoreOf(index, x.id, y.id), `${x.id} vs ${y.id}`).toBeDefined()
        }
      }
    }
  })

  it('are duplicate-averaged: a cell and its mirror sum to 1', () => {
    const a = artifactOf('cyclic')
    const index = cellIndex(a.matrix)
    for (const cell of a.matrix) {
      const forward = scoreOf(index, cell.a, cell.b)
      const back = scoreOf(index, cell.b, cell.a)
      expect(forward!.score + back!.score).toBeCloseTo(1, 10)
    }
  })
})

describe('the us54 contract (SITE_SPEC.md §5)', () => {
  it('never carries a tie, because a tie is arithmetically impossible', () => {
    for (const which of ARTIFACT_CASES) {
      for (const cell of artifactOf(which).matrix) expect(cell.ties).toBe(0)
    }
  })

  it('never carries voidRate — concedeRate measures a different event', () => {
    for (const which of ARTIFACT_CASES) {
      for (const cell of artifactOf(which).matrix) {
        expect(cell.metrics.a).not.toHaveProperty('voidRate')
        expect(cell.metrics.b).not.toHaveProperty('voidRate')
        expect(typeof cell.metrics.a.concedeRate).toBe('number')
      }
    }
  })

  it('refuses an artifact whose metrics carry voidRate', () => {
    const doc = JSON.parse(JSON.stringify(artifactOf('cyclic')))
    doc.matrix[0].metrics.a.voidRate = 0.19
    expect(() => parseArtifact(JSON.stringify(doc), 'test')).toThrowError(ArtifactError)
    expect(() => parseArtifact(JSON.stringify(doc), 'test')).toThrowError(/voidRate/)
  })

  it('refuses an artifact with a non-zero tie count', () => {
    const doc = JSON.parse(JSON.stringify(artifactOf('cyclic')))
    doc.matrix[0].ties = 3
    expect(() => parseArtifact(JSON.stringify(doc), 'test')).toThrowError(/arithmetically impossible/)
  })

  it('refuses an artifact from the other rule set', () => {
    const doc = JSON.parse(JSON.stringify(artifactOf('cyclic')))
    doc.meta.ruleSet = 'pagat48'
    expect(() => parseArtifact(JSON.stringify(doc), 'test')).toThrowError(/us54 results only/)
  })

  it('names the failing path when the shape is wrong', () => {
    const doc = JSON.parse(JSON.stringify(artifactOf('cyclic')))
    doc.matrix[2].ci95 = [0.5]
    expect(() => parseArtifact(JSON.stringify(doc), 'test')).toThrowError(/matrix\[2\]\.ci95/)
  })
})

/**
 * The artifact is data, and `styleDef` widens `family` into the closed `StyleFamily` union with a
 * cast rather than validating it — deliberately, so a roster addition is not refused. What reaches
 * the two family lookups is therefore whatever the document said.
 *
 * The engine has already shipped one bug of exactly this shape, in `deckFor`/`rulesFor`. Indexing
 * an object literal walks `Object.prototype`: `family: "constructor"` comes back as a FUNCTION,
 * which is truthy, so the `?? fallback` written to catch an unknown family never fires and a
 * function is handed to React as an SVG text child. Both lookups are `Map`s for that reason, and
 * this is the test that keeps them that way.
 */
describe('a family name out of the document cannot reach Object.prototype', () => {
  const POISON = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'] as const

  it('gives a poisoned family the documented fallback tag, not an inherited member', () => {
    for (const key of POISON) {
      const doc = JSON.parse(JSON.stringify(artifactOf('cyclic')))
      for (const style of doc.styles) style.family = key
      const artifact = parseArtifact(JSON.stringify(doc), `poison:${key}`)
      const model = layoutCounterGraph({ results: reconcile(artifact, derive(artifact)) })
      expect(model.nodes.length).toBeGreaterThan(0)
      for (const node of model.nodes) {
        expect(typeof node.family).toBe('string')
        expect(node.family).toBe('STYLE')
      }
    }
  })

  it('still carries an unknown-but-honest family through as a plain string', () => {
    const doc = JSON.parse(JSON.stringify(artifactOf('cyclic')))
    for (const style of doc.styles) style.family = 'a-family-added-next-year'
    const artifact = parseArtifact(JSON.stringify(doc), 'test')
    expect(artifact.styles[0].family).toBe('a-family-added-next-year')
  })
})

/**
 * Every diagram type on the report enforces its own roster range by THROWING during layout, and a
 * throw during render is a blank page rather than the named refusal `loadArtifact` promises. So
 * the range is a boundary condition, checked once, where a refusal has a message.
 */
describe('the roster size is checked at the boundary, not during render', () => {
  it('refuses a roster too small for the figures', () => {
    const doc = JSON.parse(JSON.stringify(artifactOf('cyclic')))
    const kept = doc.styles.slice(0, 4)
    const ids = new Set(kept.map((s: { id: string }) => s.id))
    doc.styles = kept
    doc.matrix = doc.matrix.filter((c: { a: string; b: string }) => ids.has(c.a) && ids.has(c.b))
    expect(() => parseArtifact(JSON.stringify(doc), 'test')).toThrowError(/roster of 5 to 9/)
  })

  it('refuses a roster past the counter-graph node budget', () => {
    const doc = JSON.parse(JSON.stringify(artifactOf('cyclic')))
    doc.styles = [...doc.styles, { ...doc.styles[0], id: 'tenth', label: 'Tenth' }]
    expect(() => parseArtifact(JSON.stringify(doc), 'test')).toThrowError(/roster of 5 to 9/)
  })

  it('accepts every committed case, which all sit inside the range', () => {
    for (const which of ARTIFACT_CASES) {
      expect(artifactOf(which).styles.length).toBeGreaterThanOrEqual(5)
      expect(artifactOf(which).styles.length).toBeLessThanOrEqual(9)
    }
  })
})

describe('the rule-set guard (SITE_SPEC.md §1.1)', () => {
  it('accepts the two live cases against the shipped RULES_US54.md', () => {
    for (const which of ['cyclic', 'v2'] as const) {
      const a = artifactOf(which)
      expect(a.meta.rulesHash).toBe(SHIPPED_RULES_HASH)
      expect(checkRules(a.meta.rulesHash, 'x').ok).toBe(true)
    }
  })

  it('refuses the deliberately stale case', () => {
    const a = artifactOf('stale')
    expect(a.meta.rulesHash).not.toBe(SHIPPED_RULES_HASH)
    const model = labModel('stale')
    expect(model.ok).toBe(true)
    if (model.ok) expect(model.check.ok).toBe(false)
  })

  it('hashes the real document, not a constant — 64 hex characters', () => {
    expect(SHIPPED_RULES_HASH).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('the verdict (BOT_LAB.md §4.4)', () => {
  it('renders the cyclic case as cyclic, with criterion 3 failing', () => {
    const d = derive(artifactOf('cyclic'))
    expect(d.verdict).toBe('cyclic')
    expect(d.criteria).toHaveLength(4)
    expect(d.criteria.find((c) => c.id === 3)!.pass).toBe(false)
    expect(d.cycles.length).toBeGreaterThan(0)
  })

  it('renders the v2 case as dominant, with all four criteria holding', () => {
    const d = derive(artifactOf('v2'))
    expect(d.verdict).toBe('dominant')
    expect(d.criteria.every((c) => c.pass === true)).toBe(true)
    expect(d.cycles).toHaveLength(0)
  })

  it('agrees with what the emitter stamped, for every case', () => {
    for (const which of ARTIFACT_CASES) {
      expect(derive(artifactOf(which)).disagrees, which).toBe(false)
    }
  })

  it('will not crown a style when the exploitability search did not run', () => {
    const a = artifactOf('v2')
    const unmeasured: LabArtifact = {
      ...a,
      exploitability: [],
      meta: { ...a.meta, analysis: { ...a.meta.analysis, exploitabilityRan: false } },
    }
    const d = derive(unmeasured)
    expect(d.criteria.find((c) => c.id === 4)!.pass).toBeNull()
    expect(d.verdict).not.toBe('dominant')
  })

  it('tests criterion 2 on the interval, not the point estimate', () => {
    const a = artifactOf('v2')
    const index = cellIndex(a.matrix)
    const d = derive(a)
    const mm = d.maximin.find((m) => m.style === d.candidate)!
    // A maximin above .5 whose lower bound is not is not a claim about the world.
    expect(mm.lower95).toBeLessThan(mm.value)
    expect(mm.lower95).toBeGreaterThan(0.5)
    expect(scoreOf(index, mm.style, mm.worstVs)!.score).toBeCloseTo(mm.value, 4)
    expect(d.criteria.find((c) => c.id === 2)!.detail).toContain('CI95 lower bound')
  })

  it('flags a disagreement rather than trusting either side', () => {
    const a = artifactOf('cyclic')
    const lying: LabArtifact = { ...a, ranking: { ...a.ranking, verdict: 'dominant' } }
    const d = derive(lying)
    expect(d.verdict).toBe('cyclic')
    expect(d.statedVerdict).toBe('dominant')
    expect(d.disagrees).toBe(true)
  })

  it('hands the diagrams the recomputed ranking, so figure and banner cannot disagree', () => {
    const a = artifactOf('cyclic')
    const d = derive(a)
    const results = reconcile(a, d)
    expect(results.ranking.verdict).toBe(d.verdict)
    expect(results.ranking.cycles).toEqual(d.cycles)
  })
})

describe('significance drives the counter-graph, not p-values', () => {
  it('the fixture actually contains cells that did NOT survive BH', () => {
    const a = artifactOf('cyclic')
    const ns = a.matrix.filter((c) => !c.significant)
    expect(ns.length).toBeGreaterThan(0)
  })

  it('no edge is derived from a cell that failed correction', () => {
    for (const which of ['cyclic', 'v2'] as const) {
      const a = artifactOf(which)
      const index = cellIndex(a.matrix)
      for (const e of significantEdges(
        a.styles.map((s) => s.id),
        index,
      )) {
        expect(scoreOf(index, e.from, e.to)!.cell.significant, `${e.from}>${e.to}`).toBe(true)
        expect(e.score).toBeGreaterThan(0.5)
      }
    }
  })

  it('every edge of every reported cycle survived correction', () => {
    const a = artifactOf('cyclic')
    const index = cellIndex(a.matrix)
    const cycles = findCycles(
      a.styles.map((s) => s.id),
      index,
    )
    expect(cycles.length).toBeGreaterThan(0)
    for (const cycle of cycles) {
      for (let i = 0; i < cycle.styles.length; i++) {
        const from = cycle.styles[i]
        const to = cycle.styles[(i + 1) % cycle.styles.length]
        const found = scoreOf(index, from, to)!
        expect(found.cell.significant, `${from}>${to}`).toBe(true)
        expect(found.score).toBeGreaterThan(0.5)
      }
    }
  })

  it('drops a declared cycle whose edges the matrix does not support', () => {
    // The committed fixture declares punter > ghost > archivist. It is not in the matrix, and
    // drawing it would put a spurious edge on the headline diagram — which is the exact failure
    // Benjamini-Hochberg exists to prevent.
    const a = artifactOf('cyclic')
    const derived = derive(a)
    const flat = derived.cycles.map((c) => c.styles.join('>'))
    expect(flat).not.toContain('punter>ghost>archivist')
  })

  it('the counter-graph layout only routes significant edges', () => {
    for (const which of ['cyclic', 'v2'] as const) {
      const a = artifactOf(which)
      const model = layoutCounterGraph({ results: reconcile(a, derive(a)) })
      const index = cellIndex(a.matrix)
      expect(model.totalSignificant).toBe(
        significantEdges(
          a.styles.map((s) => s.id),
          index,
        ).length,
      )
    }
  })

  it('highlights a cycle only when the verdict is cyclic', () => {
    const cyclic = artifactOf('cyclic')
    const dominant = artifactOf('v2')
    expect(
      layoutCounterGraph({ results: reconcile(cyclic, derive(cyclic)) }).cycle.length,
    ).toBeGreaterThan(0)
    expect(layoutCounterGraph({ results: reconcile(dominant, derive(dominant)) }).cycle).toHaveLength(
      0,
    )
  })
})

describe('replays run through the shipped reducer', () => {
  it('every stored replay finishes without an engine error', () => {
    const a = artifactOf('cyclic')
    expect(a.replays.length).toBeGreaterThan(0)
    for (const record of a.replays) {
      const replay = replayGame(record)
      expect(replay.error, record.id).toBeNull()
      expect(replay.frames).toHaveLength(record.actions.length + 1)
    }
  })

  it('reproduces the recorded outcome exactly — actions, not states', () => {
    for (const record of artifactOf('cyclic').replays) {
      const replay = replayGame(record)
      const final = replay.frames[replay.frames.length - 1]
      expect(final.view.phase, record.id).toBe('finished')
      expect(final.sets, record.id).toEqual(record.sets)
      expect(final.unresolved, record.id).toBe(record.unresolved)
      // A clinch: exactly one team reaches 5 sets, and some sets are always left unresolved.
      expect(Math.max(...final.sets)).toBe(5)
      expect(final.unresolved).toBeGreaterThan(0)
    }
  })

  it('never exposes a hand — the frames are the public projection only', () => {
    const replay = replayGame(artifactOf('cyclic').replays[0])
    for (const frame of replay.frames) {
      expect(frame.view).not.toHaveProperty('hands')
      expect(frame.view).not.toHaveProperty('hand')
      expect(frame.view.counts).toHaveLength(6)
      expect(frame.view.counts.reduce((n, c) => n + c, 0)).toBeLessThanOrEqual(54)
    }
  })

  it('reports the engine error verbatim when the stored log stops being legal', () => {
    const record = artifactOf('cyclic').replays[0]
    const corrupted = {
      ...record,
      actions: [{ type: 'ask', seat: 0, target: 1, card: 'XR' } as (typeof record.actions)[number]],
    }
    const replay = replayGame(corrupted)
    expect(replay.error).not.toBeNull()
    expect(replay.error!.step).toBe(1)
    expect(typeof replay.error!.engine.code).toBe('string')
  })

  it('separates material moves from declare-window declines', () => {
    const replay = replayGame(artifactOf('cyclic').replays[0])
    expect(replay.material.length).toBeGreaterThan(0)
    expect(replay.material.length).toBeLessThan(replay.frames.length - 1)
    for (const step of replay.material) {
      expect(replay.frames[step].action!.type).not.toBe('decline')
    }
  })
})

describe('case selection', () => {
  it('defaults to v2 — the measured run — and ignores anything unknown', () => {
    expect(caseFromSearch('')).toBe('v2')
    expect(caseFromSearch('?case=nonsense')).toBe('v2')
    expect(caseFromSearch('?case=cyclic')).toBe('cyclic')
    // `dominant` was retired by the September 2026 turn-pass correction, so an old link to it
    // lands on the default rather than on a refusal page.
    expect(caseFromSearch('?case=dominant')).toBe('v2')
    expect(caseFromSearch('?case=v2')).toBe('v2')
    expect(caseFromSearch('?case=stale')).toBe('stale')
  })
})
