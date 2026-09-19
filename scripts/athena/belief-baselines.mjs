/**
 * belief-baselines.mjs: ATHENA.md §8.3's belief unit and its scorer, Step 1's baselines (the marginal and the slot
 * prior) on the three populations, with the cluster bootstrap over games.
 *
 * **The unit** is MONET.md §3.8ah's, exactly as `scripts/gen-holder-data.mjs` builds it, through the same calls: at an
 * ask decision, from the asking seat's view, `buildKnowledge(view, KOPTS)` with KOPTS as that script derives them
 * (decide.ts's knowledge options for the named Monet version, plus `--override`), then every card of
 * `holderContext(view, k).unknownCards` (an open set's cards with two or more candidate seats, in deck order), each
 * scored by `holderFeatureRows`: column 0 is the marginal (`askHitProbability`), column 1 the slot prior, column 2 the
 * kappa prior (information). Top-1 is the argmax over the candidates, the first maximum winning; the NLL is
 * -ln max(1e-12, p(true holder)). A card whose true holder is not a candidate is counted as notFound and skipped.
 *
 * **The populations** (`extract --pop`):
 * - `a`: stored home games (`gen-belief-games.py`'s parts, `--games DIR`), replayed through the reference engine
 *   (`newGame` + `reduce`, the port's codes decoded by `opponent-core.ts`), every ask of every seat. The cluster is
 *   the game: seed, start seat and the md5 of its actions, so geometry B's identical mirror rotations are one cluster.
 * - `b`: the bridge records' SESTINA asks as gen-holder-data.mjs samples them: `--records` (one group's dirs), the
 *   spec filter, `--sample`, `--sample-salt`, `--holdout-mod`, `--version`, `--override`, all as that script reads
 *   them. The holdout is `fi % mod === 0` over the group's own file list. The cluster is (file, game).
 * - `c`: every arm-A (Monet) ask in `--records` (files or dirs, `--prefix`), no sample; everything is test.
 *
 * `extract` writes `<out>.json` (the totals, accumulated card by card in gen-holder-data.mjs's order, so its numbers
 * are directly comparable) and `<out>.clusters.tsv` (per cluster and split: cards, and per belief the top-1 count and
 * the NLL sum). `boot` pools cluster files, keeps one split, and resamples clusters with replacement (`--resamples`
 * 1,000, the RNG `mulberry32(hashSeed(--seed))`, default seed `athena-p1-boot`, index floor(u * G) over the clusters
 * sorted by key): the SE of each metric is the SD of its 1,000 resampled ratios. A cluster file from another scorer
 * (a head's) may join by key; every shared cluster must hold the same number of cards, and differences are
 * bootstrapped on the same resamples.
 *
 *   node scripts/athena/belief-baselines.mjs extract --pop a --games <games>/test --out <dir>/a-test
 *   node scripts/athena/belief-baselines.mjs extract --pop b --records "D1,D2" --sample 0.02 --sample-salt 35 \
 *        --holdout-mod 5 --override '{"contest":0.6,"closing":0.5,"closingFour":2}' --version v0.9 --out <dir>/b-1
 *   node scripts/athena/belief-baselines.mjs extract --pop c --records <monet-v55/records> --prefix panel-sestina- --out <dir>/c
 *   node scripts/athena/belief-baselines.mjs boot --clusters <dir>/b-1.clusters.tsv,... --split holdout --out <dir>/b.json
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href)
const ENG = await imp('lib/engine/index.ts')
const BOTS = await imp('lib/engine/bots/index.ts')
const MON = await imp('lib/engine/bots/monet.ts')
const CORE = await imp('scripts/athena/opponent-core.ts')
const { readNpz } = await imp('scripts/athena/npz.mjs')
const { hashSeed, mulberry32, newGame, reduce, us54Config, seatView, legalActionsSummary } = ENG

const BELIEFS = ['marg', 'slot', 'kappa']
const COL = { marg: 0, slot: 1, kappa: 2 }

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}

/** gen-holder-data.mjs's KOPTS, verbatim in derivation. */
export function knowledgeOptions(version, override) {
  const pol0 = MON.monetPolicy(version)
  const pol = override ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...override }) }) : pol0
  const { skill, style } = BOTS.resolvePolicy(pol)
  const marginal = style.pModel === 'marginal'
  return { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal, choiceKappa: marginal ? style.choiceKappa : undefined, choiceAdapt: marginal ? style.choiceAdapt : undefined, choicePrior: marginal ? style.choicePrior : undefined, licenceLambda: style.licenceLambda }
}

/* ---------------------------------------------------------------------------------------- the scorer --- */

const mk = () => ({ n: 0, marg: { top1: 0, nll: 0 }, slot: { top1: 0, nll: 0 }, kappa: { top1: 0, nll: 0 } })

class Scorer {
  constructor(kopts) {
    this.kopts = kopts
    this.base = { train: mk(), holdout: mk(), test: mk() }
    this.clusters = new Map() // `${split}\t${key}` -> [n, top1 x3, nll x3]
    this.decisions = { train: 0, holdout: 0, test: 0 }
    this.notFound = 0
  }

  /** One ask decision: the asking seat's view and the true hands (seat -> cards) at that moment. */
  score(view, hands, split, key) {
    this.decisions[split]++
    const k = BOTS.buildKnowledge(view, this.kopts)
    const ctx = BOTS.holderContext(view, k)
    const b = this.base[split]
    const ck = `${split}\t${key}`
    let cl = this.clusters.get(ck)
    for (const card of ctx.unknownCards) {
      const truth = hands.findIndex((h) => h.includes(card))
      const { seats, rows: feats } = BOTS.holderFeatureRows(ctx, k, view, card)
      const chosen = seats.indexOf(truth)
      if (chosen < 0 || feats.length < 2) {
        this.notFound++
        continue
      }
      if (!cl) {
        cl = new Float64Array(1 + 2 * BELIEFS.length)
        this.clusters.set(ck, cl)
      }
      b.n++
      cl[0]++
      BELIEFS.forEach((name, bi) => {
        const col = COL[name]
        let best = 0
        for (let j = 1; j < feats.length; j++) if (feats[j][col] > feats[best][col]) best = j
        const right = best === chosen ? 1 : 0
        const nll = -Math.log(Math.max(1e-12, feats[chosen][col]))
        b[name].top1 += right
        b[name].nll += nll
        cl[1 + bi] += right
        cl[1 + BELIEFS.length + bi] += nll
      })
    }
  }

  summary() {
    const fin = (b) => ({ n: b.n, ...Object.fromEntries(BELIEFS.map((x) => [x, { top1: b.n ? b[x].top1 / b.n : 0, nll: b.n ? b[x].nll / b.n : 0 }])) })
    return { train: fin(this.base.train), holdout: fin(this.base.holdout), test: fin(this.base.test) }
  }

  writeClusters(file) {
    const head = ['split', 'key', 'n', ...BELIEFS.map((x) => `${x}.top1`), ...BELIEFS.map((x) => `${x}.nll`)].join('\t')
    const lines = [head]
    for (const [ck, v] of this.clusters) lines.push(`${ck}\t${Array.from(v).map((x, i) => (i <= BELIEFS.length ? String(x) : x.toPrecision(17))).join('\t')}`)
    fs.writeFileSync(file, lines.join('\n') + '\n')
  }
}

/* ------------------------------------------------------------------------------------- population (a) --- */

function partFiles(dir) {
  return fs.readdirSync(dir).filter((f) => /^part-\d+\.npz$/.test(f)).sort().map((f) => join(dir, f))
}

function extractA(sc, dir, maxGames) {
  let games = 0
  let asks = 0
  let steps = 0
  let scoreMismatch = 0
  for (const file of partFiles(dir)) {
    const z = readNpz(file)
    const n = z.index.data.length
    for (let i = 0; i < n; i++) {
      if (maxGames > 0 && games >= maxGames) return { games, asks, steps, scoreMismatch }
      const seed = z.seed.data[i]
      const start = z.start.data[i]
      const lo = Number(z.offsets.data[i])
      const hi = Number(z.offsets.data[i + 1])
      const acts = z.actions.data.subarray(lo, hi)
      const key = `${seed}|${start}|${createHash('md5').update(Buffer.from(acts.buffer, acts.byteOffset, acts.byteLength)).digest('hex')}`
      let state = newGame(seed, us54Config, start)
      for (let t = 0; t < acts.length; t++) {
        const acting = legalActionsSummary(state).seat
        const action = CORE.actionOfCode(acting, acts[t])
        if (action.type === 'ask') {
          asks++
          sc.score(seatView(state, acting), state.hands, 'test', key)
        }
        const r = reduce(state, action)
        if (!r.ok) throw new Error(`${seed} start ${start}: the reference refuses step ${t} (${r.error.code})`)
        state = r.state
      }
      steps += acts.length
      if (state.phase !== 'finished') throw new Error(`${seed} start ${start}: not finished after ${acts.length} actions`)
      if (state.score[0] !== z.score.data[2 * i] || state.score[1] !== z.score.data[2 * i + 1]) scoreMismatch++
      games++
    }
    console.error(`  ${basename(file)}: ${games} games, ${asks} asks, ${sc.base.test.n} cards`)
  }
  return { games, asks, steps, scoreMismatch }
}

/* ---------------------------------------------------------------------------------- populations (b), (c) --- */

async function extractRecords(sc, pop) {
  const REC = await imp('scripts/bridge-records.mjs')
  const dirs = argOf('--records', '').split(',').filter(Boolean)
  const prefix = argOf('--prefix', '')
  const maxFiles = Number(argOf('--max-files', 0))
  const sample = Number(argOf('--sample', pop === 'b' ? 0.02 : 1))
  const hold = Number(argOf('--holdout-mod', 5))
  const salt = argOf('--sample-salt', '')
  const specB = argOf('--spec-b', 'v07:r12=25,rtie=1,pool=-1,oppfloor=-1,force=1000000,askfloor=-1,stall=12,s1=1,det=12,cand=4,kappa=2.5,rbelief=indep,depth=12,maxq=26')
  const uniform = (key) => (hashSeed(key)() >>> 0) / 4294967296
  let files = []
  let skippedFiles = 0
  for (const d of dirs) {
    for (const f of REC.recordFiles(d, prefix)) {
      const h = REC.readHeader(f)
      // gen-holder-data.mjs's filter for (b); (c) is the named files, whole
      if (pop === 'b' && (h.specB !== specB || !String(h.specA).startsWith('bot:'))) { skippedFiles++; continue }
      files.push(f)
    }
  }
  if (maxFiles > 0) files = files.slice(0, maxFiles)
  let games = 0
  let sideDecisions = 0
  let askDecisions = 0
  const t0 = Date.now()
  for (let fi = 0; fi < files.length; fi++) {
    const holdout = fi % hold === 0
    const split = pop === 'c' ? 'test' : holdout ? 'holdout' : 'train'
    const fname = files[fi].replace(/\\/g, '/')
    let gi = 0
    for (const rec of REC.readRecordFile(files[fi])) {
      games++
      const g = gi++
      const key = `${fname}|${g}`
      REC.walkAsks(rec, ({ i, ev, view, hands }) => {
        const ours = (ev.asker % 2) === rec.teamA
        if (pop === 'b' ? ours : !ours) return
        sideDecisions++
        if (sample < 1 && uniform(`${rec.label}:${i}:hold${salt ? ':' + salt : ''}`) >= sample) return
        askDecisions++
        sc.score(view, hands, split, key)
      })
    }
    if ((fi + 1) % 10 === 0) console.error(`  ${fi + 1}/${files.length} files, ${askDecisions} decisions, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  }
  return { files: files.length, fileNames: files.map((f) => f.replace(/\\/g, '/')), skippedFiles, games, sideDecisions, askDecisions, sample, salt, holdoutMod: hold, prefix }
}

/* ---------------------------------------------------------------------------------------- the bootstrap --- */

function readClusters(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean) // a CR would rename the last column
  const head = lines[0].split('\t')
  return lines.slice(1).map((ln) => {
    const v = ln.split('\t')
    const o = { split: v[0], key: v[1], n: Number(v[2]), cols: {} }
    for (let j = 3; j < head.length; j++) o.cols[head[j]] = Number(v[j])
    return o
  })
}

/** The cluster bootstrap: the point ratio and its SE for each metric, and for each difference against `base`. */
export function bootstrap(clusters, metrics, { seed = 'athena-p1-boot', resamples = 1000, base = null } = {}) {
  const G = clusters.length
  const n = Float64Array.from(clusters, (c) => c.n)
  const cols = Object.fromEntries(metrics.map((m) => [m, Float64Array.from(clusters, (c) => c.cols[m])]))
  const rng = mulberry32(hashSeed(seed)())
  const draws = metrics.map(() => new Float64Array(resamples))
  const counts = new Uint32Array(G)
  for (let r = 0; r < resamples; r++) {
    counts.fill(0)
    for (let g = 0; g < G; g++) counts[Math.floor(rng() * G)]++
    let N = 0
    const s = new Float64Array(metrics.length)
    for (let g = 0; g < G; g++) {
      const w = counts[g]
      if (w === 0) continue
      N += w * n[g]
      for (let m = 0; m < metrics.length; m++) s[m] += w * cols[metrics[m]][g]
    }
    for (let m = 0; m < metrics.length; m++) draws[m][r] = s[m] / N
  }
  const sd = (a) => {
    let mu = 0
    for (const x of a) mu += x
    mu /= a.length
    let v = 0
    for (const x of a) v += (x - mu) ** 2
    return Math.sqrt(v / (a.length - 1))
  }
  const N = n.reduce((a, b) => a + b, 0)
  const out = { clusters: G, cards: N, seed, resamples, metrics: {} }
  metrics.forEach((m, i) => {
    const point = cols[m].reduce((a, b) => a + b, 0) / N
    out.metrics[m] = { point, se: sd(draws[i]) }
  })
  if (base) {
    out.diffs = {}
    for (const m of metrics) {
      const kind = m.split('.').pop()
      const bm = `${base}.${kind}`
      if (m === bm || !(bm in cols)) continue
      const i = metrics.indexOf(m)
      const j = metrics.indexOf(bm)
      const d = draws[i].map((x, r) => x - draws[j][r])
      out.diffs[`${m} - ${bm}`] = { point: out.metrics[m].point - out.metrics[bm].point, se: sd(d) }
    }
  }
  return out
}

function boot() {
  const files = argOf('--clusters', '').split(',').filter(Boolean)
  const split = argOf('--split', 'test')
  const splits = new Set(split.split(',')) // e.g. 'holdout,test': (b)'s baseline calls its test split the holdout
  const byKey = new Map()
  for (const f of files) {
    for (const c of readClusters(f)) {
      if (!splits.has(c.split)) continue
      const prev = byKey.get(c.key)
      if (!prev) byKey.set(c.key, c)
      else {
        if (prev.n !== c.n) throw new Error(`cluster ${c.key}: ${prev.n} cards in one file, ${c.n} in ${f}`)
        for (const [m, v] of Object.entries(c.cols)) {
          if (m in prev.cols) throw new Error(`cluster ${c.key}: ${m} is in two files`)
          prev.cols[m] = v
        }
      }
    }
  }
  let clusters = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const metrics = [...new Set(clusters.flatMap((c) => Object.keys(c.cols)))]
  // --intersect (smoke runs over a subset): keep only the clusters every file scored; a registered read has none missing
  if (process.argv.includes('--intersect')) clusters = clusters.filter((c) => metrics.every((m) => m in c.cols))
  for (const c of clusters) for (const m of metrics) if (!(m in c.cols)) throw new Error(`cluster ${c.key} lacks ${m}`)
  const res = bootstrap(clusters, metrics, { seed: argOf('--seed', 'athena-p1-boot'), resamples: Number(argOf('--resamples', 1000)), base: argOf('--base', 'marg') })
  const out = { split, files, ...res }
  const o = argOf('--out', '')
  if (o) fs.writeFileSync(o, JSON.stringify(out, null, 1))
  console.log(`bootstrap (${split}): ${res.clusters} clusters, ${res.cards} cards, ${res.resamples} resamples, seed ${res.seed}`)
  for (const [m, v] of Object.entries(res.metrics)) console.log(`  ${m.padEnd(12)} ${m.endsWith('top1') ? (100 * v.point).toFixed(4) + '%' : v.point.toFixed(6)}  SE ${m.endsWith('top1') ? (100 * v.se).toFixed(4) : v.se.toFixed(6)}`)
  for (const [m, v] of Object.entries(res.diffs ?? {})) console.log(`  ${m.padEnd(24)} ${m.endsWith('top1') ? (100 * v.point).toFixed(4) : v.point.toFixed(6)}  SE ${m.endsWith('top1') ? (100 * v.se).toFixed(4) : v.se.toFixed(6)}`)
}

/* ------------------------------------------------------------------------------------------------- main --- */

async function extract() {
  const pop = argOf('--pop', '')
  const out = argOf('--out', '')
  if (!['a', 'b', 'c'].includes(pop) || !out) throw new Error('extract needs --pop a|b|c and --out')
  const version = argOf('--version', pop === 'b' ? 'v0.9' : 'v1.0')
  const override = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
  const kopts = knowledgeOptions(version, override)
  const sc = new Scorer(kopts)
  const t0 = Date.now()
  let info
  if (pop === 'a') info = extractA(sc, argOf('--games', ''), Number(argOf('--max-games', 0)))
  else info = await extractRecords(sc, pop)
  const secs = (Date.now() - t0) / 1000
  const header = { pop, version, override, kopts, ...info, decisions: sc.decisions, notFound: sc.notFound, baselines: sc.summary(), clusters: sc.clusters.size, secs, command: process.argv.slice(1).join(' ') }
  fs.writeFileSync(`${out}.json`, JSON.stringify(header, null, 1))
  sc.writeClusters(`${out}.clusters.tsv`)
  const pct = (v) => (100 * v).toFixed(4) + '%'
  console.log(`belief-baselines ${pop}: ${info.games} games, decisions ${JSON.stringify(sc.decisions)}, ${sc.clusters.size} clusters, notFound ${sc.notFound}, ${secs.toFixed(0)}s`)
  for (const split of ['train', 'holdout', 'test']) {
    const b = header.baselines[split]
    if (!b.n) continue
    console.log(`  ${split} (${b.n} cards): marginal ${pct(b.marg.top1)} NLL ${b.marg.nll.toFixed(6)}; slot ${pct(b.slot.top1)} NLL ${b.slot.nll.toFixed(6)}; kappa ${pct(b.kappa.top1)} NLL ${b.kappa.nll.toFixed(6)}`)
  }
}

const cmd = process.argv[2]
if (cmd === 'extract') await extract()
else if (cmd === 'boot') boot()
else {
  console.error('usage: belief-baselines.mjs extract|boot ... (see the header)')
  process.exit(2)
}
