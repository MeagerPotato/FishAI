/**
 * adaptive-sim.mjs — launcher for the FishAI v1.0 experiment suite (SPEC Stage 2b; the
 * pre-registered predictions are in lib/lab/adaptive-types.ts and travel with the artifact).
 *
 * `node scripts/adaptive-sim.mjs [--pairs N] [--mirrorPairs N] [--mixedPairs N]
 *    [--oraclePairs N] [--accGames N] [--workers N] [--chunk N] [--out DIR] [--jsonl false]`
 *
 * Deliberately thin, exactly like style-sim.mjs: `scripts/` is linted but NOT typechecked, so
 * this file does only the two things that genuinely need a platform — spawn
 * `node:worker_threads` and write files. Planning, playing, measuring, aggregating and gating
 * all live in lib/lab/adaptive.ts, which is typechecked. Every experiment — gauntlet, mirror,
 * mixed screen, oracle ablation, classifier accuracy — runs through the SAME worker pool: the
 * task union carries its own kind, and `runAdaptiveTask` is a pure function of the task, so
 * heterogeneity costs the plumbing nothing.
 *
 * Exit code is the health gate: 0 when the BOT_LAB.md §4.3 discipline passes across all four
 * experiments (plus the suite's own pairing gates), 1 when the run is VOID.
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
  DEFAULT_ADAPTIVE_CONFIG,
  adaptiveGamesTotal,
  adaptiveToJsonl,
  assembleAdaptiveRun,
  defaultWorkers,
  planAdaptiveTasks,
  runPool,
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
  ...DEFAULT_ADAPTIVE_CONFIG,
  gauntletPairs: Number(opt.pairs ?? DEFAULT_ADAPTIVE_CONFIG.gauntletPairs),
  mirrorPairs: Number(opt.mirrorPairs ?? DEFAULT_ADAPTIVE_CONFIG.mirrorPairs),
  mixedPairs: Number(opt.mixedPairs ?? DEFAULT_ADAPTIVE_CONFIG.mixedPairs),
  mixedCompositions: Number(opt.mixedCompositions ?? DEFAULT_ADAPTIVE_CONFIG.mixedCompositions),
  oraclePairs: Number(opt.oraclePairs ?? DEFAULT_ADAPTIVE_CONFIG.oraclePairs),
  accGames: Number(opt.accGames ?? DEFAULT_ADAPTIVE_CONFIG.accGames),
  chunkPairs: Number(opt.chunk ?? DEFAULT_ADAPTIVE_CONFIG.chunkPairs),
}
const workers = Math.max(1, Number(opt.workers ?? defaultWorkers(cpus().length)))
const outDir = resolve(process.cwd(), opt.out ?? `lab-out/adaptive-${config.gauntletPairs}`)
const quiet = opt.quiet === 'true'

const tasks = planAdaptiveTasks(config)
console.log(
  `adaptive lab: ${config.variant} · ${adaptiveGamesTotal(config)} games ` +
    `(gauntlet ${config.gauntletPairs}p · mirror ${config.mirrorPairs}p · ` +
    `mixed ${config.mixedCompositions}x${config.mixedPairs}p x2 arms · oracle ${config.oraclePairs}p · ` +
    `accuracy ${config.accGames}g) · ${tasks.length} tasks · ${workers} workers · ${cpus().length} cpus`,
)

// --- the worker pool ------------------------------------------------------------------------
// One long-lived thread per lane; `runPool` (typechecked, in lib/lab) decides what each lane
// takes next, this only carries the task there and the result back.
const pool = []
for (let i = 0; i < Math.min(workers, tasks.length); i++) {
  pool.push({ worker: new Worker(resolve(HERE, 'adaptive-sim-worker.mjs')), busy: false })
}
const idle = [...pool]

function execute(task) {
  return new Promise((res, rej) => {
    const slot = idle.pop()
    if (!slot) {
      rej(new Error('adaptive-sim: no idle worker — runPool exceeded its lane count'))
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

const output = assembleAdaptiveRun(config, results, {
  wallMs,
  workers: pool.length,
  generatedAt: new Date().toISOString(),
})

await mkdir(outDir, { recursive: true })
// The per-game JSONL is the step-1 artifact and is written by default; `--jsonl false`
// suppresses the file only — the digest is taken over the in-memory records either way.
if (opt.jsonl !== 'false') await writeFile(resolve(outDir, 'games.jsonl'), adaptiveToJsonl(output.records), 'utf8')
await writeFile(
  resolve(outDir, 'run.json'),
  JSON.stringify(
    {
      meta: output.meta,
      health: output.health,
      gauntlet: output.gauntlet,
      mirror: output.mirror,
      mixed: output.mixed,
      oracle: output.oracle,
      classifier: output.classifier,
      styleUsage: output.styleUsage,
    },
    null,
    2,
  ),
  'utf8',
)
// One results file per experiment, each stamped with the run digest so a stray file cannot be
// mistaken for another run's output.
const stamp = { generatedAt: output.meta.generatedAt, recordsDigest: output.meta.recordsDigest }
await writeFile(resolve(outDir, 'gauntlet.json'), JSON.stringify({ ...stamp, gauntlet: output.gauntlet, mirror: output.mirror, styleUsage: output.styleUsage }, null, 2), 'utf8')
await writeFile(resolve(outDir, 'mixed.json'), JSON.stringify({ ...stamp, mixed: output.mixed }, null, 2), 'utf8')
await writeFile(resolve(outDir, 'oracle.json'), JSON.stringify({ ...stamp, oracle: output.oracle }, null, 2), 'utf8')
await writeFile(resolve(outDir, 'classifier.json'), JSON.stringify({ ...stamp, classifier: output.classifier }, null, 2), 'utf8')

// --- console summary ------------------------------------------------------------------------
const pct = (x) => `${(100 * x).toFixed(2)}%`
console.log('')
console.log('gauntlet (adaptive team vs pure style, paired score for adaptive):')
for (const cell of output.gauntlet) {
  console.log(
    `  vs ${cell.opponent.padEnd(9)} ${cell.score.toFixed(4)} ± ${cell.se.toFixed(4)} ` +
      `(${cell.pairs} pairs, ${cell.games} games, avg ${cell.avgMoves.toFixed(0)} moves)`,
  )
}
console.log(`mirror: ${output.mirror.score.toFixed(4)} ± ${output.mirror.se.toFixed(4)} (${output.mirror.pairs} pairs; expected exactly 0.5)`)
console.log(
  `mixed screen: adaptive ${output.mixed.adaptiveMean.toFixed(4)} vs punter ${output.mixed.punterMean.toFixed(4)} · ` +
    `paired delta ${output.mixed.pairedDelta.toFixed(4)} ± ${output.mixed.deltaSe.toFixed(4)}`,
)
for (const row of output.oracle) {
  console.log(
    `oracle vs ${row.opponent.padEnd(9)} classifier ${row.classifier.toFixed(4)} · oracle ${row.oracle.toFixed(4)} · ` +
      `delta ${row.delta.toFixed(4)} ± ${row.se.toFixed(4)}`,
  )
}
for (const row of output.classifier.accuracy) {
  console.log(`classifier top-1 @ ${row.events === 0 ? 'end' : row.events}: ${pct(row.top1)} over ${row.seats} seats`)
}
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
console.log(`wrote ${outDir}/${opt.jsonl === 'false' ? '' : 'games.jsonl · '}run.json · gauntlet.json · mixed.json · oracle.json · classifier.json`)
process.exit(output.health.ok ? 0 : 1)
