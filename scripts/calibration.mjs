/**
 * calibration.mjs — believed vs realised hit probability, at home, under ground truth.
 *
 *     node scripts/calibration.mjs --version v0.3 [--games 300] [--lambdas 0,0.25,0.4,0.5,0.6,0.75,1]
 *
 * The instrument MONET.md §3.4a item 1 makes permanent ("believed vs realised, per decile, over
 * ≥ 20,000 ask decisions; every decile within 0.05, the aggregate within 0.01") and §3.3a item 1
 * reads first: calibration is the mechanism marker of the belief work, and it moves before any
 * win rate does (§7.4). Home only, because it needs the hands — abroad the same quantity is read
 * off the public log by the arm, hit or miss, and the two must agree in direction.
 *
 * Two readings, both over `us54` mirror games of the named Monet version (every seat plays it —
 * calibration is a property of a decision, not of an opponent):
 *
 *  1. **CHOSEN asks** — the probability the policy acted on, bucketed by decile, against whether
 *     the ask hit. This is the number a posterior will be judged by, so it is read on the arm as
 *     shipped, with the version's own `licenceLambda`.
 *  2. **The scorer ladder** — over EVERY legal ask at every ask decision: the refined probability
 *     the ranker starts from, on the whole population and on the licensed subsets, split by
 *     whether `knowledge.ts` still holds the constraint (`modelHoldsLicence`) or has dropped it,
 *     with the λ ladder on each subset under two rules — the SHIPPED rule (licence.ts: every live
 *     licence the model has not discharged) and the DROPPED-ONLY rule MONET.md §3.3a first asked
 *     for (condition only where `knowledge.ts` has dropped the constraint). That split is what
 *     decided where the conditioning belongs, and it is re-measured on every run rather than
 *     remembered: the held subset came out −0.0401 short on its own, which is why the shipped rule
 *     is the wider one (licence.ts header).
 *
 * Discipline: seeds `calib-<g>` with rotating start seats, disjoint from every fitting bank the
 * project has named (MONET.md §6.5); duplicate deals are irrelevant to a per-decision reading.
 * Deterministic: same tree, same arguments, same tables.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const { newGame, reduce, seatView, us54Config, legalActionsSummary, hashSeed, cardBook } = ENG
const {
  monetPolicy,
  isMonetVersion,
  MONET_VERSION_IDS,
  decide,
  buildKnowledge,
  askHitProbability,
  slotPriorHitProbability,
  refinedHitProbability,
  logLicences,
  licenceConditionedHitProbability,
  licenceNormaliser,
  modelHoldsLicence,
} = BOTS
const { legalAsksFromView } = await import(pathToFileURL(join(ROOT, 'lib/engine/helpers.ts')).href)

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const VERSION = argOf('--version', '')
if (!isMonetVersion(VERSION)) {
  console.error(
    `--version must name a Monet version (${MONET_VERSION_IDS.join(', ')}); got ${JSON.stringify(VERSION)}. The registry has no "latest" on purpose.`,
  )
  process.exit(2)
}
const GAMES = Number(argOf('--games', 300))
const LAMBDAS = argOf('--lambdas', '0,0.25,0.4,0.5,0.6,0.75,1').split(',').map(Number)
// An override is a JSON object of style keys laid over the version's vector, the way duplicate-pairs.mjs
// spells an ablation rung; the header names it so no table is read without it.
const OVERRIDE = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const POLICY = OVERRIDE
  ? Object.freeze({ skill: monetPolicy(VERSION).skill, style: Object.freeze({ ...monetPolicy(VERSION).style, ...OVERRIDE }) })
  : monetPolicy(VERSION)
const { skill, style } = POLICY
const SHIPPED_LAMBDA = style.licenceLambda ?? 0

/* ------------------------------------------------------------- accumulators --- */

const DECILES = 10
const chosen = Array.from({ length: DECILES }, () => ({ n: 0, believed: 0, realised: 0 }))
let chosenN = 0
let chosenBelieved = 0
let chosenRealised = 0

const mkSubset = () => ({
  n: 0,
  realised: 0,
  refined: 0,
  base: 0,
  shipped: LAMBDAS.map(() => 0),
  droppedOnly: LAMBDAS.map(() => 0),
})
const subsets = {
  all: mkSubset(),
  licensed: mkSubset(),
  'licensed, model holds constraint': mkSubset(),
  'licensed, model dropped it': mkSubset(),
  'licensed, discharged in model': mkSubset(),
  unlicensed: mkSubset(),
}

function record(sub, truth, base, refined, shippedP, droppedP) {
  sub.n++
  sub.realised += truth
  sub.refined += refined
  sub.base += base
  for (let i = 0; i < LAMBDAS.length; i++) {
    sub.shipped[i] += shippedP[i]
    sub.droppedOnly[i] += droppedP[i]
  }
}

/* ------------------------------------------------------------------- games --- */

let decisions = 0
let askDecisions = 0
const t0 = Date.now()
for (let g = 0; g < GAMES; g++) {
  const seed = `calib-${g}`
  let s = newGame(seed, us54Config, g % 6)
  let guard = 0
  while (s.phase !== 'finished') {
    if (guard++ >= 6000) throw new Error(`${seed}: step cap`)
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
    const action = decide(view, POLICY, moveSeed)
    decisions++
    if (!view.declareWindow && view.phase === 'playing' && action.type === 'ask') {
      askDecisions++
      const k = buildKnowledge(view, { useConstraints: skill.useConstraints, logWindow: skill.logWindow, marginal: style.pModel === 'marginal', choiceKappa: style.pModel === 'marginal' ? style.choiceKappa : undefined, choiceAdapt: style.pModel === 'marginal' ? style.choiceAdapt : undefined })
      const licences = logLicences(view, k)
      const zCache = new Map()
      const normaliser = (target, book) => {
        const key = `${target}:${book}`
        if (!zCache.has(key)) zCache.set(key, licenceNormaliser(view, k, target, book))
        return zCache.get(key)
      }
      for (const a of legalAsksFromView(view)) {
        const truth = s.hands[a.target].includes(a.card) ? 1 : 0
        // `base` is the slot prior whatever the model, so the ladder can be read against it on every
        // version; `refined` is the model's constrained number — the marginal on a v0.4a Knowledge.
        const base = slotPriorHitProbability(k, a.card, a.target)
        const refined = refinedHitProbability(k, a.card, a.target)
        const book = cardBook(a.card)
        const lic = licences(a.target).has(book)
        const z = lic ? normaliser(a.target, book) : null
        const discharged = lic && z === null
        const model = lic && !discharged && modelHoldsLicence(k, a.target, book)
        const shippedP = LAMBDAS.map((l) => licenceConditionedHitProbability(view, k, a.card, a.target, l, licences))
        // The rejected alternative: leave a licence alone while the model still holds its constraint.
        const droppedP = model ? LAMBDAS.map(() => refined) : shippedP
        record(subsets.all, truth, base, refined, shippedP, droppedP)
        if (!lic) record(subsets.unlicensed, truth, base, refined, shippedP, droppedP)
        else {
          record(subsets.licensed, truth, base, refined, shippedP, droppedP)
          if (discharged) record(subsets['licensed, discharged in model'], truth, base, refined, shippedP, droppedP)
          else if (model) record(subsets['licensed, model holds constraint'], truth, base, refined, shippedP, droppedP)
          else record(subsets['licensed, model dropped it'], truth, base, refined, shippedP, droppedP)
        }
      }
      // The chosen ask, at the number the policy acted on.
      const believed = skill.refinedInference
        ? licenceConditionedHitProbability(view, k, action.card, action.target, SHIPPED_LAMBDA, licences)
        : askHitProbability(k, action.card, action.target)
      const truth = s.hands[action.target].includes(action.card) ? 1 : 0
      const d = Math.min(DECILES - 1, Math.floor(believed * DECILES))
      chosen[d].n++
      chosen[d].believed += believed
      chosen[d].realised += truth
      chosenN++
      chosenBelieved += believed
      chosenRealised += truth
    }
    const r = reduce(s, action)
    if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
    s = r.state
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

/* ------------------------------------------------------------------ report --- */

const f4 = (x) => (Number.isFinite(x) ? x.toFixed(4) : '  -   ')
const sgn = (x) => (x >= 0 ? '+' : '') + x.toFixed(4)
console.log(`=== calibration: Monet ${VERSION}${OVERRIDE ? ' ' + JSON.stringify(OVERRIDE) : ''} (licenceLambda ${SHIPPED_LAMBDA}, pModel ${style.pModel ?? 'slot'}), ${GAMES} us54 mirror games, ${elapsed}s ===`)
console.log(`decisions ${decisions}   ask decisions ${askDecisions}   legal asks scored ${subsets.all.n}`)
console.log('')
console.log('--- 1. CHOSEN asks: the probability the policy acted on, per decile (MONET.md 3.4a item 1 bar: |believed - realised| < 0.05 per decile, < 0.01 aggregate) ---')
console.log('decile        n   believed  realised  believed-realised')
let worst = 0
for (let d = 0; d < DECILES; d++) {
  const c = chosen[d]
  const lo = (d / 10).toFixed(1)
  const hi = ((d + 1) / 10).toFixed(1)
  if (c.n === 0) {
    console.log(`[${lo},${hi})       0        -         -        -`)
    continue
  }
  const b = c.believed / c.n
  const r = c.realised / c.n
  worst = Math.max(worst, Math.abs(b - r))
  console.log(`[${lo},${hi}) ${String(c.n).padStart(7)}   ${f4(b)}   ${f4(r)}    ${sgn(b - r)}`)
}
const aggB = chosenBelieved / chosenN
const aggR = chosenRealised / chosenN
console.log(`aggregate  ${String(chosenN).padStart(7)}   ${f4(aggB)}   ${f4(aggR)}    ${sgn(aggB - aggR)}`)
const passes = worst < 0.05 && Math.abs(aggB - aggR) < 0.01
console.log(`worst decile |bias| ${worst.toFixed(4)}   aggregate |bias| ${Math.abs(aggB - aggR).toFixed(4)}   -> ${passes ? 'PASSES the 3.4a bar' : 'does NOT pass the 3.4a bar'}`)
console.log('')
console.log('--- 2. The scorer ladder over every legal ask (believed - realised; the refined column is lambda = 0, the shipped scorer before conditioning) ---')
for (const [name, sub] of Object.entries(subsets)) {
  if (sub.n === 0) {
    console.log(`${name}: n = 0`)
    continue
  }
  const r = sub.realised / sub.n
  console.log(`${name}:  n=${sub.n}  realised ${f4(r)}  slot-prior bias ${sgn(sub.base / sub.n - r)}  refined bias ${sgn(sub.refined / sub.n - r)}`)
  console.log('   lambda   ' + LAMBDAS.map((l) => l.toFixed(2).padStart(8)).join(''))
  console.log('   shipped  ' + LAMBDAS.map((_, i) => sgn(sub.shipped[i] / sub.n - r).padStart(8)).join(''))
  console.log('   dropped- ' + LAMBDAS.map((_, i) => sgn(sub.droppedOnly[i] / sub.n - r).padStart(8)).join(''))
}
