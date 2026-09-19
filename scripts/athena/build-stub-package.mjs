/**
 * build-stub-package.mjs: build the ATHENA-stub FishLab package (ATHENA.md §4.5 item 6, G0d).
 *
 *     node scripts/athena/build-stub-package.mjs [--weights <file>] [--out <dir>]
 *
 * Produces `dist/athena-stub/` (the unpacked package) and `dist/athena-stub.zip` (the upload), on the pattern of
 * `scripts/build-bot-package.mjs`:
 *
 * - **The code** is `athena-stub/` (the adapter: `bot.mjs`, `bridge.mjs`, `README.md`, `fishbot.json`) plus the
 *   runtime import closure of `lib/athena/index.ts`, type-stripped by Node's own `module.stripTypeScriptTypes` with
 *   `.ts` specifiers rewritten to `.js`, and nothing else touched. It lands under `lib/` in the package, at the paths
 *   it has in the repository, so the package's engine is the repository's with the annotations whitened out.
 * - **The weights** are the stub's frozen network: `lib/athena/net.ts`'s `initBlob` at size S from the seed in
 *   `athena-stub/stub-weights.json`, serialised as `athena-weights-1`. The build refuses unless the file's md5 equals
 *   the one `athena-stub/fishbot.json` pins (`env.ATHENA_WEIGHTS_MD5`): the stub is a fixed weight file, and a change to
 *   the init or the format has to change the pin on purpose.
 * - `--weights <file>` packages another weight file instead (for example a perturbed one, for the pin's mutation
 *   check): the manifest then pins that file's md5, and `--out` keeps it out of the frozen package's directory.
 *
 * The zip is spec-clean in the same way as the Bass package's: forward-slash relative names, deflate or store, no
 * ZIP64, a fixed timestamp, so the same tree gives the same bytes.
 */
import { createHash } from 'node:crypto'
import { stripTypeScriptTypes } from 'node:module'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ENTRY = join(ROOT, 'lib/athena/index.ts')
const LIB = join(ROOT, 'lib')
const ADAPTER = join(ROOT, 'athena-stub')

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const WEIGHTS_IN = argOf('--weights', '')
const OUT_DIR = resolve(ROOT, argOf('--out', 'dist/athena-stub'))
const ZIP_PATH = `${OUT_DIR}.zip`

const A = await import(pathToFileURL(ENTRY).href)

/* ------------------------------------------------------------------------------------- the engine closure --- */

function runtimeSpecifiers(code) {
  const out = []
  for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+\.ts)['"]/g)) out.push(m[1])
  return out
}

function collect() {
  const files = new Map()
  const queue = [ENTRY]
  while (queue.length > 0) {
    const abs = queue.shift()
    if (files.has(abs)) continue
    const stripped = stripTypeScriptTypes(readFileSync(abs, 'utf8'), { mode: 'strip' })
    files.set(abs, stripped.replaceAll(/(['"])([^'"]+)\.ts\1/g, '$1$2.js$1'))
    for (const spec of runtimeSpecifiers(stripped)) {
      if (!spec.startsWith('.')) throw new Error(`${abs} imports a bare specifier ${spec}: the package must be dependency-free`)
      queue.push(resolve(dirname(abs), spec))
    }
  }
  return files
}

/* ------------------------------------------------------------------------------------------------ the zip --- */

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC[(c ^ buf[i]) & 0xff]
  return (c ^ -1) >>> 0
}
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

function writeZip(entries, outPath) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data } of entries) {
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) throw new Error(`refusing entry name ${JSON.stringify(name)}`)
    const nameBuf = Buffer.from(name, 'utf8')
    const deflated = deflateRawSync(data, { level: 9 })
    const stored = deflated.length >= data.length
    const body = stored ? data : deflated
    const crc = crc32(data)
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(stored ? 0 : 8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    nameBuf.copy(local, 30)
    locals.push(local, body)
    const central = Buffer.alloc(46 + nameBuf.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(stored ? 0 : 8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    nameBuf.copy(central, 46)
    centrals.push(central)
    offset += local.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  writeFileSync(outPath, Buffer.concat([...locals, cd, eocd]))
}

/* ---------------------------------------------------------------------------------------------- the build --- */

const manifest = JSON.parse(readFileSync(join(ADAPTER, 'fishbot.json'), 'utf8'))
const spec = JSON.parse(readFileSync(join(ADAPTER, 'stub-weights.json'), 'utf8'))
const weightName = manifest.env.ATHENA_WEIGHTS
let weightBytes
let label
if (WEIGHTS_IN) {
  weightBytes = readFileSync(resolve(ROOT, WEIGHTS_IN))
  A.parseWeights(new Uint8Array(weightBytes.buffer, weightBytes.byteOffset, weightBytes.byteLength))
  label = `the weight file ${WEIGHTS_IN}`
} else {
  const arch = A.ARCHS[spec.arch]
  const net = { arch, blob: A.initBlob(arch, spec.seed), meta: { stub: true, size: spec.arch, seed: spec.seed, init: A.INIT_SCHEME } }
  weightBytes = Buffer.from(A.serializeWeights(net))
  label = `the frozen stub (size ${spec.arch}, seed ${JSON.stringify(spec.seed)})`
}
const md5 = createHash('md5').update(weightBytes).digest('hex')
if (!WEIGHTS_IN && md5 !== manifest.env.ATHENA_WEIGHTS_MD5) {
  throw new Error(`the stub's weights have md5 ${md5}, but athena-stub/fishbot.json pins ${manifest.env.ATHENA_WEIGHTS_MD5}: the init or the format changed`)
}
const outManifest = { ...manifest, env: { ...manifest.env, ATHENA_WEIGHTS_MD5: md5 } }
if (WEIGHTS_IN) outManifest.description = `${manifest.description} THIS BUILD CARRIES A DIFFERENT WEIGHT FILE (${WEIGHTS_IN}).`
const declared = readFileSync(join(ADAPTER, 'bot.mjs'), 'utf8')
for (const [field, re] of [['name', /const NAME = '([^']+)'/], ['version', /const VERSION = '([^']+)'/]]) {
  const found = declared.match(re)
  if (found === null || found[1] !== manifest[field]) throw new Error(`fishbot.json ${field} = ${JSON.stringify(manifest[field])} but bot.mjs says ${JSON.stringify(found && found[1])}`)
}

rmSync(OUT_DIR, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
mkdirSync(OUT_DIR, { recursive: true })
const entries = []
const emit = (name, data) => {
  const abs = join(OUT_DIR, name)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, data)
  entries.push({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8') })
}
const engine = collect()
for (const [abs, code] of engine) emit(posix.join('lib', relative(LIB, abs).replaceAll('\\', '/')).replace(/\.ts$/, '.js'), code)
for (const file of readdirSync(ADAPTER)) {
  if (!statSync(join(ADAPTER, file)).isFile() || file === 'fishbot.json' || file === 'stub-weights.json') continue
  emit(file, readFileSync(join(ADAPTER, file)))
}
emit('fishbot.json', `${JSON.stringify(outManifest, null, 2)}\n`)
emit('package.json', `${JSON.stringify({ type: 'module' }, null, 2)}\n`)
emit(weightName, weightBytes)
entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
writeZip(entries, ZIP_PATH)

const zipBytes = statSync(ZIP_PATH).size
console.log(`weights        : ${label}, ${weightBytes.length.toLocaleString('en-US')} bytes, md5 ${md5}`)
console.log(`engine modules : ${engine.size}`)
console.log(`package files  : ${entries.length}`)
console.log(`unpacked       : ${relative(ROOT, OUT_DIR).replaceAll('\\', '/')}`)
console.log(`zip            : ${relative(ROOT, ZIP_PATH).replaceAll('\\', '/')} (${(zipBytes / 1024).toFixed(1)} KiB)`)
if (zipBytes > 64 * 1024 * 1024) throw new Error('the zip exceeds the 64 MB limit of a FishLab package')
