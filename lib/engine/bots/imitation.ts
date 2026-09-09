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
 * ## The second feature set (§3.8af)
 *
 * `ASK_FEATURES_2` is the list above and, after it, the belief's seat: the independent per-card
 * belief beside the marginal, and the target's own dealings with the asked half-suit read off the
 * log. `askFeatureRows` builds either set; a registered model reads the one its width names.
 *
 * ## In play
 *
 * `StyleParams.askModel` names a model registered with `registerAskModel`; `pickAsk` in decide.ts
 * then returns `chooseAskByModel`'s argmax over the ranked list in place of its own choice — the
 * ranker still lists the legal asks and their probabilities, the model chooses among them. Absent,
 * byte identity. The declare, the pass and every window decision stay the stack's.
 */
import type { BookId, Card, Seat, Team } from '../types.ts'
import { allBooks, bookCards, cardBook, seatTeam } from '../cards.ts'
import { slotPriorHitProbability } from './knowledge.ts'
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

/**
 * MONET.md §3.8af — the second feature set: `ASK_FEATURES` and, after them, THE BELIEF'S SEAT. The
 * clone's disagreements with SESTINA (§3.8ad's addendum) are the seat, not the card: on 11.5% of
 * its decisions SESTINA asks the same half-suit at another seat and on 5.7% another half-suit, and
 * the seat it prefers is one our marginal ranks lower. SESTINA's belief is independent per card
 * (its spec's `rbelief=indep`); ours is the joint over the set. These features hand a fit the
 * independent belief beside the marginal — the slot prior, and the slot prior under an ask-choice
 * prior of the strength SESTINA's spec names (`kappa=2.5`, whatever its own use of it) — and what
 * the log says about the target's own dealings with the half-suit: its asks into it, their hits
 * and misses, the cards taken from it, how long ago. A model fitted at this width reads these
 * rows (`registerAskModel` tells the sets apart by the width); the first set's rows are byte for
 * byte what they were.
 */
export const ASK_FEATURES_2 = [
  ...ASK_FEATURES,
  /** The slot prior — the independent per-card belief — of the hit. */
  'pSlot',
  /** The ranker's probability less the slot prior: what the coupling over the set adds. */
  'pDiff',
  /** The slot prior under an ask-choice prior of strength κ = 2.5 (saturating at three asks). */
  'pIndepK',
  /** 1 when the target is a candidate the slot prior puts the card at first (ties included). */
  'targetSlotMax',
  /** The target's asks into the half-suit, over three. */
  'targetAsksIntoBook',
  /** Of those, the hits, over three. */
  'targetHitsInBook',
  /** Of those, the misses, over three. */
  'targetMissesInBook',
  /** Cards of the half-suit taken from the target by others' hits, over three. */
  'takenFromTargetInBook',
  /** Asks at the target for a card of the half-suit that missed, over three. */
  'missedAtTargetInBook',
  /** Asks since anyone last asked into the half-suit, over twenty (1 when nobody has). */
  'bookLastAskAgo',
  /** Asks since the target last asked, over twenty (1 when it never has). */
  'targetLastAskAgo',
  /** Asks since the target last asked into the half-suit, over twenty (1 when it never has). */
  'targetBookLastAgo',
  /** The opponents' asks into the half-suit, over five. */
  'bookAsksByThem',
  /** Distinct half-suits the target has asked into, over the half-suits in play. */
  'targetBooksAsked',
  /** The target's unidentified cards, over nine. */
  'targetUnknownSlots',
  /** Opponent seats among the card's candidate holders, over three. */
  'oppCands',
] as const

export const ASK_FEATURE_COUNT_2 = ASK_FEATURES_2.length

/** Which list a feature row is built over: 1 for `ASK_FEATURES`, 2 for `ASK_FEATURES_2`. */
export type AskFeatureSet = 1 | 2

export function askFeatureNames(set: AskFeatureSet): readonly string[] {
  return set === 2 ? ASK_FEATURES_2 : ASK_FEATURES
}

export function askFeatureCount(set: AskFeatureSet): number {
  return set === 2 ? ASK_FEATURE_COUNT_2 : ASK_FEATURE_COUNT
}

/** The ask-choice prior's strength the second set's `pIndepK` is built with: the value SESTINA's spec names. */
export const INDEP_KAPPA = 2.5

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
 * MONET.md §3.8af — what the log says about each seat's dealings with each half-suit, read once per
 * decision for the second feature set: per seat × half-suit the asks, their hits and misses, the
 * cards taken from the seat and the misses at it, and when it last asked; per half-suit the asks,
 * the opponents' asks and the last ask; per seat the last ask and the distinct half-suits asked.
 * Indices are positions in the log's ask order, −1 for never; `asks` is the total.
 */
interface SeatBookHistory {
  asks: number
  bookAsks: Int32Array
  bookAsksThem: Int32Array
  bookLast: Int32Array
  sbAsks: Int32Array
  sbHits: Int32Array
  sbMisses: Int32Array
  sbTaken: Int32Array
  sbMissedAt: Int32Array
  sbLast: Int32Array
  seatLast: Int32Array
  seatBooks: Int32Array
}

function seatBookHistory(view: SeatView, bookIdx: ReadonlyMap<BookId, number>, myTeam: Team): SeatBookHistory {
  const NB = bookIdx.size
  const h: SeatBookHistory = {
    asks: 0,
    bookAsks: new Int32Array(NB),
    bookAsksThem: new Int32Array(NB),
    bookLast: new Int32Array(NB).fill(-1),
    sbAsks: new Int32Array(6 * NB),
    sbHits: new Int32Array(6 * NB),
    sbMisses: new Int32Array(6 * NB),
    sbTaken: new Int32Array(6 * NB),
    sbMissedAt: new Int32Array(6 * NB),
    sbLast: new Int32Array(6 * NB).fill(-1),
    seatLast: new Int32Array(6).fill(-1),
    seatBooks: new Int32Array(6),
  }
  const seen = new Uint8Array(6 * NB)
  for (const ev of view.log) {
    if (ev.type !== 'ask') continue
    const bi = bookIdx.get(cardBook(ev.card))
    if (bi === undefined) continue
    const n = h.asks++
    h.bookAsks[bi]++
    if (seatTeam(ev.asker) !== myTeam) h.bookAsksThem[bi]++
    h.bookLast[bi] = n
    const a = ev.asker * NB + bi
    const t = ev.target * NB + bi
    h.sbAsks[a]++
    if (ev.hit) {
      h.sbHits[a]++
      h.sbTaken[t]++
    } else {
      h.sbMisses[a]++
      h.sbMissedAt[t]++
    }
    h.sbLast[a] = n
    h.seatLast[ev.asker] = n
    if (seen[a] === 0) {
      seen[a] = 1
      h.seatBooks[ev.asker]++
    }
  }
  return h
}

/** Asks since the ask at `last` (−1 for never), over twenty, capped at 1. */
function agoOf(last: number, asks: number): number {
  return last < 0 ? 1 : Math.min(20, asks - 1 - last) / 20
}

/**
 * The slot prior with an ask-choice prior laid on it: each candidate seat's free slots, multiplied by
 * (1 + κ) per ask it made into the card's half-suit (saturating at three), the target's share of the
 * total. The certainties are the slot prior's own.
 */
function indepK(k: Knowledge, h: SeatBookHistory, cand: readonly Seat[], target: Seat, bi: number, NB: number): number {
  if (cand.length === 0 || !cand.includes(target)) return 0
  if (cand.length === 1) return 1
  let total = 0
  let mine = 0
  for (const s of cand) {
    const w = k.unknownSlots[s] * Math.pow(1 + INDEP_KAPPA, Math.min(3, h.sbAsks[s * NB + bi]))
    total += w
    if (s === target) mine = w
  }
  return total > 0 ? mine / total : 1 / cand.length
}

/**
 * One feature row per entry of `ranked` (the ranker's list of every legal ask, best first), in
 * `ASK_FEATURES` order — or, for `set` 2, in `ASK_FEATURES_2`'s, the first set's columns first and
 * unchanged. Pure over the view, the knowledge and the list.
 */
export function askFeatureRows(view: SeatView, k: Knowledge, ranked: readonly RankedAsk[], set: AskFeatureSet = 1): Float64Array[] {
  const me = view.seat
  const myTeam = seatTeam(me)
  const held = new Set(view.hand)
  const hist = askHistory(view)
  const books = allBooks(view.config)
  const NF = askFeatureCount(set)
  const NB = books.length
  const bookIdx = new Map<BookId, number>()
  books.forEach((b, i) => bookIdx.set(b, i))
  const hist2 = set === 2 ? seatBookHistory(view, bookIdx, myTeam) : null
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
    const x = new Float64Array(NF)
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
    x[i++] = oppsIn / 3
    if (hist2) {
      const t = r.target
      const bi = bookIdx.get(b) ?? 0
      const a = t * NB + bi
      const pSlot = slotPriorHitProbability(k, r.card, t)
      let maxSlots = -1
      let oppCands = 0
      for (const s of cand) {
        if (k.unknownSlots[s] > maxSlots) maxSlots = k.unknownSlots[s]
        if (seatTeam(s) !== myTeam) oppCands++
      }
      x[i++] = pSlot
      x[i++] = r.p - pSlot
      x[i++] = indepK(k, hist2, cand, t, bi, NB)
      x[i++] = cand.includes(t) && k.unknownSlots[t] === maxSlots ? 1 : 0
      x[i++] = Math.min(3, hist2.sbAsks[a]) / 3
      x[i++] = Math.min(3, hist2.sbHits[a]) / 3
      x[i++] = Math.min(3, hist2.sbMisses[a]) / 3
      x[i++] = Math.min(3, hist2.sbTaken[a]) / 3
      x[i++] = Math.min(3, hist2.sbMissedAt[a]) / 3
      x[i++] = agoOf(hist2.bookLast[bi], hist2.asks)
      x[i++] = agoOf(hist2.seatLast[t], hist2.asks)
      x[i++] = agoOf(hist2.sbLast[a], hist2.asks)
      x[i++] = Math.min(5, hist2.bookAsksThem[bi]) / 5
      x[i++] = hist2.seatBooks[t] / NB
      x[i++] = k.unknownSlots[t] / 9
      x[i] = oppCands / 3
    }
    rows.push(x)
  }
  return rows
}

export type AskModel = DenseModel

const MODELS = new Map<string, CompiledNet>()

/**
 * Register a fitted ask model under a name `StyleParams.askModel` can refer to (compiled once here).
 * The model's width names its feature set — `ASK_FEATURE_COUNT` the first, `ASK_FEATURE_COUNT_2` the
 * second (§3.8af); any other width is refused.
 */
export function registerAskModel(name: string, model: AskModel): void {
  MODELS.set(name, compileNet(model, askFeatureCount(model.features === ASK_FEATURE_COUNT_2 ? 2 : 1), 1))
}

/** The feature set a compiled ask model reads, by its input width. */
export function askFeatureSetOf(m: CompiledNet): AskFeatureSet {
  if (m.features === ASK_FEATURE_COUNT_2) return 2
  if (m.features === ASK_FEATURE_COUNT) return 1
  throw new Error(`ask model of ${m.features} features: neither ${ASK_FEATURE_COUNT} nor ${ASK_FEATURE_COUNT_2}`)
}

export function askModelOf(name: string): CompiledNet {
  const m = MODELS.get(name)
  if (!m) throw new Error(`no ask model registered as ${JSON.stringify(name)}`)
  return m
}

/** The model's score of every entry of `ranked`, in order. */
export function scoreAsks(m: CompiledNet, view: SeatView, k: Knowledge, ranked: readonly RankedAsk[]): number[] {
  return askFeatureRows(view, k, ranked, askFeatureSetOf(m)).map((x) => forwardNet(m, x))
}

/** The ranked entry the model scores highest; a tie goes to the earlier entry (the ranker's order). Throws on an empty list. */
export function chooseAskByModel(m: CompiledNet, view: SeatView, k: Knowledge, ranked: readonly RankedAsk[]): RankedAsk {
  if (ranked.length === 0) throw new Error('chooseAskByModel: no asks')
  const s = scoreAsks(m, view, k, ranked)
  let best = 0
  for (let j = 1; j < s.length; j++) if (s[j] > s[best]) best = j
  return ranked[best]
}
