/**
 * probe-licence.mjs — scratch. Does conditioning on a published row-6 licence fix the +7.1pp
 * under-pricing the inference audit found?
 *
 * The audit measured: when the target has publicly asked into the set, refinedHitProbability
 * believes 0.347 and the truth is 0.418. The cause is named in threat.ts's header — knowledge.ts
 * DROPS a deal-time constraint the moment it is satisfied or exhausted, i.e. exactly when the seat
 * has been SHOWN to hold a card of the set, so the probability layer is blind where the evidence
 * is strongest. threat.ts already reads licences off the log for the threat side; this asks
 * whether the same reading fixes the probability side.
 *
 * The correction is a conditioning, not a fudge. A live licence in book B says the target holds at
 * least one unresolved card of B. Under the engine's own per-card estimates q_j, treating them as
 * independent:
 *
 *     P(c at t | at least one of B at t)  =  q_c / (1 - PROD_j (1 - q_j))
 *
 * which scales every card of B at that seat by one factor, and is exactly 1 when the engine
 * already believes the licence is satisfied.
 */
import { newGame, reduce, seatView, us54Config, bookCards, cardBook, allBooks } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { buildKnowledge, refinedHitProbability, holderOf } from '../lib/engine/bots/knowledge.ts'
import { legalAsksFromView } from '../lib/engine/helpers.ts'
import { seatLicences } from '../lib/engine/bots/threat.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 200)
const pol = STYLE_ROSTER.balanced

/** The licence-conditioned probability for one ask, or null when the licence is not live. */
function conditioned(view, k, card, target, lic) {
  const b = cardBook(card)
  if (!lic.has(b)) return null
  let prod = 1
  let anyCertain = false
  const members = bookCards(b, view.config)
  for (const j of members) {
    const h = holderOf(k, j)
    if (h === target) { anyCertain = true; break }
    if (h !== null) continue                    // certainly elsewhere: contributes nothing
    prod *= 1 - refinedHitProbability(k, j, target)
  }
  if (anyCertain) return null                   // the licence is already discharged in the model
  const Z = 1 - prod
  if (!(Z > 0.02)) return null                  // degenerate; leave the estimate alone
  return { q: refinedHitProbability(k, card, target), Z }
}

let nBase = 0, sBase = 0, hBase = 0
const LAMBDAS = [0, 0.25, 0.4, 0.5, 0.6, 0.75, 1]
let nCond = 0, hCond = 0, sSubBase = 0
const sByL = LAMBDAS.map(() => 0)
for (let g = 0; g < GAMES; g++) {
  let st = newGame(`lic-${g}`, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 4000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    if (!st.declareWindow && view.phase === 'playing') {
      const k = buildKnowledge(view, { useConstraints: true })
      const lic = new Map()
      for (const a of legalAsksFromView(view)) {
        if (!lic.has(a.target)) lic.set(a.target, seatLicences(view, k, a.target))
        const truth = st.hands[a.target].includes(a.card) ? 1 : 0
        const base = refinedHitProbability(k, a.card, a.target)
        nBase++; sBase += base; hBase += truth
        const c = conditioned(view, k, a.card, a.target, lic.get(a.target))
        if (c !== null) {
          nCond++; hCond += truth; sSubBase += base
          for (let i = 0; i < LAMBDAS.length; i++) sByL[i] += Math.min(1, c.q + LAMBDAS[i] * (c.q / c.Z - c.q))
        }
      }
    }
    const r = reduce(st, decide(view, pol, steps))
    if (!r.ok) break
    st = r.state
    steps++
  }
}
// recompute the base bias restricted to the same licensed subset for a like-for-like comparison
console.log(`licence conditioning — ${GAMES} us54 games, balanced/hard`)
console.log(`all scored asks         N=${nBase}  believed ${(sBase / nBase).toFixed(4)}  actual ${(hBase / nBase).toFixed(4)}  err ${((sBase - hBase) / nBase).toFixed(4)}`)
console.log(`licensed subset          N=${nCond}  actual ${(hCond / nCond).toFixed(4)}`)
for (let i = 0; i < LAMBDAS.length; i++) console.log(`  lambda ${LAMBDAS[i].toFixed(2)}  believed ${(sByL[i] / nCond).toFixed(4)}  err ${((sByL[i] - hCond) / nCond).toFixed(4)}`)
