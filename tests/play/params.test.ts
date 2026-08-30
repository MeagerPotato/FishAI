/**
 * params.test.ts — the launch URL's contract, where untrusted strings meet the table.
 *
 * Two behaviours are pinned here because both are decisions rather than mechanics, and a future
 * reader would otherwise be free to "improve" either one:
 *
 *  - a bad NAME is refused, never truncated. Shipping the first twelve characters of a name
 *    nobody typed puts a word the player did not choose into five surfaces at once.
 *  - a retired `?v=` is REFUSED rather than redealt. The whole promise of this URL is that it
 *    reproduces a game; honouring the seed while swapping the engine underneath breaks that
 *    promise in the one way the player cannot see.
 */
import { describe, expect, it } from 'vitest'
import {
  NAME_MAX,
  NO_NAMES,
  PACE_DEFAULT,
  PACE_MAX,
  PACE_MIN,
  parseNames,
  parsePace,
  parsePlayParams,
  playQuery,
  retiredMode,
  sanitizeName,
} from '../../src/play/params.ts'

describe('sanitizeName — normalise the tidying, refuse the rest', () => {
  it('keeps an ordinary name unchanged', () => {
    expect(sanitizeName('Nina')).toBe('Nina')
  })

  it('normalises surrounding and doubled whitespace — the same name either way', () => {
    expect(sanitizeName('  Big   Bo  ')).toBe('Big Bo')
  })

  it('treats an empty or whitespace-only name as "no name", not as an error', () => {
    expect(sanitizeName('')).toBe('')
    expect(sanitizeName('   ')).toBe('')
  })

  it('accepts the punctuation names actually contain', () => {
    expect(sanitizeName("O'Hara")).toBe("O'Hara")
    expect(sanitizeName('Jo-Anne')).toBe('Jo-Anne')
    expect(sanitizeName('R2 D2')).toBe('R2 D2')
  })

  it('accepts letters outside ASCII, counted in code points', () => {
    expect(sanitizeName('Zoë')).toBe('Zoë')
    expect(sanitizeName('花子')).toBe('花子')
  })

  it('REFUSES an over-long name rather than truncating it', () => {
    const long = 'a'.repeat(NAME_MAX + 1)
    expect(sanitizeName(long)).toBeNull()
    expect(sanitizeName('a'.repeat(NAME_MAX))).toHaveLength(NAME_MAX)
  })

  it('refuses the separator, so a name can never split its own parameter', () => {
    expect(sanitizeName('Bo,Nina')).toBeNull()
  })

  it('refuses markup and control characters outright', () => {
    expect(sanitizeName('<b>Bo</b>')).toBeNull()
    expect(sanitizeName('Bo\u0007')).toBeNull()
    expect(sanitizeName('Bo%20Jo')).toBeNull()
  })

  it('refuses a name that opens with punctuation rather than a letter or digit', () => {
    expect(sanitizeName('-Bo')).toBeNull()
    expect(sanitizeName('.Bo')).toBeNull()
  })
})

describe('parseNames — five slots or none, exactly as ?styles= behaved', () => {
  it('defaults a missing parameter to five numbered seats', () => {
    expect(parseNames(null)).toEqual(NO_NAMES)
    expect(parseNames('')).toEqual(NO_NAMES)
  })

  it('reads five names', () => {
    expect(parseNames('Ann,Bo,Cy,Di,Ed')).toEqual(['Ann', 'Bo', 'Cy', 'Di', 'Ed'])
  })

  it('reads a partial line-up, empty slots staying numbered', () => {
    expect(parseNames('Ann,,Cy,,')).toEqual(['Ann', '', 'Cy', '', ''])
  })

  it('falls back to all-default on the wrong number of slots', () => {
    expect(parseNames('Ann,Bo')).toEqual(NO_NAMES)
    expect(parseNames('Ann,Bo,Cy,Di,Ed,Fi')).toEqual(NO_NAMES)
  })

  it('falls back to all-default when any one slot is refused', () => {
    expect(parseNames(`Ann,${'x'.repeat(NAME_MAX + 1)},Cy,Di,Ed`)).toEqual(NO_NAMES)
  })
})

describe('parsePace — a number in range, or the default', () => {
  it('takes the default when absent', () => {
    expect(parsePace(null)).toBe(PACE_DEFAULT)
  })

  it('takes a whole or half second inside the range', () => {
    expect(parsePace('3')).toBe(3)
    expect(parsePace('0.5')).toBe(0.5)
    expect(parsePace('10')).toBe(10)
  })

  it('holds both ends of the offered range', () => {
    expect(parsePace(String(PACE_MIN))).toBe(PACE_MIN)
    expect(parsePace(String(PACE_MAX))).toBe(PACE_MAX)
  })

  it('REFUSES out of range rather than clamping — 600 is a typo, not a ten-minute step', () => {
    expect(parsePace('600')).toBe(PACE_DEFAULT)
    expect(parsePace('0')).toBe(PACE_DEFAULT)
    expect(parsePace('99')).toBe(PACE_DEFAULT)
  })

  it('refuses anything that is not a plain decimal', () => {
    expect(parsePace('fast')).toBe(PACE_DEFAULT)
    expect(parsePace('-3')).toBe(PACE_DEFAULT)
    expect(parsePace('3e1')).toBe(PACE_DEFAULT)
    expect(parsePace('')).toBe(PACE_DEFAULT)
  })
})

describe('retiredMode — a link naming a mode this table no longer has', () => {
  it('passes an absent ?v=, because there is one mode and the bare URL means it', () => {
    expect(retiredMode('?seed=abc')).toBeNull()
    expect(retiredMode('')).toBeNull()
  })

  it('passes ?v=10, so every shared v1.0 link still opens', () => {
    expect(retiredMode('?v=10&seed=abc')).toBeNull()
  })

  it('reports ?v=05 — the exact shape every old lobby link has', () => {
    expect(retiredMode('?v=05&seed=abc&styles=punter,punter,punter,punter,punter')).toBe('05')
  })

  it('reports any other value, and hands it back for the refusal to quote', () => {
    expect(retiredMode('?v=15')).toBe('15')
    expect(retiredMode('?v=')).toBe('')
  })
})

describe('playQuery — a plain table produces a plain link', () => {
  it('writes nothing at all when everything is at its default', () => {
    expect(playQuery(NO_NAMES, PACE_DEFAULT)).toBe('')
  })

  it('writes names once any seat is named, and encodes the spaces in them', () => {
    expect(playQuery(['Big Bo', '', '', '', ''], PACE_DEFAULT)).toBe('&names=Big%20Bo,,,,')
  })

  it('writes pace only when it differs from the default', () => {
    expect(playQuery(NO_NAMES, 1.5)).toBe('&pace=1.5')
  })
})

describe('parsePlayParams — the round trip a shared link has to survive', () => {
  it('reads back exactly what playQuery wrote', () => {
    const names = ['Big Bo', 'Zoë', '', "O'Hara", 'Jo-Anne']
    const query = `?seed=abc${playQuery(names, 1.5)}`
    const play = parsePlayParams(query, 'abc')
    expect(play.names).toEqual(names)
    expect(play.paceSeconds).toBe(1.5)
    expect(play.seed).toBe('abc')
    expect(play.assist).toBe(false)
  })

  it('keeps namesKey in step with names, for the effect deps that read it', () => {
    const play = parsePlayParams('?names=Ann,,Cy,,', 'abc')
    expect(play.namesKey).toBe(play.names.join(','))
  })

  it('reads ?assist=1 and nothing looser', () => {
    expect(parsePlayParams('?assist=1', 'abc').assist).toBe(true)
    expect(parsePlayParams('?assist=true', 'abc').assist).toBe(false)
  })
})
