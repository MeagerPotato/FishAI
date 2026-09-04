/**
 * monet-v09-bank.ts — GENERATED. Do not edit by hand.
 *
 * `node scripts/byte-identity.mjs --version v0.9 --emit-tree wt --emit-bank tests/bots/data/monet-v09-bank.ts`
 *
 * Monet v0.9's own decisions, recorded from the WORKING TREE at the revision v0.9 shipped
 * and pinned here as a FORWARD baseline. Each row is one whole `us54` game: the table style
 * drives it, and the digest runs over the canonical form of the action `monetPolicy("v0.9")`
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
 * that v0.9 no longer plays the games it was accepted for.
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

export const MONET_V09_BANK = {
  /** The revision the bank was recorded from — HEAD when the tree is 'wt'. */
  revision: 'f3b0351243a39c1a46da77a60d7677be744cad87',
  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */
  tree: 'wt',
  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */
  dirty: false,
  /** How the recorded arm was addressed. */
  arm: 'monetPolicy("v0.9")',
  totalDecisions: 25443,
  games: [
    { table: 'balanced', seed: 'monet-v09-balanced-0', startSeat: 1, decisions: 844, digest: '9e4116e6e793d09e' },
    { table: 'balanced', seed: 'monet-v09-balanced-1', startSeat: 3, decisions: 698, digest: '0f6f93bde771257e' },
    { table: 'balanced', seed: 'monet-v09-balanced-2', startSeat: 5, decisions: 620, digest: '148856db16b40a55' },
    { table: 'balanced', seed: 'monet-v09-balanced-3', startSeat: 1, decisions: 719, digest: 'af743b30ab6b8018' },
    { table: 'blitz', seed: 'monet-v09-blitz-0', startSeat: 1, decisions: 676, digest: '3633875f7408b5fc' },
    { table: 'blitz', seed: 'monet-v09-blitz-1', startSeat: 3, decisions: 571, digest: 'ab432672b224385a' },
    { table: 'blitz', seed: 'monet-v09-blitz-2', startSeat: 5, decisions: 683, digest: 'f2b8cc3430c93e0a' },
    { table: 'blitz', seed: 'monet-v09-blitz-3', startSeat: 1, decisions: 642, digest: '2609cf349aa24239' },
    { table: 'punter', seed: 'monet-v09-punter-0', startSeat: 1, decisions: 558, digest: '2be12b032eda3e06' },
    { table: 'punter', seed: 'monet-v09-punter-1', startSeat: 3, decisions: 634, digest: 'c65f2a917fb71f7f' },
    { table: 'punter', seed: 'monet-v09-punter-2', startSeat: 5, decisions: 678, digest: '584bd63934dba3d3' },
    { table: 'punter', seed: 'monet-v09-punter-3', startSeat: 1, decisions: 748, digest: '6360ef760f58ad4e' },
    { table: 'banker', seed: 'monet-v09-banker-0', startSeat: 1, decisions: 799, digest: '68b36d8010b1a2a7' },
    { table: 'banker', seed: 'monet-v09-banker-1', startSeat: 3, decisions: 662, digest: '7cc3233a9558076e' },
    { table: 'banker', seed: 'monet-v09-banker-2', startSeat: 5, decisions: 612, digest: '0ad1a09a852316c7' },
    { table: 'banker', seed: 'monet-v09-banker-3', startSeat: 1, decisions: 659, digest: '8ca307eddcdf252d' },
    { table: 'turtle', seed: 'monet-v09-turtle-0', startSeat: 1, decisions: 899, digest: 'f6a8580e477ebfdd' },
    { table: 'turtle', seed: 'monet-v09-turtle-1', startSeat: 3, decisions: 1105, digest: 'c25515c0b0357d64' },
    { table: 'turtle', seed: 'monet-v09-turtle-2', startSeat: 5, decisions: 1081, digest: '90d52a4de248e63e' },
    { table: 'turtle', seed: 'monet-v09-turtle-3', startSeat: 1, decisions: 1063, digest: '3cb28abb93c90961' },
    { table: 'hoarder', seed: 'monet-v09-hoarder-0', startSeat: 1, decisions: 894, digest: 'de43433ccdf6f0ea' },
    { table: 'hoarder', seed: 'monet-v09-hoarder-1', startSeat: 3, decisions: 717, digest: '54df4ec03088d985' },
    { table: 'hoarder', seed: 'monet-v09-hoarder-2', startSeat: 5, decisions: 567, digest: 'c258549ebe84cd41' },
    { table: 'hoarder', seed: 'monet-v09-hoarder-3', startSeat: 1, decisions: 816, digest: '4658d58a7a3c2aed' },
    { table: 'scout', seed: 'monet-v09-scout-0', startSeat: 1, decisions: 683, digest: '4e5d6dceb047ebbe' },
    { table: 'scout', seed: 'monet-v09-scout-1', startSeat: 3, decisions: 746, digest: 'bcf8d7ce77eef8d5' },
    { table: 'scout', seed: 'monet-v09-scout-2', startSeat: 5, decisions: 520, digest: '035aa87803466de2' },
    { table: 'scout', seed: 'monet-v09-scout-3', startSeat: 1, decisions: 525, digest: '8cc974dbf39cf79b' },
    { table: 'ghost', seed: 'monet-v09-ghost-0', startSeat: 1, decisions: 637, digest: '6e67ca28bda1d22d' },
    { table: 'ghost', seed: 'monet-v09-ghost-1', startSeat: 3, decisions: 820, digest: '477ff93f09f02fe0' },
    { table: 'ghost', seed: 'monet-v09-ghost-2', startSeat: 5, decisions: 560, digest: '291640a789b32c04' },
    { table: 'ghost', seed: 'monet-v09-ghost-3', startSeat: 1, decisions: 799, digest: 'd10ebdd4a0b9cfe3' },
    { table: 'archivist', seed: 'monet-v09-archivist-0', startSeat: 1, decisions: 435, digest: 'a5c35935ffc2a0a7' },
    { table: 'archivist', seed: 'monet-v09-archivist-1', startSeat: 3, decisions: 508, digest: 'b85a9f990afc803d' },
    { table: 'archivist', seed: 'monet-v09-archivist-2', startSeat: 5, decisions: 729, digest: 'ed7c82ad28bab3d5' },
    { table: 'archivist', seed: 'monet-v09-archivist-3', startSeat: 1, decisions: 536, digest: 'b9e22aa3cd06633d' },
  ] as const satisfies readonly BankGame[],
} as const
