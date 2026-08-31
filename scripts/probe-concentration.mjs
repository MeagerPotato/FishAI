/**
 * probe-concentration.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * Tests the repository owner's two claims about the v1.0 bot:
 *   (1) "always ask for the same half-suit right after someone asks it for it"
 *   (2) "two or three half-suits get ask-traded until it's declared, the others never show up"
 *
 * Measurement only. Outcomes are read from GameState; every per-decision quantity is read from
 * the acting seat's SeatView, i.e. exactly what the policy has.
 *
 * Ablations, all evaluated on the SAME view as the real decision (so they are exact
 * single-decision counterfactuals, not separate games):
 *   noDefuse  — hard skill, style.defuse = 0     (removes CONCESSION.md's explicit "take the
 *                                                 card the licence rests on" credit)
 *   noRefine  — medium skill (refinedInference off), style unchanged
 *                                                (removes the constraint-boosted hit probability)
 *   neither   — medium skill, defuse = 0
 *
 * usage: node scripts/probe-concentration.mjs <games> <arm> [outJson]
 *   arm: balanced | balanced-nodefuse | roster | roster-nodefuse
 */
import {
  newGame,
  reduce,
  seatView,
  us54Config,
  allBooks,
  cardBook,
  seatTeam,
  legalAsksFromView,
} from '../lib/engine/index.ts'
import {
  buildKnowledge,
  rankAsksWith,
  askHitProbability,
  refinedHitProbability,
} from '../lib/engine/bots/knowledge.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { SKILL_PRESETS } from '../lib/engine/bots/style.ts'
import { STYLE_ROSTER, STYLE_IDS } from '../lib/engine/bots/roster.ts'
import { defusalBonus, logLicences } from '../lib/engine/bots/defuse.ts'
import { turnYield } from '../lib/engine/bots/threat.ts'
import fs from 'node:fs'

const config = us54Config
const BOOKS = allBooks(config)
const GAMES = Number(process.argv[2] ?? 200)
const ARM = process.argv[3] ?? 'balanced'
const OUT = process.argv[4] ?? null
const EPS = 1e-9

const noDefuseArm = ARM.endsWith('-nodefuse')
const strip = (s) => (noDefuseArm ? Object.freeze({ ...s, defuse: 0 }) : s)

function stylesFor(g) {
  if (ARM.startsWith('roster')) {
    return [0, 1, 2, 3, 4, 5].map((i) => strip(STYLE_ROSTER[STYLE_IDS[(g + i) % STYLE_IDS.length]]))
  }
  return [0, 1, 2, 3, 4, 5].map(() => strip(STYLE_ROSTER.balanced))
}

const styleCache = new Map()
function ablations(style) {
  let got = styleCache.get(style)
  if (got === undefined) {
    const zero = Object.freeze({ ...style, defuse: 0 })
    got = {
      noDefuse: { skill: SKILL_PRESETS.hard, style: zero },
      noRefine: { skill: SKILL_PRESETS.medium, style },
      neither: { skill: SKILL_PRESETS.medium, style: zero },
      // Synthetic, not a shipped skill: medium with the deal-time set-constraints switched off,
      // so the "asker holds >= 1 card of this set" fact an ask publishes is never ingested. The
      // isolation for "did the provoking ask itself create the information?".
      noConstraint: {
        skill: Object.freeze({ ...SKILL_PRESETS.medium, useConstraints: false }),
        style: zero,
      },
    }
    styleCache.set(style, got)
  }
  return got
}

/* ------------------------------------------------------------- accumulators --- */

const recip = [] // one record per reciprocal OPPORTUNITY
const runLens = []
let runsEndedByClaim = 0
const gameRows = []
const adjacency = { same: 0, total: 0, sameChain: 0, sameSwap: 0, sameSwapBack: 0 }

let askDecisions = 0
let defusalChanged = 0
let chosenIsArgmaxP = 0
let chosenIsUniqueArgmaxP = 0
let refinedRaisedChosen = 0
/**
 * The availability-matched control. One row per (ask decision, legally-askable set): was the set
 * the one this seat was just provoked in, what share of its legal asks pointed into that set, and
 * did it choose that set? Comparing provoking against non-provoking sets INSIDE an availability
 * bucket is the comparison that separates "reciprocity" from "that set was simply the one it had
 * the most legal asks into".
 */
const matched = [] // { isProv, avail, chosen }

for (let g = 0; g < GAMES; g++) {
  const styles = stylesFor(g)
  let st = newGame(`conc-${g}`, config, g % 6)
  let steps = 0

  const askCount = new Map()
  const askCountByTeam = [new Map(), new Map()]
  const seq = [] // { book, asker, target, hit }
  const pendMiss = new Array(6).fill(null)
  const pendHit = new Array(6).fill(null)
  let askIdx = 0
  // Card oscillation: how often does the SAME physical card change hands repeatedly, and how
  // often does a hit return a card to a seat that has already held it?
  const transfers = new Map() // card -> times it moved
  const everHeld = new Map() // card -> Set(seat)
  let recaptures = 0
  let hits = 0
  for (const s of [0, 1, 2, 3, 4, 5]) for (const c of st.hands[s]) everHeld.set(c, new Set([s]))
  const claimAt = [] // ask-index boundaries where a claim resolved a set

  while (st.phase !== 'finished' && steps < 4000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const style = styles[seat]
    const action = decide(view, style, steps)

    if (action.type === 'ask') {
      askDecisions++
      const chosenBook = cardBook(action.card)
      const k = buildKnowledge(view, { logWindow: Infinity, useConstraints: true })
      const ranked = rankAsksWith(view, k, style)
      const legal = legalAsksFromView(view)

      // pickAsk's scoring rebuilt, with and without the defusal credit (hard skill).
      const licences = logLicences(view, k)
      const yld = turnYield(view)
      let bestPlain = null
      let bestWith = null
      let maxP = -1
      let maxPn = 0
      let chosenP = 0
      let chosenBase = 0
      ranked.forEach((r, idx) => {
        const base = askHitProbability(k, r.card, r.target)
        const refined = refinedHitProbability(k, r.card, r.target)
        const plain = r.score + style.wHit * (refined - base)
        const bonus = style.defuse > 0 ? defusalBonus(view, k, style, r, refined, yld, licences) : 0
        const withB = plain + bonus
        if (bestPlain === null || plain > bestPlain.s + EPS) bestPlain = { s: plain, r, idx }
        if (bestWith === null || withB > bestWith.s + EPS) bestWith = { s: withB, r, idx }
        if (refined > maxP + EPS) {
          maxP = refined
          maxPn = 1
        } else if (Math.abs(refined - maxP) <= EPS) maxPn++
        if (r.card === action.card && r.target === action.target) {
          chosenP = refined
          chosenBase = base
        }
      })
      const argmaxP = Math.abs(chosenP - maxP) <= EPS
      if (argmaxP) chosenIsArgmaxP++
      if (argmaxP && maxPn === 1) chosenIsUniqueArgmaxP++
      if (bestPlain !== null && bestWith !== null && bestPlain.r !== bestWith.r) defusalChanged++
      if (chosenP > chosenBase + EPS) refinedRaisedChosen++

      // availability-matched control over every legally-askable set at this decision
      {
        const provBook = pendMiss[seat] !== null ? pendMiss[seat].book : null
        const per = new Map()
        for (const a of legal) per.set(cardBook(a.card), (per.get(cardBook(a.card)) ?? 0) + 1)
        for (const [b, n] of per) {
          matched.push({ isProv: b === provBook, avail: n / legal.length, chosen: b === chosenBook })
        }
      }

      // reciprocal opportunity: the seat has an unanswered provocation
      for (const [kind, pend] of [
        ['miss', pendMiss[seat]],
        ['hit', pendHit[seat]],
      ]) {
        if (pend === null) continue
        let nInBook = 0
        for (const a of legal) if (cardBook(a.card) === pend.book) nInBook++
        const booksLegal = new Set(legal.map((a) => cardBook(a.card)))
        const alt = ablations(style)
        const r1 = decide(view, alt.noDefuse, steps)
        const r2 = decide(view, alt.noRefine, steps)
        const r3 = decide(view, alt.neither, steps)
        const r4 = decide(view, alt.noConstraint, steps)
        const inBook = (a) => a.type === 'ask' && cardBook(a.card) === pend.book
        const sameCardA = (a) => a.type === 'ask' && a.card === pend.card
        recip.push({
          kind,
          gap: askIdx - pend.askIdx,
          sameBook: chosenBook === pend.book,
          sameBookAndSeat: chosenBook === pend.book && action.target === pend.asker,
          sameCard: action.card === pend.card,
          sameCardAndSeat: action.card === pend.card && action.target === pend.asker,
          chosenP,
          chosenCertain: chosenP >= 1 - EPS,
          altNoDefuseCard: sameCardA(r1),
          altNeitherCard: sameCardA(r3),
          availCard: legal.length > 0 ? nInBook / legal.length : 0,
          availBook: booksLegal.size > 0 ? (booksLegal.has(pend.book) ? 1 / booksLegal.size : 0) : 0,
          bookLegal: nInBook > 0,
          altNoDefuse: inBook(r1),
          altNoRefine: inBook(r2),
          altNeither: inBook(r3),
          altNoConstraint: inBook(r4),
          preBook: pend.preBook,
          preSame: pend.preBook !== null && pend.preBook === pend.book,
          defusalMoved: bestPlain !== null && bestWith !== null && bestPlain.r !== bestWith.r,
          argmaxP,
          uniqueArgmaxP: argmaxP && maxPn === 1,
        })
        if (kind === 'miss') pendMiss[seat] = null
        else pendHit[seat] = null
      }

      askCount.set(chosenBook, (askCount.get(chosenBook) ?? 0) + 1)
      askCountByTeam[seatTeam(seat)].set(chosenBook, (askCountByTeam[seatTeam(seat)].get(chosenBook) ?? 0) + 1)
    }

    const r = reduce(st, action)
    if (!r.ok) break
    const before = st
    st = r.state

    if (action.type === 'ask') {
      const hit = before.hands[action.target].includes(action.card)
      const book = cardBook(action.card)
      seq.push({ book, asker: action.seat, target: action.target, hit })
      if (hit) {
        hits++
        transfers.set(action.card, (transfers.get(action.card) ?? 0) + 1)
        const seen = everHeld.get(action.card) ?? new Set()
        if (seen.has(action.seat)) recaptures++
        seen.add(action.seat)
        everHeld.set(action.card, seen)
      }
      // The PRE-provocation counterfactual, and the decisive test of causation available here:
      // what would the target have asked if it had held the turn in the position that existed
      // BEFORE this ask? Same seat, same hand, same log minus this one event. `turn` is forced
      // onto the target because `legalAsksFromView` is [] for a non-turn-holder; nothing else in
      // the pipeline reads it, so this is the target's real view of the real position.
      let preBook = null
      if (before.phase === 'playing' && before.hands[action.target].length > 0) {
        const preView = { ...seatView(before, action.target), turn: action.target }
        delete preView.declareWindow
        const preAct = decide(preView, styles[action.target], steps)
        if (preAct.type === 'ask') preBook = cardBook(preAct.card)
      }
      const rec = { asker: action.seat, book, card: action.card, hit, askIdx, preBook }
      if (hit) pendHit[action.target] = rec
      else pendMiss[action.target] = rec
      askIdx++
    }
    if (action.type === 'claim') claimAt.push({ at: askIdx, book: action.book })
    steps++
  }

  // --- runs and adjacency
  let run = 0
  let runBook = null
  for (let i = 0; i < seq.length; i++) {
    if (i > 0) {
      adjacency.total++
      if (seq[i].book === seq[i - 1].book) {
        adjacency.same++
        if (seq[i].asker === seq[i - 1].asker) adjacency.sameChain++
        else {
          adjacency.sameSwap++
          if (seq[i].asker === seq[i - 1].target && seq[i].target === seq[i - 1].asker) adjacency.sameSwapBack++
        }
      }
    }
    if (i === 0 || seq[i].book === seq[i - 1].book) run++
    else {
      runLens.push(run)
      if (claimAt.some((c) => c.book === runBook && c.at >= i - run && c.at <= i)) runsEndedByClaim++
      run = 1
    }
    runBook = seq[i].book
  }
  if (run > 0) {
    runLens.push(run)
    if (claimAt.some((c) => c.book === runBook)) runsEndedByClaim++
  }

  const counts = BOOKS.map((b) => askCount.get(b) ?? 0)
  const sorted = [...counts].sort((a, b) => b - a)
  const tot = counts.reduce((a, b) => a + b, 0)
  const teamSets = [0, 0]
  for (const b of BOOKS) {
    const o = st.books[b]?.outcome
    if (o === 'team0') teamSets[0]++
    else if (o === 'team1') teamSets[1]++
  }
  const teamHhi = [0, 1].map((t) => {
    const c = BOOKS.map((b) => askCountByTeam[t].get(b) ?? 0)
    const s = c.reduce((a, x) => a + x, 0)
    return s > 0 ? c.reduce((a, n) => a + (n / s) ** 2, 0) : 0
  })
  gameRows.push({
    asks: tot,
    top1: tot > 0 ? sorted[0] / tot : 0,
    top2: tot > 0 ? (sorted[0] + sorted[1]) / tot : 0,
    top3: tot > 0 ? (sorted[0] + sorted[1] + sorted[2]) / tot : 0,
    hhi: tot > 0 ? counts.reduce((a, n) => a + (n / tot) ** 2, 0) : 0,
    zero: counts.filter((n) => n === 0).length,
    le2: counts.filter((n) => n <= 2).length,
    resolved: BOOKS.filter((b) => st.books[b]).length,
    resolvedNoAsk: BOOKS.filter((b) => st.books[b] && (askCount.get(b) ?? 0) === 0).length,
    teamHhi,
    teamSets,
    steps,
    hits,
    recaptures,
    distinctMoved: transfers.size,
    moved3: [...transfers.values()].filter((n) => n >= 3).length,
    moved4: [...transfers.values()].filter((n) => n >= 4).length,
    maxMoves: Math.max(0, ...transfers.values()),
  })
}

/* ---------------------------------------------------------------- reporting --- */

const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)
const pct = (a, b) => (b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(1)}%`)
function pearson(xs, ys) {
  const n = xs.length
  if (n < 2) return 0
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy)
}
const quantile = (xs, q) => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

const out = { arm: ARM, games: GAMES }
console.log(`=== arm ${ARM}, games ${GAMES} ===`)
console.log(`ask decisions ${askDecisions}; mean asks/game ${mean(gameRows.map((r) => r.asks)).toFixed(1)}; mean steps/game ${mean(gameRows.map((r) => r.steps)).toFixed(0)}`)

console.log('\n--- (1) reciprocity: B was asked for a card of H; is B\'s next ask into H? ---')
const subsets = [
  ['MISS provocation (B receives the turn, row 10)', recip.filter((r) => r.kind === 'miss')],
  ['  ... and H is still legally askable by B', recip.filter((r) => r.kind === 'miss' && r.bookLegal)],
  ['  ... and H is NOT legally askable by B', recip.filter((r) => r.kind === 'miss' && !r.bookLegal)],
  ['HIT provocation (asker kept the turn)', recip.filter((r) => r.kind === 'hit')],
  ['  ... and H is still legally askable by B', recip.filter((r) => r.kind === 'hit' && r.bookLegal)],
]
out.recip = {}
for (const [name, rs] of subsets) {
  const n = rs.length
  const same = rs.filter((r) => r.sameBook).length
  const sameSeat = rs.filter((r) => r.sameBookAndSeat).length
  const availC = mean(rs.map((r) => r.availCard))
  const availB = mean(rs.map((r) => r.availBook))
  console.log(
    `${name}\n    N=${n}  intoH ${pct(same, n)}  intoH&backAtAsker ${pct(sameSeat, n)}  |  baseline: legal-ask share ${(100 * availC).toFixed(1)}%, uniform-over-askable-sets ${(100 * availB).toFixed(1)}%  |  lift ${availC > 0 ? (same / n / availC).toFixed(2) : 'n/a'}x  meanGap ${mean(rs.map((r) => r.gap)).toFixed(1)}`,
  )
  out.recip[name.trim()] = { n, same, sameSeat, availC, availB }
}

console.log('\n--- (1b) availability-MATCHED control: chosen rate for the provoking set vs every other legally-askable set, inside the same availability bucket ---')
const BUCKETS = [0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.6, 1.01]
out.matched = []
console.log('  availability bucket |  provoking set: chosen / N  |  other sets: chosen / N')
for (let i = 0; i < BUCKETS.length - 1; i++) {
  const lo = BUCKETS[i]
  const hi = BUCKETS[i + 1]
  const inB = matched.filter((m) => m.avail >= lo && m.avail < hi)
  const p = inB.filter((m) => m.isProv)
  const o = inB.filter((m) => !m.isProv)
  if (p.length + o.length === 0) continue
  const pc0 = p.filter((m) => m.chosen).length
  const oc = o.filter((m) => m.chosen).length
  console.log(
    `  [${lo.toFixed(2)}, ${hi.toFixed(2)})        |  ${pct(pc0, p.length)} of ${p.length}  |  ${pct(oc, o.length)} of ${o.length}`,
  )
  out.matched.push({ lo, hi, provN: p.length, provChosen: pc0, otherN: o.length, otherChosen: oc })
}
{
  const p = matched.filter((m) => m.isProv)
  const o = matched.filter((m) => !m.isProv)
  console.log(
    `  ALL                 |  ${pct(p.filter((m) => m.chosen).length, p.length)} of ${p.length}  |  ${pct(o.filter((m) => m.chosen).length, o.length)} of ${o.length}   (mean availability ${(100 * mean(p.map((m) => m.avail))).toFixed(1)}% vs ${(100 * mean(o.map((m) => m.avail))).toFixed(1)}%)`,
  )
}

console.log('\n--- (1d) PRE-provocation counterfactual: what would B have asked in the position that existed BEFORE the provoking ask? ---')
out.pre = {}
for (const [name, rs0] of [
  ['MISS provocations, H askable', recip.filter((r) => r.kind === 'miss' && r.bookLegal)],
  ['HIT provocations, H askable', recip.filter((r) => r.kind === 'hit' && r.bookLegal)],
]) {
  const rs = rs0.filter((r) => r.preBook !== null)
  const n = rs.length
  const pre = rs.filter((r) => r.preSame).length
  const post = rs.filter((r) => r.sameBook).length
  const both = rs.filter((r) => r.preSame && r.sameBook).length
  const flipped = rs.filter((r) => !r.preSame && r.sameBook).length
  console.log(
    `${name} (N=${n} with a well-defined counterfactual):\n` +
      `    would already have asked into H BEFORE being provoked : ${pct(pre, n)}\n` +
      `    actually asked into H AFTER being provoked            : ${pct(post, n)}\n` +
      `    provocation SWITCHED the choice into H                : ${pct(flipped, n)}   (already there and stayed: ${pct(both, n)})`,
  )
  out.pre[name] = { n, pre, post, both, flipped }
}

console.log('\n--- (1c) WHAT is asked back: the same card, or another card of the same set? ---')
for (const [name, rs] of [
  ['MISS provocations, H askable', recip.filter((r) => r.kind === 'miss' && r.bookLegal)],
  ['HIT provocations, H askable', recip.filter((r) => r.kind === 'hit' && r.bookLegal)],
]) {
  const into = rs.filter((r) => r.sameBook)
  const n = into.length
  console.log(
    `${name}: of the ${n} asks into H — the EXACT card just asked for ${pct(into.filter((r) => r.sameCard).length, n)}; a different card of H at the provoking seat ${pct(into.filter((r) => !r.sameCard && r.sameBookAndSeat).length, n)}; a different card of H elsewhere ${pct(into.filter((r) => !r.sameCard && !r.sameBookAndSeat).length, n)}`,
  )
  console.log(
    `    mean hit probability of the chosen ask ${mean(into.map((r) => r.chosenP)).toFixed(3)}; CERTAIN hit ${pct(into.filter((r) => r.chosenCertain).length, n)}`,
  )
  console.log(
    `    the exact-card ask survives ablation: defuse=0 ${pct(rs.filter((r) => r.altNoDefuseCard).length, rs.length)}; both off ${pct(rs.filter((r) => r.altNeitherCard).length, rs.length)}; real ${pct(rs.filter((r) => r.sameCard).length, rs.length)}`,
  )
  out[`what_${name}`] = {
    n,
    sameCard: into.filter((r) => r.sameCard).length,
    diffCardSameSeat: into.filter((r) => !r.sameCard && r.sameBookAndSeat).length,
    diffCardElsewhere: into.filter((r) => !r.sameCard && !r.sameBookAndSeat).length,
    meanP: mean(into.map((r) => r.chosenP)),
    certain: into.filter((r) => r.chosenCertain).length,
  }
}

console.log('\n--- (2) concentration (per game) ---')
console.log(
  `top-1 set ${(100 * mean(gameRows.map((r) => r.top1))).toFixed(1)}%  top-2 ${(100 * mean(gameRows.map((r) => r.top2))).toFixed(1)}%  top-3 ${(100 * mean(gameRows.map((r) => r.top3))).toFixed(1)}%  (uniform over 9: 11.1 / 22.2 / 33.3%)`,
)
console.log(
  `HHI ${mean(gameRows.map((r) => r.hhi)).toFixed(4)} (uniform over 9 = 0.1111)  |  sets with ZERO asks ${mean(gameRows.map((r) => r.zero)).toFixed(2)}/9  sets with <=2 asks ${mean(gameRows.map((r) => r.le2)).toFixed(2)}/9`,
)
console.log(
  `sets resolved ${mean(gameRows.map((r) => r.resolved)).toFixed(2)}/9  |  resolved having never been asked into ${mean(gameRows.map((r) => r.resolvedNoAsk)).toFixed(2)}`,
)
out.concentration = {
  top1: mean(gameRows.map((r) => r.top1)),
  top2: mean(gameRows.map((r) => r.top2)),
  top3: mean(gameRows.map((r) => r.top3)),
  hhi: mean(gameRows.map((r) => r.hhi)),
  zero: mean(gameRows.map((r) => r.zero)),
  le2: mean(gameRows.map((r) => r.le2)),
  resolved: mean(gameRows.map((r) => r.resolved)),
  resolvedNoAsk: mean(gameRows.map((r) => r.resolvedNoAsk)),
  asks: mean(gameRows.map((r) => r.asks)),
}

console.log('\n--- (3) ping-pong runs (maximal runs of consecutive asks into the same set) ---')
const hist = new Map()
for (const l of runLens) hist.set(l, (hist.get(l) ?? 0) + 1)
const inLongRuns = (min) => runLens.filter((l) => l >= min).reduce((a, b) => a + b, 0) / Math.max(1, runLens.reduce((a, b) => a + b, 0))
console.log(
  `N=${runLens.length} runs; mean ${mean(runLens).toFixed(2)}; p50 ${quantile(runLens, 0.5)}; p90 ${quantile(runLens, 0.9)}; p99 ${quantile(runLens, 0.99)}; max ${Math.max(0, ...runLens)}`,
)
console.log(`  share of ALL asks inside a run of >=4: ${(100 * inLongRuns(4)).toFixed(1)}%; >=6: ${(100 * inLongRuns(6)).toFixed(1)}%`)
console.log(`  histogram: ${[...hist.keys()].sort((a, b) => a - b).slice(0, 16).map((l) => `${l}:${hist.get(l)}`).join(' ')}`)
console.log(
  `  adjacent ask pairs into the SAME set: ${pct(adjacency.same, adjacency.total)} of ${adjacency.total}\n    of those: same asker (a hit chain, row 9) ${pct(adjacency.sameChain, adjacency.same)}; asker changed ${pct(adjacency.sameSwap, adjacency.same)}; strict ask-BACK (A->B then B->A, same set) ${pct(adjacency.sameSwapBack, adjacency.same)}`,
)
out.runs = { n: runLens.length, mean: mean(runLens), hist: Object.fromEntries(hist), adjacency, share4: inLongRuns(4), share6: inLongRuns(6) }

console.log('\n--- (3b) card oscillation: is the SAME physical card being traded back and forth? ---')
console.log(
  `per game: hits ${mean(gameRows.map((r) => r.hits)).toFixed(1)}; distinct cards that ever moved ${mean(gameRows.map((r) => r.distinctMoved)).toFixed(1)}; moves per moved card ${(mean(gameRows.map((r) => r.hits)) / Math.max(1e-9, mean(gameRows.map((r) => r.distinctMoved)))).toFixed(2)}`,
)
console.log(
  `  hits that RETURN a card to a seat that already held it ("recapture"): ${pct(gameRows.reduce((a, r) => a + r.recaptures, 0), gameRows.reduce((a, r) => a + r.hits, 0))} of ${gameRows.reduce((a, r) => a + r.hits, 0)}`,
)
console.log(
  `  cards moved >=3 times: ${mean(gameRows.map((r) => r.moved3)).toFixed(2)}/game; >=4 times: ${mean(gameRows.map((r) => r.moved4)).toFixed(2)}/game; max moves of one card ${Math.max(0, ...gameRows.map((r) => r.maxMoves))}`,
)
out.oscillation = {
  hits: mean(gameRows.map((r) => r.hits)),
  distinctMoved: mean(gameRows.map((r) => r.distinctMoved)),
  recaptureRate: gameRows.reduce((a, r) => a + r.recaptures, 0) / Math.max(1, gameRows.reduce((a, r) => a + r.hits, 0)),
  moved3: mean(gameRows.map((r) => r.moved3)),
  moved4: mean(gameRows.map((r) => r.moved4)),
}

console.log('\n--- (4) concentration vs outcome (OBSERVATIONAL — association only) ---')
const dH = gameRows.map((r) => r.teamHhi[0] - r.teamHhi[1])
const dS = gameRows.map((r) => r.teamSets[0] - r.teamSets[1])
console.log(`corr(own-team ask HHI - opponent HHI, own sets - opponent sets) = ${pearson(dH, dS).toFixed(3)}  N=${gameRows.length} games`)
console.log(`corr(game HHI, asks per game) = ${pearson(gameRows.map((r) => r.hhi), gameRows.map((r) => r.asks)).toFixed(3)}`)
console.log(`corr(game HHI, sets resolved) = ${pearson(gameRows.map((r) => r.hhi), gameRows.map((r) => r.resolved)).toFixed(3)}`)
out.outcome = {
  corrHhiSets: pearson(dH, dS),
  corrHhiAsks: pearson(gameRows.map((r) => r.hhi), gameRows.map((r) => r.asks)),
  corrHhiResolved: pearson(gameRows.map((r) => r.hhi), gameRows.map((r) => r.resolved)),
}

console.log('\n--- (5) mechanism ---')
console.log(
  `ALL ask decisions (N=${askDecisions}): chosen ask attains the max refined hit-p ${pct(chosenIsArgmaxP, askDecisions)} (that max unique ${pct(chosenIsUniqueArgmaxP, askDecisions)}); refinement raised the chosen ask's p above the slot prior ${pct(refinedRaisedChosen, askDecisions)}; the defusal credit moved the top of the ranking ${pct(defusalChanged, askDecisions)}`,
)
for (const [name, rs] of [
  ['MISS provocations, H askable', recip.filter((r) => r.kind === 'miss' && r.bookLegal)],
  ['HIT provocations, H askable', recip.filter((r) => r.kind === 'hit' && r.bookLegal)],
]) {
  const n = rs.length
  console.log(
    `${name} (N=${n}):\n` +
      `    real policy asks into H          ${pct(rs.filter((r) => r.sameBook).length, n)}\n` +
      `    ablation defuse=0                ${pct(rs.filter((r) => r.altNoDefuse).length, n)}\n` +
      `    ablation refinedInference=off    ${pct(rs.filter((r) => r.altNoRefine).length, n)}\n` +
      `    ablation both off                ${pct(rs.filter((r) => r.altNeither).length, n)}\n` +
      `    ablation both off + no set-constraints (the ask publishes nothing) ${pct(rs.filter((r) => r.altNoConstraint).length, n)}\n` +
      `    chosen ask was the argmax on hit probability alone ${pct(rs.filter((r) => r.argmaxP).length, n)} (uniquely ${pct(rs.filter((r) => r.uniqueArgmaxP).length, n)})\n` +
      `    of the asks INTO H, argmax-on-p  ${pct(rs.filter((r) => r.sameBook && r.argmaxP).length, rs.filter((r) => r.sameBook).length)}; defusal moved the top ${pct(rs.filter((r) => r.sameBook && r.defusalMoved).length, rs.filter((r) => r.sameBook).length)}`,
  )
  out[`mech_${name}`] = {
    n,
    real: rs.filter((r) => r.sameBook).length,
    noDefuse: rs.filter((r) => r.altNoDefuse).length,
    noRefine: rs.filter((r) => r.altNoRefine).length,
    neither: rs.filter((r) => r.altNeither).length,
    argmaxP: rs.filter((r) => r.argmaxP).length,
    intoHArgmaxP: rs.filter((r) => r.sameBook && r.argmaxP).length,
    intoHDefusalMoved: rs.filter((r) => r.sameBook && r.defusalMoved).length,
  }
}

if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
