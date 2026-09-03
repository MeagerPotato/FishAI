# Bass v2.0 — a FishLab bot package

A bot that plays Canadian Fish (Literature) in the US 54-card student dialect. **Bass** is the
agent line the [FishAI](https://github.com/MeagerPotato/FishAI) project first shipped — v0.5
through v2.0, formerly published as "FishAI vX" — and this is its last, frozen version, the
baseline the project's Monet line is measured against. It is that engine exported
whole: the same rules engine, the same inference layer, the same nine play styles and the same
best-response machinery, with the TypeScript annotations stripped and a protocol adapter bolted
on the front.

**No dependencies.** Pure Node, standard library only, no `requirements.txt`, no virtualenv, and
nothing to install — unzip and seat it. It needs `node` on `PATH`; the package declares its own
module type, so it does not depend on the host's Node being new enough to guess.

```
fishbot.json   the manifest
package.json   `{"type":"module"}` — the engine is ESM and says so rather than inheriting it
bot.mjs        the fishlab-json-v1 loop — reads a line, writes a line, decides nothing
bridge.mjs     the translation layer: FishLab `state` <-> FishAI `SeatView`
engine/        the FishAI bot stack, unmodified apart from type erasure
```

---

## What it plays

Four stages on every decision, none of them switched off:

```
observe            classify              best-respond         delegate
public log  ──►  behaviour per seat ──► style posterior  ──► argmax over a     ──► play it at
                                        (9 hypotheses)       measured 9x9          full inference
                                                             payoff matrix
```

The nine styles are a single shared inference engine under nine different sets of preferences —
declare thresholds, ask weightings, how much information to leak, how long to hoard an
ask-licence — so what varies between them is *style*, not strength. The engine reads which of
the nine each opponent seat most resembles from the public log alone, and plays the style that
scores best against that belief.

The version number names the roster it plays, not the machinery. The four stages above are
v1.0's and none of them changed at v2.0; what v2.0 added is a **defusal term** on every style
(`defuse: 1` on the roster's shared base, CONCESSION.md) — a bot that has watched you show a
basis in a set it holds cards of will go after that card to take the licence back. The
concealment half of that layer is dormant here, as in the repository. So this is v1.0's
adaptive engine playing v2.0's styles, which the archive tag `bass-v2.0` pins to the commit and
which is why it is not called v1.0.

### The one configuration choice, and why

The anchor style is **Punter**, where the research repository ships **Balanced**. That is
deliberate, and it is made on the project's own measurements rather than taste.

The counter table this bot best-responds over was measured across 36 style-vs-style cells at
4,300 duplicate-dealt pairs each. Punter's row came out above every other row in *every* column.
Since the expected payoff is linear in the opponent posterior, one dominant row means the best
response is Punter under every belief the classifier can possibly hold — so the only thing the
anchor changes is what gets played *before* there is enough evidence to switch. A 125,600-game
experiment suite priced that: anchored on Balanced, the adaptive team measured **−0.0136 ±
0.0043** score rate against a pure Punter team, with all nine gauntlet cells negative. Anchoring
on Punter removes the toll.

The repository declines to ship that as its default on purpose — it is a lab whose job is to
report whether adaptation pays, and hard-coding the answer would concede the question. This
package's job is to win a match, so it concedes it, and says so here rather than quietly.

Everything else is reachable through the environment, and none of it is removed:

| variable | default | meaning |
|---|---|---|
| `FISHAI_POLICY` | `adaptive` | `adaptive` / `style` / `bounded` / `easy` / `medium` / `hard` |
| `FISHAI_STYLE` | `punter` | roster style for `style` mode: `balanced` `blitz` `punter` `banker` `turtle` `hoarder` `scout` `ghost` `archivist` |
| `FISHAI_ANCHOR` | `punter` | the adaptive anchor — the warmup style and the switch-margin favourite |
| `FISHAI_WARMUP` | 40 | observed events before a style switch is allowed |
| `FISHAI_BITS` | 64 | memory budget in bits for `bounded` — the difficulty ladder |
| `FISHAI_DEBUG` | unset | `1` narrates every decision to stderr |

`FISHAI_POLICY=style FISHAI_STYLE=punter` plays bit-for-bit the same moves as the default and
skips the classifier pass. `FISHAI_POLICY=bounded FISHAI_BITS=32` is roughly the strength of the
project's shipped "medium" tier, if you want a weaker opponent for testing.

---

## Three places the protocols do not line up

Both are documented rather than papered over, because a bot whose limits are hidden is worse
than one whose limits are stated.

**1. A wrong declaration reveals less here.** FishAI's own engine publishes the true holders of
all six cards on every declaration, right or wrong. `BOT_PACKAGE.md` §6 does not: a wrong
declaration reveals only that it was wrong. The bridge therefore fills the reveal in exactly as
far as the public record justifies — completely for a successful declaration (success *means*
every card was where the declarer said), and for a failed one only with the cards whose location
a hit had already made public. Nothing is guessed and no false certainty is injected; the
inference simply gets weaker in that one spot, and it degrades by declining to draw a conclusion
rather than by drawing a wrong one. It also applies to every bot at the table equally.

**2. There is no forced endgame in this rule set.** When a whole team runs out of cards, FishAI's
dialect has the other team declare the remaining half-suits in the ordinary declare window;
FishLab §5.2 instead sweeps a ladder of confidence thresholds. That request is answered from the
bot's own claim planner for exactly the half-suit asked about, reporting exactly the confidence
that planner computes — not a second estimate written for this host. `last_resort` is always
answered, including from a team with no cards left, because §5.2 is explicit that declining hands
the allocation to the engine's fallback and still records it as the bot's own declaration.

**3. Declining a poll is always legal here, and it was not in the source rule set.** FishAI's
dialect makes `decline` illegal in two positions, because there the declare window is the only
thing between the table and a state with no legal move; its engine answers both by declaring on
best evidence with no threshold at all. **One of those two positions does not exist at a FishLab
table: a seat holding the turn with an empty hand**, which §5.2 sends a `pass` op instead. A
declaration volunteered there is a pure gift, and the adapter declines it.

The second position — a turn-holder still holding cards whose hand affords no legal ask — is real
on both hosts and is answered on both, because declining leads to an `ask` request the hand
cannot answer. As a backstop the adapter never volunteers a declaration its own planner prices at
zero, which is the planner saying it has *proved* the set is not the team's.

An earlier build also declined when every opponent of the turn-holder was out of cards, deferring
to §4's forced sweep. That was a mistake and has been removed: the position is reachable in an
ordinary `us54` game, the engine compels a declaration there, and a seat whose own team holds
every remaining card is not deferring to a better-informed sweep — it is declining sets it can
already prove. It was the package's only divergence from native play.

Beyond those three, the rule sets agree row for row: 54 cards, nine half-suits of six, declaring
legal at any moment from any seat, a wrong declaration awarding the set to the opponents rather
than voiding it, and a cardless player who may still declare.

---

## Checking it

```bash
./fish bots add bass-2.0.zip
./fish bots check fishai
```

No `bots prepare` step is needed — there is nothing to install.

Before it was packaged it was verified against a FishLab-shaped host driven by the repository's
own engine, in three separate child processes over real stdio, using the §4 half-suit numbering
and card names rather than the engine's own: 200 complete games, 68,693 replies, **zero
divergences** from the move the in-repository bot plays on the same position. Mean reply well
under a millisecond; the slowest single reply across a run is a few tens of milliseconds, against
the manifest's 10-second budget.

That harness has one structural blind spot, which is worth stating because it has now hidden two
real bugs: refereed by the source engine, it can only produce positions that rule set can reach.
The positions FishLab has and `us54` does not — a poll sent to a cardless seat still holding the
turn, and the forced sweep — are driven directly instead, by the same suite.

The second bug was the mirror image, and is the reason the game count above went up. A position
assumed to be FishLab-only turned out to be reachable under `us54` after all, so the harness did
referee it — but only past game 40, which is where the committed check stopped. It now runs long
enough to reach it.

---

## Licence

MIT, as the source repository. See <https://github.com/MeagerPotato/FishAI>.
