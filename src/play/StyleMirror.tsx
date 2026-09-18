/**
 * The style mirror — the v1.0 classifier turned on the finished game, the human included.
 *
 * Rendered once, when the game is over. `classifySeats` on the final view is the exact code
 * path every adaptive seat ran during the game — same single-pass features, same committed
 * fingerprints, same damping — now pointed at the full public log, which selects the 'full'
 * calibration bucket. The human's seat is not special to it: the classifier sees only what
 * each seat publicly did, so the read on seat 0 is what a v1.0 opponent believed about YOU
 * by the end of the game.
 *
 * Honesty is inherited rather than re-implemented. The posterior arrives already blended
 * toward uniform by `min(1, asks/12)` (classify.ts), so a quiet game reads as "hard to say"
 * instead of a confident guess, and the pane refuses the headline entirely at zero asks, where
 * the posterior is exactly uniform by construction.
 *
 * The bot seats are read too, but there is no longer an Agreement column beside them. It only
 * ever meant anything under v0.5, where the lobby pinned a known style per seat and the read
 * could be scored against it; every seat is the adaptive engine now, so a column whose every
 * cell says "no fixed truth" is a column that measures nothing. The calibration check it used
 * to offer lives where it belongs — /lab/adaptive, over 10,800 reads rather than five.
 */
import type { SeatClassification, SeatView, StyleId } from '../../lib/engine/index.ts'
import { STYLE_IDS, STYLE_ROSTER, classifySeats, observeSeats } from '../../lib/engine/index.ts'
import { Eyebrow } from '../components/index.ts'
import { ScrollRegion } from '../lab/ui/ScrollRegion.tsx'
import lab from '../lab/ui/lab.module.css'
import type { BotNames } from './format.ts'
import { seatNameCap } from './format.ts'
import type { PlayModel } from './models.ts'
import s from './play.module.css'

const BOT_SEATS = [1, 2, 3, 4, 5] as const

export interface StyleMirrorProps {
  /** The human's view of the FINISHED game — the log is complete, `game_over` included. */
  view: SeatView
  /** What the player called the bots. Absent at the shared table, where there are none. */
  names?: BotNames
  /** The model the bot seats ran — what the Played column names. */
  model: PlayModel
}

function pct(p: number): string {
  return `${(100 * p).toFixed(1)}%`
}

/** The posterior as rows in descending order; ties resolve to STYLE_IDS order (stable sort). */
function rankedPosterior(c: SeatClassification): { id: StyleId; p: number }[] {
  return STYLE_IDS.filter((id) => Object.hasOwn(c.posterior, id))
    .map((id) => ({ id, p: c.posterior[id] }))
    .sort((a, b) => b.p - a.p)
}

export function StyleMirror({ view, names = [], model }: StyleMirrorProps) {
  const reads = classifySeats(view)
  const human = reads[0]
  const humanAsks = observeSeats(view)[0].asks
  const ranked = rankedPosterior(human)
  const leading = ranked[0]?.p ?? 1

  return (
    <section className={s.mirror} aria-label="Style mirror">
      <Eyebrow tone="muted" track="head" as="h2">
        Style mirror
      </Eyebrow>

      {humanAsks === 0 ? (
        <p className={s.mirrorVerdict}>
          <strong>No read.</strong> You never asked.
        </p>
      ) : (
        <>
          <p className={s.mirrorVerdict}>
            You played most like <strong>{STYLE_ROSTER[human.top].label}</strong> —{' '}
            {pct(human.confidence)} of the posterior.
          </p>
          <div className={s.mirrorBars}>
            {ranked.map((row, i) => (
              <div
                key={row.id}
                className={`${s.mirrorRow} ${i === 0 ? s.mirrorRowTop : ''}`}
              >
                <span className={s.mirrorLabel}>{STYLE_ROSTER[row.id].label}</span>
                <span className={s.mirrorTrack}>
                  <span
                    className={s.mirrorFill}
                    style={{ width: `${(100 * row.p) / leading}%` }}
                  />
                </span>
                <span className={s.mirrorPct} data-numeric>
                  {pct(row.p)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <ScrollRegion label="The classifier's read of the bot seats">
        <table className={lab.table}>
          <caption>The bot seats, played against read</caption>
          <thead>
            <tr>
              <th scope="col">Seat</th>
              <th scope="col">Played</th>
              <th scope="col">Read as</th>
              <th scope="col">Posterior</th>
            </tr>
          </thead>
          <tbody>
            {BOT_SEATS.map((seat) => {
              const read = reads[seat]
              return (
                <tr key={seat}>
                  <th scope="row">{seatNameCap(seat, names)}</th>
                  <td>{model.label}</td>
                  <td>{STYLE_ROSTER[read.top].label}</td>
                  <td data-numeric>{pct(read.confidence)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollRegion>
    </section>
  )
}
