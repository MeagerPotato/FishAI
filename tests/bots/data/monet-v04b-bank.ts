/**
 * monet-v04b-bank.ts — GENERATED. Do not edit by hand.
 *
 * `node scripts/byte-identity.mjs --version v0.4b --emit-tree wt --emit-bank tests/bots/data/monet-v04b-bank.ts`
 *
 * Monet v0.4b's own decisions, recorded from the WORKING TREE at the revision v0.4b shipped
 * and pinned here as a FORWARD baseline. Each row is one whole `us54` game: the table style
 * drives it, and the digest runs over the canonical form of the action `monetPolicy("v0.4b")`
 * returned at every decision point, in order (`tests/bots/action-digest.ts`).
 *
 * What this fixture is and is not. It certifies NOTHING about an earlier revision — it was
 * recorded from the same tree it will be replayed against, so on the day it was written it
 * could not have failed. Its warrant is the acceptance gates that ran BEFORE it was emitted
 * (`scripts/byte-identity.mjs --gate dead-ask` and `--gate dead-ask-full`, MONET.md §3.2).
 * What it buys is the future: a `decide.ts`, `knowledge.ts`, `roster.ts`, `style.ts` or
 * `reduce.ts` change that moves a single action of a single game breaks a digest here, in a
 * month, when no reference tree is at hand.
 *
 * `revision` is HEAD at the moment of recording and `dirty` says whether the tree matched it.
 * `dirty: true` is the normal case for a bank emitted as part of the milestone it pins: the
 * code was written but not yet committed, so the revision that actually reproduces these
 * digests is the commit that INTRODUCED this file, not the one named below.
 *
 * Regenerating it is a deliberate act, not a fix for a red test: a changed digest is a report
 * that v0.4b no longer plays the games it was accepted for.
 */

/** One whole `us54` game of the bank. */
export interface BankGame {
  /** Roster style every seat plays; it drives the game, so it fixes the positions visited. */
  table: string
  /** Game seed. Move seeds are `hashSeed(`${seed}:${moveIndex}`)()`, as the lab derives them. */
  seed: string
  startSeat: number
  /** Decision points in this game — a shrunken bank is a silently weakened pin. */
  decisions: number
  /** `ActionDigest` over the recorded arm's canonical actions, in order. */
  digest: string
}

export const MONET_V04B_BANK = {
  /** The revision the bank was recorded from — HEAD when the tree is 'wt'. */
  revision: 'b3198dbe3347d0d03521368aba0d6071ab4ff496',
  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */
  tree: 'wt',
  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */
  dirty: false,
  /** How the recorded arm was addressed. */
  arm: 'monetPolicy("v0.4b")',
  totalDecisions: 26648,
  games: [
    { table: 'balanced', seed: 'monet-v04b-balanced-0', startSeat: 1, decisions: 569, digest: '45bb333dc1863930' },
    { table: 'balanced', seed: 'monet-v04b-balanced-1', startSeat: 3, decisions: 676, digest: '742a2de82c47cb78' },
    { table: 'balanced', seed: 'monet-v04b-balanced-2', startSeat: 5, decisions: 613, digest: '2234b9cc51365f6e' },
    { table: 'balanced', seed: 'monet-v04b-balanced-3', startSeat: 1, decisions: 716, digest: 'bd81f1c6f35651b4' },
    { table: 'blitz', seed: 'monet-v04b-blitz-0', startSeat: 1, decisions: 618, digest: 'd9fc38f93c669dc6' },
    { table: 'blitz', seed: 'monet-v04b-blitz-1', startSeat: 3, decisions: 544, digest: 'aa3054b5e18bcd54' },
    { table: 'blitz', seed: 'monet-v04b-blitz-2', startSeat: 5, decisions: 761, digest: '626244f0fb83713a' },
    { table: 'blitz', seed: 'monet-v04b-blitz-3', startSeat: 1, decisions: 546, digest: 'a6cf5e402baba452' },
    { table: 'punter', seed: 'monet-v04b-punter-0', startSeat: 1, decisions: 646, digest: 'bded1031b26f8bc1' },
    { table: 'punter', seed: 'monet-v04b-punter-1', startSeat: 3, decisions: 834, digest: 'b42282c9ea328cca' },
    { table: 'punter', seed: 'monet-v04b-punter-2', startSeat: 5, decisions: 655, digest: 'f2ca4b6b22f62263' },
    { table: 'punter', seed: 'monet-v04b-punter-3', startSeat: 1, decisions: 506, digest: '57b4a8b8916601d6' },
    { table: 'banker', seed: 'monet-v04b-banker-0', startSeat: 1, decisions: 662, digest: 'af1463b065743a20' },
    { table: 'banker', seed: 'monet-v04b-banker-1', startSeat: 3, decisions: 779, digest: '7309c5e9a68cf3ee' },
    { table: 'banker', seed: 'monet-v04b-banker-2', startSeat: 5, decisions: 680, digest: '36a98a74658bff7a' },
    { table: 'banker', seed: 'monet-v04b-banker-3', startSeat: 1, decisions: 726, digest: 'd3977361408f4890' },
    { table: 'turtle', seed: 'monet-v04b-turtle-0', startSeat: 1, decisions: 1512, digest: '1cd34bd660703324' },
    { table: 'turtle', seed: 'monet-v04b-turtle-1', startSeat: 3, decisions: 1317, digest: '7e13fdf29f168d43' },
    { table: 'turtle', seed: 'monet-v04b-turtle-2', startSeat: 5, decisions: 1507, digest: '8c3f605e1271d26c' },
    { table: 'turtle', seed: 'monet-v04b-turtle-3', startSeat: 1, decisions: 883, digest: 'f1c430b0db3b5e68' },
    { table: 'hoarder', seed: 'monet-v04b-hoarder-0', startSeat: 1, decisions: 818, digest: 'a89c2415434ee9c5' },
    { table: 'hoarder', seed: 'monet-v04b-hoarder-1', startSeat: 3, decisions: 668, digest: 'fbcb28c8015328ef' },
    { table: 'hoarder', seed: 'monet-v04b-hoarder-2', startSeat: 5, decisions: 750, digest: '53874afb1851a03a' },
    { table: 'hoarder', seed: 'monet-v04b-hoarder-3', startSeat: 1, decisions: 768, digest: '0f3c29b2d800f9a5' },
    { table: 'scout', seed: 'monet-v04b-scout-0', startSeat: 1, decisions: 821, digest: 'aae21edcb9e2c568' },
    { table: 'scout', seed: 'monet-v04b-scout-1', startSeat: 3, decisions: 595, digest: '4d9dc89eca99b9a5' },
    { table: 'scout', seed: 'monet-v04b-scout-2', startSeat: 5, decisions: 656, digest: '24dd3573efba864f' },
    { table: 'scout', seed: 'monet-v04b-scout-3', startSeat: 1, decisions: 640, digest: '9e87b4e8a48f9987' },
    { table: 'ghost', seed: 'monet-v04b-ghost-0', startSeat: 1, decisions: 540, digest: '58798f750421466d' },
    { table: 'ghost', seed: 'monet-v04b-ghost-1', startSeat: 3, decisions: 804, digest: '940e8848892d8bdc' },
    { table: 'ghost', seed: 'monet-v04b-ghost-2', startSeat: 5, decisions: 953, digest: 'e7c45194e01feeae' },
    { table: 'ghost', seed: 'monet-v04b-ghost-3', startSeat: 1, decisions: 610, digest: '8783943dbd5749ab' },
    { table: 'archivist', seed: 'monet-v04b-archivist-0', startSeat: 1, decisions: 679, digest: 'b85c3fd929612aad' },
    { table: 'archivist', seed: 'monet-v04b-archivist-1', startSeat: 3, decisions: 439, digest: '8fc761b50e51d553' },
    { table: 'archivist', seed: 'monet-v04b-archivist-2', startSeat: 5, decisions: 540, digest: '2498d26e350d5c82' },
    { table: 'archivist', seed: 'monet-v04b-archivist-3', startSeat: 1, decisions: 617, digest: 'cdc3cce67d61909a' },
  ] as const satisfies readonly BankGame[],
} as const
