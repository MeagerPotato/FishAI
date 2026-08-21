/**
 * The StyleParams refactor (STYLES.md §2) and its regression net.
 *
 * Three jobs, in order of importance:
 *
 *  1. **Nothing changed.** `decide(view, 'hard', seed)` must be the same action as
 *     `decide(view, { skill: SKILL_PRESETS.hard, style: STYLE_PRESETS.hard }, seed)` and as
 *     `decide(view, STYLE_PRESETS.hard, seed)`, for every tier, on every sampled position, under
 *     both rule sets. The tiers are now *presets over the vector* and nothing else.
 *  2. **The axes are orthogonal** (BOT_LAB.md §1.3): every style is playable at every skill, and
 *     the cross product stays legal and deterministic.
 *  3. **The knobs actually do something.** A parameter that is wired but inert is worse than an
 *     absent one — it makes the Phase-S1 sweep look like it explored a space it never entered.
 *     Every new `us54` knob gets a position where flipping it flips the decision.
 */
import { describe, expect, it } from 'vitest'
import {
  BASELINE_ASK_WEIGHTS,
  POLICY_CONSTANTS,
  SKILL_PRESETS,
  STYLE_PRESETS,
  allBooks,
  buildKnowledge,
  clinchTarget,
  decide,
  defaultConfig,
  hashSeed,
  rankAsksWith,
  reduce,
  resolvePolicy,
  seatView,
  us54Config,
  validateStyle,
} from '../../lib/engine/index.ts'
import type {
  BookId,
  BotDifficulty,
  BotPolicy,
  Card,
  Seat,
  SeatView,
  StyleParams,
} from '../../lib/engine/index.ts'
import { ask, collectBotViews, collectPositions, gs, mkView } from './util.ts'

const TIERS: BotDifficulty[] = ['easy', 'medium', 'hard']

/* ------------------------------------------------------- the vector itself --- */

describe('StyleParams presets', () => {
  it('every preset is a structurally sound style', () => {
    for (const t of TIERS) expect(validateStyle(STYLE_PRESETS[t]), t).toEqual([])
  })

  it('every preset keeps certaintyBonus >= 20 (STYLES.md §2)', () => {
    for (const t of TIERS) expect(STYLE_PRESETS[t].certaintyBonus, t).toBeGreaterThanOrEqual(20)
  })

  it('rejects a style that would rank an uncertain ask above a certain hit', () => {
    const broken: StyleParams = { ...STYLE_PRESETS.hard, certaintyBonus: 5 }
    expect(validateStyle(broken)).toEqual(['certaintyBonus 5 < 20'])
  })

  it('flags out-of-range knobs on the new us54 axes', () => {
    const broken: StyleParams = {
      ...STYLE_PRESETS.hard,
      declareEagerness: 1.5,
      clinchAggression: -1,
      declareThreshold: 3,
    }
    expect(validateStyle(broken).sort()).toEqual(
      ['clinchAggression -1 outside 0..1', 'declareEagerness 1.5 outside 0..1', 'declareThreshold 3 outside 0..1'].sort(),
    )
  })

  it('the hard preset is the tuned baseline, value for value', () => {
    const h = STYLE_PRESETS.hard
    expect({
      wHit: h.wHit,
      wProgress: h.wProgress,
      wNarrow: h.wNarrow,
      certaintyBonus: h.certaintyBonus,
      declareThreshold: h.declareThreshold,
      declareThresholdStalled: h.declareThresholdStalled,
      declareMaxUncertain: h.declareMaxUncertain,
      leakEpsilon: h.leakEpsilon,
      leakThreshold: h.leakThreshold,
      signalling: h.signalling,
      missTarget: h.missTarget,
      passTarget: h.passTarget,
    }).toEqual({
      wHit: 70,
      wProgress: 18,
      wNarrow: 12,
      certaintyBonus: 20,
      declareThreshold: 0.8,
      declareThresholdStalled: 0.5,
      declareMaxUncertain: 1,
      leakEpsilon: 0.5,
      leakThreshold: 4,
      signalling: true,
      missTarget: 'fewest',
      passTarget: 'most',
    })
  })

  it('the ranker default and the exported baseline weights are the same numbers', () => {
    // knowledge.ts holds its own copy so the inference layer never imports the policy layer;
    // this is the pin that keeps the two from drifting apart.
    const view = mkView({
      seat: 0,
      hand: ['2C', '3C', '4C', '5C', '9D', 'TD', 'JD', 'QD'],
      counts: [8, 8, 8, 8, 8, 8],
      log: [gs, ask(1, 0, '2C', false)],
    })
    const k = buildKnowledge(view)
    expect(rankAsksWith(view, k, BASELINE_ASK_WEIGHTS)).toEqual(rankAsksWith(view, k))
  })

  it('resolvePolicy maps tiers to preset pairs, a bare style to full strength, and junk to medium', () => {
    expect(resolvePolicy('hard')).toEqual({ skill: SKILL_PRESETS.hard, style: STYLE_PRESETS.hard })
    expect(resolvePolicy(STYLE_PRESETS.easy)).toEqual({
      // STYLES.md §2: "every style shares one identical, full-strength inference engine".
      skill: SKILL_PRESETS.hard,
      style: STYLE_PRESETS.easy,
    })
    expect(resolvePolicy('nonsense' as BotDifficulty)).toEqual({
      skill: SKILL_PRESETS.medium,
      style: STYLE_PRESETS.medium,
    })
  })

  it('the stall thresholds stay global, not per-style (STYLES.md §3.1)', () => {
    expect(POLICY_CONSTANTS.stall.ownTurn).toEqual([36, 120, 400])
    expect(POLICY_CONSTANTS.stall.anyTime).toEqual([12, 24, 60])
    for (const t of TIERS) {
      expect(Object.keys(STYLE_PRESETS[t]), t).not.toContain('stall')
    }
  })
})

/* ------------------------------------------------------------- regression --- */

describe('the tiers are presets over the vector — decisions are unchanged', () => {
  it(
    'tier name, explicit skill x style pair, and (for hard) a bare style all agree on 400 positions',
    () => {
      const positions = collectPositions(400)
      for (let i = 0; i < positions.length; i++) {
        const state = positions[i]
        const view = seatView(state, state.turn)
        const seed = hashSeed(`style-eq-${i}`)()
        for (const t of TIERS) {
          const byName = decide(view, t, seed)
          const pair: BotPolicy = { skill: SKILL_PRESETS[t], style: STYLE_PRESETS[t] }
          expect(decide(view, pair, seed), `${t}/${i}`).toEqual(byName)
        }
        // A bare style is full-strength inference, which is exactly the `hard` skill.
        expect(decide(view, STYLE_PRESETS.hard, seed), `hard-bare/${i}`).toEqual(
          decide(view, 'hard', seed),
        )
      }
    },
    180_000,
  )

  it(
    'and under us54, across the declare window and the ask-only states alike',
    () => {
      // `collectPositions` is pagat48-only, and the RULES_US54.md §3 window is where the tiers
      // differ most, so the us54 half of the regression is driven off real bot games.
      const views = [...collectBotViews(6, us54Config), ...collectBotViews(4)]
      expect(views.length).toBeGreaterThan(500)
      let windows = 0
      for (let i = 0; i < views.length; i++) {
        const { view, seed } = views[i]
        if (view.declareWindow) windows++
        for (const t of TIERS) {
          const pair: BotPolicy = { skill: SKILL_PRESETS[t], style: STYLE_PRESETS[t] }
          expect(decide(view, pair, seed), `${t}/${i}`).toEqual(decide(view, t, seed))
        }
      }
      expect(windows).toBeGreaterThan(100)
    },
    180_000,
  )
})

/* ---------------------------------------------------------- orthogonality --- */

/** Probe styles spanning the STYLES.md §3 roster's defining settings. */
const PROBES: StyleParams[] = [
  { ...STYLE_PRESETS.hard, id: 'blitz', wHit: 90, wProgress: 30, leakEpsilon: 0, signalling: false, declareThreshold: 0.7 },
  { ...STYLE_PRESETS.hard, id: 'punter', gambleBonus: 25, declareThreshold: 0.55, declareMaxUncertain: 2 },
  { ...STYLE_PRESETS.hard, id: 'banker', declareOnlyWhenCertain: true, minHitP: 0.25, declareEagerness: 0.2 },
  { ...STYLE_PRESETS.hard, id: 'turtle', declareOnlyOwnHand: true, minHitP: 0.4, signalling: false, foreignDeclare: false },
  { ...STYLE_PRESETS.hard, id: 'hoarder', hoardBooks: 3, minHandSize: 2, declareThreshold: 0.95, declareEagerness: 0.1 },
  { ...STYLE_PRESETS.hard, id: 'scout', wNarrow: 40, wHit: 55, declareOnlyWhenCertain: true },
  { ...STYLE_PRESETS.hard, id: 'ghost', leakEpsilon: 6, leakThreshold: 3, signalling: false },
  { ...STYLE_PRESETS.hard, id: 'archivist', foreignDeclare: true, foreignDeclareThreshold: 0.9, wNarrow: 30, declareEagerness: 0.7 },
]

describe('style x skill is a real cross product (BOT_LAB.md §1.3)', () => {
  it('every probe style is structurally sound', () => {
    for (const s of PROBES) expect(validateStyle(s), s.id).toEqual([])
  })

  it(
    'every style at every skill stays legal and deterministic over 150 positions',
    () => {
      const positions = collectPositions(150)
      for (let i = 0; i < positions.length; i++) {
        const state = positions[i]
        const view = seatView(state, state.turn)
        const seed = hashSeed(`style-cross-${i}`)()
        for (const style of PROBES) {
          for (const t of TIERS) {
            const pol: BotPolicy = { skill: SKILL_PRESETS[t], style }
            const a = decide(view, pol, seed)
            expect(decide(view, pol, seed), `${style.id}/${t}/${i}`).toEqual(a)
            const r = reduce(state, a)
            if (!r.ok) {
              throw new Error(`${style.id}/${t}/${i} (${state.phase}): ${r.error.code} ${JSON.stringify(a)}`)
            }
          }
        }
      }
    },
    300_000,
  )

  it(
    'each probe style actually diverges from the baseline somewhere (no inert vector)',
    () => {
      // Real bot-game positions under BOTH rule sets, plus the crafted window positions below.
      // A parameter that is wired but never reachable is worse than an absent one: it makes the
      // Phase-S1 sweep look like it explored a space it never entered.
      const probeViews: { view: SeatView; seed: number }[] = [
        ...collectBotViews(10),
        ...collectBotViews(5, us54Config),
        // Hoarder and the eagerness knob only bite on a *speculative* declare, which real hard
        // games reach too rarely to rely on; these are that spot, by construction.
        { view: evWindowView(), seed: 5 },
        { view: evWindowView({ declined: 5 }), seed: 5 },
      ]
      const diverged = new Map<string, number>()
      for (let i = 0; i < probeViews.length; i++) {
        const { view, seed } = probeViews[i]
        const base = JSON.stringify(decide(view, 'hard', seed))
        for (const style of PROBES) {
          const a = JSON.stringify(decide(view, { skill: SKILL_PRESETS.hard, style }, seed))
          if (a !== base) diverged.set(style.id, (diverged.get(style.id) ?? 0) + 1)
        }
      }
      for (const style of PROBES) {
        expect(
          diverged.get(style.id) ?? 0,
          `${style.id} never diverged from baseline`,
        ).toBeGreaterThan(0)
      }
    },
    300_000,
  )
})

/* ------------------------------------------------------------ ask scoring --- */

describe('the ask-score weights are the style vector', () => {
  /** Seat 0 holds five of HIGH-S, so an ask for QS would COMPLETE the set. */
  function completingView(): SeatView {
    return mkView({
      seat: 0,
      hand: ['9S', 'TS', 'JS', 'KS', 'AS', '2C', '3C', '4C'],
      counts: [8, 8, 8, 8, 8, 8],
      log: [gs],
    })
  }

  it('gambleBonus lifts exactly the asks that would complete a set', () => {
    const view = completingView()
    const k = buildKnowledge(view)
    const plain = rankAsksWith(view, k, BASELINE_ASK_WEIGHTS)
    const punter = rankAsksWith(view, k, { ...BASELINE_ASK_WEIGHTS, gambleBonus: 25 })
    const byKey = new Map(plain.map((r) => [`${r.card}@${r.target}`, r.score]))
    let lifted = 0
    for (const r of punter) {
      const before = byKey.get(`${r.card}@${r.target}`)
      expect(before, `${r.card}@${r.target}`).toBeDefined()
      const delta = Math.round((r.score - (before ?? 0)) * 100) / 100
      // HIGH-S is the only set the team certainly holds 5 of; everything else is unmoved.
      if (r.card === 'QS') {
        expect(delta, r.card).toBe(25)
        lifted++
      } else {
        expect(delta, r.card).toBe(0)
      }
    }
    expect(lifted).toBeGreaterThan(0)
  })

  it('wNarrow vs wHit reorders the ranking (Scout vs Blitz)', () => {
    const view = completingView()
    const k = buildKnowledge(view)
    const scout = rankAsksWith(view, k, { ...BASELINE_ASK_WEIGHTS, wNarrow: 40, wHit: 55 })
    const blitz = rankAsksWith(view, k, { ...BASELINE_ASK_WEIGHTS, wHit: 90, wProgress: 30 })
    expect(scout.map((r) => r.score)).not.toEqual(blitz.map((r) => r.score))
  })

  it('every ranked ask carries the probability its score was built from', () => {
    const view = completingView()
    const k = buildKnowledge(view)
    for (const r of rankAsksWith(view, k)) {
      expect(r.p).toBeGreaterThanOrEqual(0)
      expect(r.p).toBeLessThanOrEqual(1)
    }
  })
})

/* --------------------------------------------------- the us54 declare knobs --- */

/**
 * A `us54` window position engineered so exactly one speculative declare is on the table.
 *
 * Four LOW sets are resolved (24 cards gone, 30 live). Seat 0 holds five of EIGHTS; `XB` is
 * excluded from seat 0 (own hand), from seats 1 and 5 (out of cards) and from seat 3 (it missed
 * an ask for it), leaving candidates {2, 4} — both teammates, which is the EV declare's trigger.
 * Free slots 21 vs 1 put `p(XB@2)` at 21/22 ≈ 0.955, comfortably over the 0.8 baseline bar.
 *
 * The turn sits with seat 3, which is where the miss put it, so the window can close normally
 * and neither `windowCannotClose` nor `isDeepStalled` forces anyone's hand.
 */
function evWindowView(opts: { outcome?: 'team0' | 'team1'; declined?: number } = {}): SeatView {
  const books: SeatView['books'] = {}
  const resolved: BookId[] = ['LOW-C', 'LOW-D', 'LOW-H', 'LOW-S']
  for (const b of resolved) {
    const empty = {} as Record<Card, Seat>
    books[b] = {
      book: b,
      outcome: opts.outcome ?? 'team0',
      claimer: 0,
      assignments: empty,
      actualHolders: empty,
    }
  }
  return mkView({
    seat: 0,
    hand: ['8C', '8D', '8H', '8S', 'XR'],
    counts: [5, 0, 21, 3, 1, 0],
    turn: 3,
    books,
    log: [gs, ask(0, 3, 'XB', false)],
    config: us54Config,
    declareWindow: { option: 0, declined: opts.declined ?? 0 },
  })
}

const HARD_AT_FULL = (style: StyleParams): BotPolicy => ({ skill: SKILL_PRESETS.hard, style })

describe('us54 declare-window knobs', () => {
  it('the crafted position is an EV declare for the baseline style', () => {
    const a = decide(evWindowView(), 'hard', 5)
    expect(a.type).toBe('claim')
    if (a.type !== 'claim') return
    expect(a.book).toBe('EIGHTS')
    expect(a.assignments['XB']).toBe(2) // the candidate teammate with the most free slots
    for (const c of ['8C', '8D', '8H', '8S', 'XR'] as Card[]) expect(a.assignments[c]).toBe(0)
  })

  it('declareEagerness 0 waits for the option to travel the whole cycle; 1 fires at once', () => {
    const patient: StyleParams = { ...STYLE_PRESETS.hard, declareEagerness: 0 }
    expect(decide(evWindowView({ declined: 0 }), HARD_AT_FULL(patient), 5).type).toBe('decline')
    // The window offers the option to six seats, so `declined` runs 0..5; at 5 even the most
    // patient style has run out of window to wait in.
    expect(decide(evWindowView({ declined: 5 }), HARD_AT_FULL(patient), 5).type).toBe('claim')
    expect(decide(evWindowView({ declined: 0 }), 'hard', 5).type).toBe('claim')
  })

  it('declareOnlyWhenCertain refuses the speculative declare outright', () => {
    const banker: StyleParams = { ...STYLE_PRESETS.hard, declareOnlyWhenCertain: true }
    expect(decide(evWindowView(), HARD_AT_FULL(banker), 5).type).toBe('decline')
  })

  it('hoardBooks and minHandSize each veto a speculative declare that would spend the hand', () => {
    // Declaring EIGHTS spends all five cards seat 0 holds: 0 cards and 0 ask-licences left.
    const hoarder: StyleParams = { ...STYLE_PRESETS.hard, hoardBooks: 1 }
    const minimum: StyleParams = { ...STYLE_PRESETS.hard, minHandSize: 1 }
    expect(decide(evWindowView(), HARD_AT_FULL(hoarder), 5).type).toBe('decline')
    expect(decide(evWindowView(), HARD_AT_FULL(minimum), 5).type).toBe('decline')
  })

  it('clinchAggression is neutral at 0.5 and cheapens the closing declare above it', () => {
    // Own team already holds 4 of the 5 sets it needs, so this declare would end the game.
    const [own] = [4]
    expect(clinchTarget(us54Config) - 1).toBe(own)
    const cautious: StyleParams = { ...STYLE_PRESETS.hard, declareThreshold: 0.99 }
    const closer: StyleParams = { ...cautious, clinchAggression: 1 }
    expect(decide(evWindowView({ outcome: 'team0' }), HARD_AT_FULL(cautious), 5).type).toBe('decline')
    expect(decide(evWindowView({ outcome: 'team0' }), HARD_AT_FULL(closer), 5).type).toBe('claim')
  })

  it('denialWeight is neutral at 0.5 and cheapens a declare that denies the opponent their 5th', () => {
    const cautious: StyleParams = { ...STYLE_PRESETS.hard, declareThreshold: 0.99 }
    const denier: StyleParams = { ...cautious, denialWeight: 1 }
    expect(decide(evWindowView({ outcome: 'team1' }), HARD_AT_FULL(cautious), 5).type).toBe('decline')
    expect(decide(evWindowView({ outcome: 'team1' }), HARD_AT_FULL(denier), 5).type).toBe('claim')
  })

  it('neither clinch knob does anything under pagat48, which has no clinch', () => {
    // Same style vector, 48-card rule set: `winCondition` is 'allResolved', so the scaling is
    // never consulted and the two styles must agree everywhere.
    const closer: StyleParams = { ...STYLE_PRESETS.hard, clinchAggression: 1, denialWeight: 1 }
    const positions = collectPositions(120)
    for (let i = 0; i < positions.length; i++) {
      const view = seatView(positions[i], positions[i].turn)
      expect(view.config).toEqual(defaultConfig)
      const seed = hashSeed(`clinch-noop-${i}`)()
      expect(decide(view, HARD_AT_FULL(closer), seed), `${i}`).toEqual(decide(view, 'hard', seed))
    }
  }, 120_000)
})

describe('foreignDeclare — the Archivist axis (STYLES.md §1.3)', () => {
  /**
   * Seat 0 holds **no card at all**, yet can prove the whole EIGHTS set sits with teammate
   * seat 2 — the exact strategy the project owner called out and STYLES.md §1.3 built the
   * Archivist around:
   *
   * > *"They may also declare for their teammates even if they do not hold a card from the
   * > half-suit, which gives importance to the players who choose to memorize half-suits they
   * > do not own."*
   *
   * Seven sets are resolved, leaving EIGHTS and HIGH-S (12 cards) between seats 1 and 2. Seat 2
   * hit `8D 8H 8S XR XB` off seat 1 in turn, which fixes those five outright; and the *first*
   * of those asks carries the RULES.md row 6 constraint "seat 2 was dealt at least one of
   * `{8C, 8H, 8S, XR, XB}`", whose four other disjuncts are now proven dealt to seat 1 — so
   * `8C` is forced onto seat 2 as well. Counting then pins HIGH-S on seat 1.
   *
   * The window can close normally here (seat 2 holds the turn and its opponent seat 1 has
   * cards), so nothing *forces* a declare: refusing is a live option, which is what makes this
   * a clean test of the style knob rather than of the RULES_US54.md §3.2 fallback.
   */
  function foreignView(): SeatView {
    const books: SeatView['books'] = {}
    for (const b of allBooks(us54Config)) {
      if (b === 'EIGHTS' || b === 'HIGH-S') continue
      const empty = {} as Record<Card, Seat>
      books[b] = { book: b, outcome: 'team0', claimer: 0, assignments: empty, actualHolders: empty }
    }
    return mkView({
      seat: 0,
      hand: [],
      counts: [0, 6, 6, 0, 0, 0],
      turn: 2,
      books,
      log: [
        gs,
        ask(2, 1, '8D', true),
        ask(2, 1, '8H', true),
        ask(2, 1, '8S', true),
        ask(2, 1, 'XR', true),
        ask(2, 1, 'XB', true),
      ],
      config: us54Config,
      declareWindow: { option: 0, declined: 0 },
    })
  }

  it('a foreign-declaring style banks a set it holds no card of', () => {
    const a = decide(foreignView(), 'hard', 17)
    expect(a.type).toBe('claim')
    if (a.type !== 'claim') return
    expect(a.book).toBe('EIGHTS')
    expect(Object.values(a.assignments).every((s) => s === 2)).toBe(true)
  })

  it('foreignDeclare false leaves it on the table', () => {
    const turtle: StyleParams = { ...STYLE_PRESETS.hard, foreignDeclare: false }
    expect(decide(foreignView(), HARD_AT_FULL(turtle), 17).type).toBe('decline')
  })

  it('foreignDeclareThreshold raises the bar only for foreign sets', () => {
    // In `evWindowView` seat 0 DOES hold five of EIGHTS, so the set is not foreign and an
    // Archivist's higher foreign bar must not touch it.
    const archivist: StyleParams = { ...STYLE_PRESETS.hard, foreignDeclareThreshold: 0.99 }
    expect(decide(evWindowView(), HARD_AT_FULL(archivist), 5).type).toBe('claim')
  })
})

/* --------------------------------------------- style knobs under pagat48 --- */

describe('declare-policy knobs under the 48-card default', () => {
  /**
   * The `behavior.test.ts` LOW-H position at its certain stage: every holder of the set is
   * known and on seat 0's team, so the baseline banks it on its own turn.
   */
  function certainView(): SeatView {
    return mkView({
      seat: 0,
      hand: ['2H', '3H', '4H', '5H', '2C', '3C', '4C', '5C'],
      counts: [8, 8, 4, 8, 4, 8],
      turn: 0,
      log: [gs, ask(2, 5, '7H', false), ask(4, 1, '6H', false)],
    })
  }

  it('the baseline claims the certain set', () => {
    const a = decide(certainView(), 'medium', 42)
    expect(a.type).toBe('claim')
    if (a.type === 'claim') expect(a.book).toBe('LOW-H')
  })

  it('declareOnlyOwnHand refuses it — seat 0 does not hold all six — and asks instead', () => {
    const turtle: StyleParams = { ...STYLE_PRESETS.medium, declareOnlyOwnHand: true }
    expect(decide(certainView(), HARD_AT_FULL(turtle), 42).type).toBe('ask')
  })

  it('passTarget picks the direction; the easy skill ignores counts entirely', () => {
    const passView = mkView({
      seat: 2,
      hand: [],
      counts: [3, 8, 0, 8, 7, 8],
      turn: 2,
      phase: 'awaitPass',
      log: [gs],
    })
    // Teammates of seat 2 are seats 0 and 4, holding 3 and 7.
    expect(decide(passView, 'medium', 7)).toEqual({ type: 'pass', seat: 2, to: 4 })
    const fewest: StyleParams = { ...STYLE_PRESETS.medium, passTarget: 'fewest' }
    expect(decide(passView, HARD_AT_FULL(fewest), 7)).toEqual({ type: 'pass', seat: 2, to: 0 })
    // The easy SKILL has no count reasoning, so it takes the first candidate whatever the style.
    expect(decide(passView, { skill: SKILL_PRESETS.easy, style: fewest }, 7)).toEqual({
      type: 'pass',
      seat: 2,
      to: 0,
    })
    expect(decide(passView, 'easy', 7)).toEqual({ type: 'pass', seat: 2, to: 0 })
  })
})
