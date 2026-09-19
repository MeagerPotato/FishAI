# ATHENA.md: the roadmap and research record for ATHENA

**ATHENA is FishAI's next Canadian Fish bot, after Monet v1.0.** Its goal is **to beat Monet v1.0 while learning its
own play.** Monet v1.0 is the bar. It is also an opponent, a harness and a body of evidence. It is not a starting
point.

**Status: P0 CLOSED and P1 REGISTERED, both 2026-09-19.** All four of P0's gates held (§4.6), and all of §4.7's
predictions came true. P1's pre-registration is §8, written before any P1 code or run. P1's first two gates, G1a and
G1b, passed the same day (§8.1, §8.2). G1c failed, so its window rule is dropped and every declare offer calls the
network: §3.1's training times are re-costed at about three times the first estimate. T1, R1, R2 and D4's M arm are
read too (§8.4–§8.6). G1 failed: the learned belief heads are better calibrated than Monet's but pick the holder only
slightly more often (§8.3), and D4's H arm missed, so search stays closed (§8.4). **P2 is registered as §9**, and its
one three-day run (D4, taken 2026-09-19) is set for the weekend of 2026-09-26. No ATHENA game has been played for
strength.

**P0 was registered 2026-09-19.** The owner approved §4 as drafted, and the installs it needs, in their words:
*"approve P0 as drafted, go ahead with the installs"* (§6 row 2). §4 is the draft of 2026-09-18, unchanged; anything
amended after approval carries its date. §4.1–§4.4 report the scoping measurements of
2026-09-18: engine checks and throughput timings, none of them a read of strength. The owner's answers to §5's
questions, given the same day, are recorded in §5 and §6.

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
| **ATHENA v1.0**, the target | **above Monet on the same seeds, by the ship rule** (brief AC3, made strict by the owner on 2026-09-19, D3) | beaten head-to-head; brief AC1 proposes ≥ 52.0% on twelve fresh seeds | [Record] brief C.3; the bars are the owner's (§5, D3) |
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
| **P3** The league: beat Monet | Add snapshots, Bass styles, main exploiters, and the share of games against Monet (brief B.5.1) | **G3a (home):** ATHENA against Monet is ≥ 2 SE above 50%, strictly ahead on ≥ 7 of 12. **G3b (bridge):** ATHENA and Monet each play SESTINA on the *same* twelve fresh seeds, paired, and ATHENA is not below Monet. **Tightened 2026-09-19 (D3):** ATHENA must be above Monet by the ship rule, ≥ 2 SE and ahead on ≥ 7 of 12 | 3–7 days of running. A bridge read takes about 2–4 h, scaled from the acceptance read's 84 cells, which ran from 09:31Z to about 11:01Z (MONET.md §3.8ba, "What ran, and the wall clock"), and from ATHENA's decision cost |
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

### 3.1 How long a training run takes on this machine (D4's estimates, 2026-09-19)

The owner asked for these before choosing D4, and no hardware upgrade is planned, so every figure is for this
machine: the RTX 5070 Ti (16 GB), the Ryzen 9 9900X and 31 GB of RAM.

**What was measured** [Measured, 2026-09-19].
- The tools: PyTorch 2.11.0+cu128 in bf16, with random inputs shaped like ATHENA's (§1), in `gpu-bench.py` and
  `loop-bench.py`. The scripts and their outputs are archived at `C:\Projects\FishAI-bench\athena\p0-scoping\gpu\`.
- A game is about 110 public events, folded into each of the six seats' recurrent state, and about 100 decisions
  (§3's census).
- **"Acting"** is the whole loop at a batch of 8,192 games. It includes the observations crossing to the GPU, the
  legal-move mask, sampling, and the actions crossing back.
- **"Training"** is one pass of forward, backward and Adam over whole games, with the perfect-information critic.

| network | weights | acting, games a second | training, games a second per pass | GPU memory |
|---|---:|---:|---:|---:|
| **S**: GRU 256, trunk 2 × 512 | 2.1 M | 31,921 | 12,569 | 1.7 GB |
| **M**: GRU 512, trunk 3 × 1,024 | 8.2 M | 15,031 | 4,896 | 3.2 GB |
| **L**: GRU 1,024, trunk 4 × 2,048 | 34.3 M | 5,321 | 1,515 | 6.5 GB |
| T: transformer, d 256, 4 layers, over the last 128 events, no cache | 5.0 M | 343 (arithmetic only) | 102 | 3.8 GB |

- Without a cache, the transformer costs about a hundred times what a GRU of similar size costs. That form is ruled
  out, and a cached transformer is P1's to size.
- The acting loop kept 75% (S), 92% (M) and all (L) of the network arithmetic measured without it.
- For scale: Monet's two networks have 7,425 and 7,553 weights (paper §4). S is about 280 times larger.

**How the estimate is made** [Estimate].
- **GPU time a game** = acting + E training passes. PPO reuses each game E = 1–4 times, and E = 2 is the base case.
- **A discount to 50–80%** of the measured arithmetic covers what is not built yet: the environment's handoff, the
  advantage computation, checkpoints and evaluation matches [Judgement].
- **The environment** (the Rust port) must supply at least 10,000 games a second by G0b. That is above every row
  below, so the GPU is the bound.

| network (E = 2) | games a day | 10^7 games | 10^8 games | 10^9 games |
|---|---:|---:|---:|---:|
| S | 227–363 million | 0.7–1.1 h | 6.6–10.6 h | 2.8–4.4 days |
| **M** | **91–146 million** | **1.6–2.6 h** | **16.5–26.4 h** | **6.9–11.0 days** |
| L | 29–46 million | 5.2–8.4 h | 2.2–3.5 days | 21.8–34.9 days |

At E = 1 each time is about 55–60% of the table's. At E = 4 it is about 1.8–1.9 times the table's.

**How many games are needed.**
- [Judgement, brief C.2] 10^7 to 10^8 from scratch to Monet's level, uncertain by about tenfold either way.
- [Estimate] P3 then needs a comparable amount again, to beat Monet by the ship rule and to beat SESTINA strictly
  (D3).
- Nothing measured narrows this until P2's learning curve exists. The first hours of P2 give its slope, and the
  estimate is redone from that slope before P2's budget is registered.

**So one run, at the base case** (network M, E = 2) [Estimate]:

| case | games | time |
|---|---:|---:|
| likely | 10^7 to 10^8 | about 2 hours to about 1 day |
| pessimistic | 10^9 | about 7–11 days, which the owner's *"not weeks"* splits into several resumable runs |
| optimistic | 10^6 | minutes |

**What else a run costs.**
- **Real Monet v1.0 runs on the CPU.** A game with Monet on one team costs about 57 ms of Monet's time, half of the
  measured 114.7 ms for six seats (§3). That is about 17 games a second a thread, or about 120 on the seven threads
  the environment leaves free.
  - At a 5% share of an M-size run (50–85 Monet games a second), it fits without slowing the run.
  - The distilled Monet (D13) carries the rest of the volume.
- **Evaluation reads against Monet** run on the reference engine with ATHENA's deterministic CPU forward (G0d).
  [Estimate] Roughly 20 minutes to an hour for a 14,400-game read at size M. G0d measures the forward, and this
  estimate is replaced by that measurement.
- **The machine during a run.**
  - The GPU is fully busy and 8–10 CPU threads are busy. Light use of the PC is fine; other heavy jobs slow the run
    (another session's backfill already shares the CPU).
  - Every run checkpoints about every 30 minutes, so it can be paused and resumed without losing progress. In
    practice, D4's "longest run" is the number of days in a row the machine is given to ATHENA.
- **Power.** The GPU drew 213 W under the benchmark [Measured]. A whole-system draw of 350–450 W is 8–11 kWh a day
  [Estimate].

**Recommendation for D4** [Judgement].
- Allow runs of up to **3 days**, each checkpointed, with its learning curve against Monet checked every few hours
  and a stop rule registered with the run.
- At M and E = 2, three days is 2.7–4.4 × 10^8 games. That covers the brief's whole likely range for P2, and a
  tenfold miss at size S.
- If P2 needs 10^9 games, that is two to four such runs back to back, each reviewed before the next.

> **Re-costed 2026-09-19, after G1c failed (§8.2).** G1c's window rule was dropped, so every declare-window offer calls
> the network. P1's test games measure **654 network decisions a game** [Measured]: 92.5 asks and passes, and 561.5
> offers that have no rules-certain declare. The first estimate assumed about 100.
>
> The same benchmarks were re-run with 654 decisions a game [Measured]. The script (`offers-bench.py`) and its outputs
> are archived at `C:\Projects\FishAI-bench\athena\p1\g1c\recost\`.
>
> | network | acting, games a second (first estimate) | training, games a second per pass (first estimate) |
> |---|---:|---:|
> | S | 13,310 (31,921) | 4,023 (12,569) |
> | M | 6,549 (15,031) | 1,561 (4,896) |
> | L | 2,355 (5,321) | 440 (1,515) |
>
> - Acting serves each window's offers in one batched call. This is exact: a decline moves no card and publishes
>   nothing, so a window's offers can be computed together. One call per offer measured within 5% of it.
> - L trains at 128 games a minibatch. At 256 it needed 14.7 GB and spilled out of the card's memory.
> - The control: the same runs at 100 decisions a game came within about 7% of the first table.
>
> | network (E = 2) | games a day | 10^7 games | 10^8 games | 10^9 games |
> |---|---:|---:|---:|---:|
> | S | 76–121 million | 2.0–3.2 h | 20–32 h | 8.3–13 days |
> | **M** | **30–48 million** | **5.0–8.0 h** | **2.1–3.3 days** | **21–33 days** |
> | L | 8.7–14 million | 17–28 h | 7.2–11.5 days | 72–115 days |
>
> - **A run costs about three times the first table's.** One run at the base case (M, 10^7 to 10^8 games) now takes
>   about 5 hours to about 3 days. The pessimistic 10^9 takes 3–5 weeks.
> - **The recommendation for D4 is unchanged:** runs of up to 3 days, checkpointed. At M, three days is now 0.9–1.4 ×
>   10^8 games, which just covers the likely range. 10^9 games would take seven to eleven such runs.
> - [Estimate; information for P2's registration, none of it registered] Three ways to cut the cost:
>   1. Gate the offers anyway, at k = 4. It evaluates 23.5% of the offers and admits 99.7% of Monet's declares.
>      At M, that costs about 1.5 times the first table instead of 3.
>   2. Train on a uniform sample of the declines, weighted so the gradient stays unbiased. Training is about 90% of
>      the GPU time at M.
>   3. Give the offers a smaller declare head than the ask's trunk.

---

## 4. P0 pre-registration (registered 2026-09-19, as drafted)

**Status: REGISTERED 2026-09-19, on the owner's approval of the draft as written.** When it was approved, nothing
below had run except the scoping in §4.1–§4.4. Those measurements are engine checks and timings. They read no win
rate, spend no seed, and ship nothing.

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
   - **Promoted 2026-09-19** as `scripts/seeds-next.mjs`, with the registry of spent seeds at `scripts/seeds/`.
     - The rule and the historical spent list are unchanged.
     - The one change: it reads the whole registry as spent, instead of taking the spent files on the command line.
       It writes each new draw into the registry.
     - Its test re-draws §7's `athena-kraken-read-12` from the registry without that file, and gets the same twelve
       seeds, with 272 spent and none skipped.

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

> **Amended 2026-09-19, before any port code.** Building the emitter turned up three things.
>
> 1. **One floor row duplicates another.** "Declare after at least one decline in the same window" counts the same
>    events as "out-of-turn declare": 47,061 each in the corpus. A us54 window always opens on the turn-holder, so any
>    declare after a decline is out of turn. The row stays, and one row is **added**: "a declare by the window's last
>    seat (declined = 5)", with a floor of 50. Adding a row can only tighten G0a.
> 2. **Two choices the registration left open.** H2's fresh seeds start at seat j mod 6, and H5's at i mod 6, as the
>    scoping run did. Both are recorded in `scripts/athena/replay-format.md`.
> 3. **The legal-move record uses the reducer's own verdict.** `legalActionsSummary` lists `claim` while the window is
>    closed, at every ask step, and the reducer refuses every such declare. The port must not copy that quirk.
>    `lib/engine/` is unchanged.
>
> **Progress, 2026-09-19.** The oracle is built (`scripts/athena/`: `replay-format.md`, the codec, the emitter, and the
> self-check with its coverage report). The corpus was emitted at `7d85c2e`, whose nine engine files equal §4.1's, with
> rules hash `e9311958e811b7bc…`. It holds **10,800 games and 4,788,218 steps (259 MB)** at
> `C:\Projects\FishAI-bench\athena\corpus\7d85c2e\`.
> - Emission took 169 s on four processes (§4.8 estimated about 8 minutes on one thread, and about 0.5 GB).
> - **The reference replays its own corpus at 100%:** every digest, and all 1,977,852 probe verdicts. It was checked
>   twice, the second time independently, in 17.8 s.
> - 0 games were capped, and the nine-set terminator never fired alone.
> - All 36 bank games took exactly the bank's step counts.
> - Every floor was met without extending H4. The rarest branch is a whole team out, 323 times (≈ 130 expected).
>
> This is the reference checking itself. G0a is scored only when the port replays the corpus.
>
> **G0a (i) scored 2026-09-19: PASS.**
>
> **The port.** `athena-env/` has 5,665 lines of Rust, no dependencies and `#![forbid(unsafe_code)]`. It replays all
> 10,800 games from their actions alone.
> - Every per-step, legal-move and view digest is equal, over 4,788,218 steps.
> - 1,977,852 probe verdicts, with 0 accept-or-refuse differences and 0 error-code differences.
> - The five block aggregates equal the manifest.
> - 0 capped games, and the nine-set terminator never fired alone.
> - 36 of 36 bank games match.
> - The coverage table is identical to the reference's. Every gated row is at or above 50; the added last-seat row
>   has 7,084.
>
> **The five mutants are all caught.** Games that diverge: M1 867, M2 537, M3 10,800, M4 2,916, M5 10,682.
>
> **Speed.** The replay takes 0.85 s on four threads (12,700 games a second) and 3.25 s on one. It was checked twice,
> the second time independently (0.90 s, with M2 and M4 re-run).
>
> **First run.** The first complete corpus run was clean: no rules or codec divergence from the reference was found
> at any point, so Q1's "clean first full run" (45%) came true. Next is G0a (ii), the bridge walk.
>
> **Amended with the result.** No bar changes.
> 1. **The mutants as implemented.**
>    - M1: an out-of-turn declare that empties the turn-holder moves the turn to the next seat with cards, instead of
>      entering `awaitPass`.
>    - M3: after a declare, the window keeps cycling as it does after a decline, and closes after the sixth seat.
>    - M5: after a miss, the window opens on the asker while the target takes the turn.
>    - M2 and M4 are as registered.
> 2. **The rules hash.** The reference self-check recomputes SHA-256 of `RULES_US54.md`. The port compares each
>    record's header with the manifest, because the crate has no dependencies and Rust's standard library has no SHA-256.
> 3. **The npm gate** runs `npx vitest run --maxWorkers=4`, to stay inside the four-process cap.
> 4. **Information, not a gate.**
>    - The Rust policies regenerate H4 and H5 byte for byte.
>    - The raw core with the mixed stub runs about 60,000 games a second on one thread, and 190,000–215,000 on four.
>    - That is not G0b, which is measured through the Python API.
>
> **G0a (ii) scored 2026-09-19: PASS.**
>
> **The walk.** The port reads FishLab's records itself, with a std-only JSON reader, and walks them the way
> `bridge-records.mjs`'s `walkAsks` does. It ran on the 14,400 games of §3.8ba's twelve panel-SESTINA cells.
> - The asking seat's view digest is equal at all **1,342,770 asks**: 679,615 of Monet's and 663,155 of SESTINA's.
> - 0 reader refusals, and all twelve cell aggregates are equal.
>
> **The two controls are both caught.**
> - Scoring by side changes 435,967 views in 7,200 games.
> - Revealing every holder after a wrong declare changes 65,097 views in 1,822 games.
>
> **Speed.** 0.50 s on four threads; the reference's emission takes 9.2 s. It was checked twice, the second time
> independently.
>
> **Information.** The twin arm's twelve cells (c6) pass too, and give the same views as the panel's on every seed.
>
> **Amended with the result.** No bar changes.
> 1. **The reduced reveal needed an encoding rule.** A true holder that the host did not publish encodes as NONE
>    (`replay-format.md` §12.4). This is opt-in, so the home corpus's encoding is unchanged, and G0a (i) was
>    re-checked after the change: 10,800 of 10,800.
> 2. **Both sides' asks are compared,** reading "at every ask event" literally.
> 3. **Two fields of the walk's view are not a live seat's.** `moveIndex` is the event's position in the log,
>    because the records hold no declines, and the declare window is always closed. The gate compares the walk's view
>    as registered. The live adapter's view is G0d's to pin.
> 4. **Twin cells compare by the aggregate ordered by deal and rotation.** The bridge's workers finish games in
>    different orders, so the file-order aggregates differ.

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

> **G0b scored 2026-09-19: PASS.**
>
> **The bar: 28,776 games a second end to end on 8 threads,** against 10,000.
> - It was measured over 200,011 games after 98,304 of warm-up. No game was capped.
> - The host was at 1.8% load before the start (five one-second samples, 0.0–5.9%).
> - A repeat of the 8-thread run read 29,397 games/s, with the host at 1.5%.
> - "End to end" is as registered:
>   - `athena_env.BatchEnv` behind Python;
>   - the mixed stub in NumPy over the port's legal masks;
>   - every observation buffer filled at every step.
>
> **Scaling** (the same run: pipeline mode, 32,768 games in flight)
>
> | threads | 1 | 2 | 4 | 8 |
> |---|---:|---:|---:|---:|
> | end to end, games/s | 11,184 | 16,133 | 30,320 | 28,776 |
> | the Rust core alone (`stub-bench`), games/s | 73,937 | 145,831 | 286,925 | not run (the tool stops at 4) |
>
> - **The single-thread core rate is 73,937 games/s,** so Q2's second part (≥ 20,000) holds.
> - **Where the ceiling is.** Above 4 threads the end-to-end rate stops rising.
>   - The NumPy stub runs on one thread and costs 54 ns of every action, 55% of the thread time at 8 threads. That caps
>     the loop at about 29,000 games/s.
>   - The Rust step and observation cost 43 ns an action.
>   - In training, the network on the GPU takes the stub's place (§3.1). The ceiling is the stub's, not the port's.
> - **The command:** `scripts/athena/g0b-bench.py --registered --threads 8,1,2,4 --batch 32768`, at `c667b16`. The
>   output is in `C:\Projects\FishAI-bench\athena\g0b\`.
> - **Earlier runs, information only.** On a host at about 11–50% load, the rates were 8,361, 11,722 and 20,375 games/s
>   at 1, 2 and 4 threads. The script refuses the registered run above 10% load, and these are not the measurement.
>
> **Checked independently.**
> - **The core:** `cargo fmt` and clippy are clean, with and without the mutants, and 53 of 53 tests pass.
> - **G0a (i), re-run on this branch** because the core gained a test hook (amendment 5): PASS, 10,800 of 10,800.
>   M1–M5 are caught in the same numbers of games as before: 867, 537, 10,800, 2,916 and 10,682.
> - **The Python tests all pass:** the API 8 of 8, the information rules 3 of 3, the corpus 2 of 2.
>   - **The corpus through the API.** H5 (2,000 games) and H4 (4,000 games) replay through `BatchEnv`. Every digest is
>     equal at every step, and every played action is legal in its mask.
>   - **The information rules.**
>     - 400 deal pairs that differ only in hidden cards give identical actor buffers, both at the opening window and at
>       the first ask.
>     - 2,560 mid-game states with the hidden cards re-dealt give identical actor buffers, while the critic buffer
>       differs in all 2,560.
>     - A planted leak is caught.
> - **Q2, G0b holds (75%): HIT.**
>
> **Amended with the result.** No bar changes.
> 1. **How threads are counted in pipeline mode.** "8 threads" means seven for Rust and one for the NumPy stub. The
>    batch is split into two halves, and the stub runs on one half while Rust steps the other.
> 2. **The warm-up is max(10,000, 3 × batch),** here 98,304 games. A batch that starts together ends its short games
>    first. With 10,000 games of warm-up at this batch size, the timed window would lean toward short games (628
>    against 640 actions a game).
> 3. **The API as built** (§4.5 item 2).
>    - `observe(bufs)` fills buffers that the caller allocates once, with `make_buffers()`. `step(actions, bufs)`
>      refills them.
>    - The critic buffer is 54 bytes a game: each card's holder, relative to the acting seat, and 255 once the card is
>      out of play. It is expanded to one-hot on the GPU. It is a separate buffer, and no actor buffer contains it.
>    - The layout is `athena-env/API.md`'s, and it stays provisional until P1.
> 4. **D12's dependencies, stated exactly.**
>    - The bindings are a separate crate, `athena-env/py`, so the rules core still has no dependencies.
>    - The bindings' committed `Cargo.lock` pins 24 third-party crates: PyO3 (five crates), rust-numpy, and 18 that
>      they pull in, among them ndarray, the num crates, libc and syn. These are what "the Python bindings and nothing
>      else" means.
>    - The bindings deny `unsafe` in their own code. PyO3 and rust-numpy use it inside, as any Python extension must.
> 5. **One test hook in the core,** `Game::fixture_swap_cards` (`#[doc(hidden)]`), builds states for the
>    information-rule tests. G0a (i) was re-run after it was added (above).

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

> **G0c scored 2026-09-19: PASS.**
>
> **Check 1, the identity pin: holds.** The harness reproduced
> `duplicate-pairs.mjs --a v1.0 --b v0.33 --pairs 200 --bank athena-p0-pin` game for game.
> - All 400 games' final set counts are equal, and so are all 400 move counts.
> - Every printed number is equal:
>   - the paired set difference, 0.5400;
>   - the SD, 3.5696;
>   - the win rate, 0.5325 (213 of 400);
>   - the SE, 0.2524;
>   - the sets, 1,569 against 1,461.
> - Every printed line after the header is identical; only the elapsed time differs.
> - As registered, these are harness checks on a named bank, not a read.
>
> **Check 2, the reference rides along: holds.** The service's state digest equals the port's at all 400 deals and
> all 249,317 steps. Beyond the bar, the legal-move and view digests are also equal at the same 249,317 steps, and so
> are all 400 final scores.
>
> **Check 3, M1 caught: holds.** With M1 planted, 27 of 400 games diverge on the state digest, first at steps 410 to
> 767. A game's comparison stops at its first mismatch.
>
> **Checked independently.** The runner was re-run from the branch head (`091dfe0`, clean tree), building both
> Python builds itself. Every number above came out the same: 400 of 400 games, 249,317 steps with 0 differences, and
> 27 of 400 games under M1 at steps 410 to 767.
>
> **Q3, G0c holds (85%): HIT.** The off-by-one in `moveIndex` that §4.7 named as the risk did not occur.
>
> **The cost of Monet's decisions** [Measured, information for P2]
> - On two service workers, the harness waited 0.128 ms a decision (80.1 ms a game), and deciding inside the workers
>   took 0.170 ms. The independent re-run read 0.133 ms and 0.176 ms, with the host at 8–13% load.
> - The port's own share was 0.09 s of the harness's 32.9 s. The reference script takes 38.7 s on one thread.
> - A small P2-shaped run, a Python stub against v1.0 in geometry B over 120 games, waited 0.217 ms a Monet decision,
>   44.6 ms a game, with every digest equal.
> - The records are in `C:\Projects\FishAI-bench\athena\g0c\`.
>
> **Amended with the result.** No bar changes.
> 1. **`duplicate-pairs.mjs` gained `--games-out`.** It writes each game's final sets and its number of actions. It
>    changes nothing that is played or printed. The script prints only totals, so without it the 400 games' set counts
>    could not be read.
> 2. **"The win rate to four decimals"** is the fraction from the win count, 0.5325. The script prints a percentage to
>    two decimals, so the printed string is compared as well.
> 3. **Geometry B's rotation rule is ours, for P2 to register or amend.**
>    - Rotation r of deal d uses the seed `${bank}-${d}`, starts at seat 2 × ⌊r/2⌋, and seats arm A on team r mod 2.
>    - That makes three duplicate pairs a deal, and rotations 0 and 1 are geometry A's pair.
>    - Seats 1, 3 and 5 never start. Arm A plays each team equally often, so each arm starts equally often.
>    - It is unit-tested. It is not FishLab's rule, which has no licence and was not read.
> 4. **Divergent and capped games.**
>    - A divergent game is finished by the mixed stub and left out of the printed numbers.
>    - A capped game drops its pair, as in `duplicate-pairs.mjs`.
>    - No game was capped or refused in the default run.
> 5. **The mutants reach Python only through an opt-in feature of the bindings.**
>    - The default build has no `set_mutant`, and `athena_env.MUTANTS` is False.
>    - The mutants build is unpacked into the bench and loaded from there. The venv never held it.

**G0d: packaging and the inference contract.** All three must hold:

1. **The ATHENA-stub package passes the repo's package self-tests** (`botpkg-selftest.mjs` over 200 games, and
   `botpkg-forced-test.mjs`), adapted to the package. **Every fault counter must be zero.** The self-test's referee
   reproduces the host's reduced reveal (§4.1).
2. **The in-engine pin.** Every ask the package made is reproduced by the same JavaScript forward in-engine, at
   **100%**. The package with its weight file perturbed must differ.
3. **The forward's cost per decision** is reported at three candidate sizes. This is information for P1 and D5, and it
   gates nothing.

> **G0d scored 2026-09-19: PASS.**
>
> **Part 1, the package self-tests: holds.**
> - **The registered run:** `stub-selftest.mjs` over 200 games, with the package on seats 0, 2 and 4 against
>   Balanced.
>   - It answered 6,203 asks, 48,479 declare polls and 2 passes.
>   - Its 11 declares all came from the rules-certain rail, and none was wrong. Both of its compelled claims were
>     PASSFIX.
> - **Every fault counter is zero:** the package's 15, and the self-test's own 5 (divergences from the in-engine
>   policy, log-shape mismatches, gifts, sweeps without a declare, and unexplained full-view differences).
> - **The referee reproduces the host's reduced reveal.** After a wrong declare, the state it sends shows only the
>   holders that a hit had located.
> - **The forced test:** 42 of 42 checks pass, with the counters at zero. A weight file whose md5 is not the
>   manifest's is refused before the handshake.
> - [Information] It is a stub with random weights, not a player: it won 0 of the 200 games (39 sets to 1,000).
> - **Coverage** [Information; amendment 2]. The Balanced run never reaches MUSTFIX or a forced request, so a second
>   200-game run against the mixed stub covers them.
>   - It answered 12,766 asks, 83,639 polls, 12 passes and 17 forced requests, in 2 emulated forced endgames.
>   - It made 14 compelled claims: 12 PASSFIX and 2 MUSTFIX.
>   - Every fault counter is zero.
>
> **Part 2, the in-engine pin: holds.**
> - **The frozen weights** (md5 `2e6a12cd…`): the same forward, run in-engine, reproduces 6,203 of 6,203 asks, and
>   12,766 of 12,766 in the mixed run.
> - **The perturbed weights.** Every weight was scaled by up to ±1% (md5 `e1032df4…`).
>   - 85 of the 6,203 asks differ, and 155 of the 12,766.
>   - A package built with the perturbed file also plays with zero faults. It pins 6,297 of 6,297 against its own
>     weights, and 89 differ against the frozen ones.
>
> **Part 3, the forward's cost per decision** [Measured, information]. One thread, the host at 2% load, over 12 Monet
> v1.0 games (720 decisions and 114 events a game).
>
> | size | actor weights | fold per event | trunk and heads | the network at every decision | per six-seat game |
> |---|---:|---:|---:|---:|---:|
> | S | 1,363,717 | 0.147 ms | 0.54 ms | 0.61 ms | 439 ms |
> | M | 5,349,381 | 0.554 ms | 1.87 ms | 2.41 ms | 1,735 ms |
> | L | 23,283,205 | 2.146 ms | 8.80 ms | 10.35 ms | 7,450 ms |
>
> - [Estimate] A 14,400-game read at M, with ATHENA on one team, takes about 3.5 hours on one thread, or about 30
>   minutes on seven.
>
> **The JavaScript encoder equals the port's** [Measured, information].
> - 1,048,907 states over 5,200 corpus games show 0 mismatches in any field.
> - A planted control that withholds a wrong declare's holders makes 409,569 states differ.
> - Ten fixture games in vitest reproduce the port's digests.
> - These are home views. At the bridge the host withholds a wrong declare's holders, so the package's inputs after a
>   wrong declare differ from the port's home inputs in exactly the way the control does. Training for play at the
>   bridge has to see that regime (P3).
>
> **Checked independently.** The checks were re-run from the branch head (`42b4052`, clean tree). Every number came
> out the same:
> - The build reproduces the weight file's md5 from its seed.
> - The registered self-test gives 6,203 asks and zero faults, and the forced test 42 of 42.
> - The pin holds at 6,203 of 6,203, and the perturbed weights differ on 85.
> - The mixed run gives 12,766 asks, pinned 12,766 of 12,766.
> - On a dump of 2,800 games, the encoder check compares 651,064 states with 0 mismatches, and the control catches
>   232,127.
> - vitest passes (81 files, 1,246 tests), and so do typecheck and lint.
>
> **Q4, G0d holds (80%): HIT.**
>
> **Amended with the result.** No bar changes.
> 1. **The equivalence check compares with the view the host allows.** Holders are withheld after a wrong declare, so
>    every divergence is a fault, and the original's exception after a failed declaration is gone. The full-information
>    comparison is kept as information. It differs only after a wrong declare: 57 replies in the Balanced run and 1,327
>    in the mixed run.
> 2. **The mixed-stub run is part 1's coverage companion.**
> 3. **The host's forced endgame is emulated from this repo's reading of it,** not from FishLab's code.
>    - It asks only the seat holding the window option, and the real host may also ask teammates.
>    - It sweeps the bars 1, 0.8, 0.6, 0.4, 0.2 and 0 over the open sets, then `last_resort`.
> 4. **The forced test is adapted.**
>    - Its premises are rebuilt as states a host could send.
>    - Section 6(b) expects MUSTFIX's `none` on the poll and the declare in the sweep.
>    - Section 8 (the counters and the md5 refusal) is new.
> 5. **Parameter counts.** The actor alone is 1.36M, 5.35M and 23.3M at S, M and L. §3.1's 2.1M, 8.2M and 34.3M
>    include the critic and a duplicated GRU cell.
> 6. **The start seat.** The host does not publish it, so the adapter takes the first event's actor. That would be
>    wrong only if the first event were an out-of-turn declare, which happened 0 times in 400 games. P1 registers the
>    rule.
> 7. **Determinism.** The arithmetic is float64 in a fixed order over float32 weights, with a deterministic exponential
>    in place of `Math.exp` and `Math.tanh`.
> 8. **The build.** The package is built into `dist/athena-stub/`, as Bass's is into `dist/botpkg/`. `/athena-stub`
>    is in `.vercelignore`.

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

> **Scored 2026-09-19. P0 is closed.** All eight predictions came true.
> - **Q1 (90%): HIT.** G0a held, both (i) and (ii). The clean first full run (45%) happened too.
> - **Q2 (75%): HIT.** 28,776 games/s on 8 threads. The single-thread core reached 73,937 games/s, so its part (80%)
>   is a HIT as well.
> - **Q3 (85%): HIT.**
> - **Q4 (80%): HIT.**
> - **Q5 (95%): HIT.** M1–M5 were all caught at G0a, and M1 again at G0c.
> - **Q6 (70%): HIT.** No floor needed H4 extended.
> - **Q7 (55%): HIT.** P0 was registered and closed on 2026-09-19, the same day.
> - **Joint (about 55%): HIT.**

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
   repo before ATHENA's first read draws a seed. **Met 2026-09-19** (§4.5 item 7).

### 4.10 What needs the owner: the installs

Installing anything needs the owner's explicit approval (§6, row 2). **Nothing has been installed.** Today the machine
has Python 3.12.10 with neither `torch` nor `numpy`; no Rust; and no C or C++ compiler [Measured].

> **Installed 2026-09-19, on the owner's approval** (*"go ahead with the installs"*). Each was checked working.
>
> - **PyTorch 2.11.0+cu128, NumPy 2.5.3 and maturin 1.15.0,** in a virtual environment at
>   `C:\Projects\FishAI-bench\venvs\athena` (4.4 GB), so the system Python is untouched. PyTorch sees the RTX
>   5070 Ti through CUDA 12.8.
> - **Rust 1.98.1,** stable, `x86_64-pc-windows-msvc`, minimal profile, in `%USERPROFILE%\.rustup` and `.cargo`
>   (590 MB). It was installed without editing PATH, and a test build compiled, linked and ran.
> - **Visual Studio 2022 Build Tools with the C++ workload,** through winget, at
>   `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools` (3.4 GB, plus the Windows SDK). This needed the
>   administrator prompt, which the owner accepted, and installing it accepted Microsoft's Build Tools licence. The sizes below are
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

## 5. The owner's questions, and their answers

These are the brief's Part D, minus D1, which is answered (§0.1), plus D12 and D13 from the scoping. **The owner
answered on 2026-09-19.** Each answer is quoted, then what it changes. Where they asked for an explanation first,
the question stays open (§6 rows 4 and 5).

- **D2. SESTINA's records inside ATHENA's belief?** A model of SESTINA's choices would be used to *read* SESTINA's
  asks, never to choose ATHENA's (brief C.4). Allowed or not?
  - **Owner, 2026-09-19:** *"allowed if thats the best path to do so"*.
  - **What changes:** allowed on C.4's terms: it reads opponents' asks and never chooses ATHENA's. "If it is the best
    path" is a measured condition. P1 registers the belief head with and without it, and it is kept only if it reads
    better on SESTINA's games without costing on the home population.
- **D3. What does "beats Monet" mean?** Head-to-head only (AC1–AC2), or also strictly better than Monet against
  SESTINA (AC3 strict)?
  - **Owner, 2026-09-19:** *"it should be strictly better than monet and sestina, it should be the new frontier all
    around model"*.
  - **What changes:**
    - AC3 is strict. Against SESTINA v1.0, on twelve fresh seeds paired with Monet v1.0 on the same seeds, ATHENA's
      win rate must be above Monet's by the ship rule: the mean paired difference ≥ 2 SE above zero, and ATHENA ahead
      on ≥ 7 of 12. G3b (§3) is tightened to the same bar.
    - It must also beat Monet head to head (AC1, AC2) and the panel (AC4).
    - "All around" adds Kraken if it can be run (D8) and play against people (D7). Their bars are set when their
      instruments exist.
    - [Judgement] "Strictly better" is read here as the project's ship rule. The owner may add a margin.
- **D4. Hardware, and the longest single run.**
  - **Owner, 2026-09-19:** *"let me know the estimates first, no hardware upgrades are planned so far, and are very
    unlikely."* **Open:** the estimates go in §3.1, written once this machine's GPU has been measured, and the choice
    is §6 row 4. The plan assumes this machine.
  - *Scoping note:* the local machine has an **RTX 5070 Ti (16 GB, Blackwell, driver 616.56)**, a 12-core Ryzen 9
    9900X and 31 GB of RAM [Measured]. [Judgement] By §3's estimates that is enough for P0 to P2, with the learner on
    the local GPU. The binding constraint is CPU for Monet's games, not the GPU.
  - Renting or buying remains the owner's call.
  - **The longest acceptable single run is still theirs to state.** The record holds only *"I don't want this to be
    running for weeks"* (MONET.md §3.8ac).
- **D5. The web build.** Must ATHENA run in the browser within Monet's budgets of 1.4 ms a decision and 0.9 s a game
  (MONET.md §3.4a item 6)? *Scoping note:* G0d's forward-cost numbers are the input.
  - **Owner, 2026-09-19:** *"there shouldnt be a budget for time needed for decisions... even if its in the browser."*
  - **What changes:** there is no decision-time budget, at home, at the bridge or in the browser. Three things
    remain, and none of them is a budget:
    - Cost is reported beside every read, as the owner directed for Monet on 2026-09-17: speed is secondary to the
      best action.
    - The bridge host's per-move timeout is a hard limit. Each package declares its own:
      `timeout_ms` 10,000 for Bass v2.0's (`botpkg/fishbot.json`) and 30,000 for Monet v1.0's.
    - A decision's cost is paid about a hundred times a game and millions of times a run. It is priced in the run
      lengths (D4), never traded against strength.
  - In the browser, the network runs in a Web Worker, so a slow decision never freezes the page. G0d still reports
    the forward's cost, as information.
- **D6. The exploiter condition (AC8):** reported only, or a gate? If a gate, at what bar?
  - **Owner, 2026-09-19:** *"explain this further"*. **Open,** explained on 2026-09-19 (§6 row 5).
  - An exploiter is a separate network trained only to beat one frozen copy of ATHENA. It measures the worst case
    against a player who studies ATHENA, where the league measures the average.
  - [Judgement] Recommendation: a gate at v1.0, with a registered budget and a bar the exploiter must stay under.
- **D7. Partners.** Will ATHENA ever partner human players on the site? If so, its conventions must stay readable
  (Other-Play or OBL, brief B.6.1).
  - **Owner, 2026-09-19:** *"it should play well against both bots and players, but logically better against actual
    players"*.
  - **What changes:** people are a first-class target, as opponents and as partners.
    - ATHENA's play must not rest on private conventions that only copies of itself understand. P3 registers an
      Other-Play- or OBL-style variant, or a population wide enough to prevent them (brief B.6.1).
    - There is no measurement against people yet: no human game is recorded. The instrument is new, the site's
      `/play` and `/play/room` with games logged, and it is a separate decision (D14).
    - Until then the Bass styles in the league stand in for human-like play. They are a proxy, and are labelled so.
- **D8. Kraken.** Should Kraken be made runnable and added to the acceptance panel? It has never been played (paper
  §9).
  - **Owner, 2026-09-19:** *"sure, go ahead if you can find the whole model. It's my third friend's selfmade model, so
    im not sure if its accessible"*.
  - **What changes:** it is being located. If the whole model is found and runs at the bridge, it joins P3's reads and
    P5's panel. If it is not public, the owner asks its author.
- **D9. A second engine.** Is G0a enough to trust a port? *Scoping note, proposed answer:* §2's "the port trains, the
  reference judges", so no published number ever rests on the port.
  - **Owner, 2026-09-19:** *"not sure what this means or implies"*. Explained on 2026-09-19 (§6 row 5). The plan as
    approved already carries the proposed answer (§2), so nothing waits on it unless the owner objects.
- **D10. Monet's ladder.** Is it frozen at v1.0 while ATHENA is built, or does ATHENA-P run on Monet's registry as the
  control (brief C.1)? Choosing to start from scratch (D1) does not settle this.
  - **Owner, 2026-09-19:** *"not sure what this means"*. **Open,** explained on 2026-09-19 (§6 row 5).
  - [Judgement] Recommendation: freeze Monet at v1.0, the fixed bar, and run no ATHENA-P unless P2's kill criterion
    fires.
- **D11. The condition-5 precedent.** For Monet, the owner accepted condition 5 as registered on 2026-09-18 (§0.1).
  For ATHENA, is a locked reader's "no" final, or is it scored as registered?
  - **Owner, 2026-09-19:** *"sure sure what this means"*, read as "not sure". **Open,** explained on 2026-09-19 (§6
    row 5).
  - [Judgement] Recommendation: build ATHENA's readers to apply every registered rule themselves, so that the script
    and the registration cannot disagree. Where they still do, the registration decides and the owner may overrule.

**New from today's scoping:**

- **D12. A Rust crate in the public repository** (MIT) beside the TypeScript engine. This is part of row 2's approval.
  - **Owner, 2026-09-19:** *"im not sure what that means, but you can decide. If its secure and efficient and will
    help us reach our goals, go ahead"*.
  - **Decided 2026-09-19: yes.** The crate lives at `athena-env/` under the repository's MIT licence.
    - **Secure:** it is pure computation with no network, file or process access. Its dependencies are the Python
      bindings and nothing else, pinned in a committed `Cargo.lock`. The rules core forbids `unsafe` code, and build
      output is git-ignored. The Vercel build never touches it.
    - **Efficient:** it is §4.4's fastest option with a debuggable replay gate.
- **D13. Monet at training volume.**
  - **Owner, 2026-09-19:** *"of course, we want to beat out the frontier model, which should theorectically be monet
    v1.0 now."*
  - **What changes:** allowed. A distilled Monet v1.0 network may sit in the league's opponent seats to add volume.
    It never enters ATHENA's own policy, and its agreement with Monet is reported. Real Monet v1.0 stays the bar and
    plays every read. [Record] Monet v1.0 is the frontier: 58.38% against SESTINA (MONET.md §3.8ba).
  - Real Monet games are CPU-bound. [Estimate] That is about 15–20 a thread a second with Monet on one team (§3).
  - May the league also carry a **distilled Monet opponent**, a network fitted to Monet v1.0's own play and used only
    as an *opponent*, to add volume?
  - About six in ten of Monet's asks are the clone's (it overrides the clone at 38.14% of ask decisions, §0.3;
    paper §4), so this is SESTINA-derived play in the opponent seats only,
    which C.4 allows. It never enters ATHENA's own policy.
  - Real Monet stays the bar and the evaluator.

**New on 2026-09-19:**

- **D14. Logging games on the site.** D7 needs games against people, and none is recorded. Would the owner allow
  `/play` and `/play/room` games to be logged, with a notice to players, for ATHENA's evaluation and possibly its
  training? What is stored, where, and for how long is part of the question. It is not needed before P3.

---

## 6. Decision table

In the form of MONET.md §8.3.

| # | decision | state |
|---|---|---|
| 1 | **How is ATHENA built?** The brief (C.1, Part D) recommended ATHENA-L: one policy learned from game outcomes, **from scratch**, in a league. It is actor-critic self-play (PPO- or IMPALA-style) with a perfect-information critic in training only, a learned belief head, parameters shared across teammates, the rules-certain declare as a hard rail, and the game result as the reward. The alternatives were ATHENA-P (Monet-seeded policy iteration, the brief's control and fallback) and a warm start from Monet (C.5). SESTINA's recorded play enters only as an opponent, a yardstick and a test set (C.4) | **TAKEN 2026-09-18, on the owner's words** *"accept condition 5 and go from scratch with ATHENA-L"*, after *"I dont want monet to just be a fine tuned version of a sestina copy"* the same day. The same sentence accepts §3.9's condition 5 as registered, so Monet v1.0 stands as the bar (MONET.md row 65). **Not settled by it:** D2–D11 (§5); ATHENA-P as a control (D10); the warm-start fallback, which stays behind P2's kill criterion and the owner's explicit yes (§0.3) |
| 2 | **Approve §4's P0 pre-registration and the installs it needs?** P0 would build the Rust port of the us54 core with PyO3 bindings, the oracle emitter, the Node opponent service, the home harness, and a stub package with a deterministic forward. Its gates are G0a (every state of 10,800 reference games plus a view walk of 14,400 bridge games, with branch floors and five mutants), G0b (≥ 10,000 games/s on 8 threads), G0c (game for game with `duplicate-pairs.mjs`) and G0d (the package self-tests, a 100% pin). The installs are PyTorch for CUDA 12.8, NumPy, Rust, the MSVC Build Tools and maturin (about 6 GB to download, 13–16 GB on disk, §4.10). The fallback if Rust is declined is (c′), which needs only PyTorch and NumPy. The stakes: 8–12 working days of engineering and under an hour of compute. It ships nothing and reads no strength. Without it, from-scratch training runs on the reference at about 550–1,800 games/s on all eleven cores [Estimate, §4.3]. That carries 10^8 games in about 15–50 hours but leaves no cores for Monet's games or the learner, and a tenfold overrun of the brief's budget becomes 6–21 days, against the owner's *"I don't want this to be running for weeks"* | **TAKEN 2026-09-19: approved as drafted, with the installs** (*"approve P0 as drafted, go ahead with the installs"*). P0 is registered from this commit, before any P0 code. D12 is decided the same day: the crate lives in the repository (§5) |
| 3 | **The owner's answers to §5, 2026-09-19.** D2, D3, D5, D7, D8, D12 and D13 are answered in §5, each quoted with what it changes. The largest change is D3's: AC3 and G3b are now strict, so ATHENA must be above Monet against SESTINA by the ship rule | **TAKEN 2026-09-19.** Nothing measured changes; P0's gates are untouched. P3's and P5's bars tighten (D3); P1 registers D2's variant; the league may carry a distilled Monet (D13); D14 is new and not needed before P3 |
| 4 | **D4: how long may one training run be, on this machine?** The owner asked for the estimates first, and no hardware upgrade is planned | **FOR THE OWNER.** The estimates are §3.1, from GPU rates measured on 2026-09-19, **re-costed the same day after G1c failed**: every declare offer now calls the network, about three times the first estimate. At the base case (network M, PPO reusing each game twice), P2's likely 10^7–10^8 games take about 5 hours to about 3 days, and a pessimistic 10^9 takes 3–5 weeks. Recommendation: runs of up to 3 days, checkpointed and reviewed. **TAKEN 2026-09-19:** *"let's go with three days for now, with expectations of more"*, and the run is set for the weekend of 2026-09-26, while the owner travels. P2's budget (§9.8) is one such run |
| 5 | **D6, D10, D11, and D9's confirmation.** The owner asked what these mean. Each is explained in plain terms in §5, with a recommendation: D6 an exploiter gate at v1.0; D9 "the port trains, the reference judges" (already in the approved plan); D10 Monet frozen at v1.0; D11 readers that apply every registered rule | **FOR THE OWNER.** None of them blocks P0 |
| 6 | **D8: Kraken was found. Read Monet v1.0 against it?** Kraken v1.0 is public and complete (`kv1514/fish-researchp12`, `b10a673`), runs at the bridge, and passed a step-0 identity and a 60-game smoke (§7.1) | **TAKEN 2026-09-19 under D8** (*"go ahead if you can find the whole model"*). Pre-registered as §7 before any read cell. It ships nothing and writes ATHENA's Kraken bar. **READ 2026-09-19 (§7.3):** Monet v1.0 won 58.49% of 14,400 games against Kraken v1.0, every seed at or above 55.08%; Q1–Q6 all hit |
| 7 | **P1's pre-registration (§8).** The rules-derived facts ported and pinned (G1a); the observation's reveal regime, start seat and declare-window rule (G1b, G1c); the belief-head study (G1) on three populations, with the owner's D2 variant; D4 with the head; the team-information ceiling at home; two records studies; and P2's network size. About 6–9 CPU-hours and under 2 GPU-hours; no bridge cell | **REGISTERED 2026-09-19** under row 1's plan and the standing rule, as Monet's rungs were. It ships nothing and needs no install. The owner may amend any part before it runs. **G1a and G1b: PASS 2026-09-19** (§8.1, §8.2). **G1c: FAILED 2026-09-19**; its rule is dropped and P2's cost is re-costed (§3.1). **T1, R1, R2 and D4's M arm read 2026-09-19** (§8.4–§8.6). **G1: FAILED 2026-09-19**; P2 starts at M, with D2 (§8.3, §8.7). **D4's H arm MISSED 2026-09-19**; search stays closed (§8.4) |
| 8 | **P2's pre-registration (§9).** Train ATHENA-L from scratch by self-play to G2: at least 50.0% against Monet v1.0 at home on twelve fresh seeds. It fixes the network (size M), the learner (PPO, with the perfect-information critic and the belief and set-difference auxiliaries), the opponents' shares, the rails, the curve reads, the stop rules and twelve predictions. One three-day run, 0.9–1.4 × 10⁸ games | **REGISTERED 2026-09-19** under row 1's plan and the standing rule, before any P2 code. It needs no new install, and D4 (row 4) is its only owner decision |

---

## 7. Monet v1.0's bar against Kraken v1.0 (pre-registered 2026-09-19, before any read cell)

**Why read it.**
- D3 asks for ATHENA to be *"the new frontier all around model"*, and D8 adds Kraken if the whole model could be
  found. It was found (`github.com/kv1514/fish-researchp12`), and it runs at the bridge (§7.1).
- ATHENA's Kraken bar is Monet v1.0's own number against Kraken, read the way every other bar is read.
- It has never been measured: the paper's Kraken column is a description (paper §9).

### 7.1 The instrument [Measured, 2026-09-19]

**Kraken v1.0**
- It is `kv1514/fish-researchp12` at `b10a6732`, the 2026-08-28 merge of KV's PR #3.
- It is pinned as a tree of 825 files, content md5 `3537a890…`, at `C:\Projects\FishAI-bench\opponents\kraken-v1.0`.
- It has no licence. It is run and cited, never copied.
- KV's own self-test passes in the image: 329 decisions, 0 mismatches.

**How it runs.** It goes through FishLab's own `kraken` spec, `--b=kraken:py=/usr/bin/python3,dir=/kraken`, with the
tree mounted read-only, `--network none` and `OMP_NUM_THREADS=1`.

**The image**
- `fishlab-play-kraken` (`sha256:4449a2d6…`) is `fishlab-play` plus numpy 2.4.6 (a cp311 wheel, sha256 `89cd4683…`)
  and nothing else. A whole-filesystem diff shows only numpy's files added.
- **Step 0 on it:** §3.8ba's step-0 cell was replayed identically. That is Monet v1.0's arm against SESTINA, seed
  4549308, 4,800 games. Every engine line but `elapsed` matched, and so did every game record, the calibration
  readout and all 139 counter sums.

**A 60-game smoke** (seed 3677200, label `"athena-kraken-smoke"`, now spent)
- 60 of 60 games completed.
- Monet's fourteen fault counters were 0, and its declares were 99.64% right.
- The pin held: all 2,988 of Monet's asks were reproduced by `v0.54`, and `v0.53` differs on 1,117.
- There were no invented forced declares and no Kraken error. Two replays were byte-identical.
- **Disclosed: Monet won 35 of the 60.** This was seen before this registration was written. It is not a read.

**Three known quirks of this route**
- FishLab tells Kraken alone the true holders after a wrong declare. That is a small information edge for Kraken,
  and it is counted in every cell.
- There is no reply timeout. A watchdog stops a cell at 3,600 s.
- Kraken is asked twice a move on its turn. The answers are identical, so this costs CPU only.

### 7.2 The read

- **Arms:** Monet v1.0, the installed package §3.8ba played (`monet-v55-v054`: v0.54's vector, MUSTFIX), against
  Kraken v1.0 as §7.1 runs it.
- **Seeds:**
  - Twelve fresh seeds were drawn today under `"athena-kraken-read-12"` by `seeds-next.mjs`, against 272 spent seeds,
    with none skipped: **8860402 7541736 7385745 1737865 1731972 4293485 5279041 8868885 9553380 6153025 4639722
    6216080**.
  - Each seed is one cell of 200 deals × 6 rotations = 1,200 games, so the read is 14,400 games.
- **Step 0:** the smoke's seed is replayed through the read's scripts. It must be byte-identical to the smoke's
  records before any read cell runs.
- **What is read:**
  - Monet's win rate, pooled and per seed, with the SD and SE across seeds; §6.3's per-deal floor is reported beside
    them.
  - Monet's declare accuracy in every cell, and its fourteen fault counters.
  - **The pin:** every one of Monet's asks, replayed in-engine through `v0.54`, agrees at 100%, and one cell replayed
    through `v0.53` differs.
  - **Completion:** 12 of 12 cells, with no watchdog stop and no Kraken error.
  - **Information only:** Kraken's information edge (wrong declares whose holders it saw), forced declares, and each
    cell's CPU time.
- **What it decides:**
  - Nothing ships. It writes ATHENA's Kraken bar: under D3, ATHENA must be above this number by the ship rule, on
    seeds paired with Monet's, as G3b does against SESTINA.
  - If Monet is below 50%, the bar is still Monet's number, and the record says that Monet v1.0 does not beat Kraken.
- **Predictions** [Judgement], written before any read cell:
  - **Q1: Monet's pooled win rate is above 50% (85%).**
    - Monet wins 58.38% against SESTINA.
    - KV's own unmerged draft reports Kraken losing to SESTINA: 43.3% of 1,200 games in KV's engine, and −0.648
      sets a game over 5,400 games in FishLab's engine through KV's package, which exists only from v1.1.
    - Results between bots do not transfer reliably, which is why this is read, not inferred.
  - **Q2:** above 55% (60%).
  - **Q3:** every seed at or above 50% (40%).
  - **Q4:** declare accuracy ≥ 98.0% in every cell, and every fault counter zero (95%).
  - **Q5:** the pin at 100% in every cell (97%).
  - **Q6:** all twelve cells complete, with no watchdog stop and no Kraken error (90%).
- **Cost** [Estimate, from the smoke]: 1,580–1,830 CPU-seconds a cell, or 5.3–6.1 CPU-hours in all. That is about
  40 minutes on a quiet machine, and up to about 3 hours under contention, with at most two containers at a time.

### 7.3 The read [Measured, 2026-09-19]

**Monet v1.0 won 58.49% of 14,400 games against Kraken v1.0 (8,423 wins). All six predictions hit.** It ran as §7.2
registers it, 10:19–11:44Z. Nothing ships.

**Step 0: identical.** The smoke's seed, 3677200, was replayed through the read's own scripts.
- All 60 game records are byte-identical to the smoke's.
- Every engine line matches except the opponent spec, which lost `log=`, and `elapsed`.
- Monet's asks pin at 2,988 of 2,988 through `v0.54`.

**Monet's win rate per seed** (1,200 games each; from the game records, and each cell's engine line agrees):

| seed | 8860402 | 7541736 | 7385745 | 1737865 | 1731972 | 4293485 | 5279041 | 8868885 | 9553380 | 6153025 | 4639722 | 6216080 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Monet wins | 701 | 661 | 708 | 706 | 707 | 699 | 729 | 720 | 707 | 703 | 688 | 694 |
| win rate % | 58.42 | 55.08 | 59.00 | 58.83 | 58.92 | 58.25 | 60.75 | 60.00 | 58.92 | 58.58 | 57.33 | 57.83 |

- **Pooled:** 8,423 of 14,400 = **58.4931%**.
- **Across the twelve seeds:** SD 1.40 pts, SE 0.40 pts. The lowest seed is 55.08% (7541736) and the highest 60.75%;
  none is under 50%.
- **§6.3's per-deal paired floor:** 98/√2400 = ±2.00 pts, so 56.49 to 60.49.
- **Sets:** Monet 4.7731 a game, Kraken 4.2269, a differential of +0.546.

**Declares and fault counters**
- **Monet's declare accuracy** is 99.69–99.86% per cell, from its own engine line. Pooled from the records it is 67,291
  of 67,432 (99.79%).
- **Kraken's** is 98.02–98.60% per cell, and 60,169 of 61,201 (98.31%) pooled.
- **The fourteen fault counters** are all 0, summed over 432 per-process cover files (36 a cell, none torn). Every
  counter is present in every file.
- The adapter's ask count equals the engine's count of Monet's asks in all twelve cells.

**The pin.** Every Monet ask, replayed in-engine through `v0.54`, agrees in 12 of 12 cells: 698,314 of 698,314. The
mutation, `read-8860402` through `v0.53`, differs on 20,966 of 57,969 asks (36.2%), as it must.

**Completion.** 12 of 12 cells. Every cell exited 0 with 1,200 games and 1,200 distinct (deal, rotation) keys. There
was no watchdog stop and no Kraken error, and no game hit the length limit.

**The predictions, scored as §7.2 words them**

| | prediction | result | score |
|---|---|---|---|
| Q1 (85%) | pooled win rate above 50% | 58.49% | HIT |
| Q2 (60%) | above 55% | 58.49% | HIT |
| Q3 (40%) | every seed at or above 50% | lowest 55.08% | HIT |
| Q4 (95%) | declares ≥ 98.0% in every cell, every counter zero | lowest 99.69%; counters 0 | HIT |
| Q5 (97%) | the pin at 100% in every cell | 12 of 12 | HIT |
| Q6 (90%) | 12 of 12 complete, no watchdog stop, no Kraken error | 12 of 12, 0, 0 | HIT |

**Information only** [Measured, not scored]
- **Kraken's information edge:** 1,570 wrong declares (0.109 a game) whose true holders Kraken was shown. 429 were
  Monet's and 1,141 Kraken's own.
- **Forced declares:** Monet made 588 (300 right) and Kraken 379 (270 right). None of Kraken's put all six cards on the
  declaring seat, which is the only form FishLab invents, so it invented none.
- **CPU:** 1,104–1,310 CPU-seconds a cell, 4.10 CPU-hours in all (1.03 s a game). That is under the registered
  5.3–6.1, because the smoke that set the estimate also wrote the `log=` transcript.
- **Monet's ask calibration:** it expected about 0.54 of its asks to hit, and 0.56 did, a bias of −0.019 to −0.023 per
  cell. Against SESTINA at step 0 the bias was −0.0075.

**Disclosed, as it happened**
1. **The reader had a bug, fixed before any read cell finished.**
   - Its dry run on the step-0 cell misread the engine's declarations line (a capture-group offset).
   - It was fixed, and the reader's md5 (`4c69a443…`) was recorded at 10:20:09Z. The lane had started 36 s earlier,
     at 10:19:33Z, but the first cell was still running and had printed no win-rate line.
   - The md5 was checked again immediately before the read.
2. **One lane, not two.** The installed package has a single cover-file directory and a single `bot.log`, so two
   containers running it would mix their files. The twelve cells ran one after another, 84 minutes in all.
3. **Contention.** Cells 1–7 ran with 11.8–12.0 of the machine's 12 CPUs busy, about 2 of them ours, and took 430–651 s
   each. Once it eased, cells took 123–294 s. Timing does not enter the games: the smoke's two replays and step 0
   were byte-identical.
4. **Torn lines in the shared `bot.log`,** from many processes appending to one file on the Windows bind mount. This
   is the known artifact, and the reader never reads `bot.log`.

**Archive.** `C:\Projects\FishAI-bench\bridge\kraken-v1\read-12\` (581 files). The reader's output is
`READ-read.txt`, and `READER_MD5` holds the reader's md5 and when it was recorded.

**What it writes: ATHENA's Kraken bar**
- Monet v1.0 beats Kraken v1.0. On these seeds it wins 58.49%, which is the level ATHENA has to clear.
- The bar itself is paired, as AC3 and G3b are against SESTINA. When ATHENA is read, fresh seeds are drawn, and
  Monet v1.0 and ATHENA each play Kraken v1.0 on them. ATHENA must be above Monet by the ship rule: the mean paired
  difference ≥ 2 SE above zero, and ATHENA ahead on ≥ 7 of 12.
- [Judgement] These twelve seeds are now spent. A fixed 58.49% threshold would be easier or harder than the paired bar
  depending on the fresh seeds' draw, so the paired read decides.

## 8. P1 pre-registration (registered 2026-09-19, before any P1 code or run)

**What P1 is for.** P0 built the engine and the harnesses. P2 will train ATHENA from scratch. Between them, P1 does two
jobs (§3's P1 row):

1. **It builds what P2's network needs and P0 did not port.** That means the rules-derived facts at training speed,
   the observation's reveal regime and start-seat rule, and a rule for which declare windows reach the network.
2. **It answers four sizing questions** before P2's budget is registered:
   - does a learned belief read hands better than Monet's hand-built one;
   - does search with that belief find anything (D4);
   - how much team play is worth at v1.0;
   - are the forced endgame and variance reduction worth building.

**What P1 is not.**
- It ships nothing, plays no bridge cell and reads no strength of ATHENA.
- G1 is informative, not a ship gate (§3).
- **It trains nothing that ATHENA keeps.** Under §0.3, ATHENA's networks start from random weights and learn from
  ATHENA's own games. The belief heads trained here are instruments.
  - They are trained on Monet v1.0's games, which is a measurement, not a warm start.
  - They are archived after their reads, and no weight of theirs initialises P2.
  - P2's own belief head learns from ATHENA's games, labelled by the true deal.

**Registration.** P1 is registered under §6 row 1 (the plan P0–P5, taken 2026-09-18) and the owner's standing rule,
as Monet's rungs were. It needs no install and no owner decision. The owner may amend any part of it before that
part runs. Section 8.9 lists what P1's results decide.

**Sources.**
- ATHENA.md as merged at `605bf5a`.
- MONET.md, cited by section.
- A fact sheet compiled today from the records (`C:\Projects\FishAI-bench\athena\p1\fact-sheet.md`), whose sixteen
  open questions are each answered below.

### 8.1 G1a: the rules-derived facts, ported

**What.** `athena-env` gains `facts.rs`. For any seat's view it computes what `buildKnowledge(view, options)` computes
in `lib/engine/bots/knowledge.ts` under Monet v1.0's options, leaving out the marginal:
- the candidate seats of every card, as a six-bit mask, where a singleton means the card is certain;
- the certain holders;
- the cards gone;
- the unknown slots of each seat;
- the set-membership constraints, with count exhaustion propagated to a fixpoint.

The batch API gains a `facts` buffer. The rules-certain declare (the hard rail of §1) is computed from it in Rust.

**The bar. All of these must hold:**
1. **Home.** At every step of all 10,800 corpus games, from all six seats' views, the port's facts equal
   `buildKnowledge`'s: every candidate mask, holder, gone card, unknown-slot count and constraint, with constraints
   compared as sets.
   - That is 28.7 million views.
   - [Estimate] About 8 CPU-minutes on the reference side at the measured 0.017 ms a call (§4.3).
2. **The bridge.** At every ask of the 14,400 panel-SESTINA games of §3.8ba, from the asking seat's view under the
   reduced reveal (`replay-format.md` §12.4), the port's facts equal `buildKnowledge`'s on `walkAsks`'s view. That is
   1,342,770 views.
3. **The rail.** At every window offer of the corpus, the port's rules-certain declare (set and assignment) equals
   `lib/athena/policy.ts`'s `railPlan`, which G0d pinned.
4. **Two planted mutants are caught.**
   - M6 skips count exhaustion.
   - M7 ignores the set-membership constraints.
   - Each must make check 1 fail.
5. **The coverage** is reported: views with a constraint, views where exhaustion fired, and views with a
   singleton reached only by propagation. Each must be at least 50.

**If it fails,** nothing downstream uses the facts until the divergence is located. A failure that is not located
within two working days stops P1 and is reported.

> **G1a scored 2026-09-19: PASS.** Branch `claude/athena-p1a`, commits `b413817`, `614aea6` and `bc02d84`.
>
> | check | bar | result |
> |---|---|---|
> | 1. Home | every step equal | 4,788,218 of 4,788,218 steps equal (28,729,308 views) |
> | 2. The bridge | every view equal | 1,342,770 of 1,342,770 views equal, in 14,400 games |
> | 3. The rail | equals `railPlan` | 4,132,578 window offers, 165,016 with a rail; 0 games differ |
> | 4. M6, no count exhaustion | check 1 fails | CAUGHT: 759,806 steps in 7,586 games differ |
> | 4. M7, no constraints | check 1 fails | CAUGHT: 4,614,471 steps in 10,744 games differ |
> | 5. Coverage, home | each at least 50 | 26,431,644 views with a constraint; exhaustion fired in 4,406,695; 14,144,552 with a singleton reached only by propagation |
> | 5. Coverage, bridge | information | 1,238,225 with a constraint (the reference counts the same); exhaustion 201,699; propagation 606,208 |
>
> - [Information] On the bridge check, M6 leaves 1,175,489 of the 1,342,770 views equal, and M7 leaves 74,106.
> - [Information] The most distinct constraints in one view: 26 at home and 12 at the bridge. The facts buffer holds 64.
> - **Cost** [Measured]. The reference side took 170 s at home on 3 threads (the estimate was about 8 CPU-minutes) and
>   9 s at the bridge. The port's checks took 18 s and 1 s on 4 threads.
>
> **Checked independently.** Everything was re-run from the branch head (`bc02d84`, clean tree), with the reference
> facts emitted afresh. Every number above came out the same.
> - The Rust gates pass: fmt, clippy with and without the mutants, `cargo test`, and replay-check (G0a (i) PASS).
> - The Python tests pass: test_facts and test_harness 9 of 9 each, run against the mutants build.
> - typecheck and lint pass, and vitest passes (82 files, 1,252 tests).
>
> **Amended with the result** (definitions only; no bar changes). Check 5's counts:
> - "Exhaustion fired" counts a view where count exhaustion fixed a card, during the walk over the log or in the
>   view's own fixpoint.
> - "A singleton reached only by propagation" counts a view with a card that is certain only by inference. At home,
>   8,788,148 of the 14,144,552 were reached inside the view's own fixpoint.
>
> **Q1, G1a holds within P1 (85%): HIT.**
> **Q2, G1a's first full run is clean (40%): HIT.** The first full run of checks 1 to 3 passed. Two smaller smoke
> runs came before it (3,400 and 80,843 steps), and both passed.

### 8.2 G1b and G1c: the observation's regime and the declare windows

**G1b: the reveal regime.** P2 will train under both regimes, and the observation says which one a game is in
[Judgement].
- **Home** publishes every holder after a wrong declare.
- **The bridge** publishes, after a wrong declare, only the cards whose location a hit had made public (§12.4).
- Reads against Monet are at home, and reads against SESTINA and Kraken are at the bridge. A policy that has seen only
  one regime would meet the other untrained.
- **The rule registered here:**
  - each training game draws its regime with probability ½;
  - a regime bit is in the observation;
  - the port's event rows and set blocks follow §12.4 in the bridge regime.
- **The bar:** at every step of every corpus game, from the acting seat's view, the port's bridge-regime observation
  equals `replay-codec.ts`'s encoding under `Reveal = 'reduced'`.
  - The planted control, the full reveal in the bridge regime, must differ.
  - The home regime is G0a's and G0d's, unchanged.

**The start seat.** The bridge's host does not publish it.
- **The rule, for both regimes:** the observation's start seat is unknown until the first event, then that event's
  actor, as G0d's adapter does.
- It is wrong only when the first event is an out-of-turn declare: 0 times in 400 games at G0d. Its rate over the
  corpus is reported.

**G1c: which declare windows reach the network.**
- **Why a rule is needed.**
  - A v1.0 game offers about 562 declare windows and asks about 92 times (§3).
  - §3.1's rates assume about 100 network decisions a game, and the brief's C.2 assumes "a cheap head or a rule" for
    the rest.
  - Evaluating every offer would multiply P2's acting cost about six times.
- **The rule.** At a window offer, the declare head is evaluated only if the offered seat's team has a **live set**:
  an open set that the facts do not prove lost, with at least k of its six cards certain on the team.
  - Any other offer is declined by rule, except that a rules-certain set is declared by the rail.
- **k is chosen by a registered rule.** On the held-out test games of §8.3, k is the largest value in {4, 3, 2} such
  that at least 99% of Monet v1.0's own declares happen at windows the rule admits.
- **The bar:** that k admits ≥ 99% of Monet's declares, and evaluates at most 20% of all window offers.
- **If no k meets both,** the rule is dropped, and P2's acting cost is re-costed for every offer before P2's budget is
  registered.
- [Judgement] This constrains ATHENA only where Monet itself almost never declares. P3 can relax k, registered on its
  own.

> **G1b scored 2026-09-19: PASS.**
> - **The bridge regime.** At every step of the 10,800 corpus games, the port's bridge-regime observation of the
>   acting seat equals `replay-codec.ts`'s encoding under `Reveal = 'reduced'`: 4,788,218 of 4,788,218 steps. The
>   bridge-regime facts differ in 0 games.
> - **The planted control,** the full reveal in the bridge regime: CAUGHT, 1,327,765 steps in 6,203 games differ.
> - **Home's rules are unchanged:** replay-check prints G0a (i) PASS.
> - **The JavaScript encoder equals the port's** in both regimes, byte for byte, with the facts row: 1,302,128 states
>   over 5,600 games, 0 differ. Its planted controls are caught in both regimes.
> - **The layout.** The obs row gains one byte, the regime (`O_REGIME` = 94, so 95 bytes): 0 at home, 1 at the
>   bridge. A game's regime is drawn from its seed: the bridge when `mulberry32(xmur3(seed + ":regime"))` draws
>   below ½ (`athena-env/API.md` §3.5).
> - **The start seat** (the rule above, now in both regimes). It is wrong in 1,903 of the 10,800 corpus games
>   (17.6204%), and in every one of them the first event was a declare. By population:
>
>   | population | wrong |
>   |---|---|
>   | H1, Monet v1.0 in all six seats | 1 of 2,000 (0.05%) |
>   | H2, the roster styles | 0 of 1,800 |
>   | H3, Monet v1.0 against v0.33 | 0 of 1,000 |
>   | H4, the fuzz policy | 1,652 of 4,000 (41.3%) |
>   | H5, the mixed stub | 250 of 2,000 (12.5%) |
>
> - **One fix came with it.** `lib/athena/policy.ts`'s `forwardView` folded one row for each event in the log.
>   Under the start-seat rule a game's first decision has no rows, so it now folds the rows the encoder returns.
> - **G0d's stub package, re-tested on the new encoding** [Measured]. The start-seat rule changes what the stub's
>   network sees early in a game, so some of its games changed: 189 of G0d's 200 Balanced games are identical, and 190
>   of the 200 mixed ones.
>   - It still plays with every fault counter at zero: 6,214 asks against Balanced, and 12,786 against the mixed stub.
>   - The forced test passes 42 of 42.
>   - The in-engine pin holds at 6,214 of 6,214, and 12,786 of 12,786.
>   - G0d's archived stub records predate this change.
> - **For P2** [Information]. The stub's network does not read the regime byte (its decision features stay at 516),
>   and `forwardView` writes the home regime unless it is told otherwise. P2's network has to read it.
>
> **Amended with the result.** No bar changes.
> 1. "The home regime is G0a's and G0d's, unchanged" means home's rules and digests. Home's actor buffers do change
>    in two ways: they carry the regime byte (0), and their event rows follow the start-seat rule.
> 2. The start seat's rate is reported by population, as above. The pooled 17.6% mixes policies that behave very
>    differently.
>
> **Q3, G1b holds (90%): HIT.**
>
> **G1c before its registered reading** [Measured, information]. On H1's 2,000 games (15,266 declares by Monet v1.0,
> 1,137,909 window offers):
>
> | k | Monet's declares the rule admits | offers evaluated |
> |---|---:|---:|
> | 4 | 99.653% | 23.689% |
> | 3 | 99.882% | 56.631% |
> | 2 | 99.987% | 90.169% |
>
> - On H1, no k meets both bars. k = 4 admits enough of Monet's declares, but evaluates 23.689% of offers, above the
>   20% bar.
> - The registered reading, on §8.3's held-out test games, follows.
>
> **G1c scored 2026-09-19: FAILED, so the rule is dropped.** On the test split of (a): 10,000 games as played, which
> are 5,000 distinct games (§8.3's amendment); 76,106 declares by Monet v1.0; and 5,689,594 window offers
> (`scripts/athena/window-rule.py`).
>
> | k | Monet's declares the rule admits | offers evaluated |
> |---|---:|---:|
> | 4 | 99.735% | 23.548% |
> | 3 | 99.905% | 56.010% |
> | 2 | 99.995% | 90.131% |
>
> - The registered k is 4, the largest value that admits at least 99% of Monet's declares. It evaluates 23.548% of the
>   offers, above the 20% bar, so no k meets both bars.
> - Each game is in the test split twice, so every count above is doubled. None of the shares change.
> - [Information] 74,488 of the 76,106 declares (97.9%) are rules-certain. The rail makes them at an offer the rule
>   admits, whatever k is.
> - As registered, the rule is dropped. Every offer reaches the declare head, and P2's acting cost is re-costed for
>   every offer. That re-cost is §3.1's note of the same day: about three times the first estimate.
>
> **Q4, G1c holds with k = 3 or 4 (60%): MISS.**

### 8.3 G1: the belief-head study

**The data.**
- **Population (a), at home:** Monet v1.0 in all six seats, geometry B (§4.6 G0c amendment 3), played by the port and
  the opponent service. The labels are `athena-p1-belief-train-<i>` (100,000 games), `-val-<i>` (5,000) and
  `-test-<i>` (10,000). The splits never share a label.
- **Population (b), SESTINA's view at the bridge:** §3.8ah's population exactly.
  - SESTINA's asks in the seven groups, sampled at 2% with salt 35.
  - The test split is the holdout, every fifth file.
  - The v0.28 records of group 5 were archived today from the scratchpad, md5-verified, so the population is whole.
- **Population (c), Monet's view at the bridge:** every Monet ask in the twelve panel-SESTINA files of §3.8ba (679,615
  asks). It is test only. It is the view ATHENA itself will have abroad.
- **The unit** is §3.8ah's (`scripts/gen-holder-data.mjs`):
  - at an ask decision, from the asking seat's view;
  - every card of an open set with at least two candidate seats;
  - in deck order;
  - post-clinch asks included.
- **Metrics:** holder top-1 and NLL. The SE is a cluster bootstrap over games: 1,000 resamples, seed
  `athena-p1-boot`. That answers fact-sheet question 1: a binomial SE over cards would understate it.

> **Amended 2026-09-19, before any head was trained or any metric of (a) was read.**
>
> Geometry B's mirror pair is the same game played twice when Monet v1.0 plays both teams. All 5,000 pairs of the test
> split are identical, so its 10,000 games are 5,000 distinct games from 1,667 deals.
> - **Units and SE.** (a) uses one copy of each pair everywhere: training, validation and test.
>   - Its cluster bootstrap resamples deals. A deal's three distinct games share its hands, and a bootstrap over the
>     10,000 rows would understate the SE by about √2.
>   - (b) and (c) keep games as the cluster.
> - **Train size.** The training split is extended to 100,000 distinct games: 33,334 deals, with seeds up to
>   `athena-p1-belief-train-33333`.
>   - "100,000 games" was a training-set size. Half of it would tilt §8.7's sizing read toward S.
>   - Validation keeps 2,500 distinct games and test keeps 5,000. Their size sets only the SE.
>   - The extension costs about 2.5–5 more CPU-hours, or 1–2 hours on four workers. The test split measured 0.5
>     CPU-hours for 10,000 games, and the low end skips replaying the mirror copies.

**Step 1: the baselines, measured before any head is trained.**
- The marginal (`pModel: 'marginal'`, Monet v1.0's belief) and the slot prior are scored on the test split of each
  population.
- On (b), the scorer must reproduce §3.8ah's **32.19% and 1.4542**, to the precision recorded. If it does not, the
  population is not intact: the (b) read stops, and the rest continues.

**The arms.** Each head is §1's candidate network: a GRU over the seat's public events, with the facts of §8.1 as
input, a trunk, and a belief head giving a softmax over each card's candidate seats (masked by the facts).

| arm | size | trained on | role |
|---|---|---|---|
| B-S | S | (a)-train | sizing |
| **B-M** | **M** | **(a)-train** | **G1's head** |
| B-M+D2 | M | (a)-train plus Monet's seats' views in the non-holdout files of (b)'s seven groups | the owner's D2 variant: SESTINA's recorded play read as evidence, never as ATHENA's action |
| B-M-scaled | M | B-M, then Sinkhorn-scaled to the public hand counts | brief B.4.1's rescaling; no retraining |

- **Training:**
  - cross-entropy of the true holder;
  - Adam at a learning rate of 3·10⁻⁴;
  - batches of 256 games;
  - at most 20 epochs, stopping after 2 epochs without a better validation NLL.
- **The epoch is chosen on the validation split, and the test split is read once.** This answers fact-sheet question 4: H1
  chose its epoch on its holdout.
- `scaleToMargins` is exported from `marginal.ts` for B-M-scaled. It is an export, with no change to its behaviour,
  pinned by the v0.54 forward bank at 36 of 36.

**G1, the bar** (informative; §3's row, with the NLL condition that §3.8ah's M0 carried, answering fact-sheet question 3). **B-M passes
G1 if, on the test splits of both (a) and (b):**
1. its top-1 is at least the marginal's plus **2.0 points**; and
2. its NLL is below the marginal's.

(c) is reported beside it. It is the population ATHENA will actually meet.

**D2, the owner's condition.** B-M+D2 replaces B-M as P2's configuration only if both of these hold:
- **on (c):** its top-1 beats B-M's by at least 2 SE, and its NLL is lower;
- **on (a):** its top-1 is not below B-M's by more than 2 SE.

Otherwise, P2 trains its belief on ATHENA's own games alone. This is the owner's *"allowed if thats the best path"*,
made a measured condition, as §5 said it would be.

**The export.** Each head is exported to G0d's weight format and run by `lib/athena`'s deterministic forward.
- On 10,000 test cards, the forward must agree with PyTorch at every card's argmax, with no probability off by more
  than 10⁻⁴.
- Only an agreeing export may drive §8.4 or the declare pin.

**The declare pin, for the record** (§2).
- `attribute.mjs --locks` gains an arm that patches the table with B-M's output.
- Its reliability table by guessed cards and p bin is printed beside the shipped table's, on the same windows of
  §3.8ba's twelve panel-SESTINA files.
- This does not gate G1: no bot's belief changes in P1.
- It gates any later use of the head inside Monet's declare, or inside ATHENA-S. That use must be within the shipped
  table's on every bin at p ≥ 0.7 (§3.8l), read as "not below by more than 2 SE" (fact-sheet question 7).

> **The data, 2026-09-19** [Measured]. Branch `claude/athena-p1b`.
> - **(a)** is Monet v1.0 self-play, played by the port and the opponent service. Every step's digests equal the
>   reference's, with no game diverged, refused or capped.
>   - Test: 5,000 distinct games, 1,667 deals.
>   - Validation: 2,500 games, 834 deals.
>   - Train: 100,001 games, 33,334 deals, 9,252,034 asks and 260,582,282 scored cards. The extension's first deal
>     makes one game over 100,000.
> - **D2** is 417,720 games of the non-holdout files, with 18,618,468 Monet asks, every ask and unsampled.
> - Generating the games took 8.4 CPU-hours.
>
> **Step 1, the baselines** [Measured]. SE by the cluster bootstrap: (a) by deal, (b) and (c) by game.
>
> | population | cards | clusters | the marginal: top-1 | NLL | the slot prior: top-1 | NLL |
> |---|---:|---:|---:|---:|---:|---:|
> | (a) test | 12,975,493 | 1,667 | 30.6512% (SE 0.0539) | 1.473020 | 25.9582% | 1.522746 |
> | (b) holdout | 2,632,109 | 64,506 | 32.1946% (SE 0.0355) | 1.454243 | 26.5381% | 1.510334 |
> | (c) | 17,802,616 | 14,400 | 31.4532% (SE 0.0263) | 1.461756 | 26.3406% | 1.514003 |
>
> - **(b) reproduces §3.8ah exactly: 32.19% and 1.4542.** The re-run of `gen-holder-data.mjs` is bit-identical to
>   the original's, group by group.
> - **Q5, the marginal reproduces 32.19% and 1.4542 on (b) (95%): HIT.**
>
> **The head's inputs, amended before any arm was trained.** The first pipeline gave the head the facts only as each
> card's candidate seats: G0d's 516 decision features. §8.1's facts also hold set-membership constraints that no mask
> shows, and the marginal uses them. So the heads read format v2, with 912 decision features:
> - G0d's 516;
> - for each relative seat and open set, its tightest constraint (fewest cards; ties to the smaller mask), as a flag
>   and a six-bit card mask: 378;
> - each open set's count of cards certain on the team (÷ 6), and its "proven lost" flag: 18.
>
> `lib/athena`'s forward reads 516 or 912 from the weight header. G0d's stub keeps 516, and it still passes the
> package check: 0 faults, and the pin at 6,214 of 6,214.
>
> **G1 scored 2026-09-19: FAILED** [Measured]. Each test split was read once.
>
> | arm | (a) top-1 | (a) NLL | (b) top-1 | (b) NLL | (c) top-1 | (c) NLL |
> |---|---:|---:|---:|---:|---:|---:|
> | the marginal | 30.6512% | 1.473020 | 32.1946% | 1.454243 | 31.4532% | 1.461756 |
> | B-S | 31.2273% | 1.452813 | 31.8852% | 1.449106 | 31.4804% | 1.456785 |
> | **B-M** | **31.3642%** | **1.445926** | **31.7955%** | **1.448096** | **31.4366%** | **1.455582** |
> | B-M+D2 | 31.5140% | 1.443813 | 32.5044% | 1.445381 | 31.8811% | 1.444990 |
> | B-M-scaled | 31.7116% | 1.440593 | 32.2268% | 1.440781 | 31.8189% | 1.448868 |
>
> - **B-M against the marginal** (paired, on the same clusters):
>   - (a): top-1 +0.713 points (SE 0.036), against the +2.0 bar. NLL −0.0271 (SE 0.0004).
>   - (b): top-1 −0.399 points (SE 0.026). NLL −0.0061 (SE 0.0002).
>   - (c), beside: top-1 −0.017 points (SE 0.020). NLL −0.0062 (SE 0.0002).
> - **No arm passes.** The largest top-1 gain is B-M-scaled's +1.060 points on (a).
> - **In plain words:** the learned heads put more probability on the true holder than the marginal does, in every
>   population. But they name the single most likely holder only slightly more often at home, and no more often on
>   SESTINA's games.
>
> **§8.7: P2 starts at M.** B-M's top-1 on (a) is above B-S's by +0.137 points (SE 0.027, 5.0 SE).
> - [Information] On (b) and (c) B-S is ahead of B-M, by 3.1 and 2.3 SE.
>
> **D2: B-M+D2 replaces B-M as P2's configuration.** Both conditions hold:
> - on (c), its top-1 beats B-M's by +0.445 points (SE 0.022, 19.9 SE), with a lower NLL;
> - on (a), it is not below B-M; it is above, by +0.150 points (5.2 SE).
>
> P2's belief loss therefore also reads Monet's seats' views of SESTINA's recorded games. That is evidence about hands,
> never ATHENA's action.
>
> **B-M-scaled** (Sinkhorn-scaled to the public hand counts) beats B-M on every population: +0.347, +0.431 and +0.382
> points, with lower NLL. [Information for P2: the scaling needs no training.]
>
> **The export passes for every arm.** On 10,000 (a)-test cards, the argmax differs on 0, and the largest probability
> difference is 3.9·10⁻⁷ (B-S), 1.0·10⁻⁶ (B-M) and 6.8·10⁻⁷ (B-M+D2).
>
> **Training** [Measured]. The epoch was chosen on (a)-val.
> - B-S and B-M reached the 20-epoch cap still improving. B-S was best at epoch 20; B-M was best at 19, with a
>   validation NLL of 1.445844.
> - B-M+D2 stopped by patience at epoch 13, best at epoch 11 (1.443943).
> - The GPU job took 1.44 hours of wall time, above the estimate of under one. The data loader set the pace: about 45 s
>   an epoch, against 12 s (S) and 24 s (M) of GPU work.
>
> **Checked independently** from `ef61a85`, in a separate checkout. Everything came out the same:
> - Every game part matches its manifest's md5.
> - The test split's first 1,200 games, generated afresh, are identical in every array.
> - Every baseline's cluster file is byte for byte the same, and so is every bootstrap.
> - Each arm's chosen checkpoint re-scores to the same cluster files, on all three populations and scaled. It exports
>   to the same weight file (B-M: md5 `cb6b3ac8…`) and passes the export check.
> - typecheck, lint and vitest pass (85 files, 1,270 tests), and so does the stub's package check.
>
> **Amended with the result** (implementation only; no bar, split, seed or arm changes):
> 1. The facts features above.
> 2. **Events enter the head as slot counts through one linear layer.** It is the same sum as the forward's
>    embedding. This was changed after the first B-S run spilled out of GPU memory, and that run is void.
> 3. **G0d's fold adds the embedding's column 0 twice an event, and PyTorch mirrors it.** This only reparametrises the
>    embedding's bias, so it limits nothing. P2's format fixes it.
> 4. B-M+D2 validates on (a)-val.
> 5. The arm seeds are `athena-p1-B-S`, `athena-p1-B-M` and `athena-p1-B-M+D2`.
> 6. The export check's cards are drawn from (a)-test with seed `athena-p1-export`, with PyTorch in float32 against
>    the float64 forward.
> 7. The bootstrap resamples the clusters that hold a scored card: 64,506 of (b)'s 65,623 games.
>
> **Q6, B-M +2.0 above the marginal on (a) (65%): MISS. Q7, the same on (b) (20%): MISS. Q8, G1 holds (15%): MISS.
> Q9, B-M beats B-S on (a) by 2 SE (70%): HIT. Q10, D2 keeps B-M+D2 (30%): HIT. Q11, the export agrees within 10⁻⁴
> (90%): HIT.**

### 8.4 D4 with the head: is ATHENA-S open?

**The instrument** is §3.8av's D4 (`scripts/probe-ask-oracle.mjs`), unchanged except for a sampler option.
- It runs at home, with Monet v1.0 in all six seats, at stride 5.
- At each sampled ask it draws 16 deals from the sampler.
- It scores every legal ask by its mean 24-step rollout value.
- It plays the best one on the true deal, paired with Monet's own pick, to the end of the game.

**What changes from the record.**
- **Monet v1.0's vector,** not v0.33's. v1.0 is the bar now.
- **Two samplers on the same decisions:**
  - **M**, the marginal: the record's sampler, re-measured at v1.0.
  - **H**, B-M's table, patched in through `marginalFor(k)`.
- **40 games,** labelled `athena-p1-d4-<i>`: about 650 decisions a sampler.

**The bar (brief B.4.1). ATHENA-S (P4) opens if H's D4 is above zero by at least 2 SE,** to the end of the game. Zero
is Monet's own pick, so the bar is a paired difference, per decision (§3.8av).
- H − M on the same decisions is reported beside it.
- If H misses, search stays closed for ATHENA, and the record says why, as §3.8av did for Monet.
- This answers fact-sheet question 6: the bar is "above Monet's pick", and M is only a reference.

[Estimate] 9–15 s a decision (9.08 s at v0.33). About 3.3–5.5 CPU-hours for both samplers, about 1–1.5 hours on four
processes.

> **The M arm, read 2026-09-19** [Measured]. Branch `claude/athena-p1c` (the sampler seam at `4241a99`).
> - **D4 with the marginal, to the end: −0.135 (SE 0.093)**, over 763 sampled decisions of the 40 games. At 24 steps
>   it is +0.003 (SE 0.016).
>   - A search on Monet v1.0's own belief does not beat its own pick, as §3.8av found at v0.33 (−0.141).
>   - What hindsight is worth over this, with the true deal: +3.265 (SE 0.088).
> - It took 5,837 s on one process: **7.65 s a decision**, under the 9–15 s estimated. It made 696,700 rollouts.
> - Every decision's per-ask values are saved (`C:\Projects\FishAI-bench\athena\p1\c\d4\m-values.jsonl`).
>   Recomputing D4 from that file gives −0.1350 (SE 0.0933).
>
> **The H arm waits for B-M.** It runs on M's decisions: it reads M's true-deal values from that file, checks each
> decision against M's, and prints H − M.
>
> **Checked independently** from the branch head (`295b55f`, clean tree).
> - The first two games, re-rolled from scratch, reproduce agent C's 38 decisions in every saved field.
> - The H seam, run with the marginal as its sampler, reads H − M = +0.000 (SE 0.000) and chooses the same ask on 38
>   of 38.
>
> **Amended with the result:**
> 1. **H runs on M's saved decisions** (`--values-in`), so the two samplers are compared on exactly the same asks.
> 2. **"About 650 decisions a sampler" was an estimate.** Stride 5 over these 40 games gives 763.
>
> **Q13, M's D4 at v1.0 is within 2 SE of zero or below (90%): HIT.** It is −1.45 SE.

> **The H arm, read 2026-09-19: ATHENA-S stays closed** [Measured]. B-M's table is the sampler (`--sampler head:`,
> weights md5 `cb6b3ac8…`), on the M arm's own 763 decisions (`--values-in`).
> - **D4 with the learned belief, to the end: −0.149 (SE 0.093).** The bar is above zero by at least 2 SE, so it
>   misses. At 24 steps it is +0.048 (SE 0.017).
> - **H − M on the same decisions: −0.014 (SE 0.084).** The two samplers are the same within noise.
> - **They do not choose the same ask.** H played M's ask at 300 of the 763 decisions. A better-calibrated belief
>   changed which ask looked best at 61% of decisions, and changed the value of the choice by nothing measurable.
> - **What hindsight is worth is unchanged:** the full-set ceiling on the true deal is +3.130 (SE 0.084) over the pick.
>   The belief is the constraint, not the search.
> - It took 4,871 s on one process, 6.38 s a decision, while three other jobs shared the host.
> - Recomputing both arms from their saved value files gives −0.1494 (SE 0.0931) and −0.1350 (SE 0.0933), and the
>   files cover the same 763 decisions, game for game.
>
> **What it decides, as registered: search stays closed for ATHENA.** P2 trains the policy alone, and a decision costs
> one forward pass. If P3 or a later phase wants search, it re-registers this read with whatever belief it has then.
>
> **Q12, D4 with the head clears +2 SE and ATHENA-S opens (10%): MISS.**

### 8.5 The team-information ceiling, at home (brief B.6.1)

**The arm.** T1 is Monet v1.0 whose knowledge also holds its two teammates' true hands. Nothing else changes: not its
bars, not its policy, not its rail.
- It is built through a test-only knowledge option, `teamHands`, which no registry entry sets.
- It is pinned by the forward bank at 36 of 36 with the option unset.

**The read.**
- `duplicate-pairs.mjs`, T1 against Monet v1.0.
- Twelve banks, `athena-p1-team-<k>`, of 400 pairs each: 9,600 games.
- **Read by the win rate.** Knowing teammates' cards makes more sets certain sooner, which moves declare timing (§2).
- The per-bank SD and SE are reported.
- This answers fact-sheet question 9: the record's +6.75 was at the bridge, on v0.4a, over three seeds, and its arm also cashed locks at
  once. T1 changes information only. What P1 measures is "what would perfect team communication be worth to Monet
  v1.0 at home".

**What it decides for P3** [Judgement, registered as the rule]:
- If T1's win rate is **below 55%,** team communication gets no dedicated work in P3. Other-Play symmetrisation stays
  in the plan for play with people (D7).
- If it is **60% or above,** P3 registers a team-coordination variant (brief B.6.1).
- **Between 55% and 60%,** it is noted, and P3 decides with its own read.

[Estimate] About 20–30 CPU-minutes.

> **T1, read 2026-09-19: 98.64%, in the top band** [Measured]. T1 against Monet v1.0, twelve banks of 400 pairs (9,600
> games). No pair hit the step cap.
>
> | bank | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
> |---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
> | win rate % | 98.25 | 98.88 | 98.38 | 98.75 | 97.88 | 98.75 | 98.50 | 99.25 | 97.75 | 99.25 | 99.00 | 99.00 |
>
> - **The pooled win rate is 98.64%** (9,469 of 9,600): SD 0.50 across banks, SE 0.14; the lowest bank reads 97.75%.
> - The paired set difference is +8.07 sets a pair (SE 0.025).
> - [Information, a 40-game smoke bank] T1 asked 28.7 times a game and hit 62.7%, against v1.0's 19.5 asks at 42.6%.
>   It declared 5.00 sets a game, none of them wrong.
> - The forward bank reads 36 of 36 with the option unset, and every default output is unchanged.
> - **It took 7 minutes** on one process, against 20–30 estimated.
>
> **Checked independently** from `295b55f`: all twelve banks, re-played, give the same games, byte for byte, and the
> same printouts. vitest passes (84 files, 1,261 tests), and so do typecheck and lint.
>
> **What it decides, as registered: 60% or above, so P3 registers a team-coordination variant** (brief B.6.1).
>
> **Amended with the result** [Judgement]: 98.64% is a ceiling. No legal signal between teammates carries whole hands,
> so P3's variant is sized by its own read of what a team can actually share, not by T1's number. T1 is also not
> comparable with the record's +6.75, which was a different arm at the bridge.
>
> **Q14, T1 at least 55% (75%): HIT. Q15, T1 at least 65% (30%): HIT.**

### 8.6 Two records studies (no games)

**R1, the forced endgame (brief B.7.1), reduced to what the records can answer.**
- **What the records hold.** The twelve panel-SESTINA files of §3.8ba hold 1,041 forced declares: 540 Monet's and 501
  SESTINA's (fact sheet §3.4).
  - At the bridge, most of Monet's side of these is the host's forced procedure answered through MUSTFIX, not Monet's
    free choice.
  - Home has no forced endgame, only MUST_DECLARE windows.
- **The method.** For each forced declare:
  - enumerate every deal consistent with the declarer's view, and skip (and count) any case of more than 10⁶ deals;
  - compute each assignment's probability under a uniform prior over those deals;
  - compare the declared assignment with the most probable one.
- **The report** covers:
  - how often the declared assignment was the most probable;
  - the mean probability given up;
  - an **upper bound** on the sets a game an exact enumerator would add. That bound is (declares where the most
    probable assignment would have been right and the declared one wrong) minus (the reverse), per game.
- **It decides:** if the bound is below 0.1 sets a game, B.7.1 is closed as a lever for P2 and P3, and the rail and
  MUSTFIX stay as they are. Otherwise P3 may register an enumerator.
- This answers fact-sheet question 8. The source of the brief's "≤ 0.48" was not found, and it is not used.

**R2, variance reduction (brief B.8.3), reduced to the one term Fish has.**
- **The argument, registered first** [Judgement]:
  - Fish's only chance event is the deal. Monet is deterministic (§2's pins), and SESTINA cannot run at home.
  - An AIVAT-style estimator can therefore only subtract a value of the deal.
  - Every ship-rule read is paired on the same deals and rotations, so that term cancels exactly in the paired
    difference. It cannot tighten any read the ship rule uses.
  - It can only tighten a single arm's pooled rate, such as "58.49% against Kraken".
- **The check.**
  - Fit a logistic model of Monet's side winning, on hand features of the deal, using the older bridge records.
  - Apply it to §3.8ba's 14,400 games, and report the pooled SE with and without the correction, on the same games.
  - The correction's mean is estimated from 100,000 fresh deals that are dealt but not played. Its mean over the read's
    deals must be zero within 2 SE: that is the null arm the brief asks for.
- **It decides:** no later read uses AIVAT unless a within-game chance term exists, and in us54 none does. This answers
  fact-sheet question 10.

[Estimate] Both studies together take under one CPU-hour.

> **R1, read 2026-09-19: closed** [Measured]. The counts match the fact sheet exactly: 1,041 forced declares, 540
> Monet's (269 right) and 501 SESTINA's (225 right). No case came near 10⁶ deals (a mean of 4.0, at most 126), so none
> was skipped.
>
> | declarer | declared the most probable assignment | mean probability given up | a | b | bound, sets a game |
> |---|---:|---:|---:|---:|---:|
> | both | 1,004 of 1,041 (96.45%) | 0.0084 | 6 | 29 | −0.00160 |
> | Monet | 525 of 540 (97.22%) | 0.0078 | 2 | 12 | −0.00069 |
> | SESTINA | 479 of 501 (95.61%) | 0.0091 | 4 | 17 | −0.00090 |
>
> - a counts the declares where the most probable assignment would have been right and the declared one was wrong.
>   b counts the reverse.
> - **The bound is below 0.1 sets a game, so B.7.1 is closed** as a lever for P2 and P3. The rail and MUSTFIX stay as
>   they are.
>
> **R2, read 2026-09-19: no later read uses AIVAT** [Measured].
> - **The fit.** 558 older record files (751,350 games) give a McFadden R² of 0.0030. The fitted value correlates 0.066
>   with the result on the read's games.
> - **The SE with the correction, against without,** on the same 14,400 games:
>   - 0.4108 → 0.4099 over games (−0.22%);
>   - 0.4094 → 0.4094 by deal (0.00%);
>   - 0.4122 → 0.4125 by seed (+0.09%).
> - **The null check passes.** The correction's mean over 100,000 fresh deals is 0.440396 (SE 0.000098). The read's
>   mean differs from it by +0.000179, which is 1.81 SE.
>
> **Checked independently** from `295b55f`: both studies re-run to the same numbers in every field.
>
> **Amended with the result:**
> 1. **R1's decision was fixed by the count.** The records hold 0.072 forced declares a game, so no bound could have
>    reached 0.1.
> 2. **R1 enumerates over `knowledge.ts`'s facts**, which keep a superset of the truly consistent deals. In 170 cases
>    a constraint was dropped because it named a card that left play unrevealed after a wrong declare.
> 3. **R2's "older records"** are every SESTINA v1.0 record except `monet-v55` and `kraken-v1`, which were played
>    after the read. Files that replay an earlier file's (arm A, seed) are removed.
>
> **Q16, R1's bound below 0.1 (85%): HIT. Q17, R2 cuts the pooled SE by less than 15% (80%): HIT.**

### 8.7 Sizing for P2 (§1's "P1 sizes it")

**The inputs:**
- §3.1's GPU rates;
- G0d's forward cost (0.61, 2.41 and 10.35 ms a decision at S, M and L, one thread);
- B-S against B-M on (a).

**The rule** [Judgement, registered]:
- **P2 starts at M,** §3.1's base case.
- It starts at S instead if B-M's top-1 on (a) is not above B-S's by at least 2 SE. The extra size would then buy no
  belief accuracy, while S trains about 2.6 times faster.
- L is not used in P2.
- The transformer stays out, because it cost about a hundred times more without a cache (§3.1). A cached transformer
  is not built in P1.
- D5 (no decision-time budget) and the bridge's 30,000 ms timeout do not bind at any of these sizes.

### 8.8 Predictions [Judgement], written before any P1 code

| | prediction | probability |
|---|---|---:|
| Q1 | G1a holds within P1 | 85% |
| Q2 | G1a's first full run is clean | 40% |
| Q3 | G1b holds | 90% |
| Q4 | G1c holds, with k = 3 or 4 | 60% |
| Q5 | the marginal reproduces 32.19% and 1.4542 on (b) | 95% |
| Q6 | B-M's top-1 is at least +2.0 above the marginal on (a) | 65% |
| Q7 | B-M's top-1 is at least +2.0 above the marginal on (b) | 20% |
| Q8 | **G1 holds (both populations, top-1 and NLL)** | **15%** |
| Q9 | B-M beats B-S on (a) by at least 2 SE (P2 starts at M) | 70% |
| Q10 | D2 keeps B-M+D2 | 30% |
| Q11 | the export agrees with PyTorch within 10⁻⁴ | 90% |
| Q12 | **D4 with the head clears +2 SE (ATHENA-S opens)** | **10%** |
| Q13 | M's D4 at v1.0 is within 2 SE of zero or below | 90% |
| Q14 | T1's win rate is at least 55% | 75% |
| Q15 | T1's win rate is at least 65% | 30% |
| Q16 | R1's bound is below 0.1 sets a game | 85% |
| Q17 | R2's correction cuts the pooled SE by less than 15% | 80% |
| Q18 | P1 is done within 5 working days | 60% |

**Why these numbers** [Judgement]:
- **Q6.** Population (a) is in-population: a sequence model can learn Monet's own ask habits, which the marginal
  ignores, having no choice likelihood (§3.8k).
- **Q7.** H1, trained on (b) itself, reached only +0.99 (§3.8ah). A head trained on Monet's games meets (b) out of
  population.
- **Q12.** D4 read −0.141 at v0.33. A better belief lifts it, but +2 SE is about +0.17 sets a decision.

### 8.9 Cost, stopping rules, and what P1 decides

**Cost** [Estimate].

| item | cost |
|---|---|
| Engineering | **3–5 working days**: the facts port and G1a (1.5); the regime, start seat and window rule (0.5); data, trainer, export and scorer (1–1.5); the D4 sampler, the pin arm and T1 (0.5); R1 and R2 (0.5) |
| Monet self-play for (a) | 115,000 games, about 40–70 minutes at about 30–50 games a second on six to eight threads (§3.1: about 8.7 games a second a thread with Monet in six seats) |
| Belief training | minutes an arm on the GPU (§3.1: M trains about 4,900 games a second a pass); under 1 GPU-hour in all |
| Bridge views for (b), (c) and D2 | minutes, through the Rust bridge walk |
| G1a's reference side | about 10 CPU-minutes |
| D4 | 3.3–5.5 CPU-hours |
| T1 | 20–30 CPU-minutes |
| R1 and R2 | under 1 CPU-hour |
| **Total** | **about 6–9 CPU-hours and under 2 GPU-hours.** No bridge cell and no Docker. At most four of our processes run at once |

**What stops P1.**
1. **G1a is not located within two working days.** Stop and report. Nothing may train on facts that are unverified.
2. **The export cannot agree with PyTorch.** §8.4 and the pin wait. The belief numbers from PyTorch are still
   reported.
3. **The marginal does not reproduce §3.8ah on (b).** The (b) read stops. The rest continues.

**What P1's results decide for P2's registration.**
- **The inputs:** the facts buffer, the regime bit, the start-seat rule, and G1c's window rule and k.
- **The size:** M or S (§8.7).
- **D2:** whether P2's belief loss also reads Monet's seats' views of SESTINA's games.
- **ATHENA-S:** open or closed (§8.4).
- **Team play in P3:** a dedicated variant or not (§8.5).
- **B.7.1 and B.8.3:** closed, or registered as levers (§8.6).
- **Whatever G1 reads, P2's network carries a belief head.** It is part of ATHENA-L's architecture (§1), trained on
  ATHENA's own games. G1 says how much it should be expected to beat the marginal by, not whether it exists.

## 9. P2 pre-registration (registered 2026-09-19, before any P2 code or run)

**What P2 is.** P2 trains ATHENA-L from scratch, by self-play, until it can play Monet v1.0 at home. It is the first
phase in which ATHENA plays for strength. Its gate is §3's:

> **G2: at least 50.0% against Monet v1.0 at home, on twelve fresh seeds.** Kill criterion: below 45% after the
> registered budget, which goes to the owner with the brief's C.5 fallback.

**What P2 is not.**
- No league. Snapshots, Bass styles and exploiters are P3 (§3).
- No search at decision time. D4's H arm missed its bar (§8.4), so ATHENA-S stays closed.
- No team-coordination variant (P3, on T1's read), no play against people, no bridge cell, and no published number.
- No warm start of any kind. §0.3 stands: every weight begins random, and P1's belief heads are instruments that
  initialise nothing.

**Registration.** P2 is registered under §6 row 1 and the owner's standing rule, as P0 and P1 were. It needs one owner
decision, which is taken: **D4, runs of up to three days** (§6 row 4, 2026-09-19). The owner may amend any part of
this section before the part runs.

### 9.1 What P1 fixed

Everything here is settled by a P1 read, and P2 changes none of it.

| what | P2 takes | from |
|---|---|---|
| The observation | the 95-byte obs row, with the regime byte | §8.2 (G1b) |
| The event rows | the start-seat rule: no rows until the first event, then that event's actor | §8.2 |
| The facts | the port's facts buffer at every decision | §8.1 (G1a) |
| The decision features | 912: G0d's 516, the tightest constraint of each (seat, set), and each set's certain count and lost flag | §8.3 |
| Which declare windows reach the network | **every offer.** G1c found no rule that admits 99% of Monet's declares while evaluating at most 20% of offers | §8.2 (G1c) |
| The size | **M** (GRU 512, trunk 3 × 1024) | §8.7 |
| The belief head's extra data | **D2 holds:** the loss also reads Monet's seats' views of SESTINA's recorded games | §8.3 |
| Search | closed | §8.4 |
| AIVAT, and an endgame enumerator | closed | §8.6 |

### 9.2 The network

One network, one set of weights, used by all six seats through the seat-relative encoding. Self-play means both teams
run the same weights; nothing is shared between seats beyond those weights.

| part | shape |
|---|---|
| Event embedding | the event row's 19 active one-hot slots of 176 → 512, linear |
| Sequence encoder | a GRU of width 512 over the seat's public events |
| Trunk | 3 layers of 1,024, ReLU, over the GRU state and the 912 decision features |
| Ask head | a pointer over the 162 (card, target) codes, masked by the legal row |
| Declare head | 10: the nine sets and "decline" |
| Assignment head | 18: each of the declared set's six cards to one of the three teammates |
| Pass head | 2 |
| Belief head | 324 (54 cards × 6 relative seats), masked by the facts |
| Value head | 1 |
| Set-difference head | 1, the auxiliary prediction of §1 |
| Critic | a 1,024-wide MLP over the trunk's output and the true deal (324), **training only** |

- **The weight format is v3:** the decision features are 912, and the event fold reads exactly the 19 active slots.
  Formats 1 (G0d's stub) and 2 (P1's heads) keep the old fold, which added the embedding's column 0 twice. That was a
  reparametrisation of the embedding bias and cost nothing, but P2's weights are new, so it is fixed here.
- The exact weight count is printed at the run's start and recorded with the run. It is about 7 million.
- **Deterministic inference.** Every weight file P2 produces is read by `lib/athena`'s float64 forward for every read,
  as §2 requires. The GPU trains; it never judges.

### 9.3 The action space and the rails

- **Codes** are the port's (API.md §4): asks 0–161, decline 162, pass 163–164, declare 165+.
- **A declare is two draws:** the set from the declare head, then the assignment from the assignment head. The PPO
  ratio carries both.
- **The rails take three decisions away from the policy,** as §1 registered:
  1. a **rules-certain** set is declared by the rail, with its assignment, and the network is not called;
  2. at the bridge, PASSFIX and MUSTFIX stay in the adapter (they do not arise at home, and P2 is home);
  3. an action the legal row forbids is never sampled.
- Every other decision is the policy's, including each declare-window offer it declines.

### 9.4 The learner

PPO, clipped, on the port's batched environment.

| choice | value | why |
|---|---|---|
| Games in flight | 8,192 | G0b's batch; the acting loop's measured best (§3.1) |
| An iteration | 2,048 finished games | about 1.3 million decisions |
| Epochs an iteration (E) | 2 | §3.1's base case |
| Minibatch | 256 games | P1's |
| Clip ε | 0.2 | the standard value; no evidence here to move it |
| Discount γ | 1.0 | the reward is the game's result, and a game is about 660 decisions |
| GAE λ | 0.95 | the standard value |
| Optimiser | Adam, learning rate 3·10⁻⁴, gradient clip 1.0 | P1's, which trained every arm without trouble |
| Entropy bonus | 0.01 | held constant; a knob, off the critical path |
| Loss weights | policy 1.0, value 0.5, belief 0.25, set-difference 0.05 | [Judgement] the belief and the auxiliary must not outweigh the game |
| Precision | bf16 autocast, fp32 master weights | P1's, and the export check passed at 10⁻⁶ |

- **The reward is the game's result:** +1 for the winning team's seats, −1 for the losing team's, and 0 at every other
  step. The set difference is predicted, never rewarded (§1).
- **The critic sees the true deal.** The actor never does. The advantage is the critic's, by GAE.
- **Staleness.** A game that began under earlier weights is kept, and PPO's ratio against the behaviour log-probability
  stored at act time corrects for it. Nothing is discarded.
- **The belief loss** is the cross-entropy of the true holder at every decision, plus the D2 data of §8.3, replayed
  from the stored views at a fixed 10% of each minibatch's cards.
- **Every window offer trains.** Declines are the bulk of the decisions, and none is subsampled. The re-cost note in
  §3.1 lists subsampling as an option; it is **not** registered, and a run may not turn it on without a new
  registration.

### 9.5 The training games

- **Regimes:** each game draws home or bridge with probability ½ (§8.2), by its seed.
- **Opponents:** ATHENA plays itself in 93% of games, Monet v1.0 in 5% and Monet v0.33 in 2%. In an opponent game
  ATHENA holds one team and learns only from its own seats' decisions.
  - [Estimate] At the run's rate that is 18–28 Monet games a second, about 1.5 CPU threads (§3.1).
- **Seeds:** training games draw `athena-p2-<run>-<n>`, outside the read registry. They play no read.
- **The port trains, the reference judges** (§2). Before the run and at its end, `replay-check` must still print
  `G0a (i), port replay: PASS` on the 10,800-game corpus. It takes 0.85 s.

### 9.6 The learning curve, and checkpoints

- **A checkpoint every 30 minutes** holds the weights, the optimiser state and the iteration count, so a run can be
  paused and resumed at any time (D4's terms).
- **A curve read every two hours:** 600 duplicate pairs (1,200 games) against Monet v1.0 at home, on the fixed bank
  `athena-p2-curve`, through the reference engine and the deterministic forward.
  - It is an instrument, not a ship read: the same bank every time, so the curve is comparable with itself.
  - [Estimate] About 3 minutes on six threads.
- **The slope replaces the estimate.** §3.1's "how many games are needed" is redone from the first six hours of curve
  points, and reported before the budget is spent.

### 9.7 G2: the gate, and how it is read

- **The read:** ATHENA's last checkpoint against Monet v1.0 at home, twelve fresh seeds of 200 deals × 6 rotations
  (14,400 games), through `duplicate-pairs.mjs` on the reference engine.
- **The seeds** were drawn at this registration under the label `athena-p2-g2` (`scripts/seeds/athena-p2-g2/SEEDS`,
  drawn against the 284 spent seeds on file), and they are spent by this read alone. A later G2 read draws a new label.
  - 3927750, 4287814, 4474835, 3011667, 5436820, 3956909, 6915345, 8758820, 5150699, 4743758, 8467960, 7687656.
- **Read by the win rate,** as §2 requires of anything that touches declare timing. The paired set difference is
  reported beside it.
- **The bar is §3's: at least 50.0%.** Both ship-rule conditions are reported as well: the mean paired difference
  against 2 SE, and the count of seeds ATHENA is ahead on.
- **§6.2's controls all apply,** including the byte-exact null arm (ATHENA against itself must read 50.0000%), the
  cross-instrument identity pin, the fault counters at zero, and a home regression of at least 800 duplicate pairs.
- [Estimate] The read costs about 30–45 minutes on eight threads: ATHENA's forward is 2.41 ms a decision at M, and
  Monet's side is CPU-bound.

### 9.8 The budget, the stop rules, and the kill criterion

- **The budget is one run of up to three days** (D4), which is 0.9–1.4 × 10⁸ games at M (§3.1, re-costed).
- **The kill criterion, from §3:** below 45% at the budget's end goes to the owner, with the brief's C.5 fallback
  (ATHENA-P, Monet-seeded policy iteration) as the alternative.
- **Between 45% and 50%:** the run is reported with its curve, and the owner decides whether to spend a second run.
  Nothing ships.
- **What stops the run early:**
  1. **A divergence between the port and the reference.** Stop, and report; nothing trained after it is read.
  2. **Throughput below 5 × 10⁶ games a day** after the first two hours, which is a sixth of the estimate. Stop and
     re-cost before spending three days.
  3. **The learner crashes twice from the same cause.** Stop and fix; the checkpoints lose at most 30 minutes.
  4. **A curve that has not moved above 30% by 3 × 10⁷ games.** Report to the owner before spending the rest.
  5. **A rules change on main** (§4.9 item 5), which would break the corpus, the banks and the fixtures.
- **What is reported at the end,** whatever the result: the curve, the wall clock, the games played, the GPU and CPU
  time, the final win rate with its ship-rule numbers, and every prediction below, scored.

### 9.9 Cost, and what it occupies

[Estimate] From §3.1's re-costed rates, for a three-day run at M.

| resource | during the run | the machine has |
|---|---|---|
| GPU | busy throughout, 8–12 GB | 16 GB |
| CPU | 4–6 threads, briefly 8 during a curve read | 24 threads |
| RAM | 6–10 GB | 31 GB |
| Disk | 10–20 GB of checkpoints and logs | |
| Power | about 350–450 W, or 8–11 kWh a day | |

- **Games:** 0.9–1.4 × 10⁸.
- **Engineering before the run:** the learner, the training loop, the evaluation arm and the registry entry.
- **The run may be paused at any time,** losing at most 30 minutes (§9.6).

### 9.10 Predictions [Judgement], written before any P2 code

| | prediction | probability |
|---|---|---:|
| R1 | the first full run completes without a stop rule firing | 70% |
| R2 | throughput is within a factor of 2 of §3.1's re-costed estimate | 75% |
| R3 | the GPU holds the run at M without spilling into shared memory | 80% |
| R4 | ATHENA beats the random stub (above 95%) within the first 10⁶ games | 85% |
| R5 | ATHENA beats Monet v0.33 at home (above 50%) by the end of the run | 45% |
| R6 | **G2 holds: at least 50.0% against Monet v1.0 after one three-day run** | **25%** |
| R7 | ATHENA is at least 45% against Monet v1.0 after one three-day run | 45% |
| R8 | the curve is still rising at the budget's end | 80% |
| R9 | the belief head beats the marginal's top-1 on ATHENA's own games by the end | 55% |
| R10 | the rail makes more than half of ATHENA's declares at the end of the run | 70% |
| R11 | no divergence between the port and the reference is found | 90% |
| R12 | P2's first run starts on the weekend of 2026-09-26 | 75% |

**Why these** [Judgement]:
- **R6.** The brief's C.2 puts "from scratch to Monet's level" at 10⁷–10⁸ games, uncertain by about tenfold either
  way, and one run is at the top of that range. Monet is a tuned bot with a hand-built belief and a ranker behind it,
  at 58.38% against SESTINA. A first from-scratch run that matches it is possible, not likely.
- **R7.** Reaching half of Monet's edge is what a first run should do if the learner is sound.
- **R9.** P1's heads, trained on Monet's games, gained +0.71 points of top-1 (§8.3). ATHENA's own games are in
  population for its own head, which is the case G1 could not test.

### 9.11 What P2 decides

- **Whether ATHENA-L works at all.** G2 is the first read of strength in the line.
- **The budget for P3,** from the measured curve rather than the brief's range.
- **Whether the fallback (C.5) is opened,** if the kill criterion fires.
- **The size question, again:** if throughput binds rather than learning, S is re-costed with the curve's slope.

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
