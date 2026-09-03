/**
 * Types for the deterministic knowledge-state inference bots (SPEC.md §5).
 *
 * Everything here is defined over the PUBLIC seat view only. SeatView is
 * declared structurally (PublicState + own seat + own hand) rather than as
 * ReturnType<typeof seatView> so this module never imports a GameState-consuming
 * function — the type is identical to what `seatView(state, seat)` returns and
 * to the payload `GET /api/state` sends a human client.
 */
import type { BookId, Card, PublicState, Seat } from '../types.ts'

/** Exactly what a seated player (human client or bot) is allowed to know. */
export type SeatView = PublicState & { seat: Seat; hand: Card[] }

export type BotDifficulty = 'easy' | 'medium' | 'hard'

/**
 * A positive set-constraint over deal-time holdings: `seat` was dealt at least
 * one of `cards`. Constraints are recorded against deal-time card variables
 * (see knowledge.ts), so they never need rewriting when cards later move —
 * a disjunct simply dies when its card is proven dealt elsewhere, and the
 * whole constraint is dropped once satisfied or exhausted.
 */
export interface KnowledgeConstraint {
  seat: Seat
  cards: Card[]
}

/**
 * The rebuilt knowledge state — a plain serializable object queried through
 * the pure functions holderOf / candidates / certainCards (knowledge.ts).
 * All fields describe the CURRENT position (post-log, post-own-hand).
 */
export interface Knowledge {
  /** Perspective seat (the viewer). */
  seat: Seat
  /** Current hand sizes, copied from the public counts. */
  counts: number[]
  /** Live card -> its certainly-known current holder. */
  holders: Partial<Record<Card, Seat>>
  /** Live card -> current candidate holders, ascending (singleton == certain). */
  cands: Partial<Record<Card, Seat[]>>
  /** Cards removed from play by resolved claims (no holder, no candidates). */
  gone: Card[]
  /**
   * Per seat: cards in that hand not yet individually identified
   * (counts[s] minus the certainly-located cards at s), clamped >= 0.
   */
  unknownSlots: number[]
  /** Surviving unsatisfied at-least-one-of constraints (for drills/inspection). */
  constraints: KnowledgeConstraint[]
  /**
   * MONET.md §3.6a — the ask-choice prior's evidence: asks per book by every seat but the viewer,
   * `asksInto[book][seat]`, read off the walked log. A seat that asked into a half-suit chose it
   * over its other licensed half-suits, so it is more likely to hold more of it. Present only on
   * a Knowledge built with `choiceKappa > 0` (Monet v0.5 and later); every other build keeps its
   * shape byte for byte.
   */
  asksInto?: Partial<Record<BookId, number[]>>
  /** The prior's strength the marginal is scaled with (`KnowledgeOptions.choiceKappa`); absent = flat. */
  choiceKappa?: number
  /**
   * MONET.md §3.6a A2 — the per-seat multiplier on κ, read inside the game (`KnowledgeOptions.
   * choiceAdapt`): 1 for a seat nothing has been learned about, in [0, 2], moved by every successful
   * declaration of a half-suit the seat had asked into. Present only when the step is > 0.
   */
  choiceSeat?: number[]
}

/** Options for buildKnowledge — used by the easy tier's degraded memory. */
export interface KnowledgeOptions {
  /** Only the last N log events are read (easy: 6). Default: whole log. */
  logWindow?: number
  /** Record ask set-constraints. Easy sets false (direct facts only). Default: true. */
  useConstraints?: boolean
  /**
   * Attach MONET.md §3.4a's calibrated marginal (`marginal.ts`) to the built Knowledge, so the
   * hit probability answers from the scaled card × seat table instead of the slot prior. Default:
   * false — every Bass tier, and every Monet version before v0.4a. A pure read of the finished
   * object; the Knowledge itself keeps its shape.
   */
  marginal?: boolean
  /**
   * MONET.md §3.6a — the ask-choice prior's strength κ (≥ 0). A seat that has asked into a half-suit
   * has the marginal's prior weight of that half-suit's unknown cards at that seat multiplied by
   * `1 + κ` before scaling — once, however many times it asked. Default 0: the flat prior, byte for
   * byte — every Bass tier, every Monet version before v0.5. Read only when `marginal` is set.
   */
  choiceKappa?: number
  /**
   * MONET.md §3.6a A2 — the step η (≥ 0) of the per-seat reading. At every successful declaration
   * (the one event that publishes true holders on the host), for each seat that had asked into the
   * resolved half-suit, that seat's multiplier on κ moves by η · (cards of the half-suit the seat
   * was dealt − 1.58), clipped to [0, 2]; 1.58 is the fit-seed mean for a seat that asked, so a seat
   * whose asks say no more than everyone's stays at 1. Default 0: A1 exactly, byte for byte. Read
   * only with `marginal` and `choiceKappa > 0`.
   */
  choiceAdapt?: number
}

/**
 * The slice of a play style that the ask ranker consumes (STYLES.md §2, "ask scoring").
 *
 * Declared here rather than in [style.ts](style.ts) so `knowledge.ts` — the inference layer —
 * never has to import the policy layer. `StyleParams` extends it, so a style is accepted
 * wherever these weights are.
 */
export interface AskWeights {
  /** Weight on the hit probability. Baseline 70. */
  wHit: number
  /** Weight on the fraction of the set already certainly on the asker's team. Baseline 18. */
  wProgress: number
  /** Weight on how much a miss would narrow the card's candidate set. Baseline 12. */
  wNarrow: number
  /** Flat bonus for a CERTAIN hit; >= 20 keeps certain hits strictly dominant. Baseline 20. */
  certaintyBonus: number
  /** Refuse asks below this hit probability (0 = consider every legal ask). */
  minHitP: number
  /** Extra score for an ask that would COMPLETE a set for the asker's team. Baseline 0. */
  gambleBonus: number
}

/** One scored legal ask, for the bot itself and for the Phase-4 coach overlay. */
export interface RankedAsk {
  target: Seat
  card: Card
  /** 0..100-ish; certain hits always outrank everything else. */
  score: number
  /**
   * The hit probability the score was built from (`askHitProbability`). Exposed so the policy
   * layer can apply `minHitP` without recomputing it, and so a coach can show it directly.
   */
  p: number
  /** Human-readable justification (coach overlay displays this verbatim). */
  reason: string
}
