/**
 * format.test.ts — the two labels every play surface reads a seat and a set by.
 *
 * `bookLabel` spells the suit out and keeps the glyph behind it, over the whole nine-set us54
 * book list rather than one example — `EIGHTS` has no suit at all and would be the thing a
 * naive split silently mangles. `bookWords` is the same name with the glyph dropped, for
 * accessible names, and the two are checked against each other so they cannot drift.
 *
 * The seat helpers are checked for the property the whole naming feature rests on: an absent
 * or empty name leaves the seat NUMBERED, because the shared table under src/play/room/ reuses
 * these components with no names at all and must keep working unchanged.
 */
import { describe, expect, it } from 'vitest'
import { allBooks, us54Config } from '../../lib/engine/index.ts'
import { bookLabel, bookWords, seatName, seatNameCap } from '../../src/play/format.ts'

const BOOKS = allBooks(us54Config)

describe('bookWords — the name, spoken', () => {
  it('spells every suit out', () => {
    expect(bookWords('LOW-H')).toBe('LOW HEARTS')
    expect(bookWords('HIGH-S')).toBe('HIGH SPADES')
    expect(bookWords('LOW-C')).toBe('LOW CLUBS')
    expect(bookWords('HIGH-D')).toBe('HIGH DIAMONDS')
  })

  it('leaves EIGHTS alone — it names no suit and must not be split', () => {
    expect(bookWords('EIGHTS')).toBe('EIGHTS')
  })

  it('carries no glyph, so an accessible name never says the suit twice', () => {
    for (const book of BOOKS) expect(bookWords(book)).not.toMatch(/[♥♦♣♠]/u)
  })
})

describe('bookLabel — the name, then the glyph behind it', () => {
  it('reads LOW HEARTS ♥, not LOW ♥', () => {
    expect(bookLabel('LOW-H')).toBe('LOW HEARTS ♥')
  })

  it('does the same for all eight suited books', () => {
    expect(bookLabel('HIGH-H')).toBe('HIGH HEARTS ♥')
    expect(bookLabel('LOW-D')).toBe('LOW DIAMONDS ♦')
    expect(bookLabel('HIGH-D')).toBe('HIGH DIAMONDS ♦')
    expect(bookLabel('LOW-C')).toBe('LOW CLUBS ♣')
    expect(bookLabel('HIGH-C')).toBe('HIGH CLUBS ♣')
    expect(bookLabel('LOW-S')).toBe('LOW SPADES ♠')
    expect(bookLabel('HIGH-S')).toBe('HIGH SPADES ♠')
  })

  it('leaves EIGHTS itself, glyph and all', () => {
    expect(bookLabel('EIGHTS')).toBe('EIGHTS')
  })

  it('puts the words FIRST at every book in the us54 set list', () => {
    for (const book of BOOKS) {
      const label = bookLabel(book)
      expect(label.startsWith(bookWords(book))).toBe(true)
      // A suited book is its words plus a space and one glyph; EIGHTS is just its words.
      expect(label).toBe(book === 'EIGHTS' ? bookWords(book) : `${bookWords(book)} ${label.at(-1)}`)
    }
  })

  it('hands back an unrecognised id rather than inventing a suit for it', () => {
    expect(bookLabel('LOW-Z')).toBe('LOW-Z')
    expect(bookWords('LOW-Z')).toBe('LOW-Z')
  })
})

describe('seatName — a name adds an identity, it never removes the seat', () => {
  const names = ['Ann', '', 'Cy', '', 'Ed']

  it('always calls seat 0 "you" — the human is not nameable', () => {
    expect(seatName(0, names)).toBe('you')
    expect(seatNameCap(0, names)).toBe('You')
  })

  it('uses a name where one is set', () => {
    expect(seatName(1, names)).toBe('Ann')
    expect(seatNameCap(3, names)).toBe('Cy')
    expect(seatNameCap(5, names)).toBe('Ed')
  })

  it('leaves an unnamed seat numbered', () => {
    expect(seatName(2, names)).toBe('seat 2')
    expect(seatNameCap(4, names)).toBe('Seat 4')
  })

  it('numbers every seat when no names are passed at all — the shared table case', () => {
    for (const seat of [1, 2, 3, 4, 5] as const) {
      expect(seatName(seat)).toBe(`seat ${seat}`)
      expect(seatNameCap(seat)).toBe(`Seat ${seat}`)
    }
  })

  it('survives a short or ragged names array without reaching past its end', () => {
    expect(seatNameCap(5, ['Ann'])).toBe('Seat 5')
    expect(seatNameCap(2, [])).toBe('Seat 2')
  })
})
