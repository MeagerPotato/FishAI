/**
 * The artifact: types, the boundary validator, and the committed cases.
 *
 * SITE_SPEC.md §5 and BOT_LAB.md §7 make the site a **pure reader of one artifact**. Nothing
 * below fetches, and nothing below runs a simulation: each case is a committed JSON file
 * imported with `?raw`, so Vite emits it inside the lazily-loaded lab chunk under `/assets/`
 * and it never has to exist at the dist root — which matters wherever this is deployed behind
 * an SPA rewrite, since a rewrite that does not carve out the artifact path serves index.html
 * for it. This repository ships no host config of its own; there is nothing to keep in sync.
 *
 * Four cases ship. The **default is `v2` — the current measured run**; the other three exist to
 * keep every render path and the refusal honest, and each states what it is when loaded:
 *
 *   `v2`        **matrix v2, the default** — the 36-cell x 4,300-pair run as **re-measured at
 *               `1fdd22e`**: the contained-book turn-pass live (`containedPass`, STYLES.md §6.3),
 *               the concession layer landed (`defuse`, CONCESSION.md), and `KNOB_LADDER` completed
 *               to 88 rungs. It replaced an earlier v2 measured at `1667a1d`, which had run the
 *               same 36 cells on the same seeds but against a roster carrying no `defuse` and an
 *               exploitability search truncated to 60 candidates; STYLES.md §6.5 reports what
 *               moved between the two and what it costs the claims made from the first. This is
 *               the committed evidence the site opens on.
 *   `dominant`  **matrix v1** — the same 36 cells on the same 4,300 seeds at `819eebb`, before
 *               the CONTAINMENT.md turn-pass existed. Kept **alongside** v2 rather than replaced
 *               by it so the engine change between them is auditable from the committed bytes:
 *               every deal is played by both engines, so `?case=v2` against `?case=dominant` is
 *               a controlled comparison rather than two independent samples.
 *
 *               That argument is why both files are here and it still holds — but state its reach
 *               honestly, because it has narrowed. There are now **three** engine generations and
 *               **two** committed artifacts: `819eebb`, `1667a1d`, `1fdd22e`. Only the first and
 *               the last are on disk. So the comparison these bytes support now spans *both*
 *               engine changes at once and cannot attribute anything to either alone. The middle
 *               generation is not recoverable from this repository — it exists only in git
 *               history, and the only record of what it measured is STYLES.md §6.4, which is
 *               annotated rather than overwritten for exactly that reason. Committing a third
 *               case would restore the resolution (same seeds, so it would be the same controlled
 *               comparison); until one is, do not describe a v1-vs-v2 diff as isolating a single
 *               change.
 *   `cyclic`    the **synthetic fixture** — generated data, not simulation output, and stamped
 *               as such on every page that loads it. It exists to prove the site can render a
 *               cyclic verdict honestly (criterion 3 fails, so the verdict is NOT a winner),
 *               which no real run to date has produced. The site was built against it before
 *               real data existed, and it stays so that render path stays exercised.
 *   `stale`     a deliberate `rulesHash` mismatch, so §1.1's refusal has something real to
 *               refuse. Without it "the site refuses to render stale results" is an untested
 *               claim about code nobody ever ran.
 *
 * The shape extends `src/diagrams/types.ts` — the diagrams' own contract — rather than
 * re-declaring it, so an artifact that renders here is by construction an artifact the diagrams
 * can read.
 */

import type {
  Cycle,
  MatrixCell,
  Ranking,
  ResultsMeta,
  StyleDef,
  StyleResults,
} from '../diagrams/index.ts'
import type { GameAction, Seat } from '../../lib/engine/index.ts'
import type { Criterion } from '../../lib/lab/analysis/index.ts'

import cyclicRaw from './data/style-results.json?raw'
import dominantRaw from './data/style-results.dominant.json?raw'
import v2Raw from './data/style-results.v2.json?raw'
import staleRaw from './data/style-results.stale.json?raw'

/* -- the deltas this site adds on top of the diagram contract ---------------------------- */

/** Maximin with the two things BOT_LAB.md §4.4 criterion 2 is actually tested on. */
export interface LabMaximin {
  style: string
  value: number
  worstVs: string
  /** Lower bound of the worst cell's CI. Criterion 2 is a claim about the world, not a point. */
  lower95: number
  /** Did the worst cell survive Benjamini-Hochberg? */
  significant: boolean
}

export interface LabRanking extends Ranking {
  maximin: LabMaximin[]
  cycles: Cycle[]
  /** As emitted. The site recomputes these; see `verdict.ts`. */
  criteria: Criterion[]
  verdictSummary: string
}

/** BOT_LAB.md §5.7. `gap` is `E(i) = SR(best response, i) - 0.5`. */
export interface ExploitEntry {
  style: string
  searched: boolean
  score: number
  se: number
  ci95: [number, number]
  gap: number
  /** The search's own upward-biased score, kept beside `score` so the bias stays visible. */
  searchScore: number
  searchGames: number
  evalGames: number
  candidatesTried: number
  inertCandidates: number
  /**
   * Smallest per-move improvement the search could have accepted. `E(i)` is a maximum over a
   * search, so a small `E(i)` means nothing without this number next to it.
   */
  detectableDelta: number
}

/** BOT_LAB.md §8.3. Empty until a foreign bot has actually been played. */
export interface CrossplayEntry {
  us: string
  them: string
  mode: 'team-vs-team' | 'mixed-team'
  pairs: number
  usScore: number
  ci95: [number, number]
  seedSet: string
  rulesHashAgreed: string
  note: string
}

/**
 * BOT_LAB.md §7.1: *"Replays store actions, not states."* The engine is deterministic, so
 * `newGame(seed, config, startSeat)` plus this action list reconstructs every frame.
 */
export interface ReplayRecord {
  id: string
  pairing: [string, string]
  seed: string
  startSeat: Seat
  caption: string
  /** Seat -> style id. Team 0 is seats 0/2/4, team 1 is seats 1/3/5. */
  seatStyles: string[]
  moves: number
  sets: [number, number]
  unresolved: number
  actions: GameAction[]
}

export interface LabMeta extends ResultsMeta {
  /** Which document `rulesHash` was taken over. `us54` results are not `pagat48` results. */
  rulesFile: string
  /** True for the committed fixture. Every figure on the site stamps it. */
  synthetic: boolean
  notice: string
  analysis: {
    alpha: number
    cells: number
    significantCells: number
    cyclicThreshold: number
    exploitabilityMargin: number
    /** False makes §4.4 criterion 4 undetermined, which forbids a `dominant` verdict. */
    exploitabilityRan: boolean
  }
  health: {
    illegalActions: number
    cappedGames: number
    invariantViolations: number
    distinctSeeds: number
  }
}

export interface LabArtifact extends StyleResults {
  meta: LabMeta
  ranking: LabRanking
  exploitability: ExploitEntry[]
  crossplay: CrossplayEntry[]
  replays: ReplayRecord[]
}

import type { ArtifactCase } from './case.ts'
export type { ArtifactCase } from './case.ts'

/* -- the boundary validator --------------------------------------------------------------- */

/**
 * Everything below is defensive on purpose. This is the one place untyped bytes become typed
 * values, and the fixture is going to be swapped for real simulator output: a schema drift that
 * surfaces as `undefined.toFixed` three components deep is a worse failure than a named one.
 */
export class ArtifactError extends Error {
  readonly detail: string
  constructor(detail: string) {
    super(detail)
    this.name = 'ArtifactError'
    this.detail = detail
  }
}

type Obj = Record<string, unknown>

function obj(value: unknown, at: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ArtifactError(`${at}: expected an object, got ${describe(value)}`)
  }
  return value as Obj
}

function arr(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) throw new ArtifactError(`${at}: expected an array, got ${describe(value)}`)
  return value
}

function num(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ArtifactError(`${at}: expected a finite number, got ${describe(value)}`)
  }
  return value
}

function str(value: unknown, at: string): string {
  if (typeof value !== 'string') throw new ArtifactError(`${at}: expected a string, got ${describe(value)}`)
  return value
}

function bool(value: unknown, at: string): boolean {
  if (typeof value !== 'boolean') throw new ArtifactError(`${at}: expected a boolean, got ${describe(value)}`)
  return value
}

function pair(value: unknown, at: string): [number, number] {
  const a = arr(value, at)
  if (a.length !== 2) throw new ArtifactError(`${at}: expected 2 numbers, got ${a.length}`)
  return [num(a[0], `${at}[0]`), num(a[1], `${at}[1]`)]
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `an array of ${value.length}`
  return typeof value
}

const METRIC_KEYS = [
  'askHitRate',
  'claimPrecision',
  'claimYield',
  'concedeRate',
  'leakIndex',
  'hoardIndex',
  'turnRetention',
  'avgMoves',
  'foreignDeclareRate',
  'declareLatency',
] as const

export type MetricKey = (typeof METRIC_KEYS)[number]

function metrics(value: unknown, at: string): MatrixCell['metrics']['a'] {
  const o = obj(value, at)
  if ('voidRate' in o) {
    throw new ArtifactError(
      `${at}: carries \`voidRate\`. Under us54 the void outcome is abolished (RULES_US54.md ` +
        'row 14) and `concedeRate` replaced it. That is not a rename — it counts a different ' +
        'event — so this artifact is from the wrong rule set and cannot be compared with one ' +
        'that is.',
    )
  }
  const out = {} as Record<MetricKey, number>
  for (const k of METRIC_KEYS) out[k] = num(o[k], `${at}.${k}`)
  return out
}

function matrixCell(value: unknown, at: string): MatrixCell {
  const o = obj(value, at)
  const ties = num(o.ties, `${at}.ties`)
  if (ties !== 0) {
    throw new ArtifactError(
      `${at}: ties=${ties}. Ties are arithmetically impossible under us54 — 9 sets, clinch at ` +
        '5, so both teams holding at most 4 totals at most 8 (RULES_US54.md §5). A non-zero ' +
        'count means these results were not produced under the rule set they claim.',
    )
  }
  const m = obj(o.metrics, `${at}.metrics`)
  return {
    a: str(o.a, `${at}.a`),
    b: str(o.b, `${at}.b`),
    pairs: num(o.pairs, `${at}.pairs`),
    games: num(o.games, `${at}.games`),
    aScore: num(o.aScore, `${at}.aScore`),
    se: num(o.se, `${at}.se`),
    ci95: pair(o.ci95, `${at}.ci95`),
    aWins: num(o.aWins, `${at}.aWins`),
    bWins: num(o.bWins, `${at}.bWins`),
    ties: 0,
    bookMargin: num(o.bookMargin, `${at}.bookMargin`),
    significant: bool(o.significant, `${at}.significant`),
    qValue: num(o.qValue, `${at}.qValue`),
    metrics: { a: metrics(m.a, `${at}.metrics.a`), b: metrics(m.b, `${at}.metrics.b`) },
  }
}

/**
 * `family` is checked to be a string and then WIDENED into the closed
 * `StyleFamily` union rather than validated against it. That is deliberate — a
 * roster addition should not be refused at the boundary — but it is a cast, so
 * the guarantee the type appears to give is not one this function makes.
 *
 * The obligation that buys: every consumer must handle a family it has never
 * heard of, and none of them may look one up by indexing an object literal.
 * `{...}[family]` walks `Object.prototype`, so `"constructor"` and
 * `"__proto__"` come back truthy and defeat the `??` fallback that was supposed
 * to catch exactly this. Both lookups (`FAMILY_CODE` in the counter-graph
 * layout, `FAMILY_LABEL` on the report page) are `Map`s for that reason. If a
 * third one is ever added, it is a `Map` too.
 */
function styleDef(value: unknown, at: string): StyleDef {
  const o = obj(value, at)
  return {
    id: str(o.id, `${at}.id`),
    label: str(o.label, `${at}.label`),
    family: str(o.family, `${at}.family`) as StyleDef['family'],
    thesis: str(o.thesis, `${at}.thesis`),
    rationale: typeof o.rationale === 'string' ? o.rationale : undefined,
  }
}

function criterion(value: unknown, at: string): Criterion {
  const o = obj(value, at)
  const id = num(o.id, `${at}.id`)
  if (id !== 1 && id !== 2 && id !== 3 && id !== 4) {
    throw new ArtifactError(`${at}.id: expected 1..4, got ${id}`)
  }
  return {
    id,
    label: str(o.label, `${at}.label`),
    pass: o.pass === null ? null : bool(o.pass, `${at}.pass`),
    detail: str(o.detail, `${at}.detail`),
  }
}

const ACTION_TYPES = new Set(['ask', 'claim', 'pass', 'designate', 'decline'])

function gameAction(value: unknown, at: string): GameAction {
  const o = obj(value, at)
  const type = str(o.type, `${at}.type`)
  if (!ACTION_TYPES.has(type)) throw new ArtifactError(`${at}.type: unknown action "${type}"`)
  num(o.seat, `${at}.seat`)
  // The engine's `reduce` is the real validator — it is a total function that returns an error
  // rather than throwing, and the replay page surfaces that error verbatim. Re-implementing the
  // per-variant legality rules here would be a second rule set to keep in sync.
  return o as unknown as GameAction
}

function replay(value: unknown, at: string): ReplayRecord {
  const o = obj(value, at)
  const pairing = arr(o.pairing, `${at}.pairing`)
  const startSeat = num(o.startSeat, `${at}.startSeat`)
  if (!Number.isInteger(startSeat) || startSeat < 0 || startSeat > 5) {
    throw new ArtifactError(`${at}.startSeat: expected seat 0..5, got ${startSeat}`)
  }
  const sets = pair(o.sets, `${at}.sets`)
  return {
    id: str(o.id, `${at}.id`),
    pairing: [str(pairing[0], `${at}.pairing[0]`), str(pairing[1], `${at}.pairing[1]`)],
    seed: str(o.seed, `${at}.seed`),
    startSeat: startSeat as Seat,
    caption: str(o.caption, `${at}.caption`),
    seatStyles: arr(o.seatStyles, `${at}.seatStyles`).map((s, i) => str(s, `${at}.seatStyles[${i}]`)),
    moves: num(o.moves, `${at}.moves`),
    sets,
    unresolved: num(o.unresolved, `${at}.unresolved`),
    actions: arr(o.actions, `${at}.actions`).map((a, i) => gameAction(a, `${at}.actions[${i}]`)),
  }
}

/** Parse and validate one artifact document. Throws `ArtifactError` with a readable path. */
export function parseArtifact(text: string, source: string): LabArtifact {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    throw new ArtifactError(`${source}: not valid JSON — ${(error as Error).message}`)
  }

  const root = obj(json, source)
  const meta = obj(root.meta, `${source}.meta`)
  const analysis = obj(meta.analysis, `${source}.meta.analysis`)
  const health = obj(meta.health, `${source}.meta.health`)

  const schemaVersion = num(meta.schemaVersion, `${source}.meta.schemaVersion`)
  if (schemaVersion !== 1) {
    throw new ArtifactError(
      `${source}.meta.schemaVersion is ${schemaVersion}; this site reads schema 1 only.`,
    )
  }
  const ruleSet = str(meta.ruleSet, `${source}.meta.ruleSet`)
  if (ruleSet !== 'us54') {
    throw new ArtifactError(
      `${source}.meta.ruleSet is "${ruleSet}". This site reports us54 results only — the live ` +
        'table plays pagat48, and the two are different games (RULES_US54.md §6).',
    )
  }

  const styles = arr(root.styles, `${source}.styles`).map((s, i) => styleDef(s, `${source}.styles[${i}]`))
  const matrix = arr(root.matrix, `${source}.matrix`).map((c, i) => matrixCell(c, `${source}.matrix[${i}]`))

  // The roster size is a boundary condition, not a preference. Every diagram
  // type on the report has a hard range and enforces it by THROWING during
  // layout: the counter-graph refuses more than 9 nodes, the bar chart and the
  // dumbbell cap at 4..8 rows, the degradation line wants 4..12 x-positions.
  // A throw during render is an uncaught exception and a blank page, which is
  // exactly the failure mode `loadArtifact` exists to convert into a value —
  // so the range is checked here, once, where a refusal has a message.
  if (styles.length < 5 || styles.length > 9) {
    throw new ArtifactError(
      `${source}.styles has ${styles.length} entries. The report's figures are drawn for a ` +
        'roster of 5 to 9: the counter-graph budget is 9 nodes, and the bar and dumbbell types ' +
        'need at least 4 rows after their own slicing. Outside that range the diagrams throw ' +
        'during layout, which would render as a blank page instead of as this message.',
    )
  }

  const known = new Set(styles.map((s) => s.id))
  for (const [i, cell] of matrix.entries()) {
    if (!known.has(cell.a) || !known.has(cell.b)) {
      throw new ArtifactError(
        `${source}.matrix[${i}]: cell ${cell.a} vs ${cell.b} names a style that is not in ` +
          '`styles`. The roster and the matrix have to describe the same run.',
      )
    }
  }

  const ranking = obj(root.ranking, `${source}.ranking`)
  const verdict = str(ranking.verdict, `${source}.ranking.verdict`)
  if (verdict !== 'dominant' && verdict !== 'cyclic' && verdict !== 'inconclusive') {
    throw new ArtifactError(
      `${source}.ranking.verdict is "${verdict}"; the only honest values are dominant, cyclic ` +
        'and inconclusive.',
    )
  }

  return {
    meta: {
      schemaVersion: 1,
      generatedAt: str(meta.generatedAt, `${source}.meta.generatedAt`),
      engineCommit: str(meta.engineCommit, `${source}.meta.engineCommit`),
      rulesHash: str(meta.rulesHash, `${source}.meta.rulesHash`),
      rulesFile: str(meta.rulesFile, `${source}.meta.rulesFile`),
      ruleSet: 'us54',
      gamesTotal: num(meta.gamesTotal, `${source}.meta.gamesTotal`),
      seedSet: {
        count: num(obj(meta.seedSet, `${source}.meta.seedSet`).count, `${source}.meta.seedSet.count`),
        prefix: str(obj(meta.seedSet, `${source}.meta.seedSet`).prefix, `${source}.meta.seedSet.prefix`),
      },
      synthetic: bool(meta.synthetic, `${source}.meta.synthetic`),
      notice: str(meta.notice, `${source}.meta.notice`),
      analysis: {
        alpha: num(analysis.alpha, `${source}.meta.analysis.alpha`),
        cells: num(analysis.cells, `${source}.meta.analysis.cells`),
        significantCells: num(analysis.significantCells, `${source}.meta.analysis.significantCells`),
        cyclicThreshold: num(analysis.cyclicThreshold, `${source}.meta.analysis.cyclicThreshold`),
        exploitabilityMargin: num(
          analysis.exploitabilityMargin,
          `${source}.meta.analysis.exploitabilityMargin`,
        ),
        exploitabilityRan: bool(analysis.exploitabilityRan, `${source}.meta.analysis.exploitabilityRan`),
      },
      health: {
        illegalActions: num(health.illegalActions, `${source}.meta.health.illegalActions`),
        cappedGames: num(health.cappedGames, `${source}.meta.health.cappedGames`),
        invariantViolations: num(health.invariantViolations, `${source}.meta.health.invariantViolations`),
        distinctSeeds: num(health.distinctSeeds, `${source}.meta.health.distinctSeeds`),
      },
    },
    styles,
    matrix,
    ranking: {
      meanScore: arr(ranking.meanScore, `${source}.ranking.meanScore`).map((m, i) => {
        const o = obj(m, `${source}.ranking.meanScore[${i}]`)
        return {
          style: str(o.style, `${source}.ranking.meanScore[${i}].style`),
          value: num(o.value, `${source}.ranking.meanScore[${i}].value`),
          ci95: pair(o.ci95, `${source}.ranking.meanScore[${i}].ci95`),
        }
      }),
      maximin: arr(ranking.maximin, `${source}.ranking.maximin`).map((m, i) => {
        const o = obj(m, `${source}.ranking.maximin[${i}]`)
        return {
          style: str(o.style, `${source}.ranking.maximin[${i}].style`),
          value: num(o.value, `${source}.ranking.maximin[${i}].value`),
          worstVs: str(o.worstVs, `${source}.ranking.maximin[${i}].worstVs`),
          lower95: num(o.lower95, `${source}.ranking.maximin[${i}].lower95`),
          significant: bool(o.significant, `${source}.ranking.maximin[${i}].significant`),
        }
      }),
      cyclicEnergy: num(ranking.cyclicEnergy, `${source}.ranking.cyclicEnergy`),
      cycles: arr(ranking.cycles, `${source}.ranking.cycles`).map((c, i) => {
        const o = obj(c, `${source}.ranking.cycles[${i}]`)
        return {
          styles: arr(o.styles, `${source}.ranking.cycles[${i}].styles`).map((s, k) =>
            str(s, `${source}.ranking.cycles[${i}].styles[${k}]`),
          ),
          minEdge: num(o.minEdge, `${source}.ranking.cycles[${i}].minEdge`),
        }
      }),
      verdict,
      criteria: arr(ranking.criteria, `${source}.ranking.criteria`).map((c, i) =>
        criterion(c, `${source}.ranking.criteria[${i}]`),
      ),
      verdictSummary: str(ranking.verdictSummary, `${source}.ranking.verdictSummary`),
    },
    exploitability: arr(root.exploitability, `${source}.exploitability`).map((e, i) => {
      const at = `${source}.exploitability[${i}]`
      const o = obj(e, at)
      return {
        style: str(o.style, `${at}.style`),
        searched: bool(o.searched, `${at}.searched`),
        score: num(o.score, `${at}.score`),
        se: num(o.se, `${at}.se`),
        ci95: pair(o.ci95, `${at}.ci95`),
        gap: num(o.gap, `${at}.gap`),
        searchScore: num(o.searchScore, `${at}.searchScore`),
        searchGames: num(o.searchGames, `${at}.searchGames`),
        evalGames: num(o.evalGames, `${at}.evalGames`),
        candidatesTried: num(o.candidatesTried, `${at}.candidatesTried`),
        inertCandidates: num(o.inertCandidates, `${at}.inertCandidates`),
        detectableDelta: num(o.detectableDelta, `${at}.detectableDelta`),
      }
    }),
    crossplay: arr(root.crossplay, `${source}.crossplay`).map((c, i) => {
      const at = `${source}.crossplay[${i}]`
      const o = obj(c, at)
      const mode = str(o.mode, `${at}.mode`)
      if (mode !== 'team-vs-team' && mode !== 'mixed-team') {
        throw new ArtifactError(`${at}.mode: expected team-vs-team or mixed-team, got "${mode}"`)
      }
      return {
        us: str(o.us, `${at}.us`),
        them: str(o.them, `${at}.them`),
        mode,
        pairs: num(o.pairs, `${at}.pairs`),
        usScore: num(o.usScore, `${at}.usScore`),
        ci95: pair(o.ci95, `${at}.ci95`),
        seedSet: str(o.seedSet, `${at}.seedSet`),
        rulesHashAgreed: str(o.rulesHashAgreed, `${at}.rulesHashAgreed`),
        note: str(o.note, `${at}.note`),
      }
    }),
    replays: arr(root.replays, `${source}.replays`).map((r, i) => replay(r, `${source}.replays[${i}]`)),
  }
}

/* -- the committed cases ------------------------------------------------------------------ */

const SOURCES: Record<ArtifactCase, { file: string; text: string }> = {
  cyclic: { file: 'src/lab/data/style-results.json', text: cyclicRaw },
  dominant: { file: 'src/lab/data/style-results.dominant.json', text: dominantRaw },
  v2: { file: 'src/lab/data/style-results.v2.json', text: v2Raw },
  stale: { file: 'src/lab/data/style-results.stale.json', text: staleRaw },
}

export type LoadResult =
  | { ok: true; artifact: LabArtifact; file: string }
  | { ok: false; file: string; detail: string }

function load(which: ArtifactCase): LoadResult {
  const { file, text } = SOURCES[which]
  try {
    return { ok: true, artifact: parseArtifact(text, file), file }
  } catch (error) {
    return error instanceof ArtifactError
      ? { ok: false, file, detail: error.detail }
      : { ok: false, file, detail: String(error) }
  }
}


/**
 * Parsed once, at module load of the lab chunk. Eager rather than lazily cached on purpose: a
 * lazy cache would have to be written to during render, and a component that mutates module
 * state while rendering is exactly what the React Compiler rule set exists to catch. Four
 * documents parse in single-digit milliseconds.
 */
const LOADED: Record<ArtifactCase, LoadResult> = {
  cyclic: load('cyclic'),
  dominant: load('dominant'),
  v2: load('v2'),
  stale: load('stale'),
}

/** A parse failure is a value, never a thrown exception at render time. */
export function loadArtifact(which: ArtifactCase): LoadResult {
  return LOADED[which]
}

// Both moved to `./case.ts`, which carries no data imports — see the note there. Re-exported so
// pages that legitimately read the artifact can still take everything from one place.
export { caseFromSearch, ARTIFACT_CASES } from './case.ts'

export function styleLabel(artifact: LabArtifact, id: string): string {
  return artifact.styles.find((s) => s.id === id)?.label ?? id
}
