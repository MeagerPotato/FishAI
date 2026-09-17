/**
 * read-ask-advantage-pair.mjs - MONET.md 3.8az: two ask-advantage models marked on the SAME games, read as a paired
 * difference a decision.
 *
 *   node scripts/read-ask-advantage-pair.mjs --a C:/Projects/FishAI-bench/v54/M --b C:/Projects/FishAI-bench/v54/M2
 *        --b-margin 0.2 [--a-margin registered] [--half score] [--section 3.8az]
 *
 * WHY THE TWO RUNS PAIR. scripts/probe-ask-advantage.mjs lets v0.33 play every game unchanged and samples ask
 * decisions from each decision's own seed, so two runs over the same label read the same decisions whatever model
 * each one scores with. At such a decision a policy using model A at margin mA gains the run's dSet where A's best
 * ask is not the clone's choice and its gap is above mA, and 0 elsewhere; the same for B. The read is the mean of A's
 * gain less B's over the decisions of the chosen half, the SE clustered by game. Where both models take the same ask
 * the two runs rolled out the same ask under the same key, and the rollout is deterministic in its key, so their
 * difference there is exactly zero - which the reader checks at every such decision.
 *
 * THE HALF is A's: `score` is games skip + split .. skip + games - 1 of A's run, `tune` the games before, `all` both.
 * B's run must cover it (B may cover only that range). `--a-margin registered` takes the margin A's own run chose on
 * its tune half; a number names any margin of A's grid, and `--b-margin` must name one of B's.
 *
 * THE PINS. A run read against itself at the same margin is zero with a zero SE; read against itself at a margin no
 * gap reaches, it reproduces the run's own read at the first margin, mean and SE.
 */
import fs from 'node:fs'

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const PA = argOf('--a', '')
const PB = argOf('--b', '')
const A_MARGIN = argOf('--a-margin', 'registered')
const B_MARGIN = argOf('--b-margin', '')
const HALF = argOf('--half', 'score')
const SECTION = argOf('--section', '3.8az')
if (!PA || !PB || B_MARGIN === '') {
  console.error('--a, --b and --b-margin are required')
  process.exit(2)
}
if (!['score', 'tune', 'all'].includes(HALF)) {
  console.error('--half is score, tune or all')
  process.exit(2)
}

const RCOLS = 9
function load(prefix) {
  const h = JSON.parse(fs.readFileSync(`${prefix}.json`, 'utf8'))
  const raw = fs.readFileSync(`${prefix}.bin`)
  if (raw.byteLength % (4 * RCOLS) !== 0) throw new Error(`${prefix}.bin: ${raw.byteLength} bytes is not a whole number of ${RCOLS}-column records`)
  return { h, rec: new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)) }
}
const A = load(PA)
const B = load(PB)
for (const k of ['label', 'version', 'sample']) {
  if (A.h[k] !== B.h[k]) throw new Error(`the runs differ in ${k}: ${JSON.stringify(A.h[k])} and ${JSON.stringify(B.h[k])} - they do not read the same decisions`)
}
if (A.h.pin || B.h.pin) throw new Error('a pin run carries no model to pair')

const mA = A_MARGIN === 'registered' ? A.h.registered.margin : Number(A_MARGIN)
const mB = Number(B_MARGIN)
if (!A.h.margins.includes(mA)) throw new Error(`margin ${mA} is not in A's grid ${A.h.margins.join(',')}`)
if (!B.h.margins.includes(mB)) throw new Error(`margin ${mB} is not in B's grid ${B.h.margins.join(',')}`)

const lo = HALF === 'score' ? A.h.skip + A.h.split : A.h.skip
const hi = HALF === 'tune' ? A.h.skip + A.h.split : A.h.skip + A.h.games
if (B.h.skip > lo || B.h.skip + B.h.games < hi) throw new Error(`B covers games ${B.h.skip}..${B.h.skip + B.h.games - 1}, not ${lo}..${hi - 1}`)

/** (game, moveIndex) -> record offset, over [lo, hi). */
function index(rec, name) {
  const m = new Map()
  for (let o = 0; o < rec.length; o += RCOLS) {
    const g = rec[o]
    if (g < lo || g >= hi) continue
    const key = `${g}:${rec[o + 1]}`
    if (m.has(key)) throw new Error(`${name}: two records for decision ${key}`)
    m.set(key, o)
  }
  return m
}
const iA = index(A.rec, 'A')
const iB = index(B.rec, 'B')
let onlyA = 0
for (const key of iA.keys()) if (!iB.has(key)) onlyA++
let onlyB = 0
for (const key of iB.keys()) if (!iA.has(key)) onlyB++
if (onlyA > 0 || onlyB > 0) throw new Error(`the runs did not read the same decisions in games ${lo}..${hi - 1}: ${onlyA} only in A, ${onlyB} only in B`)

const gain = (rec, o, m) => (rec[o + 5] === 1 && rec[o + 2] > m ? rec[o + 3] : 0)
const games = new Map()
let n = 0
let sA = 0
let sB = 0
let takeA = 0
let takeB = 0
let sameAsk = 0
let sameAskMismatch = 0
let oneSided = 0
for (const [key, oA] of iA) {
  const oB = iB.get(key)
  const game = A.rec[oA]
  const vA = gain(A.rec, oA, mA)
  const vB = gain(B.rec, oB, mB)
  const tA = A.rec[oA + 5] === 1 && A.rec[oA + 2] > mA
  const tB = B.rec[oB + 5] === 1 && B.rec[oB + 2] > mB
  if (tA) takeA++
  if (tB) takeB++
  // both deviated to the ask of the same clone rank: the same ask, so the same rollout
  if (A.rec[oA + 5] === 1 && B.rec[oB + 5] === 1 && A.rec[oA + 8] === B.rec[oB + 8]) {
    sameAsk++
    if (A.rec[oA + 3] !== B.rec[oB + 3] || A.rec[oA + 4] !== B.rec[oB + 4]) sameAskMismatch++
  }
  if (tA !== tB) oneSided++
  let gs = games.get(game)
  if (!gs) {
    gs = { n: 0, a: 0, b: 0 }
    games.set(game, gs)
  }
  gs.n++
  gs.a += vA
  gs.b += vB
  n++
  sA += vA
  sB += vB
}
if (sameAskMismatch > 0) throw new Error(`${sameAskMismatch} decisions where both runs took the same ask and measured different outcomes - the runs are not paired`)

function clustered(pick, mean) {
  let v = 0
  for (const gs of games.values()) {
    const r = pick(gs) - gs.n * mean
    v += r * r
  }
  return n > 0 ? Math.sqrt(v) / n : 0
}
const meanA = n > 0 ? sA / n : 0
const meanB = n > 0 ? sB / n : 0
const meanD = meanA - meanB
const seA = clustered((gs) => gs.a, meanA)
const seB = clustered((gs) => gs.b, meanB)
const seD = clustered((gs) => gs.a - gs.b, meanD)
const zD = seD > 0 ? meanD / seD : 0
const sign = (x, d = 4) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`
const pct = (x) => `${((100 * x) / Math.max(1, n)).toFixed(2)}%`

console.log(`=== read-ask-advantage-pair: A ${A.h.model} at margin ${mA}${A_MARGIN === 'registered' ? ' (its run\'s registered margin)' : ''}; B ${B.h.model} at margin ${mB} ===`)
console.log(`${A.h.label}, games ${lo}..${hi - 1} (the ${HALF} half of A's run): ${n} decisions read by both runs, ${games.size} games`)
console.log('')
console.log('| | a decision, to the END | leaves the clone |')
console.log('|---|---:|---:|')
console.log(`| A | ${sign(meanA)} (SE ${seA.toFixed(4)}) | ${takeA} (${pct(takeA)}) |`)
console.log(`| B | ${sign(meanB)} (SE ${seB.toFixed(4)}) | ${takeB} (${pct(takeB)}) |`)
console.log(`| **A - B** | **${sign(meanD)} (SE ${seD.toFixed(4)}, z ${zD.toFixed(2)})** | only one of them at ${oneSided} (${pct(oneSided)}) |`)
console.log('')
console.log(`both models deviated to the same ask at ${sameAsk} decisions (at any margin), and measured the same outcome at every one`)
console.log('')
const verdict = meanD > 0 ? 'A AHEAD' : meanD < 0 ? 'A BEHIND' : 'LEVEL'
console.log(`PAIRED READ (${SECTION}): A at ${mA} less B at ${mB} on the ${HALF} half: ${sign(meanD)} a decision (SE ${seD.toFixed(4)}, z ${zD.toFixed(2)}) -> ${verdict}${meanD + 2 * seD < 0 ? '; BELOW ZERO BY 2 SE' : ''}`)
