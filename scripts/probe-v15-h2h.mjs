/**
 * probe-v15-h2h.mjs — scratch: FishAI v1.5 (bounded-memory) head-to-head against FishAI v1.0
 * (adaptive), on DUPLICATE deals (BOT_LAB.md §5.1): every seed played in both orientations with
 * the start seat held identical, so the deal is never a confound.
 *
 * Cells (all against the SAME held-out seed list):
 *   ctrl-mirror   : v1.0 vs v1.0                  -> must be EXACTLY 0.0000 +/- 0.0000
 *   ctrl-inf-bare : bounded(INF,'balanced') vs bare 'balanced'  -> must be EXACTLY 0.0000 +/- 0.0000
 *   b<bits>       : bounded(bits,'balanced') vs v1.0 adaptive
 *
 * The two controls are the confound check the method discipline demands: a zero-magnitude arm
 * must print exactly 0.0000, or the harness (not the policy) is producing the difference.
 *
 * Usage: node scripts/probe-v15-h2h.mjs <pairs> <bank> <out.json> [bitsCSV]
 */
import { Worker } from 'node:worker_threads'
import { cpus } from 'node:os'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PAIRS = Number(process.argv[2] ?? 200)
const BANK = process.argv[3] ?? 'v15v10-holdout-a'
const OUT = process.argv[4] ?? 'h2h.json'
const BITS = (process.argv[5] ?? '0,8,16,24,32,48,64,96,128,1000000').split(',').map(Number)
const CHUNK = 10

const PUNTER_BITS = [0, 16, 32, 64, 1_000_000].filter((b) => BITS.includes(b))
const cells = [
  // controls: two zero-magnitude arms. Anything but exactly 0.0000 +/- 0.0000 voids the run.
  { id: 'ctrl-mirror', a: { kind: 'adaptive' }, b: { kind: 'adaptive' } },
  { id: 'ctrl-inf-bare', a: { kind: 'bounded', bits: 1_000_000, style: 'balanced' }, b: { kind: 'style', id: 'balanced' } },
  // the headline ladder: v1.5 at each budget against the v1.0 adaptive baseline
  ...BITS.map((bits) => ({ id: `b${bits}`, a: { kind: 'bounded', bits, style: 'balanced' }, b: { kind: 'adaptive' } })),
  // the same ladder against the v0.5 unbounded balanced reference (the shipped E1 opponent),
  // on the SAME deals — so "vs v1.0" and "vs v0.5" are differenced per seed.
  ...BITS.map((bits) => ({ id: `r${bits}`, a: { kind: 'bounded', bits, style: 'balanced' }, b: { kind: 'style', id: 'balanced' } })),
  // does naming punter (the style v1.0 provably converges on) buy the bounded arm anything?
  ...PUNTER_BITS.map((bits) => ({ id: `p${bits}`, a: { kind: 'bounded', bits, style: 'punter' }, b: { kind: 'adaptive' } })),
]

const tasks = []
for (let from = 0; from < PAIRS; from += CHUNK) {
  const to = Math.min(PAIRS, from + CHUNK)
  for (const c of cells) {
    tasks.push({ index: tasks.length, cell: c.id, a: c.a, b: c.b, bank: BANK, pairFrom: from, pairTo: to })
  }
}

const nWorkers = Math.min(tasks.length, Math.max(1, cpus().length - 2))
const workerPath = fileURLToPath(new URL('./probe-v15-h2h-worker.mjs', import.meta.url))
const results = []
let next = 0
let done = 0
const t0 = Date.now()

await new Promise((resolve, reject) => {
  const workers = []
  let live = 0
  const pump = (w) => {
    if (next >= tasks.length) {
      w.postMessage({ type: 'quit' })
      return
    }
    w.postMessage({ type: 'task', task: tasks[next++] })
  }
  for (let i = 0; i < nWorkers; i++) {
    const w = new Worker(workerPath)
    live++
    workers.push(w)
    w.on('message', (m) => {
      if (m.type === 'error') return reject(new Error(m.message))
      results.push(m.result)
      done++
      if (done % 25 === 0 || done === tasks.length) {
        const el = (Date.now() - t0) / 1000
        process.stderr.write(`  ${done}/${tasks.length} tasks, ${el.toFixed(0)}s\r`)
      }
      pump(w)
    })
    w.on('error', reject)
    w.on('exit', () => {
      live--
      if (live === 0) resolve()
    })
    pump(w)
  }
})
process.stderr.write('\n')

/* ---------------------------------------------------------------- aggregate --- */

function agg(cellId) {
  const rows = results.filter((r) => r.cell === cellId).flatMap((r) => r.rows)
  rows.sort((x, y) => x.pair - y.pair)
  const seeds = new Set(rows.map((r) => r.seed))
  let health = 0
  const d = [] // per-pair set difference, SUMMED over the two orientations
  const share = [] // per-pair set share of A, averaged over the two orientations
  const res = [] // per-pair result of A in {0,0.5,1}, averaged over the two orientations
  let aSets = 0
  let bSets = 0
  let aWins = 0
  let bWins = 0
  let ties = 0
  for (const r of rows) {
    health += r.health
    let dd = 0
    let sh = 0
    let rr = 0
    for (const o of [0, 1]) {
      const [as, bs] = r.sets[o]
      aSets += as
      bSets += bs
      dd += as - bs
      sh += as + bs > 0 ? as / (as + bs) : 0.5
      if (as > bs) { rr += 1; aWins++ } else if (as < bs) { bWins++ } else { rr += 0.5; ties++ }
    }
    d.push(dd)
    share.push(sh / 2)
    res.push(rr / 2)
  }
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length
  const seOf = (v) => {
    const m = mean(v)
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1))
    return sd / Math.sqrt(v.length)
  }
  return {
    cell: cellId,
    // per-pair vectors, in pair order — every cell replays the SAME seed list, so any two cells
    // can be differenced element-wise and the deal cancels a second time.
    d,
    share_v: share,
    pairs: rows.length,
    games: rows.length * 2,
    distinctSeeds: seeds.size,
    health,
    aSets,
    bSets,
    aWins,
    bWins,
    ties,
    winRate: aWins / (rows.length * 2),
    setDiff: mean(d),
    setDiffCi: 1.96 * seOf(d),
    setDiffSe: seOf(d),
    share: mean(share),
    shareCi: 1.96 * seOf(share),
    score: mean(res),
    scoreCi: 1.96 * seOf(res),
  }
}

const out = { bank: BANK, pairs: PAIRS, variant: 'us54', cells: cells.map((c) => agg(c.id)) }
writeFileSync(OUT, JSON.stringify(out, null, 2))

console.log(`\nFishAI v1.5 (bounded, balanced) vs v1.0 (adaptive) — us54, duplicate deals`)
console.log(`bank '${BANK}', ${PAIRS} pairs/cell = ${PAIRS * 2} games/cell, ${(Date.now() - t0) / 1000}s\n`)
const pad = (s, n) => String(s).padEnd(n)
console.log(
  `${pad('cell', 14)} ${pad('pairs', 6)} ${pad('seeds', 6)} ${pad('bad', 4)} ${pad('setDiff (A-B) +/-95%', 26)} ${pad('share', 8)} ${pad('winRate', 8)} ${pad('sets A:B', 12)}`,
)
for (const a of out.cells) {
  console.log(
    `${pad(a.cell, 14)} ${pad(a.pairs, 6)} ${pad(a.distinctSeeds, 6)} ${pad(a.health, 4)} ` +
      `${pad(`${a.setDiff >= 0 ? '+' : ''}${a.setDiff.toFixed(4)} +/- ${a.setDiffCi.toFixed(4)}`, 26)} ` +
      `${pad(a.share.toFixed(4), 8)} ${pad(a.winRate.toFixed(4), 8)} ${pad(`${a.aSets}:${a.bSets}`, 12)}`,
  )
}
console.log(`\nwrote ${OUT}`)
