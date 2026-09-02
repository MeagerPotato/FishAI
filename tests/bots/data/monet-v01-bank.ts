/**
 * monet-v01-bank.ts — GENERATED. Do not edit by hand.
 *
 * `node scripts/byte-identity.mjs --ref HEAD --emit-bank tests/bots/data/monet-v01-bank.ts`
 *
 * The FishAI v2.0 arm's own decisions, recorded from a COMMITTED revision and pinned here so
 * that Monet's identity claim survives the session it was measured in. Each row is one whole
 * `us54` game: the table style drives it, and the digest runs over the canonical form of the
 * action the v2.0 arm — `{ skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter }` — returned
 * at every decision point, in order (`tests/bots/action-digest.ts`).
 *
 * The in-graph pin in `monet.test.ts` cannot fail on a `decide.ts` regression: both of its arms
 * are the same imported `decide`, so an edit moves them together and the suite stays green.
 * This fixture is the half that can. It was generated from another revision's module graph, so
 * a `decide.ts`, `roster.ts`, `style.ts` or `reduce.ts` change that moves a single action of a
 * single game breaks a digest here — which is exactly what "no behaviour change" means.
 *
 * Regenerating it is a deliberate act, not a fix for a red test: a changed digest is a report
 * that v0.1 no longer plays FishAI v2.0's games, and that is the acceptance criterion itself.
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
  /** `ActionDigest` over the reference arm's canonical actions, in order. */
  digest: string
}

export const MONET_V01_BANK = {
  /** The revision the bank was recorded from. */
  revision: 'fd1948665131d1a33ee4b1484fec97779cb6435e',
  /** How that revision's v2.0 arm was addressed while recording. */
  arm: '{ skill: SKILL_PRESETS.hard, style: STYLE_ROSTER.punter }',
  totalDecisions: 20291,
  games: [
    { table: 'balanced', seed: 'monet-v01-balanced-0', startSeat: 1, decisions: 605, digest: 'e4d668fb0b8e1fed' },
    { table: 'balanced', seed: 'monet-v01-balanced-1', startSeat: 3, decisions: 440, digest: '6f49c2d902bcd36e' },
    { table: 'balanced', seed: 'monet-v01-balanced-2', startSeat: 5, decisions: 731, digest: 'b4f44d25205ef298' },
    { table: 'blitz', seed: 'monet-v01-blitz-0', startSeat: 1, decisions: 711, digest: '36504dc74f84c9e8' },
    { table: 'blitz', seed: 'monet-v01-blitz-1', startSeat: 3, decisions: 593, digest: 'be2910b68b50670e' },
    { table: 'blitz', seed: 'monet-v01-blitz-2', startSeat: 5, decisions: 642, digest: '70e1bf1a1d60f215' },
    { table: 'punter', seed: 'monet-v01-punter-0', startSeat: 1, decisions: 498, digest: '36db595f7c66b85a' },
    { table: 'punter', seed: 'monet-v01-punter-1', startSeat: 3, decisions: 657, digest: '685d9eb8430c59a9' },
    { table: 'punter', seed: 'monet-v01-punter-2', startSeat: 5, decisions: 601, digest: '7928c8db1911a839' },
    { table: 'banker', seed: 'monet-v01-banker-0', startSeat: 1, decisions: 618, digest: 'fd256afbdd2d521d' },
    { table: 'banker', seed: 'monet-v01-banker-1', startSeat: 3, decisions: 805, digest: '7082d7b4cd26b148' },
    { table: 'banker', seed: 'monet-v01-banker-2', startSeat: 5, decisions: 816, digest: '73a7f789610b9a37' },
    { table: 'turtle', seed: 'monet-v01-turtle-0', startSeat: 1, decisions: 1211, digest: 'e82527dbed85765d' },
    { table: 'turtle', seed: 'monet-v01-turtle-1', startSeat: 3, decisions: 747, digest: '3b21f0d5b9015935' },
    { table: 'turtle', seed: 'monet-v01-turtle-2', startSeat: 5, decisions: 1448, digest: '6e69d9efd54f9caa' },
    { table: 'hoarder', seed: 'monet-v01-hoarder-0', startSeat: 1, decisions: 663, digest: 'c5e2150a8f76e68a' },
    { table: 'hoarder', seed: 'monet-v01-hoarder-1', startSeat: 3, decisions: 755, digest: '1284091844a8b2e8' },
    { table: 'hoarder', seed: 'monet-v01-hoarder-2', startSeat: 5, decisions: 907, digest: 'a661c73718d15e53' },
    { table: 'scout', seed: 'monet-v01-scout-0', startSeat: 1, decisions: 831, digest: '161ca5ee05fb6638' },
    { table: 'scout', seed: 'monet-v01-scout-1', startSeat: 3, decisions: 819, digest: 'cb59998a7e320a29' },
    { table: 'scout', seed: 'monet-v01-scout-2', startSeat: 5, decisions: 924, digest: '09557938984d8c42' },
    { table: 'ghost', seed: 'monet-v01-ghost-0', startSeat: 1, decisions: 753, digest: '2240d43a1857228a' },
    { table: 'ghost', seed: 'monet-v01-ghost-1', startSeat: 3, decisions: 797, digest: '1510b47a4b259a0b' },
    { table: 'ghost', seed: 'monet-v01-ghost-2', startSeat: 5, decisions: 674, digest: '6aaa1a387c94e53b' },
    { table: 'archivist', seed: 'monet-v01-archivist-0', startSeat: 1, decisions: 637, digest: '35e62dfebae58639' },
    { table: 'archivist', seed: 'monet-v01-archivist-1', startSeat: 3, decisions: 752, digest: 'cfd2a5c8714343a4' },
    { table: 'archivist', seed: 'monet-v01-archivist-2', startSeat: 5, decisions: 656, digest: 'e464e5f2ef080bae' },
  ] as const satisfies readonly BankGame[],
} as const
