/**
 * observe.ts — per-seat behavioural features from the public log alone (v1.0 front half).
 *
 * This is the observation layer of the adaptive engine: a single O(events) pass over
 * `view.log` that turns what every seat has *publicly done* into a fixed feature vector per
 * seat. No constraint propagation, no `buildKnowledge` — the point is to describe behaviour,
 * not to solve the position, and the classifier ([classify.ts](classify.ts)) and the
 * fingerprint calibration script (`scripts/gen-fingerprints.mjs`) must share this exact code
 * path or the fingerprints describe a different instrument than the one that reads them.
 *
 * ## What the public log actually certifies
 *
 * Everything here is an *exact* public observation, never an estimate:
 *
 * - **A hit locates a card.** RULES_US54.md row 9: the named card transfers face up, so after
 *   `ask{...hit:true}` the card is publicly at the asker until it moves again (another hit of
 *   the same card) or its book resolves. That is the `publicHolder` map.
 * - **An ask certifies a licence.** Row 6 makes holding >= 1 card of the asked set the only
 *   licence to ask into it, so every ask proves the asker held >= 1 of that book *at that
 *   time* — and row 7 proves they lacked the named card. The certification is kept as a
 *   per-seat per-book flag and decayed conservatively: it is dropped when the book resolves,
 *   when the seat runs out of cards, and when a hit strips a card of that book from the seat
 *   (the stripped card may have been the licence, and a flag that might be stale is worth
 *   less than one that is honest).
 * - **A declare reveals true holders.** The `claim` event carries `actualHolders` for all six
 *   cards, so a *foreign* declare (claimer not among the values) and an *own-hand-only*
 *   declare (every value == the claimer) are exact, not inferred — they are the public
 *   signatures of `foreignDeclare` and `declareOnlyOwnHand` styles.
 * - **Hand counts replay.** Counts are re-derived from the log rather than read from
 *   `view.counts`: every seat starts at `handSize(config)`, a hit moves one card
 *   asker <- target, and a claim removes each of the six cards from whoever `actualHolders`
 *   says held it. This is deliberate: the classifier evaluates *truncated* logs (checkpoint
 *   fingerprints slice the log mid-game), and a truncated view's top-level `counts` describe
 *   the end of the game, not the truncation point. The replayed counts are correct at every
 *   prefix, and `tests/bots/observe.test.ts` pins them against `view.counts` at full length.
 *
 * ## What the log can NOT show
 *
 * `decline` emits **no event** ([types.ts](../types.ts): the declare window advances
 * silently), so declare-window patience — how long a seat sat on its option — is invisible
 * here. No feature below depends on it. `declareBackload` therefore measures *when in the
 * observed event stream* a seat's declares landed (event index over the final observed event
 * index), which is the observable stand-in for the "declare moveIndex" a god's-eye harness
 * would use: moveIndex counts declines, the public log does not.
 *
 * ## Feature definitions that needed sharpening
 *
 * - **leakyAsks** — asks into a book where the asker's own team already publicly accounts for
 *   >= 4 of the six cards, counting located cards (`publicHolder` at a team seat) plus
 *   certified team seats that have *no* located card of the book (so a certification is never
 *   double-counted against the card that proved it). The asker's own certification from the
 *   ask being scored is included — the ask itself is the proof.
 * - **completionAsks** — located cards alone reach 5: the ask chases the publicly last card.
 * - **provablyDeadAsks / certainAsks** — the named card's `publicHolder` is known and is not /
 *   is the target. A dead ask is a *guaranteed* public miss — which is exactly what the
 *   CONTAINMENT.md turn-pass plays, so this feature is the mechanism's public signature.
 * - **missFewestShare / missMostShare** — of this seat's misses, the fraction where the
 *   target held strictly the fewest / most cards among *live* opponents (replayed counts at
 *   the time of the ask). A miss with fewer than two live opponents reveals no targeting
 *   preference — there was no choice — so it increments neither numerator; the denominator
 *   is all misses either way.
 *
 * Determinism is absolute: same view -> identical output. No Date, no Math.random, no state
 * outside the single scan. The view is never mutated (the log is only read, the one slice a
 * caller might take happens outside this module).
 */
import type { BookId, Card, PublicEvent, PublicState, Seat } from '../types.ts'
import { ALL_SEATS, bookCards, cardBook, handSize, seatTeam } from '../cards.ts'
import type { SeatView } from './types.ts'

/** Per-seat behavioural features read off the public log. One per seat, exact, deterministic. */
export interface SeatObservation {
  seat: Seat
  asks: number
  hits: number
  /** hits / asks, 0 when asks == 0. */
  hitRate: number
  /** Distinct books this seat asked into. */
  distinctBooks: number
  /** distinctBooks / max(1, asks). */
  askDiversity: number
  /** Asks for a card whose publicHolder was known and != target (a guaranteed public miss). */
  provablyDeadAsks: number
  /** Asks for a card whose publicHolder was known and == target (a guaranteed public hit). */
  certainAsks: number
  /** Consecutive asks (by this seat) in the same book / max(1, asks - 1). */
  sameBookRepeatRate: number
  /** Asks into books where the own team's certified+located count was >= 4 (see header). */
  leakyAsks: number
  /** Asks into books where the own team's located count was == 5. */
  completionAsks: number
  /** Of this seat's misses, fraction where the target had strictly the fewest cards among live opponents. */
  missFewestShare: number
  /** ... strictly the most. */
  missMostShare: number
  declares: number
  declaresCorrect: number
  /** Declares of a book the claimer held no card of (exact, from the actualHolders reveal). */
  foreignDeclares: number
  /** Declares where every actualHolders value == the claimer. */
  ownHandOnlyDeclares: number
  /** Mean of (declare event index / final observed event index); 0 when no declares. */
  declareBackload: number
  /** Total public events observed (the x-axis for accuracy curves). */
  events: number

  // --- normalised shares of the counts above, for length-invariant classification ------------
  // The raw counts are the primary observations; these divide them by their own denominators
  // so that a 70-event clinch and a 200-event grind project into the same space. The
  // classifier's FEATURE_KEYS use the shares, never the raw counts — a count at 150 observed
  // events is incommensurable with a fingerprint calibrated at a different game length, and
  // the first calibration run demonstrated exactly that failure before these existed.

  /** provablyDeadAsks / max(1, asks). */
  deadAskShare: number
  /** certainAsks / max(1, asks). */
  certainAskShare: number
  /** leakyAsks / max(1, asks). */
  leakyAskShare: number
  /** completionAsks / max(1, asks). */
  completionAskShare: number
  /** asks / max(1, events) — how much of the observed public record is this seat asking. */
  askShare: number
  /** declares / max(1, events). */
  declareShare: number
  /** foreignDeclares / max(1, declares). */
  foreignDeclareShare: number
  /** ownHandOnlyDeclares / max(1, declares). */
  ownHandOnlyShare: number
}

/**
 * The ordered feature subset the classifier and the fingerprint generator consume. Every
 * entry is a rate or a share — length-invariant by construction — never a raw count: a first
 * calibration over raw counts read every short cross-play game as "not the style" simply
 * because the mirror games it was calibrated on ran longer, which is a fact about the
 * *opponents*, not the seat. The checkpoint buckets still matter on top of this, because the
 * shares themselves drift over a game (declares concentrate late, certainty accumulates).
 *
 * `asks`/`hits`/`declaresCorrect` are deliberately absent: the first two are the denominators
 * already inside `hitRate` and `askShare`, and correctness is near-ceiling for every
 * full-strength style, so it separates nothing and would only add correlated noise to the
 * diagonal-Gaussian model.
 */
export const FEATURE_KEYS = [
  'hitRate',
  'askDiversity',
  'sameBookRepeatRate',
  'certainAskShare',
  'deadAskShare',
  'leakyAskShare',
  'completionAskShare',
  'missFewestShare',
  'missMostShare',
  'askShare',
  'declareShare',
  'foreignDeclareShare',
  'ownHandOnlyShare',
  'declareBackload',
] as const satisfies readonly (keyof SeatObservation)[]

export type FeatureKey = (typeof FEATURE_KEYS)[number]

/** The observation projected onto FEATURE_KEYS, in order — the classifier's input vector. */
export function featureVector(obs: SeatObservation): number[] {
  return FEATURE_KEYS.map((k) => obs[k])
}

/** Mutable per-seat accumulator for one scan. */
interface SeatTrack {
  asks: number
  hits: number
  books: Set<BookId>
  prevBook: BookId | null
  repeats: number
  provablyDeadAsks: number
  certainAsks: number
  leakyAsks: number
  completionAsks: number
  missFewest: number
  missMost: number
  declares: number
  declaresCorrect: number
  foreignDeclares: number
  ownHandOnlyDeclares: number
  declareIndices: number[]
}

interface ScanResult {
  tracks: SeatTrack[]
  counts: number[]
}

/**
 * The single pass. Everything below is evaluated *at the moment of the event*, before the
 * event's own effect is applied — an ask is scored against the position the asker saw.
 */
function scan(view: PublicState | SeatView): ScanResult {
  const config = view.config
  const dealt = handSize(config)
  const counts: number[] = ALL_SEATS.map(() => dealt)
  const publicHolder = new Map<Card, Seat>()
  const certified: Set<BookId>[] = ALL_SEATS.map(() => new Set<BookId>())
  const tracks: SeatTrack[] = ALL_SEATS.map(() => ({
    asks: 0,
    hits: 0,
    books: new Set<BookId>(),
    prevBook: null,
    repeats: 0,
    provablyDeadAsks: 0,
    certainAsks: 0,
    leakyAsks: 0,
    completionAsks: 0,
    missFewest: 0,
    missMost: 0,
    declares: 0,
    declaresCorrect: 0,
    foreignDeclares: 0,
    ownHandOnlyDeclares: 0,
    declareIndices: [],
  }))

  for (let i = 0; i < view.log.length; i++) {
    const ev: PublicEvent = view.log[i]
    if (ev.type === 'ask') {
      const { asker, target, card, hit } = ev
      const book = cardBook(card)
      const t = tracks[asker]
      t.asks++
      t.books.add(book)
      if (t.prevBook === book) t.repeats++
      t.prevBook = book

      // Dead / certain: the named card's public location, before this ask moves anything.
      const known = publicHolder.get(card)
      if (known !== undefined) {
        if (known === target) t.certainAsks++
        else t.provablyDeadAsks++
      }

      // The ask itself certifies the asker's licence (row 6) — flag first, then score.
      certified[asker].add(book)
      const team = seatTeam(asker)
      let located = 0
      const locatedAtSeat = new Set<Seat>()
      for (const c of bookCards(book, config)) {
        const holder = publicHolder.get(c)
        if (holder !== undefined && seatTeam(holder) === team) {
          located++
          locatedAtSeat.add(holder)
        }
      }
      let certifiedExtra = 0
      for (const s of ALL_SEATS) {
        if (seatTeam(s) === team && certified[s].has(book) && !locatedAtSeat.has(s)) certifiedExtra++
      }
      if (located + certifiedExtra >= 4) t.leakyAsks++
      if (located === 5) t.completionAsks++

      if (hit) {
        t.hits++
        publicHolder.set(card, asker)
        counts[target]--
        counts[asker]++
        // The hit stripped a card of `book` from the target: their licence there may be gone,
        // so the certification is dropped rather than left possibly stale (header note).
        certified[target].delete(book)
        if (counts[target] === 0) certified[target].clear()
      } else {
        // Miss-share features: the target's replayed count against the other live opponents'.
        const targetCount = counts[target]
        let liveOpponents = 0
        let fewest = true
        let most = true
        for (const s of ALL_SEATS) {
          if (seatTeam(s) === team || counts[s] === 0) continue
          liveOpponents++
          if (s === target) continue
          if (counts[s] <= targetCount) fewest = false
          if (counts[s] >= targetCount) most = false
        }
        if (liveOpponents >= 2) {
          if (fewest) t.missFewest++
          if (most) t.missMost++
        }
      }
    } else if (ev.type === 'claim') {
      const { claimer, book, actualHolders, outcome } = ev
      const t = tracks[claimer]
      t.declares++
      t.declareIndices.push(i)
      const mine = seatTeam(claimer) === 0 ? 'team0' : 'team1'
      if (outcome === mine) t.declaresCorrect++

      const holders = Object.values(actualHolders)
      if (!holders.includes(claimer)) t.foreignDeclares++
      if (holders.length > 0 && holders.every((s) => s === claimer)) t.ownHandOnlyDeclares++

      // The reveal removes all six cards from whoever actually held them, whatever the
      // outcome — the reducer strips them unconditionally, and so does the replay.
      for (const [card, holder] of Object.entries(actualHolders) as [Card, Seat][]) {
        counts[holder]--
        publicHolder.delete(card)
      }
      for (const s of ALL_SEATS) {
        certified[s].delete(book)
        if (counts[s] === 0) certified[s].clear()
      }
    }
    // game_started / pass / designate / player_out / endgame / game_over: no card moves.
    // player_out in particular is a *consequence* the replay has already derived (the seat's
    // replayed count is 0 by the time the event lands), never a source of new information.
  }

  return { tracks, counts }
}

/**
 * The replayed hand counts at the end of the observed log. Exposed so the replay can be pinned
 * against `view.counts` on a full log, and because a truncated view's own `counts` are wrong
 * for its truncation point by construction (see the header).
 */
export function replayedCounts(view: PublicState | SeatView): number[] {
  return scan(view).counts
}

/** One SeatObservation per seat 0..5, from a single pass over the public log. */
export function observeSeats(view: PublicState | SeatView): SeatObservation[] {
  const { tracks } = scan(view)
  const events = view.log.length
  const finalIndex = events - 1
  return ALL_SEATS.map((seat) => {
    const t = tracks[seat]
    const misses = t.asks - t.hits
    const distinctBooks = t.books.size
    let backload = 0
    if (t.declareIndices.length > 0 && finalIndex > 0) {
      let sum = 0
      for (const idx of t.declareIndices) sum += idx / finalIndex
      backload = sum / t.declareIndices.length
    }
    return {
      seat,
      asks: t.asks,
      hits: t.hits,
      hitRate: t.asks === 0 ? 0 : t.hits / t.asks,
      distinctBooks,
      askDiversity: distinctBooks / Math.max(1, t.asks),
      provablyDeadAsks: t.provablyDeadAsks,
      certainAsks: t.certainAsks,
      sameBookRepeatRate: t.repeats / Math.max(1, t.asks - 1),
      leakyAsks: t.leakyAsks,
      completionAsks: t.completionAsks,
      missFewestShare: misses === 0 ? 0 : t.missFewest / misses,
      missMostShare: misses === 0 ? 0 : t.missMost / misses,
      declares: t.declares,
      declaresCorrect: t.declaresCorrect,
      foreignDeclares: t.foreignDeclares,
      ownHandOnlyDeclares: t.ownHandOnlyDeclares,
      declareBackload: backload,
      events,
      deadAskShare: t.provablyDeadAsks / Math.max(1, t.asks),
      certainAskShare: t.certainAsks / Math.max(1, t.asks),
      leakyAskShare: t.leakyAsks / Math.max(1, t.asks),
      completionAskShare: t.completionAsks / Math.max(1, t.asks),
      askShare: t.asks / Math.max(1, events),
      declareShare: t.declares / Math.max(1, events),
      foreignDeclareShare: t.foreignDeclares / Math.max(1, t.declares),
      ownHandOnlyShare: t.ownHandOnlyDeclares / Math.max(1, t.declares),
    }
  })
}
