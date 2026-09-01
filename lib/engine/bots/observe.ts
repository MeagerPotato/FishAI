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
 *   asker <- target, and a claim takes all six cards of the resolved book out of play,
 *   debiting each from the seat that held it. This is deliberate: the classifier evaluates
 *   *truncated* logs (checkpoint fingerprints slice the log mid-game), and a truncated view's
 *   top-level `counts` describe the end of the game, not the truncation point. The replayed
 *   counts are correct at every prefix, and `tests/bots/observe.test.ts` pins them against
 *   `view.counts` at full length.
 *
 * ## The one place the replay can be weaker than exact — and how it says so
 *
 * A claim's `actualHolders` is the only witness of *whose* hand each of the six cards left.
 * At home it always names all six: `reduce.ts` builds it by scanning the true hands and
 * refuses the action outright if any card of the book is in no hand. But the log is not
 * always ours. A bridged failed declare emits only the cards an earlier hit had already made
 * public (CROSSPLAY.md §9.6), so the map is *partial by construction* there.
 *
 * So the scan iterates `bookCards(book, config)` — the book, not the map. A card the map
 * omits has still left play, and must still leave `publicHolder`, or every later ask for it
 * reads as certain or provably dead against a hand it is no longer in. The holder comes from
 * the reveal, falling back to `publicHolder` when the reveal is silent (a hit locates a card
 * exactly, and only another hit or this resolution can move it, so that fallback is exact
 * too). What the scan will *not* do is invent a holder: when no witness names one, no hand is
 * debited. That leaves a count too high rather than debiting the wrong seat, which is the
 * error a caller can reason about.
 *
 * The residual weakness is **reported, not silent**, and it is reported where a consumer will
 * meet it: `replayCounts` returns `countsExact` beside the counts, and `observeSeats` carries
 * the same flag onto every `SeatObservation`. It is deliberately *not* in `FEATURE_KEYS` —
 * `featureVector` projects that list and nothing else, so the classifier's input vector and
 * every calibrated fingerprint in `data/fingerprints.ts` are untouched by its existence.
 *
 * It goes false in three places, all of them witness failures rather than count arithmetic:
 * a resolved book supplies fewer holders than it has cards; a reveal names a seat the replay
 * had already emptied; or a reveal names one seat for a card `publicHolder` located at
 * another. In the last two the reveal wins the debit — it is the stronger witness, being the
 * true hand rather than a location inferred from an earlier hit — but the hit that made the
 * losing witness has *already* been replayed into the counts and cannot be taken back, so a
 * second seat is wrong too and the flag is the only thing that says so.
 * `missFewestShare` / `missMostShare` compare counts *across* seats, so a consumer weighing
 * those on a foreign log can ask first whether the counts are worth comparing. A silent
 * weakness in a counter is exactly what published a wrong number once in this project
 * already: a counter read zero where zero was impossible, and it was filed as a coverage gap
 * instead of the defect it was.
 *
 * The two declare *signatures* honour that same fact rather than reporting it, because for
 * them there is nothing to report — the observation is simply not available.
 * `foreignDeclares` ("the claimer held no card of the book") and `ownHandOnlyDeclares` ("every
 * card was the claimer's own") are claims about *all* the holders, and a partial map cannot
 * support either: an empty map makes "the claimer is not among the holders" vacuously true,
 * which would score every bridged failed declare as foreign, and a one-card map naming the
 * claimer would score it own-hand-only. Both increments are therefore gated on a reveal that
 * names every card of the book, so both counters — and `foreignDeclareShare` /
 * `ownHandOnlyShare`, which unlike `countsExact` *are* in `FEATURE_KEYS` — read 0 on a log
 * that cannot certify them. At home every reveal is complete, so the gate never fires and no
 * home observation changes.
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
  /**
   * Declares of a book the claimer held no card of (exact, from the actualHolders reveal).
   * Counted only where the reveal named every card of the book — see the header.
   */
  foreignDeclares: number
  /** Declares where every actualHolders value == the claimer, on a complete reveal only. */
  ownHandOnlyDeclares: number
  /** Mean of (declare event index / final observed event index); 0 when no declares. */
  declareBackload: number
  /** Total public events observed (the x-axis for accuracy curves). */
  events: number
  /**
   * Whether the replayed hand counts behind `missFewestShare` / `missMostShare` were derived
   * exactly — the same flag `replayCounts` returns, repeated per seat because it is a property
   * of the log every seat was scored against (see the header). A property of the *instrument*,
   * not of the seat's behaviour, so it is not in `FEATURE_KEYS` and never reaches a classifier
   * vector or a fingerprint. True on every home log.
   */
  countsExact: boolean

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
  /** False once any resolved book's witnesses were incomplete or disagreed (see the header). */
  countsExact: boolean
}

/**
 * The single pass. Everything below is evaluated *at the moment of the event*, before the
 * event's own effect is applied — an ask is scored against the position the asker saw.
 */
function scan(view: PublicState | SeatView): ScanResult {
  const config = view.config
  const dealt = handSize(config)
  const counts: number[] = ALL_SEATS.map(() => dealt)
  // Cleared by a resolved book whose witnesses were incomplete or disagreed (see the header).
  let countsExact = true
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

      // Read the reveal through the BOOK, not through `Object.keys(actualHolders)`: the map is
      // total at home but partial on a bridged failed declare (header), and `Record<Card, Seat>`
      // claims a totality a foreign log does not honour. One `undefined` here is one card no
      // reveal witnesses.
      const cards = bookCards(book, config)
      const revealed: (Seat | undefined)[] = cards.map((c) => actualHolders[c])
      const completeReveal = revealed.every((s) => s !== undefined)

      // The declare signatures are claims about ALL the holders, so a partial reveal cannot
      // support either of them (header). Gated, not guessed: an empty map would otherwise make
      // `!includes(claimer)` vacuously true and score every bridged failed declare as foreign.
      // At home `completeReveal` is always true (`reduce.ts:366-379` builds the map from the
      // true hands and refuses the action if a card is in none), so nothing changes there.
      if (completeReveal) {
        const holders = revealed as Seat[]
        if (!holders.includes(claimer)) t.foreignDeclares++
        if (holders.every((s) => s === claimer)) t.ownHandOnlyDeclares++
      } else {
        countsExact = false
      }

      // The reveal takes all six cards of the book out of play, whatever the outcome — the
      // reducer strips them unconditionally, and so does the replay. This is `knowledge.ts`'s
      // shape (`:286-293`), which is why that module was never exposed to this.
      for (let j = 0; j < cards.length; j++) {
        const card = cards[j]
        // The reveal is preferred, a public location is the fallback, and neither is invented.
        const seen = revealed[j]
        const located = publicHolder.get(card)
        // Two witnesses, two seats: the reveal is the true hand and the location was inferred
        // from an earlier hit, so the reveal takes the debit — but that hit is already in
        // `counts` and cannot be un-replayed, so the located seat is over by one and stays
        // over. Same class of contradiction as the emptied-seat clamp below, and it gets the
        // same treatment. Cannot fire at home, where both witnesses are true.
        if (seen !== undefined && located !== undefined && located !== seen) countsExact = false
        const holder = seen !== undefined ? seen : located
        if (holder !== undefined) {
          // Clamped: a seat replayed to 0 cannot have held it, so log and replay disagree and
          // the counts have stopped being exact — say so rather than going negative.
          if (counts[holder] > 0) counts[holder]--
          else countsExact = false
        }
        // Unconditional, holder known or not: a resolved card is out of play and must not stay
        // "located" at a seat, or every later ask for it scores against a hand it has left.
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

  return { tracks, counts, countsExact }
}

/** The replayed hand counts, and whether the log let the replay derive them exactly. */
export interface CountReplay {
  /** One count per seat 0..5 at the end of the observed log. */
  counts: number[]
  /**
   * True when every resolved book in the log named all six of its holders *and* no reveal
   * contradicted what the replay already believed, so every card that left play was debited
   * from the hand it actually left. False means at least one seat's count is wrong: either an
   * *upper* bound (a card left play that no witness could attribute, and the replay declined
   * to guess) or an over-count left behind by a hit the reveal overruled.
   *
   * Deliberately conservative — it goes false even in the case where `publicHolder` happened
   * to recover every missing holder, because "the reveal named all six" is a property a
   * consumer can check for itself, while "the recovery happened to be complete" is one it
   * would simply have to take on trust.
   */
  countsExact: boolean
}

/**
 * The replayed hand counts at the end of the observed log, with the flag that says whether
 * they are exact. Exposed so the replay can be pinned against `view.counts` on a full log, and
 * because a truncated view's own `counts` are wrong for its truncation point by construction
 * (see the header). Reach for this rather than `replayedCounts` whenever the answer depends on
 * comparing one seat's count against another's — that comparison is the thing an inexact
 * replay quietly breaks.
 */
export function replayCounts(view: PublicState | SeatView): CountReplay {
  const { counts, countsExact } = scan(view)
  return { counts, countsExact }
}

/**
 * The counts alone — exactly `replayCounts(view).counts`. Kept as its own export because every
 * existing caller wants the array and nothing else, and because the pin against `view.counts`
 * reads better without the wrapper.
 */
export function replayedCounts(view: PublicState | SeatView): number[] {
  return scan(view).counts
}

/**
 * One SeatObservation per seat 0..5, from a single pass over the public log. `countsExact` is
 * the scan's own flag repeated on every seat: `classifySeats` hands a consumer these and
 * nothing else, so a flag left behind in `ScanResult` would be unreachable from the one place
 * that reads `missFewestShare` / `missMostShare` ([classify.ts](classify.ts)).
 */
export function observeSeats(view: PublicState | SeatView): SeatObservation[] {
  const { tracks, countsExact } = scan(view)
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
      countsExact,
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
