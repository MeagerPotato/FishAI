/**
 * stub-selftest.mjs: `scripts/botpkg-selftest.mjs` adapted to the ATHENA-stub package (ATHENA.md §4.6 G0d part 1).
 *
 *     node scripts/athena/build-stub-package.mjs
 *     node scripts/athena/stub-selftest.mjs [games] [--first 0] [--opp balanced|mixed] [--records <file>] [--pkg dist/athena-stub]
 *
 * ## What it is
 *
 * The same FishLab-shaped host as botpkg-selftest.mjs, refereed by FishAI's own `us54` engine: seats 0, 2 and 4 are the
 * built package in three child processes, spoken to in `fishlab-json-v1` over real stdio (`hello` once, `new_game` per
 * deal, a `declare_poll` to the option seat before every move, `ask` and `pass` on the turn), with the host's half-suit
 * numbering and card names. Seats 1, 3 and 5 are played in-process: by the Bass roster's Balanced style as in the
 * original (`--opp balanced`, the default), or by the G0a mixed stub (`--opp mixed`, H5's rule), whose games reach the
 * compelled windows the Balanced style's do not.
 *
 * **The referee reproduces the host's reduced reveal** (ATHENA.md §4.1): a declare in the history carries the stated
 * owners, `success` and `winner`, and never the true holders of a wrong one.
 *
 * ## What changed from botpkg-selftest.mjs, and why
 *
 * 1. **The equivalence reference is the host's view, not the full view.** Every reply of the package is compared with
 *    the reply the in-engine policy (`lib/athena/`, with the package's own weight file) gives on the view this referee
 *    builds from its own state under the host's information: the reduced reveal, `game_started` at the first history
 *    event's actor (the host does not name the start seat), the score by team. The package's MUSTFIX and PASSFIX are
 *    modelled in the expected reply. With the same information on both sides there is no "after a failed declaration"
 *    exception: every divergence is a fault. The original's full-information comparison is kept as information, with
 *    its differences explained by category.
 * 2. **MUSTFIX needs the host's forced endgame.** Where the us54 rules make declining illegal and the package answers
 *    `none` (an uncertain compelled claim), a `us54` referee cannot accept the decline. The host's forced endgame is
 *    emulated instead, from this repository's own reading of it (the adapters' comments): `forced` requests to the
 *    option seat over the open half-suits in the host's order, at the bars 1, 0.8, 0.6, 0.4, 0.2, 0, then
 *    `last_resort`, and the first declaration is played as that seat's claim. Only the option seat is asked, because
 *    the `us54` reducer accepts a claim only from it (the host may ask its teammates too).
 * 3. **The package's own fault counters** are read at the end of input (`ATHENA COUNTERS`) and must all be zero.
 * 4. **Records.** Every game is written as a FishLab record line (`scripts/bridge-records.mjs`'s format) so the in-engine
 *    pin (`scripts/athena/pin-stub-asks.mjs`) can walk the package's asks exactly as it walks the bridge's.
 *
 * The exit code is 0 only when every fault counter is zero.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { bookCards, cardBook } from '../../lib/engine/cards.ts'
import { newGame, reduce, us54Config } from '../../lib/engine/reduce.ts'
import { turnHolderCanAsk } from '../../lib/engine/helpers.ts'
import { seatView } from '../../lib/engine/views.ts'
import { decide, STYLE_ROSTER } from '../../lib/engine/bots/index.ts'
import * as A from '../../lib/athena/index.ts'
import { mixedStubAction, mixedStubRng } from './mixed-stub.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const GAMES = Number.parseInt(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '200', 10)
const FIRST = Number.parseInt(argOf('--first', '0'), 10)
const OPP = argOf('--opp', 'balanced')
const PKG = resolve(ROOT, argOf('--pkg', 'dist/athena-stub'))
const RECORDS = argOf('--records', '')
if (OPP !== 'balanced' && OPP !== 'mixed') throw new Error(`--opp ${OPP}: balanced or mixed`)
const PACKAGE_SEATS = [0, 2, 4]
const LADDER = [1, 0.8, 0.6, 0.4, 0.2, 0]

/* ------------------------------------------------------------------------------ the host's deck (§4) --- */

const FL_CARDS = [
  '2S', '3S', '4S', '5S', '6S', '7S', '9S', 'TS', 'JS', 'QS', 'KS', 'AS',
  '2H', '3H', '4H', '5H', '6H', '7H', '9H', 'TH', 'JH', 'QH', 'KH', 'AH',
  '2D', '3D', '4D', '5D', '6D', '7D', '9D', 'TD', 'JD', 'QD', 'KD', 'AD',
  '2C', '3C', '4C', '5C', '6C', '7C', '9C', 'TC', 'JC', 'QC', 'KC', 'AC',
  '8S', '8H', '8D', '8C', 'RJ', 'BJ',
]
const SET_NAMES = ['Low Spades', 'High Spades', 'Low Hearts', 'High Hearts', 'Low Diamonds', 'High Diamonds', 'Low Clubs', 'High Clubs', 'Eights & Jokers']
const toAi = (fl) => (fl === 'RJ' ? 'XR' : fl === 'BJ' ? 'XB' : fl)
const toFl = (ai) => (ai === 'XR' ? 'RJ' : ai === 'XB' ? 'BJ' : ai)
const FL_INDEX = new Map(FL_CARDS.map((c, i) => [c, i]))
const SET_BOOK = Array.from({ length: 9 }, (_, s) => cardBook(toAi(FL_CARDS[s * 6])))
const BOOK_SET = new Map(SET_BOOK.map((b, s) => [b, s]))
const SET_CARDS = SET_BOOK.map((_, s) => FL_CARDS.slice(s * 6, s * 6 + 6))

/* ------------------------------------------------------------------------ the package and its weights --- */

const manifest = JSON.parse(readFileSync(join(PKG, 'fishbot.json'), 'utf8'))
const weightBytes = readFileSync(join(PKG, manifest.env.ATHENA_WEIGHTS))
const weightMd5 = createHash('md5').update(weightBytes).digest('hex')
if (weightMd5 !== manifest.env.ATHENA_WEIGHTS_MD5) throw new Error(`the package's weight file has md5 ${weightMd5}; its manifest pins ${manifest.env.ATHENA_WEIGHTS_MD5}`)
/** The in-engine reference: the repository's lib/athena over the package's own weight file. */
const NET = A.parseWeights(new Uint8Array(weightBytes.buffer, weightBytes.byteOffset, weightBytes.byteLength))
const BRIDGE = await import(pathToFileURL(join(PKG, 'bridge.mjs')).href)
const BRIDGE_DECK = BRIDGE.buildDeckMap(FL_CARDS)

function startChild(seat) {
  const child = spawn(process.execPath, [join(PKG, 'bot.mjs')], { cwd: PKG, stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = []
  createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (line) => {
    const next = pending.shift()
    if (next === undefined) throw new Error(`seat ${seat} sent an unrequested line: ${line}`)
    next(line)
  })
  const errors = []
  createInterface({ input: child.stderr, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (l) => errors.push(l))
  const exited = new Promise((res) => child.on('exit', res))
  return {
    seat,
    errors,
    close: async () => {
      child.stdin.end()
      await exited
    },
    ask: (req) =>
      new Promise((res, rej) => {
        pending.push((line) => {
          try {
            res(JSON.parse(line))
          } catch {
            rej(new Error(`seat ${seat} replied with non-JSON: ${line}`))
          }
        })
        child.stdin.write(`${JSON.stringify(req)}\n`)
      }),
  }
}

/* ------------------------------------------------------------------------------- state -> the wire --- */

const isRight = (ev) => ev.outcome === (ev.claimer % 2 === 0 ? 'team0' : 'team1')

/** BOT_PACKAGE.md §6's `state` for one seat: a declare carries its owners and verdict, never a wrong one's holders. */
function wireState(state, seat, forcedClaims) {
  const running = [9, 9, 9, 9, 9, 9]
  const history = []
  let claims = 0
  for (const ev of state.log) {
    if (ev.type === 'ask') {
      if (ev.hit) {
        running[ev.target]--
        running[ev.asker]++
      }
      history.push({ t: 'ask', actor: ev.asker, target: ev.target, card: toFl(ev.card), success: ev.hit, counts: [...running] })
    } else if (ev.type === 'claim') {
      for (const s of Object.values(ev.actualHolders)) running[s]--
      const set = BOOK_SET.get(ev.book)
      history.push({
        t: 'declare', actor: ev.claimer, set, forced: forcedClaims.has(claims++), success: isRight(ev),
        winner: ev.outcome === 'team0' ? 0 : 1, owner: SET_CARDS[set].map((c) => ev.assignments[toAi(c)]), counts: [...running],
      })
    } else if (ev.type === 'pass') {
      history.push({ t: 'pass', actor: ev.from, target: ev.to, counts: [...running] })
    }
  }
  return {
    seat, turn: state.turn, deck_sets: 9, hand: state.hands[seat].map(toFl), hand_counts: state.hands.map((h) => h.length),
    score: [state.score[0], state.score[1]],
    set_active: SET_BOOK.map((b) => state.books[b] === undefined),
    set_winner: SET_BOOK.map((b) => (state.books[b] === undefined ? null : state.books[b].outcome === 'team0' ? 0 : 1)),
    n_asks: state.log.filter((e) => e.type === 'ask').length,
    rules: { out_of_turn_declare: true, cardless_may_declare: true, max_asks: 400, deck_sets: 9 },
    history,
  }
}

/* ---------------------------------------------------------------- the host's view, built by the referee --- */

const actorOf = (e) => (e.type === 'ask' ? e.asker : e.type === 'claim' ? e.claimer : e.type === 'pass' ? e.from : null)

/**
 * The seat's view under the host's information, from the referee's own state (not from the wire): the reduced reveal,
 * `game_started` at the first event's actor (the turn-holder before any event), the score by team.
 */
function hostView(state, seat, { phase, turn, declareWindow }) {
  const native = seatView(state, seat)
  const publicAt = new Map()
  const log = []
  const books = {}
  for (const e of native.log) {
    if (e.type === 'ask') {
      log.push(e)
      if (e.hit) publicAt.set(e.card, e.asker)
    } else if (e.type === 'claim') {
      const actualHolders = {}
      for (const c of bookCards(e.book, us54Config)) {
        if (isRight(e)) actualHolders[c] = e.assignments[c]
        else if (publicAt.has(c)) actualHolders[c] = publicAt.get(c)
        publicAt.delete(c)
      }
      log.push({ ...e, actualHolders })
      books[e.book] = { book: e.book, outcome: e.outcome, claimer: e.claimer, assignments: e.assignments, actualHolders }
    } else {
      log.push(e)
    }
  }
  log[0] = { type: 'game_started', startingSeat: log.length > 1 ? actorOf(log[1]) : state.turn }
  const v = { phase, turn, counts: native.counts, score: [native.score[0], native.score[1]], books, log, moveIndex: log.length, config: us54Config, seat, hand: native.hand }
  if (declareWindow) v.declareWindow = declareWindow
  return v
}

/* ------------------------------------------------------------- the expected reply, from the in-engine policy --- */

const ownerOf = (plan) => SET_CARDS[BOOK_SET.get(plan.book)].map((c) => plan.assignments[toAi(c)])
const declareReply = (plan) => ({ action: 'declare', set: BOOK_SET.get(plan.book), owner: ownerOf(plan), confidence: plan.p })

/** The package's reply to a poll, predicted: the policy's decision and the adapter's MUSTFIX/PASSFIX. */
function expectedPoll(v, state) {
  const d = A.decideStub(NET, v)
  if (d.kind === 'decline') return { action: 'none' }
  if (d.kind === 'rail') return declareReply(d.plan)
  if (d.kind === 'compelled') {
    if (v.hand.length === 0 && state.turn === v.seat) return { action: 'none' }
    if (!(d.plan.p >= 1)) return { action: 'none' }
    return declareReply(d.plan)
  }
  return { action: 'unexpected', kind: d.kind }
}
function expectedAsk(v) {
  const d = A.decideStub(NET, v)
  return d.kind === 'ask' ? { action: 'ask', card: toFl(d.action.card), target: d.action.target } : { action: 'unexpected', kind: d.kind }
}
function expectedPass(v) {
  const d = A.decideStub(NET, v)
  return d.kind === 'pass' ? { action: 'pass', to: d.action.to } : { action: 'unexpected', kind: d.kind }
}
function expectedForced(v, set, threshold, lastResort) {
  const k = A.factsOf(v)
  const s = A.setIndex(SET_BOOK[set])
  let plan = A.certainPlan(v, k, s)
  if (plan === null) plan = A.planSet(v, k, s, A.forwardView(NET, v, null, k).heads)
  return plan.certain || lastResort || plan.p >= threshold ? declareReply(plan) : { action: 'none' }
}

function canonical(r) {
  if (r === null || typeof r !== 'object') return String(r)
  if (r.error !== undefined) return `error ${r.error}`
  if (r.action === 'ask') return `ask ${r.card}->${r.target}`
  if (r.action === 'declare') return `declare ${r.set} ${r.owner.join(',')} p=${r.confidence}`
  if (r.action === 'pass') return `pass ${r.to}`
  if (r.action === 'none') return 'none'
  return JSON.stringify(r)
}

/** A protocol reply as the engine's own action. */
function toAction(reply, seat) {
  if (reply === null || typeof reply !== 'object' || reply.error !== undefined) throw new Error(`seat ${seat} refused: ${JSON.stringify(reply)}`)
  switch (reply.action) {
    case 'ask':
      return { type: 'ask', seat, target: reply.target, card: toAi(reply.card) }
    case 'declare': {
      const assignments = {}
      SET_CARDS[reply.set].forEach((c, j) => {
        assignments[toAi(c)] = reply.owner[j]
      })
      return { type: 'claim', seat, book: SET_BOOK[reply.set], assignments }
    }
    case 'none':
      return { type: 'decline', seat }
    case 'pass':
      return { type: 'pass', seat, to: reply.to }
    default:
      throw new Error(`seat ${seat}: unknown action ${JSON.stringify(reply.action)}`)
  }
}

/* ------------------------------------------------------------------------------------------------ the run --- */

const stats = {
  games: 0, moves: 0, asks: 0, polls: 0, passes: 0, forced: 0, lastResort: 0, sweeps: 0, declines: 0, declares: 0,
  ownDeclares: 0, badDeclares: 0, railDeclares: 0, wins: 0, sets: [0, 0], strandedPolls: 0, strandedDeclares: 0,
  maxReplyMs: 0, totalReplyMs: 0, replies: 0, logChecks: 0, wrongDeclaresSeen: 0,
  // faults
  divergences: 0, logMismatches: 0, gifts: 0, sweepNoDeclare: 0, fullInfoOther: 0,
  // information: the full-information comparison's differences, by cause
  fullInfoCompared: 0, fullInfoAfterFailedDeclare: 0, fullInfoStartSeat: 0,
}
const shown = []
const note = (s) => {
  if (shown.length < 12) shown.push(s)
}

const children = PACKAGE_SEATS.map(startChild)
const bySeat = new Map(children.map((c) => [c.seat, c]))

async function callSeat(seat, req) {
  const t0 = process.hrtime.bigint()
  const reply = await bySeat.get(seat).ask(req)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  stats.maxReplyMs = Math.max(stats.maxReplyMs, ms)
  stats.totalReplyMs += ms
  stats.replies++
  return reply
}

function compare(what, g, seat, state, got, want) {
  if (canonical(got) === canonical(want)) return
  stats.divergences++
  note(`DIVERGENCE game ${g} seat ${seat} @${state.log.length} events (${what}): package ${canonical(got)}, in-engine ${canonical(want)}`)
}

/** The original's check: the package's rebuilt log is the engine's length, event for event. */
function checkLogShape(state, seat, forcedClaims) {
  stats.logChecks++
  const { log } = BRIDGE.convertHistory(wireState(state, seat, forcedClaims), BRIDGE_DECK)
  if (log.length !== state.log.length) {
    stats.logMismatches++
    note(`LOG SHAPE seat ${seat}: engine ${state.log.length} events, package ${log.length}`)
  }
}

/** The cardless turn-holder's poll the us54 referee never sends (the original's probe), checked the same way. */
async function probeStrandedTurn(state, seat, g, forcedClaims) {
  const st = wireState(state, seat, forcedClaims)
  st.turn = seat
  stats.strandedPolls++
  const reply = await callSeat(seat, { op: 'declare_poll', state: st })
  const v = hostView(state, seat, { phase: 'playing', turn: seat, declareWindow: { option: seat, declined: 0 } })
  compare('stranded poll', g, seat, state, reply, expectedPoll(v, { turn: seat }))
  if (reply.action !== 'declare') return
  stats.strandedDeclares++
  if (reply.confidence === 0) {
    stats.gifts++
    note(`GIFT game ${g} seat ${seat}: declared set ${reply.set} at confidence 0 while stranded`)
  }
}

/** The host's forced endgame, emulated for the option seat (module header, item 2). */
async function forcedSweep(state, seat, g, forcedClaims) {
  stats.sweeps++
  const st = wireState(state, seat, forcedClaims)
  const v = hostView(state, seat, { phase: 'playing', turn: state.turn, declareWindow: { option: seat, declined: A.rel(seat, state.turn) } })
  const open = SET_BOOK.map((b, s) => (state.books[b] === undefined ? s : -1)).filter((s) => s >= 0)
  const ask = async (set, threshold, lastResort) => {
    stats.forced++
    if (lastResort) stats.lastResort++
    const reply = await callSeat(seat, { op: 'forced', set, threshold, last_resort: lastResort, state: st })
    compare(`forced set ${set} bar ${threshold}${lastResort ? ' last_resort' : ''}`, g, seat, state, reply, expectedForced(v, set, threshold, lastResort))
    return reply
  }
  for (const t of LADDER) {
    for (const set of open) {
      const reply = await ask(set, t, false)
      if (reply.action === 'declare') return toAction(reply, seat)
    }
  }
  const reply = await ask(open[0], 0, true)
  if (reply.action === 'declare') return toAction(reply, seat)
  stats.sweepNoDeclare++
  note(`SWEEP game ${g} seat ${seat}: no declaration even under last_resort`)
  const assignments = {}
  for (const c of bookCards(SET_BOOK[open[0]], us54Config)) assignments[c] = seat
  return { type: 'claim', seat, book: SET_BOOK[open[0]], assignments }
}

for (const c of children) {
  const hello = await c.ask({ op: 'hello', protocol: 'fishlab-json-v1', engine: 'fishlab', seats: 6, set_size: 6, timeout_ms: manifest.timeout_ms, cards: FL_CARDS, sets: SET_NAMES })
  if (hello.ok !== true || hello.protocol !== 'fishlab-json-v1') throw new Error(`seat ${c.seat} refused the handshake: ${JSON.stringify(hello)}`)
}

const recordLines = [JSON.stringify({ header: true, specA: `athena-stub (${manifest.env.ATHENA_WEIGHTS_MD5})`, specB: OPP, games: GAMES, rotations: 1, seed: 'selftest', sets: 9, cards: FL_CARDS })]
const t0 = Date.now()

for (let g = FIRST; g < FIRST + GAMES; g++) {
  const seed = `selftest-${g}`
  let state = newGame(seed, us54Config, g % 6)
  const dealt = state.hands.map((h) => h.map((c) => FL_INDEX.get(toFl(c))))
  const oppRng = mixedStubRng(seed)
  const forcedClaims = new Set()
  const recEvents = []
  let claimCount = 0
  let failedSeen = false
  for (const c of children) {
    const ok = await c.ask({ op: 'new_game', seat: c.seat, deck_sets: 9, hand: state.hands[c.seat].map(toFl), rules: {} })
    if (ok.ok !== true) throw new Error(`seat ${c.seat} refused new_game`)
  }

  let guard = 0
  while (state.phase !== 'finished' && guard++ < 6000) {
    const window = state.declareWindow
    const actor = window ? window.option : state.turn
    let action
    let forcedThis = false
    if (bySeat.has(actor)) {
      checkLogShape(state, actor, forcedClaims)
      const st = wireState(state, actor, forcedClaims)
      let reply
      let want
      let native = null
      if (state.phase === 'awaitPass') {
        await probeStrandedTurn(state, actor, g, forcedClaims)
        const candidates = [0, 1, 2, 3, 4, 5].filter((s) => s % 2 === actor % 2 && s !== actor && state.hands[s].length > 0)
        reply = await callSeat(actor, { op: 'pass', candidates, state: st })
        want = expectedPass(hostView(state, actor, { phase: 'awaitPass', turn: actor }))
        native = expectedPass(seatView(state, actor))
        stats.passes++
      } else if (window) {
        reply = await callSeat(actor, { op: 'declare_poll', state: st })
        want = expectedPoll(hostView(state, actor, { phase: 'playing', turn: state.turn, declareWindow: { option: actor, declined: A.rel(actor, state.turn) } }), state)
        native = expectedPoll(seatView(state, actor), state)
        stats.polls++
      } else {
        reply = await callSeat(actor, { op: 'ask', state: st })
        want = expectedAsk(hostView(state, actor, { phase: 'playing', turn: state.turn }))
        native = expectedAsk(seatView(state, actor))
        stats.asks++
      }
      compare(state.phase === 'awaitPass' ? 'pass' : window ? 'poll' : 'ask', g, actor, state, reply, want)
      stats.fullInfoCompared++
      if (canonical(native) !== canonical(reply)) {
        const first = state.log[1]
        if (failedSeen) stats.fullInfoAfterFailedDeclare++
        else if (first && first.type === 'claim' && first.claimer !== state.log[0].startingSeat) stats.fullInfoStartSeat++
        else {
          stats.fullInfoOther++
          note(`FULL-INFO game ${g} seat ${actor} @${state.log.length}: package ${canonical(reply)}, full view ${canonical(native)}`)
        }
      }
      action = toAction(reply, actor)
      if (action.type === 'decline' && window && !turnHolderCanAsk(state)) {
        // MUSTFIX's `none` where us54 compels a claim: the host's forced endgame resolves the position.
        action = await forcedSweep(state, actor, g, forcedClaims)
        forcedThis = true
      }
      if (action.type === 'decline') stats.declines++
      if (action.type === 'claim') stats.declares++
    } else if (OPP === 'mixed') {
      action = mixedStubAction(state, actor, oppRng)
    } else {
      action = decide(seatView(state, actor), STYLE_ROSTER.balanced, (state.log.length + actor) >>> 0)
    }

    const turnBefore = state.turn
    const turnHolderHadCards = state.hands[turnBefore].length > 0
    const res = reduce(state, action)
    if (!res.ok) throw new Error(`game ${g}: the engine refused ${JSON.stringify(action)} from seat ${actor}: ${res.error.code} ${res.error.message}`)
    state = res.state
    stats.moves++
    const counts = state.hands.map((h) => h.length)
    for (const ev of res.events) {
      if (ev.type === 'ask') {
        recEvents.push([0, ev.asker, ev.target, FL_INDEX.get(toFl(ev.card)), -1, ev.hit ? 1 : 0, [], counts])
      } else if (ev.type === 'claim') {
        const set = BOOK_SET.get(ev.book)
        const right = isRight(ev)
        if (forcedThis) forcedClaims.add(claimCount)
        claimCount++
        recEvents.push([forcedThis ? 3 : 1, ev.claimer, -1, -1, set, right ? 1 : 0, SET_CARDS[set].map((c) => ev.assignments[toAi(c)]), counts])
        if (bySeat.has(ev.claimer)) {
          stats.ownDeclares++
          if (!right) stats.badDeclares++
        }
        if (!right) {
          failedSeen = true
          stats.wrongDeclaresSeen++
        }
      } else if (ev.type === 'pass') {
        recEvents.push([2, ev.from, ev.to, -1, -1, 0, [], counts])
      }
    }
    // A FishLab-only route to a cardless turn-holder: someone else's declare emptied it (the original's probe).
    if (turnHolderHadCards && state.hands[turnBefore].length === 0 && state.turn !== turnBefore && state.phase !== 'finished' && bySeat.has(turnBefore)) {
      await probeStrandedTurn(state, turnBefore, g, forcedClaims)
    }
  }
  if (state.phase !== 'finished') throw new Error(`game ${g} did not finish in ${guard} moves`)
  stats.games++
  stats.sets[0] += state.score[0]
  stats.sets[1] += state.score[1]
  if (state.score[0] > state.score[1]) stats.wins++
  recordLines.push(JSON.stringify({
    deal: g, rot: 0, orient: 0, shift: 0, seed, dealt, events: recEvents,
    winner: state.score[0] > state.score[1] ? 0 : 1, score: [state.score[0], state.score[1]], hitLimit: false,
    setWinner: SET_BOOK.map((b) => (state.books[b] === undefined ? null : state.books[b].outcome === 'team0' ? 0 : 1)),
  }))
}

await Promise.all(children.map((c) => c.close()))
const wallS = (Date.now() - t0) / 1000

/* ------------------------------------------------------------------------------------------------ report --- */

const counters = []
const otherStderr = []
for (const c of children) {
  for (const l of c.errors) {
    if (l.startsWith('ATHENA COUNTERS ')) counters.push({ seat: c.seat, ...JSON.parse(l.slice('ATHENA COUNTERS '.length)) })
    else if (!l.startsWith(`ATHENA ${manifest.name} `) && !l.includes('ExperimentalWarning') && !l.includes('--trace-warnings')) otherStderr.push(`seat ${c.seat}: ${l}`)
  }
}
const sumOf = (k) => counters.reduce((n, c) => n + (c[k] ?? 0), 0)
const faultNames = counters[0]?.faultNames ?? []
const pkgFaults = Object.fromEntries(faultNames.map((k) => [k, sumOf(k)]))
const pkgFaultTotal = Object.values(pkgFaults).reduce((a, b) => a + b, 0)

if (RECORDS) {
  mkdirSync(dirname(resolve(RECORDS)), { recursive: true })
  writeFileSync(RECORDS, `${recordLines.join('\n')}\n`)
}

const selfFaults = { divergences: stats.divergences, logMismatches: stats.logMismatches, gifts: stats.gifts, sweepNoDeclare: stats.sweepNoDeclare, fullInfoOther: stats.fullInfoOther }
const selfFaultTotal = Object.values(selfFaults).reduce((a, b) => a + b, 0)
const pct = (n, d) => (d === 0 ? '-' : `${((100 * n) / d).toFixed(1)}%`)
console.log(`stub-selftest: ${stats.games} games (selftest-${FIRST} .. selftest-${FIRST + GAMES - 1}) through the package on seats ${PACKAGE_SEATS.join(', ')}, opponents ${OPP}, ${wallS.toFixed(1)} s`)
console.log(`  package       : ${relOf(PKG)}, weights ${manifest.env.ATHENA_WEIGHTS} md5 ${weightMd5}, in-engine reference lib/athena over the same file`)
console.log(`  answered      : ${stats.asks} ask, ${stats.polls} declare poll, ${stats.passes} pass, ${stats.forced} forced (${stats.lastResort} last_resort) in ${stats.sweeps} emulated forced endgames, ${stats.strandedPolls} stranded-turn polls`)
console.log(`  of the polls  : ${stats.declares} declared, ${stats.declines} declined; the adapter: ${sumOf('rails')} rail, ${sumOf('compelled')} compelled (${sumOf('passfixDeclines')} PASSFIX, ${sumOf('mustfixDeclines')} MUSTFIX), ${sumOf('forcedDeclares')} forced declares`)
console.log(`  its declares  : ${stats.ownDeclares} made, ${stats.badDeclares} wrong (${pct(stats.badDeclares, stats.ownDeclares)}); wrong declares in the games (either side): ${stats.wrongDeclaresSeen}`)
console.log(`  sets          : ${stats.sets[0]} - ${stats.sets[1]} (package team first), ${stats.wins}/${stats.games} games won`)
console.log(`  reply time    : ${(stats.totalReplyMs / Math.max(1, stats.replies)).toFixed(2)} ms mean, ${stats.maxReplyMs.toFixed(1)} ms worst, over ${stats.replies} replies (manifest timeout ${manifest.timeout_ms} ms)`)
console.log(`  forward       : ${sumOf('forwards')} network calls, ${sumOf('folds')} events folded, ${sumOf('cacheResets')} cache refolds`)
console.log(`  log shape     : ${stats.logChecks} positions checked`)
console.log(`  full view     : ${stats.fullInfoCompared} replies compared with the in-engine policy on the full-information view: ${stats.fullInfoAfterFailedDeclare} differ after a wrong declare (holders withheld), ${stats.fullInfoStartSeat} where the first event was an out-of-turn declare (start seat unpublished), ${stats.fullInfoOther} otherwise`)
console.log(`  FAULTS (self) : ${Object.entries(selfFaults).map(([k, v]) => `${k} ${v}`).join(', ')}`)
console.log(`  FAULTS (pkg)  : ${Object.entries(pkgFaults).map(([k, v]) => `${k} ${v}`).join(', ')} (${counters.length} of 3 counter lines read)`)
if (RECORDS) console.log(`  records       : ${recordLines.length - 1} games -> ${RECORDS}`)
for (const s of shown) console.log(`  ${s}`)
for (const l of otherStderr.slice(0, 12)) console.log(`  stderr ${l}`)
const ok = selfFaultTotal === 0 && pkgFaultTotal === 0 && counters.length === 3
console.log(ok ? 'OK: every fault counter is zero' : 'FAILED: a fault counter is non-zero')
process.exitCode = ok ? 0 : 1

function relOf(p) {
  return p.replace(ROOT, '').replaceAll('\\', '/').replace(/^\//, '')
}
