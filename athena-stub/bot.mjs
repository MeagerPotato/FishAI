/**
 * bot.mjs: the ATHENA stub as a FishLab guest bot (`fishlab-json-v1`). ATHENA.md §4.5 item 6, G0d.
 *
 * One JSON object per line in on stdin, exactly one per line out on stdout, in order. The translation is in
 * [bridge.mjs](bridge.mjs); every decision is `decideStub` from `lib/athena/` (the repository's `lib/athena/*.ts`,
 * type-stripped by `scripts/athena/build-stub-package.mjs`, with the parts of `lib/engine/` it imports). This file adds
 * only what ATHENA.md §1 puts in the adapter, and nothing in the policy:
 *
 * - **PASSFIX.** A poll to a turn-holder with no cards is answered `none` where the policy's claim is compelled: the
 *   host offers a pass for that position, and the adapter takes it (MONET.md §3.8f's arms; CORRECTED-FACTS §1).
 * - **MUSTFIX.** Where the us54 rules compel a claim (`MUST_DECLARE`: declining is illegal at home) and the claim is
 *   not certain by the rules (confidence below 1), the poll is answered `none`, so the host's forced endgame resolves
 *   the position (MONET.md §3.8f). A certain claim goes out as before.
 *
 * Both act only on the stub's `compelled` claims, as the Monet arms act only on `must-declare` and `forced-claim`.
 *
 * ## The weights
 *
 * `ATHENA_WEIGHTS` names the weight file (relative to this directory) and `ATHENA_WEIGHTS_MD5` its md5; the manifest
 * (`fishbot.json`) sets both, and without the environment they are read from the manifest itself. A file whose md5
 * differs is refused before the handshake: the package plays the weights its manifest names, or nothing.
 *
 * ## The counters
 *
 * Every counter in `FAULTS` is a bug if it is non-zero. At the end of input the process writes one line to stderr,
 * `ATHENA COUNTERS {...}`, with every counter, so a harness can check them without parsing the play.
 */
import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from './lib/athena/index.js'
import { buildDeckMap, buildView, declinedTicks, ownerOf } from './bridge.mjs'

const NAME = 'ATHENA-stub'
const VERSION = '0.0'
const PROTOCOL = 'fishlab-json-v1'

const HERE = dirname(fileURLToPath(import.meta.url))
const MANIFEST = JSON.parse(readFileSync(join(HERE, 'fishbot.json'), 'utf8'))
const WEIGHTS = process.env.ATHENA_WEIGHTS || MANIFEST.env?.ATHENA_WEIGHTS
const WEIGHTS_MD5 = process.env.ATHENA_WEIGHTS_MD5 || MANIFEST.env?.ATHENA_WEIGHTS_MD5

function fatal(msg) {
  process.stderr.write(`ATHENA FATAL ${msg}\n`)
  process.exit(2)
}

if (!WEIGHTS || !WEIGHTS_MD5) fatal('no weight file or md5: set ATHENA_WEIGHTS and ATHENA_WEIGHTS_MD5 (the manifest does)')
const bytes = readFileSync(join(HERE, WEIGHTS))
const md5 = createHash('md5').update(bytes).digest('hex')
if (md5 !== WEIGHTS_MD5) fatal(`${WEIGHTS} has md5 ${md5}, the manifest names ${WEIGHTS_MD5}`)
const NET = A.parseWeights(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))

/* ---------------------------------------------------------------------------------------------- counters --- */

const C = {
  opAsk: 0,
  opPoll: 0,
  opPass: 0,
  opForced: 0,
  lastResort: 0,
  newGames: 0,
  rails: 0, // polls answered by the rules-certain rail
  compelled: 0, // polls where the policy's claim was compelled (MUST_DECLARE)
  declines: 0,
  passfixDeclines: 0,
  mustfixDeclines: 0,
  forcedDeclares: 0,
  forcedNoneBelowBar: 0,
  forcedResolvedSet: 0,
  forwards: 0,
  folds: 0,
  cacheResets: 0,
  // faults: each one is a bug
  decideThrew: 0,
  askNotAsk: 0,
  pollNotWindowMove: 0,
  passNotPass: 0,
  passNotCandidate: 0,
  declareShapeBad: 0,
  forcedNone: 0, // `forced` with last_resort answered none
  forcedOwnTeamOut: 0,
  booksDisagree: 0,
  successHolderClash: 0,
  declareWinnerClash: 0,
  countsDisagree: 0,
  viewInvariant: 0,
  unknownEvent: 0,
  requestBeforeHello: 0,
}
const FAULTS = Object.freeze([
  'decideThrew', 'askNotAsk', 'pollNotWindowMove', 'passNotPass', 'passNotCandidate', 'declareShapeBad', 'forcedNone',
  'forcedOwnTeamOut', 'booksDisagree', 'successHolderClash', 'declareWinnerClash', 'countsDisagree', 'viewInvariant',
  'unknownEvent', 'requestBeforeHello',
])

let warned = 0
function warn(kind, detail) {
  if (warned++ < 200) process.stderr.write(`ATHENA WARN ${kind} ${detail}\n`)
}

/* ------------------------------------------------------------------------------------------------- state --- */

let deck = null
/** The deal's per-seat forward cache, fresh at every `new_game`. */
let cache = new A.SeatForward(NET)

const team = (s) => s % 2

function view(state, over) {
  const { view: v, faults } = buildView(state, deck, over)
  for (const f of faults) {
    C[f]++
    warn(f, `seat ${state.seat}, ${Array.isArray(state.history) ? state.history.length : 0} history events`)
  }
  return v
}

function run(v) {
  const r0 = cache.folds
  const x0 = cache.resets
  try {
    const d = A.decideStub(NET, v, cache)
    if (d.forward) C.forwards++
    C.folds += cache.folds - r0
    C.cacheResets += cache.resets - x0
    return d
  } catch (err) {
    C.decideThrew++
    warn('decide-threw', err && err.message)
    return null
  }
}

/** A plan as the protocol's declaration, checked before it goes out (§7): a set in play, owners on our team. */
function declaration(state, plan) {
  const set = deck.bookToSet.get(plan.book)
  const owner = set === undefined ? [] : ownerOf(plan.assignments, set, deck)
  const inPlay = set !== undefined && !(Array.isArray(state.set_active) && state.set_active[set] === false)
  if (!inPlay || owner.length !== 6 || !owner.every((s) => Number.isInteger(s) && s >= 0 && s < 6 && team(s) === team(state.seat))) {
    C.declareShapeBad++
    warn('declare-shape', `${plan.book} set ${set} owner ${JSON.stringify(owner)}`)
    return null
  }
  return { action: 'declare', set, owner, confidence: plan.p }
}

/* ---------------------------------------------------------------------------------------------- handlers --- */

function onHello(req) {
  if (req.protocol !== undefined && req.protocol !== PROTOCOL) return { error: `this bot speaks ${PROTOCOL}, not ${req.protocol}` }
  try {
    deck = buildDeckMap(req.cards)
  } catch (err) {
    return { error: `ATHENA-stub cannot read this deck: ${err && err.message}` }
  }
  process.stderr.write(`ATHENA ${NAME} ${VERSION} seated: weights ${WEIGHTS} md5 ${md5}, arch ${JSON.stringify(NET.arch)}\n`)
  return { ok: true, name: NAME, version: VERSION, protocol: PROTOCOL }
}

function onAsk(state) {
  C.opAsk++
  if (state.turn !== state.seat) {
    C.viewInvariant++
    warn('ask-turn', `ask op with turn ${state.turn} != seat ${state.seat}`)
  }
  const v = view(state, { phase: 'playing', turn: state.turn })
  const d = run(v)
  if (d && d.kind === 'ask' && d.action.type === 'ask') return { action: 'ask', card: deck.toFl.get(d.action.card), target: d.action.target }
  C.askNotAsk++
  warn('ask-not-ask', d ? JSON.stringify(d.action) : 'no decision')
  return fallbackAsk(v)
}

function fallbackAsk(v) {
  const obs = new Uint8Array(A.OBS_LEN)
  const legal = new Uint8Array(A.LEGAL_LEN)
  A.encodeObservation(v, obs, legal)
  for (let c = 0; c < A.N_ASK; c++) {
    if (legal[A.L_ASK + c] !== 1) continue
    const a = A.decodeAction(v.seat, c)
    return { action: 'ask', card: deck.toFl.get(a.card), target: a.target }
  }
  return { error: 'no legal ask: no opponent holds cards, or this hand holds only complete half-suits' }
}

function onPoll(state) {
  C.opPoll++
  const seat = state.seat
  const v = view(state, { phase: 'playing', turn: state.turn, declareWindow: { option: seat, declined: declinedTicks(seat, state.turn) } })
  const d = run(v)
  if (d === null) return { action: 'none' }
  if (d.kind === 'decline') {
    C.declines++
    return { action: 'none' }
  }
  if (d.kind === 'rail') {
    C.rails++
    return declaration(state, d.plan) ?? { action: 'none' }
  }
  if (d.kind === 'compelled') {
    C.compelled++
    // PASSFIX: a cardless turn-holder. The host has a pass for this position and sends it once the poll declines.
    if (v.hand.length === 0 && state.turn === seat) {
      C.passfixDeclines++
      return { action: 'none' }
    }
    // MUSTFIX: an uncertain compelled claim is left to the host's forced endgame.
    if (!(d.plan.p >= 1)) {
      C.mustfixDeclines++
      return { action: 'none' }
    }
    return declaration(state, d.plan) ?? { action: 'none' }
  }
  C.pollNotWindowMove++
  warn('poll-not-window-move', JSON.stringify(d.action))
  return { action: 'none' }
}

function onPass(req, state) {
  C.opPass++
  const candidates = Array.isArray(req.candidates) ? req.candidates.filter(Number.isInteger) : []
  const v = view(state, { phase: 'awaitPass', turn: state.seat })
  const d = run(v)
  if (d && d.kind === 'pass' && d.action.type === 'pass') {
    if (candidates.includes(d.action.to)) return { action: 'pass', to: d.action.to }
    C.passNotCandidate++
    warn('pass-not-candidate', `chose ${d.action.to}, candidates ${JSON.stringify(candidates)}`)
  } else {
    C.passNotPass++
    warn('pass-not-pass', d ? JSON.stringify(d.action) : 'no decision')
  }
  if (candidates.length === 0) return { error: 'a pass was requested with no legal candidates' }
  let to = candidates[0]
  for (const s of candidates) if ((state.hand_counts?.[s] ?? 0) > (state.hand_counts?.[to] ?? 0)) to = s
  return { action: 'pass', to }
}

/**
 * The host's forced endgame (a sweep of confidence bars over named half-suits, then `last_resort`). Answered from the
 * policy's own plan for exactly the set asked about: its assignment, and its confidence as the number compared with
 * the bar. A set certain by the rules always goes out; `last_resort` is always answered while the set is in play.
 */
function onForced(req, state) {
  C.opForced++
  const lastResort = req.last_resort === true
  if (lastResort) C.lastResort++
  const threshold = typeof req.threshold === 'number' ? req.threshold : 0
  const seat = state.seat
  const book = deck.setBook[req.set]
  if (book === undefined || (Array.isArray(state.set_active) && state.set_active[req.set] === false)) {
    C.forcedResolvedSet++
    return { action: 'none' }
  }
  const v = view(state, { phase: 'playing', turn: state.turn, declareWindow: { option: seat, declined: declinedTicks(seat, state.turn) } })
  if ([0, 1, 2, 3, 4, 5].filter((s) => team(s) === team(seat)).every((s) => (v.counts[s] ?? 0) === 0)) {
    C.forcedOwnTeamOut++
    warn('forced-own-team-out', `set ${req.set} threshold ${threshold} last_resort ${lastResort}`)
  }
  let plan = null
  try {
    const k = A.factsOf(v)
    const set = A.setIndex(book)
    plan = A.certainPlan(v, k, set)
    if (plan === null) {
      const r0 = cache.folds
      const x0 = cache.resets
      const f = A.forwardView(NET, v, cache, k)
      C.forwards++
      C.folds += cache.folds - r0
      C.cacheResets += cache.resets - x0
      plan = A.planSet(v, k, set, f.heads)
    }
  } catch (err) {
    C.decideThrew++
    warn('forced-plan-threw', err && err.message)
  }
  if (plan !== null && (plan.certain || lastResort || plan.p >= threshold)) {
    const out = declaration(state, plan)
    if (out) {
      C.forcedDeclares++
      return out
    }
  }
  if (lastResort) {
    C.forcedNone++
    warn('forced-none', `set ${req.set} under last_resort`)
    return { action: 'declare', set: req.set, owner: [seat, seat, seat, seat, seat, seat], confidence: 0 }
  }
  C.forcedNoneBelowBar++
  return { action: 'none' }
}

/* -------------------------------------------------------------------------------------------- dispatch --- */

function handle(req) {
  if (req === null || typeof req !== 'object') return { error: 'expected one JSON object per line' }
  if (req.op === 'hello') return onHello(req)
  if (deck === null) {
    C.requestBeforeHello++
    return { error: `op ${JSON.stringify(req.op)} before hello` }
  }
  switch (req.op) {
    case 'new_game':
      C.newGames++
      cache = new A.SeatForward(NET)
      return { ok: true }
    case 'ask':
      return onAsk(req.state)
    case 'declare_poll':
      return onPoll(req.state)
    case 'pass':
      return onPass(req, req.state)
    case 'forced':
      return onForced(req, req.state)
    default:
      return { error: `unknown op ${JSON.stringify(req.op)}` }
  }
}

/** The safest legal reply to a request that threw: never a declaration it did not plan. */
function safeFallback(req) {
  try {
    if (req.op === 'declare_poll' || req.op === 'forced') return { action: 'none' }
    if (req.op === 'pass') {
      const c = Array.isArray(req.candidates) ? req.candidates.filter(Number.isInteger) : []
      return c.length > 0 ? { action: 'pass', to: c[0] } : { error: 'a pass was requested with no legal candidates' }
    }
    if (req.op === 'ask' && deck !== null) return fallbackAsk(buildView(req.state, deck, { phase: 'playing', turn: req.state.turn }).view)
  } catch {
    // the error reply below
  }
  return { error: `ATHENA-stub could not answer op ${req && req.op}` }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
rl.on('line', (line) => {
  const text = line.trim()
  if (text === '') return
  let req
  try {
    req = JSON.parse(text)
  } catch {
    warn('parse', text.slice(0, 120))
    process.stdout.write(`${JSON.stringify({ error: 'expected one JSON object per line' })}\n`)
    return
  }
  let reply
  try {
    reply = handle(req)
  } catch (err) {
    C.decideThrew++
    warn(`${req && req.op}-threw`, err && err.stack ? err.stack : err)
    reply = safeFallback(req)
  }
  process.stdout.write(`${JSON.stringify(reply)}\n`)
})
rl.on('close', () => {
  const faults = FAULTS.reduce((n, k) => n + C[k], 0)
  process.stderr.write(`ATHENA COUNTERS ${JSON.stringify({ ...C, faults, faultNames: FAULTS })}\n`)
})
