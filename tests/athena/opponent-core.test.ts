/**
 * The rules half of ATHENA P0's Node opponent service (ATHENA.md §4.5 item 4, §4.6 G0c):
 * `scripts/athena/opponent-core.ts`. The service process itself is `opponent-service.test.mjs`'s.
 *
 * - the action codes are `athena-env/API.md` §4's, both ways, for every seat and every code, with the API's examples;
 * - `ReferenceGame` keeps the replay format's digests exactly as `GameRecorder` does: the deal digest, d after every
 *   step, and l and v at every state, over whole mixed-stub games, the spec's vector included;
 * - a refused action changes nothing, and a judged decision applies identically to a fresh reduce.
 */
import { describe, expect, it } from 'vitest'
import type { GameAction, Seat } from '../../lib/engine/types.ts'
import { GameRecorder } from '../../scripts/athena/replay-codec.ts'
import { mixedStubAction, mixedStubRng } from '../../scripts/athena/mixed-stub.ts'
import {
  A_DECLARE,
  A_DECLINE,
  A_PASS,
  N_ACTIONS,
  ReferenceGame,
  actionCode,
  actionOfCode,
  moveSeed,
} from '../../scripts/athena/opponent-core.ts'

describe('the action codes are API.md §4', () => {
  it('every code round-trips for every seat', () => {
    expect(N_ACTIONS).toBe(6726)
    for (let seat = 0; seat < 6; seat++)
      for (let code = 0; code < N_ACTIONS; code++) {
        const a = actionOfCode(seat, code)
        expect(a.seat).toBe(seat)
        expect(actionCode(a)).toBe(code)
      }
  })

  it("the API's examples, and the actions with no code", () => {
    // Seat 4 asking seat 1 (opponent 1) for 8H (card 32).
    expect(actionCode({ type: 'ask', seat: 4, target: 1, card: '8H' })).toBe(54 + 32)
    expect(actionOfCode(4, 86)).toEqual({ type: 'ask', seat: 4, target: 1, card: '8H' })
    // Seat 1 declaring EIGHTS: 8C 8D 8H at itself, 8S XR at seat 3, XB at seat 5.
    const eights = { '8C': 1, '8D': 1, '8H': 1, '8S': 3, XR: 3, XB: 5 } as Record<string, Seat>
    const code = A_DECLARE + 8 * 729 + 27 + 81 + 2 * 243
    expect(actionCode({ type: 'claim', seat: 1, book: 'EIGHTS', assignments: eights } as GameAction)).toBe(code)
    expect(actionOfCode(1, code)).toEqual({ type: 'claim', seat: 1, book: 'EIGHTS', assignments: eights })
    expect(actionOfCode(2, A_PASS + 1)).toEqual({ type: 'pass', seat: 2, to: 0 })
    expect(actionOfCode(5, A_DECLINE)).toEqual({ type: 'decline', seat: 5 })
    expect(actionCode({ type: 'ask', seat: 0, target: 2, card: '2C' })).toBeNull()
    expect(actionCode({ type: 'pass', seat: 0, to: 1 })).toBeNull()
    expect(actionCode({ type: 'pass', seat: 3, to: 3 })).toBeNull()
    const opp = { '8C': 0, '8D': 0, '8H': 0, '8S': 0, XR: 0, XB: 1 } as Record<string, Seat>
    expect(actionCode({ type: 'claim', seat: 0, book: 'EIGHTS', assignments: opp } as GameAction)).toBeNull()
    const five = { '8C': 0, '8D': 0, '8H': 0, '8S': 0, XR: 0 } as Record<string, Seat>
    expect(actionCode({ type: 'claim', seat: 0, book: 'EIGHTS', assignments: five } as GameAction)).toBeNull()
    expect(() => actionOfCode(0, N_ACTIONS)).toThrow()
    expect(() => actionOfCode(0, -1)).toThrow()
    expect(() => actionOfCode(6, 0)).toThrow()
  })
})

describe('ReferenceGame keeps the replay format digests', () => {
  it('equals GameRecorder at every step of whole mixed-stub games: deal, d, l and v', () => {
    for (const [seed, start] of [
      ['athena-p0-g0a-h5-0', 0],
      ['athena-test-opponent-1', 3],
    ] as const) {
      const rec = new GameRecorder(seed, start)
      const ref = new ReferenceGame(seed, start)
      expect(ref.deal).toBe(rec.deal)
      expect(ref.d).toBe(rec.deal)
      const rng = mixedStubRng(seed)
      const l: string[] = []
      const v: string[] = []
      const d: string[] = []
      while (rec.state.phase !== 'finished') {
        const obs = rec.observe()
        expect(ref.acting()).toBe(obs.acting)
        l.push(ref.legalDigest())
        v.push(ref.viewDigest())
        const action = mixedStubAction(rec.state, obs.acting, rng)
        rec.apply(action)
        const code = actionCode(action)
        expect(code).not.toBeNull()
        expect(ref.applyCode(obs.acting, code as number)).toEqual({ ok: true })
        d.push(ref.d)
      }
      rec.finish()
      const p = rec.partial()
      expect(d.join('')).toBe(p.d)
      expect(l.join('')).toBe(p.l)
      expect(v.join('')).toBe(p.v)
      expect(ref.finished).toBe(true)
      expect(ref.state.score).toEqual(rec.state.score)
      expect(ref.steps).toBe(rec.steps)
      // The first spec vector (replay-format.md §10.5): the H5 game 0 takes 1,124 steps and ends at d 71b3baa794a6f4de.
      if (seed === 'athena-p0-g0a-h5-0') {
        expect(ref.steps).toBe(1124)
        expect(ref.d).toBe('71b3baa794a6f4de')
      }
    }
  })

  it('a refused action changes nothing; a judged decision applies as a fresh reduce does', () => {
    const ref = new ReferenceGame('athena-test-opponent-2', 1)
    const d = ref.d
    const before = ref.state
    // Seat 1 holds the opening option; seat 2 may not decline, and an ask is refused while the window is open.
    expect(ref.applyCode(2, A_DECLINE)).toEqual({ ok: false, error: 'NOT_YOUR_OPTION' })
    expect(ref.applyCode(1, 0).ok).toBe(false)
    expect(ref.applyCode(1, N_ACTIONS).ok).toBe(false)
    expect(ref.state).toBe(before)
    expect(ref.d).toBe(d)
    expect(ref.steps).toBe(0)
    const twin = new ReferenceGame('athena-test-opponent-2', 1)
    const rng = mixedStubRng('x')
    for (let t = 0; t < 300 && !ref.finished; t++) {
      const action = mixedStubAction(ref.state, ref.acting(), rng)
      const j = ref.judge(action)
      expect(j.error).toBeNull()
      const seat = ref.acting()
      expect(ref.applyCode(seat, j.code as number)).toEqual({ ok: true })
      expect(twin.applyCode(seat, j.code as number)).toEqual({ ok: true })
      expect(ref.d).toBe(twin.d)
    }
    // A decision the reference refuses is reported, and an apply of it is judged afresh (and refused).
    const other = ((ref.acting() + 1) % 6) as Seat
    const d1 = ref.d
    expect(ref.judge({ type: 'decline', seat: other }).error).not.toBeNull()
    expect(ref.applyCode(other, A_DECLINE).ok).toBe(false)
    expect(ref.d).toBe(d1)
  })

  it('the move seed is the lab seed', () => {
    expect(moveSeed('athena-p0-pin-0', 0)).toBe(new ReferenceGame('athena-p0-pin-0', 0).moveSeed())
    expect(moveSeed('a', 17)).not.toBe(moveSeed('a', 18))
  })
})

