/**
 * threat.ts — the cross-module pin CONCESSION.md §9 asked for.
 *
 * `threat.ts`'s `turnYield` and `contained.ts`'s `PassValuation.E` are the same quantity: cards a
 * turn yields its holder, `hits / max(1, misses)` over the public log. They used to be two
 * character-identical copies of the reduction, kept in step by hand with nothing asserting it.
 * They are now one function, and this file pins the **two production call sites to each other** —
 * `valueContainedPass(...).E` against `turnYield(view)` on the same view — rather than
 * re-implementing the arithmetic and comparing each to a third copy, which would let the two
 * production values drift apart while both still matched a stale constant.
 *
 * **What this does not catch**, stated because the first draft of this header claimed otherwise: a
 * re-inlining that reproduces the arithmetic *correctly* passes, because the two values still
 * agree. Restoring the old inlined copy verbatim was tried and this file stayed green. It catches
 * divergence, not duplication. Tests 2 and 3 below do compare against hand-written constants, and
 * deliberately so — those pin the *value* of the reduction, where test 1 pins the two call sites to
 * each other.
 */
import { describe, expect, it } from 'vitest'
import { us54Config, valueContainedPass } from '../../lib/engine/index.ts'
import type { Seat } from '../../lib/engine/index.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { turnYield } from '../../lib/engine/bots/threat.ts'
import { ask, collectBotViews, gs, mkView } from './util.ts'

describe('turnYield is the one definition of cards-per-turn', () => {
  it('pins valueContainedPass().E to turnYield() on every reachable us54 position', () => {
    const views = collectBotViews(4, us54Config)
    expect(views.length).toBeGreaterThan(100)
    // Both a same-target and a cross-target pricing: `E` is upstream of `gain` and `tempo`, so
    // this exercises it with the rest of the valuation both cancelling and not.
    let nonZero = 0
    for (const { view } of views) {
      for (const [ord, chosen] of [
        [1, 1],
        [1, 3],
        [3, 5],
      ] as [Seat, Seat][]) {
        const v = valueContainedPass(view, STYLE_ROSTER.balanced, ord, chosen, 0)
        expect(v.E).toBe(turnYield(view))
        if (v.E > 0) nonZero++
      }
    }
    // A pin that only ever compared 0 to 0 would be worthless.
    expect(nonZero).toBeGreaterThan(0)
  })

  it('agrees on the hand-built extremes, including the max(1, misses) floor', () => {
    // No asks at all: 0 hits over the floor of 1.
    const empty = mkView({ seat: 0, hand: [], counts: [0, 0, 0, 0, 0, 0], log: [gs] })
    expect(turnYield(empty)).toBe(0)
    expect(valueContainedPass(empty, STYLE_ROSTER.balanced, 1, 3, 0).E).toBe(0)

    // Three hits and no miss: the floor keeps this finite at 3 rather than dividing by zero.
    const allHits = mkView({
      seat: 0,
      hand: [],
      counts: [1, 1, 1, 1, 1, 1],
      log: [gs, ask(0, 1, '2S', true), ask(0, 3, '3S', true), ask(0, 5, '4S', true)],
    })
    expect(turnYield(allHits)).toBe(3)
    expect(valueContainedPass(allHits, STYLE_ROSTER.balanced, 1, 3, 0).E).toBe(3)

    // Two hits, four misses.
    const mixed = mkView({
      seat: 0,
      hand: [],
      counts: [1, 1, 1, 1, 1, 1],
      log: [
        gs,
        ask(0, 1, '2S', true),
        ask(1, 0, '3S', false),
        ask(2, 3, '4S', true),
        ask(3, 2, '5S', false),
        ask(4, 5, '6S', false),
        ask(5, 4, '7S', false),
      ],
    })
    expect(turnYield(mixed)).toBe(0.5)
    expect(valueContainedPass(mixed, STYLE_ROSTER.balanced, 1, 3, 0).E).toBe(0.5)
  })

  it('counts asks only — declares and other events do not move it', () => {
    const withAsks = mkView({
      seat: 0,
      hand: [],
      counts: [1, 1, 1, 1, 1, 1],
      log: [gs, ask(0, 1, '2S', true), ask(1, 0, '3S', false)],
    })
    expect(turnYield(withAsks)).toBe(1)
    // `game_started` is already in the log above and contributes nothing; adding a second
    // non-ask event must leave the ratio alone.
    const padded = mkView({
      seat: 0,
      hand: [],
      counts: [1, 1, 1, 1, 1, 1],
      log: [gs, ask(0, 1, '2S', true), gs, ask(1, 0, '3S', false), gs],
    })
    expect(turnYield(padded)).toBe(1)
    expect(valueContainedPass(padded, STYLE_ROSTER.balanced, 1, 3, 0).E).toBe(1)
  })
})
