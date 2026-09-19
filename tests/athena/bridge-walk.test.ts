/**
 * ATHENA P0's G0a (ii), the bridge walk (ATHENA.md §4.6; `scripts/athena/replay-format.md` §12): the reference side.
 *
 * - The codec's reduced reveal: a true holder the host did not publish encodes as NONE, in the set block and in the
 *   claim event, while the full reveal (the home rule of G0a (i)) still refuses a missing holder.
 * - When every holder is revealed, the two reveals encode the same bytes.
 * - The emitter, run as the command line on a hand-built fixture, writes the game digests that the Rust port's unit
 *   test pins (`athena-env/src/bridge.rs`, `the_fixture_walks_to_the_reference_digests`): the two languages agree on
 *   the fixture.
 *
 * The fixture is our own construction in the bridge's record schema, not a FishLab record: a header whose card order
 * is ours (sets in reverse canonical order, each set's cards descending, with FishLab's spellings `10x`, `RJ`, `BJ`),
 * and two games on decks dealt by our own generator. They have hits, misses, a right declare, a wrong declare with
 * two of six holders revealed, a forced wrong declare with one revealed, a hit that empties its target, a pass, and
 * arm A on team 0 and on team 1. The same text is the Rust test's `FIXTURE`.
 */
import { describe, expect, it } from 'vitest'
import { us54Config } from '../../lib/engine/reduce.ts'
import type { BookResult, Card, PublicEvent, Seat } from '../../lib/engine/types.ts'
import { ByteWriter, NONE, encodeEvent, encodeView, logDigestOf, toHex } from '../../scripts/athena/replay-codec.ts'
import type { SeatViewLike } from '../../scripts/athena/replay-codec.ts'

const FIXTURE = [
  '{"header":1,"specA":"fixture-a","specB":"fixture-b","games":2,"rotations":1,"seed":"fixture","sets":9,"cards":["BJ","RJ","8S","8H","8D","8C","AS","KS","QS","JS","10S","9S","AH","KH","QH","JH","10H","9H","AD","KD","QD","JD","10D","9D","AC","KC","QC","JC","10C","9C","7S","6S","5S","4S","3S","2S","7H","6H","5H","4H","3H","2H","7D","6D","5D","4D","3D","2D","7C","6C","5C","4C","3C","2C"]}',
  '{"deal":0,"rot":0,"orient":0,"shift":0,"seed":"athena-g0a2-fixture-0","dealt":[[2,12,26,31,36,39,40,44,48],[1,5,6,11,13,18,25,34,46],[3,7,16,20,28,37,50,52,53],[0,8,15,22,41,42,43,45,47],[14,19,21,24,29,30,33,49,51],[4,9,10,17,23,27,32,35,38]],"events":[[0,0,1,46,7,1,[0,0,0,0,0,0],[10,8,9,9,9,9]],[0,0,1,53,8,0,[0,0,0,0,0,0],[10,8,9,9,9,9]],[0,1,0,40,6,1,[0,0,0,0,0,0],[9,9,9,9,9,9]],[0,1,0,39,6,1,[0,0,0,0,0,0],[8,10,9,9,9,9]],[0,1,2,37,6,1,[0,0,0,0,0,0],[8,11,8,9,9,9]],[0,1,0,36,6,1,[0,0,0,0,0,0],[7,12,8,9,9,9]],[1,1,0,0,6,1,[1,1,5,1,1,3],[7,8,8,8,9,8]],[0,1,2,35,5,0,[0,0,0,0,0,0],[7,8,8,8,9,8]],[0,2,1,11,1,1,[0,0,0,0,0,0],[7,7,9,8,9,8]],[0,2,5,10,1,1,[0,0,0,0,0,0],[7,7,10,8,9,7]],[1,2,0,0,1,0,[2,2,2,2,2,2],[7,6,7,7,9,6]],[0,2,3,51,8,0,[0,0,0,0,0,0],[7,6,7,7,9,6]],[0,3,0,44,7,1,[0,0,0,0,0,0],[6,6,7,8,9,6]],[0,3,0,2,0,1,[0,0,0,0,0,0],[5,6,7,9,9,6]],[0,3,0,12,2,1,[0,0,0,0,0,0],[4,6,7,10,9,6]],[0,3,0,26,4,1,[0,0,0,0,0,0],[3,6,7,11,9,6]],[0,3,0,48,8,1,[0,0,0,0,0,0],[2,6,7,12,9,6]],[0,3,0,31,5,1,[0,0,0,0,0,0],[1,6,7,13,9,6]],[0,3,0,46,7,1,[0,0,0,0,0,0],[0,6,7,14,9,6]],[3,3,0,0,0,0,[3,1,3,3,5,1],[0,4,6,12,9,5]],[2,3,1,0,0,0,[0,0,0,0,0,0],[0,4,6,12,9,5]],[0,1,2,35,5,0,[0,0,0,0,0,0],[0,4,6,12,9,5]],[4,0,0,0,0,0,[0,0,0,0,0,0],[0,4,6,12,9,5]]],"winner":1,"score":[1,2],"hitLimit":false,"setWinner":[0,1,-1,-1,-1,-1,1,-1,-1]}',
  '{"deal":1,"rot":0,"orient":1,"shift":0,"seed":"athena-g0a2-fixture-1","dealt":[[3,5,12,27,30,38,43,48,51],[1,15,17,24,25,32,35,39,41],[4,8,16,26,29,33,36,40,45],[9,13,14,18,20,21,31,34,44],[6,7,10,19,22,37,46,50,53],[0,2,11,23,28,42,47,49,52]],"events":[[0,3,4,46,7,1,[0,0,0,0,0,0],[9,9,9,10,8,9]],[0,3,4,47,7,0,[0,0,0,0,0,0],[9,9,9,10,8,9]],[0,4,1,41,6,1,[0,0,0,0,0,0],[9,8,9,10,9,9]],[0,4,1,39,6,1,[0,0,0,0,0,0],[9,7,9,10,10,9]],[1,4,0,0,6,1,[2,4,0,4,2,4],[8,7,7,10,7,9]],[0,4,5,51,8,0,[0,0,0,0,0,0],[8,7,7,10,7,9]],[0,5,4,10,1,1,[0,0,0,0,0,0],[8,7,7,10,6,10]],[0,5,2,8,1,1,[0,0,0,0,0,0],[8,7,6,10,6,11]],[1,5,0,0,1,0,[5,5,5,5,5,5],[8,7,6,9,4,8]],[0,5,0,53,8,0,[0,0,0,0,0,0],[8,7,6,9,4,8]],[0,0,1,35,5,1,[0,0,0,0,0,0],[9,6,6,9,4,8]],[0,0,1,24,4,1,[0,0,0,0,0,0],[10,5,6,9,4,8]],[0,0,1,1,0,1,[0,0,0,0,0,0],[11,4,6,9,4,8]],[0,0,1,25,4,1,[0,0,0,0,0,0],[12,3,6,9,4,8]],[0,0,1,32,5,1,[0,0,0,0,0,0],[13,2,6,9,4,8]],[0,0,1,15,2,1,[0,0,0,0,0,0],[14,1,6,9,4,8]],[0,0,1,17,2,1,[0,0,0,0,0,0],[15,0,6,9,4,8]],[3,0,0,0,0,0,[0,0,0,0,2,0],[12,0,5,9,4,6]],[2,0,2,0,0,0,[0,0,0,0,0,0],[12,0,5,9,4,6]],[0,2,3,47,7,0,[0,0,0,0,0,0],[12,0,5,9,4,6]],[4,0,0,0,0,0,[0,0,0,0,0,0],[12,0,5,9,4,6]]],"winner":0,"score":[2,1],"hitLimit":false,"setWinner":[1,0,-1,-1,-1,-1,0,-1,-1]}',
].join('\n')

/** The Rust test's pins: per game (deal, orient, events, asks, game digest), and the cell's aggregate. */
const FIXTURE_GAMES = [
  { deal: '0', orient: '0', events: 24, asks: 18, game: '835d2c982b45cd1f' },
  { deal: '1', orient: '1', events: 22, asks: 16, game: '2e1230f2a6714221' },
]
const FIXTURE_AGGREGATE = 'fcf8d27177cc8a58'

const HIGH_S: readonly Card[] = ['9S', 'TS', 'JS', 'QS', 'KS', 'AS']

/** A wrong declare of HIGH-S by seat 2, all six stated at seat 2; `revealed` holders published. */
function wrongDeclare(revealed: Partial<Record<Card, Seat>>): Extract<PublicEvent, { type: 'claim' }> {
  const assignments = {} as Record<Card, Seat>
  for (const c of HIGH_S) assignments[c] = 2
  return {
    type: 'claim',
    claimer: 2,
    book: 'HIGH-S',
    assignments,
    actualHolders: revealed as Record<Card, Seat>,
    outcome: 'team1',
  }
}

function viewWith(claim: Extract<PublicEvent, { type: 'claim' }>): SeatViewLike {
  const result: BookResult = {
    book: claim.book,
    outcome: claim.outcome,
    claimer: claim.claimer,
    assignments: claim.assignments,
    actualHolders: claim.actualHolders,
  }
  const log: PublicEvent[] = [{ type: 'game_started', startingSeat: 0 }, claim]
  return {
    phase: 'playing',
    turn: 3,
    counts: [9, 9, 3, 9, 9, 9],
    score: [0, 1],
    books: { 'HIGH-S': result },
    log,
    moveIndex: 2,
    config: us54Config,
    seat: 3,
    hand: ['2C', '3C', '4D', '5H', '8S', 'QH', 'KD', 'AC', 'XR'],
  }
}

describe('the codec: the reduced reveal of the bridge walk (replay-format.md §12.4)', () => {
  it('an unrevealed true holder is NONE in the claim event; the full reveal refuses it', () => {
    const e = wrongDeclare({ TS: 2, QS: 2 })
    const w = new ByteWriter()
    encodeEvent(w, e, 'reduced')
    expect(toHex(w.bytes())).toBe('020207' + '02'.repeat(6) + ['ff', '02', 'ff', '02', 'ff', 'ff'].join('') + '01')
    expect(() => encodeEvent(new ByteWriter(), e)).toThrow(/true holder/)
    expect(() => logDigestOf([e])).toThrow(/true holder/)
    expect(logDigestOf([e], 'reduced')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('an unrevealed true holder is NONE in the set block of the view; the full reveal refuses it', () => {
    const v = viewWith(wrongDeclare({ TS: 2, QS: 2 }))
    const w = new ByteWriter()
    encodeView(w, v, 2, logDigestOf(v.log, 'reduced'), 'reduced')
    const bytes = w.bytes()
    const o = 19 + 14 * 7
    expect(Array.from(bytes.subarray(o, o + 14))).toEqual([1, 2, 2, 2, 2, 2, 2, 2, NONE, 2, NONE, 2, NONE, NONE])
    expect(() => encodeView(new ByteWriter(), v, 2, logDigestOf(v.log, 'reduced'))).toThrow(/true holder/)
  })

  it('with every holder revealed, the two reveals encode the same bytes', () => {
    const e = wrongDeclare({ '9S': 2, TS: 2, JS: 1, QS: 2, KS: 5, AS: 3 })
    const a = new ByteWriter()
    const b = new ByteWriter()
    encodeEvent(a, e)
    encodeEvent(b, e, 'reduced')
    expect(toHex(b.bytes())).toBe(toHex(a.bytes()))
    const v = viewWith(e)
    a.reset()
    b.reset()
    encodeView(a, v, 2, logDigestOf(v.log))
    encodeView(b, v, 2, logDigestOf(v.log, 'reduced'), 'reduced')
    expect(toHex(b.bytes())).toBe(toHex(a.bytes()))
  })
})

/** The part of the emitter's module this test calls. It is a script (`.mjs`), so it is typed here. */
interface EmitModule {
  walkRecordText(text: string, cell?: string): { lines: string[]; cell: Record<string, unknown> }
}

describe('emit-bridge-views.mjs on the hand-built fixture', () => {
  it('writes the game digests the Rust port pins, and the reference counts', async () => {
    // A computed specifier keeps the script out of the type check; vitest loads it as Node would.
    const url = new URL('../../scripts/athena/emit-bridge-views.mjs', import.meta.url).href
    const emit = (await import(/* @vite-ignore */ url)) as EmitModule
    const { lines, cell } = emit.walkRecordText(FIXTURE + '\n')
    expect(lines).toHaveLength(2)
    lines.forEach((line, i) => {
      const c = line.split('\t')
      const want = FIXTURE_GAMES[i]
      expect(c).toHaveLength(11)
      expect(c.slice(0, 8)).toEqual([
        'athena-bridge-view-1',
        'fixture-0.jsonl',
        String(i),
        want.deal,
        '0',
        want.orient,
        String(want.events),
        String(want.asks),
      ])
      expect(c[8]).toMatch(new RegExp(`^[0-9a-f]{${16 * want.asks}}$`))
      expect(c[9]).toMatch(new RegExp(`^[0-9a-f]{${16 * want.asks}}$`))
      expect(c[10]).toBe(want.game)
    })
    expect(cell.aggregate).toBe(FIXTURE_AGGREGATE)
    expect(cell.sortedAggregate).toBe(FIXTURE_AGGREGATE)
    expect(cell).toMatchObject({
      games: 2,
      events: 46,
      asks: 34,
      wrongDeclares: 4,
      forcedDeclares: 2,
      hiddenHolders: 18,
      hiddenViews: 18,
    })
  })
})
