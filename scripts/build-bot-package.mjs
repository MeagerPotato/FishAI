/**
 * build-bot-package.mjs — package FishAI as a FishLab bot package (docs/BOT_PACKAGE.md).
 *
 *     node scripts/build-bot-package.mjs
 *
 * Produces `dist/botpkg/` (the unpacked package) and `dist/bass-2.0.zip` (the upload).
 *
 * ## What it does, and the one thing it must not do
 *
 * The bot stack in `lib/engine/` is erasable-syntax TypeScript: every annotation can be deleted
 * without rewriting a statement, which is why Node runs it natively. This script deletes them —
 * through Node's own `module.stripTypeScriptTypes`, the same stripper `node file.ts` uses — and
 * rewrites the `.ts` import specifiers to `.js`. Nothing else is touched. No transform, no
 * bundler, no minifier, and no hand-editing: the packaged engine is the repository's engine with
 * the types whitened out, so a diff against the source is a diff of type annotations only.
 *
 * That matters because the point of the package is a *fair* export. A rewrite would be a new
 * bot with the old bot's name, and any difference in play would be unattributable.
 *
 * The set of files copied is the **runtime** import closure of `lib/engine/bots/index.ts`,
 * computed from the stripped output, so type-only modules (`lib/engine/types.ts`, the whole
 * `import type` graph) drop out on their own rather than by a list kept in this file.
 *
 * ## The zip
 *
 * Written here rather than shelled out to a zip tool, because BOT_PACKAGE.md §1 refuses several
 * things a general-purpose archiver will happily produce — absolute paths, `..`, symlinks,
 * ZIP64, compression methods other than store and deflate — and because Windows'
 * `Compress-Archive` has shipped versions that write `\` path separators into entry names, which
 * unpacks into one file with a backslash in its name on every other platform. Sixty lines of
 * deflate and two headers is cheaper than diagnosing that. Entries are stored with a fixed
 * timestamp, so the same tree always yields a byte-identical zip.
 */
import { deflateRawSync } from 'node:zlib'
import { stripTypeScriptTypes } from 'node:module'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(ROOT, 'lib/engine/bots/index.ts')
const ENGINE_ROOT = join(ROOT, 'lib/engine')
const ADAPTER_DIR = join(ROOT, 'botpkg')
const OUT_DIR = join(ROOT, 'dist/botpkg')
const ZIP_PATH = join(ROOT, 'dist/bass-2.0.zip')

/* ------------------------------------------------------- the engine sources --- */

/** Every `.ts` specifier that survives type-stripping — i.e. every runtime import. */
function runtimeSpecifiers(code) {
  const out = []
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+\.ts)['"]/g
  for (const m of code.matchAll(re)) out.push(m[1])
  return out
}

/** Breadth-first over the runtime import graph, starting at the bots barrel. */
function collectEngine() {
  const files = new Map()
  const queue = [ENTRY]
  while (queue.length > 0) {
    const abs = queue.shift()
    if (files.has(abs)) continue
    const src = readFileSync(abs, 'utf8')
    const stripped = stripTypeScriptTypes(src, { mode: 'strip' })
    files.set(abs, stripped.replaceAll(/(['"])([^'"]+)\.ts\1/g, '$1$2.js$1'))
    for (const spec of runtimeSpecifiers(stripped)) {
      if (!spec.startsWith('.')) throw new Error(`${abs} imports a bare specifier ${spec} — the package must be dependency-free`)
      queue.push(resolve(dirname(abs), spec))
    }
  }
  return files
}

/* ----------------------------------------------------------------- the zip --- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0 ^ -1
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff]
  return (c ^ -1) >>> 0
}

// A fixed MS-DOS timestamp (2026-01-01 00:00:00) so the build is reproducible.
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

/**
 * A spec-clean zip: forward-slash relative names, deflate only, no ZIP64, no extra fields, no
 * symlinks (there is nothing here but regular files), no entry larger than 4 GiB.
 */
function writeZip(entries, outPath) {
  const locals = []
  const centrals = []
  let offset = 0

  for (const { name, data } of entries) {
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) {
      throw new Error(`refusing to write entry name ${JSON.stringify(name)}`)
    }
    const nameBuf = Buffer.from(name, 'utf8')
    const deflated = deflateRawSync(data, { level: 9 })
    // Deflate can inflate incompressible input; fall back to store so the entry never grows.
    const stored = deflated.length >= data.length
    const body = stored ? data : deflated
    const method = stored ? 0 : 8
    const crc = crc32(data)

    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(DOS_TIME, 10)
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
    central.writeUInt16LE(20, 4) // version made by: 2.0, MS-DOS
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0, 8) // flags
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk
    central.writeUInt16LE(0, 36) // internal attrs
    central.writeUInt32LE(0, 38) // external attrs
    central.writeUInt32LE(offset, 42)
    nameBuf.copy(central, 46)
    centrals.push(central)

    offset += local.length + body.length
  }

  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  writeFileSync(outPath, Buffer.concat([...locals, cd, eocd]))
}

/* ------------------------------------------------------------------- build --- */

function emit(files, name, data) {
  const abs = join(OUT_DIR, name)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, data)
  files.push({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8') })
}

// `maxRetries` is not superstition on Windows: the package is a directory that gets spawned out
// of (every self-test child runs with its cwd here) and scanned by the indexer, and a handle
// that is closing can still fail an `rm` with EPERM for a few tens of milliseconds after the
// process holding it has gone. Without the retries the build fails intermittently on a machine
// that has just run the tests, which reads as a broken build rather than a busy directory.
rmSync(OUT_DIR, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
mkdirSync(OUT_DIR, { recursive: true })

const entries = []

const engine = collectEngine()
for (const [abs, code] of engine) {
  const name = posix.join('engine', relative(ENGINE_ROOT, abs).replaceAll('\\', '/')).replace(/\.ts$/, '.js')
  emit(entries, name, code)
}

for (const file of readdirSync(ADAPTER_DIR)) {
  if (!statSync(join(ADAPTER_DIR, file)).isFile()) continue
  emit(entries, file, readFileSync(join(ADAPTER_DIR, file)))
}

// The engine modules are emitted as `.js`, and every one of them is ESM. A `.js` file with no
// `"type"` in scope is CommonJS, so without this the package links only on the Node versions
// that retry an ambiguous `.js` as ESM (>= 20.19 / 22.7), and only when nothing above the
// unpack directory says otherwise. Everywhere else the very first import fails with
// "does not provide an export named 'cardBook'" before the handshake is answered — which the
// host reports as the process dying (§7), with nothing to suggest the cause is one missing
// file. It costs 20 bytes to state it instead of inheriting it.
emit(entries, 'package.json', `${JSON.stringify({ type: 'module' }, null, 2)}\n`)

// The manifest is generated rather than copied so `name`/`version` can never drift from the
// values bot.mjs reports in its `hello` reply — a mismatch the host would show on the felt.
const manifest = JSON.parse(readFileSync(join(ADAPTER_DIR, 'fishbot.json'), 'utf8'))
const declared = readFileSync(join(ADAPTER_DIR, 'bot.mjs'), 'utf8')
for (const [field, re] of [['name', /const NAME = '([^']+)'/], ['version', /const VERSION = '([^']+)'/]]) {
  const found = declared.match(re)
  if (found === null || found[1] !== manifest[field]) {
    throw new Error(`fishbot.json ${field} = ${JSON.stringify(manifest[field])} but bot.mjs says ${JSON.stringify(found && found[1])}`)
  }
}

entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
mkdirSync(dirname(ZIP_PATH), { recursive: true })
writeZip(entries, ZIP_PATH)

const bytes = entries.reduce((n, e) => n + e.data.length, 0)
const zipBytes = statSync(ZIP_PATH).size
console.log(`engine modules : ${engine.size}`)
console.log(`package files  : ${entries.length} (${(bytes / 1024).toFixed(1)} KiB unpacked)`)
console.log(`unpacked       : ${relative(ROOT, OUT_DIR)}`)
console.log(`zip            : ${relative(ROOT, ZIP_PATH)} (${(zipBytes / 1024).toFixed(1)} KiB)`)
if (zipBytes > 64 * 1024 * 1024) throw new Error('zip exceeds the 64 MB limit of BOT_PACKAGE.md §1')
