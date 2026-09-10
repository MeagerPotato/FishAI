/**
 * fit-p-calibration — MONET.md §3.8ap (row 51) R1: the monotone map from the ask belief's `p` to the truth.
 *
 * §3.8ao measured the marginal under-shooting by four to nine points wherever its scaling concentrates mass above
 * the uniform 1/n, and exact everywhere else. This fits the repair that measurement names: an isotonic regression
 * (pool-adjacent-violators, weighted by the bin's count) of the hit rate on `p`, over the `pbins` a
 * `probe-set-attribution --ceiling 1` run writes. The output is the `{ bins: [...] }` that probe's `--pcal` reads.
 *
 *     node scripts/fit-p-calibration.mjs --in fit.json [--side arm] [--out map.json]
 *
 * `--side` is `arm` (ours, the default) or `sestina`. The map is READ ONLY where the probe applies it — strictly
 * between 0 and 1 — so a certain ask stays certain and a dead ask stays dead however the fit lands; bins with no
 * data carry the last fitted value, and the leading empty bins take their own midpoint (the identity).
 *
 * Fit it on one half of the records and read it on the other (`--max-files` against `--skip-files`), or the map
 * is scored on the games it was fitted to and the reach it reports is its own overfit.
 */
import fs from 'node:fs'

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const IN = argOf('--in', '')
const SIDE = argOf('--side', 'arm')
const OUT = argOf('--out', '')
if (!IN) {
  console.error('--in <probe --out json> is required')
  process.exit(2)
}
const src = JSON.parse(fs.readFileSync(IN, 'utf8'))
const bins = src?.T?.[SIDE]?.ceiling?.pbins
if (!Array.isArray(bins)) throw new Error(`--in: no T.${SIDE}.ceiling.pbins (was the run given --ceiling 1?)`)
const NB = bins.length

// The observed points: one per bin that saw an ask, the hit rate carried at the bin's own weight.
const pts = []
for (let i = 0; i < NB; i++) {
  const b = bins[i]
  if (!b || b.n <= 0) continue
  pts.push({ i, y: b.hits / b.n, w: b.n, meanP: b.sumP / b.n })
}
if (pts.length === 0) throw new Error('--in: every bin empty')

// Pool-adjacent-violators: merge any block whose fitted value falls below its left neighbour's, until the
// sequence is non-decreasing. Each block keeps its weighted mean, so the result is the isotonic least-squares fit.
const blocks = []
for (const p of pts) {
  blocks.push({ sum: p.y * p.w, w: p.w, lo: p.i, hi: p.i })
  while (blocks.length > 1) {
    const b = blocks[blocks.length - 1]
    const a = blocks[blocks.length - 2]
    if (a.sum / a.w <= b.sum / b.w) break
    blocks.pop()
    a.sum += b.sum
    a.w += b.w
    a.hi = b.hi
  }
}

// Lay the blocks back over every bin. A bin inside a block takes its block's value; a bin between blocks (no data)
// carries the last value forward, and the bins before the first block take their own midpoint — the identity.
const out = new Array(NB).fill(0)
let bi = 0
let last = null
for (let i = 0; i < NB; i++) {
  while (bi < blocks.length && blocks[bi].hi < i) bi++
  const b = bi < blocks.length && blocks[bi].lo <= i && i <= blocks[bi].hi ? blocks[bi] : null
  if (b) last = Math.min(1, Math.max(0, b.sum / b.w))
  out[i] = last === null ? (i + 0.5) / NB : last
}

const mid = (i) => (i + 0.5) / NB
const nz = pts.reduce((a, p) => a + p.w, 0)
const shift = pts.reduce((a, p) => a + p.w * (out[p.i] - p.meanP), 0) / nz
console.log(`fit-p-calibration: ${IN} side ${SIDE}, ${NB} bins, ${pts.length} with data over ${nz} asks, ${blocks.length} isotonic blocks`)
console.log(`  the mean shift the map applies, weighted by the asks it is read at: ${(100 * shift).toFixed(2)} points`)
console.log(
  `  the map at the deciles (bin midpoint -> fitted): ${Array.from({ length: 10 }, (_, d) => {
    const i = Math.min(NB - 1, Math.round((d + 0.5) * (NB / 10)))
    return `${(100 * mid(i)).toFixed(0)} -> ${(100 * out[i]).toFixed(1)}`
  }).join('; ')}`,
)
if (OUT) {
  fs.writeFileSync(OUT, JSON.stringify({ meta: { source: IN, side: SIDE, bins: NB, asks: nz, blocks: blocks.length }, bins: out }, null, 1))
  console.log(`  written ${OUT}`)
}
