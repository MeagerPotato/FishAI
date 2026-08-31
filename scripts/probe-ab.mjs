/**
 * probe-ab.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * The counterfactual the correlation study cannot give: does an off-limits-aware ask policy
 * actually WIN? A prototype seat re-ranks its legal asks by expected cards rather than by the
 * shipped score, charging the miss branch for what the conceded target would harvest:
 *
 *     EV(ask) = p * (1 + E)  -  (1 - p) * D(target)
 *
 *   p  = the seat's own hit estimate (refined, hard skill).
 *   E  = cards a turn yields, hits/max(1,misses) off the public log — contained.ts's derivation.
 *   D  = cards the conceded target harvests, fitted by probe-danger.mjs over 12,376 observed
 *        concessions:  D = 0.885 + 0.391 * licence,  licence = sum over sets the target has
 *        publicly shown a basis in (row 6, read off the log) of the cards of that set this seat
 *        can certainly locate on its OWN team.
 *
 * Duplicate deals: every seed is played in both orientations, so the comparison is paired and
 * the deal is not a confound (BOT_LAB.md §5.1).
 */
import { newGame, reduce, seatView, us54Config, allBooks, bookCards, cardBook, seatTeam, ALL_SEATS, rulesFor } from '../lib/engine/index.ts'
import { askHitProbability, buildKnowledge, holderOf, rankAsksWith, refinedHitProbability } from '../lib/engine/bots/knowledge.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { planContainedPass } from '../lib/engine/bots/contained.ts'
import { SKILL_PRESETS } from '../lib/engine/bots/style.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 300)
const LAMBDA = Number(process.argv[3] ?? 1)      // appetite: 0 reproduces the baseline exactly
// Measured against the PRE-CONCESSION baseline, deliberately. These arms were run before
// defusal shipped, and the roster now carries `defuse: 1`; leaving it on would mean the control
// arm was the shipped defusal policy rather than the plain ranker, and the byte-exact control
// below would fail against a baseline these numbers were never measured against. So the
// mirror and both teams run at `defuse: 0`, which is what CONCESSION.md sections 2, 2.1, 4 and 5
// report. To measure a NEW mechanism against the shipped policy, use probe-licence3.mjs, whose
// mirror carries the defusal term.
const STYLE = { ...STYLE_ROSTER[process.argv[4] ?? 'balanced'], defuse: 0 }
const MODE = process.argv[5] ?? 'danger'
const BANK = process.argv[6] ?? 'ab'
const STRENGTH = Number(process.argv[7] ?? 1)   // seed bank: 'ab' was used to choose lambda; use another to hold out   // 'danger' | 'null'

/**
 * The null control. A perturbation of the same MAGNITUDE as the danger penalty but carrying no
 * information: a deterministic hash of (seat, target) mapped onto the same 0..3 prey range. If
 * the informative term and the null term cost the same, the loss is the perturbation, not the
 * signal — which is a completely different conclusion.
 */
function nullPrey(view, s) {
  let h = 2166136261 ^ s ^ (view.log.length * 16777619)
  h = Math.imul(h ^ (h >>> 13), 16777619)
  return ((h >>> 0) % 4)
}

const D0 = 0.885, D1 = 0.391
let fires = 0, chances = 0, askSum = 0, tgtSum = 0, oneTarget = 0, oneAsk = 0

function licenceOf(view, s) {
  const out = new Set()
  for (const ev of view.log) if (ev.type === 'ask' && ev.asker === s) out.add(cardBook(ev.card))
  for (const b of [...out]) if (view.books[b]) out.delete(b)
  return out
}

/** Reachable prey: cards of sets `s` has a public basis in that sit certainly with MY team. */
function preyOf(view, k, s) {
  const myTeam = seatTeam(view.seat)
  let prey = 0
  for (const b of licenceOf(view, s)) {
    for (const c of bookCards(b, config)) {
      const h = holderOf(k, c)
      if (h !== null && seatTeam(h) === myTeam) prey++
    }
  }
  return prey
}

function dangerOf(view, k, s) {
  if (MODE === 'null') return D0 + D1 * nullPrey(view, s)
  const myTeam = seatTeam(view.seat)
  let prey = 0
  for (const b of licenceOf(view, s)) {
    for (const c of bookCards(b, config)) {
      const h = holderOf(k, c)
      if (h !== null && seatTeam(h) === myTeam) prey++
    }
  }
  return D0 + D1 * prey
}

/**
 * The prototype. It must reproduce `pickAsk` EXACTLY when the danger term is switched off, or
 * every arm is confounded by the parts of `pickAsk` it silently dropped. So it mirrors
 * decide.ts:1020-1082 faithfully: the refined re-score (`s = score + wHit * (refined - base)`),
 * the deterministic sort, the `minHitP` pool, then the two near-tie windows. Only after that is
 * the danger term applied. At `LAMBDA` 0 it reproduces `decide` at `defuse: 0` byte-for-byte,
 * which is what `node scripts/probe-ab.mjs 200 0` checks: it must print `0.0000 +/- 0.0000`.
 */
function pickAskLike(view, k, ranked, penaltyOf, tieBreak) {
  const scored = ranked.map((r, idx) => {
    const base = askHitProbability(k, r.card, r.target)
    const refined = refinedHitProbability(k, r.card, r.target)
    return { r, refined, s: r.score + STYLE.wHit * (refined - base) - penaltyOf(r, refined), idx }
  })
  scored.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.idx - b.idx))
  const pool =
    STYLE.minHitP > 0 && scored.some((x) => x.r.p >= STYLE.minHitP)
      ? scored.filter((x) => x.r.p >= STYLE.minHitP)
      : scored
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
    // The teammate-information tie-break, inserted AHEAD of the existing ones so it spends only
    // the choice that is already free. fishlabs measured that 53.8% of contested ask decisions
    // tie bit-for-bit and that nothing anywhere prices information delivered to a teammate;
    // this is that gap, filled at zero cost in hit probability.
    if (tieBreak) {
      const va = tieBreak(a.r), vb = tieBreak(b.r)
      if (va !== vb) return vb - va
    }
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
  const isOrdinaryAsk =
    rulesFor(view.config).declareTiming === 'anyTime' && view.phase === 'playing' && !view.declareWindow
  if (!isOrdinaryAsk) return decide(view, STYLE, seed)
  const k = buildKnowledge(view, { useConstraints: true })
  const ranked = rankAsksWith(view, k, STYLE)
  if (ranked.length === 0) return decide(view, STYLE, seed)
  let hits = 0, misses = 0
  for (const ev of view.log) { if (ev.type === 'ask') { if (ev.hit) hits++; else misses++ } }
  const E = hits / Math.max(1, misses)
  const cache = new Map()
  const dangerAt = (t) => {
    if (!cache.has(t)) cache.set(t, dangerOf(view, k, t))
    return cache.get(t)
  }
  const preyCache = new Map()
  const preyAt = (t) => {
    if (!preyCache.has(t)) preyCache.set(t, preyOf(view, k, t))
    return preyCache.get(t)
  }
  let penaltyOf
  if (MODE === 'strict') {
    // A hard veto expressed as a prohibitive penalty, so the waiver is automatic: when every
    // ask is vetoed they are all penalised equally and the shipped order survives.
    penaltyOf = (r, refined) => (refined < 0.34 && preyAt(r.target) >= LAMBDA ? 1e6 : 0)
  } else if (MODE === 'defuse') {
    // The positive reading of the same threat model. If danger and opportunity are the same
    // fact (row 6 cuts both ways), the right response to a dangerous seat is not to avoid it
    // but to STRIP it: a hit takes the card, keeps the turn (row 9), and removes the licence
    // that made the seat dangerous. Credited on the HIT branch, weighted by p, and only for a
    // card whose removal actually shrinks the target's reach.
    penaltyOf = (r, refined) => {
      const b = cardBook(r.card)
      if (!licenceOf(view, r.target).has(b)) return 0
      const removed = D1 * preyAt(r.target)          // danger this book contributes, in cards
      return -(STYLE.wHit * refined * LAMBDA * removed) / (1 + E)   // negative penalty = bonus
    }
  } else if (MODE === 'defuse2') {
    // Per-book variant: credit only the prey in the set actually being asked into, which is the
    // only prey a hit on that card can plausibly protect. More principled than crediting the
    // target's whole reach; the question is whether it measures better.
    penaltyOf = (r, refined) => {
      const b = cardBook(r.card)
      if (!licenceOf(view, r.target).has(b)) return 0
      let prey = 0
      for (const c of bookCards(b, config)) {
        const h = holderOf(k, c)
        if (h !== null && seatTeam(h) === seatTeam(view.seat)) prey++
      }
      return -(STYLE.wHit * refined * LAMBDA * D1 * prey) / (1 + E)
    }
  } else if (MODE === 'signal2') {
    // Pure tie-break ON TOP OF the shipped defusal term, so the arm isolates the tie-break alone
    // rather than re-measuring the absence of defusal. The score is untouched by the tie-break,
    // so nothing is paid for it.
    penaltyOf = (r, refined) => {
      const b = cardBook(r.card)
      if (!licenceOf(view, r.target).has(b)) return 0
      let prey = 0
      for (const c of bookCards(b, config)) {
        const h = holderOf(k, c)
        if (h !== null && seatTeam(h) === seatTeam(view.seat)) prey++
      }
      return -(STYLE.wHit * refined * 1 * D1 * prey) / (1 + E)
    }
  } else if (MODE === 'stall') {
    // Mechanism (3). Under us54 emptying the opponents does not open an endgame; it ends the
    // ASK CHANNEL (row 8 needs a target holding cards), after which every remaining set must be
    // declared on the log as it then stands. So when exactly one opponent still holds cards and
    // is down to its last few, penalise the asks that would finish it off — proportionally to
    // how much this team still cannot prove.
    const oppLive = ALL_SEATS.filter((t) => seatTeam(t) !== seatTeam(view.seat) && view.counts[t] > 0)
    const oppTotal = oppLive.reduce((n, t) => n + view.counts[t], 0)
    const unresolved = allBooks(config).filter((b) => !view.books[b]).length
    // Widened trigger: the whole opposing side is nearly out, not just one seat on one card.
    if (oppTotal > LAMBDA || unresolved === 0) {
      penaltyOf = () => 0
    } else {
      chances++
      {
        const tg = new Set(ranked.map((r) => r.target))
        askSum += ranked.length; tgtSum += tg.size
        if (tg.size <= 1) oneTarget++
        if (ranked.length <= 1) oneAsk++
      }
      const last = oppLive[0]
      const remaining = oppTotal
      // Cards of unresolved sets this seat CANNOT yet place on its own team — what would have to
      // be guessed if the channel closed now. The price of closing it, in cards.
      let unproven = 0
      for (const b of allBooks(config)) {
        if (view.books[b]) continue
        for (const c of bookCards(b, config)) {
          const h = holderOf(k, c)
          if (h === null || seatTeam(h) !== seatTeam(view.seat)) unproven++
        }
      }
      // Charge any ask that could finish the side off: with `oppTotal` cards left in total, a
      // hit chain of that length ends the channel. Price it by what is still unproven.
      penaltyOf = (r, refined) => (STRENGTH * STYLE.wHit * refined * unproven) / (1 + E) / 6 / Math.max(1, remaining)
    }
  } else if (MODE === 'signal') {
    // Mechanism (2). An ask publishes "I hold >= 1 of this set" and "I lack this card" (rows
    // 6-7). Those facts are what make a later declare land: sets declared correctly had been
    // asked into ~12 times, sets declared wrongly ~7. Bonus for asking into a set this team
    // still cannot prove, scaled by how close the ask channel is to closing — because with the
    // channel open declares are already ~100% correct and there is nothing to buy.
    const oppCards = ALL_SEATS.filter((t) => seatTeam(t) !== seatTeam(view.seat)).reduce((n, t) => n + view.counts[t], 0)
    const urgency = oppCards > 0 ? Math.max(0, 1 - oppCards / 9) : 1
    penaltyOf = (r) => {
      const b = cardBook(r.card)
      if (view.books[b]) return 0
      let unproven = 0
      for (const c of bookCards(b, config)) {
        const h = holderOf(k, c)
        if (h === null || seatTeam(h) !== seatTeam(view.seat)) unproven++
      }
      return -(STYLE.wHit * LAMBDA * urgency * unproven) / 6
    }
  } else {
    penaltyOf = (r, refined) => (STYLE.wHit * (1 - refined) * LAMBDA * dangerAt(r.target)) / (1 + E)
  }
  // Allocation ambiguity: cards of a set that are certainly on this team but whose exact holder
  // is still open. That is precisely the error class a declare gets wrong (right team, wrong
  // teammate) and precisely the class no amount of inference can resolve, because the posterior
  // over it is flat. An ask into the set publishes "I hold at least one of these" (row 6), which
  // is the only public act that narrows it.
  const ambiguity = (book) => {
    let n = 0
    for (const c of bookCards(book, config)) {
      const cand = k.cands[c]
      if (cand !== undefined && cand.length > 1 && cand.every((t) => seatTeam(t) === seatTeam(view.seat))) n++
    }
    return n
  }
  const tb = MODE === 'signal2' ? (r) => ambiguity(cardBook(r.card)) : undefined
  const best = pickAskLike(view, k, ranked, penaltyOf, tb)
  if (MODE === 'stall') { const plain = pickAskLike(view, k, ranked, () => 0); if (plain !== best) fires++ }
  // decide.ts:1445-1451 — the CONTAINMENT.md turn-pass is offered against the chosen ask.
  // Balanced carries containedPass: 1, so omitting it would make the control non-exact.
  const pass = planContainedPass(view, k, STYLE, SKILL_PRESETS.hard, best)
  if (pass !== null) return { type: 'ask', seat: view.seat, target: pass.target, card: pass.card }
  return { type: 'ask', seat: view.seat, target: best.target, card: best.card }
}

function play(seed, awareTeam) {
  let st = newGame(seed, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 6000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const action = seatTeam(seat) === awareTeam ? decideAware(view, steps) : decide(view, STYLE, steps)
    const r = reduce(st, action)
    if (!r.ok) return null
    st = r.state
    steps++
  }
  if (st.phase !== 'finished') return null
  return { sets: [st.score[0], st.score[1]], aware: st.score[awareTeam], opp: st.score[1 - awareTeam] }
}

let pairs = 0, awareSets = 0, oppSets = 0, awareWins = 0, oppWins = 0, voided = 0
const deltas = []
for (let g = 0; g < GAMES; g++) {
  const seed = `${BANK}-${g}`
  const a = play(seed, 0)
  const b = play(seed, 1)
  if (a === null || b === null) { voided++; continue }
  pairs++
  awareSets += a.aware + b.aware
  oppSets += a.opp + b.opp
  awareWins += (a.aware > a.opp ? 1 : 0) + (b.aware > b.opp ? 1 : 0)
  oppWins += (a.aware < a.opp ? 1 : 0) + (b.aware < b.opp ? 1 : 0)
  deltas.push((a.aware - a.opp) + (b.aware - b.opp))
}
const n = deltas.length
const mean = deltas.reduce((x, y) => x + y, 0) / Math.max(1, n)
const sd = Math.sqrt(deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / Math.max(1, n - 1))
const se = sd / Math.sqrt(Math.max(1, n))
console.log(`mode ${MODE}, lambda ${LAMBDA}, style ${STYLE.id}, ${pairs} duplicate pairs (${voided} void)`)
console.log(`  sets: aware ${awareSets}  vs baseline ${oppSets}`)
console.log(`  wins: aware ${awareWins}  vs baseline ${oppWins}   (win rate ${((100 * awareWins) / (2 * pairs)).toFixed(2)}%)`)
console.log(`  paired set-difference per duplicate pair: ${mean.toFixed(4)} +/- ${(1.96 * se).toFixed(4)} (95%)`)
if (MODE === 'stall') {
  console.log(`  trigger positions ${chances}, decisions actually changed ${fires} (${((100*fires)/Math.max(1,chances)).toFixed(1)}%)`)
  console.log(`  at those positions: mean legal asks ${(askSum/Math.max(1,chances)).toFixed(2)}, mean distinct targets ${(tgtSum/Math.max(1,chances)).toFixed(2)}`)
  console.log(`  positions with only ONE possible target ${oneTarget} (${((100*oneTarget)/Math.max(1,chances)).toFixed(1)}%), only ONE legal ask ${oneAsk} (${((100*oneAsk)/Math.max(1,chances)).toFixed(1)}%)`)
}
