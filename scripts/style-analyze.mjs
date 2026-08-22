/**
 * style-analyze.mjs — BOT_LAB.md §6 steps 2-4 as a command.
 *
 * ```
 * 1. run      -> per-game records (JSONL)         scripts/style-sim.mjs
 * 2. aggregate-> per-cell metrics + CIs           (done inside the run; read back here)
 * 3. analyze  -> matrix, transitivity, Nash,
 *                alpha-Rank, exploitability       lib/lab/analysis/
 * 4. emit     -> src/lab/data/style-results.json  (the site's only input)
 * ```
 *
 * `npm run analyze -- --run lab-out/DIR [--exploitCache FILE] [--emit PATH]`
 *
 * Thin for the same reason `style-sim.mjs` is thin: `scripts/` is linted but NOT typechecked, so
 * this file does only what genuinely needs a platform — read files, spawn the §5.7 searches as
 * processes, write files. Every number is computed in `lib/lab/analysis/`, which is typechecked.
 *
 * ## The exploitability cache, and when it is a lie
 *
 * A §5.7 best-response search is the expensive half of the analysis and it does not depend on the
 * matrix's sample size at all — different seed prefixes entirely — so caching it across matrix
 * re-runs is sound. Caching it across an ENGINE CHANGE is not: `E(i)` is the score of the best
 * response against style *i*'s BEHAVIOUR, and behaviour is `StyleParams` plus the code in
 * `lib/engine/` that reads them. So the cache key is both:
 *
 *   - `paramsHash`  — SHA-256 of the target's `StyleParams`, and
 *   - `engineHash`  — SHA-256 over every `.ts` file under `lib/engine/`.
 *
 * A change to either invalidates that style's entry and it is re-searched. The engine hash is
 * deliberately coarse (any engine edit invalidates every style): a false invalidation costs CPU,
 * a false HIT publishes a number for a policy that no longer exists.
 */
import { spawn } from 'node:child_process'
import { cpus } from 'node:os'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 23 || (major === 23 && minor < 6)) {
  console.error(`node ${process.versions.node} cannot import TypeScript directly; run with Node 23.6+.`)
  process.exit(1)
}

const {
  analyze,
  buildStyleResults,
  DEFAULT_EXPLOIT_CONFIG,
  renderAnalysis,
  rulesHash,
  sha256,
  skippedExploitability,
} = await import('../lib/lab/analysis/index.ts')
const { digest } = await import('../lib/lab/index.ts')
const { STYLE_ROSTER } = await import('../lib/engine/index.ts')

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
  console.error('usage: npm run analyze -- --run lab-out/DIR [--exploitCache FILE] [--emit PATH]')
  process.exit(2)
}
const runDir = resolve(process.cwd(), opt.run)
const emitPath = resolve(process.cwd(), opt.emit ?? 'src/lab/data/style-results.json')
const cachePath = opt.exploitCache ? resolve(process.cwd(), opt.exploitCache) : null
const bootstrapSamples = Number(opt.bootstrap ?? 1000)
const holdout = opt.holdout ? opt.holdout.split(',').filter(Boolean) : []
const exploitWorkers = Math.max(1, Number(opt.exploitWorkers ?? Math.min(9, Math.max(1, cpus().length - 2))))

// --- step 1/2 artifacts: read the run back --------------------------------------------------
const cellsRaw = JSON.parse(await readFile(join(runDir, 'cells.json'), 'utf8'))
let records = []
let readDigest = ''
const jsonlPath = join(runDir, 'games.jsonl')
if (existsSync(jsonlPath)) {
  let text = await readFile(jsonlPath, 'utf8')
  // The runner's digest is taken over exactly these bytes (`digest(toJsonl(records))`), so
  // hashing the file text is the same number and does not depend on re-serialising identically.
  readDigest = digest(text)
  let lines = text.split('\n')
  text = ''
  records = new Array(lines.length)
  let n = 0
  for (const line of lines) if (line.length > 0) records[n++] = JSON.parse(line)
  records.length = n
  lines = []
} else if (bootstrapSamples > 0) {
  console.error(`no games.jsonl in ${runDir} — the bootstrap needs per-game records; re-run without --jsonl false`)
  process.exit(2)
}
const run = { meta: cellsRaw.meta, health: cellsRaw.health, cells: cellsRaw.cells, records }

// Integrity: the records we just read must be the records the run measured.
if (records.length > 0 && readDigest !== run.meta.recordsDigest) {
  console.error(
    `games.jsonl digest ${readDigest} != cells.json recordsDigest ${run.meta.recordsDigest} — ` +
      'the JSONL and the aggregate are from different runs.',
  )
  process.exit(2)
}
console.log(
  `run ${runDir}: ${run.meta.gamesTotal} games · ${run.cells.length} cells · ${records.length} records read · ` +
    `digest ${readDigest} ${records.length > 0 ? '(matches)' : '(no records)'}`,
)
if (!run.health.ok) console.error('WARNING: this run FAILED its BOT_LAB.md §4.3 health gate; see below.')

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

// --- the exploitability search (BOT_LAB.md §5.7) ------------------------------------------------
async function engineHash() {
  const parts = []
  async function walk(dir) {
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((x, y) => (x.name < y.name ? -1 : 1))) {
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.name.endsWith('.ts')) parts.push(`${p.slice(ROOT.length)}\n${await readFile(p, 'utf8')}`)
    }
  }
  await walk(join(ROOT, 'lib', 'engine'))
  return sha256(parts.join('\n'))
}

function runOne(style) {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [join(HERE, 'style-exploit-worker.mjs'), style], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    let out = ''
    child.stdout.on('data', (d) => {
      out += d
    })
    child.on('error', rej)
    child.on('close', (code) => {
      if (code !== 0) rej(new Error(`exploit worker for ${style} exited ${code}`))
      else res(JSON.parse(out))
    })
  })
}

const styles = run.meta.config.styles
let exploitability = []
if (opt.noExploit === 'true') {
  exploitability = styles.map((s) => skippedExploitability(s, '--noExploit: search deliberately not run'))
  console.log('exploitability: SKIPPED by flag — criterion 4 will be undetermined and no verdict can be "dominant"')
} else {
  const eHash = await engineHash()
  const cache = cachePath && existsSync(cachePath) ? JSON.parse(await readFile(cachePath, 'utf8')) : { entries: {} }
  const hits = []
  const misses = []
  const stale = []
  for (const s of styles) {
    if (holdout.includes(s)) continue
    const key = { paramsHash: sha256(JSON.stringify(STYLE_ROSTER[s])), engineHash: eHash }
    const c = cache.entries[s]
    if (c && c.paramsHash === key.paramsHash && c.engineHash === key.engineHash) hits.push(s)
    else if (c) stale.push(s)
    else misses.push(s)
  }
  console.log(
    `exploitability cache ${cachePath ?? '(none)'}: ${hits.length} valid · ${stale.length} INVALID ` +
      `(policy or engine changed since the cache was written)${stale.length ? `: ${stale.join(', ')}` : ''} · ` +
      `${misses.length} never searched${misses.length ? `: ${misses.join(', ')}` : ''}`,
  )
  const todo = [...stale, ...misses]
  const t0 = Date.now()
  const fresh = {}
  for (let i = 0; i < todo.length; i += exploitWorkers) {
    const slice = todo.slice(i, i + exploitWorkers)
    const done = await Promise.all(slice.map(runOne))
    slice.forEach((s, k) => {
      fresh[s] = done[k]
    })
  }
  if (todo.length > 0) {
    console.log(`exploitability: searched ${todo.length} target(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  }
  exploitability = styles.map((s) => {
    if (holdout.includes(s)) {
      return skippedExploitability(
        s,
        'holdout roster — BOT_LAB.md §5.8: tuning against a holdout destroys it as a holdout',
      )
    }
    return fresh[s] ?? cache.entries[s].entry
  })
  if (cachePath) {
    const entries = { ...cache.entries }
    for (const s of Object.keys(fresh)) {
      entries[s] = {
        paramsHash: sha256(JSON.stringify(STYLE_ROSTER[s])),
        engineHash: eHash,
        writtenAt: new Date().toISOString(),
        entry: fresh[s],
      }
    }
    await mkdir(dirname(cachePath), { recursive: true })
    await writeFile(cachePath, JSON.stringify({ version: 1, entries }, null, 2), 'utf8')
    console.log(`wrote ${cachePath}`)
  }
}

// --- step 3: analyze ----------------------------------------------------------------------------
const input = {
  run,
  rulesText,
  rulesFile,
  engineCommit,
  generatedAt: new Date().toISOString(),
  exploitability,
  synthetic: false,
  notice: '',
  options: {
    alpha: Number(opt.alpha ?? 0.05),
    cyclicThreshold: Number(opt.cyclicThreshold ?? 0.15),
    bootstrapSamples,
    bootstrapSeed: opt.bootstrapSeed ?? 'lab-bootstrap-v1',
    holdout,
    exploitabilityMargin: Number(opt.exploitabilityMargin ?? 0.02),
  },
}
const t1 = Date.now()
const analysis = analyze(input)
const results = buildStyleResults(input, analysis, rulesHash(rulesText))
console.log(`analysis: ${((Date.now() - t1) / 1000).toFixed(1)}s`)

// BOT_LAB.md §7.1's `replays[]` is a site concern, so `buildStyleResults` leaves it empty and
// `scripts/style-replays.mjs` fills it from games this run actually played — each one checked
// against its own `LabGameRecord` before it is written.
if (opt.replays) {
  const replays = JSON.parse(await readFile(resolve(process.cwd(), opt.replays), 'utf8'))
  results.replays = replays
  console.log(`replays: merged ${replays.length} captured game(s)`)
}

// --- step 4: emit --------------------------------------------------------------------------------
const report = renderAnalysis(results, analysis)
await writeFile(join(runDir, 'analysis.txt'), report + '\n', 'utf8')
await writeFile(join(runDir, 'style-results.json'), JSON.stringify(results, null, 2), 'utf8')
if (opt.emit !== 'false') {
  await mkdir(dirname(emitPath), { recursive: true })
  await writeFile(emitPath, JSON.stringify(results, null, 2), 'utf8')
}

console.log('')
console.log(report)
console.log('')
console.log(`wrote ${join(runDir, 'analysis.txt')} · ${join(runDir, 'style-results.json')}`)
if (opt.emit !== 'false') console.log(`wrote ${emitPath}`)
process.exit(run.health.ok ? 0 : 1)
