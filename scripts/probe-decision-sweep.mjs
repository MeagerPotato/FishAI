/**
 * probe-decision-sweep.mjs - MONET.md 3.8av's sweep S: the decision types nobody has priced.
 *
 *   node scripts/probe-decision-sweep.mjs [--games 300] [--version v0.33] [--label sweep]
 *        [--det 16] [--det-steps 24] [--stride 1] [--only s1,s2,s3] [--split 0] [--json out.json]
 *
 * Every rung on this ladder has studied the ask (3.8av D) or the declare's TIMING (3.8av C). This
 * prices what is left, on the same two readings D used so the numbers are comparable:
 *
 *   S1  which BOOK to declare      - ~7.6 a game, 5.6 legal options
 *   S2  which ASSIGNMENT to state  - ~7.6 a game; the hindsight-best assignment IS the true one, so
 *                                    its ceiling is measured with two rollouts rather than enumerating
 *   S2b the BELIEF-LIMITED assignment - S2's registered bar is scored on this, which S's first run did
 *                                    not collect (3.8av's S completion)
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
 *                       achievable number, and the one every bar is scored on.
 *
 * --only   a comma-separated subset of s1,s2,s2b,s3. The default, s1,s2,s3, is S's first run unchanged.
 * --split N  also report every figure over games 0..N-1, so a completion over more games shows the
 *          registered first run reproducing inside it.
 *
 * Exact-zero shortcuts, each justified by determinism: when the option compared is the SAME action as
 * the one played, both rollouts are identical and the difference is exactly 0, so it is recorded as 0
 * without rolling. No number changes; only the rollout count does.
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
const SPLIT = Number(argOf('--split', 0))
const ONLY = new Set(argOf('--only', 's1,s2,s3').split(',').map((x) => x.trim()).filter(Boolean))
for (const x of ONLY) if (!['s1', 's2', 's2b', 's3'].includes(x)) throw new Error(`--only: unknown part ${x}`)
const JSONOUT = argOf('--json', '')
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const CAP = 64

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
const fmt = (t) => (t.n === 0 ? '—' : `${t.mean >= 0 ? '+' : ''}${t.mean.toFixed(4)} (SE ${t.se.toFixed(4)}, n ${t.n})`)
const verdict = (t) => (t.n < 20 ? 'NOT SCOREABLE (n < 20)' : (t.mean - 2 * t.se > 0 ? 'HOLDS' : 'MISSES'))

const KEYS = ['s1HindEnd', 's1Hind24', 's1BelEnd', 's1Bel24', 's2HindEnd', 's2Hind24', 's2BelEnd', 's2Bel24', 's3HindEnd', 's3Hind24', 's3BelEnd', 's3Bel24']
const R = Object.fromEntries(KEYS.map((k) => [k, []]))
const R0 = Object.fromEntries(KEYS.map((k) => [k, []]))
let curGame = 0
const push = (k, v) => { R[k].push(v); if (SPLIT > 0 && curGame < SPLIT) R0[k].push(v) }

let declares = 0, s1n = 0, s1opts = 0, s1BelIsPlayed = 0, s1BelFoundHind = 0, s1HindIsPlayed = 0
let s2n = 0, s2PlanRight = 0, unfixable = 0, certainWrong = 0
let s2bSearched = 0, s2bCapped = 0, s2bChanged = 0, s2bChangedToRight = 0, s2bBrokeRight = 0
let passes = 0, s3n = 0, s3BelIsPlayed = 0
let rollouts = 0

// declared-plan calibration, an unscored diagnostic: the bot's own p for the book it declared, against
// whether the declare was right, split by whether any card was uncertain (more than one candidate)
const EDGES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.775, 0.9, 1.0001]
const binOf = (p) => { let i = 0; while (i < EDGES.length - 2 && p >= EDGES[i + 1]) i++; return i }
const cal = {
  certain: EDGES.slice(0, -1).map(() => ({ n: 0, ok: 0, p: 0 })),
  uncertain: EDGES.slice(0, -1).map(() => ({ n: 0, ok: 0, p: 0 })),
}
const t0 = Date.now()

for (let g = 0; g < GAMES; g++) {
  curGame = g
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
    // the played action's two values, computed once and only if some part needs them
    let pEnd, p24
    const played = () => {
      if (pEnd === undefined) { pEnd = roll(a, END); p24 = roll(a, 24) }
      return pEnd
    }

    if (a.type === 'claim') {
      declares++
      const cards = Object.keys(a.assignments)
      const holderOf = (c) => s.hands.findIndex((hh) => hh.includes(c))
      const playedRight = cards.every((c) => holderOf(c) === a.assignments[c])
      const k = BOTS.buildKnowledge(view, KOPTS)
      const anyUncertain = cards.some((c) => (k.cands[c] ?? []).length > 1)
      if (!anyUncertain && !playedRight) certainWrong++

      let plan = null
      try { plan = BOTS.planClaimFor(view, pol, a.book) } catch { plan = null }
      if (plan && Number.isFinite(plan.p)) {
        const row = (anyUncertain ? cal.uncertain : cal.certain)[binOf(plan.p)]
        row.n++; row.p += plan.p; if (playedRight) row.ok++
      }

      // ---- S2 / S2b population: declares whose TRUE assignment is legal (the whole book on the team)
      const trueAssign = {}
      let allOnTeam = true
      for (const c of cards) {
        const h = holderOf(c)
        if (h < 0 || team(h) !== team(seat)) { allOnTeam = false; break }
        trueAssign[c] = h
      }
      const trueClaim = allOnTeam ? { type: 'claim', seat, book: a.book, assignments: trueAssign } : null
      const inS2 = trueClaim !== null && reduce(s, trueClaim).ok
      if (!inS2) unfixable++
      if (inS2 && (ONLY.has('s2') || ONLY.has('s2b'))) {
        s2n++
        if (playedRight) s2PlanRight++

        if (ONLY.has('s2')) {
          if (playedRight) { push('s2HindEnd', 0); push('s2Hind24', 0) } else {
            const pe = played()
            push('s2HindEnd', roll(trueClaim, END) - pe); push('s2Hind24', roll(trueClaim, 24) - p24)
          }
        }

        if (ONLY.has('s2b')) {
          const same = (x, y) => cards.every((c) => x[c] === y[c])
          const choices = cards.map((c) => {
            const mates = (k.cands[c] ?? []).filter((t) => team(t) === team(seat))
            if (mates.length <= 1) return [a.assignments[c]]
            return mates.includes(a.assignments[c]) ? mates : [a.assignments[c], ...mates]
          })
          let opts = [{}]
          let capped = false
          for (let i = 0; i < cards.length; i++) {
            const next = []
            for (const o of opts) for (const t of choices[i]) next.push({ ...o, [cards[i]]: t })
            if (next.length > CAP) { capped = true; opts = next.slice(0, CAP) } else opts = next
          }
          if (capped) s2bCapped++
          if (!opts.some((o) => same(o, a.assignments))) opts[opts.length - 1] = { ...a.assignments }
          const pi = opts.findIndex((o) => same(o, a.assignments))
          let ci = pi
          if (opts.length > 1) {
            s2bSearched++
            const rng = mulberry32(seed)
            const sums = opts.map(() => 0)
            let drawn = 0
            for (let d = 0; d < DET; d++) {
              const hands = S.sampleDeal(view, k, rng)
              if (hands === null) continue
              drawn++
              const base = S.stateFromView(view, hands)
              for (let i = 0; i < opts.length; i++) {
                const rr = reduce(base, { type: 'claim', seat, book: a.book, assignments: opts[i] })
                if (!rr.ok) { sums[i] -= 99; continue }
                rollouts++
                sums[i] += S.rollout(rr.state, pol, `${seed}:${d}`, DETSTEPS, team(seat), 0, 0)
              }
            }
            // argmax with ties to the PLAYED assignment, so an indifferent search is an exact no-op
            if (drawn > 0) for (let i = 0; i < sums.length; i++) if (sums[i] > sums[ci]) ci = i
          }
          if (ci === pi) { push('s2BelEnd', 0); push('s2Bel24', 0) } else {
            s2bChanged++
            const chosen = { type: 'claim', seat, book: a.book, assignments: opts[ci] }
            const pe = played()
            push('s2BelEnd', roll(chosen, END) - pe); push('s2Bel24', roll(chosen, 24) - p24)
            if (cards.every((c) => holderOf(c) === opts[ci][c])) s2bChangedToRight++
            if (playedRight) s2bBrokeRight++
          }
        }
      }

      // ---- S1: which book. Every unresolved book with a legal plan is a candidate.
      if (ONLY.has('s1') && declares % STRIDE === 0) {
        const opts = []
        for (const b of allBooks(view.config)) {
          if (view.books[b]) continue
          let pl
          try { pl = BOTS.planClaimFor(view, pol, b) } catch { continue }
          if (!pl) continue
          const act = { type: 'claim', seat, book: b, assignments: pl.assignments }
          if (reduce(s, act).ok) opts.push(act)
        }
        const pe = opts.length > 1 ? played() : null
        if (opts.length > 1 && pe !== null) {
          s1n++; s1opts += opts.length
          let bEnd = pe, b24 = p24, bAct = a
          for (const act of opts) {
            const ve = roll(act, END)
            if (ve === null) continue
            const v2 = roll(act, 24)
            if (ve > bEnd) { bEnd = ve; bAct = act }
            if (v2 > b24) b24 = v2
          }
          push('s1HindEnd', bEnd - pe); push('s1Hind24', b24 - p24)
          if (bAct.book === a.book) s1HindIsPlayed++

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
              push('s1BelEnd', ve - pe); push('s1Bel24', v2 - p24)
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
      if (ONLY.has('s3') && opts.length > 1) {
        const vpEnd = played(), vp24 = p24
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
          push('s3HindEnd', bEnd - vpEnd); push('s3Hind24', b24 - vp24)
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
              push('s3BelEnd', ve - vpEnd); push('s3Bel24', v2 - vp24)
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
const T = Object.fromEntries(KEYS.map((k) => [k, stat(R[k])]))
const T0 = Object.fromEntries(KEYS.map((k) => [k, stat(R0[k])]))
const pct = (x, y) => `${(100 * x / Math.max(1, y)).toFixed(2)}%`

console.log(`=== probe-decision-sweep: ${VERSION}, ${GAMES} games (${LABEL}-*), parts ${[...ONLY].join(',')}, det ${DET} at ${DETSTEPS} steps, ${secs.toFixed(1)}s, ${rollouts} rollouts ===`)
console.log(`declares ${declares} (${(declares / GAMES).toFixed(1)} a game); passes ${passes} (${(passes / GAMES).toFixed(2)} a game)`)
console.log('')
console.log(SPLIT > 0 ? `| decision | reading | to the END, all ${GAMES} games | 24 steps, all | to the END, games 0-${SPLIT - 1} |` : '| decision | reading | to the END | 24 steps |')
console.log(SPLIT > 0 ? '|---|---|---:|---:|---:|' : '|---|---|---:|---:|')
const row = (name, reading, kEnd, k24) => {
  const cells = [fmt(T[kEnd]), fmt(T[k24])]
  if (SPLIT > 0) cells.push(fmt(T0[kEnd]))
  console.log(`| ${name} | ${reading} | ${cells.join(' | ')} |`)
}
if (ONLY.has('s1')) {
  row(`**S1** which BOOK (n ${s1n}, mean ${(s1opts / Math.max(1, s1n)).toFixed(1)} options)`, 'hindsight ceiling', 's1HindEnd', 's1Hind24')
  row('', '**belief-limited**', 's1BelEnd', 's1Bel24')
}
if (ONLY.has('s2')) row(`**S2** which ASSIGNMENT (n ${s2n})`, 'hindsight ceiling (the TRUE assignment)', 's2HindEnd', 's2Hind24')
if (ONLY.has('s2b')) row(ONLY.has('s2') ? '' : `**S2** which ASSIGNMENT (n ${s2n})`, '**belief-limited (S2b)**', 's2BelEnd', 's2Bel24')
if (ONLY.has('s3')) {
  row(`**S3** which teammate to PASS to (n ${s3n})`, 'hindsight ceiling', 's3HindEnd', 's3Hind24')
  row('', '**belief-limited**', 's3BelEnd', 's3Bel24')
}

const verdicts = (TT, prefix) => {
  if (ONLY.has('s1')) console.log(`${prefix}S1: ${verdict(TT.s1BelEnd)}  (belief-limited, to the end, above zero by 2 SE)`)
  if (ONLY.has('s2b')) console.log(`${prefix}S2: ${verdict(TT.s2BelEnd)}  (belief-limited S2b, to the end, above zero by 2 SE -- the registered bar)`)
  else if (ONLY.has('s2')) console.log(`${prefix}S2: NOT SCORED -- only the hindsight ceiling was collected (${fmt(TT.s2HindEnd)}). A ceiling at or below zero would CLOSE S2; one above zero does not score it. Run with --only s2b.`)
  if (ONLY.has('s3')) console.log(`${prefix}S3: ${verdict(TT.s3BelEnd)}  (belief-limited, to the end, above zero by 2 SE)`)
}
console.log('')
verdicts(T, SPLIT > 0 ? `all ${GAMES} games -- ` : '')
if (SPLIT > 0) verdicts(T0, `games 0-${SPLIT - 1} -- `)

console.log('')
if (ONLY.has('s1')) console.log(`S1 diagnostics: the hindsight-best book IS the one played on ${s1HindIsPlayed} of ${s1n} (${pct(s1HindIsPlayed, s1n)}); the belief search re-played it on ${s1BelIsPlayed} (${pct(s1BelIsPlayed, s1n)}) and found the hindsight-best on ${s1BelFoundHind} (${pct(s1BelFoundHind, s1n)})`)
if (ONLY.has('s2') || ONLY.has('s2b')) {
  console.log(`S2 population: ${s2n} of ${declares} declares have a legal TRUE assignment; ${unfixable} are unfixable by any assignment; the played assignment was exactly right on ${s2PlanRight} of ${s2n} (${pct(s2PlanRight, s2n)})`)
  console.log(`certainty check: declares whose every card had ONE candidate and were WRONG: ${certainWrong} (must be 0)`)
}
if (ONLY.has('s2b')) console.log(`S2b: searched ${s2bSearched} declares with more than one option (the ${CAP}-option cap bound on ${s2bCapped}); changed the assignment on ${s2bChanged}; turned a WRONG declare RIGHT on ${s2bChangedToRight}; broke a RIGHT declare on ${s2bBrokeRight}`)
if (ONLY.has('s3')) console.log(`S3 diagnostics: ${s3n} real pass choices (${(s3n / GAMES).toFixed(3)} a game); the belief search re-played the pass on ${s3BelIsPlayed} of ${s3n}`)

console.log('')
console.log('DECLARED-PLAN CALIBRATION (unscored; C3 could only see DECLINED plans): the bot\'s own p for the book it declared, against whether the declare was right')
console.log('| p bin | every card certain: n | realised | any card uncertain: n | mean stated p | realised |')
console.log('|---|---:|---:|---:|---:|---:|')
for (let i = 0; i < EDGES.length - 1; i++) {
  const c = cal.certain[i], u = cal.uncertain[i]
  if (c.n + u.n === 0) continue
  console.log(`| ${EDGES[i].toFixed(3)}-${Math.min(1, EDGES[i + 1]).toFixed(3)} | ${c.n} | ${c.n ? (c.ok / c.n).toFixed(3) : '—'} | ${u.n} | ${u.n ? (u.p / u.n).toFixed(3) : '—'} | ${u.n ? (u.ok / u.n).toFixed(3) : '—'} |`)
}

if (JSONOUT) {
  fs.writeFileSync(JSONOUT, JSON.stringify({
    version: VERSION, games: GAMES, label: LABEL, parts: [...ONLY], det: DET, detSteps: DETSTEPS, split: SPLIT, secs, rollouts,
    declares, passes, s1n, s1opts, s1HindIsPlayed, s1BelIsPlayed, s1BelFoundHind,
    s2n, s2PlanRight, unfixable, certainWrong, s2bSearched, s2bCapped, s2bChanged, s2bChangedToRight, s2bBrokeRight,
    s3n, s3BelIsPlayed, stats: T, statsSplit: SPLIT > 0 ? T0 : null, calibration: cal,
  }, null, 2))
  console.log(`\n-> ${JSONOUT}`)
}
