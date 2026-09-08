/**
 * imitation.ts — MONET.md §3.8ac: the ask policy learned from SESTINA's recorded play. The bridge
 * records (their engine's output — data) hold every deal and every event of our matches against
 * SESTINA v1.0, so its ask choices — the output of its own twelve-deal, depth-twelve search — can
 * be fitted as a fast policy of ours: a score over the seat's legal asks, the chosen one the
 * argmax. The owner's direction of 2026-09-08: learning from SESTINA's play is essential, and the
 * goal past parity is to beat it — this policy is also the opponent model the search's rollouts
 * lacked (§3.8aa read the lock-leaf search ahead at home, where its rollouts model the opponents
 * exactly, and behind abroad, where they do not).
 *
 * ## The features
 *
 * Per legal ask, from the seat's own view and knowledge and the ranker's own list — public-view
 * only, as everything in this directory: the hit probability and its certainty, the ranker's
 * relative score and rank, the asked half-suit's picture (own cards, the team's certain count,
 * the opponents', the target's, the unknown), the target's hand, the ask history of the half-suit
 * and the card (who opened it, whether the card was asked before), the seat's run and its last
 * target, and a few terms of the state the same for every ask (the score, the resolved count, the
 * hand, the asks so far). `ASK_FEATURES` names them in order.
 *
 * ## In play
 *
 * `StyleParams.askModel` names a model registered with `registerAskModel`; `pickAsk` in decide.ts
 * then returns `chooseAskByModel`'s argmax over the ranked list in place of its own choice — the
 * ranker still lists the legal asks and their probabilities, the model chooses among them. Absent,
 * byte identity. The declare, the pass and every window decision stay the stack's.
 */
import type { BookId, Card, Seat } from '../types.ts'
import { allBooks, bookCards, cardBook, seatTeam } from '../cards.ts'
import type { Knowledge, RankedAsk, SeatView } from './types.ts'
import { compileNet, forwardNet } from './net.ts'
import type { CompiledNet, DenseModel } from './net.ts'

export const ASK_FEATURES = [
  /** The ranker's hit probability of the ask. */
  'p',
  /** 1 when the hit is certain. */
  'certain',
  /** 1 when the ask is a known miss. */
  'knownMiss',
  /** The ranker's score less the best score on the list, in hundreds. */
  'scoreRel',
  /** 1 / (1 + the ask's position in the ranker's list). */
  'rankInv',
  /** 1 for the ranker's top ask. */
  'isTop',
  /** The card's candidate holders, over six. */
  'candCount',
  /** Of the six, the team's certainly-held count, over six (the ranker's progress). */
  'progress',
  /** Of the six, in this seat's own hand, over six. */
  'ownHeld',
  /** Of the six, certainly with the opponents, over six. */
  'theirsKnown',
  /** Of the six, located nowhere certain, over six. */
  'unknownOfBook',
  /** The target's hand size, over nine. */
  'targetHand',
  /** Of the six, certainly at the target, over six. */
  'targetKnownOfBook',
  /** 1 when the team certainly holds every other card of the half-suit (a hit completes it). */
  'gamble',
  /** 1 when this seat has asked into the half-suit before. */
  'bookAskedByMe',
  /** 1 when a teammate has. */
  'bookAskedByMate',
  /** 1 when an opponent has. */
  'bookAskedByThem',
  /** Asks into the half-suit so far, over ten. */
  'bookAsks',
  /** 1 when this card was asked for before, by anyone. */
  'cardAskedBefore',
  /** 1 when this seat asked for this card before. */
  'cardAskedByMe',
  /** 1 when the target asked THIS seat into the half-suit before (a card of ours may sit with it). */
  'targetAskedMe',
  /** 1 when this seat's previous ask went to the same target. */
  'lastTargetSame',
  /** This seat's run of consecutive hits just before this decision, over five. */
  'hitRun',
  /** The ranker's narrowing term: 1 / (candidates − 1) when the target is a candidate. */
  'narrowing',
  /** 1 when this half-suit is the one the seat holds the most cards of. */
  'bookIsMyMax',
  /** The half-suit's rank by this seat's holding, 0 for the most, over eight. */
  'ownHeldRank',
  /** 1 for the EIGHTS half-suit. */
  'isEights',
  /** The seat's team score less the other's, over nine (the same for every ask). */
  'scoreDiff',
  /** Resolved half-suits, over nine. */
  'resolved',
  /** This seat's hand, over nine. */
  'myHand',
  /** Asks so far, in hundreds. */
  'asks',
  /** Teammates still holding cards, over two. */
  'matesIn',
  /** Opponents still holding cards, over three. */
  'oppsIn',
] as const

export const ASK_FEATURE_COUNT = ASK_FEATURES.length

/** What the log says about the asks so far, read once per decision. */
interface AskHistory {
  byMe: Set<BookId>
  byMate: Set<BookId>
  byThem: Set<BookId>
  bookAsks: Map<BookId, number>
  cardAsked: Set<Card>
  cardAskedByMe: Set<Card>
  /** The target seat → the half-suits it asked this seat into. */
  askedMeInto: Map<Seat, Set<BookId>>
  lastTarget: Seat | -1
  hitRun: number
  asks: number
}

function askHistory(view: SeatView): AskHistory {
  const me = view.seat
  const myTeam = seatTeam(me)
  const h: AskHistory = { byMe: new Set(), byMate: new Set(), byThem: new Set(), bookAsks: new Map(), cardAsked: new Set(), cardAskedByMe: new Set(), askedMeInto: new Map(), lastTarget: -1, hitRun: 0, asks: 0 }
  let run = 0
  for (const ev of view.log) {
    if (ev.type !== 'ask') continue
    h.asks++
    const b = cardBook(ev.card)
    h.bookAsks.set(b, (h.bookAsks.get(b) ?? 0) + 1)
    h.cardAsked.add(ev.card)
    if (ev.asker === me) {
      h.byMe.add(b)
      h.cardAskedByMe.add(ev.card)
      h.lastTarget = ev.target
      run = ev.hit ? run + 1 : 0
    } else {
      if (seatTeam(ev.asker) === myTeam) h.byMate.add(b)
      else h.byThem.add(b)
      if (ev.target === me) {
        let s = h.askedMeInto.get(ev.asker)
        if (!s) { s = new Set(); h.askedMeInto.set(ev.asker, s) }
        s.add(b)
      }
      run = 0
    }
  }
  h.hitRun = run
  return h
}

/**
 * One feature row per entry of `ranked` (the ranker's list of every legal ask, best first), in
 * `ASK_FEATURES` order. Pure over the view, the knowledge and the list.
 */
export function askFeatureRows(view: SeatView, k: Knowledge, ranked: readonly RankedAsk[]): Float64Array[] {
  const me = view.seat
  const myTeam = seatTeam(me)
  const held = new Set(view.hand)
  const hist = askHistory(view)
  const books = allBooks(view.config)
  // the seat's holding per half-suit, and each half-suit's rank by it
  const ownOf = new Map<BookId, number>()
  for (const b of books) ownOf.set(b, 0)
  for (const c of view.hand) ownOf.set(cardBook(c), (ownOf.get(cardBook(c)) ?? 0) + 1)
  const order = [...books].sort((a, b) => (ownOf.get(b) ?? 0) - (ownOf.get(a) ?? 0))
  const rankOf = new Map<BookId, number>()
  order.forEach((b, i) => rankOf.set(b, i))
  const maxOwn = order.length > 0 ? ownOf.get(order[0]) ?? 0 : 0
  // per half-suit: the team's certain count, the opponents', the unknown, per target
  const picture = new Map<BookId, { team: number; theirs: number; atSeat: number[] }>()
  for (const b of books) {
    if (view.books[b]) continue
    let team = 0
    let theirs = 0
    const atSeat = [0, 0, 0, 0, 0, 0]
    for (const c of bookCards(b, view.config)) {
      const h = k.holders[c]
      if (h === undefined) continue
      atSeat[h]++
      if (seatTeam(h) === myTeam) team++
      else theirs++
    }
    picture.set(b, { team, theirs, atSeat })
  }
  let resolved = 0
  for (const b of books) if (view.books[b]) resolved++
  let matesIn = 0
  let oppsIn = 0
  for (let x = 0; x < 6; x++) {
    if (x === me || view.counts[x] === 0) continue
    if (seatTeam(x as Seat) === myTeam) matesIn++
    else oppsIn++
  }
  const scoreDiff = view.score[myTeam] - view.score[myTeam === 0 ? 1 : 0]
  const best = ranked.length > 0 ? ranked[0].score : 0
  const rows: Float64Array[] = []
  for (let j = 0; j < ranked.length; j++) {
    const r = ranked[j]
    const b = cardBook(r.card)
    const pic = picture.get(b) ?? { team: 0, theirs: 0, atSeat: [0, 0, 0, 0, 0, 0] }
    const cand = k.cands[r.card] ?? []
    const x = new Float64Array(ASK_FEATURE_COUNT)
    let i = 0
    x[i++] = r.p
    x[i++] = r.p === 1 ? 1 : 0
    x[i++] = r.p === 0 ? 1 : 0
    x[i++] = (r.score - best) / 100
    x[i++] = 1 / (1 + j)
    x[i++] = j === 0 ? 1 : 0
    x[i++] = cand.length / 6
    x[i++] = pic.team / 6
    x[i++] = (ownOf.get(b) ?? 0) / 6
    x[i++] = pic.theirs / 6
    x[i++] = (6 - pic.team - pic.theirs) / 6
    x[i++] = view.counts[r.target] / 9
    x[i++] = pic.atSeat[r.target] / 6
    const teamHoldsAsked = k.holders[r.card] !== undefined && seatTeam(k.holders[r.card] as Seat) === myTeam
    x[i++] = pic.team === 5 && !teamHoldsAsked ? 1 : 0
    x[i++] = hist.byMe.has(b) ? 1 : 0
    x[i++] = hist.byMate.has(b) ? 1 : 0
    x[i++] = hist.byThem.has(b) ? 1 : 0
    x[i++] = (hist.bookAsks.get(b) ?? 0) / 10
    x[i++] = hist.cardAsked.has(r.card) ? 1 : 0
    x[i++] = hist.cardAskedByMe.has(r.card) ? 1 : 0
    x[i++] = hist.askedMeInto.get(r.target)?.has(b) ? 1 : 0
    x[i++] = hist.lastTarget === r.target ? 1 : 0
    x[i++] = Math.min(5, hist.hitRun) / 5
    x[i++] = cand.includes(r.target) ? (cand.length > 1 ? 1 / (cand.length - 1) : 1) : 0
    x[i++] = maxOwn > 0 && (ownOf.get(b) ?? 0) === maxOwn ? 1 : 0
    x[i++] = (rankOf.get(b) ?? 8) / 8
    x[i++] = b === 'EIGHTS' ? 1 : 0
    x[i++] = scoreDiff / 9
    x[i++] = resolved / 9
    x[i++] = held.size / 9
    x[i++] = hist.asks / 100
    x[i++] = matesIn / 2
    x[i] = oppsIn / 3
    rows.push(x)
  }
  return rows
}

export type AskModel = DenseModel

const MODELS = new Map<string, CompiledNet>()

/** Register a fitted ask model under a name `StyleParams.askModel` can refer to (compiled once here). */
export function registerAskModel(name: string, model: AskModel): void {
  MODELS.set(name, compileNet(model, ASK_FEATURE_COUNT, 1))
}

export function askModelOf(name: string): CompiledNet {
  const m = MODELS.get(name)
  if (!m) throw new Error(`no ask model registered as ${JSON.stringify(name)}`)
  return m
}

/** The model's score of every entry of `ranked`, in order. */
export function scoreAsks(m: CompiledNet, view: SeatView, k: Knowledge, ranked: readonly RankedAsk[]): number[] {
  return askFeatureRows(view, k, ranked).map((x) => forwardNet(m, x))
}

/** The ranked entry the model scores highest; a tie goes to the earlier entry (the ranker's order). Throws on an empty list. */
export function chooseAskByModel(m: CompiledNet, view: SeatView, k: Knowledge, ranked: readonly RankedAsk[]): RankedAsk {
  if (ranked.length === 0) throw new Error('chooseAskByModel: no asks')
  const s = scoreAsks(m, view, k, ranked)
  let best = 0
  for (let j = 1; j < s.length; j++) if (s[j] > s[best]) best = j
  return ranked[best]
}
