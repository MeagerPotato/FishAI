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
