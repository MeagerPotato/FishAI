/**
 * REQUIRES A REVERTED KNOB. This probe measures `style.aimThreat`, a boolean added to
 * StyleParams during the CONCESSION.md investigation and REVERTED after it measured inert
 * (-0.045 +/- 0.130 over 400 duplicate pairs; see CONCESSION.md section 6). To re-run it, re-add:
 *   - `aimThreat: boolean` to StyleParams and `aimThreat: false` to BASELINE in style.ts;
 *   - in contained.ts, have `aimedTarget` rank opponents by ascending `seatThreat(view,k,s).prey`
 *     (hand size breaking exact ties) when the knob is set, and have `valueContainedPass` price a
 *     conceded turn as `E * (1 + (perPrey/base) * prey)` instead of `perCard * n_t`.
 * Without that knob the object spread below is inert and both arms are identical.
 */
/** probe-aimdiag.mjs — how often does the contained pass fire, and how often does the aim differ? */
import { newGame, reduce, seatView, us54Config, seatTeam, ALL_SEATS } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { planContainedPass } from '../lib/engine/bots/contained.ts'
import { buildKnowledge } from '../lib/engine/bots/knowledge.ts'
import { seatThreat } from '../lib/engine/bots/threat.ts'
import { rankAsksWith } from '../lib/engine/bots/knowledge.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'
import { SKILL_PRESETS } from '../lib/engine/bots/style.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 300)
const base = STYLE_ROSTER.balanced
const ON = { ...base, aimThreat: true }
const OFF = { ...base, aimThreat: false }
const skill = SKILL_PRESETS.hard

let decisions = 0, planOff = 0, planOn = 0, aimDiffers = 0, fireDiffers = 0
let oppPool2 = 0
for (let g = 0; g < GAMES; g++) {
  let st = newGame(`aimdiag-${g}`, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 4000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    if (view.phase === 'playing' && !view.declareWindow) {
      try {
        const k = buildKnowledge(view, { useConstraints: true })
        const ranked = rankAsksWith(view, k)
        if (ranked.length > 0) {
          decisions++
          const myTeam = seatTeam(seat)
          const pool = ALL_SEATS.filter((s) => seatTeam(s) !== myTeam && view.counts[s] > 0)
          if (pool.length > 1) oppPool2++
          const a = planContainedPass(view, k, OFF, skill, ranked[0])
          const b = planContainedPass(view, k, ON, skill, ranked[0])
          if (a) planOff++
          if (b) planOn++
          if (!!a !== !!b) fireDiffers++
          else if (a && b && a.target !== b.target) aimDiffers++
        }
      } catch { /* diagnostic only */ }
    }
    const r = reduce(st, decide(view, base, steps))
    if (!r.ok) break
    st = r.state
    steps++
  }
}
const p = (n) => ((100 * n) / Math.max(1, decisions)).toFixed(2) + '%'
console.log(`contained-pass aim diagnostics — ${GAMES} us54 games, balanced/hard`)
console.log(`ask decisions examined            ${decisions}`)
console.log(`  >1 opponent holds cards         ${oppPool2} (${p(oppPool2)})`)
console.log(`pass fires, aimThreat false       ${planOff} (${p(planOff)})`)
console.log(`pass fires, aimThreat true        ${planOn} (${p(planOn)})`)
console.log(`  fires in one arm only           ${fireDiffers} (${p(fireDiffers)})`)
console.log(`  fires in both, different target ${aimDiffers} (${p(aimDiffers)})`)
