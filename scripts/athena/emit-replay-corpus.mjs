/**
 * emit-replay-corpus.mjs: ATHENA P0's oracle emitter (ATHENA.md §4.2, §4.5 item 1, §4.6 G0a (i)).
 *
 *     node scripts/athena/emit-replay-corpus.mjs [--population H1,H2,H3,H4,H5] [--games N] [--from K]
 *         [--out DIR] [--workers 1..4] [--allow-dirty] [--no-repo-manifest] [--force]
 *
 * Plays §4.6's five populations on the reference engine and writes one `athena-replay-1` record per game
 * (`scripts/athena/replay-format.md`): the seed, start seat, population, revision and rules hash, and for every
 * step the action, the rolling state digest, the legal-move digest, the acting seat's view digest, and at every
 * tenth step four probe verdicts.
 *
 * | pop | games | seeds (index i) | start seat | who plays |
 * |---|---:|---|---|---|
 * | H1 | 2,000 | `athena-p0-g0a-h1-<i>` | i mod 6 | `monetPolicy('v1.0')` in all six seats |
 * | H2 | 1,800 | per style (STYLE_IDS order, 200 each): the style's 4 seeds of the v0.54 forward bank, then `athena-p0-g0a-h2-<style>-<j>`, j = 0..195 | the bank's; j mod 6 | `STYLE_ROSTER[style]` in all six seats |
 * | H3 | 1,000 | deal k = floor(i/2): `athena-p0-g0a-h3-<k>`; team A = i mod 2 | 0 | v1.0 on team A, v0.33 on the other, as `duplicate-pairs.mjs` plays a pair |
 * | H4 | 4,000 | `athena-p0-g0a-h4-<i>` | `randInt(rngFromSeed(seed + ':policy'), 6)` | `us54PolicyAction` on that same generator, as `fuzz-variant.test.ts` |
 * | H5 | 2,000 | `athena-p0-g0a-h5-<i>` | i mod 6 | the mixed stub (`scripts/athena/mixed-stub.ts`) |
 *
 * Bots decide from `seatView(state, legalActionsSummary(state).seat)` with the move seed
 * `hashSeed(`${seed}:${moveIndex}`)()`, the lab's own seeding. Every game is capped at 6,000 steps; a capped game is
 * recorded as capped, never dropped.
 *
 * It REFUSES to run unless this tree reproduces the v0.54 forward bank at 36 of 36 (the derivation of
 * `tests/bots/monet.test.ts`'s `playForwardI`), and unless the tree is clean (the manifest excepted) so that the
 * recorded revision names the code that wrote the corpus. The rules hash is SHA-256 over RULES_US54.md's
 * committed blob at HEAD.
 *
 * The corpus goes OUTSIDE the repository, by default `C:/Projects/FishAI-bench/athena/corpus/<short-rev>/`, one
 * file per block: `<pop>-<from>-<to>.tsv`. The manifest there (`manifest.json`) is merged run by run, and copied to
 * `scripts/athena/corpus-manifest.json` (per block: games, steps, capped, bytes, file SHA-256, aggregate digest).
 *
 * `--from` extends a population past its registered size (§4.6: H4 in blocks of 2,000, up to 20,000 more).
 */
import { fork, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
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

/** The registered populations (§4.6) and the job size each is cut into. */
export const POPULATIONS = {
  H1: { size: 2000, chunk: 20 },
  H2: { size: 1800, chunk: 20 },
  H3: { size: 1000, chunk: 20 },
  H4: { size: 4000, chunk: 500 },
  H5: { size: 2000, chunk: 100 },
}
const H2_PER_STYLE = 200
const H2_BANK_PER_STYLE = 4
const REPO_MANIFEST = 'scripts/athena/corpus-manifest.json'
const DEFAULT_BENCH = 'C:/Projects/FishAI-bench/athena/corpus'
/** §4.1's registered blob prefixes at 7bfd3fd and the rules hash prefix. A difference is a rules change (§4.9 item 5). */
const REGISTERED_BLOBS = {
  'lib/engine/reduce.ts': 'c2d9b50a84',
  'lib/engine/helpers.ts': '8d79707c37',
  'lib/engine/cards.ts': '92b5918eb1',
  'lib/engine/rng.ts': '5a484b85ee',
  'lib/engine/deal.ts': 'abd8e8b2c4',
  'lib/engine/variants.ts': '22f1874a6b',
  'lib/engine/views.ts': 'cf155513b1',
  'lib/engine/types.ts': '413a5eb10d',
  'lib/engine/invariants.ts': '3ed9bffe17',
}
const REGISTERED_RULES_HASH = 'e9311958e811b7bc'

/* ------------------------------------------------------------------ the games --- */

let LIBS = null
async function libs() {
  if (LIBS) return LIBS
  const ENG = await imp('lib/engine/index.ts')
  const BOTS = await imp('lib/engine/bots/index.ts')
  const POLICY = await imp('tests/engine/policy.ts')
  const STUB = await imp('scripts/athena/mixed-stub.ts')
  const CODEC = await imp('scripts/athena/replay-codec.ts')
  const { MONET_V054_BANK } = await imp('tests/bots/data/monet-v054-bank.ts')
  LIBS = {
    ENG,
    BOTS,
    POLICY,
    STUB,
    CODEC,
    BANK: MONET_V054_BANK,
    V10: BOTS.monetPolicy('v1.0'),
    V033: BOTS.monetPolicy('v0.33'),
  }
  return LIBS
}

/** Game `i` of population `pop`: its seed, start seat, driver label, and a fresh action function. */
export function gameSpec(L, pop, i) {
  const { ENG, BOTS, POLICY, STUB } = L
  const botAct = (seed, policyFor) => (s, obs) =>
    BOTS.decide(obs.view, policyFor(obs.acting), ENG.hashSeed(`${seed}:${s.moveIndex}`)())
  switch (pop) {
    case 'H1': {
      const seed = `athena-p0-g0a-h1-${i}`
      return { seed, startSeat: i % 6, driver: 'monet:v1.0', act: botAct(seed, () => L.V10) }
    }
    case 'H2': {
      const style = BOTS.STYLE_IDS[Math.floor(i / H2_PER_STYLE)]
      if (!style) throw new Error(`H2 has ${BOTS.STYLE_IDS.length * H2_PER_STYLE} games; index ${i} is past it`)
      const policy = BOTS.STYLE_ROSTER[style]
      const j = i % H2_PER_STYLE
      if (j < H2_BANK_PER_STYLE) {
        const row = L.BANK.games.filter((g) => g.table === style)[j]
        if (!row || row.seed !== `monet-v054-${style}-${j}`) throw new Error(`the v0.54 bank has no row ${style}/${j}`)
        return { seed: row.seed, startSeat: row.startSeat, driver: `style:${style}:bank`, act: botAct(row.seed, () => policy) }
      }
      const seed = `athena-p0-g0a-h2-${style}-${j - H2_BANK_PER_STYLE}`
      return { seed, startSeat: (j - H2_BANK_PER_STYLE) % 6, driver: `style:${style}`, act: botAct(seed, () => policy) }
    }
    case 'H3': {
      const deal = Math.floor(i / 2)
      const teamA = i % 2
      const seed = `athena-p0-g0a-h3-${deal}`
      return {
        seed,
        startSeat: 0,
        driver: `pair:a=v1.0,b=v0.33,teamA=${teamA}`,
        act: botAct(seed, (seat) => (ENG.seatTeam(seat) === teamA ? L.V10 : L.V033)),
      }
    }
    case 'H4': {
      const seed = `athena-p0-g0a-h4-${i}`
      const rng = ENG.rngFromSeed(`${seed}:policy`)
      const startSeat = ENG.randInt(rng, 6)
      return { seed, startSeat, driver: 'fuzz:us54PolicyAction', act: (s) => POLICY.us54PolicyAction(s, rng) }
    }
    case 'H5': {
      const seed = `athena-p0-g0a-h5-${i}`
      const rng = STUB.mixedStubRng(seed)
      return { seed, startSeat: i % 6, driver: 'stub:mixed', act: (s, obs) => STUB.mixedStubAction(s, obs.acting, rng) }
    }
    default:
      throw new Error(`unknown population ${pop}`)
  }
}

/** Play one game into a record. */
export function playRecord(L, spec) {
  const rec = new L.CODEC.GameRecorder(spec.seed, spec.startSeat)
  while (rec.state.phase !== 'finished' && rec.steps < L.CODEC.STEP_CAP) {
    const obs = rec.observe()
    rec.apply(spec.act(rec.state, obs))
  }
  rec.finish()
  return rec
}

/* --------------------------------------------------------------------- worker --- */

async function workerMain() {
  const L = await libs()
  process.on('message', (job) => {
    if (job.type === 'exit') process.exit(0)
    try {
      const t0 = Date.now()
      const lines = []
      const games = []
      for (let i = job.from; i < job.to; i++) {
        const spec = gameSpec(L, job.pop, i)
        const rec = playRecord(L, spec)
        const meta = { population: job.pop, index: i, driver: spec.driver, revision: job.revision, rulesHash: job.rulesHash }
        const line = L.CODEC.recordLine(rec, meta)
        lines.push(line)
        games.push({ index: i, seed: spec.seed, steps: rec.steps, end: rec.end, game: line.slice(line.lastIndexOf('\t') + 1) })
      }
      fs.writeFileSync(job.file, lines.join('\n') + '\n')
      process.send({ type: 'done', id: job.id, games, ms: Date.now() - t0 })
    } catch (e) {
      process.send({ type: 'error', id: job.id, message: e && e.stack ? e.stack : String(e) })
    }
  })
  process.send({ type: 'ready' })
}

/* --------------------------------------------------------------------- parent --- */

function git(...args) {
  return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'buffer', maxBuffer: 1 << 26 })
}

export function treeInfo() {
  const revision = git('rev-parse', 'HEAD').toString().trim()
  const status = git('status', '--porcelain')
    .toString()
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.endsWith(REPO_MANIFEST))
  const rulesHash = createHash('sha256').update(git('cat-file', 'blob', `${revision}:RULES_US54.md`)).digest('hex')
  const engine = {}
  for (const f of Object.keys(REGISTERED_BLOBS)) engine[f] = git('rev-parse', `${revision}:${f}`).toString().trim()
  return { revision, short: revision.slice(0, 7), dirty: status, rulesHash, engine }
}

/** The v0.54 forward bank, replayed exactly as `tests/bots/monet.test.ts`'s playForwardI does. */
async function bankCheck(L) {
  const { ENG, BOTS, BANK } = L
  const { canonicalAction, ActionDigest } = await imp('tests/bots/action-digest.ts')
  const arm = BOTS.monetPolicy('v0.54')
  let ok = 0
  let decisions = 0
  const bad = []
  for (const row of BANK.games) {
    const policy = BOTS.STYLE_ROSTER[row.table]
    let s = ENG.newGame(row.seed, ENG.us54Config, row.startSeat)
    const d = new ActionDigest()
    let steps = 0
    while (s.phase !== 'finished') {
      if (steps >= 5000) throw new Error(`${row.table}/${row.seed}: hit the 5000-step cap`)
      const { seat } = ENG.legalActionsSummary(s)
      const view = ENG.seatView(s, seat)
      const moveSeed = ENG.hashSeed(`${row.seed}:${s.moveIndex}`)()
      d.push(canonicalAction(BOTS.decide(view, arm, moveSeed)))
      const r = ENG.reduce(s, BOTS.decide(view, policy, moveSeed))
      if (!r.ok) throw new Error(`${row.table}/${row.seed} step ${steps}: ${r.error.code}`)
      s = r.state
      steps++
    }
    decisions += d.count
    if (d.count === row.decisions && d.hex() === row.digest) ok++
    else bad.push(`${row.seed}: ${d.count} ${d.hex()} vs ${row.decisions} ${row.digest}`)
  }
  return { ok, of: BANK.games.length, decisions, bankDecisions: BANK.totalDecisions, bad }
}

function fileSha256(file) {
  const h = createHash('sha256')
  const fd = fs.openSync(file, 'r')
  const buf = Buffer.alloc(1 << 22)
  let n
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n))
  fs.closeSync(fd)
  return h.digest('hex')
}

async function parentMain() {
  const t0 = Date.now()
  const pops = (argOf('--population', 'H1,H2,H3,H4,H5') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  for (const p of pops) if (!POPULATIONS[p]) throw new Error(`--population: unknown ${p} (H1..H5)`)
  const from = Number(argOf('--from', 0))
  const gamesArg = argOf('--games', '')
  const workers = Number(argOf('--workers', 4))
  if (!Number.isInteger(workers) || workers < 1 || workers > 4) {
    console.error(`--workers must be 1..4 (at most 4 processes); got ${argOf('--workers', '')}`)
    process.exit(2)
  }
  if (!Number.isInteger(from) || from < 0) throw new Error('--from must be a non-negative integer')
  if (from > 0 && pops.length !== 1) throw new Error('--from extends one population at a time')

  const tree = treeInfo()
  console.log(`=== ATHENA P0 replay corpus: revision ${tree.revision}, Node ${process.versions.node}, ${os.cpus()[0]?.model ?? 'cpu'} ===`)
  console.log(`rules hash (SHA-256 of RULES_US54.md at HEAD): ${tree.rulesHash}`)
  if (!tree.rulesHash.startsWith(REGISTERED_RULES_HASH))
    console.log(`!!! the rules hash is not §4.1's registered ${REGISTERED_RULES_HASH}...: RULES_US54.md changed (§4.9 item 5)`)
  for (const [f, blob] of Object.entries(tree.engine))
    if (!blob.startsWith(REGISTERED_BLOBS[f])) console.log(`!!! ${f} is blob ${blob.slice(0, 10)}, §4.1 registered ${REGISTERED_BLOBS[f]}: a rules change (§4.9 item 5)`)
  if (tree.dirty.length > 0) {
    if (!has('--allow-dirty')) {
      console.error(`REFUSING: the tree is dirty, so revision ${tree.short} would not name the code that wrote the corpus:\n  ${tree.dirty.join('\n  ')}`)
      process.exit(2)
    }
    console.log(`(--allow-dirty: ${tree.dirty.length} uncommitted paths; the manifest records dirty: true)`)
  }

  const L = await libs()
  const tb = Date.now()
  const bank = await bankCheck(L)
  console.log(`bank check: ${bank.ok} of ${bank.of} v0.54 forward-bank games reproduce their digest; ${bank.decisions} decisions (bank ${bank.bankDecisions}); ${((Date.now() - tb) / 1000).toFixed(1)} s`)
  if (bank.ok !== bank.of || bank.decisions !== bank.bankDecisions) {
    for (const b of bank.bad) console.error(`  MISMATCH ${b}`)
    console.error('REFUSING: the reference does not reproduce the v0.54 forward bank at 36 of 36 (§4.9 item 2: the reference is broken)')
    process.exit(2)
  }

  const out = resolve(argOf('--out', `${DEFAULT_BENCH}/${tree.short}`))
  fs.mkdirSync(join(out, 'parts'), { recursive: true })
  const blocks = []
  for (const pop of pops) {
    const size = POPULATIONS[pop].size
    const n = gamesArg ? Number(gamesArg) : from > 0 ? 2000 : size
    if (!Number.isInteger(n) || n < 1) throw new Error('--games must be a positive integer')
    if (pop !== 'H4' && from + n > size) throw new Error(`${pop} has ${size} registered games; [${from}, ${from + n}) is past it`)
    const file = join(out, `${pop}-${from}-${from + n}.tsv`)
    if (fs.existsSync(file) && !has('--force')) throw new Error(`${file} exists; --force to overwrite`)
    blocks.push({ pop, from, to: from + n, file, games: new Array(n) })
  }
  const jobs = []
  for (const b of blocks) {
    const chunk = POPULATIONS[b.pop].chunk
    for (let a = b.from; a < b.to; a += chunk) {
      const z = Math.min(b.to, a + chunk)
      jobs.push({ type: 'job', id: jobs.length, pop: b.pop, from: a, to: z, block: b, file: join(out, 'parts', `${b.pop}-${a}-${z}.tsv`) })
    }
  }
  // heavy jobs first, so the light ones fill the tail
  const weight = { H1: 0, H3: 1, H2: 2, H5: 3, H4: 4 }
  const queue = [...jobs].sort((x, y) => weight[x.pop] - weight[y.pop] || x.from - y.from)
  const totalGames = blocks.reduce((n, b) => n + (b.to - b.from), 0)
  console.log(`emitting ${totalGames} games in ${jobs.length} jobs on ${workers} worker processes into ${out}`)

  const te = Date.now()
  let doneGames = 0
  let doneSteps = 0
  let lastPrint = Date.now()
  await new Promise((resolveAll, rejectAll) => {
    let live = 0
    let failed = false
    const procs = []
    const next = (w) => {
      const job = queue.shift()
      if (!job) {
        w.send({ type: 'exit' })
        return
      }
      w.job = job
      const { block: _b, ...wire } = job
      void _b
      w.send({ ...wire, revision: tree.revision, rulesHash: tree.rulesHash })
    }
    for (let k = 0; k < workers; k++) {
      const w = fork(HERE, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
      procs.push(w)
      live++
      w.on('message', (m) => {
        if (m.type === 'ready') return next(w)
        if (m.type === 'error') {
          failed = true
          for (const p of procs) p.kill()
          return rejectAll(new Error(`worker failed on ${w.job.pop} [${w.job.from}, ${w.job.to}):\n${m.message}`))
        }
        const job = w.job
        for (const g of m.games) {
          job.block.games[g.index - job.block.from] = g
          doneGames++
          doneSteps += g.steps
        }
        if (Date.now() - lastPrint > 15000) {
          lastPrint = Date.now()
          console.log(`  ${doneGames}/${totalGames} games, ${doneSteps} steps, ${((Date.now() - te) / 1000).toFixed(0)} s`)
        }
        next(w)
      })
      w.on('exit', (code) => {
        live--
        if (code !== 0 && !failed) {
          failed = true
          for (const p of procs) p.kill()
          rejectAll(new Error(`a worker exited with code ${code}`))
        }
        if (live === 0 && !failed) resolveAll()
      })
    }
  })
  const emitSeconds = (Date.now() - te) / 1000

  // assemble each block's file in index order, then its manifest entry
  const manifestPath = join(out, 'manifest.json')
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null
  if (manifest && manifest.revision !== tree.revision) throw new Error(`${manifestPath} is for revision ${manifest.revision}, not ${tree.revision}`)
  const M = manifest ?? {
    format: L.CODEC.FORMAT,
    spec: 'scripts/athena/replay-format.md',
    registration: 'ATHENA.md §4.6 G0a (i)',
    revision: tree.revision,
    dirty: tree.dirty.length > 0,
    rulesFile: 'RULES_US54.md',
    rulesHash: tree.rulesHash,
    engineBlobs: tree.engine,
    bankCheck: null,
    corpusDir: out.replace(/\\/g, '/'),
    blocks: {},
    runs: [],
  }
  M.dirty = M.dirty || tree.dirty.length > 0
  M.bankCheck = { bank: 'tests/bots/data/monet-v054-bank.ts', arm: 'monetPolicy("v0.54")', reproduced: bank.ok, of: bank.of, decisions: bank.decisions }
  for (const b of blocks) {
    const parts = jobs.filter((j) => j.block === b)
    fs.writeFileSync(b.file, '')
    for (const j of parts) fs.appendFileSync(b.file, fs.readFileSync(j.file))
    for (const j of parts) fs.unlinkSync(j.file)
    const games = b.games
    if (games.some((g) => !g)) throw new Error(`${b.pop}: a game is missing from the assembled block`)
    const entry = {
      population: b.pop,
      from: b.from,
      to: b.to,
      file: b.file.replace(/\\/g, '/').split('/').pop(),
      games: games.length,
      steps: games.reduce((n, g) => n + g.steps, 0),
      capped: games.filter((g) => g.end === 'capped').length,
      bytes: fs.statSync(b.file).size,
      sha256: fileSha256(b.file),
      aggregate: L.CODEC.aggregateDigest(games.map((g) => g.game)),
    }
    if (b.pop === 'H2') {
      const bankSteps = {}
      for (const g of games) if (g.seed.startsWith('monet-v054-')) bankSteps[g.seed] = g.steps
      entry.bankSeedSteps = bankSteps
    }
    M.blocks[`${b.pop}-${b.from}-${b.to}`] = entry
    console.log(`${b.pop} [${b.from}, ${b.to}): ${entry.games} games, ${entry.steps} steps, ${entry.capped} capped, ${(entry.bytes / 1e6).toFixed(1)} MB, aggregate ${entry.aggregate}`)
  }
  try {
    fs.rmdirSync(join(out, 'parts'))
  } catch {
    // parts of another run may still be there
  }
  const all = Object.values(M.blocks)
  M.total = {
    blocks: all.length,
    games: all.reduce((n, e) => n + e.games, 0),
    steps: all.reduce((n, e) => n + e.steps, 0),
    capped: all.reduce((n, e) => n + e.capped, 0),
    bytes: all.reduce((n, e) => n + e.bytes, 0),
  }
  M.runs.push({
    date: new Date().toISOString(),
    command: `node scripts/athena/emit-replay-corpus.mjs ${argv.join(' ')}`.trim(),
    blocks: blocks.map((b) => `${b.pop}-${b.from}-${b.to}`),
    workers,
    node: process.versions.node,
    cpu: os.cpus()[0]?.model ?? 'cpu',
    bankCheckSeconds: Number(((te - tb) / 1000).toFixed(1)),
    emitSeconds: Number(emitSeconds.toFixed(1)),
    wallSeconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
  })
  fs.writeFileSync(manifestPath, JSON.stringify(M, null, 2) + '\n')
  if (!has('--no-repo-manifest')) fs.writeFileSync(join(ROOT, REPO_MANIFEST), JSON.stringify(M, null, 2) + '\n')
  console.log(`done: ${totalGames} games in ${emitSeconds.toFixed(1)} s of emission (${((Date.now() - t0) / 1000).toFixed(1)} s wall with the bank check); manifest ${manifestPath}${has('--no-repo-manifest') ? '' : ` and ${REPO_MANIFEST}`}`)
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
