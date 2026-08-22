/**
 * Structural invariants — run after every fuzz step. Returns [] when healthy,
 * else human-readable violation strings.
 *
 * Every deck- and set-shaped quantity below is **derived from `s.config`**, never read from
 * the 48-card module constants (RULES_US54.md §6: "derived per variant — never hardcoded
 * anywhere"). That is not cosmetic. A config-free `cardCompare` orders an unknown card at
 * `-1`, which puts the jokers *first* where `sortHand` puts them last (§2.3) — so a
 * config-free sort check alone would report every legitimate `us54` state as
 * non-canonically sorted.
 *
 * The last block is the deadlock gate demanded by RULES_US54.md §5 safety requirement 2:
 * *"a new invariant — no legal action exists but phase ≠ finished"*. A deadlock is the one
 * failure mode that is silent in production. In the live table this engine also ships to —
 * `server/room.ts` in the sibling repository
 * [Canadian-Fish-Demo](https://github.com/MeagerPotato/Canadian-Fish-Demo), not a path in THIS
 * repo — a bare `if (!r.ok) break` abandons the bot chain, leaving the room on
 * `status: 'playing'` with `GameOver` never rendering. Nothing here can fix that host, so the
 * condition is caught here, structurally, instead.
 */
import type { GameState, Seat, Team } from './types.ts'
import { allBooks, allCards, bookCards, isCard, seatTeam, sortHand, teamSeats } from './cards.ts'
import { legalAsks, turnHolderCanAsk } from './helpers.ts'
import { clinchTarget, rulesFor } from './variants.ts'

export function checkInvariants(s: GameState): string[] {
  const v: string[] = []
  const push = (msg: string) => v.push(msg)

  // The rule set in force. Read once from the state's own config — there is deliberately no
  // module-level "active rule set" to consult (RULES_US54.md §2.4).
  const rules = rulesFor(s.config)
  const bookIds = allBooks(s.config)
  const nBooks = bookIds.length
  const deckSize = allCards(s.config).length

  if (s.config.playerCount !== 6) push(`playerCount is ${String(s.config.playerCount)}, expected 6`)
  if (s.hands.length !== 6) push(`hands has ${s.hands.length} entries, expected 6`)
  if (!Number.isInteger(s.turn) || s.turn < 0 || s.turn > 5) push(`turn ${String(s.turn)} is not a seat`)
  if (!Number.isInteger(s.moveIndex) || s.moveIndex < 0) push(`moveIndex ${String(s.moveIndex)} invalid`)
  if (s.log.length === 0 || s.log[0].type !== 'game_started') push('log must start with game_started')

  // Card conservation: hands + cards of resolved books (voids included) === the whole deck
  // (48 or 54), no duplicates. "Real card" is deck-relative — an 8 or a joker is real under
  // `us54` and is not under `pagat48` (RULES_US54.md §1 row 2).
  const seen = new Map<string, string>()
  const record = (card: string, where: string) => {
    if (!isCard(card, s.config)) push(`${card} (${where}) is not a real card`)
    const prev = seen.get(card)
    if (prev) push(`card ${card} duplicated: ${prev} and ${where}`)
    else seen.set(card, where)
  }
  s.hands.forEach((h, i) => {
    h.forEach((c) => record(c, `hand ${i}`))
    // Canonical order is the config's order: `us54` slots the 8s into rank position and puts
    // both jokers after all 52 suited cards (RULES_US54.md §2.3).
    const sorted = sortHand(h, s.config)
    if (h.some((c, k) => c !== sorted[k])) push(`hand ${i} is not canonically sorted`)
  })
  // A result keyed by a set this rule set does not define is a category error, not merely an
  // odd score — e.g. an EIGHTS result on a `pagat48` game, whose deck holds none of its cards.
  const knownBooks = new Set<string>(bookIds)
  for (const key of Object.keys(s.books)) {
    if (!knownBooks.has(key)) push(`books contains ${key}, which is not a set of this rule set`)
  }
  const expected: [number, number] = [0, 0]
  /** Sets **awarded** by outcome — the §5 clinch counts these, never `score`. */
  const awarded: [number, number] = [0, 0]
  for (const b of bookIds) {
    const r = s.books[b]
    if (!r) continue
    bookCards(b, s.config).forEach((c) => record(c, `resolved book ${b}`))
    if (r.book !== b) push(`book result under key ${b} names ${r.book}`)
    if (!Number.isInteger(r.claimer) || r.claimer < 0 || r.claimer > 5) push(`book ${b}: claimer invalid`)
    // Every set is six cards in both rule sets; only the *number* of sets differs (8 vs 9).
    const cards = bookCards(b, s.config)
    const aKeys = Object.keys(r.assignments)
    const hKeys = Object.keys(r.actualHolders)
    if (aKeys.length !== 6 || !cards.every((c) => c in r.assignments))
      push(`book ${b}: assignments do not cover its 6 cards`)
    if (hKeys.length !== 6 || !cards.every((c) => c in r.actualHolders))
      push(`book ${b}: actualHolders do not cover its 6 cards`)
    const claimerTeam = seatTeam(r.claimer)
    for (const c of cards) {
      const a = r.assignments[c]
      if (!Number.isInteger(a) || a < 0 || a > 5 || seatTeam(a) !== claimerTeam)
        push(`book ${b}: card ${c} assigned off-team (seat ${String(a)})`)
    }
    // Outcome must be consistent with the recorded actual holders + assignments. The third
    // line differs per rule set: `pagat48` voids an own-team misassignment (RULES.md row 15),
    // `us54` abolishes `void` and gifts the set to the opponents (RULES_US54.md §1 row 14) —
    // which is exactly what makes the §5 pigeonhole (4+4 = 8 < 9) close.
    const oppHolds = cards.some((c) => seatTeam(r.actualHolders[c]) !== claimerTeam)
    const allCorrect = cards.every((c) => r.actualHolders[c] === r.assignments[c])
    const oppOutcome = claimerTeam === 0 ? 'team1' : 'team0'
    const ownOutcome = claimerTeam === 0 ? 'team0' : 'team1'
    const want = oppHolds
      ? oppOutcome
      : allCorrect
        ? ownOutcome
        : rules.wrongDeclare === 'opponents'
          ? oppOutcome
          : 'void'
    if (r.outcome !== want) push(`book ${b}: outcome ${r.outcome}, expected ${want}`)
    if (r.outcome !== 'void') {
      const t = r.outcome === 'team0' ? 0 : 1
      awarded[t] += 1
      // Mirrors `bookPoints` in reduce.ts exactly. Audited against the new `EIGHTS` id
      // (RULES_US54.md §1 row 3): `'EIGHTS'.startsWith('HIGH')` is false, so EIGHTS scores 1
      // like a LOW set. That is moot in practice and deliberately so — `validateConfig`
      // rejects `highBooksDouble` together with `us54`, because §5 safety requirement 1
      // needs points and sets not to diverge — but the two expressions must not drift apart.
      expected[t] += s.config.toggles.highBooksDouble && b.startsWith('HIGH') ? 2 : 1
    }
  }
  const resolvedCount = bookIds.filter((b) => s.books[b]).length
  const accounted = s.hands.reduce((n, h) => n + h.length, 0) + resolvedCount * 6
  if (accounted !== deckSize) push(`card conservation broken: ${accounted} cards accounted for, expected ${deckSize}`)
  if (s.score[0] !== expected[0] || s.score[1] !== expected[1])
    push(`score [${s.score.join(',')}] does not match resolved books [${expected.join(',')}]`)
  if (s.score[0] < 0 || s.score[1] < 0) push('negative score')

  // Unresolved books' cards must all be in hands (implied by conservation, but check directly).
  // This is also what makes a declare always available in an open `us54` window (§5).
  for (const b of bookIds) {
    if (s.books[b]) continue
    for (const c of bookCards(b, s.config)) {
      if (!s.hands.some((h) => h.includes(c))) push(`card ${c} of unresolved book ${b} is in no hand`)
    }
  }

  // The declare window (RULES_US54.md §3) is `us54`-only structure: `pagat48` never writes the
  // key at all, so its mere presence under a turn-bound rule set is a bug. A window left open
  // in a phase that offers no declare is the specific shape of stale state that would let
  // `decline` churn forever without the game ever progressing.
  const w = s.declareWindow
  if (w) {
    if (rules.declareTiming !== 'anyTime')
      push(`declareWindow open under a rule set whose declares are ${rules.declareTiming}`)
    if (!Number.isInteger(w.option) || w.option < 0 || w.option > 5)
      push(`declareWindow.option ${String(w.option)} is not a seat`)
    // §3: six consecutive declines close the window, so a *stored* count is always 0..5.
    if (!Number.isInteger(w.declined) || w.declined < 0 || w.declined > 5)
      push(`declareWindow.declined ${String(w.declined)} is outside 0..5`)
    // §3.1 names `playing` (or `endgame`) as the declare phases; nothing is offered in the
    // pass/designate handoffs or after the game is over.
    if (s.phase !== 'playing' && s.phase !== 'endgame') push(`declareWindow open in phase ${s.phase}`)
  }

  // Phase/turn consistency (only meaningful when the basic structure holds).
  if (s.hands.length !== 6 || !Number.isInteger(s.turn) || s.turn < 0 || s.turn > 5) return v
  const teamCount = (t: Team) => teamSeats(t).reduce<number>((n, x) => n + s.hands[x].length, 0)
  const turnSeat = s.turn
  const turnTeam = seatTeam(turnSeat)
  switch (s.phase) {
    case 'playing':
      if (s.hands[turnSeat].length === 0) push('playing: turn seat has no cards')
      // A whole team out of cards forces `endgame` under RULES.md §4 — but only there.
      // RULES_US54.md §4 ("Whole team out") deliberately keeps that machinery out of `us54`:
      // the emptied team stays in the declare window, the team with cards declares the rest
      // out in ordinary `playing`, and §5 guarantees the clinch arrives.
      if (rules.wholeTeamOut === 'endgame' && (teamCount(0) === 0 || teamCount(1) === 0))
        push('playing: a whole team is out of cards')
      if (resolvedCount === nBooks) push('playing: all books resolved but phase not finished')
      break
    case 'awaitPass':
      if (s.hands[turnSeat].length !== 0) push('awaitPass: turn seat still has cards')
      if (teamSeats(turnTeam).every((x) => s.hands[x].length === 0))
        push('awaitPass: no teammate with cards to receive the pass')
      break
    case 'awaitDesignate':
      if (teamCount(turnTeam) !== 0) push('awaitDesignate: turn team still has cards')
      if (teamCount(turnTeam === 0 ? 1 : 0) === 0) push('awaitDesignate: opponents also out of cards')
      if (resolvedCount === nBooks) push('awaitDesignate: all books already resolved')
      break
    case 'endgame':
      if (resolvedCount === nBooks) push('endgame: all books resolved but phase not finished')
      if (teamCount(0) !== 0 && teamCount(1) !== 0) push('endgame: neither team is out of cards')
      if (teamCount(turnTeam) === 0) push('endgame: turn belongs to the empty team')
      break
    case 'finished':
      // RULES_US54.md §5.1: a clinched game legitimately finishes with sets unresolved and
      // cards still in hands, so neither of the two `allResolved` checks below can be asserted
      // unconditionally any more. They are asserted for exactly the rule sets that end that
      // way — i.e. they remain in full force for `pagat48` (RULES.md row 22).
      if (rules.winCondition === 'clinch') {
        // What a clinch rule set must instead prove: the game did not stop early. Either a
        // team really was awarded `clinchTarget` sets (row 19, counted by outcome — see
        // `awarded`), or the §5 fallback terminator fired and every set is resolved.
        const target = clinchTarget(s.config)
        if (Math.max(awarded[0], awarded[1]) < target && resolvedCount !== nBooks)
          push(
            `finished: no team reached the clinch target of ${target} sets ` +
              `(awarded ${awarded.join('-')}) and only ${resolvedCount}/${nBooks} books resolved`,
          )
      } else {
        if (resolvedCount !== nBooks) push(`finished: only ${resolvedCount} books resolved`)
        if (s.hands.some((h) => h.length > 0)) push('finished: a hand still has cards')
      }
      break
  }

  // RULES_US54.md §5 safety requirement 2 — the deadlock gate. Every phase but `finished`
  // owes the seat to move at least one legal action; a running game with none is the silent
  // hang described in the file header, and nothing else in this file catches it directly.
  if (s.phase !== 'finished' && !hasLegalAction(s)) {
    const seat = s.declareWindow ? s.declareWindow.option : s.turn
    push(`no legal action exists for seat ${seat} but phase is ${s.phase}, not finished`)
  }

  return v
}

/**
 * Does the seat to move have *any* legal action? Written against the reducer's own acceptance
 * conditions rather than against `legalActionsSummary`, which is a UI affordance list and
 * reports `pass`/`designate`/`claim` for their phases unconditionally — it would agree that a
 * genuinely deadlocked state has "an action", which is precisely the answer this must not give.
 *
 * Assumes the structural guard above has already run, so `s.hands` has six entries and
 * `s.turn` is a seat.
 */
function hasLegalAction(s: GameState): boolean {
  const rules = rulesFor(s.config)
  const holdsCards = (x: Seat) => s.hands[x].length > 0
  const unresolvedExists = allBooks(s.config).some((b) => !s.books[b])

  // An open declare window (RULES_US54.md §3) always leaves its option seat a move, but NOT
  // always `decline`: §3 refuses that with `MUST_DECLARE` in a window no ask can follow, so
  // that a table of pure decliners cannot loop forever. What is always available is the
  // declare itself — rows 12/15 let any seat, cardless or not, name any unresolved set and
  // assign its six cards to its own team, and those six cards are provably still in hands
  // (checked above). A window is only ever open in a running game, where an unresolved set
  // exists by definition (`resolved === nBooks` terminates), so the option seat always has
  // one. Checked before the phase, exactly as the reducer does — a window is the thing that
  // moves "whose move it is" off the turn-holder.
  if (s.declareWindow) return unresolvedExists || turnHolderCanAsk(s)

  switch (s.phase) {
    case 'finished':
      return true // nothing is owed; the caller does not ask.
    case 'awaitPass':
      // RULES.md row 20: pass to a *teammate who still holds cards*.
      return teamSeats(seatTeam(s.turn)).some((x) => x !== s.turn && holdsCards(x))
    case 'awaitDesignate':
      // RULES.md §4: designate an *opponent who still holds cards*.
      return teamSeats(seatTeam(s.turn) === 0 ? 1 : 0).some(holdsCards)
    case 'endgame':
      // Claim-only phase; the six cards of any unresolved set are provably in hands (checked
      // above), so a claim is constructible whenever one remains.
      return unresolvedExists
    case 'playing':
      // With no window open, a claim is a move only where declares are turn-bound
      // (`pagat48`, RULES.md row 11). Under `us54` a declare needs an open window (§3), so a
      // closed window leaves the turn-holder's ask as the ONLY legal action — which is why
      // `reduceDecline` refuses the `decline` itself (`MUST_DECLARE`) while the turn-holder
      // cannot ask, so a window can only ever close into a state with one. This is the check
      // that would catch it if that guard were ever removed.
      if (rules.declareTiming === 'ownTurn' && unresolvedExists) return true
      return legalAsks(s, s.turn).length > 0
  }
}
