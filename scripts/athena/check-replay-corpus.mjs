/**
 * check-replay-corpus.mjs: the reference self-check of ATHENA P0's replay corpus (ATHENA.md §4.2, §4.5 item 3,
 * §4.6 G0a (i)), and the branch-coverage report the Rust port's checker will mirror.
 *
 *     node scripts/athena/check-replay-corpus.mjs [--corpus DIR] [--workers 1..4] [--population H1,...]
 *         [--max-games N] [--write] [--json FILE]
 *
 * Every record is replayed through the TypeScript reducer from its seed, start seat and ACTIONS ALONE; every
 * digest is recomputed (the deal, the rolling state digest d_t, the legal-move digest l_t, the view digest v_t, the
 * probe verdicts, the game digest) and compared with what the emitter wrote. The reference must match itself at
 * 100%: anything less is a bug in the emitter, the codec or the corpus file, never a rules finding.
 *
 * It also reports, per population:
 * - the branch census of §4.6's floor table, every row, including the two rows marked "not counted today" and the
 *   row its 2026-09-19 amendment added, "a declare by the window's last seat (declined = 5)" (counted by the codec's
 *   `classifyStep`; the Rust port's `replay-check` prints the same table, line for line);
 * - capped games (G0a: none in H1-H3 or H5);
 * - finished games whose clinch did not fire, i.e. the `resolved === 9` terminator alone (must be 0), and the
 *   5-4 finishes where the two coincide (information);
 * - that H2's 36 v0.54-bank games took exactly the bank's decision counts in steps;
 * - each block's aggregate digest against the manifest, and the file headers' revision and rules hash;
 * - information only: probes whose accept/refuse agreed but whose error code differed, and the steps at which
 *   `legalActionsSummary`'s kinds differ from L_t's reducer-verdict kinds.
 *
 * `--write` merges `selfCheck` and `coverage` into the corpus manifest and `scripts/athena/corpus-manifest.json`.
 * Exit 0: everything held, floors included. 1: an integrity failure. 3: integrity held but a floor is short.
 */
import { execFileSync, fork } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import readline from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(HERE), '../..')
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href)
const argv = process.argv.slice(2)
const argOf = (flag, dflt) => {
  const i = argv.indexOf(flag)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt
}
const has = (flag) => argv.includes(flag)
const REPO_MANIFEST = 'scripts/athena/corpus-manifest.json'
const DEFAULT_BENCH = 'C:/Projects/FishAI-bench/athena/corpus'
/** Populations registered at these sizes; an H4 block past index 4,000 is an extension (§4.6) and reported apart. */
const REGISTERED_SIZE = { H1: 2000, H2: 1800, H3: 1000, H4: 4000, H5: 2000 }
const KIND_BIT = { ask: 1, claim: 2, pass: 4, decline: 8, designate: 16 }

function groupOf(rec) {
  return rec.population === 'H4' && rec.index >= REGISTERED_SIZE.H4 ? 'H4x' : rec.population
}

/* --------------------------------------------------------------------- worker --- */

async function workerMain() {
  const C = await imp('scripts/athena/replay-codec.ts')
  const { legalActionsSummary } = await imp('lib/engine/helpers.ts')
  const { MONET_V054_BANK } = await imp('tests/bots/data/monet-v054-bank.ts')
  const bankSteps = new Map(MONET_V054_BANK.games.map((g) => [g.seed, g.decisions]))
  process.on('message', (m) => {
    if (m.type === 'exit') process.exit(0)
    try {
      const groups = {}
      const games = []
      const bad = []
      for (const line of m.lines) {
        const rec = C.parseLine(line)
        const g = groupOf(rec)
        const t = (groups[g] ??= {})
        const inc = (k, n = 1) => (t[k] = (t[k] ?? 0) + n)
        const hook = (pre, action, post, events, obs) => {
          C.classifyStep(t, pre, action, post, events, obs.kinds)
          if ((obs.kinds & KIND_BIT[action.type]) === 0) inc('actionKindNotInL')
          const summary = legalActionsSummary(pre).kinds.reduce((b, k) => b | KIND_BIT[k], 0)
          if (summary !== obs.kinds) {
            const onlyClaim = (summary ^ obs.kinds) === C.KIND_CLAIM && (summary & C.KIND_CLAIM) !== 0
            inc(onlyClaim && !pre.declareWindow && pre.phase === 'playing' ? 'summaryClaimWindowClosed' : 'summaryOtherDiff')
          }
        }
        const r = C.replayRecord(rec, { hook })
        C.classifyEnd(t, r.final, r.end)
        inc('probeVerdicts', rec.probes.length)
        inc('probeAccepted', rec.probes.reduce((n, x) => n + (x === 0 ? 1 : 0), 0))
        inc('codeDiffs', r.codeDiffs)
        if (r.ok) inc('recordsOk')
        else {
          inc('recordsBad')
          for (const w of new Set(r.mismatches.map((x) => x.what))) inc(`mismatch:${w}`)
          if (bad.length < 20) bad.push({ file: m.file, index: rec.index, seed: rec.seed, mismatches: r.mismatches.slice(0, 6) })
        }
        if (rec.revision !== m.revision) inc('headerRevisionDiffers')
        if (rec.rulesHash !== m.rulesHash) inc('headerRulesHashDiffers')
        if (bankSteps.has(rec.seed)) {
          inc('bankSeeds')
          if (rec.steps !== bankSteps.get(rec.seed) || r.steps !== bankSteps.get(rec.seed)) {
            inc('bankSeedStepMismatch')
            if (bad.length < 20) bad.push({ file: m.file, index: rec.index, seed: rec.seed, mismatches: [{ what: 'bank', at: rec.steps, detail: `steps ${rec.steps}, the v0.54 bank has ${bankSteps.get(rec.seed)} decisions` }] })
          }
        }
        games.push([rec.index, r.game || `!${rec.game}`])
      }
      process.send({ type: 'done', id: m.id, groups, games, bad })
    } catch (e) {
      process.send({ type: 'error', id: m.id, message: e && e.stack ? e.stack : String(e) })
    }
  })
  process.send({ type: 'ready' })
}

/* --------------------------------------------------------------------- parent --- */

function pad(s, n, right = false) {
  s = String(s)
  return right ? s.padStart(n) : s.padEnd(n)
}

async function parentMain() {
  const t0 = Date.now()
  const C = await imp('scripts/athena/replay-codec.ts')
  const workers = Number(argOf('--workers', 4))
  if (!Number.isInteger(workers) || workers < 1 || workers > 4) {
    console.error('--workers must be 1..4 (at most 4 processes)')
    process.exit(2)
  }
  const revision = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const rulesHashNow = createHash('sha256')
    .update(execFileSync('git', ['-C', ROOT, 'cat-file', 'blob', 'HEAD:RULES_US54.md']))
    .digest('hex')
  const repoManifestPath = join(ROOT, REPO_MANIFEST)
  const repoManifest = fs.existsSync(repoManifestPath) ? JSON.parse(fs.readFileSync(repoManifestPath, 'utf8')) : null
  const corpus = resolve(argOf('--corpus', repoManifest?.corpusDir ?? `${DEFAULT_BENCH}/${revision.slice(0, 7)}`))
  const manifestPath = join(corpus, 'manifest.json')
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null
  const pops = argOf('--population', '') ? argOf('--population', '').split(',').map((s) => s.trim().toUpperCase()) : null
  const maxGames = Number(argOf('--max-games', 0))
  const files = fs
    .readdirSync(corpus)
    .filter((f) => /^H\d-\d+-\d+\.tsv$/.test(f))
    .filter((f) => !pops || pops.includes(f.split('-')[0]))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  if (files.length === 0) throw new Error(`no corpus files in ${corpus}`)
  const expectRevision = manifest?.revision ?? revision
  const expectRules = manifest?.rulesHash ?? rulesHashNow
  console.log(`=== ATHENA P0 replay self-check: ${corpus} ===`)
  console.log(`corpus revision ${expectRevision}${manifest ? '' : ' (no manifest: HEAD assumed)'}; checked at HEAD ${revision}; Node ${process.versions.node}; ${workers} worker processes`)
  console.log(`rules hash: corpus ${expectRules}, HEAD ${rulesHashNow} ${expectRules === rulesHashNow ? '(equal)' : '(DIFFERENT: RULES_US54.md changed since emission)'}`)

  const groups = {}
  const gamesByFile = {}
  const bad = []
  let sentLines = 0
  let doneLines = 0
  let lastPrint = Date.now()
  const procs = []
  const idle = []
  const waiters = []
  let failure = null
  const giveIdle = (w) => {
    const r = waiters.shift()
    if (r) r(w)
    else idle.push(w)
  }
  const getIdle = () => (idle.length ? Promise.resolve(idle.shift()) : new Promise((r) => waiters.push(r)))
  let nextId = 0
  const inflight = new Map()
  await Promise.all(
    Array.from({ length: workers }, () => {
      const w = fork(HERE, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
      procs.push(w)
      return new Promise((ready) => {
        w.on('message', (m) => {
          if (m.type === 'ready') {
            ready()
            return giveIdle(w)
          }
          const job = inflight.get(m.id)
          inflight.delete(m.id)
          if (m.type === 'error') {
            failure = new Error(`worker failed on ${job.file}:\n${m.message}`)
            for (const p of procs) p.kill()
            for (const r of waiters.splice(0)) r(null)
            return
          }
          for (const [g, t] of Object.entries(m.groups)) C.mergeTally((groups[g] ??= {}), t)
          ;(gamesByFile[job.file] ??= []).push(...m.games)
          bad.push(...m.bad)
          doneLines += m.games.length
          if (Date.now() - lastPrint > 15000) {
            lastPrint = Date.now()
            console.log(`  ${doneLines} records checked, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
          }
          giveIdle(w)
        })
      })
    }),
  )
  const dispatch = async (file, lines) => {
    const w = await getIdle()
    if (!w || failure) throw failure
    const id = nextId++
    inflight.set(id, { file })
    sentLines += lines.length
    w.send({ type: 'job', id, file, lines, revision: expectRevision, rulesHash: expectRules })
  }
  for (const file of files) {
    const rl = readline.createInterface({ input: fs.createReadStream(join(corpus, file)), crlfDelay: Infinity })
    let batch = []
    let bytes = 0
    let n = 0
    for await (const line of rl) {
      if (!line) continue
      if (maxGames && n >= maxGames) break
      n++
      batch.push(line)
      bytes += line.length
      if (batch.length >= 200 || bytes > 1_500_000) {
        await dispatch(file, batch)
        batch = []
        bytes = 0
      }
    }
    rl.close()
    if (batch.length) await dispatch(file, batch)
  }
  while (inflight.size > 0 && !failure) await new Promise((r) => setTimeout(r, 50))
  for (const p of procs) p.send({ type: 'exit' })
  if (failure) throw failure
  const seconds = (Date.now() - t0) / 1000

  /* ---- the report ---- */
  const order = ['H1', 'H2', 'H3', 'H4', 'H5', 'H4x'].filter((g) => groups[g])
  const sum = (k) => order.reduce((n, g) => n + (groups[g][k] ?? 0), 0)
  const integrity = []
  const games = sum('games')
  const steps = sum('steps')
  console.log(`\nrecords: ${sum('recordsOk')} of ${games} replay to every recorded digest (${steps} steps, ${sentLines} lines read, ${seconds.toFixed(1)} s)`)
  if (sum('recordsBad') > 0) integrity.push(`${sum('recordsBad')} records do not replay`)
  for (const k of ['deal', 'd', 'l', 'v', 'probe', 'refused', 'length', 'end', 'game'])
    if (sum(`mismatch:${k}`)) console.log(`  !!! ${sum(`mismatch:${k}`)} records with a ${k} mismatch`)
  console.log(`probes: ${sum('probeVerdicts')} verdicts, ${sum('probeAccepted')} accepted; accept/refuse equal in every record that replays; error codes differing where the verdict agreed: ${sum('codeDiffs')} (information)`)
  const aggregates = []
  for (const file of files) {
    const got = (gamesByFile[file] ?? []).sort((a, b) => a[0] - b[0])
    const agg = C.aggregateDigest(got.map((x) => x[1]))
    const key = file.replace(/\.tsv$/, '')
    const want = manifest?.blocks?.[key]
    const complete = want ? got.length === want.games : true
    const verdict = !want ? 'no manifest entry' : !complete ? `partial (${got.length} of ${want.games})` : agg === want.aggregate ? 'equal to the manifest' : `DIFFERS from the manifest's ${want.aggregate}`
    if (want && complete && agg !== want.aggregate) integrity.push(`${key}: aggregate differs from the manifest`)
    aggregates.push({ block: key, games: got.length, aggregate: agg, manifest: want?.aggregate ?? null, verdict })
    console.log(`  ${pad(key, 16)} ${pad(got.length, 5, true)} games  aggregate ${agg}  ${verdict}`)
  }
  if (sum('headerRevisionDiffers')) integrity.push(`${sum('headerRevisionDiffers')} records name another revision`)
  if (sum('headerRulesHashDiffers')) integrity.push(`${sum('headerRulesHashDiffers')} records name another rules hash`)
  const capLine = order.map((g) => `${g} ${groups[g].capped ?? 0}`).join(', ')
  console.log(`capped at ${C.STEP_CAP}: ${capLine}  (G0a: none in H1-H3 or H5)`)
  for (const g of ['H1', 'H2', 'H3', 'H5']) if (groups[g]?.capped) integrity.push(`${groups[g].capped} capped games in ${g}`)
  console.log(`resolved === 9 alone: ${sum('fallbackAlone')} games (must be 0); coinciding with the clinch (5-4 at the 9th set): ${sum('fallbackCoincided')}`)
  if (sum('fallbackAlone')) integrity.push('the resolved === 9 terminator fired alone')
  if (groups.H2) {
    console.log(`H2 bank seeds: ${sum('bankSeeds') - sum('bankSeedStepMismatch')} of ${sum('bankSeeds')} step counts equal the v0.54 bank's decision counts`)
    if (sum('bankSeedStepMismatch')) integrity.push('an H2 bank game differs from its bank decision count')
    if (files.includes('H2-0-1800.tsv') && !maxGames && sum('bankSeeds') !== 36)
      integrity.push(`${sum('bankSeeds')} bank seeds found in the whole of H2, not 36`)
  }
  if (sum('actionKindNotInL')) integrity.push(`${sum('actionKindNotInL')} recorded actions of a kind L_t says is illegal`)
  console.log(`legalActionsSummary vs L_t (the reducer's verdict): 'claim' listed with the us54 window closed at ${sum('summaryClaimWindowClosed')} steps; other differences ${sum('summaryOtherDiff')} (information)`)
  const cols = [...order, 'total']
  const colOf = (g, k) => (g === 'total' ? sum(k) : (groups[g][k] ?? 0))
  console.log(`\nbranch coverage, floor ${C.FLOOR} each over the corpus (§4.6):`)
  console.log(`| ${pad('branch', 58)} | ${cols.map((g) => pad(g, 8, true)).join(' | ')} | floor |`)
  console.log(`|${'-'.repeat(60)}|${cols.map(() => '-'.repeat(9) + ':').join('|')}|:---:|`)
  const rows = []
  const short = []
  for (const b of C.BRANCHES) {
    const total = sum(b.id)
    const met = total >= C.FLOOR
    if (!met) short.push(b.id)
    const label = C.NEW_BRANCH_IDS.includes(b.id) ? `${b.label} (not counted before P0)` : b.label
    rows.push({ id: b.id, label, perPopulation: Object.fromEntries(order.map((g) => [g, groups[g][b.id] ?? 0])), total, met })
    console.log(`| ${pad(label, 58)} | ${cols.map((g) => pad(colOf(g, b.id), 8, true)).join(' | ')} | ${met ? ' met ' : 'SHORT'} |`)
  }
  const info = ['finish5to1', 'finish5to2', 'finish5to3', 'games', 'steps', 'action:ask', 'action:decline', 'action:claim', 'action:pass']
  for (const k of info) console.log(`| ${pad(`(information) ${k}`, 58)} | ${cols.map((g) => pad(colOf(g, k), 8, true)).join(' | ')} |       |`)
  for (const b of bad.slice(0, 20)) console.log(`MISMATCH ${b.file} #${b.index} ${b.seed}: ${b.mismatches.map((x) => `${x.what}@${x.at} ${x.detail}`).join('; ')}`)
  for (const s of integrity) console.log(`!!! ${s}`)
  const verdict = integrity.length ? 'FAIL (integrity)' : short.length ? `floors short: ${short.join(', ')}` : 'PASS'
  console.log(`\nself-check: ${verdict}`)

  const selfCheck = {
    date: new Date().toISOString(),
    checkedAt: revision,
    command: `node scripts/athena/check-replay-corpus.mjs ${argv.join(' ')}`.trim(),
    partial: !!(pops || maxGames),
    games,
    steps,
    recordsOk: sum('recordsOk'),
    recordsBad: sum('recordsBad'),
    probeVerdicts: sum('probeVerdicts'),
    probeAccepted: sum('probeAccepted'),
    probeCodeDiffs: sum('codeDiffs'),
    capped: Object.fromEntries(order.map((g) => [g, groups[g].capped ?? 0])),
    fallbackAlone: sum('fallbackAlone'),
    fallbackCoincided: sum('fallbackCoincided'),
    bankSeeds: sum('bankSeeds'),
    bankSeedStepMismatch: sum('bankSeedStepMismatch'),
    summaryClaimWindowClosed: sum('summaryClaimWindowClosed'),
    summaryOtherDiff: sum('summaryOtherDiff'),
    aggregates,
    integrity,
    verdict,
    workers,
    seconds: Number(seconds.toFixed(1)),
    node: process.versions.node,
    cpu: os.cpus()[0]?.model ?? 'cpu',
  }
  const coverage = { floor: C.FLOOR, groups: order, rows, short }
  if (has('--json')) fs.writeFileSync(argOf('--json', 'check.json'), JSON.stringify({ selfCheck, coverage }, null, 2) + '\n')
  if (has('--write')) {
    if (!manifest) throw new Error(`--write needs ${manifestPath}`)
    manifest.selfCheck = selfCheck
    manifest.coverage = coverage
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    fs.writeFileSync(repoManifestPath, JSON.stringify(manifest, null, 2) + '\n')
    console.log(`wrote selfCheck and coverage into ${manifestPath} and ${REPO_MANIFEST}`)
  }
  process.exitCode = integrity.length ? 1 : short.length ? 3 : 0
}

if (has('--worker')) await workerMain()
else if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === HERE.toLowerCase()) {
  try {
    await parentMain()
  } catch (e) {
    console.error(e && e.stack ? e.stack : String(e))
    process.exit(1)
  }
}
