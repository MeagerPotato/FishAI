/**
 * monet-v054-bank.ts — GENERATED. Do not edit by hand.
 *
 * `node scripts/byte-identity.mjs --version v0.54 --emit-tree wt --bank-seeds 4 --emit-bank tests/bots/data/monet-v054-bank.ts`
 *
 * Monet v0.54's own decisions, recorded from the WORKING TREE at the revision v0.54 shipped
 * and pinned here as a FORWARD baseline. Each row is one whole `us54` game: the table style
 * drives it, and the digest runs over the canonical form of the action `monetPolicy("v0.54")`
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
 * that v0.54 no longer plays the games it was accepted for.
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

export const MONET_V054_BANK = {
  /** The revision the bank was recorded from — HEAD when the tree is 'wt'. */
  revision: 'ddf0827fc0422ace84c6419a06db0e0b43f52ffd',
  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */
  tree: 'wt',
  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */
  dirty: false,
  /** How the recorded arm was addressed. */
  arm: 'monetPolicy("v0.54")',
  totalDecisions: 24771,
  games: [
    { table: 'balanced', seed: 'monet-v054-balanced-0', startSeat: 1, decisions: 728, digest: 'bfe33426ee3eaa81' },
    { table: 'balanced', seed: 'monet-v054-balanced-1', startSeat: 3, decisions: 780, digest: '9bbeb4748c0eb478' },
    { table: 'balanced', seed: 'monet-v054-balanced-2', startSeat: 5, decisions: 401, digest: '57eb8822072aa9f7' },
    { table: 'balanced', seed: 'monet-v054-balanced-3', startSeat: 1, decisions: 431, digest: '3746713361607166' },
    { table: 'blitz', seed: 'monet-v054-blitz-0', startSeat: 1, decisions: 525, digest: 'f59c0923ecfcfe2f' },
    { table: 'blitz', seed: 'monet-v054-blitz-1', startSeat: 3, decisions: 549, digest: '44be5838fe400b7b' },
    { table: 'blitz', seed: 'monet-v054-blitz-2', startSeat: 5, decisions: 663, digest: '6595f290b8affde6' },
    { table: 'blitz', seed: 'monet-v054-blitz-3', startSeat: 1, decisions: 620, digest: 'b1d51c2ce5997f40' },
    { table: 'punter', seed: 'monet-v054-punter-0', startSeat: 1, decisions: 620, digest: 'aa6bb253c07d29a5' },
    { table: 'punter', seed: 'monet-v054-punter-1', startSeat: 3, decisions: 537, digest: 'aa7c5a0d477cf125' },
    { table: 'punter', seed: 'monet-v054-punter-2', startSeat: 5, decisions: 695, digest: 'f888ebb01475442b' },
    { table: 'punter', seed: 'monet-v054-punter-3', startSeat: 1, decisions: 608, digest: '7c04ce14fe86a280' },
    { table: 'banker', seed: 'monet-v054-banker-0', startSeat: 1, decisions: 603, digest: 'e7a1633472ccd4da' },
    { table: 'banker', seed: 'monet-v054-banker-1', startSeat: 3, decisions: 954, digest: 'f9546ef0c636ce50' },
    { table: 'banker', seed: 'monet-v054-banker-2', startSeat: 5, decisions: 818, digest: '09e803ed1cc42e49' },
    { table: 'banker', seed: 'monet-v054-banker-3', startSeat: 1, decisions: 494, digest: '134bf27dd2892421' },
    { table: 'turtle', seed: 'monet-v054-turtle-0', startSeat: 1, decisions: 1604, digest: '7f3b14580d90b592' },
    { table: 'turtle', seed: 'monet-v054-turtle-1', startSeat: 3, decisions: 931, digest: 'da5704396516e326' },
    { table: 'turtle', seed: 'monet-v054-turtle-2', startSeat: 5, decisions: 1261, digest: '0976c52b82798b7f' },
    { table: 'turtle', seed: 'monet-v054-turtle-3', startSeat: 1, decisions: 1528, digest: '033a84417eba4ab6' },
    { table: 'hoarder', seed: 'monet-v054-hoarder-0', startSeat: 1, decisions: 469, digest: '4d9a4e870c2eb457' },
    { table: 'hoarder', seed: 'monet-v054-hoarder-1', startSeat: 3, decisions: 617, digest: 'e65eb813469fe632' },
    { table: 'hoarder', seed: 'monet-v054-hoarder-2', startSeat: 5, decisions: 404, digest: '56f5afe58e62bff1' },
    { table: 'hoarder', seed: 'monet-v054-hoarder-3', startSeat: 1, decisions: 912, digest: 'db3b3f48ae9097d8' },
    { table: 'scout', seed: 'monet-v054-scout-0', startSeat: 1, decisions: 656, digest: '313b25f180b5486c' },
    { table: 'scout', seed: 'monet-v054-scout-1', startSeat: 3, decisions: 403, digest: '4e5d6df87aaef5a2' },
    { table: 'scout', seed: 'monet-v054-scout-2', startSeat: 5, decisions: 559, digest: '199974d1e439483a' },
    { table: 'scout', seed: 'monet-v054-scout-3', startSeat: 1, decisions: 742, digest: '57ad334592ed5f6f' },
    { table: 'ghost', seed: 'monet-v054-ghost-0', startSeat: 1, decisions: 604, digest: '60864d58a26ec061' },
    { table: 'ghost', seed: 'monet-v054-ghost-1', startSeat: 3, decisions: 702, digest: '21bde5fdddbcd6d1' },
    { table: 'ghost', seed: 'monet-v054-ghost-2', startSeat: 5, decisions: 434, digest: 'b7a556cc71c85ce2' },
    { table: 'ghost', seed: 'monet-v054-ghost-3', startSeat: 1, decisions: 721, digest: 'a566d8d576ac8660' },
    { table: 'archivist', seed: 'monet-v054-archivist-0', startSeat: 1, decisions: 685, digest: '9949fc7768f3d0e2' },
    { table: 'archivist', seed: 'monet-v054-archivist-1', startSeat: 3, decisions: 598, digest: '779d833d25074057' },
    { table: 'archivist', seed: 'monet-v054-archivist-2', startSeat: 5, decisions: 418, digest: '71ea5d4b38225f9c' },
    { table: 'archivist', seed: 'monet-v054-archivist-3', startSeat: 1, decisions: 497, digest: 'fa91c29cfa389561' },
  ] as const satisfies readonly BankGame[],
} as const
