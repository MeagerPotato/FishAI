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
import { modelOrDefault } from '../play/models.ts'
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
            lines={['That mode', '*is retired*.']}
            sub={
              <>
                The URL asks for <code>v={retired}</code>, and this table cannot seat it. Start a
                fresh table{' '}
                <TextLink href="/play" arrow={false}>
                  in the lobby
                </TextLink>
                .
              </>
            }
          />
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
        <SectionHead level="h1" lines={['One deal,', '*five bots*.']} />

        <div className={lab.synthetic}>
          <Eyebrow tone="muted" track="badge">
            {model.label} · every bot seat
          </Eyebrow>
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
