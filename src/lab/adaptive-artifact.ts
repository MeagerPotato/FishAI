/**
 * The adaptive artifact: the boundary validator for `adaptive-results.json` (SPEC Stage 2c).
 *
 * Mirrors [artifact.ts](artifact.ts)'s discipline exactly, for the same reasons: the site is a
 * **pure reader of one committed artifact**, imported with `?raw` so Vite ships it inside the
 * lazily-loaded chunk, parsed ONCE at this boundary where untyped bytes become typed values,
 * with hard refusals — a schema drift that surfaces as `undefined.toFixed` three components
 * deep is a worse failure than a named one. The types come from
 * [lib/lab/adaptive-types.ts](../../lib/lab/adaptive-types.ts), the same module the emitter is
 * typechecked against, so the two ends of the pipe cannot drift apart silently; this file's
 * job is to prove the *bytes* actually honour that contract.
 *
 * Refusals, all `ArtifactError` with a readable path:
 *   - `schemaVersion` other than {@link ADAPTIVE_SCHEMA_VERSION} — a reader must notice.
 *   - `ruleSet` other than `us54` — these are us54 results and nothing else's.
 *   - a style id the roster does not carry, anywhere an id keys a value — the artifact and the
 *     engine must describe the same nine styles, and the 9×9 confusion matrix is drawn 9×9.
 *   - a verdict outside {confirmed, refuted, mixed} or a prediction outside P1–P4 — the
 *     pre-registered set is closed; an unknown entry means the file is from a different suite.
 *
 * NO page components live here — a parallel task builds `/lab/adaptive` against this parser.
 * The artifact is parsed eagerly at module load, like artifact.ts's `LOADED`: a lazy cache
 * would have to be written during render, which is exactly what the React Compiler rule set
 * exists to catch. A parse failure is a value (`ok: false`), never a render-time throw.
 */
import type {
  AccuracyByStyle,
  AccuracyRow,
  AdaptivePrediction,
  AdaptiveResults,
  AdaptiveVerdict,
  ClassifierResult,
  GauntletRow,
  MixedResult,
  MixedRow,
  OracleRow,
  PredictionId,
  StyleUsageRow,
  VerdictValue,
} from '../../lib/lab/adaptive-types.ts'
import { ADAPTIVE_SCHEMA_VERSION } from '../../lib/lab/adaptive-types.ts'
import { STYLE_IDS } from '../../lib/engine/index.ts'
import type { Seat, StyleId } from '../../lib/engine/index.ts'
import type { CappedGame, SideMetrics } from '../../lib/lab/types.ts'
import { ArtifactError } from './artifact.ts'

import adaptiveRaw from './data/adaptive-results.json?raw'

/* -- primitive walkers (the artifact.ts helpers are module-private there, on purpose: each
      boundary owns its own refusals) ------------------------------------------------------- */

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

/** The roster ids, as a Set — the membership refusal below is the boundary's, not a cast. */
const KNOWN_STYLES: ReadonlySet<string> = new Set(STYLE_IDS)

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

const METRIC_KEYS = [
  'askHitRate',
  'turnRetention',
  'claimPrecision',
  'claimYield',
  'concedeRate',
  'concedeRateChosen',
  'foreignDeclareRate',
  'foreignDeclareRateChosen',
  'declareLatency',
  'raceLossesPerGame',
  'clinchDenialsPerGame',
  'leakIndex',
  'hoardIndex',
  'giftsPerGame',
  'setsPerGame',
  'declaresPerGame',
  'forcedDeclareRate',
  'dropoutStep',
  'dropoutRate',
] as const satisfies readonly (keyof SideMetrics)[]

function sideMetrics(value: unknown, at: string): SideMetrics {
  const o = obj(value, at)
  const out = {} as Record<keyof SideMetrics, number>
  for (const k of METRIC_KEYS) out[k] = num(o[k], `${at}.${k}`)
  return out
}

function gauntletRow(value: unknown, at: string): GauntletRow {
  const o = obj(value, at)
  const m = obj(o.metrics, `${at}.metrics`)
  const h = obj(o.health, `${at}.health`)
  return {
    id: str(o.id, `${at}.id`),
    opponent: styleId(o.opponent, `${at}.opponent`),
    pairs: num(o.pairs, `${at}.pairs`),
    games: num(o.games, `${at}.games`),
    distinctSeeds: num(o.distinctSeeds, `${at}.distinctSeeds`),
    score: num(o.score, `${at}.score`),
    se: num(o.se, `${at}.se`),
    ci95: pair(o.ci95, `${at}.ci95`),
    seUnpaired: num(o.seUnpaired, `${at}.seUnpaired`),
    aWins: num(o.aWins, `${at}.aWins`),
    bWins: num(o.bWins, `${at}.bWins`),
    ties: num(o.ties, `${at}.ties`),
    avgMoves: num(o.avgMoves, `${at}.avgMoves`),
    maxMoves: num(o.maxMoves, `${at}.maxMoves`),
    health: {
      illegalActions: num(h.illegalActions, `${at}.health.illegalActions`),
      cappedGames: num(h.cappedGames, `${at}.health.cappedGames`),
      invariantViolations: num(h.invariantViolations, `${at}.health.invariantViolations`),
      ties: num(h.ties, `${at}.health.ties`),
      voids: num(h.voids, `${at}.health.voids`),
      nonClinch: num(h.nonClinch, `${at}.health.nonClinch`),
      distinctSeeds: num(h.distinctSeeds, `${at}.health.distinctSeeds`),
      expectedSeeds: num(h.expectedSeeds, `${at}.health.expectedSeeds`),
    },
    metrics: { a: sideMetrics(m.a, `${at}.metrics.a`), b: sideMetrics(m.b, `${at}.metrics.b`) },
    punterBenchmark: num(o.punterBenchmark, `${at}.punterBenchmark`),
    punterBenchmarkSe: num(o.punterBenchmarkSe, `${at}.punterBenchmarkSe`),
    delta: num(o.delta, `${at}.delta`),
    deltaSe: num(o.deltaSe, `${at}.deltaSe`),
  }
}

function mixedRow(value: unknown, at: string): MixedRow {
  const o = obj(value, at)
  const composition = arr(o.composition, `${at}.composition`)
  if (composition.length !== 3) {
    throw new ArtifactError(`${at}.composition: a team is 3 seats; got ${composition.length} styles`)
  }
  return {
    composition: composition.map((s, i) => styleId(s, `${at}.composition[${i}]`)),
    pairs: num(o.pairs, `${at}.pairs`),
    adaptive: num(o.adaptive, `${at}.adaptive`),
    punter: num(o.punter, `${at}.punter`),
    delta: num(o.delta, `${at}.delta`),
    deltaSe: num(o.deltaSe, `${at}.deltaSe`),
  }
}

function mixed(value: unknown, at: string): MixedResult {
  const o = obj(value, at)
  return {
    compositions: num(o.compositions, `${at}.compositions`),
    pairsPer: num(o.pairsPer, `${at}.pairsPer`),
    adaptiveMean: num(o.adaptiveMean, `${at}.adaptiveMean`),
    punterMean: num(o.punterMean, `${at}.punterMean`),
    pairedDelta: num(o.pairedDelta, `${at}.pairedDelta`),
    deltaSe: num(o.deltaSe, `${at}.deltaSe`),
    ci95: pair(o.ci95, `${at}.ci95`),
    rows: arr(o.rows, `${at}.rows`).map((r, i) => mixedRow(r, `${at}.rows[${i}]`)),
  }
}

function oracleRow(value: unknown, at: string): OracleRow {
  const o = obj(value, at)
  return {
    opponent: styleId(o.opponent, `${at}.opponent`),
    pairs: num(o.pairs, `${at}.pairs`),
    classifier: num(o.classifier, `${at}.classifier`),
    oracle: num(o.oracle, `${at}.oracle`),
    delta: num(o.delta, `${at}.delta`),
    se: num(o.se, `${at}.se`),
    ci95: pair(o.ci95, `${at}.ci95`),
  }
}

function accuracyByStyle(value: unknown, at: string): AccuracyByStyle {
  const o = obj(value, at)
  return { seats: num(o.seats, `${at}.seats`), top1: num(o.top1, `${at}.top1`) }
}

function accuracyRow(value: unknown, at: string): AccuracyRow {
  const o = obj(value, at)
  return {
    events: num(o.events, `${at}.events`),
    seats: num(o.seats, `${at}.seats`),
    top1: num(o.top1, `${at}.top1`),
    byStyle: styleRecord(o.byStyle, `${at}.byStyle`, accuracyByStyle),
  }
}

function classifier(value: unknown, at: string): ClassifierResult {
  const o = obj(value, at)
  const c = obj(o.confusion, `${at}.confusion`)
  const styles = arr(c.styles, `${at}.confusion.styles`).map((s, i) => styleId(s, `${at}.confusion.styles[${i}]`))
  if (styles.length !== STYLE_IDS.length) {
    throw new ArtifactError(
      `${at}.confusion.styles has ${styles.length} entries; the confusion matrix is drawn ` +
        `${STYLE_IDS.length}×${STYLE_IDS.length} and needs exactly the roster`,
    )
  }
  const matrix = arr(c.matrix, `${at}.confusion.matrix`).map((row, i) => {
    const r = arr(row, `${at}.confusion.matrix[${i}]`)
    if (r.length !== styles.length) {
      throw new ArtifactError(`${at}.confusion.matrix[${i}]: ${r.length} columns, expected ${styles.length}`)
    }
    return r.map((v, j) => num(v, `${at}.confusion.matrix[${i}][${j}]`))
  })
  if (matrix.length !== styles.length) {
    throw new ArtifactError(`${at}.confusion.matrix: ${matrix.length} rows, expected ${styles.length}`)
  }
  return {
    checkpoints: arr(o.checkpoints, `${at}.checkpoints`).map((v, i) => num(v, `${at}.checkpoints[${i}]`)),
    accuracy: arr(o.accuracy, `${at}.accuracy`).map((r, i) => accuracyRow(r, `${at}.accuracy[${i}]`)),
    confusion: { events: num(c.events, `${at}.confusion.events`), styles, matrix },
  }
}

function usageRow(value: unknown, at: string): StyleUsageRow {
  const o = obj(value, at)
  const d = obj(o.decisions, `${at}.decisions`)
  return {
    opponent: styleId(o.opponent, `${at}.opponent`),
    decisions: { warmup: num(d.warmup, `${at}.decisions.warmup`), warm: num(d.warm, `${at}.decisions.warm`) },
    warmupShares: styleRecord(o.warmupShares, `${at}.warmupShares`, num),
    warmShares: styleRecord(o.warmShares, `${at}.warmShares`, num),
  }
}

function variantOf(value: unknown, at: string): AdaptiveResults['meta']['config']['variant'] {
  const s = str(value, at)
  if (s !== 'us54' && s !== 'pagat48') throw new ArtifactError(`${at}: expected us54 or pagat48, got "${s}"`)
  return s
}

function invariantCheckOf(value: unknown, at: string): AdaptiveResults['meta']['config']['invariantCheck'] {
  const s = str(value, at)
  if (s !== 'every' && s !== 'final' && s !== 'off') {
    throw new ArtifactError(`${at}: expected every, final or off, got "${s}"`)
  }
  return s
}

const PREDICTION_IDS = new Set<string>(['P1', 'P2', 'P3', 'P4'])
const VERDICT_VALUES = new Set<string>(['confirmed', 'refuted', 'mixed'])

function predictionId(value: unknown, at: string): PredictionId {
  const s = str(value, at)
  if (!PREDICTION_IDS.has(s)) {
    throw new ArtifactError(`${at}: "${s}" is not a pre-registered prediction; the set is P1–P4 and closed.`)
  }
  return s as PredictionId
}

function prediction(value: unknown, at: string): AdaptivePrediction {
  const o = obj(value, at)
  return { id: predictionId(o.id, `${at}.id`), text: str(o.text, `${at}.text`) }
}

function verdict(value: unknown, at: string): AdaptiveVerdict {
  const o = obj(value, at)
  const v = str(o.verdict, `${at}.verdict`)
  if (!VERDICT_VALUES.has(v)) {
    throw new ArtifactError(
      `${at}.verdict is "${v}"; the only honest values are confirmed, refuted and mixed.`,
    )
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

/* -- the parse ------------------------------------------------------------------------------ */

/** Parse and validate one adaptive artifact. Throws `ArtifactError` with a readable path. */
export function parseAdaptiveArtifact(text: string, source: string): AdaptiveResults {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    throw new ArtifactError(`${source}: not valid JSON — ${(error as Error).message}`)
  }

  const root = obj(json, source)
  const meta = obj(root.meta, `${source}.meta`)

  const schemaVersion = num(meta.schemaVersion, `${source}.meta.schemaVersion`)
  if (schemaVersion !== ADAPTIVE_SCHEMA_VERSION) {
    throw new ArtifactError(
      `${source}.meta.schemaVersion is ${schemaVersion}; this site reads adaptive schema ` +
        `${ADAPTIVE_SCHEMA_VERSION} only.`,
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
  const health = obj(meta.health, `${source}.meta.health`)
  const benchmark = obj(meta.benchmark, `${source}.meta.benchmark`)
  const ctp = obj(meta.counterTableProvenance, `${source}.meta.counterTableProvenance`)
  const fpp = obj(meta.fingerprintProvenance, `${source}.meta.fingerprintProvenance`)
  const at = (k: string): string => `${source}.meta.${k}`

  return {
    meta: {
      schemaVersion: ADAPTIVE_SCHEMA_VERSION,
      generatedAt: str(meta.generatedAt, at('generatedAt')),
      engineCommit: str(meta.engineCommit, at('engineCommit')),
      rulesHash: str(meta.rulesHash, at('rulesHash')),
      rulesFile: str(meta.rulesFile, at('rulesFile')),
      ruleSet: 'us54',
      config: {
        gauntletPairs: num(config.gauntletPairs, at('config.gauntletPairs')),
        gauntletSeedPrefix: str(config.gauntletSeedPrefix, at('config.gauntletSeedPrefix')),
        mirrorPairs: num(config.mirrorPairs, at('config.mirrorPairs')),
        mixedPairs: num(config.mixedPairs, at('config.mixedPairs')),
        mixedSeedPrefix: str(config.mixedSeedPrefix, at('config.mixedSeedPrefix')),
        mixedCompositions: num(config.mixedCompositions, at('config.mixedCompositions')),
        oraclePairs: num(config.oraclePairs, at('config.oraclePairs')),
        accGames: num(config.accGames, at('config.accGames')),
        accSeedPrefix: str(config.accSeedPrefix, at('config.accSeedPrefix')),
        accCheckpoints: arr(config.accCheckpoints, at('config.accCheckpoints')).map((v, i) =>
          num(v, at(`config.accCheckpoints[${i}]`)),
        ),
        chunkPairs: num(config.chunkPairs, at('config.chunkPairs')),
        variant: variantOf(config.variant, at('config.variant')),
        stepCap: num(config.stepCap, at('config.stepCap')),
        invariantCheck: invariantCheckOf(config.invariantCheck, at('config.invariantCheck')),
      },
      gamesTotal: num(meta.gamesTotal, at('gamesTotal')),
      seedSet: { prefix: str(seedSet.prefix, at('seedSet.prefix')), count: num(seedSet.count, at('seedSet.count')) },
      wallMs: num(meta.wallMs, at('wallMs')),
      recordsDigest: str(meta.recordsDigest, at('recordsDigest')),
      health: {
        ok: bool(health.ok, at('health.ok')),
        illegalActions: num(health.illegalActions, at('health.illegalActions')),
        cappedGames: num(health.cappedGames, at('health.cappedGames')),
        invariantViolations: num(health.invariantViolations, at('health.invariantViolations')),
        ties: num(health.ties, at('health.ties')),
        voids: num(health.voids, at('health.voids')),
        nonClinch: num(health.nonClinch, at('health.nonClinch')),
        capped: arr(health.capped, at('health.capped')).map((g, i) => cappedGame(g, at(`health.capped[${i}]`))),
        violations: arr(health.violations, at('health.violations')).map((v, i) =>
          str(v, at(`health.violations[${i}]`)),
        ),
      },
      benchmark: {
        artifact: str(benchmark.artifact, at('benchmark.artifact')),
        recordsDigest: str(benchmark.recordsDigest, at('benchmark.recordsDigest')),
        seedPrefix: str(benchmark.seedPrefix, at('benchmark.seedPrefix')),
        pairsPerCell: num(benchmark.pairsPerCell, at('benchmark.pairsPerCell')),
        paired: bool(benchmark.paired, at('benchmark.paired')),
        note: str(benchmark.note, at('benchmark.note')),
      },
      counterTableProvenance: {
        artifact: str(ctp.artifact, at('counterTableProvenance.artifact')),
        recordsDigest: str(ctp.recordsDigest, at('counterTableProvenance.recordsDigest')),
        engineCommit: str(ctp.engineCommit, at('counterTableProvenance.engineCommit')),
        generatedAt: str(ctp.generatedAt, at('counterTableProvenance.generatedAt')),
        pairsPerCell: num(ctp.pairsPerCell, at('counterTableProvenance.pairsPerCell')),
      },
      fingerprintProvenance: {
        generatedAt: str(fpp.generatedAt, at('fingerprintProvenance.generatedAt')),
        command: str(fpp.command, at('fingerprintProvenance.command')),
        gamesPerStyle: num(fpp.gamesPerStyle, at('fingerprintProvenance.gamesPerStyle')),
        seedPrefix: str(fpp.seedPrefix, at('fingerprintProvenance.seedPrefix')),
        variant: str(fpp.variant, at('fingerprintProvenance.variant')),
        stepCap: num(fpp.stepCap, at('fingerprintProvenance.stepCap')),
      },
      predictions: arr(meta.predictions, at('predictions')).map((p, i) => prediction(p, at(`predictions[${i}]`))),
    },
    gauntlet: arr(root.gauntlet, `${source}.gauntlet`).map((g, i) => gauntletRow(g, `${source}.gauntlet[${i}]`)),
    mirror: (() => {
      const o = obj(root.mirror, `${source}.mirror`)
      return {
        pairs: num(o.pairs, `${source}.mirror.pairs`),
        games: num(o.games, `${source}.mirror.games`),
        score: num(o.score, `${source}.mirror.score`),
        se: num(o.se, `${source}.mirror.se`),
      }
    })(),
    mixed: mixed(root.mixed, `${source}.mixed`),
    oracle: arr(root.oracle, `${source}.oracle`).map((r, i) => oracleRow(r, `${source}.oracle[${i}]`)),
    classifier: classifier(root.classifier, `${source}.classifier`),
    styleUsage: arr(root.styleUsage, `${source}.styleUsage`).map((r, i) => usageRow(r, `${source}.styleUsage[${i}]`)),
    verdicts: arr(root.verdicts, `${source}.verdicts`).map((v, i) => verdict(v, `${source}.verdicts[${i}]`)),
  }
}

/* -- the committed artifact ----------------------------------------------------------------- */

const SOURCE_FILE = 'src/lab/data/adaptive-results.json'

export type AdaptiveLoadResult =
  | { ok: true; artifact: AdaptiveResults; file: string }
  | { ok: false; file: string; detail: string }

function load(): AdaptiveLoadResult {
  try {
    return { ok: true, artifact: parseAdaptiveArtifact(adaptiveRaw, SOURCE_FILE), file: SOURCE_FILE }
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
const LOADED_ADAPTIVE: AdaptiveLoadResult = load()

/** A parse failure is a value, never a thrown exception at render time. */
export function loadAdaptiveArtifact(): AdaptiveLoadResult {
  return LOADED_ADAPTIVE
}
