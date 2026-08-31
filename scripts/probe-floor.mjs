/**
 * probe-floor.mjs — scratch measurement, NOT part of the shipped lab.
 *
 * CONCESSION.md §9 lists this as open work: *"A detection floor. Plant an edge of known size and
 * confirm the instrument resolves it before reading any result off it."* This is that.
 *
 * Every headline number in this project comes out of ONE instrument:
 *
 *     K duplicate pairs of arm X against arm Y under us54, reported as the mean paired
 *     set-difference +/- 1.96 * SE, where a pair's datum is
 *         (X - Y | X on team 0)  +  (X - Y | X on team 1)      on the same seed.
 *
 * Nobody has characterised what that instrument can and cannot see, so a published null is
 * ambiguous between "no effect" and "no resolution". This probe answers four questions:
 *
 *   1. `sd`        — the per-pair SD under the conditions the published tables actually used,
 *                    and the analytic MDE curve  (z.975 + z.80) * SD / sqrt(N)  off it.
 *   2. `calib`,
 *      `detect`    — the EMPIRICAL floor. A planted edge of continuously variable true size,
 *                    measured at large N, then the fraction of independent banks whose nominal
 *                    95% interval excludes zero at N = 400 and N = 800.
 *   3. `fpr`       — the false-positive rate, on true nulls that still move the game.
 *   4. `published` — the floor applied to the numbers already committed.
 *
 * ## The planted edge
 *
 * The handicapped arm plays the shipped policy, except that on an ordinary ask it replaces the
 * chosen ask with a uniformly-chosen legal alternative with probability EPS. Two properties are
 * what make it a usable ruler:
 *
 *   - at EPS = 0 not a single random draw is taken, so the arm is byte-identical to the control
 *     and the paired difference must print exactly `0.0000 +/- 0.0000`;
 *   - the true edge grows monotonically with EPS, because replacing an argmax by a uniform draw
 *     over the legal ask list can only lose value in expectation.
 *
 * The draw is a deterministic hash of (stream, seed, step, seat), so a bank replays identically
 * and the two orientations of a pair are still the same deal.
 *
 * ## The nulls
 *
 * A mirror match is exactly zero by construction under duplicate pairing, so it says nothing
 * about noise. Two true nulls that DO move the game are used:
 *
 *   - `symnull` — both arms carry the SAME handicap magnitude EPS on two different hash streams.
 *     They differ at ~2*EPS of all ask decisions, yet the expected edge is exactly zero by the
 *     exchangeability of the two streams. This is the cleanest null available.
 *   - `abnull`  — probe-ab.mjs's information-free control, reused as specified: the danger
 *     penalty's magnitude with `D` replaced by a hash of (seat, log length) over the same 0..3
 *     prey range. The prototype ranker is copied faithfully from probe-ab.mjs so that LAMBDA = 0
 *     reproduces `decide` at `defuse: 0` byte-for-byte; that is the second standing control here.
 *
 * ## Usage
 *
 *   node scripts/probe-floor.mjs control          # the byte-exact controls + a fidelity check
 *   node scripts/probe-floor.mjs sd     [PAIRS]   # part 1: SD per condition, and the MDE curve
 *   node scripts/probe-floor.mjs calib  [PAIRS]   # part 2a: true edge vs EPS
 *   node scripts/probe-floor.mjs detect [BANKS]   # part 2b: detection rate at N=400 and N=800
 *   node scripts/probe-floor.mjs fpr    [BANKS]   # part 3: false-positive rate
 *   node scripts/probe-floor.mjs published        # part 4: the floor applied to committed claims
 *   node scripts/probe-floor.mjs all              # everything, in order
 *
 * Seed banks are fresh prefixes, disjoint from every bank in use (`style-v1`, `exploit-v1`,
 * `exploit-eval-v1`, `holdoutA`, `holdoutB`, `genholdout`, `lic3`, `mirror-test`, `ab`,
 * `gauntlet`, `concealA`, `v15v10-holdout-a`): everything below is under `floor-`. The single
 * exception is the fidelity check in `control`, which deliberately REPLAYS `holdoutA` because
 * its whole purpose is to reproduce a published number rather than to measure a new one.
 */
import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import { availableParallelism } from 'node:os'
import {
  newGame,
  reduce,
  seatView,
  us54Config,
  seatTeam,
  legalAsksFromView,
  bookCards,
  cardBook,
  rulesFor,
} from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'
import { SKILL_PRESETS } from '../lib/engine/bots/style.ts'
import {
  askHitProbability,
  buildKnowledge,
  holderOf,
  rankAsksWith,
  refinedHitProbability,
} from '../lib/engine/bots/knowledge.ts'
import { planContainedPass } from '../lib/engine/bots/contained.ts'

const config = us54Config
const Z95 = 1.96 // the house constant, so intervals here are comparable to the published ones
const Z80 = 0.8416212335729143 // z_0.80, the one-sided power point
const MDE_K = Z95 + Z80 // 2.8016...

// ---------------------------------------------------------------------------------------------
// determinism
// ---------------------------------------------------------------------------------------------

function hash32(s) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A uniform in [0,1) from four integers. No state, so nothing can drift between arms. */
function u01(stream, key, step, seat) {
  let h = (key ^ Math.imul(stream, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = (h + Math.imul(step + 1, 0xc2b2ae35)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f)
  h = (h + Math.imul(seat + 1, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x9e3779b1)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------------------------------------
// the arms
// ---------------------------------------------------------------------------------------------

/** The shipped policy, unmodified. */
function plainPolicy(style) {
  return (view, step) => decide(view, style, step)
}

/**
 * The planted-edge arm. At EPS = 0 every draw fails the `>= eps` test — `u01` returns a value in
 * [0, 1) and every such value is `>= 0` — so the arm returns `decide`'s action unchanged and is
 * byte-identical to `plainPolicy(style)`. That is the control this whole probe rests on.
 *
 * **It deliberately does NOT short-circuit at eps = 0.** An earlier version opened with
 * `if (!(eps > 0)) return plainPolicy(style)`, which made the control test the wrong thing: it
 * proved `plainPolicy` equals the shipped policy, which is true by inspection, while never
 * entering the wrapper whose inertness is the actual claim. Falling through means the control
 * exercises the draw, the legality lookup and the substitution branch, and still prints
 * `0.0000 +/- 0.0000` — which is the statement PROBES.md's control discipline is asking for.
 */
function handicapPolicy(style, eps, stream) {
  return (view, step, key) => {
    const action = decide(view, style, step)
    if (action.type !== 'ask') return action
    if (view.declareWindow || view.phase !== 'playing') return action
    if (u01(stream, key, step, view.seat) >= eps) return action
    const legal = legalAsksFromView(view)
    if (legal.length <= 1) return action
    const j = Math.min(legal.length - 1, Math.floor(u01(stream + 7919, key, step, view.seat) * legal.length))
    return { type: 'ask', seat: view.seat, target: legal[j].target, card: legal[j].card }
  }
}

// --- probe-ab.mjs's prototype ranker, copied faithfully so its control still holds -------------
// The copy is verbatim in every respect that touches the decision: the refined re-score, the
// deterministic sort, the minHitP pool, both near-tie windows, and the contained-pass offer.
// Only the `null` mode is retained, because that is the arm this probe needs.

const AB_STYLE = Object.freeze({ ...STYLE_ROSTER.balanced, defuse: 0 })
const D0 = 0.885
const D1 = 0.391

function nullPrey(view, s) {
  let h = 2166136261 ^ s ^ (view.log.length * 16777619)
  h = Math.imul(h ^ (h >>> 13), 16777619)
  return (h >>> 0) % 4
}

function abPickAskLike(view, k, ranked, penaltyOf) {
  const scored = ranked.map((r, idx) => {
    const base = askHitProbability(k, r.card, r.target)
    const refined = refinedHitProbability(k, r.card, r.target)
    return { r, refined, s: r.score + AB_STYLE.wHit * (refined - base) - penaltyOf(r, refined), idx }
  })
  scored.sort((a, b) => (b.s !== a.s ? b.s - a.s : a.idx - b.idx))
  const pool =
    AB_STYLE.minHitP > 0 && scored.some((x) => x.r.p >= AB_STYLE.minHitP)
      ? scored.filter((x) => x.r.p >= AB_STYLE.minHitP)
      : scored
  const top = pool[0]
  const missWidth = AB_STYLE.missTarget === 'fewest' ? 0 : 0.5
  const width = Math.max(AB_STYLE.leakEpsilon, missWidth)
  if (width <= 0) return top.r
  const near = pool.filter((x) => x.s >= top.s - width)
  if (near.length === 1) return top.r
  const myTeam = seatTeam(view.seat)
  const held = new Set(view.hand)
  const leaky = (b) => {
    let n = 0
    for (const c of bookCards(b, config)) {
      const h = holderOf(k, c)
      if (held.has(c) || (h !== null && seatTeam(h) === myTeam)) n++
    }
    return n >= AB_STYLE.leakThreshold
  }
  near.sort((a, b) => {
    if (AB_STYLE.leakEpsilon > 0) {
      const la = leaky(cardBook(a.r.card)) ? 1 : 0
      const lb = leaky(cardBook(b.r.card)) ? 1 : 0
      if (la !== lb) return la - lb
    }
    if (a.refined === 0 && b.refined === 0 && AB_STYLE.missTarget !== 'random') {
      const ca = view.counts[a.r.target]
      const cb = view.counts[b.r.target]
      if (ca !== cb) return AB_STYLE.missTarget === 'fewest' ? ca - cb : cb - ca
    }
    return a.idx - b.idx
  })
  return near[0].r
}

/** probe-ab.mjs `MODE = 'null'`: the information-free perturbation, at appetite LAMBDA. */
function abNullPolicy(lambda) {
  return (view, step) => {
    const ordinary =
      rulesFor(view.config).declareTiming === 'anyTime' && view.phase === 'playing' && !view.declareWindow
    if (!ordinary) return decide(view, AB_STYLE, step)
    const k = buildKnowledge(view, { useConstraints: true })
    const ranked = rankAsksWith(view, k, AB_STYLE)
    if (ranked.length === 0) return decide(view, AB_STYLE, step)
    let hits = 0
    let misses = 0
    for (const ev of view.log) if (ev.type === 'ask') ev.hit ? hits++ : misses++
    const E = hits / Math.max(1, misses)
    const cache = new Map()
    const dangerAt = (t) => {
      if (!cache.has(t)) cache.set(t, D0 + D1 * nullPrey(view, t))
      return cache.get(t)
    }
    const penaltyOf = (r, refined) => (AB_STYLE.wHit * (1 - refined) * lambda * dangerAt(r.target)) / (1 + E)
    const best = abPickAskLike(view, k, ranked, penaltyOf)
    const pass = planContainedPass(view, k, AB_STYLE, SKILL_PRESETS.hard, best)
    if (pass !== null) return { type: 'ask', seat: view.seat, target: pass.target, card: pass.card }
    return { type: 'ask', seat: view.seat, target: best.target, card: best.card }
  }
}

// ---------------------------------------------------------------------------------------------
// conditions — every one of them is a pair of policies plus how many games a pair costs
// ---------------------------------------------------------------------------------------------

function styleOf(spec) {
  const base = STYLE_ROSTER[spec.id]
  return Object.freeze(spec.patch ? { ...base, ...spec.patch } : { ...base })
}

/**
 * A condition resolves to { games, arms(): [polA, polB] } or, for the difference-of-differences
 * gauntlet shape, { games: 4, dod: {...} }.
 */
function buildCondition(c) {
  switch (c.k) {
    case 'style':
      return { games: 2, a: plainPolicy(styleOf(c.on)), b: plainPolicy(styleOf(c.off)) }
    case 'handicap':
      // A is clean, B is handicapped, so a POSITIVE delta means the handicap cost something.
      return { games: 2, a: plainPolicy(styleOf(c.style)), b: handicapPolicy(styleOf(c.style), c.eps, 101) }
    case 'symnull':
      // Both arms handicapped at the same magnitude on different streams: differs, but zero.
      return {
        games: 2,
        a: handicapPolicy(styleOf(c.style), c.eps, 211),
        b: handicapPolicy(styleOf(c.style), c.eps, 977),
      }
    case 'abnull':
      return { games: 2, a: abNullPolicy(c.lambda), b: plainPolicy(AB_STYLE) }
    case 'gauntlet':
      return {
        games: 4,
        dod: {
          on: plainPolicy(styleOf({ id: 'balanced' })),
          off: plainPolicy(styleOf({ id: 'balanced', patch: { defuse: 0 } })),
          opp: plainPolicy(styleOf({ id: c.opp })),
        },
      }
    default:
      throw new Error(`unknown condition ${c.k}`)
  }
}

// ---------------------------------------------------------------------------------------------
// the game loop — identical in structure to probe-verify.mjs / probe-gauntlet.mjs
// ---------------------------------------------------------------------------------------------

function playNet(seed, key, meTeam, polMe, polOpp) {
  let st = newGame(seed, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 6000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const pol = seatTeam(seat) === meTeam ? polMe : polOpp
    const r = reduce(st, pol(view, steps, key))
    if (!r.ok) return null
    st = r.state
    steps++
  }
  return st.phase === 'finished' ? st.score[meTeam] - st.score[1 - meTeam] : null
}

/** One bank of duplicate pairs. Returns the per-pair deltas, in the house's paired shape. */
function runBank(cond, bank, pairs) {
  const built = buildCondition(cond)
  const deltas = []
  let voided = 0
  for (let g = 0; g < pairs; g++) {
    const seed = `${bank}-${g}`
    const key = hash32(seed)
    if (built.dod) {
      const { on, off, opp } = built.dod
      const a0 = playNet(seed, key, 0, on, opp)
      const a1 = playNet(seed, key, 1, on, opp)
      const b0 = playNet(seed, key, 0, off, opp)
      const b1 = playNet(seed, key, 1, off, opp)
      if (a0 === null || a1 === null || b0 === null || b1 === null) {
        voided++
        continue
      }
      deltas.push(a0 + a1 - (b0 + b1))
    } else {
      const x = playNet(seed, key, 0, built.a, built.b)
      const y = playNet(seed, key, 1, built.a, built.b)
      if (x === null || y === null) {
        voided++
        continue
      }
      deltas.push(x + y)
    }
  }
  return { deltas, voided }
}

// ---------------------------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------------------------

function stats(d) {
  const n = d.length
  const mean = d.reduce((a, b) => a + b, 0) / Math.max(1, n)
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1))
  const se = sd / Math.sqrt(Math.max(1, n))
  return { n, mean, sd, se, ci: Z95 * se, excludesZero: Math.abs(mean) > Z95 * se }
}

const mde = (sd, n) => (MDE_K * sd) / Math.sqrt(n)
const fmt = (x, p = 4) => (x >= 0 ? ' ' : '') + x.toFixed(p)

// ---------------------------------------------------------------------------------------------
// the worker pool. One file only, so the worker is this file re-entered.
// ---------------------------------------------------------------------------------------------

if (!isMainThread) {
  parentPort.on('message', (job) => {
    if (job === null) {
      process.exit(0)
    }
    const { deltas, voided } = runBank(job.cond, job.bank, job.pairs)
    parentPort.postMessage({ id: job.id, deltas, voided })
  })
  parentPort.postMessage({ ready: true })
}

const POOL = Math.max(1, Math.min(Number(process.env.FLOOR_WORKERS ?? 20), availableParallelism()))

/** Run a list of jobs across the pool; resolves to results keyed by job id. */
function runJobs(jobs, label) {
  return new Promise((resolve, reject) => {
    const out = new Map()
    let next = 0
    let done = 0
    const t0 = Date.now()
    const workers = []
    const finish = () => {
      for (const w of workers) w.terminate()
      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      console.log(`  [${label}: ${jobs.length} banks, ${POOL} workers, ${secs}s]`)
      resolve(out)
    }
    for (let i = 0; i < Math.min(POOL, jobs.length); i++) {
      const w = new Worker(new URL(import.meta.url))
      workers.push(w)
      w.on('error', reject)
      w.on('message', (m) => {
        if (!m.ready) {
          out.set(m.id, m)
          done++
          if (done === jobs.length) return finish()
        }
        if (next < jobs.length) w.postMessage(jobs[next++])
      })
    }
  })
}

// ---------------------------------------------------------------------------------------------
// the conditions the published tables actually used
// ---------------------------------------------------------------------------------------------

const SD_CONDITIONS = [
  {
    name: 'defuse balanced (CONCESSION §3.1)',
    bank: 'floor-sd-defbal',
    cond: { k: 'style', on: { id: 'balanced' }, off: { id: 'balanced', patch: { defuse: 0 } } },
  },
  {
    name: 'defuse ghost (§3.1, narrowest)',
    bank: 'floor-sd-defghost',
    cond: { k: 'style', on: { id: 'ghost' }, off: { id: 'ghost', patch: { defuse: 0 } } },
  },
  {
    name: 'defuse archivist (§3.1, widest)',
    bank: 'floor-sd-defarch',
    cond: { k: 'style', on: { id: 'archivist' }, off: { id: 'archivist', patch: { defuse: 0 } } },
  },
  {
    name: 'conceal vs defusing opp (§5a.3)',
    bank: 'floor-sd-concdef',
    cond: { k: 'style', on: { id: 'balanced', patch: { conceal: 1 } }, off: { id: 'balanced' } },
  },
  {
    name: 'conceal vs NON-defusing opp (§5a.3)',
    bank: 'floor-sd-concplain',
    cond: {
      k: 'style',
      on: { id: 'balanced', patch: { defuse: 0, conceal: 1 } },
      off: { id: 'balanced', patch: { defuse: 0 } },
    },
  },
  {
    name: 'lopsided: balanced vs turtle',
    bank: 'floor-sd-lop',
    cond: { k: 'style', on: { id: 'balanced' }, off: { id: 'turtle' } },
  },
  {
    name: 'gauntlet DoD vs balanced (§3.3)',
    bank: 'floor-sd-gaunt',
    cond: { k: 'gauntlet', opp: 'balanced' },
  },
  {
    name: 'information-free null, lambda .25 (§2.1)',
    bank: 'floor-sd-abnull',
    cond: { k: 'abnull', lambda: 0.25 },
  },
  {
    name: 'planted edge, eps .02',
    bank: 'floor-sd-h02',
    cond: { k: 'handicap', style: { id: 'balanced' }, eps: 0.02 },
  },
  {
    name: 'symmetric null, eps .02',
    bank: 'floor-sd-sym02',
    cond: { k: 'symnull', style: { id: 'balanced' }, eps: 0.02 },
  },
]

const N_GRID = [150, 250, 300, 400, 600, 800, 1500, 2000, 4300]

// ---------------------------------------------------------------------------------------------
// stages
// ---------------------------------------------------------------------------------------------

async function stageControl() {
  console.log('=== CONTROLS — nothing below may be read if any of these is not exactly 0.0000 ===\n')
  const jobs = [
    {
      id: 'c-eps0',
      bank: 'floor-ctl-a',
      pairs: 200,
      cond: { k: 'handicap', style: { id: 'balanced' }, eps: 0 },
      label: 'planted-edge arm at eps = 0 vs the shipped policy',
    },
    {
      id: 'c-sym0',
      bank: 'floor-ctl-b',
      pairs: 200,
      cond: { k: 'symnull', style: { id: 'balanced' }, eps: 0 },
      label: 'symmetric-null arms at eps = 0 (both streams inert)',
    },
    {
      id: 'c-ab0',
      bank: 'floor-ctl-c',
      pairs: 200,
      cond: { k: 'abnull', lambda: 0 },
      label: 'probe-ab prototype ranker at lambda = 0 vs decide(defuse 0)',
    },
    {
      id: 'c-fid',
      bank: 'holdoutA',
      pairs: 400,
      cond: { k: 'style', on: { id: 'balanced' }, off: { id: 'balanced', patch: { defuse: 0 } } },
      label: 'FIDELITY: replays probe-verify.mjs 400 balanced holdoutA (published +1.4250 +/- 0.3179)',
    },
  ]
  const res = await runJobs(jobs, 'control')
  let ok = true
  for (const j of jobs) {
    const s = stats(res.get(j.id).deltas)
    const exact = Math.abs(s.mean) === 0 && s.sd === 0
    if (j.id !== 'c-fid' && !exact) ok = false
    console.log(`  ${j.label}`)
    console.log(
      `    ${fmt(s.mean)} +/- ${s.ci.toFixed(4)}   (n=${s.n} pairs, bank ${j.bank})` +
        (j.id === 'c-fid' ? '' : exact ? '   [EXACT]' : '   [*** NOT EXACT — STOP ***]'),
    )
  }
  console.log(`\n  byte-exact controls: ${ok ? 'ALL PASS' : 'FAILED'}\n`)
  return ok
}

async function stageSd(pairs) {
  console.log(`=== PART 1 — per-pair SD, and the analytic MDE curve (${pairs} pairs per condition) ===\n`)
  const jobs = SD_CONDITIONS.map((c, i) => ({ id: `sd-${i}`, bank: c.bank, pairs, cond: c.cond }))
  const res = await runJobs(jobs, 'sd')
  const rows = []
  console.log('  condition                                  mean +/- 1.96SE        SD    void')
  for (let i = 0; i < SD_CONDITIONS.length; i++) {
    const c = SD_CONDITIONS[i]
    const r = res.get(`sd-${i}`)
    const s = stats(r.deltas)
    rows.push({ name: c.name, sd: s.sd, mean: s.mean, n: s.n })
    console.log(
      `  ${c.name.padEnd(42)}${fmt(s.mean)} +/- ${s.ci.toFixed(4)}   ${s.sd.toFixed(3).padStart(7)}   ${String(r.voided).padStart(4)}`,
    )
  }
  const sds = rows.map((r) => r.sd)
  const lo = Math.min(...sds)
  const hi = Math.max(...sds)
  const bal = rows[0].sd
  console.log(`\n  SD range over the measured conditions: ${lo.toFixed(3)} .. ${hi.toFixed(3)}`)
  console.log(`  SE of each SD estimate is about SD/sqrt(2n) = ${(hi / Math.sqrt(2 * pairs)).toFixed(3)}\n`)
  console.log('  MDE(N) = (z.975 + z.80) * SD / sqrt(N), in sets per duplicate pair:\n')
  console.log(`      N     SD=${lo.toFixed(2)}(min)   SD=${bal.toFixed(2)}(defuse bal)   SD=${hi.toFixed(2)}(max)`)
  for (const n of N_GRID) {
    console.log(
      `  ${String(n).padStart(5)}      ${mde(lo, n).toFixed(4)}          ${mde(bal, n).toFixed(4)}             ${mde(hi, n).toFixed(4)}`,
    )
  }
  console.log('')
  return { lo, hi, bal, rows }
}

async function stageCalib(pairs) {
  console.log(`=== PART 2a — the planted edge: true size vs EPS (${pairs} pairs per point) ===\n`)
  const grid = [0.005, 0.01, 0.02, 0.03, 0.04, 0.06, 0.08]
  const jobs = grid.map((eps, i) => ({
    id: `cal-${i}`,
    bank: `floor-cal-${String(eps).replace('.', '')}`,
    pairs,
    cond: { k: 'handicap', style: { id: 'balanced' }, eps },
  }))
  const res = await runJobs(jobs, 'calib')
  console.log('    eps      true edge (clean - handicapped)       SD      MDE@400   MDE@800')
  const out = []
  for (let i = 0; i < grid.length; i++) {
    const s = stats(res.get(`cal-${i}`).deltas)
    out.push({ eps: grid[i], mean: s.mean, sd: s.sd })
    console.log(
      `  ${String(grid[i]).padStart(6)}    ${fmt(s.mean)} +/- ${s.ci.toFixed(4)}  (n=${s.n})   ${s.sd.toFixed(3)}   ${mde(s.sd, 400).toFixed(4)}    ${mde(s.sd, 800).toFixed(4)}`,
    )
  }
  console.log('')
  return out
}

async function stageDetect(banks, epsList) {
  console.log(
    `=== PART 2b — empirical detection rate, ${banks} independent banks of 800 pairs per EPS ===\n`,
  )
  console.log(
    '  Each bank of 800 pairs is also split into its two disjoint halves of 400, giving\n' +
      `  ${banks} independent estimates at N=800 and ${2 * banks} at N=400. Binomial SE on a rate near 0.8\n` +
      `  is ${Math.sqrt((0.8 * 0.2) / banks).toFixed(3)} at N=800 and ${Math.sqrt((0.8 * 0.2) / (2 * banks)).toFixed(3)} at N=400, which is why this many banks.\n`,
  )
  const jobs = []
  for (const eps of epsList) {
    for (let b = 0; b < banks; b++) {
      jobs.push({
        id: `det-${eps}-${b}`,
        bank: `floor-det-${String(eps).replace('.', '')}-${b}`,
        pairs: 800,
        cond: { k: 'handicap', style: { id: 'balanced' }, eps },
      })
    }
  }
  const res = await runJobs(jobs, 'detect')
  const table = []
  console.log(
    '     eps      true edge (pooled)         SD    det@400 (n banks)   det@800 (n banks)   MDE@400  MDE@800',
  )
  for (const eps of epsList) {
    const pooled = []
    let hit800 = 0
    let n800 = 0
    let hit400 = 0
    let n400 = 0
    for (let b = 0; b < banks; b++) {
      const d = res.get(`det-${eps}-${b}`).deltas
      pooled.push(...d)
      const s = stats(d)
      n800++
      if (s.excludesZero) hit800++
      const halves = [d.slice(0, Math.floor(d.length / 2)), d.slice(Math.floor(d.length / 2))]
      for (const h of halves) {
        const sh = stats(h)
        n400++
        if (sh.excludesZero) hit400++
      }
    }
    const p = stats(pooled)
    const r400 = hit400 / n400
    const r800 = hit800 / n800
    table.push({ eps, edge: p.mean, ci: p.ci, sd: p.sd, r400, r800, n400, n800 })
    console.log(
      `  ${String(eps).padStart(6)}   ${fmt(p.mean)} +/- ${p.ci.toFixed(4)}  ${p.sd.toFixed(3)}` +
        `   ${(100 * r400).toFixed(1).padStart(6)}% (${hit400}/${n400})` +
        `   ${(100 * r800).toFixed(1).padStart(6)}% (${hit800}/${n800})` +
        `   ${mde(p.sd, 400).toFixed(4)}   ${mde(p.sd, 800).toFixed(4)}`,
    )
  }
  console.log('')
  for (const n of [400, 800]) {
    const key = n === 400 ? 'r400' : 'r800'
    const ok = table.filter((t) => t[key] >= 0.8).sort((a, b) => a.edge - b.edge)[0]
    console.log(
      ok
        ? `  smallest planted TRUE effect detected >= 80% of the time at N=${n}: ${ok.edge.toFixed(4)} sets/pair (eps ${ok.eps}, ${(100 * ok[key]).toFixed(1)}%)`
        : `  no planted effect on this grid reached 80% detection at N=${n}`,
    )
  }
  console.log('')
  return table
}

async function stageFpr(banks) {
  console.log(`=== PART 3 — false-positive rate on true nulls that still move the game ===\n`)
  const arms = [
    { key: 'sym', name: 'symmetric null, eps .02 (exactly zero by exchangeability)', cond: { k: 'symnull', style: { id: 'balanced' }, eps: 0.02 } },
    { key: 'sym8', name: 'symmetric null, eps .08 (a much larger disturbance)', cond: { k: 'symnull', style: { id: 'balanced' }, eps: 0.08 } },
    { key: 'ab', name: "information-free null, lambda .25 (probe-ab.mjs's design)", cond: { k: 'abnull', lambda: 0.25 } },
  ]
  const jobs = []
  for (const a of arms) {
    for (let b = 0; b < banks; b++) {
      jobs.push({ id: `fpr-${a.key}-${b}`, bank: `floor-fpr-${a.key}-${b}`, pairs: 800, cond: a.cond })
    }
  }
  const res = await runJobs(jobs, 'fpr')
  const out = []
  for (const a of arms) {
    const pooled = []
    let h800 = 0
    let n800 = 0
    let h400 = 0
    let n400 = 0
    for (let b = 0; b < banks; b++) {
      const d = res.get(`fpr-${a.key}-${b}`).deltas
      pooled.push(...d)
      const s = stats(d)
      n800++
      if (s.excludesZero) h800++
      const halves = [d.slice(0, Math.floor(d.length / 2)), d.slice(Math.floor(d.length / 2))]
      for (const half of halves) {
        const sh = stats(half)
        n400++
        if (sh.excludesZero) h400++
      }
    }
    const p = stats(pooled)
    const rate400 = h400 / n400
    const rate800 = h800 / n800
    const seR = (r, n) => Math.sqrt((r * (1 - r)) / n)
    out.push({ ...a, pooled: p, rate400, rate800, n400, n800 })
    console.log(`  ${a.name}`)
    console.log(
      `    pooled true edge over ${p.n} pairs: ${fmt(p.mean)} +/- ${p.ci.toFixed(4)}   SD ${p.sd.toFixed(3)}`,
    )
    console.log(
      `    nominal-95% intervals excluding zero:  N=400 ${(100 * rate400).toFixed(1)}% (${h400}/${n400}, +/-${(100 * 1.96 * seR(rate400, n400)).toFixed(1)}pp)` +
        `   N=800 ${(100 * rate800).toFixed(1)}% (${h800}/${n800}, +/-${(100 * 1.96 * seR(rate800, n800)).toFixed(1)}pp)`,
    )
  }
  console.log('')
  return out
}

/**
 * Part 4. The committed claims, with the N they were measured at and the interval they were
 * published with. `ci` is the half-width exactly as printed; `sd` is derived from it where the
 * document quotes one, so a claim measured by a harness this probe cannot re-run is still
 * placed against its own noise level.
 */
const PUBLISHED = [
  { doc: 'CONCESSION §5a.3', claim: 'concealment vs NON-defusing opp (N unstated; 600)', n: 600, effect: -0.1483, ci: 0.2571, cond: 'conceal vs NON-defusing opp (§5a.3)' },
  { doc: 'CONCESSION §5a.3', claim: 'the same cell if it was really N=800', n: 800, effect: -0.1483, ci: 0.2571, cond: 'conceal vs NON-defusing opp (§5a.3)' },
  { doc: 'CONCESSION §5a.3', claim: 'concealment, headline (vs defusing)', n: 600, effect: 0.9683, ci: 0.2744, cond: 'conceal vs defusing opp (§5a.3)' },
  { doc: 'CONCESSION §6', claim: 'contained-pass aim, reported inert', n: 400, effect: -0.045, ci: 0.13, cond: null },
  { doc: 'CONCESSION §8', claim: 'third leg: plain beats concealment (sign only)', n: 800, effect: 0.15, ci: 0.26, cond: 'conceal vs NON-defusing opp (§5a.3)' },
  { doc: 'CONCESSION §3.1', claim: 'defusal, balanced, holdout A', n: 400, effect: 1.425, ci: 0.3179, cond: 'defuse balanced (CONCESSION §3.1)' },
  { doc: 'CONCESSION §4', claim: 'signalling replication', n: 1500, effect: -0.013, ci: 0.033, cond: null },
  { doc: 'CONCESSION §4', claim: 'signalling tie-break, bank A', n: 300, effect: 0.008, ci: 0.074, cond: null },
  { doc: 'BOUNDED §5a', claim: 'v1.5(balanced) - v1.0 at infinite budget', n: 2000, effect: -0.1255, ci: 0.059, cond: null },
  { doc: 'BOUNDED §5a', claim: 'v1.5(punter) - v1.0 at infinite budget', n: 2000, effect: 0.1485, ci: 0.0852, cond: null },
  { doc: 'BOUNDED §5a', claim: 'memory cost alone at 96 bits', n: 2000, effect: -0.003, ci: 0.0052, cond: null },
  { doc: 'CROSSPLAY §2', claim: 'fishbot cell, 4.23/4.77 sets -> net per pair', n: 150, effect: -1.08, ci: null, cond: 'defuse balanced (CONCESSION §3.1)' },
  { doc: 'CROSSPLAY §2', claim: 'detective cell, 4.31/4.69 -> net per pair', n: 150, effect: -0.76, ci: null, cond: 'defuse balanced (CONCESSION §3.1)' },
  { doc: 'CROSSPLAY §2', claim: 'fishbot_v02 cell, 4.36/4.64 -> net per pair', n: 150, effect: -0.56, ci: null, cond: 'defuse balanced (CONCESSION §3.1)' },
  { doc: 'CROSSPLAY §2', claim: 'lockout cell, 4.43/4.57 -> net per pair', n: 150, effect: -0.28, ci: null, cond: 'defuse balanced (CONCESSION §3.1)' },
  { doc: 'task brief', claim: 'generation h2h v1.0 vs v0.5 (NOT FOUND in any committed doc)', n: 800, effect: 0.2475, ci: 0.1024, cond: null },
]

/**
 * What `sd` measured on 2026-08-31, 1200 pairs per condition, so that `published` can be run on
 * its own without paying for part 1 again. Re-run `sd` if the engine moves.
 */
const MEASURED_SD = {
  'defuse balanced (CONCESSION §3.1)': 3.321,
  'defuse ghost (§3.1, narrowest)': 3.237,
  'defuse archivist (§3.1, widest)': 3.428,
  'conceal vs defusing opp (§5a.3)': 3.428,
  'conceal vs NON-defusing opp (§5a.3)': 3.363,
  'lopsided: balanced vs turtle': 3.438,
  'gauntlet DoD vs balanced (§3.3)': 3.364,
  'information-free null, lambda .25 (§2.1)': 3.150,
  'planted edge, eps .02': 2.549,
  'symmetric null, eps .02': 2.959,
}

function stagePublished(sdInfo) {
  console.log('=== PART 4 — the floor applied to the numbers already published ===\n')
  const byCond = new Map(sdInfo ? sdInfo.rows.map((r) => [r.name, r.sd]) : Object.entries(MEASURED_SD))
  console.log('  "own SD" is this probe\'s measured SD for that exact matchup where it could re-run it;')
  console.log('  otherwise the SD implied by the published half-width, SD = ci * sqrt(N) / 1.96.\n')
  console.log('  a ci marked * was NOT published: it is the interval that N would have carried at this SD.\n')
  console.log('  document           claim                                        N    effect     ci      SD    MDE(N)   verdict')
  for (const p of PUBLISHED) {
    const own = p.cond ? byCond.get(p.cond) : undefined
    // No published interval: fall back to this probe's own SD for the nearest matchup, which is
    // the only honest thing to do with a point estimate that shipped without one.
    const sd = p.ci === null ? (own ?? 3.321) : (own ?? (p.ci * Math.sqrt(p.n)) / Z95)
    const m = mde(sd, p.n)
    const ciShown = p.ci === null ? (Z95 * sd) / Math.sqrt(p.n) : p.ci
    const sig = Math.abs(p.effect) > ciShown
    // "resolved" requires BOTH that the published interval excluded zero AND that the effect is
    // at or above the 80%-power floor. An effect that clears its own interval but not the floor
    // was found by a design that would have missed it more often than not, and saying so is the
    // whole point of this probe.
    const above = Math.abs(p.effect) >= m
    const verdict = sig
      ? above
        ? 'resolved'
        : `NOMINAL ONLY — underpowered (|eff| ${Math.abs(p.effect).toFixed(3)} < MDE ${m.toFixed(3)})`
      : above
        ? 'null, above floor'
        : `BELOW FLOOR (|eff| ${Math.abs(p.effect).toFixed(3)} < MDE ${m.toFixed(3)})`
    console.log(
      `  ${p.doc.padEnd(18)} ${p.claim.padEnd(44)} ${String(p.n).padStart(4)} ${fmt(p.effect, 4)} ${ciShown.toFixed(4)}${p.ci === null ? '*' : ' '} ${sd.toFixed(3).padStart(7)} ${m.toFixed(4)}   ${verdict}${own ? '  [own SD]' : ''}`,
    )
  }
  console.log('')
  console.log('  N required for 80% power against the effect actually reported:\n')
  for (const p of PUBLISHED) {
    if (p.effect === null || p.effect === 0) continue
    const own = p.cond ? byCond.get(p.cond) : undefined
    const sd = p.ci === null ? (own ?? 3.321) : (own ?? (p.ci * Math.sqrt(p.n)) / Z95)
    const need = Math.ceil((MDE_K * sd / Math.abs(p.effect)) ** 2)
    console.log(
      `    ${p.doc.padEnd(18)} ${p.claim.padEnd(44)} measured at N=${String(p.n).padStart(4)}, needs N=${String(need).padStart(7)}  (x${(need / p.n).toFixed(1)})`,
    )
  }
  console.log('')
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const stage = process.argv[2] ?? 'all'
  console.log(`probe-floor.mjs — detection floor of the duplicate-pair instrument, us54`)
  console.log(`node ${process.version}, pool ${POOL}, stage "${stage}", started ${new Date().toISOString()}\n`)
  let sdInfo = null
  if (stage === 'control' || stage === 'all') {
    const ok = await stageControl()
    if (!ok && stage === 'all') {
      console.log('CONTROL FAILED — refusing to report any measurement off a confounded arm.')
      return
    }
  }
  if (stage === 'sd' || stage === 'all') sdInfo = await stageSd(Number(process.argv[3] ?? 1200))
  if (stage === 'calib' || stage === 'all') await stageCalib(Number(process.argv[3] ?? 2000))
  if (stage === 'detect' || stage === 'all') {
    const banks = Number(process.argv[3] ?? 36)
    await stageDetect(banks, [0.005, 0.01, 0.02, 0.03, 0.04, 0.06])
  }
  if (stage === 'fpr' || stage === 'all') await stageFpr(Number(process.argv[3] ?? 50))
  if (stage === 'published' || stage === 'all') stagePublished(sdInfo)
  console.log(`done ${new Date().toISOString()}`)
}

if (isMainThread) {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e)
      process.exit(1)
    },
  )
}
