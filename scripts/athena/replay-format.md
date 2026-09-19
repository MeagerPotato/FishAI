# The ATHENA replay format, `athena-replay-1`

This is the specification that a port of the us54 rules implements to pass G0a (i) (ATHENA.md §4.2, §4.6). The
TypeScript engine in `lib/engine/` is the reference. The emitter (`emit-replay-corpus.mjs`) records the reference's
games in this format, and the self-check (`check-replay-corpus.mjs`) replays them.

- The reference implementation of every definition below is `scripts/athena/replay-codec.ts`.
- `tests/athena/replay-codec.test.ts` asserts §10's test vectors against it, so this document and the code cannot
  drift apart silently.
- **A port passes when**, from each record's seed, start seat and actions alone, it reproduces everything the gate
  compares (§9.1): the deal digest, every per-step state digest d_t, every legal-move digest l_t, every view
  digest v_t, and every probe's accept-or-refuse verdict.

## 1. Conventions

- **Integers** are unsigned and fixed-width. A `u16` or `u32` is little-endian.
- **`NONE`** is the byte `0xFF`. It marks an absent value: an unresolved set's fields, a closed window's fields,
  and the holder of a card that has left play.
- **Seats** are bytes 0–5. Team = seat mod 2, so seats 0, 2 and 4 are team 0.
- **Cards** are bytes 0–53, in the canonical us54 order: suit-major C, D, H, S; within a suit, ranks
  2 3 4 5 6 7 8 9 T J Q K A; then XR = 52 and XB = 53. So 2C = 0, 8C = 6, AC = 12, 2D = 13, 8S = 45 and AS = 51.
- **Sets** are bytes 0–8: LOW-C, LOW-D, LOW-H, LOW-S, HIGH-C, HIGH-D, HIGH-H, HIGH-S, EIGHTS. LOW is 2–7 and HIGH
  is 9–A of one suit. EIGHTS is 8C, 8D, 8H, 8S, XR, XB.
- **A set's card order** is ascending card index. That is rank order for a half-suit, and 8C, 8D, 8H, 8S, XR, XB
  for EIGHTS. Every per-card field of a set follows this order. That is what makes the encoding independent of the
  key order of a TypeScript object.
- **Phases:** `playing` = 0, `awaitPass` = 1, `finished` = 2.
  - A us54 game never enters `endgame` or `awaitDesignate`.
  - An encoder that meets either phase, a `designate` action, or an `endgame` or `designate` event must fail
    loudly (§4.1 item 15).
- **Outcomes:** `team0` = 0, `team1` = 1, `void` = 2. `void` is unreachable under us54.
- **The winner byte** of `game_over`: 0, 1, or 2 for a tie. A tie is unreachable under us54.
- **Error codes**, for probe verdicts (§6). A refused verdict is 1 + the code's index in this list:

  | idx | code | idx | code |
  |---:|---|---:|---|
  | 0 | WRONG_PHASE | 10 | BAD_ASSIGNMENTS |
  | 1 | NOT_YOUR_TURN | 11 | ASSIGN_OPPONENT |
  | 2 | ASKER_OUT | 12 | PASS_TARGET_OUT |
  | 3 | TARGET_TEAMMATE | 13 | PASS_TARGET_NOT_TEAMMATE |
  | 4 | TARGET_SELF | 14 | DESIGNATE_TARGET_INVALID |
  | 5 | TARGET_OUT | 15 | DECLARE_WINDOW_OPEN |
  | 6 | NO_CARD_OF_BOOK | 16 | NO_DECLARE_WINDOW |
  | 7 | ASKING_OWN_CARD | 17 | NOT_YOUR_OPTION |
  | 8 | INVALID_CARD | 18 | MUST_DECLARE |
  | 9 | BOOK_RESOLVED | 19 | INVALID_ACTION |

- **Seeds** are printable ASCII (0x21–0x7E): no spaces, tabs or newlines.
  - xmur3 hashes UTF-16 code units, and for ASCII each code unit equals the byte, so a port hashes the bytes.
  - The emitter and the codec refuse any other seed.

## 2. The random generators

- These are the reference's own generators, in `lib/engine/rng.ts`.
- **xmur3(str)** starts with `h = 1779033703 ^ len`. For each code unit c, it sets `h = imul(h ^ c, 3432918353)`,
  then `h = (h << 13) | (h >>> 19)`. Each output then applies:
  - `h = imul(h ^ (h >>> 16), 2246822507)`;
  - `h = imul(h ^ (h >>> 13), 3266489909)`;
  - `h ^= h >>> 16`;
  - and returns `h >>> 0`.
- **mulberry32(a)** is seeded with `s = a`. Each call sets `s = (s + 0x6D2B79F5) mod 2^32` and `t = s`, then:
  - `t = imul(t ^ (t >>> 15), t | 1)`;
  - `t ^= t + imul(t ^ (t >>> 7), t | 61)`;
  - and returns `((t ^ (t >>> 14)) >>> 0) / 2^32`.
- **`rngFromSeed(str)`** is `mulberry32(xmur3(str)())`.
- **`randInt(rng, n)`** is `floor(rng() · n)`. In integers this is `(u32 · n) >> 32`, exact because `u32 · n < 2^38`.
- **The deal** (ATHENA.md §4.1 item 1):
  - `rngFromSeed(seed)` shuffles the 54 cards in canonical order by Fisher–Yates, for i = 53 down to 1, with
    j = `randInt(rng, i + 1)`.
  - The card at shuffled position i goes to seat i mod 6.
  - Each hand is then sorted into canonical order.
  - The game starts in `playing`, with the turn at the start seat and the window open at the start seat with
    `declined` 0. Its log is `[game_started(startSeat)]`.

## 3. The digest

It is the house `ActionDigest` (`tests/bots/action-digest.ts`): two 32-bit lanes, with an avalanche and a
cross-mix at the end. It is fed byte strings.

```
state:   h1 = 0xDEADBEEF, h2 = 0x41C6CE57, n = 0          (32-bit lanes)
mix(c):  h1 = imul(h1 ^ c, 2654435761); h2 = imul(h2 ^ c, 1597334677)
push(B): n += 1
         for each ASCII digit of decimal(n): mix(digit)      (n = 1 is the single byte 0x31)
         mix(0x00)
         for each byte b of B: mix(b)
         mix(0x01)
hex():   a = imul(h1 ^ (h1 >>> 16), 2246822507)
         b = imul(h2 ^ (h2 >>> 13), 3266489909)
         a ^= b
         b ^= imul(a ^ (a >>> 16), 2246822507)
         return hex8(b) + hex8(a)                             (16 lowercase hex characters; hex8 of the u32 value)
```

- `imul` is the wrapping 32-bit multiply.
- `hex()` does not end the stream.
- `push(B)` equals `ActionDigest.push(s)` for the Latin-1 string `s` whose code units are the bytes of B. The
  element's ordinal is followed by a NUL, and the element ends with 0x01.
- **`digest(B)`** below means `hex()` of a fresh stream after the single element `push(B)`.

## 4. The encodings

### 4.1 The set block (126 bytes)

For each set 0..8, 14 bytes:

| bytes | field | unresolved |
|---|---|---|
| 1 | outcome (0 team0, 1 team1, 2 void) | NONE |
| 1 | claimer seat | NONE |
| 6 | the declarer's stated seat for each card, in set card order | NONE × 6 |
| 6 | each card's true holder at the moment of the declare, in set card order. It is always revealed, even for a wrong declare | NONE × 6 |

### 4.2 The window (3 bytes)

- An open window is 1, then the option seat, then `declined` (0–5).
- A closed window is 0, NONE, NONE.
- **The window is read by its value, not by whether the key is present.** After the window closes, a TypeScript
  state carries the key `declareWindow: undefined`, and that encodes exactly as a state with no key (ATHENA.md §4.1
  item 14).

### 4.3 The semantic state S_t (191 bytes)

| bytes | field |
|---|---|
| 4 | `moveIndex`, u32. It counts every accepted action, declines included |
| 1 | phase |
| 1 | turn seat |
| 3 | window (§4.2) |
| 54 | the holder of each card in card order: its seat, or NONE once its set has resolved |
| 126 | set block (§4.1) |
| 1 | score of team 0 |
| 1 | score of team 1 |

- Hand order is not part of S_t, because the reference keeps every hand canonically sorted. The acting seat's hand
  order is checked through V_t (§4.7).
- The reference encoder also asserts two things. No card is in two hands. And a card is in no hand if and only if
  its set has resolved.

### 4.4 The action A_t

| action | bytes |
|---|---|
| ask | `01` seat target card |
| claim (declare) | `02` seat set, then the six stated seats in set card order |
| pass | `03` seat to |
| decline | `04` seat |

Actions are self-delimiting by their tag.

### 4.5 The events E_t

- E_t is a count byte, then the events in order. A decline emits no event, so its E_t is `00`.

| event | bytes |
|---|---|
| game_started | `00` startSeat (only in the initial log, never in an E_t) |
| ask | `01` asker target card hit (0/1) |
| claim | `02` claimer set, then six stated seats, six true holders, then the outcome (in set card order) |
| pass | `03` from to |
| player_out | `04` seat |
| game_over | `05` score0 score1 winner |

- The reference's event order is part of the replay:
  - A hit's `ask` is followed by `player_out` when the target is emptied.
  - A declare's `claim` is followed by `player_out` for every newly emptied seat, in seat order 0..5, and then by
    `game_over` when the declare clinches.

### 4.6 The legal-move record L_t

| bytes | field |
|---|---|
| 1 | acting seat: the window's option seat when a window is open, else the turn seat (`legalActionsSummary(S_t).seat`) |
| 1 | kind bits: ask 1, claim 2, pass 4, decline 8 |
| 2 | the number of legal asks, u16 |
| 2 per ask | (target, card) for each legal ask, in `legalAsks` order: targets ascending; within a target, cards ascending |

- **The kind bits are the reducer's own verdict.** A bit is set if and only if the reference accepts that kind's
  representative action from the acting seat:
  - **ask:** the legal-ask list is non-empty.
  - **claim:** the first open set, in set order, with all six cards stated at the acting seat.
  - **pass:** to the first teammate of the acting seat, ascending and not the acting seat, who holds cards.
  - **decline:** the acting seat's decline.
- These are exact. In closed form, which the test suite asserts at every step:
  - **ask:** the window is closed, the phase is `playing`, and `legalAsks` is non-empty.
  - **claim:** the window is open, and some set is open.
  - **pass:** the phase is `awaitPass`.
  - **decline:** the window is open, and the turn-holder could ask (`turnHolderCanAsk`). Otherwise the decline is
    refused with `MUST_DECLARE`.
- **This is not `legalActionsSummary`'s kind list.** With the window closed in `playing`, `legalActionsSummary`
  lists `claim`, but under us54 the reducer refuses every declare there with `NO_DECLARE_WINDOW`. L_t records what
  the reducer accepts. The self-check counts the steps where the two differ, as information.
- The legal asks are listed in the TypeScript order (§4.1 item 2). Stubs and fuzzers pick from the list by index,
  so its order is part of the replay.

### 4.7 The view V_t (the acting seat's SeatView)

| bytes | field |
|---|---|
| 1 | rules id: 1 = us54 with every toggle off. The only rule set in scope |
| 1 | the viewing seat (the acting seat) |
| 4 | `moveIndex`, u32 |
| 1 | phase |
| 1 | turn seat |
| 3 | window (§4.2) |
| 6 | each seat's hand count |
| 1 + 1 | score of team 0, score of team 1 |
| 126 | set block (§4.1). The true holders are public, even for a wrong declare |
| 1 | the viewer's hand size h |
| h | the viewer's cards, **in the order the view lists them** (canonical, ascending) |
| 4 | the log length, u32 |
| 16 | the log digest: the 16 ASCII hex characters of `hex()` |

- **The log is digested incrementally.** The log digest is one stream per game, fed with `push(encoding of the
  event)` for every log event in order: `game_started` first, then each step's events.
  - A port keeps the stream, not the event list.
  - Declines are not logged, and the view does not show them except through `moveIndex` and the window.
- V_t is the information-rule check. It holds exactly what `seatView` shows the acting seat.

## 5. The game procedure

A record is the following computation, over seed `seed`, start seat `s0`, and the action list A_0 … A_{T−1}.

```
chain := new digest stream
chain.push(ASCII "athena-replay-1|" + decimal(s0) + "|" + seed)
S_0   := the deal (§2)
chain.push(S_0 bytes)
deal  := chain.hex()                                   -- the record's `deal` column
log   := new digest stream; log.push(game_started(s0) bytes)
for t = 0, 1, ..., T−1:
    acting := the acting seat of S_t;  asks := legalAsks(S_t, acting)
    l_t := digest(L_t bytes)
    v_t := digest(V_t bytes)                           -- V_t uses log.hex() and the log length before step t
    if t mod 10 == 0: the four probe verdicts at S_t (§6)
    (S_{t+1}, E_t) := reduce(S_t, A_t)                 -- must be accepted
    chain.push(A_t bytes); chain.push(E_t bytes); chain.push(S_{t+1} bytes)
    d_t := chain.hex()
    for each event e of E_t: log.push(e bytes)
the terminal probes: the four probe verdicts at S_T (§6)
```

- **A game ends** when S_T's phase is `finished`, or at T = 6,000 steps. That is the harness's cap (ATHENA.md §4.1
  item 13), and the record then says `capped`.
- **The probe states** are t = 0, 10, 20, … below T, plus T itself. That makes `ceil(T/10) + 1` states and
  `4 × (ceil(T/10) + 1)` verdicts.

## 6. The probes

At each probe state S_t, four probe actions are drawn and judged by the reducer. Nothing is applied: the state does
not change.

**The generator** is `rngFromSeed(seed + ":probe:" + decimal(t))`. For `acting` and `asks` of S_t (asks as
(target, card index) pairs in `legalAsks` order), each of the four probes draws **exactly fifteen values**, in this
order, whatever its kind:

| # | draw | name |
|---:|---|---|
| 1 | `randInt(4)` | kind: 0 ask, 1 claim, 2 decline, 3 pass |
| 2 | `randInt(2)` | seatMode |
| 3 | `randInt(7)` | randomSeat (6 is not a seat) |
| 4 | `randInt(2)` | askMode |
| 5 | `randInt(max(1, len(asks)))` | askPick |
| 6 | `randInt(7)` | seatOrTo |
| 7 | `randInt(55)` | card (54 is not a card) |
| 8 | `randInt(10)` | set (9 is not a set) |
| 9 | `randInt(4)` | assignMode |
| 10–15 | `randInt(21)` × 6 | raw_0 … raw_5 |

**How the draws make the probe:**

- `seat` = acting if seatMode = 0, else randomSeat.
- **ask:** if askMode = 0 and asks is non-empty, the target and card are `asks[askPick]`. Otherwise the target is
  seatOrTo and the card is `card`.
- **claim:** the set is `set`. The stated seat for the j-th card, in set card order, is:
  - `raw_j mod 7` if assignMode = 0;
  - else `(seat mod 2) + 2 · (raw_j mod 3)`: a seat on the claimer's team. Seat 6 counts as team 0.
- **decline:** `seat` only.
- **pass:** `seat`, and `to` = seatOrTo.

**The action the reference judges:**

- Seat, target and `to` are passed as numbers, and 6 is refused as "not a seat".
- Card 54 becomes the string `??` and set 9 the string `NONE`. A claim of set 9 has an empty assignment map. None of
  them is a card or a set.

**The verdict byte** is 0 if the reference accepts the action, else 1 + the index of its error code (§1).

- **The gate compares accept against refuse.** Error codes are information only (ATHENA.md §4.6). A port may refuse
  for another reason, but it must refuse exactly what the reference refuses.
- Out-of-range values (seat 6, card 54, set 9) are part of the probe space on purpose. A port's action decoder must
  refuse them, never panic.

## 7. The corpus files

### 7.1 One game per line, tab-separated text

**The choice, and why:** each game is one line of tab-separated ASCII, with every byte field in lowercase hex.

- **No parser is needed.** Any language reads a line with a split on tabs and a hex decode.
  - The Rust crate therefore reads the corpus with the standard library alone, keeping D12's rule that its only
    dependencies are the Python bindings (ATHENA.md §5).
  - JSON would need a parser, and would bring back the key-order question that this format exists to remove.
- **A line is a game.** A single game can be taken out with `grep <seed>` and replayed alone. Files can be split or
  concatenated at line boundaries for parallel checking. A truncated file loses whole games, never a game's tail
  silently: a column-count or length check catches a torn line.
- **The cost** is about twice the bytes of a binary format: roughly 53 characters a step, or about 0.25 GB for
  §4.6's 10,800 games. It sits outside the repository (§8).

Lines end with LF. The columns, in order:

| # | column | content |
|---:|---|---|
| 1 | format | `athena-replay-1` |
| 2 | population | `H1` … `H5` |
| 3 | index | the game's index within its population, decimal |
| 4 | seed | the game seed (§1) |
| 5 | startSeat | 0–5 |
| 6 | driver | who played it, for people (e.g. `monet:v1.0`, `style:turtle:bank`, `pair:a=v1.0,b=v0.33,teamA=1`, `fuzz:us54PolicyAction`, `stub:mixed`). Not an input to any digest |
| 7 | revision | the 40-hex git revision the emitter ran at |
| 8 | rulesHash | SHA-256, 64 hex, of `RULES_US54.md`'s committed blob at that revision |
| 9 | steps | T |
| 10 | end | `finished` or `capped` |
| 11 | deal | 16 hex (§5) |
| 12 | actions | hex of A_0 … A_{T−1} concatenated (§4.4) |
| 13 | d | 16 hex per step: d_0 … d_{T−1} |
| 14 | l | 16 hex per step: l_0 … l_{T−1} |
| 15 | v | 16 hex per step: v_0 … v_{T−1} |
| 16 | probes | hex of the verdict bytes, 4 per probe state, in probe-state order (§5) |
| 17 | game | the game digest, 16 hex (§7.2) |

Nothing in columns 11–17 depends on columns 2, 3 or 6–8.

### 7.2 The game digest and the aggregate

- **The game digest** is a fresh stream with six ASCII elements, then `hex()`:
  1. the deal column;
  2. the d column;
  3. the l column;
  4. the v column;
  5. one character per probe verdict, `1` for accepted and `0` for refused;
  6. `decimal(T) + "|" + end`.
- It covers everything the gate compares and nothing it treats as information: no error codes and no metadata. A
  port that passes reproduces it.
- **The aggregate** of a block is a fresh stream fed each game digest (ASCII) in index order, then `hex()`.

### 7.3 Files and the manifest

- **The corpus directory** is `C:/Projects/FishAI-bench/athena/corpus/<short revision>/`, outside the repository.
- **One file per block,** `<population>-<from>-<to>.tsv`, holding indices from ≤ i < to in order.
- **`manifest.json`** sits beside the files and is copied to `scripts/athena/corpus-manifest.json`. It holds:
  - the revision, the rules hash, the nine engine blob ids, and the bank check;
  - per block: the games, steps, capped games, bytes, the file's SHA-256 and the aggregate;
  - the self-check and the coverage census, once `check-replay-corpus.mjs --write` has run.

## 8. The populations (ATHENA.md §4.6)

- **Who decides.** Every bot decides from `seatView(S_t, acting)` with the move seed
  `xmur3(seed + ":" + decimal(moveIndex))()`.
- **The cap** is 6,000 steps for every population.

| pop | games | index i → seed | start seat | policy |
|---|---:|---|---|---|
| H1 | 2,000 | `athena-p0-g0a-h1-<i>` | i mod 6 | `monetPolicy('v1.0')`, all six seats |
| H2 | 1,800 | style = `STYLE_IDS[floor(i / 200)]`, j = i mod 200. For j < 4, the bank row `monet-v054-<style>-<j>`; else `athena-p0-g0a-h2-<style>-<j−4>` | the bank row's (2j+1) mod 6; else (j−4) mod 6 | `STYLE_ROSTER[style]`, all six seats |
| H3 | 1,000 | `athena-p0-g0a-h3-<floor(i/2)>`; team A = i mod 2 | 0 | `monetPolicy('v1.0')` on team A, `'v0.33'` on the other: `duplicate-pairs.mjs`'s pair, orientation 0 then 1 |
| H4 | 4,000 (+ blocks of 2,000) | `athena-p0-g0a-h4-<i>` | `randInt(g, 6)` with g = `rngFromSeed(seed + ":policy")` | `us54PolicyAction(state, g)` on the same g, as in `fuzz-variant.test.ts` |
| H5 | 2,000 | `athena-p0-g0a-h5-<i>` | i mod 6 | the mixed stub (`mixed-stub.ts`), on `mulberry32(xmur3(seed + ":stub")())` |

- **STYLE_IDS order:** balanced, blitz, punter, banker, turtle, hoarder, scout, ghost, archivist.
- **H2's 36 bank games** are exactly the games that `tests/bots/data/monet-v054-bank.ts` pins. Their step counts
  must equal the bank's decision counts.
- **The emitter refuses to run** unless the tree reproduces that bank at 36 of 36, with `monetPolicy('v0.54')`
  asked at every decision of the style-driven game (`tests/bots/monet.test.ts`, `playForwardI`).
- The start seats of H2's fresh seeds and of H5 are this specification's choice. The registration names only the
  seeds.

## 9. What is checked

### 9.1 The gate (G0a (i)), per record

| compared | gated |
|---|---|
| the deal digest | yes |
| every d_t (the rolling state digest) | yes |
| every l_t (the legal-move digest) | yes |
| every v_t (the view digest) | yes |
| every probe's accept or refuse | yes |
| every probe's error code | **no**: information |
| T and `finished`/`capped`; the game digest | yes: they follow from the above |

- **Across the corpus:**
  - no game is capped in H1–H3 or H5;
  - no finished game ends without a team holding 5 awarded sets (the `resolved === 9` terminator alone);
  - H2's bank games take the bank's step counts;
  - every block's aggregate equals the manifest's.

### 9.2 The branch census (§4.6's floor table)

Each branch is counted once per occurrence over the applied steps, and each floor is 50 over the corpus. "pre" is
S_t, "post" is S_{t+1}, and L_t is the step's legal-move record.

| branch | counted when |
|---|---|
| hit empties the target | an ask whose E_t has `player_out` |
| window closed by six declines | a decline after which post has no window |
| forced declare (the MUST_DECLARE window) | a claim at a step whose L_t lacks the decline bit |
| declare right | a claim whose outcome is the declarer's team |
| declare wrong, an opponent held a card | a claim lost, with some true holder on the other team |
| declare wrong, own team held all six (misassigned) | a claim lost, with all six true holders on the declarer's team |
| out-of-turn declare | a claim with seat ≠ pre's turn |
| declare by a cardless seat | a claim whose seat holds no card in pre |
| declarer who held the turn emptied → `awaitPass` | a claim with seat = pre's turn, and post in `awaitPass` |
| another seat's declare empties the turn-holder → `awaitPass` | a claim with seat ≠ pre's turn, and post in `awaitPass` |
| whole team out → next seat with cards | a claim with post in `playing`, and post's turn ≠ pre's turn |
| pass | a pass |
| finish 5–0, finish 5–4 | a `game_over` whose score, high then low, is 5–0 (5–4). 5–1, 5–2 and 5–3 are counted as information |
| declare after at least one decline in the same window | a claim with pre's window `declined` ≥ 1 |
| cardless seat declines | a decline whose seat holds no card in pre |

**A structural identity, found while building this.** Under us54, "declare after at least one decline in the same
window" and "out-of-turn declare" count the same events.

- Every window opens on the turn-holder with `declined` 0: after a hit, a miss, a declare, a pass, or the
  whole-team-out move.
- The option then moves one seat per decline. So the option seat is the turn-holder exactly when `declined` = 0.
- Both rows are kept, because the registration lists both.

## 10. Test vectors

`tests/athena/replay-codec.test.ts` asserts every value here.

1. **The digest.**
   - An empty stream's `hex()` is `baab8e9a1aee8d83`.
   - `digest([00 01 7f 80 ff])` is `3269ff52857644ca`.
2. **The generators.**
   - xmur3(`athena-p0-g0a-h5-0`) gives 3775514569, 2325701542, 2974494939.
   - rngFromSeed of the same seed gives the u32 values 4047008728, 2782573905, 2890889111.
3. **Game `athena-p0-g0a-h5-0`, start seat 0, at t = 0.**
   - S_0 (191 bytes) is `000000000000010000` followed by the holders
     `010401020300020304000503050100030204030005000205050302050402000503010403020501000004010403010204040105000201`,
     then `ff` × 126 and `0000`.
   - The deal digest is `e6810acfac4e1db1`.
   - L_0 = `000a0000`: seat 0, claim and decline legal, no asks. l_0 = `915460b5ef59eaa3`.
   - The log digest after `game_started(0)` is `c11386b34de6204b`.
   - V_0 is 175 bytes, and v_0 = `2ff1e19e507ad997`. V_0 is:
     - `01 00 00000000 00 00 010000`;
     - the counts `090909090909`, and the score `0000`;
     - `ff` × 126;
     - `09`, then the hand `05090e13151e272833`;
     - the log length `01000000`;
     - and the ASCII of `c11386b34de6204b`.
4. **The probes at t = 0**, with acting seat 0 and no asks:

   | kind | seat | target | card | set | assignments | to | verdict |
   |---|---:|---:|---:|---:|---|---:|---:|
   | 2 | 0 | 5 | 49 | 8 | 2 4 2 4 2 0 | 5 | 0 |
   | 2 | 1 | 6 | 42 | 6 | 1 3 1 3 1 1 | 6 | 18 (NOT_YOUR_OPTION) |
   | 1 | 0 | 1 | 8 | 9 | 4 2 4 4 0 4 | 1 | 20 (INVALID_ACTION) |
   | 1 | 0 | 1 | 8 | 7 | 4 0 2 0 4 0 | 1 | 0 |

5. **The whole game** (H5 index 0, the mixed stub): 1,124 steps, `finished`.
   - The actions begin `040004010402040304040405`.
   - d_0 d_1 d_2 = `1b053de995b9134d e43a37e763f9ea92 709752830ec82e48`.
   - l_0 l_1 l_2 = `915460b5ef59eaa3 0cf34926d51f8d94 7f0617ea2284446b`.
   - v_0 v_1 v_2 = `2ff1e19e507ad997 ada3994e0a85c874 63ebecea07cff608`.
   - The verdicts begin `0012140000120110`.
   - d_1123 = `71b3baa794a6f4de`, and the game digest is `195ec9ea09381660`.

## 11. The traps, collected

- **`declareWindow: undefined`.** Encode the window by value (§4.2). `canonicalAction` would serialise the key.
- **Key order.** Every map is written in set card order. A decoded claim has canonical key order, and a recorded one
  may not. Nothing may depend on the difference.
- **The first move is a window poll.** A game starts with the window open at the start seat (§2), so A_0 is a
  declare or a decline, never an ask.
- **Refused actions change nothing.** Probes are judged on S_t and never applied, and a refused action leaves
  `moveIndex` alone. An accepted action, a decline included, adds 1 to it.
- **`legalActionsSummary` over-reports `claim`** with the us54 window closed (§4.6). L_t uses the reducer's verdict.
- **Declares at the clinch.** A clinching declare emits `claim`, any `player_out`, then `game_over`, and closes the
  window. The game then ends with sets unresolved and cards still in hands. S_T keeps those cards' holders.
