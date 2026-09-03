/**
 * probe-v15-anchor.mjs — scratch: establish what is COMPARABLE between Bass v1.0 (adaptive)
 * and v1.5 (bounded). Three questions, all decided by replay, none by argument:
 *
 *  Q1. What style does a v1.0 adaptive seat actually delegate to, over real us54 games?
 *      (adaptive.ts: anchor 'balanced' while cut < warmupEvents=40, phase = floor(events/30).)
 *  Q2. Is an UNBOUNDED v1.5 seat decision-identical to the bare style it names?
 *      (the tests/bots/bounded.test.ts anchor, re-run on a held-out seed bank.)
 *  Q3. Is a v1.0 seat decision-identical to some FIXED static style over whole games?
 *      If yes, v1.0 collapses onto a static style and the comparison is well posed.
 *
 * Usage: node scripts/probe-v15-anchor.mjs [games] [bankPrefix]
 */
import {
  ALL_SEATS,
  STYLE_ROSTER,
  STYLE_IDS,
  decide,
  hashSeed,
  legalActionsSummary,
  newGame,
  reduce,
  seatView,
  us54Config,
} from '../lib/engine/index.ts'
import { chooseStyle, ADAPTIVE_DEFAULTS, ADAPTIVE_PHASE_EVENTS } from '../lib/engine/bots/adaptive.ts'
import { COUNTER_TABLE } from '../lib/engine/bots/data/counter-table.ts'

const GAMES = Number(process.argv[2] ?? 40)
const BANK = process.argv[3] ?? 'v15v10-holdout-a'
const INF = 1_000_000

const ADAPTIVE = { adaptive: true }
const boundedSpec = (bits, style) => ({ bounded: true, bits, style })

/* ---- counter table dominance, re-derived (not assumed from the file header) ---- */
{
  const S = COUNTER_TABLE.styles
  const argmaxPerColumn = S.map((_, j) => {
    let best = 0
    for (let i = 0; i < S.length; i++) if (COUNTER_TABLE.p[i][j] > COUNTER_TABLE.p[best][j]) best = i
    return S[best]
  })
  const uniq = [...new Set(argmaxPerColumn)]
  console.log(`counter table: styles=[${S.join(', ')}]`)
  console.log(`  argmax per opponent column: ${argmaxPerColumn.join(', ')}`)
  console.log(`  distinct best responses: ${uniq.join(', ')}  (dominant row = ${uniq.length === 1 ? uniq[0] : 'NONE'})`)
  if (uniq.length === 1) {
    // smallest gap of the dominant row over every other row, over all columns
    const di = S.indexOf(uniq[0])
    let minGap = Infinity
    for (let i = 0; i < S.length; i++) {
      if (i === di) continue
      for (let j = 0; j < S.length; j++) minGap = Math.min(minGap, COUNTER_TABLE.p[di][j] - COUNTER_TABLE.p[i][j])
    }
    console.log(`  min row gap over all others/columns: ${minGap.toFixed(4)} (switchMargin ${ADAPTIVE_DEFAULTS.switchMargin})`)
  }
  console.log(`  adaptive defaults: warmup=${ADAPTIVE_DEFAULTS.warmupEvents} anchor=${ADAPTIVE_DEFAULTS.anchor} phase=${ADAPTIVE_PHASE_EVENTS}`)
}

/* ---- replay ---- */
const logLens = []
const styleUse = new Map()
let decisions = 0
let warmDecisions = 0
let q2mismatch = 0
let q2checked = 0
const q3mismatch = new Map() // styleId -> count of decisions where adaptive != that static style
for (const s of STYLE_IDS) q3mismatch.set(s, 0)

for (let g = 0; g < GAMES; g++) {
  const seed = `${BANK}-${String(g).padStart(6, '0')}`
  let st = newGame(seed, us54Config, (g % 6))
  let steps = 0
  while (st.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(st)
    const view = seatView(st, seat)
    const moveSeed = hashSeed(`${seed}:${st.moveIndex}`)()

    // Q1: what does v1.0 pick here?
    const choice = chooseStyle(view, ADAPTIVE)
    styleUse.set(choice.style, (styleUse.get(choice.style) ?? 0) + 1)
    logLens.push(view.log.length)
    decisions++
    const cut = Math.floor(view.log.length / ADAPTIVE_PHASE_EVENTS) * ADAPTIVE_PHASE_EVENTS
    if (cut >= ADAPTIVE_DEFAULTS.warmupEvents) warmDecisions++

    const aAct = decide(view, ADAPTIVE, moveSeed)

    // Q3: adaptive vs each static roster style, same view+seed
    for (const s of STYLE_IDS) {
      const stat = decide(view, STYLE_ROSTER[s], moveSeed)
      if (JSON.stringify(stat) !== JSON.stringify(aAct)) q3mismatch.set(s, q3mismatch.get(s) + 1)
    }

    // Q2: unbounded v1.5 named style vs the bare style, every 3rd decision (cost)
    if (steps % 3 === 0) {
      for (const s of ['balanced', 'punter']) {
        const bare = decide(view, STYLE_ROSTER[s], moveSeed)
        const unb = decide(view, boundedSpec(INF, s), moveSeed)
        q2checked++
        if (JSON.stringify(bare) !== JSON.stringify(unb)) q2mismatch++
      }
    }

    const r = reduce(st, aAct)
    if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code}`)
    st = r.state
    steps++
  }
}

logLens.sort((a, b) => a - b)
const pct = (p) => logLens[Math.min(logLens.length - 1, Math.floor(p * logLens.length))]
console.log(`\nQ1 — v1.0 delegation over ${GAMES} us54 games (${decisions} decisions, bank ${BANK}):`)
console.log(`  public log length at decision time: min ${logLens[0]} p50 ${pct(0.5)} p90 ${pct(0.9)} max ${logLens[logLens.length - 1]}`)
console.log(`  decisions past warmup (truncated cut >= ${ADAPTIVE_DEFAULTS.warmupEvents}): ${warmDecisions} (${((100 * warmDecisions) / decisions).toFixed(2)}%)`)
for (const [s, n] of [...styleUse].sort((a, b) => b[1] - a[1])) {
  console.log(`  delegated to ${s}: ${n} (${((100 * n) / decisions).toFixed(2)}%)`)
}

console.log(`\nQ2 — unbounded v1.5 (bits=${INF}) vs the bare style it names:`)
console.log(`  ${q2checked} paired decisions, ${q2mismatch} mismatches`)

console.log(`\nQ3 — v1.0 adaptive action vs each static roster style (same view, same seed):`)
for (const [s, n] of [...q3mismatch].sort((a, b) => a[1] - b[1])) {
  console.log(`  vs ${s.padEnd(10)}: ${n} / ${decisions} differing decisions (${((100 * n) / decisions).toFixed(2)}%)`)
}
