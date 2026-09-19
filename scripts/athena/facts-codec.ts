/**
 * facts-codec.ts: the reference side of ATHENA P1's G1a and G1b (ATHENA.md §8.1, §8.2).
 *
 * - **The facts** are `buildKnowledge(view, KOPTS)` (`lib/engine/bots/knowledge.ts`) under Monet v1.0's knowledge
 *   options with the marginal left out. [`encodeFacts`] writes them in the canonical encoding `athena-facts-1`, the
 *   byte string the Rust port's `Facts::encode` (`athena-env/src/facts.rs`) writes, so that two digests compare them:
 *
 *   | bytes | field |
 *   |---|---|
 *   | 1 | the viewing seat |
 *   | 54 | each card's candidate seats, a six-bit mask of absolute seats (a singleton is certain; 0 once gone) |
 *   | 54 | each card's certain holder, or NONE |
 *   | 8 | the gone cards, a 54-bit mask, little-endian |
 *   | 6 | the counts |
 *   | 6 | the unknown slots |
 *   | 2 | the number of distinct constraints, little-endian |
 *   | 3 each | the constraints as a set: (seat, set, six-bit mask of the set's cards in set card order), sorted |
 *
 *   The constraints are compared as sets, as §8.1 registers: the reference keeps them as a list, duplicates and all.
 * - **The reduced reveal** (`replay-format.md` §12.4, the bridge host's rule, as `scripts/bridge-records.mjs`'s
 *   `toRecord` applies it): a right declare publishes all six true holders; a wrong one only the cards a hit had moved
 *   (their `publicAt`), which is where they still are, because only a hit moves a card. [`ReducedReveal`] turns a home
 *   game's log into the log the bridge regime publishes, event by event, and gives the reduced view of any seat.
 */
import type { BookId, BookResult, Card, GameState, PublicEvent, Seat } from '../../lib/engine/types.ts'
import type { Knowledge, KnowledgeOptions, SeatView } from '../../lib/engine/bots/types.ts'
import { buildKnowledge } from '../../lib/engine/bots/knowledge.ts'
import { MONET_VERSIONS } from '../../lib/engine/bots/monet.ts'
import { seatView } from '../../lib/engine/views.ts'
import { ByteDigest, ByteWriter, CARDS, NONE, SET_CARDS, SET_OF_CARD, cardIndex, encodeEvent, setIndex } from './replay-codec.ts'

export const FORMAT_FACTS = 'athena-facts-1'

/**
 * Monet v1.0's knowledge options (decide.ts's `knowledgeOptions` of its skill and style), the marginal left out:
 * with `marginal: false` the ask-choice prior and the licence conditioning are nothing (knowledge.ts reads them only
 * with the marginal), so what remains is the skill's two fields.
 */
const V10 = MONET_VERSIONS['v1.0'] as unknown as { skill: { logWindow?: number; useConstraints: boolean } }
export const KOPTS: KnowledgeOptions = {
  logWindow: V10.skill.logWindow,
  useConstraints: V10.skill.useConstraints,
  marginal: false,
}

/**
 * KOPTS resolves to `buildKnowledge`'s own defaults (the whole log, the constraints on, no marginal), which is what
 * `lib/athena/policy.ts`'s `factsOf(view)` passes; so the knowledge of a view under KOPTS is `factsOf`'s.
 */
export function koptsAreFactsOfs(): boolean {
  return (KOPTS.logWindow ?? Infinity) === Infinity && (KOPTS.useConstraints ?? true) === true && KOPTS.marginal === false
}

/** The facts of a view. */
export function factsOfView(view: SeatView): Knowledge {
  return buildKnowledge(view, KOPTS)
}

/** The constraints of a Knowledge as a set: [seat, set, mask] triples, sorted and distinct. */
export function constraintSet(k: Knowledge): number[][] {
  const seen = new Set<number>()
  for (const x of k.constraints) {
    if (x.cards.length === 0) throw new Error('facts-codec: an empty constraint')
    const set = SET_OF_CARD[cardIndex(x.cards[0])]
    const cards = SET_CARDS[set]
    let m = 0
    for (const c of x.cards) {
      const j = cards.indexOf(c)
      if (j < 0) throw new Error(`facts-codec: a constraint spans two sets (${x.cards.join(',')})`)
      m |= 1 << j
    }
    seen.add((x.seat << 16) | (set << 8) | m)
  }
  return [...seen].sort((a, b) => a - b).map((v) => [v >> 16, (v >> 8) & 0xff, v & 0xff])
}

/** The canonical encoding `athena-facts-1` of a view's facts. */
export function encodeFacts(k: Knowledge): Uint8Array {
  const cons = constraintSet(k)
  const out = new Uint8Array(131 + 3 * cons.length)
  let o = 0
  out[o++] = k.seat
  for (let ci = 0; ci < 54; ci++) {
    let m = 0
    for (const s of k.cands[CARDS[ci]] ?? []) m |= 1 << s
    out[o++] = m
  }
  for (let ci = 0; ci < 54; ci++) out[o++] = k.holders[CARDS[ci]] ?? NONE
  const gone = [0, 0, 0, 0, 0, 0, 0, 0]
  for (const c of k.gone) {
    const ci = cardIndex(c)
    gone[ci >> 3] |= 1 << (ci & 7)
  }
  for (const b of gone) out[o++] = b
  for (let s = 0; s < 6; s++) out[o++] = k.counts[s]
  for (let s = 0; s < 6; s++) out[o++] = k.unknownSlots[s]
  out[o++] = cons.length & 0xff
  out[o++] = cons.length >> 8
  for (const t of cons) for (const x of t) out[o++] = x
  if (o !== out.length) throw new Error('facts-codec: encoding length')
  return out
}

/** A readable account of a view's facts (a divergence report). */
export function describeFacts(k: Knowledge): string {
  const certain = CARDS.filter((c) => k.holders[c] !== undefined).map((c) => `${c}@${k.holders[c]}`)
  const open = CARDS.filter((c) => k.holders[c] === undefined && !k.gone.includes(c)).map(
    (c) => `${c}:${(k.cands[c] ?? []).reduce<number>((m, s) => m | (1 << s), 0).toString(2).padStart(6, '0')}`,
  )
  const cons = constraintSet(k).map(([s, b, m]) => `${s}:{${SET_CARDS[b].filter((_, j) => (m >> j) & 1).join(',')}}`)
  return [
    `seat ${k.seat} counts ${JSON.stringify(k.counts)} unknown ${JSON.stringify(k.unknownSlots)}`,
    `  certain: ${certain.join(' ')}`,
    `  open: ${open.join(' ')}`,
    `  gone: ${k.gone.join(' ')}`,
    `  constraints (${k.constraints.length} listed, ${cons.length} distinct): ${cons.join(' ')}`,
  ].join('\n')
}

/**
 * The bridge regime's log of a home game (replay-format.md §12.4), built event by event, with its log digest under
 * the reduced reveal and the reduced view of any seat.
 */
export class ReducedReveal {
  /** Card -> the seat a hit publicly moved it to, while its set is open (bridge-records.mjs's `publicAt`). */
  private readonly publicAt = new Map<Card, Seat>()
  /** Per resolved set, the holders its declare published. */
  private readonly holders = new Map<BookId, Record<Card, Seat>>()
  readonly log: PublicEvent[] = []
  readonly logDigest = new ByteDigest()
  private readonly w = new ByteWriter(64)
  private booksIn: GameState['books'] | null = null
  private booksOut: GameState['books'] = {}
  /** Wrong declares, and the true holders they did not publish (information). */
  wrongDeclares = 0
  hiddenHolders = 0

  /** Log one event of the home game; returns it as the bridge regime publishes it. */
  push(e: PublicEvent): PublicEvent {
    let p = e
    if (e.type === 'ask' && e.hit) this.publicAt.set(e.card, e.asker)
    else if (e.type === 'claim') {
      const right = e.outcome === `team${e.claimer % 2}`
      const shown = {} as Record<Card, Seat>
      for (const c of SET_CARDS[setIndex(e.book)]) {
        if (right) shown[c] = e.actualHolders[c]
        else {
          const x = this.publicAt.get(c)
          if (x !== undefined) shown[c] = x
          else this.hiddenHolders++
        }
        this.publicAt.delete(c)
      }
      if (!right) this.wrongDeclares++
      this.holders.set(e.book, shown)
      p = { ...e, actualHolders: shown }
    }
    this.log.push(p)
    this.w.reset()
    encodeEvent(this.w, p, 'reduced')
    this.logDigest.push(this.w.buf, this.w.n)
    return p
  }

  /** The state's resolved sets as the bridge regime shows them (memoised by the state's `books` object). */
  books(stateBooks: GameState['books']): GameState['books'] {
    if (stateBooks !== this.booksIn) {
      const out: GameState['books'] = {}
      for (const [b, r] of Object.entries(stateBooks) as [BookId, BookResult][]) {
        const shown = this.holders.get(b)
        if (!shown) throw new Error(`facts-codec: set ${b} resolved without a logged declare`)
        out[b] = { ...r, actualHolders: shown }
      }
      this.booksIn = stateBooks
      this.booksOut = out
    }
    return this.booksOut
  }

  /** `seat`'s view of `state` under the bridge regime: the reduced log and set block, the rest as at home. */
  view(state: GameState, seat: Seat): SeatView {
    if (this.log.length !== state.log.length)
      throw new Error(`facts-codec: the reduced log has ${this.log.length} events, the state's ${state.log.length}`)
    return { ...seatView(state, seat), books: this.books(state.books), log: this.log } as SeatView
  }
}
