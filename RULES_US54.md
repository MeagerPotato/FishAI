# RULES_US54.md — the "US student" 54-card variant (authoritative)

This is the **second supported rule set** for the Canadian Fish engine. It sits *alongside*
[RULES.md](RULES.md) (the 48-card pagat baseline, which remains the shipped default for the live
table, `/learn`, and the drills). Every rule below was confirmed by the project owner on 2026-08-21;
where a decision resolved an ambiguity, the decision is marked **[OWNER]** with the reasoning.

Provenance: this dialect is already documented in the project's own sourced research —
[src/learn/strategy-content.ts:357](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/learn/strategy-content.ts#L357) records *"Add two jokers and
keep the 8s as a ninth eights-and-jokers set — the US student standard, and the default in the Litaf
implementation (first to 5 sets)"* (sources: pagat, cornell, se, litaf), and
[:381](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/learn/strategy-content.ts#L381) records out-of-turn declares *"with a wrong declare awarded
to the opponents"* as the same US student dialect (sources: develin, se, amylei, cornell, pagat).

> **Doc correction required.** [RULES.md](RULES.md) §5 and
> [strategy-content.ts:360](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/learn/strategy-content.ts#L360) both claim toggle `T1 (jokers)` is
> implemented. It is **not**: `toggles.jokers` is declared at [types.ts:21](lib/engine/types.ts:21),
> defaulted at [reduce.ts:27](lib/engine/reduce.ts:27), and **read nowhere**. Both documents must be
> corrected as part of this work.

---

## 1. Decision table

| # | Rule | Setting | vs. 48-card default |
|---|---|---|---|
| 1 | Players & teams | 6 players, 2 teams of 3, seats 0/2/4 = Team A, 1/3/5 = Team B | same |
| 2 | Deck | **54 cards** — standard 52 (8s included) + **two distinguishable jokers** | **CHANGED** (was 48) |
| 3 | Half-suits | **9 sets of 6**: per suit LOW = 2·3·4·5·6·7 and HIGH = 9·T·J·Q·K·A (8 sets), plus **EIGHTS = 8C·8D·8H·8S·XR·XB** | **CHANGED** (was 8) |
| 4 | Deal | All 54 dealt, **9 per player**; deterministic seeded shuffle | **CHANGED** (was 8/player) |
| 5 | Ask: target | One specific card from one **opponent**; never a teammate | same |
| 6 | Ask: book requirement | Asker must hold ≥ 1 card of the asked set. **Within EIGHTS this is uniform** — holding any 8 *or* either joker licenses asking for any other EIGHTS card | same rule, new set |
| 7 | Ask: own card | May not ask for a card you hold | same |
| 8 | Ask: target has cards | Target must hold ≥ 1 card | same |
| 9 | Hit | Card transfers face up; asker **keeps the turn** and asks again | same |
| 10 | Miss | Turn passes to the player who was asked | same |
| 11 | Declare timing | **Any time, including out of turn** — in the declare window defined in §3 | **CHANGED** (was own turn only) |
| 12 | Declare content | Name the set and the exact holder of **all six** cards; every assignment must be a seat on the declarer's own team | same |
| 13 | Declare: fully correct | Declarer's team scores the set | same |
| 14 | Declare: **any error at all** | **The opposing team scores the set.** This covers *both* "an opponent held one of the six" *and* "my team held all six but I assigned one to the wrong teammate" | **CHANGED** — the `void` outcome is **abolished** |
| 15 | Declare without holding | Legal — you may declare a set you hold no card of | same |
| 16 | Turn after a declare | **Unaffected.** An out-of-turn declare is an interjection; play resumes with whoever held the turn. If the *turn-holder* declared, their turn continues (they ask next) | **CHANGED / NEW** |
| 17 | Information | Card counts public; full public log of asks, results, and declares | same |
| 18 | Out of cards | You can no longer ask or be asked — but you **may still declare** (row 15). See §4 | **CHANGED in effect** |
| 19 | Game end | **The moment either team has been awarded 5 sets** | **CHANGED** (was: all sets resolved) |
| 20 | What counts toward 5 | **Every set awarded to your team**, including sets won because the opponents declared wrongly | **[OWNER]** |
| 21 | Ties | **Arithmetically impossible** — see §5 | **CHANGED** |
| 22 | Player count | 6 only | same |

---

## 2. Cards and sets

### 2.1 Joker encoding — `XR` / `XB`

The two jokers are **individually nameable**; a declare assigns each of six cards to an exact seat,
so interchangeable jokers would make declarations ill-defined.

**Encode them as `XR` (red joker) and `XB` (black joker) — never `JR`/`JB`.** The engine and client
parse a card's rank positionally from `card[0]` ([cards.ts:36-39](lib/engine/cards.ts:36),
[viewmodels/format.ts:10-16](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/viewmodels/format.ts#L10)); `J*` would be read as rank Jack and
silently mis-bucket into a HIGH set.

`Rank` must gain `'8'`. `Card` becomes `` `${Rank}${Suit}` | 'XR' | 'XB' ``. `BookId` gains `'EIGHTS'`.

### 2.2 `cardBook` is currently wrong and must be fixed

`cardBook('8H')` returns `'HIGH-H'` today, because `LOW_RANKS.includes('8')` is false and the
function falls through to HIGH ([cards.ts:36-39](lib/engine/cards.ts:36)). The `EIGHTS` case must be
tested **before** the LOW/HIGH split:

```
cardBook(c) =
  if c is 'XR' or 'XB'            -> 'EIGHTS'
  if c[0] === '8'                 -> 'EIGHTS'
  if c[0] in LOW_RANKS            -> `LOW-${c[1]}`
  else                            -> `HIGH-${c[1]}`
```

### 2.3 Canonical order

Jokers need a deterministic slot in `CARD_ORDER` or `sortHand` yields non-canonical hands and
[invariants.ts:29](lib/engine/invariants.ts:29) flags every state. **Place `XR`, `XB` last**, after
all 52 suited cards. Within `EIGHTS`, `bookCards` order is `8C, 8D, 8H, 8S, XR, XB`.

### 2.4 The default deck must stay byte-identical

Deck construction becomes a memoized `deckFor(config)`. The 48-card path must produce the **exact
same array** as today's `ALL_CARDS`, or [tests/engine/deal.test.ts](tests/engine/deal.test.ts)
breaks and every recorded seed changes meaning. Do **not** introduce a mutable module-level "active
rule set" — two concurrent rooms on different configs would corrupt each other.

---

## 3. The declare window **[OWNER]**

Declares are allowed "any time", which needs a deterministic moment in a turn-based engine.

> **After every action resolves, each seat in turn order — starting from the current turn-holder and
> proceeding 0→1→2→3→4→5 cyclically — is offered the chance to declare. Any number of declares may
> resolve in one window, each immediately and in that order. When no seat declares, the window
> closes and the turn-holder asks.**

Properties this gives:

- **Faithful to "any time"** — a player who deduces a set from card counts alone need not wait for
  someone else's ask.
- **Fully deterministic** — no seeded tiebreak, so the engine stays reproducible from `(seed,
  startSeat, policy assignment)` alone.
- **Preserves the race** — priority runs from the turn-holder outward, so a slower teammate *can* be
  beaten to a set, which is the strategic pressure the owner wanted to keep.
- A declare that resolves inside a window **re-opens the window from the top** (the reveal is new
  public information that may make another set declarable). The window terminates when a full cycle
  of six seats passes with no declare.

### 3.1 Legality of a declare (error codes)

Legal iff **all** hold, else the named error:

| Check | Error code |
|---|---|
| Phase is `playing` (or `endgame`) | `WRONG_PHASE` |
| Set is unresolved | `BOOK_RESOLVED` |
| Assignments cover exactly the 6 cards of the set | `BAD_ASSIGNMENTS` |
| Every assigned seat is on the declarer's team | `ASSIGN_OPPONENT` |

The table is **ordered**: when more than one check fails, the engine reports the first row that
does, so `WRONG_PHASE` beats `BOOK_RESOLVED`. Note that [RULES.md](RULES.md) §3 orders its own
(otherwise identical) table the other way round — `BOOK_RESOLVED` first — and that order is frozen
for the 48-card default. Like every other rule effect, the check order is derived from the rule set.

Note **`NOT_YOUR_TURN` is not a declare error in this variant.** It still applies to `ask`.

### 3.2 Declining is a move, and it is not always available **[OWNER]**

Passing up the offer is an explicit action, because it is what advances the option to the next seat
and six of them in a row are what close the window. But the window closes into *"the turn-holder
asks"*, so:

> **While the turn-holder has no legal ask, a `decline` is illegal** (error `MUST_DECLARE`). The
> seat holding the option must declare.

Two situations produce a turn-holder with no legal ask, and this rule covers both:

1. **Every opponent of the turn-holder is out of cards** — §4's "whole team out", where row 8
   (target must hold ≥ 1 card) leaves nothing to ask.
2. **The turn-holder's hand is a union of complete unresolved sets** — rows 6-7 leave no card they
   may name, even though the other five seats could all ask freely. (This is why the rule is keyed
   on the *turn-holder* and not on "no seat anywhere can ask": only the turn-holder ever asks out
   of a closed window.)

Declines move no cards, so this condition cannot change during a window: a table that only declines
revisits the same position forever. The engine previously answered that by re-opening the window
instead of closing it, which left every state legal, every invariant satisfied, and the game hung —
termination survived only as a property of how the players happened to act.

Refusing the decline is sound because **a declare is always legal while any set is unresolved**:
rows 12 and 15 let any seat, cardless or not, name any unresolved set and assign all six of its
cards to seats on its own team — possibly wrongly (row 14 then gifts the set to the opponents), but
always legally, and the six cards of an unresolved set are always in hands. So the option seat
always has a move, that move resolves a set, and the resolved count strictly increases. **A declare
window can therefore never stall**, and §5's deadlock invariant becomes meaningful again — it can no
longer be satisfied by a decline that provably leads nowhere.

**Scope this claim precisely.** It says a *window* cannot stall. It does **not** say the game cannot
run forever, and an earlier draft of this section wrongly claimed it did. A verified counter-example:
an adversarial policy that always takes the *last* legal ask livelocks in all six starting seats —
seat 5 asks seat 4 and misses (turn → 4), the window closes on six declines, seat 4 asks seat 5 and
misses (turn → 5), and the position repeats exactly. No rule is violated; every state has a legal
action; the deadlock invariant correctly reports nothing, because this is a **livelock, not a
deadlock**. The invariant detects *"no legal action exists"*; it cannot detect *"legal actions exist
but cycle forever"*.

This is a property of Fish, not of `us54` — the same ping-pong reproduces identically under the
48-card default. Real play escapes it because every ask is public and information accumulates until
a declare becomes compelling, which is exactly what the bots' stall-breaker
(`isDeepStalled`) encodes. Two consequences worth stating plainly: **whole-game termination is a
property of the acting policy**, so the simulator's step cap is load-bearing and must be instrumented
rather than allowed to silently discard games; and any third-party bot admitted through the
cross-play protocol must be assumed capable of livelocking, so the host — not the guest — enforces
the cap.

Because the turn-holder holds cards in every `playing` state and is offered the option **first**,
such a window is refused at `declined: 0` and answered by the turn-holder's own declare; the option
never travels. A cardless seat can only meet `MUST_DECLARE` in a hand-constructed position, and the
rule still applies there — see §4.


---

## 4. Running out of cards

Row 18 changes in effect, because a cardless player may still declare (row 15).

- **Emptied by an opponent's hit, or by anyone's declare:** you drop out of the *asking* game — you
  cannot ask and cannot be asked. You **remain in the declare window** and may still declare for
  your team.
- **A cardless player's declare is nearly always self-harming** and the bots must know it: every
  card must be assigned to an own-team seat, so if your whole team is cardless, any declare you make
  is necessarily wrong and gifts the set to the opponents (row 14).
- **[DERIVED] If a declare empties the current turn-holder**, the turn moves to the **next seat in
  ascending cyclic seat order that still holds cards**. This case cannot arise under the 48-card
  default (claims are turn-only there, so only the claimant can be emptied by their own claim), and
  it is new here.
- **[DERIVED] If an out-of-turn declarer empties themselves**, they simply drop out. They do **not**
  pass the turn — passing is a turn action and they do not hold the turn. The 48-card `awaitPass`
  flow (RULES.md row 20) applies **only** when the declarer *was* the turn-holder.
- **Whole team out:** no special `endgame` machinery is required in this variant. The team holding
  cards simply declares the remaining sets in the ordinary window, and §5 guarantees the game ends.
  The existing `endgame`/`awaitDesignate` phases remain reachable only under the 48-card default.
- **[OWNER] Whole team out means the other team must declare, not may.** With every opponent of the
  turn-holder cardless, row 8 leaves no legal ask, so the window has nothing to close into and §3.2
  makes `decline` illegal (`MUST_DECLARE`). The turn-holder holds cards and is offered the option
  first, so the seat forced to declare is on the team that still *has* cards — exactly the team this
  section says "simply declares the remaining sets". It now has no alternative, which is what makes
  "§5 guarantees the game ends" true of the rules rather than of the players.
- **[OWNER] A cardless seat forced to declare gifts the set away, and that is intended.** If the
  option ever does reach a seat whose whole team is cardless in such a window, §3.2 applies to it
  unchanged: every assignment names an empty seat, so the declare is necessarily wrong and row 14
  awards the set to the opponents. A set still resolves, which is all termination requires — a team
  that has run out of cards does not get to stall the game by declining forever. (The bots must
  still avoid this where they can: see the §4 note above.)

---

## 5. Termination — why this variant cannot hang

The 48-card engine ends on `resolved === 8` ([reduce.ts:228](lib/engine/reduce.ts:228)). This
variant ends on a **clinch**, and the two rules chosen by the owner make that provably safe:

- Row 14 abolishes `void`, so **every resolved set is awarded to exactly one team**.
- There are **9 sets**. If neither team reached 5, both hold ≤ 4, totalling ≤ 8 < 9. **Contradiction.**

Therefore a clinch is **guaranteed** and **ties are impossible**. `clinchTarget = floor(9/2) + 1 = 5`.

Two safety requirements follow:

1. **Count sets, not `score`.** `score` accumulates `bookPoints`
   ([reduce.ts:67-69](lib/engine/reduce.ts:67)), which is 2 per HIGH set when toggle
   `highBooksDouble` is on — a naive `score[t] >= 5` would clinch at 3 sets. The clinch **must**
   count `books` entries by `outcome`. Config validation must declare `highBooksDouble`
   **incompatible** with this variant rather than trying to compose them.
2. **Keep `resolved === nBooks` as a second terminator**, plus a new invariant *"no legal action
   exists but phase ≠ finished"*. The invariant only bites because §3.2 makes an unproductive
   `decline` illegal: while declining was always legal it counted as "a legal action" and the
   invariant could be satisfied forever by a window that never progressed. And because the fallback
   exists precisely to survive a rule edit that breaks the pigeonhole above — an edit that can make
   it fire is an edit that can produce a drawn board — **the fallback must report a level board as a
   tie**, and must not share the clinch's winner rule (a clinch has no tie arm, by construction).
   Under these rules the fallback is unreachable — so the fuzz gate must assert **it never fires**. This is defence against a future rule edit silently
   reintroducing the hang, which fails *silently* today:
   [server/room.ts:153](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/server/room.ts#L153)'s `if (!r.ok) break` abandons the bot chain with the
   room stuck on `status: 'playing'` and `GameOver` never rendering.

### 5.1 What the final screen shows

A clinched game finishes with **unresolved sets and cards still in hand**. Report the score as
e.g. **`5–3 · 1 unresolved`**. Do not print a bare `5–3`, which reads as an 8-set game. The
`finished` invariants ([invariants.ts:112-113](lib/engine/invariants.ts:112)) must be relaxed for a
clinched game.

---

## 6. Engine configuration

Extend `RulesConfig` rather than adding a second engine. Suggested shape:

```ts
interface RulesConfig {
  playerCount: 6
  /** 'pagat48' = RULES.md default; 'us54' = this document. */
  variant: 'pagat48' | 'us54'
  toggles: { /* unchanged */ }
}
```

Derived per variant (never hardcoded anywhere):

| Derived value | `pagat48` | `us54` |
|---|---|---|
| deck | 48 cards | 54 cards |
| sets | 8 | 9 |
| hand size | 8 | 9 |
| `wrongDeclare` | `'void'` | `'opponents'` |
| `declareTiming` | `'ownTurn'` | `'anyTime'` (window, §3) |
| `winCondition` | `'allResolved'` | `'clinch'`, target 5 |
| `highBooksDouble` | permitted | **rejected by config validation** |

---

## 7. Test vectors

1. **Deck** — `us54` deals 6 hands of 9; union is exactly the 54 cards; `pagat48` output is
   byte-identical to today's for every previously recorded seed.
2. **EIGHTS ask licence** — a seat holding only `XB` may legally ask for `8C`; a seat holding no
   EIGHTS card may not.
3. **`cardBook`** — `8H → 'EIGHTS'`, `XR → 'EIGHTS'`, `9H → 'HIGH-H'`, `7H → 'LOW-H'`.
4. **Wrong declare gifts** — Team A holds all six of `LOW-C` but seat 0 swaps two teammates'
   locations → **Team B scores `LOW-C`** (not void).
5. **Out-of-turn declare** — turn is seat 3; seat 0 declares `HIGH-S` correctly → Team A scores,
   **turn is still seat 3**, and seat 3 asks next.
6. **Declare window re-opens** — seat 0's declare reveals holders that make `LOW-D` deducible; seat
   2 declares it in the same window before seat 3 ever asks.
7. **Clinch** — Team A reaches its 5th set on move *k* → `phase === 'finished'` immediately, with
   sets still unresolved and cards still in hands; `winner === 0`; no `tie` is ever emitted.
8. **Turn-holder emptied by another seat's declare** — turn is seat 3 holding exactly the two cards
   seat 0's declare removes → turn advances to the next seat with cards; seat 3 emits `player_out`.
9. **Cardless declarer** — a seat with an empty hand legally declares and it resolves normally.
10. **Fuzz gate** — 10,000 `us54` games: all terminate, every winner is a clinch at exactly 5 sets,
    the `resolved === 9` fallback **never** fires, no `tie` is ever emitted, and
    `checkInvariants` returns `[]` at every step.
