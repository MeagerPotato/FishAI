# ATHENA-stub 0.0: a FishLab bot package

The inference contract of FishAI's ATHENA line (ATHENA.md §4.5 item 6, gate G0d), packaged as a FishLab guest bot.
**It is not a player.** Its network has fixed random weights (size S, drawn from a fixed seed), so its asks are
arbitrary legal asks. It loses nearly every game against any real bot. What it proves is the path: a trained ATHENA
network will run behind this adapter, in this package shape, with its weight file pinned by md5. Every ask it makes
is reproduced in-engine by the same JavaScript forward.

No dependencies: pure Node, standard library only. It needs `node` on `PATH`.

```
fishbot.json              the manifest; env names the weight file and pins its md5
package.json              {"type": "module"}
bot.mjs                   the fishlab-json-v1 loop, PASSFIX, MUSTFIX, the fault counters
bridge.mjs                FishLab state <-> FishAI SeatView (no decisions)
lib/athena/               the encoder, the forward and the stub policy (type-stripped from the repository's lib/athena)
lib/engine/               the parts of FishAI's us54 engine they import (type-stripped)
weights/athena-stub-s.bin the network, athena-weights-1
```

## What it plays

| request | answer |
|---|---|
| `ask` | the ask head's argmax over the legal (card, target) pairs; ties go to the lower action code |
| `declare_poll` | **the rail** first: the first open half-suit, in canonical order, whose six holders the rules fix on this team (`lib/engine/bots/knowledge.ts`), declared at confidence 1. Otherwise it declines where declining is legal. Where us54 compels a claim, it takes the declare head's argmax over the open sets that are not proved lost, with the plan below. |
| `pass` | the pass head's argmax over the legal teammates |
| `forced` | the plan below for the named half-suit. It declares if the plan is certain, clears the bar, or `last_resort` is set. A resolved half-suit is always `none`. |

**The plan.** Holders fixed by the rules stay where they are. Each other card goes to the own-team candidate with
the highest belief logit plus assignment logit. The confidence is the product, over those cards, of the belief
softmax across the rules' candidates. It is exactly 1 when the set is certain and 0 when the set is proved lost;
otherwise it is capped at 1 - 1e-6.

**Not played.** The stub declines every optional window without consulting the declare head: P1 registers how a
speculative declaration is gated. The belief and assignment heads are read only by the plan; the value head is
computed and never read.

## The adapter's two fixes

Both apply only to compelled claims, the positions where the us54 rules make declining illegal. The Monet arms do
the same (MONET.md §3.8f; the bridge archive's CORRECTED-FACTS §1).

- **PASSFIX.** A poll to a turn-holder with no cards is answered `none`. The host has a `pass` for that position.
- **MUSTFIX.** A compelled claim that is not certain (confidence below 1) is answered `none`. The host's forced
  endgame then resolves the position through `forced`. A certain compelled claim goes out as usual.

## What the bridge reads

- **The reduced reveal** (ATHENA.md §4.1). A right declare publishes its six holders. A wrong declare publishes only
  the cards a hit had already located, at the seat that hit them. The other holders are absent: they encode as
  `NONE`, and so does the "how" byte whenever the published holders cannot settle it.
- **The start seat.** The host's state does not name it. `game_started` takes the first history event's actor, or
  the turn-holder while the history is empty. The two differ only when the first event is an out-of-turn declare.
- **The score** is counted by team from the history's declares.

## The weights

`athena-weights-1`. The file starts with the magic `ATHENAW1`, then a u32 little-endian header length, then a JSON
header padded with spaces to 4-byte alignment: the format, the architecture, the tensor table and provenance. The
weights follow as float32 little-endian, in the tensor table's order.

The frozen file is `initBlob(ARCHS.S, "athena-stub-v0.0-S")`. The build refuses unless the file's md5 equals the one
`fishbot.json` pins. At start the bot refuses (exit 2, before any handshake) a file whose md5 is not the manifest's.

The forward is deterministic. All arithmetic is float64 in a fixed order. The exponential is a table-and-polynomial
`expDet`, not `Math.exp` or `Math.tanh`. Per seat, the GRU state is a left fold over the event rows, so the package's
incremental cache equals a full refold bit for bit.

## Counters

When its input ends, the process writes one line to stderr, `ATHENA COUNTERS {...}`, holding every counter. The
counters named in `faultNames` are bugs if they are non-zero. They cover a decision that threw, a reply of the wrong
kind, a malformed declaration, a `forced` under `last_resort` it could not answer, and every inconsistency the bridge
finds between the history and the state.

## Build and check

```
npm run athena:stub          # dist/athena-stub/ and dist/athena-stub.zip
npm run athena:stub:check    # the 200-game self-test, the forced test, and the in-engine pin of every ask
```
