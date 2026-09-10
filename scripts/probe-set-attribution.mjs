/**
 * probe-set-attribution — MONET.md 3.8al (row 47): where the sets go. Replays bridge records through the engine (as
 * probe-side-decisions does) and keeps a ledger per set: the deal's split between the sides, the ask race (hits and
 * misses into the set by side, the last pull), and the end — the side awarded the set and the mechanism: certain
 * (declared with every card placed by the claimer's own knowledge), speculative (one or more unplaced, right), a gift
 * (declared wrong by the other side), forced (the record's forced declaration), after the finish (declared after this
 * engine's end, a team at five sets, where the claimer's knowledge is not replayed). Two reads of the public threat to
 * a set — an opponent holds a card of it (the true hand: `known`; or is believed to by the claimer at 0.5 or above:
 * `public`) and that opponent's own knowledge places a card of the set on the claimer's side, so it can ask for one —
 * at the arm's speculative claims, and at the sets a knob (--knob) would have claimed where the arm declined, with the
 * set's eventual end.
 *
 *     node scripts/probe-set-attribution.mjs --records <dir>[,<dir>...] [--version v0.9] [--override <json>]
 *          [--knob <json>] [--holder-model <fit.json>] [--holder-name holder] [--sample 1] [--sample-salt s]
 *          [--max-files N] [--skip-files N] [--debug N] [--ceiling 1] [--pcal map.json] [--clone ask.json]
 *          [--out summary.json]
 *
 * `--version`/`--override` is the stack whose knowledge options rebuild every seat's knowledge (the arm's own vector);
 * `--knob` lays a style over it and plays it at every window offer of the arm's seats as a one-step counterfactual
 * (3.8ak's form); `--holder-model` registers a holder-model JSON under `--holder-name` (default 'holder') so a knob
 * may name it as `claimHolderModel`. Sides: the arm is the team `rec.teamA` played; SESTINA the other.
 * `--ceiling 1` (3.8ao, row 50) scores, at every ask replayed through this engine, the ask the record chose against
 * the ranker's own top, the greedy ask by the marginal's p and the oracle (some legal ask hits) by the true hands at
 * that moment, with the chosen p by decile and the greedy-minus-chosen p by margin; both sides, the arm's stack
 * rebuilding the knowledge and the ranker's list at either view.
 * 3.8ap (row 51) adds two reads under `--ceiling 1`. `--pcal` applies a monotone map to every ask's p (a
 * `{ bins: [...] }` of NB bin values, read at the bin p falls in) and reports what it moves: the greedy ask, the
 * ranker's top (re-scored as `score + wHit * dp`, the other terms being untouched by a map that fixes 0 and 1) and,
 * with `--clone`, the clone's own choice over the re-scored list. `--clone <ask model json>` also turns on the
 * shortlist read: the clone's ranking of the legal asks by `scoreAsks`, where the asks that would have hit sit in
 * it (its top, some hit in the top 2 / 3 / 5 / all), best-of-top-k by p as the identity check against greedy, and
 * where the record's own ask sits in that ranking. `--skip-files N` drops the first N files so a map may be fitted
 * on one half of the records and read on the other. Every ask's p is binned into `pbins` for that fit.
 * 3.8aq (row 52) stage G, also under `--clone`: the three candidate sets `decideSearch` could be offered at an ask,
 * each seeded with the clone's pick and filled to k = 3, 4, 5 — from the ranker's order capped at its top five
 * (`cands.today`, exactly what `candidateAsks` builds), from the clone's own ranking (`cands.clone`), and from the
 * two alternately (`cands.mixed`) — by how often each holds an ask that would have hit, with the overlap between
 * the ranker's fill and the clone's. The gate on whether the candidate fill is worth an engine change at all.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const CARDS = await import(pathToFileURL(join(ROOT, 'lib/engine/cards.ts')).href)
const REC = await import(pathToFileURL(join(ROOT, 'scripts/bridge-records.mjs')).href)
const IMI = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/imitation.ts')).href)
const { hashSeed, reduce, seatView, us54Config } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const DIRS = argOf('--records', '').split(',').filter(Boolean)
const VERSION = argOf('--version', 'v0.9')
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const KNOB = argOf('--knob', '') ? JSON.parse(argOf('--knob', '')) : null
const HOLDER_FILE = argOf('--holder-model', '')
const HOLDER_NAME = argOf('--holder-name', 'holder')
const SAMPLE = Number(argOf('--sample', 1))
const SALT = argOf('--sample-salt', '')
const MAXF = Number(argOf('--max-files', 0))
const OUT = argOf('--out', '')
const DEBUG = Number(argOf('--debug', 0))
const CEIL = Number(argOf('--ceiling', 0))
const SKIPF = Number(argOf('--skip-files', 0))
const PCAL_FILE = argOf('--pcal', '')
const CLONE_FILE = argOf('--clone', '')
const NB = 200
const PCAL = PCAL_FILE ? JSON.parse(fs.readFileSync(PCAL_FILE, 'utf8')).bins : null
if (PCAL && PCAL.length !== NB) throw new Error(`--pcal: ${PCAL.length} bins, expected ${NB}`)
const binOf = (p) => Math.min(NB - 1, Math.max(0, Math.floor(p * NB)))
// The map fixes the ends: a certain ask stays certain and a dead ask stays dead, so `certain`, `certainBonus` and
// `gamble` are untouched and the re-score below only has to move the wHit term.
const cal = (p) => (!PCAL || p <= 0 || p >= 1 ? p : PCAL[binOf(p)])
if (DIRS.length === 0) {
  console.error('--records is required')
  process.exit(2)
}
if (HOLDER_FILE) BOTS.registerHolderModel(HOLDER_NAME, JSON.parse(fs.readFileSync(HOLDER_FILE, 'utf8')))
let CLONE = null
if (CLONE_FILE) {
  const name = CLONE_FILE.replace(/^.*[\\/]/, '')
  BOTS.registerAskModel(name, JSON.parse(fs.readFileSync(CLONE_FILE, 'utf8')), HOLDER_FILE ? HOLDER_NAME : undefined)
  CLONE = IMI.askModelOf(name)
}

const pol0 = MON.monetPolicy(VERSION)
const POL = OVER ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...OVER }) }) : pol0
const KNOB_POL = KNOB ? Object.freeze({ skill: POL.skill, style: Object.freeze({ ...POL.style, ...KNOB }) }) : null
const { skill, style } = BOTS.resolvePolicy(POL)
const marginal = style.pModel === 'marginal'
const KOPTS = { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal, choiceKappa: marginal ? style.choiceKappa : undefined, choiceAdapt: marginal ? style.choiceAdapt : undefined, choicePrior: marginal ? style.choicePrior : undefined }
const uniform = (key) => (hashSeed(key)() >>> 0) / 4294967296
const seatTeam = (x) => x % 2
const BOOKS = CARDS.allBooks(us54Config)

let files = []
for (const d of DIRS) files = files.concat(REC.recordFiles(d))
const afterSkip = SKIPF > 0 ? files.slice(SKIPF) : files
const useFiles = MAXF > 0 ? afterSkip.slice(0, MAXF) : afterSkip

const CLASSES = ['certain', 'speculative', 'gift', 'forced', 'afterFinish']
const WRONG = ['certainWrong', 'wrong', 'forcedWrong', 'afterFinishWrong']
const pair = () => ({ n: 0, right: 0 })
const cf = () => ({ n: 0, rightNow: 0, laterOwn: 0, laterLost: 0, never: 0 })
const dom = () => ({ n: 0, certain: 0, specRight: 0, specWrong: 0, minorityWon: 0, other: 0 })
const ld = () => ({ n: 0, converted: 0 })
/** A tally for one side (the arm, or SESTINA). */
function side() {
  return {
    won: Object.fromEntries(CLASSES.map((c) => [c, 0])),
    wrong: Object.fromEntries(WRONG.map((c) => [c, 0])),
    declared: 0,
    // the race in contested sets (a split of 5-1, 4-2 or 3-3): this side's asks into them, and into the ones it won / lost
    race: { asks: 0, hits: 0, intoWon: { asks: 0, hits: 0 }, intoLost: { asks: 0, hits: 0 } },
    // certain sets won in contested splits: the last pull was this side's; certain sets won with no pull at all (dealt whole)
    lastPullOwn: 0, certainContested: 0, certainNoPull: 0,
    // the public threat at this side's speculative claims (the record's), by the two reads, with the outcome
    threatClaims: { known: { yes: pair(), no: pair() }, public: { yes: pair(), no: pair() } },
    // the knob's first would-be claim of a set where this side declined (--knob), by threat, with the set's end
    knobDeferred: { known: { yes: cf(), no: cf() }, public: { yes: cf(), no: cf() } },
    // 3.8am (row 48): this side's speculative claims by the other side's asks into the set before the claim (none /
    // some) and by its own, with the outcome; and the other side's true cards in the set at the claim (0 / 1 / 2+)
    gambles: { oppAsks0: pair(), oppAsks1: pair(), ownAsks0: pair(), ownAsks1: pair(), oppHeld: [0, 0, 0] },
    // 3.8am: the sets this side held 5-1 or 4-2 at the deal, by whether the other side ever asked into them, by their end
    dominated: { minorityAsks0: dom(), minorityAsks1: dom() },
    // 3.8an (row 49): the leads this side took - the first to four of six in a 3-3 set, before the finish - by its first
    // ask decision after (a chase into the set, elsewhere, none before the set resolved), with the conversion
    leads: { all: ld(), chase: ld(), elsewhere: ld(), none: ld() },
    // 3.8an: every ask decision this side made while leading a 3-3 set at four to two (3.8q's R1 population): chases
    leadDecisions: { n: 0, chase: 0 },
    // 3.8ao (row 50): at every ask this side made (replayed through this engine), the ask chosen against the ranker's
    // top, the greedy ask by p and the oracle, by the true hands; the chosen p by decile; greedy minus chosen p by margin
    ceiling: ceil(),
  }
}
// 3.8aq: a tally over the candidate depths 3, 4 and 5
function kd() { return { k3: 0, k4: 0, k5: 0 } }
// 3.8ap: a tally over the shortlist depths 1, 2, 3, 5 and the whole list
function kk() { return { k1: 0, k2: 0, k3: 0, k5: 0, all: 0 } }
function ceil() {
  const mb = () => ({ n: 0, chosenHit: 0, greedyHit: 0 })
  return {
    n: 0, unranked: 0, chosenHit: 0, topHit: 0, greedyHit: 0, oracle: 0, chosenIsTop: 0, chosenIsGreedy: 0, sumChosenP: 0, sumGreedyP: 0,
    certainAvail: 0, certainTaken: 0,
    deciles: Array.from({ length: 10 }, () => ({ n: 0, sumP: 0, hits: 0 })),
    // the control: every legal ask on the ranker's list at this side's decisions, by its p, against the truth
    decilesAll: Array.from({ length: 10 }, () => ({ n: 0, sumP: 0, hits: 0 })),
    // the 0.5-0.9 band over every legal ask, by the card's candidate count (2, 3, 4, 5 or more) and by whether p is
    // the uniform 1/n (the count alone) or the marginal's own scaled answer
    band: Object.fromEntries([2, 3, 4, 5].map((c) => [c, { unif: { n: 0, sumP: 0, hits: 0 }, scaled: { n: 0, sumP: 0, hits: 0 } }])),
    // 3.8ap R1: every legal ask's p binned for the monotone fit, and what the fitted map moves
    pbins: Array.from({ length: NB }, () => ({ n: 0, sumP: 0, hits: 0 })),
    cal: { n: 0, sumAbsDelta: 0, greedyChanged: 0, topChanged: 0, cloneChanged: 0 },
    calClaims: { n: 0, cross775: { up: 0, down: 0 }, cross50: { up: 0, down: 0 } },
    // 3.8ap R2: the clone's own ranking of the legal asks, and where the asks that would have hit sit in it
    short: { n: 0, topHit: 0, recordIsTop: 0, someHit: kk(), bestByP: kk(), recordRank: kk() },
    // 3.8aq G: the candidate sets the search could be offered, at k = 3, 4, 5, by whether one of them would have hit
    cands: { n: 0, today: kd(), clone: kd(), mixed: kd(), shared: kd(), sizeToday: kd() },
    // greedy p minus the chosen p: equal (the chosen ask is a greedy ask), (0, .1], (.1, .3], (.3, .6], above .6
    margin: { eq: mb(), lt10: mb(), lt30: mb(), lt60: mb(), gt60: mb() },
  }
}
const T = { arm: side(), sestina: side() }
// sets by the deal's split: n, won by [arm, sestina], sets where [arm, sestina] held the majority, and won holding it
const SPLIT = Array.from({ length: 4 }, () => ({ n: 0, wonBy: [0, 0], majority: [0, 0], majorityWon: [0, 0] }))
const G = { games: 0, sampled: 0, replayed: 0, setAside: {}, events: 0, eventsAfterFinish: 0, compelledMoves: 0, armVersions: {}, armWins: 0, setsLedgered: 0, setsUnended: 0 }

function uncertainCards(k, book) {
  let n = 0
  for (const c of CARDS.bookCards(book, us54Config)) if (k.holders[c] === undefined) n++
  return n
}
/** The public threat to `book` from the other team, at state s, for the claimer on `team` with knowledge k. */
function threatFlags(s, book, team, k) {
  const cards = CARDS.bookCards(book, us54Config)
  let known = false
  let pub = false
  for (let o = 0; o < 6; o++) {
    if (seatTeam(o) === team || s.hands[o].length === 0) continue
    const holdsTrue = cards.some((c) => s.hands[o].includes(c))
    let pNone = 1
    let placedAtO = false
    for (const c of cards) {
      const h = k.holders[c]
      if (h === o) placedAtO = true
      else if (h === undefined) pNone *= 1 - BOTS.askHitProbability(k, c, o)
    }
    const believes = placedAtO || 1 - pNone >= 0.5
    if (!holdsTrue && !believes) continue
    const ko = BOTS.buildKnowledge(seatView(s, o), KOPTS)
    const canName = cards.some((c) => ko.holders[c] !== undefined && seatTeam(ko.holders[c]) === team)
    if (!canName) continue
    if (holdsTrue) known = true
    if (believes) pub = true
    if (known && pub) break
  }
  return { known, pub }
}

function replay(rec) {
  const specA = String(rec.header.specA)
  G.armVersions[specA] = (G.armVersions[specA] || 0) + 1
  const first = rec.events.find((e) => e.type === 'ask' || e.type === 'claim' || e.type === 'pass')
  if (!first) return 'noEvents'
  const start = first.type === 'ask' ? first.asker : first.type === 'claim' ? first.claimer : first.from
  let s = {
    config: us54Config, seed: rec.label, phase: 'playing', turn: start,
    hands: rec.hands0.map((h) => CARDS.sortHand([...h], us54Config)),
    books: {}, score: [0, 0], log: [], moveIndex: 0, declareWindow: { option: start, declined: 0 },
  }
  const sideOfTeam = (team) => (team !== rec.teamA ? T.sestina : T.arm)
  const sideIndex = (team) => (team !== rec.teamA ? 1 : 0) // 0 the arm, 1 SESTINA
  // the ledger: one entry a set
  const sets = {}
  for (const b of BOOKS) sets[b] = { split: [0, 0], held: [0, 0], hits: [0, 0], misses: [0, 0], lastPull: -1, end: null, lead: { team: -1, pending: false, first: null } }
  rec.hands0.forEach((h, x) => { for (const c of h) sets[CARDS.cardBook(c)].split[seatTeam(x)]++ })
  for (const b of BOOKS) { sets[b].held[0] = sets[b].split[0]; sets[b].held[1] = sets[b].split[1] }
  const deferred = []
  const pendingThreat = [] // the threat read at this side's speculative claims, written when the replay completes
  const pendingGamble = [] // 3.8am: the speculative claims with the set's state before them, written with the ledger
  const knobSeen = new Set()
  let n = 0
  const step = (action) => {
    const r = reduce(s, action)
    if (!r.ok) throw new Error(r.error.code)
    s = r.state
    n++
  }
  // a window offer at `seat`: the knob's counterfactual where the seat declined (the arm's seats only); the claimer's
  // knowledge at a claim is read by the caller
  const offer = (seat, actual, evIndex) => {
    if (!KNOB_POL || actual !== 'decline' || seatTeam(seat) !== rec.teamA) return
    const view = seatView(s, seat)
    const a = ENG.decide(view, KNOB_POL, hashSeed(`${rec.label}:knob:${n}:${seat}`)())
    if (a.type !== 'claim') return
    const team = seatTeam(seat)
    const key = `${team}:${a.book}`
    if (knobSeen.has(key)) return
    knobSeen.add(key)
    const k = BOTS.buildKnowledge(view, KOPTS)
    const cards = CARDS.bookCards(a.book, us54Config)
    if (!cards.some((c) => k.holders[c] === undefined)) return // a certain claim the arm deferred: not this read's
    const rightNow = cards.every((c) => s.hands[a.assignments[c]].includes(c))
    const fl = threatFlags(s, a.book, team, k)
    deferred.push({ book: a.book, team, evIndex, rightNow, known: fl.known, pub: fl.pub })
  }
  const closeWindowTo = (target, evIndex) => { // decline from the option up to (not including) `target`; target null = close fully
    let guard = 0
    while (s.declareWindow && (target === null || s.declareWindow.option !== target)) {
      const seat = s.declareWindow.option
      const r = reduce(s, { type: 'decline', seat })
      if (!r.ok && r.error.code === 'MUST_DECLARE') {
        // RULES_US54 3.2: with no legal ask for the turn-holder this engine lets nobody decline; the recording engine
        // let the option travel to the seat that declared. The option is moved by hand, no offer is read here.
        G.compelledMoves++
        if (target === null) throw new Error('compelledWindowClosed')
        s = { ...s, declareWindow: { option: ((seat + 1) % 6), declined: s.declareWindow.declined + 1 } }
      } else {
        if (!r.ok) throw new Error(r.error.code)
        offer(seat, 'decline', evIndex)
        s = r.state
        n++
      }
      if (++guard > 12) throw new Error('windowLoop')
    }
  }
  const endSet = (ev, cls, u) => {
    const claimerTeam = seatTeam(ev.claimer)
    const winner = ev.outcome === 'team0' ? 0 : 1
    const right = winner === claimerTeam
    sets[ev.book].end = { winner, claimerTeam, cls, u, right }
  }
  try {
    for (let i = 0; i < rec.events.length; i++) {
      const ev = rec.events[i]
      if (ev.type !== 'ask' && ev.type !== 'claim' && ev.type !== 'pass') continue
      if (ev.type === 'ask') { // the race is ledgered from the record itself, after the finish too
        const L = sets[CARDS.cardBook(ev.card)]
        const t = seatTeam(ev.asker)
        // 3.8an: this ask is the leading side's first decision after taking a lead in any set still open
        for (const b of BOOKS) { const K = sets[b].lead; if (K.pending && K.team === t && !sets[b].end) { K.pending = false; K.first = CARDS.cardBook(ev.card) === b ? 'chase' : 'elsewhere' } }
        if (s.phase !== 'finished') for (const b of BOOKS) { const Lb = sets[b]; if (Lb.lead.team === t && !Lb.end && Lb.held[t] === 4 && Lb.held[1 - t] === 2) { const D = sideOfTeam(t).leadDecisions; D.n++; if (CARDS.cardBook(ev.card) === b) D.chase++ } }
        if (ev.hit) { L.hits[t]++; L.lastPull = t; L.held[t]++; L.held[1 - t]-- } else L.misses[t]++
        if (ev.hit && s.phase !== 'finished' && !L.end && L.split[0] === 3 && L.split[1] === 3 && L.lead.team < 0 && L.held[t] === 4) { L.lead.team = t; L.lead.pending = true }
      }
      // this engine ends the game once a team holds five sets (the win is decided); the recording engine plays on
      if (s.phase === 'finished') {
        G.eventsAfterFinish++
        if (ev.type === 'claim') endSet(ev, 'afterFinish', -1)
        continue
      }
      try {
        replayOne(ev, i)
      } catch (e) {
        const err = new Error(e.message)
        err.ctx = `${rec.label} ${e.message} @${i}/${rec.events.length} ${JSON.stringify(ev).slice(0, 160)} | phase=${s.phase} turn=${s.turn} window=${JSON.stringify(s.declareWindow)} counts=${s.hands.map((h) => h.length).join(',')} books=${Object.keys(s.books).join(' ')}`
        throw err
      }
    }
  } finally {
    // nothing: a game set aside leaves no tally (the ledger is written only when the replay completes)
  }
  // 3.8ao: the ask's ceiling - the record's ask against the ranker's top, the greedy ask by p and the oracle, by the truth
  function ceilingAt(ev) {
    const view = seatView(s, ev.asker)
    const k = BOTS.buildKnowledge(view, KOPTS)
    const ranked = BOTS.rankAsksWith(view, k, style)
    const C = sideOfTeam(seatTeam(ev.asker)).ceiling
    if (ranked.length === 0) { C.unranked++; return }
    const truth = (r) => s.hands[r.target].includes(r.card)
    let chosen = null
    let greedy = ranked[0]
    for (const r of ranked) {
      if (r.target === ev.target && r.card === ev.card) chosen = r
      if (r.p > greedy.p) greedy = r
    }
    if (!chosen) { C.unranked++; return }
    const top = ranked[0]
    C.n++
    if (ev.hit) C.chosenHit++
    if (truth(top)) C.topHit++
    const greedyHit = truth(greedy)
    if (greedyHit) C.greedyHit++
    if (ranked.some(truth)) C.oracle++
    if (top === chosen) C.chosenIsTop++
    if (greedy.p <= chosen.p + 1e-9) C.chosenIsGreedy++
    C.sumChosenP += chosen.p
    C.sumGreedyP += greedy.p
    if (ranked.some((r) => r.p >= 0.99)) { C.certainAvail++; if (chosen.p >= 0.99) C.certainTaken++ }
    const D = C.deciles[Math.min(9, Math.floor(chosen.p * 10))]
    D.n++; D.sumP += chosen.p; if (ev.hit) D.hits++
    for (const r of ranked) {
      const A = C.decilesAll[Math.min(9, Math.floor(r.p * 10))]; A.n++; A.sumP += r.p; if (truth(r)) A.hits++
      if (r.p >= 0.5 && r.p < 0.9) {
        const nc = (k.cands[r.card] ?? []).length
        const B = C.band[Math.min(5, Math.max(2, nc))]
        const U = nc > 0 && Math.abs(r.p - 1 / nc) < 1e-9 ? B.unif : B.scaled
        U.n++; U.sumP += r.p; if (truth(r)) U.hits++
      }
    }
    const m = greedy.p - chosen.p
    const B = m <= 1e-9 ? C.margin.eq : m <= 0.1 ? C.margin.lt10 : m <= 0.3 ? C.margin.lt30 : m <= 0.6 ? C.margin.lt60 : C.margin.gt60
    B.n++; if (ev.hit) B.chosenHit++; if (greedyHit) B.greedyHit++
    for (const r of ranked) { const P = C.pbins[binOf(r.p)]; P.n++; P.sumP += r.p; if (truth(r)) P.hits++ }
    // R1: what the fitted map moves. The list is re-scored by the wHit term alone (see `cal` above) and re-sorted,
    // the original index breaking ties so the ranker's own deck-order tiebreak is preserved among untouched asks.
    if (PCAL) {
      const R = C.cal
      R.n++
      const re = ranked.map((r, idx) => {
        const p2 = cal(r.p)
        R.sumAbsDelta += Math.abs(p2 - r.p)
        return { ...r, p: p2, score: Math.round((r.score + style.wHit * (p2 - r.p)) * 100) / 100, idx }
      })
      let gi = 0
      for (let j = 1; j < re.length; j++) if (re[j].p > re[gi].p) gi = j
      if (re[gi].target !== greedy.target || re[gi].card !== greedy.card) R.greedyChanged++
      re.sort((x, y) => (y.score !== x.score ? y.score - x.score : x.idx - y.idx))
      if (re[0].target !== top.target || re[0].card !== top.card) R.topChanged++
      if (CLONE) {
        const sc = IMI.scoreAsks(CLONE, view, k, re)
        let bi = 0
        for (let j = 1; j < sc.length; j++) if (sc[j] > sc[bi]) bi = j
        if (re[bi].target !== ev.target || re[bi].card !== ev.card) R.cloneChanged++
      }
    }
    // R2: the clone proposes; where do the asks that would have hit sit in its own ranking?
    if (CLONE) {
      const sc = IMI.scoreAsks(CLONE, view, k, ranked)
      const order = ranked.map((r, idx) => idx).sort((x, y) => (sc[y] !== sc[x] ? sc[y] - sc[x] : x - y))
      const H = C.short
      H.n++
      if (truth(ranked[order[0]])) H.topHit++
      const recAt = order.findIndex((idx) => ranked[idx].target === ev.target && ranked[idx].card === ev.card)
      if (recAt === 0) H.recordIsTop++
      for (const [key, kd] of [["k1", 1], ["k2", 2], ["k3", 3], ["k5", 5], ["all", order.length]]) {
        const head = order.slice(0, Math.min(kd, order.length))
        if (head.some((idx) => truth(ranked[idx]))) H.someHit[key]++
        let bp = head[0]
        for (const idx of head) if (ranked[idx].p > ranked[bp].p) bp = idx
        if (truth(ranked[bp])) H.bestByP[key]++
        if (recAt >= 0 && recAt < kd) H.recordRank[key]++
      }
      // 3.8aq G: the pick is the clone's top; the ranker's order is `ranked` itself, capped at the five
      // `t.ranked = ranked.slice(0, 5)` puts in the trace `candidateAsks` fills from.
      const D = C.cands
      D.n++
      const pick = order[0]
      const rankFill = ranked.map((r, idx) => idx).slice(0, 5)
      const cloneFill = order
      const fill = (src, kd) => {
        const out = [pick]
        for (const idx of src) { if (out.length >= kd) break; if (!out.includes(idx)) out.push(idx) }
        return out
      }
      const mix = (kd) => {
        const out = [pick]
        for (let j = 0; j < Math.max(rankFill.length, cloneFill.length) && out.length < kd; j++) {
          for (const src of [rankFill, cloneFill]) {
            const idx = src[j]
            if (idx !== undefined && !out.includes(idx) && out.length < kd) out.push(idx)
          }
        }
        return out
      }
      for (const [key, kd] of [["k3", 3], ["k4", 4], ["k5", 5]]) {
        const A = fill(rankFill, kd)
        const Bc = fill(cloneFill, kd)
        const Cm = mix(kd)
        if (A.some((idx) => truth(ranked[idx]))) D.today[key]++
        if (Bc.some((idx) => truth(ranked[idx]))) D.clone[key]++
        if (Cm.some((idx) => truth(ranked[idx]))) D.mixed[key]++
        D.shared[key] += A.filter((idx) => Bc.includes(idx)).length
        D.sizeToday[key] += A.length
      }
    }
  }
  function replayOne(ev, i) {
    if (ev.type === 'ask') {
      if (s.phase !== 'playing') throw new Error(`askPhase:${s.phase}`)
      closeWindowTo(null, i)
      if (s.turn !== ev.asker) throw new Error('turnMismatch')
      const before = s.hands[ev.target].includes(ev.card)
      if (before !== ev.hit) throw new Error('hitMismatch')
      if (CEIL) ceilingAt(ev)
      step({ type: 'ask', seat: ev.asker, target: ev.target, card: ev.card })
    } else if (ev.type === 'claim') {
      if (s.phase !== 'playing') throw new Error(`claimPhase:${s.phase}`)
      if (!s.declareWindow) throw new Error('windowClosed')
      closeWindowTo(ev.claimer, i)
      if (!s.declareWindow || s.declareWindow.option !== ev.claimer) throw new Error('optionMismatch')
      // the claimer's knowledge at its claim
      const team = seatTeam(ev.claimer)
      const view = seatView(s, ev.claimer)
      const k = BOTS.buildKnowledge(view, KOPTS)
      const u = uncertainCards(k, ev.book)
      const right = ev.outcome === `team${team}`
      const cls = ev.forced ? 'forced' : u === 0 ? 'certain' : 'speculative'
      if (PCAL && CEIL) {
        // R1d: the claimer's own belief in the whole assignment, as the product of the marginals over the cards it
        // could not place - NOT the declare's joint (3.4b's pAssignment), and named as the approximation it is.
        // The question R1d asks is whether the map carries that quantity across the declare's thresholds, and which way.
        const R = sideOfTeam(team).ceiling.calClaims
        let q = 1
        let q2 = 1
        for (const c of CARDS.bookCards(ev.book, us54Config)) {
          if (k.holders[c] !== undefined) continue
          const p = BOTS.askHitProbability(k, c, ev.assignments[c])
          q *= p
          q2 *= cal(p)
        }
        R.n++
        for (const [key, bar] of [['cross775', 0.775], ['cross50', 0.5]]) {
          if (q < bar && q2 >= bar) R[key].up++
          else if (q >= bar && q2 < bar) R[key].down++
        }
      }
      if (u > 0 && !ev.forced) {
        const fl = threatFlags(s, ev.book, team, k)
        pendingThreat.push({ team, known: fl.known, pub: fl.pub, right })
        const L = sets[ev.book]
        const opp = 1 - team
        pendingGamble.push({ team, right, oppAsks: L.hits[opp] + L.misses[opp], ownAsks: L.hits[team] + L.misses[team], oppHeld: L.held[opp] })
      }
      endSet(ev, cls, u)
      step({ type: 'claim', seat: ev.claimer, book: ev.book, assignments: ev.assignments })
      const got = s.books[ev.book]
      if (!got || got.outcome !== ev.outcome) throw new Error('claimMismatch')
    } else if (ev.type === 'pass') {
      if (s.phase !== 'awaitPass') throw new Error(`passPhase:${s.phase}`)
      if (s.turn !== ev.from) throw new Error('passTurnMismatch')
      step({ type: 'pass', seat: ev.from, to: ev.to })
    } else throw new Error(`event:${ev.type}`)
    G.events++
  }
  if (s.phase !== 'finished') return 'notFinished'
  // ---- the replay completed: write the ledger into the tallies
  if (rec.winner === rec.teamA) G.armWins++
  for (const b of BOOKS) {
    const L = sets[b]
    if (!L.end) { G.setsUnended++; continue }
    G.setsLedgered++
    const { winner, claimerTeam, cls, right } = L.end
    const W = sideOfTeam(winner)
    const C = sideOfTeam(claimerTeam)
    C.declared++
    if (right) W.won[cls]++
    else {
      W.won.gift++
      C.wrong[cls === 'certain' ? 'certainWrong' : cls === 'speculative' ? 'wrong' : cls === 'forced' ? 'forcedWrong' : 'afterFinishWrong']++
    }
    if (L.lead.team >= 0) { // 3.8an
      const S = sideOfTeam(L.lead.team)
      const conv = winner === L.lead.team
      for (const F of [S.leads.all, S.leads[L.lead.first ?? 'none']]) { F.n++; if (conv) F.converted++ }
    }
    const split = Math.min(L.split[0], L.split[1])
    const SP = SPLIT[split]
    SP.n++
    SP.wonBy[sideIndex(winner)]++
    const majority = L.split[0] > L.split[1] ? 0 : L.split[1] > L.split[0] ? 1 : -1
    if (majority >= 0) {
      SP.majority[sideIndex(majority)]++
      if (majority === winner) SP.majorityWon[sideIndex(majority)]++
    }
    if (split === 1 || split === 2) { // 3.8am: a set held 5-1 or 4-2 at the deal, classed by the minority's asks into it
      const M = L.split[0] > L.split[1] ? 0 : 1
      const m = 1 - M
      const D = sideOfTeam(M).dominated[L.hits[m] + L.misses[m] === 0 ? 'minorityAsks0' : 'minorityAsks1']
      D.n++
      if (winner === M) { if (claimerTeam === M && cls === 'certain') D.certain++; else if (claimerTeam === M && cls === 'speculative') D.specRight++; else D.other++ }
      else if (claimerTeam === M && cls === 'speculative') D.specWrong++
      else if (claimerTeam === m && right) D.minorityWon++
      else D.other++
    }
    if (split >= 1) {
      for (const t of [0, 1]) {
        const S = sideOfTeam(t)
        const asks = L.hits[t] + L.misses[t]
        S.race.asks += asks
        S.race.hits += L.hits[t]
        const into = t === winner ? S.race.intoWon : S.race.intoLost
        into.asks += asks
        into.hits += L.hits[t]
      }
      if (right && cls === 'certain') {
        W.certainContested++
        if (L.lastPull === winner) W.lastPullOwn++
        if (L.hits[winner] === 0) W.certainNoPull++
      }
    }
  }
  for (const g of pendingGamble) {
    const S = sideOfTeam(g.team)
    for (const P of [S.gambles[g.oppAsks === 0 ? 'oppAsks0' : 'oppAsks1'], S.gambles[g.ownAsks === 0 ? 'ownAsks0' : 'ownAsks1']]) { P.n++; if (g.right) P.right++ }
    S.gambles.oppHeld[Math.min(2, Math.max(0, g.oppHeld))]++
  }
  for (const t of pendingThreat) {
    const S = sideOfTeam(t.team)
    for (const [name, on] of [['known', t.known], ['public', t.pub]]) {
      const P = S.threatClaims[name][on ? 'yes' : 'no']
      P.n++
      if (t.right) P.right++
    }
  }
  for (const d of deferred) {
    const S = sideOfTeam(d.team)
    // from the event whose window this was: a teammate's claim of the set at that same window resolves it too
    const later = rec.events.slice(d.evIndex).find((e) => e.type === 'claim' && e.book === d.book)
    for (const [name, on] of [['known', d.known], ['public', d.pub]]) {
      const R = S.knobDeferred[name][on ? 'yes' : 'no']
      R.n++
      if (d.rightNow) R.rightNow++
      if (!later) R.never++
      else if (later.outcome === `team${d.team}`) R.laterOwn++
      else R.laterLost++
    }
  }
  return null
}

let shown = 0
const t0 = Date.now()
for (const f of useFiles) {
  for (const rec of REC.readRecordFile(f)) {
    G.games++
    if (SAMPLE < 1 && uniform(`${rec.label}:attr${SALT ? ':' + SALT : ''}`) >= SAMPLE) continue
    G.sampled++
    let why = null
    try { why = replay(rec) } catch (e) { why = e.message; if (DEBUG && shown++ < DEBUG) console.log('set aside:', e.ctx ?? e.message) }
    if (why) { G.setAside[why] = (G.setAside[why] || 0) + 1; continue }
    G.replayed++
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(1)
const per = (a) => (G.replayed > 0 ? (a / G.replayed).toFixed(3) : '-')
const pct = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(1) + '%' : '-')
console.log(`probe-set-attribution: ${useFiles.length} files, ${G.games} games, ${G.sampled} sampled, ${G.replayed} replayed through the engine (the arm won ${pct(G.armWins, G.replayed)}), ${G.events} events, ${secs}s; the stack ${VERSION} ${JSON.stringify(OVER)}${KNOB ? `; the knob ${JSON.stringify(KNOB)} at the arm's declines` : ''}; the records' arms ${JSON.stringify(G.armVersions)}`)
console.log(`set aside: ${JSON.stringify(G.setAside)}; actions after this engine's finish ${G.eventsAfterFinish}; option moved by hand in compelled windows ${G.compelledMoves}; sets ledgered ${G.setsLedgered} (${per(G.setsLedgered)} a game), never ended ${G.setsUnended}`)
for (const [name, S] of [['the arm (ours)', T.arm], ['SESTINA', T.sestina]]) {
  const won = CLASSES.reduce((a, c) => a + S.won[c], 0)
  console.log(`== ${name}`)
  console.log(`sets won a game ${per(won)}: certain ${per(S.won.certain)}, speculative ${per(S.won.speculative)}, a gift (the other side declared wrong) ${per(S.won.gift)}, forced ${per(S.won.forced)}, after the finish ${per(S.won.afterFinish)}; declared ${per(S.declared)} a game, wrong: certain ${S.wrong.certainWrong}, speculative ${S.wrong.wrong} (${per(S.wrong.wrong)} a game), forced ${S.wrong.forcedWrong}, after the finish ${S.wrong.afterFinishWrong}`)
  const r = S.race
  console.log(`the race in contested sets: asks into them ${per(r.asks)} a game at ${pct(r.hits, r.asks)} hit; into sets it won ${r.intoWon.asks} at ${pct(r.intoWon.hits, r.intoWon.asks)}, into sets it lost ${r.intoLost.asks} at ${pct(r.intoLost.hits, r.intoLost.asks)}; certain sets won in contested splits ${S.certainContested}: the last pull its own ${pct(S.lastPullOwn, S.certainContested)}, no pull of its own ${pct(S.certainNoPull, S.certainContested)}`)
  const tc = S.threatClaims
  console.log(`the public threat at its speculative claims — known (the true hand): under threat ${tc.known.yes.n} right ${pct(tc.known.yes.right, tc.known.yes.n)}, not ${tc.known.no.n} right ${pct(tc.known.no.right, tc.known.no.n)}; public (believed at 0.5+): under threat ${tc.public.yes.n} right ${pct(tc.public.yes.right, tc.public.yes.n)}, not ${tc.public.no.n} right ${pct(tc.public.no.right, tc.public.no.n)}`)
  const ldr = S.leads
  console.log(`3.8an: leads taken (the first to four of six in a 3-3 set) ${ldr.all.n} (${per(ldr.all.n)} a game), converted ${pct(ldr.all.converted, ldr.all.n)}; at the first lead decision a chase ${ldr.chase.n} (${pct(ldr.chase.n, ldr.all.n)} of the leads) converting ${pct(ldr.chase.converted, ldr.chase.n)}, elsewhere ${ldr.elsewhere.n} (${pct(ldr.elsewhere.n, ldr.all.n)}) converting ${pct(ldr.elsewhere.converted, ldr.elsewhere.n)}, no decision ${ldr.none.n} converting ${pct(ldr.none.converted, ldr.none.n)}`)
  console.log(`  every lead decision (at four to two in a 3-3 set it leads): ${S.leadDecisions.n} (${per(S.leadDecisions.n)} a game), a chase ${pct(S.leadDecisions.chase, S.leadDecisions.n)}`)
  if (CEIL) {
    const C = S.ceiling
    const mean = (a) => (C.n > 0 ? ((100 * a) / C.n).toFixed(1) + '%' : '-')
    console.log(`3.8ao: at its ${C.n} asks replayed (${per(C.n)} a game; ${C.unranked} not on the ranker's list): the ask chosen hit ${pct(C.chosenHit, C.n)}, the ranker's top ${pct(C.topHit, C.n)}, the greedy ask by p ${pct(C.greedyHit, C.n)}, the oracle (some legal ask hits) ${pct(C.oracle, C.n)}; the chosen ask was the ranker's top ${pct(C.chosenIsTop, C.n)} and a greedy ask ${pct(C.chosenIsGreedy, C.n)}; mean p of the chosen ${mean(C.sumChosenP)}, of the greedy ${mean(C.sumGreedyP)}; a certain ask (p >= 0.99) on the table ${pct(C.certainAvail, C.n)}, taken when there ${pct(C.certainTaken, C.certainAvail)}`)
    console.log(`  the chosen ask's p by decile (n, mean p, hit): ${C.deciles.map((D, i) => `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}: ${D.n} ${D.n > 0 ? ((100 * D.sumP) / D.n).toFixed(1) + '%' : '-'} ${pct(D.hits, D.n)}`).join('; ')}`)
    console.log(`  every legal ask's p by decile (n, mean p, hit): ${C.decilesAll.map((D, i) => `${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}: ${D.n} ${D.n > 0 ? ((100 * D.sumP) / D.n).toFixed(1) + '%' : '-'} ${pct(D.hits, D.n)}`).join('; ')}`)
    console.log(`  the 0.5-0.9 band over every legal ask, by the card's candidates (n, mean p, hit): ${[2, 3, 4, 5].map((c) => { const B = C.band[c]; const one = (U) => `${U.n} ${U.n > 0 ? ((100 * U.sumP) / U.n).toFixed(1) + '%' : '-'} ${pct(U.hits, U.n)}`; return `${c}${c === 5 ? '+' : ''} uniform ${one(B.unif)} / scaled ${one(B.scaled)}` }).join('; ')}`)
    if (PCAL) {
      const R = C.cal
      const Q = C.calClaims
      console.log(`3.8ap R1: the fitted map over ${R.n} decisions moves p by ${(R.sumAbsDelta / Math.max(1, R.n)).toFixed(4)} summed over the list a decision; the greedy ask changed ${pct(R.greedyChanged, R.n)}, the ranker's top ${pct(R.topChanged, R.n)}, the clone's choice ${CLONE ? pct(R.cloneChanged, R.n) : 'n/a'}`)
      console.log(`  at ${Q.n} claims (the product of the marginals over the unplaced cards, not the declare's joint): across 0.775 up ${pct(Q.cross775.up, Q.n)} down ${pct(Q.cross775.down, Q.n)}; across 0.5 up ${pct(Q.cross50.up, Q.n)} down ${pct(Q.cross50.down, Q.n)}`)
    }
    if (CLONE) {
      const H = C.short
      const row = (T) => ['k1', 'k2', 'k3', 'k5', 'all'].map((key) => `${key === 'all' ? 'all' : key.slice(1)}: ${pct(T[key], H.n)}`).join('; ')
      console.log(`3.8ap R2: at ${H.n} decisions the clone's top ask hit ${pct(H.topHit, H.n)} and the record's ask was its top ${pct(H.recordIsTop, H.n)}`)
      console.log(`  some hitting ask within the clone's top k: ${row(H.someHit)}`)
      console.log(`  best-of-top-k by the marginal's p: ${row(H.bestByP)}`)
      console.log(`  the record's own ask within the clone's top k: ${row(H.recordRank)}`)
      const D = C.cands
      const krow = (T, d) => ['k3', 'k4', 'k5'].map((key) => `${key.slice(1)}: ${d ? (T[key] / Math.max(1, D.n)).toFixed(2) : pct(T[key], D.n)}`).join('; ')
      console.log(`3.8aq G: at ${D.n} decisions, a candidate set holding an ask that would have hit — the ranker's fill (today's) ${krow(D.today)}; the clone's fill ${krow(D.clone)}; the two mixed ${krow(D.mixed)}`)
      console.log(`  entries the two fills share, of the set's own size (both seeded with the clone's pick): shared ${krow(D.shared, 1)} of ${krow(D.sizeToday, 1)}`)
    }
    console.log(`  greedy p minus chosen p (n, the chosen hit, the greedy hit): ${Object.entries(C.margin).map(([key, B]) => `${key}: ${B.n} ${pct(B.chosenHit, B.n)} ${pct(B.greedyHit, B.n)}`).join('; ')}`)
  }
  const g = S.gambles
  console.log(`3.8am: its speculative claims by the other side's asks into the set before the claim — none ${g.oppAsks0.n} right ${pct(g.oppAsks0.right, g.oppAsks0.n)}, some ${g.oppAsks1.n} right ${pct(g.oppAsks1.right, g.oppAsks1.n)}; by its own asks — none ${g.ownAsks0.n} right ${pct(g.ownAsks0.right, g.ownAsks0.n)}, some ${g.ownAsks1.n} right ${pct(g.ownAsks1.right, g.ownAsks1.n)}; the other side's cards in the set at the claim 0 / 1 / 2+: ${g.oppHeld.join(' / ')}`)
  for (const [name, D] of [['the other side never asked into it', S.dominated.minorityAsks0], ['the other side asked into it', S.dominated.minorityAsks1]]) console.log(`  the sets it held 5-1 or 4-2 at the deal, ${name}: ${D.n} (${per(D.n)} a game): declared certain ${pct(D.certain, D.n)}, gambled right ${pct(D.specRight, D.n)}, gambled wrong (a gift) ${pct(D.specWrong, D.n)}, the other side won it ${pct(D.minorityWon, D.n)}, other ${pct(D.other, D.n)}`)
  if (KNOB_POL) {
    const kd = S.knobDeferred
    const line = (R) => `${R.n} (${per(R.n)} a game), right now ${pct(R.rightNow, R.n)}, the set later its own ${pct(R.laterOwn, R.n)}, later the other side's ${pct(R.laterLost, R.n)}, never ${R.never}`
    console.log(`the knob's first would-be claim of a set where it declined — known threat: yes ${line(kd.known.yes)}; no ${line(kd.known.no)}`)
    console.log(`  public threat: yes ${line(kd.public.yes)}; no ${line(kd.public.no)}`)
  }
}
console.log(`== by the deal's split (sets; won by the arm / SESTINA; the majority holder's sets and its win rate, arm / SESTINA)`)
const NAMES = ['6-0', '5-1', '4-2', '3-3']
for (let i = 0; i < 4; i++) {
  const P = SPLIT[i]
  const maj = i === 3 ? 'even' : `majority arm ${P.majority[0]} won ${pct(P.majorityWon[0], P.majority[0])} / SESTINA ${P.majority[1]} won ${pct(P.majorityWon[1], P.majority[1])}`
  console.log(`  ${NAMES[i]}: ${P.n} sets (${per(P.n)} a game), won by the arm ${pct(P.wonBy[0], P.n)} / SESTINA ${pct(P.wonBy[1], P.n)}; ${maj}`)
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ args: process.argv.slice(2), G, T, SPLIT, secs }, null, 1))
