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

| # | Style | Family | Thesis | Defining settings |
|---|---|---|---|---|
| 1 | **Balanced** | control | The tuned `us54` baseline every other style is read against | baseline, `clinchAggression 0.5` |
| 2 | **Blitz** | aggressive | Tempo and sets now; information is cheap | `wHit 90, wProgress 30, declareThreshold 0.70, declareEagerness 0.9, leakEpsilon 0, signalling false, missTarget 'most'` |
| 3 | **Punter** | aggressive | Chase the completing card; accept the gift risk | `gambleBonus +25, minHitP 0, declareThreshold 0.55, declareMaxUncertain 2` |
| 4 | **Banker** | conservative | Never gift a set; bank only certainties | `declareOnlyWhenCertain, minHitP 0.25, declareEagerness 0.2, missTarget 'fewest'` |
| 5 | **Turtle** | passive | Minimum risk; declare only sets wholly in hand | `declareOnlyOwnHand, minHitP 0.4, signalling false, foreignDeclare false` |
| 6 | **Hoarder** | optionality | Keep ask-licences, stay alive, delay | `hoardBooks 3, minHandSize 2, declareThreshold 0.95, declareEagerness 0.1` |
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

Two results that qualify the headline finding. Both were found by measurement after the
full-precision matrix ran, and both must be stated wherever the ranking is published.

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

### 6.2 The Hoarder is measured without the benefit it exists to buy

§3.1 now reports the Hoarder as "real, purchasable, and priced above its worth." That verdict is
**premature**, and [CONTAINMENT.md](CONTAINMENT.md) is why.

The measured value of retaining a card in a team-contained book is a repeatable, targetable
turn-pass that claiming destroys (CONTAINMENT.md C3–C6). **No style in the roster uses it.** The
Hoarder therefore pays hoarding's full cost — delayed banking, `declareLatency` 22.90 → 31.02,
`raceLosses` 0.046 → 0.091 — while collecting none of its benefit.

Its 7th-of-9 finish is a valid measurement of *this implementation*, not a verdict on the strategy.
Until the known-miss turn-pass is a policy mechanism, the honest statement is: **the cost of
hoarding is measured, the benefit is not implemented.**
