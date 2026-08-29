/**
 * adaptive.test.ts — FishAI v1.0: the adaptive policy is legal-by-construction, deterministic,
 * and honest about what the measured counter table makes of it.
 *
 * The load-bearing test here is the DEGENERACY PIN. The committed counter table (matrix v2,
 * 36 cells x 4,300 pairs) has Punter as the argmax of `P[.][s]` for every column `s`, and the
 * adaptive expectation is linear in the opponent posterior — so a warm adaptive seat provably
 * chooses Punter under EVERY belief, oracle or classified. That is a measured *result*, not an
 * assumption: the tests below re-derive the best response from the table (`brAgainst`) rather
 * than hard-coding 'punter', assert the two agree, and separately assert the punter row clears
 * the balanced row by more than the default anchor bias — the arithmetic fact that makes the
 * degeneracy total. A future counter table with an intransitive cycle changes the *expected
 * values* of these assertions, never the mechanism they exercise.
 *
 * The rest is the same discipline every policy addition pays: a legality fuzz in the
 * roster-fuzz shape (0 illegal, 0 capped, invariants clean, every game a clinch), seeded
 * determinism, the stateless phase quantisation (no mid-phase flips; same public information
 * => same read at every seat of a team), the warmup gate on the TRUNCATED length, the
 * decideExplained read lines, and `resolvePolicy` refusing the shape it cannot resolve.
 */
import { describe, expect, it } from 'vitest'
import {
  ADAPTIVE_DEFAULTS,
  ADAPTIVE_PHASE_EVENTS,
  COUNTER_TABLE,
  SKILL_PRESETS,
  STYLE_IDS,
  STYLE_ROSTER,
  allBooks,
  checkInvariants,
  chooseStyle,
  clinchTarget,
  decide,
  decideExplained,
  hashSeed,
  isAdaptiveSpec,
  legalActionsSummary,
  newGame,
  reduce,
  resolvePolicy,
  seatTeam,
  seatView,
  us54Config,
} from '../../lib/engine/index.ts'
import type {
  AdaptiveSpec,
  GameAction,
  GameState,
  PolicySpec,
  Seat,
  SeatView,
  StyleId,
} from '../../lib/engine/index.ts'
import { deepFreeze } from '../engine/util.ts'
import { collectBotViews } from './util.ts'

const ADAPTIVE: AdaptiveSpec = Object.freeze({ adaptive: true })
const STEP_CAP = 5000
const TARGET = clinchTarget(us54Config)
const BOOKS = allBooks(us54Config)

/** argmax_i P[i][j] against opponent column `j`, ties to the earlier row — the table's own BR. */
function brAgainst(j: number): StyleId {
  let best = 0
  for (let i = 1; i < COUNTER_TABLE.styles.length; i++) {
    if (COUNTER_TABLE.p[i][j] > COUNTER_TABLE.p[best][j]) best = i
  }
  return COUNTER_TABLE.styles[best]
}

/**
 * One us54 game under a per-seat policy map — the roster-fuzz loop, with per-seat specs.
 * Throws on the first illegal action or invariant violation, so a failure names its step.
 */
function playSeats(
  seed: string,
  specFor: (seat: Seat) => PolicySpec,
  startSeat: Seat,
  onStep?: (view: SeatView, spec: PolicySpec, actionSeed: number, action: GameAction, step: number) => void,
): { state: GameState; actions: GameAction[] } {
  let s = newGame(seed, us54Config, startSeat)
  const actions: GameAction[] = []
  let steps = 0
  while (s.phase !== 'finished') {
    if (steps >= STEP_CAP) throw new Error(`${seed}: hit the ${STEP_CAP}-step cap`)
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const spec = specFor(seat)
    const actionSeed = hashSeed(`${seed}:${s.moveIndex}`)()
    const action = decide(view, spec, actionSeed)
    if (onStep) onStep(view, spec, actionSeed, action, steps)
    actions.push(action)
    const r = reduce(s, action)
    if (!r.ok) throw new Error(`${seed} step ${steps}: ${r.error.code} ${JSON.stringify(action)}`)
    s = r.state
    steps++
    const violations = checkInvariants(s)
    if (violations.length > 0) throw new Error(`${seed} step ${steps}: ${violations.join(' | ')}`)
  }
  return { state: s, actions }
}

/** The roster-fuzz end-of-game gates: a clinch at exactly TARGET, no tie, no void. */
function assertCleanFinish(state: GameState, label: string): void {
  let a = 0
  let b = 0
  let voids = 0
  for (const bk of BOOKS) {
    const o = state.books[bk]?.outcome
    if (o === 'team0') a++
    else if (o === 'team1') b++
    else if (o === 'void') voids++
  }
  const over = state.log[state.log.length - 1]
  expect(over.type, `${label}: last event`).toBe('game_over')
  if (over.type === 'game_over') expect(over.winner, `${label}: tie`).not.toBe('tie')
  expect(voids, `${label}: void sets`).toBe(0)
  expect(Math.max(a, b), `${label}: clinch at exactly ${TARGET}`).toBe(TARGET)
}

/** Shared position source: every acting seat's view along seeded hard-tier us54 games. */
const VIEWS = collectBotViews(2, us54Config)

function viewWithEvents(min: number, max: number): { view: SeatView; state: GameState; seed: number } {
  const found = VIEWS.find((v) => v.view.log.length >= min && v.view.log.length < max)
  if (!found) throw new Error(`no collected view with ${min} <= events < ${max}`)
  return found
}

describe('counter-table sanity', () => {
  it('rows/columns are exactly the roster, in STYLE_IDS order', () => {
    expect([...COUNTER_TABLE.styles]).toEqual([...STYLE_IDS])
    expect(COUNTER_TABLE.p.length).toBe(STYLE_IDS.length)
    expect(COUNTER_TABLE.se.length).toBe(STYLE_IDS.length)
    for (const row of COUNTER_TABLE.p) expect(row.length).toBe(STYLE_IDS.length)
    for (const row of COUNTER_TABLE.se) expect(row.length).toBe(STYLE_IDS.length)
  })

  it('p is antisymmetric about 0.5 with an exact 0.5 diagonal; se is symmetric with a 0 diagonal', () => {
    const n = COUNTER_TABLE.styles.length
    for (let i = 0; i < n; i++) {
      expect(COUNTER_TABLE.p[i][i]).toBe(0.5)
      expect(COUNTER_TABLE.se[i][i]).toBe(0)
      for (let j = 0; j < n; j++) {
        expect(COUNTER_TABLE.p[i][j] + COUNTER_TABLE.p[j][i]).toBeCloseTo(1, 6)
        expect(COUNTER_TABLE.se[i][j]).toBe(COUNTER_TABLE.se[j][i])
        expect(COUNTER_TABLE.p[i][j]).toBeGreaterThan(0)
        expect(COUNTER_TABLE.p[i][j]).toBeLessThan(1)
      }
    }
  })

  it('carries its provenance', () => {
    expect(COUNTER_TABLE.provenance.recordsDigest.length).toBeGreaterThan(0)
    expect(COUNTER_TABLE.provenance.pairsPerCell).toBe(4300)
  })
})

describe('the measured degeneracy: warm best-response is always Punter', () => {
  it('punter is the argmax of P[.][s] for EVERY opponent style, by margin over the biased anchor', () => {
    const punter = COUNTER_TABLE.styles.indexOf('punter')
    const anchor = COUNTER_TABLE.styles.indexOf(ADAPTIVE_DEFAULTS.anchor)
    for (let j = 0; j < COUNTER_TABLE.styles.length; j++) {
      expect(brAgainst(j), `BR(${COUNTER_TABLE.styles[j]})`).toBe('punter')
      // The anchor bias cannot rescue another choice: the punter row clears even the
      // margin-boosted anchor row in every column. This is the arithmetic that makes the
      // degeneracy total rather than merely typical.
      expect(COUNTER_TABLE.p[punter][j]).toBeGreaterThan(
        COUNTER_TABLE.p[anchor][j] + ADAPTIVE_DEFAULTS.switchMargin,
      )
    }
  })

  it('a warm adaptive seat under an oracle chooses the table BR — punter — for every opponent style', () => {
    const { view } = viewWithEvents(90, 10_000)
    for (let j = 0; j < COUNTER_TABLE.styles.length; j++) {
      const s = COUNTER_TABLE.styles[j]
      const spec: AdaptiveSpec = { adaptive: true, oracleStyles: [s, s, s, s, s, s] }
      const choice = chooseStyle(view, spec)
      expect(choice.style, `oracle ${s}`).toBe(brAgainst(j))
      expect(choice.style, `oracle ${s} (the measured finding)`).toBe('punter')
      // The expectation really is the table column (point-mass posterior), bias included.
      const punter = COUNTER_TABLE.styles.indexOf('punter')
      const anchorIdx = COUNTER_TABLE.styles.indexOf(ADAPTIVE_DEFAULTS.anchor)
      expect(choice.expected.punter).toBeCloseTo(COUNTER_TABLE.p[punter][j], 12)
      expect(choice.expected[ADAPTIVE_DEFAULTS.anchor]).toBeCloseTo(
        COUNTER_TABLE.p[anchorIdx][j] + ADAPTIVE_DEFAULTS.switchMargin,
        12,
      )
      // The reads are the three opposing seats, at full oracle confidence.
      expect(choice.reads.length).toBe(3)
      for (const r of choice.reads) {
        expect(seatTeam(r.seat)).not.toBe(seatTeam(view.seat))
        expect(r.top).toBe(s)
        expect(r.confidence).toBe(1)
      }
    }
  })

  it('a warm adaptive seat under CLASSIFIER posteriors chooses punter too (dominance covers every belief)', () => {
    // Ten warm views spread across the collected games; dominance makes the choice belief-free,
    // so any warm view must land on punter, whatever the classifier read into the opponents.
    const warm = VIEWS.filter((v) => v.view.log.length >= 60)
    expect(warm.length).toBeGreaterThanOrEqual(10)
    const step = Math.max(1, Math.floor(warm.length / 10))
    for (let i = 0; i < warm.length; i += step) {
      const choice = chooseStyle(warm[i].view, ADAPTIVE)
      expect(choice.style).toBe('punter')
    }
  })

  it('warm at zero evidence (warmupEvents 0, uniform posterior) still chooses punter', () => {
    const { view } = viewWithEvents(1, 30) // phase 0: the posterior is evaluated on an empty log
    const choice = chooseStyle(view, { adaptive: true, warmupEvents: 0 })
    expect(choice.style).toBe('punter')
    expect(choice.switched).toBe(false) // phase 0 has no previous phase to have switched off
  })
})

describe('warmup and phase quantisation (stateless hysteresis)', () => {
  it('below warmupEvents the anchor plays — default and custom', () => {
    const { view } = viewWithEvents(1, 30)
    expect(chooseStyle(view, ADAPTIVE).style).toBe(ADAPTIVE_DEFAULTS.anchor)
    expect(chooseStyle(view, { adaptive: true, anchor: 'turtle' }).style).toBe('turtle')
  })

  it('the warmup gate reads the TRUNCATED length: 40-59 raw events still play the anchor', () => {
    // floor(events/30)*30 = 30 < warmupEvents 40 for every view in this band, so the whole
    // phase is warmup even though the raw log has passed 40 — the documented consequence of
    // making the entire choice a function of the phase (no anchor->warm flip mid-phase).
    const { view } = viewWithEvents(40, 60)
    expect(chooseStyle(view, ADAPTIVE).style).toBe(ADAPTIVE_DEFAULTS.anchor)
  })

  it('the first warm phase reports switched=true (off the warmup anchor); later phases do not', () => {
    const s: StyleId = 'turtle'
    const spec: AdaptiveSpec = { adaptive: true, oracleStyles: [s, s, s, s, s, s] }
    // cut = 60, previous cut = 30 (warmup anchor) -> punter vs balanced -> switched.
    const first = viewWithEvents(60, 90)
    expect(chooseStyle(first.view, spec)).toMatchObject({ style: 'punter', switched: true })
    // cut >= 90, previous cut >= 60 (also warm, same oracle) -> punter vs punter -> stable.
    const later = viewWithEvents(90, 10_000)
    expect(chooseStyle(later.view, spec)).toMatchObject({ style: 'punter', switched: false })
  })

  it('the choice is constant within an events-phase window, evaluated on truncated views', () => {
    const { state } = playSeats('adaptive-phase-0', () => ADAPTIVE, 0)
    const base = seatView(state, 0)
    expect(base.log.length).toBeGreaterThanOrEqual(90)
    const lo = 2 * ADAPTIVE_PHASE_EVENTS // the [60, 90) phase: warm under the defaults
    const first = chooseStyle({ ...base, log: base.log.slice(0, lo) }, ADAPTIVE)
    for (let e = lo + 1; e < lo + ADAPTIVE_PHASE_EVENTS && e <= base.log.length; e++) {
      const c = chooseStyle({ ...base, log: base.log.slice(0, e) }, ADAPTIVE)
      expect(c.style, `events=${e}`).toBe(first.style)
      expect(c.switched, `events=${e}`).toBe(first.switched)
    }
  })

  it('two seats of one team with the same public log reach the same read and the same choice', () => {
    const { state } = playSeats('adaptive-phase-1', () => ADAPTIVE, 1)
    for (const cutLen of [60, 90, 120]) {
      const a = chooseStyle({ ...seatView(state, 0), log: state.log.slice(0, cutLen) }, ADAPTIVE)
      const b = chooseStyle({ ...seatView(state, 2), log: state.log.slice(0, cutLen) }, ADAPTIVE)
      expect(b.style).toBe(a.style)
      expect(b.expected).toEqual(a.expected)
    }
  })

  it('chooseStyle is pure: a deep-frozen view neither throws nor changes the choice', () => {
    const { view, state } = viewWithEvents(60, 10_000)
    const frozen = deepFreeze(seatView(state, view.seat))
    let fromFrozen: StyleId | null = null
    expect(() => {
      fromFrozen = chooseStyle(frozen, ADAPTIVE).style
    }).not.toThrow()
    expect(fromFrozen).toBe(chooseStyle(view, ADAPTIVE).style)
  })
})

describe('legality fuzz — the roster-fuzz gates, adaptive seats included', () => {
  it(
    'all-adaptive mirrors: 15 us54 games, 0 illegal, 0 capped, invariants clean, every game a clinch — and decide(adaptive) delegates exactly to the chosen style at hard skill',
    () => {
      for (let g = 0; g < 15; g++) {
        const seed = `adaptive-mirror-${g}`
        const { state } = playSeats(seed, () => ADAPTIVE, (g % 6) as Seat, (view, _spec, actionSeed, action, step) => {
          if (step % 25 !== 0) return
          // The integration pin: an adaptive decide IS the chosen roster style at hard skill.
          const choice = chooseStyle(view, ADAPTIVE)
          const delegate = decide(
            view,
            { skill: SKILL_PRESETS.hard, style: STYLE_ROSTER[choice.style] },
            actionSeed,
          )
          expect(delegate).toEqual(action)
        })
        assertCleanFinish(state, seed)
      }
    },
    600_000,
  )

  it(
    'adaptive team vs every static style: 18 us54 games (2 per opponent), same gates',
    () => {
      for (let i = 0; i < STYLE_IDS.length; i++) {
        const opponent = STYLE_IDS[i]
        for (let g = 0; g < 2; g++) {
          const seed = `adaptive-vs-${opponent}-${g}`
          const { state } = playSeats(
            seed,
            (seat) => (seatTeam(seat) === 0 ? ADAPTIVE : STYLE_ROSTER[opponent]),
            ((i * 2 + g) % 6) as Seat,
          )
          assertCleanFinish(state, seed)
        }
      }
    },
    600_000,
  )

  it('determinism: the same seed replays a byte-identical action sequence', () => {
    const a = playSeats('adaptive-determinism', () => ADAPTIVE, 3)
    const b = playSeats('adaptive-determinism', () => ADAPTIVE, 3)
    expect(JSON.stringify(b.actions)).toBe(JSON.stringify(a.actions))
    expect(b.actions.length).toBe(a.actions.length)
  })
})

describe('decideExplained under an adaptive policy', () => {
  it('prepends the chosen style with its expected payoff, then one read line per opponent seat', () => {
    const { view, state, seed } = viewWithEvents(60, 10_000)
    const d = decideExplained(view, ADAPTIVE, seed)
    expect(d.action).toEqual(decide(view, ADAPTIVE, seed))
    expect(reduce(state, d.action).ok).toBe(true)
    expect(d.trace.headline.length).toBeGreaterThan(0)
    expect(d.trace.notes[0]).toMatch(/^Adaptive: playing \w+ — expected score rate 0\.\d+/)
    for (let i = 1; i <= 3; i++) {
      expect(d.trace.notes[i]).toMatch(/^Seat [0-5] reads as [a-z]+ \(0?\.\d+\) after \d+ events?\.$/)
    }
  })

  it('says so plainly during warmup', () => {
    const { view, seed } = viewWithEvents(1, 30)
    const d = decideExplained(view, ADAPTIVE, seed)
    expect(d.trace.notes[0]).toMatch(/^Adaptive: in warmup \(\d+ of \d+ events observed\)/)
  })
})

describe('spec plumbing', () => {
  it('isAdaptiveSpec accepts exactly the adaptive shape', () => {
    expect(isAdaptiveSpec(ADAPTIVE)).toBe(true)
    expect(isAdaptiveSpec({ adaptive: true, anchor: 'turtle' })).toBe(true)
    expect(isAdaptiveSpec('hard')).toBe(false)
    expect(isAdaptiveSpec(STYLE_ROSTER.balanced)).toBe(false)
    expect(isAdaptiveSpec({ skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter })).toBe(false)
    expect(isAdaptiveSpec({ adaptive: false })).toBe(false)
    expect(isAdaptiveSpec(null)).toBe(false)
  })

  it('resolvePolicy refuses an AdaptiveSpec with a TypeError naming the reason', () => {
    expect(() => resolvePolicy(ADAPTIVE)).toThrow(TypeError)
    expect(() => resolvePolicy(ADAPTIVE)).toThrow(/adaptive policies resolve inside decide, with a view/)
  })
})
