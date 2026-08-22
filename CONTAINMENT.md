# CONTAINMENT.md — the contained-book result

A book your team collectively holds is an **absorbing state**, and leaving it unclaimed is a
*resource*, not an oversight. This document records the result, its evidence, and what it changes in
the bot.

It matters because it corrects a wrong conclusion this project had already reached: that the
**Hoarder** style's thesis was near-vacuous under `us54`. It is not.

---

## 1. The result

Let a book be **contained** when all six of its cards sit with one team.

| # | Claim | Evidence |
|---|---|---|
| C1 | **No opponent can legally ask into it.** Asking requires holding ≥1 card of that book ([RULES_US54.md](RULES_US54.md) row 6); an opponent holds none. | measured |
| C2 | **An opponent declaring it gifts it to the holders.** Assignments must be to the declarer's own team (row 12), so every assignment is wrong, and row 14 awards the book to the containing team. | measured |
| C3 | **A holder may still ask into it** — naming a card a teammate holds. Legal, and a *guaranteed miss*. | measured |
| C4 | **That miss is a turn-pass aimed at a chosen opponent** (row 10). | measured |
| C5 | **It is repeatable.** A miss moves no cards, so the licence is never consumed. | measured |
| C6 | **Claiming the book destroys the move.** | measured |

**Therefore: claiming a contained book has no defensive value.** It cannot be taken. The only
motives to claim are tempo, endgame forcing, and — for humans — memory decay. None of those bind a
bot with perfect recall, and under `us54` a *fourth* motive appears that the others do not share:
**a teammate may declare it wrongly first** (out-of-turn declares, [RULES_US54.md §3](RULES_US54.md)).
That intra-team race is the real cost of waiting, and it is what `raceLosses` in
[STYLES.md §4](STYLES.md) measures.

### 1.1 Measurement

Executed against the engine, not derived on paper — see
[tests/engine/containment.test.ts](tests/engine/containment.test.ts):

```
Team A (0,2,4) contains LOW-C; opponents 1,3,5 hold none of it.

C1  no opponent has ANY legal ask into the book        0 found
C2  opponent declaring it                              outcome = team0 (gifted back)
C3  holder's ask into it is legal                      yes
C4  guaranteed miss, turn 0 -> chosen opponent         hit = false
C5  five consecutive uses                              5/5, no cards moved, hand unchanged
C6  after claiming                                     0 remaining asks into the book
```

### 1.2 One correction to the incoming claim

The handoff described the turn-pass as **information-free**. Measured, it is not — but the
qualification is narrow and it makes the move *better*, not worse.

Each ask publishes that the asker holds ≥1 card of the book and **lacks the named card**
(row 17). So the *first* time you name a given card you narrow your own hand by one card. Naming
**the same card again costs nothing new**, and the miss is equally guaranteed. In the measured
position the holder had four distinct nameable cards.

> **Reuse one card as your turn-pass.** The first use spends one card of hand information; every
> repeat after that is genuinely free. Cycling through distinct cards leaks a bit each time for no
> gain.

---

## 2. Evidence tiers

Per the handoff's request, tiers are recorded and **not promoted**.

- **C1–C6: `[measured]`** — executed against this repo's engine under `us54`. This is a statement
  about *this rule set as implemented*, and is the strongest tier available here.
- **Independently attested `[attested-direct]`** — Mike Develin, *The Ten Best Card Games You've
  Never Heard Of*, ch. 9 ([bantha.org](http://www.bantha.org/~develin/cardgames.html)), reached and
  read in this session. On a suit a team controls completely he advises holding it without
  declaring, on the grounds that the only way the opponents can win it is if you declare it wrong —
  and separately names asking into it anyway as a way to pass information to teammates. That is C1,
  C2 and C3 stated by the deepest strategy text on the game, arrived at independently of the
  rules-derivation.
- The incoming handoff marked its versions `[inferred from rules]`. That tier stands for *their*
  document; the promotion here rests on this repo's execution plus Develin, not on their derivation.

**Not corroboration:** any GitHub "Literature" repository from the recent AI-generated cluster,
including this project's own sibling repos. This repo is one of those artifacts too and must not be
cited back as independent support.

### 2.1 Develin adds a use the derivation missed

The rules-derivation frames the contained-book ask as **turn control**. Develin frames it as
**signalling** — a way to tell teammates something through an ask that costs nothing. Both are real
and they compose: one move that picks who acts next *and* carries information to your own side.

Worth flagging honestly: Develin also records that **prearranged conventions are forbidden** in this
tradition. Signalling through legal public asks is not a prearranged convention, but the line
matters and the site should not blur it.

---

## 3. What this changes in the bot

### 3.1 The Hoarder is rehabilitated

[STYLES.md §3](STYLES.md) motivates the Hoarder from row 6 — holding a card is the licence to ask
into a book. This project then concluded the thesis was near-vacuous, reasoning that declaring a book
removes the licence *and the reason to use it* simultaneously, since a resolved book is never worth
asking into.

**That reasoning was wrong.** There is a reason to ask into an unresolved contained book — C3–C5 —
and it exists *only while the book is unclaimed*. Claiming destroys it (C6). Holding is not
inertia; it preserves a repeatable turn-pass and a signalling channel.

The Hoarder's inertness in the pilot is therefore an **implementation gap, not a property of the
rule set**. `withinHoardLimits` gates speculative declares only, and the Hoarder's
`declareThreshold` of 0.975 means it rarely makes one — so the gate never fires.

### 3.2 Two mechanisms the policy does not model

1. **Deliberate known-miss turn-pass.** The engine permits it and the bots effectively never value
   it. Independently flagged as an open question by the FishBot v0.3 paper, whose engine also permits
   known-miss asks and whose policy "almost never" chooses them. Two independent sources plus a
   measured mechanism is enough to make this a real gap.
2. **Hold-contained-books-by-default.** Since claiming is defensively worthless, the declare policy
   for a *fully certain, fully contained* book should trade off tempo and intra-team race risk —
   not treat banking as automatically correct.

### 3.3 Claim EV: keep the two probabilities apart

The handoff's third point, restated in this repo's terms. With `c = P(contained)` and
`a = P(assignment correct | contained)`:

| rule set | declare iff |
|---|---|
| `pagat48` (row 15 **voids**) | `c > 1 / (1 + a)` |
| `us54` (row 14 **gifts**) | `c · a > 1/2` |

This agrees with the derivation already in [STYLES.md §5](STYLES.md), which sets the bar against
*waiting* rather than against *never declaring*: `p > (1 + q)/2` for a risk appetite `q`, which at
`q = 0` reduces to `p > 1/2` — the same floor.

The actionable half is the warning: **do not collapse `c` and `a` into one number.** `planClaim`
currently multiplies per-card probabilities into a single `p`, which conflates *"is this book on my
team"* with *"do I know which teammate holds each card"*. Those have different distributions and
different remedies — the first is resolved by asking, the second by counting — and collapsing them
biases the bot conservative.

### 3.4 A caution for later

**Never let a determinizing search (PIMC) evaluate declares.** Strategy fusion means every sampled
world reports the declare succeeding, so the agent declares constantly and bleeds books. If search is
ever added ([BOT_LAB.md §11](BOT_LAB.md) currently scopes it out), declares must stay gated behind
the §3.3 threshold or an explicit paranoia query.

Related sizing, worth recording because it shapes where effort should go: the branching factor is
≤120 and typically 20–40, against information sets on the order of 10²⁴. **The difficulty is
informational, not combinatorial** — which is the argument for spending on belief quality rather than
search depth, and is the assumption this bot was already built on.

---

## 4. Provenance

Incoming research handoff from a parallel session (`PLAYSTYLES.md`, `docs/FISHAI_HANDOFF.md` on
branch `claude/literature-playstyles-research-zqa3vs` of the demo repo): C1–C6 as
`[inferred from rules]`, the EV thresholds, and the PIMC caution.

Added here: execution against this engine (C1–C6 → `[measured]`), the information-cost correction in
§1.2, Develin ch. 9 read directly, and the consequences for the Hoarder in §3.1.
