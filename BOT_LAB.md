# BOT_LAB.md — Play-style spectrum: research, experimental design, and metrics

**Goal.** Build a spectrum of Canadian Fish bot *styles* (aggressive → conservative → passive, plus a
card-hoarding style), simulate them against each other, and answer two questions quantitatively:

1. **Is there a superior style?** — and if not, say precisely why not.
2. **How do styles counter each other?** — the matchup structure, surfaced on the site.

Plus a third, operational goal: **play a foreign bot** (a friend's independently written AI) under a
protocol both sides trust.

This document is research + plan + metrics. It specifies *functionality and data contracts only* —
no visual design (front end is a later pass).

---

## 0. Baseline — what already exists

Everything below builds on shipped code. Nothing here requires a rewrite.

| Asset | Location | Status |
|---|---|---|
| Rules engine (pure, deterministic, seeded) | [lib/engine/](lib/engine/) | 192 tests green, 10k-game fuzz clean |
| Pinned rule set | [RULES.md](RULES.md) | 24 rows + 10 variant toggles, all off |
| Public-information inference core | [lib/engine/bots/knowledge.ts](lib/engine/bots/knowledge.ts) | constraint propagation to fixpoint |
| Decision policy, 3 tiers | [lib/engine/bots/decide.ts](lib/engine/bots/decide.ts) | easy / medium / hard |
| Round-robin sim harness | [scripts/simulate-main.ts](scripts/simulate-main.ts) | 6 pairings × 1000 games |
| Hidden-info guarantee | [tests/bots/public-view.test.ts](tests/bots/public-view.test.ts) | bots consume `SeatView` only, type-enforced |

**Measured this session** (single-threaded, Node 24, this machine):

| Pairing | Games | Result (A–B–T) | Avg moves | Voids/game | Throughput |
|---|---|---|---|---|---|
| hard vs hard | 300 | 116–109–75 | 104.1 | 0.22 | 211 games/s |
| hard vs medium | 300 | 142–90–68 | 107.6 | 0.24 | 230 games/s |
| easy vs easy | 300 | 118–133–49 | 634.6 | 4.05 | 106 games/s |

Three facts from that table drive the whole design below:

- **Ties are ~25% in mirror matches.** Raw win rate is the wrong primary metric. Use *score rate*
  (win = 1, tie = 0.5, loss = 0), exactly as chess engine testing does.
- **Weak play changes the game's shape, not just its outcome** — 6× longer games, 18× more void
  books. Style metrics must include game-shape diagnostics or you will misread the results.
- **~100–230 games/s single-threaded** makes a high-precision full matrix a ~10-minute job, not an
  overnight one. Budget generously (see §5.4).

---

## 1. Framing: the question may not have the answer you expect

### 1.1 The Stockfish analogy holds for the engineering, breaks for the evaluation

What transfers from Stockfish: a pure deterministic engine, a policy separated from a knowledge
layer, and above all **[SPRT-based A/B testing](https://official-stockfish.github.io/docs/fishtest-wiki/Fishtest-Mathematics.html)** —
Stockfish's [fishtest](https://github.com/official-stockfish/fishtest/wiki/Fishtest-mathematics) accepts or rejects
every patch with a sequential likelihood-ratio test rather than a fixed game count. Adopt that for
style *tuning* (§5.5).

What does **not** transfer:

| Chess | Canadian Fish |
|---|---|
| 2 players | 6 players, **2 teams of 3** |
| Perfect information | Imperfect — hands hidden, inference is the game |
| No partners | Partners who must **coordinate without talking** |
| Skill is near-transitive | Style interactions are plausibly **cyclic** |

The partner axis is the big one. A "style" in a team game is partly a **convention** — what your ask
tells your teammate. That makes this closer to Hanabi than to chess, and the Hanabi literature is
blunt about the consequence: agents trained in self-play form
["highly specialized conventions that do not carry over to novel partners"](https://proceedings.mlr.press/v119/hu20a/hu20a.pdf).
A style that wins your tournament may be a style your teammates learned to read — not a style that
is good.

### 1.2 "Best style" is a meta-game question, and meta-games are often intransitive

Your styles form a **meta-game**: strategies are styles, payoffs are head-to-head score rates.
Meta-games routinely contain rock-paper-scissors cycles, and when they do, **Elo and win-rate
rankings are actively misleading** — they
["bake in the assumption that relative skill is transitive"](https://arxiv.org/pdf/1806.02643) (Balduzzi et al.,
*Re-evaluating Evaluation*, NeurIPS 2018). Their fix, **Nash averaging**, plays a meta-game on the
evaluation data itself and returns a maximum-entropy Nash equilibrium — a *distribution* over
styles, automatically robust to you adding five near-duplicate variants of your favourite bot.
The complementary tool is **[α-Rank](https://www.nature.com/articles/s41598-019-45619-9)**
(Omidshafiei et al., *Scientific Reports* 2019), which ranks by evolutionary dynamics, handles
asymmetric and >2-player games, and runs in polynomial time.

So the honest form of your question is:

> **Decompose the style payoff matrix into a transitive part and a cyclic part.** If it is
> overwhelmingly transitive, publish a ranking and name a winner. If it has real cyclic energy,
> the answer is "no single best style exists — here is the counter-structure and the equilibrium
> mixture," which is a *more* interesting result and is exactly the site feature you already want.

**This reframes your "how styles counter each other" page from a nice-to-have into the primary
finding.** Plan for both outcomes.

### 1.3 The confound you must design out: style ≠ skill

The existing axis (`easy`/`medium`/`hard`) is **skill** — inference depth, memory window, error
rate. Your new axis is **style**. If an "aggressive" bot loses, you must be able to say whether
aggression is bad or whether you merely wrote a weaker bot.

**Rule: every style shares one identical, full-strength knowledge engine.** Styles differ *only* in
the policy layer above `buildKnowledge()`. This is cheap here because the codebase already draws
that line — `knowledge.ts` (inference) and `decide.ts` (policy) are separate modules, and the
`hard` tier is already just a set of thresholds over the same inference.

Corollary: report a **skill ablation** — every style also run at `medium`-strength inference. If
style rankings flip when inference weakens, the effect is an interaction, not a style property.

---

## 2. Where style actually lives — mechanics → knobs

Styles should not be vibes. Each one must be a parameter vector justified by a specific rule. From
[RULES.md](RULES.md):

| Rule | Mechanic | Style axis it creates |
|---|---|---|
| Row 9 / 10 | Hit keeps the turn; miss hands the turn **to the player you asked** | **Tempo / risk.** A speculative ask that misses actively promotes an opponent. |
| Row 6 | Asker must hold ≥ 1 card **of the asked book** | **Hoarding.** Holding a card is a *license to ask into that book*. Spending it revokes the license. |
| Row 7 | May not ask for a card you hold | Bounds the ask space; makes near-complete books self-limiting |
| Row 17 | After any claim, **the claimant's turn continues** | **Claim timing is free in tempo** — so claim style is purely about void risk vs. the risk a teammate never gets to bank it. |
| Rows 14 / 15 | Opponent holds one → *they* score; own-team misassignment → **void** | **Asymmetric downside.** Aggressive claiming risks a void (0 for everyone) or a gift (−1 net). |
| Row 18 | Public log of every ask and result | **Every ask leaks.** Ask frequency into a book is an information cost paid to opponents. |
| Row 19 | Out of cards → you drop out, can't ask or be asked | **Hand-size management.** Emptying is a real strategic event. |
| Row 21 | Whole team out → the other team must claim *everything* | Hoarding shifts who gets forced into the endgame gauntlet |

### 2.1 The concrete decision surface today

The policy layer's entire tunable surface, as shipped:

```
score = 70·pHit + 18·progress + 12·narrowing (+20 if the hit is certain)   [knowledge.ts]
evClaim threshold      = 0.80 normally, 0.50 once the position is dead     [decide.ts]
LEAK_EPSILON           = 0.5      (info-protection tiebreak width)
leaky(book)            = team certainly accounts for >= 4 of 6 cards
signalling ask         = on, when every legal ask is a known miss
pass/designate target  = teammate/opponent with the most cards
miss-target tiebreak   = opponent with the fewest cards
```

Those seven lines *are* the style space. Every style below is a setting of them.

### 2.2 The "hold one card" style is mechanically real

You named a style that "holds onto a single card until the rest are revealed." That is not a
gimmick — Row 6 gives it a genuine engine:

- Holding ≥1 card of book *B* is the **only** way to be allowed to ask into *B*.
- Claiming *B* removes your cards from it; if that empties your hand you must pass the turn away
  (Row 20), and if it empties your whole team the opponents inherit a forced claim-everything
  endgame (Row 21).
- Being out of cards (Row 19) means you can't be asked — you leak nothing — but you also can't ask.

So a **Hoarder** is playing for *optionality*: retain one card in as many books as possible, stay
in the game, delay claims, and keep the right to ask everywhere. Its natural weakness is equally
clear — delayed claims are books not yet banked, and Row 15 means a stalled position eventually
forces guesses. That tension is a real, testable hypothesis, not a coin flip.

**Caveat to encode explicitly:** you do *not* fully control your hand. Hits are compulsory — an
opponent can strip your last card of a book. Hoarding is therefore a policy over *claims* and *ask
targeting*, not a guarantee.

---

## 3. The style roster

Eight styles. Each is a `StyleParams` vector over §2.1; all share full-strength inference.

```ts
interface StyleParams {
  id: string; label: string

  // --- ask scoring (weights into rankAsksWith) ---
  wHit: number             // baseline 70   — greed for the card
  wProgress: number        // baseline 18   — bias toward nearly-secured books
  wNarrow: number          // baseline 12   — bias toward information gain
  certaintyBonus: number   // baseline 20   — keep >= 20 so certain hits stay dominant
  minHitP: number          // 0 = consider every legal ask; >0 = refuse long shots
  gambleBonus: number      // extra score for an ask that would COMPLETE a book

  // --- claim policy ---
  claimThreshold: number        // baseline 0.80 (hard)
  claimThresholdStalled: number // baseline 0.50
  claimMaxUncertain: number     // baseline 1 guessed card
  claimOnlyWhenCertain: boolean // conservative extreme (p == 1.0 only)
  claimOnlyOwnHand: boolean     // passive extreme (never claim on a teammate)

  // --- information policy ---
  leakEpsilon: number      // baseline 0.5 — width of the info-protection tiebreak
  leakThreshold: number    // baseline 4   — "nearly secured" cutoff
  signalling: boolean      // baseline true (hard) — spend dead turns on signal

  // --- tempo / targeting ---
  missTarget: 'fewest' | 'most' | 'random'   // who to promote on a likely miss
  passTarget: 'most' | 'fewest'              // Row 20 pass choice

  // --- hoarding ---
  hoardBooks: number       // 0 = off; N = keep >=1 card in N books before claiming
  minHandSize: number      // 0 = off; refuse claims that would drop own hand below N
}
```

| # | Style | Thesis | Key settings |
|---|---|---|---|
| 1 | **Balanced** (control) | Reproduce the shipped `hard` tier exactly | baseline values verbatim |
| 2 | **Blitz** (aggressive) | Tempo and books now; information is cheap | `wHit 90, wProgress 30, claimThreshold 0.55, leakEpsilon 0, signalling false, missTarget 'most'` |
| 3 | **Punter** (gambler) | Chase the completing card; accept the void risk | `gambleBonus +25, minHitP 0, claimThreshold 0.40, claimMaxUncertain 2` |
| 4 | **Banker** (conservative) | Never void a book; bank only certainties | `claimOnlyWhenCertain true, wHit 80, minHitP 0.25, missTarget 'fewest'` |
| 5 | **Turtle** (passive) | Minimum risk; claim only what's in hand | `claimOnlyOwnHand true, minHitP 0.4, signalling false` |
| 6 | **Hoarder** (your named style) | Optionality — keep ask-licenses, stay alive | `hoardBooks 3, minHandSize 2, claimThreshold 0.95` |
| 7 | **Scout** (info-maximizer) | Deduce first, collect later | `wNarrow 40, wHit 55, claimOnlyWhenCertain true` |
| 8 | **Ghost** (secretive) | Deny opponents the read | `leakEpsilon 6, leakThreshold 3, signalling false` |

Two design notes:

- **Balanced is a regression test, not just an entrant.** Its results must match the existing
  6,000-game table bit-for-bit, proving the refactor changed nothing.
- Keep `certaintyBonus ≥ 20` in every style. Below that, a style can rank an uncertain ask above a
  *certain hit*, which is not "a style" — it's a bug that will dominate your results.

---

## 4. Metrics

### 4.1 Primary outcome (per game, from one team's perspective)

| Metric | Definition | Why |
|---|---|---|
| **Score rate** `SR` | mean of (win 1 / tie 0.5 / loss 0) | **Primary.** ~25% ties measured — win rate discards a quarter of the signal |
| Book margin | `books_us − books_them` | Effect size, not just direction; sensitive where SR saturates |
| Win / tie / loss counts | raw | Reporting transparency |

### 4.2 Secondary — *why* a style won or lost

| Metric | Definition |
|---|---|
| Books scored / conceded / voided | Splits Row 13 / 14 / 15 outcomes — separates "gave it away" from "burned it" |
| **Claim precision** | correct claims ÷ claims attempted |
| **Claim yield** | books scored ÷ claims attempted (precision weighted by opportunity) |
| **Ask hit rate** | hits ÷ asks — the tempo engine |
| **Turn retention** | mean consecutive asks per turn gained |
| **Leak index** | asks made into books your team already holds ≥ `leakThreshold` of, ÷ total asks |
| **Hoard index** | mean number of distinct books in which the seat holds ≥ 1 card (measures whether Hoarder actually hoards) |
| Dropout turn | move index at which each seat runs out (Row 19) |
| Endgame incidence | fraction of games reaching phase `endgame` (Row 21) |

### 4.3 Health / validity guards (must be ~0, else the run is void)

`illegalActions` · `cappedGames` (hit the 5000-step cap) · `invariantViolations` · `avgMoves`
(watch for passive-style deadlock — easy-vs-easy already runs 6× long) · `distinctSeeds`.

### 4.4 Meta-level (the actual answer to "is one style best?")

| Metric | Definition | Reads as |
|---|---|---|
| **Payoff matrix** `P[i][j]` | score rate of style *i* vs *j*, duplicate-averaged so `P[i][j] + P[j][i] = 1` | The raw result |
| **Mean score** | `mean_j P[i][j]` | Naive ranking — only valid if transitive |
| **Maximin** | `min_j P[i][j]` | Robustness: worst matchup. A style with maximin > 0.5 beats *everything* |
| **Cyclic energy** | Hodge/Schur split of `P` into transitive + cyclic parts ([Balduzzi et al.](https://arxiv.org/pdf/1806.02643)) | % of the matrix that is rock-paper-scissors |
| **3-cycle count** | triples with `A>B>C>A` at significance | Human-legible version of the above |
| **Nash average** | maxent Nash of the antisymmetric `P` | The equilibrium *mixture* of styles |
| **α-Rank** | evolutionary ranking ([Omidshafiei et al.](https://www.nature.com/articles/s41598-019-45619-9)) | Ranking that survives intransitivity |
| **Exploitability** `E(i)` | `max_θ SR(θ, i) − 0.5` over a best-response parameter search | How much a tuned counter-style beats it |

**Decision rule — declare a superior style only if all four hold:**

1. highest mean score, **and**
2. **maximin > 0.5** (it has no losing matchup), **and**
3. cyclic energy of the matrix is small (say < 15%), **and**
4. its exploitability `E(i)` is not materially worse than its rivals'.

If (2) or (3) fails, the correct published answer is *"no dominant style; here is the counter-graph
and the Nash mixture."* Write the site to render that outcome as a first-class result, not an error
state.

---

## 5. Experimental design

### 5.1 Duplicate (mirrored) deals — measured, adopt it

Standard practice in card-game AI evaluation: play the same deal from both sides so a lucky deal
cancels, exactly as [duplicate bridge](https://en.wikipedia.org/wiki/Duplicate_bridge) does. This is
the [common-random-numbers](https://pubsonline.informs.org/doi/10.1287/opre.39.4.583) estimator.

**Measured on this engine** (hard vs medium, 500 mirrored pairs = 1000 games):

| Design | Score estimate | SE | 95% CI |
|---|---|---|---|
| Duplicate (paired) | 0.5765 | **0.0113** | [0.554, 0.599] |
| Independent (flat) | 0.5765 | 0.0132 | [0.551, 0.602] |

**Variance ratio 1.36×** — i.e. duplicate pairing gets the same precision from 26% fewer games, for
essentially zero implementation cost (`newGame(seed, …)` already makes the deal a pure function of
the seed; you replay the same seed with the style assignment swapped). Take it.

Note it is *far* below poker's 30× from [AIVAT](https://arxiv.org/abs/1612.06915) — expected, since
all 48 cards are dealt and games run ~104 moves, so outcome is much less deal-dominated. Do not
budget for a bigger win here; AIVAT-style control variates are **not** worth building at this stage.

One trial = one seed played in **both** orientations, with the start seat held identical so the only
difference is which style sits on which team.

### 5.2 Controls

- **Seat rotation**: start seat `= i mod 6`, as the existing harness already does.
- **Shared seed set**: every cell uses the *same* seed list. Cross-cell comparisons then share deals
  too, not just within-cell orientations.
- **Determinism**: `medium`/`hard` policies are fully deterministic. All sample diversity comes from
  seeds — so never "run the same seed twice for more data"; it returns a byte-identical game. Assert
  `distinctSeeds == pairs`.
- **Config frozen**: all 10 rule toggles off. Every conclusion is conditional on the pinned rule set;
  say so on the site.

### 5.3 Team composition (the part that is genuinely new)

A team is **3 seats**, so styles need not be uniform. Two tiers:

- **Tier 1 — pure teams** (all 3 seats same style). 8 styles → C(8,2) = **28 cells**. This is the
  headline matrix.
- **Tier 2 — mixed teams**, screened. Full mixing is C(10,3) = 120 compositions → 7,140 cells, far
  too many. Instead: take the **top 4** styles by Tier-1 maximin, enumerate their 20 three-seat
  multisets, run that 20×20 grid (190 distinct cells). Hypothesis worth testing explicitly: *does a
  heterogeneous team (e.g. Scout + Banker + Blitz) beat any uniform team?* Complementary roles are
  plausible here — one seat gathering information while another banks it.

### 5.4 Sample sizes — budgeted from measured throughput

From §5.1, SE ≈ 0.0113 at 500 pairs, and SE ∝ 1/√pairs:

| Target SE | Pairs/cell | Games/cell | Detects (95%) |
|---|---|---|---|
| 0.011 | 500 | 1,000 | ~3 pt score-rate gap |
| 0.008 | 1,000 | 2,000 | ~2 pt |
| **0.005** | **2,600** | **5,200** | **~1.4 pt** |

**Tier 1 budget:** 28 cells × 5,200 = **145,600 games** ≈ 12 min single-threaded at 200 games/s,
~2 min across 8 worker threads.
**Tier 2 budget:** 190 cells × 5,200 = **988,000 games** ≈ 82 min single-threaded, ~10 min parallel.

Both are comfortably affordable. Run Tier 1 at SE 0.005 from the start; there is no reason to
under-power it.

### 5.5 SPRT for *tuning*, fixed-N for *reporting*

Two different jobs, two different tools.

- **Tuning a style** (does `claimThreshold 0.55` beat `0.60`?): use
  [SPRT](https://official-stockfish.github.io/docs/fishtest-wiki/Fishtest-Mathematics.html) with
  H0/H1 on the score difference and α = β = 0.05. It stops as soon as the evidence is conclusive —
  typically far fewer games than fixed-N, which matters when you have dozens of knobs.
- **The published matrix**: fixed-N at the §5.4 budget. Sequential stopping biases effect-size
  estimates, and the matrix's job is to *estimate* payoffs, not just accept/reject.

### 5.6 Confidence intervals and multiplicity

- CIs on paired score rate: normal-approximation on the paired means (n ≥ 500 makes this safe), with
  a **bootstrap over pairs** as the cross-check for the diagnostic ratios (claim precision etc.,
  which are not simple means).
- 28 simultaneous cells → control the false-discovery rate with **Benjamini–Hochberg** before
  labelling any cell "significant" on the counter-graph. Without it, ~1.4 of 28 cells will look
  significant by chance at α = 0.05.

### 5.7 Exploitability search

For each style *i*, run a **best-response search** over `StyleParams` (coordinate descent or CMA-ES,
~200 candidate vectors × 1,000 games each, SPRT-gated) maximising score against *i*. Report
`E(i) = SR(best_response, i) − 0.5`.

This is the sharpest form of your question. The
[Nash-vs-exploitation tradeoff](https://arxiv.org/pdf/2307.12338) is well studied: a style that beats
today's roster may be *maximally* exploitable by a style you haven't written. A style with a high
maximin **and** low exploitability is genuinely superior. A style that merely tops the table is
just the current champion of an eight-bot population.

### 5.8 Guard against overfitting to your own population

Keep a **holdout roster**: 2–3 styles (plus the `easy`/`medium` tiers) excluded from all tuning and
used only for final validation. Your friend's bot is the true external validity check — an
independently written opponent that cannot have been fitted to.

---

## 6. Analysis pipeline

Deterministic, scripted, versioned — one command produces the artifact the site reads.

```
1. run      → per-game records (JSONL)         scripts/style-sim.ts
2. aggregate→ per-cell metrics + CIs           scripts/style-aggregate.ts
3. analyze  → matrix, transitivity, Nash,
              alpha-Rank, exploitability       scripts/style-analyze.ts
4. emit     → docs/style-results.json          (the site's only input)
```

Step 3 in order:

1. Build antisymmetric `P` (duplicate-averaged).
2. **Transitivity test** — Hodge/Schur decomposition; report `cyclicEnergy` ∈ [0,1] and enumerate
   all significant 3-cycles.
3. **If transitive** (`cyclicEnergy` < 0.15): fit Bradley–Terry / Elo, publish the ranking with CIs.
4. **If cyclic**: publish Nash averaging weights + α-Rank ordering, and make the counter-graph the
   headline. Do not publish a single winner.
5. Always publish maximin and exploitability alongside — those are the two numbers a reader needs to
   tell "champion of this roster" from "actually strong."

---

## 7. Simulation website — functionality and data contract

The site is a **pure reader** of one committed JSON artifact. Simulations never run in the browser
at the reporting scale; a Web Worker may run a few hundred live games for the interactive demo
(engine is pure TS and already does ~15–20k moves/s).

### 7.1 Data contract — `docs/style-results.json`

```jsonc
{
  "meta": {
    "schemaVersion": 1,
    "generatedAt": "ISO-8601",
    "engineCommit": "sha",            // provenance: which engine produced this
    "rulesHash": "sha of RULES.md",   // invalidate results if rules move
    "config": { "toggles": { /* all false */ } },
    "gamesTotal": 145600,
    "seedSet": { "count": 2600, "prefix": "style-v1" },
    "wallMs": 0,
    "health": { "illegalActions": 0, "cappedGames": 0, "invariantViolations": 0 }
  },

  "styles": [
    { "id": "hoarder", "label": "Hoarder", "family": "passive",
      "thesis": "one-line description",
      "params": { /* StyleParams */ },
      "rationale": "RULES row 6 — holding a card is the license to ask into that book" }
  ],

  "matrix": [
    { "a": "blitz", "b": "banker",
      "pairs": 2600, "games": 5200,
      "aScore": 0.5412, "se": 0.0049, "ci95": [0.5316, 0.5508],
      "aWins": 2411, "bWins": 1998, "ties": 791,
      "bookMargin": 0.31,
      "significant": true, "qValue": 0.003,      // BH-adjusted
      "metrics": {
        "a": { "askHitRate": 0.41, "claimPrecision": 0.88, "claimYield": 0.71,
               "voidRate": 0.19, "concedeRate": 0.08, "leakIndex": 0.22,
               "hoardIndex": 3.9, "turnRetention": 1.7, "avgMoves": 104.1 },
        "b": { /* same shape */ }
      }
    }
  ],

  "ranking": {
    "meanScore":   [ { "style": "...", "value": 0.0, "ci95": [0,0] } ],
    "maximin":     [ { "style": "...", "value": 0.0, "worstVs": "..." } ],
    "bradleyTerry":[ { "style": "...", "elo": 0, "ci95": [0,0] } ],
    "nash":        [ { "style": "...", "weight": 0.0 } ],
    "alphaRank":   [ { "style": "...", "score": 0.0, "rank": 1 } ],
    "cyclicEnergy": 0.07,
    "cycles": [ { "styles": ["blitz","banker","hoarder"], "minEdge": 0.53 } ],
    "verdict": "dominant" | "cyclic" | "inconclusive"
  },

  "exploitability": [
    { "style": "blitz", "bestResponseParams": {}, "score": 0.61, "gap": 0.11,
      "searchGames": 200000 }
  ],

  "teams": [ /* Tier-2 mixed-composition cells, same cell shape as `matrix` */ ],

  "crossplay": [
    { "us": "balanced", "them": "friend-v1", "mode": "team-vs-team" | "mixed-team",
      "pairs": 2600, "usScore": 0.0, "ci95": [0,0], "seedSet": "shared-2026-09" }
  ],

  "replays": [
    { "id": "blitz-vs-banker-void", "pairing": ["blitz","banker"],
      "seed": "style-v1-0042", "startSeat": 3,
      "caption": "Blitz claims at p=0.58 and voids LOW-S",
      "actions": [ /* GameAction[] — replay through reduce() */ ] }
  ]
}
```

Design points that matter functionally:

- **Replays store actions, not states.** The engine is deterministic, so `newGame(seed, cfg, start)`
  + the action list reconstructs everything. This is exactly what `/learn` already does — reuse that
  machinery. Keeps the artifact small.
- **`rulesHash` + `engineCommit`** make stale results detectable. The site should refuse to render
  (or clearly flag) results whose `rulesHash` differs from the shipped `RULES.md`.
- One artifact, one schema, versioned — the front-end pass can be built against this file alone.

### 7.2 Views (functional spec)

| View | Must show | Interaction |
|---|---|---|
| **Matrix** | N×N score rates, CI, sample size, significance after BH | Cell → drill-down; toggle metric (score / margin / hit rate / void rate) |
| **Ranking** | mean score, maximin, Bradley–Terry, Nash weights, α-Rank **side by side** | Sort; show where the rankings *disagree* — that disagreement is the finding |
| **Counter-graph** | Directed edge `i→j` where *i* beats *j* significantly; **cycles highlighted** | Filter by margin; isolate a style's counters and victims |
| **Head-to-head** | Full §4.2 diagnostic breakdown for one cell, both sides | Link to representative replays |
| **Style inspector** | `StyleParams` vector + rules rationale + its row in the matrix | Diff two styles' params |
| **Exploitability** | `E(i)` per style; the best-response vector found | Compare to maximin — the "is it actually strong?" view |
| **Teams** | Tier-2 mixed-composition grid | Filter to compositions containing a style |
| **Cross-play** | Your bot vs friend's bot; and **mixed-author teams** | Self-play vs cross-play score gap (see §8.3) |
| **Live demo** | A few hundred games in a Web Worker, any two styles | Seed input; step through one replayed game |

The **verdict banner** is the single most important element: it must render `"dominant"`,
`"cyclic"`, or `"inconclusive"` honestly, with the four §4.4 criteria shown as pass/fail. Resist
the urge to always crown a winner.

---

## 8. Playing your friend's bot

### 8.1 Protocol — "Fish Bot Protocol v1" (JSON-lines over stdio)

Model it on UCI: line-delimited JSON on stdin/stdout, language-agnostic, no network, no auth.

```jsonc
// host → bot, once
{"type":"hello","protocol":"fish-1","rulesHash":"<sha>","config":{...}}
// bot → host
{"type":"id","engine":"friendbot","version":"1.2","author":"...","protocol":"fish-1"}

// host → bot, per game
{"type":"newgame","gameId":"g1","seat":3,"startSeat":0,"seed":"shared-2026-09-0042"}

// host → bot, per move
{"type":"decide","gameId":"g1","view":<SeatView>,"seed":1234567,"deadlineMs":250}
// bot → host
{"type":"action","gameId":"g1","action":<GameAction>}

{"type":"gameover","gameId":"g1","score":[4,3],"winner":0}
{"type":"quit"}
```

Why this works out of the box here:

- **`SeatView` is already the exact public-information contract** — `PublicState & {seat, hand}` —
  and [tests/bots/public-view.test.ts](tests/bots/public-view.test.ts) already proves bots cannot
  reach any other hand. Cheating is structurally impossible, not policed.
- **`GameAction` is already a 4-variant union** validated by `reduce()`. The host is the referee;
  a foreign bot cannot make an illegal move stick.
- **`seed` is supplied by the host**, so a bot may be stochastic yet the match stays reproducible.

Host obligations to pin down before the first match:

1. **Illegal action policy** — count and substitute a legal fallback (as the current harness does),
   *or* forfeit the game. Pick one and write it down; they give different tournament incentives.
2. **Time control** — `deadlineMs` per decision plus a per-game budget. Timeout = same policy as
   illegal.
3. **Shared seed list** published *before* the match, so both sides can run it independently and
   reconcile results.
4. **`rulesHash` handshake** — refuse to play if the rule sets differ. This will save an argument.

Deliverable: `scripts/foreign-bot.ts` — an adapter exposing a subprocess as a drop-in for
`decide(view, style, seed)`, so a foreign bot enters the *existing* harness as just another style
and inherits every metric in §4 for free.

### 8.2 Match format

Duplicate pairs on the shared seed list, start seat rotating, both orientations — identical to §5.1.
2,600 pairs gives SE ≈ 0.005, which is decisive for any real skill gap and takes minutes.

### 8.3 Cross-play is the more interesting experiment

Do not only run *your team vs their team*. Also run **mixed-author teams** (2 of yours + 1 of
theirs, and the reverse). The Hanabi literature predicts the outcome and it is worth measuring:
conventions learned in self-play
[do not transfer to novel partners](https://proceedings.mlr.press/v119/hu20a/hu20a.pdf).

Report the **self-play/cross-play gap**: `SR(self-play team) − SR(mixed-author team)`. A large gap
means your bot's strength is partly convention lock-in with itself rather than general skill — which
is a genuinely publishable finding for your site, and a direct measure of whether your signalling
conventions (`signallingAsk`, the `leaky` heuristic) encode real strategy or private code.

---

## 9. Phase plan and gates

Matching the repo's existing gate convention.

| Phase | Work | Gate |
|---|---|---|
| **S0** | Extract `StyleParams`; refactor `decide.ts` to policy-with-params; keep `easy`/`medium`/`hard` as presets | **192/192 tests green, typecheck 0, lint 0**, and `hard` preset reproduces the shipped 6,000-game table **bit-for-bit** |
| **S1** | Implement the 8 styles + per-style unit tests (each style provably differs on a constructed position) | Every style legal-by-construction over a 2,000-game fuzz; 0 illegal actions, 0 capped games |
| **S2** | Sim runner v2: duplicate pairing, worker-thread pool, JSONL per-game records, all §4 metrics | Tier-1 matrix at SE ≤ 0.005; health counters all 0; run is reproducible from the seed set |
| **S3** | Analysis: CIs, BH correction, transitivity/Hodge, Nash averaging, α-Rank | `verdict` computed; cycles enumerated; results committed as `docs/style-results.json` |
| **S4** | Exploitability search (best-response per style) | `E(i)` for all 8; holdout roster validation |
| **S5** | Tier-2 mixed-team screen (top-4 → 20 compositions) | 190-cell grid at SE ≤ 0.008 |
| **S6** | Site data views against the artifact (functionality only) | Every §7.2 view renders from the JSON; verdict banner honest in all three states |
| **S7** | Fish Bot Protocol v1 + `foreign-bot.ts` adapter; match vs friend's bot | Handshake + illegal/timeout policy tested against a deliberately broken stub bot; cross-play gap reported |

S0 is the only phase that touches shipped code. Do it first and prove it changed nothing.

---

## 10. Threats to validity — read before believing any result

1. **Style-as-handicap.** A "style" that is really a weaker bot. *Mitigation:* identical knowledge
   engine (§1.3) + the `medium`-inference ablation.
2. **Self-play convention lock-in.** Styles evaluated only against your own roster. *Mitigation:*
   holdout roster + friend's bot + the cross-play gap (§8.3).
3. **Intransitivity misread as noise.** *Mitigation:* explicit cyclic-energy metric; never publish a
   single winner when `verdict = "cyclic"`.
4. **Tie-blindness.** 25% ties measured; win rate would discard them. *Mitigation:* score rate, and
   always report the tie count.
5. **Passive-style deadlock.** easy-vs-easy already runs 634 moves and 4.05 voids/game. A `Turtle`
   or `Hoarder` mirror could stall far worse, and `isDeepStalled()`'s thresholds (36/120/400) were
   tuned for the current tiers. *Mitigation:* `cappedGames` and `avgMoves` are hard gates in S1; if
   they trip, tune the stall-breaker **once, globally**, never per-style — a per-style stall rule is
   a hidden style parameter that will contaminate the comparison.
6. **Determinism mistaken for sampling.** Re-running a seed yields an identical game. *Mitigation:*
   assert `distinctSeeds == pairs`.
7. **Multiplicity.** 28 cells at α = 0.05 ⇒ ~1.4 false "significant" edges. *Mitigation:* BH.
8. **Conditional on the pinned rules.** All toggles off; conclusions do not transfer to a table
   playing `claimAnyTurn` or `highBooksDouble`. *Mitigation:* `rulesHash` in the artifact, stated on
   the site.

---

## 11. Deliberately out of scope (for now)

- **Search-based bots (ISMCTS / PIMC).** [ISMCTS](https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf)
  beats knowledge-based AI in Dou Di Zhu and Spades and would very likely beat all eight styles
  here. But a search bot has no *style* — it has a search budget. It answers a different question,
  and it would make the style comparison harder to interpret, not easier. Revisit as a **strength
  ceiling reference** ("how far is the best style from a searcher?") after S4.
- **Learned/RL bots.** The one public Literature RL project
  ([neelsomani/literature](https://github.com/neelsomani/literature), Q-learning) reports no win
  rates and is 4-player only. Nothing to reuse.
- **AIVAT-style control variates.** §5.1 measured only a 1.36× gain available from pairing here;
  the sophisticated version is not worth its complexity at this scale.

---

## 12. Sources

**Evaluation methodology**
- [Fishtest Mathematics — Stockfish SPRT/GSPRT](https://official-stockfish.github.io/docs/fishtest-wiki/Fishtest-Mathematics.html) · [fishtest wiki](https://github.com/official-stockfish/fishtest/wiki/Fishtest-mathematics) · [SPRT (chessprogramming)](https://chessprogramming.org/Sequential_Probability_Ratio_Test)
- Balduzzi et al., [*Re-evaluating Evaluation*](https://arxiv.org/pdf/1806.02643) (NeurIPS 2018) — Nash averaging, mElo, Elo's transitivity assumption
- Omidshafiei et al., [*α-Rank: Multi-Agent Evaluation by Evolution*](https://www.nature.com/articles/s41598-019-45619-9) (Sci. Rep. 2019)
- [Empirical Game-Theoretic Analysis: A Survey](https://arxiv.org/pdf/2403.04018)
- Burch et al., [*AIVAT*](https://arxiv.org/abs/1612.06915) (AAAI 2018) — variance reduction, 85% σ reduction in poker
- [Duplicate bridge](https://en.wikipedia.org/wiki/Duplicate_bridge) · [Common random numbers in multiple comparisons](https://pubsonline.informs.org/doi/10.1287/opre.39.4.583)

**Imperfect-information & team play**
- Cowling, Powley, Whitehouse, [*Information Set Monte Carlo Tree Search*](https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf)
- Hu et al., [*"Other-Play" for Zero-Shot Coordination*](https://proceedings.mlr.press/v119/hu20a/hu20a.pdf) (ICML 2020) — self-play conventions don't transfer
- [Safe Opponent Exploitation for ε-Equilibrium Strategies](https://arxiv.org/pdf/2307.12338) — the Nash-vs-exploitation tradeoff

**Game**
- [pagat.com — Literature](https://www.pagat.com/quartet/literature.html) · [Wikipedia — Literature](https://en.wikipedia.org/wiki/Literature_(card_game)) · full strategy source list in [src/learn/strategy-content.ts](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/learn/strategy-content.ts)
- [neelsomani/literature](https://github.com/neelsomani/literature) — Q-learning Literature bot (4-player, no reported win rates)
