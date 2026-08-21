import { useCountUp } from '../hooks/useCountUp.ts'
import { useReveal } from '../hooks/useReveal.ts'
import { cx } from '../lib/cx.ts'
import s from './StatChart.module.css'

export interface Stat {
  /** The integer that counts up. Keep it an integer; a decimal that ticks reads as noise. */
  value: number
  /** Non-numeric tail: `%`, `+`, `k`. Split out so the count-up only touches the number. */
  suffix?: string
  label: string
}

export interface StatChartProps {
  stats: Stat[]
  /** Scrub position from a PinAct, or `null` when the act is switched off. */
  progress: number | null
  className?: string
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/**
 * Bar heights are computed once from the data into a 26–92% band rather than
 * 0–100%. A bar scaled honestly from zero makes the smallest value a hairline
 * that reads as missing data; the floor keeps every bar legible while the
 * printed number carries the exact value, so the encoding stays redundant.
 */
function barHeights(stats: Stat[]): number[] {
  const max = Math.max(...stats.map((stat) => stat.value), 1)
  return stats.map((stat) => Math.round(26 + (stat.value / max) * 66))
}

function Bar({
  stat,
  height,
  lit,
  shown,
}: {
  stat: Stat
  height: number
  lit: number
  shown: boolean
}) {
  const counted = useCountUp(stat.value, shown)

  return (
    <div className={s.bar}>
      <span className={s.big} data-numeric>
        {counted}
        {stat.suffix ?? ''}
      </span>
      <div className={s.fill} style={{ height: shown ? `${height}%` : 0 }}>
        <i className={s.lit} style={{ height: `${lit * 100}%` }} />
      </div>
      <span className={s.lbl}>{stat.label}</span>
    </div>
  )
}

/**
 * A row of outlined bars whose amber fill is the scroll payload. Reveal fills
 * the outline and counts the number; scroll lights the bars in sequence.
 */
export function StatChart({ stats, progress, className }: StatChartProps) {
  const [ref, shown] = useReveal<HTMLDivElement>(0.3)
  const heights = barHeights(stats)
  const scrubbed = (progress ?? 1) * stats.length

  return (
    <div ref={ref} className={cx(s.chart, className)}>
      {stats.map((stat, i) => (
        <Bar
          key={stat.label}
          stat={stat}
          height={heights[i]}
          // Bar 0 is lit on arrival so the row never reads as empty; the rest
          // light one beat at a time as the track scrubs.
          lit={progress === null || i === 0 ? 1 : clamp01(scrubbed - (i - 1))}
          shown={shown}
        />
      ))}
    </div>
  )
}
