/**
 * p2-read.mjs: P2's two reads against Monet v1.0 at home (ATHENA.md §9.6, §9.7), one command each.
 *
 *     node scripts/athena/p2-read.mjs curve --weights <weights.bin> [--procs 6]
 *     node scripts/athena/p2-read.mjs g2    --weights <weights.bin> [--procs 6]
 *
 * Both are `scripts/duplicate-pairs.mjs`, in geometry B, sharded across processes and summed. The arm is the weight
 * file, played through `lib/athena`'s float64 forward with deterministic (argmax) decisions; the opponent is Monet
 * v1.0. Nothing here samples, so a read is a pure function of the weight file, the bank and the pair count.
 *
 * **`curve` (§9.6): the learning curve's instrument.** 600 duplicate pairs = 1,200 games on the fixed bank
 * `athena-p2-curve`, which is 200 deals × 6 rotations. The same bank every read, so the curve is comparable with
 * itself; it is not a ship read. [Estimate] about 3 minutes on six threads.
 *
 * **`g2` (§9.7): the gate.** Twelve cells, one per registered seed of `scripts/seeds/athena-p2-g2/SEEDS`, each 600
 * pairs on the bank the seed itself names — deals `<seed>-0` .. `<seed>-199`, as `home_harness.py --geometry B
 * --bank <seed>` reads a cell — so the whole read is 14,400 games. It prints the pooled win rate with its SE,
 * every cell's win rate with the SD and SE across the twelve, and both ship-rule numbers — the mean paired set
 * difference against 2 SE, and the count of seeds ATHENA is ahead on. **The bar is §3's: at least 50.0%.**
 * [Estimate] about 30–45 minutes on eight threads.
 *
 * **The null arm.** `--b athena:<the same file>` is §9.7's byte-exact control: one deterministic policy on both teams
 * plays each pair's two games identically, so the win rate must print 50.0000% and the set difference 0.
 *
 * Other flags: `--b <arm>` (default `v1.0`; a Monet version or `athena:<file>`), `--pairs`, `--bank` (curve only),
 * `--work <dir>` for the shard files (default `dist/athena-p2-read/<label>`), `--out <file>` for the summary JSON,
 * and `--quiet` to print only the summary.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus } from 'node:os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const HARNESS = join(ROOT, 'scripts/duplicate-pairs.mjs')

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const has = (flag) => process.argv.includes(flag)

const MODE = process.argv[2]
if (MODE !== 'curve' && MODE !== 'g2') {
  console.error('usage: node scripts/athena/p2-read.mjs curve|g2 --weights <weights.bin> [--procs 6] [--b v1.0] [--pairs 600] [--out summary.json]')
  process.exit(2)
}
const WEIGHTS = argOf('--weights', '')
if (!WEIGHTS) {
  console.error('--weights <weights.bin> is required')
  process.exit(2)
}
const ARM_A = `athena:${WEIGHTS}`
const ARM_B = argOf('--b', 'v1.0')
/** §9.6 and §9.7 are both 600 pairs a cell: 200 deals x 6 rotations in geometry B. */
const PAIRS = Number(argOf('--pairs', 600))
const PROCS = Math.max(1, Math.min(Number(argOf('--procs', 6)), cpus().length))
const QUIET = has('--quiet')
const LABEL = `${MODE}-${Date.now()}`
const WORK = resolve(ROOT, argOf('--work', join('dist/athena-p2-read', LABEL)))
const OUT = argOf('--out', '')

/** §9.7's registered seeds, spent by this read alone. */
const G2_SEEDS = readFileSync(join(ROOT, 'scripts/seeds/athena-p2-g2/SEEDS'), 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

/** The cells this read plays: geometry B, 600 pairs each. */
const CELLS =
  MODE === 'curve'
    ? [{ name: 'curve', bank: argOf('--bank', 'athena-p2-curve') }]
    : // the seed IS the bank, as `home_harness.py --geometry B --bank <seed>` reads a cell (ATHENA.md §7.2's pattern):
      // cell <seed> plays the deals `<seed>-0` .. `<seed>-199`
      G2_SEEDS.map((s) => ({ name: s, bank: s }))
if (MODE === 'g2' && CELLS.length !== 12) throw new Error(`scripts/seeds/athena-p2-g2/SEEDS holds ${CELLS.length} seeds, not 12`)

/** Every shard: a cell and a slice of its pairs. A curve read splits one cell; G2 gives each cell a process. */
const shards = []
for (const cell of CELLS) {
  const slices = MODE === 'curve' ? PROCS : 1
  for (let i = 0; i < slices; i++) {
    const from = Math.floor((i * PAIRS) / slices)
    const to = Math.floor(((i + 1) * PAIRS) / slices)
    if (to > from) shards.push({ cell, from, to, json: join(WORK, `${cell.name}-${from}-${to}.json`) })
  }
}

rmSync(WORK, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
mkdirSync(WORK, { recursive: true })

const run = (shard) =>
  new Promise((ok, fail) => {
    const args = [
      HARNESS,
      '--a', ARM_A,
      '--b', ARM_B,
      '--geometry', 'B',
      '--bank', shard.cell.bank,
      '--pairs', String(PAIRS),
      '--pair-from', String(shard.from),
      '--pair-to', String(shard.to),
      '--json', shard.json,
    ]
    const p = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    p.stdout.on('data', (b) => {
      if (!QUIET) process.stdout.write(b)
    })
    p.stderr.on('data', (b) => {
      err += b
      process.stderr.write(b)
    })
    p.on('close', (code) => (code === 0 ? ok(shard) : fail(new Error(`shard ${shard.cell.name} ${shard.from}..${shard.to} exited ${code}\n${err}`))))
  })

/** `PROCS` shards in flight at a time (ATHENA.md §9.6's six threads, §9.7's eight). */
async function runAll() {
  const queue = shards.map((s, i) => ({ s, i }))
  const live = new Map()
  const errors = []
  while (queue.length > 0 || live.size > 0) {
    while (live.size < PROCS && queue.length > 0) {
      const { s, i } = queue.shift()
      live.set(
        i,
        run(s).then(
          () => ({ i, err: null }),
          (err) => ({ i, err }),
        ),
      )
    }
    const { i, err } = await Promise.race([...live.values()])
    live.delete(i)
    if (err) errors.push(err)
  }
  // every shard is run before anything is reported: a partial read is never summed
  if (errors.length > 0) throw errors[0]
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const sd = (xs) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1))
}

const t0 = Date.now()
await runAll()
const elapsed = (Date.now() - t0) / 1000

/** Each cell's shards, summed back into one cell. */
const cells = CELLS.map((cell) => {
  const parts = shards
    .filter((s) => s.cell === cell)
    .map((s) => JSON.parse(readFileSync(s.json, 'utf8')))
    .sort((a, b) => a.pairFrom - b.pairFrom)
  const d = parts.flatMap((p) => p.d)
  const w = parts.flatMap((p) => p.w)
  const pairs = parts.reduce((a, p) => a + p.pairs, 0)
  const winsA = parts.reduce((a, p) => a + p.winsA, 0)
  return {
    name: cell.name,
    bank: cell.bank,
    pairs,
    capped: parts.reduce((a, p) => a + p.capped, 0),
    games: 2 * pairs,
    winsA,
    winRate: winsA / Math.max(1, 2 * pairs),
    setsA: parts.reduce((a, p) => a + p.setsA, 0),
    setsB: parts.reduce((a, p) => a + p.setsB, 0),
    diffMean: mean(d),
    diffSe: sd(d) / Math.sqrt(Math.max(1, d.length)),
    secs: parts.reduce((a, p) => a + p.secs, 0),
    d,
    w,
  }
})

const allD = cells.flatMap((c) => c.d)
const games = cells.reduce((a, c) => a + c.games, 0)
const wins = cells.reduce((a, c) => a + c.winsA, 0)
const wr = wins / Math.max(1, games)
const diffMean = mean(allD)
const diffSe = sd(allD) / Math.sqrt(Math.max(1, allD.length))
const cellRates = cells.map((c) => c.winRate)
const ahead = cellRates.filter((r) => r > 0.5).length
const capped = cells.reduce((a, c) => a + c.capped, 0)

console.log('')
console.log(`=== ATHENA P2 ${MODE === 'curve' ? 'curve read (§9.6)' : 'G2 (§9.7)'}: ${WEIGHTS} vs ${ARM_B}, geometry B, home ===`)
console.log(`cells           ${cells.length} x ${PAIRS} pairs = ${games} games, ${PROCS} processes, ${elapsed.toFixed(1)}s wall (${cells.reduce((a, c) => a + c.secs, 0).toFixed(1)}s summed over the shards)`)
if (capped) console.log(`!!! ${capped} pairs hit the step cap and were dropped`)
console.log(`win rate        ${(100 * wr).toFixed(4)}%  (${wins} of ${games}; SE ${(100 * Math.sqrt((wr * (1 - wr)) / Math.max(1, games))).toFixed(2)}% binomial)`)
console.log(`paired set-diff ${diffMean.toFixed(4)} +/- ${(2 * diffSe).toFixed(4)} (2 SE; SE ${diffSe.toFixed(4)} over ${allD.length} pairs)`)
if (MODE === 'g2') {
  const lo = Math.min(...cellRates)
  console.log(`per seed        ${cellRates.map((r) => (100 * r).toFixed(2)).join(' ')}`)
  console.log(`across seeds    mean ${(100 * mean(cellRates)).toFixed(4)}%, SD ${(100 * sd(cellRates)).toFixed(4)}%, SE ${((100 * sd(cellRates)) / Math.sqrt(cellRates.length)).toFixed(4)}%, lowest ${(100 * lo).toFixed(2)}%`)
  console.log(`ship rule       ${diffMean > 2 * diffSe ? 'mean paired diff above 2 SE' : 'mean paired diff NOT above 2 SE'}; ahead on ${ahead} of ${cellRates.length} seeds`)
  console.log(`G2 (>= 50.0%)   ${wr >= 0.5 ? 'HELD' : 'MISSED'} at ${(100 * wr).toFixed(4)}%`)
}

const summary = {
  mode: MODE,
  weights: WEIGHTS,
  b: ARM_B,
  geometry: 'B',
  pairsPerCell: PAIRS,
  procs: PROCS,
  games,
  wins,
  winRate: wr,
  diffMean,
  diffSe,
  capped,
  secsWall: elapsed,
  secsShards: cells.reduce((a, c) => a + c.secs, 0),
  cells: cells.map(({ d, w, ...rest }) => ({ ...rest, pairsUsed: d.length, wMean: mean(w) })),
  ...(MODE === 'g2' ? { seedRates: cellRates, seedMean: mean(cellRates), seedSd: sd(cellRates), aheadSeeds: ahead, held: wr >= 0.5 } : {}),
}
if (OUT) {
  writeFileSync(resolve(ROOT, OUT), JSON.stringify(summary, null, 1) + '\n')
  console.log(`summary         ${OUT}`)
}
console.log(`shards          ${WORK} (${readdirSync(WORK).length} files)`)
