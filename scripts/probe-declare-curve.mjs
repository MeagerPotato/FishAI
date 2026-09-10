/**
 * probe-declare-curve.mjs - MONET.md 3.8av instrument C: the whole declare-threshold curve at once.
 *
 *   node scripts/probe-declare-curve.mjs [--games 60] [--version v0.33] [--label curve]
 *                                        [--override '{...}'] [--json out.json]
 *
 * 3.8al closed the claim line at ONE dose (`k98`, declareThreshold 0.98) with a play-out. This prices
 * every dose. At a declare-window decision where the stack DECLINES, `planClaimFor` is run over every
 * unresolved set - the same planner the declare branch itself uses, so the p is the bot's own - and
 * the highest-p legal plan is rolled out as a declare against the decline it actually played, paired
 * from the TRUE deal. The difference is binned by p, so the readout is the advantage of declaring as
 * a function of belief: a threshold is worth moving only where that advantage is positive.
 *
 * The window re-polls all six seats after every resolution, so the same plan is re-offered many times
 * from what is effectively one position. Observations are DEDUPED to one per (seat, book) per
 * book-resolution epoch; without that, n counts one decision dozens of times and every SE is a lie.
 *
 * Two horizons, as in 3.8av's instrument D: to the END (a true sets-a-game number on 3.8at's
 * exchange-rate axis) and at 24 steps (the search's unit). The rollout is deterministic in its key
 * (3.8av), so the pairing is exact and repeated keys buy nothing.
 */
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const MON = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/monet.ts').href)
const BOTS = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/index.ts').href)
const S = await import(pathToFileURL(process.cwd() + '/lib/engine/search/index.ts').href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce, allBooks } = ENG

const argOf = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : d }
const GAMES = Number(argOf('--games', 60))
const VERSION = argOf('--version', 'v0.33')
const LABEL = argOf('--label', 'curve')
const JSONOUT = argOf('--json', '')
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null

const pol0 = MON.monetPolicy(VERSION)
const pol = OVER ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...OVER }) }) : pol0
const { style } = BOTS.resolvePolicy(pol)
const BAR = style.declareThreshold
const team = (seat) => seat % 2
const END = 5000

function stat(xs) {
  const n = xs.length
  if (n === 0) return { n, mean: NaN, sd: NaN, se: NaN }
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const v = n > 1 ? xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1) : 0
  return { n, mean, sd: Math.sqrt(v), se: Math.sqrt(v / n) }
}
const fmt = (t) => (t.n === 0 ? '—' : `${t.mean >= 0 ? '+' : ''}${t.mean.toFixed(3)} (SE ${t.se.toFixed(3)})`)

// bins: the ten deciles of p, so the curve is read where the bar actually sits (0.775 for v0.33)
const EDGES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.775, 0.9, 1.0001]
const binOf = (p) => { let i = 0; while (i < EDGES.length - 2 && p >= EDGES[i + 1]) i++; return i }
const binsEnd = EDGES.slice(0, -1).map(() => []), bins24 = EDGES.slice(0, -1).map(() => [])
// 3.8av C3: per bin, the REALISED correctness against the stated p, and the right/wrong split of the
// advantage. The curve alone cannot separate "p is over-confident here" from "a high-p plan sits on a
// set worth more, so being wrong about it costs more"; these two columns do.
const binOK = EDGES.slice(0, -1).map(() => 0), binP = EDGES.slice(0, -1).map(() => [])
const binRight = EDGES.slice(0, -1).map(() => []), binWrong = EDGES.slice(0, -1).map(() => [])
const allEnd = [], all24 = []
const rightEnd = [], wrongEnd = []   // split by whether the plan was in fact correct
let declines = 0, legalPlans = 0, observations = 0, planRight = 0
let rollouts = 0
const seen = new Set()
const t0 = Date.now()

for (let g = 0; g < GAMES; g++) {
  const label = `${LABEL}-${g}`
  let s = newGame(label, us54Config, 0)
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const seed = hashSeed(`${label}:${s.moveIndex}`)()
    const a = ENG.decide(view, pol, seed)

    if (view.declareWindow && a.type === 'decline') {
      declines++
      let best = null
      for (const b of allBooks(view.config)) {
        if (view.books[b]) continue
        let plan
        try { plan = BOTS.planClaimFor(view, pol, b) } catch { continue }
        if (!plan || !(plan.p > 0)) continue
        if (best === null || plan.p > best.p) best = plan
      }
      if (best) {
        const claim = { type: 'claim', seat, book: best.book, assignments: best.assignments }
        if (reduce(s, claim).ok) {
          legalPlans++
          const epoch = allBooks(view.config).filter((b) => view.books[b]).length
          const kk = `${g}:${seat}:${best.book}:${epoch}`
          if (!seen.has(kk)) {
            seen.add(kk)
            observations++
            const key = `${seed}:true`
            const roll = (act, steps) => {
              const r = reduce(s, act)
              if (!r.ok) return null
              rollouts++
              return S.rollout(r.state, pol, key, steps, team(seat), 0, 0)
            }
            const ve = roll(claim, END), vd = roll(a, END)
            const ve2 = roll(claim, 24), vd2 = roll(a, 24)
            if (ve !== null && vd !== null) {
              const d = ve - vd, d2 = ve2 - vd2
              const bi = binOf(best.p)
              binsEnd[bi].push(d); bins24[bi].push(d2)
              allEnd.push(d); all24.push(d2)
              // was the plan actually right? every stated location matches the true holder
              const ok = Object.entries(best.assignments).every(([c, sd]) => s.hands[sd].includes(c))
              if (ok) { planRight++; rightEnd.push(d); binOK[bi]++; binRight[bi].push(d) } else { wrongEnd.push(d); binWrong[bi].push(d) }
              binP[bi].push(best.p)
            }
          }
        }
      }
    }

    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${label}: ${r.error.code} at ${s.moveIndex}`)
    s = r.state
  }
}
const secs = (Date.now() - t0) / 1000
console.log(`=== probe-declare-curve: ${VERSION}${OVER ? ' ' + JSON.stringify(OVER) : ''}, ${GAMES} games (${LABEL}-*), ${secs.toFixed(1)}s, ${rollouts} rollouts ===`)
console.log(`declines ${declines}; with a legal declare ${legalPlans}; observations after deduping to one per (seat, book) per book-resolution epoch ${observations} (${(observations / GAMES).toFixed(1)} a game)`)
console.log(`the bar this vector plays: declareThreshold ${BAR} (stalled ${style.declareThresholdStalled}, declareMaxUncertain ${style.declareMaxUncertain})`)
console.log('')
console.log('THE CURVE — the advantage of declaring NOW over what it actually did, by the plan\'s own p')
console.log('| p bin | n | to the END | 24 steps |')
console.log('|---|---:|---:|---:|')
const rows = []
for (let i = 0; i < binsEnd.length; i++) {
  const lo = EDGES[i], hi = EDGES[i + 1]
  const te = stat(binsEnd[i]), t2 = stat(bins24[i])
  const mark = lo >= BAR ? ' (above the bar)' : ''
  console.log(`| ${lo.toFixed(3)}–${Math.min(1, hi).toFixed(3)}${mark} | ${te.n} | ${fmt(te)} | ${fmt(t2)} |`)
  rows.push({ lo, hi: Math.min(1, hi), n: te.n, end: te, s24: t2 })
}
console.log('')
console.log('C3 — IS p CALIBRATED WHERE IT DECIDES? realised correctness against stated p, by bin')
console.log('| p bin | n | mean stated p | realised correct | gap (realised − stated) | when RIGHT | when WRONG |')
console.log('|---|---:|---:|---:|---:|---:|---:|')
const c3rows = []
for (let i = 0; i < binsEnd.length; i++) {
  const lab = `${EDGES[i].toFixed(3)}–${Math.min(1, EDGES[i + 1]).toFixed(3)}`
  const n = binsEnd[i].length
  if (n === 0) { console.log(`| ${lab} | 0 | — | — | — | — | — |`); continue }
  const ps = stat(binP[i]).mean
  const q = binOK[i] / n
  const gap = q - ps
  const se = Math.sqrt(Math.max(q * (1 - q), 1e-9) / n)
  console.log(`| ${lab} | ${n} | ${ps.toFixed(3)} | ${q.toFixed(3)} (SE ${se.toFixed(3)}) | ${gap >= 0 ? '+' : ''}${gap.toFixed(3)} | ${fmt(stat(binRight[i]))} | ${fmt(stat(binWrong[i]))} |`)
  c3rows.push({ lo: EDGES[i], hi: Math.min(1, EDGES[i + 1]), n, statedP: ps, realised: q, gap, se, right: stat(binRight[i]), wrong: stat(binWrong[i]) })
}
// C3 is scored only between 0.4 and the bar -- the region that decides the threshold, named in advance
const scoreable = c3rows.filter((r) => r.lo >= 0.4 && r.hi <= BAR && r.n >= 20)
const shortBy10 = scoreable.filter((r) => r.gap <= -0.10 && r.realised + 2 * r.se < r.statedP - 0.10)
console.log('')
if (scoreable.length === 0) {
  console.log('C3: no bin between 0.4 and the bar carries n >= 20 — C3 CANNOT BE SCORED at this sample size.')
} else if (shortBy10.length > 0) {
  console.log(`C3 HOLDS on ${shortBy10.length} of ${scoreable.length} scoreable bins: ${shortBy10.map((r) => `${r.lo.toFixed(2)}–${r.hi.toFixed(2)} stated ${r.statedP.toFixed(3)} realised ${r.realised.toFixed(3)}`).join('; ')}`)
} else {
  console.log(`C3 MISSES: no bin between 0.4 and the bar falls short of its stated p by >= 0.10 at 2 SE (${scoreable.map((r) => `${r.lo.toFixed(2)}–${r.hi.toFixed(2)} gap ${r.gap.toFixed(3)}`).join('; ')}).`)
}

console.log('')
console.log(`pooled over every observation: to the END ${fmt(stat(allEnd))}, 24 steps ${fmt(stat(all24))}`)
console.log(`the plan was in fact correct on ${planRight} of ${observations} (${(100 * planRight / Math.max(1, observations)).toFixed(1)}%)`)
console.log(`  declaring when the plan was RIGHT : ${fmt(stat(rightEnd))} (n ${rightEnd.length})`)
console.log(`  declaring when the plan was WRONG : ${fmt(stat(wrongEnd))} (n ${wrongEnd.length})`)
const best = rows.filter((r) => r.n >= 20 && r.end.mean - 2 * r.end.se > 0).sort((x, y) => y.end.mean - x.end.mean)[0]
console.log('')
console.log(best
  ? `C1: a bin clears zero at 2 SE — ${best.lo.toFixed(3)}–${best.hi.toFixed(3)} at ${fmt(best.end)} over n ${best.n}. C1 HOLDS if that is >= +0.05.`
  : 'C1: NO bin with n >= 20 clears zero at 2 SE. C1 MISSES — the threshold is at its optimum and no dose is available.')

if (JSONOUT) {
  fs.writeFileSync(JSONOUT, JSON.stringify({
    version: VERSION, override: OVER, games: GAMES, label: LABEL, secs, rollouts, bar: BAR,
    declines, legalPlans, observations, planRight, rows,
    pooledEnd: stat(allEnd), pooled24: stat(all24), right: stat(rightEnd), wrong: stat(wrongEnd), c3rows,
  }, null, 2))
  console.log(`\n-> ${JSONOUT}`)
}
