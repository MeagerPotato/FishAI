/**
 * botpkg-forced-test.mjs — exercise the two protocol branches the `us54` referee never produces.
 *
 *     node scripts/build-bot-package.mjs && node scripts/botpkg-forced-test.mjs
 *
 * `scripts/botpkg-selftest.mjs` plays complete games and so covers `ask`, `declare_poll` and
 * `pass` thoroughly — but it is refereed by FishAI's own engine, and RULES_US54.md §4 has no
 * forced endgame: when a whole team runs out of cards the other team simply declares the rest
 * in the ordinary window. FishLab §5.2 *does* have one, and sweeps a ladder of confidence
 * thresholds asking each seat whether it will declare a named half-suit at that bar.
 *
 * So that branch has no game that reaches it here, and the honest thing is to drive it directly
 * from constructed positions rather than to report a clean run that never entered it —
 * BOT_PACKAGE.md §9 makes the same point about `check`: *"It names what it could not reach,
 * too, so a clean report is not mistaken for coverage of a branch that never ran."*
 *
 * The positions below are built by hand so the right answer is known independently of the bot:
 *
 *  1. **A set wholly in the bot's own hand.** Confidence must be 1 and every `owner` entry must
 *     be the bot's own seat. Answered at every threshold.
 *  2. **A set split across the bot's team, with one card's holder unknown.** Confidence must be
 *     below 1 and above 0, every `owner` must name an own-team seat, and the willingness bit
 *     must track the threshold — declared at a bar the confidence clears, declined at one it
 *     does not.
 *  3. **`last_resort: true` on a hopeless set.** §5.2 is explicit that declining hands the
 *     allocation to the engine, whose fallback names every card to one seat and records it as
 *     the bot's own declaration. So the bot must answer anyway.
 *  4. **A set already out of play.** Must be declined — a declaration naming a resolved
 *     half-suit stops the game (§7).
 *
 * It also checks the malformed-input contract: junk on stdin must produce a reply, never a
 * crash, because a dead process is a fault that ends the game (§7).
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BOT = join(ROOT, 'dist/botpkg/bot.mjs')

const FL_CARDS = [
  '2S', '3S', '4S', '5S', '6S', '7S',
  '9S', 'TS', 'JS', 'QS', 'KS', 'AS',
  '2H', '3H', '4H', '5H', '6H', '7H',
  '9H', 'TH', 'JH', 'QH', 'KH', 'AH',
  '2D', '3D', '4D', '5D', '6D', '7D',
  '9D', 'TD', 'JD', 'QD', 'KD', 'AD',
  '2C', '3C', '4C', '5C', '6C', '7C',
  '9C', 'TC', 'JC', 'QC', 'KC', 'AC',
  '8S', '8H', '8D', '8C', 'RJ', 'BJ',
]
const SET_CARDS = Array.from({ length: 9 }, (_, s) => FL_CARDS.slice(s * 6, s * 6 + 6))

const child = spawn(process.execPath, [BOT], { cwd: dirname(BOT), stdio: ['pipe', 'pipe', 'pipe'] })
const pending = []
createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (l) => {
  const next = pending.shift()
  if (next) next(l)
})
const stderrLines = []
createInterface({ input: child.stderr, crlfDelay: Number.POSITIVE_INFINITY }).on('line', (l) => stderrLines.push(l))

const send = (obj) =>
  new Promise((res) => {
    pending.push((line) => res(JSON.parse(line)))
    child.stdin.write(`${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n`)
  })

let failures = 0
function check(name, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  if (!ok) failures++
}

/**
 * A `state` for seat 2 (team 0, with teammates 0 and 4). `hand` is this seat's cards; the
 * counts are consistent with it and with `others`, and no history has run — every card that is
 * not in hand is simply unlocated, which is the position the planner has to reason about.
 */
function stateFor({ hand, counts, resolvedSets = [], turn = 2 }) {
  return {
    seat: 2,
    turn,
    deck_sets: 9,
    hand,
    hand_counts: counts,
    score: [0, 0],
    set_active: Array.from({ length: 9 }, (_, s) => !resolvedSets.includes(s)),
    set_winner: Array.from({ length: 9 }, (_, s) => (resolvedSets.includes(s) ? 0 : null)),
    n_asks: 0,
    rules: { out_of_turn_declare: true, cardless_may_declare: true, max_asks: 400, deck_sets: 9 },
    history: [],
  }
}

const hello = await send({
  op: 'hello', protocol: 'fishlab-json-v1', engine: 'fishlab', seats: 6, set_size: 6,
  timeout_ms: 10000, cards: FL_CARDS, sets: [],
})
check('hello handshake', hello.ok === true && hello.protocol === 'fishlab-json-v1', JSON.stringify(hello))

console.log('\n1. a half-suit wholly in hand (Low Hearts, set 2)')
{
  // Seat 2 holds all six Low Hearts plus three spares; the rest of the deck is elsewhere.
  const hand = [...SET_CARDS[2], '2S', '3S', '4S']
  const st = stateFor({ hand, counts: [9, 9, 9, 9, 9, 9] })
  const at09 = await send({ op: 'forced', set: 2, threshold: 0.9, last_resort: false, state: st })
  check('declares its own complete set', at09.action === 'declare' && at09.set === 2, JSON.stringify(at09))
  check('confidence is 1', at09.confidence === 1, `confidence=${at09.confidence}`)
  check('every owner is seat 2', Array.isArray(at09.owner) && at09.owner.every((o) => o === 2), JSON.stringify(at09.owner))
  const at10 = await send({ op: 'forced', set: 2, threshold: 1, last_resort: false, state: st })
  check('still declares at threshold 1.0', at10.action === 'declare', JSON.stringify(at10))
}

console.log('\n2. a half-suit split across the team, one card unlocated (High Clubs, set 7)')
{
  // Seat 2 holds five of the six High Clubs; the AC is somewhere. Teammates 0 and 4 hold cards,
  // so the planner has to place it on one of them and price the guess.
  const hand = [...SET_CARDS[7].slice(0, 5), '2S', '3S', '4S', '5S']
  const st = stateFor({ hand, counts: [9, 9, 9, 9, 9, 9] })
  const low = await send({ op: 'forced', set: 7, threshold: 0.1, last_resort: false, state: st })
  check('declares at a low bar', low.action === 'declare' && low.set === 7, JSON.stringify(low))
  check('confidence is a real estimate, 0 < p < 1', low.confidence > 0 && low.confidence < 1, `confidence=${low.confidence}`)
  check('every owner is on its own team', low.owner.every((o) => o % 2 === 0), JSON.stringify(low.owner))
  check('the five known cards are placed on itself', low.owner.slice(0, 5).every((o) => o === 2), JSON.stringify(low.owner))
  const high = await send({ op: 'forced', set: 7, threshold: 0.99, last_resort: false, state: st })
  check('declines a bar its confidence cannot clear', high.action === 'none', JSON.stringify(high))
  const forcedHigh = await send({ op: 'forced', set: 7, threshold: 0.99, last_resort: true, state: st })
  check('answers the same bar under last_resort', forcedHigh.action === 'declare', JSON.stringify(forcedHigh))
}

console.log('\n3. a hopeless set under last_resort (Low Spades, set 0 — none of it on this team)')
{
  // Seat 2 holds no Low Spades and its teammates are out of cards, so any allocation is wrong.
  // §5.2: declining hands the engine a fallback that is worse and still recorded as ours.
  const hand = [...SET_CARDS[7].slice(0, 4), '2H', '3H']
  const st = stateFor({ hand, counts: [0, 9, 6, 9, 0, 9] })
  const polite = await send({ op: 'forced', set: 0, threshold: 0.5, last_resort: false, state: st })
  check('declines while it may', polite.action === 'none', JSON.stringify(polite))
  const must = await send({ op: 'forced', set: 0, threshold: 0.5, last_resort: true, state: st })
  check('answers under last_resort', must.action === 'declare' && must.set === 0, JSON.stringify(must))
  check('the answer is still legal (own team only)', must.owner.every((o) => o % 2 === 0), JSON.stringify(must.owner))
  check('and honest about its confidence', must.confidence >= 0 && must.confidence < 0.5, `confidence=${must.confidence}`)
}

console.log('\n4. a half-suit already out of play')
{
  const hand = [...SET_CARDS[2], '2S', '3S', '4S']
  const st = stateFor({ hand, counts: [9, 9, 9, 9, 9, 9], resolvedSets: [2] })
  const r = await send({ op: 'forced', set: 2, threshold: 0, last_resort: true, state: st })
  check('never declares a resolved set', r.action === 'none', JSON.stringify(r))
  const p = await send({ op: 'declare_poll', state: st })
  check('and does not offer it on a poll either', p.action !== 'declare' || p.set !== 2, JSON.stringify(p))
}

console.log("\n5. a FAILED declaration in the history — §6's reduced reveal")
{
  // 40 games of self-test produced 162 declarations and not one wrong one, so the branch that
  // handles a failed declaration never ran there. It is driven directly here instead.
  //
  // Seat 1 declared Low Spades and got it wrong: the table hears the claimed owners and the
  // outcome, and nothing else. The six cards still leave play (§4, "either way the half-suit
  // leaves play"), so the bot must treat them as gone — never ask for one, never declare that
  // set — and must keep reasoning normally about everything else.
  const hand = ['2H', '3H', '4H', '5H', '6H', '7H', '9C', 'TC', 'JC']
  const st = stateFor({ hand, counts: [8, 7, 9, 8, 8, 8], resolvedSets: [0] })
  st.set_winner[0] = 0
  st.history = [
    { t: 'ask', actor: 1, target: 2, card: '2D', success: false, counts: [9, 9, 9, 9, 9, 9] },
    // The hit that built this hand: seat 2 took the 9C off seat 3, so the history and the hand
    // it is checked against agree. A premise the engine would call inconsistent proves nothing.
    { t: 'ask', actor: 2, target: 3, card: '9C', success: true, counts: [9, 9, 10, 8, 9, 9] },
    { t: 'declare', actor: 1, set: 0, forced: false, success: false, winner: 0, owner: [1, 1, 3, 3, 5, 5], counts: [8, 7, 9, 8, 8, 8] },
  ]
  const poll = await send({ op: 'declare_poll', state: st })
  check('does not re-declare the resolved set', poll.action !== 'declare' || poll.set !== 0, JSON.stringify(poll))

  const askReply = await send({ op: 'ask', state: { ...st, turn: 2 } })
  check('still produces a legal ask', askReply.action === 'ask', JSON.stringify(askReply))
  check('never asks for a card of the resolved set', !SET_CARDS[0].includes(askReply.card), `asked ${askReply.card}`)
  // Low Hearts is complete in hand, so the only half-suit it holds a card of but not all of is
  // High Clubs, and it already holds 9C/TC/JC: QC, KC and AC are the whole legal ask set.
  check('asks the only card its hand licenses', ['QC', 'KC', 'AC'].includes(askReply.card), `asked ${askReply.card}`)
  check('asks an opponent', askReply.target % 2 === 1, `target ${askReply.target}`)

  const f = await send({ op: 'forced', set: 0, threshold: 0, last_resort: true, state: st })
  check('refuses the resolved set even under last_resort', f.action === 'none', JSON.stringify(f))

  // The wrong claim reveals nothing about who really held those cards. It must not have been
  // mistaken for a reveal: a set the claim named to seats 1/3/5 must not now be believed to
  // sit there, and the bot's own Low Hearts (which it holds outright) must still price at 1.
  const own = await send({ op: 'forced', set: 2, threshold: 1, last_resort: false, state: st })
  check('unaffected sets still price correctly', own.action === 'declare' && own.confidence === 1, JSON.stringify(own))
}

console.log("\n6. declining a poll is always legal here — the MUST_DECLARE positions us54 has and FishLab does not")
{
  // RULES_US54.md §3.2 makes `decline` illegal in two positions, because under §3 the declare
  // window is all that stands between the table and a state with no legal action. FishLab has
  // separate machinery for both — §5.2's `pass` op and §4's forced sweep — so `{"action":"none"}`
  // is always legal on a poll, and a declaration volunteered there is a pure gift.
  //
  // Neither position is reachable in a us54 game, so botpkg-selftest.mjs cannot referee them
  // (it now sends the first by hand); these are the constructed pins.
  // (a) cardless seat holding the turn — FishLab's `pass` position.
  const cardless = { ...stateFor({ hand: [], counts: [9, 9, 0, 9, 9, 9] }), turn: 2 }
  const a = await send({ op: 'declare_poll', state: cardless })
  check('a cardless turn-holder declines instead of gifting', a.action === 'none', JSON.stringify(a))

  // (b) every opponent out of cards — FishLab's forced-endgame trigger, which its own
  //     confidence ladder is there to resolve. The poll must not pre-empt it.
  const oppsOut = { ...stateFor({ hand: ['2S', '3S', '9H', '8D'], counts: [4, 0, 4, 0, 4, 0] }), turn: 2 }
  const b = await send({ op: 'declare_poll', state: oppsOut })
  check('an ordinary poll defers to the forced sweep when the opponents are out', b.action === 'none', JSON.stringify(b))
  // ...and the sweep itself still answers, so deferring cannot hang the table.
  const sweep = await send({ op: 'forced', set: 0, threshold: 0, last_resort: true, state: oppsOut })
  check('the forced sweep still answers that same position', sweep.action === 'declare', JSON.stringify(sweep))

  // (c) the ONE obligation that does survive the trip: turn-holder, holding cards, opponents
  //     alive, hand a union of complete half-suits. Decline and the host's next request is an
  //     `ask` this hand cannot answer, which stops the game (§7). It must still declare.
  const noAsk = { ...stateFor({ hand: [...SET_CARDS[0]], counts: [8, 8, 6, 8, 8, 8] }), turn: 2 }
  const c = await send({ op: 'declare_poll', state: noAsk })
  check('a turn-holder with no legal ask still declares', c.action === 'declare' && c.set === 0, JSON.stringify(c))
  check('and does it at full confidence, not on a guess', c.confidence === 1, `confidence=${c.confidence}`)

  // (d) ordinary play is untouched: a free complete half-suit off turn is still taken.
  const free = { ...stateFor({ hand: [...SET_CARDS[2], '2S', '9D', 'TC'], counts: [9, 9, 9, 9, 9, 9] }), turn: 1 }
  const d = await send({ op: 'declare_poll', state: free })
  check('a free complete half-suit off turn is still declared', d.action === 'declare' && d.set === 2, JSON.stringify(d))
}

console.log('\n7. malformed input must produce a reply, never a crash')
{
  const bad = await send('this is not json')
  check('junk line answered with an error object', typeof bad.error === 'string', JSON.stringify(bad))
  const unknown = await send({ op: 'nonsense' })
  check('unknown op answered with an error object', typeof unknown.error === 'string', JSON.stringify(unknown))
  const stillAlive = await send({ op: 'forced', set: 4, threshold: 0.99, last_resort: false, state: stateFor({ hand: ['2D', '3D'], counts: [9, 9, 2, 9, 9, 9] }) })
  check('process survived and still answers', stillAlive.action !== undefined || stillAlive.error !== undefined, JSON.stringify(stillAlive))

  // A deck this bot cannot read must say WHY on the wire, not just that it failed — §7 shows the
  // message on the felt, and it is the only thing the operator gets.
  const swapped = FL_CARDS.slice()
  swapped[5] = '9S'
  swapped[6] = '7S'
  const badDeck = await send({ op: 'hello', protocol: 'fishlab-json-v1', cards: swapped, sets: [] })
  check('a mismatched deck is refused with the diagnosis, not a generic failure',
    typeof badDeck.error === 'string' && badDeck.error.includes('half-suit 0') && badDeck.error.includes('LOW-S'),
    JSON.stringify(badDeck))
}

child.kill()
if (stderrLines.length > 0) {
  console.log('\nbot stderr:')
  for (const l of stderrLines.slice(0, 10)) console.log(`  ${l}`)
}
console.log(`\n${failures === 0 ? 'OK — all checks passed.' : `${failures} CHECK(S) FAILED`}`)
process.exitCode = failures === 0 ? 0 : 1
