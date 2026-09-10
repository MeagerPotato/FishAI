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
 * ## The third feature set (§3.8ah)
 *
 * `ASK_FEATURES_3` is the second list and, after it, the holder clone's belief (holder.ts): a model
 * of who holds each card, fitted on the records' true deals, read at the asked card and the target.
 * A model at this width names the holder model it was fitted with; the rows need it.
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
import { slotPriorHitProbability } from './knowledge.ts'
import type { Knowledge, RankedAsk, SeatView } from './types.ts'
import { compileNet, forwardNet } from './net.ts'
import type { CompiledNet, DenseModel } from './net.ts'
import { INDEP_KAPPA, agoOf, indepK, seatBookHistory } from './askhistory.ts'
import { holderBelief, holderContext, holderModelOf } from './holder.ts'

export { INDEP_KAPPA }

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

/**
 * MONET.md §3.8ah — the third feature set: `ASK_FEATURES_2` and, after them, THE HOLDER CLONE'S BELIEF —
 * a model of who holds each card fitted on the records' true deals (holder.ts), read at the asked card
 * and the target: its probability for the target, that probability against the marginal's, whether the
 * target is its first choice among the card's candidates, and how spread it is over them (the entropy,
 * over its maximum). A model at this width needs a holder model, registered under the name it carries
 * (`registerAskModel`'s third argument, or its meta's `holderModel`).
 */
export const ASK_FEATURES_3 = [...ASK_FEATURES_2, 'pHold', 'pHoldDiff', 'holdTop', 'holdEntropy'] as const

export const ASK_FEATURE_COUNT_3 = ASK_FEATURES_3.length

/** Which list a feature row is built over: 1 for `ASK_FEATURES`, 2 for `ASK_FEATURES_2`, 3 for `ASK_FEATURES_3`. */
export type AskFeatureSet = 1 | 2 | 3

export function askFeatureNames(set: AskFeatureSet): readonly string[] {
  return set === 3 ? ASK_FEATURES_3 : set === 2 ? ASK_FEATURES_2 : ASK_FEATURES
}

export function askFeatureCount(set: AskFeatureSet): number {
  return set === 3 ? ASK_FEATURE_COUNT_3 : set === 2 ? ASK_FEATURE_COUNT_2 : ASK_FEATURE_COUNT
}

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
 * `ASK_FEATURES` order — or, for `set` 2, in `ASK_FEATURES_2`'s, the first set's columns first and
 * unchanged; for `set` 3, in `ASK_FEATURES_3`'s, which needs the holder model the last four columns
 * read. Pure over the view, the knowledge, the list and the model.
 */
export function askFeatureRows(view: SeatView, k: Knowledge, ranked: readonly RankedAsk[], set: AskFeatureSet = 1, holder?: CompiledNet): Float64Array[] {
  if (set === 3 && !holder) throw new Error('askFeatureRows: the third feature set needs a holder model')
  const me = view.seat
  const myTeam = seatTeam(me)
  const held = new Set(view.hand)
  const hist = askHistory(view)
  const books = allBooks(view.config)
  const NF = askFeatureCount(set)
  const NB = books.length
  const bookIdx = new Map<BookId, number>()
  books.forEach((b, i) => bookIdx.set(b, i))
  const hist2 = set >= 2 ? seatBookHistory(view, bookIdx, myTeam) : null
  const hctx = set === 3 && holder ? holderContext(view, k) : null
  // the holder clone's belief, once per asked card
  const beliefs = new Map<Card, Float64Array>()
  const beliefOf = (card: Card): Float64Array => {
    let b = beliefs.get(card)
    if (b === undefined) {
      b = hctx && holder ? holderBelief(holder, hctx, k, view, card) : new Float64Array(6)
      beliefs.set(card, b)
    }
    return b
  }
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
      x[i++] = oppCands / 3
    }
    if (hctx) {
      const t = r.target
      const bl = beliefOf(r.card)
      const pHold = bl[t]
      let top = 0
      let ent = 0
      for (let q = 0; q < 6; q++) {
        if (bl[q] > bl[top]) top = q
        if (bl[q] > 0) ent -= bl[q] * Math.log(bl[q])
      }
      x[i++] = pHold
      x[i++] = pHold - r.p
      x[i++] = top === t && pHold > 0 ? 1 : 0
      x[i] = cand.length > 1 ? ent / Math.log(cand.length) : 0
    }
    rows.push(x)
  }
  return rows
}

export type AskModel = DenseModel

const MODELS = new Map<string, CompiledNet>()
/** The holder model an ask model at the third width reads (§3.8ah), bound when it is registered. */
const HOLDER_OF = new WeakMap<CompiledNet, CompiledNet>()

/**
 * Register a fitted ask model under a name `StyleParams.askModel` can refer to (compiled once here).
 * The model's width names its feature set — `ASK_FEATURE_COUNT` the first, `ASK_FEATURE_COUNT_2` the
 * second (§3.8af), `ASK_FEATURE_COUNT_3` the third (§3.8ah); any other width is refused. A model at the
 * third width needs a holder model already registered under `holderName` (or its meta's `holderModel`).
 */
export function registerAskModel(name: string, model: AskModel, holderName?: string): void {
  const set: AskFeatureSet = model.features === ASK_FEATURE_COUNT_3 ? 3 : model.features === ASK_FEATURE_COUNT_2 ? 2 : 1
  const net = compileNet(model, askFeatureCount(set), 1)
  if (set === 3) {
    const metaName = model.meta?.holderModel
    const hn = holderName ?? (typeof metaName === 'string' ? metaName : undefined)
    if (!hn) throw new Error(`ask model ${JSON.stringify(name)}: the third feature set needs a holder model's name`)
    HOLDER_OF.set(net, holderModelOf(hn))
  }
  MODELS.set(name, net)
}

/** The feature set a compiled ask model reads, by its input width. */
export function askFeatureSetOf(m: CompiledNet): AskFeatureSet {
  if (m.features === ASK_FEATURE_COUNT_3) return 3
  if (m.features === ASK_FEATURE_COUNT_2) return 2
  if (m.features === ASK_FEATURE_COUNT) return 1
  throw new Error(`ask model of ${m.features} features: none of ${ASK_FEATURE_COUNT}, ${ASK_FEATURE_COUNT_2} and ${ASK_FEATURE_COUNT_3}`)
}

/** The holder model a registered ask model at the third width reads; undefined for the other widths. */
export function holderModelForAsk(m: CompiledNet): CompiledNet | undefined {
  return HOLDER_OF.get(m)
}

export function askModelOf(name: string): CompiledNet {
  const m = MODELS.get(name)
  if (!m) throw new Error(`no ask model registered as ${JSON.stringify(name)}`)
  return m
}

/** The model's score of every entry of `ranked`, in order. */
export function scoreAsks(m: CompiledNet, view: SeatView, k: Knowledge, ranked: readonly RankedAsk[]): number[] {
  const set = askFeatureSetOf(m)
  return askFeatureRows(view, k, ranked, set, set === 3 ? HOLDER_OF.get(m) : undefined).map((x) => forwardNet(m, x))
}

/**
 * MONET.md §3.8as — the learned value over the clone's shortlist. `clone` orders the ranker's legal
 * asks as it always does; `value` scores THE SAME FULL LIST and the argmax is taken over the clone's
 * top `topK` indices only.
 *
 * The full list is scored on purpose. Three of the forty-nine features are list-relative — `scoreRel`
 * is measured against the list's best, `rankInv` is 1/(1+j), `isTop` is j === 0 — so scoring a
 * `topK`-element sublist would hand the value feature values its fit never saw. §3.8as measured that
 * mistake: it read 53% agreement with the clone as 23%.
 *
 * A tie goes to the CLONE: `best` starts at the clone's own top and a later candidate has to score
 * strictly higher to displace it, so an indifferent value is byte-identical to `chooseAskByModel`.
 * `topK` below 2 is the clone alone. Throws on an empty list.
 */
export function chooseAskByValue(
  clone: CompiledNet,
  value: CompiledNet,
  view: SeatView,
  k: Knowledge,
  ranked: readonly RankedAsk[],
  topK: number,
): RankedAsk {
  if (ranked.length === 0) throw new Error('chooseAskByValue: no asks')
  const cs = scoreAsks(clone, view, k, ranked)
  const order = ranked.map((_, i) => i).sort((a, b) => cs[b] - cs[a] || a - b)
  const depth = Math.min(Math.max(topK, 1), order.length)
  if (depth < 2) return ranked[order[0]]
  const vs = scoreAsks(value, view, k, ranked)
  let best = order[0]
  for (let j = 1; j < depth; j++) if (vs[order[j]] > vs[best]) best = order[j]
  return ranked[best]
}

/** The ranked entry the model scores highest; a tie goes to the earlier entry (the ranker's order). Throws on an empty list. */
export function chooseAskByModel(m: CompiledNet, view: SeatView, k: Knowledge, ranked: readonly RankedAsk[]): RankedAsk {
  if (ranked.length === 0) throw new Error('chooseAskByModel: no asks')
  const s = scoreAsks(m, view, k, ranked)
  let best = 0
  for (let j = 1; j < s.length; j++) if (s[j] > s[best]) best = j
  return ranked[best]
}
