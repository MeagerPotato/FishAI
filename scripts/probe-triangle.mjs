/**
 * probe-triangle.mjs — CONCESSION.md §8's intransitive triangle, measured in ONE sweep.
 * Scratch measurement, NOT part of the shipped lab.
 *
 * ## Why this probe exists
 *
 * CONCESSION.md §8 reports a three-cornered non-transitivity among the concession settings:
 *
 *   | defusal beats plain        | +1.92 +/- 0.31 | ASKING.md §6 (probe-licence3, bank licA, 400 pairs)
 *   | concealment beats defusal  | +0.97 +/- 0.27 | CONCESSION.md §5a.3 (probe-conceal, 600 pairs)
 *   | plain beats concealment    | +0.15 +/- 0.26 | CONCESSION.md §5a.3, "against opponents that do NOT defuse"
 *
 * and §9 says what is wrong with it: *"Two of its three legs are measured; the third is only a
 * sign."* The deeper problem is that the three legs were measured at different times, at different
 * sample sizes, on different banks, through two different harnesses (`probe-licence3.mjs`'s mirror
 * of `pickAsk` for leg 1, `probe-conceal.mjs`'s straight `decide` A/B for legs 2 and 3), and — the
 * part that matters most — **against two different definitions of "the concealing arm"**:
 *
 *   - leg 2's concealing arm carries `defuse: 1` as well (it is the roster style with `conceal: 1`
 *     spread over it, `probe-conceal.mjs`'s ON arm at its default DEFUSE), so it is *defuse+conceal*;
 *   - leg 3's concealing arm carries `defuse: 0` (`probe-conceal.mjs ... DEFUSE=0`), so it is
 *     *conceal-only*.
 *
 * A cycle assembled from three incommensurable measurements of two different objects is not a
 * cycle. This probe measures the legs in one sweep: same base style, same N, same rule set, same
 * estimator, disjoint held-out banks drawn the same way, and **one code path** — `runCell` below —
 * with nothing changing between legs except which two frozen style objects it is handed.
 *
 * ## The two readings, and both are measured
 *
 * The task's arms are named "defuse-only", "conceal-only" and "plain", which fixes the PRIMARY
 * reading as the three pure corners of the {defuse, conceal} square:
 *
 *   P  = balanced, defuse 0, conceal absent          — plain
 *   D  = balanced as the roster ships it (defuse 1)  — defuse-only
 *   C  = balanced, defuse 0, conceal 1               — conceal-only
 *
 * Under that reading leg 3 (P vs C) is exactly §5a.3's "against opponents that do NOT defuse" row
 * re-run on a fresh bank, leg 1 (D vs P) is exactly probe-verify.mjs's comparison, and leg 2
 * (C vs D) is a cell **nobody has measured**: §5a.3's +0.97 is (D+C) vs D, not C vs D.
 *
 * So the ALTERNATIVE reading — the one that reproduces §8's published leg 2 — is also run, with
 * the concealing corner replaced by
 *
 *   DC = balanced, defuse 1, conceal 1               — defuse+conceal
 *
 * used consistently in BOTH of its legs (DC vs D and P vs DC). Reported as leg 2' and leg 3'.
 * Consistency is the point: §8 as published uses DC for its leg 2 and C for its leg 3, so the
 * published triangle is not a triangle over any single object.
 *
 * ## The control
 *
 * Two of them, because the printed one is weaker than it looks.
 *
 *  1. **Decision-level byte-exactness** (`--verify`, and run automatically before the sweep). At
 *     every decision of every game of a warm-up bank, `decide(view, P0)` must be byte-identical to
 *     `decide(view, P)`, where `P0` writes both appetites out as explicit zeros and `P` carries
 *     `defuse: 0` with the `conceal` field absent entirely. This is the control that actually has
 *     content: it proves the zero-appetite arm IS the shipped policy, object shape and all.
 *  2. **The printed paired control** — the P0 vs P cell, which must print `0.0000 +/- 0.0000`. On
 *     duplicate deals two identical policies cancel orientation for orientation, so this is
 *     simultaneously the appetite-zero control and a check that the pairing itself is sound. The
 *     D-vs-itself symmetry cell is the same check with a non-trivial policy on both sides
 *     (CONCESSION.md §3.3 note 1 uses exactly this cell as its internal-validity check).
 *
 * ## Sizing
 *
 * The published legs report CI half-widths of 0.31 at 400 pairs and 0.27 at 600, i.e. an observed
 * SD of the paired difference of about 3.3 sets per pair. To resolve an effect of 0.2 sets per pair
 * with a comfortable margin rather than marginally:
 *
 *     halfwidth(N) = 1.96 * 3.3 / sqrt(N)  =>  N = 1050 for halfwidth 0.20 (bare detection)
 *                                              N = 4200 for halfwidth 0.10 (0.2 clears by 2x)
 *
 * The default is therefore **4000 pairs per leg**, which is 10x leg 1's published N and ~6.7x
 * legs 2 and 3's. Each cell's own observed SD is printed beside its result, together with the N
 * that its own point estimate would have needed to clear zero, so a null leg reports its own
 * required sample size rather than leaving the reader to compute it.
 *
 * ## Estimator
 *
 * probe-verify.mjs's, unchanged. Every seed is played in both orientations (arm X on team 0, then
 * arm X on team 1) so the deal is never a confound (BOT_LAB.md §5.1), and the statistic is the
 * paired set-difference per duplicate pair:
 *
 *     d_g = (X_sets - Y_sets)[X on team 0]  +  (X_sets - Y_sets)[X on team 1]
 *
 * reported as `mean +/- 1.96 * SE  (n=PAIRS)`. Win rate counts both games of every pair.
 *
 * ## Banks
 *
 * Fresh prefixes, disjoint from every bank already in use (`style-v1`, `exploit-v1`,
 * `exploit-eval-v1`, `holdoutA`, `holdoutB`, `genholdout`, `lic3`, `licA`, `mirror-test`,
 * `concealA`, `nullA`, `gauntlet`): every cell draws `${bank}-${g}` from its own `tri-*` prefix,
 * all drawn the same way, so no two legs share a deal.
 *
 * ## Usage
 *
 *   node scripts/probe-triangle.mjs [PAIRS] [WORKERS]
 *   node scripts/probe-triangle.mjs --verify [GAMES]     # the byte-exactness control alone
 *
 *   PAIRS    duplicate pairs per cell (default 4000)
 *   WORKERS  worker threads (default 8; the machine has 24 cores but siblings load them)
 *
 * The file is its own worker (`isMainThread` branch at the bottom), because this probe's file set
 * is one file.
 */
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { newGame, reduce, seatView, us54Config, seatTeam } from '../lib/engine/index.ts'
import { decide } from '../lib/engine/bots/decide.ts'
import { STYLE_ROSTER } from '../lib/engine/bots/roster.ts'

const config = us54Config
const BAL = STYLE_ROSTER.balanced

// ---------------------------------------------------------------------------
// The arms. Every cell of the sweep is a pair of these and nothing else changes.
// ---------------------------------------------------------------------------
const ARMS = {
  /** plain — the roster style with the defusal appetite off and no `conceal` field at all. */
  P: Object.freeze({ ...BAL, defuse: 0 }),
  /** defuse-only — the roster style exactly as `roster.ts` ships it (`defuse: 1`, no `conceal`). */
  D: BAL,
  /** conceal-only — concealment on its own, with the defusal appetite off. */
  C: Object.freeze({ ...BAL, defuse: 0, conceal: 1 }),
  /** defuse+conceal — §5a.3's ON arm; the object §8's published leg 2 actually measured. */
  DC: Object.freeze({ ...BAL, conceal: 1 }),
  /** plain, with BOTH appetites written out as explicit zeros — the byte-exact control arm. */
  P0: Object.freeze({ ...BAL, defuse: 0, conceal: 0 }),
}

const DESC = {
  P: 'plain          defuse 0, conceal absent',
  D: 'defuse-only    defuse 1, conceal absent  (= STYLE_ROSTER.balanced)',
  C: 'conceal-only   defuse 0, conceal 1',
  DC: 'defuse+conceal defuse 1, conceal 1',
  P0: 'plain(zeros)   defuse 0, conceal 0 written out',
}

const CELLS = [
  { key: 'leg1', x: 'D', y: 'P', bank: 'tri-dp', title: "LEG 1   defuse-only   vs  plain" },
  { key: 'leg2', x: 'C', y: 'D', bank: 'tri-cd', title: "LEG 2   conceal-only  vs  defuse-only" },
  { key: 'leg3', x: 'P', y: 'C', bank: 'tri-pc', title: "LEG 3   plain         vs  conceal-only" },
  { key: 'leg2alt', x: 'DC', y: 'D', bank: 'tri-dcd', title: "LEG 2'  defuse+conceal vs defuse-only   (alt reading)" },
  { key: 'leg3alt', x: 'P', y: 'DC', bank: 'tri-pdc', title: "LEG 3'  plain          vs defuse+conceal (alt reading)" },
  // The sixth edge. Nothing in §8 asks for it, but the follow-on question in §9 is about the
  // COUNTER TABLE, and a counter table is a tournament rather than three legs: `adaptive.ts`
  // best-responds over the whole matrix, so the missing edge is the difference between "no cycle
  // among these three" and "and here is the row that dominates". With this cell the four arms
  // {P, D, C, DC} have all 6 of their pairs measured.
  { key: 'leg4', x: 'DC', y: 'C', bank: 'tri-dcc', title: 'EDGE 6  defuse+conceal vs conceal-only  (completes the 4x4)' },
  { key: 'control', x: 'P0', y: 'P', bank: 'tri-ctl', title: 'CONTROL zero-appetite, must print 0.0000 +/- 0.0000' },
  { key: 'symm', x: 'D', y: 'D', bank: 'tri-sym', title: 'SYMMETRY defuse-only against itself, must print 0.0000 +/- 0.0000', pairs: 400 },
]

// ---------------------------------------------------------------------------
// The one code path. Every leg, both readings, and both controls go through it.
// ---------------------------------------------------------------------------

/** One game. `xTeam` is the team playing `styleX`; the other team plays `styleY`. */
function play(seed, styleX, styleY, xTeam) {
  let st = newGame(seed, config, 0)
  let steps = 0
  while (st.phase !== 'finished' && steps < 6000) {
    const seat = st.declareWindow ? st.declareWindow.option : st.turn
    const view = seatView(st, seat)
    const style = seatTeam(seat) === xTeam ? styleX : styleY
    const r = reduce(st, decide(view, style, steps))
    if (!r.ok) return null
    st = r.state
    steps++
  }
  return st.phase === 'finished' ? { x: st.score[xTeam], y: st.score[1 - xTeam] } : null
}

/** One contiguous slice of one cell's seed bank, played in both orientations. */
function runChunk(job) {
  const X = ARMS[job.x]
  const Y = ARMS[job.y]
  const d = []
  let xW = 0, yW = 0, xS = 0, yS = 0, voided = 0
  for (let g = job.from; g < job.to; g++) {
    const a = play(`${job.bank}-${g}`, X, Y, 0)
    const b = play(`${job.bank}-${g}`, X, Y, 1)
    if (!a || !b) { voided++; continue }
    xS += a.x + b.x
    yS += a.y + b.y
    xW += (a.x > a.y ? 1 : 0) + (b.x > b.y ? 1 : 0)
    yW += (a.x < a.y ? 1 : 0) + (b.x < b.y ? 1 : 0)
    d.push((a.x - a.y) + (b.x - b.y))
  }
  return { key: job.key, seq: job.seq, d, xW, yW, xS, yS, voided }
}

// ---------------------------------------------------------------------------
// Worker branch — the file is its own worker.
// ---------------------------------------------------------------------------
if (!isMainThread) {
  parentPort.postMessage(workerData.jobs.map(runChunk))
} else {
  await main()
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------
function stats(d) {
  const n = d.length
  if (n < 2) return { n, mean: 0, sd: 0, ci: 0 }
  const mean = d.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1))
  return { n, mean, sd, ci: (1.96 * sd) / Math.sqrt(n) }
}

/** Pairs needed for a 95% interval of half-width `h`, at the observed SD. */
function pairsFor(sd, h) {
  if (!(h > 0)) return Infinity
  return Math.ceil(((1.96 * sd) / h) ** 2)
}

// A function declaration, not a const arrow: `main` runs from the top-level `await` above, which is
// evaluated before any `const` below it has left its temporal dead zone.
function f(x, w = 8) {
  return x.toFixed(4).padStart(w)
}

// ---------------------------------------------------------------------------
// The byte-exactness control, at the decision level
// ---------------------------------------------------------------------------
/**
 * Assert that the zero-appetite arm reproduces the shipped policy move for move. `P0` carries both
 * appetites as explicit zeros; `P` carries `defuse: 0` and no `conceal` field. They are different
 * objects and must decide identically at every position, or every arm in the sweep is confounded by
 * the object shape rather than by the mechanism.
 *
 * Also asserted, because it is the same claim about the other corner: `C` at `conceal: 0` and `D`
 * at `defuse: 0` must both collapse onto `P`.
 */
function verifyByteExact(games, bank) {
  const C0 = Object.freeze({ ...BAL, defuse: 0, conceal: 0 })
  const D0 = Object.freeze({ ...BAL, defuse: 0 })
  let checked = 0
  for (let g = 0; g < games; g++) {
    let st = newGame(`${bank}-${g}`, config, 0)
    let steps = 0
    while (st.phase !== 'finished' && steps < 6000) {
      const seat = st.declareWindow ? st.declareWindow.option : st.turn
      const view = seatView(st, seat)
      const ref = JSON.stringify(decide(view, ARMS.P, steps))
      for (const [name, style] of [['P0', ARMS.P0], ['C@conceal=0', C0], ['D@defuse=0', D0]]) {
        const got = JSON.stringify(decide(view, style, steps))
        if (got !== ref) {
          throw new Error(
            `zero-appetite arm ${name} != shipped policy at game ${g} step ${steps}\n  ${got}\n  ${ref}`,
          )
        }
      }
      checked++
      const r = reduce(st, decide(view, ARMS.P, steps))
      if (!r.ok) break
      st = r.state
      steps++
    }
  }
  return checked
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2)
  if (argv[0] === '--verify') {
    const games = Number(argv[1] ?? 60)
    const n = verifyByteExact(games, 'tri-verify')
    console.log(`byte-exact control: ${n} decisions over ${games} games — zero-appetite arms are the shipped policy, exactly`)
    return
  }

  const PAIRS = Number(argv[0] ?? 4000)
  const WORKERS = Number(argv[1] ?? 8)
  const CHUNK = 250
  const t0 = Date.now()

  console.log('probe-triangle.mjs — CONCESSION.md §8 intransitive triangle, one sweep')
  console.log(`rule set us54, base style balanced, ${PAIRS} duplicate pairs per leg, ${WORKERS} workers`)
  console.log('')
  console.log('arms')
  for (const k of ['P', 'D', 'C', 'DC', 'P0']) console.log(`  ${k.padEnd(3)} ${DESC[k]}`)
  console.log('')

  // --- control 1: byte-exactness at the decision level, before anything is scored -------------
  const checked = verifyByteExact(60, 'tri-verify')
  console.log(`control (decision level): ${checked} decisions over 60 games — P0, C@conceal=0 and D@defuse=0`)
  console.log('                          all reproduce the shipped policy byte-for-byte. PASS')
  console.log('')

  // --- build the job list ---------------------------------------------------------------------
  const jobs = []
  for (const cell of CELLS) {
    const n = cell.pairs ?? PAIRS
    let seq = 0
    for (let from = 0; from < n; from += CHUNK) {
      jobs.push({ key: cell.key, x: cell.x, y: cell.y, bank: cell.bank, from, to: Math.min(from + CHUNK, n), seq: seq++ })
    }
  }

  // --- dispatch, round-robin so every worker gets a mix of cells -------------------------------
  const slices = Array.from({ length: WORKERS }, () => [])
  jobs.forEach((j, i) => slices[i % WORKERS].push(j))
  const results = await Promise.all(
    slices.filter((s) => s.length > 0).map(
      (s) =>
        new Promise((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { jobs: s } })
          w.on('message', resolve)
          w.on('error', reject)
          w.on('exit', (code) => { if (code !== 0) reject(new Error(`worker exit ${code}`)) })
        }),
    ),
  )

  // --- merge, in seq order so the sums are deterministic ---------------------------------------
  const merged = new Map()
  for (const cell of CELLS) merged.set(cell.key, { chunks: [], xW: 0, yW: 0, xS: 0, yS: 0, voided: 0 })
  for (const batch of results) {
    for (const r of batch) {
      const m = merged.get(r.key)
      m.chunks[r.seq] = r.d
      m.xW += r.xW; m.yW += r.yW; m.xS += r.xS; m.yS += r.yS; m.voided += r.voided
    }
  }

  const out = new Map()
  for (const cell of CELLS) {
    const m = merged.get(cell.key)
    const d = m.chunks.flat()
    out.set(cell.key, { cell, ...m, d, ...stats(d) })
  }

  // --- report -----------------------------------------------------------------------------------
  console.log('=== cells ===================================================================')
  console.log('')
  for (const cell of CELLS) {
    const r = out.get(cell.key)
    const wr = (100 * r.xW) / (2 * Math.max(1, r.n))
    console.log(cell.title)
    console.log(`  bank ${cell.bank}   sets ${r.xS} vs ${r.yS}   wins ${r.xW} vs ${r.yW}   win rate ${wr.toFixed(2)}%`)
    console.log(`  paired set-difference ${f(r.mean)} +/- ${r.ci.toFixed(4)}   (n=${r.n} pairs, ${r.voided} void, sd ${r.sd.toFixed(3)})`)
    if (r.sd > 0) {
      console.log(`  at this sd: ${pairsFor(r.sd, 0.2)} pairs resolve 0.20; this point estimate needs ${Number.isFinite(pairsFor(r.sd, Math.abs(r.mean))) ? pairsFor(r.sd, Math.abs(r.mean)) : 'infinitely many'} pairs to clear zero`)
    }
    console.log('')
  }

  // --- the controls, judged --------------------------------------------------------------------
  const ctl = out.get('control')
  const sym = out.get('symm')
  const ctlOk = ctl.mean === 0 && ctl.sd === 0
  const symOk = sym.mean === 0 && sym.sd === 0
  console.log('=== controls ================================================================')
  console.log(`  zero-appetite (P0 vs P) : ${f(ctl.mean)} +/- ${ctl.ci.toFixed(4)}  ${ctlOk ? 'PASS' : 'FAIL — every number above is confounded'}`)
  console.log(`  symmetry      (D vs D)  : ${f(sym.mean)} +/- ${sym.ci.toFixed(4)}  ${symOk ? 'PASS' : 'FAIL — the pairing is not sound'}`)
  console.log('')

  // --- the verdict -------------------------------------------------------------------------------
  for (const [name, keys] of [
    ['PRIMARY  (pure corners: conceal-only carries defuse 0)', ['leg1', 'leg2', 'leg3']],
    ["ALTERNATIVE (concealing arm carries defuse 1 in BOTH its legs)", ['leg1', 'leg2alt', 'leg3alt']],
  ]) {
    console.log(`=== verdict — ${name} ===`)
    const rows = keys.map((k) => out.get(k))
    let closes = true
    for (const r of rows) {
      const lo = r.mean - r.ci
      const hi = r.mean + r.ci
      const sig = lo > 0 ? 'excludes zero, positive' : hi < 0 ? 'excludes zero, NEGATIVE' : 'straddles zero'
      if (!(lo > 0)) closes = false
      console.log(`  ${r.cell.title.slice(0, 46).padEnd(46)} ${f(r.mean)}  [${(lo).toFixed(4)}, ${(hi).toFixed(4)}]  ${sig}`)
    }
    if (closes) {
      const binding = rows.reduce((a, b) => (a.mean - a.ci < b.mean - b.ci ? a : b))
      console.log(`  CYCLE SURVIVES. All three legs positive with intervals excluding zero.`)
      console.log(`  binding margin (the smallest, and all a counter-table exploit has to work with):`)
      console.log(`    ${binding.cell.title.trim()}  =  ${binding.mean.toFixed(4)} +/- ${binding.ci.toFixed(4)}`)
    } else {
      console.log('  CYCLE NOT ESTABLISHED at this N — at least one leg fails to close the loop.')
      for (const r of rows) {
        const lo = r.mean - r.ci
        if (lo > 0) continue
        if (r.mean <= 0) {
          console.log(`    ${r.cell.key}: point estimate ${r.mean.toFixed(4)} has the WRONG SIGN; no N rescues the loop.`)
        } else {
          console.log(`    ${r.cell.key}: right sign, straddles zero; ${pairsFor(r.sd, r.mean)} pairs would clear it at this sd ${r.sd.toFixed(3)}.`)
        }
      }
    }
    console.log('')
  }

  // --- the full tournament, which is what a counter table actually is -------------------------
  // §9 asks what these numbers imply for `counter-table.ts`. A counter table is a matrix, not three
  // legs, and ADAPTIVE.md's degeneracy verdict is a statement about that matrix: best-response over
  // it collapses to a constant iff some row weakly dominates every column. So print the matrix and
  // test the condition directly rather than inferring it from the cycle verdict.
  const TOURNEY = ['P', 'D', 'C', 'DC']
  const EDGE_OF = {
    leg1: ['D', 'P'], leg2: ['C', 'D'], leg3: ['P', 'C'],
    leg2alt: ['DC', 'D'], leg3alt: ['P', 'DC'], leg4: ['DC', 'C'],
  }
  const edge = (a, b) => {
    for (const [key, [x, y]] of Object.entries(EDGE_OF)) {
      const r = out.get(key)
      if (!r) continue
      if (x === a && y === b) return { m: r.mean, ci: r.ci }
      if (x === b && y === a) return { m: -r.mean, ci: r.ci }
    }
    return null
  }
  console.log('=== the 4x4 tournament (row minus column, sets per duplicate pair) ===========')
  console.log('             ' + TOURNEY.map((c) => c.padStart(9)).join(''))
  for (const r of TOURNEY) {
    let line = '  ' + r.padEnd(11)
    for (const c of TOURNEY) {
      if (r === c) { line += '        .'; continue }
      const e = edge(r, c)
      line += e === null ? '        ?' : e.m.toFixed(3).padStart(9)
    }
    console.log(line)
  }
  console.log('')
  // Weak dominance: a row that beats or ties every other row head to head, interval-wise.
  for (const r of TOURNEY) {
    const others = TOURNEY.filter((c) => c !== r)
    const es = others.map((c) => edge(r, c)).filter((e) => e !== null)
    if (es.length !== others.length) { console.log(`  ${r}: incomplete row, cannot judge dominance`); continue }
    const beatsAll = es.every((e) => e.m - e.ci > 0)
    const losesAny = es.some((e) => e.m + e.ci < 0)
    console.log(
      `  ${r.padEnd(3)} vs the other three: ${es.map((e) => e.m.toFixed(3).padStart(7)).join(' ')}   ` +
        (beatsAll
        ? 'DOMINANT ROW — best response over this table is a constant, which is exactly ADAPTIVE.md degeneracy'
        : losesAny
          ? 'loses to at least one'
          : 'mixed'),
    )
  }
  console.log('')

  // --- against the published figures ---------------------------------------------------------
  console.log('=== against the published figures ===========================================')
  const pub = [
    ['leg1', +1.915, 'ASKING.md §6 / CONCESSION.md §8   defusal beats plain'],
    ['leg2alt', +0.9683, 'CONCESSION.md §5a.3 headline      concealment beats defusal (D+C vs D)'],
    ['leg3', +0.1483, 'CONCESSION.md §5a.3 non-defusing   plain beats concealment (sign-flipped)'],
  ]
  for (const [key, was, where] of pub) {
    const r = out.get(key)
    console.log(`  ${where}`)
    console.log(`    published ${f(was)}   this sweep ${f(r.mean)} +/- ${r.ci.toFixed(4)}   delta ${f(r.mean - was)}`)
  }
  console.log('')
  console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}
