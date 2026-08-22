/**
 * style-replays.mjs — BOT_LAB.md §7.1's `replays[]`, captured from games the matrix actually played.
 *
 * > *"Replays store actions, not states."*
 *
 * The runner does not keep actions: a `LabGameRecord` is counters, and 300k games of action lists
 * would be a far larger artifact than the matrix it explains. But the engine and every policy are
 * deterministic functions of `(seed, config, startSeat)`, so a game the matrix already measured
 * can be re-played exactly, and only the handful the site shows need their actions stored.
 *
 * **This file replays; it does not re-decide.** The loop below is the action-selection half of
 * `lib/lab/play.ts` and nothing else — no counters, no god's-eye bookkeeping — and every capture
 * is checked against the `LabGameRecord` the run produced for the same seed and orientation:
 * steps, sets and unresolved must all agree, or the capture is rejected. A replay that does not
 * reproduce its own row is not a replay of that game.
 *
 * `node scripts/style-replays.mjs --run lab-out/DIR [--out FILE] [--count N]`
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const { decide } = await import('../lib/engine/bots/index.ts')
const { allBooks, hashSeed, legalActionsSummary, newGame, reduce, seatTeam, seatView, STYLE_ROSTER } = await import(
  '../lib/engine/index.ts'
)
const { configFor, policyFor } = await import('../lib/lab/play.ts')
const { seedFor, startSeatFor } = await import('../lib/lab/plan.ts')

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1)
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i]
    else out[a.slice(2)] = 'true'
  }
  return out
}

const opt = args(process.argv.slice(2))
if (!opt.run) {
  console.error('usage: node scripts/style-replays.mjs --run lab-out/DIR [--out FILE] [--count N]')
  process.exit(2)
}
const runDir = resolve(process.cwd(), opt.run)
const outPath = resolve(process.cwd(), opt.out ?? join(runDir, 'replays.json'))
const count = Number(opt.count ?? 6)

const cellsRaw = JSON.parse(await readFile(join(runDir, 'cells.json'), 'utf8'))
const variant = cellsRaw.meta.config.variant
const config = configFor(variant)
const stepCap = cellsRaw.meta.config.stepCap

/**
 * Re-play one game of the matrix. `a` sits on team `orient`, exactly as `playGame` seats it.
 * Returns the action list plus the outcome, for checking against the record.
 */
/**
 * `Object.hasOwn` before every roster lookup. These ids arrive out of `cells.json` — a file, not a
 * constant — and `STYLE_ROSTER[id]` on a plain object literal walks `Object.prototype`, so an id
 * of `constructor` or `toString` would come back as a truthy FUNCTION and be handed to
 * `policyFor` as a style vector. Frozen is not the same as null-prototyped: freezing stops the
 * roster being written, not being read through.
 */
function styleOf(id) {
  if (typeof id !== 'string' || !Object.hasOwn(STYLE_ROSTER, id)) {
    throw new Error(`style-replays: cells.json names a style the roster does not have: ${String(id)}`)
  }
  return STYLE_ROSTER[id]
}

function capture(aId, bId, seed, startSeat, orient) {
  const a = styleOf(aId)
  const b = styleOf(bId)
  const aTeam = orient === 0 ? 0 : 1
  const policyA = policyFor(a)
  const policyB = policyFor(b)
  const actions = []
  let s = newGame(seed, config, startSeat)
  let steps = 0
  while (s.phase !== 'finished' && steps < stepCap) {
    const { seat } = legalActionsSummary(s)
    const team = seatTeam(seat)
    const action = decide(seatView(s, seat), team === aTeam ? policyA : policyB, hashSeed(`${seed}:${s.moveIndex}`)())
    const r = reduce(s, action)
    if (!r.ok) throw new Error(`replay ${seed}/${orient}: engine rejected ${JSON.stringify(action)} — ${r.error}`)
    actions.push(action)
    s = r.state
    steps++
  }
  let sets0 = 0
  let sets1 = 0
  let unresolved = 0
  // Iterate the variant's book list, not `Object.keys(s.books)`: a set nobody has declared has no
  // entry at all, and counting only the entries would report it as resolved.
  for (const bk of allBooks(config)) {
    const o = s.books[bk]?.outcome
    if (o === 'team0') sets0++
    else if (o === 'team1') sets1++
    else unresolved++
  }
  return { actions, steps, sets: [sets0, sets1], unresolved, seatStyles: seatStylesFor(aId, bId, aTeam) }
}

function seatStylesFor(aId, bId, aTeam) {
  return [0, 1, 2, 3, 4, 5].map((seat) => (seatTeam(seat) === aTeam ? aId : bId))
}

/**
 * Which games to show. Not "the most exciting" — the site has to be able to say why each one is
 * here, so the choice is made from the matrix itself: the most lopsided cell, the closest cell,
 * the longest cell, and then the highest-|score| remaining cells. One game each, always pair 0
 * orientation 0, so the seed is the published seed set's first element and anyone can re-run it.
 */
function chooseCells(cells, n) {
  const byExtreme = [...cells].sort((x, y) => Math.abs(y.aScore - 0.5) - Math.abs(x.aScore - 0.5))
  const byClose = [...cells].sort((x, y) => Math.abs(x.aScore - 0.5) - Math.abs(y.aScore - 0.5))
  const byLong = [...cells].sort((x, y) => y.avgMoves - x.avgMoves)
  const picked = []
  const reasons = new Map()
  const take = (cell, why) => {
    if (cell && !picked.some((p) => p.id === cell.id)) {
      picked.push(cell)
      reasons.set(cell.id, why)
    }
  }
  take(byExtreme[0], 'the most lopsided cell in the matrix')
  take(byClose[0], 'the closest cell in the matrix')
  take(byLong[0], 'the longest games in the matrix')
  for (const c of byExtreme) {
    if (picked.length >= n) break
    take(c, 'a decisive cell')
  }
  return picked.slice(0, n).map((c) => ({ cell: c, why: reasons.get(c.id) }))
}

const records = []
const jsonl = await readFile(join(runDir, 'games.jsonl'), 'utf8').catch(() => '')
const wanted = new Map()
for (const { cell, why } of chooseCells(cellsRaw.cells, count)) wanted.set(`${cell.id}:0:0`, { cell, why })
for (const line of jsonl.split('\n')) {
  if (line.length === 0) continue
  const r = JSON.parse(line)
  const key = `${r.cell}:${r.pair}:${r.orient}`
  if (wanted.has(key)) records.push({ record: r, ...wanted.get(key) })
}

const out = []
for (const { record, cell, why } of records) {
  const seed = seedFor(cellsRaw.meta.config.seedPrefix, record.pair)
  const startSeat = startSeatFor(record.pair)
  if (seed !== record.seed || startSeat !== record.startSeat) {
    throw new Error(`replay plan disagrees with the record: ${seed}/${startSeat} vs ${record.seed}/${record.startSeat}`)
  }
  const cap = capture(cell.a, cell.b, seed, startSeat, record.orient)
  const setsA = record.orient === 0 ? cap.sets[0] : cap.sets[1]
  const setsB = record.orient === 0 ? cap.sets[1] : cap.sets[0]
  if (cap.steps !== record.steps || setsA !== record.setsA || setsB !== record.setsB || cap.unresolved !== record.unresolved) {
    throw new Error(
      `replay of ${cell.id} pair ${record.pair} orient ${record.orient} does not reproduce its record: ` +
        `steps ${cap.steps} vs ${record.steps}, sets ${setsA}-${setsB} vs ${record.setsA}-${record.setsB}, ` +
        `unresolved ${cap.unresolved} vs ${record.unresolved}`,
    )
  }
  out.push({
    id: `${cell.id}-p${record.pair}o${record.orient}`,
    pairing: [cell.a, cell.b],
    seed,
    startSeat,
    caption:
      `${cell.a} vs ${cell.b} — ${why}: ${cell.a} scores ${cell.aScore.toFixed(3)} over ${cell.pairs} ` +
      `duplicate pairs. This is pair ${record.pair}, orientation ${record.orient}, ` +
      `${cap.steps} moves, ${setsA}-${setsB}.`,
    seatStyles: cap.seatStyles,
    moves: cap.steps,
    sets: [setsA, setsB],
    unresolved: cap.unresolved,
    actions: cap.actions,
  })
  console.log(`  replay ${cell.id} pair ${record.pair}: ${cap.steps} moves, ${setsA}-${setsB} — reproduces the record`)
}

await writeFile(outPath, JSON.stringify(out, null, 2), 'utf8')
console.log(`wrote ${outPath} (${out.length} replays)`)
