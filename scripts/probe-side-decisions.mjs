/**
 * probe-side-decisions.mjs - MONET.md 3.8aj's instrument: the decisions the ask clone does not cover - the declare,
 * the window's decline, the handoff of the turn - read against SESTINA's on the bridge records, with the true deal
 * known. Every record game is REPLAYED THROUGH THIS ENGINE (`reduce`, RULES_US54): an ask closes the window with six
 * declines and is applied as the record says; a declare by seat X is reached by declining from the seat holding the
 * option up to X, then X's claim with the record's assignment; a pass is the turn-holder's `pass` in `awaitPass`. The
 * engine is the authority on every step: the turn-holder at each ask, the hit, the claim's outcome and the phase must
 * be what the record says, or the game is set aside and counted. At every decision point so reached - each window
 * offer, each claim, each pass - the seat's actual action is compared with `decide()` at that seat's own view: for
 * SESTINA's seats the shipped stack's counterfactual (would it claim where SESTINA declined? the same set, the same
 * assignment, where SESTINA declared? the same teammate at a pass?); for our own seats (arm A) the arm's version's
 * `decide()` against its own recorded actions, which is the check that the replay reconstructs what the bot saw.
 *
 *     node scripts/probe-side-decisions.mjs --records <dir>[,<dir>...] [--version v0.9] [--override <json>]
 *          [--sample 0.25] [--sample-salt s] [--holdout-mod 5] [--max-files N] [--arm-version vX --arm-override <json>]
 *          [--deals 64] [--holder-model <holder fit.json>] [--debug N] [--out summary.json]
 *
 * `--version`/`--override` is the stack read at SESTINA's seats (the counterfactual); `--arm-version`/`--arm-override`
 * the vector our seats played in the records (default: the same stack), for the validation.
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
const SEARCH = await import(pathToFileURL(join(ROOT, 'lib/engine/search/index.ts')).href)
const RNG = await import(pathToFileURL(join(ROOT, 'lib/engine/rng.ts')).href)
const { hashSeed, reduce, seatView, us54Config } = ENG
const DEALS = Number(argOf('--deals', 64))
// MONET.md 3.8ah's holder clone, read beside the marginal at the other side's speculative claims (--holder-model <fit.json>)
const HOLDER_FILE = argOf('--holder-model', '')
let HOLDER = null
if (HOLDER_FILE) {
  BOTS.registerHolderModel('probe-holder', JSON.parse(fs.readFileSync(HOLDER_FILE, 'utf8')))
  HOLDER = BOTS.holderModelOf('probe-holder')
}

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const DIRS = argOf('--records', '').split(',').filter(Boolean)
const VERSION = argOf('--version', 'v0.9')
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const SAMPLE = Number(argOf('--sample', 0.25))
const SALT = argOf('--sample-salt', '')
const HOLD = Number(argOf('--holdout-mod', 5))
const MAXF = Number(argOf('--max-files', 0))
const ARMV = argOf('--arm-version', '')
const OUT = argOf('--out', '')
const SPEC_B = argOf('--spec-b', 'v07:r12=25,rtie=1,pool=-1,oppfloor=-1,force=1000000,askfloor=-1,stall=12,s1=1,det=12,cand=4,kappa=2.5,rbelief=indep,depth=12,maxq=26')
if (DIRS.length === 0) {
  console.error('--records is required')
  process.exit(2)
}
const pol0 = MON.monetPolicy(VERSION)
const POL = OVER ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...OVER }) }) : pol0
const { skill, style } = BOTS.resolvePolicy(POL)
const marginal = style.pModel === 'marginal'
const KOPTS = { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal, choiceKappa: marginal ? style.choiceKappa : undefined, choiceAdapt: marginal ? style.choiceAdapt : undefined, choicePrior: marginal ? style.choicePrior : undefined }
const uniform = (key) => (hashSeed(key)() >>> 0) / 4294967296
const seatTeam = (s) => s % 2

// The arm's own vector at our seats: the bridge arms play monetPolicy(MONET_ARM) with MONET_OVERRIDE laid over it
// (arm_v30/bot.mjs), and the records' rungs each had their own doses - so the validation reads the version and
// override given here (--arm-version, --arm-override; default: the stack read at SESTINA's seats), and its agreement
// is exact only on records whose arm played that vector (the clone arms' claims and passes are the stack's own).
const ARM_OVER = argOf('--arm-override', '') ? JSON.parse(argOf('--arm-override', '')) : OVER
const armPol0 = ARMV ? MON.monetPolicy(ARMV) : pol0
const ARM = ARM_OVER ? Object.freeze({ skill: armPol0.skill, style: Object.freeze({ ...armPol0.style, ...ARM_OVER }) }) : armPol0
const ARM_LABEL = `${ARMV || VERSION}${ARM_OVER ? ' ' + JSON.stringify(ARM_OVER) : ''}`

let files = []
let skipped = 0
for (const d of DIRS) for (const f of REC.recordFiles(d)) { const h = REC.readHeader(f); if (h.specB !== SPEC_B || !String(h.specA).startsWith('bot:')) { skipped++; continue } files.push(f) }
const holdoutFiles = files.filter((_, fi) => fi % HOLD === 0)
const useFiles = MAXF > 0 ? holdoutFiles.slice(0, MAXF) : holdoutFiles

/** A tally for one side (SESTINA, or our arm). */
function side() {
  return {
    offers: 0, ourClaimAtDecline: 0, ourClaimAtDeclineCertain: 0, deferredSameWindow: 0, deferredLaterOwn: 0, deferredLaterLost: 0, deferredNever: 0,
    claims: 0, claimsRight: 0, claimsForced: 0, claimsOnTurn: 0, claimsByUncertain: [0, 0, 0, 0, 0, 0, 0], claimsRightByUncertain: [0, 0, 0, 0, 0, 0, 0],
    // the stack's own belief in the claimer's assignment (the product of its marginals over the cards the claimer could
    // not place; 1 when every card is placed), by decile, with the outcome: the calibration of the other side's gambles
    beliefDecile: Array.from({ length: 10 }, () => [0, 0]),
    // the same claims by the share of deals consistent with the stack's knowledge (sampleDeal) that carry the claimer's
    // assignment: forced (every sampled deal), likely (0.6 to 1), a gamble (below 0.6), no deal drawn - with the outcome
    forcedBy: { forced: [0, 0], likely: [0, 0], gamble: [0, 0], none: [0, 0] },
    // the holder clone's belief in the same assignments (--holder-model), by decile, with the outcome
    holderDecile: Array.from({ length: 10 }, () => [0, 0]),
    ourAtClaim: { sameBookSameAssign: 0, sameBookOtherAssign: 0, otherBook: 0, decline: 0 },
    ourAtClaimRight: { sameBookSameAssign: 0, sameBookOtherAssign: 0, otherBook: 0, decline: 0 },
    claimAge: [], // events since the claimed set became certain to the claimer (by its own knowledge), -1 if never certain
    passes: 0, passAgree: 0, passOptions: 0,
  }
}
const T = { sestina: side(), arm: side() }
const G = { games: 0, sampled: 0, replayed: 0, setAside: {}, events: 0, eventsAfterFinish: 0, compelledMoves: 0, armVersions: {} }

/** How many of the set's six cards the seat cannot place (its own knowledge); the claim's assignment where it differs from the truth is the record's. */
function uncertainCards(k, book) {
  let n = 0
  for (const c of CARDS.bookCards(book, us54Config)) if (k.holders[c] === undefined) n++
  return n
}
function certainForTeam(k, book, team) {
  for (const c of CARDS.bookCards(book, us54Config)) { const h = k.holders[c]; if (h === undefined || seatTeam(h) !== team) return false }
  return true
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
  const sideOf = (seat) => (seatTeam(seat) !== rec.teamA ? T.sestina : T.arm)
  const polOf = (seat) => (seatTeam(seat) !== rec.teamA ? POL : ARM)
  // when each unresolved set became certain (all six placed on one team) to each seat: certainAt[seat][book] = event index
  const certainAt = Array.from({ length: 6 }, () => ({}))
  // deferrals: {seat, book, at} where our stack would have claimed and the seat declined
  const deferred = []
  let n = 0
  const step = (action) => {
    const r = reduce(s, action)
    if (!r.ok) throw new Error(r.error.code)
    s = r.state
    n++
  }
  const offer = (seat, actual) => { // the window option at `seat`; actual = 'decline' | claim event
    const view = seatView(s, seat)
    const k = BOTS.buildKnowledge(view, KOPTS)
    const team = seatTeam(seat)
    // track certainty of every unresolved set for this seat
    for (const book of CARDS.allBooks(us54Config)) {
      if (s.books[book]) continue
      if (certainAt[seat][book] === undefined && certainForTeam(k, book, team)) certainAt[seat][book] = n
    }
    const ours = ENG.decide(view, polOf(seat), hashSeed(`${rec.label}:side:${n}:${seat}`)())
    const S = sideOf(seat)
    if (actual === 'decline') {
      S.offers++
      if (ours.type === 'claim') {
        S.ourClaimAtDecline++
        if (certainForTeam(k, ours.book, team)) S.ourClaimAtDeclineCertain++
        deferred.push({ seat, book: ours.book, evIndex, team })
      }
      return
    }
    // a claim by `seat`
    const ev = actual
    S.claims++
    const u = uncertainCards(k, ev.book)
    S.claimsByUncertain[u]++
    const right = ev.outcome === `team${team}`
    if (right) { S.claimsRight++; S.claimsRightByUncertain[u]++ }
    if (u > 0) {
      let p = 1
      for (const c of CARDS.bookCards(ev.book, us54Config)) if (k.holders[c] === undefined) p *= BOTS.askHitProbability(k, c, ev.assignments[c])
      const dec = Math.min(9, Math.floor(p * 10))
      S.beliefDecile[dec][0]++
      if (right) S.beliefDecile[dec][1]++
      if (HOLDER) {
        const ctx = BOTS.holderContext(view, k)
        let ph = 1
        for (const c of CARDS.bookCards(ev.book, us54Config)) if (k.holders[c] === undefined) ph *= BOTS.holderBelief(HOLDER, ctx, k, view, c)[ev.assignments[c]]
        const dh = Math.min(9, Math.floor(ph * 10))
        S.holderDecile[dh][0]++
        if (right) S.holderDecile[dh][1]++
      }
      // is the assignment forced by what the claimer could know? deals consistent with the stack's knowledge
      const rng = RNG.mulberry32(hashSeed(`${rec.label}:deals:${n}`)() >>> 0)
      let drawn = 0
      let agree = 0
      for (let d = 0; d < DEALS; d++) {
        const hands = SEARCH.sampleDeal(view, k, rng)
        if (hands === null) continue
        drawn++
        let ok = true
        for (const c of CARDS.bookCards(ev.book, us54Config)) if (k.holders[c] === undefined && !hands[ev.assignments[c]].includes(c)) { ok = false; break }
        if (ok) agree++
      }
      const share = drawn === 0 ? -1 : agree / drawn
      const bucket = drawn === 0 ? 'none' : share >= 0.99 ? 'forced' : share >= 0.6 ? 'likely' : 'gamble'
      S.forcedBy[bucket][0]++
      if (right) S.forcedBy[bucket][1]++
    }
    if (ev.forced) S.claimsForced++
    if (s.turn === seat) S.claimsOnTurn++
    const ca = certainAt[seat][ev.book]
    S.claimAge.push(ca === undefined ? -1 : n - ca)
    let cls
    if (ours.type !== 'claim') cls = 'decline'
    else if (ours.book !== ev.book) cls = 'otherBook'
    else {
      let same = true
      for (const c of CARDS.bookCards(ev.book, us54Config)) if (ours.assignments[c] !== ev.assignments[c]) { same = false; break }
      cls = same ? 'sameBookSameAssign' : 'sameBookOtherAssign'
    }
    S.ourAtClaim[cls]++
    if (right) S.ourAtClaimRight[cls]++
  }
  const closeWindowTo = (target) => { // decline from the option up to (not including) `target`; target null = close fully
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
        offer(seat, 'decline')
        s = r.state
        n++
      }
      if (++guard > 12) throw new Error('windowLoop')
    }
  }
  let evIndex = -1
  for (let i = 0; i < rec.events.length; i++) {
    const ev = rec.events[i]
    // the reader's own bookkeeping events (game_started, player_out, ...) are not actions: the engine emits its own
    if (ev.type !== 'ask' && ev.type !== 'claim' && ev.type !== 'pass') continue
    // this engine ends the game once a team holds five sets (the win is decided); the recording engine plays on
    if (s.phase === 'finished') { G.eventsAfterFinish++; continue }
    evIndex = i
    try {
      replayOne(ev)
    } catch (e) {
      const err = new Error(e.message)
      err.ctx = `${rec.label} ${e.message} @${i}/${rec.events.length} ${JSON.stringify(ev).slice(0, 160)} | phase=${s.phase} turn=${s.turn} window=${JSON.stringify(s.declareWindow)} counts=${s.hands.map((h) => h.length).join(',')} books=${Object.keys(s.books).length} | next=${JSON.stringify(rec.events[i + 1] ?? null).slice(0, 160)}`
      throw err
    }
  }
  function replayOne(ev) {
    if (ev.type === 'ask') {
      if (s.phase !== 'playing') throw new Error(`askPhase:${s.phase}`)
      closeWindowTo(null)
      if (s.turn !== ev.asker) throw new Error('turnMismatch')
      const before = s.hands[ev.target].includes(ev.card)
      if (before !== ev.hit) throw new Error('hitMismatch')
      step({ type: 'ask', seat: ev.asker, target: ev.target, card: ev.card })
    } else if (ev.type === 'claim') {
      if (s.phase !== 'playing') throw new Error(`claimPhase:${s.phase}`)
      if (!s.declareWindow) throw new Error('windowClosed')
      closeWindowTo(ev.claimer)
      if (!s.declareWindow || s.declareWindow.option !== ev.claimer) throw new Error('optionMismatch')
      offer(ev.claimer, ev)
      step({ type: 'claim', seat: ev.claimer, book: ev.book, assignments: ev.assignments })
      const got = s.books[ev.book]
      if (!got || got.outcome !== ev.outcome) throw new Error('claimMismatch')
    } else if (ev.type === 'pass') {
      if (s.phase !== 'awaitPass') throw new Error(`passPhase:${s.phase}`)
      if (s.turn !== ev.from) throw new Error('passTurnMismatch')
      const view = seatView(s, ev.from)
      const ours = ENG.decide(view, polOf(ev.from), hashSeed(`${rec.label}:pass:${n}`)())
      const S = sideOf(ev.from)
      S.passes++
      let options = 0
      for (let x = 0; x < 6; x++) if (seatTeam(x) === seatTeam(ev.from) && x !== ev.from && s.hands[x].length > 0) options++
      S.passOptions += options
      if (ours.type === 'pass' && ours.to === ev.to) S.passAgree++
      step({ type: 'pass', seat: ev.from, to: ev.to })
    } else throw new Error(`event:${ev.type}`)
    G.events++
  }
  // deferrals resolved by the record itself: who declared the set in the end (the record plays every set out). A claim
  // of that set by a teammate at this very window (the event the offers led up to) is the recording engine's offer
  // order, not a deferral, and is counted apart.
  for (const d of deferred) {
    const S = d.team !== rec.teamA ? T.sestina : T.arm
    const atWindow = rec.events[d.evIndex]
    if (atWindow && atWindow.type === 'claim' && atWindow.book === d.book && seatTeam(atWindow.claimer) === d.team) { S.deferredSameWindow++; continue }
    const later = rec.events.slice(d.evIndex + 1).find((e) => e.type === 'claim' && e.book === d.book)
    if (!later) S.deferredNever++
    else if (later.outcome === `team${d.team}`) S.deferredLaterOwn++
    else S.deferredLaterLost++
  }
  if (s.phase !== 'finished') return 'notFinished'
  return null
}

const DEBUG = Number(argOf('--debug', 0))
let shown = 0
const t0 = Date.now()
for (const f of useFiles) {
  for (const rec of REC.readRecordFile(f)) {
    G.games++
    if (SAMPLE < 1 && uniform(`${rec.label}:side${SALT ? ':' + SALT : ''}`) >= SAMPLE) continue
    G.sampled++
    let why = null
    try { why = replay(rec) } catch (e) { why = e.message; if (DEBUG && shown++ < DEBUG) console.log('set aside:', e.ctx ?? e.message) }
    if (why) { G.setAside[why] = (G.setAside[why] || 0) + 1; continue }
    G.replayed++
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(1)
const pct = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(2) + '%' : '-')
const med = (xs) => { const a = xs.filter((x) => x >= 0).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : '-' }
const mean = (xs) => { const a = xs.filter((x) => x >= 0); return a.length ? (a.reduce((p, q) => p + q, 0) / a.length).toFixed(1) : '-' }
console.log(`probe-side-decisions: ${useFiles.length} holdout files of ${files.length} (${skipped} skipped), ${G.games} games, ${G.sampled} sampled, ${G.replayed} replayed through the engine, ${G.events} events, ${secs}s; stack ${VERSION}${OVER ? ' ' + JSON.stringify(OVER) : ''} at SESTINA's seats; ${ARM_LABEL} at ours; the records' arms ${JSON.stringify(G.armVersions)}`)
console.log(`set aside: ${JSON.stringify(G.setAside)}; actions after this engine's finish (a team at five sets) ${G.eventsAfterFinish}; option moved by hand in compelled windows ${G.compelledMoves}`)
for (const [name, S] of [['SESTINA', T.sestina], ['arm A (ours, its own version: the validation)', T.arm]]) {
  console.log(`--- ${name} ---`)
  console.log(`window offers declined ${S.offers}; the stack would claim at ${S.ourClaimAtDecline} (${pct(S.ourClaimAtDecline, S.offers)}), ${S.ourClaimAtDeclineCertain} of them certain sets; of those, claimed by a teammate at that same window ${S.deferredSameWindow} (the recording engine's offer order), later by the same team ${S.deferredLaterOwn}, later by the other team ${S.deferredLaterLost}, never ${S.deferredNever}`)
  console.log(`the stack's belief in the claimer's assignment where cards were unplaced, by decile 0..9 (claims: right): ${S.beliefDecile.map(([a, b]) => `${a}:${b}`).join(' ')}`)
  if (HOLDER) console.log(`the holder clone's belief in the same assignments, by decile 0..9 (claims: right): ${S.holderDecile.map(([a, b]) => `${a}:${b}`).join(' ')}`)
  const fb = S.forcedBy
  console.log(`those assignments against deals consistent with the stack's knowledge (${DEALS} drawn a claim): forced ${fb.forced[0]} (right ${fb.forced[1]}), likely ${fb.likely[0]} (right ${fb.likely[1]}), a gamble ${fb.gamble[0]} (right ${fb.gamble[1]}), no deal drawn ${fb.none[0]} (right ${fb.none[1]})`)
  console.log(`claims ${S.claims}: right ${pct(S.claimsRight, S.claims)}, forced ${S.claimsForced}, on the claimer's own turn ${pct(S.claimsOnTurn, S.claims)}; by cards the claimer could not place 0..6: ${S.claimsByUncertain.join(' ')} (right: ${S.claimsRightByUncertain.join(' ')})`)
  console.log(`the stack at the claim: same set & assignment ${pct(S.ourAtClaim.sameBookSameAssign, S.claims)}, same set other assignment ${pct(S.ourAtClaim.sameBookOtherAssign, S.claims)}, another set ${pct(S.ourAtClaim.otherBook, S.claims)}, would decline ${pct(S.ourAtClaim.decline, S.claims)}; among right claims: ${S.ourAtClaimRight.sameBookSameAssign} / ${S.ourAtClaimRight.sameBookOtherAssign} / ${S.ourAtClaimRight.otherBook} / ${S.ourAtClaimRight.decline}`)
  console.log(`events from the set becoming certain to the claimer to its claim: median ${med(S.claimAge)}, mean ${mean(S.claimAge)}; claims never certain ${S.claimAge.filter((x) => x < 0).length}`)
  console.log(`passes ${S.passes}: the stack hands the turn to the same teammate ${pct(S.passAgree, S.passes)} (options a pass ${S.passes ? (S.passOptions / S.passes).toFixed(2) : '-'})`)
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ args: process.argv.slice(2), G, T, secs }, null, 1))
