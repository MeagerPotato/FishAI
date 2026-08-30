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
 * instead of a confident guess — the pane says so in words while the discount is active, and
 * refuses the headline entirely at zero asks, where the posterior is exactly uniform by
 * construction. The footnote quotes the measured end-of-game accuracy from the committed
 * adaptive artifact, because a mirror that implied more accuracy than the lab measured would
 * be marketing, not measurement.
 *
 * The bot seats are read too, but there is no longer an Agreement column beside them. It only
 * ever meant anything under v0.5, where the lobby pinned a known style per seat and the read
 * could be scored against it; every seat is the adaptive engine now, so a column whose every
 * cell says "no fixed truth" is a column that measures nothing. The calibration check it used
 * to offer lives where it belongs — /lab/adaptive, over 10,800 reads rather than five.
 */
import type { SeatClassification, SeatView, StyleId } from '../../lib/engine/index.ts'
import { STYLE_IDS, STYLE_ROSTER, classifySeats, observeSeats } from '../../lib/engine/index.ts'
import { Eyebrow, TextLink } from '../components/index.ts'
import { ScrollRegion } from '../lab/ui/ScrollRegion.tsx'
import lab from '../lab/ui/lab.module.css'
import type { BotNames } from './format.ts'
import { seatNameCap } from './format.ts'
import { ADAPTIVE_LABEL } from './policies.ts'
import s from './play.module.css'

const BOT_SEATS = [1, 2, 3, 4, 5] as const

/** Asks at which classify.ts stops discounting its posterior — mirrored here for the prose. */
const DAMP_ASKS = 12

export interface StyleMirrorProps {
  /** The human's view of the FINISHED game — the log is complete, `game_over` included. */
  view: SeatView
  /** What the player called the bots. Absent at the shared table, where there are none. */
  names?: BotNames
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

export function StyleMirror({ view, names = [] }: StyleMirrorProps) {
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
      <p className={lab.figNote} style={{ margin: '10px 0 0' }}>
        The v1.0 classifier — the exact code the adaptive seats run — read the finished public
        log. It sees no hands, only what each seat publicly did, so to it you are just another
        seat.
      </p>

      {humanAsks === 0 ? (
        <p className={s.mirrorVerdict}>
          <strong>No read.</strong> You never asked, so the public log holds nothing of yours to
          classify — the posterior is exactly uniform at one-ninth per style, by construction.
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
          <p className={lab.figNote}>
            Bars are scaled to the leading share; the printed numbers are the posterior itself.
            {humanAsks < DAMP_ASKS ? (
              <>
                {' '}
                You asked {humanAsks} time{humanAsks === 1 ? '' : 's'}, and below {DAMP_ASKS}{' '}
                asks the classifier blends its answer toward uniform — its own honesty rule,
                applied to you exactly as to any seat — so the spread above is deliberately
                flat.
              </>
            ) : null}
          </p>
        </>
      )}

      <ScrollRegion label="The classifier's read of the bot seats">
        <table className={lab.table}>
          <caption>
            The bot seats, played against read · full-log calibration bucket · seed follows the
            URL
          </caption>
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
                  <td>{ADAPTIVE_LABEL}</td>
                  <td>{STYLE_ROSTER[read.top].label}</td>
                  <td data-numeric>{pct(read.confidence)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollRegion>

      {/* 22.4% over 10,800 reads is the committed artifact's end-of-game (events === 0) row —
          src/lab/data/adaptive-results.json, classifier.accuracy — the same figure the lab
          page prints. Quoted rather than imported so the play chunk stays free of the 125k-game
          artifact; if the artifact is regenerated, /lab/adaptive is the source of truth. */}
      <p className={lab.figNote}>
        Calibrated context from{' '}
        <TextLink href="/lab/adaptive" arrow={false}>
          the adaptive suite
        </TextLink>
        : reading full-strength roster bots at end of game, the classifier&apos;s top read is
        exactly right 22.4% of the time over 10,800 seat reads, against an 11.1% chance floor —
        better than guessing, far from an oracle. Treat the mirror as a resemblance, not a
        verdict. The bot rows carry no verdict at all: every seat above ran the adaptive engine,
        which selects a style per decision, so there is no single style for the read to be right
        or wrong about.
      </p>
    </section>
  )
}
