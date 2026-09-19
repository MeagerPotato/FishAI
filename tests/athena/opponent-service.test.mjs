/**
 * ATHENA P0's Node opponent service (ATHENA.md §4.5 item 4, §4.6 G0c), `scripts/athena/opponent-service.mjs`, as a
 * child process with two workers. A `.mjs` test on purpose, as `tests/lab/bounded-single-analyze.test.mjs` is: the
 * repo's tsconfig carries no Node type definitions, and this test is about a Node process and its protocol.
 *
 * - It plays a duplicate pair of Monet v1.0 against v0.33 exactly as `duplicate-pairs.mjs`'s loop plays it in this
 *   process: every decision's code, every state digest d, and l and v at every step.
 * - It reports its errors without dying: a refused apply (the state unchanged), a seat that is not the service's, an
 *   unknown game, bad JSON, an unknown op, an unknown Monet version (a refused open opens nothing).
 * - `quit` exits 0.
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { reduce } from '../../lib/engine/reduce.ts'
import { seatTeam } from '../../lib/engine/cards.ts'
import { decide, monetPolicy } from '../../lib/engine/bots/index.ts'
import { A_DECLINE, ReferenceGame, actionCode, moveSeed } from '../../scripts/athena/opponent-core.ts'

const SERVICE = fileURLToPath(new URL('../../scripts/athena/opponent-service.mjs', import.meta.url))

/** The service as a child process: send a request, await its one-line reply. */
class Service {
  constructor(workers) {
    this.proc = spawn(process.execPath, [SERVICE, '--workers', String(workers)], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.proc.stderr.resume()
    this.waiting = []
    this.id = 0
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      const w = this.waiting.shift()
      if (!w) throw new Error(`an unexpected line from the service: ${line}`)
      w(JSON.parse(line))
    })
    this.exited = new Promise((res) => this.proc.on('exit', (code) => res(code)))
  }

  raw(line) {
    return new Promise((res) => {
      this.waiting.push(res)
      this.proc.stdin.write(line + '\n')
    })
  }

  req(msg) {
    return this.raw(JSON.stringify({ ...msg, id: ++this.id }))
  }
}

describe('the opponent service', () => {
  let svc
  beforeAll(() => {
    svc = new Service(2)
  })
  afterAll(() => {
    if (svc.proc.exitCode === null) svc.proc.kill()
  })

  it('plays a duplicate pair exactly as duplicate-pairs.mjs does, every action and every digest', async () => {
    const hello = await svc.req({ op: 'hello' })
    expect(hello).toMatchObject({ ok: true, protocol: 1, workers: 2 })
    const seed = 'athena-test-service-pair'
    const pols = { A: monetPolicy('v1.0'), B: monetPolicy('v0.33') }
    const seats = (teamA) => [0, 1, 2, 3, 4, 5].map((s) => (seatTeam(s) === teamA ? 'v1.0' : 'v0.33'))
    const open = await svc.req({
      op: 'open',
      games: [
        { g: 10, seed, start: 0, seats: seats(0) },
        { g: 11, seed, start: 0, seats: seats(1) },
      ],
    })
    const local = [new ReferenceGame(seed, 0), new ReferenceGame(seed, 0)]
    expect(open.games).toEqual([
      [10, local[0].deal, 0],
      [11, local[1].deal, 0],
    ])
    const pending = [null, null]
    const done = [false, false]
    let decisions = 0
    while (!done[0] || !done[1]) {
      const items = [0, 1].filter((k) => !done[k]).map((k) => [10 + k, pending[k] ? pending[k][0] : -1, pending[k] ? pending[k][1] : 0, 1])
      const r = await svc.req({ op: 'step', full: true, items })
      for (const [g, d, seat, code, l, v, end, err] of r.items) {
        const k = g - 10
        expect(err).toBeNull()
        if (pending[k]) {
          // duplicate-pairs.mjs's loop, in this process: the same state, view, policy and move seed.
          const s = local[k].state
          const acting = local[k].acting()
          const mine = decide(local[k].view(), seatTeam(acting) === k ? pols.A : pols.B, moveSeed(seed, s.moveIndex))
          expect(reduce(s, mine).ok).toBe(true)
          expect(actionCode(mine)).toBe(pending[k][1])
          expect(local[k].applyCode(acting, pending[k][1])).toEqual({ ok: true })
          decisions++
        }
        expect(d).toBe(local[k].d)
        if (end) {
          expect(local[k].finished).toBe(true)
          expect(end).toEqual(local[k].state.score)
          done[k] = true
          continue
        }
        expect(seat).toBe(local[k].acting())
        expect(l).toBe(local[k].legalDigest())
        expect(v).toBe(local[k].viewDigest())
        pending[k] = [seat, code]
      }
    }
    expect(decisions).toBe(local[0].steps + local[1].steps)
    expect(local[0].steps).toBeGreaterThan(100)
    expect((await svc.req({ op: 'close', games: [10, 11, 99] })).closed).toBe(2)
  })

  it('reports errors without dying, and quits cleanly', async () => {
    const seed = 'athena-test-service-err'
    await svc.req({ op: 'open', games: [{ g: 20, seed, start: 2, seats: [null, 'v0.33', null, 'v0.33', null, 'v0.33'] }] })
    // Seat 2 holds the opening option: a decline from seat 3 is refused, the state unchanged.
    const [bad] = (await svc.req({ op: 'step', items: [[20, 3, A_DECLINE, 0]] })).items
    expect(bad[7]).toMatch(/refused: NOT_YOUR_OPTION/)
    expect(bad[1]).toBe(new ReferenceGame(seed, 2).d)
    expect(bad[2]).toBe(2)
    // Seat 2 is not the service's to play.
    const [mine] = (await svc.req({ op: 'step', items: [[20, -1, 0, 1]] })).items
    expect(mine[7]).toMatch(/not one of the service's seats/)
    // The port's decline for seat 2, then the service decides for seat 3; without `full`, no l or v.
    const [ok] = (await svc.req({ op: 'step', full: false, items: [[20, 2, A_DECLINE, 1]] })).items
    expect([ok[2], ok[4], ok[5], ok[7]]).toEqual([3, null, null, null])
    expect(typeof ok[3]).toBe('number')
    const [none] = (await svc.req({ op: 'step', items: [[77, -1, 0, 1]] })).items
    expect(none[7]).toMatch(/not open/)
    expect(await svc.raw('not json')).toMatchObject({ ok: false })
    expect(await svc.req({ op: 'nope' })).toMatchObject({ ok: false })
    // An unknown version refuses the whole open: games 21 and 22 (valid, one on each worker) are not left open.
    const games = [
      { g: 21, seed: 'x', start: 0, seats: [null, null, null, null, null, null] },
      { g: 22, seed: 'x', start: 0, seats: [null, null, null, null, null, null] },
      { g: 23, seed: 'x', start: 0, seats: ['v9', null, null, null, null, null] },
    ]
    expect(await svc.req({ op: 'open', games })).toMatchObject({ ok: false })
    expect((await svc.req({ op: 'close', games: [21, 22, 23] })).closed).toBe(0)
    // And an open of a game already open is refused without touching the open one.
    expect(await svc.req({ op: 'open', games: [{ g: 20, seed: 'x', start: 0, seats: games[0].seats }] })).toMatchObject({ ok: false })
    const stats = await svc.req({ op: 'stats' })
    expect(stats.workers).toHaveLength(2)
    expect(stats.workers.reduce((a, w) => a + w.decisions, 0)).toBeGreaterThan(200)
    expect(stats.workers.reduce((a, w) => a + w.live, 0)).toBe(1)
    expect(await svc.req({ op: 'quit' })).toMatchObject({ ok: true })
    expect(await svc.exited).toBe(0)
  })
})
