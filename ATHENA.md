# ATHENA.md: the roadmap and research record for ATHENA

**ATHENA is FishAI's next Canadian Fish bot, after Monet v1.0.** Its goal is **to beat Monet v1.0 while learning its
own play.** Monet v1.0 is the bar. It is also an opponent, a harness and a body of evidence. It is not a starting
point.

**Status: DRAFT, 2026-09-18.** Nothing is built. No ATHENA game has been played. §4.1–§4.4 report scoping
measurements made today: engine checks and throughput timings, none of them a read of strength. **§4 is a draft
pre-registration for the owner's review, and nothing in it runs until the owner answers row 2 of §6.**

**Labels.** Every number or claim carries one of these:

- `[Record]` cites MONET.md by section, the Monet v1.0 paper (`papers/monet-v1.tex`, cited as "paper §N" in LaTeX's
  section order), or the ATHENA design brief (`C:\Projects\FishAI-bench\athena\ATHENA-brief.md`, cited as "brief C.2").
- `[Measured]` was measured today on this machine. The commands are in Appendix A, and the outputs are kept beside the
  scripts.
- `[Estimate]` is a projection. Its assumptions are written next to it.
- `[Judgement]` is opinion. It can be wrong, and nothing has measured it.
- `[Lit]` is a published result, cited `[Ln]` to the brief's reference list.

**Sources.** The repository at `origin/main` **`7bfd3fd`** (the merge of PR #103), read through git objects and
exported once to the scratchpad for the measurements. The brief of the same day.

**Effort** uses MONET.md's scale: XS ≤ 1 day · S = 1–3 days · M = 1–2 weeks · L = 1–2 months.

---

## 0. The target and the decisions

### 0.1 What the owner decided

On 2026-09-18, after Monet v1.0 was published, the owner (Allen Hsieh) decided, in their words:

> *"accept condition 5 and go from scratch with ATHENA-L"*

Earlier the same day they had said:

> *"I dont want monet to just be a fine tuned version of a sestina copy"*

The first sentence settles two things:

- **Condition 5 is accepted.** MONET.md row 65 left one item for the owner. §3.9's condition 5 had been scored MET
  under the registration's rules, although the locked reader printed NOT MET on two rows. By accepting it, the owner
  lets Monet v1.0 stand as recorded. **Monet v1.0 is therefore the bar ATHENA must clear.**
- **ATHENA-L is chosen, from scratch.** This answers the brief's question D1. §6 records it as row 1.

### 0.2 The bar

| | against SESTINA v1.0 | against Monet v1.0 | source |
|---|---:|---:|---|
| **Monet v1.0** (v0.54's vector) | **58.38%** over 14,400 games on twelve fresh seeds; lowest seed 56.58%, SD 1.43 | (itself) | [Record] MONET.md §3.9, §3.8ba |
| **ATHENA v1.0**, the target | not below Monet on the same seeds (brief AC3; strictness is question D3) | beaten head-to-head; brief AC1 proposes ≥ 52.0% on twelve fresh seeds | [Record] brief C.3; the bars are the owner's (§5, D3) |
| **ATHENA today** | not built | not built | — |

Monet decides in **0.178 ms** on average and plays a whole game in **119 ms**. It does not search at play time.
[Record] MONET.md §3.8az; paper §4.

### 0.3 What "from scratch" means here

[Judgement, made precise from brief C.4 and C.5] ATHENA's policy, value and belief networks start from random weights.
Their training signal is the game result from ATHENA's own games. The reward is the win or the loss (§1). Three rules
follow.

**SESTINA's recorded play is used only in three ways:**

1. **As an opponent.** Monet v0.33, whose asks come from `sestina-clone-3`, can sit in the training league as a
   SESTINA-like adversary. The real SESTINA v1.0 is played at the bridge.
2. **As an evaluation reference.** Every bridge read is against SESTINA v1.0.
3. **As a test set.** SESTINA's games are the out-of-population test for the belief head (P1).

**It is never used:**

- as ATHENA's initialisation;
- as an imitation or auxiliary loss on ATHENA's own actions;
- as a KL anchor for ATHENA's policy;
- as a base policy that ATHENA overrides, which is what Monet does.

[Record] brief C.4. The records hold about 25 million of SESTINA's ask decisions (MONET.md §3.8ac).

**Monet is not a starting point either.** About six asks in ten that Monet plays are the clone's. `adv-4` overrides
the clone at 38.14% of ask decisions in home self-play [Record] (MONET.md §3.8az; paper §4). So distilling Monet into
ATHENA would import SESTINA's choices through the clone.

The brief's warm start from Monet (C.5 option b) is therefore **not** part of the from-scratch decision. It would come
back only as the pre-registered fallback, and only on the owner's explicit yes after a failed kill criterion (§3, P2).

**Rules-derived facts are allowed.** These include the candidate seats of each card, the cards already known and the
hand counts. They are deductions from the rules, not anyone's play (brief C.1, C.5).

---

## 1. The architecture (ATHENA-L, as decided)

[Record] brief C.1, as the owner took it on 2026-09-18. Nothing in this section is built. The sizes and the event
encoding are P1's to register.

| part | ATHENA-L |
|---|---|
| **Inputs** | the seat's own hand; the public log as a sequence of events; the rules-derived hard facts (candidate seats of each unseen card, the known cards, the hand counts) |
| **Network** | one small sequence encoder, transformer or recurrent (P1 sizes it), with these heads: <br>• an **ask policy**: a pointer over the legal (card, target) pairs; <br>• a **speculative declare** head; <br>• an **assignment** head; <br>• a **handoff (pass)** head; <br>• a **belief head**: card × seat, masked by the rules; <br>• a **value head** |
| **Critic** | sees the true deal during training only (PerfectDou-style perfect-information distillation, asymmetric actor-critic [L28], [L47]). The actor never sees it |
| **Training** | actor-critic self-play, PPO- or IMPALA-style [L32], [L33], with **one set of parameters shared by the three teammates** [L46]. Optional oracle guiding [L29] is a P2 variant, to be registered on its own |
| **Reward** | **the game result.** The set differential is only an auxiliary prediction, because a home set count at the five-set finish rewards declaring sooner (paper §3, "Home reads") |
| **League** (P3) | ATHENA snapshots; Monet v1.0; Monet v0.33 (the SESTINA-like opponent); Bass-era styles; main exploiters once ATHENA reaches Monet's level [L34] |
| **Hard rails** | the rules-certain declare; the MUSTFIX and PASSFIX translations in the bridge adapter |

**What ATHENA deliberately does not take from Monet** [Judgement, following brief A.2–A.9 and the owner's words]:

- **The clone** (`sestina-clone-3`), whether as the policy, as its base or as a feature. It may appear only as the
  opponent inside Monet v0.33.
- **The learned corrections** `adv-2` and `adv-4`. They are one step of policy improvement on top of the clone, and
  their labels come from v0.33 self-play (MONET.md §3.8az).
- **The ranker and its credits.** `licenceLambda`, `contest`, `closing` and `closingFour` have acted only on the
  ranker's own choice. That choice has not been played since v0.30 (paper §4). The ranker's own score (70p + 18
  progress + 12 narrowing + 20 certain + a gamble bonus; brief A.0, paper §4) goes as well.
- **The hand-built belief** as ATHENA's belief: the iterative-proportional-fitting table (`pModel: 'marginal'`) and
  the joint chain. These remain the **baseline** that the belief head must beat, using §3.8ah's metrics. Whether they
  are also used to rescale the head's output to the public hand counts (brief B.4.1) is registered in P1, if at all.
- **The speculative-declare bars:** 0.775, 0.5 once the game has stalled, and 0.975 for a set Monet holds no card of
  (brief A.0, paper §4). ATHENA learns the speculative declare, its timing and the handoff.

**What ATHENA does take from Monet:**

- **The rules-derived constraint facts.** `lib/engine/bots/knowledge.ts` rebuilds them from the public view on every
  call: the deal-time holder of each card, set-membership constraints from asks, and count exhaustion propagated to a
  fixpoint. They are deductions from the rules, and its tests check them against the true deal at every step of 300
  games (the file's header).
- **The rules-certain declare as a hard rail.** In Monet's accounting, the declares whose every card was certain were
  right **4,441 times out of 4,441** (MONET.md §3.8av). The rail fixes the declare and its assignment for any set that
  is certain by the rules. [Judgement] Whether ATHENA may *hold* a certain set rather than cash it at its option is a
  timing decision. It is left out of the rail and belongs to a later rung registered on its own.
- **The bridge translations, kept in the adapter and never in the policy.**
  - **PASSFIX:** the host offers a pass to a turn-holder with no cards, and the adapter takes it.
  - **MUSTFIX:** an uncertain compelled claim is answered `none`, so the host's forced endgame resolves it. It was
    worth **+1.28 points**, paired, on v0.9's vector, ahead on 12 of 12 seeds.

  [Record] paper §2; MONET.md §3.8f.
- **The apparatus:** the rules engine as the reference, the harnesses, the pins, the seed rule and the controls (§2).

---

## 2. The rules carried over from Monet's ladder

These carry over unchanged. ATHENA's ladder is read by the same rules as Monet's, so that its numbers can be set
beside Monet's.

- **Pre-registration before any game.** Each rung is written down before its first cell: the mechanism, the bar that
  ships it, a probability for each prediction, and the cost. Predictions are scored after the read, hits and misses
  alike. A finding that was not registered is marked as such. [Record] paper §3; the form of MONET.md §3.8ba
  ("Pre-registered before any cell is run").
- **Fresh seeds, paired.**
  - Seeds are drawn by the engine's own hash, under a label written before the cell, against every seed on file.
  - A seed that has been read is spent.
  - A read is **twelve fresh seeds** of 200 deals × 6 rotations. Both arms play the same deals.

  [Record] MONET.md §6.5, §3.8ba ("The seeds"); paper §2.
- **The ship rule.** A rung ships when its pre-registered read on twelve fresh seeds meets both conditions:
  1. **the mean of the twelve paired differences is at least 2 SE above zero** (SE = SD/√12);
  2. **the candidate is strictly ahead on at least 7 of the 12.**

  The ±2.00 paired floor at twelve seeds remains the definition of a *rung*. A term that ships under the floor is
  marked as such. [Record] MONET.md §3.8n, worded as §3.8ay and §3.8az registered it; paper §3; floors from MONET.md
  §6.3.
- **Step 0 and the pins.**
  - A new arm or tree first reproduces a known cell game for game (MONET.md §3.8ba step 0; §6.2's cross-instrument
    identity pin).
  - Every ask recorded at the bridge is replayed at home through the registry's own policy, and all of them must
    agree. One cell replayed by the previous version must differ (paper §2).
  - For ATHENA, this requires **deterministic CPU inference**, meaning a fixed order of arithmetic. GPU inference is
    not reproducible enough for a pin (brief C.3). §4's G0d builds this contract.
- **§6.2's controls, with the mirror cell excluded.** These are:
  - op coverage against an expectation written before the run;
  - the byte-exact null arm;
  - the cross-instrument identity pin;
  - paired deals;
  - the named fault counters at zero;
  - the calibration harness on every cell;
  - the completion check;
  - a home regression of at least 800 duplicate pairs before any ship.

  A mirror cell reads 50% by construction, and it once read a perfect 50.0000% across a 3.44-point defect. [Record]
  MONET.md §6.2.
- **Home reads by the win rate.** Anything that touches declare timing is read at home by the pairs' win rate, not by
  their set difference. The home set count rewards declaring sooner. [Record] paper §3.
- **No belief change without the declare pin.** A belief that is better in pooled Brier score read −0.74 abroad
  through the declare chain. [Record] MONET.md §3.8l; §3.8n ("still not recommended").
- **The owner makes every ship decision.** The record says which decisions were theirs. [Record] paper §3.

**Two rules new to ATHENA, proposed here** [Judgement]:

1. **"The port trains, the reference judges."** A fast engine port (P0) runs only ATHENA's *training* games. Every
   read, pin, acceptance cell and published number is played on the TypeScript reference engine (`lib/engine/`) at
   home, or on FishLab's engine at the bridge. A drift that the replay gate missed could then only make training
   slightly off-distribution. It could never reach a published number. This is the proposed answer to the brief's
   question D9.
2. **Every ATHENA version is a frozen weight file plus a registry entry.** It is pinned by its deterministic CPU
   forward pass, as the clone and `adv-4` are pinned as data (`lib/engine/bots/data/*.ts`).

---

## 3. Phases and gates, P0 to P5

These are from brief C.2. The P0 row has been changed by today's scoping, and §4 says how. **Every duration is an
estimate.** The brief's assumptions were:

- a ported engine;
- a GPU;
- about 10^7 to 10^8 games from scratch to Monet's level, uncertain "by about an order of magnitude either way";
- no single run longer than about a week.

[Estimate] brief C.2. The owner's only recorded limit on run length is *"I don't want this to be running for weeks"*
(MONET.md §3.8ac, 2026-09-08). The longest acceptable single run is still theirs to state (§5, D4).

| phase | what | gate (pre-registered before any game) | compute and wall clock [Estimate] |
|---|---|---|---|
| **P0** Engine and harness | Port the us54 rules to a fast engine that replays our recorded games byte for byte. Serve Monet v1.0 and v0.33 as callable opponents. Build a home head-to-head harness. Package a stub ATHENA as a FishLab guest bot | **G0a–G0d, §4.6.** G0a replays every state of 10,800 reference games plus a view walk of 14,400 bridge games; G0b is ≥ 10,000 games/s on 8 threads. G0b is raised from the brief's 10^3 because the reference alone nearly clears 10^3 (§4.3) | 8–12 working days of engineering; under an hour of CPU; no GPU training; no Docker |
| **P1** Belief head and sizing studies | Port the rules-derived facts. Build the brief's B.4.1 belief head. Re-run D4 with the head as the deal sampler. Re-measure the cheat ceiling (B.6.1). Records studies of the forced endgame (B.7.1) and of AIVAT (B.8.3). Size the network against the deterministic forward's cost | G1 is informative, not a ship gate. The head must gain ≥ +2.0 top-1 over the marginal on both populations; the marginal's baseline is 32.19% top-1 and NLL 1.4542 (MONET.md §3.8ah). D4-with-head at ≥ +2 SE opens ATHENA-S. **Declare pin on any belief change** | 1–3 days; hours of GPU; the records studies play no cell |
| **P2** From scratch to Monet's level | PPO with the perfect-information critic and the belief head. Opponents are ATHENA itself, Monet v1.0 and v0.33 | **G2:** ≥ 50.0% against Monet v1.0 at home on twelve fresh seeds. **Kill criterion:** below 45% after the registered budget (brief: for example 10^8 games) goes to the owner with C.5's fallback | 2–5 days of running if P0's throughput holds and the learner is the bound. Monet's share is CPU-bound (below) |
| **P3** The league: beat Monet | Add snapshots, Bass styles, main exploiters, and the share of games against Monet (brief B.5.1) | **G3a (home):** ATHENA against Monet is ≥ 2 SE above 50%, strictly ahead on ≥ 7 of 12. **G3b (bridge):** ATHENA and Monet each play SESTINA on the *same* twelve fresh seeds, paired, and ATHENA is not below Monet | 3–7 days of running. A bridge read takes about 2–4 h, scaled from the acceptance read's 84 cells, which ran from 09:31Z to about 11:01Z (MONET.md §3.8ba, "What ran, and the wall clock"), and from ATHENA's decision cost |
| **P4** ATHENA-S (optional) | Endgame search using the head's belief. Opens only if D4-with-head clears | **G4:** §3.8n's bar over P3's vector at the bridge | 2–4 days |
| **P5** Acceptance | brief C.3's AC1–AC8, as the owner fixes them | all conditions on one registered read | about a day, exploiter training included |

**Sizing inputs measured today that change the brief's arithmetic:**

- **Decisions a game.** In Monet v1.0's own games there are **92.4 asks, 7.40 declares, 561.6 declines and 0.25
  passes a game** [Measured, 60 mirror games]. §3.8av's census at v0.33 read 85.9 asks, about 7.6 claim windows and
  525.0 declines [Record] MONET.md §3.8av S.
  - The brief assumed "about 100 network decisions a game". That holds **only if the ~560 window offers a game do not
    each call the network.**
  - So P1 must register how the speculative-declare head is gated: a rule that offers it only when some set has a
    live plan, or one batched call per window for all six seats.
  - [Judgement] If every offer calls the network, a game costs about seven times the forward passes the brief costed.
- **Monet as a training opponent is CPU-bound.**
  - A Monet v1.0 game costs **114.7 ms** with Monet in all six seats [Measured, `bench-decide.mjs`, 60 games, quiet
    host]. MONET.md row 64 reads 113 ms at the entry.
  - v0.33 costs **82.2 ms** a game [Measured, 30 games].
  - [Estimate] With Monet on one team, a thread plays about 15–20 Monet games a second. Eight threads give about
    120–160 a second. 10^7 games against Monet would take roughly 17–23 hours of those eight threads.
  - So the league's share of real Monet games is set by CPU, not by the GPU. This is question D13 in §5.

---

## 4. P0 pre-registration (DRAFT, for the owner's review)

**Status: DRAFT. Nothing below has run except the scoping in §4.1–§4.4.** These measurements are engine checks and
timings. They read no win rate, spend no seed, and ship nothing.

### 4.1 The rules to port

**The reference is nine files in `lib/engine/`.** Git blob ids are at `7bfd3fd`, and the line counts are of the
committed files:

| file | lines | blob | what the port must reproduce |
|---|---:|---|---|
| `reduce.ts` | 649 | `c2d9b50a84` | `newGame`, `reduce`: the ask, the claim (declare), the decline, the pass; the declare window (`windowAfter`); `declareTail`; `nextSeatWithCards`; `awardedSets`; the clinch |
| `helpers.ts` | 146 | `8d79707c37` | `legalAsks` (and its order), `turnHolderCanAsk` (the MUST_DECLARE test), `legalActionsSummary`, `legalAsksFromView` |
| `cards.ts` | 202 | `92b5918eb1` | the 54-card canonical order, the 9-set order, `cardBook`, `bookCards`, `sortHand`, the teams |
| `rng.ts` | 41 | `5a484b85ee` | xmur3 → mulberry32, `randInt` |
| `deal.ts` | 31 | `abd8e8b2c4` | Fisher–Yates, then a round-robin deal |
| `variants.ts` | 96 | `22f1874a6b` | the us54 row of the rule-effects table; `clinchTarget` = 5 |
| `views.ts` | 32 | `cf155513b1` | `publicView`, `seatView`: the information rules |
| `types.ts` | 227 | `413a5eb10d` | the state, the action, the event and the error shapes |
| `invariants.ts` | 262 | `3ed9bffe17` | the structural checks and the deadlock gate. The port need not copy them; its test harness should run their us54 half |

That is **1,686 lines**, of which the port needs the us54 paths only. The rules document is `RULES_US54.md` (325
lines). Its **SHA-256 over the committed blob is `e9311958e811b7bc…`** [Measured]. The port records this hash beside
the revision it was gated on.

**The information rules (`SeatView`)** are `PublicState` plus the seat's own hand (`lib/engine/bots/types.ts:13`).

- **Public:**
  - the phase and the turn;
  - the declare window: which seat holds the option, and how many seats have declined;
  - `moveIndex`, which counts every accepted action including declines;
  - all six hand counts;
  - the score, and every resolved set with its claimer, the stated assignment, **the true holders of all six cards,
    even for a wrong declare**, and its outcome;
  - the event log: `game_started`, `ask` (asker, target, card, hit), `claim`, `pass`, `player_out`, `game_over`.
- **Private:** the seat's own hand, in canonical order.
- **Declines are not logged.** They can be inferred from `moveIndex` and the window.
- **At the bridge, one field differs.** FishLab's host publishes only the owners claimed by a *wrong* declaration,
  never its true holders. The adapter therefore fills `actualHolders` only for cards a hit had already located
  (`botpkg/bridge.mjs:133-150`), and the package self-test reproduces this reduced reveal
  (`scripts/botpkg-selftest.mjs` header). [Judgement] P1 must register which reveal rule ATHENA trains under. The
  port can offer both, and the reduced one is a view transform that can be tested against `bridge.mjs`.

**Every subtlety a port must reproduce exactly.** Each item was read from the committed code.

1. **The deal.**
   - xmur3 hashes the seed string's **UTF-16 code units** (`charCodeAt`), and its first output seeds mulberry32.
   - `Math.imul` is a wrapping 32-bit multiply. `rng()` = u32 / 2^32.
   - `randInt(n) = floor(rng()·n)` is exact in float64, since u32·n < 2^38. So a port can compute `(u32·n) >> 32` in
     integers.
   - Fisher–Yates runs i = 53…1, with j = randInt(i+1).
   - The card at shuffled position i goes to seat i mod 6, and each hand is then sorted canonically.
2. **The canonical orders.**
   - Cards run suit-major C, D, H, S, with ranks 2…A including the 8, and **XR, XB last**.
   - Sets run LOW-C, LOW-D, LOW-H, LOW-S, HIGH-C, HIGH-D, HIGH-H, HIGH-S, EIGHTS.
   - EIGHTS is 8C, 8D, 8H, 8S, XR, XB.
   - `legalAsks` runs over targets in ascending seat order and, within each target, over cards in deck order. Stubs
     and fuzzers pick from it by index, so the order is part of the replay.
3. **The first move of every game is a window poll, not an ask.** `newGame` opens the window at the starting seat
   with `declined: 0`.
4. **Ask legality, in this order:** `WRONG_PHASE`, `DECLARE_WINDOW_OPEN`, `NOT_YOUR_TURN`, `ASKER_OUT`, a bad target
   (`INVALID_ACTION`), `TARGET_TEAMMATE` (checked **before** `TARGET_SELF`), `TARGET_SELF`, `TARGET_OUT`,
   `INVALID_CARD`, `NO_CARD_OF_BOOK`, `ASKING_OWN_CARD`.
5. **The ask's two outcomes.**
   - **A hit** moves the card, re-sorts the asker's hand, and emits `player_out` if the target is emptied. The asker
     keeps the turn, and the window re-opens **on the asker**.
   - **A miss** passes the turn to the target, and the window opens **on the target**.
   - us54 never enters the `endgame` phase.
6. **Claim legality, in the us54 order:**
   - `WRONG_PHASE`, then `BOOK_RESOLVED`. This is the reverse of the 48-card order.
   - Then `NO_DECLARE_WINDOW`, then `NOT_YOUR_OPTION`. `NOT_YOUR_TURN` is not a declare error here.
   - Then `INVALID_ACTION` for a name that is not a set.
   - Then `BAD_ASSIGNMENTS`: exactly six keys, covering the set.
   - Then `ASSIGN_OPPONENT`, checked in the set's card order.
7. **Resolving a claim.**
   - The true holders of all six cards are recorded before the cards are removed.
   - If an opponent holds any card, the set goes to the opponents. If all six are correct, it goes to the declarer's
     team. Otherwise the set was the own team's but misassigned, and **it also goes to the opponents**: us54 has no
     `void`.
   - The six cards leave play, and `player_out` is emitted for every newly emptied seat, **in seat order 0…5, after
     the claim event**.
8. **The clinch.**
   - It counts **awarded sets by outcome, never `score`**. It fires when either team has 5.
   - `game_over` carries the winner, and the game ends with sets unresolved and cards still in hands.
   - The `resolved === 9` fallback terminator exists and must never fire alone. `fuzz-variant.test.ts` explains why
     it coincides with the clinch in 5–4 finishes.
9. **Where the turn goes after a declare (`declareTail`).**
   - While the turn-holder still has cards, the window re-opens on the turn-holder with `declined: 0`. This covers an
     out-of-turn declarer who emptied only themselves: they simply drop out.
   - If the turn-holder was emptied **by anyone's declare** and a teammate still has cards, the phase becomes
     `awaitPass` and the window closes.
   - If the turn-holder's whole team is out, the turn moves to the next seat after it, ascending and cyclic, that
     holds cards.
   - This is the rule commit `f3390c6` corrected (RULES_US54.md §4's correction block dated 2026-09-01).
10. **The decline.**
    - Errors: `NO_DECLARE_WINDOW`, a bad seat, `NOT_YOUR_OPTION`, and **`MUST_DECLARE`** when the turn-holder could
      not ask. The turn-holder can ask when it is in `playing`, has cards, faces an opponent with cards, and holds
      some set with 1–5 cards in hand.
    - Otherwise the option moves to the next seat. Cardless seats are offered it too.
    - The sixth consecutive decline closes the window.
    - A decline emits no event but still increments `moveIndex`.
11. **The pass.**
    - It is legal only in `awaitPass`, and only for the turn-holder.
    - It errors with `PASS_TARGET_NOT_TEAMMATE`, or with `PASS_TARGET_OUT` when the target has no cards; passing to
      oneself gives the second.
    - After it, the phase is `playing`, the turn belongs to the receiver, and the window opens on the receiver.
12. **Refused actions change nothing.** An illegal action leaves the state and `moveIndex` untouched. A legal action
    always increments `moveIndex`.
13. **The step cap belongs to the harness.** A random-legal policy can livelock the game (RULES_US54.md §3.2). The
    cap is 6,000 in `duplicate-pairs.mjs` and `bench-decide.mjs`, and 5,000 in the tests. The port must count capped
    games, never drop them silently.
14. **Hash the state's meaning, not the TypeScript object.** After `windowAfter(null)`, a TS state carries the key
    `declareWindow: undefined`. `tests/bots/action-digest.ts`'s `canonicalAction` would serialise that key, so a
    port-neutral encoding is needed (§4.2).
15. **Out of scope:** the 48-card paths (`endgame`, `awaitDesignate`, `designate`, `void`, own-turn claims, ties, the
    toggles). The port implements us54 only and refuses any other configuration loudly.

The port also inherits the repo's own test vectors: RULES_US54.md §7's ten vectors (`tests/engine/us54-declare.test.ts`,
`deck-variant.test.ts`, `determinism.test.ts`, and `fuzz-variant.test.ts`, whose gate is 10,000 games).

### 4.2 The replay oracle

**What recorded games exist.**

- **The trajectory-pinned banks** (`tests/bots/data/monet-v*-bank.ts`, eleven files) are *digests* of a Monet
  version's decisions. The games themselves are driven by the roster styles. For example, `monet-v054-bank.ts` has 36
  games and 24,771 decisions.
  - They hold **no action logs and no state hashes**, so a port cannot replay them without the policies.
  - What they certify is the reference. **Today the `7bfd3fd` export reproduces all 36 digests with
    `monetPolicy('v0.54')` and with `'v1.0'`, and none with `'v0.53'`** [Measured, `bank-check.mjs`]. The record says
    the same for v0.54 and v0.53 (MONET.md row 64).
- **The bridge records** (`fish_record` JSON lines, one game per line, in the bench archive) are FishLab's engine's
  games, not our reducer's.
  - §3.8ba's read wrote **85 cell files: 12 against SESTINA, 60 panel, 12 from the second arm, plus step 0**, at 1,200
    games a cell [Measured, a file count of `bridge/monet-v55/records`].
  - They cannot be replayed through `reduce` action by action. The host plays all nine sets, has a pass op, and
    reveals less after a wrong declare (paper §2; `botpkg/bridge.mjs:133-150`).
  - They *can* be walked into our public-view shapes. `scripts/bridge-records.mjs` does this, and checks every
    tracked count against the host's.
- **Nothing on file is a log of home games with states.** `determinism.test.ts` replays action lists in memory only.

**So G0a's oracle is emitted from the reference.**

- `scripts/athena/emit-replay-corpus.mjs` is a new P0 deliverable. It runs on the `7bfd3fd` export after the bank
  check above has passed.
- It plays named populations (§4.6) and writes one record per game: the seed, the start seat, the population, the
  revision and the rules hash.
- For every step t it records:
  - the action A_t;
  - the events E_t;
  - the **semantic state** S_t;
  - the **legal-move record** L_t: the acting seat, the action kinds, whether a decline is legal, and the list of
    legal asks in the TS order;
  - on every tenth step, four **probe** actions with the reference's accept or refuse verdict and its error code.
- The semantic state S_t is `moveIndex`, the phase, the turn, the window (none, or option and declined count), the
  holder of each of the 54 cards (or "resolved"), each set's outcome, claimer, assignments and true holders, and the
  score.
- Each record is hashed into a rolling 64-bit digest **with the house's `ActionDigest` construction**
  (`tests/bots/action-digest.ts`: two `Math.imul` lanes, so the same digest is possible in any language). The
  per-step digests are stored.
- **The port passes when it reproduces every per-step digest byte for byte from the actions alone.**

**The protocol, tried in miniature today** [Measured, `bitboard-proto.mjs`]:

- A 200-line array-state us54 core in plain JavaScript replayed TS-recorded games step by step, comparing the phase,
  turn, window, `moveIndex`, every card's holder, every set's outcome and the score after **every** action.
- **Result: 360 games** (300 of the mixed stub and 60 of Monet v1.0 in all six seats), **229,367 steps, 0
  divergent**, on its first complete run.
- **Two planted mutants were both caught:**
  - **M1** (the turn-pass rule before commit `f3390c6`) diverged in **43 of 360** games.
  - **M2** (a misassigned own-team declare scored for the declarer) diverged in only **4 of 360**.
- **M2 is why G0a needs per-branch coverage floors,** not just a game count: a rare branch can hide in a large corpus.

### 4.3 Throughput, measured

All numbers are from one thread under Node 24.19.0 on the Ryzen 9 9900X, unless a row says otherwise. The host was
quiet (0–5% load before and after) except where noted. "Harness" means `legalActionsSummary`, plus `seatView` for
Monet, plus the move seed. "Rules-only replay" is `newGame` followed by `reduce` over a recorded action list, with no
policy at all.

| workload [Measured] | actions a game | full loop | policy | harness | `reduce` | rules-only replay |
|---|---:|---:|---:|---:|---:|---:|
| **Monet v1.0** in all six seats (60 games) | 661.7 | **117.5 ms** (8.5 games/s) | **113.8 ms (96.8%)** | 1.86 ms | **1.62 ms (2.45 µs an action)** | 749.6 games/s (1.33 ms a game) |
| `bench-decide.mjs --version v1.0` (60 games) | — | — | 0.1711 ms a decision, **114.7 ms a game**; an ask 0.4877 ms | — | — | — |
| `bench-decide.mjs --version v0.33` (30 games) | — | — | 0.1368 ms a decision, **82.2 ms a game** | — | — | — |
| **Mixed stub** (1,000 games) | 639.4 | **4.48 ms (223.1 games/s)** | 1.68 ms | 1.46 ms | 1.23 ms (1.92 µs) | **848.6 games/s** (1.18 ms) |
| mixed stub, **4 processes at once** | 639.4 | **730 games/s in total** (178–188 each) | — | — | — | 2,050 games/s in total |
| repo fuzz policy (`us54PolicyAction`, 2,000 games; host load not sampled) | 69.5 | 0.49 ms (2,048 games/s) | — | — | 0.15 ms (2.10 µs) | 7,234 games/s |
| random-legal stub (decline unless forced; forced declares random) | — | **52 of 60 games hit the 6,000-action cap** | — | — | — | — |
| **Array-state JS prototype**, its own copy of the mixed stub's rule | 637.2 | **22,067 games/s** (0.071 µs an action); 22,629 with windows collapsed | inside | none | inside | — |
| array-state prototype, **4 processes at once** | 637.2 | **85,029 games/s in total** (21,038–21,351 each) | — | — | — | — |
| reference replay **plus a canonical-JSON state hash at every step** | — | — | — | — | — | 94.8 (stub) and 98.4 (Monet) games/s: the oracle's emission cost |
| **the rules-derived facts** (`buildKnowledge`, rebuilt from the view), on 40 Monet v1.0 games | — | — | **0.0166 ms at an ask, 0.0180 ms at a window offer**: 1.5 ms a game at asks only, 11.7 ms if rebuilt at every decision (asks and offers) | — | — | — |

The **mixed stub** asks uniformly at random over the legal asks. At its window offer it declares any open set its
team holds entirely, reading the true deal to do so. With probability 0.01 it makes a random declare instead.
Otherwise it declines. Its games are as long as Monet's, and it reaches wrong declares.

**What the table says:**

- **The rules are not what makes the TypeScript simulator slow.**
  - In a Monet game, `reduce` is **1.4%** of the wall time, and the policy is **96.8%**.
  - With a stub, the reference's full loop is about **4.5 ms a game** (223 games/s on one thread; 730 games/s on four
    processes). [Estimate] That is about 2,000 games/s on eleven processes, before any observation encoding or
    transfer to a GPU.
  - **The brief's G0 bar of 10^3 games/s with a stub is therefore nearly met by the reference itself.** Met by a
    port, it would prove nothing.
- **ATHENA's inputs are cheap even on the reference.** The rules-derived facts cost 0.017 ms a call. Monet's 0.49 ms
  an ask is spent on the rest of its stack (the fitted table, the joint chain, the ranker and the two networks), not
  on the tracker.
  - [Estimate] With the facts rebuilt at every ask, the reference runs about 6 ms a game with a stub: about 165 games
    a second on one thread, or 1,500–1,800 on eleven at the four-process scaling measured above. Rebuilt at every
    decision, asks and offers, it runs about 16 ms a game: about 550–680 a second on eleven.
  - **So the reference is not ruled out by raw speed.** C.2's upper budget of 10^8 games would take roughly 15–50
    hours of all eleven cores [Estimate], before any IPC.
  - What it lacks is **headroom**, in two ways:
    - The brief's budget is uncertain tenfold either way. At 10^9 games the reference needs about 6–21 days, and a
      port at G0b's bar needs about 28 hours.
    - The reference leaves **no cores** for Monet's games, the opponent service or the learner's data path.
- **A mutable, allocation-free representation removes about two orders of magnitude.** The array-state prototype ran
  the same stub rule **~99×** faster than the reference's full loop, and **~26×** faster than the reference's
  rules-only replay. It did so in the same language, on one thread, and it scaled to 85,000 games/s on four
  processes.
  - [Judgement] What makes the reference slow is its design: immutable state, string cards, and a full legal
    enumeration each step. Node is not the cause. A compiled port should be at least as fast as the prototype.
- **Monet as an opponent sets the price of every league game it sits in.** At 114.7 ms a game in six seats, no
  engine speeds it up. It stays in Node, because its stack lives in `lib/engine/bots/`: about 10,400 lines of
  TypeScript, of which `decide.ts` alone is 2,353 [Measured, line counts].
- **The random-legal stub mostly never ends,** exactly as RULES_US54.md §3.2 warns. A stub for throughput has to
  declare.

### 4.4 The stack, compared, and the recommendation

The learner is PyTorch in every option: every precedent in the brief trains a neural network, and the GPU is
NVIDIA. The options differ in where the game runs.

| option | rule-drift risk | env throughput | integration with the learner | what it needs | effort [Estimate] |
|---|---|---|---|---|---|
| **(a) PyTorch GPU-vectorised env** (all games as batched tensors, pgx-style) | **highest.** A branchless rewrite of the window, MUST_DECLARE, `awaitPass`, `nextSeatWithCards` and the clinch has no one-to-one map to `reduce.ts`. The rules-derived facts are a fixpoint propagation (`knowledge.ts`, 1,095 lines), which vectorises badly | [Estimate] 10^4–10^5+ games/s at batch ≥ 4,096, unmeasured. It shares the one GPU with the learner | best: observations are born on the GPU | PyTorch only | M–L |
| **(b) Rust core + PyO3**, a batched env returning NumPy arrays | **moderate, and caught by G0a.** A sequential port mirrors `reduceAsk`, `reduceClaim`, `declareTail` and `reduceDecline` function by function. The tracker ports the same way | [Estimate] ≥ 20,000 games/s a thread for the core, anchored on the **measured** JS prototype (22,067). The gate: ≥ 10,000 end to end on 8 threads | in-process, zero-copy to PyTorch; leaves the GPU to the learner | PyTorch, Rust, the MSVC build tools, maturin | M |
| **(c) The TS reference in Node actors**, with GPU inference over IPC | **none:** it *is* the reference | **measured** 223 games/s a thread with a stub, 730 on four processes. [Estimate] about 2,000 on eleven; 1,500–1,800 with the facts at every ask (measured at 0.017 ms a call); before encoding and IPC. Uses every core | two runtimes; every decision crosses a process boundary | PyTorch only | S–M |
| (c′) An array-state TS port in Node, over IPC | moderate, caught by G0a | **measured** core of 22,067 games/s a thread; IPC unmeasured | as (c) | PyTorch only | M |
| **(d) Python/NumPy with multiprocessing** | moderate, caught by G0a | [Estimate] 300–700 games/s a process (pure-Python scalar code, 30–100× slower than the prototype); NumPy does not help a single game's step | in-process, but the env processes compete with the learner for 12 cores | PyTorch, NumPy | M |

**Recommendation for P0: (b), a Rust port of the us54 core with PyO3 bindings and a PyTorch (CUDA 12.8) learner.**
The TypeScript engine stays the reference and the only judge (§2), and Monet v1.0 and v0.33 run as a Node opponent
service. [Judgement] The reasons, in order:

1. **The replay gate is P0's gate, and a sequential port is the one it can debug.** A divergence found by G0a points
   to one function of `reduce.ts`, and the port can be reviewed side by side with it. In today's prototype, the
   structure-for-structure form replayed 229,367 reference steps with no divergence on its first complete run, and
   both mutants were caught. A branchless tensor env gives up that correspondence. Rule drift is the one risk the
   brief names for the port (B.8.1).
2. **ATHENA's inputs need the tracker, and the tracker is sequential code.** The rules-derived facts (§1) come from
   `knowledge.ts`'s propagation to a fixpoint, which ports to Rust directly and to batched tensors poorly. P1 needs
   them in the training engine, and the certain-declare rail needs them too.
3. **Past a port, the environment stops being the bottleneck.** The GPU learner and Monet's CPU cost are then the
   limits. The reference could carry C.2's budget of 10^8 games only by taking all eleven cores for about a day or two
   (§4.3). A port at G0b's bar takes 2.8 hours of eight threads for the same games, and absorbs a tenfold overrun of
   the budget.
   - A 16 GB card has ample memory for a small model plus its batches. Its compute is the scarce resource.
   - (b) leaves all of the GPU to the learner. (a) would spend some of it on the rules.
   - (a)'s extra speed buys nothing once the learner is the bound.
4. **It matches what the brief's precedents did.** DouZero trained with "many parallel actors" [L27]. DanZero ran a
   distributed self-play framework on 160 CPUs and 1 GPU [L30]. Both kept the environment on CPU actors feeding a GPU
   learner. The accelerator-native route is Pgx, which reports 10–100× the speed of Python implementations [L63], but
   it is JAX. [Judgement, unverified here] JAX's GPU builds target Linux, so on this Windows machine a pgx-style env
   would have to be rewritten in PyTorch.
5. **The installs are one-time and self-contained.** The Rust crate would be about 1–2 thousand lines [Estimate].
   Nothing in `lib/` changes.

**If the owner declines the Rust and MSVC installs:** fall back to (c′). An array-state TypeScript port in Node
workers keeps the rules in one language and has a measured core of 22k games/s a thread. Its open risk is the
Node-to-Python channel, which today's scoping did not measure. P0's gates apply to either option unchanged. **(c)
alone is the fallback of last resort.** It passes the brief's 10^3 bar with no port, but it cannot meet G0b, and P2's
budget would have to be re-costed at its rate.

### 4.5 Deliverables

1. **The oracle emitter,** `scripts/athena/emit-replay-corpus.mjs` (TypeScript side, in the repo).
   - It writes §4.2's per-step records for §4.6's populations from a named revision.
   - It refuses to run unless that revision reproduces the v0.54 forward bank (36 of 36).
   - The corpus lives outside the repo in the bench archive. The repo carries the emitter and a manifest of one digest
     per population.
2. **The port,** `athena-env/` (Rust).
   - It has a us54 core over array state, a deal identical to `deal.ts`, the canonical step record and its digest,
     legal masks, the probe verdicts, and a SeatView-equivalent encoder.
   - It has a batched Python API (PyO3 through maturin): `reset(seeds, start_seats)`, `step(actions)`, and
     `observe()`. The observations, legal masks and rewards come back as NumPy arrays.
   - It carries RULES_US54.md §7's ten vectors as unit tests.
3. **The replay checker and coverage report.**
   - It compares every per-step digest, every legal-move digest and every probe verdict.
   - It counts the branches of §4.6's floor table.
   - It runs the five mutants M1–M5 and must see each one fail.
4. **The Node opponent service.**
   - A worker pool keeps the TS `GameState` of each game and applies the port's actions to it. It answers
     `decide(seatView, monetPolicy(v), hashSeed(`${seed}:${moveIndex}`)())` for Monet v1.0 and v0.33 seats: the lab's
     own seeding.
   - It returns the reference's state digest with every answer, **so every training game against Monet is also a live
     replay check.**
5. **The home head-to-head harness,** in two geometries.
   - **(A)** `duplicate-pairs.mjs`'s geometry: seeds `${bank}-${g}`, start seat 0, both orientations. This is used for
     G0c's pin.
   - **(B)** The bridge cell's geometry: 200 deals × 6 seat rotations, 1,200 games a cell, with the rotation rule
     defined and unit-tested. This is for P2's and P3's reads, which play on the reference (§2).
6. **The inference contract and a stub package.**
   - A deterministic plain-JavaScript forward pass for the candidate network family, with its cost per decision
     reported at three sizes. This informs P1's sizing and question D5.
   - An **ATHENA-stub** FishLab package, built on the repo's `botpkg/` pattern. It carries a fixed-weight network, the
     certain-declare rail, and MUSTFIX and PASSFIX in the adapter.
7. **The seed tool, brought in from the scratchpad** (housekeeping, found today).
   - The seed drawer that MONET.md §3.8ba used (`seeds-next.mjs`, with its embedded list of spent seeds) existed
     only in the session scratchpad under `%TEMP%`. It was in neither the repository nor the bench archive
     [Measured: a search of both].
   - **Archived 2026-09-18** to `C:\Projects\FishAI-bench\tools\`, with the other seed scripts and the sixteen
     `SEEDS` files of later rungs that it reads as spent. It is promoted into `scripts/` before any ATHENA seed is
     drawn.

### 4.6 Gates, with exact bars

**G0a: byte-identical replay.** Both parts must hold.

**(i) The home corpus.** It is emitted from `7bfd3fd`, or from the revision P0 starts on, with the rules hash
recorded:

| id | population | games | seeds | why it is there |
|---|---|---:|---|---|
| H1 | Monet v1.0 in all six seats | 2,000 | `athena-p0-g0a-h1-<i>`, start seat i mod 6 | the anchor opponent's own positions; long, realistic games |
| H2 | the nine roster styles, each as a mirror table | 1,800 (9 × 200) | **the 36 seeds of the v0.54 forward bank**, plus `athena-p0-g0a-h2-<style>-<i>` | ties the corpus to the committed pins: those 36 games' step counts must equal the bank's decision counts |
| H3 | Monet v1.0 against v0.33, both orientations | 1,000 (500 deals × 2) | `athena-p0-g0a-h3-<i>`, as `duplicate-pairs.mjs` plays them | the SESTINA-like league opponent against the anchor |
| H4 | the repo's us54 fuzz policy (`tests/engine/policy.ts`, `us54PolicyAction`) | 4,000 | seeded as `fuzz-variant.test.ts` seeds them, under `athena-p0-g0a-h4-<i>` | the rare branches: misassignments, cardless declarers, a whole team out |
| H5 | the mixed stub (§4.3), which is also G0b's stub | 2,000 | `athena-p0-g0a-h5-<i>` | random asks reach positions no bot plays |
| | **total** | **10,800** | | [Estimate] about 4.7 million steps (H2 and H3 taken at Monet's length), from the measured actions a game |

Every one of these must hold:

- **Every per-step digest is equal** across all 10,800 games, and so are **every legal-move digest** and **every
  probe's accept or refuse verdict**. Error codes are reported as information only.
- **The acting seat's view digest is equal at every decision point.** This digest is the canonical SeatView, with its
  log digested incrementally. It is the information-rule check: the port cannot show a seat what `seatView` does not.
- **No game hits the 6,000-action cap** in H1–H3 or H5. **The `resolved === 9` terminator never fires alone.**
- **Every branch in the table below occurs at least 50 times** in the corpus.
  - If a floor is short, H4 is extended in blocks of 2,000 games, up to 20,000 more, and the extension is reported.
  - If a floor is still short after that, G0a fails.
- **All five mutants fail the gate.** Each must produce at least one divergent game.
  - M1: the turn-pass rule before commit `f3390c6`.
  - M2: a misassigned own-team declare scores for the declarer.
  - M3: a declare does not re-open the window from the top.
  - M4: a decline is allowed when the turn-holder cannot ask.
  - M5: the window opens on the asker after a miss.

The branch floors, with rates a game from today's scoping [Measured; H2 and H3 not measured]. The expected count is
H1's rate × 2,000 + H5's × 2,000 + H4's × 4,000. H2 and H3 are left out, so the full corpus should see more:

| branch | H1 Monet (60 games) | H5 mixed (1,000) | H4 fuzz (2,000) | expected in the corpus [Estimate] |
|---|---:|---:|---:|---:|
| hit empties the target (`player_out` on a hit) | 0.967 | 0.590 | 0.045 | ≈ 3,300 |
| window closed by six declines | 92.4 | 88.2 | 6.55 | ≈ 387,000 |
| forced declare (the MUST_DECLARE window) | 0.617 | 0.360 | 0.018 | ≈ 2,000 |
| declare right | 7.32 | 2.05 | 0.059 | ≈ 19,000 |
| declare wrong, an opponent held a card | 0.033 | 5.53 | 7.40 | ≈ 40,700 |
| **declare wrong, own team held all six (misassigned)** | 0.050 | 0.003 | 0.064 | ≈ 360 |
| out-of-turn declare | 2.75 | 4.66 | 5.83 | ≈ 38,100 |
| **declare by a cardless seat** | 0 | 0.175 | 0.170 | ≈ 1,030 |
| declarer who held the turn emptied → `awaitPass` | 0.200 | 0.328 | 0.026 | ≈ 1,160 |
| **another seat's declare empties the turn-holder → `awaitPass`** | 0.050 | 0.107 | 0.110 | ≈ 760 |
| **whole team out → next seat with cards** | 0.050 | 0 | 0.0065 | **≈ 130 (the rarest; H1's rate rests on 3 events)** |
| pass | 0.25 | 0.435 | 0.136 | ≈ 1,900 |
| finish 5–0 / 5–4 (each score line counted) | 0.083 / 0.250 | 0.059 / 0.271 | 0.070 / 0.266 | ≈ 560 / 2,100 |
| declare after at least one decline in the same window | not counted today | | | floor only |
| cardless seat declines | not counted today | | | floor only |

**(ii) The bridge walk.**

- It covers the **14,400 games of §3.8ba's twelve SESTINA cells** (`bridge/monet-v55/records/panel-sestina-*.jsonl`).
- The port's record reader must reproduce `scripts/bridge-records.mjs`'s walk. At every ask event, the asking seat's
  view digest must equal the digest of the view `walkAsks` builds, and the host's reduced reveal must be preserved.
- The **score must be by team**, not by side. A record's tally runs by side, and the engine keeps the score by team;
  the walk hands a view its score in team order (`scripts/attribute.mjs:286-289`; `bridge-records.mjs`'s
  `walkAsks` already does).

**G0b: throughput.**

- The bar is **at least 10,000 games a second end to end on 8 threads.** "End to end" means:
  - the Rust core behind its Python batch API;
  - the mixed stub's rule implemented in NumPy over the port's legal masks;
  - the observation buffers filled.
- It is measured over **at least 200,000 games after 10,000 of warm-up,** on a host at ≤ 10% load before the start.
- The single-thread core rate and the scaling at 1, 2, 4 and 8 threads are reported beside it.
- **Between 1,000 and 10,000,** G0b is missed. The shortfall is profiled and reported, and the owner chooses between
  going on with P2's budget re-costed at the measured rate, or more engineering.
- **Below 1,000,** the brief's own bar, the port is not faster than the reference in any way that matters, and §4.4's
  choice is reopened.
- **Why 10,000:**
  - [Measured] The reference already does about 730 games/s on four processes with this stub, so 10^3 would not
    distinguish the port from the reference.
  - [Measured] The array-state prototype did 22,067 games/s on one thread without observations. A sound port behind a
    Python boundary keeps well over the ~6% of that rate which 10,000 on eight threads requires [Judgement].
  - [Estimate] At 10,000 games/s, 10^8 games, the top of C.2's P2 range, take **2.8 hours** of environment time. The
    environment stays a small part of any multi-day run, and the GPU learner becomes the bound that P1 sizes.

**G0c: the harness and the opponents.** All three must hold:

1. **The cross-instrument identity pin.**
   - The new harness (geometry A) drives the games with the port and takes Monet v1.0's and v0.33's moves from the
     Node service.
   - It must reproduce `node scripts/duplicate-pairs.mjs --a v1.0 --b v0.33 --pairs 200 --bank athena-p0-pin` **game
     for game**: all 400 games' final set counts are identical, and the printed paired set difference, SD and win rate
     agree to four decimals.
   - These are harness checks on a named bank, not a read. No number from them is quoted as strength.
2. **The reference rides along.** The service's reference-state digest equals the port's at every step of those 400
   games.
3. **With M1 planted in the port,** check 2 fails.

**G0d: packaging and the inference contract.** All three must hold:

1. **The ATHENA-stub package passes the repo's package self-tests** (`botpkg-selftest.mjs` over 200 games, and
   `botpkg-forced-test.mjs`), adapted to the package. **Every fault counter must be zero.** The self-test's referee
   reproduces the host's reduced reveal (§4.1).
2. **The in-engine pin.** Every ask the package made is reproduced by the same JavaScript forward in-engine, at
   **100%**. The package with its weight file perturbed must differ.
3. **The forward's cost per decision** is reported at three candidate sizes. This is information for P1 and D5, and it
   gates nothing.

**No bridge cell is played in P0,** and Docker is not needed. The first bridge cell is step 0 of P3's first read.

### 4.7 Predictions, written before anything is built

- **Q1: G0a holds within P0 (90%).** The prototype matched 229,367 steps on its first run and caught both mutants. The
  port also carries events, legal moves, probes and views, so a **clean first full run is only 45%**. The expected
  failures are orderings (item 2 of §4.1) and view fields, not rules.
- **Q2: G0b holds (75%). The single-thread core reaches at least 20,000 games/s (80%).** The prototype measured
  22,067 in JavaScript. The risk is the Python boundary and the NumPy stub, not the core.
- **Q3: G0c holds (85%).** The seeding is the lab's and is copied exactly. The risk is an off-by-one in `moveIndex`
  between the port and the service.
- **Q4: G0d holds (80%).**
- **Q5: every mutant is caught (95%).** M1 and M2 were caught in the prototype, in 43 and 4 of 360 games.
- **Q6: every coverage floor is met without extending H4 (70%).** The whole-team-out branch is the risk: 3 events in
  60 Monet games and 13 in 2,000 fuzz games.
- **Q7: P0 is done inside 12 working days (55%).**
- **Joint:** all four gates held within P0's budget, **about 55%**. Most of the rest is G0b and time.

### 4.8 Cost and wall clock

| item | cost [Estimate] | basis |
|---|---|---|
| Engineering | **8–12 working days**: emitter and corpus 1; Rust core and vectors 3; batch API, observations and stub benchmark 2; checker, coverage and mutants 1; opponent service, harness and pin 2; stub package and inference contract 2; slack 1 | the brief's "1–2 weeks" (C.2), itemised |
| Corpus emission | **about 8 minutes on one thread** | H1: 2,000 × 117.5 ms ≈ 4 min [Measured rate]. H3 ≈ 1.7 min at the mean of Monet's and v0.33's costs. State digests ≈ 9 ms a game (98.4 against 749.6 games/s with and without the hash, Measured). H2, H4 and H5 add minutes |
| G0a replay in the port | seconds | at the prototype's rate |
| G0a(ii) bridge walk | 1–2 minutes | 14,400 games, view digests only |
| G0b | under a minute | 210,000 games at ≥ 10,000/s |
| G0c | about 2 minutes | 400 games through each harness, at about 100 ms a game |
| G0d | minutes | 200 self-test games |
| **GPU** | a PyTorch smoke test only | no training in P0 |
| **Disk** | installs about 13–16 GB (§4.10); corpus about 0.5 GB, outside the repo | C: has 1,208 GB free [Measured] |

The whole of P0's compute is under an hour of CPU. The wall clock is engineering time.

### 4.9 What would stop it

1. **The owner declines the installs.** P0 is re-registered on (c′) or (c) (§4.4). The gates stay the same, except
   that (c) cannot meet G0b.
2. **The reference fails its own pins** at P0's starting revision, meaning the v0.54 bank is not 36 of 36. Stop: the
   reference is broken. It held today.
3. **A G0a divergence is not located inside P0's budget.** Stop and report. Nothing downstream may train on an
   unverified port.
4. **G0b is below 1,000 games/s.** The stack is reopened.
5. **A rules change lands on main during P0.** That means any change to the nine files of §4.1 or to RULES_US54.md.
   The corpus is re-emitted at the new revision and G0a re-runs. Records that pin whole trajectories break on any
   rules change, and the bank files say so themselves: a `reduce.ts` change that moves a single action breaks a digest
   (`tests/bots/data/monet-v054-bank.ts`, header).
6. **Not a stop, but a precondition for P2:** the seed drawer (§4.5 item 7), archived on 2026-09-18, must be in the
   repo before ATHENA's first read draws a seed.

### 4.10 What needs the owner: the installs

Installing anything needs the owner's explicit approval (§6, row 2). **Nothing has been installed.** Today the machine
has Python 3.12.10 with neither `torch` nor `numpy`; no Rust; and no C or C++ compiler [Measured]. The sizes below are
approximate. None was fetched to check it, so each should be confirmed at install time.

| install | from | about how big | needed for |
|---|---|---|---|
| **PyTorch**, a stable build for **CUDA 12.8 or later**. The RTX 5070 Ti is Blackwell and needs the cu128+ builds; driver 616.56 is installed | `pip install torch --index-url https://download.pytorch.org/whl/cu128` | about 3 GB to download (the Windows wheel bundles the CUDA and cuDNN libraries); about 5–6 GB on disk | P0's smoke test and G0b's API; every later phase |
| **NumPy** | PyPI (`pip install numpy`) | about 15 MB | G0b's stub; the batch API's arrays |
| **Rust**, the stable `x86_64-pc-windows-msvc` toolchain, minimal profile | `rustup-init.exe` from https://rustup.rs (static.rust-lang.org) | about 250–300 MB to download; about 1 GB installed | the port |
| **The MSVC linker and Windows SDK**: Visual Studio 2022 Build Tools, "Desktop development with C++" workload | https://visualstudio.microsoft.com/visual-cpp-build-tools/ | about 2–3 GB to download; about 6–8 GB installed; needs administrator rights | linking Rust on Windows (the MSVC target) |
| **maturin** | PyPI (`pip install maturin`) | about 10 MB | building the PyO3 extension |

[Judgement, unverified] The Build Tools could be avoided with Rust's GNU target, which ships its own linker, but it is
not established here that PyO3 and maturin build cleanly on it against python.org's CPython. **(c′) needs only
PyTorch and NumPy.**

The two other things P0 needs from the owner are the approval of §4.6's bars and §4.7's predictions as written, and
their answer to D12, whether a Rust crate may live in the public repository.

---

## 5. Open questions for the owner

These are the brief's Part D, minus D1, which is answered (§0.1). Notes from today's scoping are marked.

- **D2. SESTINA's records inside ATHENA's belief?** A model of SESTINA's choices would be used to *read* SESTINA's
  asks, never to choose ATHENA's (brief C.4). Allowed or not?
- **D3. What does "beats Monet" mean?** Head-to-head only (AC1–AC2), or also strictly better than Monet against
  SESTINA (AC3 strict)?
- **D4. Hardware, and the longest single run.**
  - *Scoping note:* the local machine has an **RTX 5070 Ti (16 GB, Blackwell, driver 616.56)**, a 12-core Ryzen 9
    9900X and 31 GB of RAM [Measured]. [Judgement] By §3's estimates that is enough for P0 to P2, with the learner on
    the local GPU. The binding constraint is CPU for Monet's games, not the GPU.
  - Renting or buying remains the owner's call.
  - **The longest acceptable single run is still theirs to state.** The record holds only *"I don't want this to be
    running for weeks"* (MONET.md §3.8ac).
- **D5. The web build.** Must ATHENA run in the browser within Monet's budgets of 1.4 ms a decision and 0.9 s a game
  (MONET.md §3.4a item 6)? *Scoping note:* G0d's forward-cost numbers are the input.
- **D6. The exploiter condition (AC8):** reported only, or a gate? If a gate, at what bar?
- **D7. Partners.** Will ATHENA ever partner human players on the site? If so, its conventions must stay readable
  (Other-Play or OBL, brief B.6.1).
- **D8. Kraken.** Should Kraken be made runnable and added to the acceptance panel? It has never been played (paper
  §9).
- **D9. A second engine.** Is G0a enough to trust a port? *Scoping note, proposed answer:* §2's "the port trains, the
  reference judges", so no published number ever rests on the port.
- **D10. Monet's ladder.** Is it frozen at v1.0 while ATHENA is built, or does ATHENA-P run on Monet's registry as the
  control (brief C.1)? Choosing to start from scratch (D1) does not settle this.
- **D11. The condition-5 precedent.** For Monet, the owner accepted condition 5 as registered on 2026-09-18 (§0.1).
  For ATHENA, is a locked reader's "no" final, or is it scored as registered?

**New from today's scoping:**

- **D12. A Rust crate in the public repository** (MIT) beside the TypeScript engine. This is part of row 2's approval.
- **D13. Monet at training volume.**
  - Real Monet games are CPU-bound. [Estimate] That is about 15–20 a thread a second with Monet on one team (§3).
  - May the league also carry a **distilled Monet opponent**, a network fitted to Monet v1.0's own play and used only
    as an *opponent*, to add volume?
  - About six in ten of Monet's asks are the clone's (it overrides the clone at 38.14% of ask decisions, §0.3;
    paper §4), so this is SESTINA-derived play in the opponent seats only,
    which C.4 allows. It never enters ATHENA's own policy.
  - Real Monet stays the bar and the evaluator.

---

## 6. Decision table

In the form of MONET.md §8.3.

| # | decision | state |
|---|---|---|
| 1 | **How is ATHENA built?** The brief (C.1, Part D) recommended ATHENA-L: one policy learned from game outcomes, **from scratch**, in a league. It is actor-critic self-play (PPO- or IMPALA-style) with a perfect-information critic in training only, a learned belief head, parameters shared across teammates, the rules-certain declare as a hard rail, and the game result as the reward. The alternatives were ATHENA-P (Monet-seeded policy iteration, the brief's control and fallback) and a warm start from Monet (C.5). SESTINA's recorded play enters only as an opponent, a yardstick and a test set (C.4) | **TAKEN 2026-09-18, on the owner's words** *"accept condition 5 and go from scratch with ATHENA-L"*, after *"I dont want monet to just be a fine tuned version of a sestina copy"* the same day. The same sentence accepts §3.9's condition 5 as registered, so Monet v1.0 stands as the bar (MONET.md row 65). **Not settled by it:** D2–D11 (§5); ATHENA-P as a control (D10); the warm-start fallback, which stays behind P2's kill criterion and the owner's explicit yes (§0.3) |
| 2 | **Approve §4's P0 pre-registration and the installs it needs?** P0 would build the Rust port of the us54 core with PyO3 bindings, the oracle emitter, the Node opponent service, the home harness, and a stub package with a deterministic forward. Its gates are G0a (every state of 10,800 reference games plus a view walk of 14,400 bridge games, with branch floors and five mutants), G0b (≥ 10,000 games/s on 8 threads), G0c (game for game with `duplicate-pairs.mjs`) and G0d (the package self-tests, a 100% pin). The installs are PyTorch for CUDA 12.8, NumPy, Rust, the MSVC Build Tools and maturin (about 6 GB to download, 13–16 GB on disk, §4.10). The fallback if Rust is declined is (c′), which needs only PyTorch and NumPy. The stakes: 8–12 working days of engineering and under an hour of compute. It ships nothing and reads no strength. Without it, from-scratch training runs on the reference at about 550–1,800 games/s on all eleven cores [Estimate, §4.3]. That carries 10^8 games in about 15–50 hours but leaves no cores for Monet's games or the learner, and a tenfold overrun of the brief's budget becomes 6–21 days, against the owner's *"I don't want this to be running for weeks"* | **FOR THE OWNER.** The choices are: approve as drafted; approve with the bars changed; approve on (c′) without Rust; or hold |

---

## Appendix A. How today's numbers were made

The tree is `git -C C:/Projects/FishAI archive origin/main | tar -x -C $SP/athena-p0/src`, with origin/main at
`7bfd3fd`. `$SP` is this session's scratchpad. The scripts and every output file were written to
`$SP/athena-p0/bench/` and are archived at `C:\Projects\FishAI-bench\athena\p0-scoping\bench\`. All runs were on one
thread unless noted, under Node 24.19.0, with no `node_modules` needed.

| number | command (from `$SP/athena-p0/src` for `scripts/`, else from `bench/`) | output |
|---|---|---|
| Monet v1.0 decision cost | `node scripts/bench-decide.mjs --version v1.0 --games 60 --warmup 6` | `out-bench-decide-quiet.txt` |
| v0.33 decision cost | `node scripts/bench-decide.mjs --version v0.33 --games 30 --warmup 4` | `out-bench-decide-v033.txt` |
| rules against policy, Monet games | `node p0-throughput.mjs --mode monet --games 60 --warmup 6` | `out-monet-quiet.txt` |
| mixed stub | `node p0-throughput.mjs --mode mixed --games 1000 --warmup 50` | `out-mixed-quiet.txt` |
| four processes | four copies of the line above with `--games 800 --label q<i>`, at once | `out-q-mixed-{1..4}.txt` |
| fuzz, oracle and random-legal stubs | `--mode fuzz --games 2000`, `--mode oracle --games 300`, `--mode random --games 60` | `out-fuzz.txt`, `out-oracle.txt`, `out-random.txt` |
| prototype replay check and mutants | `node bitboard-proto.mjs --check 300 --monet 60`, then again with `MUTATE=turnpass` and `MUTATE=misassign` | the console lines quoted in §4.2 |
| prototype throughput | `node bitboard-proto.mjs --bench 20000`, then four at once | `out-proto-quiet.txt`, `out-q-proto-{1..4}.txt` |
| the bank check | `node bank-check.mjs v0.54`, `v1.0`, `v0.53` | the console lines quoted in §4.2 |
| the facts' cost | `node facts-cost.mjs --games 40` | `out-facts.txt` |

**Host load.**

- Some early runs were made at about 41% background load. At that load, `bench-decide` read 0.2116 ms and 141.8 ms,
  against 0.1711 ms and 114.7 ms quiet.
- §4.3 quotes only the quiet runs, except the fuzz row, whose load was not sampled.

**Archive.** The scratchpad lives under `%TEMP%`, and an earlier clean-up there deleted files. These scripts and
outputs were therefore copied to `C:\Projects\FishAI-bench\athena\p0-scoping\bench\` on 2026-09-18, beside the brief.

## Appendix B. What this draft could not verify

- **Install sizes and versions** (§4.10) are approximate and were not fetched. That includes which PyTorch release is
  current for cu128 on Windows.
- **JAX's lack of GPU support on native Windows** (§4.4, reason 4) is background knowledge and was not checked.
- **Whether PyO3 and maturin build on Rust's GNU target** against python.org's CPython was not checked.
- **(c′)'s IPC cost and (d)'s per-action cost** were not measured: NumPy is not installed. (d)'s figure is an estimate
  from the prototype.
- **The branch rates of H2 and H3** were not measured. §4.6's expected counts leave them out.
- **The bridge-walk cost** in §4.8 is an estimate. No walk was timed today.
- **FishLab's own definition of its six rotations** was not read (it has no licence). Geometry B's rotation rule is
  ours to define and unit-test.
