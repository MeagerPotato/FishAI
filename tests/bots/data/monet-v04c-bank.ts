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
  revision: 'a556152106ee21277702dfc035232c4a19f6a3ed',
  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */
  tree: 'wt',
  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */
  dirty: false,
  /** How the recorded arm was addressed. */
  arm: 'monetPolicy("v0.4c")',
  totalDecisions: 25463,
  games: [
    { table: 'balanced', seed: 'monet-v04c-balanced-0', startSeat: 1, decisions: 536, digest: '0b6ce6afa8488b62' },
    { table: 'balanced', seed: 'monet-v04c-balanced-1', startSeat: 3, decisions: 319, digest: '2586139a3a692b4b' },
    { table: 'balanced', seed: 'monet-v04c-balanced-2', startSeat: 5, decisions: 665, digest: '268582efb5794e00' },
    { table: 'balanced', seed: 'monet-v04c-balanced-3', startSeat: 1, decisions: 699, digest: 'f12609c5417d95a9' },
    { table: 'blitz', seed: 'monet-v04c-blitz-0', startSeat: 1, decisions: 764, digest: 'b7882c6608ea622a' },
    { table: 'blitz', seed: 'monet-v04c-blitz-1', startSeat: 3, decisions: 366, digest: '90f0cc174d2a5568' },
    { table: 'blitz', seed: 'monet-v04c-blitz-2', startSeat: 5, decisions: 643, digest: '55e0dc44baaf01ff' },
    { table: 'blitz', seed: 'monet-v04c-blitz-3', startSeat: 1, decisions: 684, digest: '1c04360fcd251021' },
    { table: 'punter', seed: 'monet-v04c-punter-0', startSeat: 1, decisions: 573, digest: '97c112c83d21f15b' },
    { table: 'punter', seed: 'monet-v04c-punter-1', startSeat: 3, decisions: 746, digest: '0bd8e12baac3132d' },
    { table: 'punter', seed: 'monet-v04c-punter-2', startSeat: 5, decisions: 539, digest: '0c70b6fe4605e7fb' },
    { table: 'punter', seed: 'monet-v04c-punter-3', startSeat: 1, decisions: 600, digest: '20fee825e6498c01' },
    { table: 'banker', seed: 'monet-v04c-banker-0', startSeat: 1, decisions: 657, digest: '1d5f6518fbe38226' },
    { table: 'banker', seed: 'monet-v04c-banker-1', startSeat: 3, decisions: 745, digest: 'd695c5fa041ca3f8' },
    { table: 'banker', seed: 'monet-v04c-banker-2', startSeat: 5, decisions: 535, digest: '10ea85cd433edef7' },
    { table: 'banker', seed: 'monet-v04c-banker-3', startSeat: 1, decisions: 579, digest: '2d60cab425143b63' },
    { table: 'turtle', seed: 'monet-v04c-turtle-0', startSeat: 1, decisions: 1612, digest: 'af39ce1567cca3db' },
    { table: 'turtle', seed: 'monet-v04c-turtle-1', startSeat: 3, decisions: 1423, digest: 'f1206cda09a3bf24' },
    { table: 'turtle', seed: 'monet-v04c-turtle-2', startSeat: 5, decisions: 1216, digest: '74b65b61ff4e92b0' },
    { table: 'turtle', seed: 'monet-v04c-turtle-3', startSeat: 1, decisions: 1163, digest: '1723c9563aa20957' },
    { table: 'hoarder', seed: 'monet-v04c-hoarder-0', startSeat: 1, decisions: 763, digest: 'dc4e294bda786357' },
    { table: 'hoarder', seed: 'monet-v04c-hoarder-1', startSeat: 3, decisions: 812, digest: 'c9359c12f2cbe880' },
    { table: 'hoarder', seed: 'monet-v04c-hoarder-2', startSeat: 5, decisions: 491, digest: '584dfd748d1fd3a0' },
    { table: 'hoarder', seed: 'monet-v04c-hoarder-3', startSeat: 1, decisions: 642, digest: '68e4f42c77467b30' },
    { table: 'scout', seed: 'monet-v04c-scout-0', startSeat: 1, decisions: 797, digest: '20f60668afc51ca4' },
    { table: 'scout', seed: 'monet-v04c-scout-1', startSeat: 3, decisions: 682, digest: '10ae626b0e8cb14b' },
    { table: 'scout', seed: 'monet-v04c-scout-2', startSeat: 5, decisions: 750, digest: '1e04377573dc7986' },
    { table: 'scout', seed: 'monet-v04c-scout-3', startSeat: 1, decisions: 737, digest: 'f0e9671912f3d849' },
    { table: 'ghost', seed: 'monet-v04c-ghost-0', startSeat: 1, decisions: 518, digest: 'c02fa3096d94ae48' },
    { table: 'ghost', seed: 'monet-v04c-ghost-1', startSeat: 3, decisions: 476, digest: '84f2f341a4e93936' },
    { table: 'ghost', seed: 'monet-v04c-ghost-2', startSeat: 5, decisions: 698, digest: '87e88bdf9dd3f8f7' },
    { table: 'ghost', seed: 'monet-v04c-ghost-3', startSeat: 1, decisions: 627, digest: '641645f88d25d776' },
    { table: 'archivist', seed: 'monet-v04c-archivist-0', startSeat: 1, decisions: 607, digest: 'e6fbd7e72e9cccc5' },
    { table: 'archivist', seed: 'monet-v04c-archivist-1', startSeat: 3, decisions: 755, digest: 'fd39a9f0dbd6e641' },
    { table: 'archivist', seed: 'monet-v04c-archivist-2', startSeat: 5, decisions: 516, digest: 'ed32c583bcc094f7' },
    { table: 'archivist', seed: 'monet-v04c-archivist-3', startSeat: 1, decisions: 528, digest: 'f8cf52be4a801261' },
  ] as const satisfies readonly BankGame[],
} as const
