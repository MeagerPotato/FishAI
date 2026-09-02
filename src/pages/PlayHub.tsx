/**
 * `/play` — the lobby. One mode, because there is one.
 *
 * The Bass v1.0 adaptive engine takes every bot seat: it watches the public log, classifies
 * what each seat appears to be playing, and best-responds off the measured counter table. It
 * offers no style pickers, because choosing a style is the job the engine does for itself, and
 * it states the measured caveat up front rather than in a footnote — over this roster the best
 * response to everything is Punter, so its adaptivity matters mainly against off-roster
 * opponents: the human.
 *
 * The style it delegates to carries v2.0's defusal term (`defuse: 1` sits on the roster's shared
 * base), so the seat is v1.0 architecture running the v2.0 concession layer's active half. The
 * label states both, and policies.ts explains why neither version alone would be honest.
 *
 * ## What this page used to be
 *
 * Two mode cards. v0.5 seated five fixed roster styles chosen here, optionally under a v1.5 bit
 * budget, and it had the page's five style selects, its Memory select and its primary button.
 * All of that is gone from PLAY at the owner's request — one thing under test at a time — and
 * none of it is gone from the project: /lab, /lab/bounded and the papers are untouched, and the
 * engine still holds every policy it has ever measured. A `?v=05` link is refused with an
 * explanation at /play/table rather than silently redealt (params.ts says why).
 *
 * ## What the lobby writes into the URL
 *
 * Everything, as before: `seed`, `names`, `pace`. The URL is the whole configuration, so a
 * shared link reproduces the exact table — the only thing it cannot reproduce is you.
 *
 * Amber budget: with v0.5's card gone, the one primary on this page is the adaptive launch
 * button. Everything else is `ghost`/`line`.
 */
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button, Eyebrow, Section, SectionHead, TextLink, buttonRow } from '../components/index.ts'
import { caseFromSearch } from '../lab/case.ts'
import { LabShell, withCase } from '../lab/ui/LabShell.tsx'
import lab from '../lab/ui/lab.module.css'
import {
  NAME_MAX,
  PACE_DEFAULT,
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
import { DEFAULT_MODEL_ID, modelOrDefault, PLAY_MODELS } from '../play/models.ts'
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
        <SectionHead
          level="h1"
          lines={['Take a seat.', '*Five bots will join you.*']}
          sub={
            <>
              The same engine and rule set the lab measures, dealt to a human at seat 0. us54,
              deterministic: the seed drives the deal and every bot decision, so a game&apos;s URL
              replays it move for move — the only thing the link cannot reproduce is you.
            </>
          }
        />

        <div className={s.mode}>
          <Eyebrow tone="muted" track="badge">
            {model.label}
          </Eyebrow>
          <h2 className={s.modeTitle}>{model.heading}</h2>
          <p className={s.modeBody}>
            {model.note} Your teammates are seats 2 and 4; seats 1, 3 and 5 play against you.
          </p>
          {/* The two notes below are about the adaptive engine specifically — what its version
              label means, and the caveat that it converges on Punter. Neither is true of a fixed
              style, so they are shown only when that is what is seated. */}
          {model.id === DEFAULT_MODEL_ID ? (
            <>
              <p className={lab.figNote}>
                You cannot pick this one&apos;s style, because choosing one is the whole job it
                does for itself.
              </p>
              <p className={lab.figNote}>
            The two versions in the label are both real. The <em>architecture</em> is v1.0 —
            observe, classify, best-respond — and none of that machinery has changed. What has
            changed is the styles it plays: every roster entry now carries v2.0&apos;s defusal
            term, so a bot that has watched you show a basis in a set it holds cards of will go
            after that card to take the licence back.
          </p>
          <p className={lab.figNote}>
            One measured caveat, stated where the launch button is rather than in a footnote: over
            the nine-style roster the measured best response to every style is Punter, so a warm
            adaptive bot converges there. What its adaptivity is actually for is opponents the
            matrix never measured — you.
              </p>
            </>
          ) : null}

          <div className={s.picker} style={{ marginTop: 0 }}>
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
              <span className={s.pickerThesis}>
                All five bot seats run the same model — a table that mixed them would measure the
                matchup rather than the bot. {model.name} is written into the launch link, so a
                shared URL reproduces the opponent as well as the deal.
              </span>
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
                  <span className={s.pickerThesis} id={bad ? `name-seat-${seat}-err` : undefined}>
                    {bad
                      ? `Too long, or it uses a character a seat card cannot show — up to ${NAME_MAX} letters, digits, spaces, ' . _ or -. This seat stays numbered until it changes.`
                      : 'Leave it empty to keep the seat numbered. Named seats keep their number too.'}
                  </span>
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
              <span className={s.pickerThesis}>
                How long the table waits between its own moves — {PACE_MIN} to {PACE_MAX} seconds,{' '}
                {PACE_DEFAULT} by default, and adjustable at the table. Pause and Step live there
                too, for walking a game forward by hand.
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
                setLobby((prev) => ({ ...prev, seed: freshSeed() }))
              }}
            >
              New seed
            </button>
          </div>
          <p className={lab.figNote}>
            The seed is the game: it deals the cards and drives every bot decision, so this
            lobby&apos;s launch link replays the identical game for anyone who opens it.
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
            The assistant is the engine&apos;s own reasoning surface: at each of your decisions it
            shows the move the same adaptive engine would play and why — from exactly the
            information you have, nothing more.
          </p>
        </div>
      </Section>

      <Section badge="The evidence" noMarks>
        <Eyebrow tone="muted" track="head" as="h2">
          Played here, measured next door
        </Eyebrow>
        <p className={lab.prose} style={{ marginTop: 14 }}>
          Every style the adaptive engine can reach for carries a measured record before it
          carries cards. The payoff matrix, the significance discipline behind it and the verdict
          on whether any style is actually superior live in{' '}
          <TextLink href="/lab" arrow={false}>
            the report
          </TextLink>
          ; a stored game replayed through the engine, declare windows and all, lives at{' '}
          {/*
            Derived from the loaded artifact, never written down. This link used to name
            `blitz-vs-banker`, an id that exists only in the legacy fixture — so on the default
            case it landed on "No replay is stored under that id." `replayHref` reads the first
            replay out of whichever artifact is actually loaded, which is the same helper the
            nav and the footer already use, and it carries `?case=` across with it.
          */}
          <TextLink href={withCase('/lab/replay', which)} arrow={false}>
            the replay page
          </TextLink>
          . The table you just configured is the same engine with you in it — and when your game
          ends, the <strong>style mirror</strong> turns the v1.0 classifier on the finished log,
          you included, and says which of the nine styles you played most like. The engine&apos;s
          own evidence, degeneracy included, is at{' '}
          <TextLink href="/lab/adaptive" arrow={false}>
            the adaptive suite
          </TextLink>
          .
        </p>
      </Section>
    </LabShell>
  )
}

export default PlayHub
