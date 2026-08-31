/**
 * botpkg-selftest.mjs — play the built package for real, over stdio, and check that it is the
 * same bot as the one in this repository.
 *
 *     node scripts/build-bot-package.mjs && node scripts/botpkg-selftest.mjs [games]
 *
 * ## What this is
 *
 * A FishLab host, written against docs/BOT_PACKAGE.md, refereed by FishAI's own `us54` engine.
 * Seats 0, 2 and 4 are the packaged bot in three separate child processes, spoken to in
 * `fishlab-json-v1` exactly as the real host would: one JSON object per line in, one per line
 * out, `hello` once, `new_game` per deal, and a `declare_poll` to the option seat before every
 * move. Seats 1, 3 and 5 are played in-process by a native `decide` call.
 *
 * Two things about it are deliberate and load-bearing:
 *
 * 1. **It uses the FishLab half-suit numbering and card names**, not FishAI's. Low Spades is
 *    set 0 and the jokers are `RJ`/`BJ` (BOT_PACKAGE.md §4), where the engine's own canonical
 *    order is suit-major with `XR`/`XB` last. If the bridge's derived correspondence were wrong
 *    anywhere, every declaration would name the wrong set and nothing would score.
 *
 * 2. **It reproduces §6's reduced reveal.** A `declare` event in the history it sends carries
 *    the claimed `owner` array and `success`, and *never* the true holders of a failed
 *    declaration — the one piece of information this engine publishes and FishLab does not. The
 *    packaged bot is therefore measured on the information it will actually have.
 *
 * ## The equivalence check
 *
 * Because the referee here is FishAI's own engine, the declare window the bridge reconstructs
 * from `(seat, turn)` is the real one, and — as long as no declaration fails — the packaged bot
 * sees exactly what a native seat sees. So the run asserts the strong property rather than a
 * statistical one: **every move the packaged seats play is compared against the move `decide`
 * would have played on the same position**, and any divergence is reported with the position
 * that produced it. Divergences after a failed declaration are expected and counted separately;
 * anywhere else they are a bug in the bridge.
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allBooks, bookCards, cardBook } from '../lib/engine/cards.ts'
import { newGame, reduce, us54Config } from '../lib/engine/reduce.ts'
import { seatView } from '../lib/engine/views.ts'
import { decide, STYLE_ROSTER } from '../lib/engine/bots/index.ts'
// The bridge the package ships, imported directly so the log it reconstructs can be compared
// against the engine's own log rather than only inferred from the moves that came out of it.
import { buildDeckMap, convertHistory } from '../dist/botpkg/bridge.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BOT = join(ROOT, 'dist/botpkg/bot.mjs')
const GAMES = Number.parseInt(process.argv[2] ?? '12', 10)
const PACKAGE_SEATS = [0, 2, 4]

/* ------------------------------------------------- the FishLab deck, §4 verbatim --- */

const SET_NAMES = [
  'Low Spades', 'High Spades', 'Low Hearts', 'High Hearts',
  'Low Diamonds', 'High Diamonds', 'Low Clubs', 'High Clubs', 'Eights & Jokers',
]
const FL_CARDS = [
  '2S', '3S', '4S', '5S', '6S', '7S',
  '9S', 'TS', 'JS', 'QS', 'KS', 'AS',
  '2H', '3H', '4H', '5H', '6H', '7H',
  '9H', 'TH', 'JH', 'QH', 'KH', 'AH',
  '2D', '3D', '4D', '5D', '6D', '7D',
  '9D', 'TD', 'JD', 'QD', 'KD', 'AD',
  '2C', '3C', '4C', '5C', '6C', '7C',
  '9C', 'TC', 'JC', 'QC', 'KC', 'AC',
  '8S', '8H', '8D', '8C', 'RJ', 'BJ',
]

const toAi = (fl) => (fl === 'RJ' ? 'XR' : fl === 'BJ' ? 'XB' : fl)
const toFl = (ai) => (ai === 'XR' ? 'RJ' : ai === 'XB' ? 'BJ' : ai)

const SET_BOOK = []
const BOOK_SET = new Map()
for (let s = 0; s < 9; s++) {
  const book = cardBook(toAi(FL_CARDS[s * 6]))
  SET_BOOK.push(book)
  BOOK_SET.set(book, s)
}
const SET_CARDS = SET_BOOK.map((_, s) => FL_CARDS.slice(s * 6, s * 6 + 6))

/* ------------------------------------------------------------------ children --- */

/** One package process, addressed line by line. */
function startChild(seat) {
  const child = spawn(process.execPath, [BOT], {
    cwd: dirname(BOT),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1', FISHLAB_PROTOCOL: 'fishlab-json-v1' },
  })
  const pending = []
  createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (line) => {
    const next = pending.shift()
    if (next === undefined) throw new Error(`seat ${seat} sent an unrequested line: ${line}`)
    next(line)
  })
  const errors = []
  createInterface({ input: child.stderr, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (l) => errors.push(l))
  return {
    seat,
    errors,
    stop: () => child.kill(),
    ask: (req) =>
      new Promise((res, rej) => {
        pending.push((line) => {
          try {
            res(JSON.parse(line))
          } catch (e) {
            rej(new Error(`seat ${seat} replied with non-JSON: ${line}`))
          }
        })
        child.stdin.write(`${JSON.stringify(req)}\n`)
      }),
  }
}

/* -------------------------------------------------------- state -> the wire --- */

/**
 * The `state` object of BOT_PACKAGE.md §6, projected for one seat from the engine's own state.
 *
 * This is where §6's rule lives: on a declaration the history carries what the table *heard* —
 * the claimed `owner` array and whether it was right — and nothing else. A failed declaration's
 * true holders are dropped on the floor here exactly as they are at a real FishLab table.
 */
function wireState(state, seat) {
  const counts = state.hands.map((h) => h.length)
  const running = new Array(6).fill(state.config.variant === 'us54' ? 9 : 8)
  const history = []
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
        t: 'declare',
        actor: ev.claimer,
        set,
        forced: false,
        success: ev.outcome === (ev.claimer % 2 === 0 ? 'team0' : 'team1'),
        winner: ev.outcome === 'team0' ? 0 : 1,
        owner: SET_CARDS[set].map((c) => ev.assignments[toAi(c)] ?? ev.claimer),
        counts: [...running],
      })
    } else if (ev.type === 'pass') {
      history.push({ t: 'pass', actor: ev.from, target: ev.to, counts: [...running] })
    }
  }
  const books = allBooks(state.config)
  return {
    seat,
    turn: state.turn,
    deck_sets: 9,
    hand: state.hands[seat].map(toFl),
    hand_counts: counts,
    score: [state.score[0], state.score[1]],
    set_active: SET_BOOK.map((b) => state.books[b] === undefined),
    set_winner: SET_BOOK.map((b) => {
      const r = state.books[b]
      return r === undefined ? null : r.outcome === 'team0' ? 0 : 1
    }),
    n_asks: state.log.filter((e) => e.type === 'ask').length,
    rules: { out_of_turn_declare: true, cardless_may_declare: true, max_asks: 400, deck_sets: books.length },
    history,
  }
}

/** A protocol reply, as the engine's own `GameAction`. */
function toAction(reply, seat) {
  if (reply === null || typeof reply !== 'object') throw new Error(`seat ${seat}: reply is not an object`)
  if (reply.error !== undefined) throw new Error(`seat ${seat} refused: ${reply.error}`)
  switch (reply.action) {
    case 'ask':
      return { type: 'ask', seat, target: reply.target, card: toAi(reply.card) }
    case 'declare': {
      const book = SET_BOOK[reply.set]
      const assignments = {}
      SET_CARDS[reply.set].forEach((c, j) => {
        assignments[toAi(c)] = reply.owner[j]
      })
      return { type: 'claim', seat, book, assignments }
    }
    case 'none':
      return { type: 'decline', seat }
    case 'pass':
      return { type: 'pass', seat, to: reply.to }
    default:
      throw new Error(`seat ${seat}: unknown action ${JSON.stringify(reply.action)}`)
  }
}

/**
 * The declare_poll a FishLab host sends that this referee never will — sent by hand, because it
 * is the one §5.2 position `us54` cannot produce and it is where the expensive mistake lives.
 *
 * A cardless seat holding the turn is FishLab's `pass` position, and §5.2 polls *every seat
 * before every move*, the pass included. `us54` never poses it: reduce.ts closes the window into
 * `awaitPass` when the turn-holder empties itself, and moves the turn off an emptied turn-holder
 * when somebody else's declare empties it. So the harness above takes its `pass` branch and the
 * poll is never sent — which is exactly how a bot that answered it by gifting away every
 * remaining half-suit passed 40 clean games.
 *
 * The assertion is the narrow one that cannot have a legitimate exception: a cardless seat may
 * well declare a set its teammates hold (RULES_US54.md row 15 allows it and it can be the right
 * move), but it must never send a declaration its own planner prices at 0 — that is a
 * declaration proved not to be the team's, which can only hand the set to the opponents.
 */
async function probeStrandedTurn(state, seat, turn, game) {
  if (!bySeat.has(seat)) return
  const st = wireState(state, seat)
  st.turn = turn
  stats.strandedPolls++
  const reply = await callSeat(seat, { op: 'declare_poll', state: st })
  if (reply.action !== 'declare') return
  stats.strandedDeclares++
  if (reply.confidence === 0 && stats.gifts.length < 5) {
    stats.gifts.push({ game, seat, set: reply.set, confidence: reply.confidence, counts: st.hand_counts.join(',') })
  }
}

/** Same shape, same fields, same order — for the move-for-move equivalence check. */
function canonical(action) {
  if (action.type === 'claim') {
    const cards = [...bookCards(action.book, us54Config)]
    return `claim ${action.book} ${cards.map((c) => action.assignments[c]).join(',')}`
  }
  if (action.type === 'ask') return `ask ${action.card}->${action.target}`
  if (action.type === 'pass') return `pass ${action.to}`
  return action.type
}

/* ------------------------------------------------------------------ the run --- */

const POLICY = { adaptive: true, anchor: 'punter' }

const stats = {
  games: 0, moves: 0, asks: 0, polls: 0, declines: 0, declares: 0, passes: 0, forced: 0,
  ownDeclares: 0, badDeclares: 0, divergences: [], afterFailedDeclare: 0, wins: 0, sets: [0, 0],
  maxReplyMs: 0, totalReplyMs: 0, replies: 0, logChecks: 0, logMismatches: [],
  strandedPolls: 0, strandedDeclares: 0, gifts: [],
}

/** The deck map the packaged bridge builds from this host's `cards` table. */
const BRIDGE_DECK = buildDeckMap(FL_CARDS)

/**
 * The reconstructed log must be the same length, event for event, as the engine's own — the
 * property `player_out` reconstruction exists to preserve, and the one that makes the phase
 * quantisation and the stall detector read the same numbers on both sides. Asserted directly
 * here because a divergence in it is invisible in the moves until the day it is not.
 */
function checkLogShape(state, seat) {
  stats.logChecks++
  const wire = wireState(state, seat)
  const rebuilt = convertHistory(wire.history, BRIDGE_DECK)
  const native = state.log
  if (rebuilt.length === native.length) return
  if (stats.logMismatches.length < 5) {
    const kinds = (l) => l.map((e) => e.type ?? e.t).join(',')
    stats.logMismatches.push({
      seat, events: native.length, rebuilt: rebuilt.length,
      nativeTail: kinds(native.slice(-6)), rebuiltTail: kinds(rebuilt.slice(-6)),
    })
  }
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

for (const c of children) {
  const hello = await c.ask({
    op: 'hello', protocol: 'fishlab-json-v1', engine: 'fishlab', seats: 6, set_size: 6,
    timeout_ms: 10000, cards: FL_CARDS, sets: SET_NAMES,
  })
  if (hello.ok !== true) throw new Error(`seat ${c.seat} refused the handshake: ${JSON.stringify(hello)}`)
  if (hello.protocol !== 'fishlab-json-v1') throw new Error(`seat ${c.seat} answered the wrong protocol`)
}

for (let g = 0; g < GAMES; g++) {
  let state = newGame(`selftest-${g}`, us54Config, (g % 6))
  let failedDeclareSeen = false

  for (const c of children) {
    const ok = await c.ask({ op: 'new_game', seat: c.seat, deck_sets: 9, hand: state.hands[c.seat].map(toFl), rules: {} })
    if (ok.ok !== true) throw new Error(`seat ${c.seat} refused new_game`)
  }

  let guard = 0
  while (state.phase !== 'finished' && guard++ < 4000) {
    const window = state.declareWindow
    const actor = window ? window.option : state.turn
    let action

    if (bySeat.has(actor)) {
      checkLogShape(state, actor)
      const st = wireState(state, actor)
      let reply
      if (state.phase === 'awaitPass') {
        // §5.2 polls every seat before every move, and a pass is a move — so a FishLab host
        // sends a declare_poll here that this us54 referee does not. Send it by hand.
        await probeStrandedTurn(state, actor, actor, g)
        const candidates = [0, 1, 2, 3, 4, 5].filter((s) => s % 2 === actor % 2 && s !== actor && state.hands[s].length > 0)
        reply = await callSeat(actor, { op: 'pass', candidates, state: st })
        stats.passes++
      } else if (window) {
        reply = await callSeat(actor, { op: 'declare_poll', state: st })
        stats.polls++
      } else {
        reply = await callSeat(actor, { op: 'ask', state: st })
        stats.asks++
      }
      action = toAction(reply, actor)
      if (action.type === 'decline') stats.declines++
      if (action.type === 'claim') stats.declares++

      // The equivalence check: what would this repository's own bot have played here?
      //
      // The seed is bot.mjs's own formula over bot.mjs's own view, not an approximation of it —
      // `seedFor` reads `view.log.length`, which is the reconstructed log's length. Every seat
      // shipped here runs at hard skill, where the seeded rng is never drawn, so this changes no
      // move today; it is written exactly anyway so the comparison would still be sound if some
      // future configuration did draw from it.
      const packagedLogLength = convertHistory(wireState(state, actor).history, BRIDGE_DECK).length
      const seed = ((actor + 1) * 2654435761 + packagedLogLength * 40503) >>> 0
      const native = decide(seatView(state, actor), POLICY, seed)
      if (canonical(native) !== canonical(action)) {
        if (failedDeclareSeen) stats.afterFailedDeclare++
        else if (stats.divergences.length < 5) {
          stats.divergences.push({ game: g, seat: actor, events: state.log.length, native: canonical(native), packaged: canonical(action) })
        }
      }
    } else {
      action = decide(seatView(state, actor), STYLE_ROSTER.balanced, (state.log.length + actor) >>> 0)
    }

    const turnBefore = state.turn
    const turnHolderHadCards = state.hands[turnBefore].length > 0
    const res = reduce(state, action)
    if (!res.ok) throw new Error(`game ${g}: engine refused ${JSON.stringify(action)} from seat ${actor}: ${res.error.code} ${res.error.message}`)
    state = res.state
    stats.moves++

    // The second FishLab-only route to a cardless turn-holder: somebody else's out-of-turn
    // declare took the turn-holder's last card. `us54` hides the position by silently moving
    // the turn to the next seat with cards; FishLab leaves the turn where it is and issues a
    // `pass`, polling everyone first. Probe the seat the turn would still be on.
    if (turnHolderHadCards && state.hands[turnBefore].length === 0 && state.turn !== turnBefore && state.phase !== 'finished') {
      await probeStrandedTurn(state, turnBefore, turnBefore, g)
    }

    for (const ev of res.events) {
      if (ev.type !== 'claim') continue
      const right = ev.outcome === (ev.claimer % 2 === 0 ? 'team0' : 'team1')
      if (bySeat.has(ev.claimer)) {
        stats.ownDeclares++
        if (!right) stats.badDeclares++
      }
      if (!right) failedDeclareSeen = true
    }
  }

  if (state.phase !== 'finished') throw new Error(`game ${g} did not finish in ${guard} moves`)
  stats.games++
  stats.sets[0] += state.score[0]
  stats.sets[1] += state.score[1]
  if (state.score[0] > state.score[1]) stats.wins++
}

for (const c of children) c.stop()

/* ------------------------------------------------------------------- report --- */

const pct = (n, d) => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`)
console.log(`Played ${stats.games} complete games through the packaged bot on seats ${PACKAGE_SEATS.join(', ')}.`)
console.log(`  answered      : ${stats.asks} ask, ${stats.polls} declare poll, ${stats.passes} pass, ${stats.forced} forced`)
console.log(`  of the polls  : ${stats.declares} declared, ${stats.declines} declined`)
console.log(`  its declares  : ${stats.ownDeclares} made, ${stats.badDeclares} wrong (${pct(stats.badDeclares, stats.ownDeclares)})`)
console.log(`  sets          : ${stats.sets[0]} - ${stats.sets[1]} (package team first), ${stats.wins}/${stats.games} games won`)
console.log(`  reply time    : ${(stats.totalReplyMs / Math.max(1, stats.replies)).toFixed(2)} ms mean, ${stats.maxReplyMs.toFixed(1)} ms worst`)
console.log(`  log shape     : ${stats.logChecks} positions checked, ${stats.logMismatches.length} where the reconstructed log differs in length from the engine's`)
console.log(`  stranded turn : ${stats.strandedPolls} polls this referee cannot send (cardless seat holding the turn), ${stats.strandedDeclares} answered with a declare, ${stats.gifts.length} of those provably wrong`)
console.log(`  equivalence   : ${stats.divergences.length} divergence(s) from native decide() on a full-information position`)
console.log(`                  ${stats.afterFailedDeclare} after a failed declaration, where §6 withholds the true holders (expected)`)

const stderrLines = children.flatMap((c) => c.errors)
if (stderrLines.length > 0) {
  console.log(`  bot stderr    :`)
  for (const l of stderrLines.slice(0, 12)) console.log(`     ${l}`)
}

if (stats.logMismatches.length > 0) {
  console.log('\nLOG SHAPE MISMATCHES (the bridge rebuilt a log of a different length):')
  for (const m of stats.logMismatches) {
    console.log(`  seat ${m.seat}: engine ${m.events} events [...${m.nativeTail}]  bridge ${m.rebuilt} [...${m.rebuiltTail}]`)
  }
}
if (stats.divergences.length > 0) {
  console.log('\nDIVERGENCES (packaged bot did not play what decide() plays on the same position):')
  for (const d of stats.divergences) {
    console.log(`  game ${d.game} seat ${d.seat} @${d.events} events: native=${d.native}  packaged=${d.packaged}`)
  }
}
if (stats.gifts.length > 0) {
  console.log('\nGIFTS (a declaration the bot\'s own planner prices at 0 — it cannot score, only hand the set over):')
  for (const gift of stats.gifts) {
    console.log(`  game ${gift.game} seat ${gift.seat}: declared set ${gift.set} at confidence ${gift.confidence}, counts ${gift.counts}`)
  }
}
if (stats.divergences.length > 0 || stats.logMismatches.length > 0 || stats.gifts.length > 0) {
  process.exitCode = 1
} else {
  console.log('\nOK — the packaged bot played move-for-move what the repository engine plays,')
  console.log('     over a log reconstructed to the same shape as the engine\'s own.')
}
