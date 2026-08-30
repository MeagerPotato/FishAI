/**
 * bounded-sim.mjs — launcher for the FishAI v1.5 experiment suite (SPEC v1.5 Phase 2; the
 * pre-registered predictions are in lib/lab/bounded-types.ts and travel with the artifact).
 *
 * `node scripts/bounded-sim.mjs [--pairs N] [--tierPairs N] [--accGames N]
 *    [--workers N] [--chunk N] [--out DIR] [--jsonl false] [--quiet true]`
 *
 * Deliberately thin, exactly like adaptive-sim.mjs: `scripts/` is linted but NOT typechecked,
 * so this file does only the two things that genuinely need a platform — spawn
 * `node:worker_threads` and write files. Planning, playing, measuring, aggregating and gating
 * all live in lib/lab/bounded.ts, which is typechecked. Every experiment — ladder, tiers,
 * accuracy grid — runs through the SAME worker pool: the task union carries its own kind, and
 * `runBoundedTask` is a pure function of the task.
 *
 * Exit code is the health gate: 0 when the BOT_LAB.md §4.3 discipline passes across all three
 * played experiments (plus the suite's own gates — the ∞ mirror exactness, the tier seed-list
 * containment), 1 when the run is VOID.
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
  DEFAULT_BOUNDED_CONFIG,
  assembleBoundedRun,
  boundedGamesTotal,
  boundedToJsonl,
  defaultWorkers,
  planBoundedTasks,
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
  ...DEFAULT_BOUNDED_CONFIG,
  ladderPairs: Number(opt.pairs ?? DEFAULT_BOUNDED_CONFIG.ladderPairs),
  tierPairs: Number(opt.tierPairs ?? opt.pairs ?? DEFAULT_BOUNDED_CONFIG.tierPairs),
  accGames: Number(opt.accGames ?? DEFAULT_BOUNDED_CONFIG.accGames),
  chunkPairs: Number(opt.chunk ?? DEFAULT_BOUNDED_CONFIG.chunkPairs),
}
const workers = Math.max(1, Number(opt.workers ?? defaultWorkers(cpus().length)))
const outDir = resolve(process.cwd(), opt.out ?? `lab-out/bounded-${config.ladderPairs}`)
const quiet = opt.quiet === 'true'

const tasks = planBoundedTasks(config)
console.log(
  `bounded lab: ${config.variant} · ${boundedGamesTotal(config)} games ` +
    `(ladder ${config.ladderBits.length} budgets x ${config.ladderPairs}p · ` +
    `tiers 3 x ${config.tierPairs}p · accuracy ${config.accBits.length} budgets x 36 pairings x ` +
    `${config.accGames}g) · ${tasks.length} tasks · ${workers} workers · ${cpus().length} cpus`,
)

// --- the worker pool ------------------------------------------------------------------------
// One long-lived thread per lane; `runPool` (typechecked, in lib/lab) decides what each lane
// takes next, this only carries the task there and the result back.
const pool = []
for (let i = 0; i < Math.min(workers, tasks.length); i++) {
  pool.push({ worker: new Worker(resolve(HERE, 'bounded-sim-worker.mjs')), busy: false })
}
const idle = [...pool]

function execute(task) {
  return new Promise((res, rej) => {
    const slot = idle.pop()
    if (!slot) {
      rej(new Error('bounded-sim: no idle worker — runPool exceeded its lane count'))
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

const output = assembleBoundedRun(config, results, {
  wallMs,
  workers: pool.length,
  generatedAt: new Date().toISOString(),
})

await mkdir(outDir, { recursive: true })
// The per-game JSONL is the step-1 artifact (E3's raw input, elogs included) and is written by
// default; `--jsonl false` suppresses the file only — the digest is taken over the in-memory
// records either way.
if (opt.jsonl !== 'false') await writeFile(resolve(outDir, 'games.jsonl'), boundedToJsonl(output.records), 'utf8')
await writeFile(
  resolve(outDir, 'run.json'),
  JSON.stringify(
    {
      meta: output.meta,
      health: output.health,
      ladder: output.ladder,
      ladderDeltas: output.ladderDeltas,
      mirrorExact: output.mirrorExact,
      tiers: output.tiers,
      evidence: output.evidence,
      accuracy: output.accuracy,
    },
    null,
    2,
  ),
  'utf8',
)

// --- console summary ------------------------------------------------------------------------
const inf = (bits) => (bits >= 1_000_000 ? 'inf' : String(bits))
console.log('')
console.log('E1 ladder (bounded balanced vs unbounded balanced, paired set-share):')
for (const cell of output.ladder) {
  console.log(
    `  ${inf(cell.bits).padStart(4)} bits  ${cell.share.toFixed(4)} ± ${cell.se.toFixed(4)} ` +
      `(${cell.pairs} pairs, avg ${cell.avgMoves.toFixed(0)} moves)`,
  )
}
console.log('E1 adjacent rungs (delta, paired SE):')
for (const d of output.ladderDeltas) {
  console.log(
    `  ${inf(d.fromBits)}→${inf(d.toBits)}  ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(4)} ± ${d.se.toFixed(4)}` +
      `  ${d.pass ? 'ok' : 'VIOLATES −2·SE'}`,
  )
}
console.log(
  `P2 mirror at ∞: ${output.mirrorExact.pairs} pairs, ${output.mirrorExact.deviations} deviations, ` +
    `share ${output.mirrorExact.share.toFixed(4)}`,
)
console.log('E2 tiers:')
for (const t of output.tiers) {
  const beq = t.bitsEquivalent
  console.log(
    `  ${t.tier.padEnd(6)} ${t.share.toFixed(4)} ± ${t.se.toFixed(4)} → ` +
      (beq.finite ? `${beq.bits.toFixed(1)} bits` : `no finite equivalent (${beq.note})`),
  )
}
console.log('E3 evidence-age (exploit young 1–8 / old 33+, per policy):')
for (const c of output.evidence) {
  console.log(
    `  ${c.policy.padEnd(12)} young ${c.young.rate.toFixed(3)} (${c.young.available})  old ` +
      `${c.old.rate.toFixed(3)} (${c.old.available})  decay ${c.decay.diff.toFixed(4)} ± ${c.decay.se.toFixed(4)}` +
      `  half-life ${c.halfLifeAge === null ? '—' : c.halfLifeAge}`,
  )
}
console.log('E4 accuracy:')
for (const cell of output.accuracy.cells) {
  console.log(`  ${inf(cell.bits).padStart(4)} bits  top-1 ${(100 * cell.top1).toFixed(2)}% over ${cell.seats} seats`)
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
console.log(`wrote ${outDir}/${opt.jsonl === 'false' ? '' : 'games.jsonl · '}run.json`)
process.exit(output.health.ok ? 0 : 1)
