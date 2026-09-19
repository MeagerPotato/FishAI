/**
 * r2-variance.mjs: ATHENA.md §8.6 R2, variance reduction (brief B.8.3) reduced to the one chance term Fish has, the
 * deal.
 *
 *     node scripts/athena/r2-variance.mjs [--bridge C:/Projects/FishAI-bench/bridge] [--read-dir <monet-v55/records>]
 *         [--read-prefix panel-sestina-] [--fresh 100000] [--fresh-label athena-p1-r2-deal] [--json out.json]
 *
 * 1. **The fit.** A logistic model of "Monet's side won" on hand features of the deal (below), fitted by Newton's
 *    method on the OLDER bridge records: every record file under `<bridge>/<dir>/records/` whose arm B is SESTINA
 *    v1.0 (the read's own `specB`) and whose arm A is one of our bots, leaving out the read's directory (`monet-v55`,
 *    whose `c6-sestina-*` files are the read's games again), `kraken-v1` (played after the read, ATHENA.md §7), any
 *    file whose seed is one of the read's twelve, and any file whose (arm A, seed) an earlier file already had (an
 *    identity replay of the same games).
 * 2. **The read.** The model is applied to §3.8ba's 14,400 games (the twelve `panel-sestina-*` files). The corrected
 *    outcome of a game is W - (f - mu), f the model's probability for that game's hands and mu the model's mean over
 *    fresh deals. The pooled win rate and its SE are reported with and without the correction, on the same games, three
 *    ways: over the games (binomial), clustered by deal (the 2,400 deals, six games each), and over the twelve seeds
 *    (the ship rule's SE).
 * 3. **mu and the null arm.** mu is the model's mean over `--fresh` (100,000) deals dealt by the engine's own
 *    `dealHands` under `<fresh-label>-<i>`, dealt and never played, with Monet's side on team 0 (a uniform deal is
 *    symmetric in the teams). The null check: the correction's mean over the read's games, mean(f) - mu, must be zero
 *    within 2 SE (SE clustered by deal, with mu's own SE added in quadrature).
 *
 * The features, all computed from the dealt hands, each Monet's side's count minus the other side's, so a feature is
 * zero on a deal the teams hold alike: sets held 6-0, 5-1 and 4-2 across the teams; (seat, set) pairs with four or
 * more, exactly three, and exactly one card; and the sum over seats of distinct sets held (licence breadth).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const ENG = await import(pathToFileURL(ROOT + '/lib/engine/index.ts').href)
const DEAL = await import(pathToFileURL(ROOT + '/lib/engine/deal.ts').href)
const CARDS = await import(pathToFileURL(ROOT + '/lib/engine/cards.ts').href)
const { us54Config } = ENG

const argOf = (f, d) => {
  const i = process.argv.indexOf(f)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : d
}
const BRIDGE = argOf('--bridge', 'C:/Projects/FishAI-bench/bridge')
const READ_DIR = argOf('--read-dir', path.join(BRIDGE, 'monet-v55', 'records'))
const READ_PREFIX = argOf('--read-prefix', 'panel-sestina-')
const FRESH = Number(argOf('--fresh', 100000))
const FRESH_LABEL = argOf('--fresh-label', 'athena-p1-r2-deal')
const JSON_OUT = argOf('--json', '')
// a smoke run's cut, never a read's: at most this many older files (0 = all)
const OLDER_MAX = Number(argOf('--older-max-files', 0))
const t0 = Date.now()

const FEATURES = ['sets6', 'sets5', 'sets4', 'seat4plus', 'seat3', 'seat1', 'breadth']
const NF = FEATURES.length

/** The features of a deal for side `T`, from `setOf[seat]` = the set index (0..8) of each card that seat holds. */
function features(setOf, T, out) {
  const m = [0, 1, 2, 3, 4, 5].map(() => new Array(9).fill(0))
  for (let s = 0; s < 6; s++) for (const b of setOf[s]) m[s][b]++
  out.fill(0)
  for (let b = 0; b < 9; b++) {
    let nT = 0
    for (let s = 0; s < 6; s++) if (s % 2 === T) nT += m[s][b]
    if (nT === 6) out[0]++
    else if (nT === 0) out[0]--
    else if (nT === 5) out[1]++
    else if (nT === 1) out[1]--
    else if (nT === 4) out[2]++
    else if (nT === 2) out[2]--
  }
  for (let s = 0; s < 6; s++) {
    const sg = s % 2 === T ? 1 : -1
    let breadth = 0
    for (let b = 0; b < 9; b++) {
      const x = m[s][b]
      if (x > 0) breadth++
      if (x >= 4) out[3] += sg
      else if (x === 3) out[4] += sg
      else if (x === 1) out[5] += sg
    }
    out[6] += sg * breadth
  }
  return out
}

const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)))
const predict = (beta, x) => {
  let z = beta[0]
  for (let j = 0; j < NF; j++) z += beta[j + 1] * x[j]
  return sigmoid(z)
}

/** Newton's method for the logistic log-likelihood (intercept first), with a tiny ridge for conditioning. */
function fitLogistic(X, y, n) {
  const p = NF + 1
  const beta = new Float64Array(p)
  const xi = new Float64Array(p)
  let ll = 0
  for (let it = 0; it < 50; it++) {
    const g = new Float64Array(p)
    const H = Array.from({ length: p }, () => new Float64Array(p))
    ll = 0
    for (let i = 0; i < n; i++) {
      xi[0] = 1
      for (let j = 0; j < NF; j++) xi[j + 1] = X[i * NF + j]
      let z = 0
      for (let j = 0; j < p; j++) z += beta[j] * xi[j]
      const mu = sigmoid(z)
      ll += y[i] ? Math.log(Math.max(mu, 1e-300)) : Math.log(Math.max(1 - mu, 1e-300))
      const w = mu * (1 - mu)
      for (let a = 0; a < p; a++) {
        g[a] += (y[i] - mu) * xi[a]
        for (let b = 0; b <= a; b++) H[a][b] += w * xi[a] * xi[b]
      }
    }
    for (let a = 0; a < p; a++) {
      H[a][a] += 1e-6
      for (let b = 0; b < a; b++) H[b][a] = H[a][b]
    }
    // solve H d = g (Gaussian elimination with partial pivoting)
    const A = H.map((row, a) => [...row, g[a]])
    for (let c = 0; c < p; c++) {
      let piv = c
      for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
      ;[A[c], A[piv]] = [A[piv], A[c]]
      for (let r = c + 1; r < p; r++) {
        const f = A[r][c] / A[c][c]
        for (let k = c; k <= p; k++) A[r][k] -= f * A[c][k]
      }
    }
    const d = new Float64Array(p)
    for (let r = p - 1; r >= 0; r--) {
      let s = A[r][p]
      for (let k = r + 1; k < p; k++) s -= A[r][k] * d[k]
      d[r] = s / A[r][r]
    }
    let step = 0
    for (let a = 0; a < p; a++) {
      beta[a] += d[a]
      step = Math.max(step, Math.abs(d[a]))
    }
    if (step < 1e-10) break
  }
  return { beta: Array.from(beta), ll }
}

/** Each game line of a record file, parsed; the header first. */
function* gameLines(file) {
  const text = fs.readFileSync(file, 'utf8')
  let start = 0
  while (start < text.length) {
    let end = text.indexOf('\n', start)
    if (end < 0) end = text.length
    if (end > start) yield JSON.parse(text.slice(start, end))
    start = end + 1
  }
}

function readHeader(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(65536)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    const text = buf.toString('utf8', 0, n)
    return JSON.parse(text.slice(0, text.indexOf('\n')))
  } finally {
    fs.closeSync(fd)
  }
}

/** Card indices of a record are in set order (six to a set, the header's `cards`), so a card's set is index / 6. */
const recordSets = (dealt) => dealt.map((h) => h.map((c) => Math.floor(c / 6)))

// ---- the read's files, first: their specB and seeds define what "older" leaves out
const readFiles = fs.readdirSync(READ_DIR).filter((f) => f.startsWith(READ_PREFIX) && f.endsWith('.jsonl')).sort().map((f) => path.join(READ_DIR, f))
const readHeaders = readFiles.map(readHeader)
const SPEC_B = readHeaders[0].specB
if (!readHeaders.every((h) => h.specB === SPEC_B)) throw new Error('the read files disagree on specB')
const READ_SEEDS = new Set(readHeaders.map((h) => String(h.seed)))
const readDirResolved = path.resolve(READ_DIR)

// ---- the older records
const older = []
const seen = new Set()
let duplicates = 0
const NEWER = new Set(['kraken-v1'])
for (const dir of fs.readdirSync(BRIDGE).sort()) {
  const rdir = path.join(BRIDGE, dir, 'records')
  if (!fs.existsSync(rdir) || !fs.statSync(rdir).isDirectory()) continue
  if (path.resolve(rdir) === readDirResolved || NEWER.has(dir)) continue
  for (const f of fs.readdirSync(rdir).filter((x) => x.endsWith('.jsonl')).sort()) {
    const file = path.join(rdir, f)
    let h
    try {
      h = readHeader(file)
    } catch {
      continue
    }
    if (h.specB !== SPEC_B || typeof h.specA !== 'string' || !h.specA.startsWith('bot:')) continue
    if (READ_SEEDS.has(String(h.seed))) continue
    const key = `${h.specA}|${h.seed}`
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    if (OLDER_MAX > 0 && older.length >= OLDER_MAX) continue
    older.push(file)
  }
}
let cap = 1 << 20
let X = new Float64Array(cap * NF)
let Y = new Uint8Array(cap)
let n = 0
const x = new Float64Array(NF)
const perDir = {}
for (const file of older) {
  const dir = path.basename(path.dirname(path.dirname(file)))
  let first = true
  for (const o of gameLines(file)) {
    if (first) {
      first = false
      if (o.header) continue
    }
    if (o.winner !== 0 && o.winner !== 1) continue
    if (n === cap) {
      cap *= 2
      const X2 = new Float64Array(cap * NF)
      X2.set(X)
      X = X2
      const Y2 = new Uint8Array(cap)
      Y2.set(Y)
      Y = Y2
    }
    features(recordSets(o.dealt), o.orient, x)
    X.set(x, n * NF)
    Y[n] = o.winner === o.orient ? 1 : 0
    n++
    perDir[dir] = (perDir[dir] ?? 0) + 1
  }
}
const tRead = (Date.now() - t0) / 1000
const fit = fitLogistic(X, Y, n)
let base = 0
for (let i = 0; i < n; i++) base += Y[i]
const pBar = base / n
const ll0 = n * (pBar * Math.log(pBar) + (1 - pBar) * Math.log(1 - pBar))
const mcfadden = 1 - fit.ll / ll0

// ---- mu: the model's mean over fresh deals, dealt by the engine and never played; Monet's side is team 0
const deckBooks = CARDS.deckFor(us54Config).books
const bookIndex = new Map(deckBooks.map((b, i) => [b, i]))
let fSum = 0
let fSq = 0
for (let i = 0; i < FRESH; i++) {
  const hands = DEAL.dealHands(`${FRESH_LABEL}-${i}`, us54Config)
  const setOf = hands.map((h) => h.map((c) => bookIndex.get(CARDS.cardBook(c))))
  const f = predict(fit.beta, features(setOf, 0, x))
  fSum += f
  fSq += f * f
}
const mu = fSum / FRESH
const muSe = Math.sqrt((fSq / FRESH - mu * mu) / (FRESH - 1))

// ---- the read
const games = [] // {seed, deal, W, f}
for (let fi = 0; fi < readFiles.length; fi++) {
  const seed = String(readHeaders[fi].seed)
  let first = true
  for (const o of gameLines(readFiles[fi])) {
    if (first) {
      first = false
      if (o.header) continue
    }
    const W = o.winner === o.orient ? 1 : 0
    const f = predict(fit.beta, features(recordSets(o.dealt), o.orient, x))
    games.push({ seed, deal: `${seed}:${o.deal}`, W, f })
  }
}
const N = games.length
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const sdOf = (xs) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1))
}
/** The SE of the grand mean of `val` over games, clustered by `key` (equal-size clusters: the SD of cluster means / sqrt(clusters)). */
const clusterSe = (val, key) => {
  const by = new Map()
  for (const g of games) {
    const k = key(g)
    const e = by.get(k) ?? { s: 0, n: 0 }
    e.s += val(g)
    e.n++
    by.set(k, e)
  }
  const means = [...by.values()].map((e) => e.s / e.n)
  return { se: sdOf(means) / Math.sqrt(means.length), clusters: means.length, sd: sdOf(means), means }
}
const plainVal = (g) => g.W
const corrVal = (g) => g.W - (g.f - mu)
const corrOnly = (g) => g.f - mu
const report = {}
for (const [name, val] of [['plain', plainVal], ['corrected', corrVal]]) {
  const vals = games.map(val)
  const m = mean(vals)
  const perGame = sdOf(vals) / Math.sqrt(N)
  const byDeal = clusterSe(val, (g) => g.deal)
  const bySeed = clusterSe(val, (g) => g.seed)
  report[name] = { mean: m, seGames: perGame, seDeals: byDeal.se, seSeeds: bySeed.se, seedSd: bySeed.sd, deals: byDeal.clusters, seeds: bySeed.clusters }
}
const cMean = mean(games.map(corrOnly))
const cDeal = clusterSe(corrOnly, (g) => g.deal)
const cSeed = clusterSe(corrOnly, (g) => g.seed)
const nullSe = Math.sqrt(cDeal.se * cDeal.se + muSe * muSe)
const nullOk = Math.abs(cMean) <= 2 * nullSe
const corr = (() => {
  const w = games.map((g) => g.W)
  const f = games.map((g) => g.f)
  const mw = mean(w)
  const mf = mean(f)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < N; i++) {
    sxy += (w[i] - mw) * (f[i] - mf)
    sxx += (w[i] - mw) ** 2
    syy += (f[i] - mf) ** 2
  }
  return sxy / Math.sqrt(sxx * syy)
})()
const secs = (Date.now() - t0) / 1000

const pct = (v) => (100 * v).toFixed(4)
console.log(`=== R2, variance reduction (ATHENA.md 8.6): fit on ${older.length} older record files (${n} games), read ${readFiles.length} files (${N} games), ${FRESH} fresh deals; ${secs.toFixed(1)} s (reading the older records ${tRead.toFixed(1)} s) ===`)
console.log(`older games by directory: ${Object.entries(perDir).map(([d, c]) => `${d} ${c}`).join(', ')}; ${duplicates} files left out as replays of an earlier file's (arm A, seed)`)
console.log(`the fit: Monet's side won ${pct(pBar)}% of the older games; McFadden R2 ${mcfadden.toFixed(5)}; coefficients: intercept ${fit.beta[0].toFixed(5)}, ${FEATURES.map((f, j) => `${f} ${fit.beta[j + 1].toFixed(5)}`).join(', ')}`)
console.log(`mu (the model's mean over ${FRESH} fresh deals, labels ${FRESH_LABEL}-<i>): ${mu.toFixed(6)} (SE ${muSe.toFixed(6)})`)
console.log(`correlation of f with the result on the read's games: ${corr.toFixed(4)}`)
console.log('')
console.log('| the read (14,400 games) | pooled win rate | SE over games | SE by deal (2,400) | SE by seed (12) | seed SD |')
console.log('|---|---:|---:|---:|---:|---:|')
for (const name of ['plain', 'corrected']) {
  const r = report[name]
  console.log(`| ${name} | ${pct(r.mean)}% | ${pct(r.seGames)} | ${pct(r.seDeals)} | ${pct(r.seSeeds)} | ${pct(r.seedSd)} |`)
}
const cut = (k) => 1 - report.corrected[k] / report.plain[k]
console.log(`SE cut by the correction: ${(100 * cut('seGames')).toFixed(2)}% over games, ${(100 * cut('seDeals')).toFixed(2)}% by deal, ${(100 * cut('seSeeds')).toFixed(2)}% by seed`)
console.log(`null check: the correction's mean over the read's games, mean(f) - mu = ${cMean.toFixed(6)}; SE ${nullSe.toFixed(6)} (by deal ${cDeal.se.toFixed(6)}, mu ${muSe.toFixed(6)}; by seed ${cSeed.se.toFixed(6)}); ${(cMean / nullSe).toFixed(2)} SE -> ${nullOk ? 'zero within 2 SE: PASS' : 'NOT zero within 2 SE: FAIL'}`)
if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    olderFiles: older.map((f) => path.relative(BRIDGE, f)), olderGames: n, perDir, duplicates, specB: SPEC_B, features: FEATURES,
    beta: fit.beta, ll: fit.ll, ll0, mcfadden, pBar, fresh: FRESH, freshLabel: FRESH_LABEL, mu, muSe,
    readGames: N, corr, report: { plain: { ...report.plain }, corrected: { ...report.corrected } },
    nullCheck: { mean: cMean, se: nullSe, seDeal: cDeal.se, seSeed: cSeed.se, ok: nullOk }, secs,
  }, null, 2))
}
