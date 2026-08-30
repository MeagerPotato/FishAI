/**
 * `withSeatNames` rewrites the engine's own prose at the display edge.
 *
 * The engine writes `seat 3` because its strings are part of the measured record and must not
 * learn about nicknames. The table names its bots. Something has to reconcile those, and this is
 * it — so these cases pin the reconciliation rather than the wording either side of it.
 */
import { describe, expect, it } from 'vitest'
import { withSeatNames } from '../../src/play/format.ts'

const NAMES = ['Nina', 'Big Bo', 'Cy', 'Dee', 'Eli']

describe('withSeatNames', () => {
  it('names a seat inside engine prose', () => {
    expect(withSeatNames('Asked seat 1 for 3♠ — a certain hit.', NAMES)).toBe(
      'Asked Nina for 3♠ — a certain hit.',
    )
  })

  it('keeps a sentence-initial capital', () => {
    expect(withSeatNames('Seat 3 holds the rest.', NAMES)).toBe('Cy holds the rest.')
  })

  it('rewrites every seat in one string', () => {
    expect(withSeatNames('seat 1 and seat 5 split it, seat 2 does not.', NAMES)).toBe(
      'Nina and Eli split it, Big Bo does not.',
    )
  })

  it('leaves seat 0 alone — that seat is the reader, and the engine says so its own way', () => {
    expect(withSeatNames('seat 0 holds it.', NAMES)).toBe('seat 0 holds it.')
  })

  it('leaves an unnamed seat numbered rather than inventing one', () => {
    expect(withSeatNames('Asked seat 4 for 3♠.', ['Nina'])).toBe('Asked seat 4 for 3♠.')
  })

  it('is a no-op with no names, so an unnamed table reads exactly as the engine wrote it', () => {
    const prose = 'Asked seat 2 for 3♠ — a certain hit.'
    expect(withSeatNames(prose, [])).toBe(prose)
    expect(withSeatNames(prose)).toBe(prose)
  })

  it('does not touch a number that is not a seat', () => {
    expect(withSeatNames('Seated 3 of 6; seat 3 asks.', NAMES)).toBe('Seated 3 of 6; Cy asks.')
  })

  it('does not touch a two-digit seat that cannot exist', () => {
    expect(withSeatNames('seat 12 is not a seat.', NAMES)).toBe('seat 12 is not a seat.')
  })
})
