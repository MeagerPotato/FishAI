/**
 * gen-holder-data.mjs - MONET.md 3.8ah: the holder clone's rows from the bridge records. At every SESTINA ask
 * decision (a sample), for every card the asking seat cannot place (two or more candidate seats), one feature
 * row per candidate (`holderFeatureRows`, lib/engine/bots/holder.ts) with the true holder marked - the records
 * carry the deal (their engine's output: data, not code) - for scripts/fit-imitation.mjs, which reads the kind off
 * the header. The same file layout as gen-imitation-data.mjs, a card standing where an ask decision stood: rows
 * (Float32) [card id, chosen (0/1), the features...]; `<out>.dec` (Float32) [card id, file index, game index, event
 * index, candidates, the true holder's index, the marginal's argmax index, argmax right (0/1), holdout (0/1),
 * the asking seat]; `<out>.json` the header, with the baselines the fit is read against: the marginal's, the slot
 * prior's and the kappa prior's top-1 accuracy and mean NLL on the holdout and the training cards.
 *
 *   node scripts/gen-holder-data.mjs --records DIR[,DIR...] --out data/hold-1.bin
 *        [--prefix conf-] [--max-files 0] [--sample 0.02] [--holdout-mod 5] [--version v0.9] [--override '{...}']
 *        [--sample-salt s]
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const REC = await import(pathToFileURL(join(ROOT, 'scripts/bridge-records.mjs')).href)
const { hashSeed } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const DIRS = argOf('--records', '').split(',').filter(Boolean)
const OUT = argOf('--out', '')
const PREFIX = argOf('--prefix', '')
const MAXF = Number(argOf('--max-files', 0))
const SAMPLE = Number(argOf('--sample', 0.02))
const HOLD = Number(argOf('--holdout-mod', 5))
const VERSION = argOf('--version', 'v0.9')
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const SALT = argOf('--sample-salt', '')
if (DIRS.length === 0 || !OUT) {
  console.error('--records and --out are required')
  process.exit(2)
}
const pol0 = MON.monetPolicy(VERSION)
const pol = OVER ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...OVER }) }) : pol0
const { skill, style } = BOTS.resolvePolicy(pol)
// decide.ts's knowledgeOptions, verbatim (as gen-imitation-data.mjs): the marginal and its priors ride on `pModel`
const marginal = style.pModel === 'marginal'
const KOPTS = { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal, choiceKappa: marginal ? style.choiceKappa : undefined, choiceAdapt: marginal ? style.choiceAdapt : undefined, choicePrior: marginal ? style.choicePrior : undefined, licenceLambda: style.licenceLambda }
const NF = BOTS.HOLDER_FEATURE_COUNT
const COLS = NF + 2
const DCOLS = 10
const uniform = (key) => (hashSeed(key)() >>> 0) / 4294967296

// only files where arm B is the SESTINA spec (`--spec-b`; the default is SESTINA v1.0's) and arm A a bot of ours
const SPEC_B = argOf('--spec-b', 'v07:r12=25,rtie=1,pool=-1,oppfloor=-1,force=1000000,askfloor=-1,stall=12,s1=1,det=12,cand=4,kappa=2.5,rbelief=indep,depth=12,maxq=26')
let files = []
let skippedFiles = 0
for (const d of DIRS) {
  for (const f of REC.recordFiles(d, PREFIX)) {
    const h = REC.readHeader(f)
    if (h.specB !== SPEC_B || !String(h.specA).startsWith('bot:')) { skippedFiles++; console.error(`  skip ${f}: specA ${h.specA}, specB ${h.specB}`); continue }
    files.push(f)
  }
}
if (MAXF > 0) files = files.slice(0, MAXF)
if (skippedFiles > 0) console.error(`${skippedFiles} files skipped (arm B not ${SPEC_B})`)
const fdRows = fs.openSync(OUT, 'w')
const fdDec = fs.openSync(`${OUT}.dec`, 'w')
let cards = 0
let rows = 0
let askDecisions = 0
let sideDecisions = 0
let games = 0
let notFound = 0
// the baselines: per split, per prior, the argmax right and the NLL of the truth
const mk = () => ({ n: 0, marg: { top1: 0, nll: 0 }, slot: { top1: 0, nll: 0 }, kappa: { top1: 0, nll: 0 } })
const base = { train: mk(), holdout: mk() }
const account = (b, col, feats, chosen) => {
  let best = 0
  for (let j = 1; j < feats.length; j++) if (feats[j][col] > feats[best][col]) best = j
  if (best === chosen) b.top1++
  b.nll -= Math.log(Math.max(1e-12, feats[chosen][col]))
}
const t0 = Date.now()
for (let fi = 0; fi < files.length; fi++) {
  const holdout = fi % HOLD === 0
  let gi = 0
  for (const rec of REC.readRecordFile(files[fi])) {
    games++
    const g = gi++
    REC.walkAsks(rec, ({ i, ev, view, hands }) => {
      const isSestina = (ev.asker % 2) !== rec.teamA
      if (!isSestina) return
      sideDecisions++
      if (SAMPLE < 1 && uniform(`${rec.label}:${i}:hold${SALT ? ':' + SALT : ''}`) >= SAMPLE) return
      askDecisions++
      const k = BOTS.buildKnowledge(view, KOPTS)
      const ctx = BOTS.holderContext(view, k)
      const split = holdout ? base.holdout : base.train
      for (const card of ctx.unknownCards) {
        const truth = hands.findIndex((h) => h.includes(card))
        const { seats, rows: feats } = BOTS.holderFeatureRows(ctx, k, view, card)
        const chosen = seats.indexOf(truth)
        if (chosen < 0 || feats.length < 2) { notFound++; continue }
        let ours = 0
        for (let j = 1; j < feats.length; j++) if (feats[j][0] > feats[ours][0]) ours = j
        const id = cards++
        const chunk = new Float32Array(feats.length * COLS)
        for (let j = 0; j < feats.length; j++) {
          chunk[j * COLS] = id
          chunk[j * COLS + 1] = j === chosen ? 1 : 0
          chunk.set(feats[j], j * COLS + 2)
        }
        fs.writeSync(fdRows, Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))
        const d = Float32Array.from([id, fi, g, i, feats.length, chosen, ours, ours === chosen ? 1 : 0, holdout ? 1 : 0, ev.asker])
        fs.writeSync(fdDec, Buffer.from(d.buffer, d.byteOffset, d.byteLength))
        rows += feats.length
        split.n++
        account(split.marg, 0, feats, chosen)
        account(split.slot, 1, feats, chosen)
        account(split.kappa, 2, feats, chosen)
      }
    })
  }
  if ((fi + 1) % 10 === 0) console.error(`  ${fi + 1}/${files.length} files, ${askDecisions} decisions, ${cards} cards, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}
fs.closeSync(fdRows)
fs.closeSync(fdDec)
const secs = (Date.now() - t0) / 1000
const finish = (b) => ({ n: b.n, marg: { top1: b.n ? b.marg.top1 / b.n : 0, nll: b.n ? b.marg.nll / b.n : 0 }, slot: { top1: b.n ? b.slot.top1 / b.n : 0, nll: b.n ? b.slot.nll / b.n : 0 }, kappa: { top1: b.n ? b.kappa.top1 / b.n : 0, nll: b.n ? b.kappa.nll / b.n : 0 } })
const baselines = { train: finish(base.train), holdout: finish(base.holdout) }
const header = { kind: 'holder', cols: COLS, dcols: DCOLS, features: NF, names: [...BOTS.HOLDER_FEATURES], rows, decisions: cards, askDecisions, sideDecisions, games, files: files.length, fileNames: files.map((f) => f.replace(/\\/g, '/')), sample: SAMPLE, salt: SALT, holdoutMod: HOLD, version: VERSION, override: OVER, notFound, baselines, secs }
fs.writeFileSync(`${OUT}.json`, JSON.stringify(header))
const pct = (v) => (100 * v).toFixed(2) + '%'
console.log(`gen-holder-data: ${files.length} files, ${games} games, ${sideDecisions} SESTINA ask decisions, ${askDecisions} kept (sample ${SAMPLE}), ${cards} cards x ${(rows / Math.max(1, cards)).toFixed(2)} candidates = ${rows} rows x ${COLS}; holdout ${baselines.holdout.n} cards; ${notFound} cards whose holder was not a candidate; ${secs.toFixed(0)}s`)
for (const split of ['train', 'holdout']) {
  const b = baselines[split]
  console.log(`baselines (${split}, ${b.n} cards) - the marginal's argmax holds the card ${pct(b.marg.top1)} (NLL ${b.marg.nll.toFixed(4)}); the slot prior's ${pct(b.slot.top1)} (NLL ${b.slot.nll.toFixed(4)}); the kappa prior's ${pct(b.kappa.top1)} (NLL ${b.kappa.nll.toFixed(4)})`)
}
