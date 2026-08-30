/**
 * table-ui.test.ts — the two pure pieces the play surface's readability rests on.
 *
 * Both exist because a human reported the table hard to read, and both are the kind of thing
 * that fails silently: a seating ring whose radii quietly let two cards overlap still renders,
 * and a suit-colour map that sends a joker to the wrong ink still shows a card. So the geometry
 * is checked against the seating the RULES imply (partners across, opponents alternating) and
 * against the collision arithmetic the stylesheet's magic number comes from, and the colour map
 * is checked over the whole deck rather than a couple of examples.
 */
import { describe, expect, it } from 'vitest'
import { allCards, us54Config } from '../../lib/engine/index.ts'
import type { Card, Seat } from '../../lib/engine/index.ts'
import { minTableHeight, seatPlaces } from '../../src/play/geometry.ts'
import { suitColor, cardLabel } from '../../src/play/format.ts'
import { teamOf } from '../../src/play/format.ts'

/** The radii and card height the stylesheet actually uses. */
const RX = 38
const RY = 34
const CARD_H = 104

describe('seatPlaces — the table as people sit at it', () => {
  const places = seatPlaces(RX, RY)

  it('returns all six seats, in seat order, for a screen reader to walk', () => {
    expect(places.map((p) => p.seat)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('seats the human at bottom centre — where you sit', () => {
    const me = places[0]
    expect(me.x).toBe(50)
    expect(me.y).toBe(50 + RY)
    // y grows downward in CSS, so "greater than centre" is "below centre".
    expect(me.y).toBeGreaterThan(50)
  })

  it('puts the far opponent at top centre, directly across the table', () => {
    const across = places[3]
    expect(across.x).toBe(50)
    expect(across.y).toBe(50 - RY)
  })

  it('puts your partners at the top corners and their seats at the bottom corners', () => {
    const y = (seat: Seat) => places[seat].y
    // Partners (2 and 4) sit above the centre line; the two flanking opponents below it.
    expect(y(2)).toBeLessThan(50)
    expect(y(4)).toBeLessThan(50)
    expect(y(1)).toBeGreaterThan(50)
    expect(y(5)).toBeGreaterThan(50)
  })

  it('alternates the two teams around the ring — the seating us54 assumes', () => {
    // Walking the ring in seat order must never put two of the same team side by side.
    for (let i = 0; i < 6; i++) {
      const here = i as Seat
      const next = ((i + 1) % 6) as Seat
      expect(teamOf(here)).not.toBe(teamOf(next))
    }
  })

  it('is symmetric about the vertical axis: 1 mirrors 5, and 2 mirrors 4', () => {
    expect(places[1].x).toBeCloseTo(100 - places[5].x, 6)
    expect(places[1].y).toBeCloseTo(places[5].y, 6)
    expect(places[2].x).toBeCloseTo(100 - places[4].x, 6)
    expect(places[2].y).toBeCloseTo(places[4].y, 6)
  })

  it('puts opposite seats diametrically opposite, as six even steps must', () => {
    for (const [a, b] of [
      [0, 3],
      [1, 4],
      [2, 5],
    ] as const) {
      expect(places[a].x + places[b].x).toBeCloseTo(100, 6)
      expect(places[a].y + places[b].y).toBeCloseTo(100, 6)
    }
  })

  it('lands every seat on the ellipse it claims to be on', () => {
    for (const p of places) {
      const dx = (p.x - 50) / RX
      const dy = (p.y - 50) / RY
      expect(dx * dx + dy * dy).toBeCloseTo(1, 3)
    }
  })

  it('leaves the three x columns far enough apart for the widest seat card', () => {
    const xs = [...new Set(places.map((p) => p.x))].sort((a, b) => a - b)
    expect(xs).toHaveLength(3)
    const gap = Math.min(xs[1] - xs[0], xs[2] - xs[1])
    // .table caps --seat-w at 27% of the box; the columns must be further apart than that,
    // or two cards touch at every width rather than at some particular one.
    expect(gap).toBeGreaterThan(27)
  })
})

describe('minTableHeight — the stylesheet magic number, derived', () => {
  it('matches the 380px min-height .table declares', () => {
    expect(minTableHeight(RX, RY, CARD_H)).toBeLessThanOrEqual(380)
  })

  it('is tall enough for half a card past the topmost and bottommost seats', () => {
    const h = minTableHeight(RX, RY, CARD_H)
    const places = seatPlaces(RX, RY)
    for (const p of places) {
      const centre = (p.y / 100) * h
      expect(centre - CARD_H / 2).toBeGreaterThanOrEqual(0)
      expect(centre + CARD_H / 2).toBeLessThanOrEqual(h)
    }
  })

  it('keeps the two seats sharing a column from overlapping', () => {
    const h = minTableHeight(RX, RY, CARD_H)
    const places = seatPlaces(RX, RY)
    for (const a of places) {
      for (const b of places) {
        if (a.seat >= b.seat || a.x !== b.x) continue
        const gap = Math.abs(a.y - b.y) * (h / 100)
        expect(gap).toBeGreaterThanOrEqual(CARD_H)
      }
    }
  })

  it('grows with the card, so a taller seat card cannot silently start colliding', () => {
    expect(minTableHeight(RX, RY, 140)).toBeGreaterThan(minTableHeight(RX, RY, 104))
  })
})

describe('suitColor — hearts and diamonds red, clubs and spades ink', () => {
  const deck = allCards(us54Config)

  it('classifies every card in the us54 deck', () => {
    for (const card of deck) expect(['red', 'black']).toContain(suitColor(card))
  })

  it('splits the 52 suited cards evenly, 26 red and 26 black', () => {
    const suited = deck.filter((c) => c !== 'XR' && c !== 'XB')
    expect(suited).toHaveLength(52)
    expect(suited.filter((c) => suitColor(c) === 'red')).toHaveLength(26)
    expect(suited.filter((c) => suitColor(c) === 'black')).toHaveLength(26)
  })

  it('follows the suit letter, not the rank', () => {
    for (const card of deck) {
      if (card === 'XR' || card === 'XB') continue
      const suit = card[1]
      expect(suitColor(card)).toBe(suit === 'H' || suit === 'D' ? 'red' : 'black')
    }
  })

  it('reads the two jokers by their own names: XR red, XB black', () => {
    expect(suitColor('XR' as Card)).toBe('red')
    expect(suitColor('XB' as Card)).toBe('black')
  })

  it('agrees with the glyph the face is drawn with, so colour never contradicts shape', () => {
    for (const card of deck) {
      if (card === 'XR' || card === 'XB') continue
      const glyph = cardLabel(card).slice(-1)
      const redGlyph = glyph === '♥' || glyph === '♦'
      expect(suitColor(card) === 'red').toBe(redGlyph)
    }
  })

  it('falls back to ink rather than claiming a suit it cannot read', () => {
    expect(suitColor('ZZ' as Card)).toBe('black')
  })
})
