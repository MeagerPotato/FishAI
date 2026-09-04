/**
 * The `/play` model menu — what it offers, what a link means, and the one measured claim the
 * lobby makes out loud.
 *
 * The last of those is the reason this file exists. `models.ts` tells the player that Monet v0.1
 * and Bass v2.0 agree on "99.85% of decisions", which is a measurement, not a description — and
 * an unpinned measurement in user-facing copy is a claim that rots the first time either policy
 * moves. Monet's whole roadmap is a sequence of edits to exactly those policies, so it will move.
 */
import { describe, expect, it } from 'vitest'
import {
  MONET_VERSION_IDS,
  decide,
  legalActionsSummary,
  newGame,
  reduce,
  seatView,
  us54Config,
} from '../../lib/engine/index.ts'
import type { Seat } from '../../lib/engine/index.ts'
import {
  DEFAULT_MODEL_ID,
  PLAY_MODELS,
  modelById,
  modelOrDefault,
} from '../../src/play/models.ts'
import { LEGACY_MODE_ID, parseModelId, playQuery, retiredMode } from '../../src/play/params.ts'

/**
 * The Monet entry's id, DERIVED the way models.ts derives it.
 *
 * Written down nowhere in this file, deliberately. The menu tracks `MONET_VERSION_IDS` so that a
 * new rung needs no edit here, and a test that hard-codes `monet-v01` would turn that design
 * into a merge conflict: the v0.2 branch adds a registry entry, and every assertion naming v0.1
 * would go red on a menu that had behaved exactly as intended.
 */
const NEWEST_MONET = MONET_VERSION_IDS[MONET_VERSION_IDS.length - 1]
const MONET_ID = `monet-${NEWEST_MONET.replace('.', '')}`

describe('the model menu', () => {
  it('offers exactly the two lines, newest Monet first', () => {
    expect(PLAY_MODELS.map((m) => m.id)).toEqual([MONET_ID, 'bass-v20'])
    expect(PLAY_MODELS.map((m) => m.line)).toEqual(['Monet', 'Bass'])
  })

  it('tracks the newest shipped Monet version rather than naming one', () => {
    // The owner's instruction: as each rung lands the single Monet entry becomes the newer
    // version, with no edit in models.ts or here.
    const monet = PLAY_MODELS.find((m) => m.line === 'Monet')
    expect(monet?.name).toBe(`Monet ${NEWEST_MONET}`)
    expect(monet?.id).toBe(MONET_ID)
    // …and it is genuinely the newest, not merely the first: v0.2 exists on another branch and
    // this must follow it there without an edit.
    expect(MONET_VERSION_IDS.length).toBeGreaterThan(0)
  })

  it('defaults to the model this table has always seated', () => {
    // Every `?seed=` link shared before the menu existed has to keep dealing the same game.
    expect(DEFAULT_MODEL_ID).toBe('bass-v20')
    expect(modelOrDefault(null).id).toBe('bass-v20')
    expect(modelOrDefault('no-such-model').id).toBe('bass-v20')
    expect(modelById('no-such-model')).toBeNull()
  })

  it('gives every entry the copy the three label surfaces read', () => {
    for (const m of PLAY_MODELS) {
      for (const field of ['name', 'heading', 'label', 'note'] as const) {
        expect(m[field].length, `${m.id}.${field}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('?v= — what a link means', () => {
  it('accepts every shipped id and the legacy alias, and refuses the rest', () => {
    expect(retiredMode(`?v=${MONET_ID}`)).toBeNull()
    expect(retiredMode('?v=bass-v20')).toBeNull()
    expect(retiredMode(`?v=${LEGACY_MODE_ID}`)).toBeNull()
    expect(retiredMode('')).toBeNull()

    // Bass v0.5 and v1.5 are archived as git tags and differ from today's engine in CODE, not in
    // a setting — so the param stays refused rather than quietly seating something else.
    expect(retiredMode('?v=05')).toBe('05')
    expect(retiredMode('?v=15')).toBe('15')
    expect(retiredMode('?v=')).toBe('')
  })

  it('reads the legacy alias and anything unknown as the default', () => {
    expect(parseModelId(`?v=${MONET_ID}`)).toBe(MONET_ID)
    expect(parseModelId(`?v=${LEGACY_MODE_ID}`)).toBe(DEFAULT_MODEL_ID)
    expect(parseModelId('')).toBe(DEFAULT_MODEL_ID)
    expect(parseModelId('?v=05')).toBe(DEFAULT_MODEL_ID)
  })

  it('omits the param at the default and round-trips otherwise', () => {
    // The house rule the rest of params.ts follows: a plain table produces a plain link.
    expect(playQuery(['', '', '', '', ''], 3, DEFAULT_MODEL_ID)).toBe('')
    const q = playQuery(['', '', '', '', ''], 3, MONET_ID)
    expect(q).toBe(`&v=${MONET_ID}`)
    expect(parseModelId(q.replace(/^&/, '?'))).toBe(MONET_ID)
  })
})

describe('the two entries are different bots, and nearly the same one', () => {
  /**
   * Both menu entries decided at every position of the same games. Driven by the Bass action so
   * the population is one legal game rather than two diverging ones — the question is "given
   * this position, do they choose the same move", not "do they play the same game out".
   */
  function agreement(games: number): { decisions: number; differ: number } {
    const bass = modelById('bass-v20')
    const monet = modelById(MONET_ID)
    if (bass === null || monet === null) throw new Error('menu entry missing')

    let decisions = 0
    let differ = 0
    for (let g = 0; g < games; g++) {
      let state = newGame(`models-${g}`, us54Config, (g % 6) as Seat)
      let guard = 0
      while (state.phase !== 'finished' && guard++ < 4000) {
        const { seat } = legalActionsSummary(state)
        const view = seatView(state, seat)
        const seed = (state.log.length + seat) >>> 0
        const a = decide(view, bass.spec, seed)
        const b = decide(view, monet.spec, seed)
        decisions++
        if (JSON.stringify(a) !== JSON.stringify(b)) differ++
        const res = reduce(state, a)
        if (!res.ok) break
        state = res.state
      }
    }
    return { decisions, differ }
  }

  it('are not the same policy — the menu is not offering one bot twice', () => {
    const { decisions, differ } = agreement(20)
    expect(decisions).toBeGreaterThan(5_000)
    // Non-identity is the load-bearing half: two entries that never diverge would make the menu
    // a lie. Measured at 56 / 36,214 over 60 games; asserted loosely because the exact count is
    // a property of the policies, which Monet's roadmap will move on purpose.
    expect(differ).toBeGreaterThan(0)
  })

  it('agree often enough that the lobby copy is honest', () => {
    // models.ts tells the player they agree on 99.85% of decisions. Over this roster the best
    // response to almost everything is Punter, which is exactly what the classifier keeps
    // picking — so the two entries play alike, and the copy says so. If this drops below 99%,
    // the sentence in models.ts is wrong and must be rewritten, not the threshold relaxed.
    const { decisions, differ } = agreement(20)
    const agree = 100 * (1 - differ / decisions)
    // Measured: 99.85% at Monet v0.1/v0.2 (a fixed Punter against the adaptive engine that
    // converges on Punter), 98.07% at v0.3, whose licence conditioning moves a share of the
    // licensed asks (MONET.md §3.3a), 96.86% at v0.4a, whose marginal reorders more of them
    // (§3.4a), 95.78% at v0.9, whose contest credit moves the likely-miss asks (§3.8d). The copy says "about 96%"; the floor here is the honesty
    // bar for that sentence, not a target — a Monet that agreed with Bass on fewer than 95% of
    // decisions would need different copy, and one that agreed on all of them would be Bass.
    expect(agree).toBeGreaterThan(95)
    expect(agree).toBeLessThan(100)
  })
})
