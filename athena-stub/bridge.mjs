/**
 * bridge.mjs: the ATHENA stub's translation between a FishLab `state` (`fishlab-json-v1`) and FishAI's `SeatView`.
 * No decision is made here.
 *
 * Built on the pattern of the Bass package's bridge (`botpkg/bridge.mjs`) and the Monet arms' history walk (the
 * bridge archive's `arm_v55/bot.mjs`), with three rules chosen so that the view at an ask equals, field for field,
 * the view the repository's own record walk builds (`scripts/bridge-records.mjs` `walkAsks`), which is what the
 * in-engine pin (`scripts/athena/pin-stub-asks.mjs`) replays:
 *
 * 1. **The reduced reveal** (ATHENA.md §4.1). A right declare publishes its six holders (its stated owners). A wrong
 *    one publishes only the cards a hit had already located, at the seat that hit them; the rest are absent.
 * 2. **`game_started`'s seat** is the first history event's actor, or the turn-holder while the history is empty.
 *    The host's state does not name the start seat. At an empty history the turn-holder is the start seat; after it,
 *    the first event's actor is, unless that event is an out-of-turn declare.
 * 3. **The score is by team**, counted from the history's declares (sets awarded), never taken by side.
 *
 * `player_out` is reconstructed from the hand counts each history event carries, in the reducer's positions. The
 * history is rebuilt from scratch on every request, so the view is a pure function of the state.
 *
 * Every inconsistency is returned as a named fault (`faults`) for the adapter's fault counters; none is papered over.
 */
import { cardBook, sortHand } from './lib/engine/cards.js'
import { us54Config } from './lib/engine/reduce.js'

/** FishLab card names this bridge reads, as FishAI cards: the jokers, and `10x` for the ten. */
export function toAiCard(name) {
  if (typeof name !== 'string') return null
  if (name === 'RJ' || name === 'JR' || name === 'XR') return 'XR'
  if (name === 'BJ' || name === 'JB' || name === 'XB') return 'XB'
  const n = name.startsWith('10') ? `T${name.slice(2)}` : name
  if (n.length !== 2 || !'23456789TJQKA'.includes(n[0]) || !'SHDC'.includes(n[1])) return null
  return n
}

/**
 * The correspondence between the host's deck and FishAI's, from the handshake's `cards`: the card at index i belongs
 * to the host's half-suit i / 6. Throws with the diagnosis on any disagreement.
 */
export function buildDeckMap(cards) {
  if (!Array.isArray(cards) || cards.length !== 54) {
    throw new Error(`hello.cards must list the 54 us54 cards, got ${Array.isArray(cards) ? cards.length : typeof cards}`)
  }
  const toAi = new Map()
  const toFl = new Map()
  for (let i = 0; i < cards.length; i++) {
    const ai = toAiCard(cards[i])
    if (ai === null) throw new Error(`hello.cards[${i}] = ${JSON.stringify(cards[i])} is not a card name this bot can read`)
    if (toFl.has(ai)) throw new Error(`hello.cards lists ${cards[i]} twice`)
    toAi.set(cards[i], ai)
    toFl.set(ai, cards[i])
  }
  const setBook = []
  const setFlCards = []
  const bookToSet = new Map()
  for (let s = 0; s < 9; s++) {
    const six = cards.slice(s * 6, s * 6 + 6)
    const books = [...new Set(six.map((c) => cardBook(toAi.get(c))))]
    if (books.length !== 1) {
      throw new Error(`half-suit ${s} (${six.join(' ')}) spans ${books.length} FishAI sets (${books.join(', ')}): the two decks disagree`)
    }
    if (bookToSet.has(books[0])) throw new Error(`FishAI set ${books[0]} is claimed by half-suits ${bookToSet.get(books[0])} and ${s}`)
    setBook.push(books[0])
    setFlCards.push(six)
    bookToSet.set(books[0], s)
  }
  return { toAi, toFl, setBook, setFlCards, bookToSet }
}

/** How many seats declined before this seat's poll: its distance from the turn-holder (the us54 window's travel). */
export function declinedTicks(seat, turn) {
  return (((seat - turn) % 6) + 6) % 6
}

const eventActor = (ev) => (ev !== null && typeof ev === 'object' && Number.isInteger(ev.actor) ? ev.actor : null)

/**
 * The host's history as FishAI's public log, the resolved sets and the sets awarded by team, with the faults found.
 * `state.turn` names the start seat while the history is empty (rule 2).
 */
export function convertHistory(state, deck) {
  const faults = []
  const history = Array.isArray(state.history) ? state.history : []
  const first = history.length > 0 ? eventActor(history[0]) : null
  const log = [{ type: 'game_started', startingSeat: first !== null ? first : state.turn }]
  const books = {}
  const awarded = [0, 0]
  /** Cards whose current seat a hit made public, while their set is open. */
  const publicAt = new Map()
  let before = [9, 9, 9, 9, 9, 9]
  for (const ev of history) {
    if (ev === null || typeof ev !== 'object') {
      faults.push('unknownEvent')
      continue
    }
    if (ev.t === 'ask') {
      const card = deck.toAi.get(ev.card)
      if (card === undefined) {
        faults.push('unknownEvent')
        continue
      }
      log.push({ type: 'ask', asker: ev.actor, target: ev.target, card, hit: ev.success === true })
      if (ev.success === true) publicAt.set(card, ev.actor)
    } else if (ev.t === 'declare') {
      const book = deck.setBook[ev.set]
      if (book === undefined || !Array.isArray(ev.owner) || ev.owner.length !== 6) {
        faults.push('unknownEvent')
        continue
      }
      const assignments = {}
      const actualHolders = {}
      const six = deck.setFlCards[ev.set].map((c) => deck.toAi.get(c))
      six.forEach((c, j) => {
        assignments[c] = ev.owner[j]
      })
      const right = ev.success === true
      const winner = ev.winner === 0 || ev.winner === 1 ? ev.winner : null
      if (winner === null || (right ? winner !== ev.actor % 2 : winner === ev.actor % 2)) faults.push('declareWinnerClash')
      for (const c of six) {
        const seen = publicAt.get(c)
        if (right) {
          actualHolders[c] = assignments[c]
          if (seen !== undefined && seen !== assignments[c]) faults.push('successHolderClash')
        } else if (seen !== undefined) {
          actualHolders[c] = seen
        }
        publicAt.delete(c)
      }
      const team = winner ?? (right ? ev.actor % 2 : 1 - (ev.actor % 2))
      const claim = { type: 'claim', claimer: ev.actor, book, assignments, actualHolders, outcome: team === 0 ? 'team0' : 'team1' }
      log.push(claim)
      books[book] = { book, outcome: claim.outcome, claimer: ev.actor, assignments, actualHolders }
      awarded[team]++
    } else if (ev.t === 'pass') {
      log.push({ type: 'pass', from: ev.actor, to: ev.target })
    } else {
      faults.push('unknownEvent')
      continue
    }
    if (Array.isArray(ev.counts) && ev.counts.length === 6) {
      for (let s = 0; s < 6; s++) if (before[s] > 0 && ev.counts[s] === 0) log.push({ type: 'player_out', seat: s })
      before = ev.counts.slice()
    } else {
      faults.push('countsDisagree')
    }
  }
  // The history's resolved sets against the state's own record of them.
  for (let s = 0; s < 9; s++) {
    const book = deck.setBook[s]
    const rec = books[book]
    const active = Array.isArray(state.set_active) ? state.set_active[s] !== false : true
    if (active && rec) faults.push('booksDisagree')
    if (rec && Array.isArray(state.set_winner) && state.set_winner[s] !== (rec.outcome === 'team0' ? 0 : 1)) faults.push('booksDisagree')
    if (!active && !rec) {
      // Out of play with no declare in the history: still out of play (its cards are gone), with what the state says.
      faults.push('booksDisagree')
      const w = Array.isArray(state.set_winner) ? state.set_winner[s] : null
      books[book] = { book, outcome: w === 0 ? 'team0' : w === 1 ? 'team1' : 'void', claimer: undefined, assignments: {}, actualHolders: {} }
      if (w === 0 || w === 1) awarded[w]++
    }
  }
  if (history.length > 0 && Array.isArray(state.hand_counts)) {
    const last = history[history.length - 1].counts
    if (!Array.isArray(last) || last.some((n, s) => n !== state.hand_counts[s])) faults.push('countsDisagree')
  }
  return { log, books, awarded, faults }
}

/**
 * The seat's view for one request: `phase`, `turn` and `declareWindow` say which decision the request is (ask:
 * playing and no window; poll: playing and a window at this seat; pass: awaitPass). Returns `{ view, faults }`.
 */
export function buildView(state, deck, { phase, turn, declareWindow }) {
  const { log, books, awarded, faults } = convertHistory(state, deck)
  const hand = []
  for (const c of Array.isArray(state.hand) ? state.hand : []) {
    const ai = deck.toAi.get(c)
    if (ai === undefined) faults.push('viewInvariant')
    else hand.push(ai)
  }
  const counts = Array.isArray(state.hand_counts) ? state.hand_counts.slice(0, 6) : []
  if (counts.length !== 6 || counts[state.seat] !== hand.length) faults.push('viewInvariant')
  while (counts.length < 6) counts.push(0)
  const view = {
    phase,
    turn,
    counts,
    score: [awarded[0], awarded[1]],
    books,
    log,
    moveIndex: log.length,
    config: us54Config,
    seat: state.seat,
    hand: sortHand(hand, us54Config),
  }
  // `views.ts` omits the key when no window is open, and consumers route on its presence.
  if (declareWindow) view.declareWindow = declareWindow
  return { view, faults }
}

/** A plan's assignments as the protocol's `owner` array: `owner[j]` holds the host's card `cards[set * 6 + j]`. */
export function ownerOf(assignments, set, deck) {
  return deck.setFlCards[set].map((c) => assignments[deck.toAi.get(c)])
}
