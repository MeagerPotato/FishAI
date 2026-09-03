/**
 * probe-closing.mjs - does the ask policy take the CLOSING ask when one exists?
 *
 *   node scripts/probe-closing.mjs [--games 100] [--version v0.4c] [--label pcl]
 *
 * A closing ask is a legal ask whose hit would leave every card of the book located on the
 * asker's team (own hand plus teammates' located cards): the set becomes a certain claim at the
 * next window. Mirror games under VERSION; at every ask decision: whether a closing ask exists,
 * whether the pick is one, the hit probability (the policy's own askHitProbability) of the best
 * closing ask against the pick's, and the truth - whether the best closing ask would have hit -
 * when the policy went elsewhere.
 */
import { pathToFileURL } from 'node:url'
const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const MON = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/monet.ts').href)
const KN = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/knowledge.ts').href)
const ST = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/style.ts').href)
const HL = await import(pathToFileURL(process.cwd() + '/lib/engine/helpers.ts').href)
const CARDS = await import(pathToFileURL(process.cwd() + '/lib/engine/cards.ts').href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, reduce, decide } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const GAMES = Number(argOf('--games', 100))
const VERSION = argOf('--version', 'v0.4c')
const LABEL = argOf('--label', 'pcl')
const pol = MON.monetPolicy(VERSION)
const { skill, style } = ST.resolvePolicy(pol)
const marginal = style.pModel === 'marginal'
const OPTS = { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal, choiceKappa: marginal ? style.choiceKappa : undefined, choiceAdapt: marginal ? style.choiceAdapt : undefined, choicePrior: marginal ? style.choicePrior : undefined }
const team = (seat) => seat % 2
const bookOf = (c) => CARDS.cardBook(c)
const BOOK_CARDS = new Map()
for (const c of CARDS.allCards(us54Config)) { const b = bookOf(c); if (!BOOK_CARDS.has(b)) BOOK_CARDS.set(b, []); BOOK_CARDS.get(b).push(c) }

let asks = 0, withClosing = 0, tookClosing = 0, tookOther = 0, otherWouldHit = 0, otherHitTruth = 0
let closingLaterClaimedByUs = 0, closingLaterLost = 0
const pBest = [], pPick = [], pPickWhenOther = [], pBestWhenOther = []
const t0 = Date.now()
for (let g = 0; g < GAMES; g++) {
  const label = `${LABEL}-${g}`
  let s = newGame(label, us54Config, 0)
  let n = 0
  while (s.phase !== 'finished' && n++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const seed = hashSeed(`${label}:${s.moveIndex}`)()
    const a = decide(view, pol, seed)
    if (a.type === 'ask') {
      asks++
      const k = KN.buildKnowledge(view, OPTS)
      const legal = HL.legalAsksFromView(view)
      // closing asks: every other card of the book is in the own hand or located with a teammate
      const closing = []
      for (const ask of legal) {
        const b = bookOf(ask.card)
        let ok = true
        for (const c of BOOK_CARDS.get(b)) {
          if (c === ask.card) continue
          if (view.hand.includes(c)) continue
          const h = k.holders[c]
          if (h === undefined || team(h) !== team(seat)) { ok = false; break }
        }
        if (ok) closing.push({ ...ask, p: KN.askHitProbability(k, ask.card, ask.target) })
      }
      const pickP = KN.askHitProbability(k, a.card, a.target)
      pPick.push(pickP)
      if (closing.length > 0) {
        withClosing++
        closing.sort((x, y) => y.p - x.p)
        const best = closing[0]
        pBest.push(best.p)
        const isClosing = closing.some((c) => c.card === a.card && c.target === a.target)
        if (isClosing) tookClosing++
        else {
          tookOther++
          pPickWhenOther.push(pickP)
          pBestWhenOther.push(best.p)
          const holder = s.hands.findIndex((h) => h.includes(best.card))
          if (holder === best.target) otherWouldHit++
          const pickHolder = s.hands.findIndex((h) => h.includes(a.card))
          if (pickHolder === a.target) otherHitTruth++
        }
      }
    }
    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${label}: ${r.error.code} at ${s.moveIndex}`)
    s = r.state
  }
}
const mean = (xs) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) : NaN
const secs = (Date.now() - t0) / 1000
console.log(`=== probe-closing: ${VERSION}, ${GAMES} mirror games (${LABEL}-*), ${secs.toFixed(1)}s ===`)
console.log(`ask decisions ${asks}; a closing ask existed at ${withClosing} (${(100 * withClosing / asks).toFixed(1)}%, ${(withClosing / GAMES).toFixed(2)} a game)`)
console.log(`when one existed: the policy took a closing ask ${tookClosing} times (${(100 * tookClosing / Math.max(1, withClosing)).toFixed(1)}%), went elsewhere ${tookOther}`)
console.log(`mean pHit: best closing ask ${mean(pBest).toFixed(3)} vs the pick ${mean(pPick).toFixed(3)} overall; when the policy went elsewhere: pick ${mean(pPickWhenOther).toFixed(3)} vs the best closing ask ${mean(pBestWhenOther).toFixed(3)}`)
console.log(`when it went elsewhere: the best closing ask would truly have hit ${(100 * otherWouldHit / Math.max(1, tookOther)).toFixed(1)}%; the pick truly hit ${(100 * otherHitTruth / Math.max(1, tookOther)).toFixed(1)}%`)
