/**
 * probe-conceal-diag.mjs — scratch diagnostics for the conceal.ts broadcast term. NOT part of the
 * shipped lab.
 *
 * A win-rate number alone cannot distinguish "the mechanism is wrong" from "the mechanism never
 * fires", and CONCESSION.md §5 makes the point that a mechanism with no room to act must not be
 * reported as refuted. So this script instruments the term instead of scoring it:
 *
 *  - **live**    — decisions at which the charge is non-zero for at least one legal ask, i.e.
 *                  positions where an unpublished row-6 basis is on the table at all.
 *  - **changed** — decisions where the chosen ask actually differs from the one the same style
 *                  plays with the term switched off.
 *  - **price**   — the score the change cost, `s(off-arm favourite) - s(on-arm choice)` measured
 *                  on the OFF scoring. Zero means the choice was already free (CONCESSION.md §4's
 *                  "spend only the free choice"); positive means material was paid for silence.
 *  - **overlap** — decisions at which some ask carries BOTH a defusal credit and a concealment
 *                  charge, which is the position the two mechanisms arbitrate over, plus which of
 *                  them won it.
 *
 * The games are played by the ON arm throughout (all six seats), so the statistics describe the
 * positions a concealing table actually reaches rather than a counterfactual one.
 *
 * Usage: node scripts/probe-conceal-diag.mjs [GAMES] [STYLE] [LAMBDA] [BANK]
 */
import { newGame, reduce, seatView, us54Config, cardBook, rulesFor } from '../lib/engine/index.ts'
import { buildKnowledge, rankAsksWith, askHitProbability, refinedHitProbability } from '../lib/engine/bots/knowledge.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'
import { defusalActive, defusalBonus, logLicences } from '../lib/engine/bots/defuse.ts'
import { concealmentPenalty, ownCardsInBook } from '../lib/engine/bots/conceal.ts'
import { turnYield } from '../lib/engine/bots/threat.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 200)
const NAME = process.argv[3] ?? 'balanced'
const LAMBDA = Number(process.argv[4] ?? 1)
const BANK = process.argv[5] ?? 'diagA'

const OFF = Object.freeze({ ...STYLE_ROSTER[NAME] })
const ON = Object.freeze({ ...OFF, conceal: LAMBDA })

let askDecisions = 0, live = 0, changed = 0, freeChanges = 0
let pricePaid = 0, maxPrice = 0
let overlap = 0, defuseWon = 0, concealWon = 0
let exposureSum = 0, exposureN = 0

for (let g = 0; g < GAMES; g++) {
  let st = newGame(`${BANK}-${g}`, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 6000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const ordinaryAsk =
      rulesFor(view.config).declareTiming === 'anyTime' && view.phase === 'playing' && !view.declareWindow
    if (ordinaryAsk) {
      const k = buildKnowledge(view, { useConstraints: true })
      const ranked = rankAsksWith(view, k, ON)
      if (ranked.length > 0) {
        askDecisions++
        const E = turnYield(view)
        const lic = logLicences(view, k)
        const defusingHere = defusalActive(view, ON)
        // The OFF-arm score, verbatim from decide.ts `pickAsk` at hard skill.
        const scoreOff = (r) => {
          const base = askHitProbability(k, r.card, r.target)
          const refined = refinedHitProbability(k, r.card, r.target)
          const bonus = defusingHere ? defusalBonus(view, k, OFF, r, refined, E, lic) : 0
          return r.score + OFF.wHit * (refined - base) + bonus
        }
        let anyCharge = false, anyOverlap = false
        for (const r of ranked) {
          const charge = concealmentPenalty(view, k, ON, r, E, lic)
          if (charge > 0) {
            anyCharge = true
            exposureSum += ownCardsInBook(view, cardBook(r.card))
            exposureN++
            const refined = refinedHitProbability(k, r.card, r.target)
            if (defusingHere && defusalBonus(view, k, ON, r, refined, E, lic) > 0) anyOverlap = true
          }
        }
        if (anyCharge) live++
        if (anyOverlap) overlap++
        const aOn = decide(view, ON, steps)
        const aOff = decide(view, OFF, steps)
        if (aOn.type === 'ask' && aOff.type === 'ask' && (aOn.card !== aOff.card || aOn.target !== aOff.target)) {
          changed++
          const on = ranked.find((r) => r.card === aOn.card && r.target === aOn.target)
          const off = ranked.find((r) => r.card === aOff.card && r.target === aOff.target)
          if (on && off) {
            const p = scoreOff(off) - scoreOff(on)
            pricePaid += p
            if (p > maxPrice) maxPrice = p
            if (p <= 1e-9) freeChanges++
          }
          if (anyOverlap) concealWon++
        } else if (anyOverlap) {
          defuseWon++
        }
      }
    }
    const r = reduce(st, decide(view, ON, steps))
    if (!r.ok) break
    st = r.state
    steps++
  }
}

const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`
console.log(`${NAME} conceal:${LAMBDA}, ${GAMES} games, bank ${BANK}`)
console.log(`  ordinary-ask decisions            ${askDecisions}`)
console.log(`  ... term live (some ask charged)  ${live} (${pct(live, askDecisions)})`)
console.log(`  ... decision actually changed     ${changed} (${pct(changed, live)} of live)`)
console.log(`  ... of those, free (price <= 0)   ${freeChanges} (${pct(freeChanges, changed)})`)
console.log(`  mean score price paid per change  ${(pricePaid / Math.max(1, changed)).toFixed(3)}  (max ${maxPrice.toFixed(3)}; wHit = ${ON.wHit})`)
console.log(`  mean own cards exposed per charge ${(exposureSum / Math.max(1, exposureN)).toFixed(2)}`)
console.log(`  defusal/concealment overlap       ${overlap} decisions (${pct(overlap, askDecisions)}); concealment won ${concealWon}, defusal won ${defuseWon}`)
