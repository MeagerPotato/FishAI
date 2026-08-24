/**
 * classify.ts — a style posterior per seat, from the public log alone (v1.0 front half).
 *
 * The model is deliberately the simplest thing that can be honest: a **diagonal Gaussian** per
 * style over the FEATURE_KEYS vector of [observe.ts](observe.ts), calibrated offline by
 * `scripts/gen-fingerprints.mjs` (mirror games per style) and committed as
 * [data/fingerprints.ts](data/fingerprints.ts). For an observed vector `x` and a style with
 * per-feature `mean`/`sd`, the log-likelihood is `Σ_i −½·z_i²` with `z_i = (x_i − μ_i)/σ_i`,
 * and a softmax over the nine log-likelihoods gives the raw posterior. Diagonal on purpose:
 * with ~14 features and a few hundred calibration vectors per bucket, a full covariance would
 * be an estimate of noise, and the classifier's accuracy is *measured* downstream (Stage 2),
 * never assumed here.
 *
 * ## Two modelling choices made by measurement, not taste
 *
 * - **The Gaussian normaliser (−ln σ) is dropped.** With sample SDs over a few hundred
 *   vectors, `Σ −ln σ_i` is a large constant bonus for whichever style happened to calibrate
 *   tightest; in the first calibration it handed the Ghost 40 of 60 mirror-Balanced reads.
 *   Without it the score is a pure z-distance, whose argmax at a style's own mean is that
 *   style itself.
 * - **The per-style σ is shrunk halfway to the pooled σ**: `σ'² = (σ_style² + σ_pooled²)/2`,
 *   where σ_pooled is the RMS of the given fingerprints' SDs per feature. Raw per-style SDs
 *   make the widest-variance style an outlier magnet (everything unusual "must be the Scout");
 *   fully pooled SDs throw away real information (the Turtle genuinely is more repetitive than
 *   its mean alone says). The halfway blend beat both ends on cross-play reads in calibration
 *   probes and ties them on mirror self-reads.
 *
 * ## Two honesty mechanisms, both structural
 *
 * - **Checkpoint buckets.** Several features are raw counts, so a mid-game observation must be
 *   read against fingerprints taken at the same horizon. The calibration stores one bucket per
 *   checkpoint in {60, 120, 200, 300} (log prefixes of running games) plus 'full' (completed
 *   games). Selection: a view whose log ends in `game_over` reads the 'full' bucket — it IS a
 *   completed game, whatever its length; otherwise the nearest checkpoint at or below the
 *   observed event count, falling back to '60' below 60.
 * - **Sample-size damping.** With few asks observed, every style looks alike and a softmax
 *   would still print confident numbers. The posterior is therefore blended toward uniform by
 *   `min(1, asks/12)` — at 0 asks the answer is exactly "I don't know" (uniform), and full
 *   confidence is only reachable once a seat has actually asked a dozen times. Asks, not
 *   events: asks are the seat's *own* observed choices, and a seat that has barely moved in a
 *   long game is still unread.
 *
 * `sd` is floored at SD_FLOOR before use: a zero-variance calibration column (a style that
 * literally never produced the feature in 150 mirror games) must not turn a single stray count
 * into an infinite log-penalty — it becomes a very strong, finite vote instead.
 *
 * Determinism is absolute: same view (and same fingerprints) → identical output. Ties in the
 * argmax resolve to the earlier fingerprint in the given order, which for the default table is
 * STYLE_IDS order. No Date, no Math.random.
 */
import type { PublicState, Seat } from '../types.ts'
import type { SeatView } from './types.ts'
import type { StyleId } from './roster.ts'
import { STYLE_IDS } from './roster.ts'
import { FEATURE_KEYS, featureVector, observeSeats } from './observe.ts'
import type { SeatObservation } from './observe.ts'
import { FINGERPRINTS } from './data/fingerprints.ts'
import type { FingerprintBucketId, FingerprintTable } from './data/fingerprints.ts'

export { FEATURE_KEYS }
export type { FingerprintBucketId, FingerprintTable }

/** One style's calibrated feature distribution for one checkpoint bucket, flattened. */
export interface StyleFingerprint {
  style: StyleId
  /** Feature vector means, in FEATURE_KEYS order. */
  mean: number[]
  /** Per-feature sample SDs (floored at SD_FLOOR when used). */
  sd: number[]
}

export interface SeatClassification {
  seat: Seat
  /** Public events observed (the x-axis for accuracy curves). */
  events: number
  /** Damped posterior over the fingerprinted styles; sums to 1. */
  posterior: Record<StyleId, number>
  top: StyleId
  /** posterior[top]. */
  confidence: number
}

/**
 * The SD floor. 0.01 is far below every real calibration SD on the rate features (~0.1–0.3)
 * and two orders below the count features, so it only ever bites on a literally-constant
 * column — where it caps the z-score of a one-count deviation at 100 rather than infinity.
 */
const SD_FLOOR = 0.01

/** Asks needed before the damping factor `min(1, asks/12)` stops discounting the posterior. */
const DAMP_ASKS = 12

/**
 * The checkpoint bucket a view reads its fingerprints from. Exposed for tests and for the
 * Stage-2 accuracy instrumentation, which must bucket exactly as the classifier does.
 */
export function checkpointBucket(events: number, finished: boolean): FingerprintBucketId {
  if (finished) return 'full'
  if (events >= 300) return '300'
  if (events >= 200) return '200'
  if (events >= 120) return '120'
  return '60'
}

/** Classify one seat's observation against a flat set of fingerprints (one bucket, chosen). */
export function classifySeat(
  obs: SeatObservation,
  fingerprints: readonly StyleFingerprint[],
): SeatClassification {
  if (fingerprints.length === 0) throw new TypeError('classifySeat: no fingerprints given')
  const x = featureVector(obs)
  const k = fingerprints.length
  const dim = FEATURE_KEYS.length

  // Pooled per-feature variance over the *given* fingerprints (header: the shrinkage target).
  const pooledVar: number[] = new Array<number>(dim).fill(0)
  for (const f of fingerprints) {
    for (let i = 0; i < dim; i++) pooledVar[i] += (f.sd[i] ?? 0) ** 2
  }
  for (let i = 0; i < dim; i++) pooledVar[i] /= k

  const logLik: number[] = fingerprints.map((f) => {
    let ll = 0
    for (let i = 0; i < dim; i++) {
      const sd = Math.max(Math.sqrt(((f.sd[i] ?? 0) ** 2 + pooledVar[i]) / 2), SD_FLOOR)
      const z = (x[i] - (f.mean[i] ?? 0)) / sd
      ll += -0.5 * z * z
    }
    return ll
  })

  // Softmax with the max subtracted: exact, overflow-free, deterministic.
  const max = logLik.reduce((m, v) => (v > m ? v : m), -Infinity)
  const exps = logLik.map((v) => Math.exp(v - max))
  const sum = exps.reduce((a, b) => a + b, 0)

  // Damping toward uniform: early-game posteriors are honest about ignorance (header).
  const w = Math.min(1, obs.asks / DAMP_ASKS)
  const posterior = {} as Record<StyleId, number>
  let top: StyleId = fingerprints[0].style
  let confidence = -1
  for (let i = 0; i < k; i++) {
    const p = w * (exps[i] / sum) + (1 - w) / k
    posterior[fingerprints[i].style] = p
    if (p > confidence) {
      confidence = p
      top = fingerprints[i].style
    }
  }
  return { seat: obs.seat, events: obs.events, posterior, top, confidence }
}

/**
 * Classify every seat of a public view. The bucket is chosen once from the view (the log is
 * shared), and the default fingerprints are the committed calibration. A caller may hand in
 * its own table — the Stage-2 accuracy runs recalibrate — and any style the table does not
 * carry is simply absent from the posterior (`Object.hasOwn` guards the id-keyed read).
 */
export function classifySeats(
  view: PublicState | SeatView,
  fingerprints: FingerprintTable = FINGERPRINTS,
): SeatClassification[] {
  const last = view.log[view.log.length - 1]
  const finished = last !== undefined && last.type === 'game_over'
  const bucket = checkpointBucket(view.log.length, finished)
  const flat: StyleFingerprint[] = []
  for (const id of STYLE_IDS) {
    if (!Object.hasOwn(fingerprints, id)) continue
    const stats = fingerprints[id][bucket]
    flat.push({ style: id, mean: [...stats.mean], sd: [...stats.sd] })
  }
  return observeSeats(view).map((obs) => classifySeat(obs, flat))
}
