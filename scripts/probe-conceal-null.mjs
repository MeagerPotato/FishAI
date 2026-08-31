/**
 * probe-conceal-null.mjs — the null control for the conceal.ts broadcast term. NOT part of the
 * shipped lab.
 *
 * CONCESSION.md §3.1 established the methodology this script exists to satisfy: a mechanism that
 * moves the win rate has not been shown to move it *for its stated reason* until a perturbation of
 * the same shape and magnitude, carrying **no information**, has been measured beside it. There it
 * exonerated the disturbance and convicted the signal; here the question is the mirror image —
 * whether a positive concealment result survives the same test.
 *
 * The arms, all played against the untouched roster style on duplicate deals:
 *
 *   real  — the shipped `concealmentPenalty`, driven through a local mirror of `pickAsk`.
 *   null  — the identical gate structure with the *informative* quantity replaced by a
 *           deterministic hash: which sets are charged, and how much, is decided by
 *           `hash(book, moveIndex)` over the same 1..3 range `mine(H)` spans, at a firing rate
 *           tuned to the real term's. Same shape, same magnitude, no information.
 *   off   — no term at all.
 *
 * **The mirror has to be exact or every arm is confounded**, so `--verify` asserts it move for
 * move: with the real penalty it must reproduce `decide(view, ON)` at every position, and with no
 * penalty it must reproduce `decide(view, OFF)`. Both are asserted before any arm is scored.
 *
 * Usage: node scripts/probe-conceal-null.mjs [GAMES] [MODE] [LAMBDA] [BANK]
 *   MODE  'verify' | 'real' | 'null' | 'off'
 */
import { newGame, reduce, seatView, us54Config, seatTeam, cardBook, bookCards, allBooks, rulesFor } from '../lib/engine/index.ts'
import { askHitProbability, buildKnowledge, holderOf, rankAsksWith, refinedHitProbability } from '../lib/engine/bots/knowledge.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { planContainedPass } from '../lib/engine/bots/contained.ts'
import { SKILL_PRESETS } from '../lib/engine/bots/style.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'
import { defusalActive, defusalBonus, logLicences } from '../lib/engine/bots/defuse.ts'
import { concealmentPenalty } from '../lib/engine/bots/conceal.ts'
import { THREAT_COEFFICIENTS, turnYield } from '../lib/engine/bots/threat.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 300)
const MODE = process.argv[3] ?? 'verify'
const LAMBDA = Number(process.argv[4] ?? 1)
const BANK = process.argv[5] ?? 'nullA'

const OFF = Object.freeze({ ...STYLE_ROSTER.balanced })
const ON = Object.freeze({ ...OFF, conceal: LAMBDA })

/**
 * The information-free stand-in for `mine(H)`. A deterministic hash of the set id and the move
 * index, mapped onto 0..3 — the same range the real exposure count spans — so roughly a quarter of
 * (set, position) pairs are charged nothing and the rest carry a comparable weight. It knows
 * nothing about the hand, so any win it produces is the disturbance and not the mechanism.
 */
function nullExposure(book, moveIndex) {
  let h = 2166136261 ^ (moveIndex * 16777619)
  for (let i = 0; i < book.length; i++) h = Math.imul(h ^ book.charCodeAt(i), 16777619)
  return (h >>> 0) % 4
}

/** The null term: every gate of the real one that is a *rule*, with the informative part replaced. */
function nullPenalty(view, k, style, r, E, lic) {
  const book = cardBook(r.card)
  if (view.books[book]) return 0
  // Deliberately keeps the rule-shaped gates (a resolved set has nothing to leak) and drops the
  // ones that read the position, because those are exactly the information under test.
  const mine = nullExposure(book, view.moveIndex)
  if (mine === 0) return 0
  void k
  void lic
  return (LAMBDA * style.wHit * THREAT_COEFFICIENTS.perPrey * mine) / (1 + E)
}

/**
 * A faithful mirror of decide.ts `pickAsk` at hard skill — the refined re-score, the deterministic
 * sort, the `minHitP` pool, then the two near-tie windows — with the concealment charge injected
 * exactly where the shipped code injects it. `--verify` proves the fidelity.
 */
function pickAskLike(view, k, ranked, style, chargeOf) {
  const E = turnYield(view)
  const lic = logLicences(view, k)
  const defusing = defusalActive(view, style)
  const scored = ranked.map((r, idx) => {
    const base = askHitProbability(k, r.card, r.target)
    const refined = refinedHitProbability(k, r.card, r.target)
    const bonus = defusing ? defusalBonus(view, k, style, r, refined, E, lic) : 0
    const charge = chargeOf(view, k, style, r, E, lic)
    return { r, refined, s: r.score + style.wHit * (refined - base) + bonus - charge, idx }
  })
  scored.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.idx - b.idx))
  const pool =
    style.minHitP > 0 && scored.some((x) => x.r.p >= style.minHitP)
      ? scored.filter((x) => x.r.p >= style.minHitP)
      : scored
  const top = pool[0]
  const missWidth = style.missTarget === 'fewest' ? 0 : 0.5
  const width = Math.max(style.leakEpsilon, missWidth)
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
    return n >= style.leakThreshold
  }
  near.sort((a, b) => {
    if (style.leakEpsilon > 0) {
      const la = leaky(cardBook(a.r.card)) ? 1 : 0
      const lb = leaky(cardBook(b.r.card)) ? 1 : 0
      if (la !== lb) return la - lb
    }
    if (a.refined === 0 && b.refined === 0 && style.missTarget !== 'random') {
      const ca = view.counts[a.r.target], cb = view.counts[b.r.target]
      if (ca !== cb) return style.missTarget === 'fewest' ? ca - cb : cb - ca
    }
    return a.idx - b.idx
  })
  return near[0].r
}

const NO_CHARGE = () => 0

function mirrored(view, seed, style, chargeOf) {
  const ordinary =
    rulesFor(view.config).declareTiming === 'anyTime' && view.phase === 'playing' && !view.declareWindow
  if (!ordinary) return decide(view, style, seed)
  const k = buildKnowledge(view, { useConstraints: true })
  const ranked = rankAsksWith(view, k, style)
  if (ranked.length === 0) return decide(view, style, seed)
  const best = pickAskLike(view, k, ranked, style, chargeOf)
  const pass = planContainedPass(view, k, style, SKILL_PRESETS.hard, best)
  if (pass !== null) return { type: 'ask', seat: view.seat, target: pass.target, card: pass.card }
  return { type: 'ask', seat: view.seat, target: best.target, card: best.card }
}

if (MODE === 'verify') {
  // The mirror must be `decide` on both settings, or nothing measured through it means anything.
  let checked = 0, ordinary = 0
  for (let g = 0; g < GAMES; g++) {
    let st = newGame(`${BANK}-${g}`, config, 0)
    let steps = 0
    while (st.phase !== 'finished' && steps < 6000) {
      const seat = st.declareWindow ? st.declareWindow.option : st.turn
      const view = seatView(st, seat)
      const isOrdinary =
        rulesFor(view.config).declareTiming === 'anyTime' && view.phase === 'playing' && !view.declareWindow
      if (isOrdinary) ordinary++
      const a = JSON.stringify(mirrored(view, steps, ON, concealmentPenalty))
      const b = JSON.stringify(decide(view, ON, steps))
      if (a !== b) throw new Error(`mirror != decide(ON) at game ${g} step ${steps}\n  ${a}\n  ${b}`)
      const c = JSON.stringify(mirrored(view, steps, OFF, NO_CHARGE))
      const d = JSON.stringify(decide(view, OFF, steps))
      if (c !== d) throw new Error(`mirror != decide(OFF) at game ${g} step ${steps}\n  ${c}\n  ${d}`)
      checked++
      const r = reduce(st, decide(view, ON, steps))
      if (!r.ok) break
      st = r.state
      steps++
    }
  }
  console.log(`mirror verified against decide on ${checked} decisions (${ordinary} ordinary asks) over ${GAMES} games — exact`)
  void allBooks
  process.exit(0)
}

const chargeOf = MODE === 'real' ? concealmentPenalty : MODE === 'null' ? nullPenalty : NO_CHARGE
const armStyle = MODE === 'null' ? OFF : ON

function play(seed, onTeam) {
  let st = newGame(seed, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 6000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const action =
      seatTeam(seat) === onTeam
        ? mirrored(view, steps, armStyle, chargeOf)
        : decide(view, OFF, steps)
    const r = reduce(st, action)
    if (!r.ok) return null
    st = r.state
    steps++
  }
  return st.phase === 'finished' ? { on: st.score[onTeam], off: st.score[1 - onTeam] } : null
}

let pairs = 0, onW = 0, offW = 0, onS = 0, offS = 0, voided = 0
const d = []
for (let g = 0; g < GAMES; g++) {
  const a = play(`${BANK}-${g}`, 0), b = play(`${BANK}-${g}`, 1)
  if (!a || !b) { voided++; continue }
  pairs++
  onS += a.on + b.on; offS += a.off + b.off
  onW += (a.on > a.off ? 1 : 0) + (b.on > b.off ? 1 : 0)
  offW += (a.on < a.off ? 1 : 0) + (b.on < b.off ? 1 : 0)
  d.push((a.on - a.off) + (b.on - b.off))
}
const n = d.length
const m = d.reduce((x, y) => x + y, 0) / Math.max(1, n)
const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1))
console.log(`mode ${MODE}, lambda ${LAMBDA} — ${pairs} duplicate pairs (${voided} void), bank ${BANK}`)
console.log(`  sets ${onS} vs ${offS}; wins ${onW} vs ${offW} (${((100 * onW) / (2 * Math.max(1, pairs))).toFixed(2)}%)`)
console.log(`  paired set-difference ${m.toFixed(4)} +/- ${(1.96 * sd / Math.sqrt(Math.max(1, n))).toFixed(4)} (95%, N=${n} pairs)`)
