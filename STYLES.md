# STYLES.md — the play-style roster under `us54`

**Supersedes [BOT_LAB.md](BOT_LAB.md) §3.** The methodology in BOT_LAB (duplicate deals, score rate,
transitivity/Nash/α-Rank, SPRT tuning, exploitability search, holdout rosters) is rule-independent
and stands unchanged. The *roster* is not: [RULES_US54.md](RULES_US54.md) changes the risk structure
the styles are defined against.

---

## 1. What `us54` changed about style

Three of BOT_LAB §3's assumptions no longer hold.

### 1.1 A bad declare now **gifts**, it no longer **burns**

Under the 48-card default, misassigning a set your team holds produced a **void** — 0 for everyone.
Under [RULES_US54.md](RULES_US54.md) row 14 it awards the set to the **opponents**.

The expected-value arithmetic changes sign. A speculative declare used to cost you the set
(−1 relative to holding it); now it costs the set *and* hands the opponent a point (−1 for you, +1
for them — a **2-point swing** in a race to 5). Every `claimThreshold` inherited from the 48-card
tuning is therefore **too loose**, and the aggressive theses in BOT_LAB §3 describe a cheaper gamble
than they will actually face. Styles must be re-tuned from scratch under `us54`, not ported.

Metric consequence: **`voidRate` → `concedeRate`**. Different event, not a rename.

### 1.2 Declaring is no longer a turn action

Declares happen in the **declare window** ([RULES_US54.md §3](RULES_US54.md)) — any seat, any time,
priority running outward from the turn-holder. Two new strategic dimensions follow:

- **Racing.** A set you can prove is a set a *teammate* may also be able to prove. Waiting risks
  nothing from opponents (they cannot declare for your team) but risks a teammate declaring it
  *wrongly* first. Conversely, waiting one more ask may resolve your last uncertain card.
- **Priority.** Being nearer the turn-holder in window order is a real, if small, positional edge.

### 1.3 Declaring for sets you hold **no** cards of

Row 15 always permitted this, but it was near-worthless when declares cost a turn action. Out-of-turn
declaring makes it a live strategy — and it is the one the project owner specifically called out:

> *"They may also declare for their teammates even if they do not hold a card from the half-suit,
> which gives importance to the players who choose to memorize half-suits they do not own."*

This is a genuinely new axis. A bot that only reasons about sets it holds cards in is leaving points
on the table. It gets its own style (**Archivist**, §3) and its own metric (**foreign-declare rate**,
§4).

### 1.4 The clinch is a race, not an accumulation

At 4 sets, a 5th **ends the game**. Denying the opponent's 5th can outrank banking your own 3rd, and
a declare that would give the opponent their 5th is catastrophic in a way no 48-card declare ever
was. This is a *modifier on every style*, not a style of its own — so it is a parameter
(`clinchAggression`), and every style is tuned with it live.

---

## 2. `StyleParams`

```ts
interface StyleParams {
  id: string
  label: string
  family: 'control' | 'aggressive' | 'conservative' | 'passive' | 'information' | 'optionality'
  thesis: string

  // --- ask scoring (weights into the ranked-ask score) ---
  wHit: number              // baseline 70  — greed for the card
  wProgress: number         // baseline 18  — bias toward nearly-secured sets
  wNarrow: number           // baseline 12  — bias toward information gain
  certaintyBonus: number    // baseline 20  — MUST stay >= 20 (see note below)
  minHitP: number           // 0 = consider every legal ask; >0 = refuse long shots
  gambleBonus: number       // extra score for an ask that would COMPLETE a set

  // --- declare policy ---
  declareThreshold: number       // confidence required to declare
  declareMaxUncertain: number    // guessed cards tolerated
  declareOnlyWhenCertain: boolean
  declareOnlyOwnHand: boolean    // passive extreme

  // --- NEW under us54: the declare window ---
  declareEagerness: number       // 0..1 — how early in the window to fire vs. wait for more info
  foreignDeclare: boolean        // will it declare sets it holds NO cards of?
  foreignDeclareThreshold: number // separate, usually higher, bar for those

  // --- NEW under us54: the clinch ---
  clinchAggression: number       // 0..1 — at 4 sets, how much to prefer the closing declare
  denialWeight: number           // 0..1 — weight on denying the opponent's 5th

  // --- information policy ---
  leakEpsilon: number       // baseline 0.5 — width of the info-protection tiebreak
  leakThreshold: number     // baseline 4   — "nearly secured" cutoff
  signalling: boolean

  // --- tempo / targeting ---
  missTarget: 'fewest' | 'most' | 'random'
  passTarget: 'most' | 'fewest'

  // --- hoarding ---
  hoardBooks: number        // keep >=1 card in N sets before declaring
  minHandSize: number       // refuse declares that drop own hand below N

  // --- the contained-book turn-pass (CONTAINMENT.md; §6.3) ---
  containedPass: number     // 0 = off; appetite = expected uses of the licence before banking
}
```

**The two hoard knobs gate *every* declare the style is free to refuse** — the speculative one, the
certain one, and the one wholly in hand — and none it is not (a `MUST_DECLARE` window,
[RULES_US54.md §3.2](RULES_US54.md); a proven-dead board; the `pagat48` endgame). They were
speculative-only until the audit in §3.1 measured that this made them, and the whole Hoarder vector,
completely inert. `hoardBooks` counts distinct *ask-licences* in the hand that would remain, so a set
the seat would hold all six of is not counted: row 6 grants the licence but row 7 takes every ask
back. A declare of a set the seat holds no card of spends nothing and is never gated.

**`certaintyBonus >= 20` in every style.** Below that a style can rank an uncertain ask above a
*certain hit* — that is not a style, it is a bug that will dominate the results.

**Every style shares one identical, full-strength inference engine** (BOT_LAB §1.3). Styles differ
*only* in the policy layer above `buildKnowledge()`. Otherwise "aggressive loses" may just mean "the
aggressive bot was written worse."

---

## 3. The roster — 9 styles

Nine is deliberate: it is exactly the diagram-design node budget for the counter-graph
([SITE_SPEC.md §3.2](SITE_SPEC.md)), so the headline diagram fits without splitting.

> **The `declareThreshold` numbers below are 48-card *appetites*, not the values the roster
> ships.** Each is mapped through `t_us54 = (1 + t_pagat48)/2` before it reaches
> [roster.ts](lib/engine/bots/roster.ts), which records the mapping in full — Blitz `0.70 → 0.85`,
> Punter `0.55 → 0.775`, Hoarder `0.95 → 0.975`. Read as shipped values these would contradict
> [§6.1](#61-the-declare-threshold-axis-is-inert-across-the-rosters-range), which reports that every
> style sits at 0.775 or above and that the axis is therefore inert; read as appetites they are
> exactly what §6.1 measured.

| # | Style | Family | Thesis | Defining settings (§3 appetites — see the note above) |
|---|---|---|---|---|
| 1 | **Balanced** | control | The tuned `us54` baseline every other style is read against | baseline, `clinchAggression 0.5`, `containedPass 1` (the roster default — see §6.3.3) |
| 2 | **Blitz** | aggressive | Tempo and sets now; information is cheap | `wHit 90, wProgress 30, declareThreshold 0.70, declareEagerness 0.9, leakEpsilon 0, signalling false, missTarget 'most'` |
| 3 | **Punter** | aggressive | Chase the completing card; accept the gift risk | `gambleBonus +25, minHitP 0, declareThreshold 0.55, declareMaxUncertain 2` |
| 4 | **Banker** | conservative | Never gift a set; bank only certainties | `declareOnlyWhenCertain, minHitP 0.25, declareEagerness 0.2, missTarget 'fewest'` |
| 5 | **Turtle** | passive | Minimum risk; declare only sets wholly in hand | `declareOnlyOwnHand, minHitP 0.4, signalling false, foreignDeclare false` |
| 6 | **Hoarder** | optionality | Keep ask-licences, stay alive, delay | `hoardBooks 3, minHandSize 2, declareThreshold 0.95, declareEagerness 0.1, containedPass 1.33` |
| 7 | **Scout** | information | Deduce first, collect later | `wNarrow 40, wHit 55, declareOnlyWhenCertain` |
| 8 | **Ghost** | information | Deny opponents the read | `leakEpsilon 6, leakThreshold 3, signalling false` |
| 9 | **Archivist** | information | **Track sets you hold nothing in, and declare them for your teammates** | `foreignDeclare true, foreignDeclareThreshold 0.90, wNarrow 30, declareEagerness 0.7` |

### 3.1 Notes on three of them

**Hoarder** is the owner's originally named style and it is mechanically grounded, not a gimmick:
[RULES_US54.md](RULES_US54.md) row 6 makes holding ≥1 card of a set the *only* licence to ask into
it, so declaring a set revokes your own asking rights there. Its countervailing weakness is that
delayed declares are sets not yet banked — and under a race to 5 that is a sharper cost than it was
in a play-to-the-end game. Caveat to encode: hits are compulsory, so an opponent can strip your last
card of a set. Hoarding is a policy over *declares* and *ask targeting*, never a guarantee.

The first implementation of that policy was **inert**, and the audit that found it is worth
recording in full, because two of its three findings are about the rule set rather than about the
style. See §3.1.1.

#### 3.1.1 The Hoarder inertness audit — measured, not argued

**The finding.** In the 36-cell × 200-pair pilot the Hoarder scored `meanScore 0.5484`, identical
to Balanced's `0.5484` in every digit; its whole row of the payoff matrix and its whole row of the
§4 diagnostics table were byte-identical to Balanced's, and `balanced-vs-hoarder` measured
`aScore 0.5000, se 0.0000`. α-Rank had to be given a tie tolerance to stop ranking the two on
floating-point noise. **A roster entry that cannot be distinguished from the control is not a
style**, so the identity was instrumented directly rather than inferred from the score.

**The instrument.** Real `us54` games were played on the lab's own seed set, and at *every* decision
point both vectors were handed the identical `SeatView` and the identical seed and their two
`GameAction`s compared:

| | decisions | different actions |
|---|---|---|
| Hoarder vs Balanced, **before** | 275,380 | **0** (0.0000%) |
| Hoarder vs Balanced, **after** | 289,560 | **9,315** (3.2169%) |

Zero. Not "rare" — never, in 400 games.

**Finding 1: the speculative-declare path is unreachable, for every style.** Attributing the zero
one parameter at a time (each of Hoarder's seven behavioural deltas applied to Balanced *alone*,
over 76,972 decisions) returned 0 for all seven. Sweeping `declareThreshold` on Balanced explains
why:

| `declareThreshold` | 0 | 0.5 | 0.55 | 0.6 | 0.65 | 0.7 | 0.75 | **0.775** | 0.8 | 0.9 | 1 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| decisions changed (of 51,420) | 892 | 842 | 414 | 274 | 140 | 18 | 18 | **0** | 0 | 0 | 0 |

**No speculative declare in this population ever reaches `p = 0.775`.** `declareThreshold: 1` and
`declareOnlyWhenCertain` and `declareMaxUncertain: 0` all change *nothing*, which is the same
statement three ways: `evClaim` never returns. That is not a Hoarder property. It is a property of
`us54` plus the shared inference engine, and it means **five of the seven knobs — `declareThreshold`,
`declareThresholdStalled`, `declareEagerness`, `clinchAggression`, `denialWeight` — are inert for
*any* style whose bar sits at or above 0.775**, because every one of them is consumed only inside
`evClaim`. The knobs are wired, swept and reported; they are not reached. The mechanism is §1.1's own
arithmetic doing its job: `t_us54 = (1 + t_pagat48)/2` pushes every inherited bar into a band the
count-consistency estimate `p` does not populate, because `evClaim` fires only on a set already
*certainly* the team's, and by then the holder is usually pinned outright and the set goes through
`certainClaim` instead. Blitz (0.85), Punter (0.775) and the three `declareOnlyWhenCertain` styles
are all affected; they stay distinguishable only through their **ask** knobs.

**Finding 2: the hoard gate was in the wrong place.** Both hoard knobs gated `evClaim` only, on the
argument that refusing *free points* to protect an ask-licence is a giveaway rather than optionality.
Given Finding 1 that argument had already conceded the entire style: the branch it guarded is never
taken. It is also the weaker reading of the owner's description — *"holds onto a single card until
the rest are revealed"* — because the card a declare actually spends is nearly always a card of a set
the seat is **certain** of. The gate now applies to every declare the style is free to refuse.

**The thresholds, derived.** Neither number is tuned; both are read off the rule set:

- **`minHandSize 2`.** The only hand-size discontinuity in `us54` is row 18 — at **0** cards you can
  no longer ask or be asked. So the elimination boundary is 1, and every larger N is a buffer against
  the fact that hits are compulsory (BOT_LAB §2.2): an opponent can strip a card you meant to keep.
  **2 is the smallest hand that survives one involuntary strip and still holds a licence**, which is
  exactly the value §3 already pins. (Measured, `minHandSize 1` and `2` are within noise of each
  other: 0.4850 ± 0.0079 and 0.4875 ± 0.0109 against Balanced. The derivation stands on the rule, not
  on that.)
- **`hoardBooks 3`** is the row-6 quantity itself and is *not* derivable from a discontinuity — it is
  the style's stated appetite, and it is the number §3 pins. What the audit did fix is what it
  counts: distinct sets in the hand that would remain, **excluding any set the seat would hold all
  six of**, because row 7 forbids asking for a card you hold and six-of-six is therefore a licence
  with no legal ask behind it. That is also why banking a set wholly in your own hand costs a Hoarder
  no licences at all, and is refused only when `minHandSize` bites.

**Finding 3: the thesis is expressible, and it is wrong.** The style is now distinguishable on every
axis §4 measures, and every diagnostic moves in the direction the thesis predicts — including the
benefit it exists to buy:

| per-style diagnostic (pooled over all 8 cells) | Balanced | Hoarder before | Hoarder after |
|---|---|---|---|
| `meanScore` | 0.5581 | **0.5484 (= Balanced)** | **0.4738** |
| `foreignDeclareRate` | 0.018 | 0.018 | **0.247** |
| `declareLatency` | 23.39 | 22.90 | **31.02** |
| `raceLosses` / game | 0.044 | 0.046 | **0.091** |
| declares / game | 4.01 | 3.98 | 3.67 |
| forced-declare share | 0.074 | 0.076 | **0.153** |
| `concedeRate` | 0.011 | 0.012 | 0.025 |
| dropout rate (row 18) | 0.539 | 0.521 | **0.443** |
| ask hit rate | 0.568 | 0.569 | 0.545 |

It stays in the asking game 15% longer, it waits 35% longer before banking, and — because the sets it
*does* declare are disproportionately the ones that cost it nothing — its foreign-declare rate rises
thirteen-fold, which is the owner's "memorize half-suits you do not own" strategy arriving as a
*side effect* of hoarding rather than as a separate style. And it pays for all of it:
`balanced-vs-hoarder` moves from **0.5000 ± 0.0000** to **0.5775 ± 0.0159** and the Hoarder's mean
score falls from 0.5484 (2nd of 9, tied with the control) to 0.4738 (7th of 9). Ablated on identical
deals against Balanced: `hoardBooks 3` alone reproduces the entire effect (0.4225 to the Hoarder,
identical to both knobs, because any declare leaving under 2 cards also leaves under 3 licences),
`minHandSize 2` alone costs 0.4875, and **with both knobs off the vector returns to 0.5000 ± 0.0000
against Balanced** — Finding 1, restated as an outcome.

So the honest verdict on the owner's style is not that it is vacuous. It is that **optionality is
real, purchasable, and priced above its worth under `us54`**, and the two rules that do the pricing
are the ones §1 already identified: row 14 makes the teammate who declares your hoarded set *wrongly*
cost you two points (`raceLosses` doubles), and rows 15/18 mean a cardless player can still declare,
so the elimination the hoard defends against is no longer elimination from the *game* — only from the
asking half of it. Delaying costs tempo in a race to 5 and buys an asset the rule set has already
devalued.

**What this does not license.** The gate is a *preference*, never a refusal: a Hoarder that can
afford the licences still banks a certain set (`roster.test.ts` pins the position where it does, and
it is the position that separates the Hoarder from the Turtle). And no style knob may refuse a
declare that RULES_US54.md §3.2 makes compulsory — the two `MUST_DECLARE` positions are checked
*before* every declare branch, so the S1 fuzz gate still reports 0 illegal actions and 0 capped games
across the mirror of every style.

**Open, and deliberately not closed here.** `hoardBooks 3` is the appetite §3 states, not a tuned
value; §5 says to re-tune every style against Balanced with SPRT, and that has not been done. The
result above is "the style as specified", not "the best Hoarder that exists".

**Archivist** is the style `us54` created. It spends inference budget on sets it can never ask into,
purely to declare them for teammates. Hypothesis worth stating before the data lands: it should be
*weak in mirror matches* (three Archivists over-invest in foreign tracking and under-collect) but
*strong as a single seat on a mixed team* — which makes it the best argument for the Tier-2
mixed-composition experiment in BOT_LAB §5.3.

**Turtle** is the deadlock risk. Under `pagat48`, easy-vs-easy already ran 634 moves and 4.05
voids/game. A Turtle mirror declares almost nothing and could stall badly. `cappedGames` and
`avgMoves` are hard gates. **If the stall-breaker needs tuning, tune it once, globally — never
per-style.** A per-style stall rule is a hidden style parameter that contaminates the whole
comparison.

---

## 4. Metrics — the `us54` delta

BOT_LAB §4 stands, with these changes:

| Change | Reason |
|---|---|
| `voidRate` → **`concedeRate`** | The void outcome is abolished; the event being measured is now a gift to the opponents |
| **`ties` is always 0** | Arithmetically impossible under `us54` ([RULES_US54.md §5](RULES_US54.md)). Assert it rather than rendering a column that can never populate. Score rate remains the primary metric — but note its *justification* is now rule-set-dependent, and say so. |
| **NEW: `foreignDeclareRate`** | Declares made for sets the declarer held no card of, ÷ total declares. Directly measures the owner's memorize-what-you-don't-own strategy. |
| **NEW: `declareLatency`** | Mean window-cycles between a set becoming provable and the team declaring it. Separates "knew it and waited" from "never knew it." |
| **NEW: `raceLosses`** | Times a teammate declared a set *wrongly* that this seat could have declared *correctly*. The cost of hesitation. |
| **NEW: `clinchDenials`** | Declares made primarily to prevent the opponent's 5th set. |
| `bookMargin` capped | A clinched game ends at 5, so margins compress. Report **sets at clinch** (e.g. `5–3`) plus `unresolved`. |

**`hoardIndex` does not measure hoarding — do not read it as such.** BOT_LAB §4.2 defines it as the
mean number of distinct sets a seat holds ≥1 card of, sampled at every card-moving event. That is a
*time average*, and a hoarding style lengthens the game (§3.1.1: +5% moves against Balanced, +19% in
the Turtle cell), which adds samples from exactly the late, small-hand positions that drag the mean
down. Measured, the Hoarder's `hoardIndex` fell from 3.83 to **3.79** — slightly *below* Balanced's
3.82 — while its dropout rate fell from 0.521 to 0.443 and its declare latency rose 35%. The
confound is large enough to invert the sign. **`dropoutRate` and `declareLatency` are the metrics
that actually carry the optionality signal**; `hoardIndex` is a game-shape diagnostic and belongs in
the §4.3 health block, not in the style comparison.

---

## 5. Tuning protocol

1. **Do not port the 48-card tuning.** §1.1 makes every inherited threshold wrong. Re-tune under
   `us54` from a coarse sweep.
2. **Tune with SPRT** (BOT_LAB §5.5), α = β = 0.05 — it stops as soon as evidence is conclusive,
   which matters across this many knobs.
3. **Tune each style against Balanced only**, never against the holdout roster or the friend's bot.
   Tuning against a holdout destroys it as a holdout.
4. **Report the matrix at fixed-N**, SE ≤ 0.005 (BOT_LAB §5.4). Sequential stopping biases effect
   sizes; the matrix's job is to *estimate* payoffs, not accept/reject.
5. **Ablate the two new axes explicitly** — run each style with `foreignDeclare` forced off and with
   `clinchAggression` forced to 0.5, paired on identical deals. If neither ablation moves the win
   rate, `us54`'s new strategy space is smaller than it looks and the site should say so.

---

## 6. Measured caveats on the roster **[measured]**

Five results that qualify the headline finding, all found by measurement after the first
full-precision matrix ran, and all of which must be stated wherever the ranking is published:
§6.1 an inert axis, §6.2 a prediction about the Hoarder **that measurement then refuted**, §6.3 the
contained-book turn-pass as an implemented policy option, §6.4 the second full-precision
matrix — **matrix v2** — which re-runs the whole 36-cell grid with that option live and finds the
verdict, the ranking and the transitivity all unchanged, and §6.5 the **re-measurement of that same
grid** at a later engine, which leaves the verdict standing and the top three of the ranking intact
but re-orders its middle and costs the Punter its exploitability lead.

### 6.1 The declare-threshold axis is inert across the roster's range

`declareThreshold` is the knob this roster's aggressive↔conservative narrative is built on. Across
the range the roster actually spans it changes **nothing**. Varying it on Balanced alone, over 40
`us54` games, comparing every decision against the identical `SeatView` and seed:

| `declareThreshold` | divergent decisions | % |
|---|---:|---:|
| 0.50 | 350 | 1.2968% |
| 0.65 | 48 | 0.1779% |
| 0.70 | 29 | 0.1075% |
| 0.75 | 19 | 0.0704% |
| **0.775** | **0** | **0.0000%** |
| **0.85 / 0.90 / 0.95 / 0.975** | **0** | **0.0000%** |

Every roster style sits at 0.775 or above. **The axis is dead for all nine of them.**

The mechanism is not an unreachable branch — Balanced makes 171 speculative declares to 138 certain
ones over those same 40 games, so the path fires constantly. It is that the inference engine's
confidence estimates are **bimodal**: a plan is either well above ~0.975 or well below ~0.775, with
almost nothing in between, so any threshold inside that band selects the identical set of declares.

**Consequence for the write-up.** Punter did not win by declaring at 0.775 rather than 0.90. It won
through `gambleBonus` and `declareMaxUncertain`. The styles remain genuinely distinct — Scout
2.89%, Ghost 2.15%, Archivist 1.66%, Banker 1.19%, Turtle 0.83%, Punter 0.47%, Hoarder 0.47%, Blitz
0.39% of decisions differ from Balanced — but **not along the axis their labels advertise**. Any page
describing this roster as a spectrum from aggressive to conservative declaring is describing a knob
that does not fire. Say so, or relabel the roster around the knobs that do.

This also means §5's `(1 + q)/2` derivation, while arithmetically right, is currently unfalsifiable
on this engine: every value it can produce in the plausible range yields identical play.

### 6.2 The Hoarder was measured without the benefit it exists to buy — and now it has been measured with it

**This section used to end in a prediction. It now ends in a measurement, and the prediction was
wrong.** The original caveat is kept above the result so the two can be read against each other.

#### 6.2.1 The prediction, as it stood

§3.1 reports the Hoarder as "real, purchasable, and priced above its worth." That verdict was
called **premature**, and [CONTAINMENT.md](CONTAINMENT.md) was why.

The measured value of retaining a card in a team-contained book is a repeatable, targetable
turn-pass that claiming destroys (CONTAINMENT.md C3–C6). *No style in the roster used it.* The
Hoarder therefore paid hoarding's full cost — delayed banking, `declareLatency` 22.90 → 31.02,
`raceLosses` 0.046 → 0.091 — while collecting none of its benefit. Its finish was called a valid
measurement of *this implementation*, not a verdict on the strategy: **the cost of hoarding is
measured, the benefit is not implemented.**

#### 6.2.2 The measurement that replaces it

The turn-pass is now a policy option (§6.3), the Hoarder carries the roster's only above-break-even
appetite, and the **full 36-cell × 4,300-pair matrix has been re-run with it on** — same seed set,
same seat rotation, same precision, so every deal is played by both engines and the two runs differ
only by the policy change.

| | matrix **v1** (`819eebb`, before) | matrix **v2** (`1667a1d`, after) | paired Δ over the same 4,300 deals |
|---|---:|---:|---:|
| Hoarder `meanScore` | 0.4904 | **0.4885** | **−0.0018 ± 0.0014** (t = −1.35) |
| Hoarder rank | **6th of 9** | **6th of 9** | no movement |
| Hoarder maximin | 0.4202 (vs Punter) | 0.4205 (vs Punter) | +0.0003 |
| `E(hoarder)` (BOT_LAB §5.7) | 0.0413 | 0.0563 | best response changed to `hoardBooks=0 minHandSize=0` |

**The prediction did not hold.** Giving the Hoarder the benefit did not move it: the point estimate
went *down*, by about a third of one standard error of the matrix's own cells and 1.35 SE of the
paired difference — indistinguishable from zero, and certainly not the rise §6.2 anticipated. Not
one of its eight cells moved significantly (largest |t| 1.80, `blitz-vs-hoarder`, and that one moves
*against* it); its one marginal cell, `hoarder-vs-archivist`, fell out of significance under
Benjamini–Hochberg (q 0.036 → 0.118), which is the whole of the matrix's 34 → 33 significant-cell
change.

The sharpest form of the result is the exploitability search, which was free to pick any single
knob: the best response to the Hoarder-with-the-benefit is **`hoardBooks=0 minHandSize=0`** —
*stop hoarding* — worth `0.5563 ± 0.0124`. The counter to the style is still to not be it.

**So this is a result about the strategy, not about the implementation.** The benefit CONTAINMENT.md
identified is real, it is reachable (the Hoarder holds a contained book at 14.95% of its ask
decisions against Balanced's 3.89%), it fires, and it is worth nothing at this roster's level of
play. §3.1's verdict — *optionality is real, purchasable, and priced above its worth under `us54`*
— stands, and it no longer has an unimplemented benefit standing behind it as an excuse.

*One correction while replacing the prediction:* this section previously said "7th of 9". That is
§3.1.1's **200-pair pilot** figure (`meanScore 0.4738`), not the full-precision matrix's. In both
full-precision runs the Hoarder finishes **6th of 9**, and it is the 6th-place finish that v2
leaves untouched.

> **Superseded in two places by §6.5, and in neither one in the Hoarder's favour.** The v2 column of
> the table above is the `1667a1d` run; `src/lab/data/style-results.v2.json` has since been
> re-measured at `1fdd22e`. In the re-measurement the Hoarder's own mean score is **0.4897** —
> still indistinguishable from where it started — but it finishes **7th of 9**, because the
> Archivist rose past it, so the "6th of 9 in both full-precision runs" above is true of the two
> runs it was written about and not of the third. And `E(hoarder)` is now **0.0000**, with a best
> response that has nothing to do with hoarding, so the sentence *"the counter to the style is
> still to not be it"* no longer has a measurement under it. **Neither correction rescues the
> prediction this section refuted** — the Hoarder still does not gain from the benefit
> CONTAINMENT.md identified. §6.5.2 and §6.5.3 carry both figures and the reasons they cannot be
> attributed to any single cause.

### 6.3 The contained-book turn-pass, implemented and measured **[measured]**

§6.2's gap is closed. [CONTAINMENT.md](CONTAINMENT.md) C3–C5 measure a repeatable, targetable
turn-pass that no style used; it is now a policy option
([lib/engine/bots/contained.ts](lib/engine/bots/contained.ts)), the Hoarder is the style that
values it most, and this section reports what it does. **The result is negative**, and it is
reported as a negative result rather than dressed up: the mechanism fires, it fires for the
reasons the derivation gives, and it does not win games.

#### 6.3.1 The move

A **contained** book, for the policy, is an unresolved set of which the seat holds at least one
card (row 6 — the licence), does *not* hold at least one card (row 7 — something legal to name),
and **every** card of which is certainly on the seat's own team. That last predicate is weaker
than CONTAINMENT.md's measured position, which pins all six cards to named seats, and the
weakening is the point: a *pinned* contained book is one `certainClaim` has already banked, so a
recogniser that required pinning would fire only for the two styles that refuse a certain
declare. Under the weaker predicate the ask still cannot hit — no opponent holds any card of the
set — and every style can reach the state.

**The card is reused, never cycled** (CONTAINMENT.md §1.2). The policy prefers a card of the book
whose absence from this hand is *already public*; failing that it takes the canonical-first card
it does not hold, which — because a contained book's cards can never move — is fixed for the rest
of the game, so every later use finds that same card already published. Measured, **97.6% of the
Turtle's uses and 94.8% of the Hoarder's cost no information at all.**

**The target is `missTarget`**, the knob §2 already carried for exactly this question.

#### 6.3.2 The trigger, derived

Write `p*` for the hit probability of the ask the style would otherwise play, `t_o` for the
opponent that ask concedes the turn to on a miss, and `t_c` for the opponent `missTarget` picks.
Then

```
value(ordinary) = p* · V_hit + (1 − p*) · V_miss(t_o)
value(pass)     =                        V_miss(t_c)   − infoCost
```

so the pass wins iff **`p* < (a · gain − infoCost) / tempo`**, with every term in *cards*:

| term | value | where it comes from |
|---|---|---|
| `E` | `hits / max(1, misses)` over the public log | row 9 keeps the turn on a hit and row 10 ends it on a miss, so a turn is a geometric run of hits and its expected length is `h/(1−h)` — on counts, exactly hits over misses |
| `cost(t)` | `E · n_t / n̄` | a conceded turn is worth more to a seat holding more ask-licences (row 6); hand size is the public part of that, and is what `missTarget` already ranks on |
| `gain` | `E · (n_o − n_c) / n̄` | what aiming the concession buys |
| `tempo` | `1 + E · n_o / n̄` | the swing between hitting and missing: one card taken, plus the turn *not* conceded |
| `infoCost` | `0` on a reuse, else `1/U` | CONTAINMENT.md §1.2, priced at the only channel C1 and C2 leave open — see §6.3.5 |
| `a` | the style's `containedPass` | the appetite; see §6.3.3 |

`n̄` is the mean live hand size and `U` the number of live cards whose holder is not yet publicly
certain. Every input is public (row 17) and none is a tuned constant: an engine, a roster or a
rule set that hits more often prices a conceded turn higher, automatically. `p*` is the seat's own
best estimate — the constraint-refined probability where the skill has it, not the slot prior —
so the ask being displaced is never undervalued. Two consequences fall straight out of the
algebra, and they are the reason this is not *"fire whenever legal"*:

- **`gain ≤ 0` whenever the ordinary ask already concedes where the style wants it**, and the
  move is then refused however contained the book is. Measured, that is most of the time: the
  licence exists at 0.4–54% of ask decisions depending on style, and the move is taken at **3.8%
  to 16.0% of those**.
- **A certain hit is never displaced.** It is riskless material *and* keeps the turn (row 9); the
  threshold is clamped below 1 and the check is explicit.

Blitz needs no exception written for it: §3 gives it `missTarget: 'most'`, so the ordinary ask
already concedes to the largest hand, `gain ≤ 0`, and the mechanism is off for it at the same
appetite every other style carries. `'random'` is likewise off — a style that expresses no aim
buys nothing by aiming.

#### 6.3.3 The appetite is one number, and eight of nine styles share it

`containedPass` is an appetite in the same sense `hoardBooks` is: **the expected number of uses
the licence gets before the book is banked.** The single-move comparison above prices one use, so
a style that banks at its next opportunity takes **1**. The Hoarder takes **1.33**, read off this
repo's own measurement of how much longer it holds a set — §3.1.1's `declareLatency` 31.02
against Balanced's 23.39. It is the highest number in the roster and the only one above the
break-even, because it is the only style whose delay has actually been measured.

Uniformity is deliberate. Which styles *reach* a contained book, and whether aiming is worth
anything, are already decided by knobs this roster had before — `hoardBooks`/`minHandSize` and
`declareOnlyOwnHand` govern how long a book stays unclaimed, `missTarget` governs the aim.
Handing each style its own appetite would have hidden that behind nine tuned constants.

The Turtle also delays (`declareOnlyOwnHand` means it never banks a set split across teammates)
but that delay has never been measured here, so its appetite stays at the conservative 1. It
still ends up the heaviest user of the mechanism — because it *reaches* the state far more often,
not because it prices it higher, which is exactly the separation the uniform appetite preserves.

**Honest check on the derivation.** Measured, uses per contained book run Turtle 3.40, Hoarder
2.64, Banker 2.56, Balanced 2.23, Punter 1.63. The *ordering* is what the appetite argument
predicts; the Hoarder-to-Balanced ratio is **1.18**, not the 1.33 the `declareLatency` ratio
implied. So the number is right in sign and roughly right in size, and it is not exactly the
quantity it was read off. It has deliberately **not** been re-derived from 1.18, because fitting
an appetite to the behaviour it produces is tuning against the outcome.

#### 6.3.4 How often it fires, and how far it moves the policy

100 mirror `us54` games per style. At *every* decision point both vectors — identical but for
`containedPass` — are handed the same `SeatView` and the same seed and their two `GameAction`s
compared, which is §3.1.1's instrument. `opp` counts ask decisions at which a contained book was
available at all; `fire` counts decisions at which the valuation actually returned a plan.

| style | appetite | aim | ask decisions | `opp` | `opp%` | `fire` | `fire`/`opp` | divergent decisions | `div%` |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| Balanced | 1 | fewest | 9,741 | 379 | 3.89% | 29 | 7.7% | 29 | 0.0414% |
| Blitz | 1 | **most** | 9,345 | 472 | 5.05% | **0** | 0.0% | **0** | **0.0000%** |
| Punter | 1 | fewest | 9,507 | 347 | 3.65% | 13 | 3.8% | 13 | 0.0190% |
| Banker | 1 | fewest | 9,818 | 495 | 5.04% | 69 | 13.9% | 69 | 0.0981% |
| **Turtle** | 1 | fewest | 17,285 | **9,310** | **53.86%** | **679** | 7.3% | **679** | **0.5575%** |
| **Hoarder** | **1.33** | fewest | 11,418 | 1,707 | **14.95%** | 211 | **12.4%** | 211 | 0.2580% |
| Scout | 1 | fewest | 11,292 | 43 | 0.38% | 0 | 0.0% | 0 | 0.0000% |
| Ghost | 1 | fewest | 9,996 | 131 | 1.31% | 21 | 16.0% | 21 | 0.0293% |
| Archivist | 1 | fewest | 10,383 | 105 | 1.01% | 5 | 4.8% | 5 | 0.0067% |

Read three ways:

1. **The opportunity is a property of the declare policy, not of the ask policy.** A contained
   book exists at 54% of the Turtle's ask decisions and 0.38% of the Scout's. `declareOnlyOwnHand`
   means the Turtle never banks a set split across its teammates, so it accumulates them; the
   Scout's `wNarrow 40` pins holders early, and a pinned contained set goes straight through
   `certainClaim`. **The Hoarder sits second at 14.95% — nearly four times Balanced's 3.89% —
   which is precisely the benefit §6.2 said it was paying for and not collecting.**
2. **It is mostly a refusal.** Even where the licence exists, it is spent 3.8–16% of the time.
   Every one of those refusals is the `gain ≤ 0` arm: the ordinary ask was already conceding the
   turn where the style wanted it, so there was nothing to buy.
3. **Divergence is small.** The largest mover is the Turtle at 0.56% of all decisions and the
   Hoarder at 0.26%; seven of the nine move less than 0.1%, and two — Blitz and Scout — do not
   move at all. In every
   style `fire` equals the divergence exactly — the mechanism never once chose the move the
   ordinary policy was already going to play, which is what makes these columns interchangeable.

#### 6.3.5 Develin's second framing, kept separate

CONTAINMENT.md §2.1 records that Develin frames the same ask as **signalling** rather than turn
control. Both are modelled, and they are **not added together**:

- **Turn control** is the whole of §6.3.2, and it is what decides. Every term in the comparison is
  a card of tempo or of material.
- **Signalling** enters at exactly one place, `infoCost`. The published fact is *"the asker lacks
  card X of book B"*. For a contained book the opponents cannot use it — C1 says they can never
  ask into B, C2 says declaring B hands it back — so the only surviving channel is count
  exhaustion, priced at `1/U` cards. The same publication reaches the *teammates*, who **can**
  convert it: they may declare B, which C2 denies the opponents. A `signalling` style therefore
  books the fact as delivered rather than spent, and pays 0.

**Which is doing the work: turn control, entirely.** `infoCost` is bounded by `1/U`, under 0.05
cards in these positions against a `tempo` above 1, and it is charged only on a **first** use —
2.4% of the Turtle's uses and 5.2% of the Hoarder's. It never flipped a decision. It is in the
model because §1.2 says the move is not information-free and the honest thing is to price it, not
because it earns anything.

**The convention line, which CONTAINMENT.md §2.1 says not to blur.** Develin records that
prearranged conventions are forbidden in this tradition. Nothing here is one: **no partner model
was added anywhere.** A teammate's `buildKnowledge` after a turn-pass is bit-for-bit the knowledge
it builds after any other miss on the same card by the same seat — the row-17 public facts and
nothing else — and [tests/bots/contained.test.ts](tests/bots/contained.test.ts) asserts that
equality directly. The inference layer does not know the ask was a turn-pass, and must not be
taught to.

#### 6.3.6 Does it win? No.

The style **with** `containedPass` against the identical style with it forced to 0, on 1,200
duplicate-deal pairs each — both orientations of every seed, shared seat rotation
(BOT_LAB.md §5.1/§5.2). The unit of analysis is the pair. `0.5` is no effect; `changed` counts
games whose result or length differed from the same deal played by two copies of the *without*
vector, i.e. games the mechanism actually touched.

| style | `containedPass` | pairs (games) | score of the WITH vector | SE | games the mechanism changed |
|---|---:|---:|---:|---:|---:|
| Balanced | 1 | 1,200 (2,400) | 0.5046 | 0.0034 | 239 |
| Blitz | 1 | 1,200 (2,400) | **0.5000** | 0.0000 | **0** |
| Punter | 1 | 1,200 (2,400) | 0.4971 | 0.0029 | 142 |
| Banker | 1 | 1,200 (2,400) | 0.5021 | 0.0035 | 281 |
| **Turtle** | 1 | 1,200 (2,400) | 0.5008 | 0.0065 | 1,268 |
| **Hoarder** | **1.33** | 1,200 (2,400) | **0.4938** | 0.0054 | 915 |
| Scout | 1 | 1,200 (2,400) | **0.5000** | 0.0000 | **0** |
| Ghost | 1 | 1,200 (2,400) | 0.4958 | 0.0027 | 156 |
| Archivist | 1 | 1,200 (2,400) | 0.4996 | 0.0004 | 11 |

**Verdict. No style is two standard errors from 0.5.** The largest deviation in either direction is 1.6 SE
(Ghost, `0.4958 ± 0.0027`), and the two styles §6.3.4 shows actually using the mechanism land on
and slightly below the control — Turtle `0.5008 ± 0.0065`, **Hoarder `0.4938 ± 0.0054`**. Across
the seven styles that fire at all the point estimates straddle 0.5 (four below, three above; mean
0.4991). Blitz and Scout return exactly `0.5000 ± 0.0000` over 2,400 games each, which is the
`gamesChanged: 0` column restated: for those two the vectors are the same player.

**The measured value of the CONTAINMENT.md turn-pass, as a policy option under `us54` against the
roster it was built for, is zero.**

That is a finding about the move, not about the wiring. The mechanism demonstrably fires
(§6.3.4), demonstrably fires for the derived reason (the `gain ≤ 0` refusals dominate),
demonstrably aims where the style asked, and demonstrably reuses one card. What it does not do is
convert any of that into sets. The reason is visible in the arithmetic: a conceded turn is worth
`E · n_t / n̄` cards and the measured `E` is around 1, so the *entire* spread between the best and
the worst opponent to concede to is on the order of one card — against which the ordinary ask
being given up is worth `p*` of a card plus the turn it would have retained. The move is real,
and it is small.

**What this settles for §6.2, and what it does not.** It settles the objection: the Hoarder's
6th-of-9 finish can no longer be attributed to an unimplemented benefit, because the benefit is
now implemented, the Hoarder is the style that most reaches it and the only one that prices it
above the break-even, and it is worth nothing. **§6.4 confirms it at full precision** — the whole
36-cell matrix re-run with the mechanism live leaves the Hoarder 6th, at −0.0018 ± 0.0014 against
its own v1 score on the same deals. It does **not** settle the strategy. The bar the
trigger must clear is *the best ordinary ask*, and §5's tuning protocol has still never been run —
a roster with a weaker ask policy would leave more room for a turn-pass. And CONTAINMENT.md
§3.2's *second* mechanism, hold-contained-books-by-default, is a change to the **declare** policy
and is untouched here; §6.3.4's first reading is the evidence that it is where the leverage would
be, since the opportunity rate is set almost entirely by how long a style leaves books unclaimed.

#### 6.3.7 `pagat48` is untouched, and that is checked rather than asserted

The policy refuses the 48-card rule set outright — but **not** for the reason an earlier draft of
this section gave. That draft claimed RULES.md row 15 voids an opponent's declare of a contained
book, so containment was not absorbing under `pagat48`. **That is false**, and measuring it says
so: row 15 covers *"my own team holds all six and I misassigned"*, which cannot describe a seat
whose opponents hold all six. The rule that fires is row 14 — opponent holds at least one, opposing
team scores — worded identically in both rule sets. Executed under `pagat48`: outcome `team0`,
score `[1, 0]`, the book handed straight back. C1 is row 6, also identical.

**So containment is absorbing under both rule sets**, C1 and C2 hold in both, and
`tests/engine/containment.test.ts` pins that rather than leaving it as folklore.

The real reason for the gate is **compatibility**: this project holds the shipped 48-card game
byte-identical, and enabling a new policy mechanism there would change it. The mechanism is valid
under `pagat48` and is refused anyway. If the 48-card roster is ever re-tuned as its own
experiment, this gate is the line to revisit — no rules argument stands in the way.

CONTAINMENT.md §2's tier discipline still binds C3–C6, which price the *turn-pass* itself and were
measured under `us54` only.

Verified differentially rather than by assertion: 40 seeded games per policy, every action
serialised in order and hashed, run against this working tree and against the commit before it.

| population | digests |
|---|---|
| `pagat48`, the three shipped tiers | **identical** |
| `pagat48`, all nine roster styles | **identical** |
| `us54`, the three shipped tiers | **identical** — `containedPass: 0` on every preset |
| `us54`, the roster | changed for **seven of nine**; identical only for Blitz and Scout |

The last row is the mechanism, and the two unchanged entries in it are the two the model says
should be unchanged: Blitz aims the wrong way (`missTarget: 'most'` makes the aiming gain
non-positive at every appetite), and the Scout almost never holds a contained book (0.38% of its
ask decisions).

*Corrected at the wider sample.* The 40-game digest above originally also read the **Archivist** as
identical. It is not — it is merely rare. §6.3.4 measures 5 fires in 100 games, so 40 games is
below its firing rate; re-run at 250 duplicate pairs (500 games) per style, the Archivist's digest
differs and Blitz's and the Scout's still do not. The corrected count is 7 of 9, and it is the one
used everywhere below.

### 6.4 The full matrix, re-run with the turn-pass on — **matrix v2** **[measured]**

§6.3.6 measured the mechanism against a copy of the same style. This is the other half: the whole
36-cell × 4,300-pair matrix re-run with it live, at v1's precision (SE ≤ 0.005), on **the same seed
set**, so v1 and v2 differ by the policy change and by nothing else. Both artifacts were committed
at the time this was written — `src/lab/data/style-results.dominant.json` is **v1**,
`src/lab/data/style-results.v2.json` held **v2**, and the site renders either at
`?case=dominant` / `?case=v2`.

> **Read this section as a record of the `1667a1d` engine.** Everything below measures matrix v2
> *as it was first run*. `src/lab/data/style-results.v2.json` has since been **re-measured and
> re-committed at `1fdd22e`**, and **§6.5 reports what changed** — the verdict survives, the
> ranking's middle does not, and the Punter's exploitability lead does not. The `1667a1d` bytes are
> no longer in the working tree; they exist only in git history, so the v2 column of every table
> below can no longer be reproduced from the repository as it stands. That is precisely why these
> columns are kept and annotated rather than overwritten.

Health gate on v2 (BOT_LAB §4.3): `illegalActions 0 · cappedGames 0 · invariantViolations 0 ·
ties 0 · voids 0 · nonClinch 0 · distinctSeeds 4300/4300`.

#### 6.4.1 Nothing that matters moved — v1 → v2 **as first run**

| | v1 (`819eebb`) | v2 as first run (`1667a1d`, superseded) | v2 as committed now (`1fdd22e`, §6.5) |
|---|---|---|---|
| **verdict** | **dominant — punter** | **dominant — punter**, all four §4.4 criteria | **dominant — punter**, all four still hold |
| ranking (mean score) | punter, blitz, balanced, banker, ghost, hoarder, archivist, scout, turtle | **identical, position for position** | top three identical, **middle four re-ordered**: punter, blitz, balanced, ghost, archivist, banker, hoarder, scout, turtle |
| punter mean score | 0.5829 | 0.5829 | **0.5684** (blitz 0.5562, margin 0.0122) |
| punter maximin | 0.5193 vs blitz | 0.5190 vs **balanced** | **0.5102 vs blitz**, CI95 lower bound 0.5022 |
| cyclic energy | 0.0097 | **0.0112** (threshold 0.15) | **0.0172** (threshold 0.15) |
| 3-cycles | 1 directed (hoarder > archivist > ghost), 0 significant | **the same one**, 0 significant | **1 directed, 0 significant after BH** (`cyclesAll` = 1; the artifact records the count but not the members, since `cycles` carries significant cycles only and there are none) |
| significant cells (BH) | 34 / 36 | 33 / 36 | 33 / 36 |
| Nash / α-Rank | punter, mass 1.0 | punter, mass 1.0 | punter, mass 1.0 |
| `E(punter)` vs rivals' median | 0.0000 vs 0.0631 | 0.0025 vs 0.0444 | **0.0525 vs 0.0594** — passes on the 0.0200 margin, not on a gap |

**The third column is not part of this section's comparison.** It is the same 36 cells on the same
4,300 seeds re-measured at a later engine, and it is here only so this table cannot be read as
current. What moved between the second column and the third — and why two changes landed together
so that the movement cannot be attributed to either one — is §6.5. The rest of §6.4 reports the
v1 → `1667a1d` pair and nothing else.

**No cell moved significantly** between v1 and v2 as first run. Paired per-deal differences over all 36 cells: the largest is
`blitz-vs-ghost` at +0.0030 ± 0.0015 (t = 2.07, p ≈ 0.04), which does not survive
Benjamini–Hochberg over 36 comparisons — one |t| above 2 in 36 is what chance produces. The largest
*point* movements are the Turtle's cells (`turtle-vs-ghost` −0.0073 ± 0.0042,
`balanced-vs-turtle` −0.0060 ± 0.0039), which is where the mechanism fires most.

**Per-style mean score, paired over the same 4,300 deals** (`delta` is v2 − v1 for the `1667a1d`
run; every one is inside 1.5 SE of zero — the re-measured run's own per-style scores are in §6.5.2,
and several of *those* are not):

| style | v1 | v2 | Δ | SE(Δ) | t | rank v1 → v2 |
|---|---:|---:|---:|---:|---:|---|
| punter | 0.5829 | 0.5829 | −0.0001 | 0.0009 | −0.07 | 1 → 1 |
| blitz | 0.5594 | 0.5602 | +0.0008 | 0.0008 | +0.94 | 2 → 2 |
| balanced | 0.5584 | 0.5581 | −0.0003 | 0.0009 | −0.34 | 3 → 3 |
| banker | 0.5274 | 0.5285 | +0.0011 | 0.0011 | +1.00 | 4 → 4 |
| ghost | 0.4928 | 0.4928 | +0.0000 | 0.0010 | +0.03 | 5 → 5 |
| **hoarder** | 0.4904 | **0.4885** | **−0.0018** | 0.0014 | −1.35 | **6 → 6** |
| archivist | 0.4791 | 0.4802 | +0.0011 | 0.0008 | +1.47 | 7 → 7 |
| scout | 0.4064 | 0.4063 | −0.0001 | 0.0007 | −0.12 | 8 → 8 |
| turtle | 0.4032 | 0.4025 | −0.0007 | 0.0019 | −0.38 | 9 → 9 |

Two entries deserve a note because they are *not* evidence of anything. The Scout's and Blitz's
rows are not exactly zero even though their own policies are byte-identical: their **opponents**
changed, so their cells did. And punter's worst matchup moving from Blitz to Balanced is a
re-ordering of two cells that were already tied — `punter-vs-blitz` 0.5193/0.5198 and
`punter-vs-balanced` 0.5200/0.5190 — not a new counter.

#### 6.4.2 Cyclic energy rose, and it is still nothing

A new mechanism is a new way for the matrix to become intransitive, so this was worth checking
rather than assuming. `cyclicEnergy` went 0.0097 → 0.0112 — up 15% in relative terms, and 1.1% of a
matrix whose threshold is 15%. The single directed 3-cycle is **the same one** it was in v1
(hoarder > archivist > ghost, min edge 0.5056) and it still fails BH (q 0.31 → 0.27). Criterion 3
passes with the same margin it always had. **The turn-pass introduced no intransitivity.**

#### 6.4.3 Exploitability: re-searched for every style, and it moved

`E(i)` was re-run from scratch — the cache keys on a hash of every file under `lib/engine/`, so the
new file invalidated all nine entries rather than any being carried over.

| style | policy changed? | `E(v1)` | `E(v2)` | Δ | best response v1 → v2 |
|---|---|---:|---:|---:|---|
| turtle | yes | 0.1162 | **0.1500** | +0.0338 | `declareOnlyOwnHand=false` (unchanged) |
| scout | **no** | 0.1162 | 0.1112 | −0.0050 | `wHit=90 wNarrow=0 minHitP=0.45` (unchanged) |
| ghost | yes | 0.0887 | 0.0775 | −0.0112 | `wProgress=30 gambleBonus=15` → `…gambleBonus=30` |
| archivist | yes | 0.0850 | **0.0325** | −0.0525 | `wHit=90 wNarrow=0` → `wHit=100` |
| hoarder | yes | 0.0413 | 0.0563 | +0.0150 | `wProgress=45` → **`hoardBooks=0 minHandSize=0`** |
| blitz | **no** | 0.0175 | 0.0175 | 0.0000 | `leakEpsilon=3` (unchanged) |
| punter | yes | 0.0000 | 0.0025 | +0.0025 | mirror → `missTarget=random` |
| banker | yes | 0.0000 | 0.0012 | +0.0012 | `gambleBonus=15` (unchanged) |
| balanced | yes | 0.0000 | 0.0000 | 0.0000 | mirror (unchanged) |

**Read this cautiously.** `E(i)` is a *max over a stochastic search* whose own final measurement
carries `se` 0.011–0.017 and which can only accept a move worth at least `detect` ≈ 0.03. Every
delta in that table is inside those bars, and the two largest — the Turtle up and the Archivist
down — kept and changed their accepted move respectively without changing the search's verdict on
the style. Criterion 4 passes in both runs; `E(punter)` moved from 0.0000 to 0.0025 against a
rivals' median of 0.0444.

**And read the whole table as a maximum over the ladder as it stood.** The `E(v2)` column was
searched over a **75-rung `KNOB_LADDER` truncated to a 60-candidate budget**. That ladder has since
been completed to **88 rungs** and the truncation removed; §6.5.3 re-searches every style over it,
and **all nine `E(v2)` values change** — including three whose best response is now a knob no
ladder in this section could reach.

**The Scout's row is the useful calibration and also a trap.** Its own policy is byte-identical
between the runs, yet `E` moved by 0.0050 — because the *best response* the search builds from its
vector has a different ask policy, so the attacker plays the turn-pass even though the Scout never
does. Blitz's `E` is identical to the last digit for the complementary reason: its best response
keeps `missTarget: 'most'`, so the mechanism is off on both sides.

**The Hoarder's row is the interesting one.** The best single-knob counter to it is no longer a
scoring weight but **`hoardBooks=0 minHandSize=0` — "do not hoard"** — which is §6.2.2's finding
arriving from the other direction.

#### 6.4.4 The one axis the search cannot turn — measured separately

`KNOB_LADDER` (BOT_LAB §5.7) was written before `containedPass` existed and does not carry it, so
neither `E(v1)` nor `E(v2)` is allowed to switch the mechanism on or off. That gap is closed here
directly: the identical SPRT protocol (`d0 0`, `d1 0.03`, α = β = 0.05, min 24 / max 400 pairs, then
a fixed-N 400-pair eval on seeds no search decision saw), run on that one coordinate against every
style.

*No longer true of the ladder as it stands.* `KNOB_LADDER` now carries `containedPass` among its 88
rungs, so the re-measured `E(i)` of §6.5.3 **is** free to switch the mechanism on and off. The
first sentence above remains true of the two `E` columns in §6.4.3, which is what this section was
written to cover, and the sweep below is still the only measurement that walks the appetite across
{0, 2, 4} under a declared SPRT protocol rather than as one rung among many.

**No candidate was accepted, for any style, at any appetite in {0, 2, 4}.** The two worth naming:

| target | candidate | search Δ | eval score | reading |
|---|---|---:|---:|---|
| Turtle | `containedPass=0` | +0.0125 ± 0.0120, ran to `maxPairs` | 0.5225 ± 0.0121 | inconclusive — the one candidate the SPRT could not resolve |
| Hoarder | `containedPass=0` | **−0.0200** ± 0.0176, rejected | **0.5275** ± 0.0098 | search and eval **disagree in sign**; treat as noise, not as a result |

Both point the same way as §6.3.6 (the mechanism is worth nothing or slightly less than nothing to
the seat that plays it) and neither is strong enough to be called an exploit. The Hoarder row is
recorded precisely because it is the one number in this whole exercise that would have looked like
a finding if only its second half had been reported: the search seeds say the candidate is *worse*
by 0.02 and the eval seeds say it is *better* by 0.0275, and the honest summary of two contradictory
0.01–0.02-sized effects is that neither is real. Raising the appetite is uniformly bad and does
resolve: at `containedPass=4` the Turtle drops to 0.4600 ± 0.0148 and the Banker to 0.4850 ± 0.0083.

Blitz and the Scout return exactly 0.5000 ± 0.0000 at appetites 0 and 2 — the same self-exclusion
§6.3.2 predicts, now confirmed at every appetite rather than at the shipped one.

### 6.5 The same grid, re-measured — **matrix v2 at `1fdd22e`** **[measured]**

`src/lab/data/style-results.v2.json` has been **re-measured and re-committed** (`cf18520`). It is a
controlled re-measurement, not a new sample: the same 36 cells, the same 4,300 duplicate pairs per
cell, the same `style-v1` seed prefix, 309,600 games, and the same health gate
(`illegalActions 0 · cappedGames 0 · invariantViolations 0 · ties 0 · voids 0 · nonClinch 0 ·
distinctSeeds 4300/4300`). §6.4 is left standing above as the record of the run it described; this
section reports what the re-measurement changed and what it costs the claims made from the old one.

**Two things changed underneath it, and they cannot be separated.**

1. The `1667a1d` run predates the concession layer ([CONCESSION.md](CONCESSION.md)), so the roster
   it measured did not carry `defuse: 1`. The roster measured here does.
2. Its exploitability search ran over a **75-rung `KNOB_LADDER` truncated to a 60-candidate
   budget**. The ladder now carries **88 rungs**, including `containedPass`, `defuse` and
   `conceal`, and the budget is the ladder's own length rather than a truncation of it.

**So no magnitude in this section may be attributed to the ladder alone**, and none of them is a
clean measurement of either change on its own. That is a real limitation and it is not one this
section can argue away: the honest reading of every delta below is *"two things moved at once."*

What *is* cleanly attributable to the ladder is narrower, and worth stating separately because it
is not a magnitude at all: **three of the nine best responses now use knobs no earlier ladder
contained.** Those exploits were previously unreachable by construction — not looked for and
missed, but absent from the search space.

#### 6.5.1 The verdict is unchanged; the margins are thinner

| §4.4 criterion | v2 as first run (`1667a1d`) | v2 as committed now (`1fdd22e`) |
|---|---|---|
| 1 highest mean score | punter 0.5829 | **punter 0.5684**, ahead of blitz 0.5562 — margin **0.0122** |
| 2 maximin > 0.5 | 0.5190 | **0.5102** vs blitz, CI95 lower bound **0.5022** |
| 3 cyclic energy < 0.15 | 0.0112 | **0.0172**, 0 significant 3-cycles after BH |
| 4 exploitability | `E(punter)` 0.0025 vs rivals' median 0.0444 | **`E(punter)` 0.0525 vs rivals' median 0.0594** — passes as *not materially worse* on the 0.0200 margin |

**The verdict is still `dominant`, still the Punter, and all four criteria still hold.** What
changed is *how* they hold, and criterion 4 is where the change is worth saying out loud: the
Punter no longer passes it by being the least exploitable style in the roster. It passes by not
being *materially* worse than the median rival — the margin rule doing exactly the job it was
written for, and a visibly weaker statement than the one v1 supported, where `E(punter)` was
0.0000 against a rivals' median of 0.0631.

Matrix **v1** (`src/lab/data/style-results.dominant.json`, `819eebb`) is untouched by any of this
and remains committed: punter 0.5829, maximin 0.5193, cyclic 0.0097, `E(punter)` 0.0000 against a
rivals' median of 0.0631.

#### 6.5.2 The top three hold; the middle re-orders

| style | v1 (`819eebb`) | v2 (`1667a1d`) | v2 (`1fdd22e`) | rank v1 → now |
|---|---:|---:|---:|---|
| punter | 0.5829 | 0.5829 | **0.5684** | 1 → 1 |
| blitz | 0.5594 | 0.5602 | **0.5562** | 2 → 2 |
| balanced | 0.5584 | 0.5581 | **0.5531** | 3 → 3 |
| ghost | 0.4928 | 0.4928 | **0.5082** | 5 → **4** |
| archivist | 0.4791 | 0.4802 | **0.5023** | 7 → **5** |
| banker | 0.5274 | 0.5285 | **0.4928** | 4 → **6** |
| hoarder | 0.4904 | 0.4885 | **0.4897** | 6 → **7** |
| scout | 0.4064 | 0.4063 | **0.4173** | 8 → 8 |
| turtle | 0.4032 | 0.4025 | **0.4120** | 9 → 9 |

Rows are in the current run's order. **These are the committed artifact's own figures; no paired
analysis was re-run for this section**, so there is no `Δ ± SE(Δ)` column to match §6.4.1's — read
the third column against the artifact's own CI half-widths (±0.0031 on the punter row) rather than
against a t statistic that does not exist.

Three movements are worth naming, and all three carry §6.5's confound:

- **The Banker falls two places**, 4th to 6th, 0.5285 → 0.4928, and is the only style to cross
  0.5 downward.
  It is the largest single movement in the roster.
- **The Archivist rises two**, 0.4802 → 0.5023, crossing 0.5 upward.
- **The Hoarder does not move and is overtaken anyway.** Its own mean goes 0.4885 → 0.4897 — inside
  the noise §6.4.1 measured on it — and it finishes **7th of 9** because the Archivist went past
  it. §6.2.2's closing correction, *"in both full-precision runs the Hoarder finishes 6th of 9"*,
  is therefore true of the two runs it was written about and not of this one. A note there says so.

What did **not** move is the part §6.4.1's heading was about: the ranking's top three are the same
three styles in the same order, the verdict is the same verdict, and the transitivity structure is
still nowhere near the cyclic threshold.

#### 6.5.3 Exploitability, re-searched over the completed ladder

Every style re-searched from scratch, ascending by `E(i)`:

| style | `E(1667a1d)` | `E(1fdd22e)` | best response found now |
|---|---:|---:|---|
| hoarder | 0.0563 | **0.0000** | `minHitP=0.45 leakEpsilon=0` |
| banker | 0.0012 | 0.0212 | `wHit=60 minHitP=0.45` |
| archivist | 0.0325 | 0.0463 | `wNarrow=25 gambleBonus=30` |
| **punter** | 0.0025 | **0.0525** | **`conceal=1`** |
| blitz | 0.0175 | 0.0587 | **`defuse=2 conceal=4`** |
| ghost | 0.0775 | 0.0600 | `wProgress=45` |
| balanced | 0.0000 | 0.0613 | **`conceal=1`** |
| turtle | 0.1500 | 0.1325 | `declareOnlyOwnHand=false` |
| scout | 0.1112 | 0.1475 | `wHit=80 wNarrow=0 missTarget=most` |

**The Punter is fourth lowest of nine, not first.** Under v1 it was tied at the bottom with the
Banker and Balanced at 0.0000; it is now above the Banker, the Archivist and the Hoarder, and
criterion 4 rests on the margin rule (§6.5.1) rather than on a gap.

**The three bolded best responses are the part that is the ladder's.** `conceal` and `defuse` are
rungs no earlier ladder carried, so the counters to the Punter, Blitz and Balanced were unreachable
by construction in both earlier searches. That does not make the earlier numbers wrong — BOT_LAB
§5.7 defines `E(i)` as a maximum over a search, and a maximum over a smaller set is what those
were. It does mean the earlier `E(punter) = 0.0000` cannot be read backwards as evidence that no
counter to the Punter existed. It was evidence that none existed *in the ladder as it stood*.

**Every caveat §6.4.3 attaches still attaches**, and with the same force: `E(i)` is a max over a
stochastic search whose held-out evaluation carries `se` 0.0125–0.0172 over 800 games, and which
can only accept a move worth at least `detect` 0.027–0.040. Differences between the two columns
that are smaller than those bars are not results.

**The Hoarder's row is where that caveat bites hardest, and it reverses §6.4.3's reading of the
same style.** Its `E` is 0.0000 not because the search found nothing to try but because what it
accepted **lost on held-out seeds**: the search's own upward-biased score was 0.5413 and the
fixed-N eval on unseen seeds came back at **0.4800**, so the gap floors at zero. That is the same
search-and-eval sign disagreement §6.4.4 records for `containedPass=0` against this same style, and
it deserves the same treatment — *treat it as noise, not as a result*. In particular, the best
single-knob counter to the Hoarder is no longer `hoardBooks=0 minHandSize=0`, so §6.4.3's "do not
hoard" reading has no measurement under it in this run. §6.2.2's underlying finding does not depend
on it: the Hoarder's mean score is where it was, and it is still not paid for.

*One figure that looks like a shortfall and is not.* The ladder is 88 rungs and the budget is the
ladder's own length, but the artifact records **68–74 candidates actually tried** per style. That
is the expected range, not an anomaly: budget is spent only on a rung that actually *changes* the
incumbent and then validates, so every rung whose value the target already carries is a free skip.
[exploit.ts](lib/lab/analysis/exploit.ts) documents this and the replayed accounting in its header
predicts 68–74 for exactly these nine targets. The 23–35 **inert** candidates are a different
thing again, and worth not conflating: those *were* tried and did spend budget — they are distinct
policy vectors that went on to play byte-identical games, which the search detects as exactly zero
paired variance and rejects at the minimum sample size.

#### 6.5.4 What this costs the site, and what it does not

`?case=dominant` against `?case=v2` is still a controlled comparison — the same deals played by two
engines — but the two committed artifacts are now **two engine changes apart, across three
generations**. The engine
that produced §6.4's tables (`1667a1d`) sits between the two committed artifacts and is not
recoverable from the committed bytes; it exists only in git history. Everything §6.4 reports about
it therefore has to be read from this document rather than reproduced from the repository, which is
why §6.4 is annotated rather than replaced.

Three claims made elsewhere in this file are narrowed by the re-measurement and should not be
repeated in their old form:

- *"the ranking is identical, position for position"* — true of v1 → `1667a1d`, false of v1 → now.
  The top three are identical; the middle four are not.
- *"the counter to the Hoarder is to not be it"* — no measurement under it in this run (§6.5.3).
- *"`E(punter)` is 0.0000"* — a maximum over a ladder that did not contain `conceal` (§6.5.3).

The headline claim is not among them. **The Punter is still the dominant style under `us54` on all
four §4.4 criteria**, on 309,600 games and a health gate that came back clean, and §6.1's finding —
that it did not win along the axis its label advertises — is untouched by any of this.
