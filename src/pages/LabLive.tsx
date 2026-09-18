/**
 * `/lab/live` — the in-browser simulator. BOT_LAB.md §7's one sanctioned live surface: *"a Web
 * Worker may run a few hundred live games for the interactive demo."*
 *
 * The page is deliberately a THIN shell over `src/lab/live/livesim.ts`. Every number shown here
 * was computed by the same pure code path the committed matrix used — `seedFor`,
 * `startSeatFor`, `playGameSeats`, `aggregateCell` — inside a module worker, so the main thread
 * never blocks and the demo cannot drift from the lab's discipline. The worker is created on
 * Run, terminated on completion, on error and on unmount; a Stop posts a message and the
 * partial result comes back labelled partial rather than dressed as a finished run.
 *
 * Demo-scale numbers are not evidence: the readout prints the run's own SE beside its score and
 * links the measured cell whenever both picks are roster styles.
 *
 * ## Accent budget
 *
 * Nothing on this page spends accent text. Run and Stop are `line`/`ghost`, the progress fill
 * is ink on tile, and the readout is ink. A demo that dressed itself in the verdict's amber
 * would be claiming a status its sample size does not have.
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button, Eyebrow, Section, SectionHead, TextLink } from '../components/index.ts'
import { caseFromSearch, type ArtifactCase } from '../lab/artifact.ts'
import { count, interval, rate } from '../lab/format.ts'
import { createSimWorker } from '../lab/live/client.ts'
import {
  LIVE_DEFAULT_PAIRS,
  LIVE_DEFAULT_PREFIX,
  LIVE_PAIR_CHOICES,
  LIVE_POLICY_IDS,
  isLivePolicyId,
  livePolicyLabel,
  matrixCellAnchor,
  normalisePrefix,
} from '../lab/live/livesim.ts'
import type { LiveFromWorker, LivePolicyId, LiveResult, LiveToWorker } from '../lab/live/livesim.ts'
import { LabShell, withCase } from '../lab/ui/LabShell.tsx'
import { ScrollRegion } from '../lab/ui/ScrollRegion.tsx'
import lab from '../lab/ui/lab.module.css'
import s from '../lab/live/live.module.css'

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; pairsDone: number; pairsTotal: number; games: number; stopping: boolean }
  | { kind: 'done'; result: LiveResult }
  | { kind: 'failed'; detail: string }

/** The §4.2 subset the demo reports per side. */
const DIAGNOSTICS = [
  { key: 'askHitRate', label: 'Ask hit rate' },
  { key: 'claimPrecision', label: 'Claim precision' },
  { key: 'concedeRate', label: 'Concede rate' },
  { key: 'declaresPerGame', label: 'Declares per game' },
] as const

function PolicySelect({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: LivePolicyId
  onChange: (next: LivePolicyId) => void
  disabled: boolean
}) {
  return (
    <div className={s.field}>
      <label htmlFor={id}>
        <Eyebrow tone="muted" track="legal">
          {label}
        </Eyebrow>
      </label>
      <select
        id={id}
        className={s.select}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value
          if (isLivePolicyId(next)) onChange(next)
        }}
      >
        {LIVE_POLICY_IDS.map((pid) => (
          <option key={pid} value={pid}>
            {livePolicyLabel(pid)}
          </option>
        ))}
      </select>
    </div>
  )
}

export function LabLive() {
  const { search } = useLocation()
  const which = caseFromSearch(search)

  const [a, setA] = useState<LivePolicyId>('balanced')
  const [b, setB] = useState<LivePolicyId>('blitz')
  const [pairs, setPairs] = useState(LIVE_DEFAULT_PAIRS)
  const [prefix, setPrefix] = useState(LIVE_DEFAULT_PREFIX)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const workerRef = useRef<Worker | null>(null)

  // Leaving the page terminates the worker: a result nobody can see is heat, not measurement.
  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = null
    },
    [],
  )

  const running = phase.kind === 'running'

  const start = () => {
    if (workerRef.current !== null) return
    const config = { a, b, pairs, seedPrefix: normalisePrefix(prefix) }
    const worker = createSimWorker()
    workerRef.current = worker
    worker.addEventListener('message', (event: MessageEvent<LiveFromWorker>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        setPhase((prev) => ({
          kind: 'running',
          pairsDone: msg.pairsDone,
          pairsTotal: msg.pairsTotal,
          games: msg.games,
          stopping: prev.kind === 'running' ? prev.stopping : false,
        }))
        return
      }
      worker.terminate()
      workerRef.current = null
      if (msg.type === 'result') setPhase({ kind: 'done', result: msg.result })
      else setPhase({ kind: 'failed', detail: msg.detail })
    })
    worker.addEventListener('error', (event) => {
      worker.terminate()
      workerRef.current = null
      setPhase({ kind: 'failed', detail: event.message || 'the worker failed to load' })
    })
    setPhase({ kind: 'running', pairsDone: 0, pairsTotal: pairs, games: 0, stopping: false })
    worker.postMessage({ type: 'run', config } satisfies LiveToWorker)
  }

  const stop = () => {
    workerRef.current?.postMessage({ type: 'stop' } satisfies LiveToWorker)
    setPhase((prev) => (prev.kind === 'running' ? { ...prev, stopping: true } : prev))
  }

  return (
    <LabShell
      current={withCase('/lab/live', which)}
      docTitle="Live simulator"
      which={which}
      ground="dots"
      stamp="us54 · live demo"
    >
      <Section noRule badge="Live simulator">
        <SectionHead level="h1" lines={['Real games,', 'at *demo scale*.']} />

        <div className={s.config}>
          <PolicySelect id="live-a" label="Side A" value={a} onChange={setA} disabled={running} />
          <PolicySelect id="live-b" label="Side B" value={b} onChange={setB} disabled={running} />

          <div className={s.field} role="group" aria-labelledby="live-pairs-label">
            <Eyebrow tone="muted" track="legal">
              <span id="live-pairs-label">Duplicate pairs</span>
            </Eyebrow>
            <div className={s.pairsRow}>
              {LIVE_PAIR_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`${lab.pill} ${pairs === n ? lab.pillOn : ''}`}
                  aria-pressed={pairs === n}
                  disabled={running}
                  onClick={() => setPairs(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className={s.field}>
            <label htmlFor="live-prefix">
              <Eyebrow tone="muted" track="legal">
                Seed prefix
              </Eyebrow>
            </label>
            <input
              id="live-prefix"
              className={s.prefix}
              type="text"
              value={prefix}
              spellCheck={false}
              disabled={running}
              onChange={(event) => setPrefix(event.target.value)}
            />
          </div>
        </div>

        <div className={s.runRow}>
          <Button variant="line" onClick={start} disabled={running} arrow={false}>
            Run {count(pairs)} pairs · {count(pairs * 2)} games
          </Button>
          <Button
            variant="ghost"
            onClick={stop}
            disabled={!running || (phase.kind === 'running' && phase.stopping)}
            arrow={false}
          >
            {phase.kind === 'running' && phase.stopping ? 'Stopping…' : 'Stop'}
          </Button>
        </div>

        {/* The live region announces progress politely; the bar is the same number drawn. */}
        <div className={s.progress} role="status" aria-live="polite">
          {phase.kind === 'idle' ? <span className={s.progressLine}>No run yet.</span> : null}
          {phase.kind === 'running' ? (
            <>
              <div className={s.bar} aria-hidden="true">
                <div
                  className={s.barFill}
                  style={{ width: `${(phase.pairsDone / Math.max(1, phase.pairsTotal)) * 100}%` }}
                />
              </div>
              <span className={s.progressLine}>
                {phase.stopping ? 'Stopping… ' : ''}
                {count(phase.pairsDone)} of {count(phase.pairsTotal)} pairs ·{' '}
                {count(phase.games)} games played · {livePolicyLabel(a)} vs {livePolicyLabel(b)}
              </span>
            </>
          ) : null}
          {phase.kind === 'done' ? (
            <span className={s.progressLine}>
              {phase.result.partial
                ? `Stopped at ${count(phase.result.pairsDone)} of ${count(phase.result.config.pairs)} pairs — partial result.`
                : `Finished: ${count(phase.result.pairsDone)} pairs, ${count(phase.result.cell.games)} games.`}
            </span>
          ) : null}
          {phase.kind === 'failed' ? (
            <span className={s.progressLine}>The run failed — details below.</span>
          ) : null}
        </div>

        {phase.kind === 'failed' ? (
          <p className={lab.disagree}>
            <strong>The simulation did not run.</strong> {phase.detail}.
          </p>
        ) : null}

        {phase.kind === 'done' ? <Readout result={phase.result} which={which} /> : null}
      </Section>
    </LabShell>
  )
}

function Readout({ result, which }: { result: LiveResult; which: ArtifactCase }) {
  const { cell, config, partial } = result
  const anchor = matrixCellAnchor(config.a, config.b)
  const unhealthy =
    cell.health.illegalActions > 0 || cell.health.invariantViolations > 0 || cell.health.cappedGames > 0

  return (
    <div className={s.readout}>
      <Eyebrow tone="muted" track="badge">
        {partial ? 'Partial result · stopped early' : 'Result'} · {livePolicyLabel(config.a)} vs{' '}
        {livePolicyLabel(config.b)} · seed prefix {config.seedPrefix}
      </Eyebrow>
      <p className={s.headline}>
        {rate(cell.aScore)} <span aria-hidden="true">·</span> ± {cell.se.toFixed(4)} SE
      </p>
      <p className={s.headlineSub}>
        Score rate of {livePolicyLabel(config.a)} · CI 95% {interval(cell.ci95)} ·{' '}
        {count(cell.pairs)} pairs, {count(cell.games)} games
      </p>

      <div className={s.statRow}>
        <div className={s.stat}>
          <Eyebrow tone="muted" track="legal">
            Wins A / wins B
          </Eyebrow>
          <span className={s.statValue}>
            {count(cell.aWins)} / {count(cell.bWins)}
          </span>
        </div>
        <div className={s.stat}>
          <Eyebrow tone="muted" track="legal">
            Avg moves
          </Eyebrow>
          <span className={s.statValue}>{cell.avgMoves.toFixed(1)}</span>
        </div>
        <div className={s.stat}>
          <Eyebrow tone="muted" track="legal">
            Sets at clinch
          </Eyebrow>
          <span className={s.statValue}>
            {cell.setsAtClinch[0].toFixed(2)} – {cell.setsAtClinch[1].toFixed(2)}
          </span>
        </div>
        <div className={s.stat}>
          <Eyebrow tone="muted" track="legal">
            Unresolved / game
          </Eyebrow>
          <span className={s.statValue}>{cell.unresolved.toFixed(2)}</span>
        </div>
      </div>

      {unhealthy ? (
        <p className={lab.disagree}>
          <strong>Health gate failed.</strong> Illegal actions {cell.health.illegalActions},
          invariant violations {cell.health.invariantViolations}, capped games{' '}
          {cell.health.cappedGames}.
        </p>
      ) : null}

      <ScrollRegion
        label={`Per-side diagnostics — ${livePolicyLabel(config.a)} against ${livePolicyLabel(config.b)}`}
        style={{ marginTop: 18 }}
      >
        <table className={lab.table}>
          <caption>Per-side diagnostics · {count(cell.games)} games</caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">{livePolicyLabel(config.a)}</th>
              <th scope="col">{livePolicyLabel(config.b)}</th>
            </tr>
          </thead>
          <tbody>
            {DIAGNOSTICS.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.label}</th>
                <td>{cell.metrics.a[d.key].toFixed(3)}</td>
                <td>{cell.metrics.b[d.key].toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>

      {anchor ? (
        <p className={lab.figNote}>
          <TextLink href={`${withCase('/lab/matrix', which)}#${anchor}`}>
            Committed matrix cell
          </TextLink>
        </p>
      ) : null}
    </div>
  )
}

export default LabLive
