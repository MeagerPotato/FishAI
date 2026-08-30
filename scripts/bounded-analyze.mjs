/**
 * bounded-analyze.mjs — folds a bounded-sim run into the ONE artifact the site will read:
 * `src/lab/data/bounded-results.json` (SPEC v1.5 Phase 2).
 *
 * `node scripts/bounded-analyze.mjs --run lab-out/DIR [--emit PATH] [--adaptive PATH]`
 *
 * Since E4b (SPEC v1.5), what this emits is the BASE artifact — schema 1, the suite's E1–E4
 * sections and the P1–P7 verdicts. The artifact the SITE reads is schema 2: the base extended
 * with the E4b single-seat block by `scripts/bounded-single-analyze.mjs` (which consumes the
 * base through `extendBoundedResults` — its docstring states the exact guard coverage: the
 * base's digest is pinned, its predictions authenticated, its derived fields and P1–P7
 * verdicts recomputed, and the carried sections compared after assembly).
 * The default here therefore no longer overwrites `src/lab/data/bounded-results.json`; pass
 * `--emit PATH` explicitly to write the base artifact somewhere, then extend it.
 *
 * Thin for the reason every script here is thin: `scripts/` is linted but NOT typechecked, so
 * this file does only what genuinely needs a platform — read files, ask git for the commit,
 * write files. The verdicts and the artifact shape are `buildBoundedResults` in
 * lib/lab/bounded.ts, which is typechecked and tested.
 *
 * Two integrity gates run before any folding: the run's games.jsonl must hash to the digest
 * its run.json claims, and the per-cell ladder set-shares recomputed from the JSONL must equal
 * run.json's to 1e-12 — the raw records and the aggregate must be from the same run, and must
 * agree. The committed adaptive artifact supplies the v1.0 end-of-game classifier top-1 as the
 * P7 baseline anchor; it enters the verdict DETAIL only, never a rule.
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

const { buildBoundedResults, digest } = await import('../lib/lab/index.ts')
const { rulesHash } = await import('../lib/lab/analysis/index.ts')

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
  console.error('usage: node scripts/bounded-analyze.mjs --run lab-out/DIR [--emit PATH] [--adaptive PATH]')
  process.exit(2)
}
const runDir = resolve(process.cwd(), opt.run)
// No default src/lab/data emission any more: the site reads the E4b-extended schema-2 artifact,
// so the base emitted here would be refused at the boundary. Extend it (see the header).
const emitPath = opt.emit && opt.emit !== 'false' ? resolve(process.cwd(), opt.emit) : null
const adaptivePath = resolve(process.cwd(), opt.adaptive ?? 'src/lab/data/adaptive-results.json')

// --- read the run back ------------------------------------------------------------------------
const run = JSON.parse(await readFile(join(runDir, 'run.json'), 'utf8'))
const jsonlPath = join(runDir, 'games.jsonl')
if (existsSync(jsonlPath)) {
  // Integrity 1: the runner's digest is taken over exactly these bytes, so hashing the file
  // text is the same number and does not depend on re-serialising identically.
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

  // Integrity 2: recompute every ladder cell's duplicate-pair mean set-share from the raw
  // records and require exact agreement with run.json (1e-12) — the aggregate must be a pure
  // function of the JSONL, not a separately-remembered number.
  const byCell = new Map()
  for (const line of jsonlText.split('\n')) {
    if (!line.includes('"exp":"ladder"')) continue
    const r = JSON.parse(line)
    let cell = byCell.get(r.cell)
    if (!cell) {
      cell = new Map()
      byCell.set(r.cell, cell)
    }
    const slot = cell.get(r.pair)
    if (slot) slot.push(r.aShare)
    else cell.set(r.pair, [r.aShare])
  }
  for (const cell of run.ladder) {
    const pairs = byCell.get(cell.id)
    const means = []
    for (const [, xs] of pairs ?? []) {
      if (xs.length === 2) means.push((xs[0] + xs[1]) / 2)
    }
    const share = means.length === 0 ? 0 : means.reduce((s, v) => s + v, 0) / means.length
    if (Math.abs(share - cell.share) > 1e-12) {
      console.error(
        `games.jsonl share for ${cell.id} is ${share}, run.json says ${cell.share} — ` +
          'the JSONL and the aggregate disagree.',
      )
      process.exit(2)
    }
  }
  console.log(`ladder shares re-derived from games.jsonl: all ${run.ladder.length} cells agree`)
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

// --- the v1.0 accuracy baseline from the committed adaptive artifact --------------------------
let baseline
if (opt.adaptive !== 'false' && existsSync(adaptivePath)) {
  const adaptive = JSON.parse(await readFile(adaptivePath, 'utf8'))
  const end = adaptive.classifier?.accuracy?.find((r) => r.events === 0)
  if (end) {
    baseline = {
      artifact: 'adaptive-results.json',
      recordsDigest: adaptive.meta.recordsDigest,
      endTop1: end.top1,
    }
    console.log(`baseline: v1.0 end-of-game top-1 ${(100 * end.top1).toFixed(2)}% (${adaptivePath})`)
  }
}

// --- fold -------------------------------------------------------------------------------------
const results = buildBoundedResults(run, {
  engineCommit,
  rulesHash: rulesHash(rulesText),
  rulesFile,
  generatedAt: new Date().toISOString(),
  ...(baseline ? { baseline } : {}),
})

// --- emit -------------------------------------------------------------------------------------
const text = JSON.stringify(results, null, 2)
await writeFile(join(runDir, 'bounded-results.json'), text, 'utf8')
if (emitPath !== null) {
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
console.log(`wrote ${join(runDir, 'bounded-results.json')} (BASE artifact, schema 1)`)
if (emitPath !== null) console.log(`wrote ${emitPath} (BASE artifact, schema 1)`)
console.log('the site artifact is schema 2 — extend via: node scripts/bounded-single-analyze.mjs --run <E4b DIR> --base <this base>')
process.exit(run.health.ok ? 0 : 1)
