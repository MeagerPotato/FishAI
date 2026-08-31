/**
 * probe-v15-clean.mjs — scratch: FishAI v1.5 (bounded-memory, POST-concession) against FishAI
 * v1.0 (adaptive) taken from a **pre-concession** tree, on duplicate deals.
 *
 * ## Why this file exists beside probe-v15-h2h.mjs
 *
 * `probe-v15-h2h.mjs` drives both arms from one module graph. That is correct only while both
 * generations live in the same tree. They no longer do: the concession layer set `defuse: 1` on
 * all nine `STYLE_ROSTER` entries, and BOTH policy shapes resolve through that roster —
 * `resolveWithView` looks up `STYLE_ROSTER[chooseStyle(...)]` for an `AdaptiveSpec` and
 * `STYLE_ROSTER[spec.style]` for a `BoundedSpec`. So a "v1.0" seat driven by the current tree is
 * v1.0 *plus* defusal, and a v1.5-vs-v1.0 run on one tree measures the new mechanism against
 * itself.
 *
 * This probe therefore loads **two module graphs**: policy from a post-concession export and
 * policy from a pre-concession export, and lets any seat be driven by either. The engine core
 * (`reduce`, `cards`, `variants`, `helpers`, `deal`, `rng`, `views`, `invariants`, and all of
 * `lib/lab`) is byte-identical between the two commits — verified with `diff -rq` — so one
 * engine can legitimately drive both policies. Only `lib/engine/bots/{decide,index,roster,
 * style}.ts` differ, plus the three added files `defuse.ts`, `conceal.ts`, `threat.ts`.
 *
 * ## Preparing the two trees
 *
 *   git archive -o new.tar <post-concession-commit> lib && tar -xf new.tar -C <NEWTREE>
 *   git archive -o old.tar 5566e6e                  lib && tar -xf old.tar -C <OLDTREE>
 *
 * then point `FISHAI_NEWTREE` / `FISHAI_OLDTREE` at those directories (each must contain `lib/`).
 *
 * ## The game loop
 *
 * Hand-rolled rather than `playGameSeats`, because that entry point calls the `decide` of its own
 * tree and cannot mix. It is otherwise the lab's loop: the acting seat comes from
 * `legalActionsSummary` (under `us54` that is the declare-window option seat, not the
 * turn-holder), `decide` is seeded exactly as the lab seeds it — `hashSeed(seed:moveIndex)()` —
 * `checkInvariants` runs after every step, and an action `reduce` rejects is counted as `illegal`
 * and replaced by the same emergency action `lib/lab/play.ts` uses. Seeds and start seats come
 * from the lab's own `seedFor` / `startSeatFor`, so a bank here means what it means everywhere.
 *
 * ## The control
 *
 * `ctrl-zero` runs the post-concession policy with both concession appetites zeroed
 * (`{...STYLE_ROSTER.balanced, defuse: 0, conceal: 0}`) against the pre-concession policy at the
 * same style. Zero appetite must reproduce the old tree byte-for-byte, so the cell must print
 * exactly `0.0000 +/- 0.0000`. `ctrl-mirror` is the harness's own symmetry check. If either is
 * non-zero the arms are confounded and every number below is void.
 *
 * Usage: node scripts/probe-v15-clean.mjs <pairs> <bank> [out.json]
 */
import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import { cpus } from 'node:os'
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'

const SCRATCH =
  'C:/Users/allen/AppData/Local/Temp/claude/C--Projects-FishAI--claude-worktrees-fishbot-off-limits-reasoning-728065/dcc1289b-9c32-44c4-ba76-38b13b2cdb48/scratchpad'
const NEWTREE = process.env.FISHAI_NEWTREE ?? join(SCRATCH, 'newtree')
const OLDTREE = process.env.FISHAI_OLDTREE ?? join(SCRATCH, 'cleantree')

const url = (root, rel) => pathToFileURL(join(root, rel)).href

/* ------------------------------------------------------------------ the cells --- */

/**
 * An arm descriptor is `{ tree: 'new'|'old', spec }`, where `spec` is whatever `decide` accepts.
 * `tree` picks which module graph's `decide` and `STYLE_ROSTER` the seat runs on.
 */
const NEW_V15 = (bits, style = 'balanced') => ({ tree: 'new', spec: { bounded: true, bits, style } })
const OLD_V15 = (bits, style = 'balanced') => ({ tree: 'old', spec: { bounded: true, bits, style } })
const OLD_V10 = { tree: 'old', spec: { adaptive: true } }
const NEW_V10 = { tree: 'new', spec: { adaptive: true } } // v1.0 *plus* defusal — the trap
const OLD_STYLE = (id) => ({ tree: 'old', spec: { roster: id } })
const NEW_STYLE_ZEROED = (id) => ({ tree: 'new', spec: { roster: id, defuse: 0, conceal: 0 } })

const INF = 1_000_000
const LADDER = [0, 16, 32, 48, 64, 128, INF]

const cells = [
  // --- controls. Anything but exactly 0.0000 +/- 0.0000 voids the whole run. ---------------
  { id: 'ctrl-zero', a: NEW_STYLE_ZEROED('balanced'), b: OLD_STYLE('balanced') },
  { id: 'ctrl-mirror', a: OLD_V10, b: OLD_V10 },

  // --- the headline: updated v1.5 (balanced, inherits defuse 1) vs CLEAN v1.0 ---------------
  ...LADDER.map((bits) => ({ id: `c${bits}`, a: NEW_V15(bits), b: OLD_V10 })),

  // --- the same rungs against the CONTAMINATED v1.0, to price the trap directly -------------
  ...[64, INF].map((bits) => ({ id: `x${bits}`, a: NEW_V15(bits), b: NEW_V10 })),

  // --- what the concession layer did to the bounded agent itself ----------------------------
  ...[0, 32, 64, INF].map((bits) => ({ id: `s${bits}`, a: NEW_V15(bits), b: OLD_V15(bits) })),

  // --- the punter rung, matching BOUNDED.md 5a's second table -------------------------------
  ...[64, INF].map((bits) => ({ id: `p${bits}`, a: NEW_V15(bits, 'punter'), b: OLD_V10 })),
]

/* ---------------------------------------------------------------------- worker --- */

if (!isMainThread) {
  // The engine core is byte-identical across the two commits, so one copy drives both policies.
  const eng = await import(url(NEWTREE, 'lib/engine/index.ts'))
  const lab = await import(url(NEWTREE, 'lib/lab/index.ts'))
  const newBots = await import(url(NEWTREE, 'lib/engine/bots/decide.ts'))
  const newRoster = await import(url(NEWTREE, 'lib/engine/bots/roster.ts'))
  const oldBots = await import(url(OLDTREE, 'lib/engine/bots/decide.ts'))
  const oldRoster = await import(url(OLDTREE, 'lib/engine/bots/roster.ts'))

  const {
    ALL_SEATS,
    allBooks,
    bookCards,
    checkInvariants,
    clinchTarget,
    hashSeed,
    legalActionsSummary,
    legalAsks,
    newGame,
    reduce,
    seatTeam,
    seatView,
    teamSeats,
    us54Config,
  } = eng
  const { seedFor, startSeatFor } = lab

  const TREES = {
    new: { decide: newBots.decide, roster: newRoster.STYLE_ROSTER },
    old: { decide: oldBots.decide, roster: oldRoster.STYLE_ROSTER },
  }

  /** Descriptor -> `(view, seed) => GameAction`, bound to the right tree's `decide`. */
  function armOf(d) {
    const { decide, roster } = TREES[d.tree]
    let spec = d.spec
    if (spec.roster !== undefined) {
      const { roster: id, ...over } = spec
      spec = Object.keys(over).length > 0 ? { ...roster[id], ...over } : roster[id]
    }
    return (view, seed) => decide(view, spec, seed)
  }

  /** Byte-for-byte `lib/lab/play.ts`'s emergency action. Every use is counted and voids the run. */
  function emergencyAction(s) {
    const { seat, kinds } = legalActionsSummary(s)
    if (kinds.includes('ask')) {
      const asks = legalAsks(s, seat)
      if (asks.length > 0) return { type: 'ask', seat, target: asks[0].target, card: asks[0].card }
    }
    if (kinds.includes('decline')) return { type: 'decline', seat }
    if (kinds.includes('pass')) {
      const mates = teamSeats(seatTeam(seat))
      const to = mates.find((m) => m !== seat && s.hands[m].length > 0) ?? mates[0]
      return { type: 'pass', seat, to }
    }
    if (kinds.includes('designate')) {
      const opps = teamSeats(1 - seatTeam(seat))
      const to = opps.find((o) => s.hands[o].length > 0) ?? opps[0]
      return { type: 'designate', seat, to }
    }
    const books = allBooks(s.config)
    const book = books.find((b) => !s.books[b]) ?? books[0]
    const assignments = {}
    for (const c of bookCards(book, s.config)) assignments[c] = seat
    return { type: 'claim', seat, book, assignments }
  }

  const STEP_CAP = 5000

  function play(seatFns, seed, startSeat) {
    let s = newGame(seed, us54Config, startSeat)
    let steps = 0
    let illegal = 0
    let violations = 0
    let capped = false
    while (s.phase !== 'finished') {
      if (steps >= STEP_CAP) {
        capped = true
        break
      }
      const { seat } = legalActionsSummary(s)
      const view = seatView(s, seat)
      const action = seatFns[seat](view, hashSeed(`${seed}:${s.moveIndex}`)())
      let r = reduce(s, action)
      if (!r.ok) {
        illegal++
        r = reduce(s, emergencyAction(s))
        if (!r.ok) break
      }
      s = r.state
      steps++
      if (checkInvariants(s).length > 0) violations++
    }
    let voids = 0
    for (const bk of allBooks(s.config)) {
      if (s.books[bk]?.outcome === 'void') voids++
    }
    const target = clinchTarget(s.config)
    const finished = s.phase === 'finished'
    const tie = s.score[0] === s.score[1]
    const clinch = Math.max(s.score[0], s.score[1]) >= target
    const bad = illegal > 0 || violations > 0 || capped || !finished || tie || voids > 0 || !clinch
    return { score: [s.score[0], s.score[1]], bad: bad ? 1 : 0 }
  }

  function runTask(task) {
    const A = armOf(task.a)
    const B = armOf(task.b)
    const rows = []
    for (let pair = task.pairFrom; pair < task.pairTo; pair++) {
      const seed = seedFor(task.bank, pair)
      const startSeat = startSeatFor(pair)
      const row = { pair, seed, sets: [null, null], health: 0 }
      for (const orient of [0, 1]) {
        // orient 0: arm A on team 0. orient 1: arm A on team 1. Seed and start seat identical.
        const aTeam = orient === 0 ? 0 : 1
        const seats = ALL_SEATS.map((s) => (seatTeam(s) === aTeam ? A : B))
        const g = play(seats, seed, startSeat)
        row.health += g.bad
        row.sets[orient] = [g.score[aTeam], g.score[1 - aTeam]]
      }
      rows.push(row)
    }
    return { index: task.index, cell: task.cell, rows }
  }

  parentPort.on('message', (msg) => {
    if (msg?.type === 'quit') return void parentPort.close()
    try {
      parentPort.postMessage({ type: 'result', result: runTask(msg.task) })
    } catch (err) {
      parentPort.postMessage({ type: 'error', message: String(err?.stack ?? err) })
    }
  })
} else {
  /* ------------------------------------------------------------------ main --- */

  const PAIRS = Number(process.argv[2] ?? 200)
  const BANK = process.argv[3] ?? 'v15clean-2026a'
  const OUT = process.argv[4] ?? ''
  const CHUNK = 10

  const tasks = []
  for (let from = 0; from < PAIRS; from += CHUNK) {
    const to = Math.min(PAIRS, from + CHUNK)
    for (const c of cells) {
      tasks.push({ index: tasks.length, cell: c.id, a: c.a, b: c.b, bank: BANK, pairFrom: from, pairTo: to })
    }
  }

  const nWorkers = Math.min(tasks.length, Math.max(1, cpus().length - 2))
  const workerPath = fileURLToPath(import.meta.url)
  const results = []
  let next = 0
  let done = 0
  const t0 = Date.now()

  console.log(`newtree ${NEWTREE}`)
  console.log(`oldtree ${OLDTREE}`)
  console.log(`${tasks.length} tasks over ${nWorkers} workers, ${cells.length} cells x ${PAIRS} pairs\n`)

  await new Promise((resolve, reject) => {
    let live = 0
    const pump = (w) => {
      if (next >= tasks.length) return void w.postMessage({ type: 'quit' })
      w.postMessage({ type: 'task', task: tasks[next++] })
    }
    for (let i = 0; i < nWorkers; i++) {
      const w = new Worker(workerPath)
      live++
      w.on('message', (m) => {
        if (m.type === 'error') return reject(new Error(m.message))
        results.push(m.result)
        done++
        if (done % 50 === 0 || done === tasks.length) {
          process.stderr.write(`  ${done}/${tasks.length} tasks, ${((Date.now() - t0) / 1000).toFixed(0)}s\n`)
        }
        pump(w)
      })
      w.on('error', reject)
      w.on('exit', () => {
        live--
        if (live === 0) resolve()
      })
      pump(w)
    }
  })

  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length
  const seOf = (v) => {
    const m = mean(v)
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1))
    return sd / Math.sqrt(v.length)
  }

  function agg(cellId) {
    const rows = results.filter((r) => r.cell === cellId).flatMap((r) => r.rows)
    rows.sort((x, y) => x.pair - y.pair)
    const d = [] // per-pair set difference, SUMMED over the two orientations
    const share = []
    let health = 0
    let aSets = 0
    let bSets = 0
    let aWins = 0
    let bWins = 0
    let ties = 0
    for (const r of rows) {
      health += r.health
      let dd = 0
      let sh = 0
      for (const o of [0, 1]) {
        const [as, bs] = r.sets[o]
        aSets += as
        bSets += bs
        dd += as - bs
        sh += as + bs > 0 ? as / (as + bs) : 0.5
        if (as > bs) aWins++
        else if (as < bs) bWins++
        else ties++
      }
      d.push(dd)
      share.push(sh / 2)
    }
    return {
      cell: cellId,
      d,
      pairs: rows.length,
      games: rows.length * 2,
      health,
      aSets,
      bSets,
      aWins,
      bWins,
      ties,
      winRate: aWins / (rows.length * 2),
      setDiff: mean(d),
      setDiffCi: 1.96 * seOf(d),
      share: mean(share),
      shareCi: 1.96 * seOf(share),
    }
  }

  const out = { bank: BANK, pairs: PAIRS, variant: 'us54', newtree: NEWTREE, oldtree: OLDTREE, cells: cells.map((c) => agg(c.id)) }
  if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 2))
  const by = new Map(out.cells.map((c) => [c.cell, c]))

  const pad = (s, n) => String(s).padEnd(n)
  const sd = (c) => `${c.setDiff >= 0 ? '+' : ''}${c.setDiff.toFixed(4)} +/- ${c.setDiffCi.toFixed(4)}`

  console.log(`\nFishAI v1.5 (post-concession) vs v1.0 (pre-concession export) — us54, duplicate deals`)
  console.log(`bank '${BANK}', ${PAIRS} pairs/cell = ${PAIRS * 2} games/cell, ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)
  console.log(
    `${pad('cell', 12)} ${pad('pairs', 6)} ${pad('bad', 4)} ${pad('setDiff (A-B) +/-95%', 24)} ${pad('share', 8)} ${pad('winRate', 8)} sets A:B`,
  )
  for (const c of out.cells) {
    console.log(
      `${pad(c.cell, 12)} ${pad(c.pairs, 6)} ${pad(c.health, 4)} ${pad(sd(c), 24)} ${pad(c.share.toFixed(4), 8)} ${pad(c.winRate.toFixed(4), 8)} ${c.aSets}:${c.bSets}`,
    )
  }

  const bad = ['ctrl-zero', 'ctrl-mirror'].filter((id) => {
    const c = by.get(id)
    return !c || c.setDiff !== 0 || c.setDiffCi !== 0 || c.aSets !== c.bSets
  })
  console.log(
    `\ncontrols: ${bad.length === 0 ? 'PASS — both zero-magnitude arms printed exactly 0.0000 +/- 0.0000' : `FAIL (${bad.join(', ')}) — the arms are confounded and every number above is void`}`,
  )

  console.log('\n--- A. the headline ladder: updated v1.5(balanced) vs CLEAN v1.0 ---')
  console.log('bits          setDiff                  winRate  share')
  for (const b of LADDER) {
    const c = by.get(`c${b}`)
    console.log(`${pad(b === INF ? 'inf' : b, 13)} ${pad(sd(c), 24)} ${c.winRate.toFixed(4)}   ${c.share.toFixed(4)}`)
  }

  console.log('\n--- B. the contamination trap, priced: same v1.5 arm vs v1.0 driven by the NEW tree ---')
  console.log('bits          vs clean v1.0            vs contaminated v1.0     paired difference')
  for (const b of [64, INF]) {
    const clean = by.get(`c${b}`)
    const dirty = by.get(`x${b}`)
    const dv = clean.d.map((x, i) => x - dirty.d[i])
    console.log(
      `${pad(b === INF ? 'inf' : b, 13)} ${pad(sd(clean), 24)} ${pad(sd(dirty), 24)} ` +
        `${mean(dv) >= 0 ? '+' : ''}${mean(dv).toFixed(4)} +/- ${(1.96 * seOf(dv)).toFixed(4)}`,
    )
  }

  console.log('\n--- C. what the concession layer did to v1.5 itself: new v1.5 vs OLD v1.5, same budget ---')
  console.log('bits          setDiff                  winRate')
  for (const b of [0, 32, 64, INF]) {
    const c = by.get(`s${b}`)
    console.log(`${pad(b === INF ? 'inf' : b, 13)} ${pad(sd(c), 24)} ${c.winRate.toFixed(4)}`)
  }

  console.log('\n--- D. the punter rung (BOUNDED.md 5a table 2), updated v1.5 vs clean v1.0 ---')
  console.log('bits          setDiff                  winRate')
  for (const b of [64, INF]) {
    const c = by.get(`p${b}`)
    console.log(`${pad(b === INF ? 'inf' : b, 13)} ${pad(sd(c), 24)} ${c.winRate.toFixed(4)}`)
  }

  if (OUT) console.log(`\nwrote ${OUT}`)
}
