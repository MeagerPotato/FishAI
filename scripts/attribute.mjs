/**
 * attribute.mjs - where the sets go. A full-information attribution of a match's set
 * differential: by SET (the deal's split against the final owner and the mechanism that moved
 * it), by ASK (hit rates split by public certainty, by phase and by whether a hit was there to
 * be had), by TEMPO (runs of the turn and its share) and by DECLARE (accuracy, gifts, the fates
 * of locked sets and the lock hold) - with the ask policy's COUNTERFACTUAL at every ask
 * decision: what a Monet version would have asked from the same hand and the same public log,
 * scored on the true deal beside what was actually asked.
 *
 *   node scripts/attribute.mjs --home 200 [--a v0.4c] [--b v0.4c] [--cf v0.4c] [--label attr]
 *                              [--validate] [--json out.json]
 *   node scripts/attribute.mjs --records DIR|FILE [--prefix s-] [--per-seed] [--cf v0.4c] [--json out.json]
 *
 * Home: team 0 plays version A and team 1 version B in our own engine, full information by
 * construction. The record kept per game is the deal, the engine's public log and, per ask,
 * the live decision seed; the walk reconstructs every seat's view from those alone. With --cf
 * equal to a side's own version, the counterfactual at that side's decisions must agree with
 * the play 100% - that is the reconstruction's test, and --validate makes a disagreement fatal.
 * The walk also checks every recorded hit against the deal it tracks, so a record whose events
 * and deal disagree is refused rather than attributed.
 *
 * Bridge records (their engine's output - data, not code) load through --records DIR: a JSON
 * line per game with the deal and the event trace, translated into the same record shape - the
 * deal, the public log in engine form, and which team arm A played - and checked event by event
 * against the engine's own public hand counts and its half-suit awards.
 */
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const MON = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/monet.ts').href)
const CARDS = await import(pathToFileURL(process.cwd() + '/lib/engine/cards.ts').href)
const BOTS = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/index.ts').href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce, decide } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const has = (flag) => process.argv.includes(flag)

const HOME = Number(argOf('--home', 0))
const RECORDS = argOf('--records', null)
const PREFIX = argOf('--prefix', '')
const PER_SEED = has('--per-seed')
const VA = argOf('--a', 'v0.4c')
const VB = argOf('--b', 'v0.4c')
const CF = argOf('--cf', 'v0.4c')
// --locks: the declare priced on the records (a plan per declarable set per A seat per window; ~15 s a cell)
const LOCKS = process.argv.includes('--locks')
const LOCK_BARS = [0.5, 0.6, 0.7, 0.775, 0.9]
const LOCK_MIN_CARDS = Number(argOf('--locks-min', 4))
const LOCKS_WHY = process.argv.includes('--locks-why') // ask decide() at every certain-plan window and print the ones A never cashed
const MAJORITY = process.argv.includes('--majority') // MONET.md 3.8g: the majority conversion at ask decisions (needs --cf)
const MAJ_P = [0, 0.1, 0.3, 0.5, 0.7] // own-side mass bins: [0,0.1) [0.1,0.3) [0.3,0.5) [0.5,0.7) [0.7,1]
const LOCKS_BOTH = process.argv.includes('--locks-both') // probe B's declarable sets from B's seats too (the reliability table only)
const CALIB_P = [0.1, 0.3, 0.5, 0.7, 0.9, 1] // bin lower bounds: [0.1,0.3) [0.3,0.5) [0.5,0.7) [0.7,0.9) [0.9,1) and p = 1
// Declare rules priced on the records: a rule fires at the earliest window (before A's own declare of
// the set) where some A seat's plan satisfies it. u = guessed cards; u = 0 is the certain plan, the
// base's own business, priced once on its own and excluded from every speculative rule.
const RULES = []
RULES.push({ name: 'certain plan (u = 0), any seat', fire: (r) => r.u === 0 && r.p >= 1 })
for (const bar of LOCK_BARS) RULES.push({ name: `any u >= 1, p >= ${bar}`, fire: (r) => r.u >= 1 && r.p >= bar })
for (const bar of LOCK_BARS) RULES.push({ name: `gated u >= 1, p >= ${bar}`, fire: (r) => r.u >= 1 && r.gate && r.p >= bar })
for (const [b1, b2, b3] of [[0.9, 0.5, 0.5], [0.9, 0.6, 0.5], [0.9, 0.7, 0.5], [0.9, 0.7, 0.6], [0.9, 0.8, 0.6], [0.9, 0.8, 0.7], [0.95, 0.7, 0.5], [2, 0.7, 0.5], [2, 0.8, 0.6], [2, 0.8, 0.5], [2, 0.9, 0.7], [2, 2, 0.5], [2, 2, 0.7]]) {
  RULES.push({ name: `by u: u1 >= ${b1 > 1 ? 'never' : b1}, u2 >= ${b2 > 1 ? 'never' : b2}, u3+ >= ${b3}`, fire: (r) => r.u === 0 ? false : r.u === 1 ? r.p >= b1 : r.u === 2 ? r.p >= b2 : r.p >= b3 })
}
const newRuleStat = () => ({ fired: 0, right: 0, wrong: 0, savedSum: 0, byOutcome: { us: { n: 0, right: 0 }, them: { n: 0, right: 0 }, open: { n: 0, right: 0 } }, ev: 0, byU: [0, 0, 0, 0], foreign: 0, lostForeign: 0, giftedByMate: 0, atFinal: 0, openAtFour: 0, winIfCashed: 0, giftAtFour: 0, giftClinch: 0, giftForced: 0 })
const LABEL = argOf('--label', 'attr')
const JSON_OUT = argOf('--json', null)
const VALIDATE = has('--validate')
const CLINCH = 5 // us54: the deal ends when a team has been awarded five half-suits

const team = (seat) => seat % 2
const BOOKS = CARDS.allBooks(us54Config)
const BOOK_CARDS = new Map(BOOKS.map((b) => [b, CARDS.bookCards(b, us54Config)]))
const bookOf = (c) => CARDS.cardBook(c)

/* ------------------------------------------------------------------ home --- */

function playHome(label, polA, polB) {
  let s = newGame(label, us54Config, 0)
  const hands0 = s.hands.map((h) => [...h])
  const askMeta = new Map() // event index -> { moveIndex, seed, hands } at the live decision
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const seed = hashSeed(`${label}:${s.moveIndex}`)()
    const a = decide(view, team(seat) === 0 ? polA : polB, seed)
    const at = s.log.length
    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${label}: ${r.error.code} at move ${s.moveIndex}`)
    if (a.type === 'ask') {
      if (r.state.log[at]?.type !== 'ask') throw new Error(`${label}: ask at move ${s.moveIndex} did not log an ask event at ${at}`)
      askMeta.set(at, { moveIndex: s.moveIndex, seed, hands: s.hands.map((h) => [...h]) })
    }
    s = r.state
  }
  return { label, teamA: 0, hands0, events: s.log, askMeta }
}

/* ---------------------------------------------------------- accumulators --- */

function newAcc() {
  const askT = () => ({
    n: 0, hit: 0, certain: 0, certainHit: 0, unc: 0, uncHit: 0,
    phase: { early: { n: 0, hit: 0 }, mid: { n: 0, hit: 0 }, late: { n: 0, hit: 0 } },
    hitExists: 0, hitWhenExists: 0, ownLocked: 0, cfOwnLocked: 0, oppHeld: 0, cfOppHeld: 0,
    cfN: 0, cfAgree: 0, cfHit: 0, actHitAtCf: 0, cfDiff: 0, cfDiffHit: 0, actDiffHit: 0, cfNonAsk: 0,
    holding: { 1: { n: 0, hit: 0 }, 2: { n: 0, hit: 0 }, 3: { n: 0, hit: 0 }, 4: { n: 0, hit: 0 }, 5: { n: 0, hit: 0 } },
    cfHolding: { 1: { n: 0, hit: 0 }, 2: { n: 0, hit: 0 }, 3: { n: 0, hit: 0 }, 4: { n: 0, hit: 0 }, 5: { n: 0, hit: 0 } },
  })
  const declT = () => ({
    n: 0, correct: 0, gifts: 0, void: 0, forced: 0,
    locksFormed: 0, locksCashed: 0, locksBroken: 0, locksGifted: 0, locksOpen: 0, holdSum: 0, holdN: 0,
    locksOpenAtFourLost: 0, gamesLostWithLock: 0, // uncashed locks of this side at four sets when the other side clinched, and the games
    // --locks: the claimer's own plan p at its declares, by bin: the declare's outcome and the plan's own truth
    pBins: Object.fromEntries(['certain', 'high', 'mid', 'low', 'none'].map((k) => [k, { n: 0, right: 0, planRight: 0 }])),
  })
  const barT = () => ({ fired: 0, right: 0, wrong: 0, savedSum: 0, byOutcome: { us: { n: 0, right: 0 }, them: { n: 0, right: 0 }, open: { n: 0, right: 0 } }, ev: 0 })
  const lockStat = () => ({
    sets: 0, windows: 0, outcome: { us: 0, them: 0, open: 0 },
    // at the first window: the best gated p, the best any p, and whether the set was already a lock
    firstGated: 0, firstAny: 0, firstLock: 0,
    gated: Object.fromEntries(LOCK_BARS.map((b) => [b, barT()])),
    any: Object.fromEntries(LOCK_BARS.map((b) => [b, barT()])),
  })
  const tempoT = () => ({ runs: 0, hits: 0, passes: 0 })
  const fateT = () => ({ hits: 0, takeBack: 0, closes: 0, takenBack: 0, converted: 0, lost: 0, open: 0 })
  const missT = () => ({ n: 0, dangerSum: 0, dangerAny: 0, oppAsks: 0, oppHits: 0, oppFirstCertain: 0, asks: 0, askDangerSum: 0, askDangerAny: 0, cfAsks: 0, cfDangerSum: 0, cfDangerAny: 0 })
  const split = {}
  const locks = LOCKS ? lockStat() : null
  for (let k = 0; k <= 6; k++) split[k] = { n: 0, aCashed: 0, aGifted: 0, bCashed: 0, bGifted: 0, open: 0, openLocked: 0, openLeadA: 0, openLeadB: 0 }
  return {
    games: 0, wins: [0, 0], sets: [0, 0], open: 0, noClinch: 0, eventsToClinch: 0, badRecords: 0,
    split, asks: [askT(), askT()], decl: [declT(), declT()], locks, tempo: [tempoT(), tempoT()],
    fate: [fateT(), fateT()], miss: [missT(), missT()],
  }
}

/* ------------------------------------------------------------------ walk --- */

function walk(rec, cfPol, acc) {
  // sides, not teams: side 0 is arm A wherever it sits (rec.teamA is the team it plays)
  const side = (seat) => (team(seat) === rec.teamA ? 0 : 1)
  const hands = rec.hands0.map((h) => [...h])
  const seatOf = new Map()
  rec.hands0.forEach((h, x) => h.forEach((c) => seatOf.set(c, x)))
  const publicAt = new Map() // card -> the seat a public hit put it at, while it is in play
  const resolved = {}
  const awarded = [0, 0]
  const split0 = {}
  for (const b of BOOKS) {
    split0[b] = BOOK_CARDS.get(b).filter((c) => side(seatOf.get(c)) === 0).length
    acc.split[split0[b]].n++
  }
  const lock = {} // book -> { team, at } while the six sit in one team's hands, unresolved
  let lastAskTeam = -1
  let clinchAt = null
  const hitEntries = [] // every hit: { side, book, closes, takenBack, resolved }
  const lastHit = new Map() // card -> the latest hit entry on it while the set is unresolved
  let pendingMiss = null // { side, oppAsks, oppHits, first } until the missing side asks again
  // the danger of a target for the asker's side: publicly located cards of the asker's side whose
  // set the target holds a card of (a licence), on the true deal
  const dangerOf = (askerSide, target) => {
    let n = 0
    const licence = new Set(hands[target].map(bookOf))
    for (const [c, at] of publicAt) if (side(at) === askerSide && licence.has(bookOf(c))) n++
    return n
  }

  const sameTeamHolds = (b) => {
    let t = -1
    for (const c of BOOK_CARDS.get(b)) {
      const x = seatOf.get(c)
      if (x === undefined) return -1
      const tx = side(x)
      if (t === -1) t = tx
      else if (tx !== t) return -1
    }
    return t
  }
  const updateLocks = (i) => {
    for (const b of BOOKS) {
      if (resolved[b]) continue
      const t = sameTeamHolds(b)
      if (t >= 0) {
        if (!lock[b]) { lock[b] = { team: t, at: i }; acc.decl[t].locksFormed++ }
      } else if (lock[b]) {
        acc.decl[lock[b].team].locksBroken++
        delete lock[b]
      }
    }
  }
  const holdingOf = (sd, b) => { let n = 0; for (const c of BOOK_CARDS.get(b)) { const x = seatOf.get(c); if (x !== undefined && side(x) === sd) n++ } return n }
  const hitExists = (asker) => {
    const T = side(asker)
    const seen = new Set()
    for (const c of hands[asker]) {
      const b = bookOf(c)
      if (seen.has(b) || resolved[b]) continue
      seen.add(b)
      for (const d of BOOK_CARDS.get(b)) {
        const x = seatOf.get(d)
        if (x !== undefined && side(x) !== T) return true
      }
    }
    return false
  }
  const OPTS = cfPol ? { logWindow: cfPol.skill.logWindow, useConstraints: cfPol.skill.useConstraints, marginal: true } : null
  const track = {} // book -> { seq: [{ i, pg, rg, pa, ra }], declaredAt } for sets A's side could declare
  // --majority: book -> [episode of side 0, episode of side 1]; an episode opens when the side first
  // holds four of the six by the deal and closes when the set resolves (or at the clinch)
  const maj = {}
  const newMajAcc = () => ({
    cards: [0, 1].map(() => MAJ_P.map(() => ({ n: 0, chased: 0 }))),
    dec: [0, 1].map(() => ({ n: 0, chased: 0, chaseHit: 0, other: 0, otherHit: 0, bestRight: 0, bestRightNo: 0, noTable: 0, byMax: MAJ_P.map(() => ({ n: 0, chased: 0 })), otherHold: [0, 0, 0, 0, 0, 0], otherHoldHit: [0, 0, 0, 0, 0, 0] })),
    ep: [0, 1].map(() => ({ n: 0, chased: { n: 0, cashed: 0, taken: 0, open: 0, ev: 0 }, not: { n: 0, cashed: 0, taken: 0, open: 0, ev: 0 }, legalSum: 0, chaseSum: 0 })),
  })
  const majBin = (x) => { let j = 0; for (let q = 0; q < MAJ_P.length; q++) if (x >= MAJ_P[q]) j = q; return j }
  const openMaj = (i) => {
    for (const b of BOOKS) {
      if (resolved[b]) continue
      if (!maj[b]) maj[b] = [null, null]
      for (const T2 of [0, 1]) if (!maj[b][T2] && holdingOf(T2, b) >= 4) maj[b][T2] = { at: i, legal: 0, chased: 0 }
    }
  }
  const finishMaj = (b, outcomeTeam, i) => {
    if (!maj[b]) return
    if (!acc.maj) acc.maj = newMajAcc()
    for (const T2 of [0, 1]) {
      const e = maj[b][T2]
      if (!e) continue
      const E = acc.maj.ep[T2]
      const K = E[e.chased > 0 ? 'chased' : 'not']
      E.n++; E.legalSum += e.legal; E.chaseSum += e.chased
      K.n++; K.ev += i - e.at
      K[outcomeTeam === T2 ? 'cashed' : outcomeTeam === -1 ? 'open' : 'taken']++
      maj[b][T2] = null
    }
  }
  // at an ask decision: the asker's actionable majorities, the opponents' cards of them, the mass
  const majDecision = (view, ev, T, i) => {
    if (!acc.maj) acc.maj = newMajAcc()
    const a = ev.asker
    const sets = []
    for (const b of BOOKS) {
      if (resolved[b] || !maj[b] || !maj[b][T] || holdingOf(T, b) < 4) continue
      if (!hands[a].some((c) => bookOf(c) === b)) continue
      sets.push(b)
    }
    if (sets.length === 0) return
    const D = acc.maj.dec[T]
    D.n++
    const k = ENG.buildKnowledge(view, OPTS)
    const tbl = BOTS.attachMarginal(k)
    let maxOwn = 0, bestP = -1, bestRight = false, chase = false, chaseBook = null
    for (const b of sets) {
      maj[b][T].legal++
      for (const c of BOOK_CARDS.get(b)) {
        const x = seatOf.get(c)
        if (x === undefined || side(x) === T) continue
        // an opponent holds c: the asker's own-side mass on it, and its best opponent target
        const cand = k.cands[c] ?? []
        let own = 0, target = -1, tp = -1
        if (cand.length === 1) { own = side(cand[0]) === T ? 1 : 0; target = cand[0]; tp = 1 }
        else {
          const j = tbl ? tbl.index.get(c) : undefined
          if (j === undefined) { D.noTable++; continue }
          for (let s2 = 0; s2 < 6; s2++) { const v = tbl.p[j * 6 + s2]; if (side(s2) === T) own += v; else if (v > tp) { tp = v; target = s2 } }
        }
        const bin = majBin(own)
        acc.maj.cards[T][bin].n++
        if (ev.card === c) { acc.maj.cards[T][bin].chased++; chase = true; chaseBook = b }
        if (own > maxOwn) maxOwn = own
        if (tp > bestP) { bestP = tp; bestRight = target === x }
      }
    }
    if (chase) { D.chased++; if (ev.hit) D.chaseHit++; maj[chaseBook][T].chased++ } else {
      D.other++
      if (ev.hit) D.otherHit++
      if (bestRight) D.bestRightNo++
      const h = Math.min(5, holdingOf(T, bookOf(ev.card)))
      D.otherHold[h]++
      if (ev.hit) D.otherHoldHit[h]++
    }
    if (bestRight) D.bestRight++
    const M = D.byMax[majBin(maxOwn)]
    M.n++
    if (chase) M.chased++
  }
  const probe = (b, i, seat) => {
    const state = {
      config: us54Config, seed: rec.label, phase: 'playing', turn: seat,
      hands: hands.map((h, x) => (x !== seat ? [...h] : CARDS.sortHand(h, us54Config))),
      books: { ...resolved }, score: [awarded[0], awarded[1]],
      log: rec.events.slice(0, i), moveIndex: i,
    }
    const view = seatView(state, seat)
    const plan = BOTS.planClaimFor(view, cfPol, b)
    const myTeam = side(seat)
    let gate = plan.uncertain.length <= cfPol.style.declareMaxUncertain
    if (gate && plan.uncertain.length > 0) {
      const k = ENG.buildKnowledge(view, OPTS)
      for (const c of plan.uncertain) { const cand = k.cands[c] ?? []; if (cand.length === 0 || !cand.every((x) => side(x) === myTeam)) { gate = false; break } }
    }
    let right = sameTeamHolds(b) === myTeam
    if (right) for (const [c, x] of Object.entries(plan.assignments)) if (seatOf.get(c) !== x) { right = false; break }
    let why
    if (LOCKS_WHY && plan.uncertain.length === 0 && plan.p >= 1) {
      const nextAsk = rec.events.slice(i).find((e) => e.type === 'ask')
      const turn = nextAsk ? nextAsk.asker : seat
      const v2 = { ...view, declareWindow: { option: seat, declined: ((seat - turn) % 6 + 6) % 6 } }
      const d = BOTS.decideExplained(v2, cfPol, 1)
      const refused = (d.trace.refused ?? []).filter((r) => String(r.reason).includes(b)).map((r) => `${r.kind}: ${r.reason}`)
      why = `${d.action.type}${d.action.type === 'claim' ? ' ' + d.action.book : ''} [${d.trace.kind}] ${d.trace.headline}${refused.length ? ' | refused ' + refused.join(' ; ') : ''}`
    }
    return { p: plan.p, gate, right, u: plan.uncertain.length, lock: sameTeamHolds(b) === myTeam, foreign: !hands[seat].some((c) => bookOf(c) === b), seat, why }
  }
  const tallyCalib = (sd, r) => {
    if (!acc.calib) acc.calib = [0, 1].map(() => [0, 1, 2, 3].map(() => CALIB_P.map(() => ({ n: 0, right: 0, lock: 0, gn: 0, gright: 0 }))))
    const ub = Math.min(3, r.u)
    let pb = -1
    for (let j = 0; j < CALIB_P.length; j++) if (r.p >= CALIB_P[j]) pb = j
    if (pb < 0) return
    const C = acc.calib[sd][ub][pb]
    C.n++
    if (r.right) C.right++
    if (r.lock) C.lock++
    if (r.gate) { C.gn++; if (r.right) C.gright++ }
  }
  const probeWindow = (i) => {
    for (const sd of [0, 1]) {
      if (sd === 1 && !LOCKS_BOTH) continue
      for (const b of BOOKS) {
        if (resolved[b] || holdingOf(sd, b) < LOCK_MIN_CARDS) continue
        let pg = 0, pa = 0
        const ps = []
        for (let x = 0; x < 6; x++) {
          if (side(x) !== sd || hands[x].length === 0) continue
          const r = probe(b, i, x)
          tallyCalib(sd, r)
          if (sd === 0) ps.push(r)
          if (r.p > pa) pa = r.p
          if (r.gate && r.p > pg) pg = r.p
        }
        if (sd !== 0) continue
        if (!track[b]) { track[b] = { seq: [], declaredAt: -1 }; const S = acc.locks; S.sets++; S.firstGated += pg; S.firstAny += pa; if (sameTeamHolds(b) === 0) S.firstLock++ }
        track[b].seq.push({ i, ps })
        acc.locks.windows++
      }
    }
  }
  const finishSet = (b, outcome, endIndex, claimerSide, claimForced) => {
    const T = track[b]
    if (!T) return
    const S = acc.locks
    S.outcome[outcome]++
    if (!S.rules) S.rules = RULES.map(() => newRuleStat())
    for (let ri = 0; ri < RULES.length; ri++) {
      const rule = RULES[ri]
      let hit = null, at = -1
      for (const w of T.seq) {
        if (T.declaredAt >= 0 && w.i >= T.declaredAt) break
        for (const r of w.ps) if (rule.fire(r) && (hit === null || r.p > hit.p)) hit = r
        if (hit) { at = w.i; break }
      }
      if (!hit) continue
      const B = S.rules[ri]
      B.fired++
      B.byU[Math.min(3, hit.u)]++
      const O = B.byOutcome[outcome]
      O.n++
      if (hit.right) { B.right++; O.right++ } else B.wrong++
      B.savedSum += endIndex - at
      if (hit.foreign) { B.foreign++; if (outcome !== 'us') B.lostForeign++ }
      if (outcome === 'them' && claimerSide === 0) { B.giftedByMate++; if (awarded[0] === 4) B.giftAtFour++; if (awarded[1] === 4) B.giftClinch++; if (claimForced) B.giftForced++ }
      if (outcome === 'open' && at === rec.events.length - 1) B.atFinal++
      if (outcome === 'open' && awarded[0] === 4) { B.openAtFour++; if (hit.right && awarded[1] >= 5) B.winIfCashed++ }
      if (LOCKS_WHY && ri === 0 && outcome !== 'us') console.error(`WHY ${rec.label} set ${b} seat ${hit.seat} window ${at} of ${rec.events.length} score ${awarded[0]}-${awarded[1]} outcome ${outcome}${hit.foreign ? ' foreign' : ''} hand ${hands[hit.seat] ? hands[hit.seat].length : '?'} -> ${hit.why}
   tail: ${rec.events.slice(at).map((e) => e.type === 'claim' ? `claim@${e.claimer} ${e.book}${e.forced ? '!' : ''} ${e.outcome}` : e.type === 'ask' ? `ask@${e.asker}>${e.target} ${e.card} ${e.hit ? 'hit' : 'miss'}` : e.type === 'pass' ? `pass@${e.from}>${e.to}` : e.type).join(' ; ')}`)
      // set differential (A minus the other side) against what actually happened to the set:
      // right: cashed by A anyway 0, the other side got it +2, open at the clinch +1;
      // wrong (a gift): A would have cashed it -2, the other side got it anyway 0, open -1.
      B.ev += hit.right ? (outcome === 'us' ? 0 : outcome === 'them' ? 2 : 1) : (outcome === 'us' ? -2 : outcome === 'them' ? 0 : -1)
    }
    delete track[b]
  }
  updateLocks(0)

  for (let i = 0; i < rec.events.length; i++) {
    const ev = rec.events[i]
    if (LOCKS && cfPol) probeWindow(i)
    if (ev.type === 'ask') {
      const T = side(ev.asker)
      const A = acc.asks[T]
      const done = awarded[0] + awarded[1]
      const phase = done <= 1 ? 'early' : done <= 3 ? 'mid' : 'late'
      const certain = publicAt.get(ev.card) === ev.target
      const truth = seatOf.get(ev.card) === ev.target
      if (truth !== ev.hit) throw new Error(`${rec.label}: event ${i} says hit=${ev.hit} but the tracked deal says ${truth}`)
      A.n++
      if (ev.hit) A.hit++
      if (certain) { A.certain++; if (ev.hit) A.certainHit++ } else { A.unc++; if (ev.hit) A.uncHit++ }
      A.phase[phase].n++
      if (ev.hit) A.phase[phase].hit++
      if (hitExists(ev.asker)) { A.hitExists++; if (ev.hit) A.hitWhenExists++ }
      if (sameTeamHolds(bookOf(ev.card)) === T) A.ownLocked++
      { const x = seatOf.get(ev.card); if (x !== undefined && side(x) !== T) A.oppHeld++ }
      { const h = A.holding[Math.min(5, Math.max(1, holdingOf(T, bookOf(ev.card))))]; h.n++; if (ev.hit) h.hit++ }
      if (T !== lastAskTeam) { acc.tempo[T].runs++; lastAskTeam = T }
      if (pendingMiss) {
        if (pendingMiss.side === T) { const M = acc.miss[T]; M.oppAsks += pendingMiss.oppAsks; M.oppHits += pendingMiss.oppHits; if (pendingMiss.first) M.oppFirstCertain++; pendingMiss = null }
        else { if (pendingMiss.oppAsks === 0 && certain) pendingMiss.first = true; pendingMiss.oppAsks++; if (ev.hit) pendingMiss.oppHits++ }
      }
      { const M = acc.miss[T]; const d = dangerOf(T, ev.target); M.asks++; M.askDangerSum += d; if (d > 0) M.askDangerAny++ }
      if (cfPol) {
        const meta = rec.askMeta ? rec.askMeta.get(i) : undefined
        if (meta) {
          // the tracked deal must be the live one, as sets (order is the engine's business)
          for (let x = 0; x < 6; x++) {
            const a = [...hands[x]].sort().join(' ')
            const b = [...meta.hands[x]].sort().join(' ')
            if (a !== b) throw new Error(`${rec.label}: tracked hand ${x} differs from the live hand before event ${i}`)
          }
        }
        const state = {
          config: us54Config, seed: rec.label, phase: 'playing', turn: ev.asker,
          // abroad the adapter hands Monet a SORTED own hand; mirror it when no live order is known
          hands: (meta ? meta.hands : hands).map((h, x) => (meta || x !== ev.asker ? [...h] : CARDS.sortHand(h, us54Config))),
          books: { ...resolved }, score: [awarded[0], awarded[1]],
          log: rec.events.slice(0, i), moveIndex: meta ? meta.moveIndex : i,
        }
        const view = seatView(state, ev.asker)
        if (MAJORITY) { openMaj(i); majDecision(view, ev, T, i) }
        const seed = meta ? meta.seed : hashSeed(`${rec.label}:cf:${i}`)()
        const a = decide(view, cfPol, seed)
        if (a.type !== 'ask') A.cfNonAsk++
        else {
          A.cfN++
          const agree = a.card === ev.card && a.target === ev.target
          const cfHit = seatOf.get(a.card) === a.target
          if (agree) A.cfAgree++
          else {
            if (VALIDATE && meta) throw new Error(`${rec.label}: event ${i} played ${ev.card}->${ev.target}, cf ${a.card}->${a.target}`)
            A.cfDiff++
            if (cfHit) A.cfDiffHit++
            if (ev.hit) A.actDiffHit++
          }
          if (cfHit) A.cfHit++
          if (ev.hit) A.actHitAtCf++
          if (sameTeamHolds(bookOf(a.card)) === T) A.cfOwnLocked++
          { const x = seatOf.get(a.card); if (x !== undefined && side(x) !== T) A.cfOppHeld++ }
          { const M = acc.miss[T]; const d = dangerOf(T, a.target); M.cfAsks++; M.cfDangerSum += d; if (d > 0) M.cfDangerAny++ }
          { const h = A.cfHolding[Math.min(5, Math.max(1, holdingOf(T, bookOf(a.card))))]; h.n++; if (cfHit) h.hit++ }
        }
      }
      if (!ev.hit) {
        const M = acc.miss[T]; const d = dangerOf(T, ev.target); M.n++; M.dangerSum += d; if (d > 0) M.dangerAny++
        if (pendingMiss && pendingMiss.side !== T) { const P = acc.miss[pendingMiss.side]; P.oppAsks += pendingMiss.oppAsks; P.oppHits += pendingMiss.oppHits; if (pendingMiss.first) P.oppFirstCertain++ }
        pendingMiss = { side: T, oppAsks: 0, oppHits: 0, first: false }
      }
      if (ev.hit) {
        const F = acc.fate[T]; F.hits++
        if (certain) F.takeBack++
        const prev = lastHit.get(ev.card)
        if (prev && prev.side !== T && !prev.resolved) { prev.takenBack = true; F.takenBackOf = (F.takenBackOf || 0) + 1 }
        const entry = { side: T, book: bookOf(ev.card), closes: false, takenBack: false, resolved: false }
        hitEntries.push(entry); lastHit.set(ev.card, entry)
        hands[ev.target] = hands[ev.target].filter((c) => c !== ev.card)
        hands[ev.asker].push(ev.card)
        seatOf.set(ev.card, ev.asker)
        publicAt.set(ev.card, ev.asker)
        acc.tempo[T].hits++
        updateLocks(i)
        if (lock[entry.book] && lock[entry.book].team === T && lock[entry.book].at === i) { entry.closes = true; acc.fate[T].closes++ }
      }
    } else if (ev.type === 'claim') {
      const T = side(ev.claimer)
      const D = acc.decl[T]
      const b = ev.book
      const outcomeTeam = ev.outcome === 'team0' ? side(0) : ev.outcome === 'team1' ? side(1) : -1
      const correct = outcomeTeam === T
      D.n++
      if (ev.forced) D.forced++
      if (correct) D.correct++
      else if (outcomeTeam === -1) D.void++
      else D.gifts++
      const sp = acc.split[split0[b]]
      if (outcomeTeam === 0) sp[correct ? 'aCashed' : 'aGifted']++
      else if (outcomeTeam === 1) sp[correct ? 'bCashed' : 'bGifted']++
      if (LOCKS && cfPol) {
        if (hands[ev.claimer] !== undefined) {
          const r = probe(b, i, ev.claimer)
          const bin = r.p >= 1 ? 'certain' : r.p >= 0.775 ? 'high' : r.p >= 0.5 ? 'mid' : r.p > 0 ? 'low' : 'none'
          D.pBins[bin].n++
          if (correct) D.pBins[bin].right++
          if (r.right) D.pBins[bin].planRight++
        }
        if (track[b]) { if (T === 0 && correct) track[b].declaredAt = i; finishSet(b, outcomeTeam === 0 ? 'us' : 'them', i, T, !!ev.forced) }
      }
      if (MAJORITY && cfPol) finishMaj(b, clinchAt !== null && i > clinchAt ? -1 : outcomeTeam, clinchAt !== null && i > clinchAt ? clinchAt : i)
      const L = lock[b]
      if (L) {
        if (L.team === T && correct) { D.locksCashed++; D.holdSum += i - L.at; D.holdN++ }
        else if (L.team === T) D.locksGifted++
        else acc.decl[L.team].locksGifted++ // the other side declared a set it could not hold: a gift to the lock's team
        delete lock[b]
      }
      for (const c of BOOK_CARDS.get(b)) {
        const x = seatOf.get(c)
        if (x !== undefined) hands[x] = hands[x].filter((d) => d !== c)
        seatOf.delete(c)
        publicAt.delete(c)
      }
      for (const e of hitEntries) if (!e.resolved && e.book === b) { e.resolved = true; const F = acc.fate[e.side]; if (e.takenBack) F.takenBack++; if (outcomeTeam === e.side) F.converted++; else F.lost++ }
      resolved[b] = { book: b, outcome: ev.outcome, claimer: ev.claimer, assignments: ev.assignments, actualHolders: ev.actualHolders }
      if (outcomeTeam >= 0) { awarded[outcomeTeam]++; acc.sets[outcomeTeam]++ }
      if (clinchAt === null && (awarded[0] >= CLINCH || awarded[1] >= CLINCH)) {
        clinchAt = i
        acc.wins[awarded[0] >= CLINCH ? 0 : 1]++
        acc.eventsToClinch += i
        break // us54 ends here; whatever a host plays after the clinch is not the game
      }
    } else if (ev.type === 'pass') {
      acc.tempo[side(ev.from)].passes++
    }
  }
  if (clinchAt === null) acc.noClinch++
  if (LOCKS && cfPol) { const end = clinchAt === null ? rec.events.length : clinchAt; if (clinchAt === null) probeWindow(end); for (const b of BOOKS) if (track[b]) finishSet(b, 'open', end) }
  if (MAJORITY && cfPol) { const end = clinchAt === null ? rec.events.length : clinchAt; for (const b of BOOKS) finishMaj(b, -1, end) }
  for (const e of hitEntries) if (!e.resolved) { const F = acc.fate[e.side]; if (e.takenBack) F.takenBack++; F.open++ }
  const lostWithLock = [false, false]
  for (const b of BOOKS) {
    if (resolved[b]) continue
    acc.open++
    const sp = acc.split[split0[b]]
    sp.open++
    if (lock[b] && LOCKS_WHY) console.error(`OPENLOCK ${rec.label} set ${b} team ${lock[b].team} score ${awarded[0]}-${awarded[1]} formed at ${lock[b].at} of ${rec.events.length}`)
    if (lock[b]) { sp.openLocked++; acc.decl[lock[b].team].locksOpen++; if (awarded[lock[b].team] === 4 && awarded[1 - lock[b].team] >= 5) { acc.decl[lock[b].team].locksOpenAtFourLost++; lostWithLock[lock[b].team] = true } }
    const c0 = BOOK_CARDS.get(b).filter((c) => side(seatOf.get(c)) === 0).length
    if (c0 > 3) sp.openLeadA++
    else if (c0 < 3) sp.openLeadB++
  }
  for (const t of [0, 1]) if (lostWithLock[t]) acc.decl[t].gamesLostWithLock++
  acc.games++
}

/* --------------------------------------------------------------- bridge --- */

/** FishLab card name -> FishAI Card: the jokers and the ten are the only translations. */
const toAi = (name) => (name === 'RJ' ? 'XR' : name === 'BJ' ? 'XB' : name.startsWith('10') ? 'T' + name.slice(2) : name)

/**
 * One JSON line per game from the recording engine build (their engine's output - data):
 * a header line {header, specA, specB, cards[]} then games {deal, rot, orient, shift, seed,
 * dealt[6][], events[[kind, actor, target, card, set, success, owner[6], handCount[6]]...],
 * winner, score, hitLimit, setWinner[]}. kind: 0 ask, 1 declare, 2 pass, 3 forced declare, 4 end.
 * Translated into the engine's PublicEvent log with the true holders filled from the tracked deal,
 * and checked event by event against the engine's own public hand counts.
 */
function* readRecords(dir) {
  // a directory of *.jsonl files, or one file
  const one = fs.statSync(dir).isFile()
  const files = one ? [path.basename(dir)] : fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl') && f.startsWith(PREFIX)).sort()
  const base = one ? path.dirname(dir) : dir
  for (const f of files) {
    const lines = fs.readFileSync(path.join(base, f), 'utf8').split('\n').filter(Boolean)
    let names = null
    let bookOfSet = null
    let header = null
    for (const line of lines) {
      const o = JSON.parse(line)
      if (o.header) {
        header = o
        names = o.cards.map(toAi)
        bookOfSet = []
        for (let st = 0; st < names.length / 6; st++) {
          const bs = new Set(names.slice(st * 6, st * 6 + 6).map(bookOf))
          if (bs.size !== 1) throw new Error(`${f}: half-suit ${st} spans books ${[...bs].join('/')}`)
          bookOfSet.push([...bs][0])
        }
        continue
      }
      if (!names) throw new Error(`${f}: a game before the header`)
      const rec = toRecord(o, names, bookOfSet, `${f}:${o.deal}:${o.rot}`, header)
      rec.file = f
      yield rec
    }
  }
}

function toRecord(o, names, bookOfSet, label, header) {
  const hands0 = o.dealt.map((idxs) => idxs.map((c) => names[c]))
  const hands = hands0.map((h) => [...h])
  const seatOf = new Map()
  hands0.forEach((h, x) => h.forEach((c) => seatOf.set(c, x)))
  const publicAt = new Map() // card -> the seat a hit publicly moved it to, as the bridge bot tracks it
  const events = []
  const outcomes = []
  let prevCounts = hands0.map((h) => h.length)
  let started = false
  for (const e of o.events) {
    const [kind, actor, target, card, set, success, owner, hc] = e
    if (kind === 4) continue
    if (!started) { events.push({ type: 'game_started', startingSeat: actor }); started = true }
    if (kind === 0) {
      const c = names[card]
      events.push({ type: 'ask', asker: actor, target, card: c, hit: !!success })
      if (success) { hands[target] = hands[target].filter((d) => d !== c); hands[actor].push(c); seatOf.set(c, actor); publicAt.set(c, actor) }
    } else if (kind === 1 || kind === 3) {
      const book = bookOfSet[set]
      const assignments = {}
      const actualHolders = {}
      // as the bridge bot's claimEvent: a right declaration publishes every holder; a wrong one only
      // the cards a hit had already shown, so the counterfactual knows exactly what the live bot knew
      for (let j = 0; j < 6; j++) { const c = names[set * 6 + j]; assignments[c] = owner[j]; if (success) actualHolders[c] = seatOf.get(c); else { const x = publicAt.get(c); if (x !== undefined) actualHolders[c] = x } }
      const T = team(actor)
      const outcomeTeam = success ? T : 1 - T
      const ev = { type: 'claim', claimer: actor, book, assignments, actualHolders, outcome: `team${outcomeTeam}` }
      if (kind === 3) ev.forced = true
      events.push(ev)
      outcomes.push([set, outcomeTeam])
      for (let j = 0; j < 6; j++) { const c = names[set * 6 + j]; const x = seatOf.get(c); if (x !== undefined) hands[x] = hands[x].filter((d) => d !== c); seatOf.delete(c); publicAt.delete(c) }
    } else if (kind === 2) {
      events.push({ type: 'pass', from: actor, to: target })
    } else throw new Error(`${label}: unknown event kind ${kind}`)
    for (let x = 0; x < 6; x++) if (prevCounts[x] > 0 && hc[x] === 0) events.push({ type: 'player_out', seat: x })
    prevCounts = hc
    for (let x = 0; x < 6; x++) if (hands[x].length !== hc[x]) throw new Error(`${label}: tracked count ${hands[x].length} at seat ${x} but the engine says ${hc[x]} after event ${events.length}`)
  }
  if (Array.isArray(o.setWinner)) for (const [set, t] of outcomes) if (o.setWinner[set] !== t) throw new Error(`${label}: half-suit ${set} awarded to ${o.setWinner[set]} by the engine but ${t} by the record's declare`)
  return { label, teamA: o.orient, hands0, events, askMeta: null, header }
}

/* ---------------------------------------------------------------- report --- */

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a')
const pct = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(1) + '%' : '-')
const per = (a, g, d = 2) => (g > 0 ? (a / g).toFixed(d) : '-')
const ratio = (a, b, d = 3) => (b > 0 ? (a / b).toFixed(d) : '-')

function report(acc, head) {
  const g = acc.games
  console.log(`=== attribute: ${head} ===`)
  console.log(`games ${g}: A wins ${pct(acc.wins[0], g)}, B wins ${pct(acc.wins[1], g)} (no clinch ${acc.noClinch}); sets a game A ${per(acc.sets[0], g)} / B ${per(acc.sets[1], g)}, open at the end ${per(acc.open, g)}; events to the clinch ${per(acc.eventsToClinch, acc.wins[0] + acc.wins[1], 1)}`)
  console.log('')
  console.log("-- sets by the deal's split: A's cards of the six -> who took the set, and how --")
  console.log('| A cards | sets/g | A cashed | A gifted | B cashed | B gifted | open (A lead / B lead / locked) | P(A takes) | A - B per game |')
  console.log('|---|---|---|---|---|---|---|---|---|')
  const rows = [['0', [0]], ['1', [1]], ['2', [2]], ['3', [3]], ['4', [4]], ['5', [5]], ['6', [6]], ['A majority 4-6', [4, 5, 6]], ['even 3', [3]], ['B majority 0-2', [0, 1, 2]], ['all', [0, 1, 2, 3, 4, 5, 6]]]
  const gap = {}
  for (const [name, ks] of rows) {
    const s = { n: 0, aCashed: 0, aGifted: 0, bCashed: 0, bGifted: 0, open: 0, openLocked: 0, openLeadA: 0, openLeadB: 0 }
    for (const k of ks) for (const f of Object.keys(s)) s[f] += acc.split[k][f]
    const a = s.aCashed + s.aGifted
    const b = s.bCashed + s.bGifted
    gap[name] = g > 0 ? (a - b) / g : 0
    console.log(`| ${name} | ${per(s.n, g)} | ${per(s.aCashed, g)} | ${per(s.aGifted, g)} | ${per(s.bCashed, g)} | ${per(s.bGifted, g)} | ${per(s.open, g)} (${per(s.openLeadA, g)} / ${per(s.openLeadB, g)} / ${per(s.openLocked, g)}) | ${pct(a, a + b)} | ${gap[name] >= 0 ? '+' : ''}${gap[name].toFixed(3)} |`)
  }
  console.log('')
  console.log('-- asks --')
  console.log('| side | asks/g | hit | public-certain share | hit on uncertain | early / mid / late | a hit was available | hit when available | cf agree | cf hit vs actual (same points) | on disagreements: cf hit / actual hit (n) | cf non-ask |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const t of [0, 1]) {
    const A = acc.asks[t]
    console.log(`| ${t === 0 ? 'A' : 'B'} | ${per(A.n, g, 1)} | ${pct(A.hit, A.n)} | ${pct(A.certain, A.n)} | ${pct(A.uncHit, A.unc)} | ${pct(A.phase.early.hit, A.phase.early.n)} / ${pct(A.phase.mid.hit, A.phase.mid.n)} / ${pct(A.phase.late.hit, A.phase.late.n)} | ${pct(A.hitExists, A.n)} | ${pct(A.hitWhenExists, A.hitExists)} | ${pct(A.cfAgree, A.cfN)} | ${pct(A.cfHit, A.cfN)} vs ${pct(A.actHitAtCf, A.cfN)} | ${pct(A.cfDiffHit, A.cfDiff)} / ${pct(A.actDiffHit, A.cfDiff)} (${A.cfDiff}) | ${A.cfNonAsk} |`)
  }
  console.log('')
  console.log('-- sure misses and live asks: asks into a set the side already holds entirely (own-locked, a sure miss), and asks whose card was with the other side at all (live) - actual and counterfactual --')
  console.log('| side | own-locked asks | cf own-locked | live asks (card on the other side) | cf live |')
  console.log('|---|---|---|---|---|')
  for (const t of [0, 1]) { const A = acc.asks[t]; console.log(`| ${t === 0 ? 'A' : 'B'} | ${pct(A.ownLocked, A.n)} | ${pct(A.cfOwnLocked, A.cfN)} | ${pct(A.oppHeld, A.n)} | ${pct(A.cfOppHeld, A.cfN)} |`) }
  console.log('')
  console.log('-- asks by the asking side\u2019s holding of the asked set (cards of six already on the side): share of asks, hit; and the counterfactual\u2019s share, hit --')
  console.log('| side | 1 | 2 | 3 | 4 | 5 | cf 1 | cf 2 | cf 3 | cf 4 | cf 5 |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const t of [0, 1]) {
    const A = acc.asks[t]
    const cellOf = (H, total) => [1, 2, 3, 4, 5].map((k) => `${pct(H[k].n, total)} / ${pct(H[k].hit, H[k].n)}`)
    console.log(`| ${t === 0 ? 'A' : 'B'} | ${cellOf(A.holding, A.n).join(' | ')} | ${cellOf(A.cfHolding, A.cfN).join(' | ')} |`)
  }
  console.log('')
  console.log('-- hit fates: of each side\u2019s hits, the share that were take-backs (a certain ask on a card the target had hit), that closed the set, that were later taken back before the set resolved, and whose set the side cashed / lost / left open --')
  console.log('| side | hits/g | take-backs | closed the set | later taken back | set cashed | set lost | set open at the clinch |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const t of [0, 1]) {
    const F = acc.fate[t]
    console.log(`| ${t === 0 ? 'A' : 'B'} | ${per(F.hits, g)} | ${pct(F.takeBack, F.hits)} | ${pct(F.closes, F.hits)} | ${pct(F.takenBack, F.hits)} | ${pct(F.converted, F.hits)} | ${pct(F.lost, F.hits)} | ${pct(F.open, F.hits)} |`)
  }
  console.log('')
  console.log('-- miss costs: the danger of the chosen target (publicly located cards of the asker\u2019s side the target holds a licence for), on every ask and on the misses, the counterfactual\u2019s target at the same decisions, and the other side\u2019s run after a miss --')
  console.log('| side | misses/g | mean danger, all asks | any danger, all asks | cf: mean danger | cf: any danger | mean danger at misses | any danger at misses | opp run after a miss: asks | hits | opp opens with a certain take-back |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const t of [0, 1]) {
    const M = acc.miss[t]
    console.log(`| ${t === 0 ? 'A' : 'B'} | ${per(M.n, g)} | ${ratio(M.askDangerSum, M.asks, 2)} | ${pct(M.askDangerAny, M.asks)} | ${ratio(M.cfDangerSum, M.cfAsks, 2)} | ${pct(M.cfDangerAny, M.cfAsks)} | ${ratio(M.dangerSum, M.n, 2)} | ${pct(M.dangerAny, M.n)} | ${ratio(M.oppAsks, M.n, 2)} | ${ratio(M.oppHits, M.n, 2)} | ${pct(M.oppFirstCertain, M.n)} |`)
  }
  console.log('')
  console.log('-- tempo --')
  console.log('| side | share of asks | runs/g | asks per run | hits/g | passes/g |')
  console.log('|---|---|---|---|---|---|')
  const askTotal = acc.asks[0].n + acc.asks[1].n
  for (const t of [0, 1]) {
    const T = acc.tempo[t]
    console.log(`| ${t === 0 ? 'A' : 'B'} | ${pct(acc.asks[t].n, askTotal)} | ${per(T.runs, g)} | ${ratio(acc.asks[t].n, T.runs, 2)} | ${per(T.hits, g)} | ${per(T.passes, g)} |`)
  }
  console.log('')
  if (acc.locks) {
    console.log('-- the declare, priced (--locks): each side\'s declares by the claimer\'s own plan p through the counterfactual planner: how often the declare was right, and how often the PLAN was right --')
    console.log('| side | p = 1 | right | plan right | [0.775, 1) | right | plan right | [0.5, 0.775) | right | plan right | (0, 0.5) | right | plan right | p = 0 | right |')
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for (const t of [0, 1]) { const P = acc.decl[t].pBins; const c = (k) => `${P[k].n} | ${pct(P[k].right, P[k].n)} | ${pct(P[k].planRight, P[k].n)}`; console.log(`| ${t === 0 ? 'A' : 'B'} | ${c('certain')} | ${c('high')} | ${c('mid')} | ${c('low')} | ${P.none.n} | ${pct(P.none.right, P.none.n)} |`) }
    const S = acc.locks
    console.log('')
    console.log(`-- A\'s declarable sets (at least ${LOCK_MIN_CARDS} of six on A\'s side by the deal at some window): ${S.sets} (${per(S.sets, g)} a game), ${per(S.windows, S.sets)} windows each; at the first window the best gated p averages ${f2(S.firstGated / Math.max(1, S.sets))}, the best any-form p ${f2(S.firstAny / Math.max(1, S.sets))}, and ${pct(S.firstLock, S.sets)} were already locks --`)
    console.log(`   outcome: A cashed ${pct(S.outcome.us, S.sets)}, the other side got it ${pct(S.outcome.them, S.sets)}, open at the clinch ${pct(S.outcome.open, S.sets)}`)
    console.log('')
    console.log('-- declare rules priced on the records: the earliest window (before A\'s own declare) where some A seat\'s plan satisfies the rule, against what actually happened to the set; EV in sets of differential (A minus the other side): right = 0 if A cashed anyway, +2 if the other side had got it, +1 if it stayed open; wrong = -2 / 0 / -1 --')
    console.log('| rule | fires | by u (0/1/2/3+) | right | wrong | events earlier | on sets A cashed anyway (wrong) | on sets the other side got (right) | on sets open at the clinch (right) | EV sets a game | foreign (of them not cashed by A) | the other side got it by a teammate\'s wrong declare | open: fired at the final window | open at A = 4 (right, and the other side clinched: a win if cashed) | of the teammate gifts: A at four (a win thrown) / the other side at four (their clinch) / by an engine-forced declare |')
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    if (S.rules) for (let ri = 0; ri < RULES.length; ri++) {
      const B = S.rules[ri]
      console.log(`| ${RULES[ri].name} | ${B.fired} (${per(B.fired, g, 3)}/g) | ${B.byU.join('/')} | ${pct(B.right, B.fired)} | ${B.wrong} | ${f2(B.savedSum / Math.max(1, B.fired))} | ${B.byOutcome.us.n} (${B.byOutcome.us.n - B.byOutcome.us.right}) | ${B.byOutcome.them.n} (${B.byOutcome.them.right}) | ${B.byOutcome.open.n} (${B.byOutcome.open.right}) | ${(B.ev / Math.max(1, g)).toFixed(3)} | ${B.foreign} (${B.lostForeign}) | ${B.giftedByMate} | ${B.atFinal} | ${B.openAtFour} (${B.winIfCashed}) | ${B.giftAtFour} / ${B.giftClinch} / ${B.giftForced} |`)
    }
    console.log('')
  }
  if (acc.calib) {
    const labels = ['[0.1, 0.3)', '[0.3, 0.5)', '[0.5, 0.7)', '[0.7, 0.9)', '[0.9, 1)', 'p = 1']
    for (const sd of [0, 1]) {
      const rows = acc.calib[sd]
      if (rows.every((u) => u.every((c) => c.n === 0))) continue
      console.log(`-- reliability of the plan's p, ${sd === 0 ? 'A' : 'B'}'s seats over ${sd === 0 ? 'A' : 'B'}'s declarable sets (every window, every seat with cards, through the counterfactual planner): probes | right (set on the side and every holder named right) | the set was a lock at that window | gated probes | gated right --`)
      console.log('| guessed cards | ' + labels.join(' | ') + ' |')
      console.log('|---|' + labels.map(() => '---').join('|') + '|')
      for (let ub = 0; ub < 4; ub++) {
        const cells = rows[ub].map((C) => C.n === 0 ? '-' : `${C.n} / ${pct(C.right, C.n)} / lock ${pct(C.lock, C.n)} / g ${C.gn} ${pct(C.gright, C.gn)}`)
        console.log(`| ${ub === 3 ? '3+' : ub} | ${cells.join(' | ')} |`)
      }
      console.log('')
    }
  }
  for (const t of [0, 1]) { const D = acc.decl[t]; console.log(`-- ${t === 0 ? 'A' : 'B'} finished at four sets with an uncashed lock while the other side clinched: ${D.locksOpenAtFourLost} sets in ${D.gamesLostWithLock} games (${pct(D.gamesLostWithLock, g)} of games) --`) }
  console.log('')
  console.log('-- declares and locks --')
  console.log('| side | declares/g | right | gifts/g | void | locks formed/g | cashed | broken | gifted | open at the end | lock hold (events, cashed) |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const t of [0, 1]) {
    const D = acc.decl[t]
    console.log(`| ${t === 0 ? 'A' : 'B'} | ${per(D.n, g)} | ${pct(D.correct, D.n)} | ${per(D.gifts, g)} | ${D.void} | ${per(D.locksFormed, g)} | ${pct(D.locksCashed, D.locksFormed)} | ${pct(D.locksBroken, D.locksFormed)} | ${pct(D.locksGifted, D.locksFormed)} | ${pct(D.locksOpen, D.locksFormed)} | ${ratio(D.holdSum, D.holdN, 2)} |`)
  }
  if (acc.maj) {
    const labels = ['[0, 0.1)', '[0.1, 0.3)', '[0.3, 0.5)', '[0.5, 0.7)', '[0.7, 1]']
    console.log('-- the majority conversion (--majority): at ask decisions where the asker holds a card of an unresolved set its side holds four or five of, the cards the opponents hold, by the asker\'s own-side mass on each through the counterfactual\'s marginal (every one is with an opponent) --')
    console.log('| side | ' + labels.map((l) => `${l}: cards (chased)`).join(' | ') + ' | no table |')
    console.log('|---|---|---|---|---|---|---|')
    for (const t of [0, 1]) { const C = acc.maj.cards[t]; console.log(`| ${t === 0 ? 'A' : 'B'} | ${C.map((c) => `${c.n} (${pct(c.chased, c.n)})`).join(' | ')} | ${acc.maj.dec[t].noTable} |`) }
    console.log('')
    console.log('-- the decisions: with a legal chase (the asker holds a card of the set, an opponent holds a card of it) how often the ask taken chases, and how each kind of ask fares; the best chase = the marginal\'s best opponent target for the most-located missing card --')
    console.log('| side | decisions | /game | chased | chase hit | other ask | other hit | best chase target right (all / at the other asks) | the other asks by the side\'s holding of the asked set, 0-5: n (hit) | by the largest own-side mass on a missing card: ' + labels.map((l) => `${l} chased`).join(' | ') + ' |')
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for (const t of [0, 1]) { const D = acc.maj.dec[t]; console.log(`| ${t === 0 ? 'A' : 'B'} | ${D.n} | ${per(D.n, g)} | ${pct(D.chased, D.n)} | ${pct(D.chaseHit, D.chased)} | ${D.other} | ${pct(D.otherHit, D.other)} | ${pct(D.bestRight, D.n)} / ${pct(D.bestRightNo, D.other)} | ${D.otherHold.map((n, h) => `${h}: ${n} (${pct(D.otherHoldHit[h], n)})`).join(', ')} | ${D.byMax.map((m) => `${m.n}: ${pct(m.chased, m.n)}`).join(' | ')} |`) }
    console.log('')
    console.log('-- the episodes: a set from the first ask decision at which a side holds four of six by the deal to its resolution (or the clinch), by whether the side ever chased an opponent-held card of it --')
    console.log('| side | episodes/game | legal chase decisions each | chases each | ever chased | chased: cashed / taken / open (events) | never chased: cashed / taken / open (events) |')
    console.log('|---|---|---|---|---|---|---|')
    for (const t of [0, 1]) { const E = acc.maj.ep[t]; const f = (K) => `${pct(K.cashed, K.n)} / ${pct(K.taken, K.n)} / ${pct(K.open, K.n)} (${f2(K.ev / Math.max(1, K.n))})`; console.log(`| ${t === 0 ? 'A' : 'B'} | ${per(E.n, g)} | ${f2(E.legalSum / Math.max(1, E.n))} | ${f2(E.chaseSum / Math.max(1, E.n))} | ${pct(E.chased.n, E.n)} | ${f(E.chased)} | ${f(E.not)} |`) }
    console.log('')
  }
  return gap
}

/* ------------------------------------------------------------------ main --- */

const cfPol = CF && CF !== 'none' ? MON.monetPolicy(CF) : null
const t0 = Date.now()
const acc = newAcc()
let head
if (HOME > 0) {
  const polA = MON.monetPolicy(VA)
  const polB = MON.monetPolicy(VB)
  for (let g = 0; g < HOME; g++) walk(playHome(`${LABEL}-${g}`, polA, polB), cfPol, acc)
  head = `home, A=${VA} (team 0) vs B=${VB} (team 1), ${HOME} games (${LABEL}-*), cf=${CF}, ${((Date.now() - t0) / 1000).toFixed(1)}s`
} else if (RECORDS) {
  let header = null
  const perFile = new Map()
  for (const rec of readRecords(RECORDS)) {
    if (!header) header = rec.header
    walk(rec, cfPol, acc)
    if (PER_SEED) { if (!perFile.has(rec.file)) perFile.set(rec.file, newAcc()); walk(rec, cfPol, perFile.get(rec.file)) }
  }
  if (PER_SEED) {
    const rows = []
    console.log('-- per cell: A win, sets a game A / B, A - B by bucket (A majority / even / B majority), hit A / B, and at B decisions (cf = Monet v0.4c there): cf hit vs actual, cf agree --')
    console.log('| cell | games | A win | sets A | sets B | A-maj | even | B-maj | hit A | hit B | B: cf hit | B: actual | B: agree |')
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for (const [f, a] of perFile) {
      const g = a.games
      const bucket = (ks) => { let x = 0, y = 0; for (const k of ks) { x += a.split[k].aCashed + a.split[k].aGifted; y += a.split[k].bCashed + a.split[k].bGifted } return (x - y) / g }
      const r = { file: f, games: g, winA: a.wins[0] / g, setsA: a.sets[0] / g, setsB: a.sets[1] / g, amaj: bucket([4, 5, 6]), even: bucket([3]), bmaj: bucket([0, 1, 2]), hitA: a.asks[0].hit / a.asks[0].n, hitB: a.asks[1].hit / a.asks[1].n, cfHitB: a.asks[1].cfHit / Math.max(1, a.asks[1].cfN), actB: a.asks[1].actHitAtCf / Math.max(1, a.asks[1].cfN), agreeB: a.asks[1].cfAgree / Math.max(1, a.asks[1].cfN) }
      rows.push(r)
      const sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(3)
      console.log(`| ${f.replace(/.jsonl$/, '')} | ${g} | ${(100 * r.winA).toFixed(2)}% | ${r.setsA.toFixed(3)} | ${r.setsB.toFixed(3)} | ${sg(r.amaj)} | ${sg(r.even)} | ${sg(r.bmaj)} | ${(100 * r.hitA).toFixed(2)}% | ${(100 * r.hitB).toFixed(2)}% | ${(100 * r.cfHitB).toFixed(2)}% | ${(100 * r.actB).toFixed(2)}% | ${(100 * r.agreeB).toFixed(1)}% |`)
    }
    if (rows.length > 1) {
      const stat = (key) => { const xs = rows.map((r) => r[key]); const m = xs.reduce((u, v) => u + v, 0) / xs.length; const sd = Math.sqrt(xs.reduce((u, v) => u + (v - m) * (v - m), 0) / (xs.length - 1)); return { m, sd, se: sd / Math.sqrt(xs.length) } }
      const line = (name, key, pct) => { const t = stat(key); const f = (v) => (pct ? (100 * v).toFixed(2) + '%' : v.toFixed(3)); console.log(`   ${name}: mean ${f(t.m)}  SD ${f(t.sd)}  SE ${f(t.se)}`) }
      console.log(`-- across ${rows.length} cells --`)
      line('A win', 'winA', true); line('sets A - B', 'gap', false)
      for (const r of rows) r.gap = r.setsA - r.setsB
      line('sets A - B', 'gap', false); line('A-majority gap', 'amaj', false); line('even gap', 'even', false); line('B-majority gap', 'bmaj', false)
      line('hit A', 'hitA', true); line('hit B', 'hitB', true); line('B: cf hit', 'cfHitB', true); line('B: actual hit at cf', 'actB', true)
      for (const r of rows) r.cfMinusAct = r.cfHitB - r.actB
      line('B: cf - actual', 'cfMinusAct', true)
    }
    console.log('')
    acc.perFile = rows
  }
  head = `bridge records ${RECORDS}: ${acc.games} games, A=${header ? header.specA : '?'} (side A) vs B=${header ? header.specB : '?'}, cf=${CF}, ${((Date.now() - t0) / 1000).toFixed(1)}s`
} else {
  console.error('usage: node scripts/attribute.mjs (--home N [--a v] [--b v] | --records DIR) [--cf v] [--label l] [--validate] [--json f]')
  process.exit(2)
}
const gap = report(acc, head)
if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({ head, gap, acc }, null, 1))
  console.log(`\nwrote ${JSON_OUT}`)
}
