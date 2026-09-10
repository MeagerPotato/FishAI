/**
 * monet-v020c-bank.ts — GENERATED. Do not edit by hand.
 *
 * `node scripts/byte-identity.mjs --version v0.20c --emit-tree wt --emit-bank tests/bots/data/monet-v020c-bank.ts`
 *
 * Monet v0.20c's own decisions, recorded from the WORKING TREE at the revision v0.20c shipped
 * and pinned here as a FORWARD baseline. Each row is one whole `us54` game: the table style
 * drives it, and the digest runs over the canonical form of the action `monetPolicy("v0.20c")`
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
 * that v0.20c no longer plays the games it was accepted for.
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

export const MONET_V020C_BANK = {
  /** The revision the bank was recorded from — HEAD when the tree is 'wt'. */
  revision: 'ca84bb7ef3b33856774805e773b6e63515cccc44',
  /** Which tree's module graph recorded it: 'ref' certifies cross-revision, 'wt' does not. */
  tree: 'wt',
  /** Whether lib/ or scripts/ carried uncommitted edits at the moment of recording. */
  dirty: false,
  /** How the recorded arm was addressed. */
  arm: 'monetPolicy("v0.20c")',
  totalDecisions: 25726,
  games: [
    { table: 'balanced', seed: 'monet-v020c-balanced-0', startSeat: 1, decisions: 669, digest: '4c0c18744bb650d0' },
    { table: 'balanced', seed: 'monet-v020c-balanced-1', startSeat: 3, decisions: 712, digest: '29580bf459bbdce1' },
    { table: 'balanced', seed: 'monet-v020c-balanced-2', startSeat: 5, decisions: 755, digest: 'ae19039bada67806' },
    { table: 'balanced', seed: 'monet-v020c-balanced-3', startSeat: 1, decisions: 674, digest: '50e965601e629e9c' },
    { table: 'blitz', seed: 'monet-v020c-blitz-0', startSeat: 1, decisions: 669, digest: 'f5cf5f5909cd4124' },
    { table: 'blitz', seed: 'monet-v020c-blitz-1', startSeat: 3, decisions: 583, digest: 'cdb41d0134cf2dc8' },
    { table: 'blitz', seed: 'monet-v020c-blitz-2', startSeat: 5, decisions: 537, digest: '1a5ff23dae062523' },
    { table: 'blitz', seed: 'monet-v020c-blitz-3', startSeat: 1, decisions: 486, digest: 'f07ba94f334f1fe0' },
    { table: 'punter', seed: 'monet-v020c-punter-0', startSeat: 1, decisions: 550, digest: 'ea0615b9b57c487f' },
    { table: 'punter', seed: 'monet-v020c-punter-1', startSeat: 3, decisions: 535, digest: 'da31f22f33dbe65c' },
    { table: 'punter', seed: 'monet-v020c-punter-2', startSeat: 5, decisions: 376, digest: '477381b0280325f2' },
    { table: 'punter', seed: 'monet-v020c-punter-3', startSeat: 1, decisions: 708, digest: 'c65d8bd746d85b60' },
    { table: 'banker', seed: 'monet-v020c-banker-0', startSeat: 1, decisions: 716, digest: 'e7a7a3ce5a7089f5' },
    { table: 'banker', seed: 'monet-v020c-banker-1', startSeat: 3, decisions: 517, digest: '429a3e869fe5ef33' },
    { table: 'banker', seed: 'monet-v020c-banker-2', startSeat: 5, decisions: 807, digest: '4e2394641a70d3a9' },
    { table: 'banker', seed: 'monet-v020c-banker-3', startSeat: 1, decisions: 614, digest: '28a245b02d424853' },
    { table: 'turtle', seed: 'monet-v020c-turtle-0', startSeat: 1, decisions: 1435, digest: '94106fa393b78343' },
    { table: 'turtle', seed: 'monet-v020c-turtle-1', startSeat: 3, decisions: 1674, digest: '936ead4e862ecb74' },
    { table: 'turtle', seed: 'monet-v020c-turtle-2', startSeat: 5, decisions: 1036, digest: '33c814d46efdeffb' },
    { table: 'turtle', seed: 'monet-v020c-turtle-3', startSeat: 1, decisions: 1036, digest: '17b363d7613776bf' },
    { table: 'hoarder', seed: 'monet-v020c-hoarder-0', startSeat: 1, decisions: 714, digest: '810d1e815912e34c' },
    { table: 'hoarder', seed: 'monet-v020c-hoarder-1', startSeat: 3, decisions: 565, digest: '048aadac3e0b6f7c' },
    { table: 'hoarder', seed: 'monet-v020c-hoarder-2', startSeat: 5, decisions: 924, digest: 'c33920cd6cd53c81' },
    { table: 'hoarder', seed: 'monet-v020c-hoarder-3', startSeat: 1, decisions: 659, digest: 'de43641c83c35550' },
    { table: 'scout', seed: 'monet-v020c-scout-0', startSeat: 1, decisions: 716, digest: 'f258aa2f99a16364' },
    { table: 'scout', seed: 'monet-v020c-scout-1', startSeat: 3, decisions: 543, digest: '6c163434d2c00fe0' },
    { table: 'scout', seed: 'monet-v020c-scout-2', startSeat: 5, decisions: 657, digest: 'fa14566c978c2b5d' },
    { table: 'scout', seed: 'monet-v020c-scout-3', startSeat: 1, decisions: 491, digest: '7b595a9b378733dd' },
    { table: 'ghost', seed: 'monet-v020c-ghost-0', startSeat: 1, decisions: 548, digest: '1b2e642d06cd53dd' },
    { table: 'ghost', seed: 'monet-v020c-ghost-1', startSeat: 3, decisions: 646, digest: 'c2134d9d0f253d2c' },
    { table: 'ghost', seed: 'monet-v020c-ghost-2', startSeat: 5, decisions: 780, digest: '9bd13cff560647a1' },
    { table: 'ghost', seed: 'monet-v020c-ghost-3', startSeat: 1, decisions: 756, digest: '8f4dc014aacaf2a6' },
    { table: 'archivist', seed: 'monet-v020c-archivist-0', startSeat: 1, decisions: 591, digest: '3a6e8df14e9d40dc' },
    { table: 'archivist', seed: 'monet-v020c-archivist-1', startSeat: 3, decisions: 749, digest: 'd9a1a718fc687375' },
    { table: 'archivist', seed: 'monet-v020c-archivist-2', startSeat: 5, decisions: 600, digest: 'a3c7ca51ee57f5d1' },
    { table: 'archivist', seed: 'monet-v020c-archivist-3', startSeat: 1, decisions: 698, digest: 'faa5ee53b0953ed4' },
  ] as const satisfies readonly BankGame[],
} as const
