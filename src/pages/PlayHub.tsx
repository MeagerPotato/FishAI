/**
 * `/play` — the lobby. Two mode cards and the plain-language difference between them.
 *
 * v0.5 is playable now: five bot seats, each holding one fixed style from the measured roster
 * for the whole game. The lobby's pickers write the whole configuration into the launch URL, so
 * a shared link reproduces the exact table — and "Randomise" draws a fresh seed and derives the
 * five styles from it with the same map the table uses for `styles=random`, so even a surprise
 * line-up is reproducible. The Memory control applies one v1.5 bit budget to all five bot
 * seats (`?bits=`); its option labels quote the measured anchors from the committed bounded
 * artifact — quoted, not imported, so this chunk stays free of it (see MEMORY_OPTIONS).
 *
 * v1.0 — the adaptive engine — is live: every bot seat runs the classifier + best-response
 * selection off the measured counter table (`policyForSeat` in src/play/policies.ts). Its card
 * offers no style pickers, because choosing a style is the job the engine does for itself, and
 * it states the measured caveat up front rather than in a footnote: over this roster the best
 * response to everything is Punter, so its adaptivity matters mainly against off-roster
 * opponents — the human.
 *
 * Both modes also launch with the assistant (`?assist=1`) — the engine's own traced reasoning
 * beside the table.
 *
 * Amber budget: the one primary on this page is the v0.5 launch button. Everything else is
 * `ghost`/`line`.
 */
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { StyleId } from '../../lib/engine/index.ts'
import { STYLE_IDS, STYLE_ROSTER } from '../../lib/engine/index.ts'
import { Button, Eyebrow, Section, SectionHead, TextLink, buttonRow } from '../components/index.ts'
import { caseFromSearch } from '../lab/artifact.ts'
import { LabShell } from '../lab/ui/LabShell.tsx'
import lab from '../lab/ui/lab.module.css'
import { deriveStyles, freshSeed, parseBits } from '../play/params.ts'
import s from '../play/play.module.css'

const BOT_SEATS = [1, 2, 3, 4, 5] as const

/**
 * The Memory options, full first, then the measured rungs. The anchors are QUOTED with their
 * provenance, never imported: the /play chunk must not carry the committed bounded artifact
 * (SPEC v1.5 Phase 3 — chunk weight), so each label names its number and this comment names
 * the field, exactly as the style mirror quotes the classifier's 22.4%. From
 * src/lab/data/bounded-results.json (schema 3, digest fe829b581f665c9a), which /lab/bounded
 * renders through the boundary validator and is the source of truth for:
 *   tiers[medium].bitsEquivalent.bits = 32.18 — the shipped medium tier's bits-equivalent;
 *   ladder[bits].share vs an unbounded team of the same style, 3,000 duplicate pairs/rung:
 *   64 → .4977 · 32 → .4653 · 16 → .3921 · 8 → .2449 · 0 → .1313.
 */
const MEMORY_OPTIONS: ReadonlyArray<{ bits: number | null; label: string }> = [
  { bits: null, label: 'Full memory — no budget' },
  { bits: 64, label: '64 bits — near parity, set-share .498 vs full' },
  { bits: 32, label: '32 bits — measured equal to the shipped medium tier' },
  { bits: 16, label: '16 bits — set-share .392 vs full' },
  { bits: 8, label: '8 bits — deep handicap, set-share .245 vs full' },
  { bits: 0, label: '0 bits — reasons, never remembers; set-share .131' },
]

function initialLobby(search: string): { seed: string; styles: StyleId[]; bits: number | null } {
  const params = new URLSearchParams(search)
  const seed = params.get('seed') ?? freshSeed()
  // Only budgets the lobby offers round-trip; a hand-edited odd budget still plays at the
  // table, but the lobby select falls back to full rather than displaying a value it lacks.
  const parsed = parseBits(params.get('bits'))
  const bits = MEMORY_OPTIONS.some((o) => o.bits === parsed) ? parsed : null
  const raw = params.get('styles')
  if (raw && raw !== 'random') {
    const parts = raw.split(',')
    const ids = STYLE_IDS as readonly string[]
    if (parts.length === 5 && parts.every((p) => ids.includes(p))) {
      return { seed, styles: parts as StyleId[], bits }
    }
  }
  return { seed, styles: deriveStyles(seed), bits }
}

export function PlayHub() {
  const { search } = useLocation()
  const which = caseFromSearch(search)
  const [lobby, setLobby] = useState(() => initialLobby(search))
  const { seed, styles, bits } = lobby

  // A cleared (or all-whitespace) seed field launches without a `seed` param at all: the table
  // then draws a fresh seed and canonicalises it into the URL — the same path as a first
  // visit, and less intrusive than disabling the launch over an empty box.
  const trimmedSeed = seed.trim()
  const seedQuery = trimmedSeed === '' ? '' : `&seed=${encodeURIComponent(trimmedSeed)}`
  const bitsQuery = bits === null ? '' : `&bits=${bits}`
  const launchHref = `/play/table?v=05${seedQuery}&styles=${styles.join(',')}${bitsQuery}`

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

            <div className={s.picker} style={{ marginTop: 0 }}>
              <div className={s.pickerRow}>
                <label className={s.pickerLabel} htmlFor="play-memory">
                  <span className={lab.criterionLabel}>Memory</span>
                  <span className={s.handBookName}>all five bots</span>
                </label>
                <select
                  id="play-memory"
                  className={s.select}
                  value={bits === null ? 'full' : String(bits)}
                  onChange={(event) => {
                    const value = event.target.value
                    const option = MEMORY_OPTIONS.find(
                      (o) => (o.bits === null ? 'full' : String(o.bits)) === value,
                    )
                    if (!option) return
                    setLobby((prev) => ({ ...prev, bits: option.bits }))
                  }}
                >
                  {MEMORY_OPTIONS.map((o) => (
                    <option key={o.bits === null ? 'full' : o.bits} value={o.bits === null ? 'full' : String(o.bits)}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className={s.pickerThesis}>
                  One v1.5 bit budget for every bot seat — the anchors are measured on the
                  bounded ladder, and the assistant is never bounded.
                </span>
              </div>
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
                  setLobby((prev) => ({ seed: next, styles: deriveStyles(next), bits: prev.bits }))
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
              <Button variant="line" href={`${launchHref}&assist=1`} arrow={false}>
                With the assistant
              </Button>
            </div>
            <p className={lab.figNote}>
              The assistant is the engine&apos;s own reasoning surface: at each of your decisions
              it shows the move a chosen advisor style would play and why — from exactly the
              information you have, nothing more.
            </p>
          </div>

          {/* ---- v1.0 — adaptive, live ---------------------------------------------------- */}
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
            <p className={lab.figNote}>
              One measured caveat, stated where the launch button is rather than in a footnote:
              over this nine-style roster the measured best response to every style is Punter, so
              a warm v1.0 bot converges there against the roster. What its adaptivity is actually
              for is opponents the matrix never measured — you. The full evidence, including that
              degeneracy, is being measured and lands next door in the lab.
            </p>
            <div className={buttonRow} style={{ marginTop: 22 }}>
              <Button variant="line" href={`/play/table?v=10${seedQuery}`} arrow={false}>
                Deal me in — adaptive
              </Button>
              <Button
                variant="ghost"
                href={`/play/table?v=10${seedQuery}&assist=1`}
                arrow={false}
              >
                With the assistant
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
          . The table you just configured is the same engine with you in it — and when your game
          ends, the <strong>style mirror</strong> turns the v1.0 classifier on the finished log,
          you included, and says which of the nine styles you played most like. The Memory
          control&rsquo;s budgets are priced on the measured ladder at{' '}
          <TextLink href="/lab/bounded" arrow={false}>
            the bounded-memory page
          </TextLink>
          , anchor by anchor.
        </p>
      </Section>
    </LabShell>
  )
}

export default PlayHub
