#!/usr/bin/env node
/**
 * probe-handoff-declare.mjs — MONET.md §3.5a(b), the cross-seat handoff of a compelled
 * declaration, EMULATED at home on a Monet version.
 *
 *   node scripts/probe-handoff-declare.mjs [--version v0.4b] [--games 6000] [--horizon N] [--override JSON]
 *
 * MONET.md §3.7a item 2′: with `--horizon N` every WINDOW declaration made while the opponents
 * hold N cards or fewer is also scored against the true hands, by trace kind — the population the
 * pre-emptive declare acts on, and its accuracy is the item's marker; `--override` lays a JSON
 * object of style keys over the version's vector (the arm), printed in the header.
 *
 * At every COMPELLED declaration of `us54` mirror games — the trace says `must-declare` (a
 * window that can never close) or `forced-claim` (no legal ask, or the endgame) — the claim the
 * compelled seat made is scored against the true hands, and beside it the claim each teammate
 * WOULD make from its own view by `forcedClaim`'s own rule (highest p, then fewest guesses, then
 * set order). Four selectors are then priced: as shipped; the most-confident teammate; the
 * fewest-guesses teammate; the best of three (an oracle over the team's private views). The
 * believed p of the shipped claim is tabulated against its outcome by decile, which is the
 * forced branch's calibration.
 *
 * Emulation only. The engine never lets a teammate declare in the compelled seat's place (a claim
 * must come from the seat holding the option), so nothing here is a policy: it is the price of a
 * communication channel the rules do not provide. The compelled seat's own re-derived best plan
 * is printed as a control and must equal the as-shipped rate.
 *
 * Measured 2026-09-03 (MONET.md §3.5a's record): v0.2 43.55 → 76.29 → 88.55; v0.4a 39.46 → 70.61
 * → 83.37 (the drafts' 39.86 → 72.10 → 86.58 reproduced); v0.4b 47.81 → 77.63 → 90.62.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const DEC = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/decide.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const CARDS = await import(pathToFileURL(join(ROOT, 'lib/engine/cards.ts')).href)
const { newGame, us54Config, legalActionsSummary, seatView, hashSeed, decideExplained, reduce } = ENG
const { planClaimFor } = DEC

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const version = argOf('--version', 'v0.4b')
const games = Number(argOf('--games', 6000))
if (!MON.isMonetVersion(version)) {
  console.error(`--version must be one of ${MON.MONET_VERSION_IDS.join(', ')}; got ${JSON.stringify(version)}`)
  process.exit(2)
}
const horizon = Number(argOf('--horizon', 0))
const override = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const policy = override === null ? MON.monetPolicy(version) : { skill: MON.monetPolicy(version).skill, style: { ...MON.monetPolicy(version).style, ...override } }

const holderOf = (state, card) => state.hands.findIndex((h) => h.includes(card))
const correct = (state, claim) => CARDS.bookCards(claim.book, state.config).every((c) => holderOf(state, c) === claim.assignments[c])
/** `forcedClaim`'s rule, re-derived from a seat's own view: highest p, then fewest guesses, then set order. */
const bestPlanFor = (state, seat) => {
  const view = seatView(state, seat)
  let best = null
  for (const b of CARDS.allBooks(state.config)) {
    if (state.books[b]) continue
    const plan = planClaimFor(view, policy, b)
    if (best === null || plan.p > best.p || (plan.p === best.p && plan.uncertain.length < best.uncertain.length)) best = plan
  }
  return best
}

const H = {
  games,
  decisions: 0,
  compelled: 0,
  byKind: {},
  shipped: { n: 0, right: 0, believed: 0 },
  ownBest: { n: 0, right: 0 },
  mostConfident: { n: 0, right: 0, relocated: 0 },
  fewestGuesses: { n: 0, right: 0, relocated: 0 },
  bestOfThree: { n: 0, right: 0 },
  deciles: Array.from({ length: 10 }, () => ({ n: 0, b: 0, h: 0 })),
  near: {}, // kind -> { n, right, believed } for window declarations at opponents' cards <= horizon
  nearWindows: 0,
}
const oppCardsOf = (state, seat) => {
  const team = seat % 2
  let n = 0
  for (let x = 0; x < 6; x++) if (x % 2 !== team) n += state.hands[x].length
  return n
}
const t0 = Date.now()
for (let g = 0; g < games; g++) {
  const seed = `handoff-${version}-${g}`
  let s = newGame(seed, us54Config, 0)
  let steps = 0
  while (s.phase !== 'finished' && steps++ < 5000) {
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const moveSeed = hashSeed(`${seed}:${s.moveIndex}`)()
    const d = decideExplained(view, policy, moveSeed)
    const a = d.action
    H.decisions++
    const kind = d.trace && d.trace.kind !== undefined ? d.trace.kind : d.kind
    if (horizon > 0 && view.declareWindow && oppCardsOf(s, seat) <= horizon) {
      H.nearWindows++
      if (a.type === 'claim') {
        const row = H.near[kind] ?? (H.near[kind] = { n: 0, right: 0, believed: 0 })
        row.n++
        if (correct(s, a)) row.right++
        const pp = d.trace && d.trace.claim ? d.trace.claim.p : NaN
        if (Number.isFinite(pp)) row.believed += pp
      }
    }
    if (a.type === 'claim' && (kind === 'must-declare' || kind === 'forced-claim')) {
      H.compelled++
      H.byKind[kind] = (H.byKind[kind] || 0) + 1
      const shippedRight = correct(s, a)
      const p = d.trace && d.trace.claim ? d.trace.claim.p : NaN
      H.shipped.n++
      if (shippedRight) H.shipped.right++
      if (Number.isFinite(p)) {
        H.shipped.believed += p
        const dec = Math.min(9, Math.floor(p * 10))
        H.deciles[dec].n++
        H.deciles[dec].b += p
        if (shippedRight) H.deciles[dec].h++
      }
      const team = [seat % 2, (seat % 2) + 2, (seat % 2) + 4]
      const plans = team.map((m) => ({ seat: m, plan: bestPlanFor(s, m) })).filter((x) => x.plan !== null)
      if (plans.length === 3) {
        const rightOf = (x) => correct(s, { book: x.plan.book, assignments: x.plan.assignments })
        const own = plans.find((x) => x.seat === seat)
        H.ownBest.n++
        if (rightOf(own)) H.ownBest.right++
        let mc = plans[0]
        for (const x of plans) if (x.plan.p > mc.plan.p) mc = x
        H.mostConfident.n++
        if (rightOf(mc)) H.mostConfident.right++
        if (mc.seat !== seat) H.mostConfident.relocated++
        let fg = plans[0]
        for (const x of plans) {
          if (x.plan.uncertain.length < fg.plan.uncertain.length || (x.plan.uncertain.length === fg.plan.uncertain.length && x.plan.p > fg.plan.p)) fg = x
        }
        H.fewestGuesses.n++
        if (rightOf(fg)) H.fewestGuesses.right++
        if (fg.seat !== seat) H.fewestGuesses.relocated++
        H.bestOfThree.n++
        if (plans.some(rightOf)) H.bestOfThree.right++
      }
    }
    const r = reduce(s, a)
    if (!r.ok) throw new Error(`${seed}: ${r.error.code}`)
    s = r.state
  }
}
const pct = (x, n) => (n > 0 ? ((100 * x) / n).toFixed(2) : 'n/a')
console.log(`=== handoff emulation: Monet ${version}${override === null ? '' : ' + ' + JSON.stringify(override)}, ${games} us54 mirror games, ${H.decisions} decisions, ${H.compelled} compelled declarations ${JSON.stringify(H.byKind)}, ${((Date.now() - t0) / 1000).toFixed(1)}s ===`)
if (horizon > 0) {
  console.log(`window declarations with the opponents at <= ${horizon} cards (${H.nearWindows} such window decisions):`)
  let tn = 0
  let tr = 0
  for (const [kind, row] of Object.entries(H.near).sort()) {
    tn += row.n
    tr += row.right
    console.log(`  ${kind.padEnd(16)} n=${String(row.n).padStart(5)}  right ${pct(row.right, row.n)}%  believed mean ${(row.believed / Math.max(1, row.n)).toFixed(4)}  (${(row.n / games).toFixed(3)} per game)`)
  }
  console.log(`  ${'all'.padEnd(16)} n=${String(tn).padStart(5)}  right ${pct(tr, tn)}%  (${(tn / games).toFixed(3)} per game)`)
}
console.log(`as shipped         ${pct(H.shipped.right, H.shipped.n)}%  (n=${H.shipped.n}, believed mean ${(H.shipped.believed / Math.max(1, H.shipped.n)).toFixed(4)})`)
console.log(`own best plan      ${pct(H.ownBest.right, H.ownBest.n)}%  (the compelled seat's forcedClaim rule re-derived; the control — must equal as-shipped)`)
console.log(`most-confident     ${pct(H.mostConfident.right, H.mostConfident.n)}%  relocated ${pct(H.mostConfident.relocated, H.mostConfident.n)}%`)
console.log(`fewest-guesses     ${pct(H.fewestGuesses.right, H.fewestGuesses.n)}%  relocated ${pct(H.fewestGuesses.relocated, H.fewestGuesses.n)}%`)
console.log(`best of three      ${pct(H.bestOfThree.right, H.bestOfThree.n)}%`)
console.log('believed vs realised on the shipped compelled claims, by decile:')
for (let i = 0; i < 10; i++) {
  const d = H.deciles[i]
  if (d.n === 0) continue
  console.log(`  [${(i / 10).toFixed(1)},${((i + 1) / 10).toFixed(1)})  n=${String(d.n).padStart(5)}  believed ${(d.b / d.n).toFixed(4)}  realised ${(d.h / d.n).toFixed(4)}  bias ${(d.b / d.n - d.h / d.n).toFixed(4)}`)
}
if (H.ownBest.n > 0 && H.ownBest.right !== H.shipped.right) {
  console.log(`CONTROL FAILED: own best plan ${H.ownBest.right} right vs as shipped ${H.shipped.right} — the re-derived rule is not the shipped one`)
  process.exit(1)
}
