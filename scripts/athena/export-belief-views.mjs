/**
 * export-belief-views.mjs: the belief head's inputs and labels from the bridge records (ATHENA.md §8.3), in the
 * belief-views format that `scripts/athena/belief/data.py` also writes for population (a) from the port.
 *
 * At each selected ask (`walkAsks`, `scripts/bridge-records.mjs`: the asking seat's view under the host's reduced
 * reveal, the score by team) it writes what the port's buffers hold at an ask, from that seat's view:
 * - the obs row (`lib/athena/encode.ts` `encodeObservation`, the port's layout);
 * - the rules facts' candidate seats of every card as a six-bit mask, relative to the asker (bit r: relative seat r
 *   may hold the card), from `buildKnowledge(view, KOPTS)` (KOPTS as gen-holder-data.mjs derives them);
 * - the true holder of every card, relative (255 once its set has resolved): the critic buffer's label;
 * - how many of the seat's event rows precede the ask (the log so far).
 * Each (game, seat) with a selected ask has its whole log encoded once (`encodeEventRows`, relative to the seat, the
 * reduced reveal's absent holders as NONE); an ask's recurrent state folds the first `pos` rows.
 *
 * The unit (§3.8ah's) is the cards whose mask has two or more bits; the exporter asserts at every ask that this is
 * exactly `holderContext(view, k).unknownCards`, the set `belief-baselines.mjs` scores.
 *
 * Selections (one group's dirs per run, as gen-holder-data.mjs reads a group):
 * - (b)'s test views: `--side sestina --files holdout --sample 0.02 --sample-salt 35 --version v0.9 --override '{...}'`;
 * - D2's extra training views: `--side monet --files train` (every Monet ask of the group's non-holdout files);
 * - (c): `--side monet --files all --prefix panel-sestina-` over `monet-v55/records`.
 * `--side` picks the asker: `sestina` is the side that is not arm A (gen-holder-data.mjs's `isSestina`), `monet` is
 * arm A. The spec filter is gen-holder-data.mjs's, applied unless `--no-spec-filter`.
 *
 * The output directory holds `.npy` files (`meta.json` lists them) and `meta.json`: `streams` uint8 [R, 19];
 * `stream_off` int64 [G, 6] and `stream_len` int32 [G, 6] (a seat with no selected ask has length 0); `ask_game`
 * int32, `ask_seat` uint8, `ask_pos` int32, `ask_event` int32 [A]; `ask_obs` uint8 [A, 94]; `ask_cands` and
 * `ask_holder` uint8 [A, 54]; `game_key` (the cluster key, `<file>|<game index>` as belief-baselines.mjs writes it)
 * in `game_keys.json`.
 *
 *   node scripts/athena/export-belief-views.mjs --records "D1,D2" --side monet --files train --out <dir>
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href)
const ENG = await imp('lib/engine/index.ts')
const BOTS = await imp('lib/engine/bots/index.ts')
const MON = await imp('lib/engine/bots/monet.ts')
const ATH = await imp('lib/athena/index.ts')
const REC = await imp('scripts/bridge-records.mjs')
const { hashSeed } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const has = (flag) => process.argv.includes(flag)

export const FORMAT = 'athena-p1-belief-views-1'

/** An .npy file written as it grows: a fixed 128-byte header patched with the shape on close. */
class NpyWriter {
  constructor(path, descr, rowShape, bytesPerRow) {
    this.path = path
    this.descr = descr
    this.rowShape = rowShape
    this.bytesPerRow = bytesPerRow
    this.rows = 0
    this.fd = fs.openSync(path, 'w')
    fs.writeSync(this.fd, Buffer.alloc(128, 0x20))
    this.buf = Buffer.alloc(1 << 22)
    this.n = 0
  }

  write(bytes, rows) {
    if (this.n + bytes.length > this.buf.length) this.flush()
    if (bytes.length > this.buf.length) fs.writeSync(this.fd, bytes)
    else {
      bytes.copy ? bytes.copy(this.buf, this.n) : this.buf.set(bytes, this.n)
      this.n += bytes.length
    }
    this.rows += rows
  }

  flush() {
    if (this.n) fs.writeSync(this.fd, this.buf, 0, this.n)
    this.n = 0
  }

  close() {
    this.flush()
    const shape = [this.rows, ...this.rowShape]
    const shapeText = shape.length === 1 ? `(${shape[0]},)` : `(${shape.join(', ')})`
    let dict = `{'descr': '${this.descr}', 'fortran_order': False, 'shape': ${shapeText}, }`
    dict = dict.padEnd(128 - 10 - 1, ' ') + '\n'
    const head = Buffer.alloc(128)
    head.write('\x93NUMPY', 0, 'latin1')
    head[6] = 1
    head[7] = 0
    head.writeUInt16LE(118, 8)
    head.write(dict, 10, 'latin1')
    fs.writeSync(this.fd, head, 0, 128, 0)
    fs.closeSync(this.fd)
  }
}

const u8 = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)

async function main() {
  const dirs = argOf('--records', '').split(',').filter(Boolean)
  const out = argOf('--out', '')
  const side = argOf('--side', '')
  const which = argOf('--files', 'all')
  if (!dirs.length || !out || !['monet', 'sestina'].includes(side) || !['holdout', 'train', 'all'].includes(which)) {
    console.error('usage: --records D[,D] --side monet|sestina --files holdout|train|all --out DIR [...]')
    process.exit(2)
  }
  const prefix = argOf('--prefix', '')
  const sample = Number(argOf('--sample', 1))
  const salt = argOf('--sample-salt', '')
  const hold = Number(argOf('--holdout-mod', 5))
  const maxFiles = Number(argOf('--max-files', 0))
  const maxGames = Number(argOf('--max-games', 0))
  const version = argOf('--version', 'v1.0')
  const override = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
  const pol0 = MON.monetPolicy(version)
  const pol = override ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...override }) }) : pol0
  const { skill, style } = BOTS.resolvePolicy(pol)
  const marginal = style.pModel === 'marginal'
  // gen-holder-data.mjs's KOPTS; the candidate seats do not read the marginal, which is left off here
  const KOPTS = { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal: false, choiceKappa: marginal ? style.choiceKappa : undefined, choiceAdapt: marginal ? style.choiceAdapt : undefined, choicePrior: marginal ? style.choicePrior : undefined, licenceLambda: style.licenceLambda }
  const specB = argOf('--spec-b', 'v07:r12=25,rtie=1,pool=-1,oppfloor=-1,force=1000000,askfloor=-1,stall=12,s1=1,det=12,cand=4,kappa=2.5,rbelief=indep,depth=12,maxq=26')
  const uniform = (key) => (hashSeed(key)() >>> 0) / 4294967296

  let files = []
  for (const d of dirs) {
    for (const f of REC.recordFiles(d, prefix)) {
      const h = REC.readHeader(f)
      if (!has('--no-spec-filter') && (h.specB !== specB || !String(h.specA).startsWith('bot:'))) continue
      files.push(f)
    }
  }
  if (maxFiles > 0) files = files.slice(0, maxFiles)

  fs.mkdirSync(out, { recursive: true })
  const W = {
    streams: new NpyWriter(join(out, 'streams.npy'), '|u1', [ATH.EVENT_LEN], ATH.EVENT_LEN),
    ask_game: new NpyWriter(join(out, 'ask_game.npy'), '<i4', [], 4),
    ask_seat: new NpyWriter(join(out, 'ask_seat.npy'), '|u1', [], 1),
    ask_pos: new NpyWriter(join(out, 'ask_pos.npy'), '<i4', [], 4),
    ask_event: new NpyWriter(join(out, 'ask_event.npy'), '<i4', [], 4),
    ask_obs: new NpyWriter(join(out, 'ask_obs.npy'), '|u1', [ATH.OBS_LEN], ATH.OBS_LEN),
    ask_cands: new NpyWriter(join(out, 'ask_cands.npy'), '|u1', [54], 54),
    ask_holder: new NpyWriter(join(out, 'ask_holder.npy'), '|u1', [54], 54),
    stream_off: new NpyWriter(join(out, 'stream_off.npy'), '<i8', [6], 48),
    stream_len: new NpyWriter(join(out, 'stream_len.npy'), '<i4', [6], 24),
  }
  const keys = []
  let rowsWritten = 0
  let asks = 0
  let units = 0
  let sideAsks = 0
  let games = 0
  const obs = new Uint8Array(ATH.OBS_LEN)
  const legal = new Uint8Array(ATH.LEGAL_LEN)
  const t0 = Date.now()
  outer: for (let fi = 0; fi < files.length; fi++) {
    const holdout = fi % hold === 0
    if ((which === 'holdout' && !holdout) || (which === 'train' && holdout)) continue
    const fname = files[fi].replace(/\\/g, '/')
    let gi = 0
    for (const rec of REC.readRecordFile(files[fi])) {
      if (maxGames > 0 && games >= maxGames) break outer
      const g = gi++
      const seats = new Set()
      const pending = []
      REC.walkAsks(rec, ({ i, ev, view, hands }) => {
        const isArmA = (ev.asker % 2) === rec.teamA
        if (side === 'monet' ? !isArmA : isArmA) return
        sideAsks++
        if (sample < 1 && uniform(`${rec.label}:${i}:hold${salt ? ':' + salt : ''}`) >= sample) return
        const me = ev.asker
        const k = BOTS.buildKnowledge(view, KOPTS)
        const ctx = BOTS.holderContext(view, k)
        const cands = new Uint8Array(54)
        const holder = new Uint8Array(54).fill(ATH.NONE)
        for (let c = 0; c < 54; c++) {
          const card = ATH.CARDS[c]
          for (const s of k.cands[card] ?? []) cands[c] |= 1 << ATH.rel(s, me)
          const x = hands.findIndex((h) => h.includes(card))
          if (x >= 0) holder[c] = ATH.rel(x, me)
        }
        const unit = new Set(ctx.unknownCards.map((card) => ATH.cardIndex(card)))
        for (let c = 0; c < 54; c++) {
          const bits = ((cands[c] >> 0) & 1) + ((cands[c] >> 1) & 1) + ((cands[c] >> 2) & 1) + ((cands[c] >> 3) & 1) + ((cands[c] >> 4) & 1) + ((cands[c] >> 5) & 1)
          if ((bits >= 2) !== unit.has(c)) throw new Error(`${rec.label} event ${i}: card ${ATH.CARDS[c]} has ${bits} candidates but is ${unit.has(c) ? '' : 'not '}a unit card`)
          if (bits >= 2) {
            if (holder[c] === ATH.NONE || !((cands[c] >> holder[c]) & 1)) throw new Error(`${rec.label} event ${i}: card ${ATH.CARDS[c]}'s holder is not a candidate`)
            units++
          }
        }
        ATH.encodeObservation(view, obs, legal)
        seats.add(me)
        pending.push({ me, i, obs: Uint8Array.from(obs), cands, holder })
      })
      if (!pending.length) continue
      const off = new BigInt64Array(6)
      const len = new Int32Array(6)
      for (let s = 0; s < 6; s++) {
        if (!seats.has(s)) {
          off[s] = BigInt(rowsWritten)
          continue
        }
        const rows = ATH.encodeEventRows(rec.events, s)
        off[s] = BigInt(rowsWritten)
        len[s] = rows.length / ATH.EVENT_LEN
        W.streams.write(u8(rows), len[s])
        rowsWritten += len[s]
      }
      const gid = keys.length
      keys.push(`${fname}|${g}`)
      W.stream_off.write(u8(off), 1)
      W.stream_len.write(u8(len), 1)
      for (const p of pending) {
        W.ask_game.write(u8(Int32Array.of(gid)), 1)
        W.ask_seat.write(Buffer.of(p.me), 1)
        W.ask_pos.write(u8(Int32Array.of(p.i)), 1)
        W.ask_event.write(u8(Int32Array.of(p.i)), 1)
        W.ask_obs.write(u8(p.obs), 1)
        W.ask_cands.write(u8(p.cands), 1)
        W.ask_holder.write(u8(p.holder), 1)
        asks++
      }
      games++
    }
    console.error(`  ${fi + 1}/${files.length} ${fname}: ${games} games, ${asks} asks, ${units} unit cards, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  }
  for (const w of Object.values(W)) w.close()
  fs.writeFileSync(join(out, 'game_keys.json'), JSON.stringify(keys))
  const meta = {
    format: FORMAT, source: 'records', side, files: which, records: dirs, prefix, sample, salt, holdoutMod: hold,
    version, override, kopts: KOPTS, fileNames: files.map((f) => f.replace(/\\/g, '/')), games, asks, sideAsks, units,
    rows: rowsWritten, secs: (Date.now() - t0) / 1000, arrays: Object.keys(W), command: process.argv.slice(1).join(' '),
  }
  fs.writeFileSync(join(out, 'meta.json'), JSON.stringify(meta, null, 1))
  console.log(`export-belief-views: ${games} games, ${asks} asks of ${sideAsks} on the ${side} side, ${units} unit cards, ${rowsWritten} event rows, ${meta.secs.toFixed(0)}s -> ${out}`)
}

await main()
