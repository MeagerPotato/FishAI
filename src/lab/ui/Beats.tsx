/**
 * The step rail for a `PinAct`.
 *
 * A pinned act on a research site should not animate the evidence — the payoff matrix is the
 * same matrix at every scroll position, and redrawing it as the reader scrolls would imply the
 * numbers were changing. What the scrub advances is the *reading*: one sentence at a time about
 * what to look at, beside a diagram that never moves.
 *
 * `progress === null` means the act is switched off (short viewport, or reduced motion) and is
 * NOT the same as 1: every beat is lit at once, because there is no scrub to reveal them.
 */

import type { ReactNode } from 'react'
import s from './lab.module.css'

export interface Beat {
  head: string
  body: ReactNode
}

export function activeBeat(progress: number | null, count: number): number {
  if (progress === null) return count - 1
  return Math.min(count - 1, Math.max(0, Math.floor(progress * count)))
}

export function Beats({ beats, progress }: { beats: readonly Beat[]; progress: number | null }) {
  const active = activeBeat(progress, beats.length)
  return (
    <ol className={s.beats}>
      {beats.map((beat, i) => (
        <li
          key={beat.head}
          className={`${s.beat} ${progress === null || i <= active ? s.beatOn : ''}`}
        >
          <span className={s.beatNo}>{String(i + 1).padStart(2, '0')}</span>
          <span className={s.beatText}>
            <b>{beat.head}</b> {beat.body}
          </span>
        </li>
      ))}
    </ol>
  )
}
