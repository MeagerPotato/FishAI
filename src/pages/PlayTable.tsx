/**
 * `/play/table` — one us54 game, human at seat 0, five bots, configured entirely by the URL.
 *
 * `?seed=...&names=a,b,c,d,e&pace=<seconds>&assist=0|1` — see src/play/params.ts. The seed is
 * canonicalised into the URL on arrival so every game is shareable: the deal and every bot's
 * every decision follow from it deterministically (the lab's own seeding convention), so the
 * link IS the game. `?assist=1` opens the assistant pane — the engine's own traced reasoning
 * (src/play/advisor.ts), which also renders inside the declare dialog where the modal would
 * otherwise hide it.
 *
 * Every bot seat is the Bass v1.0 adaptive engine, playing roster styles that carry v2.0's
 * defusal term (`defuse: 1` on the roster's shared base — policies.ts has the full account of
 * why the label names both versions). There is no mode picker because there is no second mode:
 * v0.5 is retired from play (see policies.ts for what that did and did not touch), and a link
 * that still names it is REFUSED here rather than quietly dealt as the adaptive engine.
 * The whole promise of this page is that the URL reproduces the game; honouring the seed while
 * silently swapping the engine would break that promise in the one way a player could not see.
 *
 * The game itself lives in src/play/Table.tsx, remounted via `key` on a change of seed or the
 * rematch counter — a fresh `useGame` is the whole reset mechanism.
 */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eyebrow, Section, SectionHead, TextLink } from '../components/index.ts'
import { caseFromSearch } from '../lab/case.ts'
import { LabShell } from '../lab/ui/LabShell.tsx'
import lab from '../lab/ui/lab.module.css'
import { DEFAULT_MODEL_ID, modelOrDefault } from '../play/models.ts'
import { freshSeed, parsePlayParams, retiredMode } from '../play/params.ts'
import playCss from '../play/play.module.css'
import { Table } from '../play/Table.tsx'

export function PlayTable() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const which = caseFromSearch(search)
  const retired = retiredMode(search)

  // A first visit with no `?seed=` gets one drawn once and written into the URL, so the game a
  // visitor is looking at is always the game their address bar reproduces. An empty or
  // whitespace-only `?seed=` — a cleared lobby field — is treated exactly like a missing one:
  // it canonicalises to the drawn seed rather than seeding the game with an empty string.
  const [drawn] = useState(() => freshSeed())
  const params = new URLSearchParams(search)
  const rawSeed = params.get('seed')
  const seedParam = rawSeed !== null && rawSeed.trim() !== '' ? rawSeed : null
  const seed = seedParam ?? drawn

  useEffect(() => {
    // A refused URL is left exactly as the visitor typed or received it. Rewriting a seed into
    // a link this page is about to decline would edit the evidence in their address bar.
    if (retired !== null || seedParam !== null) return
    const next = new URLSearchParams(search)
    next.set('seed', seed)
    navigate({ search: `?${next.toString()}` }, { replace: true })
  }, [retired, seedParam, seed, search, navigate])

  const play = parsePlayParams(search, seed)
  const model = modelOrDefault(play.modelId)
  const [run, setRun] = useState(0)

  if (retired !== null) {
    return (
      <LabShell current="/play" docTitle="Retired mode" which={which} ground="dots" stamp="us54">
        <Section noRule badge="The table">
          <SectionHead
            level="h1"
            lines={['That link names', '*a mode this table retired.*']}
            sub={
              <>
                The URL asks for <code>v={retired}</code>, and this table cannot seat it. The
                models it does seat are named in the lobby; none of them is that one, so there is
                no honest way to open your link: the seed would still deal, the game would still
                run, and every decision in it would be a different bot&apos;s. You would be
                looking at someone else&apos;s game under your own seed.
              </>
            }
          />
          <p className={lab.prose}>
            Nothing measured under the older versions has gone anywhere — the roster, the payoff
            matrix and the bounded-memory ladder are all still in the lab, the papers still argue
            from them, and each frozen version is archived as a git tag (<code>bass-v0.5</code>{' '}
            through <code>bass-v2.0</code>) at the commit where it was last whole. What the play
            surface cannot do is seat one: those versions differ from today&apos;s engine in code,
            not in a setting, so offering them here would mean shipping a second bot brain rather
            than accepting a parameter. Start a fresh table{' '}
            <TextLink href="/play" arrow={false}>
              in the lobby
            </TextLink>
            , or read the measured record{' '}
            <TextLink href="/lab" arrow={false}>
              in the report
            </TextLink>
            .
          </p>
        </Section>
      </LabShell>
    )
  }

  const onNewGame = () => {
    const next = new URLSearchParams(search)
    next.set('seed', freshSeed())
    navigate({ search: `?${next.toString()}` })
  }

  return (
    <LabShell
      current="/play"
      docTitle="Solo table"
      which={which}
      ground="dots"
      stamp={`us54 · seed ${seed}`}
    >
      {/* The heading band is deliberately tight here: everything above the score strip is
          budget the ask panel — the control a player touches every single turn — has to be
          pushed down by, and this is a page you play rather than one you read. */}
      <Section noRule badge="The table" className={playCss.playSection}>
        <SectionHead
          level="h1"
          lines={['One deal,', '*you against the roster.*']}
          sub={
            <>
              us54, deterministic: the seed in the URL drives the deal and every bot decision, so
              this link replays this game. Configure a different table{' '}
              <TextLink href="/play" arrow={false}>
                in the lobby
              </TextLink>
              .
            </>
          }
        />

        <div className={lab.synthetic}>
          <Eyebrow tone="muted" track="badge">
            {model.label} · every bot seat
          </Eyebrow>
          {model.id === DEFAULT_MODEL_ID ? (
            <p className={lab.syntheticBody}>
              No styles can be assigned at this table. Each bot reads the public log, classifies
              what the other seats appear to be playing, and best-responds with a roster style
              chosen off the measured payoff table — re-derived from scratch at every decision, so
              two seats with the same information reach the same read. The <em>architecture</em> is
              v1.0; the styles it delegates to all carry v2.0&apos;s defusal term, so when you have
              publicly shown a basis in a set these bots hold cards of, they will try to take that
              card back. One measured caveat, stated up front: over this roster the best response
              to <em>everything</em> is Punter, so a warm adaptive seat converges there; its
              adaptivity matters against opponents the matrix never measured — such as you.
            </p>
          ) : (
            <p className={lab.syntheticBody}>
              {model.note} All five bot seats run it; no style can be assigned at this table. The
              model is part of the link, so this URL replays this game against this opponent.
            </p>
          )}
        </div>

        <Table
          key={`${seed}:${run}`}
          play={play}
          onRematch={() => {
            setRun((n) => n + 1)
          }}
          onNewGame={onNewGame}
        />
      </Section>
    </LabShell>
  )
}

export default PlayTable
