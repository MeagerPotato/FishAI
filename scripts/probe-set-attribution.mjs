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
 *          [--max-files N] [--debug N] [--out summary.json]
 *
 * `--version`/`--override` is the stack whose knowledge options rebuild every seat's knowledge (the arm's own vector);
 * `--knob` lays a style over it and plays it at every window offer of the arm's seats as a one-step counterfactual
 * (3.8ak's form); `--holder-model` registers a holder-model JSON under `--holder-name` (default 'holder') so a knob
 * may name it as `claimHolderModel`. Sides: the arm is the team `rec.teamA` played; SESTINA the other.
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
if (DIRS.length === 0) {
  console.error('--records is required')
  process.exit(2)
}
if (HOLDER_FILE) BOTS.registerHolderModel(HOLDER_NAME, JSON.parse(fs.readFileSync(HOLDER_FILE, 'utf8')))

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
const useFiles = MAXF > 0 ? files.slice(0, MAXF) : files

const CLASSES = ['certain', 'speculative', 'gift', 'forced', 'afterFinish']
const WRONG = ['certainWrong', 'wrong', 'forcedWrong', 'afterFinishWrong']
const pair = () => ({ n: 0, right: 0 })
const cf = () => ({ n: 0, rightNow: 0, laterOwn: 0, laterLost: 0, never: 0 })
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
  for (const b of BOOKS) sets[b] = { split: [0, 0], hits: [0, 0], misses: [0, 0], lastPull: -1, end: null }
  rec.hands0.forEach((h, x) => { for (const c of h) sets[CARDS.cardBook(c)].split[seatTeam(x)]++ })
  const deferred = []
  const pendingThreat = [] // the threat read at this side's speculative claims, written when the replay completes
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
        if (ev.hit) { L.hits[t]++; L.lastPull = t } else L.misses[t]++
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
  function replayOne(ev, i) {
    if (ev.type === 'ask') {
      if (s.phase !== 'playing') throw new Error(`askPhase:${s.phase}`)
      closeWindowTo(null, i)
      if (s.turn !== ev.asker) throw new Error('turnMismatch')
      const before = s.hands[ev.target].includes(ev.card)
      if (before !== ev.hit) throw new Error('hitMismatch')
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
      if (u > 0 && !ev.forced) {
        const fl = threatFlags(s, ev.book, team, k)
        pendingThreat.push({ team, known: fl.known, pub: fl.pub, right })
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
    const split = Math.min(L.split[0], L.split[1])
    const SP = SPLIT[split]
    SP.n++
    SP.wonBy[sideIndex(winner)]++
    const majority = L.split[0] > L.split[1] ? 0 : L.split[1] > L.split[0] ? 1 : -1
    if (majority >= 0) {
      SP.majority[sideIndex(majority)]++
      if (majority === winner) SP.majorityWon[sideIndex(majority)]++
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
