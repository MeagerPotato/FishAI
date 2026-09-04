/**
 * monet.ts — the Monet agent line, as a frozen version registry.
 *
 * ## What Monet is
 *
 * [MONET.md](../../../MONET.md) freezes Bass v2.0 as LEGACY and opens a new agent line at v0.1,
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
 * MONET.md §1.1: Monet v0.1 **is** Bass v2.0's `STYLE_ROSTER.punter` played at
 * `SKILL_PRESETS.hard`, unchanged in every reachable path. That includes the `defuse: 1` it
 * inherits — `defuse` is not a per-style knob; it sits on the `BALANCED` base and reaches every
 * roster entry through `style()` ([roster.ts](roster.ts)), so binding the roster object binds the
 * defusal appetite with it. v0.1 ships **no behaviour change at all**, and its acceptance test is
 * byte identity to Bass v2.0 over ≥ 20,000 `us54` decisions plus a reproduction of the known
 * 27.08% cell (MONET.md §3.1). One changed decision fails it. That is a claim about the revision
 * v0.1 shipped at and is not re-checkable here: the entry below buys back v0.1's SPEC on a later
 * tree, never the code it ran through (see *What an entry pins*).
 *
 * So `MONET_VERSIONS['v0.1']` held the roster and preset objects **by reference**. The argument
 * was that an edit to `roster.ts` is an edit to Monet v0.1 *by construction* rather than by two
 * tables being kept in step, and that a duplicated vector here would have made the identity pin a
 * test of clerical accuracy.
 *
 * **That argument was sound only while the live roster still WAS v0.1, and v0.2 ended it.**
 * MONET.md §3.2 ships `minHitP: 1e-9` on the roster styles — a change to `STYLE_ROSTER.punter`
 * itself. Under the by-reference binding that silently made `monetPolicy('v0.1')` return v0.2's
 * policy: an arm invoked as `bot:monet-v0.1` would have measured v0.2 under v0.1's label, which is
 * precisely the drift `monetPolicy`'s throw exists to prevent. So v0.1 now spreads the roster entry
 * and **pins the one knob v0.2 moved back to its v0.1 value**, and v0.2 takes over the
 * by-reference binding, because v0.2 is what the live roster now is.
 *
 * The residual hazard of the spread is named rather than hidden: a *future* roster spec change
 * would move v0.1 again through the keys it still inherits. `monet.test.ts` pins the deviation set
 * — v0.1's style must differ from `STYLE_ROSTER.punter` in exactly `minHitP` and nothing else — so
 * the next such edit fails a test instead of quietly re-labelling a measurement.
 *
 * ## What an entry pins, and what it does not
 *
 * An entry pins the `PolicySpec` — the knobs `decide` reads. It does **not** pin the code behind
 * them, and several MONET.md milestones are code changes at an unchanged spec (v0.5's `pCardAt`,
 * v0.6's `pAssignment`). Those versions are pinned by the repo revision they shipped at, not by
 * this table, and a number quoted for one of them is reproducible only against that revision. Said
 * here so the table is not read as a stronger promise than it makes.
 *
 * v0.2 is **both**: one spec change (`minHitP`, which this table does carry) and two `knowledge.ts`
 * scoring corrections (which it cannot). The consequence is that replaying v0.1's *spec* on this
 * tree does not reproduce v0.1's *games* — the two corrections move exactly the asks whose hit
 * probability is 0, and those choices deal every later position differently. So the v0.1 action
 * bank is frozen as a record of the revision it was taken at rather than replayed here, and the
 * surviving cross-revision claim — that no ask with p > 0 moved — lives in
 * `scripts/byte-identity.mjs --gate dead-ask-full`, which can materialise the other revision.
 * MONET.md §3.2 records the decision.
 *
 * ## v0.3 is a spec change on Monet's own vector, and the roster does not move
 *
 * MONET.md §3.3a ships licence conditioning of the hit probability ([licence.ts](licence.ts)) at
 * λ = 0.60. The knob is `licenceLambda`, optional on `StyleParams`, and it is set **only here**:
 * the roster is Bass's, Bass is frozen, and a knob on the BALANCED base would have moved every
 * Bass style the way `minHitP` did at v0.2. So v0.3 is `STYLE_ROSTER.punter` spread with the one
 * field, exactly as v0.1 is punter spread with `minHitP` pinned back, and `monet.test.ts` pins the
 * deviation set to `{ licenceLambda }`. The code path it switches on is inert at λ absent —
 * `scripts/byte-identity.mjs --version v0.2` against the pre-v0.3 revision is the sweep that says
 * so — which is what lets v0.2 keep the by-reference binding to the live roster.
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
export type MonetVersion = 'v0.1' | 'v0.2' | 'v0.3' | 'v0.4a' | 'v0.4b' | 'v0.4c' | 'v0.9'

/**
 * Version id -> the policy that version plays, ready for `decide(view, policy, seed)`.
 *
 * All entries are the `BotPolicy` shape rather than a bare style, so that the tier is explicit at
 * the call site: a bare `StyleParams` would resolve to full-strength inference anyway
 * ([style.ts](style.ts) `resolvePolicy`), but "at `hard`" is part of what the baseline claims and
 * it should be readable here rather than inferred from a default.
 *
 * - `v0.2` is the live roster's Punter **by reference**, because v0.2 is what the live roster now
 *   is. The header's un-drift-able argument applies to this entry and only to it.
 * - `v0.1` is that same entry with `minHitP` pinned back to the 0 the roster shipped before
 *   MONET.md §3.2 — the one knob v0.2 moved. Spelled as a spread rather than a literal vector so
 *   that the deviation from the live roster is a single readable line; `monet.test.ts` pins the
 *   deviation set to exactly `{ minHitP }` so that a later roster edit cannot widen it in silence.
 *
 * - `v0.3` is the roster's Punter spread with `licenceLambda: 0.6` (MONET.md §3.3a) — Monet's own
 *   vector, deliberately not a roster edit. Measured 2026-09-03: 30.96% over six seeds against
 *   SESTINA, +3.75 on v0.2 and positive on every seed; `defuse` stays at the roster's 1 by §3.3b's
 *   written freeze, and no score term ships (§3.3c).
 * - `v0.4a` is the roster's Punter spread with `pModel: 'marginal'` (MONET.md §3.4a) and WITHOUT
 *   v0.3's `licenceLambda`: the ask path's hit probability is read off `marginal.ts`'s scaled
 *   card × seat table instead of the slot prior, and the licence term came out because the
 *   2 × 2 measured it inside the floor on the new base (item 8; the λ-on arm reads +1.83 over six
 *   seeds, on the record). The a-half of v0.4 under its own id, so its cells name the spec they
 *   measured; §3.4b lands as its own.
 * - `v0.4b` is v0.4a plus `pAssignment: 'joint'` (MONET.md §3.4b): the claim planner places a
 *   set's open cards by `joint.ts`'s chain over the same table, most certain first, and the
 *   plan's probability is the product of the conditionals rather than the independent product.
 *   `claimOwnership` (item 2) stays off the vector until §3.4b's written rule admits it.
 * - `v0.4c` is v0.4b plus `licenceLambda: 0.3` (MONET.md §3.4b's licence addendum; §8.3 decision 5):
 *   the term v0.3 shipped and §3.4a's rule took out at +1.83 inside ±2.83, put back once the
 *   24-seed cell (±1.41) that decision 5 named as the one that resolves it read +1.88, ahead on
 *   22 of 24. The correction is to the ask ranker's number only (`licence.ts`); the claim
 *   planner's table and chain are untouched. Shipped at 0.6 first; moved to 0.3 by the
 *   pre-registered 0.3-versus-0.6 confirmation on 24 fresh seeds (§3.4c: +1.19 paired, SE 0.30,
 *   ahead on 19 of 24, at less than half the over-statement).
 * - `v0.9` is v0.4c plus `contest: 0.6` (MONET.md §3.8d, the priced ask): the contest credit on
 *   the miss branch of the ask ranker (`priced.ts`) — an appetite for asks that will probably miss
 *   into a set the opponents dominate and nobody can yet place. The one rung after v0.4c to clear
 *   the floor abroad: +4.04 paired against v0.4c on twelve fresh seeds against SESTINA v1.0
 *   (SD 1.63, SE 0.47), ahead on all twelve, 38.9% against 34.9%. The `exposure` knob measured
 *   +3.31 on the fit seeds and stays off the vector: the pre-registered rule picked one arm.
 *
 * No entry pins the *code* the knobs run through — see the header. Naming v0.1 here buys back
 * v0.1's SPEC on a v0.2 tree; it does not buy back v0.1's games.
 */
export const MONET_VERSIONS: Readonly<Record<MonetVersion, PolicySpec>> = Object.freeze({
  'v0.1': Object.freeze({
    skill: SKILL_PRESETS.hard,
    style: Object.freeze({ ...STYLE_ROSTER.punter, minHitP: 0 }),
  }),
  'v0.2': Object.freeze({ skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter }),
  'v0.3': Object.freeze({
    skill: SKILL_PRESETS.hard,
    style: Object.freeze({ ...STYLE_ROSTER.punter, licenceLambda: 0.6 }),
  }),
  'v0.4a': Object.freeze({
    skill: SKILL_PRESETS.hard,
    style: Object.freeze({ ...STYLE_ROSTER.punter, pModel: 'marginal' }),
  }),
  'v0.4b': Object.freeze({
    skill: SKILL_PRESETS.hard,
    style: Object.freeze({ ...STYLE_ROSTER.punter, pModel: 'marginal', pAssignment: 'joint' }),
  }),
  'v0.4c': Object.freeze({
    skill: SKILL_PRESETS.hard,
    style: Object.freeze({ ...STYLE_ROSTER.punter, pModel: 'marginal', pAssignment: 'joint', licenceLambda: 0.3 }),
  }),
  'v0.9': Object.freeze({
    skill: SKILL_PRESETS.hard,
    style: Object.freeze({ ...STYLE_ROSTER.punter, pModel: 'marginal', pAssignment: 'joint', licenceLambda: 0.3, contest: 0.6 }),
  }),
})

/**
 * The shipped versions in release order — the panel MONET.md §3.10's monotonicity check iterates
 * ("Monet beats v0.2 through v0.6 as well"). Ordered, because a version list that is only a key set
 * cannot express "the one before this".
 */
export const MONET_VERSION_IDS: readonly MonetVersion[] = Object.freeze(['v0.1', 'v0.2', 'v0.3', 'v0.4a', 'v0.4b', 'v0.4c', 'v0.9'] as const)

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
