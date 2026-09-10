/**
 * probe-decision-sweep.mjs - MONET.md 3.8av's sweep S: the decision types nobody has priced.
 *
 *   node scripts/probe-decision-sweep.mjs [--games 300] [--version v0.33] [--label sweep]
 *                                         [--det 16] [--det-steps 24] [--stride 1] [--json out.json]
 *
 * Every rung on this ladder has studied the ask (3.8av D) or the declare's TIMING (3.8av C). This
 * prices what is left, on the same two readings D used so the numbers are comparable:
 *
 *   S1  which BOOK to declare      - ~7.6 a game, 5.6 legal options
 *   S2  which ASSIGNMENT to state  - ~7.6 a game; the hindsight-best assignment IS the true one, so
 *                                    it is measured with two rollouts rather than enumerating 361
 *   S3  which teammate to PASS to  - ~0.3 a game, forced 37% of the time
 *
 * `designate` is not swept: the census found it occurs ZERO times in 300 games (`reduce` reaches
 * `awaitDesignate` only when the claimant's whole team is out, which does not happen in us54).
 *
 * Both readings, per decision:
 *   HINDSIGHT ceiling - the best legal option under the true deal and the true continuation. An upper
 *                       bound; a real policy can never have it (3.8av, and the rollout is
 *                       deterministic in its key so this is an exact maximum, not an inflated one).
 *   BELIEF-LIMITED    - the option a perfect search picks scoring each on `det` determinizations drawn
 *                       from the bot's OWN belief, then evaluated against the true deal. The
 *                       achievable number, and the one the bars are scored on.
 */
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const MON = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/monet.ts').href)
const BOTS = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/index.ts').href)
const S = await import(pathToFileURL(process.cwd() + '/lib/engine/search/index.ts').href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce, allBooks, mulberry32 } = ENG

const argOf = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : d }
const GAMES = Number(argOf('--games', 300))
const VERSION = argOf('--version', 'v0.33')
const LABEL = argOf('--label', 'sweep')
const DET = Number(argOf('--det', 16))
const DETSTEPS = Number(argOf('--det-steps', 24))
const STRIDE = Number(argOf('--stride', 1))
const JSONOUT = argOf('--json', '')
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null

const pol0 = MON.monetPolicy(VERSION)
const pol = OVER ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...OVER }) }) : pol0
const { skill, style } = BOTS.resolvePolicy(pol)
const marginal = style.pModel === 'marginal'
const KOPTS = {
  logWindow: skill.logWindow,
  useConstraints: skill.useConstraints,
  marginal,
  choiceKappa: marginal ? style.choiceKappa : undefined,
  choiceAdapt: marginal ? style.choiceAdapt : undefined,
  choicePrior: marginal ? style.choicePrior : undefined,
}
const team = (seat) => seat % 2
const END = 5000
const ALL_SEATS = [0, 1, 2, 3, 4, 5]

function stat(xs) {
  const n = xs.length
  if (n === 0) return { n, mean: NaN, sd: NaN, se: NaN }
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const v = n > 1 ? xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1) : 0
  return { n, mean, sd: Math.sqrt(v), se: Math.sqrt(v / n) }
}
const fmt = (t) => (t.n === 0 ? '—' : `${t.mean >= 0 ? '+' : ''}${t.mean.toFixed(3)} (SE ${t.se.toFixed(3)}, n ${t.n})`)
const verdict = (t) => (t.n < 20 ? 'NOT SCOREABLE (n < 20)' : (t.mean - 2 * t.se > 0 ? 'HOLDS' : 'MISSES'))

const R = {
  s1HindEnd: [], s1Hind24: [], s1BelEnd: [], s1Bel24: [],
  s2HindEnd: [], s2Hind24: [],
  s3HindEnd: [], s3Hind24: [], s3BelEnd: [], s3Bel24: [],
}
let declares = 0, s1n = 0, s1opts = 0, s1BelIsPlayed = 0, s1BelFoundHind = 0, s1HindIsPlayed = 0
let s2n = 0, s2PlanRight = 0, s2TrueLegal = 0
let passes = 0, s3n = 0, s3BelIsPlayed = 0
let rollouts = 0
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
    const key = `${seed}:true`
    const roll = (act, steps) => {
      const r = reduce(s, act)
      if (!r.ok) return null
      rollouts++
      return S.rollout(r.state, pol, key, steps, team(seat), 0, 0)
    }

    if (a.type === 'claim') {
      declares++
      const vPlayedEnd = roll(a, END), vPlayed24 = roll(a, 24)

      // ---- S2: the assignment. The hindsight-best assignment is the TRUE one; no enumeration needed.
      const trueAssign = {}
      let allOnTeam = true
      for (const c of Object.keys(a.assignments)) {
        const h = s.hands.findIndex((hh) => hh.includes(c))
        if (h < 0 || team(h) !== team(seat)) { allOnTeam = false; break }
        trueAssign[c] = h
      }
      if (allOnTeam) {
        const trueClaim = { type: 'claim', seat, book: a.book, assignments: trueAssign }
        if (reduce(s, trueClaim).ok) {
          s2TrueLegal++
          const te = roll(trueClaim, END), t2 = roll(trueClaim, 24)
          if (te !== null && vPlayedEnd !== null) {
            s2n++
            R.s2HindEnd.push(te - vPlayedEnd); R.s2Hind24.push(t2 - vPlayed24)
            if (Object.keys(a.assignments).every((c) => a.assignments[c] === trueAssign[c])) s2PlanRight++
          }
        }
      }

      // ---- S1: which book. Every unresolved book with a legal plan is a candidate.
      if (declares % STRIDE === 0) {
        const opts = []
        for (const b of allBooks(view.config)) {
          if (view.books[b]) continue
          let plan
          try { plan = BOTS.planClaimFor(view, pol, b) } catch { continue }
          if (!plan) continue
          const act = { type: 'claim', seat, book: b, assignments: plan.assignments }
          if (reduce(s, act).ok) opts.push(act)
        }
        if (opts.length > 1 && vPlayedEnd !== null) {
          s1n++; s1opts += opts.length
          let bEnd = vPlayedEnd, b24 = vPlayed24, bAct = a
          for (const act of opts) {
            const ve = roll(act, END)
            if (ve === null) continue
            const v2 = roll(act, 24)
            if (ve > bEnd) { bEnd = ve; bAct = act }
            if (v2 > b24) b24 = v2
          }
          R.s1HindEnd.push(bEnd - vPlayedEnd); R.s1Hind24.push(b24 - vPlayed24)
          if (bAct.book === a.book) s1HindIsPlayed++

          // belief-limited: score every option on DET determinizations from the bot's own belief
          const k = BOTS.buildKnowledge(view, KOPTS)
          const rng = mulberry32(seed)
          const sums = opts.map(() => 0)
          let drawn = 0
          for (let d = 0; d < DET; d++) {
            const hands = S.sampleDeal(view, k, rng)
            if (hands === null) continue
            drawn++
            const base = S.stateFromView(view, hands)
            for (let i = 0; i < opts.length; i++) {
              const rr = reduce(base, opts[i])
              if (!rr.ok) { sums[i] -= 99; continue }
              rollouts++
              sums[i] += S.rollout(rr.state, pol, `${seed}:${d}`, DETSTEPS, team(seat), 0, 0)
            }
          }
          if (drawn > 0) {
            let bi = 0
            for (let i = 1; i < sums.length; i++) if (sums[i] > sums[bi]) bi = i
            const ve = roll(opts[bi], END), v2 = roll(opts[bi], 24)
            if (ve !== null) {
              R.s1BelEnd.push(ve - vPlayedEnd); R.s1Bel24.push(v2 - vPlayed24)
              if (opts[bi].book === a.book) s1BelIsPlayed++
              if (opts[bi].book === bAct.book) s1BelFoundHind++
            }
          }
        }
      }
    }

    // ---- S3: the pass. A teammate with cards; often only one, which is not a decision.
    if (a.type === 'pass') {
      passes++
      const opts = ALL_SEATS.filter((t) => t !== seat && team(t) === team(seat) && s.hands[t].length > 0)
        .map((to) => ({ type: 'pass', seat, to }))
      if (opts.length > 1) {
        const vpEnd = roll(a, END), vp24 = roll(a, 24)
        if (vpEnd !== null) {
          s3n++
          let bEnd = vpEnd, b24 = vp24
          for (const act of opts) {
            const ve = roll(act, END)
            if (ve === null) continue
            const v2 = roll(act, 24)
            if (ve > bEnd) bEnd = ve
            if (v2 > b24) b24 = v2
          }
          R.s3HindEnd.push(bEnd - vpEnd); R.s3Hind24.push(b24 - vp24)
          const k = BOTS.buildKnowledge(view, KOPTS)
          const rng = mulberry32(seed)
          const sums = opts.map(() => 0)
          let drawn = 0
          for (let d = 0; d < DET; d++) {
            const hands = S.sampleDeal(view, k, rng)
            if (hands === null) continue
            drawn++
            const base = S.stateFromView(view, hands)
            for (let i = 0; i < opts.length; i++) {
              const rr = reduce(base, opts[i])
              if (!rr.ok) { sums[i] -= 99; continue }
              rollouts++
              sums[i] += S.rollout(rr.state, pol, `${seed}:${d}`, DETSTEPS, team(seat), 0, 0)
            }
          }
          if (drawn > 0) {
            let bi = 0
            for (let i = 1; i < sums.length; i++) if (sums[i] > sums[bi]) bi = i
            const ve = roll(opts[bi], END), v2 = roll(opts[bi], 24)
            if (ve !== null) {
              R.s3BelEnd.push(ve - vpEnd); R.s3Bel24.push(v2 - vp24)
              if (opts[bi].to === a.to) s3BelIsPlayed++
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
const T = {}
for (const k of Object.keys(R)) T[k] = stat(R[k])

console.log(`=== probe-decision-sweep: ${VERSION}, ${GAMES} games (${LABEL}-*), det ${DET} at ${DETSTEPS} steps, ${secs.toFixed(1)}s, ${rollouts} rollouts ===`)
console.log(`declares ${declares} (${(declares / GAMES).toFixed(1)} a game); passes ${passes} (${(passes / GAMES).toFixed(2)} a game)`)
console.log('')
console.log('| decision | reading | to the END | 24 steps |')
console.log('|---|---|---:|---:|')
console.log(`| **S1** which BOOK to declare (n ${s1n}, mean ${(s1opts / Math.max(1, s1n)).toFixed(1)} options) | hindsight ceiling | ${fmt(T.s1HindEnd)} | ${fmt(T.s1Hind24)} |`)
console.log(`| | **belief-limited** | **${fmt(T.s1BelEnd)}** | ${fmt(T.s1Bel24)} |`)
console.log(`| **S2** which ASSIGNMENT (n ${s2n}) | hindsight ceiling (the TRUE assignment) | **${fmt(T.s2HindEnd)}** | ${fmt(T.s2Hind24)} |`)
console.log(`| **S3** which teammate to PASS to (n ${s3n}) | hindsight ceiling | ${fmt(T.s3HindEnd)} | ${fmt(T.s3Hind24)} |`)
console.log(`| | **belief-limited** | **${fmt(T.s3BelEnd)}** | ${fmt(T.s3Bel24)} |`)
console.log('')
console.log(`S1: ${verdict(T.s1BelEnd)}  (belief-limited to the end must be above zero by 2 SE)`)
console.log(`S2: ${verdict(T.s2HindEnd)}  (scored on the HINDSIGHT ceiling -- if the ceiling misses, the achievable number cannot hold)`)
console.log(`S3: ${verdict(T.s3BelEnd)}  (belief-limited to the end must be above zero by 2 SE)`)
console.log('')
console.log(`S1 diagnostics: the hindsight-best book IS the one played on ${s1HindIsPlayed} of ${s1n} (${(100 * s1HindIsPlayed / Math.max(1, s1n)).toFixed(1)}%); the belief search re-played it on ${s1BelIsPlayed} (${(100 * s1BelIsPlayed / Math.max(1, s1n)).toFixed(1)}%) and found the hindsight-best on ${s1BelFoundHind} (${(100 * s1BelFoundHind / Math.max(1, s1n)).toFixed(1)}%)`)
console.log(`S2 diagnostics: the true assignment was legal (whole book on the team) on ${s2TrueLegal} of ${declares} declares; the played assignment was exactly right on ${s2PlanRight} of ${s2n} (${(100 * s2PlanRight / Math.max(1, s2n)).toFixed(1)}%)`)
console.log(`S3 diagnostics: the belief search re-played the pass on ${s3BelIsPlayed} of ${s3n}`)

if (JSONOUT) {
  fs.writeFileSync(JSONOUT, JSON.stringify({
    version: VERSION, games: GAMES, label: LABEL, det: DET, detSteps: DETSTEPS, secs, rollouts,
    declares, passes, s1n, s1opts, s1HindIsPlayed, s1BelIsPlayed, s1BelFoundHind,
    s2n, s2TrueLegal, s2PlanRight, s3n, s3BelIsPlayed, stats: T,
  }, null, 2))
  console.log(`\n-> ${JSONOUT}`)
}
