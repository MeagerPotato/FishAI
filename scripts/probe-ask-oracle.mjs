/**
 * probe-ask-oracle.mjs - MONET.md 3.8av instrument D: what the BEST legal ask is worth.
 *
 *   node scripts/probe-ask-oracle.mjs [--games 60] [--version v0.33] [--label oracle] [--stride 5]
 *                                     [--override '{...}'] [--search '{"cand":3,...}'] [--json out.json]
 *
 * At a sampled ask decision every one of the ~50 LEGAL asks is rolled out from the TRUE deal and
 * compared with what the bot played. Three candidate sets are scored over the same rollouts:
 *   full    - every legal ask (the ceiling)
 *   top3    - the clone's top three, union the pick (the shortlist every selector on this ladder saw)
 *   search  - `candidateAsks`, the set the rollout search itself generates
 * and `full - top3` is what the candidate generator costs.
 *
 * 3.8av's pilot established that `rollout` is DETERMINISTIC in its key: the only place `decide`
 * consults the seeded rng is a blunder roll gated on `!skill.planClaims` and scaled by
 * `skill.errorRate`, and Monet sets `planClaims: true`, `errorRate: 0`. So there is no rollout noise
 * to average over, repeated keys buy nothing, and max_a V(a) is an exact maximum rather than an
 * inflated one. What it IS is a HINDSIGHT oracle - it knows the true deal and the exact continuation -
 * and therefore an UPPER BOUND on any achievable gain. Read it in the negative direction.
 *
 * Two horizons are reported for every figure: to the END of the game (the leaf is the final score
 * differential, so the number is a true sets-a-game reading on 3.8at's exchange-rate axis) and at
 * 24 steps (what the search consumes, and the unit 3.8au's marker was in). Their ratio has never
 * been measured and is reported as its own line.
 *
 * ATHENA.md §8.4 (D4 with the head) adds three options; without them nothing played, drawn or printed changes.
 *   --sampler marginal|head:<weights>  D4's deal sampler. `marginal` (the default) is the record's: `sampleDeal` over
 *                                      the table `marginalFor(k)` holds. `head:<file>` reads an `athena-weights-1`
 *                                      file and, at each sampled decision, lays the belief head's per-card holder
 *                                      probabilities (lib/athena's deterministic forward) over that table
 *                                      (`lib/athena/belief.ts`), so `sampleDeal` draws from the head. A decision whose
 *                                      table is null keeps the slot prior, and is counted.
 *   --values-out FILE                  one JSON line a sampled decision: the game label and move, the legal asks, the
 *                                      pick, every legal ask's value on the TRUE deal (to the end and at 24 steps),
 *                                      the sampler's mean value of every ask over its deals, its choice, and seconds.
 *   --values-in FILE                   another run's --values-out, on the same games: the true-deal values are read
 *                                      from it (every decision checked to be the same decision: label, move, legal
 *                                      asks and pick) instead of rolled out again, and the file's own sampler choice
 *                                      is paired with this run's, so "H - M on the same decisions" is printed.
 */
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const MON = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/monet.ts').href)
const BOTS = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/index.ts').href)
const S = await import(pathToFileURL(process.cwd() + '/lib/engine/search/index.ts').href)
const { newGame, us54Config, legalActionsSummary, legalAsksFromView, seatView, hashSeed, reduce } = ENG

const argOf = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : d }
const GAMES = Number(argOf('--games', 60))
const VERSION = argOf('--version', 'v0.33')
const LABEL = argOf('--label', 'oracle')
const STRIDE = Number(argOf('--stride', 5))
const JSONOUT = argOf('--json', '')
const DETSTEPS = Number(argOf('--det-steps', 24)) // D4's SELECTION horizon; 24 is the search's own
const DET = Number(argOf('--det', 16))   // D4's determinizations; 0 turns the belief-limited ceiling off
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const params = { ...S.SEARCH_DEFAULTS, ...JSON.parse(argOf('--search', '{}')) }
const SAMPLER = argOf('--sampler', 'marginal')
const VALUES_OUT = argOf('--values-out', '')
const VALUES_IN = argOf('--values-in', '')
if (SAMPLER !== 'marginal' && !SAMPLER.startsWith('head:')) throw new Error(`--sampler is marginal or head:<weights file>, not ${SAMPLER}`)
// ATHENA.md 8.4: the head sampler's net, loaded once, with one incremental fold per seat (reset every game)
const HEAD = SAMPLER.startsWith('head:') ? await (async () => {
  const BEL = await import(pathToFileURL(process.cwd() + '/lib/athena/belief.ts').href)
  const ATH = await import(pathToFileURL(process.cwd() + '/lib/athena/index.ts').href)
  const file = SAMPLER.slice(5)
  const bytes = fs.readFileSync(file)
  const net = ATH.parseWeights(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
  return { BEL, ATH, file, net, md5: createHash('md5').update(bytes).digest('hex'), caches: [], patched: 0, fallback: 0 }
})() : null
// --values-in: the true-deal values of another run, by `${label}:${moveIndex}`
const VIN = VALUES_IN ? new Map(fs.readFileSync(VALUES_IN, 'utf8').split('\n').filter(Boolean).map((l) => { const o = JSON.parse(l); return [`${o.label}:${o.move}`, o] })) : null
const vout = VALUES_OUT ? [] : null
const pairHM = []  // this run's choice minus the --values-in run's, on the true deal, to the end and at 24 steps
const pairHM24 = []
let pairSame = 0
let viUsed = 0

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

function stat(xs) {
  const n = xs.length
  if (n === 0) return { n, mean: NaN, sd: NaN, se: NaN }
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const v = n > 1 ? xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1) : 0
  return { n, mean, sd: Math.sqrt(v), se: Math.sqrt(v / n) }
}
const fmt = (t) => `${t.mean >= 0 ? '+' : ''}${t.mean.toFixed(3)} (SE ${t.se.toFixed(3)}, n ${t.n})`
const same = (a, b) => a.target === b.target && a.card === b.card

const R = {
  fullEnd: [], full24: [], top3End: [], top324: [], searchEnd: [], search24: [],
  gapEnd: [], gap24: [], gapSearchEnd: [], gapSearch24: [],
  beliefEnd: [], belief24: [], hindsightEnd: [],
}
let decisions = 0, sampled = 0, legalSum = 0, legalMax = 0
let oracleHit = 0, pickHit = 0, oracleCertain = 0, pickCertain = 0, oracleIsPick = 0
const oracleRanks = [], rawRanks = [], rankedSizes = []  // where the to-the-end oracle ask sits
let rankTop1 = 0, rankTop3 = 0, rankTop5 = 0, rankOff = 0
let rollouts = 0
let beliefFoundOracle = 0, beliefIsPick = 0, beliefHit = 0, beliefDeals = 0, beliefN = 0
const t0 = Date.now()

for (let g = 0; g < GAMES; g++) {
  const label = `${LABEL}-${g}`
  if (HEAD) HEAD.caches = [0, 1, 2, 3, 4, 5].map(() => new HEAD.ATH.SeatForward(HEAD.net))
  let s = newGame(label, us54Config, 0)
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const seed = hashSeed(`${label}:${s.moveIndex}`)()
    const a = ENG.decide(view, pol, seed)

    if (!view.declareWindow && view.phase === 'playing' && a.type === 'ask') {
      decisions++
      if (decisions % STRIDE === 0) {
        const legal = legalAsksFromView(view)
        if (legal.length > 1) {
          sampled++
          const tDec = Date.now()
          legalSum += legal.length
          if (legal.length > legalMax) legalMax = legal.length
          const key = `${seed}:true`
          // --values-in: this decision's true-deal values from the other run, checked to be the same decision
          const vi = VIN ? VIN.get(`${label}:${s.moveIndex}`) : undefined
          if (VIN) {
            if (!vi) throw new Error(`--values-in has no decision ${label}:${s.moveIndex}`)
            const sameLegal = vi.legal.length === legal.length && vi.legal.every(([t, c], i) => t === legal[i].target && c === legal[i].card)
            if (!sameLegal || vi.pick[0] !== a.target || vi.pick[1] !== a.card) throw new Error(`--values-in's decision ${label}:${s.moveIndex} is not this one`)
            viUsed++
          }
          const trueVal = new Map() // `${target}:${card}` -> [end, 24] on the true deal, as rolled or read
          if (vi) vi.legal.forEach(([t, c], i) => trueVal.set(`${t}:${c}`, [vi.vEnd[i], vi.v24[i]]))
          const roll = (act, steps) => {
            if (vi) {
              const v = trueVal.get(`${act.target}:${act.card}`)
              return v === undefined ? null : steps === END ? v[0] : v[1]
            }
            const r = reduce(s, act)
            if (!r.ok) return null
            rollouts++
            return S.rollout(r.state, pol, key, steps, team(seat), params.leafLock, params.leafCard)
          }
          const vPickEnd = roll(a, END), vPick24 = roll(a, 24)
          const vEndAll = [], v24All = []
          const holderOf = (card) => s.hands.findIndex((h) => h.includes(card))

          // the two restricted candidate sets, each unioned with the pick so its oracle is >= 0.
          // The clone does NOT re-use the ranker's order: `chooseAskByModel` scores every entry of
          // `rankAsksWith` and takes the argmax, so "the clone's top three" is the top three of
          // `scoreAsks`, which is a different list from `ranked.slice(0, 3)`.
          const k = BOTS.buildKnowledge(view, KOPTS)
          const ranked = BOTS.rankAsksWith(view, k, style)
          const cscore = style.askModel !== undefined
            ? BOTS.scoreAsks(BOTS.askModelOf(style.askModel), view, k, ranked)
            : ranked.map((r) => r.score)
          const cloneOrder = ranked.map((r, i) => ({ r, s: cscore[i] })).sort((x, y) => y.s - x.s).map((o) => o.r)
          const top3 = cloneOrder.slice(0, 3).map((r) => ({ target: r.target, card: r.card }))
          if (!top3.some((x) => same(x, a))) top3.push({ target: a.target, card: a.card })
          const ca = S.candidateAsks(view, pol, seed, params)
          const scand = (ca?.cands ?? []).map((c) => ({ target: c.target, card: c.card }))
          if (!scand.some((x) => same(x, a))) scand.push({ target: a.target, card: a.card })

          let bEnd = vPickEnd, b24 = vPick24, bAct = { target: a.target, card: a.card }
          let tEnd = vPickEnd, t24 = vPick24, cEnd = vPickEnd, c24 = vPick24
          for (const x of legal) {
            const act = { type: 'ask', seat, target: x.target, card: x.card }
            const ve = roll(act, END)
            vEndAll.push(ve)
            if (ve === null) { v24All.push(null); continue }
            const v2 = roll(act, 24)
            v24All.push(v2)
            if (ve > bEnd) { bEnd = ve; bAct = x }
            if (v2 > b24) b24 = v2
            if (top3.some((y) => same(y, x))) { if (ve > tEnd) tEnd = ve; if (v2 > t24) t24 = v2 }
            if (scand.some((y) => same(y, x))) { if (ve > cEnd) cEnd = ve; if (v2 > c24) c24 = v2 }
          }
          // D4, the reading that decides the question: the ceiling a policy could actually REACH.
          // The true-deal oracle above sees the hidden hands; no policy can. So: draw DET
          // determinizations from the bot's own belief, score every legal ask by its mean 24-step
          // value across them exactly as `decideSearch` does, take the argmax -- that is a perfect
          // search over the FULL legal set at the search's own horizon, with no candidate
          // generator and no guard -- and then evaluate THAT ask against the TRUE deal, paired with
          // the pick. The gap between this and the hindsight ceiling is what hindsight was worth.
          let dRec = null
          if (DET > 0) {
            const rng = ENG.mulberry32 ? ENG.mulberry32(seed) : hashSeed(`${label}:${s.moveIndex}:det`)
            const sums = legal.map(() => 0)
            let drawn = 0
            // ATHENA.md 8.4: the head sampler draws from a knowledge of its own whose table carries the head's rows
            let kS = k
            if (HEAD) {
              kS = BOTS.buildKnowledge(view, KOPTS)
              if (HEAD.BEL.patchTableWithHead(HEAD.net, view, kS, HEAD.caches[seat])) HEAD.patched++
              else HEAD.fallback++
            }
            for (let d = 0; d < DET; d++) {
              const hands = S.sampleDeal(view, kS, rng)
              if (hands === null) continue
              drawn++
              const base = S.stateFromView(view, hands)
              for (let i = 0; i < legal.length; i++) {
                const rr = reduce(base, { type: 'ask', seat, target: legal[i].target, card: legal[i].card })
                if (!rr.ok) { sums[i] -= 99; continue }
                rollouts++
                sums[i] += S.rollout(rr.state, pol, `${seed}:${d}`, DETSTEPS, team(seat), params.leafLock, params.leafCard)
              }
            }
            if (drawn > 0) {
              let bi = 0
              for (let i = 1; i < sums.length; i++) if (sums[i] > sums[bi]) bi = i
              const chosen = legal[bi]
              const ve = roll({ type: 'ask', seat, target: chosen.target, card: chosen.card }, END)
              const v2 = roll({ type: 'ask', seat, target: chosen.target, card: chosen.card }, 24)
              // the rollout is deterministic in its key, so the chosen ask's value is the full loop's for that ask (checked
              // where the values are saved or a head samples)
              if ((HEAD || vout) && (ve !== vEndAll[bi] || v2 !== v24All[bi])) throw new Error(`${label}:${s.moveIndex}: the chosen ask's true-deal value is not the loop's (determinism broken)`)
              dRec = { drawn, mean24: sums.map((x) => x / drawn), chosen: bi }
              if (vi && vi.chosen !== null && vi.chosen !== undefined) {
                pairHM.push(ve - vi.vEnd[vi.chosen]); pairHM24.push(v2 - vi.v24[vi.chosen])
                if (vi.chosen === bi) pairSame++
              }
              if (ve !== null) {
                R.beliefEnd.push(ve - vPickEnd); R.belief24.push(v2 - vPick24)
                R.hindsightEnd.push(bEnd - ve)
                if (same(chosen, bAct)) beliefFoundOracle++
                if (same(chosen, a)) beliefIsPick++
                if (holderOf(chosen.card) === chosen.target) beliefHit++
                beliefDeals += drawn
                beliefN++
              }
            }
          }

          R.fullEnd.push(bEnd - vPickEnd); R.full24.push(b24 - vPick24)
          R.top3End.push(tEnd - vPickEnd); R.top324.push(t24 - vPick24)
          R.searchEnd.push(cEnd - vPickEnd); R.search24.push(c24 - vPick24)
          R.gapEnd.push(bEnd - tEnd); R.gap24.push(b24 - t24)
          R.gapSearchEnd.push(bEnd - cEnd); R.gapSearch24.push(b24 - c24)

          // diagnostics: does the ceiling ask sit inside the shortlist at all, and does it hit?
          if (holderOf(a.card) === a.target) pickHit++
          if (holderOf(bAct.card) === bAct.target) oracleHit++
          if (same(bAct, a)) oracleIsPick++
          // rank in the CLONE's ordering — the list a selector over the shortlist actually sees
          const ri = cloneOrder.findIndex((r) => same(r, bAct))
          oracleRanks.push(ri < 0 ? cloneOrder.length : ri + 1)
          if (ri === 0) rankTop1++
          if (ri >= 0 && ri < 3) rankTop3++
          if (ri >= 0 && ri < 5) rankTop5++
          if (ri < 0) rankOff++
          const rri = ranked.findIndex((r) => same(r, bAct))
          rawRanks.push(rri < 0 ? ranked.length : rri + 1)
          rankedSizes.push(ranked.length)
          const rp = ranked.find((r) => same(r, a))
          if (rp !== undefined && rp.p === 1) pickCertain++
          const rb = ranked.find((r) => same(r, bAct))
          if (rb !== undefined && rb.p === 1) oracleCertain++
          if (vout) {
            vout.push(JSON.stringify({
              label, g, move: s.moveIndex, seat, sampler: SAMPLER, legal: legal.map((x) => [x.target, x.card]), pick: [a.target, a.card],
              vPickEnd, vPick24, vEnd: vEndAll, v24: v24All,
              drawn: dRec ? dRec.drawn : 0, mean24: dRec ? dRec.mean24 : null, chosen: dRec ? dRec.chosen : null,
              secs: (Date.now() - tDec) / 1000,
            }))
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
const S_ = {}
for (const key of Object.keys(R)) S_[key] = stat(R[key])
const ratio = S_.fullEnd.mean / (S_.full24.mean || NaN)
const mean = (xs) => xs.reduce((x, y) => x + y, 0) / Math.max(1, xs.length)
const meanRank = mean(oracleRanks)

console.log(`=== probe-ask-oracle: ${VERSION}${OVER ? ' ' + JSON.stringify(OVER) : ''}, ${GAMES} games (${LABEL}-*), stride ${STRIDE}, ${secs.toFixed(1)}s, ${rollouts} rollouts ===`)
console.log(`ask decisions ${decisions}; sampled ${sampled}; FULL legal ask set mean ${(legalSum / Math.max(1, sampled)).toFixed(1)}, max ${legalMax}`)
console.log('')
console.log('THE CEILING (hindsight oracle - it knows the true deal AND the continuation; an UPPER BOUND, not an achievable gain)')
console.log(`  full legal set over the pick, to the END : ${fmt(S_.fullEnd)}   <- D1 reads this`)
console.log(`  full legal set over the pick, 24 steps   : ${fmt(S_.full24)}`)
console.log(`  clone top 3 + pick,           to the END : ${fmt(S_.top3End)}`)
console.log(`  clone top 3 + pick,           24 steps   : ${fmt(S_.top324)}`)
console.log(`  search's own candidates,      to the END : ${fmt(S_.searchEnd)}`)
console.log(`  search's own candidates,      24 steps   : ${fmt(S_.search24)}`)
console.log('')
console.log('WHAT THE CANDIDATE GENERATOR COSTS')
console.log(`  full - clone top 3, to the END : ${fmt(S_.gapEnd)}   <- D2 reads this`)
console.log(`  full - clone top 3, 24 steps   : ${fmt(S_.gap24)}`)
console.log(`  full - search cands, to the END: ${fmt(S_.gapSearchEnd)}`)
console.log(`  full - search cands, 24 steps  : ${fmt(S_.gapSearch24)}`)
console.log('')
console.log('WHAT A POLICY COULD ACTUALLY REACH — D4. A perfect search over the FULL legal set at the')
console.log(`  a ${DETSTEPS}-step horizon, scored on ${DET} determinizations drawn from the bot's OWN belief`)
console.log('  (no candidate generator, no guard), then evaluated against the TRUE deal:')
console.log(`  belief-limited ceiling over the pick, to the END : ${fmt(S_.beliefEnd)}   <- D4 reads this`)
console.log(`  belief-limited ceiling over the pick, 24 steps   : ${fmt(S_.belief24)}`)
console.log(`  what HINDSIGHT was worth (full-set ceiling minus this): ${fmt(S_.hindsightEnd)}`)
console.log(`  it found the hindsight-best ask ${beliefFoundOracle} of ${beliefN} (${(100 * beliefFoundOracle / Math.max(1, beliefN)).toFixed(1)}%); it re-played the pick ${beliefIsPick} (${(100 * beliefIsPick / Math.max(1, beliefN)).toFixed(1)}%); its true hit rate ${(100 * beliefHit / Math.max(1, beliefN)).toFixed(1)}%`)
console.log(`  deals actually drawn: ${(beliefDeals / Math.max(1, beliefN)).toFixed(1)} of ${DET} a decision`)
console.log('')
console.log(`HORIZON RATIO (to-the-end / 24-step) on the full-set oracle: ${Number.isFinite(ratio) ? ratio.toFixed(2) : 'n/a'}x`)
console.log('')
console.log('WHERE THE CEILING ASK LIVES')
console.log(`  it IS the pick on ${oracleIsPick} of ${sampled} (${(100 * oracleIsPick / Math.max(1, sampled)).toFixed(1)}%)`)
console.log(`  its rank in the CLONE's ordering (what a selector over the shortlist sees): mean ${meanRank.toFixed(1)} of ${mean(rankedSizes).toFixed(1)}; top 1 ${rankTop1} (${(100 * rankTop1 / Math.max(1, sampled)).toFixed(1)}%), top 3 ${rankTop3} (${(100 * rankTop3 / Math.max(1, sampled)).toFixed(1)}%), top 5 ${rankTop5} (${(100 * rankTop5 / Math.max(1, sampled)).toFixed(1)}%), off the list ${rankOff}`)
console.log(`  its rank in the RAW ranker's ordering: mean ${mean(rawRanks).toFixed(1)}`)
console.log(`  true hit rate: pick ${(100 * pickHit / Math.max(1, sampled)).toFixed(1)}%, ceiling ask ${(100 * oracleHit / Math.max(1, sampled)).toFixed(1)}%`)
console.log(`  certain in the ranking (p = 1): pick ${pickCertain}, ceiling ask ${oracleCertain}`)
if (HEAD || VIN || vout) {
  console.log('')
  console.log(`ATHENA.md 8.4: sampler ${SAMPLER}${HEAD ? ` (weights md5 ${HEAD.md5}; head rows laid over ${HEAD.patched} decisions' tables, ${HEAD.fallback} kept the slot prior)` : ''}`)
  console.log(`  ${(secs / Math.max(1, sampled)).toFixed(2)} s a sampled decision`)
  if (VIN) {
    const hm = stat(pairHM), hm24 = stat(pairHM24)
    console.log(`  true-deal values read from ${VALUES_IN} at ${viUsed} decisions (none rolled out again)`)
    console.log(`  this sampler minus that run's, on the same decisions: to the END ${fmt(hm)}, 24 steps ${fmt(hm24)}; the same ask chosen ${pairSame} of ${pairHM.length}`)
  }
}

if (JSONOUT) {
  fs.writeFileSync(JSONOUT, JSON.stringify({
    version: VERSION, override: OVER, games: GAMES, label: LABEL, stride: STRIDE, secs, rollouts,
    decisions, sampled, legalMean: legalSum / Math.max(1, sampled), legalMax,
    stats: S_, ratio, meanRank, meanRawRank: mean(rawRanks), meanRankedSize: mean(rankedSizes), rankTop1, rankTop3, rankTop5, rankOff,
    oracleIsPick, pickHit, oracleHit, pickCertain, oracleCertain,
    det: DET, detSteps: DETSTEPS, beliefN, beliefFoundOracle, beliefIsPick, beliefHit, beliefDeals,
    ...(HEAD || VIN || vout ? {
      sampler: SAMPLER, headMd5: HEAD ? HEAD.md5 : null, headPatched: HEAD ? HEAD.patched : 0, headFallback: HEAD ? HEAD.fallback : 0,
      valuesIn: VALUES_IN || null, pairHM: VIN ? stat(pairHM) : null, pairHM24: VIN ? stat(pairHM24) : null, pairSame,
    } : {}),
  }, null, 2))
  console.log(`\n-> ${JSONOUT}`)
}
if (vout) {
  fs.writeFileSync(VALUES_OUT, vout.map((l) => l + '\n').join(''))
  console.log(`-> ${VALUES_OUT} (${vout.length} decisions)`)
}
