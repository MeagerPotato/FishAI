/**
 * `/play` — the lobby. Two mode cards and the plain-language difference between them.
 *
 * v0.5 is playable now: five bot seats, each holding one fixed style from the measured roster
 * for the whole game. The lobby's pickers write the whole configuration into the launch URL, so
 * a shared link reproduces the exact table — and "Randomise" draws a fresh seed and derives the
 * five styles from it with the same map the table uses for `styles=random`, so even a surprise
 * line-up is reproducible.
 *
 * v1.0 — the adaptive engine — is a real card here because the difference between the modes is
 * the point of the page, but it is honestly disabled: the classifier, the counter-table and the
 * evidence for both are being built in a parallel task, and a launch button for an engine that
 * does not exist would be a lie with a hover state. The card ships enabled when the adaptive
 * artifact lands (the table's seam is `policyForSeat` in src/play/policies.ts).
 *
 * Amber budget: the one primary on this page is the v0.5 launch button. Everything else is
 * `ghost`/`line`, and the v1.0 card's not-yet state is a hatch, not a colour.
 */
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { StyleId } from '../../lib/engine/index.ts'
import { STYLE_IDS, STYLE_ROSTER } from '../../lib/engine/index.ts'
import { Button, Eyebrow, Section, SectionHead, TextLink, buttonRow } from '../components/index.ts'
import { caseFromSearch } from '../lab/artifact.ts'
import { LabShell } from '../lab/ui/LabShell.tsx'
import lab from '../lab/ui/lab.module.css'
import { deriveStyles, freshSeed } from '../play/params.ts'
import s from '../play/play.module.css'

const BOT_SEATS = [1, 2, 3, 4, 5] as const

function initialLobby(search: string): { seed: string; styles: StyleId[] } {
  const params = new URLSearchParams(search)
  const seed = params.get('seed') ?? freshSeed()
  const raw = params.get('styles')
  if (raw && raw !== 'random') {
    const parts = raw.split(',')
    const ids = STYLE_IDS as readonly string[]
    if (parts.length === 5 && parts.every((p) => ids.includes(p))) {
      return { seed, styles: parts as StyleId[] }
    }
  }
  return { seed, styles: deriveStyles(seed) }
}

export function PlayHub() {
  const { search } = useLocation()
  const which = caseFromSearch(search)
  const [lobby, setLobby] = useState(() => initialLobby(search))
  const { seed, styles } = lobby

  const launchHref = `/play/table?v=05&seed=${encodeURIComponent(seed)}&styles=${styles.join(',')}`

  return (
    <LabShell
      current="/play"
      docTitle="Play"
      which={which}
      ground="ruling"
      stamp="us54 · deterministic"
    >
      <Section noRule badge="The lobby">
        <SectionHead
          level="h1"
          lines={['Take a seat.', '*Five bots will join you.*']}
          sub={
            <>
              The same engine, rule set and styles the lab measures, dealt to a human at seat 0.
              us54, deterministic: the seed drives the deal and every bot decision, so a game&apos;s
              URL replays it move for move — the only thing the link cannot reproduce is you.
            </>
          }
        />

        <div className={s.modes}>
          {/* ---- v0.5 — playable ---------------------------------------------------------- */}
          <div className={s.mode}>
            <Eyebrow tone="muted" track="badge">
              Mode 01 · FishAI v0.5
            </Eyebrow>
            <h2 className={s.modeTitle}>Solo — the styled roster</h2>
            <p className={s.modeBody}>
              Each bot seat plays one fixed style for the whole game — the same nine-entry roster
              the lab&apos;s payoff matrix measures, over the same shared inference engine. Your
              teammates are seats 2 and 4; seats 1, 3 and 5 play against you.
            </p>

            <div className={s.picker}>
              {BOT_SEATS.map((seat, i) => {
                const role = seat % 2 === 1 ? 'opponent' : 'teammate'
                return (
                  <div key={seat} className={s.pickerRow}>
                    <label className={s.pickerLabel} htmlFor={`style-seat-${seat}`}>
                      <span className={lab.criterionLabel}>Seat {seat}</span>
                      <span className={s.handBookName}>{role}</span>
                    </label>
                    <select
                      id={`style-seat-${seat}`}
                      className={s.select}
                      value={styles[i]}
                      onChange={(event) => {
                        const value = event.target.value
                        if (!(STYLE_IDS as readonly string[]).includes(value)) return
                        setLobby((prev) => ({
                          ...prev,
                          styles: prev.styles.map((v, j) => (j === i ? (value as StyleId) : v)),
                        }))
                      }}
                    >
                      {STYLE_IDS.map((id) => (
                        <option key={id} value={id}>
                          {STYLE_ROSTER[id].label}
                        </option>
                      ))}
                    </select>
                    <span className={s.pickerThesis}>{STYLE_ROSTER[styles[i]].thesis}</span>
                  </div>
                )
              })}
            </div>

            <div className={s.seedRow}>
              <label className={lab.criterionLabel} htmlFor="play-seed">
                Seed
              </label>
              <input
                id="play-seed"
                className={s.seedInput}
                type="text"
                value={seed}
                spellCheck={false}
                onChange={(event) => {
                  setLobby((prev) => ({ ...prev, seed: event.target.value }))
                }}
              />
              <button
                type="button"
                className={lab.pill}
                onClick={() => {
                  const next = freshSeed()
                  setLobby({ seed: next, styles: deriveStyles(next) })
                }}
              >
                Randomise styles
              </button>
            </div>
            <p className={lab.figNote}>
              Randomise draws a fresh seed and derives the five styles from it — the same map the
              table applies to <code>styles=random</code> — so a shared link reproduces the whole
              lobby, surprise included.
            </p>

            <div className={buttonRow} style={{ marginTop: 22 }}>
              <Button href={launchHref} arrow={false}>
                Deal me in
              </Button>
            </div>
          </div>

          {/* ---- v1.0 — honestly not yet -------------------------------------------------- */}
          <div className={s.mode}>
            <Eyebrow tone="muted" track="badge">
              Mode 02 · FishAI v1.0
            </Eyebrow>
            <h2 className={s.modeTitle}>Adaptive — reads the table</h2>
            <p className={s.modeBody}>
              The adaptive engine assigns no styles at all: it watches the public log, classifies
              what each seat appears to be playing, and best-responds using the measured payoff
              matrix — re-derived from public information at every decision, exactly like every
              other bot in this project. You cannot pick its style, because choosing one is the
              whole job it does for itself.
            </p>
            <div className={s.pending}>
              Arriving with the adaptive artifact. The classifier, the counter-table and the
              evidence that adaptation actually helps are being built and measured now; this card
              goes live when they land, and not before — an engine without its evidence does not
              get a launch button here.
            </div>
            <div className={buttonRow} style={{ marginTop: 22 }}>
              <Button variant="ghost" arrow={false} disabled>
                Not yet at the table
              </Button>
            </div>
          </div>
        </div>
      </Section>

      <Section badge="The evidence" noMarks>
        <Eyebrow tone="muted" track="head" as="h2">
          Played here, measured next door
        </Eyebrow>
        <p className={lab.prose} style={{ marginTop: 14 }}>
          Every style on this page carries a measured record before it carries cards. The payoff
          matrix, the significance discipline behind it and the verdict on whether any style is
          actually superior live in{' '}
          <TextLink href="/lab" arrow={false}>
            the report
          </TextLink>
          ; a stored game replayed through the engine, declare windows and all, lives at{' '}
          <TextLink href="/lab/replay/blitz-vs-banker" arrow={false}>
            the replay page
          </TextLink>
          . The table you just configured is the same engine with you in it.
        </p>
      </Section>
    </LabShell>
  )
}

export default PlayHub
