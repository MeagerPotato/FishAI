/**
 * room-view.test.ts — the pure pieces a shared table rests on that the solo table never needed.
 *
 * Three of them, and each is here because it fails SILENTLY when it is wrong:
 *
 *   · The viewer-relative seating. A room's reader is usually not seat 0, and every seat-relative
 *     fact on the surface — who you may ask, who you may place a declared card with, who is drawn
 *     where — has to be derived from their real seat. Get it wrong and the page still renders; it
 *     just offers a player their own teammates to ask, and the engine refuses moves the interface
 *     said were legal.
 *   · The log's voice. Six named people instead of "seat 0 is you".
 *   · The join-code alphabet, which exists in two places that cannot import each other.
 *
 * Everything about teams is checked AGAINST `seatTeam`/`teamSeats` from lib/engine rather than
 * against a list of seats written down again here. A test that repeats the constant it is
 * checking proves only that someone typed it twice.
 */
import { describe, expect, it } from 'vitest'
import type { PublicEvent, Seat } from '../../lib/engine/index.ts'
import { ALL_SEATS, seatTeam, teamSeats } from '../../lib/engine/index.ts'
import { minTableHeight } from '../../src/play/geometry.ts'
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  normalizeCode,
  TEAM_LABEL,
} from '../../src/play/room/protocol.ts'
import {
  RX,
  RY,
  describeRoomEvent,
  namesFrom,
  opponentsOf,
  placesFor,
  sameTeam,
  teammatesOf,
} from '../../src/play/room/view.ts'

/** The card height room.module.css is built around, and the min-height it declares. */
const CARD_H = 104
const DECLARED_MIN_HEIGHT = 340

describe('placesFor — the table seen from your own chair', () => {
  it('seats the viewer at the bottom of the ellipse, from every seat', () => {
    for (const viewer of ALL_SEATS) {
      const places = placesFor(viewer)
      const lowest = places.reduce((a, b) => (a.y > b.y ? a : b))
      expect(lowest.seat, `viewer ${viewer} should be drawn at the bottom`).toBe(viewer)
    }
  })

  it('draws all six real seats exactly once, whoever is looking', () => {
    for (const viewer of ALL_SEATS) {
      const seats = placesFor(viewer).map((p) => p.seat)
      expect([...seats].sort((a, b) => a - b)).toEqual([...ALL_SEATS])
    }
  })

  it('puts the viewer’s partners at the top corners and opponents between', () => {
    for (const viewer of ALL_SEATS) {
      const places = placesFor(viewer)
      // Places come back in ring order starting at the viewer, so alternating entries alternate
      // teams — which is exactly the seating the rules imply.
      for (let i = 0; i < places.length; i++) {
        const seat = places[i].seat
        expect(
          sameTeam(seat, viewer),
          `place ${i} from seat ${viewer} holds seat ${seat}`,
        ).toBe(i % 2 === 0)
      }
    }
  })

  it('keeps the two seats sharing a column apart at the height the stylesheet declares', () => {
    // Derived, not guessed: if the radii in view.ts widen, this fails here instead of a player
    // finding two seat cards on top of each other.
    expect(minTableHeight(RX, RY, CARD_H)).toBeLessThanOrEqual(DECLARED_MIN_HEIGHT)
  })
})

describe('who you may ask and who you may declare with', () => {
  it('offers exactly the other side as opponents, for every seat', () => {
    for (const viewer of ALL_SEATS) {
      const expected = teamSeats(seatTeam(viewer) === 0 ? 1 : 0)
      expect(opponentsOf(viewer)).toEqual(expected)
      // The bug this catches: `const OPPONENTS = [1, 3, 5]`, which is right for seat 0 and wrong
      // for every seat on the odd side.
      for (const seat of opponentsOf(viewer)) expect(seatTeam(seat)).not.toBe(seatTeam(viewer))
    }
  })

  it('offers exactly your own side as declare targets, including yourself', () => {
    for (const viewer of ALL_SEATS) {
      expect(teammatesOf(viewer)).toEqual(teamSeats(seatTeam(viewer)))
      expect(teammatesOf(viewer)).toContain(viewer)
      for (const seat of teammatesOf(viewer)) expect(seatTeam(seat)).toBe(seatTeam(viewer))
    }
  })

  it('never lets a seat be both an opponent and a teammate', () => {
    for (const viewer of ALL_SEATS) {
      const overlap = opponentsOf(viewer).filter((s) => teammatesOf(viewer).includes(s))
      expect(overlap).toEqual([])
      expect(opponentsOf(viewer).length + teammatesOf(viewer).length).toBe(6)
    }
  })

  it('labels the two sides by the parity `seatTeam` uses', () => {
    for (const seat of ALL_SEATS) {
      expect(TEAM_LABEL[seatTeam(seat)]).toBe(seat % 2 === 0 ? 'Evens' : 'Odds')
    }
  })
})

describe('namesFrom — the people at the table', () => {
  const lobby = {
    players: [
      { seat: 0 as Seat, name: 'Ada' },
      { seat: 3 as Seat, name: 'Di' },
    ],
    hostSeat: 0 as Seat,
  }

  it('gives a seated player their own name', () => {
    const nameOf = namesFrom(lobby)
    expect(nameOf(0)).toBe('Ada')
    expect(nameOf(3)).toBe('Di')
  })

  it('falls back to the seat for a chair nobody is in yet', () => {
    expect(namesFrom(lobby)(5)).toBe('Seat 5')
  })

  it('does not resolve inherited keys as names', () => {
    // The lobby arrives over the network; a Map lookup cannot be reached through
    // Object.prototype, which is exactly why one is used here.
    const nameOf = namesFrom({ players: [], hostSeat: null })
    for (const seat of ALL_SEATS) expect(nameOf(seat)).toBe(`Seat ${seat}`)
  })
})

describe('describeRoomEvent — the log, addressed to whoever is reading it', () => {
  const nameOf = namesFrom({
    players: ALL_SEATS.map((seat) => ({ seat, name: ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Fi'][seat] })),
    hostSeat: 0,
  })
  const ask: PublicEvent = { type: 'ask', asker: 3, target: 4, card: '9H', hit: true }

  it('calls the reader "you" from whichever seat they are in', () => {
    expect(describeRoomEvent(ask, 3, nameOf)).toContain('You asked Ed')
    expect(describeRoomEvent(ask, 4, nameOf)).toContain('Di asked you')
  })

  it('names everyone else, and never says "you" to a spectator', () => {
    const line = describeRoomEvent(ask, null, nameOf)
    expect(line).toContain('Di asked Ed')
    expect(line.toLowerCase()).not.toContain('you')
  })

  it('reports a hit and a miss as the rules do', () => {
    expect(describeRoomEvent(ask, 0, nameOf)).toContain('the turn is kept')
    expect(describeRoomEvent({ ...ask, hit: false }, 0, nameOf)).toContain('the turn passes')
  })

  it('names the two sides rather than "team 0" in every event that has one', () => {
    const claim: PublicEvent = {
      type: 'claim',
      claimer: 1,
      book: 'LOW-C',
      assignments: {} as PublicEvent extends { assignments: infer A } ? A : never,
      actualHolders: {} as PublicEvent extends { actualHolders: infer A } ? A : never,
      outcome: 'team1',
    }
    expect(describeRoomEvent(claim, 0, nameOf)).toContain('Odds')
    expect(describeRoomEvent({ type: 'endgame', claimingTeam: 0 }, 0, nameOf)).toContain('Evens')
    expect(
      describeRoomEvent({ type: 'game_over', score: [5, 3], winner: 0 }, 0, nameOf),
    ).toContain('Evens clinch')
  })

  it('conjugates "is/are out of cards" for the reader', () => {
    expect(describeRoomEvent({ type: 'player_out', seat: 2 }, 2, nameOf)).toBe('You are out of cards.')
    expect(describeRoomEvent({ type: 'player_out', seat: 2 }, 0, nameOf)).toBe('Cy is out of cards.')
  })
})

/**
 * The alphabet exists twice: here, and in supabase/functions/room/code.ts, which is inside a Deno
 * bundle this build cannot import. The duplication is deliberate (the server mints codes; the
 * client only rejects impossible keystrokes early) and this is what keeps the two honest.
 */
const SERVER_CODE_SOURCE = Object.values(
  import.meta.glob('../../supabase/functions/room/code.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>,
)[0]

describe('the join code', () => {
  it('matches the alphabet the server mints from', () => {
    const declared = /CODE_ALPHABET = '([^']+)'/.exec(SERVER_CODE_SOURCE)?.[1]
    expect(declared, 'the server no longer declares CODE_ALPHABET the same way').toBeDefined()
    expect(CODE_ALPHABET).toBe(declared)

    const length = /CODE_LENGTH = (\d+)/.exec(SERVER_CODE_SOURCE)?.[1]
    expect(CODE_LENGTH).toBe(Number(length))
  })

  it('drops every glyph people misread aloud', () => {
    for (const ch of ['O', '0', 'I', '1']) expect(CODE_ALPHABET).not.toContain(ch)
  })

  it('is exactly 32 characters, which is what makes the draw unbiased', () => {
    // The server masks a random byte to 5 bits. 32 divides 256, so every character is equally
    // likely; 33 would have skewed the first character of the alphabet measurably more common.
    expect(CODE_ALPHABET.length).toBe(32)
    expect(new Set(CODE_ALPHABET).size).toBe(32)
  })

  it('accepts a code however it was typed', () => {
    expect(normalizeCode('7kq4mp')).toBe('7KQ4MP')
    expect(normalizeCode('7KQ 4MP')).toBe('7KQ4MP')
    expect(normalizeCode('7KQ-4MP')).toBe('7KQ4MP')
    // A code arrives pasted out of a chat message as often as it arrives typed, and it brings the
    // surrounding whitespace with it.
    expect(normalizeCode('  7KQ4MP  ')).toBe('7KQ4MP')
    expect(normalizeCode('\n7kq-4 mp\t')).toBe('7KQ4MP')
  })

  it('refuses what cannot be a code, rather than sending it', () => {
    expect(normalizeCode('7KQ4M')).toBe(null)
    expect(normalizeCode('7KQ4MPX')).toBe(null)
    expect(normalizeCode('ABCDIO')).toBe(null)
    expect(normalizeCode('')).toBe(null)
  })
})
