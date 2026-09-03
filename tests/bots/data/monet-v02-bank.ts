/**
 * monet-v02-bank.ts — GENERATED. Do not edit by hand.
 *
 * `node scripts/byte-identity.mjs --version v0.2 --emit-tree wt --emit-bank tests/bots/data/monet-v02-bank.ts`
 *
 * Monet v0.2's own decisions, recorded from the WORKING TREE at the revision v0.2 shipped
 * and pinned here as a FORWARD baseline. Each row is one whole `us54` game: the table style
 * drives it, and the digest runs over the canonical form of the action `monetPolicy("v0.2")`
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
 * that v0.2 no longer plays the games it was accepted for.
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

export const MONET_V02_BANK = {
  /** The revision the bank was recorded from — HEAD when the tree is 'wt'. */
  revision: '94e9e6c05623d54575afe3102f1c35b3fd39d619',
  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */
  tree: 'wt',
  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */
  dirty: false,
  /** How the recorded arm was addressed. */
  arm: 'monetPolicy("v0.2")',
  totalDecisions: 25838,
  games: [
    { table: 'balanced', seed: 'monet-v02-balanced-0', startSeat: 1, decisions: 898, digest: '6c2dc98b273fa58a' },
    { table: 'balanced', seed: 'monet-v02-balanced-1', startSeat: 3, decisions: 660, digest: 'b5bc9219a7711d49' },
    { table: 'balanced', seed: 'monet-v02-balanced-2', startSeat: 5, decisions: 795, digest: 'd4847644ec44e2c0' },
    { table: 'balanced', seed: 'monet-v02-balanced-3', startSeat: 1, decisions: 762, digest: 'd3cbd676b2350407' },
    { table: 'blitz', seed: 'monet-v02-blitz-0', startSeat: 1, decisions: 646, digest: 'b9c10e5bbbd777bd' },
    { table: 'blitz', seed: 'monet-v02-blitz-1', startSeat: 3, decisions: 576, digest: 'bc09ad56533e3f58' },
    { table: 'blitz', seed: 'monet-v02-blitz-2', startSeat: 5, decisions: 694, digest: '0fbb071921112cef' },
    { table: 'blitz', seed: 'monet-v02-blitz-3', startSeat: 1, decisions: 651, digest: '091281d5a3e73f16' },
    { table: 'punter', seed: 'monet-v02-punter-0', startSeat: 1, decisions: 769, digest: '21ab82f37e3f18d7' },
    { table: 'punter', seed: 'monet-v02-punter-1', startSeat: 3, decisions: 542, digest: '968ce4853d077b76' },
    { table: 'punter', seed: 'monet-v02-punter-2', startSeat: 5, decisions: 700, digest: 'bbb7d335d6080797' },
    { table: 'punter', seed: 'monet-v02-punter-3', startSeat: 1, decisions: 816, digest: '96c39cb698f81edf' },
    { table: 'banker', seed: 'monet-v02-banker-0', startSeat: 1, decisions: 738, digest: 'cf0f4c5d6ce643f1' },
    { table: 'banker', seed: 'monet-v02-banker-1', startSeat: 3, decisions: 589, digest: '62f26caae6ae2776' },
    { table: 'banker', seed: 'monet-v02-banker-2', startSeat: 5, decisions: 640, digest: 'dc2a3a4b5ba5ad7b' },
    { table: 'banker', seed: 'monet-v02-banker-3', startSeat: 1, decisions: 640, digest: '194dcf44fc0286ac' },
    { table: 'turtle', seed: 'monet-v02-turtle-0', startSeat: 1, decisions: 1098, digest: '4b59d7ebbf82a902' },
    { table: 'turtle', seed: 'monet-v02-turtle-1', startSeat: 3, decisions: 1338, digest: '78e55a2db2b16d67' },
    { table: 'turtle', seed: 'monet-v02-turtle-2', startSeat: 5, decisions: 828, digest: 'd02b81e6cd606aba' },
    { table: 'turtle', seed: 'monet-v02-turtle-3', startSeat: 1, decisions: 839, digest: '465a10283f9e670d' },
    { table: 'hoarder', seed: 'monet-v02-hoarder-0', startSeat: 1, decisions: 573, digest: '73bdc9fa6f3cfa14' },
    { table: 'hoarder', seed: 'monet-v02-hoarder-1', startSeat: 3, decisions: 778, digest: 'e7b8b370ce107366' },
    { table: 'hoarder', seed: 'monet-v02-hoarder-2', startSeat: 5, decisions: 940, digest: '3885dc733e1f40f0' },
    { table: 'hoarder', seed: 'monet-v02-hoarder-3', startSeat: 1, decisions: 822, digest: 'a816e615c6287aa6' },
    { table: 'scout', seed: 'monet-v02-scout-0', startSeat: 1, decisions: 621, digest: 'f95148cf66a26355' },
    { table: 'scout', seed: 'monet-v02-scout-1', startSeat: 3, decisions: 678, digest: 'e20731286987cb91' },
    { table: 'scout', seed: 'monet-v02-scout-2', startSeat: 5, decisions: 420, digest: '4c8278612f8cf782' },
    { table: 'scout', seed: 'monet-v02-scout-3', startSeat: 1, decisions: 493, digest: 'b354461af6baa13e' },
    { table: 'ghost', seed: 'monet-v02-ghost-0', startSeat: 1, decisions: 791, digest: '945da62cf9780166' },
    { table: 'ghost', seed: 'monet-v02-ghost-1', startSeat: 3, decisions: 705, digest: '115164d81c14d922' },
    { table: 'ghost', seed: 'monet-v02-ghost-2', startSeat: 5, decisions: 702, digest: '87dc82b84f4e21f8' },
    { table: 'ghost', seed: 'monet-v02-ghost-3', startSeat: 1, decisions: 635, digest: '2726bce25aa5ce6c' },
    { table: 'archivist', seed: 'monet-v02-archivist-0', startSeat: 1, decisions: 609, digest: '1dc2da668b25a64a' },
    { table: 'archivist', seed: 'monet-v02-archivist-1', startSeat: 3, decisions: 679, digest: '283db397aee5cbc1' },
    { table: 'archivist', seed: 'monet-v02-archivist-2', startSeat: 5, decisions: 564, digest: 'cf766fcd7d483365' },
    { table: 'archivist', seed: 'monet-v02-archivist-3', startSeat: 1, decisions: 609, digest: '8c251681fa8cf211' },
  ] as const satisfies readonly BankGame[],
} as const
