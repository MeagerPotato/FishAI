/**
 * bounded.test.ts — FishAI v1.5: the bounded-memory ladder (SPEC v1.5 Phase 1; PLAYSTYLES.md
 * S44–S48), against the six obligations of the spec.
 *
 * The load-bearing test is the LARGE-BUDGET EQUIVALENCE PIN. With bits large enough to hold
 * every derivable fact, the restricted knowledge must be IDENTICAL — field for field — to
 * `buildKnowledge`'s output, and therefore every decision over whole games identical to the
 * unbounded style's. The implementation earns this by construction (the replay finishes through
 * `finishKnowledge`, the same tail `buildKnowledge` runs), and this suite proves it empirically
 * at every decision point of real games under both rule sets, so any drift between the fact
 * pool and the full walk surfaces as a first-class diff rather than a quiet weakening.
 *
 * The rest is the ladder's contract: bits=0 is the S46 own-hand-only floor (log-independent by
 * construction, pinned as equality with `buildKnowledge` on a log-stripped view); the kept set
 * is a maximal prefix of a deterministic ranking and never exceeds the budget; set-share is
 * monotone in bits at smoke level (the real measurement is Phase 2); full games at several
 * budgets pass the play-seats health gates; and the arm pays the same discipline every policy
 * addition pays — frozen-view purity, decide/decideExplained parity (the fuzz itself lives in
 * explain.test.ts's POLICIES list), and `resolvePolicy` refusing the shape it cannot resolve.
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_SEATS,
  STYLE_ROSTER,
  boundedRead,
  buildKnowledge,
  decide,
  decideExplained,
  deriveBoundedFacts,
  hashSeed,
  isBoundedSpec,
  keepWithinBudget,
  legalActionsSummary,
  newGame,
  rankBoundedFacts,
  reduce,
  resolvePolicy,
  restrictedKnowledge,
  seatTeam,
  seatView,
  us54Config,
} from '../../lib/engine/index.ts'
import type {
  BoundedSpec,
  Card,
  GameState,
  PolicySpec,
  RulesConfig,
  Seat,
  SeatView,
} from '../../lib/engine/index.ts'
import { playGameSeats, seedFor, startSeatFor } from '../../lib/lab/index.ts'
import type { SeatSpec } from '../../lib/lab/index.ts'
import { deepFreeze } from '../engine/util.ts'
import { ask, collectBotViews, gs, mkView } from './util.ts'

/** Comfortably above any real game's whole pool (≈ 2 bits × 54 cards × 6 seats plus basis facts). */
const BIG = 1_000_000
const bounded = (bits: number, style?: BoundedSpec['style']): BoundedSpec =>
  style === undefined ? { bounded: true, bits } : { bounded: true, bits, style }

const OPTS = { variant: 'us54' as const, stepCap: 5000, invariantCheck: 'every' as const }

/** A seat table with the given team playing `spec` and the other team the balanced reference. */
function boundedVsBalanced(spec: BoundedSpec, boundedTeam: 0 | 1): SeatSpec[] {
  return ALL_SEATS.map((seat) =>
    seatTeam(seat) === boundedTeam
      ? { policy: spec as PolicySpec, leakStyle: STYLE_ROSTER.balanced }
      : { policy: STYLE_ROSTER.balanced as PolicySpec, leakStyle: STYLE_ROSTER.balanced },
  )
}

/* ------------------------------------------- 1. the large-budget equivalence pin --- */

/**
 * One whole game driven by the unbounded style, comparing at EVERY decision point: the bounded
 * action against the unbounded one, and (sampled — the knowledge diff is the expensive half)
 * the restricted knowledge against `buildKnowledge`'s output.
 */
function playAnchor(config: RulesConfig | undefined, gameSeed: string, startSeat: Seat): number {
  let s = newGame(gameSeed, config, startSeat)
  let steps = 0
  let checked = 0
  while (s.phase !== 'finished') {
    if (steps >= 5000) throw new Error(`${gameSeed}: hit the 5000-step cap`)
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const moveSeed = hashSeed(`${gameSeed}:${s.moveIndex}`)()
    const unbounded = decide(view, STYLE_ROSTER.balanced, moveSeed)
    const capped = decide(view, bounded(BIG, 'balanced'), moveSeed)
    if (JSON.stringify(capped) !== JSON.stringify(unbounded)) {
      expect(capped, `${gameSeed} step ${steps}`).toEqual(unbounded)
    }
    if (steps % 4 === 0) {
      const full = buildKnowledge(view)
      const restricted = restrictedKnowledge(view, bounded(BIG))
      if (JSON.stringify(restricted) !== JSON.stringify(full)) {
        expect(restricted, `${gameSeed} step ${steps} knowledge`).toEqual(full)
      }
      checked++
    }
    const r = reduce(s, unbounded)
    if (!r.ok) throw new Error(`${gameSeed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  return checked
}

describe('1. large-budget equivalence — the anchor', () => {
  it(
    'us54: restricted knowledge ≡ buildKnowledge and every decision ≡ the unbounded style, whole games',
    () => {
      let checked = 0
      for (let g = 0; g < 2; g++) {
        checked += playAnchor(us54Config, `bounded-anchor-us54-${g}`, (g % 6) as Seat)
      }
      expect(checked).toBeGreaterThan(50)
    },
    300_000,
  )

  it(
    'pagat48: the same pin under the 48-card default',
    () => {
      const checked = playAnchor(undefined, 'bounded-anchor-p48-0', 0)
      expect(checked).toBeGreaterThan(15)
    },
    300_000,
  )
})

/* ----------------------------------------------------- 2. the zero-budget floor --- */

describe('2. zero budget — the S46 own-hand-only floor', () => {
  it('bits=0 sees own hand + public board only: identical to buildKnowledge on a log-stripped view', () => {
    // At 0 bits every fact is evicted, so the reconstruction reads NOTHING from the log — it
    // must equal the full builder run on the same view with the log removed (books, counts and
    // hand intact). Checked across real mid-game positions of both rule sets.
    const views = [...collectBotViews(1, us54Config), ...collectBotViews(1)]
    let checked = 0
    for (let i = 0; i < views.length; i += 17) {
      const view = views[i].view
      const stripped: SeatView = { ...view, log: [] }
      expect(restrictedKnowledge(view, bounded(0)), `view ${i}`).toEqual(buildKnowledge(stripped))
      checked++
    }
    expect(checked).toBeGreaterThan(10)
  })

  it('a publicly located card is forgotten at 0 bits, remembered at 2', () => {
    // Seat 1 publicly took 9H (the hit is in the log). The unbounded builder knows it; a 0-bit
    // memory does not; 2 bits buys exactly that one card fact back.
    const view = mkView({
      seat: 0,
      hand: ['TH', '2C', '3C', '4C', '5C', '2D', '3D', '4D'],
      counts: [8, 9, 7, 8, 8, 8],
      log: [gs, ask(1, 2, '9H', true)],
    })
    expect(buildKnowledge(view).holders['9H']).toBe(1)
    const k0 = restrictedKnowledge(view, bounded(0))
    expect(k0.holders['9H']).toBeUndefined()
    expect(k0.constraints).toEqual([])
    const k2 = restrictedKnowledge(view, bounded(2))
    expect(k2.holders['9H']).toBe(1)
  })

  it('bits=0 keeps nothing: the read reports 0 kept, 0 cost, over a non-empty pool', () => {
    const view = collectBotViews(1, us54Config).at(-1)!.view
    const read = boundedRead(view, bounded(0))
    expect(read.kept).toBe(0)
    expect(read.cost).toBe(0)
    expect(read.total).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------- 3. budget accounting --- */

describe('3. budget accounting — cost cap, prefix, determinism', () => {
  it('kept cost <= bits, the kept set is a maximal prefix of the ranking, and both are deterministic', () => {
    const views = collectBotViews(1, us54Config)
    let checked = 0
    for (let i = 5; i < views.length; i += 23) {
      const view = views[i].view
      const facts = deriveBoundedFacts(view)
      const { ranked } = rankBoundedFacts(view, facts)
      // Determinism: a second full derivation and ranking reproduce byte-identical output.
      expect(JSON.stringify(deriveBoundedFacts(view)), `pool ${i}`).toBe(JSON.stringify(facts))
      expect(JSON.stringify(rankBoundedFacts(view, facts).ranked), `rank ${i}`).toBe(JSON.stringify(ranked))
      // The ranking is a permutation of the pool.
      expect(ranked.length).toBe(facts.length)
      for (const bits of [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144]) {
        const kept = keepWithinBudget(ranked, bits)
        let cost = 0
        for (const f of kept) cost += f.cost
        expect(cost, `bits=${bits} view ${i}`).toBeLessThanOrEqual(bits)
        expect(kept, `prefix bits=${bits} view ${i}`).toEqual(ranked.slice(0, kept.length))
        // Maximal: the next ranked fact (if any) would not have fitted.
        if (kept.length < ranked.length) {
          expect(cost + ranked[kept.length].cost, `maximal bits=${bits} view ${i}`).toBeGreaterThan(bits)
        }
      }
      checked++
    }
    expect(checked).toBeGreaterThan(8)
  })

  it('every fact carries the S44 price: 2 bits for card facts, 1 for basis facts', () => {
    const view = collectBotViews(1, us54Config).at(-1)!.view
    const facts = deriveBoundedFacts(view)
    expect(facts.length).toBeGreaterThan(0)
    for (const f of facts) {
      if (f.kind === 'has-card' || f.kind === 'lacks-card') expect(f.cost).toBe(2)
      else expect(f.cost).toBe(1)
    }
  })

  it('a malformed budget degrades to 0 and never throws', () => {
    const view = mkView({ seat: 0, hand: ['2C'], counts: [1, 8, 8, 8, 8, 8], log: [gs] })
    for (const bits of [-5, 0.9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const read = boundedRead(view, bounded(bits))
      expect(read.cost).toBeLessThanOrEqual(Number.isFinite(bits) ? Math.max(0, Math.floor(bits)) : 0)
    }
  })
})

/* --------------------------------------------------------- 4. monotone smoke --- */

describe('4. monotone smoke — more bits is never (much) weaker', () => {
  it(
    'mean set-share vs the balanced reference is non-decreasing in bits, generous tolerance',
    () => {
      // Duplicate deals, both orientations, fixed reference opposition. Smoke-level on purpose:
      // the calibrated grid with clustered SEs is Phase 2's E1; this pins only the direction.
      const budgets = [0, 12, 48, BIG]
      const shares: number[] = []
      for (const bits of budgets) {
        let share = 0
        let n = 0
        for (let pair = 0; pair < 5; pair++) {
          for (const orient of [0, 1] as const) {
            const g = playGameSeats(
              boundedVsBalanced(bounded(bits, 'balanced'), orient),
              seedFor('bounded-mono', pair),
              startSeatFor(pair),
              { ...OPTS, invariantCheck: 'final' },
            )
            expect(g.finished, `bits=${bits} pair=${pair}`).toBe(true)
            expect(g.illegal, `bits=${bits} pair=${pair}`).toBe(0)
            const mine = g.sets[orient]
            share += mine / (mine + g.sets[1 - orient])
            n++
          }
        }
        shares.push(share / n)
      }
      for (let i = 1; i < shares.length; i++) {
        expect(shares[i], `share(${budgets[i]}) vs share(${budgets[i - 1]})`).toBeGreaterThanOrEqual(
          shares[i - 1] - 0.1,
        )
      }
      // The ends are not close: an own-hand-only team loses badly to full memory.
      expect(shares[shares.length - 1]).toBeGreaterThan(shares[0] + 0.2)
      // The full-budget mirror is exactly even: both teams play bit-identical balanced.
      expect(shares[shares.length - 1]).toBe(0.5)
    },
    300_000,
  )
})

/* ----------------------------------------------------------------- 5. health --- */

describe('5. health — full games with bounded seats at several budgets', () => {
  it(
    'us54: 0 illegal, 0 capped, invariants hold, clean clinches, across budgets and seeds',
    () => {
      for (const bits of [0, 6, 24, 96]) {
        for (const pair of [0, 1]) {
          const g = playGameSeats(
            boundedVsBalanced(bounded(bits, 'balanced'), (pair % 2) as 0 | 1),
            seedFor(`bounded-health-${bits}`, pair),
            startSeatFor(pair),
            OPTS,
          )
          const label = `bits=${bits} pair=${pair}`
          expect(g.finished, label).toBe(true)
          expect(g.capped, label).toBe(false)
          expect(g.illegal, label).toBe(0)
          expect(g.invariantViolations, label).toBe(0)
          expect(g.clinch, label).toBe(true)
          expect(g.tie, label).toBe(false)
        }
      }
    },
    300_000,
  )

  it(
    'a mixed table (bounded punter + bounded balanced vs the roster) and the 48-card rule set both run clean',
    () => {
      const mixed: SeatSpec[] = ALL_SEATS.map((seat) => {
        if (seatTeam(seat) === 0) {
          const spec = seat === 0 ? bounded(24, 'punter') : bounded(48, 'balanced')
          return { policy: spec as PolicySpec, leakStyle: STYLE_ROSTER[spec.style ?? 'balanced'] }
        }
        return { policy: STYLE_ROSTER.blitz as PolicySpec, leakStyle: STYLE_ROSTER.blitz }
      })
      const g = playGameSeats(mixed, seedFor('bounded-health-mixed', 0), startSeatFor(0), OPTS)
      expect(g.finished).toBe(true)
      expect(g.capped).toBe(false)
      expect(g.illegal).toBe(0)
      expect(g.invariantViolations).toBe(0)

      const p48 = playGameSeats(boundedVsBalanced(bounded(24, 'balanced'), 0), seedFor('bounded-health-p48', 0), 0, {
        ...OPTS,
        variant: 'pagat48',
      })
      expect(p48.finished).toBe(true)
      expect(p48.capped).toBe(false)
      expect(p48.illegal).toBe(0)
      expect(p48.invariantViolations).toBe(0)
    },
    300_000,
  )
})

/* ---------------------------------------------- 6. parity, purity, and the guard --- */

describe('6. parity and purity (the cross-policy fuzz lives in explain.test.ts)', () => {
  it('decideExplained ≡ decide for the bounded arm on real positions, and the trace names the budget', () => {
    const views = collectBotViews(1, us54Config)
    let sampled = 0
    let named = 0
    for (let i = 0; i < views.length; i += 11) {
      const { view, seed } = views[i]
      for (const bits of [0, 24]) {
        const spec = bounded(bits)
        const plain = decide(view, spec, seed)
        const explained = decideExplained(view, spec, seed)
        expect(explained.action, `view ${i} bits=${bits}`).toEqual(plain)
        const note = explained.trace.notes[0] ?? ''
        if (note.includes(`${bits}-bit memory`)) named++
      }
      sampled++
    }
    expect(sampled).toBeGreaterThan(10)
    // Every non-fallback trace opens by naming the budget — the "k-bit memory" headline note.
    expect(named).toBe(sampled * 2)
  })

  it('a deep-frozen view neither throws nor changes the action, the trace, or the knowledge', () => {
    const positions: GameState[] = []
    for (const { state } of collectBotViews(1, us54Config)) positions.push(state)
    let checked = 0
    for (let i = 0; i < positions.length; i += 29) {
      const state = positions[i]
      const { seat } = legalActionsSummary(state)
      const seed = hashSeed(`bounded-frozen-${i}`)()
      for (const bits of [0, 24, BIG]) {
        const frozen = deepFreeze(seatView(state, seat))
        const plain = seatView(state, seat)
        let out: ReturnType<typeof decideExplained> | null = null
        expect(() => {
          out = decideExplained(frozen, bounded(bits), seed)
        }).not.toThrow()
        expect(out).toEqual(decideExplained(plain, bounded(bits), seed))
        expect(out!.action).toEqual(decide(plain, bounded(bits), seed))
        expect(() => restrictedKnowledge(deepFreeze(seatView(state, seat)), bounded(bits))).not.toThrow()
      }
      checked++
    }
    expect(checked).toBeGreaterThan(5)
  })

  it('the same view, spec and seed replay byte-identically', () => {
    const { view, seed } = collectBotViews(1, us54Config).at(-2)!
    const spec = bounded(24, 'balanced')
    expect(JSON.stringify(decide(view, spec, seed))).toBe(JSON.stringify(decide(view, spec, seed)))
    expect(JSON.stringify(boundedRead(view, spec))).toBe(JSON.stringify(boundedRead(view, spec)))
  })

  it('isBoundedSpec accepts only an own `bounded: true` flag', () => {
    expect(isBoundedSpec({ bounded: true, bits: 8 })).toBe(true)
    expect(isBoundedSpec({ bounded: true, bits: 8, style: 'punter' })).toBe(true)
    expect(isBoundedSpec({ bounded: 'yes', bits: 8 })).toBe(false)
    expect(isBoundedSpec({ bits: 8 })).toBe(false)
    expect(isBoundedSpec(null)).toBe(false)
    expect(isBoundedSpec('bounded')).toBe(false)
    expect(isBoundedSpec(Object.create({ bounded: true }))).toBe(false)
  })

  it('resolvePolicy refuses a BoundedSpec with a TypeError naming the reason', () => {
    expect(() => resolvePolicy(bounded(8))).toThrow(TypeError)
    expect(() => resolvePolicy(bounded(8))).toThrow(/bounded policies resolve inside decide, with a view/)
  })

  it('an unknown style id degrades to the balanced default rather than throwing', () => {
    const view = collectBotViews(1, us54Config)[3].view
    const seed = 7
    const junk = { bounded: true, bits: BIG, style: 'no-such-style' } as unknown as BoundedSpec
    expect(decide(view, junk, seed)).toEqual(decide(view, bounded(BIG, 'balanced'), seed))
  })

  it('garbage cards in a crafted log are skipped, never fabricated', () => {
    // An 8H in a pagat48 log names a card the deck does not contain; the derivation must not
    // invent an index for it (same discipline as buildKnowledge's ingestion).
    const view = mkView({
      seat: 0,
      hand: ['2C', '3C'],
      counts: [2, 8, 8, 8, 8, 8],
      log: [gs, ask(1, 2, '8H' as Card, true), ask(1, 2, '9H', true)],
    })
    const read = boundedRead(view, bounded(BIG))
    expect(read.knowledge.holders['9H']).toBe(1)
    expect(read.knowledge).toEqual(buildKnowledge(view))
  })
})
