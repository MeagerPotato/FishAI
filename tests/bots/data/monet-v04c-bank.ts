/**
 * monet-v04c-bank.ts — GENERATED. Do not edit by hand.
 *
 * `node scripts/byte-identity.mjs --version v0.4c --emit-tree wt --emit-bank tests/bots/data/monet-v04c-bank.ts`
 *
 * Monet v0.4c's own decisions, recorded from the WORKING TREE at the revision v0.4c shipped
 * and pinned here as a FORWARD baseline. Each row is one whole `us54` game: the table style
 * drives it, and the digest runs over the canonical form of the action `monetPolicy("v0.4c")`
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
 * that v0.4c no longer plays the games it was accepted for.
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

export const MONET_V04C_BANK = {
  /** The revision the bank was recorded from — HEAD when the tree is 'wt'. */
  revision: 'c00a33b67e0c67352e435c817c14a88abeb5fb4f',
  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */
  tree: 'wt',
  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */
  dirty: false,
  /** How the recorded arm was addressed. */
  arm: 'monetPolicy("v0.4c")',
  totalDecisions: 25463,
  games: [
    { table: 'balanced', seed: 'monet-v04c-balanced-0', startSeat: 1, decisions: 536, digest: 'b627ee229136851e' },
    { table: 'balanced', seed: 'monet-v04c-balanced-1', startSeat: 3, decisions: 319, digest: '098b05ce4a740f07' },
    { table: 'balanced', seed: 'monet-v04c-balanced-2', startSeat: 5, decisions: 665, digest: '945a5cade29155cb' },
    { table: 'balanced', seed: 'monet-v04c-balanced-3', startSeat: 1, decisions: 699, digest: '0ccd06c6709b218c' },
    { table: 'blitz', seed: 'monet-v04c-blitz-0', startSeat: 1, decisions: 764, digest: 'd89151c00000b6f2' },
    { table: 'blitz', seed: 'monet-v04c-blitz-1', startSeat: 3, decisions: 366, digest: '90f0cc174d2a5568' },
    { table: 'blitz', seed: 'monet-v04c-blitz-2', startSeat: 5, decisions: 643, digest: '9051af439c0d8d1a' },
    { table: 'blitz', seed: 'monet-v04c-blitz-3', startSeat: 1, decisions: 684, digest: '166b9eebfc55f2cf' },
    { table: 'punter', seed: 'monet-v04c-punter-0', startSeat: 1, decisions: 573, digest: '04d2894b1b8969d7' },
    { table: 'punter', seed: 'monet-v04c-punter-1', startSeat: 3, decisions: 746, digest: 'cfcff5f912e98c65' },
    { table: 'punter', seed: 'monet-v04c-punter-2', startSeat: 5, decisions: 539, digest: '0c70b6fe4605e7fb' },
    { table: 'punter', seed: 'monet-v04c-punter-3', startSeat: 1, decisions: 600, digest: 'f59a7efcabf7b0da' },
    { table: 'banker', seed: 'monet-v04c-banker-0', startSeat: 1, decisions: 657, digest: '9ee628b74e4a0860' },
    { table: 'banker', seed: 'monet-v04c-banker-1', startSeat: 3, decisions: 745, digest: 'd695c5fa041ca3f8' },
    { table: 'banker', seed: 'monet-v04c-banker-2', startSeat: 5, decisions: 535, digest: 'c93763133e79ba1d' },
    { table: 'banker', seed: 'monet-v04c-banker-3', startSeat: 1, decisions: 579, digest: '41eeeb49b5dcce95' },
    { table: 'turtle', seed: 'monet-v04c-turtle-0', startSeat: 1, decisions: 1612, digest: 'd711394372c2d5bd' },
    { table: 'turtle', seed: 'monet-v04c-turtle-1', startSeat: 3, decisions: 1423, digest: '49784e0600188be4' },
    { table: 'turtle', seed: 'monet-v04c-turtle-2', startSeat: 5, decisions: 1216, digest: '11b45e109d19b123' },
    { table: 'turtle', seed: 'monet-v04c-turtle-3', startSeat: 1, decisions: 1163, digest: '15351cac052324cf' },
    { table: 'hoarder', seed: 'monet-v04c-hoarder-0', startSeat: 1, decisions: 763, digest: '109d3bcc7f47545b' },
    { table: 'hoarder', seed: 'monet-v04c-hoarder-1', startSeat: 3, decisions: 812, digest: '8a3aba62b84792c1' },
    { table: 'hoarder', seed: 'monet-v04c-hoarder-2', startSeat: 5, decisions: 491, digest: '0130731792cd8d6d' },
    { table: 'hoarder', seed: 'monet-v04c-hoarder-3', startSeat: 1, decisions: 642, digest: '26d034f10f2c19f3' },
    { table: 'scout', seed: 'monet-v04c-scout-0', startSeat: 1, decisions: 797, digest: '6bae982e30bec895' },
    { table: 'scout', seed: 'monet-v04c-scout-1', startSeat: 3, decisions: 682, digest: 'd803ac920dda34dc' },
    { table: 'scout', seed: 'monet-v04c-scout-2', startSeat: 5, decisions: 750, digest: 'af68a1ed263c1a30' },
    { table: 'scout', seed: 'monet-v04c-scout-3', startSeat: 1, decisions: 737, digest: '737eeb781d0fa84a' },
    { table: 'ghost', seed: 'monet-v04c-ghost-0', startSeat: 1, decisions: 518, digest: 'c02fa3096d94ae48' },
    { table: 'ghost', seed: 'monet-v04c-ghost-1', startSeat: 3, decisions: 476, digest: 'd2340b4f9af14ce3' },
    { table: 'ghost', seed: 'monet-v04c-ghost-2', startSeat: 5, decisions: 698, digest: 'babe3952d0ed78e5' },
    { table: 'ghost', seed: 'monet-v04c-ghost-3', startSeat: 1, decisions: 627, digest: '16d75fe760037e5d' },
    { table: 'archivist', seed: 'monet-v04c-archivist-0', startSeat: 1, decisions: 607, digest: 'a05d5a8e8b04b299' },
    { table: 'archivist', seed: 'monet-v04c-archivist-1', startSeat: 3, decisions: 755, digest: 'fa7567d79ad4f46b' },
    { table: 'archivist', seed: 'monet-v04c-archivist-2', startSeat: 5, decisions: 516, digest: 'ed32c583bcc094f7' },
    { table: 'archivist', seed: 'monet-v04c-archivist-3', startSeat: 1, decisions: 528, digest: '0e859f18f673d1d1' },
  ] as const satisfies readonly BankGame[],
} as const
