/**
 * monet-v033-bank.ts — GENERATED. Do not edit by hand.
 *
 * `node scripts/byte-identity.mjs --version v0.33 --emit-tree wt --bank-seeds 4 --emit-bank tests/bots/data/monet-v033-bank.ts`
 *
 * Monet v0.33's own decisions, recorded from the WORKING TREE at the revision v0.33 shipped
 * and pinned here as a FORWARD baseline. Each row is one whole `us54` game: the table style
 * drives it, and the digest runs over the canonical form of the action `monetPolicy("v0.33")`
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
 * that v0.33 no longer plays the games it was accepted for.
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

export const MONET_V033_BANK = {
  /** The revision the bank was recorded from — HEAD when the tree is 'wt'. */
  revision: '3d1bbdad8243a6d9e7277ce8c14c50366b274491',
  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */
  tree: 'wt',
  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */
  dirty: false,
  /** How the recorded arm was addressed. */
  arm: 'monetPolicy("v0.33")',
  totalDecisions: 26635,
  games: [
    { table: 'balanced', seed: 'monet-v033-balanced-0', startSeat: 1, decisions: 538, digest: '209c9a283c2a7f45' },
    { table: 'balanced', seed: 'monet-v033-balanced-1', startSeat: 3, decisions: 696, digest: '3672bf0af92ee03b' },
    { table: 'balanced', seed: 'monet-v033-balanced-2', startSeat: 5, decisions: 703, digest: '01541258ebf6651d' },
    { table: 'balanced', seed: 'monet-v033-balanced-3', startSeat: 1, decisions: 455, digest: '9410881bb017f9a9' },
    { table: 'blitz', seed: 'monet-v033-blitz-0', startSeat: 1, decisions: 645, digest: '878cfc3f8b1cc73e' },
    { table: 'blitz', seed: 'monet-v033-blitz-1', startSeat: 3, decisions: 648, digest: '81d843c1150e9ff9' },
    { table: 'blitz', seed: 'monet-v033-blitz-2', startSeat: 5, decisions: 677, digest: 'f7a33f76c4d7d7cc' },
    { table: 'blitz', seed: 'monet-v033-blitz-3', startSeat: 1, decisions: 691, digest: '61a3f694a9fe089f' },
    { table: 'punter', seed: 'monet-v033-punter-0', startSeat: 1, decisions: 545, digest: 'f156f54df17de31f' },
    { table: 'punter', seed: 'monet-v033-punter-1', startSeat: 3, decisions: 718, digest: '13895d59f56991ba' },
    { table: 'punter', seed: 'monet-v033-punter-2', startSeat: 5, decisions: 638, digest: '0237d2f209c09769' },
    { table: 'punter', seed: 'monet-v033-punter-3', startSeat: 1, decisions: 579, digest: '75d05f1f4bae3343' },
    { table: 'banker', seed: 'monet-v033-banker-0', startSeat: 1, decisions: 827, digest: 'e1e1c27727381f7a' },
    { table: 'banker', seed: 'monet-v033-banker-1', startSeat: 3, decisions: 810, digest: '0a5c74418982a09d' },
    { table: 'banker', seed: 'monet-v033-banker-2', startSeat: 5, decisions: 735, digest: '444e0fea983fadfa' },
    { table: 'banker', seed: 'monet-v033-banker-3', startSeat: 1, decisions: 928, digest: '58d896cf06106d00' },
    { table: 'turtle', seed: 'monet-v033-turtle-0', startSeat: 1, decisions: 1057, digest: 'dbef1897e331c9b1' },
    { table: 'turtle', seed: 'monet-v033-turtle-1', startSeat: 3, decisions: 1266, digest: '37804969790c7019' },
    { table: 'turtle', seed: 'monet-v033-turtle-2', startSeat: 5, decisions: 1325, digest: '67d5644e93d3fd8f' },
    { table: 'turtle', seed: 'monet-v033-turtle-3', startSeat: 1, decisions: 1077, digest: '1dd15311c8c9ab6c' },
    { table: 'hoarder', seed: 'monet-v033-hoarder-0', startSeat: 1, decisions: 931, digest: '159b8b7946cec3a8' },
    { table: 'hoarder', seed: 'monet-v033-hoarder-1', startSeat: 3, decisions: 760, digest: '682ba3da84d20ed9' },
    { table: 'hoarder', seed: 'monet-v033-hoarder-2', startSeat: 5, decisions: 692, digest: '4f138a2ed393848f' },
    { table: 'hoarder', seed: 'monet-v033-hoarder-3', startSeat: 1, decisions: 771, digest: 'c87c633e8aa96127' },
    { table: 'scout', seed: 'monet-v033-scout-0', startSeat: 1, decisions: 704, digest: 'c19f12cae25a2beb' },
    { table: 'scout', seed: 'monet-v033-scout-1', startSeat: 3, decisions: 566, digest: '1cc79196f81db110' },
    { table: 'scout', seed: 'monet-v033-scout-2', startSeat: 5, decisions: 665, digest: '78858828945030e6' },
    { table: 'scout', seed: 'monet-v033-scout-3', startSeat: 1, decisions: 592, digest: '057ef9fb04f53091' },
    { table: 'ghost', seed: 'monet-v033-ghost-0', startSeat: 1, decisions: 629, digest: '88cb47b99470e658' },
    { table: 'ghost', seed: 'monet-v033-ghost-1', startSeat: 3, decisions: 683, digest: '72b84023d0261975' },
    { table: 'ghost', seed: 'monet-v033-ghost-2', startSeat: 5, decisions: 773, digest: 'cef53780ddbf4b5c' },
    { table: 'ghost', seed: 'monet-v033-ghost-3', startSeat: 1, decisions: 704, digest: '68631c0079b88af9' },
    { table: 'archivist', seed: 'monet-v033-archivist-0', startSeat: 1, decisions: 629, digest: '79387d75b995bed7' },
    { table: 'archivist', seed: 'monet-v033-archivist-1', startSeat: 3, decisions: 711, digest: '0459361985749697' },
    { table: 'archivist', seed: 'monet-v033-archivist-2', startSeat: 5, decisions: 684, digest: 'a417cef298587e1e' },
    { table: 'archivist', seed: 'monet-v033-archivist-3', startSeat: 1, decisions: 583, digest: 'fa909a8372c12130' },
  ] as const satisfies readonly BankGame[],
} as const
