/**
 * verdict.ts — BOT_LAB.md §4.4's decision rule, computed rather than argued.
 *
 * > **Decision rule — declare a superior style only if all four hold:**
 * > 1. highest mean score, **and**
 * > 2. **maximin > 0.5** (it has no losing matchup), **and**
 * > 3. cyclic energy of the matrix is small (say < 15%), **and**
 * > 4. its exploitability `E(i)` is not materially worse than its rivals'.
 * >
 * > If (2) or (3) fails, the correct published answer is *"no dominant style; here is the
 * > counter-graph and the Nash mixture."* Write the site to render that outcome as a first-class
 * > result, not an error state.
 *
 * Two things this module does that a looser reading would not.
 *
 * **Criterion 2 is tested against the confidence interval, not the point estimate.** "No losing
 * matchup" is a claim about the world, and a maximin of 0.5375 whose CI is `[0.5065, 0.5685]`
 * supports it while the same point estimate with a CI straddling 0.5 does not. The lower bound is
 * used, and the significance of the worst cell after BH is recorded next to it.
 *
 * **An unmeasured criterion is a failed criterion.** If the exploitability search did not run,
 * criterion 4 is `undetermined` and the verdict cannot be `'dominant'` — a style is not crowned
 * because nobody checked. §5.7's whole point is that *"a style that beats today's roster may be
 * maximally exploitable by a style you haven't written."*
 */
import type { StyleId } from '../../engine/index.ts'

export type Verdict = 'dominant' | 'cyclic' | 'inconclusive'

export interface Criterion {
  id: 1 | 2 | 3 | 4
  label: string
  /** `null` means the evidence needed to decide it was not produced. */
  pass: boolean | null
  detail: string
}

export interface VerdictInput {
  /** The style with the highest mean score — the only candidate criterion 1 can be about. */
  candidate: StyleId | null
  meanScore: number
  /** Runner-up mean score, for reporting the size of criterion 1's margin. */
  runnerUp: { style: StyleId; meanScore: number } | null
  maximin: number
  maximinLower95: number
  maximinWorstVs: StyleId | null
  maximinWorstSignificant: boolean
  cyclicEnergy: number
  cyclicThreshold: number
  significantCycles: number
  /** `E(candidate)`, or `null` when the search did not run. */
  exploitability: number | null
  /** `E` for every other searched style. */
  rivalExploitability: number[]
  /** How much worse than the rivals' median counts as "materially worse". */
  exploitabilityMargin: number
}

export interface VerdictResult {
  verdict: Verdict
  criteria: [Criterion, Criterion, Criterion, Criterion]
  /** Reads like the sentence a person would write. */
  summary: string
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN
  const s = xs.slice().sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Apply the four criteria. See the file header for the two strictness choices. */
export function decideVerdict(input: VerdictInput): VerdictResult {
  const c1: Criterion = {
    id: 1,
    label: 'highest mean score',
    pass: input.candidate !== null,
    detail:
      input.candidate === null
        ? 'no styles in the matrix'
        : `${input.candidate} at ${input.meanScore.toFixed(4)}` +
          (input.runnerUp
            ? `, ahead of ${input.runnerUp.style} at ${input.runnerUp.meanScore.toFixed(4)} ` +
              `(margin ${(input.meanScore - input.runnerUp.meanScore).toFixed(4)})`
            : ''),
  }

  const c2Pass = input.maximinLower95 > 0.5
  const c2: Criterion = {
    id: 2,
    label: 'maximin > 0.5 (no losing matchup)',
    pass: c2Pass,
    detail:
      `maximin ${input.maximin.toFixed(4)} vs ${input.maximinWorstVs ?? '-'}, ` +
      `CI95 lower bound ${input.maximinLower95.toFixed(4)} ${c2Pass ? '>' : '<='} 0.5` +
      `; worst cell ${input.maximinWorstSignificant ? 'is' : 'is NOT'} significant after BH`,
  }

  const c3Pass = input.cyclicEnergy < input.cyclicThreshold && input.significantCycles === 0
  const c3: Criterion = {
    id: 3,
    label: `cyclic energy < ${input.cyclicThreshold}`,
    pass: c3Pass,
    detail:
      `cyclicEnergy ${input.cyclicEnergy.toFixed(4)}; ` +
      `${input.significantCycles} significant 3-cycle(s) after BH`,
  }

  let c4Pass: boolean | null = null
  let c4Detail: string
  if (input.exploitability === null) {
    c4Detail = 'exploitability search did not run — criterion undetermined, so the verdict cannot be "dominant"'
  } else if (input.rivalExploitability.length === 0) {
    c4Detail = `E = ${input.exploitability.toFixed(4)} but no rival was searched — nothing to compare against`
  } else {
    const med = median(input.rivalExploitability)
    c4Pass = input.exploitability <= med + input.exploitabilityMargin
    c4Detail =
      `E(${input.candidate ?? '-'}) = ${input.exploitability.toFixed(4)} vs rivals' median ` +
      `${med.toFixed(4)} (margin ${input.exploitabilityMargin.toFixed(4)}); ` +
      `${c4Pass ? 'not' : 'IS'} materially worse`
  }
  const c4: Criterion = {
    id: 4,
    label: "exploitability not materially worse than rivals'",
    pass: c4Pass,
    detail: c4Detail,
  }

  const criteria: [Criterion, Criterion, Criterion, Criterion] = [c1, c2, c3, c4]
  const allPass = criteria.every((c) => c.pass === true)

  // "Cyclic" is claimed on the assumption-free measurement (cyclic energy) or on its human-legible
  // form (a 3-cycle that survived BH). BOT_LAB.md §4.4 treats the two as the same finding.
  const cyclic = input.cyclicEnergy >= input.cyclicThreshold || input.significantCycles > 0
  const verdict: Verdict = allPass ? 'dominant' : cyclic ? 'cyclic' : 'inconclusive'

  const failed = criteria.filter((c) => c.pass !== true).map((c) => `(${c.id})`)
  const summary = allPass
    ? `${input.candidate} is dominant: all four BOT_LAB.md §4.4 criteria hold.`
    : verdict === 'cyclic'
      ? `No dominant style. The matrix is cyclic (energy ${input.cyclicEnergy.toFixed(4)}, ` +
        `${input.significantCycles} significant 3-cycle(s)); criteria ${failed.join(' ')} fail. ` +
        'Publish the counter-graph and the Nash mixture, not a winner.'
      : `No dominant style, and the matrix is not cyclic either: criteria ${failed.join(' ')} fail. ` +
        'The evidence does not support crowning the top of the table.'

  return { verdict, criteria, summary }
}
