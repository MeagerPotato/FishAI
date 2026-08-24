/**
 * decideExplained — the traced twin of `decide` (the v0.5 assistant surface).
 *
 * The contract under test has three parts, in order of importance:
 *
 *  1. **Equivalence.** `decideExplained(view, policy, seed).action` deep-equals
 *     `decide(view, policy, seed)` at every decision point of real games, under both rule sets,
 *     for every roster style and every shipped tier. This is the load-bearing test: the trace is
 *     implemented by threading an optional sink through the very branches `decide` runs, and the
 *     only thing that keeps the two functions one function is proof, not intention. The fuzz
 *     drives whole games (48 `us54` + 12 `pagat48` mirror games) and compares at every step, so
 *     any trace statement that consumed a random draw, mutated shared state or diverted a branch
 *     would surface as a first-class diff.
 *  2. **The traces say something.** Constructed positions — mostly reused from the suites that
 *     pinned the underlying behaviors — assert the branch `kind`, the presence of the numbers a
 *     player would want (p against its bar, the contained-pass valuation), and a non-empty
 *     refused list where branches were genuinely weighed and turned down.
 *  3. **Reading is not writing.** The frozen-view discipline of public-view.test.ts, re-applied:
 *     a deep-frozen view neither throws nor changes the decision or its trace.
 */
import { describe, expect, it } from 'vitest'
import {
  STYLE_IDS,
  STYLE_ROSTER,
  allBooks,
  bookCards,
  decide,
  decideExplained,
  hashSeed,
  legalActionsSummary,
  newGame,
  reduce,
  seatView,
  us54Config,
} from '../../lib/engine/index.ts'
import type {
  BookId,
  Card,
  DecisionTrace,
  GameAction,
  GameState,
  PolicySpec,
  PublicEvent,
  RulesConfig,
  Seat,
  SeatView,
} from '../../lib/engine/index.ts'
import { deepFreeze, distribute, forceState } from '../engine/util.ts'
import { ask, collectPositions, gs, mkView } from './util.ts'

/** Every branch verdict the trace may carry — the DecisionTrace contract, spelled out. */
const KINDS = new Set<DecisionTrace['kind']>([
  'own-book-claim',
  'certain-claim',
  'ev-claim',
  'forced-claim',
  'guess-claim',
  'certain-hit',
  'ranked-ask',
  'signalling-ask',
  'contained-pass',
  'decline',
  'must-declare',
  'pass',
  'designate',
  'error-branch',
  'fallback',
])

/** The twelve policies of the contract: the nine roster styles plus the three shipped tiers. */
const POLICIES: { name: string; policy: PolicySpec }[] = [
  ...STYLE_IDS.map((id) => ({ name: id as string, policy: STYLE_ROSTER[id] as PolicySpec })),
  { name: 'easy', policy: 'easy' as PolicySpec },
  { name: 'medium', policy: 'medium' as PolicySpec },
  { name: 'hard', policy: 'hard' as PolicySpec },
]

/** Structural sanity every trace must satisfy, at every decision point. */
function checkTraceShape(tr: DecisionTrace, ctx: string): void {
  if (!KINDS.has(tr.kind)) throw new Error(`${ctx}: unknown trace kind "${tr.kind}"`)
  if (typeof tr.headline !== 'string' || tr.headline.length === 0) {
    throw new Error(`${ctx}: empty headline (kind ${tr.kind})`)
  }
  if (!Array.isArray(tr.notes) || !tr.notes.every((n) => typeof n === 'string' && n.length > 0)) {
    throw new Error(`${ctx}: notes must be non-empty strings (kind ${tr.kind})`)
  }
  if (!Array.isArray(tr.refused)) throw new Error(`${ctx}: refused missing (kind ${tr.kind})`)
  for (const r of tr.refused) {
    if (typeof r.kind !== 'string' || typeof r.reason !== 'string' || r.reason.length === 0) {
      throw new Error(`${ctx}: malformed refused entry (kind ${tr.kind})`)
    }
  }
  if (tr.ranked !== undefined && tr.ranked.length > 5) {
    throw new Error(`${ctx}: ranked carries ${tr.ranked.length} entries (limit 5)`)
  }
}

/**
 * One mirror game (all six seats play `policy`), compared move for move. The game is DRIVEN by
 * the plain `decide` action after the comparison, exactly the lab seeding (`seed:moveIndex`),
 * so the positions visited are the positions the untraced engine visits.
 */
function playEquivalence(
  name: string,
  policy: PolicySpec,
  config: RulesConfig | undefined,
  gameSeed: string,
  startSeat: Seat,
): number {
  let s = newGame(gameSeed, config, startSeat)
  let steps = 0
  let decisions = 0
  while (s.phase !== 'finished') {
    if (steps >= 5000) throw new Error(`${name}/${gameSeed}: hit the 5000-step cap`)
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const moveSeed = hashSeed(`${gameSeed}:${s.moveIndex}`)()
    const plain = decide(view, policy, moveSeed)
    const explained = decideExplained(view, policy, moveSeed)
    // Fast path first (both objects come off the same construction sites, so key order agrees);
    // the rich diff only on an actual divergence.
    if (JSON.stringify(explained.action) !== JSON.stringify(plain)) {
      expect(explained.action, `${name}/${gameSeed} step ${steps}`).toEqual(plain)
    }
    checkTraceShape(explained.trace, `${name}/${gameSeed} step ${steps}`)
    decisions++
    const r = reduce(s, plain)
    if (!r.ok) throw new Error(`${name}/${gameSeed} step ${steps}: ${r.error.code}`)
    s = r.state
    steps++
  }
  return decisions
}

/* -------------------------------------------------- 1. the equivalence fuzz --- */

const US54_GAMES_PER_POLICY = 4
const PAGAT_GAMES_PER_POLICY = 1
const totals = { us54Games: 0, pagatGames: 0, decisions: 0 }

describe('decideExplained.action ≡ decide, at every decision point', () => {
  for (const { name, policy } of POLICIES) {
    it(
      `${name}: ${US54_GAMES_PER_POLICY} us54 + ${PAGAT_GAMES_PER_POLICY} pagat48 mirror games, every move identical`,
      () => {
        for (let g = 0; g < US54_GAMES_PER_POLICY; g++) {
          totals.decisions += playEquivalence(name, policy, us54Config, `explain-us54-${name}-${g}`, (g % 6) as Seat)
          totals.us54Games++
        }
        for (let g = 0; g < PAGAT_GAMES_PER_POLICY; g++) {
          // `undefined` config = the shipped 48-card default, exactly as `newGame` defaults it.
          totals.decisions += playEquivalence(name, policy, undefined, `explain-p48-${name}-${g}`, (g % 6) as Seat)
          totals.pagatGames++
        }
      },
      300_000,
    )
  }

  it('covered at least 40 us54 games and 10 pagat48 games across the twelve policies', () => {
    expect(totals.us54Games).toBeGreaterThanOrEqual(40)
    expect(totals.pagatGames).toBeGreaterThanOrEqual(10)
    expect(totals.decisions).toBeGreaterThan(1000)
  })
})

/* -------------------------------------------- 2. the traces, branch by branch --- */

const EIGHTS: Card[] = ['8C', '8D', '8H', '8S', 'XR', 'XB']

/** A us54 view with the declare option at the viewing seat (us54-decide.test.ts's builder). */
function windowView(v: {
  seat: Seat
  hand: Card[]
  counts: number[]
  turn?: Seat
  books?: SeatView['books']
  declined?: number
}): SeatView {
  return mkView({
    seat: v.seat,
    hand: v.hand,
    counts: v.counts,
    turn: v.turn ?? v.seat,
    books: v.books,
    log: [gs],
    config: us54Config,
    declareWindow: { option: v.seat, declined: v.declined ?? 0 },
  })
}

describe('trace kinds on constructed positions', () => {
  it('own-book-claim: a set wholly in hand, declared at the first offer', () => {
    const view = windowView({ seat: 0, hand: [...EIGHTS], counts: [6, 9, 9, 10, 10, 10], turn: 3 })
    const { action, trace } = decideExplained(view, 'hard', 7)
    expect(action.type).toBe('claim')
    expect(trace.kind).toBe('own-book-claim')
    expect(trace.headline).toContain('EIGHTS')
  })

  it('certain-claim: the cardless declarer banking a set counted onto a teammate (row 15)', () => {
    // us54-decide.test.ts's §7-vector-9 position: every other seat is out of cards, so counting
    // alone places all six EIGHTS with seat 2 — a certain, foreign declare by a cardless seat.
    const books: SeatView['books'] = {}
    for (const b of allBooks(us54Config)) {
      if (b === 'EIGHTS') continue
      const empty = {} as Record<Card, Seat>
      books[b] = { book: b, outcome: 'team0', claimer: 0, assignments: empty, actualHolders: empty }
    }
    const view = mkView({
      seat: 0,
      hand: [],
      counts: [0, 0, 6, 0, 0, 0],
      turn: 2,
      books,
      log: [gs],
      config: us54Config,
      declareWindow: { option: 0, declined: 0 },
    })
    const { action, trace } = decideExplained(view, 'hard', 17)
    expect(action.type).toBe('claim')
    expect(trace.kind).toBe('certain-claim')
    expect(trace.claim).toEqual({ book: 'EIGHTS', p: 1, uncertain: 0, foreign: true })
    expect(trace.notes.join(' ')).toContain('seat 2')
  })

  it('ev-claim: the crafted 5-certain + 1-uncertain spot carries p and its bar in the headline', () => {
    // behavior.test.ts's evClaimState: QS is guessable only onto teammates {2, 4}, and the free
    // slots put p(QS@2) at 17/20 = 0.85 — above hard's 0.8 threshold.
    const resolvedBooks: BookId[] = ['HIGH-C', 'HIGH-D', 'LOW-D']
    const books: GameState['books'] = {}
    for (const b of resolvedBooks) {
      const all1 = {} as Record<Card, Seat>
      for (const c of bookCards(b)) all1[c] = 1
      books[b] = { book: b, outcome: 'team1', claimer: 1, assignments: all1, actualHolders: all1 }
    }
    const log: PublicEvent[] = [gs, ask(3, 2, '2C', true), ask(3, 2, '3C', true), ask(3, 0, '4C', false)]
    const hands = distribute(
      {
        0: ['9S', 'TS', 'JS', 'KS', 'AS', '2S', '3S', '4S'],
        2: ['QS', '5S', '6S', '7S', '4C', '5C', '6C', '9H', 'TH', 'JH', 'QH', 'KH', 'AH', '2H', '3H', '4H', '5H'],
        3: ['2C', '3C'],
        4: ['7C', '6H', '7H'],
        1: [],
        5: [],
      },
      [],
    )
    const state = forceState(hands, { log, turn: 0, books, score: [0, 3], moveIndex: log.length - 1 })
    const { action, trace } = decideExplained(seatView(state, 0), 'hard', 7)
    expect(action.type).toBe('claim')
    expect(trace.kind).toBe('ev-claim')
    expect(trace.claim).toEqual({ book: 'HIGH-S', p: 0.85, uncertain: 1, foreign: false })
    expect(trace.headline).toContain('0.85')
    expect(trace.headline).toContain('0.8')
    expect(trace.notes.join(' ')).toContain('Q♠')
  })

  it('forced-claim: the endgame leaves claims as the only moves', () => {
    const view = mkView({
      seat: 0,
      hand: ['9S', 'TS', 'JS', 'QS', 'KS', 'AS'],
      counts: [6, 0, 0, 0, 0, 0],
      phase: 'endgame',
      log: [gs],
    })
    const { action, trace } = decideExplained(view, 'hard', 7)
    expect(action.type).toBe('claim')
    if (action.type === 'claim') expect(action.book).toBe('HIGH-S')
    expect(trace.kind).toBe('forced-claim')
    expect(trace.claim?.p).toBe(1)
  })

  it('must-declare: a window that can never close (§3.2 case 1) forces the least-bad claim', () => {
    // Every opponent of the turn-holder (team 0) is out of cards, so `decline` is MUST_DECLARE-
    // illegal. Seat 1's hand offers no certain set and every plan needs 4+ guesses, so no
    // ordinary declare branch fires and the forced claim carries the must-declare verdict.
    const view = mkView({
      seat: 1,
      hand: ['2C', '9C', '2D', '9D', '2H'],
      counts: [0, 5, 0, 6, 0, 7],
      turn: 1,
      log: [gs],
      config: us54Config,
      declareWindow: { option: 1, declined: 0 },
    })
    const { action, trace } = decideExplained(view, 'hard', 11)
    expect(action.type).toBe('claim')
    expect(trace.kind).toBe('must-declare')
    expect(trace.notes.join(' ')).toContain('MUST_DECLARE')
    expect(trace.claim).toBeDefined()
  })

  it('decline: nothing declarable, with the refusals listed', () => {
    const view = windowView({
      seat: 2,
      hand: ['2C', '9C', '3D', 'TH', 'KS', '8H', '5S', 'AD', '4C'],
      counts: [9, 9, 9, 9, 9, 9],
      turn: 4,
    })
    const { action, trace } = decideExplained(view, 'hard', 11)
    expect(action.type).toBe('decline')
    expect(trace.kind).toBe('decline')
    expect(trace.headline).toContain('Declined')
    // Both declare branches were weighed and turned down, and the pane can say why.
    const refusedKinds = trace.refused.map((r) => r.kind)
    expect(refusedKinds).toContain('certain-claim')
    expect(refusedKinds).toContain('ev-claim')
    // The window's next move is named: seat 4 holds the turn once it closes.
    expect(trace.headline).toContain('seat 4')
  })

  it('signalling-ask: a dead board spent on the most informative known miss', () => {
    // All three legal asks (7C at seats 1/3/5) are known misses — the viewer's own misses
    // cleared every opponent — and the filler misses leave no hit within the look-back. A
    // signalling style (Balanced) converts the dead turn into the "I hold LOW-C" constraint.
    const view = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '6C'],
      counts: [5, 8, 8, 8, 8, 8],
      log: [
        gs,
        ask(0, 1, '7C', false),
        ask(0, 3, '7C', false),
        ask(0, 5, '7C', false),
        ask(1, 2, 'AS', false),
        ask(3, 2, 'AH', false),
        ask(5, 2, 'AC', false),
        ask(1, 4, '2D', false),
        ask(3, 4, '2H', false),
        ask(5, 4, '2S', false),
      ],
    })
    const { action, trace } = decideExplained(view, STYLE_ROSTER.balanced, 7)
    expect(action.type).toBe('ask')
    if (action.type === 'ask') expect(action.card).toBe('7C')
    expect(trace.kind).toBe('signalling-ask')
    expect(trace.notes.join(' ')).toContain('LOW-C')
  })

  it('contained-pass: the Hoarder aims the concession, and the arithmetic rides along', () => {
    // contained.test.ts's spot with six filler misses: the measured hit rate is 1/3, the
    // break-even drops below the ordinary ask's 0.465, and the Hoarder's 1.33 appetite clears
    // the bar while Balanced's 1 does not.
    const spot = (fillers: number): SeatView =>
      mkView({
        seat: 0,
        hand: ['2C', '3C', '4C', '5C', '6C', '9D'],
        counts: [6, 20, 8, 5, 8, 2],
        turn: 0,
        log: [
          gs,
          ask(0, 1, '2C', true),
          ask(0, 3, '3C', true),
          ask(0, 5, '4C', true),
          ask(0, 1, '7C', false),
          ask(0, 3, '7C', false),
          ask(0, 5, '7C', false),
          ...([
            ask(1, 2, 'AS', false),
            ask(3, 2, 'AH', false),
            ask(5, 2, 'AC', false),
            ask(1, 4, '2D', false),
            ask(3, 4, '2H', false),
            ask(5, 4, '2S', false),
          ] as PublicEvent[]).slice(0, fillers),
        ],
        config: us54Config,
      })
    const hoarder = decideExplained(spot(6), STYLE_ROSTER.hoarder, 7)
    expect(hoarder.action).toEqual({ type: 'ask', seat: 0, target: 5, card: '7C' })
    expect(hoarder.trace.kind).toBe('contained-pass')
    // The plumbed PassValuation: 3 hits over 9 misses, and a genuine break-even threshold.
    expect(hoarder.trace.passValue?.E).toBeCloseTo(1 / 3, 12)
    expect(hoarder.trace.passValue?.threshold).toBeGreaterThan(0)
    expect(hoarder.trace.refused.map((r) => r.kind)).toContain('ranked-ask')
    expect(hoarder.trace.headline).toContain('LOW-C')
    // The trace states the same break-even the valuation derived: 0.538 for the 1.33 appetite.
    expect(hoarder.trace.notes.join(' ')).toContain('0.538')

    // Balanced keeps the material ask in the same position — and its trace says the pass was
    // considered and why it lost.
    const balanced = decideExplained(spot(6), STYLE_ROSTER.balanced, 7)
    expect(balanced.action).toEqual({ type: 'ask', seat: 0, target: 1, card: 'TD' })
    expect(balanced.trace.kind).toBe('ranked-ask')
    const refusedPass = balanced.trace.refused.find((r) => r.kind === 'contained-pass')
    expect(refusedPass).toBeDefined()
    expect(refusedPass?.reason).toContain('break-even')
  })

  it('ranked-ask: an ordinary us54 ask carries the top alternatives and a reasoned headline', () => {
    const view = mkView({
      seat: 0,
      hand: [...EIGHTS, '2C', '3C', '4C'],
      counts: [9, 9, 9, 9, 9, 9],
      turn: 0,
      log: [gs],
      config: us54Config,
    })
    const { action, trace } = decideExplained(view, 'hard', 5)
    expect(action.type).toBe('ask')
    expect(trace.kind).toBe('ranked-ask')
    expect(trace.headline).toMatch(/^Asked seat \d/)
    expect(trace.ranked).toBeDefined()
    expect(trace.ranked!.length).toBeGreaterThan(0)
    expect(trace.ranked!.length).toBeLessThanOrEqual(5)
    expect(trace.notes.length).toBeGreaterThan(0)
  })

  it('certain-hit: a publicly located card gets its own verdict', () => {
    // behavior.test.ts's forgetView: seat 1 publicly took 9H, so the full-knowledge tiers cash
    // the certain hit — and the trace labels it as riskless rather than as a ranked gamble.
    const view = mkView({
      seat: 0,
      hand: ['TH', '2C', '3C', '4C', '5C', '2D', '3D', '4D'],
      counts: [8, 9, 7, 8, 8, 8],
      log: [
        gs,
        ask(1, 2, '9H', true),
        ask(3, 2, '2S', false),
        ask(5, 2, '3S', false),
        ask(3, 4, '4S', false),
        ask(5, 4, '5S', false),
        ask(3, 2, '6S', false),
        ask(5, 0, '7S', false),
      ],
    })
    const { action, trace } = decideExplained(view, 'medium', 1)
    expect(action).toEqual({ type: 'ask', seat: 0, target: 1, card: '9H' })
    expect(trace.kind).toBe('certain-hit')
    expect(trace.headline).toContain('9♥')
  })

  it('pass and designate name the target and the reason for it', () => {
    const passView = mkView({ seat: 0, hand: [], counts: [0, 5, 3, 5, 2, 5], phase: 'awaitPass', log: [gs] })
    const p = decideExplained(passView, 'hard', 3)
    expect(p.action).toEqual({ type: 'pass', seat: 0, to: 2 })
    expect(p.trace.kind).toBe('pass')
    expect(p.trace.headline).toContain('seat 2')

    const desView = mkView({ seat: 0, hand: ['2C'], counts: [1, 4, 0, 6, 0, 5], phase: 'awaitDesignate', log: [gs] })
    const d = decideExplained(desView, 'hard', 3)
    expect(d.action).toEqual({ type: 'designate', seat: 0, to: 3 })
    expect(d.trace.kind).toBe('designate')
    expect(d.trace.headline).toContain('seat 3')
  })

  it('never throws on garbage, and says so in the trace', () => {
    const out = decideExplained(null as unknown as SeatView, 'hard', 1)
    expect(out.action).toEqual({ type: 'pass', seat: 0, to: 0 })
    expect(out.trace.kind).toBe('error-branch')
    expect(out.action).toEqual(decide(null as unknown as SeatView, 'hard', 1))
  })
})

/* ------------------------------------------------- 3. reading is not writing --- */

describe('no trace path writes to the view', () => {
  it(
    'decideExplained on a deep-frozen view: no throw, identical action AND identical trace',
    () => {
      const positions = collectPositions(60)
      for (let i = 0; i < positions.length; i++) {
        const state = positions[i]
        const seed = hashSeed(`explain-frozen-${i}`)()
        for (const diff of ['easy', 'medium', 'hard'] as const) {
          const frozen = deepFreeze(seatView(state, state.turn))
          const plain = seatView(state, state.turn)
          let fromFrozen: { action: GameAction; trace: DecisionTrace } | null = null
          expect(() => {
            fromFrozen = decideExplained(frozen, diff, seed)
          }).not.toThrow()
          // A swallowed mutation attempt would divert to the fallback and diverge from the
          // unfrozen run — equality of the whole ExplainedDecision proves the function (trace
          // included) never needed to write to its input.
          expect(fromFrozen).toEqual(decideExplained(plain, diff, seed))
          expect(fromFrozen!.action).toEqual(decide(plain, diff, seed))
        }
      }
    },
    120_000,
  )

  it('the same discipline on us54 window and contained-pass positions, across the roster', () => {
    const views: SeatView[] = [
      windowView({ seat: 0, hand: [...EIGHTS], counts: [6, 9, 9, 10, 10, 10], turn: 3 }),
      windowView({
        seat: 2,
        hand: ['2C', '9C', '3D', 'TH', 'KS', '8H', '5S', 'AD', '4C'],
        counts: [9, 9, 9, 9, 9, 9],
        turn: 4,
      }),
      mkView({
        seat: 0,
        hand: ['2C', '3C', '4C', '5C', '6C', '9D'],
        counts: [6, 20, 8, 5, 8, 2],
        turn: 0,
        log: [
          gs,
          ask(0, 1, '2C', true),
          ask(0, 3, '3C', true),
          ask(0, 5, '4C', true),
          ask(0, 1, '7C', false),
          ask(0, 3, '7C', false),
          ask(0, 5, '7C', false),
        ],
        config: us54Config,
      }),
    ]
    for (const [vi, view] of views.entries()) {
      for (const id of STYLE_IDS) {
        const seed = hashSeed(`explain-frozen-us54-${vi}-${id}`)()
        const frozen = deepFreeze(JSON.parse(JSON.stringify(view)) as SeatView)
        const out = decideExplained(frozen, STYLE_ROSTER[id], seed)
        expect(out, `${vi}/${id}`).toEqual(decideExplained(view, STYLE_ROSTER[id], seed))
        expect(out.action, `${vi}/${id}`).toEqual(decide(view, STYLE_ROSTER[id], seed))
      }
    }
  })
})
