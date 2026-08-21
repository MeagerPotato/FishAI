/**
 * style-sim.mjs — launcher for the duplicate-deal style lab (BOT_LAB.md §5/§6, STYLES.md §4).
 *
 * `npm run lab -- [--pairs N] [--workers N] [--prefix S] [--variant us54|pagat48] [--out DIR] ...`
 *
 * Deliberately thin. `scripts/` is linted but NOT typechecked (it is outside
 * tsconfig.app.json's `include`), so this file does only the two things that genuinely need a
 * platform: spawn `node:worker_threads` and write files. Planning, playing, measuring,
 * aggregating, gating and rendering all live in lib/lab/, which is typechecked.
 *
 * Exit code is the health gate: 0 when BOT_LAB.md §4.3 passes, 1 when the run is VOID.
 */
import { Worker } from 'node:worker_threads'
import { cpus } from 'node:os'
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
  DEFAULT_LAB_CONFIG,
  assembleRun,
  defaultWorkers,
  gamesTotal,
  planTasks,
  renderRun,
  runPool,
  toJsonl,
} = await import('../lib/lab/index.ts')

const HERE = dirname(fileURLToPath(import.meta.url))

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
  ...DEFAULT_LAB_CONFIG,
  pairs: Number(opt.pairs ?? DEFAULT_LAB_CONFIG.pairs),
  seedPrefix: opt.prefix ?? DEFAULT_LAB_CONFIG.seedPrefix,
  chunkPairs: Number(opt.chunk ?? DEFAULT_LAB_CONFIG.chunkPairs),
  variant: opt.variant ?? DEFAULT_LAB_CONFIG.variant,
  stepCap: Number(opt.stepCap ?? DEFAULT_LAB_CONFIG.stepCap),
  invariantCheck: opt.invariants ?? DEFAULT_LAB_CONFIG.invariantCheck,
  ...(opt.skill ? { skill: opt.skill } : {}),
}
const workers = Math.max(1, Number(opt.workers ?? defaultWorkers(cpus().length)))
const outDir = resolve(process.cwd(), opt.out ?? `lab-out/${config.variant}-${config.seedPrefix}-${config.pairs}`)
const quiet = opt.quiet === 'true'

const tasks = planTasks(config)
console.log(
  `style lab: ${config.variant} · ${gamesTotal(config)} games ` +
    `(${tasks.length} tasks of <= ${config.chunkPairs} pairs) · ${workers} workers · ${cpus().length} cpus`,
)

// --- the worker pool ------------------------------------------------------------------------
// One long-lived thread per lane; `runPool` (typechecked, in lib/lab) decides what each lane
// takes next, this only carries the task there and the result back.
const pool = []
for (let i = 0; i < Math.min(workers, tasks.length); i++) {
  pool.push({ worker: new Worker(resolve(HERE, 'style-sim-worker.mjs')), busy: false })
}
const idle = [...pool]

function execute(task) {
  return new Promise((res, rej) => {
    const slot = idle.pop()
    if (!slot) {
      rej(new Error('style-sim: no idle worker — runPool exceeded its lane count'))
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

const output = assembleRun(config, results, { wallMs, workers: pool.length, generatedAt: new Date().toISOString() })

await mkdir(outDir, { recursive: true })
// The per-game JSONL is the BOT_LAB.md §6 step-1 artifact and is written by default. At
// full-precision sample sizes it is large (~1.1 KB/game), so `--jsonl false` suppresses the
// file — the aggregate, the health gate and the reproducibility digest are unaffected, because
// the digest is taken over the in-memory records either way.
if (opt.jsonl !== 'false') await writeFile(resolve(outDir, 'games.jsonl'), toJsonl(output.records), 'utf8')
await writeFile(
  resolve(outDir, 'cells.json'),
  JSON.stringify({ meta: output.meta, health: output.health, cells: output.cells }, null, 2),
  'utf8',
)
const report = renderRun(output)
await writeFile(resolve(outDir, 'report.txt'), report + '\n', 'utf8')

console.log('')
console.log(report)
console.log('')
const mem = process.memoryUsage()
console.log(
  `peak parent memory: rss ${(mem.rss / 2 ** 20).toFixed(0)} MiB · ` +
    `heapUsed ${(mem.heapUsed / 2 ** 20).toFixed(0)} MiB for ${output.records.length} records ` +
    `(${(mem.heapUsed / Math.max(1, output.records.length)).toFixed(0)} B/game)`,
)
console.log(`wrote ${outDir}/${opt.jsonl === 'false' ? '' : 'games.jsonl · '}cells.json · report.txt`)
process.exit(output.health.ok ? 0 : 1)
