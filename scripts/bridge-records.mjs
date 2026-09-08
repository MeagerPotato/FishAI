/**
 * bridge-records.mjs - the bridge's game records (their engine's output - data, not code) read into the
 * engine's own shapes, for the instruments that walk them (MONET.md 3.8ac's imitation data first; the
 * reader is attribute.mjs's, lifted here verbatim so more than one script can share it).
 *
 * A record file is one JSON line per game from the recording engine build: a header line
 * {header, specA, specB, cards[]} then games {deal, rot, orient, shift, seed, dealt[6][],
 * events[[kind, actor, target, card, set, success, owner[6], handCount[6]]...], winner, score,
 * hitLimit, setWinner[]}. kind: 0 ask, 1 declare, 2 pass, 3 forced declare, 4 end. `readRecords`
 * translates each game into the engine's PublicEvent log with the true holders filled from the tracked
 * deal, checked event by event against the engine's own public hand counts; `walkAsks` replays a
 * record and hands the caller every ask decision as the asking seat's own view (RULES_US54 - the hand,
 * the public log so far, the counts, the score, the resolved half-suits), with the tracked hands.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const CARDS = await import(pathToFileURL(process.cwd() + '/lib/engine/cards.ts').href)
const { us54Config, seatView } = ENG

const team = (seat) => seat % 2
const bookOf = (c) => CARDS.cardBook(c)

/** FishLab card name -> FishAI Card: the jokers and the ten are the only translations. */
export const toAi = (name) => (name === 'RJ' ? 'XR' : name === 'BJ' ? 'XB' : name.startsWith('10') ? 'T' + name.slice(2) : name)

/** The record files under `dir` (or the one file), sorted; `prefix` filters by file name. */
export function recordFiles(dir, prefix = '') {
  const one = fs.statSync(dir).isFile()
  const files = one ? [path.basename(dir)] : fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl') && f.startsWith(prefix)).sort()
  const base = one ? path.dirname(dir) : dir
  return files.map((f) => path.join(base, f))
}

/** The header line of one record file: {header, specA, specB, games, rotations, seed, sets, cards[]}. */
export function readHeader(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(65536)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    const text = buf.toString('utf8', 0, n)
    const nl = text.indexOf('\n')
    if (nl < 0) throw new Error(`${path.basename(file)}: no header line within 64 KB`)
    const o = JSON.parse(text.slice(0, nl))
    if (!o.header) throw new Error(`${path.basename(file)}: the first line is not a header`)
    return o
  } finally {
    fs.closeSync(fd)
  }
}

/** Every game of one record file, translated. */
export function* readRecordFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  let names = null
  let bookOfSet = null
  let header = null
  const f = path.basename(file)
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
    const rec = toRecord(o, names, bookOfSet, `${f}:${o.deal}:${o.rot}`)
    rec.file = f
    rec.header = header
    yield rec
  }
}

/** Every game under `dir` (a directory of *.jsonl, or one file). */
export function* readRecords(dir, prefix = '') {
  for (const file of recordFiles(dir, prefix)) yield* readRecordFile(file)
}

function toRecord(o, names, bookOfSet, label) {
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
      // the cards a hit had already shown, so a walker knows exactly what the live bot knew
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
  if (Array.isArray(o.setWinner)) for (const [set, t] of outcomes) if (o.setWinner[set] !== t) throw new Error(`${label}: half-suit ${set} awarded to ${o.setWinner[set]} by the engine but ${t} by the events`)
  // teamA: the team arm A (ours) played in this game; SESTINA is the other
  return { label, teamA: o.orient, hands0, events, winner: o.winner, score: o.score }
}

/**
 * Replay a record and call `onAsk` at every ask event with the asking seat's view at that moment
 * (the public log so far, the sorted hand, the counts, the score, the resolved half-suits), the event,
 * its index and the tracked hands. The walk checks every recorded hit against the deal it tracks.
 */
export function walkAsks(rec, onAsk) {
  const hands = rec.hands0.map((h) => [...h])
  const seatOf = new Map()
  rec.hands0.forEach((h, x) => h.forEach((c) => seatOf.set(c, x)))
  const resolved = {}
  const awarded = [0, 0]
  for (let i = 0; i < rec.events.length; i++) {
    const ev = rec.events[i]
    if (ev.type === 'ask') {
      const truth = seatOf.get(ev.card) === ev.target
      if (truth !== ev.hit) throw new Error(`${rec.label}: event ${i} says hit=${ev.hit} but the tracked deal says ${truth}`)
      const state = {
        config: us54Config, seed: rec.label, phase: 'playing', turn: ev.asker,
        hands: hands.map((h, x) => (x === ev.asker ? CARDS.sortHand(h, us54Config) : [...h])),
        books: { ...resolved }, score: [awarded[0], awarded[1]],
        log: rec.events.slice(0, i), moveIndex: i,
      }
      onAsk({ i, ev, view: seatView(state, ev.asker), state, hands, resolved, awarded })
      if (ev.hit) { hands[ev.target] = hands[ev.target].filter((d) => d !== ev.card); hands[ev.asker].push(ev.card); seatOf.set(ev.card, ev.asker) }
    } else if (ev.type === 'claim') {
      resolved[ev.book] = { book: ev.book, outcome: ev.outcome, claimer: ev.claimer, assignments: ev.assignments, actualHolders: ev.actualHolders }
      awarded[ev.outcome === 'team0' ? 0 : 1]++
      for (const c of CARDS.bookCards(ev.book, us54Config)) { const x = seatOf.get(c); if (x !== undefined) hands[x] = hands[x].filter((d) => d !== c); seatOf.delete(c) }
    }
  }
}
