/**
 * probe-inference.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * Two questions, both about the owner's "don't automatically infer" concern.
 *
 * (1) SOUNDNESS. Does anything in the engine turn the ABSENCE of an ask into a negative card
 *     fact? Part A builds the owner's exact scenario as a hand-made SeatView and prints the
 *     candidate sets, next to a control view in which the miss never happened.
 *
 * (2) CALIBRATION. Over real us54 games: when the engine believes an ask hits with probability
 *     p, how often does it actually hit? Bucketed by decile, with the whole legal ask pool (not
 *     just the chosen ask) scored against ground truth read from the hands. Stratified by
 *     whether the target has published a licence in the asked set — and, precisely, by the
 *     owner's scenario: "I missed on a card of this set at this seat, and it never asked back".
 *
 * Usage: node scripts/probe-inference.mjs [games]
 */
import { newGame, reduce, seatView, us54Config, bookCards, cardBook } from '../lib/engine/index.ts'
import {
  buildKnowledge,
  candidates,
  askHitProbability,
  refinedHitProbability,
  rankAsksWith,
} from '../lib/engine/bots/knowledge.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const GAMES = Number(process.argv[2] ?? 200)
const style = STYLE_ROSTER.balanced

/* ============================ Part A — the owner's scenario, constructed ============ */

const gs = { type: 'game_started', startingSeat: 0 }
const ask = (asker, target, card, hit) => ({ type: 'ask', asker, target, card, hit })

/** A SeatView by hand — the same shape tests/bots/util.ts `mkView` produces. */
function mkView({ seat, hand, counts, log, turn = seat, books = {} }) {
  return {
    phase: 'playing',
    turn,
    counts,
    score: [0, 0],
    books,
    log,
    moveIndex: Math.max(0, log.length - 1),
    config,
    seat,
    hand,
  }
}

// Seat 0 (viewer) holds 2S and 4S — a row-6 licence in LOW-S — plus a full HIGH-C and one spare.
const HAND0 = ['2S', '4S', '9C', 'TC', 'JC', 'QC', 'KC', 'AC', '2D']
const LOW_S = bookCards('LOW-S', config) // 2S 3S 4S 5S 6S 7S

// TREATMENT: seat 0 asks seat 1 for the 3S and MISSES. Seat 1 then takes the turn (row 10) and
// asks five times, never once into LOW-S. This is exactly the owner's example.
const treatLog = [
  gs,
  ask(0, 1, '3S', false), // the miss
  ask(1, 2, 'QH', false), // seat 1 has the turn and asks into HIGH-H
  ask(2, 3, '9D', false),
  ask(3, 4, 'TD', false),
  ask(4, 5, 'JD', false),
  ask(5, 0, 'KD', false),
  ask(0, 1, '5H', false), // seat 0 misses again elsewhere; seat 1 asks again, still not LOW-S
  ask(1, 4, 'AH', false),
  ask(4, 1, '3H', false),
  ask(1, 0, 'KH', false),
]
// CONTROL: identical, except seat 0 never asked seat 1 about a low spade at all.
const ctrlLog = treatLog.filter((e) => !(e.type === 'ask' && e.card === '3S'))

const counts = [9, 9, 9, 9, 9, 9]
const kT = buildKnowledge(mkView({ seat: 0, hand: HAND0, counts, log: treatLog }))
const kC = buildKnowledge(mkView({ seat: 0, hand: HAND0, counts, log: ctrlLog }))

console.log('================ PART A — does a miss + silence eliminate the set? ================')
console.log('Viewer seat 0, hand', HAND0.join(' '), '(so 2S/4S are mine, row 6 licence in LOW-S).')
console.log('Treatment: 0 asked 1 for 3S and MISSED; seat 1 then asked 4 times, never into LOW-S.')
console.log('Control:   the 3S ask never happened; everything else identical.')
console.log('')
console.log('card | cands (treatment)      | cands (control)        | p(seat1) treat | p(seat1) ctrl')
for (const c of LOW_S) {
  const ct = candidates(kT, c)
  const cc = candidates(kC, c)
  const pt = refinedHitProbability(kT, c, 1)
  const pc_ = refinedHitProbability(kC, c, 1)
  console.log(
    `${c.padEnd(4)} | ${JSON.stringify(ct).padEnd(22)} | ${JSON.stringify(cc).padEnd(22)} | ` +
      `${pt.toFixed(4).padStart(13)} | ${pc_.toFixed(4).padStart(12)}`,
  )
}
console.log('')
console.log('Constraints recorded (seat was dealt >= 1 of these):')
for (const kc of kT.constraints) console.log(`  seat ${kc.seat}: >=1 of [${kc.cards.join(' ')}]`)
console.log('')
const stillCand = LOW_S.filter((c) => c !== '3S' && candidates(kT, c).includes(1))
console.log(
  `Seat 1 remains a candidate holder for ${stillCand.length}/5 non-asked LOW-S cards: [${stillCand.join(' ')}]`,
)
console.log(`Seat 1 eliminated ONLY for the named card 3S: ${!candidates(kT, '3S').includes(1)}`)

/* ============================ Part B — calibration over real games ================== */

const NB = 10
const mkBins = () => Array.from({ length: NB }, () => ({ n: 0, sumP: 0, hits: 0 }))
const bins = { all: mkBins(), lic: mkBins(), noLic: mkBins(), owner: mkBins(), chosen: mkBins() }
const binOf = (p) => Math.min(NB - 1, Math.max(0, Math.floor(p * NB)))
function push(b, p, hit) {
  const x = b[binOf(p)]
  x.n++
  x.sumP += p
  if (hit) x.hits++
}

// Set-level: does the target hold ANY card of the asked set, in the owner's silence stratum?
const setLevel = { ownerN: 0, ownerHas: 0, missN: 0, missHas: 0, baseN: 0, baseHas: 0 }
// Base-vs-refined, to see how much the constraint refinement is worth.
const baseBins = mkBins()

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

      // Per (target, book) log facts, computed once per decision.
      // askedInto: last log index at which `t` asked into `b`.
      // myMiss:    last log index at which THIS seat asked `t` for a card of `b` and missed.
      const askedInto = new Map()
      const myMiss = new Map()
      for (let i = 0; i < view.log.length; i++) {
        const ev = view.log[i]
        if (ev.type !== 'ask') continue
        const b = cardBook(ev.card)
        askedInto.set(`${ev.asker}:${b}`, i)
        if (ev.asker === seat && !ev.hit) myMiss.set(`${ev.target}:${b}`, i)
      }

      for (const r of ranked) {
        const b = cardBook(r.card)
        const key = `${r.target}:${b}`
        const p = refinedHitProbability(k, r.card, r.target)
        const pBase = askHitProbability(k, r.card, r.target)
        const hit = st.hands[r.target].includes(r.card)
        push(bins.all, p, hit)
        push(baseBins, pBase, hit)
        const aIdx = askedInto.get(key)
        const hasLic = aIdx !== undefined
        push(hasLic ? bins.lic : bins.noLic, p, hit)

        // The owner's stratum: I asked this seat for a card of this set and missed, and it has
        // not asked into the set since (silence after the miss).
        const mIdx = myMiss.get(key)
        const silent = mIdx !== undefined && (aIdx === undefined || aIdx < mIdx)
        if (silent) push(bins.owner, p, hit)
      }

      // Set-level rates, one row per (target, unresolved book the viewer could ask into).
      const seen = new Set()
      for (const r of ranked) {
        const b = cardBook(r.card)
        const key = `${r.target}:${b}`
        if (seen.has(key)) continue
        seen.add(key)
        const holdsAny = bookCards(b, config).some((c) => st.hands[r.target].includes(c))
        setLevel.baseN++
        if (holdsAny) setLevel.baseHas++
        const mIdx = myMiss.get(key)
        if (mIdx === undefined) continue
        setLevel.missN++
        if (holdsAny) setLevel.missHas++
        const aIdx = askedInto.get(key)
        if (aIdx === undefined || aIdx < mIdx) {
          setLevel.ownerN++
          if (holdsAny) setLevel.ownerHas++
        }
      }

      const chosenP = refinedHitProbability(k, action.card, action.target)
      push(bins.chosen, chosenP, st.hands[action.target].includes(action.card))
    }

    const res = reduce(st, action)
    if (!res.ok) break
    st = res.state
    steps++
  }
}

/* ------------------------------------------------------------------ reporting ------ */

function wilson(hits, n) {
  if (n === 0) return [0, 0]
  const z = 1.959964
  const ph = hits / n
  const d = 1 + (z * z) / n
  const c = ph + (z * z) / (2 * n)
  const s = z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n))
  return [(c - s) / d, (c + s) / d]
}

function table(name, b) {
  const tot = b.reduce((a, x) => a + x.n, 0)
  console.log('')
  console.log(`--- ${name}  (N = ${tot}) ---`)
  console.log('bucket      |       N | mean p | observed | 95% CI observed  | obs - p')
  let sn = 0
  let sp = 0
  let sh = 0
  for (let i = 0; i < NB; i++) {
    const x = b[i]
    if (x.n === 0) {
      console.log(`${(i / NB).toFixed(1)}-${((i + 1) / NB).toFixed(1)}     |       0 |      - |        - |                  |`)
      continue
    }
    const mp = x.sumP / x.n
    const obs = x.hits / x.n
    const [lo, hi] = wilson(x.hits, x.n)
    sn += x.n
    sp += x.sumP
    sh += x.hits
    console.log(
      `${(i / NB).toFixed(1)}-${((i + 1) / NB).toFixed(1)}     | ${String(x.n).padStart(7)} | ${mp.toFixed(3)} | ` +
        `${obs.toFixed(4).padStart(8)} | [${lo.toFixed(4)}, ${hi.toFixed(4)}] | ${(obs - mp >= 0 ? '+' : '') + (obs - mp).toFixed(4)}`,
    )
  }
  if (sn > 0) {
    console.log(
      `OVERALL     | ${String(sn).padStart(7)} | ${(sp / sn).toFixed(3)} | ${(sh / sn).toFixed(4).padStart(8)} |` +
        `                  | ${(sh / sn - sp / sn >= 0 ? '+' : '') + (sh / sn - sp / sn).toFixed(4)}`,
    )
  }
  return { n: sn, meanP: sn ? sp / sn : 0, obs: sn ? sh / sn : 0, hits: sh }
}

console.log('')
console.log(`================ PART B — calibration over ${GAMES} us54 games (all-Balanced) ========`)
console.log('Every LEGAL ask at every ask decision is scored against ground truth read from the')
console.log('hands; p is refinedHitProbability, the number the hard tier actually decides on.')
const A = table('ALL legal asks, refined p', bins.all)
const Ab = table('ALL legal asks, BASE p (askHitProbability, no constraint refinement)', baseBins)
const L = table('target HAS published a licence in the asked set (row 6)', bins.lic)
const NL = table('target has NEVER asked into the asked set', bins.noLic)
const OW = table("OWNER'S STRATUM: I missed here in this set, and it has not asked back since", bins.owner)
const CH = table('the ask the engine actually CHOSE', bins.chosen)

function diff(x, y, nx, ny, lx, ly) {
  const se = Math.sqrt((x * (1 - x)) / Math.max(1, nx) + (y * (1 - y)) / Math.max(1, ny))
  const d = x - y
  console.log(
    `  ${lx} - ${ly} = ${(d >= 0 ? '+' : '') + d.toFixed(4)}  95% CI [${(d - 1.959964 * se).toFixed(4)}, ${(d + 1.959964 * se).toFixed(4)}]`,
  )
}

console.log('')
console.log('--- calibration error (observed hit rate minus believed p), by stratum ---')
for (const [label, s] of [
  ['all asks          ', A],
  ['base p (no refine)', Ab],
  ['target has licence', L],
  ['target never asked', NL],
  ["owner's stratum   ", OW],
  ['chosen ask        ', CH],
]) {
  const se = Math.sqrt((s.obs * (1 - s.obs)) / Math.max(1, s.n))
  const d = s.obs - s.meanP
  console.log(
    `  ${label}  N=${String(s.n).padStart(7)}  mean p ${s.meanP.toFixed(4)}  observed ${s.obs.toFixed(4)}  ` +
      `err ${(d >= 0 ? '+' : '') + d.toFixed(4)}  95% CI [${(d - 1.959964 * se).toFixed(4)}, ${(d + 1.959964 * se).toFixed(4)}]`,
  )
}

console.log('')
console.log('--- SET-LEVEL: is silence after a miss actually evidence of lacking the set? ---')
const rate = (h, n) => (n ? h / n : 0)
const bR = rate(setLevel.baseHas, setLevel.baseN)
const mR = rate(setLevel.missHas, setLevel.missN)
const oR = rate(setLevel.ownerHas, setLevel.ownerN)
console.log(`  P(target holds >=1 card of the set)`)
console.log(`    all askable (target, set) pairs           : ${bR.toFixed(4)}  N=${setLevel.baseN}`)
console.log(`    after I missed on a card of that set here : ${mR.toFixed(4)}  N=${setLevel.missN}`)
console.log(`    ... AND it has not asked into the set since: ${oR.toFixed(4)}  N=${setLevel.ownerN}`)
diff(oR, mR, setLevel.ownerN, setLevel.missN, 'silent-after-miss', 'any-miss         ')
diff(mR, bR, setLevel.missN, setLevel.baseN, 'any-miss         ', 'base             ')
