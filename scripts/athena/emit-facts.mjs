/**
 * emit-facts.mjs: the reference side of ATHENA P1's G1a checks 1-3 and G1b (ATHENA.md §8.1, §8.2).
 *
 *     node scripts/athena/emit-facts.mjs home   [--corpus DIR] [--population H1,...] [--max-games N] [--threads 1..4]
 *                                               [--out DIR]
 *     node scripts/athena/emit-facts.mjs bridge [--records DIR] [--prefix panel-sestina-] [--max-games N]
 *                                               [--threads 1..4] [--out DIR]
 *     node scripts/athena/emit-facts.mjs dump home:<file>:<index>:<step>
 *     node scripts/athena/emit-facts.mjs dump bridge:<file>:<deal>:<rot>:<ask>
 *
 * **home** replays every corpus record (`athena-replay-1`, ATHENA.md §4.2) through the reference reducer from its
 * seed, start seat and actions, and at every step t (before the action, as the corpus's v column) writes:
 * - `F`: 16 hex a step, the digest of the six seats' facts in seat order, each `buildKnowledge(seatView(S_t, s),
 *   KOPTS)` in the canonical encoding `athena-facts-1` (`facts-codec.ts`). G1a check 1.
 * - `B`: 16 hex a step, the view digest V_t of the acting seat under the bridge regime: `replay-codec.ts`'s
 *   `encodeView` with `Reveal = 'reduced'`, of the view whose log and set block the reduced reveal made
 *   (`ReducedReveal`), its log digested with the same reveal. G1b.
 * - `G`: one digest a game over the steps' acting-seat facts under the bridge regime (the facts of that view).
 *   Information: the port's facts buffer in the bridge regime.
 * - `R`: one digest a game over its window offers (the steps at which a declare window is open): per offer the step
 *   (u32 LE), then `lib/athena/policy.ts`'s `railPlan(view, factsOf(view))` for the acting seat as the set and the six
 *   stated seats in set card order, or 7 NONE bytes. G1a check 3.
 * - `info`: offers, rails, views with a constraint (of the 6 a step), wrong declares, holders the reduced reveal hid.
 *
 * One line a game: `athena-facts-home-1 pop index seed start steps F B G R info game`, where `game` digests the
 * ASCII of F, B, G, R and info. Files go to `<out>/home/<corpus file>`, and a manifest to `<out>/home/manifest.json`.
 *
 * **bridge** reads the bridge's record files with `scripts/bridge-records.mjs`'s `readRecords` and walks each game
 * with its `walkAsks`, unchanged, and at every ask writes the digest of the facts of the view `walkAsks` hands its
 * caller (the asking seat's, under the reduced reveal). One line a game: `athena-facts-bridge-1 file deal rot asks F
 * consViews`. G1a check 2.
 *
 * **dump** prints the facts of one state in words: every seat's, and the acting seat's under the bridge regime, at
 * a home step; the asking seat's at a bridge ask. It is how a divergence is located.
 *
 * At most 4 worker threads in one process (the P1 compute rule). bridge-records.mjs resolves the engine from the
 * working directory, so this script moves to the repository root first.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import readline from 'node:readline'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'

const HERE = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(HERE), '../..')
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href)

export const FORMAT_HOME = 'athena-facts-home-1'
export const FORMAT_BRIDGE = 'athena-facts-bridge-1'
const DEFAULT_CORPUS = 'C:/Projects/FishAI-bench/athena/corpus/7d85c2e'
const DEFAULT_RECORDS = 'C:/Projects/FishAI-bench/bridge/monet-v55/records'
const DEFAULT_PREFIX = 'panel-sestina-'
const DEFAULT_OUT = 'C:/Projects/FishAI-bench/athena/p1/a/facts'
/** The code whose results the lines are: recorded by blob id in the manifest. */
const REFERENCE_FILES = [
  'lib/engine/bots/knowledge.ts',
  'lib/athena/policy.ts',
  'scripts/athena/facts-codec.ts',
  'scripts/athena/replay-codec.ts',
  'scripts/athena/emit-facts.mjs',
  'scripts/bridge-records.mjs',
]

/* ------------------------------------------------------------------------------------------ the work --- */

async function loadModules() {
  const C = await imp('scripts/athena/replay-codec.ts')
  const F = await imp('scripts/athena/facts-codec.ts')
  const ENG = await imp('lib/engine/index.ts')
  const P = await imp('lib/athena/policy.ts')
  if (!F.koptsAreFactsOfs()) throw new Error('KOPTS does not resolve to factsOf options: the rail check would compare two different facts')
  return { C, F, ENG, P }
}

/** The rail's bytes at one offer: the step, then the set and its six stated seats (or NONE). */
function railBytes(M, t, plan) {
  const b = new Uint8Array(11).fill(M.C.NONE)
  b[0] = t & 0xff
  b[1] = (t >>> 8) & 0xff
  b[2] = (t >>> 16) & 0xff
  b[3] = (t >>> 24) & 0xff
  if (plan) {
    b[4] = plan.set
    M.C.SET_CARDS[plan.set].forEach((c, j) => (b[5 + j] = plan.assignments[c]))
  }
  return b
}

/**
 * Replay one corpus record and compute its columns. With `dumpStep`, return the words of that step instead.
 */
function homeGame(M, line, dumpStep = -1) {
  const { C, F, ENG, P } = M
  const rec = C.parseLine(line)
  let state = ENG.newGame(rec.seed, ENG.us54Config, rec.startSeat)
  const red = new F.ReducedReveal()
  for (const e of state.log) red.push(e)
  const w = new C.ByteWriter(1024)
  const G = new C.ByteDigest()
  const R = new C.ByteDigest()
  let Fh = ''
  let Bh = ''
  let offers = 0
  let rails = 0
  let consViews = 0
  let pos = 0
  for (let t = 0; t < rec.steps; t++) {
    const acting = ENG.legalActionsSummary(state).seat
    const d = new C.ByteDigest()
    let kAct = null
    let vAct = null
    const words = []
    for (let s = 0; s < 6; s++) {
      const view = ENG.seatView(state, s)
      const k = F.factsOfView(view)
      if (k.constraints.length > 0) consViews++
      d.push(F.encodeFacts(k))
      if (s === acting) {
        kAct = k
        vAct = view
      }
      if (t === dumpStep) words.push(F.describeFacts(k))
    }
    Fh += d.hex()
    let plan = null
    if (state.declareWindow) {
      offers++
      plan = P.railPlan(vAct, kAct)
      if (plan) rails++
      R.push(railBytes(M, t, plan))
    }
    const rv = red.view(state, acting)
    w.reset()
    C.encodeView(w, rv, red.log.length, red.logDigest.hex(), 'reduced')
    Bh += C.digestBytes(w.buf, w.n)
    const kr = F.factsOfView(rv)
    G.push(F.encodeFacts(kr))
    if (t === dumpStep) {
      return [
        `${rec.population} ${rec.index} ${rec.seed} start ${rec.startSeat}, step ${t}: acting seat ${acting}, window ${state.declareWindow ? JSON.stringify(state.declareWindow) : 'closed'}, log ${state.log.length} events`,
        ...words,
        `rail (railPlan) at this step: ${plan ? `${C.SETS[plan.set]} ${JSON.stringify(plan.assignments)}` : state.declareWindow ? 'none' : '(not a window offer)'}`,
        `bridge regime, acting seat ${acting} (V_t digest ${Bh.slice(-16)}; ${red.wrongDeclares} wrong declares so far, ${red.hiddenHolders} holders hidden):`,
        F.describeFacts(kr),
        `facts digests: ${[0, 1, 2, 3, 4, 5].map((s) => C.digestBytes(F.encodeFacts(F.factsOfView(ENG.seatView(state, s))))).join(' ')}`,
      ].join('\n')
    }
    const { action, next } = C.decodeAction(rec.actions, pos)
    pos = next
    const r = ENG.reduce(state, action)
    if (!r.ok) throw new Error(`${rec.population} ${rec.index}: step ${t} refused (${r.error.code})`)
    for (const e of r.events) red.push(e)
    state = r.state
  }
  if (dumpStep >= 0) throw new Error(`step ${dumpStep} is past the record's ${rec.steps} steps`)
  const info = `${offers}:${rails}:${consViews}:${red.wrongDeclares}:${red.hiddenHolders}`
  const Gh = G.hex()
  const Rh = R.hex()
  const game = new C.ByteDigest().pushAscii(Fh).pushAscii(Bh).pushAscii(Gh).pushAscii(Rh).pushAscii(info).hex()
  return {
    line: [FORMAT_HOME, rec.population, rec.index, rec.seed, rec.startSeat, rec.steps, Fh, Bh, Gh, Rh, info, game].join('\t'),
    population: rec.population,
    steps: rec.steps,
    offers,
    rails,
    consViews,
    wrong: red.wrongDeclares,
    hidden: red.hiddenHolders,
    game,
  }
}

/** Walk one bridge record (readRecordFile's output) and digest the facts of every ask's view. */
function bridgeGame(M, REC, rec, dumpAsk = -1) {
  const { C, F } = M
  const parts = rec.label.split(':')
  const deal = parts[parts.length - 2]
  const rot = parts[parts.length - 1]
  let Fh = ''
  let asks = 0
  let consViews = 0
  let dump = null
  REC.walkAsks(rec, ({ i, view }) => {
    if (view.log.length !== i) throw new Error(`${rec.label}: the view at event ${i} has a log of ${view.log.length}`)
    const k = F.factsOfView(view)
    if (k.constraints.length > 0) consViews++
    Fh += C.digestBytes(F.encodeFacts(k))
    if (asks === dumpAsk) dump = `${rec.label} ask ${asks} (event ${i}), seat ${view.seat}:\n${F.describeFacts(k)}\ndigest ${Fh.slice(-16)}`
    asks++
  })
  if (dumpAsk >= 0) return dump ?? `${rec.label}: no ask ${dumpAsk} (${asks} asks)`
  return {
    line: [FORMAT_BRIDGE, rec.file, deal, rot, asks, Fh, consViews].join('\t'),
    asks,
    consViews,
  }
}

/* ---------------------------------------------------------------------------------------- the worker --- */

async function workerMain() {
  const M = await loadModules()
  const REC = workerData.kind === 'bridge' ? await imp('scripts/bridge-records.mjs') : null
  parentPort.on('message', (m) => {
    try {
      if (m.type === 'home') {
        const out = m.lines.map((line) => homeGame(M, line))
        parentPort.postMessage({ type: 'done', id: m.id, out })
      } else if (m.type === 'bridge') {
        const out = []
        for (const rec of REC.readRecordFile(m.file)) {
          if (m.max > 0 && out.length >= m.max) break
          out.push(bridgeGame(M, REC, rec))
        }
        parentPort.postMessage({ type: 'done', id: m.id, out })
      } else if (m.type === 'exit') process.exit(0)
    } catch (e) {
      parentPort.postMessage({ type: 'error', id: m.id, message: e && e.stack ? e.stack : String(e) })
    }
  })
  parentPort.postMessage({ type: 'ready' })
}

/* ---------------------------------------------------------------------------------------- the parent --- */

const argv = process.argv.slice(2)
const argOf = (flag, dflt) => {
  const i = argv.indexOf(flag)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt
}

/** A pool of worker threads that runs jobs and hands back results in submission order. */
async function pool(kind, n) {
  const workers = []
  const idle = []
  const waiters = []
  const pending = new Map()
  let failure = null
  let nextId = 0
  await Promise.all(
    Array.from({ length: n }, () => {
      const w = new Worker(HERE, { workerData: { kind } })
      workers.push(w)
      return new Promise((ready, fail) => {
        w.on('error', (e) => {
          failure = e
          fail(e)
          for (const r of waiters.splice(0)) r(null)
        })
        w.on('message', (m) => {
          if (m.type === 'ready') {
            ready()
          } else {
            const job = pending.get(m.id)
            pending.delete(m.id)
            if (m.type === 'error') {
              failure = new Error(`a worker failed:\n${m.message}`)
              job.reject(failure)
            } else job.resolve(m.out)
          }
          const r = waiters.shift()
          if (r) r(w)
          else idle.push(w)
        })
      })
    }),
  )
  const get = () => (idle.length ? Promise.resolve(idle.shift()) : new Promise((r) => waiters.push(r)))
  return {
    async submit(msg) {
      const w = await get()
      if (failure || !w) throw failure ?? new Error('the pool failed')
      const id = nextId++
      return await new Promise((resolve_, reject) => {
        pending.set(id, { resolve: resolve_, reject })
        w.postMessage({ ...msg, id })
      })
    },
    close() {
      for (const w of workers) w.postMessage({ type: 'exit' })
    },
  }
}

function provenance() {
  const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim()
  const blobs = {}
  for (const f of REFERENCE_FILES) blobs[f] = git('hash-object', f)
  return { revision: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain') !== '', blobs, node: process.versions.node }
}

async function homeMain() {
  const t0 = Date.now()
  const threads = Number(argOf('--threads', 4))
  if (!Number.isInteger(threads) || threads < 1 || threads > 4) throw new Error('--threads must be 1..4')
  const corpus = resolve(argOf('--corpus', DEFAULT_CORPUS))
  const out = join(resolve(argOf('--out', DEFAULT_OUT)), 'home')
  const pops = argOf('--population', '') ? argOf('--population', '').split(',').map((s) => s.trim().toUpperCase()) : null
  const maxGames = Number(argOf('--max-games', 0))
  fs.mkdirSync(out, { recursive: true })
  const files = fs
    .readdirSync(corpus)
    .filter((f) => /^H\d-\d+-\d+\.tsv$/.test(f))
    .filter((f) => !pops || pops.includes(f.split('-')[0]))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  const P = await pool('home', threads)
  const totals = {}
  const perFile = {}
  let games = 0
  for (const file of files) {
    const rl = readline.createInterface({ input: fs.createReadStream(join(corpus, file)), crlfDelay: Infinity })
    const ws = fs.createWriteStream(join(out, file))
    const jobs = []
    let batch = []
    let taken = 0
    const flush = () => {
      if (batch.length) jobs.push(P.submit({ type: 'home', lines: batch }))
      batch = []
    }
    for await (const line of rl) {
      if (!line.startsWith('athena-replay-1\t')) continue
      if (maxGames > 0 && taken >= maxGames) break
      batch.push(line)
      taken++
      if (batch.length === 8) flush()
      // keep a bounded window of jobs in flight, writing finished ones in order
      while (jobs.length > 4 * threads) {
        for (const r of await jobs.shift()) ws.write(r.line + '\n'), tally(totals, perFile, file, r)
      }
    }
    rl.close()
    flush()
    for (const j of jobs) for (const r of await j) ws.write(r.line + '\n'), tally(totals, perFile, file, r)
    await new Promise((r) => ws.end(r))
    // the file's aggregate: the SHA-256 of its game digests in file order (the lines' last column)
    perFile[file].aggregate = createHash('sha256').update(perFile[file].gameDigests.join('')).digest('hex')
    delete perFile[file].gameDigests
    games += perFile[file].games
    console.log(`  ${file}: ${perFile[file].games} games, ${perFile[file].steps} steps, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  }
  P.close()
  const seconds = (Date.now() - t0) / 1000
  const manifest = {
    format: FORMAT_HOME,
    corpus,
    threads,
    seconds,
    games,
    totals,
    files: perFile,
    ...provenance(),
  }
  fs.writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`home: ${games} games, ${JSON.stringify(totals)}; ${seconds.toFixed(0)} s on ${threads} threads -> ${out}`)
}

function tally(totals, perFile, file, r) {
  const f = (perFile[file] ??= { games: 0, steps: 0, offers: 0, rails: 0, consViews: 0, wrong: 0, hidden: 0, gameDigests: [] })
  const t = (totals[r.population] ??= { games: 0, steps: 0, views: 0, offers: 0, rails: 0, consViews: 0, wrong: 0, hidden: 0 })
  for (const x of [f, t]) {
    x.games++
    x.steps += r.steps
    x.offers += r.offers
    x.rails += r.rails
    x.consViews += r.consViews
    x.wrong += r.wrong
    x.hidden += r.hidden
  }
  t.views += 6 * r.steps
  f.gameDigests.push(r.game)
}

async function bridgeMain() {
  const t0 = Date.now()
  const threads = Number(argOf('--threads', 4))
  if (!Number.isInteger(threads) || threads < 1 || threads > 4) throw new Error('--threads must be 1..4')
  const records = resolve(argOf('--records', DEFAULT_RECORDS))
  const prefix = argOf('--prefix', DEFAULT_PREFIX)
  const maxGames = Number(argOf('--max-games', 0))
  const out = join(resolve(argOf('--out', DEFAULT_OUT)), 'bridge')
  fs.mkdirSync(out, { recursive: true })
  const REC = await imp('scripts/bridge-records.mjs')
  const files = REC.recordFiles(records, prefix)
  const P = await pool('bridge', threads)
  const perFile = {}
  let games = 0
  let asks = 0
  let consViews = 0
  await Promise.all(
    files.map(async (file) => {
      const res = await P.submit({ type: 'bridge', file, max: maxGames })
      fs.writeFileSync(join(out, basename(file, '.jsonl') + '.tsv'), res.map((r) => r.line + '\n').join(''))
      const f = { games: res.length, asks: res.reduce((n, r) => n + r.asks, 0), consViews: res.reduce((n, r) => n + r.consViews, 0) }
      perFile[basename(file)] = f
      games += f.games
      asks += f.asks
      consViews += f.consViews
      console.log(`  ${basename(file)}: ${f.games} games, ${f.asks} asks, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
    }),
  )
  P.close()
  const seconds = (Date.now() - t0) / 1000
  fs.writeFileSync(
    join(out, 'manifest.json'),
    JSON.stringify({ format: FORMAT_BRIDGE, records, prefix, threads, seconds, games, asks, consViews, files: perFile, ...provenance() }, null, 2) + '\n',
  )
  console.log(`bridge: ${games} games, ${asks} asks (views), ${consViews} with a constraint; ${seconds.toFixed(0)} s on ${threads} threads -> ${out}`)
}

async function dumpMain(spec) {
  const M = await loadModules()
  const parts = spec.split(':')
  if (parts[0] === 'home' && parts.length === 4) {
    const [, file, index, step] = parts
    const corpus = resolve(argOf('--corpus', DEFAULT_CORPUS))
    const rl = readline.createInterface({ input: fs.createReadStream(join(corpus, file)), crlfDelay: Infinity })
    for await (const line of rl) {
      const f = line.split('\t', 3)
      if (f[0] === 'athena-replay-1' && f[2] === index) {
        console.log(homeGame(M, line, Number(step)))
        rl.close()
        return
      }
    }
    throw new Error(`no record ${index} in ${file}`)
  }
  if (parts[0] === 'bridge' && parts.length === 5) {
    const [, file, deal, rot, k] = parts
    const REC = await imp('scripts/bridge-records.mjs')
    const records = resolve(argOf('--records', DEFAULT_RECORDS))
    for (const rec of REC.readRecordFile(join(records, file))) {
      const p = rec.label.split(':')
      if (p[p.length - 2] === deal && p[p.length - 1] === rot) {
        console.log(bridgeGame(M, REC, rec, Number(k)))
        return
      }
    }
    throw new Error(`no game ${deal}:${rot} in ${file}`)
  }
  throw new Error('dump needs home:<file>:<index>:<step> or bridge:<file>:<deal>:<rot>:<ask>')
}

if (!isMainThread) {
  await workerMain()
} else {
  if (resolve(process.cwd()).toLowerCase() !== ROOT.toLowerCase()) process.chdir(ROOT)
  const mode = argv[0]
  if (mode === 'home') await homeMain()
  else if (mode === 'bridge') await bridgeMain()
  else if (mode === 'dump') await dumpMain(argv[1] ?? '')
  else {
    console.error('usage: emit-facts.mjs home|bridge|dump ... (see the header)')
    process.exit(2)
  }
}
