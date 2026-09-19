/**
 * r1-forced-endgame.mjs: ATHENA.md §8.6 R1, the forced endgame (brief B.7.1) reduced to what the records can answer.
 *
 *     node scripts/athena/r1-forced-endgame.mjs [--records DIR] [--prefix panel-sestina-] [--cap 1000000]
 *         [--json out.json] [--cases out.jsonl]
 *
 * For every forced declare (record event kind 3) in the files, from the DECLARER's view at that moment (its hand, the
 * public log so far under the bridge's reduced reveal, the counts, the resolved sets):
 *
 * 1. **The deals.** Every placement of the live cards whose holder the view does not fix, consistent with the view's
 *    rules-derived facts (`buildKnowledge(view)`, the full log with its constraints: each card at one of its candidate
 *    seats, each seat's unknown slots filled exactly, every surviving "holds at least one of" constraint met). A case
 *    of more than `--cap` (10^6) deals is skipped and counted.
 * 2. **The assignments.** Under a uniform prior over those deals, an assignment of the set's six cards to seats has
 *    the probability of the deals that put every card where it says. The most probable one is the argmax over the
 *    set's own cards (ties kept as a set).
 * 3. **The comparison.** Was the declared assignment among the most probable; the probability given up
 *    (max - declared); and the bound's two counts, per case:
 *    - a: the declared assignment was wrong, and a most probable one would have been right (the truth is in the
 *      argmax), the declared one not being in the argmax;
 *    - b: the declared assignment was right, and no most probable one was (the declared one not in the argmax).
 *    Where the declared assignment is in the argmax the enumerator could have played it, so neither counts. Counting a
 *    when ANY tied maximum is right and b only when none is makes (a - b) an upper bound.
 *
 * The report splits the declares by side (the record's arm A, Monet, against arm B, SESTINA) and before/after the
 * clinch (either team at five sets before the declare), and gives the bound per game, (a - b) / games. The rule
 * registered (§8.6): below 0.1 sets a game closes B.7.1.
 *
 * The facts are knowledge.ts's, which are sound but not complete (they keep "at least one of" constraints and the
 * counts of the current position, not every historical count), so the deals enumerated are a superset of the deals a
 * perfect reasoner would keep. That is stated beside the result.
 */
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const ENG = await import(pathToFileURL(ROOT + '/lib/engine/index.ts').href)
const CARDS = await import(pathToFileURL(ROOT + '/lib/engine/cards.ts').href)
const KN = await import(pathToFileURL(ROOT + '/lib/engine/bots/knowledge.ts').href)
const BR = await import(pathToFileURL(ROOT + '/scripts/bridge-records.mjs').href)
const { us54Config, seatView } = ENG

const argOf = (f, d) => {
  const i = process.argv.indexOf(f)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : d
}
const DIR = argOf('--records', 'C:/Projects/FishAI-bench/bridge/monet-v55/records')
const PREFIX = argOf('--prefix', 'panel-sestina-')
const CAP = Number(argOf('--cap', 1_000_000))
const JSON_OUT = argOf('--json', '')
const CASES_OUT = argOf('--cases', '')
const team = (s) => s % 2

/**
 * Enumerate the placements of `unknown` cards (S's unknown cards first) and tally them by the pattern of S's unknown
 * cards. Returns {total, tally: Map<patternKey, count>} or {total: > cap, skipped: true}.
 */
function enumerate(k, setUnknown, restUnknown) {
  const cards = [...setUnknown, ...restUnknown]
  const cands = cards.map((c) => k.cands[c])
  const cap = k.unknownSlots.map((x) => x)
  const consOf = cards.map(() => [])
  // A constraint naming a card that has left play unrevealed (a wrong declare under the reduced reveal) cannot be
  // checked on the live placement: that card's deal holder may satisfy it. It is dropped, which keeps the deals a
  // superset of the consistent ones; the drops are counted.
  const gone = new Set(k.gone)
  const live = k.constraints.filter((q) => {
    for (const c of q.cards) {
      if (cards.includes(c)) continue
      if (gone.has(c)) return false
      throw new Error(`constraint card ${c} is neither unknown nor gone`)
    }
    return true
  })
  const dropped = k.constraints.length - live.length
  const cons = live.map((q, j) => {
    for (const c of q.cards) consOf[cards.indexOf(c)].push(j)
    return { seat: q.seat, left: q.cards.length, sat: 0 }
  })
  const pat = new Array(setUnknown.length).fill(-1)
  const tally = new Map()
  let total = 0
  let over = false
  const m = setUnknown.length
  // completions of cards[i..] (the non-set part), counted; aborts once the grand total passes the cap
  const rest = (i) => {
    if (over) return 0
    if (i === cards.length) return 1
    let n = 0
    for (const s of cands[i]) {
      if (cap[s] <= 0) continue
      cap[s]--
      let ok = true
      for (const j of consOf[i]) {
        const q = cons[j]
        q.left--
        if (q.seat === s) q.sat++
        if (q.left === 0 && q.sat === 0) ok = false
      }
      if (ok) n += rest(i + 1)
      for (const j of consOf[i]) {
        const q = cons[j]
        q.left++
        if (q.seat === s) q.sat--
      }
      cap[s]++
      if (total + n > CAP) {
        over = true
        return n
      }
    }
    return n
  }
  const head = (i) => {
    if (over) return
    if (i === m) {
      const n = rest(m)
      if (n > 0) {
        const key = pat.join(',')
        tally.set(key, (tally.get(key) ?? 0) + n)
        total += n
        if (total > CAP) over = true
      }
      return
    }
    for (const s of cands[i]) {
      if (cap[s] <= 0) continue
      cap[s]--
      let ok = true
      for (const j of consOf[i]) {
        const q = cons[j]
        q.left--
        if (q.seat === s) q.sat++
        if (q.left === 0 && q.sat === 0) ok = false
      }
      pat[i] = s
      if (ok) head(i + 1)
      for (const j of consOf[i]) {
        const q = cons[j]
        q.left++
        if (q.seat === s) q.sat--
      }
      cap[s]++
      if (over) return
    }
  }
  head(0)
  return over ? { total, skipped: true, dropped } : { total, tally, skipped: false, dropped }
}

const cases = []
const files = BR.recordFiles(DIR, PREFIX)
let games = 0
const t0 = Date.now()
for (const file of files) {
  for (const rec of BR.readRecordFile(file)) {
    games++
    const hands = rec.hands0.map((h) => [...h])
    const seatOf = new Map()
    rec.hands0.forEach((h, x) => h.forEach((c) => seatOf.set(c, x)))
    const resolved = {}
    const awarded = [0, 0]
    for (let i = 0; i < rec.events.length; i++) {
      const ev = rec.events[i]
      if (ev.type === 'ask') {
        if (ev.hit) {
          hands[ev.target] = hands[ev.target].filter((d) => d !== ev.card)
          hands[ev.asker].push(ev.card)
          seatOf.set(ev.card, ev.asker)
        }
        continue
      }
      if (ev.type !== 'claim') continue
      if (ev.forced) {
        const d = ev.claimer
        const state = {
          config: us54Config, seed: rec.label, phase: 'playing', turn: d,
          hands: hands.map((h, x) => (x === d ? CARDS.sortHand(h, us54Config) : [...h])),
          books: { ...resolved }, score: [awarded[0], awarded[1]],
          log: rec.events.slice(0, i), moveIndex: i,
        }
        const view = seatView(state, d)
        const k = KN.buildKnowledge(view)
        const setCards = CARDS.bookCards(ev.book, us54Config)
        const truth = Object.fromEntries(setCards.map((c) => [c, seatOf.get(c)]))
        const declaredRight = setCards.every((c) => ev.assignments[c] === truth[c])
        const outcomeRight = ev.outcome === `team${team(d)}`
        if (declaredRight !== outcomeRight) throw new Error(`${rec.label} event ${i}: the tracked deal says right=${declaredRight}, the record ${outcomeRight}`)
        // the facts must hold the truth: every certain holder true, every true holder a candidate
        for (const c of setCards) {
          const cs = k.cands[c] ?? []
          if (!cs.includes(truth[c])) throw new Error(`${rec.label} event ${i}: ${c}'s true holder ${truth[c]} is not a candidate (${cs})`)
        }
        const setUnknown = setCards.filter((c) => (k.cands[c] ?? []).length > 1)
        const restUnknown = Object.keys(k.cands).filter((c) => k.cands[c].length > 1 && !setCards.includes(c))
        restUnknown.sort((x, y) => k.cands[x].length - k.cands[y].length)
        const knownOk = setCards.every((c) => (k.cands[c] ?? []).length > 1 || ev.assignments[c] === k.holders[c])
        const knownOnTeam = setCards.every((c) => (k.cands[c] ?? []).length > 1 || team(k.holders[c]) === team(d))
        const side = team(d) === rec.teamA ? 'monet' : 'sestina'
        const preClinch = awarded[0] < 5 && awarded[1] < 5
        const e = enumerate(k, setUnknown, restUnknown)
        const row = {
          label: rec.label, event: i, side, declarer: d, book: ev.book, preClinch, declaredRight,
          setUnknown: setUnknown.length, unknown: setUnknown.length + restUnknown.length, constraints: k.constraints.length,
          deals: e.total, skipped: e.skipped, droppedConstraints: e.dropped,
        }
        if (!e.skipped) {
          let max = 0
          for (const [key, n] of e.tally) {
            const seats = key === '' ? [] : key.split(',').map(Number)
            if (seats.every((s) => team(s) === team(d)) && n > max) max = n
          }
          const declKey = setUnknown.map((c) => ev.assignments[c]).join(',')
          const truthKey = setUnknown.map((c) => truth[c]).join(',')
          const nDecl = knownOk ? (e.tally.get(declKey) ?? 0) : 0
          const nTruth = e.tally.get(truthKey) ?? 0
          if (!(nTruth > 0)) throw new Error(`${rec.label} event ${i}: the true placement is not among the enumerated deals`)
          const declaredIsMax = knownOnTeam && nDecl === max && max > 0
          const truthIsMax = knownOnTeam && nTruth === max
          row.pDeclared = nDecl / e.total
          row.pMax = knownOnTeam ? max / e.total : 0
          row.declaredIsMax = declaredIsMax
          row.truthIsMax = truthIsMax
          row.ties = [...e.tally.values()].filter((n) => n === max).length
          row.a = !declaredIsMax && !declaredRight && truthIsMax ? 1 : 0
          row.b = !declaredIsMax && declaredRight && !truthIsMax ? 1 : 0
        }
        cases.push(row)
      }
      resolved[ev.book] = { book: ev.book, outcome: ev.outcome, claimer: ev.claimer, assignments: ev.assignments, actualHolders: ev.actualHolders }
      awarded[ev.outcome === 'team0' ? 0 : 1]++
      for (const c of CARDS.bookCards(ev.book, us54Config)) {
        const x = seatOf.get(c)
        if (x !== undefined) hands[x] = hands[x].filter((dd) => dd !== c)
        seatOf.delete(c)
      }
    }
  }
}
const secs = (Date.now() - t0) / 1000

const summarise = (rows) => {
  const done = rows.filter((r) => !r.skipped)
  const n = done.length
  const sum = (f) => done.reduce((x, r) => x + f(r), 0)
  const a = sum((r) => r.a)
  const b = sum((r) => r.b)
  return {
    declares: rows.length,
    right: rows.filter((r) => r.declaredRight).length,
    skipped: rows.length - n,
    enumerated: n,
    declaredIsMax: sum((r) => (r.declaredIsMax ? 1 : 0)),
    uniqueMax: sum((r) => (r.ties === 1 ? 1 : 0)),
    declaredIsUniqueMax: sum((r) => (r.ties === 1 && r.declaredIsMax ? 1 : 0)),
    meanGivenUp: n ? sum((r) => r.pMax - r.pDeclared) / n : NaN,
    meanPDeclared: n ? sum((r) => r.pDeclared) / n : NaN,
    meanPMax: n ? sum((r) => r.pMax) / n : NaN,
    maxRightEnumerated: sum((r) => (r.truthIsMax ? 1 : 0)),
    a,
    b,
    boundPerGame: (a - b) / games,
    meanDeals: n ? sum((r) => r.deals) / n : NaN,
    maxDeals: done.reduce((x, r) => Math.max(x, r.deals), 0),
    withDroppedConstraint: rows.filter((r) => r.droppedConstraints > 0).length,
  }
}
const groups = {
  all: cases,
  monet: cases.filter((r) => r.side === 'monet'),
  sestina: cases.filter((r) => r.side === 'sestina'),
  'monet pre-clinch': cases.filter((r) => r.side === 'monet' && r.preClinch),
  'sestina pre-clinch': cases.filter((r) => r.side === 'sestina' && r.preClinch),
}
const out = { files: files.length, games, cap: CAP, secs, groups: {} }
console.log(`=== R1, the forced endgame (ATHENA.md 8.6): ${files.length} files, ${games} games, cap ${CAP} deals, ${secs.toFixed(1)} s ===`)
console.log('| group | declares | right | skipped (> cap) | enumerated | declared = most probable | mean P given up | mean P(declared) | mean P(max) | a | b | bound (a - b) / games |')
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for (const [name, rows] of Object.entries(groups)) {
  const s = summarise(rows)
  out.groups[name] = s
  console.log(`| ${name} | ${s.declares} | ${s.right} (${((100 * s.right) / Math.max(1, s.declares)).toFixed(2)}%) | ${s.skipped} | ${s.enumerated} | ${s.declaredIsMax} (${((100 * s.declaredIsMax) / Math.max(1, s.enumerated)).toFixed(2)}%) | ${s.meanGivenUp.toFixed(4)} | ${s.meanPDeclared.toFixed(4)} | ${s.meanPMax.toFixed(4)} | ${s.a} | ${s.b} | ${s.boundPerGame.toFixed(5)} |`)
}
const verdict = Math.max(out.groups.monet.boundPerGame, out.groups.sestina.boundPerGame, out.groups.all.boundPerGame) < 0.1
console.log('')
console.log('| group | cases with one most probable assignment | declared = it | mean deals | most deals | cases with a constraint dropped (a card left play unrevealed) |')
console.log('|---|---:|---:|---:|---:|---:|')
for (const name of Object.keys(groups)) {
  const s = out.groups[name]
  console.log(`| ${name} | ${s.uniqueMax} | ${s.declaredIsUniqueMax} (${((100 * s.declaredIsUniqueMax) / Math.max(1, s.uniqueMax)).toFixed(2)}%) | ${s.meanDeals.toFixed(2)} | ${s.maxDeals} | ${s.withDroppedConstraint} |`)
}
console.log(`decision (8.6): the bound is ${verdict ? 'below' : 'NOT below'} 0.1 sets a game on every group, so B.7.1 is ${verdict ? 'CLOSED as a lever for P2 and P3' : 'open: P3 may register an enumerator'}`)
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 2))
if (CASES_OUT) fs.writeFileSync(CASES_OUT, cases.map((r) => JSON.stringify(r)).join('\n') + '\n')
