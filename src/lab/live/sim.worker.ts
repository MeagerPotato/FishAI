/**
 * sim.worker.ts — thin plumbing around `livesim.ts`. Nothing in this file computes anything.
 *
 * The split is deliberate and load-bearing: the vitest suite runs in a Node environment with no
 * jsdom and no worker harness, so any logic that lives here is logic no test executes. This
 * file therefore does exactly three things — receive a message, drive the chunk loop, post
 * messages back — and every number it posts was produced by the pure module.
 *
 * ## The chunk loop yields on purpose
 *
 * Each chunk of pairs runs synchronously, then the loop reschedules itself with `setTimeout 0`.
 * That returned tick is the only moment the worker's event loop can deliver a `stop` message,
 * so the chunk size is also the stop latency. On stop, whatever finished is aggregated and
 * posted marked `partial: true` — a cancelled run reports what it measured, not nothing.
 *
 * A background tab may throttle those timers; the run then finishes late rather than never,
 * and the page handles a result that arrives after the reader left by terminating the worker
 * on unmount.
 */
import {
  LIVE_CHUNK_PAIRS,
  aggregateLive,
  clampPairs,
  isLivePolicyId,
  normalisePrefix,
  playLivePair,
} from './livesim.ts'
import type { LabGameRecord } from '../../../lib/lab/index.ts'
import type { LiveConfig, LiveFromWorker, LiveToWorker } from './livesim.ts'

const post = (message: LiveFromWorker): void => {
  postMessage(message)
}

let running = false
let stopped = false

function run(config: LiveConfig): void {
  const records: LabGameRecord[] = []
  let pair = 0

  const step = (): void => {
    if (stopped) {
      post({ type: 'result', result: aggregateLive(config, records, true) })
      return
    }
    const to = Math.min(config.pairs, pair + LIVE_CHUNK_PAIRS)
    try {
      for (; pair < to; pair++) {
        const [g0, g1] = playLivePair(config, pair)
        records.push(g0, g1)
      }
    } catch (error) {
      post({ type: 'error', detail: error instanceof Error ? error.message : String(error) })
      return
    }
    post({ type: 'progress', pairsDone: pair, pairsTotal: config.pairs, games: records.length })
    if (pair >= config.pairs) {
      post({ type: 'result', result: aggregateLive(config, records, false) })
      return
    }
    setTimeout(step, 0)
  }

  step()
}

self.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as LiveToWorker
  if (msg.type === 'stop') {
    stopped = true
    return
  }
  if (msg.type !== 'run' || running) return

  // The worker trusts no message: ids, pair count and prefix are all re-validated here, so a
  // malformed post degrades to a named refusal instead of an exception three modules deep.
  const { config } = msg
  if (!isLivePolicyId(config.a) || !isLivePolicyId(config.b)) {
    post({ type: 'error', detail: `unknown policy id: ${config.a} / ${config.b}` })
    return
  }
  running = true
  run({
    a: config.a,
    b: config.b,
    pairs: clampPairs(config.pairs),
    seedPrefix: normalisePrefix(config.seedPrefix),
  })
})
