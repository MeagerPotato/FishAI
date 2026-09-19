/**
 * check-encoder.mjs: the JavaScript observation encoder (`lib/athena/encode.ts`) against the Rust port's
 * (`athena_env.BatchEnv`), byte for byte, on real states. ATHENA.md §4.5 item 6 (G0d; information, not a registered
 * bar).
 *
 *   python scripts/athena/dump-actor-buffers.py --out <dump>      (the venv's python)
 *   node scripts/athena/check-encoder.mjs <dump> [--show 8]
 *
 * For every game of the dump the recorded action codes are replayed on the TypeScript reference (`newGame`, then
 * `reduce` of `decodeAction(seat, code)`). Before every step, and once after the last, the acting seat's view
 * (`seatView`) is encoded by the JavaScript encoder, and each field is compared with the port's bytes: the acting
 * seat, the obs row, the legal row, and the event rows logged since that seat last observed (the port delivers events
 * incrementally; the encoder encodes the log, so the check keeps each seat's delivered count). The exit code is 0 only
 * when every state is equal.
 *
 * `--control hide-holders` is the planted control: every wrong declare's true holders are withheld from the view
 * before it is encoded (the bridge's reduced reveal taken to its limit), which the port never does. The comparison
 * must then report differences, in the event rows and the obs row's "how" bytes.
 */
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const root = pathToFileURL(process.cwd() + '/').href
const ENG = await import(new URL('lib/engine/index.ts', root).href)
const ENC = await import(new URL('lib/athena/encode.ts', root).href)

const file = process.argv[2]
const showAt = process.argv.indexOf('--show')
const SHOW = showAt > 0 ? Number(process.argv[showAt + 1]) : 8
const controlAt = process.argv.indexOf('--control')
const CONTROL = controlAt > 0 ? process.argv[controlAt + 1] : ''
if (!file || (CONTROL !== '' && CONTROL !== 'hide-holders')) {
  console.error('usage: node scripts/athena/check-encoder.mjs <dump> [--show 8] [--control hide-holders]')
  process.exit(2)
}
/** The control's view transform: a wrong declare publishes no holder at all. */
const wrong = (r) => r.outcome !== (r.claimer % 2 === 0 ? 'team0' : 'team1')
function hideHolders(view) {
  const books = {}
  for (const [b, r] of Object.entries(view.books)) books[b] = wrong(r) ? { ...r, actualHolders: {} } : r
  const log = view.log.map((e) => (e.type === 'claim' && wrong(e) ? { ...e, actualHolders: {} } : e))
  return { ...view, books, log }
}
const buf = fs.readFileSync(file)
if (buf.subarray(0, 8).toString('latin1') !== 'ATHOBS1\n') throw new Error(`${file} is not an ATHOBS1 dump`)

const { OBS_LEN, LEGAL_LEN, EVENT_LEN } = ENC
const obs = new Uint8Array(OBS_LEN)
const legal = new Uint8Array(LEGAL_LEN)
const fields = { seat: 0, nEvents: 0, obs: 0, legal: 0, events: 0 }
const byPop = new Map()
const shown = []
let pos = 8
let games = 0
let states = 0
let badStates = 0
let badGames = 0
const t0 = Date.now()

const equal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

while (pos < buf.length) {
  const seedLen = buf.readUInt16LE(pos)
  const seed = buf.toString('latin1', pos + 2, pos + 2 + seedLen)
  pos += 2 + seedLen
  const start = buf[pos]
  const pop = `H${buf[pos + 1]}`
  const T = buf.readUInt32LE(pos + 2)
  pos += 6
  const codes = []
  for (let t = 0; t < T; t++) codes.push(buf.readInt32LE(pos + 4 * t))
  pos += 4 * T
  let state = ENG.newGame(seed, ENG.us54Config, start)
  const seen = [0, 0, 0, 0, 0, 0]
  let gameBad = false
  for (let t = 0; t <= T; t++) {
    const rSeat = buf[pos]
    const rNe = buf[pos + 1]
    const rObs = buf.subarray(pos + 2, pos + 2 + OBS_LEN)
    const rLegal = buf.subarray(pos + 2 + OBS_LEN, pos + 2 + OBS_LEN + LEGAL_LEN)
    const rEv = buf.subarray(pos + 2 + OBS_LEN + LEGAL_LEN, pos + 2 + OBS_LEN + LEGAL_LEN + rNe * EVENT_LEN)
    pos += 2 + OBS_LEN + LEGAL_LEN + rNe * EVENT_LEN
    // The port's acting seat: the window's option while it is open and the game runs, else the turn.
    const seat = state.declareWindow && state.phase !== 'finished' ? state.declareWindow.option : state.turn
    const view = CONTROL ? hideHolders(ENG.seatView(state, seat)) : ENG.seatView(state, seat)
    ENC.encodeObservation(view, obs, legal)
    const rows = ENC.encodeEventRows(view.log.slice(seen[seat]), seat)
    seen[seat] = state.log.length
    const diffs = []
    if (rSeat !== seat) diffs.push('seat')
    if (rNe !== rows.length / EVENT_LEN) diffs.push('nEvents')
    if (!equal(obs, rObs)) diffs.push('obs')
    if (!equal(legal, rLegal)) diffs.push('legal')
    if (!equal(rows, rEv)) diffs.push('events')
    states++
    const p = byPop.get(pop) ?? { games: 0, states: 0, bad: 0 }
    p.states++
    if (diffs.length > 0) {
      badStates++
      p.bad++
      gameBad = true
      for (const d of diffs) fields[d]++
      if (shown.length < SHOW) {
        const where = (a, b) => [...a].map((x, i) => (x === b[i] ? null : `${i}:${b[i]}->${x}`)).filter(Boolean).slice(0, 6).join(' ')
        shown.push(`  ${pop} ${seed} step ${t} seat ${seat}: ${diffs.join(', ')}` +
          (diffs.includes('obs') ? ` | obs ${where(obs, rObs)}` : '') + (diffs.includes('legal') ? ` | legal ${where(legal, rLegal)}` : ''))
      }
    }
    byPop.set(pop, p)
    if (t === T) break
    const action = ENC.decodeAction(seat, codes[t])
    const res = action === null ? null : ENG.reduce(state, action)
    if (res === null || !res.ok) throw new Error(`${seed} step ${t}: the reference refused code ${codes[t]} (${res ? res.error.code : 'no action'})`)
    state = res.state
  }
  games++
  byPop.get(pop).games++
  if (gameBad) badGames++
}

console.log(`check-encoder${CONTROL ? ` --control ${CONTROL}` : ''}: ${games} games, ${states.toLocaleString('en-US')} states compared, ${((Date.now() - t0) / 1000).toFixed(1)} s`)
for (const [pop, p] of [...byPop].sort()) console.log(`  ${pop}: ${p.games} games, ${p.states.toLocaleString('en-US')} states, ${p.bad} differ`)
console.log(`  states that differ: ${badStates} (games ${badGames}); by field: ${Object.entries(fields).map(([k, v]) => `${k} ${v}`).join(', ')}`)
for (const s of shown) console.log(s)
console.log(badStates === 0 ? 'ENCODER EQUAL: every state byte-identical to the port' : 'ENCODER DIFFERS')
process.exitCode = badStates === 0 ? 0 : 1
