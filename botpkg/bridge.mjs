/**
 * bridge.mjs — the translation layer between the FishLab bot-package protocol
 * (`fishlab-json-v1`, docs/BOT_PACKAGE.md) and FishAI's `SeatView`.
 *
 * FishAI's bots consume exactly one thing: a `SeatView` — the public table state plus the
 * viewer's own seat and hand (lib/engine/bots/types.ts). Everything in this file exists to
 * build one of those out of a FishLab `state` object, and to translate the `GameAction` that
 * comes back into a protocol reply. No strategy lives here; nothing below chooses a move.
 *
 * ## The two rule sets line up
 *
 * FishLab §4 and FishAI's `us54` (RULES_US54.md) describe the same game: 54 cards in nine
 * half-suits of six, a declare legal at any moment from any seat, a wrong declare awarding
 * the set to the *opponents* rather than voiding it, and a cardless player who may still
 * declare. So the config below pins `variant: 'us54'` and every deck- and set-shaped quantity
 * the engine derives from it is the right one. The differences that remain are named at the
 * three places they bite: `convertHistory` (§6's reduced declare reveal), `declinedTicks`
 * (§5.2's poll instead of §3's travelling option), and the `forced` sweep, which FishLab has
 * and `us54` does not.
 *
 * ## Nothing here is hardcoded from the table in §4
 *
 * The half-suit numbering, the card names and the joker spellings all differ between the two
 * projects, so all three are derived at handshake time from the `cards` array the engine sends
 * — using the rule §4 states: the card at index `i` belongs to half-suit `i / 6` at position
 * `i % 6`, and `owner[j]` names the seat holding `cards[set * 6 + j]`. A host that renumbers
 * its sets, or spells its jokers differently, therefore needs no change here.
 */
import { cardBook } from './engine/cards.js'

/**
 * The rules config every view carries. `us54` is the rule set FishAI's roster is tuned for and
 * the one FishLab §4 describes; every toggle is off, which is the pinned default (RULES.md §5)
 * and matches §4 row for row — in particular `askOwnCardAllowed: false`, since §4 makes "do not
 * hold the card asked for" a legality condition.
 */
export const CONFIG = Object.freeze({
  playerCount: 6,
  variant: 'us54',
  toggles: Object.freeze({
    jokers: false,
    rankQuartet: false,
    mandatoryDeclare: false,
    announceLastCard: false,
    highBooksDouble: false,
    askOwnCardAllowed: false,
    declarerChoosesNext: false,
    claimAnyTurn: false,
    strictMemory: false,
  }),
})

/**
 * Card-name spellings this bridge accepts for the two jokers, mapped to FishAI's `XR`/`XB`.
 *
 * FishLab §4 pins `RJ`/`BJ`. The others are accepted because they cost nothing and because a
 * silent mis-map here would not throw — it would produce a bot that quietly cannot reason about
 * the ninth half-suit. Rank-suit names (`2S`, `TS`, `AS`) are identical in both projects,
 * including `T` for the ten, so they need no table.
 *
 * FishAI spells the jokers `XR`/`XB` rather than `JR`/`JB` on purpose: rank is parsed
 * positionally from `card[0]`, so a `J` prefix would read as rank Jack and mis-bucket the card
 * into a HIGH half-suit (RULES_US54.md §2.1). That is exactly the failure this table prevents
 * when a host spells them `JR`/`JB`.
 */
const JOKER_NAMES = new Map([
  ['RJ', 'XR'],
  ['BJ', 'XB'],
  ['JR', 'XR'],
  ['JB', 'XB'],
  ['XR', 'XR'],
  ['XB', 'XB'],
])

const RANKS = new Set(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'])
const SUITS = new Set(['S', 'H', 'D', 'C'])

/** One FishLab card name as a FishAI `Card`, or null if it is not a name this bridge knows. */
function toAiCard(name) {
  if (typeof name !== 'string') return null
  const joker = JOKER_NAMES.get(name)
  if (joker !== undefined) return joker
  if (name.length !== 2) return null
  if (!RANKS.has(name[0]) || !SUITS.has(name[1])) return null
  return name
}

/**
 * The whole correspondence between the two decks, derived from the handshake's `cards` array
 * by §4's own rule rather than from a table in this file.
 *
 * Throws on any disagreement — a deck of the wrong size, a name this bridge cannot read, or a
 * half-suit whose six cards do not all land in one FishAI set. Refusing at the handshake is the
 * point: every one of those would otherwise surface as a bot that plays on with a corrupted
 * model of the ninth set, which is far harder to see than a startup error.
 */
export function buildDeckMap(cards) {
  if (!Array.isArray(cards) || cards.length === 0 || cards.length % 6 !== 0) {
    throw new Error(`hello.cards must be a non-empty multiple of 6, got ${Array.isArray(cards) ? cards.length : typeof cards}`)
  }
  const toAi = new Map()
  const toFl = new Map()
  const nSets = cards.length / 6
  const setBook = new Array(nSets)
  const setFlCards = new Array(nSets)
  const bookToSet = new Map()

  for (let i = 0; i < cards.length; i++) {
    const fl = cards[i]
    const ai = toAiCard(fl)
    if (ai === null) throw new Error(`hello.cards[${i}] = ${JSON.stringify(fl)} is not a card name this bot can read`)
    if (toAi.has(fl)) throw new Error(`hello.cards lists ${fl} twice`)
    toAi.set(fl, ai)
    toFl.set(ai, fl)
  }

  for (let s = 0; s < nSets; s++) {
    const flSix = cards.slice(s * 6, s * 6 + 6)
    const books = new Set(flSix.map((c) => cardBook(toAi.get(c))))
    if (books.size !== 1) {
      throw new Error(`half-suit ${s} (${flSix.join(' ')}) spans ${books.size} FishAI sets (${[...books].join(', ')}) — the two decks disagree`)
    }
    const book = [...books][0]
    if (bookToSet.has(book)) throw new Error(`FishAI set ${book} claimed by half-suits ${bookToSet.get(book)} and ${s}`)
    setBook[s] = book
    setFlCards[s] = flSix
    bookToSet.set(book, s)
  }

  return { toAi, toFl, setBook, setFlCards, bookToSet, nSets }
}

/**
 * FishLab's `history` as a FishAI `PublicEvent[]`.
 *
 * ### The one place the two hosts publish different information
 *
 * FishAI's own engine reveals the true holders of all six cards on **every** declare, right or
 * wrong (`BookResult.actualHolders`). FishLab §6 does not: *"A wrong declaration reveals nothing
 * else — not who really held the cards."* That is a property of the host, not a capability this
 * bot gives up, and it applies to every bot at the table equally.
 *
 * So `actualHolders` is filled in exactly as far as the public record justifies:
 *
 * - **A successful declare** is a complete reveal. §4 makes success mean every one of the six
 *   cards was where the declarer said, so the claimed `owner` array *is* the true holder map.
 * - **A failed declare** reveals only what was already public: the cards whose current location
 *   the log had already fixed by a hit. Those are supplied; the rest are omitted.
 *
 * Both halves are sound rather than merely conservative. `buildKnowledge` fixes a card's
 * deal-time holder from a claim only while that card has never publicly moved, so the entries
 * supplied for a failed declare — which are, by construction, exactly the cards that *have*
 * moved — can never certify anything; they only let the walk's running hand counts stay
 * correct. What is lost is the deal-time reveal on unmoved cards of a failed declare, and the
 * loss shows up as *weaker* inference, never as a wrong certainty: the historical
 * count-exhaustion rule tests an equality against a count that is now too high, so it declines
 * to fire instead of firing wrongly. The current-position propagation, which does the heavy
 * lifting, runs off `hand_counts` and is exact either way.
 *
 * ### `player_out`, which FishLab has no event for
 *
 * FishAI's reducer pushes a `player_out` event the moment a seat's hand empties — immediately
 * after the ask that took its last card, and after a declare in ascending seat order. FishLab
 * publishes no such event, but it publishes `counts` after every event, and a seat going from
 * some cards to none is exactly what those two records disagree about. So they are reconstructed
 * here, in the reducer's own positions.
 *
 * It carries no card information (the knowledge walk reaches its branch and does nothing there),
 * which is precisely why omitting it looks free and is not: two things downstream are counted in
 * *log positions* rather than in card facts. The v1.0 phase quantisation cuts the log at
 * `floor(events / 30) * 30` and gates warmup on the same truncation, so a log short by three
 * events can sit in the previous phase and choose a style off a staler read; and
 * `isDeepStalled` measures how many events have passed since the last hit and the last claim,
 * which a missing event shortens. Reconstructing them makes the log this bot reasons over the
 * same length, event for event, as the one it reasons over inside the repository — which is
 * what `scripts/botpkg-selftest.mjs` asserts directly rather than leaving to inspection.
 */
export function convertHistory(history, deck) {
  const log = []
  /** Cards whose current location is public because a hit moved them there. */
  const publicAt = new Map()
  const events = Array.isArray(history) ? history : []
  /** Hand sizes before the event being walked; the deal is six equal hands of the whole deck. */
  let before = new Array(6).fill(deck.toAi.size / 6)

  /** The reducer's own `player_out` events for a transition into an empty hand. */
  const emitOuts = (after) => {
    if (!Array.isArray(after)) return
    for (let s = 0; s < 6; s++) {
      if (before[s] > 0 && after[s] === 0) log.push({ type: 'player_out', seat: s })
    }
    before = after.slice(0, 6)
  }

  for (const ev of events) {
    if (ev === null || typeof ev !== 'object') continue
    if (ev.t === 'ask') {
      const card = deck.toAi.get(ev.card)
      if (card === undefined) continue
      log.push({ type: 'ask', asker: ev.actor, target: ev.target, card, hit: ev.success === true })
      if (ev.success === true) publicAt.set(card, ev.actor)
      emitOuts(ev.counts)
      continue
    }
    if (ev.t === 'declare') {
      const book = deck.setBook[ev.set]
      if (book === undefined) continue
      const six = deck.setFlCards[ev.set]
      const assignments = {}
      for (let j = 0; j < 6; j++) {
        const card = deck.toAi.get(six[j])
        const owner = Array.isArray(ev.owner) ? ev.owner[j] : undefined
        if (card !== undefined && typeof owner === 'number') assignments[card] = owner
      }
      let actualHolders
      if (ev.success === true) {
        actualHolders = { ...assignments }
      } else {
        actualHolders = {}
        for (const fl of six) {
          const card = deck.toAi.get(fl)
          const at = card === undefined ? undefined : publicAt.get(card)
          if (at !== undefined) actualHolders[card] = at
        }
      }
      for (const fl of six) publicAt.delete(deck.toAi.get(fl))
      log.push({
        type: 'claim',
        claimer: ev.actor,
        book,
        assignments,
        actualHolders,
        outcome: ev.winner === 0 ? 'team0' : 'team1',
      })
      emitOuts(ev.counts)
      continue
    }
    if (ev.t === 'pass') {
      log.push({ type: 'pass', from: ev.actor, to: ev.target })
      emitOuts(ev.counts)
    }
  }

  // FishAI's own logs open with `game_started`, and its stall thresholds and the v1.0 phase
  // quantisation are both counted over a log of that shape. The event carries no card
  // information (the knowledge walk ignores it outright), so prepending it costs nothing and
  // keeps every length-derived constant reading the log it was tuned against.
  const first = events.find((e) => e !== null && typeof e === 'object' && typeof e.actor === 'number')
  log.unshift({ type: 'game_started', startingSeat: first ? first.actor : 0 })
  return log
}

/** Resolved half-suits as FishAI `BookResult` records — from the log, with `set_active` as the net. */
function buildBooks(state, log, deck) {
  const books = {}
  for (const ev of log) {
    if (ev.type !== 'claim') continue
    books[ev.book] = {
      book: ev.book,
      outcome: ev.outcome,
      claimer: ev.claimer,
      assignments: ev.assignments,
      actualHolders: ev.actualHolders,
    }
  }
  // A set the table reports as out of play but the history does not explain still has to be
  // marked resolved: its six cards are gone, and leaving them in circulation is the silent
  // corruption knowledge.ts's header warns about. `void` is the honest outcome for one whose
  // winner we cannot read — it means "resolved, scored by nobody here", and the set-count
  // helpers skip it rather than crediting the wrong team.
  const active = Array.isArray(state.set_active) ? state.set_active : null
  const winner = Array.isArray(state.set_winner) ? state.set_winner : null
  for (let s = 0; s < deck.nSets; s++) {
    const book = deck.setBook[s]
    if (book === undefined || books[book] !== undefined) continue
    const resolved = active ? active[s] === false : false
    const w = winner ? winner[s] : null
    if (!resolved && w !== 0 && w !== 1) continue
    books[book] = {
      book,
      outcome: w === 0 ? 'team0' : w === 1 ? 'team1' : 'void',
      claimer: 0,
      assignments: {},
      actualHolders: {},
    }
  }
  return books
}

/**
 * How many declare-option ticks have passed before this seat gets the offer.
 *
 * FishAI's `us54` declare window (RULES_US54.md §3) offers the option seat by seat *"starting
 * from the current turn-holder and proceeding 0→1→2→3→4→5 cyclically"*, and `declined` counts
 * how many seats have passed it up so far. The styles' patience
 * (`declareEagerness`) is denominated in exactly those ticks: a patient style wants to see some
 * of the table decline before it commits to a speculative declare.
 *
 * FishLab §5.2 runs the same offer as a poll of every seat before every move. So one poll round
 * *is* one window, and a seat's position in it is its distance from the turn-holder in seat
 * order — which is what this returns. Deriving it (rather than passing 0 every time, which is
 * the obvious thing to do and is quietly wrong) is what keeps the patience mechanism working:
 * at a constant 0 the more patient styles would decline every speculative declare forever.
 */
export function declinedTicks(seat, turn) {
  const d = (seat - turn) % 6
  return d < 0 ? d + 6 : d
}

/**
 * A `SeatView` for this request. `phase` and `declareWindow` are what select the branch
 * `decide` takes, so each caller in bot.mjs passes the pair its request means:
 *
 * | request | phase | declareWindow | branch reached |
 * |---|---|---|---|
 * | `ask` | `playing` | absent | `decideUs54Ask` — window closed, an ask is the only legal move |
 * | `declare_poll` | `playing` | open at this seat | `decideWindow` — declare or decline |
 * | `pass` | `awaitPass` | absent | `passAction` |
 * | `forced` | `playing` | absent | none: answered through `planClaimFor` |
 */
export function buildView(state, deck, { phase, declareWindow, turn }) {
  const log = convertHistory(state.history, deck)
  const hand = []
  for (const c of Array.isArray(state.hand) ? state.hand : []) {
    const ai = deck.toAi.get(c)
    if (ai !== undefined) hand.push(ai)
  }
  const counts = Array.isArray(state.hand_counts) ? state.hand_counts.slice(0, 6) : [0, 0, 0, 0, 0, 0]
  while (counts.length < 6) counts.push(0)
  const score = Array.isArray(state.score) ? state.score : [0, 0]
  return {
    phase,
    turn: typeof turn === 'number' ? turn : state.turn,
    counts,
    score: [score[0] ?? 0, score[1] ?? 0],
    books: buildBooks(state, log, deck),
    log,
    moveIndex: log.length,
    config: CONFIG,
    ...(declareWindow ? { declareWindow } : {}),
    seat: state.seat,
    hand,
  }
}

/**
 * A FishAI claim's `assignments` as the protocol's `owner` array: `owner[j]` is the seat holding
 * `cards[set * 6 + j]` (§4). Any card the plan somehow left unassigned falls back to the
 * declaring seat, which is always a legal own-team value — the engine refuses a declaration
 * naming a seat on the other team outright (§7), so a hole here must never reach the wire.
 */
export function assignmentsToOwner(assignments, setIndex, deck, seat) {
  const six = deck.setFlCards[setIndex]
  const owner = new Array(6)
  for (let j = 0; j < 6; j++) {
    const card = deck.toAi.get(six[j])
    const s = card === undefined ? undefined : assignments[card]
    owner[j] = typeof s === 'number' ? s : seat
  }
  return owner
}
