/**
 * probe-licence3.mjs — the three-way: defusal alone, licence conditioning alone, and both,
 * all scored against ONE common baseline (defuse 0, lambda 0) on one seed bank.
 *
 * probe-licence.mjs establishes the calibration fact: on asks where the target has a live row-6
 * licence in the asked set, `refinedHitProbability` believes 0.2386 against an actual 0.3221 —
 * it under-prices them by 8.35 points. Conditioning on the licence at strength 0.60 removes the
 * bias almost exactly (-0.0002 over 23,345 asks). This asks the only question that matters next:
 * does the better number play better?
 *
 * `pickAskLike` mirrors decide.ts's `pickAsk` AS IT NOW STANDS, defusal term included, so the
 * LAMBDA=0 arm must reproduce the shipped policy byte-for-byte. It prints 0.0000 +/- 0.0000 or the
 * experiment is confounded and nothing below it means anything.
 */
import { newGame, reduce, seatView, us54Config, bookCards, cardBook, seatTeam } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { buildKnowledge, refinedHitProbability, askHitProbability, holderOf, rankAsksWith } from '../lib/engine/bots/knowledge.ts'
import { legalAsksFromView } from '../lib/engine/helpers.ts'
import { rulesFor } from '../lib/engine/variants.ts'
import { seatLicences, turnYield } from '../lib/engine/bots/threat.ts'
import { defusalActive, defusalBonus, logLicences } from '../lib/engine/bots/defuse.ts'
import { planContainedPass } from '../lib/engine/bots/contained.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'
import { SKILL_PRESETS } from '../lib/engine/bots/style.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 300)
const LAMBDA = Number(process.argv[3] ?? 0.6)
const BANK = process.argv[4] ?? 'licA'
const DEFUSE = Number(process.argv[5] ?? 1)
const BASE_DEFUSE = Number(process.argv[6] ?? DEFUSE)
const STYLE = Object.freeze({ ...STYLE_ROSTER.balanced, defuse: DEFUSE })
// The opponent arm. Held at BASE_DEFUSE so all three treatments can be scored against ONE common
// baseline (defuse 0, lambda 0) instead of each against its own.
const BASE_STYLE = Object.freeze({ ...STYLE_ROSTER.balanced, defuse: BASE_DEFUSE })
const SKILL = SKILL_PRESETS.hard

/** The licence-conditioned probability. LAMBDA 0 returns the shipped number unchanged. */
function condP(view, k, card, target, lic) {
  const q = refinedHitProbability(k, card, target)
  if (LAMBDA === 0 || q <= 0 || q >= 1) return q
  const b = cardBook(card)
  if (!lic(target).has(b)) return q
  let prod = 1
  for (const j of bookCards(b, view.config)) {
    const h = holderOf(k, j)
    if (h === target) return q            // licence already discharged in the model
    if (h !== null) continue
    prod *= 1 - refinedHitProbability(k, j, target)
  }
  const Z = 1 - prod
  if (!(Z > 0.02)) return q
  return Math.min(1, q + LAMBDA * (q / Z - q))
}

function pickAskLike(view, k, ranked) {
  const defusing = defusalActive(view, STYLE)
  const licences = defusing ? logLicences(view, k) : undefined
  const yield_ = defusing ? turnYield(view) : 0
  const cache = new Map()
  const lic = (t) => {
    let g = cache.get(t)
    if (g === undefined) { g = seatLicences(view, k, t); cache.set(t, g) }
    return g
  }
  const scored = ranked.map((r, idx) => {
    const base = askHitProbability(k, r.card, r.target)
    const refined = condP(view, k, r.card, r.target, lic)
    const bonus = defusing ? defusalBonus(view, k, STYLE, r, refined, yield_, licences) : 0
    return { r, refined, s: r.score + STYLE.wHit * (refined - base) + bonus, idx }
  })
  scored.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.idx - b.idx))
  const pool = STYLE.minHitP > 0 && scored.some((x) => x.r.p >= STYLE.minHitP)
    ? scored.filter((x) => x.r.p >= STYLE.minHitP) : scored
  const top = pool[0]
  const missWidth = STYLE.missTarget === 'fewest' ? 0 : 0.5
  const width = Math.max(STYLE.leakEpsilon, missWidth)
  if (width <= 0) return top.r
  const near = pool.filter((x) => x.s >= top.s - width)
  if (near.length === 1) return top.r
  const myTeam = seatTeam(view.seat)
  const held = new Set(view.hand)
  const leaky = (b) => {
    let n = 0
    for (const c of bookCards(b, config)) {
      const h = holderOf(k, c)
      if (held.has(c) || (h !== null && seatTeam(h) === myTeam)) n++
    }
    return n >= STYLE.leakThreshold
  }
  near.sort((a, b) => {
    if (STYLE.leakEpsilon > 0) {
      const la = leaky(cardBook(a.r.card)) ? 1 : 0
      const lb = leaky(cardBook(b.r.card)) ? 1 : 0
      if (la !== lb) return la - lb
    }
    if (a.refined === 0 && b.refined === 0 && STYLE.missTarget !== 'random') {
      const ca = view.counts[a.r.target], cb = view.counts[b.r.target]
      if (ca !== cb) return STYLE.missTarget === 'fewest' ? ca - cb : cb - ca
    }
    return a.idx - b.idx
  })
  return near[0].r
}

function decideAware(view, seed) {
  const ordinary = rulesFor(view.config).declareTiming === 'anyTime' && view.phase === 'playing' && !view.declareWindow
  if (!ordinary) return decide(view, STYLE, seed)
  const shipped = decide(view, STYLE, seed)
  if (shipped.type !== 'ask') return shipped        // a declare/pass branch decided it; don't touch
  const k = buildKnowledge(view, { useConstraints: true })
  const ranked = rankAsksWith(view, k, STYLE)
  if (ranked.length === 0) return shipped
  const best = pickAskLike(view, k, ranked)
  const pass = planContainedPass(view, k, STYLE, SKILL, best)
  if (pass) return { type: 'ask', seat: view.seat, target: pass.target, card: pass.card }
  return { type: 'ask', seat: view.seat, target: best.target, card: best.card }
}

function play(seed, awareTeam) {
  let st = newGame(seed, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 6000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const action = seatTeam(seat) === awareTeam ? decideAware(view, steps) : decide(view, BASE_STYLE, steps)
    const r = reduce(st, action)
    if (!r.ok) return null
    st = r.state
    steps++
  }
  return st.phase === 'finished' ? { on: st.score[awareTeam], off: st.score[1 - awareTeam] } : null
}

let pairs = 0, onW = 0, onS = 0, offS = 0
const d = []
for (let g = 0; g < GAMES; g++) {
  const a = play(`${BANK}-${g}`, 0), b = play(`${BANK}-${g}`, 1)
  if (!a || !b) continue
  pairs++
  onS += a.on + b.on; offS += a.off + b.off
  onW += (a.on > a.off ? 1 : 0) + (b.on > b.off ? 1 : 0)
  d.push((a.on - a.off) + (b.on - b.off))
}
const m = d.reduce((x, y) => x + y, 0) / d.length
const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1))
console.log(`arm: defuse=${DEFUSE} lambda=${LAMBDA}  vs baseline defuse=${BASE_DEFUSE} lambda=0 — ${pairs} duplicate pairs, bank ${BANK}`)
console.log(`  sets ${onS} vs ${offS}; win rate ${((100 * onW) / (2 * pairs)).toFixed(2)}%`)
console.log(`  paired set-difference ${m.toFixed(4)} +/- ${(1.96 * sd / Math.sqrt(d.length)).toFixed(4)}`)
