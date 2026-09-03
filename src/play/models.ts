/**
 * The bot models `/play` offers, and the ONE place a menu entry is bound to a policy.
 *
 * [policies.ts](policies.ts) used to be that place, and held a single frozen spec because there
 * was a single mode. There are two now, so the binding moves here and `policies.ts` keeps only
 * the default — the value every non-menu surface (the advisor, the live sim, the tests) still
 * reaches for when no model has been chosen.
 *
 * ## The two lines, and why the project is still called FishAI
 *
 * **FishAI is the project.** The *agent line* it first shipped — v0.5 through v2.0 — is **Bass**,
 * and it is frozen. **Monet** is the new line, starting at v0.1, whose stated goal is to beat
 * SESTINA v1.0 (MONET.md). The rename is of the bot, not the repository, the site or the domain,
 * and it is deliberately not retroactive: the four published papers keep their `fishai-v05` …
 * `fishai-v20` slugs, because those slugs are live PDF URLs and DOM anchors, and renaming them
 * would orphan every link anyone has already shared.
 *
 * The frozen Bass versions are archived as annotated git tags — `bass-v0.5`, `bass-v1.0`,
 * `bass-v1.5`, `bass-v2.0` — each at the commit where that version was last whole, with its
 * defusal verdict recorded in the tag message. An old arm must be materialised from its tag and
 * **never** by picking a style out of today's roster: `defuse: 1` sits on the roster's shared
 * base, so a "v1.0" built that way is wrong on 1 decision in 64 (2,993 of 192,220 measured), and
 * a `defuse` ablation shows the knob is the entire difference.
 *
 * ## What an entry is allowed to be
 *
 * A `PolicySpec` off **today's** engine, and nothing else. No entry may bundle an old engine
 * tree, because the eight rules-core files (`types`, `views`, `variants`, `helpers`, `cards`,
 * `deal`, `rng`, `invariants`) are byte-identical across every Bass version, but `reduce.ts` is
 * **not**: `f3390c6` corrected the turn-pass rule after all four anchors. A menu entry carrying
 * an old reducer would deal under rules the shipped `RULES_US54.md` no longer describes, the
 * page would still stamp `us54 · seed …`, and the lab's rules-hash guard would not catch it —
 * it hashes the document, not the code. One rules core is what keeps this site's `us54` claim
 * true, so a version that cannot be expressed as a spec does not go in this menu.
 *
 * That constraint has a known expiry. MONET.md's "What an entry pins, and what it does not" says
 * Monet's later rungs are code changes at an *unchanged* spec — so Monet v0.5 and v1.0 will not
 * be `PolicySpec`s, and seating them will need a second bot brain compiled against this same
 * rules core (measured at +18.6 kB gzip, which is affordable). The registry shape below is what
 * makes that day a data change rather than a rewrite.
 */
import {
  MONET_VERSION_IDS,
  monetPolicy,
  type MonetVersion,
  type PolicySpec,
} from '../../lib/engine/index.ts'

/** A menu entry: what it is called, what it plays, and what it says about itself. */
export interface PlayModel {
  /** URL-safe, stable, and written into `?v=`. Never reuse an id for a different policy. */
  readonly id: string
  /** The name on the menu — "Monet v0.1", "Bass v2.0". */
  readonly name: string
  /** Which agent line it belongs to. */
  readonly line: 'Monet' | 'Bass'
  /** The lobby card's heading when this model is selected. */
  readonly heading: string
  /** What a seat running this model decides with. */
  readonly spec: PolicySpec
  /** What prints under a bot seat's name, and in the style mirror's Played column. */
  readonly label: string
  /** One line for the lobby, under the select. Honest about what the entry actually is. */
  readonly note: string
}

/** `v0.1` -> `monet-v01`. Stable and URL-safe without needing a second table to maintain. */
function monetId(v: MonetVersion): string {
  return `monet-${v.replace('.', '')}`
}

/**
 * The newest Monet version this build ships.
 *
 * Derived rather than written down, because the menu is meant to track the line: MONET.md's
 * ladder runs v0.1 → v0.5, and the owner's instruction is that the single Monet entry becomes
 * the newer version as each rung lands, rather than accumulating one entry per rung. When the
 * menu should list *several* Monet versions at once — the plan is Monet v0.5 and Monet v1.0
 * side by side at the end of the programme — replace this with an explicit curated list. That is
 * the only edit that day needs.
 */
const LATEST_MONET: MonetVersion = MONET_VERSION_IDS[MONET_VERSION_IDS.length - 1]

/**
 * Bass v2.0 — the engine this table has always seated.
 *
 * The *architecture* is v1.0 and only v1.0: observe → classify → best-respond, with nothing
 * between the classifier and the roster style it delegates to. What that style then plays is
 * v2.0's, because every roster entry spreads from a base carrying `defuse: 1`. So the label
 * names both halves; writing plain "v2.0" would claim the adaptive and bounded machinery moved,
 * which it did not, and plain "v1.0" would hide a term that changes what the bot does with its
 * turn. Measured faithful to the real `bass-v2.0` engine: 0 differences over 187,754 decisions.
 */
const BASS_V20: PlayModel = Object.freeze({
  id: 'bass-v20',
  name: 'Bass v2.0',
  line: 'Bass',
  spec: Object.freeze({ adaptive: true as const }),
  heading: 'Adaptive — reads the table',
  label: 'Bass v1.0 adaptive · v2.0 defusal',
  note: 'The adaptive engine: it classifies each seat from the public log and best-responds. Frozen — this is the baseline Monet has to beat.',
})

/**
 * Monet v0.1 — Punter at `hard`, by reference to the roster rather than by a copy of its numbers.
 *
 * It is the same *policy* Bass v2.0's measured baseline arm plays (MONET.md §1.1), and it is NOT
 * the same thing as the `Bass v2.0` entry above, which is the adaptive engine. The two agree far
 * more often than the version numbers suggest — measured over 36,214 identical positions they
 * chose differently 56 times, 0.15% — because over this roster the best response to almost
 * everything is Punter, which is exactly what the classifier keeps picking. The note says so:
 * offering two entries that play alike is fine, implying they are different opponents is not.
 */
const MONET_LATEST: PlayModel = Object.freeze({
  id: monetId(LATEST_MONET),
  name: `Monet ${LATEST_MONET}`,
  line: 'Monet',
  spec: monetPolicy(LATEST_MONET),
  heading: 'Fixed style — Punter, at full strength',
  label: `Monet ${LATEST_MONET} · Punter at hard`,
  note: 'The new line, under development. Plays one fixed style rather than adapting — and on this roster that is nearly the same thing, agreeing with Bass v2.0 on about 97% of decisions.',
})

/** The menu, in the order it is offered. */
export const PLAY_MODELS: readonly PlayModel[] = Object.freeze([MONET_LATEST, BASS_V20])

/**
 * What a bare `/play` link seats.
 *
 * Bass v2.0, because it is what this table has always seated: every `?seed=` link anyone has
 * already shared was written when there was one mode, and it has to keep dealing the same game.
 * `?v=10`, the id the old lobby wrote, is an alias for it (params.ts).
 */
export const DEFAULT_MODEL_ID = BASS_V20.id

/** The entry `id` names, or `null` if it names nothing this build ships. */
export function modelById(id: string): PlayModel | null {
  return PLAY_MODELS.find((m) => m.id === id) ?? null
}

/** The entry `id` names, falling back to the default. For surfaces that cannot show an error. */
export function modelOrDefault(id: string | null): PlayModel {
  return (id === null ? null : modelById(id)) ?? (modelById(DEFAULT_MODEL_ID) as PlayModel)
}
