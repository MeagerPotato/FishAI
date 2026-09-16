/**
 * monet-v053-bank.ts — GENERATED. Do not edit by hand.
 *
 * `node scripts/byte-identity.mjs --version v0.53 --emit-tree wt --bank-seeds 4 --emit-bank tests/bots/data/monet-v053-bank.ts`
 *
 * Monet v0.53's own decisions, recorded from the WORKING TREE at the revision v0.53 shipped
 * and pinned here as a FORWARD baseline. Each row is one whole `us54` game: the table style
 * drives it, and the digest runs over the canonical form of the action `monetPolicy("v0.53")`
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
 * that v0.53 no longer plays the games it was accepted for.
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

export const MONET_V053_BANK = {
  /** The revision the bank was recorded from — HEAD when the tree is 'wt'. */
  revision: 'de142b2a66c118a94f3342a77924851fb0740ea0',
  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */
  tree: 'wt',
  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */
  dirty: false,
  /** How the recorded arm was addressed. */
  arm: 'monetPolicy("v0.53")',
  totalDecisions: 27263,
  games: [
    { table: 'balanced', seed: 'monet-v053-balanced-0', startSeat: 1, decisions: 519, digest: '97ef7e3dddc8f1a7' },
    { table: 'balanced', seed: 'monet-v053-balanced-1', startSeat: 3, decisions: 580, digest: '39b2826ab93ad012' },
    { table: 'balanced', seed: 'monet-v053-balanced-2', startSeat: 5, decisions: 440, digest: 'd87349e4b18494df' },
    { table: 'balanced', seed: 'monet-v053-balanced-3', startSeat: 1, decisions: 570, digest: '59cce9d8f6169e41' },
    { table: 'blitz', seed: 'monet-v053-blitz-0', startSeat: 1, decisions: 518, digest: '68b19e33fd93d983' },
    { table: 'blitz', seed: 'monet-v053-blitz-1', startSeat: 3, decisions: 687, digest: '5749ae0016c48914' },
    { table: 'blitz', seed: 'monet-v053-blitz-2', startSeat: 5, decisions: 672, digest: '561eb35d25a7a7f9' },
    { table: 'blitz', seed: 'monet-v053-blitz-3', startSeat: 1, decisions: 759, digest: '047040137f33d4e2' },
    { table: 'punter', seed: 'monet-v053-punter-0', startSeat: 1, decisions: 611, digest: 'dba962df62f04e2a' },
    { table: 'punter', seed: 'monet-v053-punter-1', startSeat: 3, decisions: 662, digest: 'c36ddd3a24a429c7' },
    { table: 'punter', seed: 'monet-v053-punter-2', startSeat: 5, decisions: 795, digest: '92d74cae0928d828' },
    { table: 'punter', seed: 'monet-v053-punter-3', startSeat: 1, decisions: 676, digest: '6c01f578d68b30fa' },
    { table: 'banker', seed: 'monet-v053-banker-0', startSeat: 1, decisions: 848, digest: '43237374d320ed7e' },
    { table: 'banker', seed: 'monet-v053-banker-1', startSeat: 3, decisions: 742, digest: 'a7f7026e7d2dafc8' },
    { table: 'banker', seed: 'monet-v053-banker-2', startSeat: 5, decisions: 693, digest: 'b9a65f64fe7e3a46' },
    { table: 'banker', seed: 'monet-v053-banker-3', startSeat: 1, decisions: 680, digest: '4394d97aadc0968a' },
    { table: 'turtle', seed: 'monet-v053-turtle-0', startSeat: 1, decisions: 1367, digest: 'afbb46d1c9887769' },
    { table: 'turtle', seed: 'monet-v053-turtle-1', startSeat: 3, decisions: 1010, digest: 'd9b6bcf28e81649f' },
    { table: 'turtle', seed: 'monet-v053-turtle-2', startSeat: 5, decisions: 1259, digest: '216c8c9782f00b61' },
    { table: 'turtle', seed: 'monet-v053-turtle-3', startSeat: 1, decisions: 1443, digest: '32eb4d1d52166eef' },
    { table: 'hoarder', seed: 'monet-v053-hoarder-0', startSeat: 1, decisions: 836, digest: '58577450e056dedf' },
    { table: 'hoarder', seed: 'monet-v053-hoarder-1', startSeat: 3, decisions: 1123, digest: '609af47946f0d0da' },
    { table: 'hoarder', seed: 'monet-v053-hoarder-2', startSeat: 5, decisions: 595, digest: '73c5cdb303b844ef' },
    { table: 'hoarder', seed: 'monet-v053-hoarder-3', startSeat: 1, decisions: 755, digest: 'f833bb34c2dac1c6' },
    { table: 'scout', seed: 'monet-v053-scout-0', startSeat: 1, decisions: 652, digest: '4d853c03614683f2' },
    { table: 'scout', seed: 'monet-v053-scout-1', startSeat: 3, decisions: 699, digest: '3b9a224eb0306a37' },
    { table: 'scout', seed: 'monet-v053-scout-2', startSeat: 5, decisions: 617, digest: 'fd158d4d3609478b' },
    { table: 'scout', seed: 'monet-v053-scout-3', startSeat: 1, decisions: 838, digest: '285173d70f534039' },
    { table: 'ghost', seed: 'monet-v053-ghost-0', startSeat: 1, decisions: 567, digest: 'a15a6e88ede9358c' },
    { table: 'ghost', seed: 'monet-v053-ghost-1', startSeat: 3, decisions: 637, digest: 'd8b09c1fa7c0849e' },
    { table: 'ghost', seed: 'monet-v053-ghost-2', startSeat: 5, decisions: 735, digest: '2ff9fd055981a6b5' },
    { table: 'ghost', seed: 'monet-v053-ghost-3', startSeat: 1, decisions: 767, digest: '1e5614d58382eb46' },
    { table: 'archivist', seed: 'monet-v053-archivist-0', startSeat: 1, decisions: 789, digest: '1df9ea5497b0643e' },
    { table: 'archivist', seed: 'monet-v053-archivist-1', startSeat: 3, decisions: 770, digest: 'dd4ee4c5d236e2f1' },
    { table: 'archivist', seed: 'monet-v053-archivist-2', startSeat: 5, decisions: 672, digest: 'f4fb92be63dd6e2e' },
    { table: 'archivist', seed: 'monet-v053-archivist-3', startSeat: 1, decisions: 680, digest: '9b2945a4e7ffcfd7' },
  ] as const satisfies readonly BankGame[],
} as const
