/**
 * observe.test.ts — every SeatObservation feature pinned on a hand-built log with a known
 * answer, then the count replay pinned against the reducer on real games (the log is the only
 * source observe.ts reads, so the replayed counts agreeing with `view.counts` at every
 * mid-game snapshot is what licenses running it on truncated logs at all).
 */
import { describe, expect, it } from 'vitest'
import {
  bookCards,
  decide,
  hashSeed,
  legalActionsSummary,
  newGame,
  publicView,
  reduce,
  seatView,
  us54Config,
  STYLE_ROSTER,
} from '../../lib/engine/index.ts'
import type { BookId, Card, PublicEvent, PublicState, Seat, StyleParams } from '../../lib/engine/index.ts'
import {
  FEATURE_KEYS,
  featureVector,
  observeSeats,
  replayCounts,
  replayedCounts,
} from '../../lib/engine/bots/observe.ts'
import { deepFreeze } from '../engine/util.ts'
import { ask, gs, mkView } from './util.ts'

/** A claim event where the declare succeeded or failed exactly as `outcome` says. */
function claim(
  claimer: Seat,
  book: BookId,
  actualHolders: Record<Card, Seat>,
  outcome: 'team0' | 'team1',
): PublicEvent {
  return { type: 'claim', claimer, book, assignments: { ...actualHolders }, actualHolders, outcome }
}

/** Holders record for a whole book, one seat for all six cards (or a per-card override). */
function holders(book: BookId, seat: Seat, over: Partial<Record<Card, Seat>> = {}): Record<Card, Seat> {
  const out = {} as Record<Card, Seat>
  for (const c of bookCards(book, us54Config)) out[c] = over[c] ?? seat
  return out
}

/**
 * A holders reveal naming exactly `cards`, in order, at `seats`. `actualHolders` is typed
 * `Record<Card, Seat>` — total — but a foreign log need not honour that: over the bridge a
 * failed declare reveals only the cards an earlier hit had already made public (CROSSPLAY.md
 * §9.6), so the map that arrives is partial by construction. This builds any of those shapes:
 * all six cards, some of them, or `revealNaming([], [])` for none at all.
 */
function revealNaming(cards: readonly Card[], seats: readonly Seat[]): Record<Card, Seat> {
  const out = {} as Record<Card, Seat>
  cards.forEach((c, i) => {
    out[c] = seats[i]
  })
  return out
}

function viewOf(log: PublicEvent[]): PublicState {
  return mkView({ seat: 0, hand: [], counts: [9, 9, 9, 9, 9, 9], log, config: us54Config })
}

/** One full us54 game under a per-seat style map, with periodic public snapshots. */
function playUs54(
  seed: string,
  policyOf: (seat: Seat) => StyleParams,
): { final: PublicState; snapshots: PublicState[] } {
  let s = newGame(seed, us54Config, 0)
  const snapshots: PublicState[] = []
  let steps = 0
  while (s.phase !== 'finished' && steps < 5000) {
    const { seat } = legalActionsSummary(s)
    const r = reduce(s, decide(seatView(s, seat), policyOf(seat), hashSeed(`${seed}:${s.moveIndex}`)()))
    if (!r.ok) throw new Error(`playUs54: ${r.error.code}`)
    s = r.state
    steps++
    if (steps % 25 === 0) snapshots.push(publicView(s))
  }
  if (s.phase !== 'finished') throw new Error('playUs54: step cap')
  return { final: publicView(s), snapshots }
}

describe('observeSeats — hand-built logs', () => {
  it('a log with no actions observes nothing', () => {
    const obs = observeSeats(viewOf([gs]))
    expect(obs).toHaveLength(6)
    for (const o of obs) {
      expect(o.asks).toBe(0)
      expect(o.hits).toBe(0)
      expect(o.hitRate).toBe(0)
      expect(o.declares).toBe(0)
      expect(o.events).toBe(1)
      expect(o.missFewestShare).toBe(0)
      expect(o.declareBackload).toBe(0)
    }
  })

  it('hits locate cards publicly: certain and provably-dead asks are recognised', () => {
    const obs = observeSeats(
      viewOf([
        gs,
        ask(0, 1, '9H', true), // 9H publicly at seat 0 now
        ask(1, 0, '9H', true), // holder known == target -> certain; 9H moves to seat 1
        ask(0, 3, '9H', false), // holder known (1) != target (3) -> provably dead
      ]),
    )
    expect(obs[0].asks).toBe(2)
    expect(obs[0].hits).toBe(1)
    expect(obs[0].hitRate).toBe(0.5)
    expect(obs[0].provablyDeadAsks).toBe(1)
    expect(obs[0].certainAsks).toBe(0)
    expect(obs[0].deadAskShare).toBe(0.5)
    expect(obs[1].certainAsks).toBe(1)
    expect(obs[1].provablyDeadAsks).toBe(0)
    expect(obs[1].certainAskShare).toBe(1)
    expect(obs[1].hitRate).toBe(1)
  })

  it('same-book repeats are consecutive per seat, not per log', () => {
    const obs = observeSeats(
      viewOf([
        gs,
        ask(0, 1, '9H', false),
        ask(1, 2, '5D', false), // another seat interleaves; seat 0's streak is unbroken
        ask(0, 1, 'TH', false), // HIGH-H after HIGH-H -> repeat
        ask(0, 1, '2C', false), // LOW-C -> no repeat
      ]),
    )
    expect(obs[0].asks).toBe(3)
    expect(obs[0].distinctBooks).toBe(2)
    expect(obs[0].askDiversity).toBeCloseTo(2 / 3, 12)
    expect(obs[0].sameBookRepeatRate).toBeCloseTo(1 / 2, 12)
  })

  it('declares: foreign and own-hand-only are exact from the actualHolders reveal', () => {
    const log: PublicEvent[] = [
      gs,
      // Foreign and correct: seat 0 declares HIGH-S held entirely by teammates 2 and 4.
      claim(0, 'HIGH-S', holders('HIGH-S', 2, { KS: 4, AS: 4 }), 'team0'),
      // Own-hand-only and correct: seat 1 declares LOW-C entirely from its own hand.
      claim(1, 'LOW-C', holders('LOW-C', 1), 'team1'),
      // Wrong (gifted): seat 2 declares LOW-D that the opponents actually held.
      claim(2, 'LOW-D', holders('LOW-D', 3), 'team1'),
      ask(0, 1, '9H', false),
    ]
    const obs = observeSeats(viewOf(log))
    expect(obs[0].declares).toBe(1)
    expect(obs[0].declaresCorrect).toBe(1)
    expect(obs[0].foreignDeclares).toBe(1)
    expect(obs[0].ownHandOnlyDeclares).toBe(0)
    expect(obs[0].foreignDeclareShare).toBe(1)
    expect(obs[1].declares).toBe(1)
    expect(obs[1].declaresCorrect).toBe(1)
    expect(obs[1].foreignDeclares).toBe(0)
    expect(obs[1].ownHandOnlyDeclares).toBe(1)
    expect(obs[1].ownHandOnlyShare).toBe(1)
    expect(obs[2].declares).toBe(1)
    expect(obs[2].declaresCorrect).toBe(0)
    expect(obs[2].foreignDeclares).toBe(1)
    // Backload: declares at event indices 1, 2, 3 of a final index 4.
    expect(obs[0].declareBackload).toBeCloseTo(1 / 4, 12)
    expect(obs[1].declareBackload).toBeCloseTo(2 / 4, 12)
    expect(obs[2].declareBackload).toBeCloseTo(3 / 4, 12)
    // The claim replay removes cards from the true holders.
    const counts = replayedCounts(viewOf(log))
    expect(counts).toEqual([9, 3, 5, 3, 7, 9])
  })

  it('leaky and completion asks count located + certified team cards at ask time', () => {
    const obs = observeSeats(
      viewOf([
        gs,
        ask(0, 1, '9H', true),
        ask(0, 1, 'TH', true),
        ask(0, 3, 'JH', true),
        ask(0, 3, 'QH', true), // 4 of HIGH-H now publicly at seat 0
        ask(0, 5, 'KH', true), // located 4 at ask time -> leaky; now 5 located
        ask(0, 5, 'AH', false), // located 5 -> completion (and leaky)
      ]),
    )
    expect(obs[0].leakyAsks).toBe(2)
    expect(obs[0].completionAsks).toBe(1)
    expect(obs[0].completionAskShare).toBeCloseTo(1 / 6, 12)
  })

  it('an ask certifies the licence, and a hit that strips the book decays it', () => {
    const base: PublicEvent[] = [
      gs,
      ask(2, 1, '9D', false), // certifies seat 2 in HIGH-D
      ask(0, 1, 'TD', true),
      ask(0, 1, 'JD', true),
      ask(0, 3, 'QD', true), // 3 of HIGH-D located at seat 0
    ]
    // Located 3 + certified seat 2 (no located card there) = 4 -> leaky.
    const withCert = observeSeats(viewOf([...base, ask(0, 5, 'KD', false)]))
    expect(withCert[0].leakyAsks).toBe(1)
    // The same position after an opponent's hit strips a HIGH-D card from seat 2: the
    // certification may have been that very card, so it is dropped and the ask is not leaky.
    const stripped = observeSeats(viewOf([...base, ask(1, 2, 'AD', true), ask(0, 5, 'KD', false)]))
    expect(stripped[0].leakyAsks).toBe(0)
  })

  it('miss shares compare the target against the live opponents at ask time', () => {
    const obs = observeSeats(
      viewOf([
        gs,
        ask(0, 1, '9H', true),
        ask(0, 1, 'TH', true), // seat 1 down to 7
        ask(0, 1, 'JH', false), // target 1 (7) vs live 3 (9), 5 (9): strictly fewest
        ask(0, 3, 'QH', false), // target 3 (9) vs 1 (7), 5 (9): tie with 5 -> neither
        ask(5, 0, '2C', true), // seat 5 up to 10
        ask(0, 5, 'KH', false), // target 5 (10) vs 1 (7), 3 (9): strictly most
      ]),
    )
    expect(obs[0].asks).toBe(5)
    expect(obs[0].hits).toBe(2)
    expect(obs[0].missFewestShare).toBeCloseTo(1 / 3, 12)
    expect(obs[0].missMostShare).toBeCloseTo(1 / 3, 12)
  })

  it('a miss with a single live opponent reveals no preference and moves neither share', () => {
    const stripSeat = (asker: Seat, target: Seat, cards: readonly Card[]): PublicEvent[] =>
      cards.map((c) => ask(asker, target, c, true))
    const log: PublicEvent[] = [
      gs,
      // Fabricated hits empty seats 1 and 5 (observe replays events; it does not re-referee).
      ...stripSeat(0, 1, ['2C', '3C', '4C', '5C', '6C', '7C', '2D', '3D', '4D']),
      ...stripSeat(4, 5, ['5D', '6D', '7D', '2H', '3H', '4H', '5H', '6H', '7H']),
      ask(2, 3, '9C', false), // seat 3 is the only live opponent of team 0
    ]
    const counts = replayedCounts(viewOf(log))
    expect(counts[1]).toBe(0)
    expect(counts[5]).toBe(0)
    const obs = observeSeats(viewOf(log))
    expect(obs[2].asks).toBe(1)
    expect(obs[2].hits).toBe(0)
    expect(obs[2].missFewestShare).toBe(0)
    expect(obs[2].missMostShare).toBe(0)
  })

  it('events is the observed log length and FEATURE_KEYS project to a numeric vector', () => {
    const obs = observeSeats(viewOf([gs, ask(0, 1, '9H', true)]))
    for (const o of obs) expect(o.events).toBe(2)
    const vec = featureVector(obs[0])
    expect(vec).toHaveLength(FEATURE_KEYS.length)
    for (const v of vec) {
      expect(typeof v).toBe('number')
      expect(Number.isFinite(v)).toBe(true)
    }
  })
})

describe('observeSeats — real games', () => {
  const balanced = () => STYLE_ROSTER.balanced

  it('replayed counts agree with the reducer at every snapshot and at the end', () => {
    for (let g = 0; g < 3; g++) {
      const { final, snapshots } = playUs54(`observe-counts-${g}`, balanced)
      expect(replayedCounts(final)).toEqual(final.counts)
      // A home log's reveals always name all six holders (`reduce.ts` refuses the action
      // otherwise), so the replay is exact at every prefix and must say so.
      expect(replayCounts(final)).toEqual({ counts: final.counts, countsExact: true })
      expect(snapshots.length).toBeGreaterThan(0)
      for (const snap of snapshots) {
        expect(replayedCounts(snap)).toEqual(snap.counts)
        expect(replayCounts(snap).countsExact).toBe(true)
      }
    }
  })

  it('a truncated log replays to the counts the game actually had at that point', () => {
    const { final, snapshots } = playUs54('observe-truncate-0', balanced)
    for (const snap of snapshots) {
      const truncated: PublicState = { ...final, log: final.log.slice(0, snap.log.length) }
      // The truncated view's own top-level counts are end-of-game and deliberately ignored;
      // the replay recovers the mid-game truth from the log prefix alone.
      expect(replayedCounts(truncated)).toEqual(snap.counts)
      expect(observeSeats(truncated)).toEqual(observeSeats(snap))
    }
  })

  it('is deterministic and never mutates the view', () => {
    const { final } = playUs54('observe-frozen-0', balanced)
    const frozen = deepFreeze(JSON.parse(JSON.stringify(final)) as PublicState)
    let fromFrozen: unknown = null
    expect(() => {
      fromFrozen = observeSeats(frozen)
    }).not.toThrow()
    expect(fromFrozen).toEqual(observeSeats(final))
    expect(JSON.stringify(observeSeats(final))).toBe(JSON.stringify(observeSeats(final)))
  })
})

/**
 * The claim replay against reveals that do NOT name all six holders — the shape a bridged
 * failed declare emits, and the shape the pin above cannot reach: it only ever sees home logs,
 * whose reveals are always complete. The scan used to iterate `actualHolders` rather than the
 * book, so every unnamed card silently stayed in a hand and stayed publicly located.
 *
 * Note what is deliberately NOT pinned here: `8,8,8,8,8,8`. When the reveal omits a card, the
 * log genuinely does not say whose hand it left, and no correct implementation can recover it.
 * Under-counting is the honest answer; inventing a seat would be worse. What *is* pinned is
 * that the card leaves play, that no seat the reveal never named is touched, that nothing goes
 * negative, and that the replay reports its own inexactness instead of hiding it.
 */
describe('replayCounts — reveals that do not name all six holders', () => {
  const LOW_C = bookCards('LOW-C', us54Config)
  /** LOW-C resolved with exactly one card in each seat's hand: every seat drops 9 -> 8. */
  const oneEach = (): Record<Card, Seat> => revealNaming(LOW_C, [0, 1, 2, 3, 4, 5])

  it('a complete reveal debits all six holders and reports the counts exact', () => {
    const r = replayCounts(viewOf([gs, claim(0, 'LOW-C', oneEach(), 'team0')]))
    expect(r.counts).toEqual([8, 8, 8, 8, 8, 8])
    expect(r.countsExact).toBe(true)
  })

  it('a partial reveal debits the holders it names, touches no other seat, and is not exact', () => {
    const named = revealNaming([LOW_C[0], LOW_C[1]], [0, 2])
    const r = replayCounts(viewOf([gs, claim(0, 'LOW-C', named, 'team0')]))
    // Seats 0 and 2 are named; the four cards no witness places leave 1, 3, 4 and 5 at the
    // deal size. Under-counted, not misattributed — and reported as such.
    expect(r.counts).toEqual([8, 9, 8, 9, 9, 9])
    expect(r.countsExact).toBe(false)
    for (const c of r.counts) expect(c).toBeGreaterThanOrEqual(0)
  })

  it('an empty reveal debits nothing at all and is not exact', () => {
    const r = replayCounts(viewOf([gs, claim(0, 'LOW-C', revealNaming([], []), 'team0')]))
    expect(r.counts).toEqual([9, 9, 9, 9, 9, 9])
    expect(r.countsExact).toBe(false)
    for (const c of r.counts) expect(c).toBeGreaterThanOrEqual(0)
  })

  it('every card of the resolved book leaves publicHolder, named by the reveal or not', () => {
    const log: PublicEvent[] = [
      gs,
      // Four LOW-C cards publicly located: two at seat 1, two at seat 3.
      ask(1, 0, LOW_C[0], true),
      ask(1, 0, LOW_C[1], true),
      ask(3, 2, LOW_C[2], true),
      ask(3, 2, LOW_C[3], true),
      // The reveal names one of those four and nothing else.
      claim(0, 'LOW-C', revealNaming([LOW_C[0]], [1]), 'team0'),
      // Every card of the book, asked for after the book left play. A stale `publicHolder`
      // entry scores these as certain (holder == target) or provably dead (holder != target);
      // cleared, they score neither. Before the fix this seat read 1 certain and 2 dead.
      ...LOW_C.map((c) => ask(4, 1, c, false)),
    ]
    const obs = observeSeats(viewOf(log))
    expect(obs[4].asks).toBe(6)
    expect(obs[4].certainAsks).toBe(0)
    expect(obs[4].provablyDeadAsks).toBe(0)
  })

  it('a holder the reveal omits but an earlier hit made public is still debited', () => {
    const log: PublicEvent[] = [
      gs,
      ask(1, 0, LOW_C[0], true), // seat 0 -> 8, seat 1 -> 10
      ask(1, 0, LOW_C[1], true), // seat 0 -> 7, seat 1 -> 11
      claim(0, 'LOW-C', revealNaming([LOW_C[0]], [1]), 'team0'),
    ]
    const r = replayCounts(viewOf(log))
    // Seat 1 is debited twice: once from the reveal, once from the public location the reveal
    // omitted — a hit locates a card exactly, and only another hit or this resolution moves it.
    expect(r.counts).toEqual([7, 9, 9, 9, 9, 9])
    // Exactness is a property of the *reveal*, not of how well the fallback happened to do:
    // four cards were still unwitnessed, so the counts are not exact.
    expect(r.countsExact).toBe(false)
  })

  it('a complete reveal naming an already-empty seat clamps at 0 rather than going negative', () => {
    // Nine fabricated hits empty seat 5 (observe replays events; it does not re-referee), then
    // a *complete* LOW-C reveal puts six cards in the hand that has none. That is the other way
    // the replay can stop being exact, and the counts must stay in range while it says so.
    const strip: Card[] = ['2D', '3D', '4D', '5D', '6D', '7D', '2H', '3H', '4H']
    const log: PublicEvent[] = [
      gs,
      ...strip.map((c) => ask(4, 5, c, true)),
      claim(0, 'LOW-C', holders('LOW-C', 5), 'team0'),
    ]
    const r = replayCounts(viewOf(log))
    expect(r.counts[5]).toBe(0)
    for (const c of r.counts) expect(c).toBeGreaterThanOrEqual(0)
    expect(r.countsExact).toBe(false)
  })

  it('a reveal that contradicts a public location debits the reveal and reports inexact', () => {
    // Seat 1 publicly took LOW_C[0] off seat 0, so the replay has that card at seat 1. The
    // reveal then names seat 2 for it. The reveal is the stronger witness and wins the debit,
    // but the hit is already in the counts and cannot be un-replayed: seat 1 stays one too
    // high and seat 2 one too low. Two seats wrong, and only the flag can say so.
    const named = revealNaming(LOW_C, [2, 3, 3, 3, 3, 3])
    const log: PublicEvent[] = [gs, ask(1, 0, LOW_C[0], true), claim(0, 'LOW-C', named, 'team0')]
    const r = replayCounts(viewOf(log))
    expect(r.counts).toEqual([8, 10, 8, 4, 9, 9])
    // The reveal is complete — six cards, six holders — so the *only* thing that can flag this
    // is the contradiction itself. Before the fix this vector shipped with countsExact true.
    expect(r.countsExact).toBe(false)
  })

  it('carries countsExact onto every SeatObservation, and keeps it out of the feature vector', () => {
    const partial = viewOf([gs, claim(0, 'LOW-C', revealNaming([LOW_C[0]], [1]), 'team0')])
    const complete = viewOf([gs, claim(0, 'LOW-C', oneEach(), 'team0')])
    // `classifySeats` hands a consumer SeatObservations and nothing else, so the flag has to
    // reach them or `missFewestShare` / `missMostShare` are weighed with no way to ask.
    for (const o of observeSeats(partial)) expect(o.countsExact).toBe(false)
    for (const o of observeSeats(complete)) expect(o.countsExact).toBe(true)
    // ...and it must never reach the classifier's vector, or every calibrated fingerprint in
    // data/fingerprints.ts describes a different instrument than the one reading them.
    expect(FEATURE_KEYS).not.toContain('countsExact')
    expect(featureVector(observeSeats(partial)[0]).every((x) => typeof x === 'number')).toBe(true)
  })
})

/**
 * `foreignDeclares` and `ownHandOnlyDeclares` are statements about *all* the holders of a
 * resolved book, so a reveal that names only some of them cannot support either. Both feed
 * FEATURE_KEYS through their shares, and both used to read straight off `Object.values` — on
 * an empty map `!holders.includes(claimer)` is vacuously true, so the shape a bridged failed
 * declare emits (CROSSPLAY.md §9.6) scored as a foreign declare every time.
 */
describe('the declare signatures require a reveal that names the whole book', () => {
  const LOW_C = bookCards('LOW-C', us54Config)

  it('scores a foreign declare on a complete reveal that places no card at the claimer', () => {
    const obs = observeSeats(viewOf([gs, claim(0, 'LOW-C', holders('LOW-C', 2), 'team1')]))
    expect(obs[0].declares).toBe(1)
    expect(obs[0].foreignDeclares).toBe(1)
    expect(obs[0].foreignDeclareShare).toBe(1)
    expect(obs[0].ownHandOnlyDeclares).toBe(0)
  })

  it('scores an own-hand-only declare on a complete reveal that places every card at the claimer', () => {
    const obs = observeSeats(viewOf([gs, claim(0, 'LOW-C', holders('LOW-C', 0), 'team0')]))
    expect(obs[0].ownHandOnlyDeclares).toBe(1)
    expect(obs[0].ownHandOnlyShare).toBe(1)
    expect(obs[0].foreignDeclares).toBe(0)
  })

  it('scores neither on an empty reveal — vacuous truth is not an observation', () => {
    const obs = observeSeats(viewOf([gs, claim(0, 'LOW-C', revealNaming([], []), 'team0')]))
    expect(obs[0].declares).toBe(1)
    expect(obs[0].foreignDeclares).toBe(0)
    expect(obs[0].foreignDeclareShare).toBe(0)
    expect(obs[0].ownHandOnlyDeclares).toBe(0)
    expect(obs[0].ownHandOnlyShare).toBe(0)
  })

  it('scores neither on a partial reveal naming one card at the claimer', () => {
    const named = revealNaming([LOW_C[0]], [0])
    const obs = observeSeats(viewOf([gs, claim(0, 'LOW-C', named, 'team0')]))
    expect(obs[0].declares).toBe(1)
    expect(obs[0].ownHandOnlyDeclares).toBe(0)
    expect(obs[0].ownHandOnlyShare).toBe(0)
    expect(obs[0].foreignDeclares).toBe(0)
  })

  it('scores neither on a partial reveal naming one card away from the claimer', () => {
    const named = revealNaming([LOW_C[0]], [3])
    const obs = observeSeats(viewOf([gs, claim(0, 'LOW-C', named, 'team1')]))
    expect(obs[0].declares).toBe(1)
    expect(obs[0].foreignDeclares).toBe(0)
    expect(obs[0].foreignDeclareShare).toBe(0)
  })
})
