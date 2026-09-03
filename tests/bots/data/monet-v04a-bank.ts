/**
 * monet-v04a-bank.ts — GENERATED. Do not edit by hand.
 *
 * `node scripts/byte-identity.mjs --version v0.4a --emit-tree wt --emit-bank tests/bots/data/monet-v04a-bank.ts`
 *
 * Monet v0.4a's own decisions, recorded from the WORKING TREE at the revision v0.4a shipped
 * and pinned here as a FORWARD baseline. Each row is one whole `us54` game: the table style
 * drives it, and the digest runs over the canonical form of the action `monetPolicy("v0.4a")`
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
 * that v0.4a no longer plays the games it was accepted for.
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

export const MONET_V04A_BANK = {
  /** The revision the bank was recorded from — HEAD when the tree is 'wt'. */
  revision: '58e40321d32e9b828bb8a36d41b3b315cbf4da73',
  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */
  tree: 'wt',
  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */
  dirty: false,
  /** How the recorded arm was addressed. */
  arm: 'monetPolicy("v0.4a")',
  totalDecisions: 25709,
  games: [
    { table: 'balanced', seed: 'monet-v04a-balanced-0', startSeat: 1, decisions: 699, digest: 'd3d79651c4153d12' },
    { table: 'balanced', seed: 'monet-v04a-balanced-1', startSeat: 3, decisions: 479, digest: 'bd81be5e7a41272b' },
    { table: 'balanced', seed: 'monet-v04a-balanced-2', startSeat: 5, decisions: 768, digest: '612cbf6ddf92dbcd' },
    { table: 'balanced', seed: 'monet-v04a-balanced-3', startSeat: 1, decisions: 764, digest: 'e72ece24dc7689cf' },
    { table: 'blitz', seed: 'monet-v04a-blitz-0', startSeat: 1, decisions: 674, digest: 'f5e93f0205f816b7' },
    { table: 'blitz', seed: 'monet-v04a-blitz-1', startSeat: 3, decisions: 551, digest: '9009a56530770ceb' },
    { table: 'blitz', seed: 'monet-v04a-blitz-2', startSeat: 5, decisions: 580, digest: '7749bcb2f779da5d' },
    { table: 'blitz', seed: 'monet-v04a-blitz-3', startSeat: 1, decisions: 612, digest: '3f510e0ccc02a32c' },
    { table: 'punter', seed: 'monet-v04a-punter-0', startSeat: 1, decisions: 573, digest: 'e5b0a31cdd241866' },
    { table: 'punter', seed: 'monet-v04a-punter-1', startSeat: 3, decisions: 685, digest: '04c6ba3e1a6274b5' },
    { table: 'punter', seed: 'monet-v04a-punter-2', startSeat: 5, decisions: 585, digest: '90b4c60d9018212a' },
    { table: 'punter', seed: 'monet-v04a-punter-3', startSeat: 1, decisions: 675, digest: 'd27089db1a07689f' },
    { table: 'banker', seed: 'monet-v04a-banker-0', startSeat: 1, decisions: 654, digest: 'e8ec4d712e2152df' },
    { table: 'banker', seed: 'monet-v04a-banker-1', startSeat: 3, decisions: 911, digest: 'e0776957854fc97a' },
    { table: 'banker', seed: 'monet-v04a-banker-2', startSeat: 5, decisions: 645, digest: '0457b75552fceffa' },
    { table: 'banker', seed: 'monet-v04a-banker-3', startSeat: 1, decisions: 597, digest: '54c5834fb5870a3c' },
    { table: 'turtle', seed: 'monet-v04a-turtle-0', startSeat: 1, decisions: 1260, digest: '7f6b35e1e2c9c426' },
    { table: 'turtle', seed: 'monet-v04a-turtle-1', startSeat: 3, decisions: 1253, digest: '6b49d74dacdc0493' },
    { table: 'turtle', seed: 'monet-v04a-turtle-2', startSeat: 5, decisions: 1121, digest: '3cab2d58a22604e9' },
    { table: 'turtle', seed: 'monet-v04a-turtle-3', startSeat: 1, decisions: 852, digest: 'b31c48723b691bff' },
    { table: 'hoarder', seed: 'monet-v04a-hoarder-0', startSeat: 1, decisions: 418, digest: '6ee78355fd96eb8c' },
    { table: 'hoarder', seed: 'monet-v04a-hoarder-1', startSeat: 3, decisions: 608, digest: '109ab4bda322f6c2' },
    { table: 'hoarder', seed: 'monet-v04a-hoarder-2', startSeat: 5, decisions: 719, digest: '5137762fcf9205cc' },
    { table: 'hoarder', seed: 'monet-v04a-hoarder-3', startSeat: 1, decisions: 670, digest: 'f9ffdfa1982ce8f4' },
    { table: 'scout', seed: 'monet-v04a-scout-0', startSeat: 1, decisions: 626, digest: '5b7911a105429448' },
    { table: 'scout', seed: 'monet-v04a-scout-1', startSeat: 3, decisions: 900, digest: '51a1cbb0b2e4c2cb' },
    { table: 'scout', seed: 'monet-v04a-scout-2', startSeat: 5, decisions: 791, digest: '88c59924f92a662b' },
    { table: 'scout', seed: 'monet-v04a-scout-3', startSeat: 1, decisions: 623, digest: '232b67ed6643afdf' },
    { table: 'ghost', seed: 'monet-v04a-ghost-0', startSeat: 1, decisions: 720, digest: 'fa37e1fa0a68d56e' },
    { table: 'ghost', seed: 'monet-v04a-ghost-1', startSeat: 3, decisions: 730, digest: 'f0f80422febbf070' },
    { table: 'ghost', seed: 'monet-v04a-ghost-2', startSeat: 5, decisions: 859, digest: 'b5e69e4c43f850a8' },
    { table: 'ghost', seed: 'monet-v04a-ghost-3', startSeat: 1, decisions: 629, digest: '243e82dc755b001b' },
    { table: 'archivist', seed: 'monet-v04a-archivist-0', startSeat: 1, decisions: 656, digest: '7384ced41a3e724d' },
    { table: 'archivist', seed: 'monet-v04a-archivist-1', startSeat: 3, decisions: 544, digest: '7085aa772fc6cc5e' },
    { table: 'archivist', seed: 'monet-v04a-archivist-2', startSeat: 5, decisions: 662, digest: 'e282af184a8375ef' },
    { table: 'archivist', seed: 'monet-v04a-archivist-3', startSeat: 1, decisions: 616, digest: '91ae51859c647df4' },
  ] as const satisfies readonly BankGame[],
} as const
