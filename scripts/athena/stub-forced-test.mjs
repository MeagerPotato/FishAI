/**
 * stub-forced-test.mjs: `scripts/botpkg-forced-test.mjs` adapted to the ATHENA-stub package (ATHENA.md §4.6 G0d part 1).
 *
 *     node scripts/athena/build-stub-package.mjs && node scripts/athena/stub-forced-test.mjs [--pkg dist/athena-stub]
 *
 * The branches a `us54` referee does not produce, driven from constructed positions whose right answers are known
 * without the bot, as in the original: the host's forced endgame (`forced`, with its bar and `last_resort`), a
 * resolved set, the reduced reveal of a wrong declare, the MUST_DECLARE positions, and malformed input. The same seven
 * sections, with these changes:
 *
 * - **Every premise is consistent.** Each constructed `state` is one a host could send: the hand counts sum to the
 *   cards of the half-suits in play, and every resolved set has its declare in the history (the package counts a
 *   resolved set with no declare as `booksDisagree`, a fault). Sections 3, 4 and 6 are rebuilt that way; the question
 *   each asks is the original's.
 * - **Section 6(b) reads MUSTFIX.** The original's answer there is a declaration on the poll. ATHENA's adapter
 *   answers an uncertain compelled claim `none` (MUSTFIX, as the Monet arms do), so the poll must answer `none` and
 *   the forced sweep must then declare: an own-team assignment with the known cards in place and a confidence
 *   strictly between 0 and 1.
 * - **Section 8 (new): the weight pin.** A process started with a weight md5 that is not its file's must refuse to
 *   start (exit 2), before any handshake.
 * - **The package's own counters** (`ATHENA COUNTERS` at the end of input) are read, and every fault counter must be
 *   zero.
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const PKG = resolve(ROOT, argOf('--pkg', 'dist/athena-stub'))
const BOT = join(PKG, 'bot.mjs')
const MANIFEST = JSON.parse(readFileSync(join(PKG, 'fishbot.json'), 'utf8'))

const FL_CARDS = [
  '2S', '3S', '4S', '5S', '6S', '7S', '9S', 'TS', 'JS', 'QS', 'KS', 'AS',
  '2H', '3H', '4H', '5H', '6H', '7H', '9H', 'TH', 'JH', 'QH', 'KH', 'AH',
  '2D', '3D', '4D', '5D', '6D', '7D', '9D', 'TD', 'JD', 'QD', 'KD', 'AD',
  '2C', '3C', '4C', '5C', '6C', '7C', '9C', 'TC', 'JC', 'QC', 'KC', 'AC',
  '8S', '8H', '8D', '8C', 'RJ', 'BJ',
]
const SET_CARDS = Array.from({ length: 9 }, (_, s) => FL_CARDS.slice(s * 6, s * 6 + 6))

const child = spawn(process.execPath, [BOT], { cwd: PKG, stdio: ['pipe', 'pipe', 'pipe'] })
const pending = []
createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (l) => {
  const next = pending.shift()
  if (next) next(l)
})
const stderrLines = []
createInterface({ input: child.stderr, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (l) => stderrLines.push(l))
const exited = new Promise((res) => child.on('exit', (code) => res(code)))

const send = (obj) =>
  new Promise((res) => {
    pending.push((line) => res(JSON.parse(line)))
    child.stdin.write(`${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n`)
  })

let failures = 0
let checks = 0
function check(name, ok, detail) {
  checks++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail === undefined ? '' : ` - ${detail}`}`)
  if (!ok) failures++
}

/**
 * A `state` for seat 2 (team 0, teammates 0 and 4). With `history` empty the counts must be the deal's (nine each)
 * and every set is in play; otherwise the history carries every change of count and every resolved set's declare.
 */
function stateFor({ hand, counts, history = [], turn = 2 }) {
  const resolved = new Map()
  const score = [0, 0]
  for (const ev of history) {
    if (ev.t !== 'declare') continue
    resolved.set(ev.set, ev.winner)
    score[ev.winner]++
  }
  return {
    seat: 2, turn, deck_sets: 9, hand, hand_counts: counts, score,
    set_active: Array.from({ length: 9 }, (_, s) => !resolved.has(s)),
    set_winner: Array.from({ length: 9 }, (_, s) => (resolved.has(s) ? resolved.get(s) : null)),
    n_asks: history.filter((e) => e.t === 'ask').length,
    rules: { out_of_turn_declare: true, cardless_may_declare: true, max_asks: 400, deck_sets: 9 },
    history,
  }
}
const declare = (actor, set, success, owner, counts) => ({ t: 'declare', actor, set, forced: false, success, winner: success ? actor % 2 : 1 - (actor % 2), owner, counts })
const ask = (actor, target, card, success, counts) => ({ t: 'ask', actor, target, card, success, counts })

const hello = await send({ op: 'hello', protocol: 'fishlab-json-v1', engine: 'fishlab', seats: 6, set_size: 6, timeout_ms: 10000, cards: FL_CARDS, sets: [] })
check('hello handshake', hello.ok === true && hello.protocol === 'fishlab-json-v1' && hello.name === 'ATHENA-stub', JSON.stringify(hello))

console.log('\n1. a half-suit wholly in hand (Low Hearts, set 2)')
{
  const st = stateFor({ hand: [...SET_CARDS[2], '2S', '3S', '4S'], counts: [9, 9, 9, 9, 9, 9] })
  const at09 = await send({ op: 'forced', set: 2, threshold: 0.9, last_resort: false, state: st })
  check('declares its own complete set', at09.action === 'declare' && at09.set === 2, JSON.stringify(at09))
  check('confidence is 1', at09.confidence === 1, `confidence=${at09.confidence}`)
  check('every owner is seat 2', Array.isArray(at09.owner) && at09.owner.every((o) => o === 2), JSON.stringify(at09.owner))
  const at10 = await send({ op: 'forced', set: 2, threshold: 1, last_resort: false, state: st })
  check('still declares at threshold 1.0', at10.action === 'declare', JSON.stringify(at10))
}

console.log('\n2. a half-suit split across the team, one card unlocated (High Clubs, set 7)')
{
  const st = stateFor({ hand: [...SET_CARDS[7].slice(0, 5), '2S', '3S', '4S', '5S'], counts: [9, 9, 9, 9, 9, 9] })
  const low = await send({ op: 'forced', set: 7, threshold: 0.1, last_resort: false, state: st })
  check('declares at a low bar', low.action === 'declare' && low.set === 7, JSON.stringify(low))
  check('confidence is a real estimate, 0 < p < 1', low.confidence > 0 && low.confidence < 1, `confidence=${low.confidence}`)
  check('every owner is on its own team', Array.isArray(low.owner) && low.owner.every((o) => o % 2 === 0), JSON.stringify(low.owner))
  check('the five known cards are placed on itself', Array.isArray(low.owner) && low.owner.slice(0, 5).every((o) => o === 2), JSON.stringify(low.owner))
  const high = await send({ op: 'forced', set: 7, threshold: 0.99, last_resort: false, state: st })
  check('declines a bar its confidence cannot clear', high.action === 'none', JSON.stringify(high))
  const forcedHigh = await send({ op: 'forced', set: 7, threshold: 0.99, last_resort: true, state: st })
  check('answers the same bar under last_resort', forcedHigh.action === 'declare' && forcedHigh.set === 7, JSON.stringify(forcedHigh))
}

console.log('\n3. a hopeless set under last_resort (Low Spades, set 0: none of it on this team)')
{
  // Seat 1 misses seat 2 (the turn comes to seat 2); seats 0 and 4 then empty themselves by declaring three half-suits
  // out of turn. Seat 2 holds no Low Spade and its teammates hold nothing, so every Low Spade is an opponent's.
  const history = [
    ask(1, 2, '4H', false, [9, 9, 9, 9, 9, 9]),
    declare(0, 4, true, [0, 0, 0, 0, 0, 0], [3, 9, 9, 9, 9, 9]),
    declare(0, 5, true, [0, 0, 0, 4, 4, 4], [0, 9, 9, 9, 6, 9]),
    declare(4, 6, true, [4, 4, 4, 4, 4, 4], [0, 9, 9, 9, 0, 9]),
  ]
  const st = stateFor({ hand: [...SET_CARDS[7].slice(0, 4), '2H', '3H', '9S', 'TS', 'JS'], counts: [0, 9, 9, 9, 0, 9], history })
  const polite = await send({ op: 'forced', set: 0, threshold: 0.5, last_resort: false, state: st })
  check('declines while it may', polite.action === 'none', JSON.stringify(polite))
  const must = await send({ op: 'forced', set: 0, threshold: 0.5, last_resort: true, state: st })
  check('answers under last_resort', must.action === 'declare' && must.set === 0, JSON.stringify(must))
  check('the answer is still legal (own team only)', Array.isArray(must.owner) && must.owner.every((o) => o % 2 === 0), JSON.stringify(must.owner))
  check('and honest about its confidence', must.confidence >= 0 && must.confidence < 0.5, `confidence=${must.confidence}`)
}

console.log('\n4. a half-suit already out of play (Low Hearts, declared by this seat)')
{
  const history = [declare(2, 2, true, [2, 2, 2, 2, 2, 2], [9, 9, 3, 9, 9, 9])]
  const st = stateFor({ hand: ['2S', '3S', '4S'], counts: [9, 9, 3, 9, 9, 9], history })
  const r = await send({ op: 'forced', set: 2, threshold: 0, last_resort: true, state: st })
  check('never declares a resolved set', r.action === 'none', JSON.stringify(r))
  const p = await send({ op: 'declare_poll', state: st })
  check('and does not offer it on a poll either', p.action !== 'declare' || p.set !== 2, JSON.stringify(p))
}

console.log("\n5. a FAILED declaration in the history: the reduced reveal")
{
  const history = [
    ask(1, 2, '2D', false, [9, 9, 9, 9, 9, 9]),
    ask(2, 3, '9C', true, [9, 9, 10, 8, 9, 9]),
    declare(1, 0, false, [1, 1, 3, 3, 5, 5], [8, 7, 9, 8, 8, 8]),
  ]
  const st = stateFor({ hand: ['2H', '3H', '4H', '5H', '6H', '7H', '9C', 'TC', 'JC'], counts: [8, 7, 9, 8, 8, 8], history })
  const poll = await send({ op: 'declare_poll', state: st })
  check('does not re-declare the resolved set', poll.action !== 'declare' || poll.set !== 0, JSON.stringify(poll))
  const askReply = await send({ op: 'ask', state: { ...st, turn: 2 } })
  check('still produces a legal ask', askReply.action === 'ask', JSON.stringify(askReply))
  check('never asks for a card of the resolved set', !SET_CARDS[0].includes(askReply.card), `asked ${askReply.card}`)
  check('asks the only cards its hand licenses', ['QC', 'KC', 'AC'].includes(askReply.card), `asked ${askReply.card}`)
  check('asks an opponent', askReply.target % 2 === 1, `target ${askReply.target}`)
  const f = await send({ op: 'forced', set: 0, threshold: 0, last_resort: true, state: st })
  check('refuses the resolved set even under last_resort', f.action === 'none', JSON.stringify(f))
  const own = await send({ op: 'forced', set: 2, threshold: 1, last_resort: false, state: st })
  check('unaffected sets still price correctly', own.action === 'declare' && own.confidence === 1, JSON.stringify(own))
}

console.log('\n6. the MUST_DECLARE positions (PASSFIX and MUSTFIX)')
{
  // (a) a cardless seat holding the turn: FishLab's `pass` position. Seat 1 takes eight cards off seat 2 and misses
  //     it (the turn comes to seat 2 with one card, the 2H); seat 0 then declares Low Hearts, the 2H with it.
  //     PASSFIX declines.
  const took = ['2S', '3S', '4S', '5S', '6S', '9H', 'TH', 'JH']
  const cardlessHistory = took.map((c, i) => ask(1, 2, c, true, [9, 10 + i, 8 - i, 9, 9, 9]))
  cardlessHistory.push(ask(1, 2, 'QH', false, [9, 17, 1, 9, 9, 9]))
  cardlessHistory.push(declare(0, 2, true, [2, 0, 0, 0, 4, 4], [6, 17, 0, 9, 7, 9]))
  const cardless = stateFor({ hand: [], counts: [6, 17, 0, 9, 7, 9], turn: 2, history: cardlessHistory })
  const a = await send({ op: 'declare_poll', state: cardless })
  check('a cardless turn-holder declines instead of gifting (PASSFIX)', a.action === 'none', JSON.stringify(a))

  // (b) every opponent out of cards, no set certain: the us54 claim is compelled and uncertain, so MUSTFIX declines
  //     the poll and the host's forced sweep must then produce the declaration.
  const history = [
    declare(1, 1, false, [1, 1, 3, 3, 5, 5], [8, 8, 8, 8, 8, 8]),
    declare(0, 2, true, [0, 0, 2, 2, 4, 4], [6, 8, 6, 8, 6, 8]),
    declare(4, 3, true, [0, 0, 2, 2, 4, 4], [4, 8, 4, 8, 4, 8]),
    declare(1, 4, true, [1, 1, 3, 3, 5, 5], [4, 6, 4, 6, 4, 6]),
    declare(3, 5, true, [1, 1, 3, 3, 5, 5], [4, 4, 4, 4, 4, 4]),
    declare(5, 6, true, [1, 1, 3, 3, 5, 5], [4, 2, 4, 2, 4, 2]),
    declare(1, 7, true, [1, 1, 3, 3, 5, 5], [4, 0, 4, 0, 4, 0]),
  ]
  const oppsOut = stateFor({ hand: ['2S', '3S', '8S', '8H'], counts: [4, 0, 4, 0, 4, 0], turn: 2, history })
  const b = await send({ op: 'declare_poll', state: oppsOut })
  check('an uncertain compelled claim is declined on the poll (MUSTFIX)', b.action === 'none', JSON.stringify(b))
  const bar = await send({ op: 'forced', set: 0, threshold: 1, last_resort: false, state: oppsOut })
  check('the sweep declines it at the bar 1', bar.action === 'none', JSON.stringify(bar))
  const sweep = await send({ op: 'forced', set: 0, threshold: 0, last_resort: true, state: oppsOut })
  check('the sweep declares it under last_resort', sweep.action === 'declare' && sweep.set === 0, JSON.stringify(sweep))
  check('with an own-team assignment', Array.isArray(sweep.owner) && sweep.owner.every((o) => o % 2 === 0), JSON.stringify(sweep.owner))
  check('the two cards in hand placed on itself', Array.isArray(sweep.owner) && sweep.owner[0] === 2 && sweep.owner[1] === 2, JSON.stringify(sweep.owner))
  check('at a confidence strictly between 0 and 1', sweep.confidence > 0 && sweep.confidence < 1, `confidence=${sweep.confidence}`)

  // (c) the turn-holder with cards, opponents alive, a hand of complete half-suits: no legal ask, and the claim is
  //     certain, so it goes out at confidence 1 (MUSTFIX passes a certain claim).
  const noAsk = stateFor({
    hand: [...SET_CARDS[0]], counts: [9, 12, 6, 9, 9, 9], turn: 2,
    history: [ask(1, 2, '9H', true, [9, 10, 8, 9, 9, 9]), ask(1, 2, 'TH', true, [9, 11, 7, 9, 9, 9]), ask(1, 2, 'JH', true, [9, 12, 6, 9, 9, 9]), ask(1, 2, 'QH', false, [9, 12, 6, 9, 9, 9])],
  })
  const c = await send({ op: 'declare_poll', state: noAsk })
  check('a turn-holder with no legal ask still declares', c.action === 'declare' && c.set === 0, JSON.stringify(c))
  check('and does it at full confidence, not on a guess', c.confidence === 1, `confidence=${c.confidence}`)

  // (d) ordinary play: a free complete half-suit off turn is taken (the rules-certain rail).
  const free = stateFor({ hand: [...SET_CARDS[2], '2S', '9D', 'TC'], counts: [9, 9, 9, 9, 9, 9], turn: 1 })
  const d = await send({ op: 'declare_poll', state: free })
  check('a free complete half-suit off turn is still declared', d.action === 'declare' && d.set === 2 && d.confidence === 1, JSON.stringify(d))
}

console.log('\n7. malformed input must produce a reply, never a crash')
{
  const bad = await send('this is not json')
  check('junk line answered with an error object', typeof bad.error === 'string', JSON.stringify(bad))
  const unknown = await send({ op: 'nonsense' })
  check('unknown op answered with an error object', typeof unknown.error === 'string', JSON.stringify(unknown))
  const stillAlive = await send({ op: 'forced', set: 4, threshold: 0.99, last_resort: false, state: stateFor({ hand: ['2D', '3D', '2S', '3S', '4S', '9H', 'TH', 'JH', '8S'], counts: [9, 9, 9, 9, 9, 9] }) })
  check('process survived and still answers', stillAlive.action !== undefined || stillAlive.error !== undefined, JSON.stringify(stillAlive))
  const swapped = FL_CARDS.slice()
  swapped[5] = '9S'
  swapped[6] = '7S'
  const badDeck = await send({ op: 'hello', protocol: 'fishlab-json-v1', cards: swapped, sets: [] })
  check(
    'a mismatched deck is refused with the diagnosis, not a generic failure',
    typeof badDeck.error === 'string' && badDeck.error.includes('half-suit 0') && badDeck.error.includes('LOW-S'),
    JSON.stringify(badDeck),
  )
}

child.stdin.end()
await exited

console.log("\n8. the package's own counters, and the weight pin")
{
  const line = stderrLines.find((l) => l.startsWith('ATHENA COUNTERS '))
  check('the counters were written at the end of input', line !== undefined)
  if (line !== undefined) {
    const C = JSON.parse(line.slice('ATHENA COUNTERS '.length))
    const nonzero = C.faultNames.filter((k) => C[k] !== 0)
    check(`every fault counter is zero (${C.faultNames.length} counters)`, C.faults === 0 && nonzero.length === 0, nonzero.map((k) => `${k} ${C[k]}`).join(', ') || undefined)
    console.log(`        (information: ${C.opForced} forced, ${C.lastResort} last_resort, ${C.opPoll} polls, ${C.opAsk} asks, ${C.rails} rail, ${C.compelled} compelled, ${C.passfixDeclines} PASSFIX, ${C.mustfixDeclines} MUSTFIX, ${C.forcedDeclares} forced declares, ${C.forcedResolvedSet} resolved-set refusals)`)
  }
  const wrong = spawn(process.execPath, [BOT], { cwd: PKG, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ATHENA_WEIGHTS_MD5: '0'.repeat(32) } })
  const errs = []
  createInterface({ input: wrong.stderr, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (l) => errs.push(l))
  const out = []
  createInterface({ input: wrong.stdout, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (l) => out.push(l))
  wrong.stdin.write(`${JSON.stringify({ op: 'hello', protocol: 'fishlab-json-v1', cards: FL_CARDS, sets: [] })}\n`)
  const code = await new Promise((res) => wrong.on('exit', res))
  check('a weight md5 that is not the file\'s is refused before the handshake', code === 2 && out.length === 0 && errs.some((l) => l.startsWith('ATHENA FATAL')), `exit ${code}, ${out.length} replies, ${errs[0] ?? ''}`)
  check(`the manifest pins the shipped file (${MANIFEST.env.ATHENA_WEIGHTS} ${MANIFEST.env.ATHENA_WEIGHTS_MD5})`, stderrLines.some((l) => l.includes(`md5 ${MANIFEST.env.ATHENA_WEIGHTS_MD5}`)))
}

const warnings = stderrLines.filter((l) => l.startsWith('ATHENA WARN'))
if (warnings.length > 0) {
  console.log('\nbot warnings:')
  for (const l of warnings.slice(0, 10)) console.log(`  ${l}`)
}
console.log(`\n${failures === 0 ? `OK: all ${checks} checks passed.` : `${failures} of ${checks} CHECK(S) FAILED`}`)
process.exitCode = failures === 0 ? 0 : 1
