/**
 * Monet v0.1 — the identity pin.
 *
 * [MONET.md](../../MONET.md) §3.1 gives v0.1 exactly one behavioural acceptance criterion: **byte
 * identity to FishAI v2.0**, 0 action mismatches, "a pass/fail with no floor: one mismatch fails
 * it". A vitest file cannot check out another revision, so the full cross-revision sweep is
 * `scripts/byte-identity.mjs` (64,198 decisions against `git show HEAD:lib`, plus a `MUTATE=`
 * negative control that must fail). Three things are asserted here, and they fail for different
 * reasons:
 *
 *  1. **Structural.** The registry entry holds `STYLE_ROSTER.punter` and `SKILL_PRESETS.hard` *by
 *     reference*. This is what makes the identity un-drift-able rather than merely true today: a
 *     copied vector could be edited on one side only, and no amount of gameplay would notice until
 *     someone re-ran a cell. Reference identity is checked with `toBe`, deliberately not `toEqual`.
 *  2. **In-graph behavioural.** Whole games, all nine roster styles at the table and several seeds,
 *     with `decide` called on Monet v0.1 and on the v2.0 arm at every decision point and the two
 *     `GameAction`s compared exactly. The reference is spelled out here rather than read back from
 *     the registry — otherwise the comparison is `x === x` — and in *both* forms the v2.0 arm was
 *     ever addressed in: the explicit `{ skill: hard, style: punter }` pair, and the bare
 *     `STYLE_ROSTER.punter` that `resolvePolicy` plays at full strength (STYLES.md §2). The second
 *     spelling is the one CROSSPLAY.md's cells were run with, so it is the one a reader will check
 *     the baseline against.
 *  3. **Cross-revision, from a committed fixture.** (2) alone **cannot fail on a `decide.ts`
 *     regression**: both of its arms are the same imported `decide`, so any edit moves them
 *     together and the suite stays green while the describe title goes on claiming identity. What
 *     it really verifies is that `monetPolicy('v0.1')` resolves to `{ hard, punter }` — which is
 *     (1). So the same 27 games are replayed against `data/monet-v01-bank.ts`, a per-game digest of
 *     what the v2.0 arm actually did, recorded from **another revision's module graph** by
 *     `scripts/byte-identity.mjs` and committed. That fixture outlives the session the sweep ran
 *     in, and it is the only part of this file that still fails a month from now.
 *
 * The position bank is the roster mirror rather than a Punter mirror alone. A style that plays
 * itself visits a narrow set of positions, and the identity claim is about the *policy*, which must
 * hold at every position `us54` can produce — including the ones Punter's own play never reaches.
 * Nine styles × three seeds keeps that broad while staying inside a few seconds: 20,217 decisions,
 * 40,434 in-graph comparisons and 27 digests, in about two and a half seconds.
 *
 * **A red digest is not a test to fix.** It is the report that v0.1 no longer plays FishAI v2.0's
 * games, which is the acceptance criterion itself. Regenerating the bank to make it green deletes
 * the only evidence that v0.1 ever was what it says it was.
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
import type { PolicySpec, Seat } from '../../lib/engine/index.ts'
import type { BotPolicy } from '../../lib/engine/bots/style.ts'
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

/** Monet v0.1, addressed the way a harness addresses it. */
const MONET_V01: PolicySpec = monetPolicy('v0.1')

/**
 * The FishAI v2.0 arm, in both spellings — written out, never read from the registry.
 * MONET.md §1.1: `STYLE_ROSTER.punter` at `SKILL_PRESETS.hard`.
 */
const V2_ARMS: { name: string; policy: PolicySpec }[] = [
  { name: 'explicit { skill: hard, style: punter }', policy: { skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter } },
  { name: 'bare punter, played at full strength', policy: STYLE_ROSTER.punter },
]

/* ------------------------------------------------------ 1. the structural pin --- */

/** Narrow the registry's `PolicySpec` to the `{ skill, style }` pair v0.1 is required to be. */
function asPair(spec: PolicySpec, ctx: string): BotPolicy {
  if (typeof spec !== 'object' || spec === null || !('skill' in spec) || !('style' in spec)) {
    throw new Error(`${ctx}: expected an explicit { skill, style } pair, got ${JSON.stringify(spec)}`)
  }
  return spec
}

describe('the v0.1 registry entry IS the FishAI v2.0 arm', () => {
  it('binds the roster entry and the skill preset by reference, so it cannot drift from them', () => {
    const pair = asPair(MONET_V01, "MONET_VERSIONS['v0.1']")
    // `toBe`, not `toEqual`: a copy of Punter's numbers would pass a value comparison and would
    // then be free to diverge from roster.ts on the next edit. That is the failure this pins.
    expect(pair.style).toBe(STYLE_ROSTER.punter)
    expect(pair.skill).toBe(SKILL_PRESETS.hard)
  })

  it('carries the knobs MONET.md §1.1 names for the baseline arm', () => {
    const pair = asPair(MONET_V01, "MONET_VERSIONS['v0.1']")
    expect(pair.style.id).toBe('punter')
    expect(pair.style.declareThreshold).toBe(0.775)
    expect(pair.style.declareMaxUncertain).toBe(2)
    // `defuse` is not per-style — it sits on roster.ts's BALANCED base and reaches Punter through
    // `style()`. §1.1 calls it out precisely because binding by reference is what carries it.
    expect(pair.style.defuse).toBe(1)
    expect(pair.skill.id).toBe('hard')
    expect(pair.skill.refinedInference).toBe(true)
    expect(pair.skill.errorRate).toBe(0)
  })

  it('is frozen, and the accessor hands back the registry object itself', () => {
    expect(Object.isFrozen(MONET_VERSIONS)).toBe(true)
    expect(Object.isFrozen(MONET_VERSIONS['v0.1'])).toBe(true)
    expect(monetPolicy('v0.1')).toBe(MONET_VERSIONS['v0.1'])
  })

  it('MONET_VERSION_IDS lists every shipped version, in order, and nothing else', () => {
    expect([...MONET_VERSION_IDS]).toEqual(Object.keys(MONET_VERSIONS))
    expect(MONET_VERSION_IDS.every((v) => isMonetVersion(v))).toBe(true)
  })

  it('refuses an unshipped id rather than degrading to some default version', () => {
    expect(isMonetVersion('v0.2')).toBe(false)
    // Inherited keys are not versions — `MONET_VERSIONS['toString']` is a function, not `undefined`.
    expect(isMonetVersion('toString')).toBe(false)
    expect(() => monetPolicy('v0.2' as MonetVersion)).toThrow(RangeError)
    expect(() => monetPolicy('toString' as MonetVersion)).toThrow(RangeError)
  })
})

/* ------------------------------------------------------ 2. the behavioural pin --- */

const SEEDS_PER_STYLE = 3
const tally = { games: 0, decisions: 0, comparisons: 0, mismatches: 0, digestsChecked: 0 }

/**
 * One whole `us54` game with every seat playing `table`, comparing Monet v0.1 against each v2.0
 * spelling at every decision point and against the committed bank digest for the same game. The
 * game is DRIVEN by the table style's own action, so the positions visited are that style's real
 * positions rather than a hybrid nobody plays; the comparison is a pure read of the same
 * `SeatView` and the same seed, exactly the lab's `seed:moveIndex` derivation.
 */
function playIdentity(row: (typeof MONET_V01_BANK.games)[number]): void {
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
    const monet = decide(view, MONET_V01, moveSeed)
    // The bank records the REFERENCE revision's action here. Digesting Monet's own action and
    // comparing the two totals is what makes this a cross-revision pin rather than a restatement
    // of the loop below.
    digest.push(canonicalAction(monet))
    for (const arm of V2_ARMS) {
      const v2 = decide(view, arm.policy, moveSeed)
      tally.comparisons++
      // Fast path first — both actions come off the same construction sites, so key order agrees;
      // the rich diff runs only on a real divergence, and one divergence fails the file.
      if (JSON.stringify(monet) !== JSON.stringify(v2)) {
        tally.mismatches++
        expect(monet, `${table}/${gameSeed} step ${steps} seat ${seat} vs ${arm.name}`).toEqual(v2)
      }
    }
    tally.decisions++
    const r = reduce(s, decide(view, policy, moveSeed))
    if (!r.ok) throw new Error(`${table}/${gameSeed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  // Length first: a game that ended early would otherwise fail as an opaque digest mismatch, and
  // "this game is 40 decisions shorter than v2.0's" is the more useful thing to be told.
  expect(digest.count, `${table}/${gameSeed}: decision count vs the bank`).toBe(row.decisions)
  expect(digest.hex(), `${table}/${gameSeed}: action digest vs ${MONET_V01_BANK.revision.slice(0, 12)}`).toBe(
    row.digest,
  )
  tally.digestsChecked++
  tally.games++
}

describe('Monet v0.1 ≡ the FishAI v2.0 arm, at every decision of whole us54 games', () => {
  for (const id of STYLE_IDS) {
    const rows = MONET_V01_BANK.games.filter((g) => g.table === id)
    it(`${id} table: ${rows.length} us54 games, every action identical`, () => {
      // The schedule lives in the fixture, not here, so the bank and the replay cannot drift
      // apart: a row nobody replays is a game nobody checks.
      expect(rows.length).toBe(SEEDS_PER_STYLE)
      for (const row of rows) playIdentity(row)
    }, 120_000)
  }

  it('covered the whole roster over thousands of decisions, with zero mismatches', () => {
    expect(tally.games).toBe(STYLE_IDS.length * SEEDS_PER_STYLE)
    expect(tally.games).toBe(MONET_V01_BANK.games.length)
    // The pin is only worth what it covers: a run that quietly shrank to a few hundred decisions
    // would still report green. Pinned exactly rather than floored, because the bank pins each
    // game's length exactly too — the total is not an independent fact, it is their sum, and a
    // floor here would let a whole table drop out of the fixture unnoticed.
    expect(tally.decisions).toBe(MONET_V01_BANK.totalDecisions)
    expect(tally.decisions).toBe(20_217)
    expect(tally.comparisons).toBe(tally.decisions * V2_ARMS.length)
    expect(tally.digestsChecked).toBe(MONET_V01_BANK.games.length)
    expect(tally.mismatches).toBe(0)
  })

  it('the bank is the FishAI v2.0 arm, recorded from a revision this tree can name', () => {
    // A fixture whose provenance is a sentence in a comment is a fixture nobody can re-derive.
    // These two fields are what `scripts/byte-identity.mjs --ref <rev> --emit-bank` was told.
    expect(MONET_V01_BANK.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(MONET_V01_BANK.arm).toBe('{ skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter }')
    expect(MONET_V01_BANK.totalDecisions).toBe(
      MONET_V01_BANK.games.reduce((n, g) => n + g.decisions, 0),
    )
    // Distinct digests: 27 identical strings would pass every assertion above while proving
    // nothing, and that is precisely the shape a broken generator produces.
    expect(new Set(MONET_V01_BANK.games.map((g) => g.digest)).size).toBe(MONET_V01_BANK.games.length)
  })
})
