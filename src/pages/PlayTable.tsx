/**
 * `/play/table` — one us54 game, human at seat 0, five bots, configured entirely by the URL.
 *
 * `?v=05|10&seed=...&styles=a,b,c,d,e|random&assist=0|1` — see src/play/params.ts. The seed is
 * canonicalised into the URL on arrival so every game is shareable: the deal, every bot's every
 * decision and the derived styles all follow from it deterministically (the lab's own seeding
 * convention), so the link IS the game.
 *
 * `?v=10` seats the FishAI v1.0 adaptive engine at every bot seat (`policyForSeat`), with the
 * measured degeneracy caveat stated in the notice rather than a footnote. `?assist=1` opens the
 * assistant pane — the engine's own traced reasoning (src/play/advisor.ts), which also renders
 * inside the declare dialog where the modal would otherwise hide it.
 *
 * The game itself lives in src/play/Table.tsx, remounted via `key` on any change of mode, seed,
 * styles or the rematch counter — a fresh `useGame` is the whole reset mechanism.
 */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eyebrow, Section, SectionHead, TextLink } from '../components/index.ts'
import { caseFromSearch } from '../lab/artifact.ts'
import { LabShell } from '../lab/ui/LabShell.tsx'
import lab from '../lab/ui/lab.module.css'
import { freshSeed, parsePlayParams } from '../play/params.ts'
import { Table } from '../play/Table.tsx'

const PLAY_FACTS = [
  {
    head: 'Declares happen in windows, and declining is a move.',
    body:
      'After every action, each seat in turn order is offered the chance to declare (RULES_US54.md §3). ' +
      'Your offers are declined for you unless you arm the standing Declare control; when the ' +
      'turn-holder has no legal ask, declining is illegal and the seat holding the option must ' +
      'declare — the table opens the dialog and says why.',
  },
  {
    head: 'Any error in a declare gifts the whole set.',
    body:
      'Row 14 abolished the void outcome: an opponent holding one of the six, or one card placed ' +
      'with the wrong teammate, awards the set to the opposing team. The declare dialog repeats ' +
      'this before you commit.',
  },
  {
    head: 'First to five of the nine sets clinches.',
    body:
      'The game ends the moment either team has been awarded five sets, so a finished game always ' +
      'has sets unresolved and cards still in hand. The score reads "5–3 · 1 unresolved", never a ' +
      'bare pair of numbers.',
  },
]

export function PlayTable() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const which = caseFromSearch(search)

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
    if (seedParam !== null) return
    const next = new URLSearchParams(search)
    next.set('seed', seed)
    navigate({ search: `?${next.toString()}` }, { replace: true })
  }, [seedParam, seed, search, navigate])

  const play = parsePlayParams(search, seed)
  const [run, setRun] = useState(0)

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
      <Section noRule badge="The table">
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

        {play.mode === 'v10' ? (
          <div className={lab.synthetic}>
            <Eyebrow tone="muted" track="badge">
              FishAI v1.0 · every bot seat is adaptive
            </Eyebrow>
            <p className={lab.syntheticBody}>
              No styles can be assigned at this table. Each bot reads the public log, classifies
              what the other seats appear to be playing, and best-responds with a roster style
              chosen off the measured payoff table — re-derived from scratch at every decision,
              so two seats with the same information reach the same read. One measured caveat,
              stated up front: over this roster the best response to <em>everything</em> is
              Punter, so a warm v1.0 seat converges there; its adaptivity matters against
              opponents the matrix never measured — such as you.
            </p>
          </div>
        ) : null}

        <Table
          key={`${play.mode}:${seed}:${play.stylesKey}:${run}`}
          play={play}
          onRematch={() => {
            setRun((n) => n + 1)
          }}
          onNewGame={onNewGame}
        />
      </Section>

      <Section badge="Rule set" noMarks>
        <Eyebrow tone="muted" track="head" as="h2">
          Three things about us54 this table depends on
        </Eyebrow>
        <div className={lab.stack} style={{ marginTop: 20 }}>
          {PLAY_FACTS.map((fact) => (
            <div key={fact.head}>
              <h3 className={lab.criterionLabel}>{fact.head}</h3>
              <p className={lab.figNote}>{fact.body}</p>
            </div>
          ))}
        </div>
      </Section>
    </LabShell>
  )
}

export default PlayTable
