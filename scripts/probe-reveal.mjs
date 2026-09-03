#!/usr/bin/env node
/**
 * probe-reveal.mjs — MONET.md §3.7 item 1's readout, with ground truth at home: how often can ONE
 * ask's publication ("the asker holds a card of this half-suit") let a teammate cash a set the team
 * already holds in full?
 *
 *   node scripts/probe-reveal.mjs [--version v0.4c] [--games 300] [--seeds reveal]
 *
 * Mirror games of `--version`. At every ask decision of seat A the true hands name the half-suits
 * LOCKED on A's team (all six cards in the team's three hands, unresolved). A locked set nobody on
 * the team can prove (`holders` known for all six, from that seat's own knowledge) is a LOCK HOLD in
 * progress — the population §3.4b's finding names. For each such set the ask A could make into it is
 * appended to the log as the miss it must be (opponents hold none of its cards), every teammate's
 * knowledge is rebuilt, and the readout asks: does some teammate now prove the set (assignment
 * certain), or does its best plan clear the speculative bar it plays (`declareThreshold`)? The ask
 * costs A the turn (a certain miss), so the tempo price is the best legal ask's hit probability,
 * forgone — printed beside the count.
 *
 * Nothing here is a policy. It sizes the channel §3.7 item 1 would build, and the pre-registration
 * writes the floor it must clear before the term is coded.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const CARDS = await import(pathToFileURL(join(ROOT, 'lib/engine/cards.ts')).href)
const KNOW = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/knowledge.ts')).href)
const DEC = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/decide.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const HELP = await import(pathToFileURL(join(ROOT, 'lib/engine/helpers.ts')).href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, decide, reduce } = ENG
const { allBooks, bookCards, cardBook, seatTeam } = CARDS
const { legalAsksFromView } = HELP

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const version = argOf('--version', 'v0.4c')
const games = Number(argOf('--games', 300))
const seeds = argOf('--seeds', 'reveal').split(',')
const policy = MON.monetPolicy(version)
const style = policy.style
const opts = { logWindow: policy.skill.logWindow, useConstraints: policy.skill.useConstraints, marginal: style.pModel === 'marginal' }
const bar = style.declareThreshold
const books = allBooks(us54Config)

function provable(k, seat, book) {
  const team = seatTeam(seat)
  for (const c of bookCards(book, us54Config)) {
    const h = k.holders[c]
    if (h === undefined || seatTeam(h) !== team) return false
  }
  return true
}
const teammates = (seat) => [0, 1, 2, 3, 4, 5].filter((s) => s !== seat && seatTeam(s) === seatTeam(seat))

const acc = {
  games: 0, askDecisions: 0,
  lockedSets: 0, // (decision, locked set) pairs
  unprovenSets: 0, // ...of which no teammate (A included) can prove
  askable: 0, // ...of which A holds a card and a legal ask exists into it
  alreadyPublic: 0, // ...of which A's licence is already public (a repeat ask adds nothing)
  proofCompleted: 0, // the ask makes some teammate's proof true
  barCleared: 0, // or lifts some teammate's best plan to >= bar (proof not required)
  priceSum: 0, priceN: 0, // best legal ask's p forgone, when an opportunity exists
  gamesWithOpportunity: 0,
}
const t0 = Date.now()
for (const s0 of seeds) {
  for (let g = 0; g < games; g++) {
    const seed = `${s0}-${g}`
    let s = newGame(seed, us54Config, g % 6)
    let steps = 0
    let anyOpp = false
    while (s.phase !== 'finished' && steps++ < 5000) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const action = decide(view, policy, hashSeed(`${seed}:${s.moveIndex}`)())
      if (!view.declareWindow && view.phase === 'playing' && action.type === 'ask') {
        acc.askDecisions++
        const team = seatTeam(seat)
        const mates = teammates(seat)
        const holder = (c) => s.hands.findIndex((h) => h.includes(c))
        // knowledge of every seat of the team, once per decision, lazily
        let kOf = null
        const knowledge = () => {
          if (!kOf) kOf = Object.fromEntries([seat, ...mates].map((x) => [x, KNOW.buildKnowledge(seatView(s, x), opts)]))
          return kOf
        }
        const legal = legalAsksFromView(view)
        let bestP = 0
        let bestPComputed = false
        for (const b of books) {
          if (s.books[b]) continue
          const cards = bookCards(b, us54Config)
          if (!cards.every((c) => seatTeam(holder(c)) === team)) continue
          acc.lockedSets++
          const ks = knowledge()
          if ([seat, ...mates].some((x) => provable(ks[x], x, b))) continue
          acc.unprovenSets++
          const intoB = legal.filter((a) => cardBook(a.card) === b)
          if (intoB.length === 0) continue
          acc.askable++
          // is A's licence in b already on the public record?
          const already = view.log.some((ev) => ev.type === 'ask' && ev.asker === seat && cardBook(ev.card) === b)
          if (already) { acc.alreadyPublic++; continue }
          // the publication: one ask into b by A, a miss (opponents hold none of b)
          const a = intoB[0]
          const ev = { type: 'ask', asker: seat, target: a.target, card: a.card, hit: false }
          let completed = false
          let cleared = false
          for (const m of mates) {
            const v2 = seatView(s, m)
            const k2 = KNOW.buildKnowledge({ ...v2, log: [...v2.log, ev] }, opts)
            if (provable(k2, m, b)) { completed = true; break }
            if (DEC.planClaimFor) {
              const plan = DEC.planClaimFor({ ...v2, log: [...v2.log, ev] }, policy, b)
              if (plan && plan.p >= bar && plan.uncertain.every((c) => (k2.cands[c] ?? []).every((x) => seatTeam(x) === team))) cleared = true
            }
          }
          if (completed) acc.proofCompleted++
          else if (cleared) acc.barCleared++
          if (completed || cleared) {
            anyOpp = true
            if (!bestPComputed) {
              const k = knowledge()[seat]
              for (const x of legal) bestP = Math.max(bestP, KNOW.askHitProbability(k, x.card, x.target))
              bestPComputed = true
            }
            acc.priceSum += bestP
            acc.priceN++
          }
        }
      }
      const r = reduce(s, action)
      if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
      s = r.state
    }
    acc.games++
    if (anyOpp) acc.gamesWithOpportunity++
  }
}
const f = (x, d = 4) => x.toFixed(d)
const per = (x) => f(x / Math.max(1, acc.games), 3)
console.log(`=== reveal readout: Monet ${version} mirror games, seeds ${seeds.join(',')} x ${games} (${acc.games} games, ${acc.askDecisions} ask decisions), bar ${bar}, ${((Date.now() - t0) / 1000).toFixed(1)}s ===`)
console.log(`locked (decision, set) pairs       ${acc.lockedSets}  (${per(acc.lockedSets)} per game)`)
console.log(`  no teammate can prove            ${acc.unprovenSets}  (${per(acc.unprovenSets)} per game)`)
console.log(`  ...and A can ask into it         ${acc.askable}  (${per(acc.askable)} per game)`)
console.log(`  ...licence already public        ${acc.alreadyPublic}`)
console.log(`  one ask COMPLETES a teammate's proof   ${acc.proofCompleted}  (${per(acc.proofCompleted)} per game)`)
console.log(`  one ask lifts a plan over the bar      ${acc.barCleared}  (${per(acc.barCleared)} per game)`)
console.log(`opportunities per game (either)    ${per(acc.proofCompleted + acc.barCleared)}   games with any: ${acc.gamesWithOpportunity}/${acc.games}`)
console.log(`tempo price at an opportunity      best legal ask p ${f(acc.priceSum / Math.max(1, acc.priceN))} forgone (n ${acc.priceN}), the reveal ask itself a certain miss`)
