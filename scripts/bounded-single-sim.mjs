/**
 * bounded-single-sim.mjs — launcher for E4b, the single-seat attribution follow-up (SPEC v1.5
 * E4b, registered 2026-08-30 before any run; the read-seat mapping is SINGLE_READ_MAPPING in
 * lib/lab/bounded.ts and is written into the run's meta.notes).
 *
 * `node scripts/bounded-single-sim.mjs [--accGames N] [--workers N] [--chunk N] [--out DIR]
 *    [--jsonl false] [--quiet true]`
 *
 * Deliberately thin, exactly like bounded-sim.mjs: `scripts/` is linted but NOT typechecked,
 * so this file only spawns `node:worker_threads` and writes files. The grid is E4's exactly —
 * accBits × 36 pairings × accGames on the v1.0 accuracy seed list — but each game seats ONE
 * bounded read seat (team 0, rotating 0/2/4 by game mod 3) among five bare full-strength
 * styles; every ∞ game is additionally replayed all-bare inside the task and must match
 * exactly (the P8 health gate). The worker is bounded-sim-worker.mjs, unchanged — the task
 * union carries its own kind.
 *
 * The engine commit that PLAYS the games is captured HERE, at sim time, and written into
 * run.json — the analyze step folds it into the artifact's accuracySingle.meta rather than
 * asking git again at fold time.
 *
 * Exit code is the health gate: 0 when every clause passes (including the registered-mapping
 * check and the ∞ reproduction), 1 when the run is VOID.
 */
import { Worker } from 'node:worker_threads'
import { cpus } from 'node:os'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 23 || (major === 23 && minor < 6)) {
  console.error(
    `node ${process.versions.node} cannot import TypeScript directly; run with Node 23.6+ (this repo develops on Node 24).`,
  )
  process.exit(1)
}

const {
  DEFAULT_BOUNDED_CONFIG,
  assembleBoundedSingleRun,
  boundedSingleGamesTotal,
  boundedToJsonl,
  defaultWorkers,
  planBoundedSingleTasks,
  runPool,
} = await import('../lib/lab/index.ts')

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1)
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i]
    else out[a.slice(2)] = 'true'
  }
  return out
}

const opt = args(process.argv.slice(2))
const config = {
  ...DEFAULT_BOUNDED_CONFIG,
  accGames: Number(opt.accGames ?? DEFAULT_BOUNDED_CONFIG.accGames),
  chunkPairs: Number(opt.chunk ?? DEFAULT_BOUNDED_CONFIG.chunkPairs),
}
const workers = Math.max(1, Number(opt.workers ?? defaultWorkers(cpus().length)))
const outDir = resolve(process.cwd(), opt.out ?? `lab-out/bounded-single-${config.accGames}`)
const quiet = opt.quiet === 'true'

function git(...a) {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}
const head = git('rev-parse', '--short', 'HEAD') || 'unknown'
const dirty = git('status', '--porcelain') !== ''
const engineCommit = `${head}${dirty ? '-dirty' : ''}`

const tasks = planBoundedSingleTasks(config)
console.log(
  `bounded single (E4b): ${config.variant} · ${boundedSingleGamesTotal(config)} games ` +
    `(${config.accBits.length} budgets x 36 pairings x ${config.accGames}g, one bounded read seat per game; ` +
    `∞ games replayed all-bare as the health gate) · ${tasks.length} tasks · ${workers} workers · ` +
    `${cpus().length} cpus · engine ${engineCommit}`,
)

// --- the worker pool ------------------------------------------------------------------------
const pool = []
for (let i = 0; i < Math.min(workers, tasks.length); i++) {
  pool.push({ worker: new Worker(resolve(HERE, 'bounded-sim-worker.mjs')), busy: false })
}
const idle = [...pool]

function execute(task) {
  return new Promise((res, rej) => {
    const slot = idle.pop()
    if (!slot) {
      rej(new Error('bounded-single-sim: no idle worker — runPool exceeded its lane count'))
      return
    }
    const onMessage = (msg) => {
      cleanup()
      idle.push(slot)
      if (msg.type === 'error') rej(new Error(`task ${msg.taskIndex}: ${msg.message}`))
      else res(msg.result)
    }
    const onError = (err) => {
      cleanup()
      rej(err)
    }
    const cleanup = () => {
      slot.worker.off('message', onMessage)
      slot.worker.off('error', onError)
    }
    slot.worker.on('message', onMessage)
    slot.worker.on('error', onError)
    slot.worker.postMessage({ type: 'task', task })
  })
}

const t0 = Date.now()
let lastPrint = 0
const results = await runPool(tasks, pool.length, execute, (_r, done, total) => {
  const now = Date.now()
  if (quiet || (now - lastPrint < 2000 && done !== total)) return
  lastPrint = now
  const pct = ((100 * done) / total).toFixed(1)
  const eta = done === 0 ? 0 : ((now - t0) / done) * (total - done)
  process.stderr.write(`  ${done}/${total} tasks (${pct}%) · eta ${(eta / 1000).toFixed(0)}s\n`)
})
const wallMs = Date.now() - t0
for (const p of pool) p.worker.postMessage({ type: 'quit' })
for (const p of pool) await p.worker.terminate()

const output = assembleBoundedSingleRun(config, results, {
  wallMs,
  workers: pool.length,
  generatedAt: new Date().toISOString(),
})

await mkdir(outDir, { recursive: true })
if (opt.jsonl !== 'false') await writeFile(resolve(outDir, 'games.jsonl'), boundedToJsonl(output.records), 'utf8')
await writeFile(
  resolve(outDir, 'run.json'),
  JSON.stringify(
    {
      engineCommit,
      meta: output.meta,
      health: output.health,
      cells: output.cells,
      deltas: output.deltas,
      infReproduction: output.infReproduction,
    },
    null,
    2,
  ),
  'utf8',
)

// --- console summary ------------------------------------------------------------------------
const inf = (bits) => (bits >= 1_000_000 ? 'inf' : String(bits))
console.log('')
console.log('E4b single-seat accuracy (bounded read seat only; seed-clustered SE):')
for (const cell of output.cells) {
  console.log(
    `  ${inf(cell.bits).padStart(4)} bits  top-1 ${(100 * cell.top1).toFixed(2)}% ± ${(100 * cell.se).toFixed(2)}% ` +
      `over ${cell.reads} reads (${cell.seeds} seeds)`,
  )
}
console.log('E4b adjacent rungs (delta, per-seed paired SE):')
for (const d of output.deltas) {
  console.log(
    `  ${inf(d.fromBits)}→${inf(d.toBits)}  ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(4)} ± ${d.se.toFixed(4)}` +
      `  ${d.pass ? 'ok' : 'VIOLATES −2·SE'}`,
  )
}
console.log(
  `∞ reproduction: ${output.infReproduction.games} games, ${output.infReproduction.deviations} deviations`,
)
console.log('')
console.log(
  output.health.ok
    ? `health: OK · ${output.meta.gamesTotal} games · digest ${output.meta.recordsDigest}`
    : `health: VOID — ${output.health.violations.length} violation(s):\n  ${output.health.violations.join('\n  ')}`,
)
const mem = process.memoryUsage()
console.log(
  `wall ${(wallMs / 1000).toFixed(0)}s · ${output.meta.gamesPerSecond.toFixed(0)} games/s · ` +
    `rss ${(mem.rss / 2 ** 20).toFixed(0)} MiB for ${output.records.length} records`,
)
console.log(`wrote ${outDir}/${opt.jsonl === 'false' ? '' : 'games.jsonl · '}run.json`)
process.exit(output.health.ok ? 0 : 1)
