/**
 * value.ts — MONET.md §3.8ab: the learned leaf. A value function over the FULL-INFORMATION state
 * (a determinized deal, or the true one) that estimates the final set differential for a team,
 * fitted on self-play outcomes — the leaf the search arm evaluates at its horizon in place of the
 * lock-only count (`leafValue` in search.ts), which §3.8aa read as a marker that does not convert
 * into sets by the game's end.
 *
 * ## The features
 *
 * Ten global terms and twelve per unresolved half-suit, the half-suits laid out in nine slots in
 * a canonical order (ours descending, then how many of its six locations our best-informed seat
 * knows, then how few of them theirs does, then our concentration), so the vector is invariant to
 * which suit is which. A resolved half-suit is an empty slot. Everything is read from the state
 * and from what the six seats can INFER from the public log — the public walk once and one
 * knowledge build per seat (`publicKnowledge`, `buildKnowledge`), about 0.15 ms a state — because
 * in this game a set's worth is not where its cards are but who knows where they are: a card the
 * opponents have located is theirs to take back, a lock nobody on the holding team can prove is
 * not yet a set.
 *
 * ## The model
 *
 * `ValueModel` is plain JSON — a standardisation and a stack of dense layers, ReLU between them
 * and none after the last; one layer is a linear model. `compileValueModel` turns it into typed
 * arrays once; `valueOf` is the forward pass over the features of a state. Fitting is a script's
 * job (`scripts/fit-value.mjs` on `scripts/gen-value-data.mjs`'s files); this module never
 * trains. A finished game's value is its set differential exactly, whatever the model says.
 *
 * Not a policy of the bots directory (it reads `GameState`), so it lives with the search.
 */
import type { BookId, Card, GameState, Seat, Team } from '../types.ts'
import { allBooks, bookCards, seatTeam, teamSeats } from '../cards.ts'
import { seatView } from '../views.ts'
import { buildKnowledge, publicKnowledge } from '../bots/knowledge.ts'
import type { Knowledge, KnowledgeOptions } from '../bots/types.ts'

export const GLOBAL_FEATURES = [
  /** Our sets minus theirs. */
  'scoreDiff',
  /** Resolved half-suits, 0–9. */
  'resolved',
  /** Cards in our hands minus cards in theirs. */
  'cardDiff',
  /** +1 when the turn is ours, −1 when theirs (0 in a finished game). */
  'turnOurs',
  /** The turn-holder's hand size. */
  'turnHand',
  /** Our seats still holding cards, 0–3. */
  'oursSeatsIn',
  /** Their seats still holding cards, 0–3. */
  'theirsSeatsIn',
  /** The smallest hand on our side. */
  'oursMinHand',
  /** The smallest hand on theirs. */
  'theirsMinHand',
  /** Asks made so far, in hundreds. */
  'asks',
] as const

export const SLOT_FEATURES = [
  /** Cards of the half-suit in our hands, 0–6. */
  'ours',
  /** Our cards of it whose holder the public log pins. */
  'oursPublic',
  /** Their cards of it the public log pins. */
  'theirsPublic',
  /** Our cards of it some opponent seat has located (its own inference, the log and its hand). */
  'oursKnownToThem',
  /** Their cards of it some seat of ours has located. */
  'theirsKnownToUs',
  /** Of the six locations, how many our best-informed seat knows (its own hand included). */
  'oursBestKnown',
  /** The same for their best-informed seat. */
  'theirsBestKnown',
  /** The most cards of it in one hand of ours. */
  'oursConcentration',
  /** The most in one hand of theirs. */
  'theirsConcentration',
  /** Our seats holding at least one card of it, 0–3. */
  'oursSpread',
  /** Theirs, 0–3. */
  'theirsSpread',
  /** +1 when the turn-holder is ours and holds a card of it (can ask into it now), −1 when theirs does, else 0. */
  'turnHolderHolds',
] as const

export const SLOTS = 9
export const VALUE_FEATURE_COUNT = GLOBAL_FEATURES.length + SLOTS * SLOT_FEATURES.length

/** The feature names in vector order, for a fitter's report. */
export function valueFeatureNames(): string[] {
  const out: string[] = [...GLOBAL_FEATURES]
  for (let i = 0; i < SLOTS; i++) for (const f of SLOT_FEATURES) out.push(`s${i}.${f}`)
  return out
}

/** The knowledge every seat holds at a state: the public walk once, and one build per seat. */
export interface TableKnowledge {
  pub: Knowledge
  seats: Knowledge[]
}

export function tableKnowledge(s: GameState, options: KnowledgeOptions = {}): TableKnowledge {
  const pub = publicKnowledge(seatView(s, 0), options)
  const seats: Knowledge[] = []
  for (let x = 0; x < 6; x++) seats.push(buildKnowledge(seatView(s, x as Seat), options))
  return { pub, seats }
}

interface Slot {
  key: number[]
  row: number[]
}

/**
 * The feature vector of a state for `team`. `tk` may be supplied when several teams' vectors are
 * read at one state (the knowledge is the same for both).
 */
export function valueFeatures(s: GameState, team: Team, tk?: TableKnowledge, options: KnowledgeOptions = {}): Float64Array {
  const k = tk ?? tableKnowledge(s, options)
  const other: Team = team === 0 ? 1 : 0
  const ourSeats = teamSeats(team)
  const theirSeats = teamSeats(other)
  const holder = new Map<Card, Seat>()
  for (let x = 0; x < 6; x++) for (const c of s.hands[x]) holder.set(c, x as Seat)
  const x = new Float64Array(VALUE_FEATURE_COUNT)

  // the global terms
  let ourCards = 0
  let theirCards = 0
  let oursIn = 0
  let theirsIn = 0
  let oursMin = Number.POSITIVE_INFINITY
  let theirsMin = Number.POSITIVE_INFINITY
  for (let seat = 0; seat < 6; seat++) {
    const n = s.hands[seat].length
    if (seatTeam(seat as Seat) === team) {
      ourCards += n
      if (n > 0) oursIn++
      oursMin = Math.min(oursMin, n)
    } else {
      theirCards += n
      if (n > 0) theirsIn++
      theirsMin = Math.min(theirsMin, n)
    }
  }
  let asks = 0
  for (const ev of s.log) if (ev.type === 'ask') asks++
  const finished = s.phase === 'finished'
  let resolved = 0
  for (const b of allBooks(s.config)) if (s.books[b]) resolved++
  x[0] = s.score[team] - s.score[other]
  x[1] = resolved
  x[2] = ourCards - theirCards
  x[3] = finished ? 0 : seatTeam(s.turn) === team ? 1 : -1
  x[4] = finished ? 0 : s.hands[s.turn].length
  x[5] = oursIn
  x[6] = theirsIn
  x[7] = oursMin
  x[8] = theirsMin
  x[9] = asks / 100

  // the half-suits
  const turnTeam = finished ? -1 : seatTeam(s.turn)
  const turnHand = finished ? new Set<Card>() : new Set<Card>(s.hands[s.turn])
  const slots: Slot[] = []
  for (const b of allBooks(s.config)) {
    if (s.books[b as BookId]) continue
    const cards = bookCards(b, s.config)
    let ours = 0
    let oursPublic = 0
    let theirsPublic = 0
    let oursKnownToThem = 0
    let theirsKnownToUs = 0
    const perSeat = new Array<number>(6).fill(0)
    const knownBy = new Array<number>(6).fill(0)
    let turnHolderHolds = 0
    for (const c of cards) {
      const h = holder.get(c)
      if (h === undefined) continue // cannot happen for an unresolved half-suit; the engine keeps every card in play
      const mine = seatTeam(h) === team
      perSeat[h]++
      if (mine) ours++
      const pub = k.pub.holders[c] !== undefined
      if (pub) {
        if (mine) oursPublic++
        else theirsPublic++
      }
      for (let seat = 0; seat < 6; seat++) if (k.seats[seat].holders[c] !== undefined) knownBy[seat]++
      if (mine) {
        for (const t of theirSeats) if (k.seats[t].holders[c] !== undefined) { oursKnownToThem++; break }
      } else {
        for (const o of ourSeats) if (k.seats[o].holders[c] !== undefined) { theirsKnownToUs++; break }
      }
      if (turnTeam >= 0 && turnHand.has(c)) turnHolderHolds = turnTeam === team ? 1 : -1
    }
    let oursBestKnown = 0
    let theirsBestKnown = 0
    let oursConc = 0
    let theirsConc = 0
    let oursSpread = 0
    let theirsSpread = 0
    for (const o of ourSeats) {
      oursBestKnown = Math.max(oursBestKnown, knownBy[o])
      oursConc = Math.max(oursConc, perSeat[o])
      if (perSeat[o] > 0) oursSpread++
    }
    for (const t of theirSeats) {
      theirsBestKnown = Math.max(theirsBestKnown, knownBy[t])
      theirsConc = Math.max(theirsConc, perSeat[t])
      if (perSeat[t] > 0) theirsSpread++
    }
    slots.push({
      key: [ours, oursBestKnown, -theirsBestKnown, oursConc],
      row: [ours, oursPublic, theirsPublic, oursKnownToThem, theirsKnownToUs, oursBestKnown, theirsBestKnown, oursConc, theirsConc, oursSpread, theirsSpread, turnHolderHolds],
    })
  }
  slots.sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i]
    return 0
  })
  const G = GLOBAL_FEATURES.length
  const W = SLOT_FEATURES.length
  for (let i = 0; i < Math.min(SLOTS, slots.length); i++) {
    const row = slots[i].row
    for (let j = 0; j < W; j++) x[G + i * W + j] = row[j]
  }
  return x
}

/** A fitted model as JSON: the standardisation and the dense layers, ReLU between them, none after the last. */
export interface ValueModel {
  /** `VALUE_FEATURE_COUNT` at fitting time; a mismatch is refused. */
  features: number
  mean: number[]
  std: number[]
  /** Row-major `w` of `out × in` and `b` of `out`; the last layer has one output. */
  layers: { w: number[]; b: number[] }[]
  /** Free-form provenance (the data, the fit, the holdout error). */
  meta?: Record<string, unknown>
}

export interface CompiledValueModel {
  features: number
  mean: Float64Array
  invStd: Float64Array
  layers: { w: Float64Array; b: Float64Array; out: number; inp: number }[]
  /** Scratch buffers for the forward pass, one per layer's output. */
  buf: Float64Array[]
}

export function compileValueModel(m: ValueModel): CompiledValueModel {
  if (m.features !== VALUE_FEATURE_COUNT) throw new Error(`value model has ${m.features} features; this build has ${VALUE_FEATURE_COUNT}`)
  if (m.mean.length !== m.features || m.std.length !== m.features) throw new Error('value model: standardisation length')
  let inp = m.features
  const layers = m.layers.map((l) => {
    const out = l.b.length
    if (l.w.length !== out * inp) throw new Error(`value model: layer of ${out}×${inp} has ${l.w.length} weights`)
    const layer = { w: Float64Array.from(l.w), b: Float64Array.from(l.b), out, inp }
    inp = out
    return layer
  })
  if (layers.length === 0 || layers[layers.length - 1].out !== 1) throw new Error('value model: the last layer must have one output')
  return {
    features: m.features,
    mean: Float64Array.from(m.mean),
    invStd: Float64Array.from(m.std, (v) => (v > 0 ? 1 / v : 0)),
    layers,
    buf: layers.map((l) => new Float64Array(l.out)),
  }
}

/** The model's estimate on a feature vector. */
export function valueOfFeatures(m: CompiledValueModel, x: Float64Array): number {
  let cur: Float64Array = new Float64Array(m.features)
  for (let i = 0; i < m.features; i++) cur[i] = (x[i] - m.mean[i]) * m.invStd[i]
  for (let li = 0; li < m.layers.length; li++) {
    const l = m.layers[li]
    const out = m.buf[li]
    const last = li === m.layers.length - 1
    for (let o = 0; o < l.out; o++) {
      let acc = l.b[o]
      const base = o * l.inp
      for (let i = 0; i < l.inp; i++) acc += l.w[base + i] * cur[i]
      out[o] = last || acc > 0 ? acc : 0
    }
    cur = out
  }
  return cur[0]
}

/** The model's estimate of the final set differential for `team` at `s`; a finished game's differential exactly. */
export function valueOf(m: CompiledValueModel, s: GameState, team: Team, tk?: TableKnowledge, options: KnowledgeOptions = {}): number {
  if (s.phase === 'finished') return s.score[team] - s.score[team === 0 ? 1 : 0]
  return valueOfFeatures(m, valueFeatures(s, team, tk, options))
}
