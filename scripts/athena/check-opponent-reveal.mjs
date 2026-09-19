/**
 * check-opponent-reveal.mjs: the opponent service's bridge-regime view against the replay codec's reduced view, at
 * every decision of real games (ATHENA.md §8.2 G1b's standard, for the service P2 trains against; §9.5).
 *
 *     node scripts/athena/check-opponent-reveal.mjs [--corpus DIR] [--facts DIR] [--population H1,H5] [--max-games N]
 *         [--workers 4] [--batch 48] [--deep 200] [--control full-reveal] [--quiet]
 *
 * Every corpus record (`athena-replay-1`, ATHENA.md §4.2) is replayed twice and the two are compared at every step:
 *
 * - **The reference** is built here, from the record's seed, start seat and actions: `newGame`, then `reduce` of each
 *   decoded action, with `facts-codec.ts`'s `ReducedReveal` fed every event. At step t, before the action, the
 *   acting seat's reduced view is digested with `replay-codec.ts`'s `encodeView(..., 'reduced')` over the reduced
 *   log and its reduced log digest. That is exactly what `emit-facts.mjs home` writes as its B column, which is the
 *   column G1b was scored on.
 * - **The service** is `opponent-service.mjs`, a child process, with every game opened `reveal: "reduced"`. The
 *   record's actions are applied to it one step at a time with `full: true`, so it returns the state digest d, the
 *   legal-move digest l and the view digest v of the acting seat at every step.
 *
 * Compared at every step: the acting seat, d, l and v. d and l do not depend on the regime and are the record's own
 * columns, so a reduced game is still a replay check; v is the reduced view, and it is the state of interest. The
 * run reports the number of states compared and the number differing, per population and in total.
 *
 * **The anchor.** `--facts DIR` (default `C:/Projects/FishAI-bench/athena/p1/a/facts`, used when it is there) also
 * checks this run's reference against the B column of `emit-facts.mjs home`'s files, which is the reduced view
 * digest G1b was scored on. It ties the reference used here to the one already on the record.
 *
 * **Field for field.** `encodeView` writes every field of the view, so equal digests are equal fields up to a 64-bit
 * collision. `--deep N` also compares the first N games' views as objects, field by field (head, counts, score,
 * sets, hand, log), against the same reference: `opponent-core.ts`'s `ReferenceGame(seed, start, 'reduced').view()`
 * is deep-compared with `ReducedReveal.view(state, seat)` at every step, and a difference is named by its field.
 *
 * **What reduced changes.** The record's v column is the same state's FULL-reveal view digest, so v_reduced != v_full
 * counts the decisions that see less; the holders actually withheld are counted from the set block as well, and one
 * is printed in full as a worked example.
 *
 * **The control.** `--control full-reveal` opens every game `reveal: "full"` and compares it with the same reduced
 * reference: it must differ, or the check proves nothing. The exit code is 0 only when the run is clean (a caught
 * control exits 1, as P0's checkers do).
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(HERE), '../..')
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href)
const SERVICE = join(ROOT, 'scripts/athena/opponent-service.mjs')
const DEFAULT_CORPUS = 'C:/Projects/FishAI-bench/athena/corpus/7d85c2e'
const DEFAULT_FACTS = 'C:/Projects/FishAI-bench/athena/p1/a/facts'

/* ------------------------------------------------------------------------ arguments --- */

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const CORPUS = argOf('--corpus', DEFAULT_CORPUS)
const FACTS = argOf('--facts', DEFAULT_FACTS)
const POPS = argOf('--population', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const MAX_GAMES = Number(argOf('--max-games', '0')) || Infinity
const WORKERS = Number(argOf('--workers', '4'))
const BATCH = Number(argOf('--batch', '48'))
const DEEP = Number(argOf('--deep', '200'))
const CONTROL = argOf('--control', '')
const QUIET = process.argv.includes('--quiet')
if (CONTROL !== '' && CONTROL !== 'full-reveal') {
  console.error('check-opponent-reveal: --control takes only full-reveal')
  process.exit(2)
}
const OPEN_REVEAL = CONTROL === 'full-reveal' ? 'full' : 'reduced'

/* -------------------------------------------------------------------------- modules --- */

const C = await imp('scripts/athena/replay-codec.ts')
const F = await imp('scripts/athena/facts-codec.ts')
const ENG = await imp('lib/engine/index.ts')
const CORE = await imp('scripts/athena/opponent-core.ts')

/* -------------------------------------------------------------------------- service --- */

/** The opponent service as a child process: one request a line, one reply a line, in order. */
class Service {
  constructor(workers) {
    this.proc = spawn(process.execPath, [SERVICE, '--workers', String(workers)], {
      stdio: ['pipe', 'pipe', 'inherit'],
      cwd: ROOT,
    })
    this.waiting = []
    this.id = 0
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      const w = this.waiting.shift()
      if (!w) throw new Error(`check-opponent-reveal: an unexpected line from the service: ${line}`)
      w(JSON.parse(line))
    })
    this.exited = new Promise((res) => this.proc.on('exit', (code) => res(code)))
  }

  req(msg) {
    return new Promise((res, rej) => {
      this.waiting.push((m) => (m.ok ? res(m) : rej(new Error(`check-opponent-reveal: the service refused: ${m.error}`))))
      this.proc.stdin.write(JSON.stringify({ ...msg, id: ++this.id }) + '\n')
    })
  }
}

/* ------------------------------------------------------------------------ the fields --- */

const SETS = C.SETS
const SET_CARDS = C.SET_CARDS

/** One view as six comparable strings, so a difference can be named by its field. */
function fieldsOf(v) {
  const win = v.declareWindow ? `${v.declareWindow.option}/${v.declareWindow.declined}` : 'closed'
  const holders = (m, i) => SET_CARDS[i].map((c) => (m[c] === undefined ? 'x' : m[c])).join('')
  return {
    head: `${v.seat}|${v.phase}|${v.turn}|${v.moveIndex}|${win}`,
    counts: [...v.counts].join(','),
    score: [...v.score].join(','),
    sets: SETS.map((b, i) => {
      const r = v.books[b]
      return r ? `${b}:${r.claimer}:${r.outcome}:${holders(r.assignments, i)}:${holders(r.actualHolders, i)}` : `${b}:open`
    }).join(' '),
    hand: [...v.hand].join(','),
    log: v.log
      .map((e) =>
        e.type === 'claim'
          ? `claim|${e.claimer}|${e.book}|${e.outcome}|${holders(e.assignments, SETS.indexOf(e.book))}|${holders(e.actualHolders, SETS.indexOf(e.book))}`
          : JSON.stringify(e),
      )
      .join(' '),
  }
}

const FIELD_NAMES = ['head', 'counts', 'score', 'sets', 'hand', 'log']

/** Holders a view's resolved sets do not publish (0 under the full reveal, which publishes all six of each). */
function hiddenInView(v) {
  let n = 0
  for (let i = 0; i < SETS.length; i++) {
    const r = v.books[SETS[i]]
    if (!r) continue
    for (const c of SET_CARDS[i]) if (r.actualHolders[c] === undefined) n++
  }
  return n
}

/* --------------------------------------------------------------------- the reference --- */

/**
 * One record replayed on the reference: per step the acting seat, the action's code, the reduced view digest, and
 * how many holders the reduced view withholds. `deep` also keeps each step's fields, and runs `ReferenceGame` in
 * the reduced regime beside the replay so its view can be compared field by field.
 */
function reference(rec, deep) {
  let state = ENG.newGame(rec.seed, ENG.us54Config, rec.startSeat)
  const red = new F.ReducedReveal()
  for (const e of state.log) red.push(e)
  const rg = deep ? new CORE.ReferenceGame(rec.seed, rec.startSeat, 'reduced') : null
  const w = new C.ByteWriter(1024)
  const seats = new Int8Array(rec.steps)
  const codes = new Int32Array(rec.steps)
  const v = []
  const hidden = new Int32Array(rec.steps)
  const fieldDiffs = Object.fromEntries(FIELD_NAMES.map((k) => [k, 0]))
  let deepStates = 0
  let example = null
  let pos = 0
  for (let t = 0; t < rec.steps; t++) {
    const acting = ENG.legalActionsSummary(state).seat
    const rv = red.view(state, acting)
    w.reset()
    C.encodeView(w, rv, red.log.length, red.logDigest.hex(), 'reduced')
    v.push(C.digestBytes(w.buf, w.n))
    hidden[t] = hiddenInView(rv)
    if (hidden[t] > 0 && example === null) example = { t, acting, view: rv, full: ENG.seatView(state, acting) }
    if (rg) {
      if (rg.acting() !== acting) throw new Error(`${rec.seed} step ${t}: ReferenceGame acts at ${rg.acting()}, the replay at ${acting}`)
      const a = fieldsOf(rg.view())
      const b = fieldsOf(rv)
      for (const k of FIELD_NAMES) if (a[k] !== b[k]) fieldDiffs[k]++
      deepStates++
    }
    const { action, next } = C.decodeAction(rec.actions, pos)
    pos = next
    if (action.seat !== acting) throw new Error(`${rec.seed} step ${t}: the record's action is seat ${action.seat}, the acting seat ${acting}`)
    const code = CORE.actionCode(action)
    if (code === null) throw new Error(`${rec.seed} step ${t}: the record's action has no code`)
    seats[t] = acting
    codes[t] = code
    const r = ENG.reduce(state, action)
    if (!r.ok) throw new Error(`${rec.seed} step ${t}: the reference refused the record's action (${r.error.code})`)
    if (rg) {
      const ok = rg.applyCode(acting, code)
      if (!ok.ok) throw new Error(`${rec.seed} step ${t}: ReferenceGame refused code ${code} (${ok.error})`)
    }
    for (const e of r.events) red.push(e)
    state = r.state
  }
  return { seats, codes, v, hidden, wrongDeclares: red.wrongDeclares, hiddenHolders: red.hiddenHolders, fieldDiffs, deepStates, example }
}

/** A worked example, in words. */
function describeExample(rec, ex) {
  const lines = [
    `  a worked example — ${rec.population} ${rec.index} (${rec.seed}), step ${ex.t}, acting seat ${ex.acting}:`,
  ]
  for (let i = 0; i < SETS.length; i++) {
    const b = SETS[i]
    const rFull = ex.full.books[b]
    const rRed = ex.view.books[b]
    if (!rFull) continue
    const shown = SET_CARDS[i].map((c) => (rRed.actualHolders[c] === undefined ? `${c}=?` : `${c}=${rRed.actualHolders[c]}`)).join(' ')
    const all = SET_CARDS[i].map((c) => `${c}=${rFull.actualHolders[c]}`).join(' ')
    if (shown === all) continue
    lines.push(`    ${b}: declared by seat ${rFull.claimer}, ${rFull.outcome}`)
    lines.push(`      home  publishes: ${all}`)
    lines.push(`      bridge publishes: ${shown}`)
  }
  return lines.join('\n')
}

/* --------------------------------------------------------------------------- the run --- */

const files = fs
  .readdirSync(CORPUS)
  .filter((f) => f.endsWith('.tsv'))
  .sort()
if (files.length === 0) throw new Error(`check-opponent-reveal: no .tsv records under ${CORPUS}`)

const svc = new Service(WORKERS)
const hello = await svc.req({ op: 'hello' })
if (!Array.isArray(hello.reveals) || !hello.reveals.includes('reduced'))
  throw new Error(`check-opponent-reveal: this service does not announce the reduced reveal (hello: ${JSON.stringify(hello)})`)
if (!QUIET) console.log(`service: protocol ${hello.protocol}, reveals ${JSON.stringify(hello.reveals)}, ${hello.workers} workers, node ${hello.node}`)

const byPop = new Map()
const diffKinds = { seat: 0, d: 0, l: 0, v: 0 }
const fieldDiffs = Object.fromEntries(FIELD_NAMES.map((k) => [k, 0]))
let games = 0
let states = 0
let bad = 0
let badGames = 0
let deepGames = 0
let deepStates = 0
let lessStates = 0
let lessGames = 0
let hiddenHolders = 0
let wrongDeclares = 0
let shown = 0
let example = null
let exampleRec = null
let g0 = 0
const t0 = Date.now()

let anchored = 0
let anchorBad = 0
let anchorFiles = 0

/** The B column of `emit-facts.mjs home`'s file for this corpus file, by `population/index`, or null. */
function anchorOf(file) {
  const p = join(FACTS, 'home', file)
  if (!fs.existsSync(p)) return null
  const m = new Map()
  for (const line of fs.readFileSync(p, 'latin1').split('\n')) {
    if (!line) continue
    const f = line.split('\t')
    if (f[0] !== 'athena-facts-home-1') throw new Error(`check-opponent-reveal: ${p} is not athena-facts-home-1`)
    m.set(`${f[1]}/${f[2]}`, f[7])
  }
  anchorFiles++
  return m
}

for (const file of files) {
  if (games >= MAX_GAMES) break
  const lines = fs.readFileSync(join(CORPUS, file), 'latin1').split('\n').filter(Boolean)
  const anchor = anchorOf(file)
  for (let start = 0; start < lines.length; start += BATCH) {
    if (games >= MAX_GAMES) break
    const recs = []
    for (let i = start; i < Math.min(start + BATCH, lines.length) && games + recs.length < MAX_GAMES; i++) {
      const rec = C.parseLine(lines[i])
      if (POPS.length && !POPS.includes(rec.population)) continue
      recs.push(rec)
    }
    if (recs.length === 0) continue
    // The reference side, in this process.
    const refs = recs.map((rec) => {
      const deep = deepGames < DEEP
      const r = reference(rec, deep)
      if (deep) {
        deepGames++
        deepStates += r.deepStates
        for (const k of FIELD_NAMES) fieldDiffs[k] += r.fieldDiffs[k]
      }
      return r
    })
    if (anchor)
      recs.forEach((rec, k) => {
        const b = anchor.get(`${rec.population}/${rec.index}`)
        if (b === undefined) return
        if (b.length !== 16 * rec.steps) throw new Error(`check-opponent-reveal: ${rec.seed}: the B column covers ${b.length / 16} steps, the record ${rec.steps}`)
        for (let t = 0; t < rec.steps; t++) {
          anchored++
          if (b.slice(16 * t, 16 * t + 16) !== refs[k].v[t]) anchorBad++
        }
      })
    // The service side, over the process boundary.
    const base = g0
    g0 += recs.length
    await svc.req({
      op: 'open',
      games: recs.map((rec, k) => ({
        g: base + k,
        seed: rec.seed,
        start: rec.startSeat,
        seats: [null, null, null, null, null, null],
        reveal: OPEN_REVEAL,
      })),
    })
    const gameBad = recs.map(() => false)
    const maxSteps = Math.max(...recs.map((r) => r.steps))
    for (let t = 0; t < maxSteps; t++) {
      const idx = []
      const items = []
      for (let k = 0; k < recs.length; k++) {
        if (t >= recs[k].steps) continue
        idx.push(k)
        items.push(t === 0 ? [base + k, -1, 0, 0] : [base + k, refs[k].seats[t - 1], refs[k].codes[t - 1], 0])
      }
      if (items.length === 0) break
      const reply = await svc.req({ op: 'step', full: true, items })
      reply.items.forEach((row, j) => {
        const k = idx[j]
        const rec = recs[k]
        const ref = refs[k]
        const [, d, seat, , l, v, , err] = row
        if (err) throw new Error(`${rec.seed} step ${t}: the service reported ${err}`)
        const diffs = []
        if (seat !== ref.seats[t]) diffs.push('seat')
        // The record's d column is d_t, AFTER step t's action; at step t the service has applied t actions, so its
        // d is d_{t-1}, and the deal digest before any (opponent-core.ts's `ReferenceGame.d`). l and v are of the
        // state at step t, before its action, so they take the column at t.
        if (d !== (t === 0 ? rec.deal : rec.d.slice(16 * (t - 1), 16 * t))) diffs.push('d')
        if (l !== rec.l.slice(16 * t, 16 * t + 16)) diffs.push('l')
        if (v !== ref.v[t]) diffs.push('v')
        states++
        const p = byPop.get(rec.population) ?? { games: 0, states: 0, bad: 0, less: 0 }
        p.states++
        if (ref.hidden[t] > 0) p.less++
        byPop.set(rec.population, p)
        if (diffs.length) {
          bad++
          gameBad[k] = true
          for (const x of diffs) diffKinds[x]++
          p.bad++
          if (shown < 8) {
            shown++
            console.log(`  ${rec.population} ${rec.index} ${rec.seed} step ${t}: ${diffs.join(', ')} (service v ${v}, reference ${ref.v[t]})`)
          }
        }
      })
    }
    await svc.req({ op: 'close', games: recs.map((_, k) => base + k) })
    recs.forEach((rec, k) => {
      const ref = refs[k]
      games++
      byPop.get(rec.population).games++
      if (gameBad[k]) badGames++
      let less = 0
      for (let t = 0; t < rec.steps; t++) if (ref.hidden[t] > 0) less++
      lessStates += less
      if (less > 0) lessGames++
      hiddenHolders += ref.hiddenHolders
      wrongDeclares += ref.wrongDeclares
      if (example === null && ref.example) {
        example = ref.example
        exampleRec = rec
      }
    })
    if (!QUIET) process.stderr.write(`\r  ${games} games, ${states.toLocaleString('en-US')} states, ${bad} differ    `)
  }
}
if (!QUIET) process.stderr.write('\n')
await svc.req({ op: 'quit' })
await svc.exited

const secs = (Date.now() - t0) / 1000
const n = (x) => x.toLocaleString('en-US')
console.log(
  `check-opponent-reveal${CONTROL ? ` --control ${CONTROL}` : ''}: ${n(games)} games, ${n(states)} states compared, ${secs.toFixed(1)} s`,
)
for (const [pop, p] of [...byPop].sort())
  console.log(`  ${pop}: ${n(p.games)} games, ${n(p.states)} states, ${n(p.bad)} differ, ${n(p.less)} see fewer holders`)
console.log(`  states that differ: ${n(bad)} (games ${n(badGames)}); by field: ${Object.entries(diffKinds).map(([k, x]) => `${k} ${n(x)}`).join(', ')}`)
console.log(
  `  deep field comparison: ${n(deepGames)} games, ${n(deepStates)} states; differences ${FIELD_NAMES.map((k) => `${k} ${n(fieldDiffs[k])}`).join(', ')}`,
)
console.log(
  anchorFiles > 0
    ? `  against emit-facts' B column (${anchorFiles} files under ${FACTS}): ${n(anchored)} states, ${n(anchorBad)} differ`
    : `  emit-facts' B column: no files under ${join(FACTS, 'home')}, not anchored`,
)
console.log(
  `  reduced shows less at ${n(lessStates)} of ${n(states)} decisions (${((100 * lessStates) / Math.max(1, states)).toFixed(3)}%), in ${n(lessGames)} of ${n(games)} games; ` +
    `${n(wrongDeclares)} wrong declares withheld ${n(hiddenHolders)} holders`,
)
if (example) console.log(describeExample(exampleRec, example))
const deepBad = FIELD_NAMES.reduce((a, k) => a + fieldDiffs[k], 0)
const clean = bad === 0 && deepBad === 0 && anchorBad === 0
if (CONTROL) console.log(bad > 0 ? `CONTROL CAUGHT: ${n(bad)} states differ` : 'CONTROL NOT CAUGHT: no state differs')
else console.log(clean ? 'REDUCED EQUAL: every state equals the replay codec' : 'REDUCED DIFFERS')
process.exitCode = clean ? 0 : 1
