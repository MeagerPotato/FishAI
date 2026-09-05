/**
 * chase.test.ts — MONET.md §3.8i: the chase appetite (v0.13).
 *
 * The other arm of §3.8h's gate, and this file follows §3.8h's postmortem rather than its tests:
 * **overdose the arm, read it against its own chase-free twin, assert equalities rather than
 * inequalities, and give every pin a non-vacuity counter.** v0.12's review found three pins that
 * held at the fitted dose with the mechanism deleted; a pin asserted where the property is free is
 * not a pin. Every mutation named in a comment here was run against this file on the tree and its
 * failing assertion is recorded in MONET.md §3.8i before the pre-registration was signed.
 *
 * `closing.test.ts` is deliberately untouched, so v0.12's pins stay pristine and the two rungs can
 * be read apart.
 */
import { describe, expect, it } from 'vitest'
import { decide, hashSeed, legalActionsSummary, newGame, reduce, seatView, us54Config } from '../../lib/engine/index.ts'
import type { SeatView } from '../../lib/engine/index.ts'
import { STYLE_PRESETS, validateStyle } from '../../lib/engine/index.ts'
import type { BotDifficulty, BotPolicy, StyleParams } from '../../lib/engine/index.ts'
import { buildKnowledge, holderOf, rankAsksWith } from '../../lib/engine/bots/knowledge.ts'
import type { RankedAsk } from '../../lib/engine/bots/types.ts'
import { bookCards, cardBook, seatTeam } from '../../lib/engine/cards.ts'
import { monetPolicy } from '../../lib/engine/bots/monet.ts'
import { STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { closingCredit } from '../../lib/engine/bots/closing.ts'
import { chaseActive, chaseCredit, chaseScaled } from '../../lib/engine/bots/chase.ts'
import { canonicalAction } from './action-digest.ts'

const BASE = monetPolicy('v0.9') as BotPolicy
const withStyle = (over: Partial<StyleParams>): BotPolicy => ({ skill: BASE.skill, style: { ...BASE.style, ...over } })
/** Hot enough that a firing of 700-1,400 points could not fail to move a pick. */
const HOT = withStyle({ chase: 20 })
/** The dose §3.8i expects to pick, used where a pin must also hold at a shippable dose. */
const DOSE = 2.5
const WARM = withStyle({ chase: DOSE })
const OPTS = { logWindow: BASE.skill.logWindow, useConstraints: BASE.skill.useConstraints, marginal: true }
const TIERS: BotDifficulty[] = ['easy', 'medium', 'hard']

type State = ReturnType<typeof newGame>

function play(seed: string, pol: BotPolicy, visit: (state: State, view: SeatView, seed: number) => void): void {
  let s = newGame(seed, us54Config, 0)
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const n = hashSeed(`${seed}:${s.moveIndex}`)()
    visit(s, view, n)
    const r = reduce(s, decide(view, pol, n))
    if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
    s = r.state
    steps++
  }
}

const isAskDecision = (view: SeatView): boolean => !view.declareWindow && view.phase === 'playing'
/** `pickAsk`'s own gate, read off the slot prior exactly as decide.ts reads it. */
const gateOf = (ranked: readonly RankedAsk[]): ((r: RankedAsk) => boolean) => {
  const certainAvailable = ranked.some((r) => r.p === 1)
  return (r) => certainAvailable && r.p < 1
}

describe('the chase appetite', () => {
  it('P1 — chase absent or 0, and the form switch alone, is byte identity with the base', () => {
    // kills: `style.chase ?? 0.5` or any non-zero default; `if (appetite < 0)`; `chaseActive` true
    // when the knob is absent; any re-association of the appended group.
    const zero = withStyle({ chase: 0 })
    const switchOnly = withStyle({ chaseScaled: true })
    const zeroSwitch = withStyle({ chase: 0, chaseScaled: true })
    expect(chaseActive(BASE.style)).toBe(false)
    expect(chaseActive(zero.style)).toBe(false)
    expect(chaseActive(switchOnly.style)).toBe(false)
    expect(chaseActive(HOT.style)).toBe(true)
    expect(chaseScaled(switchOnly.style)).toBe(false)
    expect(chaseScaled(HOT.style)).toBe(false)
    expect(chaseScaled(withStyle({ chase: 1, chaseScaled: true }).style)).toBe(true)
    let decisions = 0
    let zeros = 0
    for (const seed of ['chase-id-a', 'chase-id-b', 'chase-id-c']) {
      play(seed, BASE, (_s, view, n) => {
        const base = canonicalAction(decide(view, BASE, n))
        expect(canonicalAction(decide(view, zero, n))).toBe(base)
        expect(canonicalAction(decide(view, switchOnly, n))).toBe(base)
        expect(canonicalAction(decide(view, zeroSwitch, n))).toBe(base)
        decisions++
        if (!isAskDecision(view)) return
        const k = buildKnowledge(view, OPTS)
        for (const r of rankAsksWith(view, k, zero.style)) {
          // Object.is, not toBe(0): a returned -0 would flow into the sum and is a real defect.
          expect(Object.is(chaseCredit(view, k, zero.style, r, r.p, true), 0)).toBe(true)
          zeros++
        }
      })
    }
    expect(decisions).toBeGreaterThan(1000)
    expect(zeros).toBeGreaterThan(500)
  })

  it('P2 — a closing-only style still refuses to promote an uncertain ask, at any dose', () => {
    // kills: THE ARM SWAP `(gated ? closingCr : chaseCr)`. With `chase` absent that hands every
    // gated candidate the closing credit, which at 20 buys an uncertain ask outright.
    const arms: BotPolicy[] = [
      withStyle({ closing: 0.5 }),
      withStyle({ closing: 20 }),
      withStyle({ closing: 20, closingBelief: true }),
      withStyle({ closing: 20, exposure: 0.5, exposureCertain: true }),
    ]
    let checked = 0
    for (const seed of ['chase-v12-a', 'chase-v12-b']) {
      play(seed, BASE, (_s, view, n) => {
        if (!isAskDecision(view)) return
        const k = buildKnowledge(view, OPTS)
        const ranked = rankAsksWith(view, k, BASE.style)
        if (!ranked.some((r) => r.p === 1)) return
        for (const pol of arms) {
          const a = decide(view, pol, n)
          expect(a.type).toBe('ask')
          if (a.type !== 'ask') continue
          expect(ranked.find((r) => r.card === a.card && r.target === a.target)?.p).toBe(1)
          checked++
        }
      })
    }
    expect(checked).toBeGreaterThan(120)
  })

  it('P3 — the credit is refused for every ungated candidate on the module\'s own account', () => {
    // kills: deleting `if (!gated) return 0`. The hook would still zero it today, so this is the
    // guard that survives a hook edit and a future third caller.
    let ungated = 0
    let gatedPaid = 0
    play('chase-partition', HOT, (_s, view) => {
      if (!isAskDecision(view)) return
      const k = buildKnowledge(view, OPTS)
      const ranked = rankAsksWith(view, k, HOT.style)
      const gated = gateOf(ranked)
      for (const r of ranked) {
        if (gated(r)) {
          if (chaseCredit(view, k, HOT.style, r, r.p, true) > 0) gatedPaid++
          continue
        }
        expect(chaseCredit(view, k, HOT.style, r, r.p, false)).toBe(0)
        ungated++
      }
    })
    expect(ungated).toBeGreaterThan(500)
    expect(gatedPaid).toBeGreaterThan(20)
  })

  it('P4 — the scaled form equals v0.12\'s credit candidate for candidate, and flat is it divided by p', () => {
    // kills: any guard drift between chase.ts and closing.ts - `horizon` written `size / 2` or
    // `size - floor(size / 2)`, `outstanding` counting the asked card, `Math.min(1, lock)` dropped,
    // the resolved-book or teammate-owner guard deleted in one file and not the other.
    const flat = withStyle({ chase: 1, closing: 1 })
    const scaled = withStyle({ chase: 1, chaseScaled: true, closing: 1 })
    let compared = 0
    let paid = 0
    const lockSeen = new Set<number>()
    play('chase-equal', flat, (_s, view) => {
      if (!isAskDecision(view)) return
      const k = buildKnowledge(view, OPTS)
      const ranked = rankAsksWith(view, k, flat.style)
      const gated = gateOf(ranked)
      for (const r of ranked) {
        if (!gated(r)) continue
        const closer = closingCredit(view, k, flat.style, r, r.p)
        expect(chaseCredit(view, k, scaled.style, r, r.p, true)).toBeCloseTo(closer, 12)
        expect(chaseCredit(view, k, flat.style, r, r.p, true) * r.p).toBeCloseTo(closer, 12)
        compared++
        if (closer > 0) {
          paid++
          lockSeen.add(Math.round((closer / (flat.style.wHit * r.p)) * 2))
        }
      }
    })
    expect(compared).toBeGreaterThan(500)
    expect(paid).toBeGreaterThan(20)
    // both rungs of the ramp are exercised, so the equality is not pinned on one of them
    expect(lockSeen.has(1)).toBe(true)
    expect(lockSeen.has(2)).toBe(true)
  })

  it('P5 — closingBelief does not reach the chase credit', () => {
    // kills: `closingPicture(view, k, ask.card, closingBelief(style))` - dragging §3.8g's R1
    // miscalibration, the form that lost on six seeds of six, into the new credit.
    const plain = withStyle({ chase: 4 })
    const believing = withStyle({ chase: 4, closing: 1, closingBelief: true })
    let compared = 0
    let softer = 0
    play('chase-belief', plain, (_s, view) => {
      if (!isAskDecision(view)) return
      const k = buildKnowledge(view, OPTS)
      const ranked = rankAsksWith(view, k, plain.style)
      const gated = gateOf(ranked)
      for (const r of ranked) {
        if (!gated(r)) continue
        expect(chaseCredit(view, k, believing.style, r, r.p, true)).toBe(chaseCredit(view, k, plain.style, r, r.p, true))
        // non-vacuity: the belief walk really would have given a different answer here
        if (closingCredit(view, k, withStyle({ closing: 1, closingBelief: true }).style, r, r.p) > closingCredit(view, k, withStyle({ closing: 1 }).style, r, r.p) + 1e-12) softer++
        compared++
      }
    })
    expect(compared).toBeGreaterThan(500)
    expect(softer).toBeGreaterThan(50)
  })

  it('P6 — the flat credit is identical across every target of one card, so it cannot pick the target', () => {
    // kills: any `ask.target` dependence. MONET.md §3.8g's best-target gap is explicitly OUTSIDE
    // this rung; a credit that reordered targets would fold a second mechanism into the dose.
    // The `0 < p < 1` scoping is required: targets outside `cand` carry p 0 and credit 0, so an
    // unscoped equality is false on real data.
    const hot = withStyle({ chase: 4 })
    const scaledHot = withStyle({ chase: 4, chaseScaled: true })
    let pairs = 0
    let scaledDiffer = 0
    play('chase-target', hot, (_s, view) => {
      if (!isAskDecision(view)) return
      const k = buildKnowledge(view, OPTS)
      const ranked = rankAsksWith(view, k, hot.style)
      const gated = gateOf(ranked)
      const byCard = new Map<string, RankedAsk[]>()
      for (const r of ranked) {
        if (!gated(r) || !(r.p > 0) || r.p >= 1) continue
        const list = byCard.get(r.card) ?? []
        list.push(r)
        byCard.set(r.card, list)
      }
      for (const list of byCard.values()) {
        for (let i = 1; i < list.length; i++) {
          const a = chaseCredit(view, k, hot.style, list[0], list[0].p, true)
          const b = chaseCredit(view, k, hot.style, list[i], list[i].p, true)
          expect(a).toBe(b)
          pairs++
          const sa = chaseCredit(view, k, scaledHot.style, list[0], list[0].p, true)
          const sb = chaseCredit(view, k, scaledHot.style, list[i], list[i].p, true)
          if (a > 0 && Math.abs(sa - sb) > 1e-12) scaledDiffer++
        }
      }
    })
    expect(pairs).toBeGreaterThan(100)
    // the companion: the scaled form DOES vary with the target, which is what makes the flat
    // form's invariance a property of the form and not of the population
    expect(scaledDiffer).toBeGreaterThan(0)
  })

  it('P7 — the credit is non-decreasing in p under both forms', () => {
    // kills: any `(1 - p)` or `1 / p` weight. Two targets of one card share `progress` and
    // `narrowing`, so a credit falling in `p` would rank the opponent LESS likely to hold the card
    // first - on a base already behind SESTINA on best-target accuracy.
    const hot = withStyle({ chase: 4 })
    const scaledHot = withStyle({ chase: 4, chaseScaled: true })
    const sweep = [0.05, 0.15, 0.25, 0.35, 0.5, 0.65, 0.8, 0.95]
    let swept = 0
    play('chase-monotone', hot, (_s, view) => {
      if (!isAskDecision(view)) return
      const k = buildKnowledge(view, OPTS)
      const ranked = rankAsksWith(view, k, hot.style)
      const gated = gateOf(ranked)
      for (const r of ranked) {
        if (!gated(r)) continue
        if (!(chaseCredit(view, k, hot.style, r, 0.5, true) > 0)) continue
        for (const style of [hot.style, scaledHot.style]) {
          let prev = -Infinity
          for (const p of sweep) {
            const v = chaseCredit(view, k, style, r, p, true)
            expect(v).toBeGreaterThanOrEqual(prev - 1e-12)
            prev = v
          }
        }
        swept++
      }
    })
    expect(swept).toBeGreaterThan(50)
  })

  it('P8 — the crossing is live: the arm really does take an uncertain ask over a legal certain hit', () => {
    // kills: deleting `+ chaseCr` or restoring `(gated ? 0 : closingCr)`; `if (gated) return 0`;
    // `chaseCredit` returning 0 unconditionally. WITHOUT THIS PIN A COMPLETELY INERT RUNG PASSES
    // EVERY OTHER TEST IN THIS FILE - it is the inverse of the gate test §3.8h's arm lacked.
    for (const [pol, floor] of [[HOT, 20] as const, [WARM, 1] as const]) {
      let crossings = 0
      for (const seed of ['chase-cross-a', 'chase-cross-b', 'chase-cross-c']) {
        play(seed, BASE, (_s, view, n) => {
          if (!isAskDecision(view)) return
          const k = buildKnowledge(view, OPTS)
          const ranked = rankAsksWith(view, k, BASE.style)
          if (!ranked.some((r) => r.p === 1)) return
          const b = decide(view, BASE, n)
          if (b.type !== 'ask' || ranked.find((r) => r.card === b.card && r.target === b.target)?.p !== 1) return
          const a = decide(view, pol, n)
          if (a.type !== 'ask') return
          const picked = ranked.find((r) => r.card === a.card && r.target === a.target)
          if (picked === undefined || picked.p === 1) return
          // every crossing is bought by this credit and by nothing else
          expect(chaseCredit(view, k, pol.style, picked, picked.p, true)).toBeGreaterThan(0)
          crossings++
        })
      }
      expect(crossings).toBeGreaterThanOrEqual(floor)
    }
  })

  it('P9 — the priced ungating switch cannot reach this credit', () => {
    // kills: `chaseCredit(..., gated && !ungated)`, which with the switch live makes the credit
    // identically 0. The LIVE `exposure` is load-bearing: `pricedUngated` needs BOTH fields, and
    // §3.8h's review found the v0.12 version of this test setting `exposure` 0 and so comparing a
    // policy against itself.
    const priced = withStyle({ chase: 20, exposure: 0.5, exposureCertain: true })
    // The twin is the SAME priced policy without the appetite. Counting the chase arm's crossings
    // alone would not kill the mutation: with `exposureCertain` live the priced group is ungated
    // too and buys crossings of its own, so the count stays positive with the credit dead. The
    // crossings this pin needs are the ones the twin does NOT make.
    const twin = withStyle({ exposure: 0.5, exposureCertain: true })
    let crossings = 0
    let ungatedZero = 0
    for (const seed of ['chase-priced-a', 'chase-priced-b', 'chase-priced-c']) {
      play(seed, BASE, (_s, view, n) => {
        if (!isAskDecision(view)) return
        const k = buildKnowledge(view, OPTS)
        const ranked = rankAsksWith(view, k, priced.style)
        const gated = gateOf(ranked)
        for (const r of ranked) {
          if (gated(r)) continue
          expect(chaseCredit(view, k, priced.style, r, r.p, false)).toBe(0)
          ungatedZero++
        }
        if (!ranked.some((r) => r.p === 1)) return
        const t = decide(view, twin, n)
        if (t.type !== 'ask' || ranked.find((r) => r.card === t.card && r.target === t.target)?.p !== 1) return
        const a = decide(view, priced, n)
        if (a.type !== 'ask') return
        const picked = ranked.find((r) => r.card === a.card && r.target === a.target)
        if (picked === undefined || picked.p === 1) return
        expect(chaseCredit(view, k, priced.style, picked, picked.p, true)).toBeGreaterThan(0)
        crossings++
      })
    }
    expect(ungatedZero).toBeGreaterThan(500)
    expect(crossings).toBeGreaterThan(0)
  })

  it('P10 — with no certain hit on the table the arm plays the base decision exactly', () => {
    // kills: the hook made unconditional, or `chaseCr` added outside the ternary. At 20 the credit
    // is 700-1,400 points, so a firing outside its population could not pass by accident. This is
    // what proves the two appetites PARTITION rather than overlap.
    let noCertain = 0
    for (const seed of ['chase-confine-a', 'chase-confine-b', 'chase-confine-c', 'chase-confine-d']) {
      play(seed, BASE, (_s, view, n) => {
        if (!isAskDecision(view)) return
        const k = buildKnowledge(view, OPTS)
        if (rankAsksWith(view, k, BASE.style).some((r) => r.p === 1)) return
        expect(canonicalAction(decide(view, HOT, n))).toBe(canonicalAction(decide(view, BASE, n)))
        noCertain++
      })
    }
    expect(noCertain).toBeGreaterThan(200)
  })

  it('P11 — the zeroes and the bound, each with a non-zero occurrence count', () => {
    // kills: dropping `if (!(p > 0)) return 0` - the FLAT form has no `p` in its product, so
    // without that line a known miss collects the whole 1,400 points; `minHitP` 1e-9 normally
    // hides that mutation and it escapes only in the waived-floor branch, which is exactly why it
    // needs a unit pin. Also: dropping the `p >= 1` refusal, the resolved-book guard, the
    // teammate-owner guard, or `Math.min(1, lock)`.
    const CEIL = 20 * BASE.style.wHit
    let zeroP = 0
    let oneP = 0
    let resolved = 0
    let teammate = 0
    let tooFew = 0
    let paid = 0
    play('chase-zeroes', HOT, (_s, view) => {
      if (!isAskDecision(view)) return
      const k = buildKnowledge(view, OPTS)
      const me = seatTeam(view.seat)
      const ranked = rankAsksWith(view, k, HOT.style)
      for (const r of ranked) {
        const cr = chaseCredit(view, k, HOT.style, r, r.p, true)
        expect(cr).toBeGreaterThanOrEqual(0)
        expect(cr).toBeLessThanOrEqual(CEIL + 1e-9)
        expect(chaseCredit(view, k, HOT.style, r, 0, true)).toBe(0)
        zeroP++
        expect(chaseCredit(view, k, HOT.style, r, 1, true)).toBe(0)
        oneP++
        const book = cardBook(r.card)
        const owner = holderOf(k, r.card)
        if (owner !== null && seatTeam(owner) === me) { expect(cr).toBe(0); teammate++ }
        // the seat-known own-side holding, counted independently of both modules
        let known = 0
        for (const c of bookCards(book, view.config)) {
          if (c === r.card) continue
          const h = holderOf(k, c)
          if (h !== null && seatTeam(h) === me) known++
        }
        if (cr > 0) {
          expect(known).toBeGreaterThanOrEqual(4)
          expect(view.books[book]).toBeFalsy()
          paid++
        } else if (r.p > 0 && r.p < 1 && !view.books[book] && (owner === null || seatTeam(owner) !== me)) {
          expect(known).toBeLessThan(4)
          tooFew++
        }
      }
      resolved += Object.keys(view.books).length
    })
    expect(zeroP).toBeGreaterThan(500)
    expect(oneP).toBeGreaterThan(500)
    expect(teammate).toBeGreaterThan(0)
    expect(tooFew).toBeGreaterThan(100)
    expect(resolved).toBeGreaterThan(0)
    expect(paid).toBeGreaterThan(20)
  })

  it('P12 — validateStyle rejects a negative appetite and a non-boolean form switch', () => {
    // kills: a dropped clause; `>= 0` written `> 0` (the {chase: 0} acceptance catches it); the
    // Number.isFinite half dropped.
    expect(validateStyle(HOT.style)).toEqual([])
    expect(validateStyle(WARM.style)).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, chase: 0 })).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, chase: DOSE, chaseScaled: true })).toEqual([])
    expect(validateStyle({ ...STYLE_ROSTER.punter, chase: -0.1 })).toContain('chase -0.1 is not a number >= 0')
    expect(validateStyle({ ...STYLE_ROSTER.punter, chase: Number.NaN })).toContain('chase NaN is not a number >= 0')
    expect(validateStyle({ ...STYLE_ROSTER.punter, chase: '1' as unknown as number })).toContain('chase 1 is not a number >= 0')
    expect(validateStyle({ ...STYLE_ROSTER.punter, chaseScaled: 1 as unknown as boolean })).toContain('chaseScaled 1 is not a boolean')
  })

  it('P13 — both knobs are absent from every roster style and every difficulty tier', () => {
    // kills: adding a knob to a preset or roster style; and pinning `chase: 0` in BASELINE, which
    // would make the key DEFINED on every tier and quietly break the absence pin.
    for (const [id, style] of Object.entries(STYLE_ROSTER) as [string, StyleParams][]) {
      expect(style.chase, id).toBeUndefined()
      expect(style.chaseScaled, id).toBeUndefined()
    }
    for (const t of TIERS) {
      expect(STYLE_PRESETS[t].chase, t).toBeUndefined()
      expect(STYLE_PRESETS[t].chaseScaled, t).toBeUndefined()
    }
  })

  it('P15 — liveness at the shippable dose, and the play is deterministic', () => {
    // kills: shipping a vacuous dose; any nondeterminism.
    let asks = 0
    let moved = 0
    const first: string[] = []
    play('chase-live', WARM, (_s, view, n) => {
      if (!isAskDecision(view)) return
      asks++
      const a = canonicalAction(decide(view, WARM, n))
      if (a !== canonicalAction(decide(view, BASE, n))) moved++
      if (first.length < 40) first.push(a)
    })
    expect(asks).toBeGreaterThan(30)
    expect(moved).toBeGreaterThan(0)
    const again: string[] = []
    play('chase-live', WARM, (_s, view, n) => {
      if (!isAskDecision(view)) return
      if (again.length < 40) again.push(canonicalAction(decide(view, WARM, n)))
    })
    expect(again).toEqual(first)
  })
})
