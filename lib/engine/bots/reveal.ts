/**
 * reveal.ts — MONET.md §3.7 item 1: the reveal ask.
 *
 * §3.4b's central finding is *lock hold*: a set the team holds in full that nobody on the team can
 * prove, sitting uncashed while the game goes on around it (about ten such events a game at home;
 * §3.7a's readout counts 4.5 opportunities a game where ONE ask would finish a teammate's proof).
 * The cure is a message, and the only message the rules give a seat on its turn is an ask. An ask
 * into a half-suit publishes two facts (RULES_US54.md rows 6 – 7): the asker holds a card of it,
 * and the asker does NOT hold the card it named. When the set is on the team the ask is a miss —
 * no opponent holds a card of it — so the turn is the price of the message.
 *
 * **What the asker can compute.** A teammate's knowledge is the PUBLIC walk plus its own hand and
 * nothing else (`publicKnowledge`; `finishKnowledge`'s own-hand injection is the only private
 * step). The asker cannot see the teammate's hand, but under the hypothesis it is pricing — *the
 * set is on the team* — it knows the set's cards are split between the two teammates, and its
 * model says where each most likely sits. So for each card it could name it builds the record as
 * it would stand after the ask, injects the likeliest split as the teammate's holdings over the
 * set's cards (`AssumedHand`: those cards fixed at the teammate, the rest of the set excluded from
 * it — the part of the teammate's hand that matters to this proof), and reads off whether the
 * teammate then places all six cards on the team. The teammate's real build knows at least that
 * much whenever the split is right (its whole hand is injected, and the fixpoint is monotone), so
 * the simulation never announces a proof the teammate would not have — and where the split is
 * wrong, the ask is a miss and nothing is cashed. tests/bots/reveal.test.ts pins both against the
 * true hands.
 *
 * **What the asker cannot know** is whether the set is on the team at all: a seat that could
 * place all six cards on its team could prove the set itself, and that residue is nearly empty.
 * So the ask is a hybrid. The card X is asked of the opponent most likely to hold it, at the
 * model's hit probability p; if it hits the turn continues as any hit does, and if it misses and
 * the set is on the team the teammate cashes it. The asker's belief that the set is on the team
 * is `P(locked)`, the product over the set's unlocated cards of the model's probability that a
 * teammate holds it (located cards are certain). The ask's worth against the best ordinary ask's
 * hit probability is then
 *
 *     value = p + reveal · urgency · P(locked)
 *
 * with urgency 1 when cashing the set would clinch the game (the team's sets plus one reach
 * `clinchTarget`, so the message ends the game) and `revealFar` otherwise; a locked set is a safe
 * asset until the compulsion arrives (§3.5a), which is why the far urgency is a knob and not 1.
 * `decide.ts` plays the reveal when `value` exceeds the ordinary pick's hit probability. The
 * record is charged once: a teammate who could already prove the set under the same split gets no
 * credit — had the split been right, the set would have been declared.
 *
 * Off (`reveal` absent or 0) nothing here is called; the base is byte for byte what it was.
 */
import type { BookId, Card, Seat } from '../types.ts'
import { allBooks, bookCards, seatTeam } from '../cards.ts'
import { legalAsksFromView } from '../helpers.ts'
import { clinchTarget } from '../variants.ts'
import { askHitProbability, publicKnowledge } from './knowledge.ts'
import type { AssumedHand } from './knowledge.ts'
import type { StyleParams } from './style.ts'
import type { Knowledge, KnowledgeOptions, SeatView } from './types.ts'

/** The ask the reveal term would play, and the arithmetic behind it. */
export interface RevealPick {
  target: Seat
  card: Card
  /** The set the record pins for a teammate. */
  book: BookId
  /** The teammate whose proof the record completes (the first one found). */
  prover: Seat
  /** The set's cards the simulation placed in the prover's hand — the likeliest split. */
  assumed: readonly Card[]
  /** 1 when cashing the set clinches the game, `revealFar` otherwise. */
  urgency: number
  /** The model's probability that `target` holds `card` — the ask is still an ask. */
  pHit: number
  /** The asker's belief that every card of the set is on its team. */
  pLock: number
  /** `pHit + reveal · urgency · pLock`, compared with the best ordinary ask's hit probability. */
  value: number
}

/** Is the term on at all? Absent or 0 means nothing is computed. */
export function revealActive(style: StyleParams): boolean {
  return (style.reveal ?? 0) > 0
}

/** Sets this team has cashed, by the view's resolved books. */
function cashedSets(view: SeatView, team: 0 | 1): number {
  let n = 0
  for (const b of allBooks(view.config)) {
    const r = view.books[b]
    if (r !== undefined && r !== null && r.outcome !== 'void' && (r.outcome === 'team0' ? 0 : 1) === team) n++
  }
  return n
}

/** Every card of `cards` certainly located, by `k`, on `team`. */
export function provesSet(k: Knowledge, cards: readonly Card[], team: 0 | 1): boolean {
  for (const c of cards) {
    const h = k.holders[c]
    if (h === undefined || seatTeam(h) !== team) return false
  }
  return true
}

/**
 * The asker's belief that every card of `cards` is on its team: 1 for a card in hand or located
 * on the team, 0 for one located with an opponent, and otherwise the model's probability that
 * one of the teammates holds it — multiplied over the cards, as if independent.
 */
export function lockBelief(k: Knowledge, held: ReadonlySet<Card>, cards: readonly Card[], mates: readonly Seat[], team: 0 | 1): number {
  let p = 1
  for (const c of cards) {
    if (held.has(c)) continue
    const h = k.holders[c]
    if (h !== undefined) {
      if (seatTeam(h) !== team) return 0
      continue
    }
    let onTeam = 0
    for (const m of mates) onTeam += askHitProbability(k, c, m)
    p *= Math.min(1, onTeam)
    if (p <= 0) return 0
  }
  return p
}

/**
 * The reveal ask for this decision, or null when no set qualifies. `k` is the viewer's own
 * knowledge (the private build the decision already made, its probability model attached);
 * `opts` are the same knowledge options, so the public walk uses the decision's window and
 * constraint settings.
 */
export function revealAsk(view: SeatView, k: Knowledge, style: StyleParams, opts: KnowledgeOptions): RevealPick | null {
  const reveal = style.reveal ?? 0
  if (reveal <= 0) return null
  const me = view.seat
  const team = seatTeam(me)
  const urgency = cashedSets(view, team) + 1 >= clinchTarget(view.config) ? 1 : (style.revealFar ?? 0)
  if (urgency <= 0) return null
  const legal = legalAsksFromView(view)
  if (legal.length === 0) return null
  const held = new Set<Card>(view.hand)
  const mates: Seat[] = []
  for (const s of [0, 1, 2, 3, 4, 5] as Seat[]) if (s !== me && seatTeam(s) === team) mates.push(s)
  if (mates.length !== 2) return null
  const log = Array.isArray(view.log) ? view.log : []
  let best: RevealPick | null = null

  for (const b of allBooks(view.config)) {
    if (view.books[b]) continue
    const cards = bookCards(b, view.config)
    let own = 0
    for (const c of cards) if (held.has(c)) own++
    // No licence without a card of the set; six in hand is the own-book claim's, made earlier.
    if (own === 0 || own === cards.length) continue
    const pLock = lockBelief(k, held, cards, mates, team)
    if (pLock <= 0) continue
    // The likeliest split of the set's other cards between the teammates, under the hypothesis
    // that the set is on the team: a located card where it is, an unlocated one with the teammate
    // the model favours.
    const split: [Card[], Card[]] = [[], []]
    for (const c of cards) {
      if (held.has(c)) continue
      const h = k.holders[c]
      if (h !== undefined) {
        split[h === mates[0] ? 0 : 1].push(c)
      } else {
        split[askHitProbability(k, c, mates[0]) >= askHitProbability(k, c, mates[1]) ? 0 : 1].push(c)
      }
    }
    const hypotheses: AssumedHand[] = mates.map((m, i) => ({
      seat: m,
      holds: split[i],
      lacks: cards.filter((c) => !split[i].includes(c)),
    }))
    // Charged once: a teammate who could already prove the set under this split gets nothing
    // from the ask (and had the split been right, the set would have been declared).
    const open = hypotheses.filter((h) => !provesSet(publicKnowledge(view, opts, h), cards, team))
    if (open.length === 0) continue
    for (const c of cards) {
      if (held.has(c)) continue
      let target: Seat | null = null
      let pHit = -1
      for (const a of legal) {
        if (a.card !== c) continue
        const p = askHitProbability(k, c, a.target)
        if (p > pHit) {
          pHit = p
          target = a.target
        }
      }
      if (target === null) continue
      const value = pHit + reveal * urgency * pLock
      if (best !== null && value <= best.value) continue
      const ev = { type: 'ask' as const, asker: me, target, card: c, hit: false }
      const after = { ...view, log: [...log, ev] }
      for (const h of open) {
        if (provesSet(publicKnowledge(after, opts, h), cards, team)) {
          best = { target, card: c, book: b, prover: h.seat, assumed: h.holds, urgency, pHit, pLock, value }
          break
        }
      }
    }
  }
  return best
}
