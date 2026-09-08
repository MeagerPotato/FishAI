/**
 * monet-v030-bank.ts — GENERATED. Do not edit by hand.
 *
 * `node scripts/byte-identity.mjs --version v0.30 --emit-tree wt --bank-seeds 4 --emit-bank tests/bots/data/monet-v030-bank.ts`
 *
 * Monet v0.30's own decisions, recorded from the WORKING TREE at the revision v0.30 shipped
 * and pinned here as a FORWARD baseline. Each row is one whole `us54` game: the table style
 * drives it, and the digest runs over the canonical form of the action `monetPolicy("v0.30")`
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
 * that v0.30 no longer plays the games it was accepted for.
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

export const MONET_V030_BANK = {
  /** The revision the bank was recorded from — HEAD when the tree is 'wt'. */
  revision: 'cf977bd37b26ba37eeceba3e1fcc474d6fffac96',
  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */
  tree: 'wt',
  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */
  dirty: false,
  /** How the recorded arm was addressed. */
  arm: 'monetPolicy("v0.30")',
  totalDecisions: 26510,
  games: [
    { table: 'balanced', seed: 'monet-v030-balanced-0', startSeat: 1, decisions: 724, digest: 'e4f83f2b3fac310e' },
    { table: 'balanced', seed: 'monet-v030-balanced-1', startSeat: 3, decisions: 710, digest: 'daf482a93f0a66e0' },
    { table: 'balanced', seed: 'monet-v030-balanced-2', startSeat: 5, decisions: 867, digest: '9f4736af56c0140d' },
    { table: 'balanced', seed: 'monet-v030-balanced-3', startSeat: 1, decisions: 677, digest: '100232a873ad1018' },
    { table: 'blitz', seed: 'monet-v030-blitz-0', startSeat: 1, decisions: 633, digest: '2e9700eab2956aa6' },
    { table: 'blitz', seed: 'monet-v030-blitz-1', startSeat: 3, decisions: 413, digest: 'cd81516791a993fd' },
    { table: 'blitz', seed: 'monet-v030-blitz-2', startSeat: 5, decisions: 630, digest: 'df58fbf9f14da68d' },
    { table: 'blitz', seed: 'monet-v030-blitz-3', startSeat: 1, decisions: 623, digest: 'c2c25b7a936bb2c1' },
    { table: 'punter', seed: 'monet-v030-punter-0', startSeat: 1, decisions: 830, digest: '2bd7caabcda53d9e' },
    { table: 'punter', seed: 'monet-v030-punter-1', startSeat: 3, decisions: 640, digest: '9d14a4e118bd0f50' },
    { table: 'punter', seed: 'monet-v030-punter-2', startSeat: 5, decisions: 600, digest: 'dacd48b9b959e74c' },
    { table: 'punter', seed: 'monet-v030-punter-3', startSeat: 1, decisions: 664, digest: '116bd827821484da' },
    { table: 'banker', seed: 'monet-v030-banker-0', startSeat: 1, decisions: 569, digest: '8806fd74d5cc93fd' },
    { table: 'banker', seed: 'monet-v030-banker-1', startSeat: 3, decisions: 778, digest: '2d6cd2238ed4d830' },
    { table: 'banker', seed: 'monet-v030-banker-2', startSeat: 5, decisions: 422, digest: 'f9762a7af88aef59' },
    { table: 'banker', seed: 'monet-v030-banker-3', startSeat: 1, decisions: 820, digest: '203798e6238f11cc' },
    { table: 'turtle', seed: 'monet-v030-turtle-0', startSeat: 1, decisions: 1041, digest: 'c967f11d1d2964ea' },
    { table: 'turtle', seed: 'monet-v030-turtle-1', startSeat: 3, decisions: 1492, digest: 'c655638c465a1fef' },
    { table: 'turtle', seed: 'monet-v030-turtle-2', startSeat: 5, decisions: 1241, digest: '9a9f61844b48f469' },
    { table: 'turtle', seed: 'monet-v030-turtle-3', startSeat: 1, decisions: 1071, digest: '5a7e102f37a5c72f' },
    { table: 'hoarder', seed: 'monet-v030-hoarder-0', startSeat: 1, decisions: 839, digest: '4fb88e99abee8581' },
    { table: 'hoarder', seed: 'monet-v030-hoarder-1', startSeat: 3, decisions: 958, digest: '7eedee44e8c981d5' },
    { table: 'hoarder', seed: 'monet-v030-hoarder-2', startSeat: 5, decisions: 689, digest: 'af7c361b4b9636cf' },
    { table: 'hoarder', seed: 'monet-v030-hoarder-3', startSeat: 1, decisions: 625, digest: '497aacda1c23d226' },
    { table: 'scout', seed: 'monet-v030-scout-0', startSeat: 1, decisions: 789, digest: '1322d4ea11d7b430' },
    { table: 'scout', seed: 'monet-v030-scout-1', startSeat: 3, decisions: 765, digest: '2933dd9293e82a16' },
    { table: 'scout', seed: 'monet-v030-scout-2', startSeat: 5, decisions: 768, digest: '5760f87466ed9d7a' },
    { table: 'scout', seed: 'monet-v030-scout-3', startSeat: 1, decisions: 761, digest: 'bde38f530795e7b9' },
    { table: 'ghost', seed: 'monet-v030-ghost-0', startSeat: 1, decisions: 597, digest: '6fdccb119f2df192' },
    { table: 'ghost', seed: 'monet-v030-ghost-1', startSeat: 3, decisions: 446, digest: 'a51a246d180710e6' },
    { table: 'ghost', seed: 'monet-v030-ghost-2', startSeat: 5, decisions: 862, digest: '0094152ca17f0a77' },
    { table: 'ghost', seed: 'monet-v030-ghost-3', startSeat: 1, decisions: 606, digest: '87468ec20fa331c1' },
    { table: 'archivist', seed: 'monet-v030-archivist-0', startSeat: 1, decisions: 673, digest: '5ac7b8bc2a3258ed' },
    { table: 'archivist', seed: 'monet-v030-archivist-1', startSeat: 3, decisions: 628, digest: '0cdd0631a39137c4' },
    { table: 'archivist', seed: 'monet-v030-archivist-2', startSeat: 5, decisions: 680, digest: 'a228abe4312e7283' },
    { table: 'archivist', seed: 'monet-v030-archivist-3', startSeat: 1, decisions: 379, digest: 'e4d4557d96a66a60' },
  ] as const satisfies readonly BankGame[],
} as const
