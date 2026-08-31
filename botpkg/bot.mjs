/**
 * bot.mjs — FishAI as a FishLab bot package (`fishlab-json-v1`, docs/BOT_PACKAGE.md).
 *
 * One JSON object per line in on stdin, exactly one per line out on stdout, in order. All the
 * translation is in [bridge.mjs](bridge.mjs); all the play is in `engine/` — the unmodified
 * FishAI bot stack, type-stripped from the repository's TypeScript by
 * `scripts/build-bot-package.mjs`. This file is the seam between them and decides nothing.
 *
 * ## What is seated here
 *
 * FishAI v1.0 — the adaptive engine (ADAPTIVE.md): observe the public log, classify each
 * opponent seat over the nine calibrated style fingerprints, best-respond over the measured
 * 9x9 counter table, and play the chosen style through the v0.5 pipeline at hard skill. All
 * four stages run on every decision.
 *
 * The **anchor is Punter, not the repository default of Balanced**, and that is the one
 * deliberate configuration choice in this package. It is made on the project's own measurement
 * rather than taste. ADAPTIVE.md §5 proves Punter's row dominates every column of the committed
 * counter table, so the best response under *every* posterior the classifier can hold is Punter;
 * §6.1-6.2 then measure what the Balanced anchor costs while the engine waits for evidence
 * (-0.0136 +/- 0.0043 score rate against a pure Punter team, every one of nine gauntlet deltas
 * negative). §7.1 names anchoring on Punter as the remedy and — correctly, for a paper about
 * whether adaptation pays — declines to ship it as the default, because doing so concedes the
 * theorem. For a bot whose job is to win a match rather than to measure a question, conceding
 * the theorem is the right call, so it is conceded here and stated out loud.
 *
 * Nothing is switched off to get there: every style, the classifier, the observation layer, the
 * containment turn-pass and the v1.5 bounded arm all ship and are all reachable through the
 * environment variables below.
 *
 * ## Configuration (all optional; the defaults are the measured-strongest seat)
 *
 * | variable | default | meaning |
 * |---|---|---|
 * | `FISHAI_POLICY` | `adaptive` | `adaptive` \| `style` \| `bounded` \| `easy`/`medium`/`hard` |
 * | `FISHAI_STYLE` | `punter` | roster style for `style`, and for `bounded`'s delegate |
 * | `FISHAI_ANCHOR` | `punter` | the v1.0 anchor: warmup style, and the switch-margin favourite |
 * | `FISHAI_WARMUP` | engine default (40) | observed events before a switch is allowed |
 * | `FISHAI_BITS` | `64` | memory budget for `bounded` — v1.5's difficulty dial |
 * | `FISHAI_DEBUG` | unset | `1` narrates every decision to stderr via `decideExplained` |
 *
 * `FISHAI_POLICY=style FISHAI_STYLE=punter` plays bit-for-bit the same moves as the default and
 * skips the classifier passes; it is the cheaper equivalent, not a different bot.
 *
 * ## The never-throw contract
 *
 * `decide` already promises never to throw and never to return an action its own engine would
 * refuse. This file adds the second half of that promise for *this* host: every reply is
 * re-checked against the protocol's own legality rules (§7) before it goes out, and anything
 * that fails falls back to a legal move rather than to a crash. `{"error": ...}` is reserved
 * for the one case §5.4 describes — genuinely no legal move — because a host that stops the
 * game and shows the message is better than one that invents a move.
 */
import { createInterface } from 'node:readline'
import { decide, decideExplained, planClaimFor, STYLE_ROSTER } from './engine/bots/index.js'
import { legalAsksFromView } from './engine/helpers.js'
import { assignmentsToOwner, buildDeckMap, buildView, declinedTicks } from './bridge.mjs'

const NAME = 'FishAI v1.0'
const VERSION = '1.0'
const PROTOCOL = 'fishlab-json-v1'

const DEBUG = process.env.FISHAI_DEBUG === '1'

function log(...parts) {
  process.stderr.write(`${parts.join(' ')}\n`)
}

/* ------------------------------------------------------------------ policy --- */

function rosterStyle(id, fallback) {
  const key = typeof id === 'string' ? id.trim().toLowerCase() : ''
  return Object.hasOwn(STYLE_ROSTER, key) ? STYLE_ROSTER[key] : STYLE_ROSTER[fallback]
}

function intEnv(name) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return undefined
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : undefined
}

/**
 * The `PolicySpec` this seat plays, and the roster style whose preferences the local fallbacks
 * should mirror. Unrecognised values degrade to the default rather than throwing — the same
 * treatment `resolvePolicy` gives a mis-typed tier name, and the right one for a knob read out
 * of the environment on a machine nobody here controls.
 */
function resolveSeatPolicy() {
  const mode = (process.env.FISHAI_POLICY ?? 'adaptive').trim().toLowerCase()
  const styleId = (process.env.FISHAI_STYLE ?? 'punter').trim().toLowerCase()
  const anchorId = (process.env.FISHAI_ANCHOR ?? 'punter').trim().toLowerCase()
  const warmup = intEnv('FISHAI_WARMUP')

  if (mode === 'style') {
    const style = rosterStyle(styleId, 'punter')
    return { policy: style, style, label: `style:${style.id} (hard skill)` }
  }
  if (mode === 'bounded') {
    const style = rosterStyle(styleId, 'punter')
    const bits = intEnv('FISHAI_BITS') ?? 64
    return {
      policy: { bounded: true, bits, style: style.id },
      style,
      label: `bounded:${bits}bit style:${style.id}`,
    }
  }
  if (mode === 'easy' || mode === 'medium' || mode === 'hard') {
    return { policy: mode, style: STYLE_ROSTER.balanced, label: `tier:${mode}` }
  }
  const anchor = rosterStyle(anchorId, 'punter')
  const spec = { adaptive: true, anchor: anchor.id }
  if (warmup !== undefined) spec.warmupEvents = warmup
  return {
    policy: spec,
    style: anchor,
    label: `adaptive anchor:${anchor.id}${warmup !== undefined ? ` warmup:${warmup}` : ''}`,
  }
}

const SEAT = resolveSeatPolicy()

/**
 * The decision seed. Every shipped configuration runs at hard skill, where the seeded rng is
 * never drawn from at all (only a non-zero `errorRate` or a missing claim planner touches it),
 * so this changes no move. It is derived from the view anyway rather than from a clock, because
 * "same position, same move" is a property of this engine worth keeping true here too.
 */
function seedFor(view) {
  return ((view.seat + 1) * 2654435761 + view.log.length * 40503) >>> 0
}

/** `decide`, plus the stderr narration when `FISHAI_DEBUG=1`. The action is identical either way. */
function play(view, tag) {
  if (!DEBUG) return decide(view, SEAT.policy, seedFor(view))
  const { action, trace } = decideExplained(view, SEAT.policy, seedFor(view))
  log(`[${tag}] ${trace.kind}: ${trace.headline}`)
  for (const n of trace.notes) log(`  - ${n}`)
  for (const r of trace.refused) log(`  x ${r.kind}: ${r.reason}`)
  return action
}

/* ------------------------------------------------------------------- state --- */

/** The deck correspondence, built at `hello` from the engine's own card table. */
let deck = null

function seatTeamOf(seat) {
  return seat & 1
}

/** The three seats of the team opposite `seat`. */
function opponentsOf(seat) {
  return [0, 1, 2, 3, 4, 5].filter((s) => seatTeamOf(s) !== seatTeamOf(seat))
}

/**
 * How to present a `declare_poll` to `decide` — which comes down to the one question
 * `view.turn` settles on this path: **is declining legal right now?**
 *
 * On a poll, `turn` reaches exactly three things in the engine: the two arms of
 * `mustDeclareNow`, and the debug trace's prose. It reaches no ranker, no claim planner, no
 * knowledge build, and no legality check — `isViewLegal` skips the turn test outright while a
 * window is open, because RULES_US54.md §3.1 removes NOT_YOUR_TURN as a declare error. So it is
 * not a description of the position here; it is the field that carries the obligation.
 *
 * And the two hosts disagree about that obligation. RULES_US54.md §3.2 makes `decline` illegal
 * in two positions, because under §3 the declare window is the only thing standing between the
 * table and a state with no legal action at all. FishLab has neither position: §5.2's poll
 * always accepts `{"action":"none"}`, and §7 lists no "you had to declare" fault. It has
 * separate machinery for both —
 *
 * - **a cardless seat holding the turn** gets §5.2's `pass` op, not an ask it cannot make;
 * - **a whole team out of cards** triggers §4's forced endgame, whose `forced` sweep walks a
 *   ladder of confidence thresholds so the best-informed seat answers first.
 *
 * Presented as a `us54` window, both of those read as MUST_DECLARE, and `decideWindow` answers
 * them from `forcedClaim` — "the least-bad claim", which applies no threshold at all because
 * under §3.2 there is genuinely nothing better to do. Sent to this host it is a *volunteered*
 * declaration of a set the planner has often already proved is not the team's: measured against
 * the built package before this guard existed, a cardless turn-holder answered a poll with a
 * declaration at confidence 0.00004, and — since §5.2 re-polls after every declaration that
 * lands, on an unchanged condition — kept answering until every half-suit still in play had
 * been gifted to the opponents.
 *
 * One obligation does survive the trip, and it is the one §3.2 lists second: a turn-holder that
 * still holds cards, whose opponents still hold cards, and whose hand is a union of complete
 * half-suits. Decline there and the host's next request is an `ask` this hand cannot answer,
 * which stops the game (§7). That position keeps its real turn, so the engine forces exactly as
 * it would in-repo.
 *
 * Everywhere else the two rule sets already agree and the real turn is presented unchanged. The
 * substitution is deliberately the narrowest thing that works — an opponent seat, which makes
 * `windowCannotClose` read "is my own team out of cards", the condition `decideWindow` already
 * answers with an unconditional decline for the same reason (§4: every assignment would name an
 * empty seat).
 */
function pollPresentation(state, base) {
  const seat = state.seat
  const turn = Number.isInteger(state.turn) ? state.turn : seat
  const oppsOfTurnAllOut = opponentsOf(turn).every((s) => (base.counts[s] ?? 0) === 0)
  // `legalAsksFromView` with the window removed is exactly the engine's own
  // `viewerCouldAskIfWindowClosed`: the counterfactual "could this seat ask if the window shut
  // onto it", which is the question §3.2 keys MUST_DECLARE on.
  const couldAsk = turn === seat && legalAsksFromView({ ...base, declareWindow: undefined }).length > 0
  const us54Forces = oppsOfTurnAllOut || (turn === seat && !couldAsk)
  const obliged = turn === seat && base.hand.length > 0 && !oppsOfTurnAllOut && !couldAsk
  if (!us54Forces || obliged) return { turn, obliged }
  return { turn: opponentsOf(seat)[0], obliged: false }
}

function clamp01(x) {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0
}

/** Is this half-suit still in play, as far as the state says? */
function setInPlay(state, setIndex) {
  if (!Number.isInteger(setIndex) || setIndex < 0 || setIndex >= deck.nSets) return false
  if (Array.isArray(state.set_active) && state.set_active[setIndex] === false) return false
  return true
}

/**
 * The protocol's legality rules for a declaration (§7), applied to our own reply before it
 * leaves. The one worth the belt and braces is the team check: the engine's own driver *skips*
 * an allocation that names the wrong team, so a transposition here would read as a bot that
 * had decided never to declare — §7 calls that out as the hardest failure of all to debug.
 */
function declarationIsSound(owner, seat) {
  if (!Array.isArray(owner) || owner.length !== 6) return false
  return owner.every((s) => Number.isInteger(s) && s >= 0 && s < 6 && seatTeamOf(s) === seatTeamOf(seat))
}

/* ---------------------------------------------------------------- handlers --- */

function onHello(req) {
  if (req.protocol !== undefined && req.protocol !== PROTOCOL) {
    return { error: `this bot speaks ${PROTOCOL}, not ${req.protocol}` }
  }
  try {
    deck = buildDeckMap(req.cards)
  } catch (err) {
    // `buildDeckMap` composes a precise diagnosis for every way the two decks can disagree —
    // which half-suit spans which sets, which card name is unreadable, what size arrived. This
    // is the one moment that is worth anything: §7 puts the message on the felt, and "half-suit
    // 0 spans 2 FishAI sets (LOW-S, HIGH-S)" is a five-minute fix where a generic failure is an
    // evening of guessing. Passing it through costs three lines.
    const why = err && err.message ? err.message : String(err)
    log(`[hello] refused the deck: ${why}`)
    return { error: `FishAI cannot read this deck — ${why}` }
  }
  log(`${NAME} seated — ${SEAT.label}; ${deck.nSets} half-suits, ${deck.toAi.size} cards mapped`)
  return { ok: true, name: NAME, version: VERSION, protocol: PROTOCOL }
}

function onAsk(state) {
  const view = buildView(state, deck, { phase: 'playing' })
  const action = play(view, 'ask')
  if (action.type === 'ask') {
    const card = deck.toFl.get(action.card)
    if (card !== undefined) return { action: 'ask', card, target: action.target }
  }
  // `decide` returns a non-ask here only on the branch it takes when no legal ask exists —
  // which §5.4 says to report rather than paper over. Confirm that against the view first,
  // because an ask we *can* build is always better than stopping the game.
  const asks = legalAsksFromView(view)
  if (asks.length === 0) {
    return { error: 'no legal ask: this hand holds no card of any half-suit it does not already hold whole, or no opponent still has cards' }
  }
  const pick = asks[0]
  log(`[ask] fell back to the first legal ask — decide() returned ${action.type}`)
  return { action: 'ask', card: deck.toFl.get(pick.card), target: pick.target }
}

/**
 * The confidence attached to a declaration: the claim planner's own success estimate for the
 * set actually being declared, taken from the same planner and the same knowledge the decision
 * used, so the number reported is the number the bot reasoned with. A certain declare prices at
 * exactly 1.
 */
function confidenceOf(view, book) {
  try {
    return clamp01(planClaimFor(view, SEAT.policy, book).p)
  } catch {
    return 1
  }
}

function onDeclarePoll(state) {
  const seat = state.seat
  // Built once without the window, because `pollPresentation` has to ask what this seat could
  // do if the window were closed — and because the log and the resolved sets, which is all the
  // rest of the build, depend on neither the window nor the turn.
  const base = buildView(state, deck, { phase: 'playing' })
  const { turn, obliged } = pollPresentation(state, base)
  const view = {
    ...base,
    turn,
    // `declined` is this seat's place in the real poll round, always — it is the styles'
    // patience budget (RULES_US54.md §3), not part of the obligation question above.
    declareWindow: { option: seat, declined: declinedTicks(seat, state.turn) },
  }
  const action = play(view, 'poll')
  if (action.type !== 'claim') return { action: 'none' }

  const setIndex = deck.bookToSet.get(action.book)
  if (setIndex === undefined || !setInPlay(state, setIndex)) return { action: 'none' }
  const owner = assignmentsToOwner(action.assignments, setIndex, deck, seat)
  if (!declarationIsSound(owner, seat)) {
    log(`[poll] refused to send an unsound declaration of set ${setIndex}: ${JSON.stringify(owner)}`)
    return { action: 'none' }
  }
  const confidence = confidenceOf(view, action.book)
  // A backstop under the obligation logic above, and the one place a confidence number changes
  // what is sent. `planClaim` returns exactly 0 when it has *proved* the declaration cannot
  // succeed — a card of the set is certainly with an opponent, or no teammate is even a
  // candidate for one. Such a declaration has no upside at all: it cannot score, and under
  // RULES_US54.md row 14 a wrong one hands the set to the other team. Declining is free on
  // every poll this host sends, so it is never right to volunteer one; it goes out only where
  // the position genuinely obliges an answer, and there it is the least-bad move rather than a
  // gift. Any confidence above zero is a judgement the style is entitled to make and is left
  // alone.
  if (!obliged && confidence === 0) {
    log(`[poll] withheld a provably-wrong declaration of set ${setIndex} (confidence 0); declining is legal here`)
    return { action: 'none' }
  }
  return { action: 'declare', set: setIndex, owner, confidence }
}

function onPass(req, state) {
  const candidates = Array.isArray(req.candidates) ? req.candidates.filter(Number.isInteger) : []
  const view = buildView(state, deck, { phase: 'awaitPass' })
  const action = play(view, 'pass')
  if (action.type === 'pass' && candidates.includes(action.to)) return { action: 'pass', to: action.to }
  if (candidates.length === 0) return { error: 'a pass was requested with no legal candidates' }
  // Same preference, restricted to the offered set: `passTarget` picks the direction and every
  // shipped style wants the teammate holding the most cards.
  let to = candidates[0]
  for (const s of candidates) {
    const better = SEAT.style.passTarget === 'most' ? view.counts[s] > view.counts[to] : view.counts[s] < view.counts[to]
    if (better) to = s
  }
  return { action: 'pass', to }
}

/**
 * The forced endgame (§5.2). FishLab sweeps a ladder of confidence thresholds, asking each seat
 * whether it will declare one named half-suit at that bar; `us54` has no such sweep, so this is
 * the one request with no branch of `decide` behind it. It is answered with the engine's own
 * claim planner for exactly the set asked about, at exactly the confidence that planner
 * computes — not a second estimate written for this host.
 *
 * `last_resort` is answered unconditionally, including from a team with no cards left. §5.2 is
 * explicit that declining there makes the engine allocate on our behalf, naming every card to
 * one seat, and record it as *our* declaration; a planned guess cannot do worse than that.
 */
function onForced(req, state) {
  const seat = state.seat
  const setIndex = req.set
  const lastResort = req.last_resort === true
  const threshold = typeof req.threshold === 'number' ? req.threshold : 0

  const book = deck.setBook[setIndex]
  if (book === undefined || !setInPlay(state, setIndex)) return { action: 'none' }

  // `forced` hands us the move without moving the table's turn marker, so §6 sets `turn` to our
  // own seat; pass that through rather than the state's, which the request has already done.
  const view = buildView(state, deck, { phase: 'playing', turn: seat })

  let plan = null
  try {
    plan = planClaimFor(view, SEAT.policy, book)
  } catch (err) {
    log(`[forced] planner failed for set ${setIndex}: ${err && err.message}`)
  }

  if (plan === null) {
    if (!lastResort) return { action: 'none' }
    // Nothing to plan with, and somebody must answer: name the whole set to the teammate with
    // the most cards, which is where an unseen card is most likely to be.
    const mates = [0, 1, 2, 3, 4, 5].filter((s) => seatTeamOf(s) === seatTeamOf(seat))
    let to = seat
    for (const s of mates) if ((view.counts[s] ?? 0) > (view.counts[to] ?? 0)) to = s
    return { action: 'declare', set: setIndex, owner: [to, to, to, to, to, to], confidence: 0 }
  }

  const p = clamp01(plan.p)
  if (!lastResort) {
    // RULES_US54.md §4: with the whole team out of cards every assignment names an empty seat,
    // so any declare is necessarily wrong and gifts the set. Never volunteer one.
    const teamCards = [0, 1, 2, 3, 4, 5]
      .filter((s) => seatTeamOf(s) === seatTeamOf(seat))
      .reduce((n, s) => n + (view.counts[s] ?? 0), 0)
    if (teamCards === 0) return { action: 'none' }
    if (p < threshold) return { action: 'none' }
  }

  const owner = assignmentsToOwner(plan.assignments, setIndex, deck, seat)
  if (!declarationIsSound(owner, seat)) {
    log(`[forced] planner produced an unsound allocation for set ${setIndex}: ${JSON.stringify(owner)}`)
    if (!lastResort) return { action: 'none' }
    return { action: 'declare', set: setIndex, owner: [seat, seat, seat, seat, seat, seat], confidence: 0 }
  }
  return { action: 'declare', set: setIndex, owner, confidence: p }
}

/* -------------------------------------------------------------- dispatch --- */

/** The safest legal reply for a request we failed to answer properly. Never invents a declare. */
function safeFallback(req) {
  try {
    if (req.op === 'declare_poll' || req.op === 'forced') return { action: 'none' }
    if (req.op === 'pass') {
      const c = Array.isArray(req.candidates) ? req.candidates.filter(Number.isInteger) : []
      if (c.length > 0) return { action: 'pass', to: c[0] }
      return { error: 'a pass was requested with no legal candidates' }
    }
    if (req.op === 'ask' && deck !== null) {
      const view = buildView(req.state, deck, { phase: 'playing' })
      const asks = legalAsksFromView(view)
      if (asks.length > 0) return { action: 'ask', card: deck.toFl.get(asks[0].card), target: asks[0].target }
    }
  } catch {
    // fall through to the error reply
  }
  return { error: `FishAI could not answer op ${req && req.op}` }
}

function handle(req) {
  if (req === null || typeof req !== 'object') return { error: 'expected one JSON object per line' }
  switch (req.op) {
    case 'hello':
      return onHello(req)
    case 'new_game':
      if (DEBUG) log(`[new_game] seat ${req.seat}, ${Array.isArray(req.hand) ? req.hand.length : '?'} cards`)
      return { ok: true }
    case 'ask':
      return onAsk(req.state)
    case 'declare_poll':
      return onDeclarePoll(req.state)
    case 'pass':
      return onPass(req, req.state)
    case 'forced':
      return onForced(req, req.state)
    default:
      return { error: `unknown op ${JSON.stringify(req.op)}` }
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })

rl.on('line', (line) => {
  const text = line.trim()
  if (text === '') return
  let req = null
  let reply
  try {
    req = JSON.parse(text)
  } catch {
    // A line that is not JSON is the host's problem, not ours; say so on one line and keep the
    // process alive, because a dead process is a fault that ends the game (§7).
    log(`[parse] ignored a line that is not JSON: ${text.slice(0, 120)}`)
    process.stdout.write(`${JSON.stringify({ error: 'expected one JSON object per line' })}\n`)
    return
  }
  try {
    reply = handle(req)
  } catch (err) {
    log(`[${req.op}] ${err && err.stack ? err.stack : err}`)
    reply = safeFallback(req)
  }
  // One object, one line, in order. `process.stdout` is unbuffered to a pipe in Node, so there
  // is nothing further to flush — the failure §3 warns about cannot happen here.
  process.stdout.write(`${JSON.stringify(reply)}\n`)
})
