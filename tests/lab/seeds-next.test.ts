import { describe, expect, it } from 'vitest'
// @ts-expect-error: a plain .mjs script with no type declarations
import { drawSeeds, HISTORICAL_SPENT, readRegistry, spentSet } from '../../scripts/seeds-next.mjs'

type Registry = Array<[string, number[]]>

describe('seeds-next (the seed rule, MONET.md §6.5; ATHENA.md §4.5 item 7)', () => {
  it('re-draws ATHENA.md §7’s twelve seeds from the registry without their own file', async () => {
    const spent: Set<number> = spentSet({ except: ['athena-kraken-read-12/SEEDS'] })
    expect(spent.size).toBe(272)
    const { seeds, skipped } = await drawSeeds('athena-kraken-read-12', spent)
    expect(skipped).toBe(0)
    const registry = readRegistry() as Registry
    const recorded = registry.find(([rel]) => rel === 'athena-kraken-read-12/SEEDS')?.[1]
    expect(seeds).toEqual(recorded)
    expect(seeds).toEqual([
      8860402, 7541736, 7385745, 1737865, 1731972, 4293485, 5279041, 8868885, 9553380, 6153025, 4639722, 6216080,
    ])
  })

  it('never draws a spent seed, and every seed is in range', async () => {
    const spent: Set<number> = spentSet()
    for (const label of ['seeds-next-test-a', 'seeds-next-test-b', 'seeds-next-test-c']) {
      const { seeds } = await drawSeeds(label, spent)
      expect(new Set(seeds).size).toBe(12)
      for (const s of seeds) {
        expect(spent.has(s)).toBe(false)
        expect(s).toBeGreaterThanOrEqual(1000000)
        expect(s).toBeLessThan(10000000)
      }
    }
  })

  it('skips a spent seed and moves on to the next draw', async () => {
    const free = await drawSeeds('seeds-next-test-skip', new Set<number>())
    const { seeds, skipped } = await drawSeeds('seeds-next-test-skip', new Set<number>([free.seeds[0]]))
    expect(skipped).toBe(1)
    expect(seeds.slice(0, 11)).toEqual(free.seeds.slice(1))
  })

  it('reads the whole registry: the historical list plus every SEEDS file', () => {
    const registry = readRegistry() as Registry
    expect(registry.length).toBeGreaterThanOrEqual(18)
    const all: Set<number> = spentSet()
    for (const s of HISTORICAL_SPENT as number[]) expect(all.has(s)).toBe(true)
    for (const [, seeds] of registry) for (const s of seeds) expect(all.has(s)).toBe(true)
  })
})
