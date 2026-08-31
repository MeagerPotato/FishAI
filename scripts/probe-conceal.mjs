/**
 * probe-conceal.mjs — scratch measurement of the conceal.ts broadcast term. NOT part of the
 * shipped lab.
 *
 * The question: RULES_US54.md row 6 makes every ask publish "the asker holds a card of this set".
 * Is declining to publish that — paying the best ask into the set for it — worth anything?
 *
 * The design is probe-verify.mjs's, because the mechanism is shipped as a style knob and the
 * honest way to measure a style knob is to play it against itself:
 *
 *   ON  = the roster style with `conceal: LAMBDA` spread over it
 *   OFF = the roster style exactly as the roster ships it (no `conceal` field at all)
 *
 * Every seed is played in BOTH orientations (ON on team 0, then ON on team 1), so the deal is
 * never a confound (BOT_LAB.md §5.1) and the reported statistic is a paired set-difference per
 * duplicate pair with a 95% CI.
 *
 * **The control that makes the rest of it mean anything.** At `LAMBDA = 0` the two arms are
 * different objects — one carries the field at zero, one does not carry it at all — that must
 * decide identically at every position under both rule sets. The paired difference then has to
 * print exactly `0.0000 +/- 0.0000`. If it does not, the arm is confounded by something other
 * than concealment and no other row of the sweep may be read.
 *
 * Usage:
 *   node scripts/probe-conceal.mjs [GAMES] [STYLE] [LAMBDA] [BANK] [DEFUSE]
 *
 *   GAMES   duplicate pairs (default 300)
 *   STYLE   roster style id (default 'balanced')
 *   LAMBDA  the concealment appetite on the ON arm (default 1; 0 is the byte-exact control)
 *   BANK    seed-bank prefix — use a different one to hold out (default 'concealA')
 *   DEFUSE  optional override of BOTH arms' defusal appetite, to isolate the arbitration
 *           (default: leave the roster's `defuse: 1` alone; pass 0 for concealment on its own)
 *   SKILL   optional skill applied to BOTH arms (BOT_LAB.md §1.3 ablation): 'hard' (default),
 *           'medium', or 'blind'. This is the causal test of the stated mechanism. Concealment
 *           claims to work by withholding the row-6 basis that `knowledge.ts` `addAskConstraint`
 *           records and `refinedHitProbability` reads back out. 'medium' still records the
 *           constraint but never folds it into a hit estimate; 'blind' is hard skill with
 *           `useConstraints: false`, so the publication is never recorded at all. If the effect
 *           survives an opponent that cannot exploit the leak, it is not concealment — it is
 *           whatever else the term is doing to the ask distribution, and must be reported as that.
 */
import { newGame, reduce, seatView, us54Config, seatTeam } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { SKILL_PRESETS } from '../lib/engine/bots/style.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 300)
const NAME = process.argv[3] ?? 'balanced'
const LAMBDA = Number(process.argv[4] ?? 1)
const BANK = process.argv[5] ?? 'concealA'
const DEFUSE = process.argv[6] === undefined ? null : Number(process.argv[6])
const SKILL = process.argv[7] ?? 'hard'

// Optional 8th argument: the OFF arm's defusal appetite, set independently of the ON arm's. This
// is what turns the symmetric A/B into a difference-of-differences over the OPPONENT's mechanism —
// run it with CONCEAL 1 and again with CONCEAL 0 against the same OFF arm, and the difference of
// the two means is concealment's marginal value against an opponent that does not defuse.
const OPPDEFUSE = process.argv[8] === undefined ? null : Number(process.argv[8])

const base = DEFUSE === null ? STYLE_ROSTER[NAME] : { ...STYLE_ROSTER[NAME], defuse: DEFUSE }
const oppBase = OPPDEFUSE === null ? base : { ...base, defuse: OPPDEFUSE }
const skill =
  SKILL === 'blind'
    ? { ...SKILL_PRESETS.hard, id: 'blind', label: 'Hard inference, row-6 constraints not recorded', useConstraints: false }
    : SKILL_PRESETS[SKILL]
// A bare style resolves to hard skill (STYLES.md §2), so the default arm is exactly what
// probe-verify.mjs plays; any other skill is passed as an explicit BotPolicy pair.
const wrap = (style) => (SKILL === 'hard' ? style : { skill, style })
const OFF = wrap(Object.freeze({ ...oppBase }))
const ON = wrap(Object.freeze({ ...base, conceal: LAMBDA }))

function play(seed, onTeam) {
  let st = newGame(seed, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 6000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const style = seatTeam(seat) === onTeam ? ON : OFF
    const r = reduce(st, decide(view, style, steps))
    if (!r.ok) return null
    st = r.state
    steps++
  }
  return st.phase === 'finished' ? { on: st.score[onTeam], off: st.score[1 - onTeam] } : null
}

let pairs = 0, onW = 0, offW = 0, onS = 0, offS = 0, voided = 0
const d = []
for (let g = 0; g < GAMES; g++) {
  const a = play(`${BANK}-${g}`, 0), b = play(`${BANK}-${g}`, 1)
  if (!a || !b) { voided++; continue }
  pairs++
  onS += a.on + b.on; offS += a.off + b.off
  onW += (a.on > a.off ? 1 : 0) + (b.on > b.off ? 1 : 0)
  offW += (a.on < a.off ? 1 : 0) + (b.on < b.off ? 1 : 0)
  d.push((a.on - a.off) + (b.on - b.off))
}
const n = d.length
const m = d.reduce((x, y) => x + y, 0) / Math.max(1, n)
const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1))
const ci = 1.96 * sd / Math.sqrt(Math.max(1, n))
console.log(`${NAME} conceal:${LAMBDA} vs conceal:off — ${pairs} duplicate pairs (${voided} void), bank ${BANK}, defuse ${base.defuse}/${oppBase.defuse} (on/off arm), skill ${SKILL}`)
console.log(`  sets ${onS} vs ${offS}; wins ${onW} vs ${offW} (${((100 * onW) / (2 * Math.max(1, pairs))).toFixed(2)}%)`)
console.log(`  paired set-difference ${m.toFixed(4)} +/- ${ci.toFixed(4)} (95%, N=${n} pairs)`)
