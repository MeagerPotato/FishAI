/**
 * probe-ask-advantage.mjs - MONET.md 3.8aw gate B2, THE MARKER: what the learned advantage's choice is
 * actually worth, read against the TRUE deal on games the fit never saw.
 *
 *   node scripts/probe-ask-advantage.mjs --model C:/Projects/FishAI-bench/v51/adv-1.json --games 2000 --label v51M
 *        --out C:/Projects/FishAI-bench/v51/M [--skip 0] [--split 1000] [--threads 12] [--chunk 20]
 *        [--sample 0.25] [--margins 0,0.05,0.1,0.2,0.3,0.5,1,2] [--version v0.33] [--pin clone|random]
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
 * PINS. `--pin clone` scores every ask by the clone's own score: the argmax is always the clone's choice,
 * so every margin must read exactly zero with zero rollouts. `--pin random` scores asks at random: it
 * leaves the clone at nearly every decision and must read clearly negative - the proof that the rollouts
 * can see a bad ask. Neither needs a model.
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
const MODEL_PATH = argOf('--model', '')
const GAMES = Number(argOf('--games', 200))
const SKIP = Number(argOf('--skip', 0))
const SPLIT = Number(argOf('--split', Math.floor(GAMES / 2)))
const LABEL = argOf('--label', 'v51M')
const OUT = argOf('--out', '')
const THREADS = Math.max(1, Number(argOf('--threads', 12)))
const CHUNK = Math.max(1, Number(argOf('--chunk', 20)))
const SAMPLE = Number(argOf('--sample', 0.25))
const MARGINS = argOf('--margins', '0,0.05,0.1,0.2,0.3,0.5,1,2').split(',').map(Number)
const VERSION = argOf('--version', 'v0.33')
const PIN = argOf('--pin', '')
if (!OUT) {
  console.error('--out is required (a path prefix)')
  process.exit(2)
}
if (PIN !== '' && PIN !== 'clone' && PIN !== 'random') {
  console.error('--pin is clone or random')
  process.exit(2)
}
if (PIN === '' && !MODEL_PATH) {
  console.error('--model is required unless --pin is given')
  process.exit(2)
}
const MODEL = PIN === '' ? JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8')) : null
const RCOLS = 9

const tasks = []
for (let g = SKIP, i = 0; g < SKIP + GAMES; g += CHUNK, i++) {
  tasks.push({ index: i, label: LABEL, from: g, to: Math.min(g + CHUNK, SKIP + GAMES), version: VERSION, sample: SAMPLE })
}

const totals = { games: 0, askDecisions: 0, sampled: 0, overridden: 0, decisions: 0, argmaxIsClone: 0, rollouts: 0 }
let workerSecs = 0
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
const secs = (Date.now() - t0) / 1000

// ---- aggregate: per margin, per half, clustered by game
let nRec = 0
for (const r of results) nRec += r.length / RCOLS
const REC = new Float32Array(nRec * RCOLS)
{
  let off = 0
  for (const r of results) {
    REC.set(r, off)
    off += r.length
  }
}
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

console.log(`=== probe-ask-advantage: ${PIN ? `PIN ${PIN}` : MODEL_PATH}; ${VERSION}; games ${SKIP}..${SKIP + GAMES - 1} (${LABEL}-*), tune < ${SKIP + SPLIT} <= score; sample ${SAMPLE}; ${secs.toFixed(1)} s wall, ${totals.rollouts} rollouts ===`)
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
console.log(`REGISTERED READ (3.8aw B2): the tune half picks margin ${MARGINS[kStar]} (tune ${sign(tune[kStar].mean)}); on the score half it reads ${sign(sc.mean)} (SE ${sc.se.toFixed(4)}, z ${sc.z.toFixed(2)}) -> B2 ${holds ? 'HOLDS' : 'MISSES'}${worse ? '; BELOW ZERO BY 2 SE - the match floor fails' : ''}`)

fs.mkdirSync(dirname(resolve(`${OUT}.bin`)), { recursive: true })
fs.writeFileSync(`${OUT}.bin`, Buffer.from(REC.buffer, REC.byteOffset, REC.byteLength))
fs.writeFileSync(
  `${OUT}.json`,
  JSON.stringify({ section: '3.8aw', model: MODEL_PATH || null, pin: PIN || null, version: VERSION, label: LABEL, skip: SKIP, games: GAMES, split: SPLIT, sample: SAMPLE, margins: MARGINS, totals, secs, workerSecs, threads: THREADS, recordColumns: ['game', 'moveIndex', 'gap', 'dSet', 'dWin', 'deviated', 'hitBest', 'hitPlayed', 'rankBest'], tune, score, registered: { margin: MARGINS[kStar], score: sc, holds, worse } }, null, 2),
)
console.log(`-> ${OUT}.bin (${nRec} decisions) and ${OUT}.json`)
