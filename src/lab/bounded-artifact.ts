/**
 * The bounded artifact: the boundary validator for `bounded-results.json` (SPEC v1.5 Phase 2).
 *
 * Mirrors [adaptive-artifact.ts](adaptive-artifact.ts)'s discipline exactly, for the same
 * reasons: the site is a **pure reader of one committed artifact**, imported with `?raw` so
 * Vite ships it inside the lazily-loaded chunk, parsed ONCE at this boundary where untyped
 * bytes become typed values, with hard refusals — a schema drift that surfaces as
 * `undefined.toFixed` three components deep is a worse failure than a named one. The types
 * come from [lib/lab/bounded-types.ts](../../lib/lab/bounded-types.ts), the same module the
 * emitter is typechecked against, so the two ends of the pipe cannot drift apart silently;
 * this file's job is to prove the *bytes* actually honour that contract.
 *
 * Refusals, all `ArtifactError` with a readable path:
 *   - `schemaVersion` other than {@link BOUNDED_SCHEMA_VERSION} — a reader must notice.
 *     (Version 2 added the E4b `accuracySingle` block, the P8 verdict and the `multiplicity`
 *     annotation; a version-1 file predates E4b and is refused so no page silently renders
 *     without the attribution follow-up.)
 *   - `ruleSet` other than `us54` — these are us54 results and nothing else's.
 *   - a style id the roster does not carry, anywhere an id keys a value.
 *   - a tier outside the shipped three — the E2 cells are easy/medium/hard and nothing else.
 *   - a ladder that does not ascend strictly — the P1 ordering reads it left to right.
 *   - a verdict outside {confirmed, refuted, mixed} or a prediction outside P1–P8 — the
 *     pre-registered set is closed; an unknown entry means the file is from a different suite.
 *   - a multiplicity family outside {P7, P8} — only the two rung families carry the
 *     registered Bonferroni annotation.
 *
 * NO page components live here — a later task builds `/lab/bounded` against this parser. The
 * artifact is parsed eagerly at module load, like artifact.ts's `LOADED`: a lazy cache would
 * have to be written during render, which is exactly what the React Compiler rule set exists
 * to catch. A parse failure is a value (`ok: false`), never a render-time throw.
 */
import type {
  AccuracyAdjacentDelta,
  BitsEquivalent,
  BoundedAccuracy,
  BoundedAccuracyCell,
  BoundedAccuracySingle,
  BoundedHealthSummary,
  BoundedPrediction,
  BoundedPredictionId,
  BoundedResults,
  BoundedVerdict,
  ClusteredDiff,
  EvidenceAgeRow,
  EvidenceCurve,
  EvidenceRate,
  LadderAdjacentDelta,
  LadderCell,
  MirrorExact,
  MultiplicityFamily,
  MultiplicityRung,
  SingleAccuracyCell,
  TierCell,
} from '../../lib/lab/bounded-types.ts'
import { BOUNDED_SCHEMA_VERSION, BOUNDED_TIERS } from '../../lib/lab/bounded-types.ts'
import { STYLE_IDS } from '../../lib/engine/index.ts'
import type { BotDifficulty, Seat, StyleId } from '../../lib/engine/index.ts'
import type { AccuracyByStyle, VerdictValue } from '../../lib/lab/adaptive-types.ts'
import type { CappedGame, CellHealth } from '../../lib/lab/types.ts'
import { ArtifactError } from './artifact.ts'

import boundedRaw from './data/bounded-results.json?raw'

/* -- primitive walkers (each boundary owns its own refusals, per artifact.ts) --------------- */

type Obj = Record<string, unknown>

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `an array of ${value.length}`
  return typeof value
}

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

function numOrNull(value: unknown, at: string): number | null {
  if (value === null) return null
  return num(value, at)
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

const KNOWN_STYLES: ReadonlySet<string> = new Set(STYLE_IDS)
const KNOWN_TIERS: ReadonlySet<string> = new Set(BOUNDED_TIERS)

function styleId(value: unknown, at: string): StyleId {
  const s = str(value, at)
  if (!KNOWN_STYLES.has(s)) {
    throw new ArtifactError(
      `${at}: "${s}" is not a roster style. The artifact and the engine must describe the same ` +
        'nine styles — an unknown id means this file was produced against a different roster.',
    )
  }
  return s as StyleId
}

function tierId(value: unknown, at: string): BotDifficulty {
  const s = str(value, at)
  if (!KNOWN_TIERS.has(s)) {
    throw new ArtifactError(`${at}: "${s}" is not a shipped tier; the E2 cells are easy, medium and hard.`)
  }
  return s as BotDifficulty
}

/** Every roster style must key an entry; unknown keys are refused, missing keys are refused. */
function styleRecord<T>(value: unknown, at: string, one: (v: unknown, at: string) => T): Record<StyleId, T> {
  const o = obj(value, at)
  const out = {} as Record<StyleId, T>
  for (const key of Object.keys(o)) styleId(key, `${at} key`)
  for (const id of STYLE_IDS) {
    if (!Object.hasOwn(o, id)) throw new ArtifactError(`${at}: missing entry for style "${id}"`)
    out[id] = one(o[id], `${at}.${id}`)
  }
  return out
}

/* -- section walkers ------------------------------------------------------------------------ */

function cellHealth(value: unknown, at: string): CellHealth {
  const h = obj(value, at)
  return {
    illegalActions: num(h.illegalActions, `${at}.illegalActions`),
    cappedGames: num(h.cappedGames, `${at}.cappedGames`),
    invariantViolations: num(h.invariantViolations, `${at}.invariantViolations`),
    ties: num(h.ties, `${at}.ties`),
    voids: num(h.voids, `${at}.voids`),
    nonClinch: num(h.nonClinch, `${at}.nonClinch`),
    distinctSeeds: num(h.distinctSeeds, `${at}.distinctSeeds`),
    expectedSeeds: num(h.expectedSeeds, `${at}.expectedSeeds`),
  }
}

interface ShareCellFields {
  id: string
  pairs: number
  games: number
  distinctSeeds: number
  share: number
  se: number
  ci95: [number, number]
  seUnpaired: number
  avgMoves: number
  maxMoves: number
  health: CellHealth
}

function shareCell(o: Obj, at: string): ShareCellFields {
  return {
    id: str(o.id, `${at}.id`),
    pairs: num(o.pairs, `${at}.pairs`),
    games: num(o.games, `${at}.games`),
    distinctSeeds: num(o.distinctSeeds, `${at}.distinctSeeds`),
    share: num(o.share, `${at}.share`),
    se: num(o.se, `${at}.se`),
    ci95: pair(o.ci95, `${at}.ci95`),
    seUnpaired: num(o.seUnpaired, `${at}.seUnpaired`),
    avgMoves: num(o.avgMoves, `${at}.avgMoves`),
    maxMoves: num(o.maxMoves, `${at}.maxMoves`),
    health: cellHealth(o.health, `${at}.health`),
  }
}

function ladderCell(value: unknown, at: string): LadderCell {
  const o = obj(value, at)
  return { ...shareCell(o, at), bits: num(o.bits, `${at}.bits`) }
}

function ladderDelta(value: unknown, at: string): LadderAdjacentDelta {
  const o = obj(value, at)
  return {
    fromBits: num(o.fromBits, `${at}.fromBits`),
    toBits: num(o.toBits, `${at}.toBits`),
    seeds: num(o.seeds, `${at}.seeds`),
    delta: num(o.delta, `${at}.delta`),
    se: num(o.se, `${at}.se`),
    z: num(o.z, `${at}.z`),
    pass: bool(o.pass, `${at}.pass`),
  }
}

function mirrorExact(value: unknown, at: string): MirrorExact {
  const o = obj(value, at)
  return {
    pairs: num(o.pairs, `${at}.pairs`),
    deviations: num(o.deviations, `${at}.deviations`),
    share: num(o.share, `${at}.share`),
  }
}

function bitsEquivalent(value: unknown, at: string): BitsEquivalent {
  const o = obj(value, at)
  return {
    finite: bool(o.finite, `${at}.finite`),
    bits: numOrNull(o.bits, `${at}.bits`),
    lo: numOrNull(o.lo, `${at}.lo`),
    hi: numOrNull(o.hi, `${at}.hi`),
    note: str(o.note, `${at}.note`),
  }
}

function tierCell(value: unknown, at: string): TierCell {
  const o = obj(value, at)
  return {
    ...shareCell(o, at),
    tier: tierId(o.tier, `${at}.tier`),
    bitsEquivalent: bitsEquivalent(o.bitsEquivalent, `${at}.bitsEquivalent`),
  }
}

function evidenceRate(value: unknown, at: string): EvidenceRate {
  const o = obj(value, at)
  return {
    available: num(o.available, `${at}.available`),
    exploited: num(o.exploited, `${at}.exploited`),
    rate: num(o.rate, `${at}.rate`),
  }
}

function clusteredDiff(value: unknown, at: string): ClusteredDiff {
  const o = obj(value, at)
  return {
    diff: num(o.diff, `${at}.diff`),
    se: num(o.se, `${at}.se`),
    z: num(o.z, `${at}.z`),
    seeds: num(o.seeds, `${at}.seeds`),
  }
}

function evidenceAgeRow(value: unknown, at: string): EvidenceAgeRow {
  const o = obj(value, at)
  const hi = o.hi === null ? null : num(o.hi, `${at}.hi`)
  return {
    lo: num(o.lo, `${at}.lo`),
    hi,
    available: num(o.available, `${at}.available`),
    exploited: num(o.exploited, `${at}.exploited`),
    exploitRate: num(o.exploitRate, `${at}.exploitRate`),
    hits: num(o.hits, `${at}.hits`),
    hitRate: num(o.hitRate, `${at}.hitRate`),
  }
}

function evidenceCurve(value: unknown, at: string): EvidenceCurve {
  const o = obj(value, at)
  const w = obj(o.window, `${at}.window`)
  return {
    policy: str(o.policy, `${at}.policy`),
    askDecisions: num(o.askDecisions, `${at}.askDecisions`),
    decisionsWithCertain: num(o.decisionsWithCertain, `${at}.decisionsWithCertain`),
    observations: num(o.observations, `${at}.observations`),
    rows: arr(o.rows, `${at}.rows`).map((r, i) => evidenceAgeRow(r, `${at}.rows[${i}]`)),
    young: evidenceRate(o.young, `${at}.young`),
    old: evidenceRate(o.old, `${at}.old`),
    decay: clusteredDiff(o.decay, `${at}.decay`),
    window: {
      inside: evidenceRate(w.inside, `${at}.window.inside`),
      justOutside: evidenceRate(w.justOutside, `${at}.window.justOutside`),
      insideSplit: clusteredDiff(w.insideSplit, `${at}.window.insideSplit`),
      cliff: clusteredDiff(w.cliff, `${at}.window.cliff`),
    },
    halfLifeAge: numOrNull(o.halfLifeAge, `${at}.halfLifeAge`),
  }
}

function accuracyByStyle(value: unknown, at: string): AccuracyByStyle {
  const o = obj(value, at)
  return { seats: num(o.seats, `${at}.seats`), top1: num(o.top1, `${at}.top1`) }
}

function accuracyCell(value: unknown, at: string): BoundedAccuracyCell {
  const o = obj(value, at)
  return {
    bits: num(o.bits, `${at}.bits`),
    games: num(o.games, `${at}.games`),
    seats: num(o.seats, `${at}.seats`),
    top1: num(o.top1, `${at}.top1`),
    byStyle: styleRecord(o.byStyle, `${at}.byStyle`, accuracyByStyle),
  }
}

function accuracyDelta(value: unknown, at: string): AccuracyAdjacentDelta {
  const o = obj(value, at)
  return {
    fromBits: num(o.fromBits, `${at}.fromBits`),
    toBits: num(o.toBits, `${at}.toBits`),
    seeds: num(o.seeds, `${at}.seeds`),
    delta: num(o.delta, `${at}.delta`),
    se: num(o.se, `${at}.se`),
    z: num(o.z, `${at}.z`),
    pass: bool(o.pass, `${at}.pass`),
  }
}

function accuracy(value: unknown, at: string): BoundedAccuracy {
  const o = obj(value, at)
  return {
    cells: arr(o.cells, `${at}.cells`).map((c, i) => accuracyCell(c, `${at}.cells[${i}]`)),
    deltas: arr(o.deltas, `${at}.deltas`).map((d, i) => accuracyDelta(d, `${at}.deltas[${i}]`)),
  }
}

/* -- the E4b block (schema 2) --------------------------------------------------------------- */

function singleAccuracyCell(value: unknown, at: string): SingleAccuracyCell {
  const o = obj(value, at)
  return {
    bits: num(o.bits, `${at}.bits`),
    games: num(o.games, `${at}.games`),
    reads: num(o.reads, `${at}.reads`),
    top1: num(o.top1, `${at}.top1`),
    se: num(o.se, `${at}.se`),
    seeds: num(o.seeds, `${at}.seeds`),
    byStyle: styleRecord(o.byStyle, `${at}.byStyle`, accuracyByStyle),
  }
}

function healthSummary(value: unknown, at: string): BoundedHealthSummary {
  const h = obj(value, at)
  return {
    ok: bool(h.ok, `${at}.ok`),
    illegalActions: num(h.illegalActions, `${at}.illegalActions`),
    cappedGames: num(h.cappedGames, `${at}.cappedGames`),
    invariantViolations: num(h.invariantViolations, `${at}.invariantViolations`),
    ties: num(h.ties, `${at}.ties`),
    voids: num(h.voids, `${at}.voids`),
    nonClinch: num(h.nonClinch, `${at}.nonClinch`),
    capped: arr(h.capped, `${at}.capped`).map((g, i) => cappedGame(g, `${at}.capped[${i}]`)),
    violations: arr(h.violations, `${at}.violations`).map((v, i) => str(v, `${at}.violations[${i}]`)),
  }
}

function accuracySingleOf(value: unknown, at: string): BoundedAccuracySingle {
  const o = obj(value, at)
  const m = obj(o.meta, `${at}.meta`)
  const inf = obj(o.infReproduction, `${at}.infReproduction`)
  return {
    meta: {
      generatedAt: str(m.generatedAt, `${at}.meta.generatedAt`),
      engineCommit: str(m.engineCommit, `${at}.meta.engineCommit`),
      gamesTotal: num(m.gamesTotal, `${at}.meta.gamesTotal`),
      movesTotal: num(m.movesTotal, `${at}.meta.movesTotal`),
      workers: num(m.workers, `${at}.meta.workers`),
      wallMs: num(m.wallMs, `${at}.meta.wallMs`),
      gamesPerSecond: num(m.gamesPerSecond, `${at}.meta.gamesPerSecond`),
      recordsDigest: str(m.recordsDigest, `${at}.meta.recordsDigest`),
      notes: arr(m.notes, `${at}.meta.notes`).map((n, i) => str(n, `${at}.meta.notes[${i}]`)),
    },
    mapping: str(o.mapping, `${at}.mapping`),
    health: healthSummary(o.health, `${at}.health`),
    cells: arr(o.cells, `${at}.cells`).map((c, i) => singleAccuracyCell(c, `${at}.cells[${i}]`)),
    deltas: arr(o.deltas, `${at}.deltas`).map((d, i) => accuracyDelta(d, `${at}.deltas[${i}]`)),
    infReproduction: {
      games: num(inf.games, `${at}.infReproduction.games`),
      deviations: num(inf.deviations, `${at}.infReproduction.deviations`),
    },
  }
}

function multiplicityRung(value: unknown, at: string): MultiplicityRung {
  const o = obj(value, at)
  return {
    fromBits: num(o.fromBits, `${at}.fromBits`),
    toBits: num(o.toBits, `${at}.toBits`),
    delta: num(o.delta, `${at}.delta`),
    se: num(o.se, `${at}.se`),
    z: num(o.z, `${at}.z`),
    pOneSided: num(o.pOneSided, `${at}.pOneSided`),
    pBonferroni: num(o.pBonferroni, `${at}.pBonferroni`),
    violatesRaw: bool(o.violatesRaw, `${at}.violatesRaw`),
    violatesBonferroni: bool(o.violatesBonferroni, `${at}.violatesBonferroni`),
  }
}

function multiplicityFamily(value: unknown, at: string): MultiplicityFamily {
  const o = obj(value, at)
  const id = str(o.id, `${at}.id`)
  if (id !== 'P7' && id !== 'P8') {
    throw new ArtifactError(
      `${at}.id: "${id}" is not an annotated rung family; only P7 and P8 carry the registered ` +
        'Bonferroni annotation.',
    )
  }
  return {
    id,
    comparisons: num(o.comparisons, `${at}.comparisons`),
    alpha: num(o.alpha, `${at}.alpha`),
    rungs: arr(o.rungs, `${at}.rungs`).map((r, i) => multiplicityRung(r, `${at}.rungs[${i}]`)),
    note: str(o.note, `${at}.note`),
  }
}

const PREDICTION_IDS = new Set<string>(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'])
const VERDICT_VALUES = new Set<string>(['confirmed', 'refuted', 'mixed'])

function predictionId(value: unknown, at: string): BoundedPredictionId {
  const s = str(value, at)
  if (!PREDICTION_IDS.has(s)) {
    throw new ArtifactError(`${at}: "${s}" is not a pre-registered prediction; the set is P1–P8 and closed.`)
  }
  return s as BoundedPredictionId
}

function prediction(value: unknown, at: string): BoundedPrediction {
  const o = obj(value, at)
  return { id: predictionId(o.id, `${at}.id`), text: str(o.text, `${at}.text`) }
}

function verdict(value: unknown, at: string): BoundedVerdict {
  const o = obj(value, at)
  const v = str(o.verdict, `${at}.verdict`)
  if (!VERDICT_VALUES.has(v)) {
    throw new ArtifactError(`${at}.verdict is "${v}"; the only honest values are confirmed, refuted and mixed.`)
  }
  return {
    id: predictionId(o.id, `${at}.id`),
    prediction: str(o.prediction, `${at}.prediction`),
    verdict: v as VerdictValue,
    detail: str(o.detail, `${at}.detail`),
  }
}

function cappedGame(value: unknown, at: string): CappedGame {
  const o = obj(value, at)
  const orient = num(o.orient, `${at}.orient`)
  if (orient !== 0 && orient !== 1) throw new ArtifactError(`${at}.orient: expected 0 or 1, got ${orient}`)
  const startSeat = num(o.startSeat, `${at}.startSeat`)
  if (!Number.isInteger(startSeat) || startSeat < 0 || startSeat > 5) {
    throw new ArtifactError(`${at}.startSeat: expected seat 0..5, got ${startSeat}`)
  }
  return {
    cell: str(o.cell, `${at}.cell`),
    seed: str(o.seed, `${at}.seed`),
    orient,
    startSeat: startSeat as Seat,
    steps: num(o.steps, `${at}.steps`),
  }
}

function variantOf(value: unknown, at: string): BoundedResults['meta']['config']['variant'] {
  const s = str(value, at)
  if (s !== 'us54' && s !== 'pagat48') throw new ArtifactError(`${at}: expected us54 or pagat48, got "${s}"`)
  return s
}

function invariantCheckOf(value: unknown, at: string): BoundedResults['meta']['config']['invariantCheck'] {
  const s = str(value, at)
  if (s !== 'every' && s !== 'final' && s !== 'off') {
    throw new ArtifactError(`${at}: expected every, final or off, got "${s}"`)
  }
  return s
}

function ascendingBits(value: unknown, at: string): number[] {
  const bits = arr(value, at).map((v, i) => num(v, `${at}[${i}]`))
  for (let i = 1; i < bits.length; i++) {
    if (bits[i] <= bits[i - 1]) {
      throw new ArtifactError(`${at}: must ascend strictly; ${bits[i - 1]} then ${bits[i]} — the ladder is read left to right.`)
    }
  }
  return bits
}

/* -- the parse ------------------------------------------------------------------------------ */

/** Parse and validate one bounded artifact. Throws `ArtifactError` with a readable path. */
export function parseBoundedArtifact(text: string, source: string): BoundedResults {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    throw new ArtifactError(`${source}: not valid JSON — ${(error as Error).message}`)
  }

  const root = obj(json, source)
  const meta = obj(root.meta, `${source}.meta`)

  const schemaVersion = num(meta.schemaVersion, `${source}.meta.schemaVersion`)
  if (schemaVersion !== BOUNDED_SCHEMA_VERSION) {
    throw new ArtifactError(
      `${source}.meta.schemaVersion is ${schemaVersion}; this site reads bounded schema ` +
        `${BOUNDED_SCHEMA_VERSION} only.`,
    )
  }
  const ruleSet = str(meta.ruleSet, `${source}.meta.ruleSet`)
  if (ruleSet !== 'us54') {
    throw new ArtifactError(
      `${source}.meta.ruleSet is "${ruleSet}". This site reports us54 results only — the live ` +
        'table plays pagat48, and the two are different games (RULES_US54.md §6).',
    )
  }

  const config = obj(meta.config, `${source}.meta.config`)
  const seedSet = obj(meta.seedSet, `${source}.meta.seedSet`)
  const at = (k: string): string => `${source}.meta.${k}`

  const baseline =
    meta.baseline === null
      ? null
      : (() => {
          const b = obj(meta.baseline, at('baseline'))
          return {
            artifact: str(b.artifact, at('baseline.artifact')),
            recordsDigest: str(b.recordsDigest, at('baseline.recordsDigest')),
            endTop1: num(b.endTop1, at('baseline.endTop1')),
          }
        })()

  return {
    meta: {
      schemaVersion: BOUNDED_SCHEMA_VERSION,
      generatedAt: str(meta.generatedAt, at('generatedAt')),
      engineCommit: str(meta.engineCommit, at('engineCommit')),
      rulesHash: str(meta.rulesHash, at('rulesHash')),
      rulesFile: str(meta.rulesFile, at('rulesFile')),
      ruleSet: 'us54',
      config: {
        ladderBits: ascendingBits(config.ladderBits, at('config.ladderBits')),
        ladderPairs: num(config.ladderPairs, at('config.ladderPairs')),
        ladderSeedPrefix: str(config.ladderSeedPrefix, at('config.ladderSeedPrefix')),
        tierPairs: num(config.tierPairs, at('config.tierPairs')),
        accBits: ascendingBits(config.accBits, at('config.accBits')),
        accGames: num(config.accGames, at('config.accGames')),
        accSeedPrefix: str(config.accSeedPrefix, at('config.accSeedPrefix')),
        chunkPairs: num(config.chunkPairs, at('config.chunkPairs')),
        variant: variantOf(config.variant, at('config.variant')),
        stepCap: num(config.stepCap, at('config.stepCap')),
        invariantCheck: invariantCheckOf(config.invariantCheck, at('config.invariantCheck')),
      },
      gamesTotal: num(meta.gamesTotal, at('gamesTotal')),
      seedSet: { prefix: str(seedSet.prefix, at('seedSet.prefix')), count: num(seedSet.count, at('seedSet.count')) },
      wallMs: num(meta.wallMs, at('wallMs')),
      recordsDigest: str(meta.recordsDigest, at('recordsDigest')),
      notes: arr(meta.notes, at('notes')).map((n, i) => str(n, at(`notes[${i}]`))),
      health: healthSummary(meta.health, at('health')),
      baseline,
      predictions: arr(meta.predictions, at('predictions')).map((p, i) => prediction(p, at(`predictions[${i}]`))),
    },
    ladder: arr(root.ladder, `${source}.ladder`).map((c, i) => ladderCell(c, `${source}.ladder[${i}]`)),
    ladderDeltas: arr(root.ladderDeltas, `${source}.ladderDeltas`).map((d, i) =>
      ladderDelta(d, `${source}.ladderDeltas[${i}]`),
    ),
    mirrorExact: mirrorExact(root.mirrorExact, `${source}.mirrorExact`),
    tiers: arr(root.tiers, `${source}.tiers`).map((t, i) => tierCell(t, `${source}.tiers[${i}]`)),
    evidence: arr(root.evidence, `${source}.evidence`).map((c, i) => evidenceCurve(c, `${source}.evidence[${i}]`)),
    accuracy: accuracy(root.accuracy, `${source}.accuracy`),
    accuracySingle: accuracySingleOf(root.accuracySingle, `${source}.accuracySingle`),
    multiplicity: arr(root.multiplicity, `${source}.multiplicity`).map((f, i) =>
      multiplicityFamily(f, `${source}.multiplicity[${i}]`),
    ),
    verdicts: arr(root.verdicts, `${source}.verdicts`).map((v, i) => verdict(v, `${source}.verdicts[${i}]`)),
  }
}

/* -- the committed artifact ----------------------------------------------------------------- */

const SOURCE_FILE = 'src/lab/data/bounded-results.json'

export type BoundedLoadResult =
  | { ok: true; artifact: BoundedResults; file: string }
  | { ok: false; file: string; detail: string }

function load(): BoundedLoadResult {
  try {
    return { ok: true, artifact: parseBoundedArtifact(boundedRaw, SOURCE_FILE), file: SOURCE_FILE }
  } catch (error) {
    return error instanceof ArtifactError
      ? { ok: false, file: SOURCE_FILE, detail: error.detail }
      : { ok: false, file: SOURCE_FILE, detail: String(error) }
  }
}

/**
 * Parsed once, at module load of the chunk that imports this — eager like artifact.ts's
 * `LOADED`, and for the same reason: a lazy cache would be module state written during render.
 */
const LOADED_BOUNDED: BoundedLoadResult = load()

/** A parse failure is a value, never a thrown exception at render time. */
export function loadBoundedArtifact(): BoundedLoadResult {
  return LOADED_BOUNDED
}
