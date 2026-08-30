/**
 * bounded-single-analyze.mjs — extends the committed bounded artifact with the E4b block and
 * writes the ONE artifact the site reads: `src/lab/data/bounded-results.json`, schema 2.
 *
 * `node scripts/bounded-single-analyze.mjs --run lab-out/DIR [--base PATH] [--emit PATH]`
 *
 * Thin for the usual reason — `scripts/` is linted but NOT typechecked. Everything with
 * substance is `extendBoundedResults` in lib/lab/bounded.ts, which refuses to build the
 * artifact if ANY pre-existing aggregate or verdict moved (the P1–P7 verdicts are recomputed
 * from the base artifact's own aggregates and must reproduce byte-for-byte, and every carried
 * section is compared after assembly). Two integrity gates run here first, exactly as
 * bounded-analyze.mjs runs them: the run's games.jsonl must hash to the digest its run.json
 * claims, and the per-cell single-seat top-1s recomputed from the JSONL must equal run.json's
 * to 1e-12.
 *
 * The engine commit in accuracySingle.meta is the one that PLAYED the games — captured by
 * bounded-single-sim.mjs at sim time and read back from run.json here.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 23 || (major === 23 && minor < 6)) {
  console.error(`node ${process.versions.node} cannot import TypeScript directly; run with Node 23.6+.`)
  process.exit(1)
}

const { digest, extendBoundedResults } = await import('../lib/lab/index.ts')

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
if (!opt.run) {
  console.error('usage: node scripts/bounded-single-analyze.mjs --run lab-out/DIR [--base PATH] [--emit PATH]')
  process.exit(2)
}
const runDir = resolve(process.cwd(), opt.run)
const basePath = resolve(process.cwd(), opt.base ?? 'src/lab/data/bounded-results.json')
const emitPath = resolve(process.cwd(), opt.emit ?? 'src/lab/data/bounded-results.json')

// --- read the run back ------------------------------------------------------------------------
const run = JSON.parse(await readFile(join(runDir, 'run.json'), 'utf8'))
const jsonlPath = join(runDir, 'games.jsonl')
if (existsSync(jsonlPath)) {
  // Integrity 1: the runner's digest is taken over exactly these bytes.
  const jsonlText = await readFile(jsonlPath, 'utf8')
  const readDigest = digest(jsonlText)
  if (readDigest !== run.meta.recordsDigest) {
    console.error(
      `games.jsonl digest ${readDigest} != run.json recordsDigest ${run.meta.recordsDigest} — ` +
        'the JSONL and the aggregate are from different runs.',
    )
    process.exit(2)
  }
  console.log(`run ${runDir}: ${run.meta.gamesTotal} games · digest ${readDigest} (matches)`)

  // Integrity 2: recompute every cell's single-seat top-1 from the raw records — the read is
  // top[readSeat] against pairing[0] — and require exact agreement with run.json (1e-12).
  const byBits = new Map()
  for (const line of jsonlText.split('\n')) {
    if (!line.includes('"exp":"accuracySingle"')) continue
    const r = JSON.parse(line)
    let slot = byBits.get(r.bits)
    if (!slot) {
      slot = { reads: 0, correct: 0 }
      byBits.set(r.bits, slot)
    }
    slot.reads++
    if (r.top[r.readSeat] === r.pairing[0]) slot.correct++
  }
  for (const cell of run.cells) {
    const slot = byBits.get(cell.bits) ?? { reads: 0, correct: 0 }
    const top1 = slot.reads === 0 ? 0 : slot.correct / slot.reads
    if (slot.reads !== cell.reads || Math.abs(top1 - cell.top1) > 1e-12) {
      console.error(
        `games.jsonl top-1 for ${cell.bits} bits is ${top1} over ${slot.reads} reads, run.json says ` +
          `${cell.top1} over ${cell.reads} — the JSONL and the aggregate disagree.`,
      )
      process.exit(2)
    }
  }
  console.log(`single-seat top-1 re-derived from games.jsonl: all ${run.cells.length} cells agree`)
} else {
  console.log(`run ${runDir}: ${run.meta.gamesTotal} games · no games.jsonl (digest not re-verified)`)
}
if (!run.health.ok) {
  console.error('this run FAILED its health gate; extendBoundedResults will refuse it.')
}

// --- extend, with the byte-identity refusals inside -------------------------------------------
const baseText = await readFile(basePath, 'utf8')
console.log(`base artifact: ${basePath}`)
const results = extendBoundedResults(baseText, run, {
  engineCommit: run.engineCommit ?? 'unknown',
})

// --- emit -------------------------------------------------------------------------------------
const text = JSON.stringify(results, null, 2)
await writeFile(join(runDir, 'bounded-results.json'), text, 'utf8')
if (opt.emit !== 'false') {
  await mkdir(dirname(emitPath), { recursive: true })
  await writeFile(emitPath, text, 'utf8')
}

// --- report -----------------------------------------------------------------------------------
console.log('')
for (const v of results.verdicts) {
  console.log(`${v.id}: ${v.verdict.toUpperCase()}`)
  console.log(`  ${v.detail}`)
}
console.log('')
for (const fam of results.multiplicity) {
  console.log(`${fam.id} ×${fam.comparisons} Bonferroni annotation (alpha ${fam.alpha}):`)
  for (const r of fam.rungs) {
    const infb = (b) => (b >= 1_000_000 ? 'inf' : String(b))
    console.log(
      `  ${infb(r.fromBits)}→${infb(r.toBits)}  z ${r.z.toFixed(3)} · p ${r.pOneSided.toFixed(6)} · ` +
        `corrected ${r.pBonferroni.toFixed(6)} · raw ${r.violatesRaw ? 'VIOLATES' : 'ok'} · ` +
        `corrected ${r.violatesBonferroni ? 'VIOLATES' : 'ok'}`,
    )
  }
}
console.log('')
console.log(`wrote ${join(runDir, 'bounded-results.json')}`)
if (opt.emit !== 'false') console.log(`wrote ${emitPath}`)
process.exit(run.health.ok ? 0 : 1)
