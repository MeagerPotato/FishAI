/**
 * play-seats.test.ts — the per-seat entry point (`playGameSeats`) against the pure-team one.
 *
 * `playGame` is the measured instrument the whole matrix stands on, so the generalisation that
 * unlocks mixed compositions (BOT_LAB.md §5.3) and the FishAI v1.0 experiments must be pinned to
 * it, not merely resemble it: a pure-team call routed through `playGameSeats` has to reproduce
 * `playGame` field-for-field, or the mixed cells would be measured by a *different* instrument
 * than the matrix they are read against. The remaining tests are about the new surface only —
 * mixed teams run clean under the same health discipline, the observer sees every decision, and
 * the arity guard refuses a malformed table.
 */
import { describe, expect, it } from 'vitest'
import { playGame, playGameSeats, policyFor, seedFor, startSeatFor } from '../../lib/lab/index.ts'
import type { SeatSpec } from '../../lib/lab/index.ts'
import { ALL_SEATS, STYLE_ROSTER, seatTeam } from '../../lib/engine/index.ts'
import type { GameAction, Seat, SeatView, StyleParams, Team } from '../../lib/engine/index.ts'

const OPTS = { variant: 'us54' as const, stepCap: 5000, invariantCheck: 'every' as const }

/** The seat table `playGame` builds internally, rebuilt here by hand for the equivalence check. */
function pureSeats(a: StyleParams, b: StyleParams, aTeam: Team): SeatSpec[] {
  const policyA = policyFor(a)
  const policyB = policyFor(b)
  return ALL_SEATS.map((seat) =>
    seatTeam(seat) === aTeam ? { policy: policyA, leakStyle: a } : { policy: policyB, leakStyle: b },
  )
}

describe('playGameSeats — pure-team equivalence', () => {
  it('reproduces playGame field-for-field, both orientations, several deals', () => {
    const a = STYLE_ROSTER.balanced
    const b = STYLE_ROSTER.punter
    for (const pair of [0, 1, 2]) {
      const seed = seedFor('seats-eq', pair)
      const start = startSeatFor(pair)
      for (const orient of [0, 1] as const) {
        const viaTeams = playGame(a, b, seed, start, orient, OPTS)
        const viaSeats = playGameSeats(pureSeats(a, b, orient === 0 ? 0 : 1), seed, start, OPTS)
        expect(viaSeats).toEqual(viaTeams)
      }
    }
  })

  it('holds for the style with the heaviest special-case load (turtle)', () => {
    const a = STYLE_ROSTER.turtle
    const b = STYLE_ROSTER.hoarder
    const seed = seedFor('seats-eq-turtle', 0)
    const viaTeams = playGame(a, b, seed, 0, 0, OPTS)
    const viaSeats = playGameSeats(pureSeats(a, b, 0), seed, 0, OPTS)
    expect(viaSeats).toEqual(viaTeams)
  })
})

describe('playGameSeats — mixed compositions', () => {
  it('a 3-style team against a 3-style team runs clean under the health discipline', () => {
    // Scout + Banker + Blitz vs Ghost + Punter + Turtle — the §5.3 hypothesis composition and a
    // deliberately awkward one (Turtle's declare refusals, Punter's gambles) on the other side.
    const t0: StyleParams[] = [STYLE_ROSTER.scout, STYLE_ROSTER.banker, STYLE_ROSTER.blitz]
    const t1: StyleParams[] = [STYLE_ROSTER.ghost, STYLE_ROSTER.punter, STYLE_ROSTER.turtle]
    const seats: SeatSpec[] = ALL_SEATS.map((seat) => {
      const style = seatTeam(seat) === 0 ? t0[Math.floor(seat / 2)] : t1[Math.floor(seat / 2)]
      return { policy: policyFor(style), leakStyle: style }
    })
    for (const pair of [0, 1, 2, 3]) {
      const g = playGameSeats(seats, seedFor('seats-mixed', pair), startSeatFor(pair), OPTS)
      expect(g.finished).toBe(true)
      expect(g.capped).toBe(false)
      expect(g.illegal).toBe(0)
      expect(g.invariantViolations).toBe(0)
      expect(g.clinch).toBe(true)
      expect(g.tie).toBe(false)
      expect(g.voids).toBe(0)
    }
  })

  it('is deterministic: the same seat table and seed replay byte-identically', () => {
    const seats = pureSeats(STYLE_ROSTER.ghost, STYLE_ROSTER.archivist, 0)
    const one = playGameSeats(seats, seedFor('seats-det', 0), 2, OPTS)
    const two = playGameSeats(seats, seedFor('seats-det', 0), 2, OPTS)
    expect(JSON.stringify(two)).toBe(JSON.stringify(one))
  })
})

describe('playGameSeats — the observer and the guard', () => {
  it('observe fires once per step with the acting seat and its own view', () => {
    const seats = pureSeats(STYLE_ROSTER.balanced, STYLE_ROSTER.blitz, 0)
    const seen: { seat: Seat; action: GameAction['type'] }[] = []
    const g = playGameSeats(seats, seedFor('seats-obs', 0), 0, {
      ...OPTS,
      observe: (seat: Seat, view: SeatView, action: GameAction) => {
        // The view really is the actor's: its `seat` field and the action's must agree.
        expect(view.seat).toBe(seat)
        expect(action.seat).toBe(seat)
        seen.push({ seat, action: action.type })
      },
    })
    // No illegal action occurred (asserted), so decisions and accepted steps are one-to-one.
    expect(g.illegal).toBe(0)
    expect(seen.length).toBe(g.steps)
    // A us54 game is mostly declare-window traffic; both action families must appear.
    expect(seen.some((e) => e.action === 'ask')).toBe(true)
    expect(seen.some((e) => e.action === 'decline')).toBe(true)
  })

  it('refuses a seat table that is not exactly six seats', () => {
    const seats = pureSeats(STYLE_ROSTER.balanced, STYLE_ROSTER.blitz, 0)
    expect(() => playGameSeats(seats.slice(0, 5), seedFor('seats-bad', 0), 0, OPTS)).toThrow(TypeError)
  })
})
