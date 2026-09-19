/**
 * pin-stub-asks.mjs: the in-engine pin of the ATHENA-stub package's asks (ATHENA.md §4.6 G0d part 2), in the style of
 * `scripts/pin-bridge-asks.mjs`.
 *
 *     node scripts/athena/pin-stub-asks.mjs --records <dir|file> [--weights <file>] [--prefix p] [--show 12]
 *
 * Every ask the package's team made in the given records (FishLab record lines, as `scripts/athena/stub-selftest.mjs`
 * writes them) is rebuilt as the asking seat's own view by `scripts/bridge-records.mjs`'s walk, the same walk the
 * Monet pins use, and decided again in-engine by `lib/athena`'s `decideStub` over the weight file: a full refold of the
 * event history with no cache, so the replay shares nothing with the package's incremental state. The pin holds when
 * every replayed decision is the recorded ask (card and target).
 *
 * Without `--weights` the pin uses the frozen stub's network, rebuilt from `athena-stub/stub-weights.json` and checked
 * against the md5 `athena-stub/fishbot.json` pins. With `--weights` it uses that file (for example a perturbed one,
 * `scripts/athena/perturb-weights.mjs`), which is the mutation check: the pin must then fail, and is read by its count.
 *
 * The exit code is 0 only when the agreement is total.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as REC from '../bridge-records.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const A = await import(pathToFileURL(`${ROOT}/lib/athena/index.ts`).href)

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const RECORDS = argOf('--records', '')
const WEIGHTS = argOf('--weights', '')
const PREFIX = argOf('--prefix', '')
const SHOW = Number(argOf('--show', 12))
if (!RECORDS) {
  console.error('usage: node scripts/athena/pin-stub-asks.mjs --records <dir|file> [--weights <file>] [--prefix p] [--show 12]')
  process.exit(2)
}

let bytes
let source
if (WEIGHTS) {
  bytes = readFileSync(resolve(WEIGHTS))
  source = WEIGHTS
} else {
  const spec = JSON.parse(readFileSync(`${ROOT}/athena-stub/stub-weights.json`, 'utf8'))
  const manifest = JSON.parse(readFileSync(`${ROOT}/athena-stub/fishbot.json`, 'utf8'))
  const arch = A.ARCHS[spec.arch]
  bytes = Buffer.from(A.serializeWeights({ arch, blob: A.initBlob(arch, spec.seed), meta: { stub: true, size: spec.arch, seed: spec.seed, init: A.INIT_SCHEME } }))
  const md5 = createHash('md5').update(bytes).digest('hex')
  if (md5 !== manifest.env.ATHENA_WEIGHTS_MD5) throw new Error(`the rebuilt stub weights have md5 ${md5}; athena-stub/fishbot.json pins ${manifest.env.ATHENA_WEIGHTS_MD5}`)
  source = `the frozen stub (${spec.arch}, seed ${JSON.stringify(spec.seed)})`
}
const md5 = createHash('md5').update(bytes).digest('hex')
const NET = A.parseWeights(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))

const files = REC.recordFiles(RECORDS, PREFIX)
if (files.length === 0) throw new Error(`no record files under ${RECORDS} with the prefix "${PREFIX}"`)
const t0 = Date.now()
let games = 0
let n = 0
let agree = 0
let notAsk = 0
const shown = []
for (const rec of REC.readRecords(RECORDS, PREFIX)) {
  games++
  REC.walkAsks(rec, ({ i, ev, view }) => {
    if (ev.asker % 2 !== rec.teamA) return
    n++
    const d = A.decideStub(NET, view)
    const a = d.action
    if (a.type === 'ask' && a.card === ev.card && a.target === ev.target) {
      agree++
      return
    }
    if (a.type !== 'ask') notAsk++
    if (shown.length < SHOW) shown.push(`  ${rec.label} event ${i}: recorded ${ev.card} at seat ${ev.target}, replayed ${a.type === 'ask' ? `${a.card} at seat ${a.target}` : a.type}`)
  })
}
const held = n > 0 && agree === n
console.log(`pin-stub-asks: ${files.length} file(s), ${games} games, ${n} of the package's ask decisions replayed in-engine, ${((Date.now() - t0) / 1000).toFixed(1)} s`)
console.log(`  weights ${source}, md5 ${md5}, arch ${JSON.stringify(NET.arch)}`)
console.log(`  agree ${agree} of ${n} (${n > 0 ? ((100 * agree) / n).toFixed(3) : '-'}%), differ ${n - agree} (not an ask ${notAsk})`)
for (const s of shown) console.log(s)
console.log(held ? 'PIN HOLDS' : 'PIN FAILS')
process.exitCode = held ? 0 : 1
