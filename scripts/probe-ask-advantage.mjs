/**
 * probe-ask-advantage.mjs - MONET.md 3.8aw gate B2, THE MARKER: what the learned advantage's choice is
 * actually worth, read against the TRUE deal on games the fit never saw. 3.8ax's marker is this script too.
 *
 *   node scripts/probe-ask-advantage.mjs --model C:/Projects/FishAI-bench/v51/adv-1.json --games 2000 --label v51M
 *        --out C:/Projects/FishAI-bench/v51/M [--skip 0] [--split 1000] [--threads 12] [--chunk 20]
 *        [--sample 0.25] [--margins 0,0.05,0.1,0.2,0.3,0.5,1,2] [--version v0.33] [--pin clone|random]
 *        [--section 3.8aw]
 *   node scripts/probe-ask-advantage.mjs --from C:/Projects/FishAI-bench/v51/M [--out <prefix>] [--section 3.8aw]
 *
 * v0.33 plays every game unchanged; the probe only reads what a policy using the model would have done.
 * At a sampled ask decision the model scores every legal ask, and its best ask replaces the clone's
 * choice only when its score beats the clone's own by more than a margin. For ANY margin the policy's
 * choice is one of two asks - the model's argmax or the clone's choice - so a decision costs at most two
 * rollouts from the true state to the end, and none when the argmax IS the clone's choice (an exact zero,
 * by the rollout's determinism). One pass prices every margin.
 *
 * THE REGISTERED READ (3.8aw B2). The margin is chosen on the TUNE half (games skip .. skip + split - 1) as
 * the one with the highest mean set-differential advantage per decision (a tie goes to the larger margin),
 * and scored on the SCORE half (the remaining games), which never influenced the choice. B2 holds if that
 * score-half mean is above zero by two standard errors, the SE clustered by game. The match floor: below
 * zero by two SE says the learned policy's asks are worse than v0.33's own.
 *
 * AT ITS OWN CHOICES (registered from 3.8ax). Every decision where the model's best ask is not the clone's
 * choice, whatever the margin, binned by the gain the model PREDICTED for its choice, beside what that
 * choice MEASURED - the winner's curse 3.8aw located, read directly. 3.8aw read it once from its saved
 * records, unregistered; this block prints the same numbers.
 *
 * PINS. `--pin clone` scores every ask by the clone's own score: the argmax is always the clone's choice,
 * so every margin must read exactly zero with zero rollouts. `--pin random` scores asks at random: it
 * leaves the clone at nearly every decision and must read clearly negative - the proof that the rollouts
 * can see a bad ask. Neither needs a model.
 *
 * RE-READ. `--from <prefix>` aggregates a finished run's saved records again without playing a game: the
 * games, split, margins, label and totals come from `<prefix>.json`, so a read can be reproduced exactly.
 *
 * Per-decision records (Float32, 9 columns: game, moveIndex, gap, dSet, dWin, deviated, hitBest,
 * hitPlayed, rankBest) go to `<out>.bin`, the summary to `<out>.json`, so a later read never has to
 * replay the games.
 */
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const FROM = argOf('--from', '')
const H = FROM ? JSON.parse(fs.readFileSync(`${FROM}.json`, 'utf8')) : null
const MODEL_PATH = H ? (H.model ?? '') : argOf('--model', '')
const GAMES = H ? H.games : Number(argOf('--games', 200))
const SKIP = H ? H.skip : Number(argOf('--skip', 0))
const SPLIT = H ? H.split : Number(argOf('--split', Math.floor(GAMES / 2)))
const LABEL = H ? H.label : argOf('--label', 'v51M')
const OUT = argOf('--out', '')
const THREADS = H ? H.threads : Math.max(1, Number(argOf('--threads', 12)))
const CHUNK = Math.max(1, Number(argOf('--chunk', 20)))
const SAMPLE = H ? H.sample : Number(argOf('--sample', 0.25))
const MARGINS = H ? H.margins : argOf('--margins', '0,0.05,0.1,0.2,0.3,0.5,1,2').split(',').map(Number)
const VERSION = H ? H.version : argOf('--version', 'v0.33')
const PIN = H ? (H.pin ?? '') : argOf('--pin', '')
const SECTION = argOf('--section', '3.8aw')
if (!OUT && !FROM) {
  console.error('--out is required (a path prefix) unless --from re-reads a finished run')
  process.exit(2)
}
if (PIN !== '' && PIN !== 'clone' && PIN !== 'random') {
  console.error('--pin is clone or random')
  process.exit(2)
}
if (!H && PIN === '' && !MODEL_PATH) {
  console.error('--model is required unless --pin or --from is given')
  process.exit(2)
}
const RCOLS = 9

let REC
let totals
let secs
let workerSecs
if (H) {
  const raw = fs.readFileSync(`${FROM}.bin`)
  if (raw.byteLength % (4 * RCOLS) !== 0) throw new Error(`${FROM}.bin: ${raw.byteLength} bytes is not a whole number of ${RCOLS}-column records`)
  REC = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
  totals = H.totals
  secs = H.secs
  workerSecs = H.workerSecs
} else {
  const MODEL = PIN === '' ? JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8')) : null
  const tasks = []
  for (let g = SKIP, i = 0; g < SKIP + GAMES; g += CHUNK, i++) {
    tasks.push({ index: i, label: LABEL, from: g, to: Math.min(g + CHUNK, SKIP + GAMES), version: VERSION, sample: SAMPLE })
  }
  totals = { games: 0, askDecisions: 0, sampled: 0, overridden: 0, decisions: 0, argmaxIsClone: 0, rollouts: 0 }
  workerSecs = 0
  const results = new Array(tasks.length)
  let received = 0
  const t0 = Date.now()
  let lastPrint = t0

  try {
    await new Promise((resolveAll, rejectAll) => {
      let next = 0
      const dispatch = (worker) => {
        if (next >= tasks.length) {
          worker.postMessage({ type: 'quit' })
          return
        }
        worker.postMessage({ type: 'task', task: tasks[next++] })
      }
      for (let i = 0; i < Math.min(THREADS, tasks.length); i++) {
        const worker = new Worker(join(HERE, 'probe-ask-advantage-worker.mjs'), { workerData: { model: MODEL, pin: PIN } })
        worker.on('message', (msg) => {
          if (msg?.type === 'error') {
            rejectAll(new Error(`task ${msg.taskIndex}: ${msg.message}`))
            return
          }
          if (msg?.type !== 'result') return
          const r = msg.result
          for (const key of Object.keys(totals)) totals[key] += r[key] ?? 0
          workerSecs += r.secs
          results[r.index] = new Float32Array(r.buf)
          received++
          if (Date.now() - lastPrint > 30000) {
            console.log(`[${new Date().toISOString().slice(11, 19)}] games ${totals.games}/${GAMES}; decisions ${totals.decisions}; rollouts ${totals.rollouts}; ${((Date.now() - t0) / 1000).toFixed(0)} s`)
            lastPrint = Date.now()
          }
          // every result is followed by a new task or by `quit`, the last one included - a worker that is
          // never told to quit keeps the process alive after the work is done
          dispatch(worker)
          if (received === tasks.length) resolveAll()
        })
        worker.on('error', rejectAll)
        dispatch(worker)
      }
    })
  } catch (e) {
    console.error(String(e?.stack ?? e))
    process.exit(1)
  }
  secs = (Date.now() - t0) / 1000

  let n = 0
  for (const r of results) n += r.length / RCOLS
  REC = new Float32Array(n * RCOLS)
  let off = 0
  for (const r of results) {
    REC.set(r, off)
    off += r.length
  }
}
const nRec = REC.length / RCOLS

// ---- aggregate: per margin, per half, clustered by game
function read(half) {
  const lo = half === 'tune' ? SKIP : SKIP + SPLIT
  const hi = half === 'tune' ? SKIP + SPLIT : SKIP + GAMES
  const per = MARGINS.map(() => ({ n: 0, sum: 0, win: 0, dev: 0, devSum: 0, hitB: 0, hitP: 0, rankB: 0, games: new Map() }))
  for (let i = 0; i < nRec; i++) {
    const o = i * RCOLS
    const game = REC[o]
    if (game < lo || game >= hi) continue
    const gap = REC[o + 2]
    const dSet = REC[o + 3]
    const dWin = REC[o + 4]
    const devd = REC[o + 5] === 1
    MARGINS.forEach((m, k) => {
      const p = per[k]
      const take = devd && gap > m
      const v = take ? dSet : 0
      const w = take ? dWin : 0
      p.n++
      p.sum += v
      p.win += w
      let gs = p.games.get(game)
      if (!gs) {
        gs = { n: 0, s: 0, w: 0 }
        p.games.set(game, gs)
      }
      gs.n++
      gs.s += v
      gs.w += w
      if (take) {
        p.dev++
        p.devSum += dSet
        p.hitB += REC[o + 6]
        p.hitP += REC[o + 7]
        p.rankB += REC[o + 8]
      }
    })
  }
  return per.map((p, k) => {
    const mean = p.n > 0 ? p.sum / p.n : 0
    const wmean = p.n > 0 ? p.win / p.n : 0
    let v = 0
    let vw = 0
    for (const gs of p.games.values()) {
      const r = gs.s - gs.n * mean
      const rw = gs.w - gs.n * wmean
      v += r * r
      vw += rw * rw
    }
    const se = p.n > 0 ? Math.sqrt(v) / p.n : 0
    const sew = p.n > 0 ? Math.sqrt(vw) / p.n : 0
    return {
      margin: MARGINS[k],
      decisions: p.n,
      mean,
      se,
      z: se > 0 ? mean / se : 0,
      winMean: wmean,
      winSe: sew,
      deviations: p.dev,
      devRate: p.n > 0 ? p.dev / p.n : 0,
      perDeviation: p.dev > 0 ? p.devSum / p.dev : 0,
      hitBest: p.dev > 0 ? p.hitB / p.dev : 0,
      hitPlayed: p.dev > 0 ? p.hitP / p.dev : 0,
      meanCloneRank: p.dev > 0 ? p.rankB / p.dev : 0,
    }
  })
}
const tune = read('tune')
const score = read('score')
let kStar = 0
for (let k = 1; k < MARGINS.length; k++) {
  if (tune[k].mean > tune[kStar].mean || (tune[k].mean === tune[kStar].mean && MARGINS[k] > MARGINS[kStar])) kStar = k
}
const sc = score[kStar]
const holds = sc.mean - 2 * sc.se > 0
const worse = sc.mean + 2 * sc.se < 0
const sign = (x, d = 4) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`

// ---- at its own choices: every deviation, binned by the gain the model predicted for it
/** Mean and game-clustered SE of `pick(offset)` over the records where it is not null. */
function clustered(pick) {
  const games = new Map()
  let n = 0
  let sum = 0
  for (let i = 0; i < nRec; i++) {
    const o = i * RCOLS
    const v = pick(o)
    if (v === null) continue
    const game = REC[o]
    let gs = games.get(game)
    if (!gs) {
      gs = { n: 0, s: 0 }
      games.set(game, gs)
    }
    gs.n++
    gs.s += v
    n++
    sum += v
  }
  const mean = n > 0 ? sum / n : 0
  let v = 0
  for (const gs of games.values()) {
    const r = gs.s - gs.n * mean
    v += r * r
  }
  return { n, mean, se: n > 0 ? Math.sqrt(v) / n : 0 }
}
const OWN_EDGES = [0, 0.05, 0.1, 0.2, 0.3, 0.5, Infinity]
const isTune = (o) => REC[o] < SKIP + SPLIT
const own = OWN_EDGES.slice(0, -1).map((lo, b) => {
  const hi = OWN_EDGES[b + 1]
  const inBin = (o) => REC[o + 5] === 1 && REC[o + 2] > lo && REC[o + 2] <= hi
  const all = clustered((o) => (inBin(o) ? REC[o + 3] : null))
  const t = clustered((o) => (inBin(o) && isTune(o) ? REC[o + 3] : null))
  const s = clustered((o) => (inBin(o) && !isTune(o) ? REC[o + 3] : null))
  return {
    lo,
    hi: hi === Infinity ? null : hi,
    deviations: all.n,
    predicted: clustered((o) => (inBin(o) ? REC[o + 2] : null)).mean,
    measured: all.mean,
    se: all.se,
    tune: t.mean,
    tuneSe: t.se,
    score: s.mean,
    scoreSe: s.se,
    hitBest: clustered((o) => (inBin(o) ? REC[o + 6] : null)).mean,
    hitPlayed: clustered((o) => (inBin(o) ? REC[o + 7] : null)).mean,
  }
})
const ownAll = clustered((o) => (REC[o + 5] === 1 ? REC[o + 3] : null))
const ownPredicted = clustered((o) => (REC[o + 5] === 1 ? REC[o + 2] : null)).mean

console.log(`=== probe-ask-advantage: ${PIN ? `PIN ${PIN}` : MODEL_PATH}; ${VERSION}; games ${SKIP}..${SKIP + GAMES - 1} (${LABEL}-*), tune < ${SKIP + SPLIT} <= score; sample ${SAMPLE}; ${secs.toFixed(1)} s wall, ${totals.rollouts} rollouts ===`)
if (H) console.log(`(re-read from ${FROM}.bin: no games played)`)
console.log(`ask decisions ${totals.askDecisions}; sampled ${totals.sampled}; overridden ${totals.overridden}; read ${totals.decisions}, of which the model's argmax IS the clone's choice on ${totals.argmaxIsClone} (${((100 * totals.argmaxIsClone) / Math.max(1, totals.decisions)).toFixed(1)}%)`)
for (const [name, rows] of [['TUNE half', tune], ['SCORE half', score]]) {
  console.log('')
  console.log(`${name} - per decision, to the END, against the ask v0.33 played (0 where the policy keeps it)`)
  console.log('| margin | decisions | set differential | z | won | leaves the clone | per deviation | hit: its ask / the clone\'s | clone rank of its ask |')
  console.log('|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const r of rows) {
    console.log(`| ${r.margin} | ${r.decisions} | ${sign(r.mean)} (SE ${r.se.toFixed(4)}) | ${r.z.toFixed(2)} | ${sign(r.winMean)} (SE ${r.winSe.toFixed(4)}) | ${(100 * r.devRate).toFixed(2)}% | ${sign(r.perDeviation, 3)} | ${(100 * r.hitBest).toFixed(1)}% / ${(100 * r.hitPlayed).toFixed(1)}% | ${r.meanCloneRank.toFixed(1)} |`)
  }
}
console.log('')
console.log(`AT ITS OWN CHOICES - every decision where the model's best ask is not the clone's choice (both halves), by the gain the model predicted for it`)
console.log('| predicted gain | deviations | mean predicted | measured per deviation | tune | score | hit: its ask / the clone\'s |')
console.log('|---|---:|---:|---:|---:|---:|---:|')
for (const b of own) {
  if (b.deviations === 0) continue
  const range = b.hi === null ? `above ${b.lo}` : `${b.lo} to ${b.hi}`
  console.log(`| ${range} | ${b.deviations} | ${b.predicted.toFixed(3)} | ${sign(b.measured, 3)} (SE ${b.se.toFixed(3)}, z ${(b.se > 0 ? b.measured / b.se : 0).toFixed(2)}) | ${sign(b.tune, 3)} (SE ${b.tuneSe.toFixed(3)}) | ${sign(b.score, 3)} (SE ${b.scoreSe.toFixed(3)}) | ${(100 * b.hitBest).toFixed(1)}% / ${(100 * b.hitPlayed).toFixed(1)}% |`)
}
console.log(`all ${ownAll.n} deviations: predicted ${ownPredicted.toFixed(3)}, measured ${sign(ownAll.mean, 3)} (SE ${ownAll.se.toFixed(3)})`)
console.log('')
console.log(`REGISTERED READ (${SECTION} B2): the tune half picks margin ${MARGINS[kStar]} (tune ${sign(tune[kStar].mean)}); on the score half it reads ${sign(sc.mean)} (SE ${sc.se.toFixed(4)}, z ${sc.z.toFixed(2)}) -> B2 ${holds ? 'HOLDS' : 'MISSES'}${worse ? '; BELOW ZERO BY 2 SE - the match floor fails' : ''}`)

if (OUT) {
  fs.mkdirSync(dirname(resolve(`${OUT}.bin`)), { recursive: true })
  fs.writeFileSync(`${OUT}.bin`, Buffer.from(REC.buffer, REC.byteOffset, REC.byteLength))
  fs.writeFileSync(
    `${OUT}.json`,
    JSON.stringify(
      {
        section: SECTION,
        model: MODEL_PATH || null,
        pin: PIN || null,
        version: VERSION,
        label: LABEL,
        skip: SKIP,
        games: GAMES,
        split: SPLIT,
        sample: SAMPLE,
        margins: MARGINS,
        totals,
        secs,
        workerSecs,
        threads: THREADS,
        recordColumns: ['game', 'moveIndex', 'gap', 'dSet', 'dWin', 'deviated', 'hitBest', 'hitPlayed', 'rankBest'],
        tune,
        score,
        ownChoices: { deviations: ownAll.n, predicted: ownPredicted, measured: ownAll.mean, se: ownAll.se, bins: own },
        registered: { margin: MARGINS[kStar], score: sc, holds, worse },
      },
      null,
      2,
    ),
  )
  console.log(`-> ${OUT}.bin (${nRec} decisions) and ${OUT}.json`)
}
