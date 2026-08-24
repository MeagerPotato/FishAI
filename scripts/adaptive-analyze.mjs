/**
 * adaptive-analyze.mjs — folds an adaptive-sim run into the ONE artifact the site reads:
 * `src/lab/data/adaptive-results.json` (SPEC Stage 2c).
 *
 * `node scripts/adaptive-analyze.mjs --run lab-out/DIR [--emit PATH] [--v2 PATH]`
 *
 * Thin for the reason every script here is thin: `scripts/` is linted but NOT typechecked, so
 * this file does only what genuinely needs a platform — read files, ask git for the commit,
 * write files. The verdicts, the benchmark folding and the artifact shape are
 * `buildAdaptiveResults` in lib/lab/adaptive.ts, which is typechecked and tested.
 *
 * ## The punter benchmark, and when the pairing claim is honest
 *
 * The gauntlet's P1 comparison reads punter's row out of the committed matrix-v2 artifact
 * (`--v2`, default src/lab/data/style-results.v2.json). That row was measured on seed prefix
 * `style-v1` at 4,300 pairs per cell; the comparison is per-deal ONLY if the gauntlet replayed
 * exactly that seed list, which `buildAdaptiveResults` checks (prefix AND pair count) and
 * stamps into `meta.benchmark.paired`. A shortened gauntlet (--pairs below 4300) demotes the
 * benchmark to an unpaired comparison and says so in the artifact rather than pretending.
 * Two integrity gates run before any folding: the run's games.jsonl must hash to the digest
 * its run.json claims, and the benchmark's digest must equal the committed counter table's
 * source digest — the row v1.0 is judged against and the table it best-responded with must
 * come from the same matrix.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 23 || (major === 23 && minor < 6)) {
  console.error(`node ${process.versions.node} cannot import TypeScript directly; run with Node 23.6+.`)
  process.exit(1)
}

const { buildAdaptiveResults, digest } = await import('../lib/lab/index.ts')
const { rulesHash } = await import('../lib/lab/analysis/index.ts')
const { STYLE_IDS } = await import('../lib/engine/index.ts')

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
if (!opt.run) {
  console.error('usage: node scripts/adaptive-analyze.mjs --run lab-out/DIR [--emit PATH] [--v2 PATH]')
  process.exit(2)
}
const runDir = resolve(process.cwd(), opt.run)
const emitPath = resolve(process.cwd(), opt.emit ?? 'src/lab/data/adaptive-results.json')
const v2Path = resolve(process.cwd(), opt.v2 ?? 'src/lab/data/style-results.v2.json')

// --- read the run back ------------------------------------------------------------------------
const run = JSON.parse(await readFile(join(runDir, 'run.json'), 'utf8'))
const jsonlPath = join(runDir, 'games.jsonl')
if (existsSync(jsonlPath)) {
  // Integrity: the runner's digest is taken over exactly these bytes, so hashing the file text
  // is the same number and does not depend on re-serialising identically.
  const readDigest = digest(await readFile(jsonlPath, 'utf8'))
  if (readDigest !== run.meta.recordsDigest) {
    console.error(
      `games.jsonl digest ${readDigest} != run.json recordsDigest ${run.meta.recordsDigest} — ` +
        'the JSONL and the aggregate are from different runs.',
    )
    process.exit(2)
  }
  console.log(`run ${runDir}: ${run.meta.gamesTotal} games · digest ${readDigest} (matches)`)
} else {
  console.log(`run ${runDir}: ${run.meta.gamesTotal} games · no games.jsonl (digest not re-verified)`)
}
if (!run.health.ok) console.error('WARNING: this run FAILED its health gate; the artifact will say so.')

// --- provenance -------------------------------------------------------------------------------
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
const rulesFile = opt.rulesFile ?? 'RULES_US54.md'
const rulesText = await readFile(join(ROOT, rulesFile), 'utf8')

// --- the punter benchmark from matrix v2 ------------------------------------------------------
const v2 = JSON.parse(await readFile(v2Path, 'utf8'))
const punterRow = {}
for (const s of STYLE_IDS) {
  if (s === 'punter') {
    // The mirror diagonal: 0.5 by duplicate-pair symmetry, unmeasured on purpose (the matrix
    // excludes mirror cells). The adaptive-vs-punter cell is judged against it with SE 0.
    punterRow[s] = { score: 0.5, se: 0 }
    continue
  }
  const cell = v2.matrix.find((c) => (c.a === 'punter' && c.b === s) || (c.a === s && c.b === 'punter'))
  if (!cell) {
    console.error(`benchmark: ${v2Path} has no punter cell against ${s}`)
    process.exit(2)
  }
  punterRow[s] = cell.a === 'punter' ? { score: cell.aScore, se: cell.se } : { score: 1 - cell.aScore, se: cell.se }
}

// --- fold -------------------------------------------------------------------------------------
const results = buildAdaptiveResults(run, {
  engineCommit,
  rulesHash: rulesHash(rulesText),
  rulesFile,
  generatedAt: new Date().toISOString(),
  benchmark: {
    artifact: 'style-results.v2.json',
    recordsDigest: v2.meta.recordsDigest,
    seedPrefix: v2.meta.seedSet.prefix,
    pairsPerCell: v2.meta.seedSet.count,
    punterRow,
  },
})

// --- emit -------------------------------------------------------------------------------------
const text = JSON.stringify(results, null, 2)
await writeFile(join(runDir, 'adaptive-results.json'), text, 'utf8')
if (opt.emit !== 'false') {
  await mkdir(dirname(emitPath), { recursive: true })
  await writeFile(emitPath, text, 'utf8')
}

// --- report -----------------------------------------------------------------------------------
console.log('')
console.log(`benchmark: ${results.meta.benchmark.paired ? 'PAIRED (per-deal, cross-run)' : 'UNPAIRED'} — ${results.meta.benchmark.note}`)
console.log('')
console.log('gauntlet vs punter benchmark:')
for (const row of results.gauntlet) {
  console.log(
    `  vs ${row.opponent.padEnd(9)} adaptive ${row.score.toFixed(4)} · punter ${row.punterBenchmark.toFixed(4)} · ` +
      `delta ${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(4)} ± ${row.deltaSe.toFixed(4)}`,
  )
}
console.log('')
for (const v of results.verdicts) {
  console.log(`${v.id}: ${v.verdict.toUpperCase()}`)
  console.log(`  ${v.detail}`)
}
console.log('')
console.log(`wrote ${join(runDir, 'adaptive-results.json')}`)
if (opt.emit !== 'false') console.log(`wrote ${emitPath}`)
process.exit(run.health.ok ? 0 : 1)
