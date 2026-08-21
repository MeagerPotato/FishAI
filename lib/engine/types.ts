/**
 * Core types for the Canadian Fish (Literature) rules engine.
 * Pure data — no imports, no side effects. See RULES.md for the pinned rule set.
 */

export type Suit = 'C' | 'D' | 'H' | 'S'
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'
/**
 * Every card either rule set can name. Which of them are *in play* is a property of the
 * deck, not of the type: `pagat48` deals the 48 suited cards with no 8s (RULES.md row 2),
 * `us54` deals all 52 suited cards plus the two jokers (RULES_US54.md §1 row 2).
 * `isCard(x, config)` is the runtime membership test for a given config.
 *
 * Jokers are `XR`/`XB`, never `JR`/`JB`: rank is parsed positionally from `card[0]`, so a
 * `J` prefix would read as rank Jack and mis-bucket into a HIGH set (RULES_US54.md §2.1).
 */
export type Card = `${Rank}${Suit}` | 'XR' | 'XB'
export type Half = 'LOW' | 'HIGH'
/**
 * LOW = 2..7, HIGH = 9..A of one suit (RULES.md row 3), plus the `us54`-only
 * EIGHTS = 8C·8D·8H·8S·XR·XB (RULES_US54.md §1 row 3). Every set is six cards in both
 * variants; only the *number* of sets changes (8 vs 9).
 */
export type BookId = `${Half}-${Suit}` | 'EIGHTS'
export type Seat = 0 | 1 | 2 | 3 | 4 | 5
/** team = seat % 2; seats 0,2,4 = team 0, seats 1,3,5 = team 1. */
export type Team = 0 | 1

/**
 * Which pinned rule set a game runs. `pagat48` is [RULES.md](../../RULES.md) — the shipped
 * default for the live table, /learn and the drills. `us54` is
 * [RULES_US54.md](../../RULES_US54.md) — the US student 54-card dialect.
 * Deck, set list and hand size are *derived* from this (RULES_US54.md §6); nothing is hardcoded.
 */
export type Variant = 'pagat48' | 'us54'

/** Engine configuration. All variant toggles are OFF by default (RULES.md §5). */
export interface RulesConfig {
  playerCount: 6
  /** 'pagat48' = RULES.md default; 'us54' = RULES_US54.md (RULES_US54.md §6). */
  variant: Variant
  toggles: {
    /**
     * Legacy RULES.md §5 T1 flag, **superseded by `variant`**. It was declared here from the
     * start but read nowhere, so the 54-card deck it advertised never existed. The 54-card rule
     * set now lives behind `variant: 'us54'`; setting this flag is rejected by `validateConfig`
     * (RULES_US54.md §6 and the doc-correction note at the top of that file).
     */
    jokers: boolean
    rankQuartet: boolean
    mandatoryDeclare: boolean
    announceLastCard: boolean
    highBooksDouble: boolean
    askOwnCardAllowed: boolean
    declarerChoosesNext: boolean
    claimAnyTurn: boolean
    strictMemory: boolean
  }
}

export type Phase = 'playing' | 'awaitPass' | 'awaitDesignate' | 'endgame' | 'finished'

/**
 * The open declare window of RULES_US54.md §3 — `us54` only; `pagat48` never creates one.
 *
 * §3 is normative: *"after every action resolves, each seat in turn order — starting from the
 * current turn-holder and proceeding 0→1→2→3→4→5 cyclically — is offered the chance to
 * declare"*. In a reducer that takes one action at a time, "is offered" has to be a state, not
 * a loop: this record **is** that offer. It rides on `GameState`, so it is part of what
 * `reduce` derives deterministically and what a replay of the action log reconstructs exactly.
 *
 * The window deliberately lives *inside* phase `playing` rather than becoming a sixth `Phase`.
 * RULES_US54.md §3.1 requires a declare's phase check to be "playing (or endgame)"; a separate
 * phase would have made that check false at the only moment a declare is ever offered, and
 * would have changed the meaning of `Phase` for the 48-card default.
 */
export interface DeclareWindow {
  /** The seat currently offered the option: it alone may `claim` or `decline` right now. */
  option: Seat
  /**
   * Consecutive declines since the window last opened. At 6 a full cycle has passed with no
   * declare, so the window closes and the turn-holder asks (§3). A declare that resolves
   * re-opens the window from the top — a fresh record with `declined: 0` — because the reveal
   * is new public information that may make another set declarable.
   */
  declined: number
}

/**
 * Outcome record of a resolved book.
 *
 * `void` is a `pagat48` outcome only (RULES.md row 15). Under `us54` the outcome is always
 * `team0` or `team1`: row 14 abolishes `void`, awarding every mis-declared set to the
 * opposing team — see `VariantRules.wrongDeclare`.
 */
export interface BookResult {
  book: BookId
  outcome: 'team0' | 'team1' | 'void'
  claimer: Seat
  /** The claimer's stated locations (own team only). */
  assignments: Record<Card, Seat>
  /** True holders at the moment of the claim (pre-removal), always revealed. */
  actualHolders: Record<Card, Seat>
}

export type PublicEvent =
  | { type: 'game_started'; startingSeat: Seat }
  | { type: 'ask'; asker: Seat; target: Seat; card: Card; hit: boolean }
  | {
      type: 'claim'
      claimer: Seat
      book: BookId
      assignments: Record<Card, Seat>
      actualHolders: Record<Card, Seat>
      outcome: 'team0' | 'team1' | 'void'
    }
  | { type: 'pass'; from: Seat; to: Seat }
  | { type: 'designate'; from: Seat; to: Seat }
  | { type: 'player_out'; seat: Seat }
  | { type: 'endgame'; claimingTeam: Team }
  /**
   * `winner: 'tie'` is a `pagat48` outcome only (RULES.md row 23). RULES_US54.md §5 proves a
   * tie is arithmetically impossible under `us54`, and the reducer never emits one there.
   *
   * A `us54` game ends on a clinch, so `score` is a snapshot of a game that still has
   * unresolved sets and cards in hands — render it as e.g. "5–3 · 1 unresolved", never as a
   * bare "5–3", which reads as a completed 8-set game (RULES_US54.md §5.1).
   */
  | { type: 'game_over'; score: [number, number]; winner: 0 | 1 | 'tie' }

export interface GameState {
  config: RulesConfig
  seed: string
  phase: Phase
  turn: Seat
  hands: Card[][]
  books: Partial<Record<BookId, BookResult>>
  score: [number, number]
  log: PublicEvent[]
  moveIndex: number
  /**
   * The open declare window (RULES_US54.md §3), or absent when no window is open.
   * **`us54` only** — under `pagat48` this key is never written at all, so a default game's
   * state object keeps exactly the shape it had before the variant existed.
   */
  declareWindow?: DeclareWindow
}

export type GameAction =
  | { type: 'ask'; seat: Seat; target: Seat; card: Card }
  /**
   * A claim (RULES.md §3) and a declare (RULES_US54.md §1 rows 12-14) are the same action;
   * the engine keeps the `claim` name in both rule sets. What differs is *when* it is legal
   * and how an error resolves — see `VariantRules.declareTiming` and `.wrongDeclare`.
   */
  | { type: 'claim'; seat: Seat; book: BookId; assignments: Record<Card, Seat> }
  | { type: 'pass'; seat: Seat; to: Seat }
  | { type: 'designate'; seat: Seat; to: Seat }
  /**
   * Decline the declare option — `us54` only (RULES_US54.md §3). Passing up the offer is a
   * real move: it is what advances the window to the next seat, and six of them in a row are
   * what close it. Making it an explicit action (rather than, say, letting the turn-holder's
   * ask implicitly speak for all six seats) is what keeps the window replayable from the
   * action log alone and keeps `reduce` a pure single-action function.
   */
  | { type: 'decline'; seat: Seat }

export type ErrorCode =
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'ASKER_OUT'
  | 'TARGET_TEAMMATE'
  | 'TARGET_SELF'
  | 'TARGET_OUT'
  | 'NO_CARD_OF_BOOK'
  | 'ASKING_OWN_CARD'
  | 'INVALID_CARD'
  | 'BOOK_RESOLVED'
  | 'BAD_ASSIGNMENTS'
  | 'ASSIGN_OPPONENT'
  | 'PASS_TARGET_OUT'
  | 'PASS_TARGET_NOT_TEAMMATE'
  | 'DESIGNATE_TARGET_INVALID'
  /** `us54`: an ask while a declare window is still open — every seat is offered a declare first (§3). */
  | 'DECLARE_WINDOW_OPEN'
  /** `us54`: a `decline`, or a declare, with no window open (and always under `pagat48`, which has none). */
  | 'NO_DECLARE_WINDOW'
  /**
   * `us54`: the declare window is open but at another seat. Note this is **not**
   * `NOT_YOUR_TURN`, which RULES_US54.md §3.1 removes as a declare error in this variant: the
   * option is not the turn, it travels to every seat within one cycle, and a declare refused
   * here can simply be re-submitted when the option arrives.
   */
  | 'NOT_YOUR_OPTION'
  /**
   * `us54`: a `decline` offered in a window that no ask can follow — the turn-holder has no
   * legal ask, so closing the window would leave a running game with no legal action at all
   * (RULES_US54.md §3, "declining is illegal when no ask can follow"). The option seat's only
   * remaining move is a declare, which row 12/15 always make constructible while any set is
   * unresolved. Refusing here is what makes §5's termination a property of the *rules* rather
   * than of the acting policy.
   */
  | 'MUST_DECLARE'
  | 'INVALID_ACTION'

export type EngineError = { code: ErrorCode; message: string }

export type ReduceResult =
  | { ok: true; state: GameState; events: PublicEvent[] }
  | { ok: false; error: EngineError }

/** Public projection of the game — never contains any hidden hand card identity. */
export interface PublicState {
  phase: Phase
  turn: Seat
  counts: number[]
  score: [number, number]
  books: Partial<Record<BookId, BookResult>>
  log: PublicEvent[]
  moveIndex: number
  config: RulesConfig
  /**
   * The open declare window (`us54` only). Public by construction — whose option it is has to
   * be visible for a client to know who moves next, and it reveals nothing hidden.
   */
  declareWindow?: DeclareWindow
}
