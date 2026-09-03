/**
 * The Monet version registry, and the banks the versions are pinned by.
 *
 * [MONET.md](../../MONET.md) §3.1 gave v0.1 exactly one behavioural acceptance criterion: **byte
 * identity to Bass v2.0**, 0 action mismatches, "a pass/fail with no floor: one mismatch fails
 * it". §3.2 then shipped v0.2, which is a `minHitP` **spec** change on the roster plus two
 * `rankAsksWith` **code** corrections — and that combination changed what this file can honestly
 * assert. The change is worth stating plainly, because the previous version of this file asserted
 * the old thing and went red.
 *
 * ## What v0.2 did to v0.1's pin
 *
 * v0.1's identity claim was carried by three mechanisms, and the spec change broke the first two:
 *
 *  1. **The by-reference registry binding.** `MONET_VERSIONS['v0.1']` used to hold
 *     `STYLE_ROSTER.punter` itself, so that an edit to `roster.ts` was an edit to v0.1 by
 *     construction. v0.2 edited `roster.ts`, which silently turned `monetPolicy('v0.1')` into
 *     v0.2's policy. v0.1 now pins `minHitP: 0` explicitly and v0.2 takes the by-reference slot.
 *     The deviation set is pinned below: v0.1's style must differ from the live Punter in
 *     `minHitP` and nothing else, so the NEXT roster spec change fails a test rather than
 *     re-labelling a measurement.
 *  2. **The v0.1 action bank.** `data/monet-v01-bank.ts` digests whole games, and the two scoring
 *     corrections move the asks whose hit probability is 0. One such choice re-deals every
 *     position after it, so 13 of the bank's 27 games diverge on this tree **even with v0.1's spec
 *     restored** — measured, and unchanged by the spec pin, which is how we know it is the code
 *     and not the knob. No pin of the registry can make that bank green again, so it is not
 *     replayed here. It stays committed, untouched, as the record of what v0.1 played; the
 *     assertions below check that the record is intact and say where its live claim went.
 *  3. **The cross-revision sweep.** `scripts/byte-identity.mjs` is the only mechanism that
 *     survives, because it is the only one that can materialise another revision. The v0.1 claim
 *     now lives there in its re-scoped, still-true form — `--gate dead-ask-full`: over one
 *     v0.1-driven trajectory, **every ask with p > 0 is unchanged** across the whole milestone.
 *     0 mismatches over 20,048 protected asks, with 910 dead asks moved. [measured, home]
 *
 * ## What this file asserts instead
 *
 *  1. **Structural.** Both registry entries, by reference where that is the truth and by pinned
 *     value where it is not, plus the deviation set that keeps the pinned one from drifting.
 *  2. **The two versions are actually two.** A registry that named v0.2 but resolved it to v0.1's
 *     policy would pass every structural assertion above, so one real position is played through
 *     `decide` and the two versions must choose differently on it.
 *  3. **In-graph behavioural.** Whole games, all nine roster styles at the table, `decide` called
 *     on Monet v0.2 and on the live roster arm at every decision point and the two `GameAction`s
 *     compared exactly — in *both* forms the arm is ever addressed in: the explicit
 *     `{ skill: hard, style: punter }` pair and the bare `STYLE_ROSTER.punter` that `resolvePolicy`
 *     plays at full strength (STYLES.md §2).
 *  4. **Cross-session, from a committed fixture.** (3) alone **cannot fail on a `decide.ts`
 *     regression**: both of its arms are the same imported `decide`, so any edit moves them
 *     together and the suite stays green while the describe title goes on claiming identity. What
 *     it really verifies is that `monetPolicy('v0.2')` resolves to `{ hard, punter }` — which is
 *     (1). So the same games are replayed against `data/monet-v02-bank.ts`, a per-game digest
 *     recorded at the revision v0.2 shipped. That fixture is a FORWARD baseline: it certifies
 *     nothing about an earlier revision (it was recorded from the tree it is replayed against),
 *     and its warrant is the §3.2 gates that ran before it was emitted. What it buys is that a
 *     regression a month from now still has something to break.
 *
 * The position bank is the roster mirror rather than a Punter mirror alone. A style that plays
 * itself visits a narrow set of positions, and the claim is about the *policy*, which must hold at
 * every position `us54` can produce — including the ones Punter's own play never reaches. Nine
 * styles × four seeds keeps that broad while staying inside a few seconds: 36 games, 25,838
 * decisions and 51,840 in-graph comparisons.
 *
 * **A red digest is not a test to fix.** It is the report that the version no longer plays the
 * games it was accepted for. Regenerating a bank to make it green deletes the only evidence that
 * the version ever was what it says it was.
 */
import { describe, expect, it } from 'vitest'
import {
  decide,
  hashSeed,
  legalActionsSummary,
  newGame,
  reduce,
  seatView,
  us54Config,
} from '../../lib/engine/index.ts'
import type { PolicySpec, Seat, SeatView } from '../../lib/engine/index.ts'
import type { BotPolicy, StyleParams } from '../../lib/engine/bots/style.ts'
import { STYLE_IDS, STYLE_ROSTER } from '../../lib/engine/bots/roster.ts'
import { SKILL_PRESETS } from '../../lib/engine/bots/style.ts'
import {
  MONET_VERSIONS,
  MONET_VERSION_IDS,
  isMonetVersion,
  monetPolicy,
} from '../../lib/engine/bots/monet.ts'
import type { MonetVersion } from '../../lib/engine/bots/monet.ts'
import { ActionDigest, canonicalAction } from './action-digest.ts'
import { MONET_V01_BANK } from './data/monet-v01-bank.ts'
import { MONET_V02_BANK } from './data/monet-v02-bank.ts'
import { MONET_V04A_BANK } from './data/monet-v04a-bank.ts'
import { MONET_V04B_BANK } from './data/monet-v04b-bank.ts'
import { ask, gs, mkView } from './util.ts'

/** The versions, addressed the way a harness addresses them. */
const MONET_V01: PolicySpec = monetPolicy('v0.1')
const MONET_V02: PolicySpec = monetPolicy('v0.2')
const MONET_V03: PolicySpec = monetPolicy('v0.3')
const MONET_V04A: PolicySpec = monetPolicy('v0.4a')
const MONET_V04B: PolicySpec = monetPolicy('v0.4b')

/**
 * The live roster arm, in both spellings — written out, never read from the registry.
 * MONET.md §1.1: `STYLE_ROSTER.punter` at `SKILL_PRESETS.hard`. Since §3.2 that arm is **v0.2**.
 */
const LIVE_ARMS: { name: string; policy: PolicySpec }[] = [
  { name: 'explicit { skill: hard, style: punter }', policy: { skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter } },
  { name: 'bare punter, played at full strength', policy: STYLE_ROSTER.punter },
]

/* ------------------------------------------------------ 1. the structural pin --- */

/** Narrow the registry's `PolicySpec` to the `{ skill, style }` pair both versions are required to be. */
function asPair(spec: PolicySpec, ctx: string): BotPolicy {
  if (typeof spec !== 'object' || spec === null || !('skill' in spec) || !('style' in spec)) {
    throw new Error(`${ctx}: expected an explicit { skill, style } pair, got ${JSON.stringify(spec)}`)
  }
  return spec
}

/** Every key on which two style vectors disagree, in a stable order. */
function styleDiffKeys(a: StyleParams, b: StyleParams): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].filter((k) => !Object.is(a[k as keyof StyleParams], b[k as keyof StyleParams])).sort()
}

describe('the Monet version registry names each version and resolves it to that version', () => {
  it('v0.2 IS the live roster arm, bound by reference so it cannot drift from it', () => {
    const pair = asPair(MONET_V02, "MONET_VERSIONS['v0.2']")
    // `toBe`, not `toEqual`: a copy of Punter's numbers would pass a value comparison and would
    // then be free to diverge from roster.ts on the next edit. That is the failure this pins, and
    // it is now v0.2's to carry — v0.2 is what the live roster is.
    expect(pair.style).toBe(STYLE_ROSTER.punter)
    expect(pair.skill).toBe(SKILL_PRESETS.hard)
  })

  it('v0.1 is that same arm with minHitP pinned to 0 — and differs from it in NOTHING else', () => {
    const pair = asPair(MONET_V01, "MONET_VERSIONS['v0.1']")
    expect(pair.skill).toBe(SKILL_PRESETS.hard)
    // The whole hazard of spelling v0.1 as a spread. Every key it does not override still tracks
    // the live roster, so a future roster spec change would move v0.1 again exactly the way §3.2's
    // did. Pinning the deviation SET rather than the one value is what turns that into a failing
    // test: widen the gap and this line names the new key.
    expect(styleDiffKeys(pair.style, STYLE_ROSTER.punter)).toEqual(['minHitP'])
    expect(pair.style.minHitP).toBe(0)
    expect(STYLE_ROSTER.punter.minHitP).toBe(1e-9)
  })

  it('v0.3 is the live arm with licenceLambda 0.6 on its own vector — and differs from it in NOTHING else', () => {
    const pair = asPair(MONET_V03, "MONET_VERSIONS['v0.3']")
    expect(pair.skill).toBe(SKILL_PRESETS.hard)
    // MONET.md §3.3a's knob lives on Monet's vector and not on the roster: Bass is frozen, and a
    // knob on the BALANCED base would move every Bass style the way `minHitP` did at v0.2. The
    // deviation SET is pinned for the same reason v0.1's is — widen it and this line names the key.
    expect(styleDiffKeys(pair.style, STYLE_ROSTER.punter)).toEqual(['licenceLambda'])
    expect(pair.style.licenceLambda).toBe(0.6)
    expect(STYLE_ROSTER.punter.licenceLambda).toBeUndefined()
    expect(Object.isFrozen(pair.style)).toBe(true)
  })

  it('v0.4b is v0.4a plus the joint, on its own vector — and differs from v0.4a in NOTHING else', () => {
    const pair = asPair(MONET_V04B, "MONET_VERSIONS['v0.4b']")
    expect(pair.skill).toBe(SKILL_PRESETS.hard)
    expect(styleDiffKeys(pair.style, (MONET_V04A as BotPolicy).style)).toEqual(['pAssignment'])
    expect(pair.style.pAssignment).toBe('joint')
    expect(pair.style.pModel).toBe('marginal')
    // §3.4b item 2's knob stays off the vector until the pre-registered rule admits it, so the
    // rung's own cell is the 'joint' mechanism alone; and v0.3's licence term is still out.
    expect(pair.style.claimOwnership).toBeUndefined()
    expect(pair.style.licenceLambda).toBeUndefined()
    expect(STYLE_ROSTER.punter.pAssignment).toBeUndefined()
    expect(STYLE_ROSTER.punter.claimOwnership).toBeUndefined()
    expect(styleDiffKeys(pair.style, STYLE_ROSTER.punter)).toEqual(['pAssignment', 'pModel'])
  })

  it('v0.4a is Punter plus the marginal, on its own vector — and differs from Punter in NOTHING else', () => {
    const pair = asPair(MONET_V04A, "MONET_VERSIONS['v0.4a']")
    expect(pair.skill).toBe(SKILL_PRESETS.hard)
    // MONET.md §3.4a: the probability model is a knob on Monet's vector, absent on the roster —
    // the same reason v0.3's knob lives here. The deviation SET from Punter is pinned in full.
    expect(styleDiffKeys(pair.style, STYLE_ROSTER.punter)).toEqual(['pModel'])
    expect(pair.style.pModel).toBe('marginal')
    expect(STYLE_ROSTER.punter.pModel).toBeUndefined()
    // v0.3's licence term is NOT on this vector: MONET.md §3.4a item 8 measured it inside the floor
    // on the marginal base and the pre-registered rule took it out. So v0.4a differs from v0.3 in
    // two keys — the model added, the term removed — and the 2 × 2 on the record is what makes the
    // pair readable, not this pin.
    expect(pair.style.licenceLambda).toBeUndefined()
    expect(styleDiffKeys(pair.style, (MONET_V03 as BotPolicy).style)).toEqual(['licenceLambda', 'pModel'])
    expect(Object.isFrozen(pair.style)).toBe(true)
  })

  it('v0.1 carries the knobs MONET.md §1.1 names for the baseline arm', () => {
    const pair = asPair(MONET_V01, "MONET_VERSIONS['v0.1']")
    expect(pair.style.id).toBe('punter')
    expect(pair.style.declareThreshold).toBe(0.775)
    expect(pair.style.declareMaxUncertain).toBe(2)
    // `defuse` is not per-style — it sits on roster.ts's BALANCED base and reaches Punter through
    // `style()`. §1.1 calls it out precisely because the spread is what carries it.
    expect(pair.style.defuse).toBe(1)
    expect(pair.skill.id).toBe('hard')
    expect(pair.skill.refinedInference).toBe(true)
    expect(pair.skill.errorRate).toBe(0)
  })

  it('is frozen all the way down, and the accessor hands back the registry object itself', () => {
    expect(Object.isFrozen(MONET_VERSIONS)).toBe(true)
    for (const id of MONET_VERSION_IDS) {
      expect(Object.isFrozen(MONET_VERSIONS[id]), `${id}`).toBe(true)
      expect(monetPolicy(id)).toBe(MONET_VERSIONS[id])
    }
    // v0.1's style is a fresh object rather than a shared roster entry, so it needs its own freeze
    // — an unfrozen pinned vector is a pin anyone can move.
    expect(Object.isFrozen(asPair(MONET_V01, 'v0.1').style)).toBe(true)
  })

  it('MONET_VERSION_IDS lists every shipped version, in order, and nothing else', () => {
    expect([...MONET_VERSION_IDS]).toEqual(Object.keys(MONET_VERSIONS))
    expect([...MONET_VERSION_IDS]).toEqual(['v0.1', 'v0.2', 'v0.3', 'v0.4a', 'v0.4b'])
    expect(MONET_VERSION_IDS.every((v) => isMonetVersion(v))).toBe(true)
  })

  it('refuses an unshipped id rather than degrading to some default version', () => {
    expect(isMonetVersion('v0.5')).toBe(false)
    // Inherited keys are not versions — `MONET_VERSIONS['toString']` is a function, not `undefined`.
    expect(isMonetVersion('toString')).toBe(false)
    expect(() => monetPolicy('v0.5' as MonetVersion)).toThrow(RangeError)
    expect(() => monetPolicy('toString' as MonetVersion)).toThrow(RangeError)
  })
})

/* -------------------------------------------- 2. the two versions are actually two --- */

/**
 * The dead-ask spot of `roster.test.ts`, restated here because this file must not depend on that
 * one. Seat 0 holds five of LOW-C and three recorded misses pin `6C` to `{2, 4}` — both of them
 * seat 0's teammates, since the seats alternate — so every legal `6C` ask is a miss this seat can
 * prove from its own knowledge, and it still outscores every live ask on the board.
 */
function deadAskSpot(): SeatView {
  return mkView({
    seat: 0,
    hand: ['2C', '3C', '4C', '5C', '7C', '9D'],
    counts: [6, 10, 10, 10, 6, 12], // 6 + 10 + 10 + 10 + 6 + 12 = 54
    turn: 0,
    log: [gs, ask(0, 1, '6C', false), ask(0, 3, '6C', false), ask(0, 5, '6C', false)],
    config: us54Config,
  })
}

describe('v0.1 and v0.2 are two different policies, not one policy under two labels', () => {
  it('choose differently at the position MONET.md §3.2 is about', () => {
    // The structural assertions above are all value comparisons: a registry that resolved both ids
    // to the same object would fail them, but a registry whose two entries differed in some key
    // `decide` never reads would pass them and still measure one policy under two names. This is
    // the assertion that requires the difference to reach the board.
    const view = deadAskSpot()
    const seed = hashSeed('monet-version-distinctness')()
    const v01 = decide(view, MONET_V01, seed)
    const v02 = decide(view, MONET_V02, seed)
    // v0.1 takes the provable miss, because `minHitP: 0` does not filter it out. That is precisely
    // the defect §3.2 ships to remove, and it is what the arm labelled v0.1 must keep doing.
    expect(v01).toEqual({ type: 'ask', seat: 0, target: 1, card: '6C' })
    // v0.2 refuses it and takes a live ask instead.
    expect(v02.type).toBe('ask')
    expect(canonicalAction(v01)).not.toBe(canonicalAction(v02))
  })
})

describe('v0.4a and v0.3 are two different policies, and nearly the same one', () => {
  it('choose differently on a measurable minority of real decisions, and alike on the rest', () => {
    // The registry says v0.4a is Punter plus `pModel: 'marginal'` (and without v0.3's licence
    // term); this is the check that the table reaches the board. Six v0.4a-driven mirror games,
    // v0.3 asked at every position. The share that moves is a property of how often the scaled
    // table reorders the top of the ranking plus what the licence term used to move, and the
    // ceiling on it is a sanity bar, not a measurement (the measurement is MONET.md §3.4a).
    let decisions = 0
    let differ = 0
    for (let g = 0; g < 6; g++) {
      const seed = `monet-v04a-diverge-${g}`
      let s = newGame(seed, us54Config, g as Seat)
      let steps = 0
      while (s.phase !== 'finished') {
        if (steps++ >= 5000) throw new Error(`${seed}: step cap`)
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
        const a4 = decide(view, MONET_V04A, moveSeed)
        const a3 = decide(view, MONET_V03, moveSeed)
        decisions++
        if (canonicalAction(a4) !== canonicalAction(a3)) differ++
        const r = reduce(s, a4)
        if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
        s = r.state
      }
    }
    expect(decisions).toBeGreaterThan(3_000)
    expect(differ).toBeGreaterThan(0)
    expect(differ / decisions).toBeLessThan(0.2)
  })
})

describe('v0.3 and v0.2 are two different policies, and nearly the same one', () => {
  it('choose differently on a measurable minority of real decisions, and alike on the rest', () => {
    // The registry says v0.3 is v0.2 plus `licenceLambda: 0.6`; this is the check that the knob
    // reaches the board. Six v0.3-driven mirror games, v0.2 asked at every position. The share
    // that moves is a property of the conditioning (licensed asks only, one factor per set and
    // seat) and is small; the floor on agreement is a sanity bar, not a measurement.
    let decisions = 0
    let differ = 0
    for (let g = 0; g < 6; g++) {
      const seed = `monet-v03-diverge-${g}`
      let s = newGame(seed, us54Config, g as Seat)
      let steps = 0
      while (s.phase !== 'finished') {
        if (steps++ >= 5000) throw new Error(`${seed}: step cap`)
        const { seat } = legalActionsSummary(s)
        const view = seatView(s, seat)
        const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
        const a3 = decide(view, MONET_V03, moveSeed)
        const a2 = decide(view, MONET_V02, moveSeed)
        decisions++
        if (canonicalAction(a3) !== canonicalAction(a2)) differ++
        const r = reduce(s, a3)
        if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
        s = r.state
      }
    }
    expect(decisions).toBeGreaterThan(3_000)
    expect(differ).toBeGreaterThan(0)
    expect(differ / decisions).toBeLessThan(0.1)
  })
})

/**
 * Drive whole mirror games with `driver` and ask `other` at every position; count the decisions
 * that differ and check each one against `admissible`. The positions visited are the driver's
 * own, so the comparison is a read of the same `SeatView` and seed.
 */
function divergence(
  seeds: string[],
  driver: PolicySpec,
  other: PolicySpec,
  admissible: (drove: GameAction, alt: GameAction) => boolean,
): { decisions: number; differ: number } {
  let decisions = 0
  let differ = 0
  for (const seed of seeds) {
    let s = newGame(seed, us54Config, 0)
    let steps = 0
    while (s.phase !== 'finished' && steps++ < 5000) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
      const drove = decide(view, driver, moveSeed)
      const alt = decide(view, other, moveSeed)
      decisions++
      if (canonicalAction(drove) !== canonicalAction(alt)) {
        differ++
        expect(admissible(drove, alt), `${seed} step ${steps}: ${canonicalAction(drove)} vs ${canonicalAction(alt)}`).toBe(true)
      }
      const r = reduce(s, drove)
      if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
      s = r.state
    }
  }
  return { decisions, differ }
}

describe('v0.4b and v0.4a are two different policies, and very nearly the same one', () => {
  it('the joint alone reaches the board rarely, and only through the claim path', () => {
    // The registry says v0.4b is v0.4a plus `pAssignment: 'joint'`. The chain changes most
    // plans (78% of planned sets get a different p, 46% a different placement, over 60 home
    // games) and almost no actions: 13 of 36,093 decisions, because `evClaim`'s structural gate
    // admits 0.6% of planned sets and the chain lifts about ten of those per sixty games over the
    // 0.775 bar. Over these six games the measured count was 0. So the pin is the shape, not a
    // floor: whatever differs is a declare, a decline, or a forced claim on at least one side —
    // the ask path never reads a plan — and the share stays under a tenth of a percent.
    const claimish = (x: GameAction): boolean => x.type === 'claim' || x.type === 'decline'
    const { decisions, differ } = divergence(
      ['v04b-a', 'v04b-b', 'v04b-c', 'v04b-d', 'v04b-e', 'v04b-f'],
      MONET_V04B,
      MONET_V04A,
      (drove, alt) => claimish(drove) || claimish(alt),
    )
    expect(decisions).toBeGreaterThan(3_000)
    expect(differ / decisions).toBeLessThan(0.001)
  })

  it("'priced' on the joint is what reaches the board: declines become speculative declares, and nothing else moves", () => {
    // MONET.md §3.4b item 2's knob, measured as its own arm and not on the vector. With the
    // structural gate dropped, the chain's probability meets the bar on sets an opponent might
    // hold a card of: 68 of 36,093 home decisions over 60 games, every one a decline turned into
    // a claim. Eight games here, and the same shape.
    const priced: PolicySpec = { skill: (MONET_V04B as BotPolicy).skill, style: { ...(MONET_V04B as BotPolicy).style, claimOwnership: 'priced' } }
    const { decisions, differ } = divergence(
      ['v04b-p-a', 'v04b-p-b', 'v04b-p-c', 'v04b-p-d', 'v04b-p-e', 'v04b-p-f', 'v04b-p-g', 'v04b-p-h'],
      priced,
      MONET_V04B,
      (drove, alt) => drove.type === 'claim' && alt.type === 'decline',
    )
    expect(decisions).toBeGreaterThan(4_000)
    expect(differ).toBeGreaterThan(0)
    expect(differ / decisions).toBeLessThan(0.01)
  })
})

/* ------------------------------------------------------ 3+4. the behavioural pin --- */

const SEEDS_PER_STYLE = 4
const tally = { games: 0, decisions: 0, comparisons: 0, mismatches: 0, digestsChecked: 0 }

/**
 * One whole `us54` game with every seat playing `table`, comparing Monet v0.2 against each live
 * spelling at every decision point and against the committed bank digest for the same game. The
 * game is DRIVEN by the table style's own action, so the positions visited are that style's real
 * positions rather than a hybrid nobody plays; the comparison is a pure read of the same
 * `SeatView` and the same seed, exactly the lab's `seed:moveIndex` derivation.
 */
function playIdentity(row: (typeof MONET_V02_BANK.games)[number]): void {
  const { table, seed: gameSeed } = row
  const policy = STYLE_ROSTER[table as keyof typeof STYLE_ROSTER]
  let s = newGame(gameSeed, us54Config, row.startSeat as Seat)
  const digest = new ActionDigest()
  let steps = 0
  while (s.phase !== 'finished') {
    if (steps >= 5000) throw new Error(`${table}/${gameSeed}: hit the 5000-step cap`)
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const moveSeed = hashSeed(`${gameSeed}:${s.moveIndex}`)()
    const monet = decide(view, MONET_V02, moveSeed)
    // The bank records the action the emitting revision's v0.2 arm returned here. Digesting
    // Monet's own action and comparing the two totals is what makes this a cross-session pin
    // rather than a restatement of the loop below.
    digest.push(canonicalAction(monet))
    for (const arm of LIVE_ARMS) {
      const live = decide(view, arm.policy, moveSeed)
      tally.comparisons++
      // Fast path first — both actions come off the same construction sites, so key order agrees;
      // the rich diff runs only on a real divergence, and one divergence fails the file.
      if (JSON.stringify(monet) !== JSON.stringify(live)) {
        tally.mismatches++
        expect(monet, `${table}/${gameSeed} step ${steps} seat ${seat} vs ${arm.name}`).toEqual(live)
      }
    }
    tally.decisions++
    const r = reduce(s, decide(view, policy, moveSeed))
    if (!r.ok) throw new Error(`${table}/${gameSeed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  // Length first: a game that ended early would otherwise fail as an opaque digest mismatch, and
  // "this game is 40 decisions shorter than the bank's" is the more useful thing to be told.
  expect(digest.count, `${table}/${gameSeed}: decision count vs the bank`).toBe(row.decisions)
  expect(digest.hex(), `${table}/${gameSeed}: action digest vs ${MONET_V02_BANK.revision.slice(0, 12)}`).toBe(
    row.digest,
  )
  tally.digestsChecked++
  tally.games++
}

describe('Monet v0.2 ≡ the live roster arm, at every decision of whole us54 games', () => {
  for (const id of STYLE_IDS) {
    const rows = MONET_V02_BANK.games.filter((g) => g.table === id)
    it(`${id} table: ${rows.length} us54 games, every action identical`, () => {
      // The schedule lives in the fixture, not here, so the bank and the replay cannot drift
      // apart: a row nobody replays is a game nobody checks.
      expect(rows.length).toBe(SEEDS_PER_STYLE)
      for (const row of rows) playIdentity(row)
    }, 120_000)
  }

  it('covered the whole roster over thousands of decisions, with zero mismatches', () => {
    expect(tally.games).toBe(STYLE_IDS.length * SEEDS_PER_STYLE)
    expect(tally.games).toBe(MONET_V02_BANK.games.length)
    // The pin is only worth what it covers: a run that quietly shrank to a few hundred decisions
    // would still report green. Pinned exactly rather than floored, because the bank pins each
    // game's length exactly too — the total is not an independent fact, it is their sum, and a
    // floor here would let a whole table drop out of the fixture unnoticed.
    expect(tally.decisions).toBe(MONET_V02_BANK.totalDecisions)
    expect(tally.decisions).toBe(25_838)
    expect(tally.comparisons).toBe(tally.decisions * LIVE_ARMS.length)
    expect(tally.digestsChecked).toBe(MONET_V02_BANK.games.length)
    expect(tally.mismatches).toBe(0)
  })

  it('the v0.2 bank says what it is: a forward baseline, from a tree this repo can name', () => {
    // A fixture whose provenance is a sentence in a comment is a fixture nobody can re-derive.
    // These fields are what `scripts/byte-identity.mjs --emit-tree wt --emit-bank` was told.
    expect(MONET_V02_BANK.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(MONET_V02_BANK.tree).toBe('wt')
    expect(MONET_V02_BANK.arm).toBe('monetPolicy("v0.2")')
    expect(MONET_V02_BANK.totalDecisions).toBe(
      MONET_V02_BANK.games.reduce((n, g) => n + g.decisions, 0),
    )
    // Distinct digests: 36 identical strings would pass every assertion above while proving
    // nothing, and that is precisely the shape a broken generator produces.
    expect(new Set(MONET_V02_BANK.games.map((g) => g.digest)).size).toBe(MONET_V02_BANK.games.length)
  })
})

/* ------------------------------------------ 4b. v0.4a's forward bank, replayed --- */

const forward = { games: 0, decisions: 0, digestsChecked: 0 }

/**
 * One whole `us54` game with every seat playing `table`, Monet v0.4a asked at every decision
 * point and its answers digested against the committed bank. There is no live arm to compare
 * against — v0.4a is not the roster, and MONET.md §3.4a's cells are what say how it plays — so
 * this is the pure forward pin: the actions the accepted revision returned on these positions,
 * in this order. Same derivation as `playIdentity` above and as the emitter, so the positions
 * visited are the table style's own.
 */
function playForward(row: (typeof MONET_V04A_BANK.games)[number]): void {
  const { table, seed: gameSeed } = row
  const policy = STYLE_ROSTER[table as keyof typeof STYLE_ROSTER]
  let s = newGame(gameSeed, us54Config, row.startSeat as Seat)
  const digest = new ActionDigest()
  let steps = 0
  while (s.phase !== 'finished') {
    if (steps >= 5000) throw new Error(`${table}/${gameSeed}: hit the 5000-step cap`)
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const moveSeed = hashSeed(`${gameSeed}:${s.moveIndex}`)()
    digest.push(canonicalAction(decide(view, MONET_V04A, moveSeed)))
    forward.decisions++
    const r = reduce(s, decide(view, policy, moveSeed))
    if (!r.ok) throw new Error(`${table}/${gameSeed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  expect(digest.count, `${table}/${gameSeed}: decision count vs the v0.4a bank`).toBe(row.decisions)
  expect(
    digest.hex(),
    `${table}/${gameSeed}: action digest vs ${MONET_V04A_BANK.revision.slice(0, 12)}`,
  ).toBe(row.digest)
  forward.digestsChecked++
  forward.games++
}

describe('Monet v0.4a replays its forward bank: every action of whole us54 games, as accepted', () => {
  for (const id of STYLE_IDS) {
    const rows = MONET_V04A_BANK.games.filter((g) => g.table === id)
    it(`${id} table: ${rows.length} us54 games, every digest as recorded`, () => {
      expect(rows.length).toBe(SEEDS_PER_STYLE)
      for (const row of rows) playForward(row)
    }, 120_000)
  }

  it("covered the whole roster over the bank's 25,709 decisions", () => {
    expect(forward.games).toBe(STYLE_IDS.length * SEEDS_PER_STYLE)
    expect(forward.games).toBe(MONET_V04A_BANK.games.length)
    // Pinned exactly, for the reason the v0.2 block gives: the total is the sum of the per-game
    // lengths the bank already pins, and a floor would let a whole table drop out unnoticed.
    expect(forward.decisions).toBe(MONET_V04A_BANK.totalDecisions)
    expect(forward.decisions).toBe(25_709)
    expect(forward.digestsChecked).toBe(MONET_V04A_BANK.games.length)
  })

  it('the v0.4a bank says what it is: a forward baseline from a clean tree this repo can name', () => {
    expect(MONET_V04A_BANK.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(MONET_V04A_BANK.tree).toBe('wt')
    // Recorded from the committed tree, so the named revision IS the one that reproduces these
    // digests — the v0.2 bank could not say that (its header explains why `dirty: true` was the
    // normal case there).
    expect(MONET_V04A_BANK.dirty).toBe(false)
    expect(MONET_V04A_BANK.arm).toBe('monetPolicy("v0.4a")')
    expect(MONET_V04A_BANK.totalDecisions).toBe(
      MONET_V04A_BANK.games.reduce((n, g) => n + g.decisions, 0),
    )
    expect(new Set(MONET_V04A_BANK.games.map((g) => g.digest)).size).toBe(
      MONET_V04A_BANK.games.length,
    )
  })
})

/* ------------------------------------------ 4c. v0.4b's forward bank, replayed --- */

const forwardB = { games: 0, decisions: 0, digestsChecked: 0 }

/** `playForward` for v0.4b: same derivation, the v0.4b arm asked, the v0.4b bank compared. */
function playForwardB(row: (typeof MONET_V04B_BANK.games)[number]): void {
  const { table, seed: gameSeed } = row
  const policy = STYLE_ROSTER[table as keyof typeof STYLE_ROSTER]
  let s = newGame(gameSeed, us54Config, row.startSeat as Seat)
  const digest = new ActionDigest()
  let steps = 0
  while (s.phase !== 'finished') {
    if (steps >= 5000) throw new Error(`${table}/${gameSeed}: hit the 5000-step cap`)
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const moveSeed = hashSeed(`${gameSeed}:${s.moveIndex}`)()
    digest.push(canonicalAction(decide(view, MONET_V04B, moveSeed)))
    forwardB.decisions++
    const r = reduce(s, decide(view, policy, moveSeed))
    if (!r.ok) throw new Error(`${table}/${gameSeed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  expect(digest.count, `${table}/${gameSeed}: decision count vs the v0.4b bank`).toBe(row.decisions)
  expect(
    digest.hex(),
    `${table}/${gameSeed}: action digest vs ${MONET_V04B_BANK.revision.slice(0, 12)}`,
  ).toBe(row.digest)
  forwardB.digestsChecked++
  forwardB.games++
}

describe('Monet v0.4b replays its forward bank: every action of whole us54 games, as accepted', () => {
  for (const id of STYLE_IDS) {
    const rows = MONET_V04B_BANK.games.filter((g) => g.table === id)
    it(`${id} table: ${rows.length} us54 games, every digest as recorded`, () => {
      expect(rows.length).toBe(SEEDS_PER_STYLE)
      for (const row of rows) playForwardB(row)
    }, 120_000)
  }

  it("covered the whole roster over the bank's 26,648 decisions", () => {
    expect(forwardB.games).toBe(STYLE_IDS.length * SEEDS_PER_STYLE)
    expect(forwardB.games).toBe(MONET_V04B_BANK.games.length)
    expect(forwardB.decisions).toBe(MONET_V04B_BANK.totalDecisions)
    expect(forwardB.decisions).toBe(26_648)
    expect(forwardB.digestsChecked).toBe(MONET_V04B_BANK.games.length)
  })

  it('the v0.4b bank says what it is: a forward baseline from a clean tree this repo can name', () => {
    expect(MONET_V04B_BANK.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(MONET_V04B_BANK.tree).toBe('wt')
    expect(MONET_V04B_BANK.dirty).toBe(false)
    expect(MONET_V04B_BANK.arm).toBe('monetPolicy("v0.4b")')
    expect(MONET_V04B_BANK.totalDecisions).toBe(
      MONET_V04B_BANK.games.reduce((n, g) => n + g.decisions, 0),
    )
    expect(new Set(MONET_V04B_BANK.games.map((g) => g.digest)).size).toBe(
      MONET_V04B_BANK.games.length,
    )
  })
})

/* ------------------------------------------------- 5. the v0.1 bank, as a record --- */

describe('the v0.1 action bank is kept as a record of the revision it was taken at', () => {
  it('is intact and internally consistent — 27 games recorded from a named revision', () => {
    expect(MONET_V01_BANK.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(MONET_V01_BANK.arm).toBe('{ skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter }')
    expect(MONET_V01_BANK.games.length).toBe(STYLE_IDS.length * 3)
    expect(MONET_V01_BANK.totalDecisions).toBe(20_291)
    expect(MONET_V01_BANK.totalDecisions).toBe(
      MONET_V01_BANK.games.reduce((n, g) => n + g.decisions, 0),
    )
    expect(new Set(MONET_V01_BANK.games.map((g) => g.digest)).size).toBe(MONET_V01_BANK.games.length)
  })

  it('is deliberately NOT replayed here, and its premise is checked rather than asserted', () => {
    // Replaying it would fail, and it would fail for a reason no edit to this file can fix: v0.2's
    // two `rankAsksWith` corrections move the p == 0 asks, and one such choice re-deals every
    // position after it. Measured on this tree, 13 of the 27 games diverge with v0.1's spec
    // restored and 15 with v0.2's — the code accounts for 13, the knob only for the last two.
    //
    // What IS checkable from here is the premise: the code the bank was recorded against is not
    // the code in this tree.
    expect(MONET_V01_BANK.revision).not.toBe(MONET_V02_BANK.revision)
    // That the two banks are two recordings rather than one copied twice needs no runtime check.
    // Both fixtures are `as const`, so each `digest` field is a union of string literals, and
    // `tsc` rejects `a.digest === b.digest` outright as a comparison of two disjoint unions
    // (TS2367). The type checker proves the disjointness the assertion would only have sampled.
    // The surviving form of v0.1's claim is cross-revision, so it cannot live in a vitest file at
    // all: `node scripts/byte-identity.mjs --gate dead-ask-full --seeds 22` materialises the
    // reference revision with `git show` and diffs the whole milestone against it, restricted to
    // asks with p > 0. Measured: 0 mismatches over 20,048 protected asks, 910 dead asks moved.
    // MONET.md §3.2 records the run and the seed count it needs.
  })
})
