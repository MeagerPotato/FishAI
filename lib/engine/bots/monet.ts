/**
 * monet.ts — the Monet agent line, as a frozen version registry.
 *
 * ## What Monet is
 *
 * [MONET.md](../../../MONET.md) freezes FishAI v2.0 as LEGACY and opens a new agent line at v0.1,
 * whose stated goal is that **Monet v1.0 beats SESTINA v1.0** — the frontier bot the inherited arm
 * loses to at **27.08%** over six seeds (MONET.md §0, `[measured, corrected]`). Everything the line
 * intends to change is *belief*: the ask scorer's probability term, `pCardAt`, `pAssignment`, and
 * the declare bar that reads them (MONET.md §3.2–§3.7). None of that is in this file.
 *
 * This file is the **label**. It maps a Monet version id to the exact policy that version plays, so
 * that a milestone can be named in a harness invocation — `bot:monet-v0.1` — and re-measured a
 * month later without anyone having to remember which roster entry and which tier the number came
 * from. A published Monet number that cannot be re-run against a named spec is not a measurement,
 * and the line's whole method is to read each version as a delta against the one before it.
 *
 * ## v0.1 is deliberately behaviour-identical, and that is the milestone
 *
 * MONET.md §1.1: Monet v0.1 **is** FishAI v2.0's `STYLE_ROSTER.punter` played at
 * `SKILL_PRESETS.hard`, unchanged in every reachable path. That includes the `defuse: 1` it
 * inherits — `defuse` is not a per-style knob; it sits on the `BALANCED` base and reaches every
 * roster entry through `style()` ([roster.ts](roster.ts)), so binding the roster object binds the
 * defusal appetite with it. v0.1 ships **no behaviour change at all**, and its acceptance test is
 * byte identity to FishAI v2.0 over ≥ 20,000 `us54` decisions plus a reproduction of the known
 * 27.08% cell (MONET.md §3.1). One changed decision fails it.
 *
 * So `MONET_VERSIONS['v0.1']` holds the roster and preset objects **by reference**. It is not a
 * copy of Punter's numbers and it cannot drift from them: an edit to `roster.ts` is an edit to
 * Monet v0.1 *by construction* rather than by two tables being kept in step, and
 * [tests/bots/monet.test.ts](../../../tests/bots/monet.test.ts) fails if the arm's actions move at
 * all. A duplicated vector here would have made the identity pin a test of clerical accuracy.
 *
 * ## What an entry pins, and what it does not
 *
 * An entry pins the `PolicySpec` — the knobs `decide` reads. It does **not** pin the code behind
 * them, and several MONET.md milestones are code changes at an unchanged spec (v0.2's three
 * `knowledge.ts` fixes, v0.5's `pCardAt`, v0.6's `pAssignment`). Those versions are pinned by the
 * repo revision they shipped at, not by this table, and a number quoted for one of them is
 * reproducible only against that revision. Said here so the table is not read as a stronger promise
 * than it makes.
 *
 * There is deliberately **no `MONET_LATEST`**. A moving pointer is exactly the drift v0.1 exists to
 * remove: a caller asking for "latest" silently changes what it measures the day v0.2 lands, and
 * the change would surface as a shifted win rate rather than as a shifted spec. Name the version.
 */
import { STYLE_ROSTER } from './roster.ts'
import { SKILL_PRESETS } from './style.ts'
import type { PolicySpec } from './bounded.ts'

/**
 * The Monet versions that exist *in this repo*. MONET.md §3 plans v0.1 through v1.0; only the ones
 * that have actually shipped appear here, so the union is also the honest answer to "what can be
 * measured today".
 */
export type MonetVersion = 'v0.1'

/**
 * Version id -> the policy that version plays, ready for `decide(view, policy, seed)`.
 *
 * `v0.1` is the FishAI v2.0 arm by reference — the roster's Punter and the `hard` skill preset
 * themselves, not their values (see the header). The pair is the `BotPolicy` shape rather than the
 * bare style so that the tier is explicit at the call site: a bare `StyleParams` would resolve to
 * full-strength inference anyway ([style.ts](style.ts) `resolvePolicy`), but "at `hard`" is part of
 * what the baseline claims and it should be readable here rather than inferred from a default.
 */
export const MONET_VERSIONS: Readonly<Record<MonetVersion, PolicySpec>> = Object.freeze({
  'v0.1': Object.freeze({ skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter }),
})

/**
 * The shipped versions in release order — the panel MONET.md §3.10's monotonicity check iterates
 * ("Monet beats v0.2 through v0.6 as well"). Ordered, because a version list that is only a key set
 * cannot express "the one before this".
 */
export const MONET_VERSION_IDS: readonly MonetVersion[] = Object.freeze(['v0.1'] as const)

/**
 * Is `id` a version this repo can play? For callers holding a string rather than a `MonetVersion` —
 * the lab scripts are untyped `.mjs`, and the bridge parses an arm name out of `bot:monet-v0.1`.
 */
export function isMonetVersion(id: string): id is MonetVersion {
  return Object.prototype.hasOwnProperty.call(MONET_VERSIONS, id)
}

/**
 * The policy Monet plays at `version`.
 *
 * Total over `MonetVersion`, so the throw is unreachable from TypeScript; it exists for the untyped
 * callers `isMonetVersion` exists for. It throws rather than degrading to some default version
 * because there is no safe default: silently measuring v0.1 under a v0.4 label would poison exactly
 * the deltas this registry is here to protect. (Contrast `resolvePolicy`, which *does* degrade an
 * unknown tier name — that runs per move inside a bot that must never throw. This runs once, when
 * an arm is constructed.)
 */
export function monetPolicy(version: MonetVersion): PolicySpec {
  // Via `isMonetVersion` rather than an `undefined` check on the lookup: `MONET_VERSIONS` is a
  // plain frozen object, so `MONET_VERSIONS['toString']` is a function rather than `undefined` and
  // an untyped caller could be handed the prototype instead of a policy.
  if (!isMonetVersion(version)) throw new RangeError(`unknown Monet version "${String(version)}"`)
  return MONET_VERSIONS[version]
}
