/**
 * Geometry primitives for the diagram system.
 *
 * Two rules are enforced structurally rather than by review:
 *
 *   1. `orthoPath` cannot emit a diagonal. It accepts axis-aligned waypoints
 *      and throws on anything else, so "diagonals are an automatic fail"
 *      becomes a type-of-runtime error instead of a taste judgement.
 *   2. `fanAttach` spaces multiple connectors on one box edge, so no two
 *      arrows can share a point on a box.
 */

export interface Pt {
  x: number
  y: number
}

export const GRID = 4

export const snap = (v: number): number => Math.round(v / GRID) * GRID

export const onGrid = (v: number): boolean => Number.isFinite(v) && v % GRID === 0

/** True when the two points share an axis — the only legal segment. */
export const isAxisAligned = (a: Pt, b: Pt): boolean => a.x === b.x || a.y === b.y

const seg = (a: Pt, b: Pt): number => Math.abs(b.x - a.x) + Math.abs(b.y - a.y)

/**
 * Rounded right-angle elbow connector.
 *
 * Waypoints must be axis-aligned pairwise; every bend becomes an r=8
 * quarter-arc (shrinking to fit tight segments, never below the r=6 floor
 * the source system allows).
 */
export function orthoPath(points: readonly Pt[], r = 8): string {
  if (points.length < 2) throw new Error('orthoPath: need at least 2 waypoints')

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (!isAxisAligned(a, b)) {
      throw new Error(
        `orthoPath: diagonal segment (${a.x},${a.y})->(${b.x},${b.y}) — ` +
          'rounded right-angle elbows are mandatory',
      )
    }
  }

  let d = `M ${points[0].x} ${points[0].y}`

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const cur = points[i]
    const next = points[i + 1]

    const inX = Math.sign(cur.x - prev.x)
    const inY = Math.sign(cur.y - prev.y)
    const outX = Math.sign(next.x - cur.x)
    const outY = Math.sign(next.y - cur.y)

    // Collinear waypoint: nothing to round.
    if (inX === outX && inY === outY) continue

    const rr = Math.min(r, seg(prev, cur) / 2, seg(cur, next) / 2)
    if (rr <= 0) continue

    const ax = cur.x - inX * rr
    const ay = cur.y - inY * rr
    const bx = cur.x + outX * rr
    const by = cur.y + outY * rr

    // SVG y grows downward, so a positive cross product is a clockwise turn.
    const sweep = inX * outY - inY * outX > 0 ? 1 : 0

    d += ` L ${ax} ${ay} A ${rr} ${rr} 0 0 ${sweep} ${bx} ${by}`
  }

  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

/**
 * Snap to the nearest value congruent to `phase` modulo 8.
 *
 * Both phases (0 and 4) stay on the 4px grid, and a phase-0 value can never
 * equal a phase-4 one. That is what keeps an EXIT column off every ENTRY
 * column: without it, one edge's downward stub and another's shares an x and
 * the two strokes run on top of each other for the length of the shorter —
 * a rule-3 failure that no amount of track assignment can reach, because the
 * two verticals belong to different edges at different nodes.
 */
export const snapPhase = (v: number, phase: 0 | 4): number =>
  Math.round((v - phase) / 8) * 8 + phase

/**
 * Attach points for N connectors sharing one box edge.
 *
 * Offset k (1..n) sits at `length * k / (n + 1)` from the leading corner,
 * snapped to the 4px grid (or to the given phase — see `snapPhase`). Throws
 * when the edge is too short to keep the mandated 12px separation: a layout
 * failure, not something to fudge.
 */
export function fanAttach(
  start: number,
  length: number,
  n: number,
  minGap = 12,
  phase?: 0 | 4,
): number[] {
  if (n < 1) return []
  const place = (v: number) => (phase === undefined ? snap(v) : snapPhase(v, phase))
  if (n === 1) return [place(start + length / 2)]

  const raw = Array.from({ length: n }, (_, i) => place(start + (length * (i + 1)) / (n + 1)))
  for (let i = 1; i < raw.length; i++) {
    if (raw[i] - raw[i - 1] < minGap) {
      throw new Error(
        `fanAttach: ${n} connectors need >=${minGap}px apart on a ${length}px edge — ` +
          'the layout is too tight; move the nodes',
      )
    }
  }
  return raw
}

/* ------------------------------------------------------------------------ */
/* Arrow labels: masked, with a visible 6-10px gap to the stroke.             */
/* ------------------------------------------------------------------------ */

export type LabelSide = 'above' | 'below' | 'left' | 'right'

export interface LabelPlacement {
  maskX: number
  maskY: number
  maskW: number
  maskH: number
  textX: number
  textY: number
  anchor: 'start' | 'middle' | 'end'
}

const LABEL_H = 12

/** Advance width of the 8px arrow-label role, tracked 0.10em. */
export const labelWidth = (text: string): number => snap(text.length * 6 + 12)

/**
 * Place a masked arrow label against a segment.
 *
 * The mask is opaque so the connector cannot bleed through the text; the
 * `gap` is the VISIBLE distance from the mask's near edge to the stroke, so
 * the reader can still trace the line. 6px minimum, 10px maximum.
 */
export function placeLabel(
  mid: Pt,
  side: LabelSide,
  gap: number,
  text: string,
): LabelPlacement {
  const w = labelWidth(text)
  switch (side) {
    case 'above':
      return {
        maskX: mid.x - w / 2,
        maskY: mid.y - gap - LABEL_H,
        maskW: w,
        maskH: LABEL_H,
        textX: mid.x,
        textY: mid.y - gap - 3,
        anchor: 'middle',
      }
    case 'below':
      return {
        maskX: mid.x - w / 2,
        maskY: mid.y + gap,
        maskW: w,
        maskH: LABEL_H,
        textX: mid.x,
        textY: mid.y + gap + 9,
        anchor: 'middle',
      }
    case 'right':
      return {
        maskX: mid.x + gap,
        maskY: mid.y - LABEL_H / 2,
        maskW: w,
        maskH: LABEL_H,
        textX: mid.x + gap + 4,
        textY: mid.y + 3,
        anchor: 'start',
      }
    case 'left':
      return {
        maskX: mid.x - gap - w,
        maskY: mid.y - LABEL_H / 2,
        maskW: w,
        maskH: LABEL_H,
        textX: mid.x - gap - 4,
        textY: mid.y + 3,
        anchor: 'end',
      }
  }
}

/** Midpoint of the longest axis-aligned segment in a polyline. */
export function longestSegmentMid(points: readonly Pt[]): Pt {
  let best = 0
  let mid: Pt = points[0]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = seg(a, b)
    if (len > best) {
      best = len
      mid = { x: snap((a.x + b.x) / 2), y: snap((a.y + b.y) / 2) }
    }
  }
  return mid
}

/* ------------------------------------------------------------------------ */
/* Charts must not lie: the value axis is never truncated.                    */
/* ------------------------------------------------------------------------ */

export interface Domain {
  floor: number
  ceil: number
}

function niceCeil(v: number): number {
  if (v <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) {
    const c = m * mag
    if (c >= v) return c
  }
  return 10 * mag
}

/**
 * Domain floor/ceil derived from the data's RANGE, never from its observed
 * extremes — taking min/max as the bounds is the truncation.
 *
 * Four exhaustive cases, matching `verify-dumbbell.py`:
 *   lo >= 0        -> floor 0, ceil rounded up past hi
 *   hi <= 0        -> ceil 0, floor rounded down past lo
 *   lo < 0 < hi    -> bracket both sides; zero falls inside the plot
 *   all zero       -> finite fallback span, every mark on the floor
 */
export function niceDomain(values: readonly number[]): Domain {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return { floor: 0, ceil: 1 }

  const lo = Math.min(...finite)
  const hi = Math.max(...finite)

  if (lo === 0 && hi === 0) return { floor: 0, ceil: 1 }
  if (lo >= 0) return { floor: 0, ceil: niceCeil(hi) }
  if (hi <= 0) return { floor: -niceCeil(-lo), ceil: 0 }
  return { floor: -niceCeil(-lo), ceil: niceCeil(hi) }
}

/**
 * A domain for values that live in a narrow band well away from zero (score
 * rates around 0.5, precisions around 0.9). Anchored on a round unit so the
 * frame is honest, and always containing `anchor`.
 */
export function bandDomain(values: readonly number[], step: number, anchor: number): Domain {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return { floor: anchor - step, ceil: anchor + step }

  const lo = Math.min(...finite, anchor)
  const hi = Math.max(...finite, anchor)
  const floor = Math.floor(lo / step) * step
  const ceil = Math.ceil(hi / step) * step
  return floor === ceil ? { floor, ceil: ceil + step } : { floor, ceil }
}

/** Scale a value onto a pixel span. Data coordinates are 4px-grid exempt. */
export function scaleTo(v: number, d: Domain, px0: number, px1: number): number {
  const span = d.ceil - d.floor
  if (span === 0) return px0
  return Math.round(px0 + ((v - d.floor) / span) * (px1 - px0))
}

/** Evenly spaced tick values across a domain, inclusive of both bounds. */
export function ticks(d: Domain, count: number): number[] {
  const n = Math.max(2, count)
  const step = (d.ceil - d.floor) / (n - 1)
  return Array.from({ length: n }, (_, i) => d.floor + i * step)
}
