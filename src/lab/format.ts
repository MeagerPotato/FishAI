/**
 * Number formatting. Every score rate on this site is printed the same way, because a table
 * where one column drops a digit reads as a different measurement.
 */

/** `.5936` — leading zero dropped, four places. Score rates only. */
export function rate(value: number): string {
  return value.toFixed(4).replace(/^0/, '').replace(/^-0/, '-')
}

/** `.594` — three places, for a cell that has to fit. */
export function rate3(value: number): string {
  return value.toFixed(3).replace(/^0/, '').replace(/^-0/, '-')
}

/** `[.5240, .5432]` */
export function interval(ci: readonly [number, number]): string {
  return `[${rate(ci[0])}, ${rate(ci[1])}]`
}

/** `+.0336` — a signed distance from even, which is how an edge should be read. */
export function edge(value: number): string {
  const d = value - 0.5
  return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(4).replace(/^0/, '')}`
}

/** `2,600` */
export function count(value: number): string {
  return value.toLocaleString('en-US')
}

/** q-values run small; below 1e-4 print the bound rather than a rounded zero. */
export function qValue(value: number): string {
  return value < 0.0001 ? '<.0001' : value.toFixed(4).replace(/^0/, '')
}

export function pct(value: number, places = 1): string {
  return `${(value * 100).toFixed(places)}%`
}

/** `2026-08-22` — the date, in the one order that sorts. */
export function isoDate(iso: string): string {
  return iso.slice(0, 10)
}
