#!/usr/bin/env node
/**
 * probe-reveal-fire.mjs - MONET.md 3.7 item 1's firing diagnostic, with ground truth at home: when
 * the reveal ask fires, was the set really on the team, was the split the simulation assumed the
 * real one, did a teammate cash the set at the next window, and what would the base's ask have done?
 *
 *   node scripts/probe-reveal-fire.mjs [--override '{"reveal":2,"revealFar":0.25}'] [--games 200] [--seeds fire]
 *
 * Mirror games of v0.4c with the override; every 'reveal-ask' decision is re-derived by `revealAsk`
 * (deterministic) to read its arithmetic, scored against the true hands, and followed to the set's
 * resolution. Nothing here is a policy.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const CARDS = await import(pathToFileURL(join(ROOT, 'lib/engine/cards.ts')).href)
const KNOW = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/knowledge.ts')).href)
const REV = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/reveal.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, decide, decideExplained, reduce } = ENG
const { bookCards, seatTeam } = CARDS

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const override = JSON.parse(argOf('--override', '{"reveal":2,"revealFar":0.25}'))
const games = Number(argOf('--games', 200))
const seeds = argOf('--seeds', 'fire').split(',')
const base = MON.monetPolicy('v0.4c')
const policy = { skill: base.skill, style: { ...base.style, ...override } }
const opts = { logWindow: base.skill.logWindow, useConstraints: base.skill.useConstraints }
const optsModel = { ...opts, marginal: base.style.pModel === 'marginal' }

const holder = (s, c) => s.hands.findIndex((h) => h.includes(c))
const A = {
  games: 0, decisions: 0, fired: 0, clinchFired: 0,
  locked: 0, splitRight: 0, hit: 0, pLockSum: 0, pHitSum: 0, valueSum: 0,
  cashedNext: 0, cashedBy3: 0, cashedEver: 0, lostToOpp: 0, never: 0,
  baseWouldHit: 0, baseSame: 0,
  proverCashed: 0, otherMateCashed: 0, selfCashed: 0,
  eventsToCash: [],
  bins: Array.from({ length: 10 }, () => ({ n: 0, locked: 0, split: 0, next: 0, hit: 0, baseHit: 0, own: 0 })),
  winsArm: 0, // unused (mirror)
}
const pending = [] // {book, team, prover, at, windows}
const t0 = Date.now()
for (const s0 of seeds) {
  for (let g = 0; g < games; g++) {
    const seed = `${s0}-${g}`
    let s = newGame(seed, us54Config, g % 6)
    let steps = 0
    const open = []
    let windowsSeen = 0
    while (s.phase !== 'finished' && steps++ < 5000) {
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
      const d = decideExplained(view, policy, moveSeed)
      const a = d.action
      A.decisions++
      if (view.declareWindow) windowsSeen++
      if (d.trace && d.trace.kind === 'reveal-ask') {
        const k = KNOW.buildKnowledge(view, optsModel)
        const rv = REV.revealAsk(view, k, policy.style, opts)
        if (!rv || rv.card !== a.card || rv.target !== a.target) throw new Error(`${seed}: reveal re-derivation differs`)
        A.fired++
        if (rv.urgency >= 1) A.clinchFired++
        const team = seatTeam(seat)
        const cards = bookCards(rv.book, us54Config)
        const locked = cards.every((c) => seatTeam(holder(s, c)) === team)
        const proverHolds = cards.filter((c) => s.hands[rv.prover].includes(c))
        const splitRight = proverHolds.length === rv.assumed.length && proverHolds.every((c) => rv.assumed.includes(c))
        const hit = s.hands[rv.target].includes(rv.card)
        if (locked) A.locked++
        if (locked && splitRight) A.splitRight++
        if (hit) A.hit++
        A.pLockSum += rv.pLock
        A.pHitSum += rv.pHit
        A.valueSum += rv.value
        const b = decide(view, base, moveSeed)
        if (b.type === 'ask') {
          if (b.card === a.card && b.target === a.target) A.baseSame++
          if (s.hands[b.target].includes(b.card)) A.baseWouldHit++
        }
        const bin = A.bins[Math.min(9, Math.floor(rv.pLock * 10))]
        bin.n++
        if (locked) bin.locked++
        if (locked && splitRight) bin.split++
        if (hit) bin.hit++
        if (b.type === 'ask' && s.hands[b.target].includes(b.card)) bin.baseHit++
        bin.own += cards.filter((c) => s.hands[seat].includes(c)).length
        open.push({ book: rv.book, team, prover: rv.prover, seat, at: s.moveIndex, windowsAt: windowsSeen, locked, splitRight, bin })
      }
      const r = reduce(s, a)
      if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
      const before = s
      s = r.state
      // resolutions since the last step
      for (let i = open.length - 1; i >= 0; i--) {
        const o = open[i]
        const res = s.books[o.book]
        if (!res || before.books[o.book]) continue
        const byTeam = res.outcome !== 'void' && (res.outcome === 'team0' ? 0 : 1) === o.team
        if (byTeam) {
          A.cashedEver++
          const dw = windowsSeen - o.windowsAt
          if (dw <= 1) {
            A.cashedNext++
            o.bin.next++
          }
          if (dw <= 3) A.cashedBy3++
          A.eventsToCash.push(s.moveIndex - o.at)
          const claimer = res.claimer ?? (a.type === 'claim' ? a.seat : -1)
          if (claimer === o.prover) A.proverCashed++
          else if (claimer === o.seat) A.selfCashed++
          else A.otherMateCashed++
        } else {
          A.lostToOpp++
        }
        open.splice(i, 1)
      }
    }
    A.never += open.length
    A.games++
  }
}
const pct = (x, n) => (n > 0 ? ((100 * x) / n).toFixed(1) + '%' : 'n/a')
const mean = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : 'n/a')
console.log(`=== reveal firing: v0.4c + ${JSON.stringify(override)}, seeds ${seeds.join(',')} x ${games} (${A.games} games, ${A.decisions} decisions), ${((Date.now() - t0) / 1000).toFixed(1)}s ===`)
console.log(`reveal asks fired      ${A.fired}  (${(A.fired / Math.max(1, A.games)).toFixed(3)} per game; at the clinch ${A.clinchFired})`)
console.log(`  set really on team   ${pct(A.locked, A.fired)}   mean P(locked) believed ${(A.pLockSum / Math.max(1, A.fired)).toFixed(3)}`)
console.log(`  ...and split right   ${pct(A.splitRight, A.fired)} of fired (${pct(A.splitRight, A.locked)} of locked)`)
console.log(`  the ask HIT          ${pct(A.hit, A.fired)}   mean pHit believed ${(A.pHitSum / Math.max(1, A.fired)).toFixed(3)}   mean value ${(A.valueSum / Math.max(1, A.fired)).toFixed(3)}`)
console.log(`  base's ask same      ${pct(A.baseSame, A.fired)}   base's ask would hit ${pct(A.baseWouldHit, A.fired)}`)
console.log(`  cashed by team: next window ${pct(A.cashedNext, A.fired)}  within 3 windows ${pct(A.cashedBy3, A.fired)}  ever ${pct(A.cashedEver, A.fired)}  (by the prover ${A.proverCashed}, other mate ${A.otherMateCashed}, self ${A.selfCashed}); lost to opponents ${A.lostToOpp}; never resolved ${A.never}`)
console.log(`  events from ask to cash, mean ${mean(A.eventsToCash)}`)
console.log('  by P(locked) believed:  bin  n  locked%  split-right%  cashed-next%  hit%  base-hit%  own-cards')
for (let i = 0; i < 10; i++) {
  const b = A.bins[i]
  if (b.n === 0) continue
  console.log(`    [${(i / 10).toFixed(1)},${((i + 1) / 10).toFixed(1)})  ${String(b.n).padStart(5)}  ${pct(b.locked, b.n).padStart(6)}  ${pct(b.split, b.n).padStart(6)}  ${pct(b.next, b.n).padStart(6)}  ${pct(b.hit, b.n).padStart(6)}  ${pct(b.baseHit, b.n).padStart(6)}  ${(b.own / b.n).toFixed(2)}`)
}
