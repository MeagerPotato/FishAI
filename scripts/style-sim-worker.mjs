/**
 * style-sim-worker.mjs — the worker-thread entry for the style lab.
 *
 * Deliberately trivial: `scripts/` is outside tsconfig.app.json's `include`, so nothing written
 * here is typechecked. All the substance — playing the games, measuring them, aggregating them —
 * is `runTask` in lib/lab/, which is. This file only moves messages.
 *
 * The thread is long-lived and pumped with one task at a time, so the engine module graph is
 * parsed and warmed once per worker rather than once per task.
 */
import { parentPort } from 'node:worker_threads'
import { runTask } from '../lib/lab/index.ts'

if (!parentPort) throw new Error('style-sim-worker.mjs must be run as a worker thread')

parentPort.on('message', (msg) => {
  if (msg?.type === 'quit') {
    parentPort.close()
    return
  }
  try {
    parentPort.postMessage({ type: 'result', result: runTask(msg.task) })
  } catch (err) {
    parentPort.postMessage({ type: 'error', taskIndex: msg?.task?.index ?? -1, message: String(err?.stack ?? err) })
  }
})
