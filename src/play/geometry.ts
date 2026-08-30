/**
 * Where the six seats sit — the table drawn in the round, as people actually sit at one.
 *
 * The flat auto-fit grid this replaced put the six seats in a row, which is not a Fish table and
 * cost a reader the one fact the seating IS: partners sit across the gaps from each other and
 * opponents alternate around the circle. So the seats go on an ellipse, one every 60°, starting
 * at the bottom:
 *
 *     θ(i) = 90° + i · 60°      x = 50% + rx·cos θ      y = 50% + ry·sin θ
 *
 * `y` grows DOWNWARD (CSS, not maths), so θ = 90° lands at the bottom of the ellipse. That puts
 * the human at bottom centre — where you sit — and then, anticlockwise on screen:
 *
 *              seat 3 (them)
 *      seat 2            seat 4     <- your partners, the top corners
 *      seat 1            seat 5     <- their seats, the bottom corners
 *              seat 0 = YOU
 *
 * which is the alternating 0/1/0/1/0/1 team order round a real table. The angles are exact
 * multiples of 60°, so opposite seats are diametrically opposite and the figure is symmetric
 * about the vertical axis — seat 1 mirrors seat 5, seat 2 mirrors seat 4.
 *
 * Every card is CENTRED on its point, so the box has to be tall enough for half a card to hang
 * past the extreme seats and for the two seats sharing a column not to meet in the middle.
 * `minTableHeight` is that arithmetic, kept here beside the angles it depends on.
 *
 * This module is pure and unit-tested; the component does nothing but write the numbers into two
 * custom properties. Nothing here knows about React, and the DOM stays in seat order 0..5 for a
 * screen reader — the ring is CSS position only.
 */
import type { Seat } from '../../lib/engine/index.ts'

/** One seat's place on the ellipse, in percentages of the table box. */
export interface SeatPlace {
  seat: Seat
  /** Centre-x as a percentage of the table's width. */
  x: number
  /** Centre-y as a percentage of the table's height, growing downward. */
  y: number
}

/** Degrees between adjacent seats: six seats evenly spaced. */
const STEP_DEG = 60

/** The human's seat sits at the bottom of the ellipse — 90°, because y grows downward. */
const START_DEG = 90

const SEATS: readonly Seat[] = [0, 1, 2, 3, 4, 5]

/** Rounded to 0.01% — enough for a pixel-exact placement, short enough to read in devtools. */
const round = (n: number): number => Math.round(n * 100) / 100

/**
 * The six seats' centres, in percent, for an ellipse with the given radii (also percentages of
 * the box). Radii below 50 keep the seat cards' centres inside the box so their bodies overhang
 * by only half a card — the layout reserves the rest as padding.
 */
export function seatPlaces(rx: number, ry: number): SeatPlace[] {
  return SEATS.map((seat) => {
    const rad = ((START_DEG + seat * STEP_DEG) * Math.PI) / 180
    return { seat, x: round(50 + rx * Math.cos(rad)), y: round(50 + ry * Math.sin(rad)) }
  })
}

/**
 * The height a table box needs, as a multiple of one seat card's height, for the ring not to
 * collide with itself. Two constraints, and the larger wins:
 *
 *   · the extreme seats (0 at 82%, 3 at 18% for the default radii) are CENTRED on their points,
 *     so half a card hangs past each — the box needs `H >= cardH / (2 · (1 - yMax))`;
 *   · the two seats sharing a column (1 above 2 on the left, 5 above 4 on the right) are one
 *     `2·ry·sin30° = ry` apart in y, so the box needs `H >= cardH / (ry/50 · ...)`, which for
 *     six evenly spaced seats reduces to the gap between adjacent y bands.
 *
 * Exposed so the number in the stylesheet is derived rather than guessed, and so a change to
 * the radii is caught by a test instead of by a player finding two seats on top of each other.
 */
export function minTableHeight(rx: number, ry: number, cardHeight: number): number {
  const places = seatPlaces(rx, ry)
  const ys = places.map((p) => p.y)
  // Half a card past the furthest seat, top and bottom.
  const overhang = cardHeight / 2 / (Math.min(...ys) / 100)
  // The tightest vertical gap between two seats that share an x column.
  const columns = new Map<number, number[]>()
  for (const p of places) columns.set(p.x, [...(columns.get(p.x) ?? []), p.y])
  let tightest = 100
  for (const band of columns.values()) {
    band.sort((a, b) => a - b)
    for (let i = 1; i < band.length; i++) tightest = Math.min(tightest, band[i] - band[i - 1])
  }
  const spacing = (cardHeight / tightest) * 100
  return Math.ceil(Math.max(overhang, spacing))
}
