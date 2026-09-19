/**
 * emit-bridge-views.mjs: the reference side of ATHENA P0's G0a (ii), the bridge walk (ATHENA.md §4.6 G0a (ii);
 * `scripts/athena/replay-format.md` §12).
 *
 *     node scripts/athena/emit-bridge-views.mjs [--records DIR] [--prefix panel-sestina-] [--out FILE]
 *         [--max-games N] [--no-repo-manifest]
 *
 * Every game of the bridge record files under DIR whose names start with the prefix is read by
 * `scripts/bridge-records.mjs`'s `readRecords` and walked by its `walkAsks`, unchanged. At every ask event, the view
 * that `walkAsks` hands its caller (the asking seat's own view: the reduced reveal, the score by team) is encoded
 * by `replay-codec.ts`'s `encodeView` with the reduced reveal, its log digested incrementally with the same reveal,
 * and digested. The asks of both sides are taken.
 *
 * One line a game goes to FILE (default `C:/Projects/FishAI-bench/athena/bridge-walk/<set>.tsv`, where the set is
 * the prefix without its trailing dash), in the file order of the records:
 *
 *     athena-bridge-view-1  cell  index  deal  rot  orient  events  asks  v  f  game
 *
 * - `v` is 16 hex a view digest, one per ask in event order. It is what the gate compares.
 * - `f` is 16 hex an ask: eight one-byte fingerprints, one per field of the view (§12.6), so a port can name the
 *   field of a divergence. It is a diagnostic, not the gate.
 * - `game` is the game digest: a fresh stream with the ASCII of `v`, then the ASCII of the decimal ask count.
 *
 * A manifest goes beside FILE (`<set>.manifest.json`) and is merged into `scripts/athena/bridge-walk-manifest.json`
 * under `sets.<set>`: per cell the games, events, asks (arm A's and SESTINA's), wrong declares, holders the host did
 * not reveal, views that show an unrevealed holder, the record file's SHA-256, and two aggregates of the game
 * digests: `aggregate` in file order, and `sortedAggregate` in (deal, rot) order, which does not depend on the order
 * in which the bridge's workers wrote their games.
 *
 * bridge-records.mjs resolves the engine from the working directory, so this script moves to the repository root
 * first. It refuses nothing about the tree's state, but records the revision, whether the tree was dirty (the
 * repository manifest excepted), and the working-tree blob ids of the reference files, so the manifest names what ran.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(HERE), '../..')
const samePath = (a, b) =>
  process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b)
if (!samePath(process.cwd(), ROOT)) process.chdir(ROOT)
const REC = await import(pathToFileURL(join(ROOT, 'scripts/bridge-records.mjs')).href)
const CODEC = await import(pathToFileURL(join(ROOT, 'scripts/athena/replay-codec.ts')).href)

export const FORMAT_BRIDGE = 'athena-bridge-view-1'
/** The fields of V (replay-format.md §4.7), in the order of the `f` column's eight fingerprints (§12.6). */
export const FIELDS = ['head', 'moveIndex', 'counts', 'score', 'sets', 'hand', 'logLength', 'logDigest']
const DEFAULT_RECORDS = 'C:/Projects/FishAI-bench/bridge/monet-v55/records'
const DEFAULT_PREFIX = 'panel-sestina-'
const DEFAULT_OUT_DIR = 'C:/Projects/FishAI-bench/athena/bridge-walk'
const REPO_MANIFEST = 'scripts/athena/bridge-walk-manifest.json'
/** The files whose code makes the expected views: the reference walk, the codec, and the engine pieces it calls. */
const REFERENCE_FILES = [
  'scripts/bridge-records.mjs',
  'scripts/athena/replay-codec.ts',
  'scripts/athena/emit-bridge-views.mjs',
  'lib/engine/views.ts',
  'lib/engine/cards.ts',
]

/**
 * The eight fields of an encoded view, as byte strings (§12.6): head (rules id, seat, phase, turn, window),
 * moveIndex, counts, score, the set block, the hand (its size byte and cards), the log length, the log digest.
 */
export function viewFields(v) {
  const h = v[145]
  const head = new Uint8Array(7)
  head.set(v.subarray(0, 2), 0)
  head.set(v.subarray(6, 11), 2)
  return [
    head,
    v.subarray(2, 6),
    v.subarray(11, 17),
    v.subarray(17, 19),
    v.subarray(19, 145),
    v.subarray(145, 146 + h),
    v.subarray(146 + h, 150 + h),
    v.subarray(150 + h, 166 + h),
  ]
}

/** The `f` entry of one view: per field, the last byte of its digest (the last two hex characters). */
export function fieldFingerprints(v) {
  let s = ''
  for (const b of viewFields(v)) s += CODEC.digestBytes(b).slice(14)
  return s
}

/** Does this encoded view show a resolved set with an unrevealed true holder (a NONE among its holders)? */
function showsHiddenHolder(v) {
  for (let b = 0; b < 9; b++) {
    const o = 19 + 14 * b
    if (v[o] === CODEC.NONE) continue
    for (let j = 0; j < 6; j++) if (v[o + 8 + j] === CODEC.NONE) return true
  }
  return false
}

/** The (deal, rot) of a record, from `readRecordFile`'s label `<file>:<deal>:<rot>`. */
function dealRot(rec) {
  const parts = rec.label.split(':')
  return { deal: parts[parts.length - 2], rot: parts[parts.length - 1] }
}

/**
 * Walk one translated record (`readRecordFile`'s output) with `walkAsks` and digest every ask's view.
 * Returns the columns of the game's line and its information counts.
 */
export function walkGame(rec) {
  const w = new CODEC.ByteWriter(256)
  const ew = new CODEC.ByteWriter(32)
  const logDigest = new CODEC.ByteDigest()
  let logN = 0
  let v = ''
  let f = ''
  let asks = 0
  let asksArmA = 0
  let hiddenViews = 0
  let asymmetricScoreViews = 0
  let last = null
  REC.walkAsks(rec, ({ i, ev, view }) => {
    if (view.log.length !== i) throw new Error(`${rec.label}: the view at event ${i} has a log of ${view.log.length}`)
    // the log digest is kept incrementally: each view's log extends the last one's (both are prefixes of the record)
    for (; logN < view.log.length; logN++) {
      ew.reset()
      CODEC.encodeEvent(ew, view.log[logN], 'reduced')
      logDigest.push(ew.buf, ew.n)
    }
    const logHex = logDigest.hex()
    w.reset()
    CODEC.encodeView(w, view, view.log.length, logHex, 'reduced')
    const bytes = w.bytes()
    v += CODEC.digestBytes(bytes)
    f += fieldFingerprints(bytes)
    asks++
    if (ev.asker % 2 === rec.teamA) asksArmA++
    if (showsHiddenHolder(bytes)) hiddenViews++
    if (view.score[0] !== view.score[1]) asymmetricScoreViews++
    last = { view, logHex }
  })
  // the incremental log digest against the log digested from scratch, once a game (at its last ask)
  if (last && CODEC.logDigestOf(last.view.log, 'reduced') !== last.logHex)
    throw new Error(`${rec.label}: the incremental log digest differs from the log digested whole`)
  let wrongDeclares = 0
  let hiddenHolders = 0
  let forcedDeclares = 0
  for (const e of rec.events) {
    if (e.type !== 'claim') continue
    if (e.forced) forcedDeclares++
    if (e.outcome !== `team${e.claimer % 2}`) {
      wrongDeclares++
      hiddenHolders += 6 - Object.keys(e.actualHolders).length
    }
  }
  const game = new CODEC.ByteDigest().pushAscii(v).pushAscii(String(asks)).hex()
  return {
    events: rec.events.length,
    asks,
    asksArmA,
    v,
    f,
    game,
    info: { wrongDeclares, forcedDeclares, hiddenHolders, hiddenViews, asymmetricScoreViews },
  }
}

/** Every game of one record file, walked: its TSV lines and the cell's aggregate entry. */
export function walkCell(file, maxGames = 0) {
  const cell = basename(file)
  const lines = []
  const digests = []
  const t = {
    cell,
    games: 0,
    events: 0,
    asks: 0,
    asksArmA: 0,
    asksArmB: 0,
    wrongDeclares: 0,
    forcedDeclares: 0,
    hiddenHolders: 0,
    hiddenViews: 0,
    asymmetricScoreViews: 0,
    asymmetricScoreViewsTeamA1: 0,
  }
  let index = 0
  for (const rec of REC.readRecordFile(file)) {
    if (maxGames > 0 && index >= maxGames) break
    const g = walkGame(rec)
    const { deal, rot } = dealRot(rec)
    lines.push(
      [FORMAT_BRIDGE, cell, index, deal, rot, rec.teamA, g.events, g.asks, g.v, g.f, g.game].join('\t'),
    )
    digests.push({ deal: Number(deal), rot: Number(rot), game: g.game })
    t.games++
    t.events += g.events
    t.asks += g.asks
    t.asksArmA += g.asksArmA
    t.asksArmB += g.asks - g.asksArmA
    for (const k of ['wrongDeclares', 'forcedDeclares', 'hiddenHolders', 'hiddenViews', 'asymmetricScoreViews'])
      t[k] += g.info[k]
    if (rec.teamA === 1) t.asymmetricScoreViewsTeamA1 += g.info.asymmetricScoreViews
    index++
  }
  t.aggregate = CODEC.aggregateDigest(digests.map((d) => d.game))
  const sorted = [...digests].sort((a, b) => a.deal - b.deal || a.rot - b.rot)
  t.sortedAggregate = CODEC.aggregateDigest(sorted.map((d) => d.game))
  return { lines, cell: t }
}

/**
 * Walk the games of a record file's text as `walkCell` walks a file. It is for tests, which hold a fixture rather
 * than a path (the project has no Node types for a test to write a file with). The text goes through
 * `readRecordFile` unchanged, by way of a temporary file.
 */
export function walkRecordText(text, cell = 'fixture-0.jsonl') {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'athena-bridge-'))
  try {
    const file = join(dir, cell)
    fs.writeFileSync(file, text)
    return walkCell(file)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** The totals of a list of cell entries. */
export function totalOf(cells) {
  const keys = [
    'games',
    'events',
    'asks',
    'asksArmA',
    'asksArmB',
    'wrongDeclares',
    'forcedDeclares',
    'hiddenHolders',
    'hiddenViews',
    'asymmetricScoreViews',
    'asymmetricScoreViewsTeamA1',
  ]
  const out = { cells: cells.length }
  for (const k of keys) out[k] = cells.reduce((s, c) => s + c[k], 0)
  return out
}

/* ------------------------------------------------------------------------ CLI --- */

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function main() {
  const argv = process.argv.slice(2)
  const argOf = (flag, dflt) => {
    const i = argv.indexOf(flag)
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt
  }
  const records = argOf('--records', DEFAULT_RECORDS)
  const prefix = argOf('--prefix', DEFAULT_PREFIX)
  const set = prefix.replace(/-$/, '') || 'all'
  const out = argOf('--out', `${DEFAULT_OUT_DIR}/${set}.tsv`)
  const maxGames = Number(argOf('--max-games', 0))
  const files = REC.recordFiles(records, prefix)
  if (files.length === 0) {
    console.error(`no record files under ${records} with the prefix "${prefix}"`)
    process.exit(2)
  }
  const t0 = Date.now()
  fs.mkdirSync(dirname(out), { recursive: true })
  const fd = fs.openSync(out, 'w')
  const cells = []
  for (const file of files) {
    const c0 = Date.now()
    const { lines, cell } = walkCell(file, maxGames)
    fs.writeSync(fd, lines.join('\n') + '\n')
    cell.recordSha256 = sha256File(file)
    cell.recordBytes = fs.statSync(file).size
    cells.push(cell)
    console.log(
      `${cell.cell}: ${cell.games} games, ${cell.asks} asks (arm A ${cell.asksArmA}, SESTINA ${cell.asksArmB}), ` +
        `${cell.wrongDeclares} wrong declares with ${cell.hiddenHolders} holders unrevealed; ` +
        `aggregate ${cell.aggregate}, sorted ${cell.sortedAggregate} (${((Date.now() - c0) / 1000).toFixed(1)}s)`,
    )
  }
  fs.closeSync(fd)
  const seconds = (Date.now() - t0) / 1000
  const total = totalOf(cells)
  // the repository manifest excepted: a second set's emission finds the first set's entry in it
  const status = git(['status', '--porcelain', '--', '.', `:(exclude)${REPO_MANIFEST}`])
  const blobs = {}
  for (const p of REFERENCE_FILES) blobs[p] = git(['hash-object', p])
  const entry = {
    format: FORMAT_BRIDGE,
    spec: 'scripts/athena/replay-format.md §12',
    registration: 'ATHENA.md §4.6 G0a (ii)',
    revision: git(['rev-parse', 'HEAD']),
    dirty: status === null ? null : status.length > 0,
    referenceBlobs: blobs,
    records: records.replace(/\\/g, '/'),
    prefix,
    expectedFile: out.replace(/\\/g, '/'),
    expectedSha256: sha256File(out),
    expectedBytes: fs.statSync(out).size,
    maxGames: maxGames || null,
    emitted: {
      date: new Date().toISOString(),
      command: `node scripts/athena/emit-bridge-views.mjs ${argv.join(' ')}`.trim(),
      node: process.versions.node,
      cpu: os.cpus()[0]?.model?.trim() ?? null,
      seconds,
    },
    total,
    cells,
  }
  fs.writeFileSync(out.replace(/\.tsv$/, '') + '.manifest.json', JSON.stringify(entry, null, 2) + '\n')
  if (!argv.includes('--no-repo-manifest')) {
    const path = join(ROOT, REPO_MANIFEST)
    let m = { format: FORMAT_BRIDGE, spec: entry.spec, registration: entry.registration, sets: {} }
    try {
      m = JSON.parse(fs.readFileSync(path, 'utf8'))
    } catch {
      // a first run writes a fresh manifest
    }
    m.sets = m.sets ?? {}
    // a re-emission replaces the set's reference half; a port result recorded under it belongs to the old
    // expected file and is dropped with it
    m.sets[set] = entry
    fs.writeFileSync(path, JSON.stringify(m, null, 2) + '\n')
  }
  console.log(
    `emit-bridge-views: ${files.length} cell(s), ${total.games} games, ${total.asks} asks ` +
      `(arm A ${total.asksArmA}, SESTINA ${total.asksArmB}), ${total.wrongDeclares} wrong declares, ` +
      `${total.hiddenHolders} holders unrevealed, ${total.hiddenViews} views show one; ${seconds.toFixed(1)}s -> ${out}`,
  )
}

if (process.argv[1] && samePath(process.argv[1], HERE)) main()
