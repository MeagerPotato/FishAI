/**
 * classify.test.ts — the classifier returns a proper, deterministic posterior; the damping is
 * honest at zero evidence; the bucket rule is pinned; and a loose real-game smoke test shows
 * the read is better than chance on the roster's most separable axis. Deliberately loose:
 * real accuracy is *measured* in the Stage-2 experiments, never asserted in a unit test —
 * styles that diverge on a few percent of decisions are near-indistinguishable from one game,
 * and a tight bound here would be a number this suite cannot honestly own.
 */
import { describe, expect, it } from 'vitest'
import {
  decide,
  hashSeed,
  legalActionsSummary,
  newGame,
  publicView,
  reduce,
  seatTeam,
  seatView,
  us54Config,
  STYLE_IDS,
  STYLE_ROSTER,
} from '../../lib/engine/index.ts'
import type { PublicState, Seat, StyleParams } from '../../lib/engine/index.ts'
import { checkpointBucket, classifySeat, classifySeats } from '../../lib/engine/bots/classify.ts'
import type { StyleFingerprint } from '../../lib/engine/bots/classify.ts'
import { FEATURE_KEYS } from '../../lib/engine/bots/observe.ts'
import type { SeatObservation } from '../../lib/engine/bots/observe.ts'
import { deepFreeze } from '../engine/util.ts'
import { gs, mkView } from './util.ts'

/** One full us54 game under a per-seat style map. */
function playUs54(seed: string, policyOf: (seat: Seat) => StyleParams, startSeat: Seat = 0): PublicState {
  let s = newGame(seed, us54Config, startSeat)
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const r = reduce(s, decide(seatView(s, seat), policyOf(seat), hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(`playUs54: ${r.error.code}`)
    s = r.state
    steps++
  }
  if (s.phase !== 'finished') throw new Error('playUs54: step cap')
  return publicView(s)
}

/** A SeatObservation whose every FEATURE_KEYS entry is `v` (non-feature fields plausible). */
function flatObs(v: number, asks: number): SeatObservation {
  const obs: SeatObservation = {
    seat: 0,
    asks,
    hits: 0,
    hitRate: v,
    distinctBooks: 0,
    askDiversity: v,
    provablyDeadAsks: 0,
    certainAsks: 0,
    sameBookRepeatRate: v,
    leakyAsks: 0,
    completionAsks: 0,
    missFewestShare: v,
    missMostShare: v,
    declares: 0,
    declaresCorrect: 0,
    foreignDeclares: 0,
    ownHandOnlyDeclares: 0,
    declareBackload: v,
    events: 100,
    // Not a feature: `featureVector` projects FEATURE_KEYS and nothing else, so this field
    // cannot reach the classifier. Present only because `SeatObservation` requires it.
    countsExact: true,
    deadAskShare: v,
    certainAskShare: v,
    leakyAskShare: v,
    completionAskShare: v,
    askShare: v,
    declareShare: v,
    foreignDeclareShare: v,
    ownHandOnlyShare: v,
  }
  return obs
}

function syntheticPrint(style: StyleFingerprint['style'], mean: number): StyleFingerprint {
  return {
    style,
    mean: FEATURE_KEYS.map(() => mean),
    sd: FEATURE_KEYS.map(() => 0.1),
  }
}

describe('classifySeat', () => {
  it('an observation at a style mean classifies as that style, confidently', () => {
    const prints = [syntheticPrint('balanced', 0.2), syntheticPrint('turtle', 0.8)]
    const c = classifySeat(flatObs(0.8, 20), prints)
    expect(c.top).toBe('turtle')
    expect(c.confidence).toBeGreaterThan(0.9)
    expect(c.confidence).toBe(c.posterior.turtle)
  })

  it('zero asks damp the posterior to exactly uniform, whatever the features say', () => {
    const prints = [syntheticPrint('balanced', 0.2), syntheticPrint('turtle', 0.8)]
    const c = classifySeat(flatObs(0.8, 0), prints)
    expect(c.posterior.balanced).toBeCloseTo(0.5, 12)
    expect(c.posterior.turtle).toBeCloseTo(0.5, 12)
  })

  it('refuses an empty fingerprint set loudly', () => {
    expect(() => classifySeat(flatObs(0.5, 10), [])).toThrow(TypeError)
  })
})

describe('checkpointBucket', () => {
  it('picks the nearest checkpoint at or below the event count, full for finished games', () => {
    expect(checkpointBucket(1, false)).toBe('60')
    expect(checkpointBucket(59, false)).toBe('60')
    expect(checkpointBucket(60, false)).toBe('60')
    expect(checkpointBucket(119, false)).toBe('60')
    expect(checkpointBucket(120, false)).toBe('120')
    expect(checkpointBucket(199, false)).toBe('120')
    expect(checkpointBucket(200, false)).toBe('200')
    expect(checkpointBucket(299, false)).toBe('200')
    expect(checkpointBucket(300, false)).toBe('300')
    expect(checkpointBucket(1000, false)).toBe('300')
    expect(checkpointBucket(80, true)).toBe('full')
  })
})

describe('classifySeats — real views', () => {
  const mirror = (id: 'balanced' | 'turtle') => () => STYLE_ROSTER[id]

  it('returns a proper distribution per seat: sums to 1, all mass in [0, 1]', () => {
    const pv = playUs54('classify-dist-0', mirror('balanced'))
    const reads = classifySeats(pv)
    expect(reads).toHaveLength(6)
    for (const r of reads) {
      const values = Object.values(r.posterior)
      expect(values).toHaveLength(STYLE_IDS.length)
      const sum = values.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 9)
      for (const p of values) {
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(1)
      }
      expect(r.confidence).toBe(r.posterior[r.top])
      for (const id of STYLE_IDS) expect(r.posterior[id]).toBeLessThanOrEqual(r.confidence)
      expect(r.events).toBe(pv.log.length)
    }
  })

  it('a bare opening view classifies as exactly uniform ignorance', () => {
    const view = mkView({ seat: 0, hand: [], counts: [9, 9, 9, 9, 9, 9], log: [gs], config: us54Config })
    for (const r of classifySeats(view)) {
      for (const id of STYLE_IDS) expect(r.posterior[id]).toBeCloseTo(1 / 9, 12)
    }
  })

  it('is deterministic and never mutates the view', () => {
    const pv = playUs54('classify-det-0', mirror('turtle'))
    const a = classifySeats(pv)
    const b = classifySeats(pv)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const frozen = deepFreeze(JSON.parse(JSON.stringify(pv)) as PublicState)
    let fromFrozen: unknown = null
    expect(() => {
      fromFrozen = classifySeats(frozen)
    }).not.toThrow()
    expect(fromFrozen).toEqual(a)
  })

  it('smoke: turtle seats in turtle-vs-punter games read declare-only-own-hand-ish more often than chance', () => {
    // 18 games with rotating start seats, seeds disjoint from the fingerprint calibration
    // set. Turtle's public signature (own-hand-only declares, no foreign declares,
    // high-certainty asks) is the roster's most separable axis; "turtle-ish" here means the
    // turtle/banker never-gift families. Chance for a 2-of-9 family is 2/9 of reads. The
    // bound is deliberately loose — accuracy at scale is Stage 2's number, not this suite's,
    // and cross-play games are shorter and noisier than the mirror games the fingerprints
    // were calibrated on.
    let familyTop = 0
    let familyMass = 0
    let reads = 0
    for (let g = 0; g < 18; g++) {
      const pv = playUs54(
        `classify-smoke-${g}`,
        (seat) => (seatTeam(seat) === 0 ? STYLE_ROSTER.turtle : STYLE_ROSTER.punter),
        (g % 6) as Seat,
      )
      for (const r of classifySeats(pv)) {
        if (seatTeam(r.seat) !== 0) continue
        reads++
        if (r.top === 'turtle' || r.top === 'banker') familyTop++
        familyMass += r.posterior.turtle + r.posterior.banker
      }
    }
    expect(reads).toBe(54)
    // Strictly better than the 2/9 chance rate on both the argmax and the posterior mass
    // (measured at calibration: ~0.31 argmax, ~0.30 mass — modest, and honestly so).
    expect(familyTop / reads).toBeGreaterThan(2 / 9)
    expect(familyMass / reads).toBeGreaterThan(0.25)
  })
})
