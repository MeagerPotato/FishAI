/**
 * duplicate-pairs.mjs — the home regression cell: one Monet version against another on
 * duplicate `us54` deals, paired.
 *
 *     node scripts/duplicate-pairs.mjs --a v0.3 --b v0.2 [--pairs 800] [--bank home-a]
 *         [--a-override '{"defuse":0}'] [--b-override '{...}'] [--a-search '{"det":8,"cand":3,"steps":24,"z":1,"guard":"lcb"}'] [--b-search '{...}']
 *         [--a-search-prob 0.2] [--b-search-prob 0.2] [--a-leaf-model models/leaf.json] [--b-leaf-model ...]
 *         [--a-ask-model models/ask.json] [--b-ask-model ...]
 *         [--a-advantage-model adv.json] [--a-advantage-margin 0.2] [--b-advantage-model ...] [--b-advantage-margin ...]
 *
 * `--a-ask-model` / `--b-ask-model` (MONET.md 3.8ac) register the file as an ask model (imitation.ts) under
 * its basename and lay `askModel` over that side's style, so its `pickAsk` plays the model's argmax over
 * the ranker's legal asks; `--a-leaf-model` / `--b-leaf-model` (3.8ab) do the same for the search's leaf.
 *
 * `--a-advantage-model` / `--b-advantage-model` (MONET.md 3.8aw stage C, 3.8ax C') register the file as an ask
 * ADVANTAGE model under its basename and lay `askAdvantageModel` over that side's style, with
 * `--a-advantage-margin` / `--b-advantage-margin` as `askAdvantageMargin`: the side's clone still chooses, and
 * its choice is left for the model's best ask only where the best scores more than the margin above it.
 *
 * Beside the win rate, `win rate SE` prints its standard error binomially over the games and by pair (a seed's
 * two games share one deal), with the count of games A won.
 *
 * `--a-search-prob` / `--b-search-prob` (MONET.md 3.8aa) make the search sparse: a decision is searched
 * only when a uniform drawn from the decision's own seed is below p (default 1, every decision), the
 * fast policy playing otherwise - the search's moves read one at a time in a game the fast policy
 * otherwise plays, against the dense form that reads them in combination.
 *
 * `--a-search` / `--b-search` (MONET.md 3.8a) make that arm the search arm over its policy: every
 * ask decision goes through `decideSearch` with the given parameters (missing keys take
 * SEARCH_DEFAULTS); windows and everything else stay the policy's. Printed in the header.
 *
 * An override is a JSON object of style keys laid over the named version's vector — the way an
 * ablation rung is spelled (MONET.md §3.3b's defusal ladder is `--a-override '{"defuse":N}'`
 * against the shipped `--b`). The version's own vector is never mutated, and the override is
 * printed in the header so no number can be read without it.
 *
 * MONET.md §3.3a item 4 / §6.2's last row: every shipped change gets ≥ 800 duplicate pairs at
 * home before it is called a ship, reported with the CELL'S OWN standard deviation (§6.3 — the
 * generic per-pair SD is wrong for every cell it was not measured on). ASKING.md §6 measured the
 * licence correction costing ~0.35 sets/pair in self-play with the defusal appetite on, so a loss
 * here is expected for v0.3 and must be quantified rather than discovered later.
 *
 * Design, verbatim from BOT_LAB.md §5.1 and `scripts/probe-licence3.mjs`: each seed is played
 * twice, once with arm A on team 0 and once with arm A on team 1, so the deal is never a
 * confound; the statistic is the paired set-difference `(A − B)` summed over the two
 * orientations, with a 1.96·SE interval from that sample's own SD. Win rate is reported beside it
 * for legibility and is the noisier number.
 *
 * The control this harness owes: `--a v0.2 --b v0.2` must print `0.0000 +/- 0.0000`. It cannot
 * do otherwise — both teams are one policy on one deal — so it is a smoke test of the harness,
 * never evidence about a policy (MONET.md §6.2 on mirror cells).
 *
 * Banks: `home-a` is the fitting bank; `home-b` and `home-c` are held out. Name the bank in every
 * number quoted from this script.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { basename, dirname, join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const { newGame, reduce, seatView, us54Config, legalActionsSummary, hashSeed, seatTeam } = ENG
const { monetPolicy, isMonetVersion, MONET_VERSION_IDS, decide, registerAskModel, registerAskAdvantageModel, registerHolderModel } = BOTS

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const A = argOf('--a', '')
const B = argOf('--b', '')
for (const v of [A, B]) {
  if (!isMonetVersion(v)) {
    console.error(`--a and --b must name Monet versions (${MONET_VERSION_IDS.join(', ')}); got ${JSON.stringify(v)}`)
    process.exit(2)
  }
}
const PAIRS = Number(argOf('--pairs', 800))
const BANK = argOf('--bank', 'home-a')
// MONET.md 3.8ac: --a-ask-model / --b-ask-model <file> register an ask model under the file's basename and lay `askModel` over that side's override;
// MONET.md 3.8ah: --a-holder-model / --b-holder-model <file> register a holder model under its basename first, and the side's ask model (a
// third-set clone) is bound to it
// MONET.md 3.8as: --a-value-model / --b-value-model <file> register a SECOND ask model under its basename and lay
// `askValueModel` over that side's override, with --a-value-topk / --b-value-topk as the shortlist depth (absent is 3).
// That side's pickAsk then lets the clone order the ranker's list and takes the VALUE's argmax over the clone's top k.
// Needs the side's ask model: without one there is no shortlist to select over and the knob is inert.
// MONET.md 3.8aw stage C / 3.8ax C': --a-advantage-model / --b-advantage-model <file> register an ask ADVANTAGE model
// under its basename and lay `askAdvantageModel` over that side's override, with --a-advantage-margin /
// --b-advantage-margin as `askAdvantageMargin` (absent is 0). That side's pickAsk then scores every legal ask and
// leaves the clone's choice for the model's best where the best is more than the margin above it. Inert without
// the side's ask model, like the value.
const overrideOf = (overFlag, modelFlag, holderFlag, valueFlag, topkFlag, advFlag, marginFlag) => {
  const over = argOf(overFlag, '') ? JSON.parse(argOf(overFlag, '')) : null
  const file = argOf(modelFlag, '')
  const holder = argOf(holderFlag, '')
  const value = valueFlag ? argOf(valueFlag, '') : ''
  const adv = advFlag ? argOf(advFlag, '') : ''
  if (holder && !file) throw new Error(`${holderFlag} needs the side's ask model`)
  if (marginFlag && argOf(marginFlag, '') && !adv) throw new Error(`${marginFlag} needs the side's ${advFlag}`)
  if (!file && !value && !adv) return over
  let out = { ...(over ?? {}) }
  if (file) {
    if (holder) registerHolderModel(basename(holder), JSON.parse(readFileSync(holder, 'utf8')))
    registerAskModel(basename(file), JSON.parse(readFileSync(file, 'utf8')), holder ? basename(holder) : undefined)
    out.askModel = basename(file)
  }
  if (value) {
    // no ask-model FILE is required: the side may be a version whose style already names one, and the
    // knob is inert without it either way (decide.ts only enters the branch under `askModel`)
    registerAskModel(basename(value), JSON.parse(readFileSync(value, 'utf8')))
    out.askValueModel = basename(value)
    const topk = argOf(topkFlag, '')
    if (topk) out.askValueTopK = Number(topk)
  }
  if (adv) {
    // the same as the value: the side's version names its clone, and the rows extend that clone's own
    registerAskAdvantageModel(basename(adv), JSON.parse(readFileSync(adv, 'utf8')))
    out.askAdvantageModel = basename(adv)
    const margin = argOf(marginFlag, '')
    if (margin) {
      const m = Number(margin)
      if (!(Number.isFinite(m) && m >= 0)) throw new Error(`${marginFlag} ${margin} is not a number >= 0`)
      out.askAdvantageMargin = m
    }
  }
  return out
}
const OVER_A = overrideOf('--a-override', '--a-ask-model', '--a-holder-model', '--a-value-model', '--a-value-topk', '--a-advantage-model', '--a-advantage-margin')
const OVER_B = overrideOf('--b-override', '--b-ask-model', '--b-holder-model', '--b-value-model', '--b-value-topk', '--b-advantage-model', '--b-advantage-margin')
const SEARCH_A = argOf('--a-search', '') ? JSON.parse(argOf('--a-search', '')) : null
const SEARCH_B = argOf('--b-search', '') ? JSON.parse(argOf('--b-search', '')) : null
const SEARCH = SEARCH_A || SEARCH_B ? await import(pathToFileURL(join(ROOT, 'lib/engine/search/index.ts')).href) : null
const PARAMS_A = SEARCH_A ? { ...SEARCH.SEARCH_DEFAULTS, ...SEARCH_A } : null
const PARAMS_B = SEARCH_B ? { ...SEARCH.SEARCH_DEFAULTS, ...SEARCH_B } : null
// MONET.md 3.8ab: --a-leaf-model / --b-leaf-model <file> register a value model under the file's basename and name it as that side's leaf
for (const [flag, params] of [['--a-leaf-model', PARAMS_A], ['--b-leaf-model', PARAMS_B]]) {
  const file = argOf(flag, '')
  if (!file) continue
  if (!params) throw new Error(`${flag} needs the side's --search`)
  SEARCH.registerValueModel(basename(file), JSON.parse(readFileSync(file, 'utf8')))
  params.leafNet = basename(file)
}
const PROB_A = Number(argOf('--a-search-prob', 1))
const PROB_B = Number(argOf('--b-search-prob', 1))
const withOverride = (pol, over) =>
  over ? Object.freeze({ skill: pol.skill, style: Object.freeze({ ...pol.style, ...over }) }) : pol
const POL_A = withOverride(monetPolicy(A), OVER_A)
const POL_B = withOverride(monetPolicy(B), OVER_B)
const LABEL_A = `${A}${OVER_A ? ' ' + JSON.stringify(OVER_A) : ''}${PARAMS_A ? ' search ' + JSON.stringify(PARAMS_A) + (PROB_A < 1 ? ` prob ${PROB_A}` : '') : ''}`
const LABEL_B = `${B}${OVER_B ? ' ' + JSON.stringify(OVER_B) : ''}${PARAMS_B ? ' search ' + JSON.stringify(PARAMS_B) + (PROB_B < 1 ? ` prob ${PROB_B}` : '') : ''}`
// a sparse search: searched when the decision's own seed says so (a uniform below prob), else the pick
const sparse = (seed, prob) => prob >= 1 || (hashSeed(`${seed}:sparse`)() >>> 0) / 4294967296 < prob
// each side's searched and changed decisions over the run (MONET.md 3.8ab: the paired set-diff per changed decision)
const COUNT = { A: { searched: 0, changed: 0 }, B: { searched: 0, changed: 0 } }
const act = (view, pol, params, seed, prob, side) => {
  if (params && sparse(seed, prob)) {
    const d = SEARCH.decideSearch(view, pol, seed, params)
    if (d.info.searched) {
      side.searched++
      if (d.info.played === 'candidate') side.changed++
    }
    return d.action
  }
  return decide(view, pol, seed)
}

/** One game: team `teamA` plays arm A, the other team arm B. Returns [setsA, setsB]. */
function play(seed, teamA) {
  let s = newGame(seed, us54Config, 0)
  let guard = 0
  while (s.phase !== 'finished') {
    if (guard++ >= 6000) return null
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const isA = seatTeam(seat) === teamA
    const r = reduce(s, act(view, isA ? POL_A : POL_B, isA ? PARAMS_A : PARAMS_B, hashSeed(`${seed}:${s.moveIndex}`)(), isA ? PROB_A : PROB_B, isA ? COUNT.A : COUNT.B))
    if (!r.ok) return null
    s = r.state
  }
  return [s.score[teamA], s.score[1 - teamA]]
}

const t0 = Date.now()
let pairs = 0
let winsA = 0
let setsA = 0
let setsB = 0
let capped = 0
const d = []
// each pair's share of its two games won by A, for the win rate's standard error by pair
const w = []
for (let g = 0; g < PAIRS; g++) {
  const seed = `${BANK}-${g}`
  const x = play(seed, 0)
  const y = play(seed, 1)
  if (!x || !y) {
    capped++
    continue
  }
  pairs++
  setsA += x[0] + y[0]
  setsB += x[1] + y[1]
  const won = (x[0] > x[1] ? 1 : 0) + (y[0] > y[1] ? 1 : 0)
  winsA += won
  w.push(won / 2)
  d.push(x[0] - x[1] + (y[0] - y[1]))
}
const mean = d.reduce((a, b) => a + b, 0) / d.length
const sd = Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, d.length - 1))
const se = sd / Math.sqrt(d.length)
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

console.log(`=== duplicate pairs: Monet ${LABEL_A} vs Monet ${LABEL_B}, bank ${BANK}, ${pairs} pairs (${2 * pairs} games), ${elapsed}s ===`)
if (capped) console.log(`!!! ${capped} pairs hit the step cap and were dropped`)
console.log(`sets            ${setsA} vs ${setsB}  (per game ${(setsA / (2 * pairs)).toFixed(4)} vs ${(setsB / (2 * pairs)).toFixed(4)})`)
console.log(`win rate (A)    ${((100 * winsA) / (2 * pairs)).toFixed(2)}%`)
console.log(`paired set-diff ${mean.toFixed(4)} +/- ${(1.96 * se).toFixed(4)}   (SD ${sd.toFixed(4)} sets/pair, this cell's own; SE ${se.toFixed(4)})`)
console.log(`verdict         ${Math.abs(mean) > 1.96 * se ? (mean > 0 ? `${A} AHEAD` : `${A} BEHIND`) + ' at 95%' : 'inside the interval: unresolved at this N'}`)
// MONET.md 3.8ax C': the win rate's standard error two ways, with the count it is read from - binomial over the
// games, and by pair (a seed's two games share one deal, so the pair is the unit, as it is for the set-diff)
const wMean = w.reduce((a, b) => a + b, 0) / Math.max(1, w.length)
const wSe = Math.sqrt(w.reduce((a, x) => a + (x - wMean) ** 2, 0) / Math.max(1, w.length - 1)) / Math.sqrt(Math.max(1, w.length))
const wr = winsA / Math.max(1, 2 * pairs)
console.log(`win rate SE     ${(100 * Math.sqrt((wr * (1 - wr)) / Math.max(1, 2 * pairs))).toFixed(2)}% binomial over the games, ${(100 * wSe).toFixed(2)}% by pair  (A won ${winsA} of ${2 * pairs})`)
for (const [name, params, c] of [['A', PARAMS_A, COUNT.A], ['B', PARAMS_B, COUNT.B]]) {
  if (!params || pairs === 0) continue
  const perPair = c.changed / pairs
  console.log(`searched (${name})    ${c.searched} (${(c.searched / pairs).toFixed(2)} a pair); changed ${c.changed} (${perPair.toFixed(2)} a pair, ${((100 * c.changed) / Math.max(1, c.searched)).toFixed(1)}% of searched); paired set-diff per changed decision ${perPair > 0 ? ((name === 'A' ? mean : -mean) / perPair).toFixed(4) : 'n/a'} (SE ${perPair > 0 ? (se / perPair).toFixed(4) : 'n/a'})`)
}
