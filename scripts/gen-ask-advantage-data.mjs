/**
 * gen-ask-advantage-data.mjs - MONET.md 3.8aw stage A: the learned ask ADVANTAGE's data (and 3.8ax's second
 * round, with `--model`).
 *
 *   node scripts/gen-ask-advantage-data.mjs --games 4000 --label v51A --out C:/Projects/FishAI-bench/v51/A
 *        [--skip 0] [--threads 12] [--chunk 20] [--sample 0.25] [--clone-alts 3] [--ranker-alts 2]
 *        [--random-alts 3] [--version v0.33] [--model <adv.json>]
 *
 * WHAT A ROW IS. Self-play games of v0.33 at every seat. At a sampled ask decision (probability
 * `--sample`, drawn from the decision's own seed) the ask v0.33 plays and a handful of ALTERNATIVE legal
 * asks are each applied to the TRUE state and rolled out to the end of the game under v0.33 at every
 * seat. One row per alternative: the alternative's feature row, the played ask's feature row, and the
 * difference between the two rollouts in the asking team's final set differential (and in whether it
 * won).
 *
 * WHY THIS LABEL AND NOT 3.8as's. 3.8as regressed the whole game's result on the ask that was taken, and
 * the position swamped it: the playable ask columns explained R2 0.018. Here both rollouts start from the
 * SAME state under the same key, and 3.8av established that the rollout is deterministic in its key at
 * this vector - so the difference between the two numbers is caused by the ask and by nothing else. There
 * is no position noise to regress away and no rollout noise to average. What varies between rows that
 * share a feature row is only the hidden deal, which is exactly the uncertainty a policy has to price.
 *
 * WHICH ALTERNATIVES. The clone's next `--clone-alts` asks after its choice (the plausible deviations),
 * the ranker's top `--ranker-alts` not already taken (the greedy, high-p asks), and `--random-alts`
 * drawn uniformly from the rest of the legal list (coverage, so the fit is never asked at play to score
 * a kind of ask it has never seen priced). Deduplicated; the played ask is never its own alternative.
 *
 * THE SECOND ROUND (3.8ax). With `--model`, the model's own best ask over the whole legal list is labelled
 * FIRST, as kind 4, wherever it is not the clone's choice - the marker probe's argmax and tie rule exactly.
 * 3.8aw found the model's choices worth far less than it predicted for them (the winner's curse); labelling
 * those choices is how a refit learns where it over-rates. With `--clone-alts 0 --ranker-alts 0
 * --random-alts 0` the rows are exactly the deviations the marker prices at margin 0. Without `--model` the
 * rows are byte-identical to 3.8aw's.
 *
 * THE PIN. The played ask must be the clone's choice (`chooseAskByModel` over `rankAsksWith`). 3.8as
 * measured that v0.33's `containedPass` overrides it at ~0.05% of ask decisions; those decisions are not
 * the clone's to make, get no rows, and are counted as `overridden`.
 *
 * BLIND BY CONSTRUCTION. The console prints counts and timing only, never a statistic of the labels, so
 * the generator can be timed and smoke-tested before the pre-registration without anyone seeing an answer.
 *
 * Row layout (Float32, little-endian), COLS = 2 * NF + 11: x_alt (NF), x_played (NF), dSet, dWin, game,
 * moveIndex, seat, kind (1 clone's next, 2 ranker's top, 3 random, 4 the model's own choice), altCloneRank,
 * nRanked, altHit, playedHit, vPlayed. altHit, playedHit and vPlayed read the TRUE deal and are
 * diagnostics, never features. `<out>.json` names every column. Results are written in game order whatever
 * the thread timing, so the file is a function of its arguments. One process: the threads die with it.
 */
import { Worker } from 'node:worker_threads'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { advFeatureNames, advFeatureCount } from './ask-advantage-features.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const IMI = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/imitation.ts')).href)

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const GAMES = Number(argOf('--games', 100))
const SKIP = Number(argOf('--skip', 0))
const LABEL = argOf('--label', 'v51A')
const OUT = argOf('--out', '')
const THREADS = Math.max(1, Number(argOf('--threads', 12)))
const CHUNK = Math.max(1, Number(argOf('--chunk', 20)))
const SAMPLE = Number(argOf('--sample', 0.25))
const CLONE_ALTS = Number(argOf('--clone-alts', 3))
const RANKER_ALTS = Number(argOf('--ranker-alts', 2))
const RANDOM_ALTS = Number(argOf('--random-alts', 3))
const VERSION = argOf('--version', 'v0.33')
const MODEL_PATH = argOf('--model', '')
if (!OUT) {
  console.error('--out is required (a path prefix; <out>.bin and <out>.json are written)')
  process.exit(2)
}

const NF = advFeatureCount(IMI)
const NAMES = advFeatureNames(IMI)
const EXTRA_COLS = ['dSet', 'dWin', 'game', 'moveIndex', 'seat', 'kind', 'altCloneRank', 'nRanked', 'altHit', 'playedHit', 'vPlayed']
const COLS = 2 * NF + EXTRA_COLS.length

const MODEL = MODEL_PATH ? JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8')) : null
const MODEL_MD5 = MODEL_PATH ? crypto.createHash('md5').update(fs.readFileSync(MODEL_PATH)).digest('hex') : null
if (MODEL !== null && MODEL.features !== NF) {
  console.error(`${MODEL_PATH}: the model reads ${MODEL.features} features and the advantage rows carry ${NF}`)
  process.exit(2)
}

fs.mkdirSync(dirname(resolve(`${OUT}.bin`)), { recursive: true })
const fd = fs.openSync(`${OUT}.bin`, 'w')

const tasks = []
for (let g = SKIP, i = 0; g < SKIP + GAMES; g += CHUNK, i++) {
  tasks.push({ index: i, label: LABEL, from: g, to: Math.min(g + CHUNK, SKIP + GAMES), version: VERSION, sample: SAMPLE, cloneAlts: CLONE_ALTS, rankerAlts: RANKER_ALTS, randomAlts: RANDOM_ALTS, cols: COLS })
}

const totals = { games: 0, askDecisions: 0, sampled: 0, overridden: 0, noAlt: 0, modelIsClone: 0, pairs: 0, rollouts: 0 }
let workerSecs = 0
const done = new Map()
let nextWrite = 0
const t0 = Date.now()
let lastPrint = t0

function progress() {
  const el = (Date.now() - t0) / 1000
  const frac = totals.games / GAMES
  const eta = frac > 0 ? el / frac - el : NaN
  console.log(`[${new Date().toISOString().slice(11, 19)}] games ${totals.games}/${GAMES}; ask decisions ${totals.askDecisions}, sampled ${totals.sampled} (overridden ${totals.overridden}); pairs ${totals.pairs}; rollouts ${totals.rollouts}; ${el.toFixed(0)} s elapsed, ~${Number.isFinite(eta) ? eta.toFixed(0) : '?'} s to go`)
}

function flush() {
  while (done.has(nextWrite)) {
    const r = done.get(nextWrite)
    done.delete(nextWrite)
    const buf = new Float32Array(r.buf)
    if (buf.length % COLS !== 0) throw new Error(`task ${r.index}: ${buf.length} values is not a whole number of ${COLS}-column rows`)
    fs.writeSync(fd, Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength))
    nextWrite++
  }
}

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
      const worker = new Worker(join(HERE, 'gen-ask-advantage-worker.mjs'), { workerData: { model: MODEL } })
      worker.on('message', (msg) => {
        if (msg?.type === 'error') {
          rejectAll(new Error(`task ${msg.taskIndex}: ${msg.message}`))
          return
        }
        if (msg?.type !== 'result') return
        const r = msg.result
        for (const key of Object.keys(totals)) totals[key] += r[key] ?? 0
        workerSecs += r.secs
        done.set(r.index, r)
        try {
          flush()
        } catch (e) {
          rejectAll(e)
          return
        }
        if (Date.now() - lastPrint > 30000) {
          progress()
          lastPrint = Date.now()
        }
        // every result is followed by a new task or by `quit`, the last one included - a worker that is
        // never told to quit keeps the process alive after the work is done
        dispatch(worker)
        if (nextWrite === tasks.length) resolveAll()
      })
      worker.on('error', rejectAll)
      dispatch(worker)
    }
  })
} catch (e) {
  console.error(String(e?.stack ?? e))
  process.exit(1)
}
fs.closeSync(fd)
const secs = (Date.now() - t0) / 1000
progress()

fs.writeFileSync(
  `${OUT}.json`,
  JSON.stringify(
    {
      kind: 'ask-advantage',
      section: MODEL ? '3.8ax' : '3.8aw',
      version: VERSION,
      label: LABEL,
      skip: SKIP,
      games: GAMES,
      sample: SAMPLE,
      model: MODEL_PATH || null,
      modelMd5: MODEL_MD5,
      cloneAlts: CLONE_ALTS,
      rankerAlts: RANKER_ALTS,
      randomAlts: RANDOM_ALTS,
      features: NF,
      featureNames: NAMES,
      cols: COLS,
      columns: [...NAMES.map((n) => `alt.${n}`), ...NAMES.map((n) => `played.${n}`), ...EXTRA_COLS],
      rows: totals.pairs,
      counts: totals,
      secs,
      workerSecs,
      threads: THREADS,
      chunk: CHUNK,
    },
    null,
    2,
  ),
)
const modelNote = MODEL ? `the model's own choice (${MODEL_MD5.slice(0, 8)}) + ` : ''
console.log(`=== gen-ask-advantage-data: ${VERSION}, games ${SKIP}..${SKIP + GAMES - 1} (${LABEL}-*), sample ${SAMPLE}, alternatives ${modelNote}${CLONE_ALTS} clone + ${RANKER_ALTS} ranker + ${RANDOM_ALTS} random, ${THREADS} threads ===`)
console.log(`${totals.pairs} pairs from ${totals.sampled - totals.overridden - totals.noAlt} decisions (${totals.sampled} sampled of ${totals.askDecisions} ask decisions; ${totals.overridden} overridden, ${totals.noAlt} with no alternative${MODEL ? `; the model's best ask was the clone's choice at ${totals.modelIsClone}` : ''}); ${totals.rollouts} rollouts`)
console.log(`${secs.toFixed(1)} s wall, ${workerSecs.toFixed(1)} s across threads: ${(totals.rollouts / Math.max(1e-9, workerSecs)).toFixed(1)} rollouts and ${(totals.games / Math.max(1e-9, workerSecs)).toFixed(3)} games per thread-second`)
console.log(`-> ${OUT}.bin (${COLS} columns) and ${OUT}.json`)
