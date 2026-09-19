/**
 * duplicate-pairs.mjs — the home regression cell: one Monet version against another on
 * duplicate `us54` deals, paired.
 *
 *     node scripts/duplicate-pairs.mjs --a v0.3 --b v0.2 [--pairs 800] [--bank home-a]
 *         [--geometry A|B] [--pair-from 0] [--pair-to <pairs>] [--json cell.json]
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
 *
 * ATHENA.md §8.5 (T1, the team-information ceiling): `"teamHands": true` in a side's override seats that side with
 * its teammates' true hands in its knowledge. It is not a style value: at every decision of that side the harness
 * lays `teamHands` (the acting seat's two teammates' current hands, from the state) over the style, and the
 * knowledge build injects them as it injects the own hand (`KnowledgeOptions.teamHands`). Nothing else changes. The
 * header prints the override as given, `{"teamHands":true}`.
 *
 * `--games-out FILE` (ATHENA.md §4.6 G0c) also writes one JSON line a game, in play order: the pair g, the seed,
 * teamA, A's and B's final sets (null for a game that hit the cap or had an action refused) and the number of actions
 * the game took. It changes nothing that is played or printed; it lets another harness be pinned to this one game for
 * game. In geometry B each line also carries the deal's rotation and its starting seat.
 *
 * ## An ATHENA arm (ATHENA.md §9.6, §9.7)
 *
 *     node scripts/duplicate-pairs.mjs --a athena:runs/p2/ck-0400/weights.bin --b v1.0 --geometry B --pairs 600
 *
 * `--a` and `--b` each name a Monet version or `athena:<weights.bin>`: an ATHENA weight file, played through
 * `lib/athena`'s float64 forward (`parseWeights`, then `decideNet` — the rails first, then the heads), with
 * **deterministic decisions**: every head is read by argmax, nothing is sampled, and the arm draws no random number
 * of its own. Each of the arm's three seats keeps its own `SeatForward`, made fresh at the start of every game.
 * Nothing about a Monet arm changes: a Monet-vs-Monet call plays and prints exactly what it always did.
 *
 * §9.6's curve read and §9.7's G2 read are `scripts/athena/p2-read.mjs`, which is this script sharded and summed.
 *
 * ## The geometry
 *
 * `--geometry A` (the default, and what every Monet cell on file was read in) plays pair g as deal `<bank>-<g>`,
 * started at seat 0, twice: arm A on team 0, then on team 1.
 *
 * `--geometry B` is ATHENA.md §4.6 G0c amendment 3, which P2 takes (§9.7): rotation r of deal d uses the seed
 * `<bank>-<d>`, starts at seat 2·⌊r/2⌋ and seats arm A on team r mod 2. That is three duplicate pairs a deal — pair g
 * is deal ⌊g/3⌋ at start seat 2·(g mod 3) — so `--pairs 600` is 200 deals × 6 rotations = 1,200 games, the cell
 * §9.7 registers. Rotations 0 and 1 are geometry A's pair.
 *
 * ## Shards
 *
 * `--pair-from` and `--pair-to` (half-open, defaulting to the whole run) play a slice of the pairs, and `--json FILE`
 * writes the cell's raw numbers — the per-pair set differences and A's share of each pair's two games — so that
 * slices run in separate processes can be summed without being re-read. Neither changes what is played or printed.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

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
const ATHENA_PREFIX = 'athena:'
for (const v of [A, B]) {
  if (!isMonetVersion(v) && !v.startsWith(ATHENA_PREFIX)) {
    console.error(`--a and --b must name Monet versions (${MONET_VERSION_IDS.join(', ')}) or ${ATHENA_PREFIX}<weights.bin>; got ${JSON.stringify(v)}`)
    process.exit(2)
  }
}
const PAIRS = Number(argOf('--pairs', 800))
const BANK = argOf('--bank', 'home-a')
const GEOMETRY = argOf('--geometry', 'A').toUpperCase()
if (GEOMETRY !== 'A' && GEOMETRY !== 'B') {
  console.error(`--geometry must be A or B; got ${JSON.stringify(argOf('--geometry', ''))}`)
  process.exit(2)
}
const PAIR_FROM = Number(argOf('--pair-from', 0))
const PAIR_TO = Number(argOf('--pair-to', PAIRS))
if (!(Number.isInteger(PAIR_FROM) && Number.isInteger(PAIR_TO) && PAIR_FROM >= 0 && PAIR_TO <= PAIRS && PAIR_FROM <= PAIR_TO)) {
  console.error(`--pair-from ${PAIR_FROM} --pair-to ${PAIR_TO} is not a slice of 0..${PAIRS}`)
  process.exit(2)
}
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
// ATHENA.md §8.5: `"teamHands": true` is the harness's switch, taken out of the style and supplied per decision
const teamSwitch = (over, flag) => {
  if (!over || over.teamHands === undefined) return [over, false]
  if (over.teamHands !== true) throw new Error(`${flag}: teamHands must be true (the harness supplies the hands)`)
  const rest = { ...over }
  delete rest.teamHands
  return [Object.keys(rest).length > 0 ? rest : null, true]
}
const [STYLE_OVER_A, TEAM_A] = teamSwitch(OVER_A, '--a-override')
const [STYLE_OVER_B, TEAM_B] = teamSwitch(OVER_B, '--b-override')
// ATHENA.md §9.6/§9.7: an `athena:<weights.bin>` arm plays that weight file through lib/athena's float64 forward.
// The module is imported only when a side asks for one, so a Monet-vs-Monet call loads exactly what it always did.
const ATHENA = A.startsWith(ATHENA_PREFIX) || B.startsWith(ATHENA_PREFIX) ? await import(pathToFileURL(join(ROOT, 'lib/athena/index.ts')).href) : null
const NETS = new Map()
const netOf = (spec, flag, over, params) => {
  if (!spec.startsWith(ATHENA_PREFIX)) return null
  for (const [name, value] of [[`${flag}-override`, over], [`${flag}-search`, params]]) {
    if (value) throw new Error(`${name} is a Monet flag; ${flag} ${spec} is an ATHENA arm`)
  }
  const file = resolve(ROOT, spec.slice(ATHENA_PREFIX.length))
  if (!NETS.has(file)) {
    const bytes = readFileSync(file)
    const net = ATHENA.parseWeights(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    NETS.set(file, { file, net, format: ATHENA.formatOf(net.arch).version, md5: createHash('md5').update(bytes).digest('hex') })
  }
  return NETS.get(file)
}
const NET_A = netOf(A, '--a', OVER_A, PARAMS_A)
const NET_B = netOf(B, '--b', OVER_B, PARAMS_B)
const POL_A = NET_A ? null : withOverride(monetPolicy(A), STYLE_OVER_A)
const POL_B = NET_B ? null : withOverride(monetPolicy(B), STYLE_OVER_B)
/** The side's policy at this decision: with T1's switch on, the acting seat's teammates' hands laid over its style. */
const withTeamHands = (pol, s, seat) =>
  Object.freeze({
    skill: pol.skill,
    style: Object.freeze({ ...pol.style, teamHands: [0, 1, 2, 3, 4, 5].filter((t) => t !== seat && seatTeam(t) === seatTeam(seat)).map((t) => ({ seat: t, hand: [...s.hands[t]] })) }),
  })
const LABEL_A = `${A}${OVER_A ? ' ' + JSON.stringify(OVER_A) : ''}${PARAMS_A ? ' search ' + JSON.stringify(PARAMS_A) + (PROB_A < 1 ? ` prob ${PROB_A}` : '') : ''}`
const LABEL_B = `${B}${OVER_B ? ' ' + JSON.stringify(OVER_B) : ''}${PARAMS_B ? ' search ' + JSON.stringify(PARAMS_B) + (PROB_B < 1 ? ` prob ${PROB_B}` : '') : ''}`
// the header's name for each arm: "Monet <label>" exactly as it always was, or the weight file with its format and md5
const shortPath = (abs) => {
  const rel = relative(ROOT, abs).replaceAll('\\', '/')
  return rel.startsWith('..') ? abs.replaceAll('\\', '/') : rel
}
const armDesc = (spec, label) => {
  if (!spec.startsWith(ATHENA_PREFIX)) return `Monet ${label}`
  const n = NETS.get(resolve(ROOT, spec.slice(ATHENA_PREFIX.length)))
  return `ATHENA ${shortPath(n.file)} (v${n.format}, md5 ${n.md5})`
}
// the verdict's short name for arm A: the Monet version id, unchanged, or `athena:<basename>`
const NAME_A = A.startsWith(ATHENA_PREFIX) ? `${ATHENA_PREFIX}${basename(A.slice(ATHENA_PREFIX.length))}` : A
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

/**
 * One game: team `teamA` plays arm A, the other team arm B, started at seat `start` (0 in geometry A). Returns
 * [setsA, setsB]. An ATHENA arm decides by `decideNet`, from a `SeatForward` per seat made fresh for this game.
 */
function play(seed, start, teamA) {
  let s = newGame(seed, us54Config, start)
  const caches = [0, 1, 2, 3, 4, 5].map((seat) => {
    const n = seatTeam(seat) === teamA ? NET_A : NET_B
    return n ? new ATHENA.SeatForward(n.net) : null
  })
  let guard = 0
  while (s.phase !== 'finished') {
    if (guard++ >= 6000) return null
    const { seat } = legalActionsSummary(s)
    const view = seatView(s, seat)
    const isA = seatTeam(seat) === teamA
    const net = isA ? NET_A : NET_B
    let action
    if (net) {
      action = ATHENA.decideNet(net.net, view, caches[seat]).action
    } else {
      const pol = (isA ? TEAM_A : TEAM_B) ? withTeamHands(isA ? POL_A : POL_B, s, seat) : isA ? POL_A : POL_B
      action = act(view, pol, isA ? PARAMS_A : PARAMS_B, hashSeed(`${seed}:${s.moveIndex}`)(), isA ? PROB_A : PROB_B, isA ? COUNT.A : COUNT.B)
    }
    const r = reduce(s, action)
    if (!r.ok) return null
    s = r.state
    lastMoves = guard
  }
  return [s.score[teamA], s.score[1 - teamA]]
}
// --games-out: the actions of the game `play` last finished, and the per-game lines
let lastMoves = 0
const GAMES_OUT = argOf('--games-out', '')
const gameLines = []
const record = (g, seed, rot, start, teamA, x) => {
  if (!GAMES_OUT) return
  const geom = GEOMETRY === 'B' ? { rot, start } : {}
  gameLines.push(JSON.stringify({ g, seed, ...geom, teamA, setsA: x ? x[0] : null, setsB: x ? x[1] : null, moves: x ? lastMoves : null }))
}

/**
 * Pair g's two games: `[seed, rotation, start, teamA]` each. Geometry A is deal g at seat 0, arm A on team 0 then 1
 * (its "rotations" 0 and 1 are only labels for `--games-out`, which does not print them); geometry B
 * is deal ⌊g/3⌋ at seat 2·(g mod 3), rotations 2·(g mod 3) and 2·(g mod 3) + 1 (the module header).
 */
const pairGames = (g) => {
  if (GEOMETRY === 'A') return [[`${BANK}-${g}`, 0, 0, 0], [`${BANK}-${g}`, 1, 0, 1]]
  const d = Math.floor(g / 3)
  const p = g % 3
  return [[`${BANK}-${d}`, 2 * p, 2 * p, 0], [`${BANK}-${d}`, 2 * p + 1, 2 * p, 1]]
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
for (let g = PAIR_FROM; g < PAIR_TO; g++) {
  const [one, two] = pairGames(g)
  const x = play(one[0], one[2], one[3])
  record(g, one[0], one[1], one[2], one[3], x)
  const y = play(two[0], two[2], two[3])
  record(g, two[0], two[1], two[2], two[3], y)
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
if (GAMES_OUT) writeFileSync(GAMES_OUT, gameLines.map((l) => l + '\n').join(''))
// --json: the cell's raw numbers, so `scripts/athena/p2-read.mjs` can sum slices run in separate processes
const JSON_OUT = argOf('--json', '')
if (JSON_OUT) {
  writeFileSync(
    JSON_OUT,
    JSON.stringify({ a: A, b: B, labelA: LABEL_A, labelB: LABEL_B, bank: BANK, geometry: GEOMETRY, pairFrom: PAIR_FROM, pairTo: PAIR_TO, pairs, capped, winsA, setsA, setsB, secs: Number(elapsed), d, w }) + '\n',
  )
}

const SLICE = PAIR_FROM === 0 && PAIR_TO === PAIRS ? '' : `, pairs ${PAIR_FROM}..${PAIR_TO}`
console.log(`=== duplicate pairs: ${armDesc(A, LABEL_A)} vs ${armDesc(B, LABEL_B)}, bank ${BANK}${GEOMETRY === 'B' ? ', geometry B' : ''}${SLICE}, ${pairs} pairs (${2 * pairs} games), ${elapsed}s ===`)
if (capped) console.log(`!!! ${capped} pairs hit the step cap and were dropped`)
console.log(`sets            ${setsA} vs ${setsB}  (per game ${(setsA / (2 * pairs)).toFixed(4)} vs ${(setsB / (2 * pairs)).toFixed(4)})`)
console.log(`win rate (A)    ${((100 * winsA) / (2 * pairs)).toFixed(2)}%`)
console.log(`paired set-diff ${mean.toFixed(4)} +/- ${(1.96 * se).toFixed(4)}   (SD ${sd.toFixed(4)} sets/pair, this cell's own; SE ${se.toFixed(4)})`)
console.log(`verdict         ${Math.abs(mean) > 1.96 * se ? (mean > 0 ? `${NAME_A} AHEAD` : `${NAME_A} BEHIND`) + ' at 95%' : 'inside the interval: unresolved at this N'}`)
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
