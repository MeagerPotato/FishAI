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
 *   node scripts/attribute.mjs --records DIR [--cf v0.4c] [--json out.json]
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
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce, decide } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const has = (flag) => process.argv.includes(flag)

const HOME = Number(argOf('--home', 0))
const RECORDS = argOf('--records', null)
const VA = argOf('--a', 'v0.4c')
const VB = argOf('--b', 'v0.4c')
const CF = argOf('--cf', 'v0.4c')
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
    hitExists: 0, hitWhenExists: 0,
    cfN: 0, cfAgree: 0, cfHit: 0, actHitAtCf: 0, cfDiff: 0, cfDiffHit: 0, actDiffHit: 0, cfNonAsk: 0,
  })
  const declT = () => ({
    n: 0, correct: 0, gifts: 0, void: 0, forced: 0,
    locksFormed: 0, locksCashed: 0, locksBroken: 0, locksGifted: 0, locksOpen: 0, holdSum: 0, holdN: 0,
  })
  const tempoT = () => ({ runs: 0, hits: 0, passes: 0 })
  const split = {}
  for (let k = 0; k <= 6; k++) split[k] = { n: 0, aCashed: 0, aGifted: 0, bCashed: 0, bGifted: 0, open: 0, openLocked: 0, openLeadA: 0, openLeadB: 0 }
  return {
    games: 0, wins: [0, 0], sets: [0, 0], open: 0, noClinch: 0, eventsToClinch: 0, badRecords: 0,
    split, asks: [askT(), askT()], decl: [declT(), declT()], tempo: [tempoT(), tempoT()],
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
  updateLocks(0)

  for (let i = 0; i < rec.events.length; i++) {
    const ev = rec.events[i]
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
      if (T !== lastAskTeam) { acc.tempo[T].runs++; lastAskTeam = T }
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
        }
      }
      if (ev.hit) {
        hands[ev.target] = hands[ev.target].filter((c) => c !== ev.card)
        hands[ev.asker].push(ev.card)
        seatOf.set(ev.card, ev.asker)
        publicAt.set(ev.card, ev.asker)
        acc.tempo[T].hits++
        updateLocks(i)
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
  for (const b of BOOKS) {
    if (resolved[b]) continue
    acc.open++
    const sp = acc.split[split0[b]]
    sp.open++
    if (lock[b]) { sp.openLocked++; acc.decl[lock[b].team].locksOpen++ }
    const c0 = BOOK_CARDS.get(b).filter((c) => side(seatOf.get(c)) === 0).length
    if (c0 > 3) sp.openLeadA++
    else if (c0 < 3) sp.openLeadB++
  }
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
  const files = one ? [path.basename(dir)] : fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()
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
      yield toRecord(o, names, bookOfSet, `${f}:${o.deal}:${o.rot}`, header)
    }
  }
}

function toRecord(o, names, bookOfSet, label, header) {
  const hands0 = o.dealt.map((idxs) => idxs.map((c) => names[c]))
  const hands = hands0.map((h) => [...h])
  const seatOf = new Map()
  hands0.forEach((h, x) => h.forEach((c) => seatOf.set(c, x)))
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
      if (success) { hands[target] = hands[target].filter((d) => d !== c); hands[actor].push(c); seatOf.set(c, actor) }
    } else if (kind === 1 || kind === 3) {
      const book = bookOfSet[set]
      const assignments = {}
      const actualHolders = {}
      for (let j = 0; j < 6; j++) { const c = names[set * 6 + j]; assignments[c] = owner[j]; actualHolders[c] = seatOf.get(c) }
      const T = team(actor)
      const outcomeTeam = success ? T : 1 - T
      const ev = { type: 'claim', claimer: actor, book, assignments, actualHolders, outcome: `team${outcomeTeam}` }
      if (kind === 3) ev.forced = true
      events.push(ev)
      outcomes.push([set, outcomeTeam])
      for (let j = 0; j < 6; j++) { const c = names[set * 6 + j]; const x = seatOf.get(c); if (x !== undefined) hands[x] = hands[x].filter((d) => d !== c); seatOf.delete(c) }
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
  console.log('-- tempo --')
  console.log('| side | share of asks | runs/g | asks per run | hits/g | passes/g |')
  console.log('|---|---|---|---|---|---|')
  const askTotal = acc.asks[0].n + acc.asks[1].n
  for (const t of [0, 1]) {
    const T = acc.tempo[t]
    console.log(`| ${t === 0 ? 'A' : 'B'} | ${pct(acc.asks[t].n, askTotal)} | ${per(T.runs, g)} | ${ratio(acc.asks[t].n, T.runs, 2)} | ${per(T.hits, g)} | ${per(T.passes, g)} |`)
  }
  console.log('')
  console.log('-- declares and locks --')
  console.log('| side | declares/g | right | gifts/g | void | locks formed/g | cashed | broken | gifted | open at the end | lock hold (events, cashed) |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const t of [0, 1]) {
    const D = acc.decl[t]
    console.log(`| ${t === 0 ? 'A' : 'B'} | ${per(D.n, g)} | ${pct(D.correct, D.n)} | ${per(D.gifts, g)} | ${D.void} | ${per(D.locksFormed, g)} | ${pct(D.locksCashed, D.locksFormed)} | ${pct(D.locksBroken, D.locksFormed)} | ${pct(D.locksGifted, D.locksFormed)} | ${pct(D.locksOpen, D.locksFormed)} | ${ratio(D.holdSum, D.holdN, 2)} |`)
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
  for (const rec of readRecords(RECORDS)) { if (!header) header = rec.header; walk(rec, cfPol, acc) }
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
