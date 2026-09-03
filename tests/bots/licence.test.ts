/**
 * licence.ts — conditioning the hit probability on a published row-6 licence (MONET.md §3.3a).
 *
 * What is pinned here is the SHAPE of the correction, not its size: the size is a calibration
 * measurement (`scripts/calibration.mjs`) and belongs in MONET.md. The shape has five parts, each
 * a test below: λ = 0 is the shipped number exactly; the correction fires on every licence the
 * log carries that the model has not discharged — whether the model still holds the constraint
 * or has dropped it, because the calibration split measured both short — and on nothing else;
 * every card of the set at that seat moves by the same factor, so no (set, seat) pair is ever
 * reordered from within; and λ interpolates monotonically between the shipped number and the
 * full conditioning without ever reaching certainty.
 */
import { describe, expect, it } from 'vitest'
import { cardBook, decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { Seat, SeatView } from '../../lib/engine/index.ts'
import { legalAsksFromView } from '../../lib/engine/helpers.ts'
import { buildKnowledge, refinedHitProbability } from '../../lib/engine/bots/knowledge.ts'
import { logLicences } from '../../lib/engine/bots/defuse.ts'
import {
  LICENCE_MIN_Z,
  licenceConditionedHitProbability,
  licenceNormaliser,
  modelHoldsLicence,
} from '../../lib/engine/bots/licence.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { validateStyle } from '../../lib/engine/bots/style.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { ask, gs, mkView } from './util.ts'

const LOW_C = cardBook('3C')

/**
 * Seat 1 asked seat 0 for 6C and missed, publishing a row-6 licence in LOW-C; seat 0 then took
 * 2C from seat 1. The deal-time constraint "seat 1 held at least one of LOW-C minus 6C" was
 * satisfied by 2C and DROPPED by knowledge.ts; 2C is now certainly at seat 0, so no member of
 * LOW-C is certainly at seat 1 — the log licence is live, the model holds nothing. This is the
 * blindness ASKING.md §4.1 measured, in one position.
 */
function droppedLicenceSpot(): SeatView {
  return mkView({
    seat: 0,
    hand: ['2C', '9D', 'TD', 'JD', 'QD', 'KD'],
    counts: [6, 9, 10, 10, 9, 10], // 6 + 9 + 10 + 10 + 9 + 10 = 54
    turn: 0,
    log: [gs, ask(1, 0, '6C', false), ask(0, 1, '2C', true)],
    config: us54Config,
  })
}

/** The same table one event earlier: the constraint is still live in the model. */
function heldLicenceSpot(): SeatView {
  return mkView({
    seat: 0,
    hand: ['9D', 'TD', 'JD', 'QD', 'KD', 'AD'],
    counts: [6, 10, 10, 10, 9, 9],
    turn: 0,
    log: [gs, ask(1, 0, '6C', false)],
    config: us54Config,
  })
}

describe('scope: the correction fires on every live, undischarged licence and nowhere else', () => {
  it('fires where the log carries the licence and the model has dropped the constraint', () => {
    const view = droppedLicenceSpot()
    const k = buildKnowledge(view, { useConstraints: true })
    const licences = logLicences(view, k)
    expect(licences(1).has(LOW_C)).toBe(true)
    expect(modelHoldsLicence(k, 1, LOW_C)).toBe(false)
    const z = licenceNormaliser(view, k, 1, LOW_C)
    expect(z).not.toBeNull()
    expect(z!).toBeGreaterThan(LICENCE_MIN_Z)
    const q = refinedHitProbability(k, '3C', 1)
    expect(q).toBeGreaterThan(0)
    expect(q).toBeLessThan(1)
    const full = licenceConditionedHitProbability(view, k, '3C', 1, 1, licences)
    expect(full).toBeCloseTo(q / z!, 12)
    expect(full).toBeGreaterThan(q)
  })

  it('fires on a licence the model still holds, on top of the first-order fold — the fold is short by 4 points, measured', () => {
    // The roadmap guessed this subset needed nothing; scripts/calibration.mjs read it at −0.0401
    // (licence.ts header). The unit fact pinned here is only that the conditioning applies.
    const view = heldLicenceSpot()
    const k = buildKnowledge(view, { useConstraints: true })
    const licences = logLicences(view, k)
    expect(licences(1).has(LOW_C)).toBe(true)
    expect(modelHoldsLicence(k, 1, LOW_C)).toBe(true)
    const q = refinedHitProbability(k, '3C', 1)
    expect(q).toBeGreaterThan(0)
    expect(licenceConditionedHitProbability(view, k, '3C', 1, 0.6, licences)).toBeGreaterThan(q)
  })

  it('does NOT fire on a seat with no licence in the asked set', () => {
    const view = droppedLicenceSpot()
    const k = buildKnowledge(view, { useConstraints: true })
    const licences = logLicences(view, k)
    // Seat 3 has never asked into anything.
    expect(licences(3).size).toBe(0)
    expect(licenceConditionedHitProbability(view, k, '3C', 3, 1, licences)).toBe(refinedHitProbability(k, '3C', 3))
  })

  it('does NOT fire on a licence the model has discharged (a member certainly at the target)', () => {
    // Seat 1 asked into LOW-C and then took 3C from seat 0: 3C is certainly at seat 1 now.
    const view = mkView({
      seat: 0,
      hand: ['9D', 'TD', 'JD', 'QD', 'KD', 'AD'],
      counts: [6, 10, 10, 10, 9, 9],
      turn: 1,
      log: [gs, ask(1, 0, '6C', false), ask(1, 0, '3C', true)],
      config: us54Config,
    })
    const k = buildKnowledge(view, { useConstraints: true })
    const licences = logLicences(view, k)
    expect(licences(1).has(LOW_C)).toBe(true)
    expect(licenceNormaliser(view, k, 1, LOW_C)).toBeNull()
    expect(licenceConditionedHitProbability(view, k, '4C', 1, 1, licences)).toBe(refinedHitProbability(k, '4C', 1))
  })
})

describe('shape: one factor per (set, seat), monotone in λ, never certainty', () => {
  it('scales every still-possible card of the set at that seat by the same factor', () => {
    const view = droppedLicenceSpot()
    const k = buildKnowledge(view, { useConstraints: true })
    const licences = logLicences(view, k)
    const ratios = (['3C', '4C', '5C', '7C'] as const)
      .map((c) => ({ q: refinedHitProbability(k, c, 1), p: licenceConditionedHitProbability(view, k, c, 1, 1, licences) }))
      .filter((x) => x.q > 0)
      .map((x) => x.p / x.q)
    expect(ratios.length).toBeGreaterThan(1)
    for (const r of ratios) expect(r).toBeCloseTo(ratios[0], 12)
    // 6C was the asked card of the miss, so seat 1 cannot hold it: nothing to scale.
    expect(refinedHitProbability(k, '6C', 1)).toBe(0)
    expect(licenceConditionedHitProbability(view, k, '6C', 1, 1, licences)).toBe(0)
  })

  it('interpolates monotonically from the shipped number at λ = 0 to the full conditioning at λ = 1', () => {
    const view = droppedLicenceSpot()
    const k = buildKnowledge(view, { useConstraints: true })
    const licences = logLicences(view, k)
    const q = refinedHitProbability(k, '3C', 1)
    let prev = q
    expect(licenceConditionedHitProbability(view, k, '3C', 1, 0, licences)).toBe(q)
    for (const lambda of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]) {
      const p = licenceConditionedHitProbability(view, k, '3C', 1, lambda, licences)
      expect(p).toBeGreaterThanOrEqual(prev)
      expect(p).toBeLessThanOrEqual(1 - 1e-9)
      prev = p
    }
  })

  it('at λ = 0 is refinedHitProbability exactly, on every legal ask of real positions', () => {
    // Real positions, driven by v0.3 itself, so the licences that arise are the ones play produces.
    const policy = monetPolicy('v0.3')
    let checked = 0
    for (let g = 0; g < 3; g++) {
      const seed = `licence-identity-${g}`
      let s = newGame(seed, us54Config, g as Seat)
      let steps = 0
      while (s.phase !== 'finished' && steps++ < 5000) {
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        if (!view.declareWindow && view.phase === 'playing') {
          const k = buildKnowledge(view, { useConstraints: true })
          const licences = logLicences(view, k)
          for (const a of legalAsksFromView(view)) {
            expect(licenceConditionedHitProbability(view, k, a.card, a.target, 0, licences)).toBe(refinedHitProbability(k, a.card, a.target))
            checked++
          }
        }
        const r = reduce(s, decide(view, policy, hashSeed(`${seed}:${s.moveIndex}`)()))
        if (!r.ok) throw new Error(r.error.code)
        s = r.state
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })
})

describe('the knob', () => {
  it('is absent from every roster style — the roster is Bass, and Bass is frozen', () => {
    for (const style of Object.values(STYLE_ROSTER)) expect(style.licenceLambda).toBeUndefined()
  })

  it('validates as a strength in 0..1, with absent as the sound off switch', () => {
    expect(validateStyle(STYLE_ROSTER.punter)).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, licenceLambda: 0.6 })).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, licenceLambda: 0 })).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, licenceLambda: 1 })).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, licenceLambda: 1.5 })).toContain('licenceLambda 1.5 outside 0..1')
    expect(validateStyle({ ...STYLE_ROSTER.punter, licenceLambda: -0.1 })).toContain('licenceLambda -0.1 outside 0..1')
  })
})
