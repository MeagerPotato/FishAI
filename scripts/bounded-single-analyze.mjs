/**
 * bounded-single-analyze.mjs — extends the committed bounded artifact with the E4b block and
 * writes the ONE artifact the site reads: `src/lab/data/bounded-results.json`.
 *
 * `node scripts/bounded-single-analyze.mjs --run lab-out/DIR [--base PATH] [--emit PATH]
 *    [--baseDigest HEX]`
 *
 * Thin for the usual reason — `scripts/` is linted but NOT typechecked. Everything with
 * substance is `extendBoundedResults` in lib/lab/bounded.ts, whose docstring states its exact
 * guard coverage: the base's `meta.recordsDigest` is pinned to the committed value passed from
 * here, its `meta.predictions` are authenticated against the code's own BOUNDED_PREDICTIONS,
 * its re-derivable stored fields and the P1–P7 verdicts are recomputed byte-for-byte, and the
 * carried sections are compared after assembly. (An earlier header here claimed it "refuses if
 * ANY pre-existing aggregate or verdict moved" — broader than what is checked; aggregates that
 * no verdict quotes and no stored field re-derives from ride on the digest pin alone.)
 *
 * Three integrity gates run here first, and each FAILURE EXITS NON-ZERO — the records file is
 * the evidence, so its absence is a refusal, not a note:
 *   1. games.jsonl must exist next to run.json;
 *   2. it must hash to the digest run.json claims;
 *   3. the per-cell aggregates, the adjacent deltas (deltas AND their SEs) and the ∞
 *      reproduction tally recomputed from the raw records through the SAME
 *      `scoreBoundedSingleAccuracy` the runner used must serialise byte-identically to
 *      run.json's.
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

const { digest, extendBoundedResults, scoreBoundedSingleAccuracy } = await import('../lib/lab/index.ts')

/**
 * The committed base artifact's meta.recordsDigest — the 85,200-game base suite run
 * (data commit "the v1.5 run"). `extendBoundedResults` refuses a base that does not carry it;
 * pass --baseDigest only to extend a DIFFERENT committed base deliberately.
 */
const COMMITTED_BASE_DIGEST = 'fe829b581f665c9a'

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
  console.error(
    'usage: node scripts/bounded-single-analyze.mjs --run lab-out/DIR [--base PATH] [--emit PATH] [--baseDigest HEX]',
  )
  process.exit(2)
}
const runDir = resolve(process.cwd(), opt.run)
const basePath = resolve(process.cwd(), opt.base ?? 'src/lab/data/bounded-results.json')
const emitPath = resolve(process.cwd(), opt.emit ?? 'src/lab/data/bounded-results.json')
const expectedBaseDigest = opt.baseDigest ?? COMMITTED_BASE_DIGEST

// --- read the run back ------------------------------------------------------------------------
const run = JSON.parse(await readFile(join(runDir, 'run.json'), 'utf8'))
const jsonlPath = join(runDir, 'games.jsonl')

// Integrity 1: the records file IS the evidence. Absent records, no artifact — full stop.
if (!existsSync(jsonlPath)) {
  console.error(
    `${jsonlPath} is missing. The per-game records are the evidence behind every aggregate; ` +
      'an artifact must never be extended from run.json alone. Re-run bounded-single-sim.mjs ' +
      'without --jsonl false.',
  )
  process.exit(2)
}

// Integrity 2: the runner's digest is taken over exactly these bytes.
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

// Integrity 3: recompute the whole P8 scoring — cells (top-1 AND seed-clustered SE), adjacent
// deltas (delta AND paired SE) and the ∞ reproduction tally — from the raw records, through
// the SAME scoreBoundedSingleAccuracy the runner used, and require byte-identity with run.json.
{
  const records = []
  for (const line of jsonlText.split('\n')) {
    if (line === '') continue
    records.push(JSON.parse(line))
  }
  const rescored = scoreBoundedSingleAccuracy(records, run.meta.config.accBits)
  for (const [key, got, claimed] of [
    ['cells', rescored.cells, run.cells],
    ['deltas', rescored.deltas, run.deltas],
    ['infReproduction', rescored.infReproduction, run.infReproduction],
  ]) {
    if (JSON.stringify(got) !== JSON.stringify(claimed)) {
      console.error(
        `run.json's ${key} do not serialise byte-identically to the same scoring recomputed ` +
          'from games.jsonl — the JSONL and the aggregate disagree.',
      )
      process.exit(2)
    }
  }
  console.log(
    `P8 scoring re-derived from games.jsonl: cells, deltas (with SEs) and the ∞ tally all agree ` +
      `(${run.cells.length} cells, ${run.deltas.length} rungs)`,
  )
}
if (!run.health.ok) {
  console.error('this run FAILED its health gate; extendBoundedResults will refuse it.')
}

// --- extend, with the refusals inside ---------------------------------------------------------
const baseText = await readFile(basePath, 'utf8')
console.log(`base artifact: ${basePath} (pinned digest ${expectedBaseDigest})`)
const results = extendBoundedResults(baseText, run, {
  engineCommit: run.engineCommit ?? 'unknown',
  expectedBaseDigest,
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
