/**
 * gen-imitation-data.mjs - MONET.md 3.8ac: SESTINA's ask decisions from the bridge records, as feature rows
 * over the legal asks (`askFeatureRows`, lib/engine/bots/imitation.ts) with the ask it chose marked, for
 * scripts/fit-imitation.mjs.
 *
 *   node scripts/gen-imitation-data.mjs --records DIR[,DIR...] --out data/imit-1.bin
 *        [--prefix conf-] [--max-files 0] [--sample 0.1] [--holdout-mod 5] [--side sestina|monet]
 *        [--version v0.9] [--override '{"contest":0.6,...}'] [--sample-salt b] [--features 1|2]
 *
 * Every game is replayed (scripts/bridge-records.mjs) and at every ask decision of the chosen side (SESTINA
 * by default: the team arm A did not play) the asking seat's view is rebuilt, the stack's knowledge and
 * ranked list are computed exactly as its own ask path would (the version's skill and style, the override
 * laid over), the feature rows are written for every legal ask with the chosen one marked, and the stack's
 * own choice at the same decision (`decide`) is recorded beside it - the agreement baseline the fit is
 * read against. `--sample q` keeps each decision with probability q (from the decision's own seed);
 * `--holdout-mod m` marks the games of every m-th file as the holdout (a split by FILE = by seed cell,
 * never by row). `--features 2` writes the second feature set (ASK_FEATURES_2, MONET.md 3.8af: the belief's seat)
 * in place of the first; the header records which. Row layout (Float32): decision id, chosen (0/1), the features; the decisions file
 * `<out>.dec` (Float32): decision id, file index, game index, event index, asks, chosen index, the stack's
 * index, hit (0/1), holdout (0/1), seat. `<out>.json` is the header.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const REC = await import(pathToFileURL(join(ROOT, 'scripts/bridge-records.mjs')).href)
const { hashSeed, decide } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const DIRS = argOf('--records', '').split(',').filter(Boolean)
const OUT = argOf('--out', '')
const PREFIX = argOf('--prefix', '')
const MAXF = Number(argOf('--max-files', 0))
const SAMPLE = Number(argOf('--sample', 1))
const HOLD = Number(argOf('--holdout-mod', 5))
const SIDE = argOf('--side', 'sestina')
const VERSION = argOf('--version', 'v0.9')
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const SALT = argOf('--sample-salt', '') // a different salt draws a different subset of the same records
if (DIRS.length === 0 || !OUT) {
  console.error('--records and --out are required')
  process.exit(2)
}
const pol0 = MON.monetPolicy(VERSION)
const pol = OVER ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...OVER }) }) : pol0
const { skill, style } = BOTS.resolvePolicy(pol)
// decide.ts's knowledgeOptions, verbatim: the marginal and its priors ride on `pModel`
const marginal = style.pModel === 'marginal'
const KOPTS = { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal, choiceKappa: marginal ? style.choiceKappa : undefined, choiceAdapt: marginal ? style.choiceAdapt : undefined, choicePrior: marginal ? style.choicePrior : undefined, licenceHold: marginal ? style.licenceHold : undefined }
const SET = Number(argOf('--features', 1))
if (SET !== 1 && SET !== 2) {
  console.error('--features must be 1 or 2')
  process.exit(2)
}
const NF = BOTS.askFeatureCount(SET)
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
let decisions = 0
let rows = 0
let agree = 0
let agreeHold = 0
let decHold = 0
let hits = 0
let top1 = 0
let top3 = 0
let notFound = 0
let games = 0
let sideDecisions = 0
const t0 = Date.now()
for (let fi = 0; fi < files.length; fi++) {
  const holdout = fi % HOLD === 0
  let gi = 0
  for (const rec of REC.readRecordFile(files[fi])) {
    games++
    const g = gi++
    REC.walkAsks(rec, ({ i, ev, view }) => {
      const isSestina = (ev.asker % 2) !== rec.teamA
      if ((SIDE === 'sestina') !== isSestina) return
      sideDecisions++
      if (SAMPLE < 1 && uniform(`${rec.label}:${i}:sample${SALT ? ':' + SALT : ''}`) >= SAMPLE) return
      const k = BOTS.buildKnowledge(view, KOPTS)
      const ranked = BOTS.rankAsksWith(view, k, style)
      const chosen = ranked.findIndex((r) => r.target === ev.target && r.card === ev.card)
      if (chosen < 0) { notFound++; return }
      const feats = BOTS.askFeatureRows(view, k, ranked, SET)
      const ours = decide(view, pol, hashSeed(`${rec.label}:cf:${i}`)())
      const ourIdx = ours.type === 'ask' ? ranked.findIndex((r) => r.target === ours.target && r.card === ours.card) : -1
      const id = decisions++
      const chunk = new Float32Array(ranked.length * COLS)
      for (let j = 0; j < ranked.length; j++) {
        chunk[j * COLS] = id
        chunk[j * COLS + 1] = j === chosen ? 1 : 0
        chunk.set(feats[j], j * COLS + 2)
      }
      fs.writeSync(fdRows, Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))
      const d = Float32Array.from([id, fi, g, i, ranked.length, chosen, ourIdx, ev.hit ? 1 : 0, holdout ? 1 : 0, ev.asker])
      fs.writeSync(fdDec, Buffer.from(d.buffer, d.byteOffset, d.byteLength))
      rows += ranked.length
      if (ourIdx === chosen) { agree++; if (holdout) agreeHold++ }
      if (holdout) decHold++
      if (ev.hit) hits++
      if (chosen === 0) top1++
      if (chosen < 3) top3++
    })
  }
  if ((fi + 1) % 10 === 0) console.error(`  ${fi + 1}/${files.length} files, ${decisions} decisions, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}
fs.closeSync(fdRows)
fs.closeSync(fdDec)
const secs = (Date.now() - t0) / 1000
const header = { cols: COLS, dcols: DCOLS, features: NF, featureSet: SET, names: [...BOTS.askFeatureNames(SET)], rows, decisions, files: files.length, fileNames: files.map((f) => f.replace(/\\/g, '/')), skippedFiles, specB: SPEC_B, games, side: SIDE, sideDecisions, sample: SAMPLE, sampleSalt: SALT, holdoutMod: HOLD, version: VERSION, override: OVER, agree, agreeHold, decHold, hits, top1, top3, notFound, secs }
fs.writeFileSync(`${OUT}.json`, JSON.stringify(header))
console.log(`gen-imitation-data: ${files.length} files, ${games} games, ${sideDecisions} ${SIDE} ask decisions, ${decisions} kept (sample ${SAMPLE}), ${rows} rows x ${COLS}; holdout ${decHold} decisions (files 0 mod ${HOLD}); the stack agrees with the chosen ask on ${((100 * agree) / Math.max(1, decisions)).toFixed(2)}% (holdout ${((100 * agreeHold) / Math.max(1, decHold)).toFixed(2)}%); the chosen ask is the ranker's top on ${((100 * top1) / Math.max(1, decisions)).toFixed(1)}%, in its top three on ${((100 * top3) / Math.max(1, decisions)).toFixed(1)}%; hit rate ${((100 * hits) / Math.max(1, decisions)).toFixed(2)}%; not in the ranking ${notFound}; ${secs.toFixed(0)}s -> ${OUT}`)
