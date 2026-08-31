/**
 * probe-inference-strata.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * Follow-up to probe-inference.mjs. That probe found the owner's stratum ("I missed on a card of
 * this set at this seat, and it never asked back") wildly over-priced: mean p 0.096 against a 0.7%
 * observed hit rate. Before that can be read as "absence of an ask IS evidence", two confounds
 * have to be removed, because the engine's own policy manufactures that pattern:
 *
 *  1. **The contained-book turn-pass** (contained.ts). When every card of a set is on the viewer's
 *     own team the seat asks an opponent for one of them as a GUARANTEED miss, and deliberately
 *     REUSES the same card every time. Every such pass writes a (target, set) miss into the log
 *     for a set the target provably holds nothing of. Controlled two ways: by excluding sets whose
 *     six cards are all genuinely on the viewer's team (ground truth), and by splitting on how
 *     many times this seat has already missed at this target in this set.
 *  2. **The miss itself.** A miss is a real event and the engine already prices it — for the named
 *     card. Conditioning on "I missed here" therefore moves the set-level rate legitimately. The
 *     silence question is only whether it moves it FURTHER, so the control stratum is
 *     "I missed here AND it has asked into the set since".
 *
 * The clean test of the owner's concern is the top-left cell: no prior miss by me, and the target
 * has simply never asked into the set. If observed == p there, silence carries no information and
 * the engine is right to read nothing into it.
 *
 * Usage: node scripts/probe-inference-strata.mjs [games]
 */
import { newGame, reduce, seatView, us54Config, bookCards, cardBook, seatTeam } from '../lib/engine/index.ts'
import { buildKnowledge, refinedHitProbability, rankAsksWith } from '../lib/engine/bots/knowledge.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 300)
const style = STYLE_ROSTER.balanced

/** cell -> { n, sumP, hits } for card-level, and { n, has } for set-level. */
const cards = new Map()
const sets = new Map()
function addCard(cell, p, hit) {
  let x = cards.get(cell)
  if (!x) cards.set(cell, (x = { n: 0, sumP: 0, hits: 0 }))
  x.n++
  x.sumP += p
  if (hit) x.hits++
}
function addSet(cell, has) {
  let x = sets.get(cell)
  if (!x) sets.set(cell, (x = { n: 0, has: 0 }))
  x.n++
  if (has) x.has++
}

for (let g = 0; g < GAMES; g++) {
  let st = newGame(`infer-${g}`, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 4000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const action = decide(view, style, steps)

    if (action.type === 'ask') {
      const k = buildKnowledge(view)
      const ranked = rankAsksWith(view, k, style)
      const myTeam = seatTeam(seat)

      // Per (asker, book): last index at which that seat asked into the book.
      // Per (target, book): how many times THIS seat has asked that target in that book and
      // missed, and the index of the last such miss.
      const askedInto = new Map()
      const missN = new Map()
      const missAt = new Map()
      for (let i = 0; i < view.log.length; i++) {
        const ev = view.log[i]
        if (ev.type !== 'ask') continue
        const b = cardBook(ev.card)
        askedInto.set(`${ev.asker}:${b}`, i)
        if (ev.asker === seat && !ev.hit) {
          const key = `${ev.target}:${b}`
          missN.set(key, (missN.get(key) ?? 0) + 1)
          missAt.set(key, i)
        }
      }

      const seen = new Set()
      for (const r of ranked) {
        const b = cardBook(r.card)
        const key = `${r.target}:${b}`
        const members = bookCards(b, config)
        // Ground-truth containment: every card of the set really is on the viewer's own team.
        // This is the turn-pass position, where a miss at an opponent is manufactured, not earned.
        const containedTruth = members.every((c) => {
          for (let s = 0; s < 6; s++) if (st.hands[s].includes(c)) return seatTeam(s) === myTeam
          return true // already claimed away; treat as not a live opponent holding
        })
        const m = missN.get(key) ?? 0
        const aIdx = askedInto.get(key)
        const mIdx = missAt.get(key)
        const askedBack = aIdx !== undefined && (mIdx === undefined || aIdx > mIdx)
        const missTag = m === 0 ? 'miss:0' : m === 1 ? 'miss:1' : 'miss:2+'
        const voiceTag =
          aIdx === undefined ? 'never-asked-set' : askedBack ? 'asked-set-since' : 'asked-set-before'
        const contTag = containedTruth ? 'CONTAINED' : 'live'

        const p = refinedHitProbability(k, r.card, r.target)
        const hit = st.hands[r.target].includes(r.card)
        addCard(`${contTag} | ${missTag} | ${voiceTag}`, p, hit)

        if (!seen.has(key)) {
          seen.add(key)
          const holdsAny = members.some((c) => st.hands[r.target].includes(c))
          addSet(`${contTag} | ${missTag} | ${voiceTag}`, holdsAny)
        }
      }
    }

    const res = reduce(st, action)
    if (!res.ok) break
    st = res.state
    steps++
  }
}

function ci(hits, n) {
  if (n === 0) return [0, 0]
  const z = 1.959964
  const ph = hits / n
  const d = 1 + (z * z) / n
  const c = ph + (z * z) / (2 * n)
  const s = z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n))
  return [(c - s) / d, (c + s) / d]
}

console.log(`=== CARD-LEVEL calibration by stratum (${GAMES} us54 games, all-Balanced) ===`)
console.log('cell = ground-truth containment | prior misses by ME at this target in this set | what the target has published')
console.log('')
console.log('cell                                         |         N | mean p | observed | 95% CI observed  |  obs - p')
const order = [...cards.keys()].sort()
for (const cell of order) {
  const x = cards.get(cell)
  const mp = x.sumP / x.n
  const obs = x.hits / x.n
  const [lo, hi] = ci(x.hits, x.n)
  console.log(
    `${cell.padEnd(44)} | ${String(x.n).padStart(9)} | ${mp.toFixed(3)} | ${obs.toFixed(4).padStart(8)} | ` +
      `[${lo.toFixed(4)}, ${hi.toFixed(4)}] | ${(obs - mp >= 0 ? '+' : '') + (obs - mp).toFixed(4)}`,
  )
}

console.log('')
console.log('=== SET-LEVEL: P(target holds >= 1 card of the set) by the same strata ===')
console.log('cell                                         |         N | P(holds any)')
for (const cell of order) {
  const x = sets.get(cell)
  if (!x) continue
  console.log(`${cell.padEnd(44)} | ${String(x.n).padStart(9)} | ${(x.has / x.n).toFixed(4)}`)
}

// The headline comparison, on LIVE sets only (turn-pass positions removed).
function agg(pred) {
  let n = 0
  let sp = 0
  let h = 0
  for (const [cell, x] of cards) {
    if (!pred(cell)) continue
    n += x.n
    sp += x.sumP
    h += x.hits
  }
  return { n, meanP: n ? sp / n : 0, obs: n ? h / n : 0 }
}
function line(label, a) {
  const se = Math.sqrt((a.obs * (1 - a.obs)) / Math.max(1, a.n))
  const d = a.obs - a.meanP
  console.log(
    `  ${label.padEnd(52)} N=${String(a.n).padStart(9)}  mean p ${a.meanP.toFixed(4)}  observed ${a.obs.toFixed(4)}  ` +
      `err ${(d >= 0 ? '+' : '') + d.toFixed(4)}  95% CI [${(d - 1.959964 * se).toFixed(4)}, ${(d + 1.959964 * se).toFixed(4)}]`,
  )
}
console.log('')
console.log('=== HEADLINE: live (non-contained) sets only — the turn-pass artifact removed ===')
line('no prior miss by me, target never asked into the set', agg((c) => c.startsWith('live | miss:0 | never-asked-set')))
line('no prior miss by me, target HAS asked into the set  ', agg((c) => c.startsWith('live | miss:0 | asked-set')))
line("owner's case: 1 miss by me, target never asked back ", agg((c) => c.startsWith('live | miss:1 | never-asked-set')))
line('1 miss by me, target HAS asked into the set since   ', agg((c) => c.startsWith('live | miss:1 | asked-set-since')))
line('2+ misses by me, target never asked into the set    ', agg((c) => c.startsWith('live | miss:2+ | never-asked-set')))
line('ALL live-set asks                                   ', agg((c) => c.startsWith('live')))
line('ALL contained-set asks (turn-pass positions)        ', agg((c) => c.startsWith('CONTAINED')))
