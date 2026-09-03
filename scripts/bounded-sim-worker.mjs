/**
 * bounded-sim-worker.mjs — the worker-thread entry for the Bass v1.5 experiment suite.
 *
 * Deliberately trivial, exactly like adaptive-sim-worker.mjs: `scripts/` is outside
 * tsconfig.app.json's `include`, so nothing written here is typechecked. All the substance —
 * seat tables, the elog encoding, the accuracy read — is `runBoundedTask` in
 * lib/lab/bounded.ts, which is typechecked and a pure function of the task: byte-identical on
 * any thread. This file only moves messages.
 *
 * The thread is long-lived and pumped with one task at a time, so the engine module graph is
 * parsed and warmed once per worker rather than once per task.
 */
import { parentPort } from 'node:worker_threads'
import { runBoundedTask } from '../lib/lab/index.ts'

if (!parentPort) throw new Error('bounded-sim-worker.mjs must be run as a worker thread')

parentPort.on('message', (msg) => {
  if (msg?.type === 'quit') {
    parentPort.close()
    return
  }
  try {
    parentPort.postMessage({ type: 'result', result: runBoundedTask(msg.task) })
  } catch (err) {
    parentPort.postMessage({ type: 'error', taskIndex: msg?.task?.index ?? -1, message: String(err?.stack ?? err) })
  }
})
