/**
 * `/play` — the lobby: which bot takes the five seats, their names, the pace and the seed.
 *
 * ## What this page used to be
 *
 * Two mode cards. v0.5 seated five fixed roster styles chosen here, optionally under a v1.5 bit
 * budget, and it had the page's five style selects, its Memory select and its primary button.
 * All of that is gone from PLAY at the owner's request — one thing under test at a time — and
 * none of it is gone from the project: /lab, /lab/bounded and the papers are untouched, and the
 * engine still holds every policy it has ever measured. A `?v=05` link is refused at
 * /play/table rather than silently redealt (params.ts says why).
 *
 * ## What the lobby writes into the URL
 *
 * Everything, as before: `seed`, `names`, `pace`. The URL is the whole configuration, so a
 * shared link reproduces the exact table — the only thing it cannot reproduce is you.
 *
 * Amber budget: the one primary on this page is the launch button. Everything else is
 * `ghost`/`line`.
 */
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button, Eyebrow, Section, SectionHead, buttonRow } from '../components/index.ts'
import { caseFromSearch } from '../lab/case.ts'
import { LabShell } from '../lab/ui/LabShell.tsx'
import lab from '../lab/ui/lab.module.css'
import {
  NAME_MAX,
  PACE_MAX,
  PACE_MIN,
  PACE_STEP,
  freshSeed,
  parseModelId,
  parseNames,
  parsePace,
  playQuery,
  sanitizeName,
} from '../play/params.ts'
import { modelOrDefault, PLAY_MODELS } from '../play/models.ts'
import s from '../play/play.module.css'

const BOT_SEATS = [1, 2, 3, 4, 5] as const

interface Lobby {
  seed: string
  names: readonly string[]
  /** A `PLAY_MODELS` id — which bot the five seats will run (models.ts). */
  modelId: string
  /** Held as TEXT, like the table's own field: a number input must be clearable to be typable. */
  paceText: string
}

function initialLobby(search: string): Lobby {
  const params = new URLSearchParams(search)
  return {
    seed: params.get('seed') ?? freshSeed(),
    names: parseNames(params.get('names')),
    modelId: parseModelId(search),
    paceText: String(parsePace(params.get('pace'))),
  }
}

export function PlayHub() {
  const { search } = useLocation()
  const which = caseFromSearch(search)
  const [lobby, setLobby] = useState(() => initialLobby(search))
  const { seed, names, paceText, modelId } = lobby
  const model = modelOrDefault(modelId)

  // A cleared (or all-whitespace) seed field launches without a `seed` param at all: the table
  // then draws a fresh seed and canonicalises it into the URL — the same path as a first
  // visit, and less intrusive than disabling the launch over an empty box.
  const trimmedSeed = seed.trim()
  const seedQuery = trimmedSeed === '' ? '' : `seed=${encodeURIComponent(trimmedSeed)}`

  // The launch URL carries only names the TABLE would accept. A name typed past the cap is not
  // truncated into the link — the field below says it is too long, and the seat stays numbered
  // until it is fixed, which is the same answer params.ts gives a hand-edited URL.
  const clean = names.map((n) => sanitizeName(n) ?? '')
  const query = `${seedQuery}${playQuery(clean, parsePace(paceText), modelId)}`.replace(/^&/, '')
  const launchHref = `/play/table?${query}`

  const setName = (i: number, value: string) => {
    setLobby((prev) => ({ ...prev, names: prev.names.map((v, j) => (j === i ? value : v)) }))
  }

  return (
    <LabShell
      current="/play"
      docTitle="Play"
      which={which}
      ground="ruling"
      stamp="us54 · deterministic"
    >
      <Section noRule badge="The lobby">
        <SectionHead level="h1" lines={['Take a seat.']} />

        <div className={s.mode}>
          <Eyebrow tone="muted" track="badge">
            {model.label}
          </Eyebrow>
          <h2 className={s.modeTitle}>{model.heading}</h2>

          <div className={s.picker}>
            <div className={s.pickerRow}>
              <label className={s.pickerLabel} htmlFor="lobby-model">
                <span className={lab.criterionLabel}>Opponent</span>
                <span className={s.handBookName}>which bot takes the five seats</span>
              </label>
              <select
                id="lobby-model"
                className={s.select}
                value={modelId}
                onChange={(event) => {
                  const next = event.target.value
                  setLobby((prev) => ({ ...prev, modelId: next }))
                }}
              >
                {PLAY_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={s.picker}>
            {BOT_SEATS.map((seat, i) => {
              const role = seat % 2 === 1 ? 'opponent' : 'teammate'
              const raw = names[i]
              // Refused, not truncated: the field says what is wrong and the launch link keeps
              // the seat numbered until it is fixed. Silently shipping the first twelve
              // characters would put a name in five surfaces that the player never chose.
              const bad = raw !== '' && sanitizeName(raw) === null
              return (
                <div key={seat} className={s.pickerRow}>
                  <label className={s.pickerLabel} htmlFor={`name-seat-${seat}`}>
                    <span className={lab.criterionLabel}>Seat {seat}</span>
                    <span className={s.handBookName}>{role}</span>
                  </label>
                  <input
                    id={`name-seat-${seat}`}
                    className={s.seedInput}
                    type="text"
                    value={raw}
                    placeholder={`Seat ${seat}`}
                    spellCheck={false}
                    aria-invalid={bad}
                    aria-describedby={bad ? `name-seat-${seat}-err` : undefined}
                    onChange={(event) => {
                      setName(i, event.target.value)
                    }}
                  />
                  {bad ? (
                    <span className={s.pickerThesis} id={`name-seat-${seat}-err`}>
                      {`Too long, or it uses a character a seat card cannot show — up to ${NAME_MAX} letters, digits, spaces, ' . _ or -. This seat stays numbered until it changes.`}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className={s.picker} style={{ marginTop: 0 }}>
            <div className={s.pickerRow}>
              <label className={s.pickerLabel} htmlFor="lobby-pace">
                <span className={lab.criterionLabel}>Pace</span>
                <span className={s.handBookName}>seconds a step</span>
              </label>
              <input
                id="lobby-pace"
                className={s.paceInput}
                type="number"
                inputMode="decimal"
                min={PACE_MIN}
                max={PACE_MAX}
                step={PACE_STEP}
                value={paceText}
                onChange={(event) => {
                  setLobby((prev) => ({ ...prev, paceText: event.target.value }))
                }}
                onBlur={() => {
                  setLobby((prev) => ({ ...prev, paceText: String(parsePace(prev.paceText)) }))
                }}
              />
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
                setLobby((prev) => ({ ...prev, seed: freshSeed() }))
              }}
            >
              New seed
            </button>
          </div>

          <div className={buttonRow} style={{ marginTop: 22 }}>
            <Button href={launchHref} arrow={false}>
              Deal me in
            </Button>
            <Button variant="line" href={`${launchHref}&assist=1`} arrow={false}>
              With the assistant
            </Button>
          </div>
        </div>
      </Section>
    </LabShell>
  )
}

export default PlayHub
