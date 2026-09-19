/**
 * gen-v3-fixture.mjs: write `tests/athena/data/v3-forward.json`, the golden fixture that pins the format 3 forward
 * (ATHENA.md §9.2) on corpus views.
 *
 *     node scripts/athena/gen-v3-fixture.mjs [--out tests/athena/data/v3-forward.json]
 *
 * The views are real ones: games of `tests/athena/data/encoder-fixture.json` (the Rust port's own buffers over the
 * G0a corpus, in both of P1's regimes) replayed in-engine, with a decision taken every `STRIDE` steps — asks, passes
 * and declare windows alike, under the home regime and the bridge regime both.
 *
 * The net is a tiny member of the family ({@link TINY}) at format 3, from `initBlob`, which is a pure function of its
 * seed: the fixture carries the seed and the md5 of the serialised weight file, so a change to the init or to the
 * blob layout fails the test that reads it rather than silently repinning.
 *
 * Per view the fixture holds its game (an index into `encoder-fixture.json`, whose recorded action codes the test
 * replays), the step, the seat, the folded row count, **every one of the 518 head outputs**, as the base64 of
 * their float64 little-endian bytes (exact, and a third the size of the decimals), the value and set-difference heads
 * again as readable numbers, the belief probabilities of the first card the view leaves two or more seats for, and
 * `decideNet`'s move as an action code with its kind — so the fixture pins the arithmetic and the format 3 decision
 * path together.
 *
 * It is generated in JavaScript and committed. Nothing here needs Python, the port or a GPU.
 */
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = await import(pathToFileURL(join(ROOT, 'lib/athena/index.ts')).href)
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const { newGame, reduce, seatView, us54Config } = ENG
const { ReducedReveal } = await import(pathToFileURL(join(ROOT, 'scripts/athena/facts-codec.ts')).href)

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const OUT = resolve(ROOT, argOf('--out', 'tests/athena/data/v3-forward.json'))

/** The tests' tiny arch, so the fixture is small and the suite stays fast. */
const TINY = { d: 8, width: 16, depth: 2 }
const SEED = 'athena-p2-v3-fixture'
/** The fixture's games (both regimes, four populations), and one decision every STRIDE steps of each. */
const GAMES = [0, 2, 5, 8, 10, 12, 15, 18]
const STRIDE = 311

const ARCH = A.withFormat(TINY, 3)
const blob = A.initBlob(ARCH, SEED)
const net = A.makeNet(ARCH, blob, { fixture: 'athena-v3-forward-1', seed: SEED })
const md5 = createHash('md5').update(A.serializeWeights(net)).digest('hex')

const fx = JSON.parse(readFileSync(join(ROOT, 'tests/athena/data/encoder-fixture.json'), 'utf8'))
const actorOf = (s) => (s.declareWindow && s.phase !== 'finished' ? s.declareWindow.option : s.turn)

/** A Float64Array as base64 of its little-endian bytes: exact, and what the test decodes back. */
const b64 = (xs) => Buffer.from(new Float64Array(xs).buffer).toString('base64')

const views = []
for (const gi of GAMES) {
  const game = fx.games[gi]
  let s = newGame(game.seed, us54Config, game.start)
  const red = new ReducedReveal()
  for (const e of s.log) red.push(e)
  for (let t = 0; t < game.codes.length; t++) {
    const seat = actorOf(s)
    if (t % STRIDE === 0) {
      const v = game.regime === A.REGIME_BRIDGE ? red.view(s, seat) : seatView(s, seat)
      const k = A.factsOf(v)
      const f = A.forwardView(net, v, null, k)
      const cands = A.candidateMatrix(v, k)
      const belief = A.beliefOf(f.heads, cands)
      let unit = -1
      for (let c = 0; c < 54 && unit < 0; c++) {
        let n = 0
        for (let r = 0; r < 6; r++) n += cands[c * 6 + r]
        if (n > 1) unit = c
      }
      const d = A.decideNet(net, v, null)
      views.push({
        game: gi,
        seed: game.seed,
        start: game.start,
        regime: game.regime,
        t,
        seat,
        rows: A.encodeEventRows(v.log, seat).length / A.EVENT_LEN,
        kind: d.kind,
        code: A.encodeAction(d.action),
        p: d.plan === undefined ? null : d.plan.p,
        card: unit,
        belief: unit < 0 ? null : Array.from(belief.subarray(unit * 6, unit * 6 + 6)),
        value: f.heads[A.H_VALUE],
        setDiff: f.heads[A.H_SETDIFF],
        heads: b64(f.heads),
      })
    }
    const r = reduce(s, A.decodeAction(seat, game.codes[t]))
    if (!r.ok) throw new Error(`${game.seed} step ${t}: ${r.error.code}`)
    for (const e of r.events) red.push(e)
    s = r.state
  }
}

const out = {
  format: 'athena-v3-forward-1',
  source: 'tests/athena/data/encoder-fixture.json, replayed in-engine by scripts/athena/gen-v3-fixture.mjs',
  arch: net.arch,
  weights: { seed: SEED, init: A.INIT_SCHEME, params: A.paramCount(ARCH), md5 },
  stride: STRIDE,
  views,
}
writeFileSync(OUT, JSON.stringify(out) + '\n')
console.log(`v3 forward fixture: ${views.length} views over ${GAMES.length} games, arch ${JSON.stringify(net.arch)}, weights md5 ${md5}`)
console.log(`kinds: ${JSON.stringify(views.reduce((m, v) => ({ ...m, [v.kind]: (m[v.kind] ?? 0) + 1 }), {}))}`)
console.log(`regimes: ${JSON.stringify([...new Set(views.map((v) => v.regime))])}`)
console.log(`out: ${OUT}`)
