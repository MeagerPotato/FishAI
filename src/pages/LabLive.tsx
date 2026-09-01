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
 * ## The honesty contract this page carries
 *
 * Demo-scale numbers are not evidence and must not read as evidence. The page prints the run's
 * own SE beside its score, states the committed matrix's scale next to it, links the measured
 * cell whenever both picks are roster styles, and caps the run at 400 pairs with the reason
 * stated (a single worker thread's wall clock) instead of silently truncating.
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
  ADAPTIVE_ID,
  LIVE_DEFAULT_PAIRS,
  LIVE_DEFAULT_PREFIX,
  LIVE_PAIR_CAP,
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

/** The §4.2 subset the demo reports per side — the four rates that read without a manual. */
const DIAGNOSTICS = [
  { key: 'askHitRate', label: 'Ask hit rate', note: 'hits ÷ asks' },
  { key: 'claimPrecision', label: 'Claim precision', note: 'correct declares ÷ declares' },
  { key: 'concedeRate', label: 'Concede rate', note: 'declares that gifted the set ÷ declares' },
  { key: 'declaresPerGame', label: 'Declares per game', note: 'how often the style spoke at all' },
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

  const adaptiveInPlay = a === ADAPTIVE_ID || b === ADAPTIVE_ID

  return (
    <LabShell
      current={withCase('/lab/live', which)}
      docTitle="Live simulator"
      which={which}
      ground="dots"
      stamp="us54 · live demo · not the committed evidence"
    >
      <Section noRule badge="Live simulator">
        <SectionHead
          level="h1"
          lines={['Real games, in this tab,', 'at *demo scale*.']}
          sub="Pick two policies and the browser plays real duplicate-pair us54 games in a Web Worker — the identical engine, seeding and pairing discipline as the committed matrix, at a fraction of its sample size. The page states that fraction rather than letting the numbers pose as the evidence."
        />

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
        <p className={lab.figNote}>
          Deterministic end to end: the same two picks, pair count and seed prefix reproduce the
          same numbers on any machine. Seeds are <code>prefix-000000</code> onward, start seats
          rotate, and each pair is one deal played from both sides — the lab&rsquo;s own
          protocol, not a lookalike.
        </p>

        {/* The live region announces progress politely; the bar is the same number drawn. */}
        <div className={s.progress} role="status" aria-live="polite">
          {phase.kind === 'idle' ? (
            <span className={s.progressLine}>
              No run yet. Configure a pairing above and press Run.
            </span>
          ) : null}
          {phase.kind === 'running' ? (
            <>
              <div className={s.bar} aria-hidden="true">
                <div
                  className={s.barFill}
                  style={{ width: `${(phase.pairsDone / Math.max(1, phase.pairsTotal)) * 100}%` }}
                />
              </div>
              <span className={s.progressLine}>
                {phase.stopping ? 'Stopping — finishing the current chunk. ' : ''}
                {count(phase.pairsDone)} of {count(phase.pairsTotal)} pairs ·{' '}
                {count(phase.games)} games played · {livePolicyLabel(a)} vs {livePolicyLabel(b)}
              </span>
            </>
          ) : null}
          {phase.kind === 'done' ? (
            <span className={s.progressLine}>
              {phase.result.partial
                ? `Stopped at ${count(phase.result.pairsDone)} of ${count(phase.result.config.pairs)} pairs — the result below is partial.`
                : `Finished: ${count(phase.result.pairsDone)} pairs, ${count(phase.result.cell.games)} games.`}
            </span>
          ) : null}
          {phase.kind === 'failed' ? (
            <span className={s.progressLine}>The run failed — details below.</span>
          ) : null}
        </div>

        {phase.kind === 'failed' ? (
          <p className={lab.disagree}>
            <strong>The simulation did not run.</strong> {phase.detail}. Nothing is shown in its
            place — a demo that renders numbers it did not compute would be worse than no demo.
          </p>
        ) : null}

        {phase.kind === 'done' ? <Readout result={phase.result} which={which} /> : null}

        {a === b ? (
          <p className={lab.figNote}>
            A mirror pairing scores exactly .5000 on duplicate deals by construction — both
            orientations of every pair cancel. Useful as a health check of the harness, and
            measured as one; it is not a finding about the style.
          </p>
        ) : null}
        {adaptiveInPlay ? (
          <p className={lab.figNote}>
            The adaptive pick is v1.0 architecture: it classifies its opponents from the public
            log and best-responds off the measured counter table. One measured caveat travels
            with it: over this roster the best response to everything is Punter, so a warm
            adaptive seat converges there — its adaptivity is aimed at opponents the matrix never
            measured.
          </p>
        ) : null}
        <p className={lab.figNote}>
          All ten picks run today&rsquo;s engine, and since v2.0 that means all ten defuse: the
          concession term sits on the base every roster style spreads from, so a pick named{' '}
          <em>Blitz</em> is Blitz as v2.0 plays it. The default committed matrix and the counter
          table were re-measured against that same knob ladder, which is why a live cell still
          lines up with the committed cell of the same name; the older <code>?case=</code>
          documents predate the term.
        </p>
      </Section>

      <Section badge="Demo, not evidence">
        <SectionHead
          lines={['Same engine, same seeds —', 'a *fraction* of the sample.']}
          sub="What separates this page from the report is nothing but sample size, which is exactly why the distinction has to be stated."
        />
        <div className={lab.split}>
          <div className={lab.stack}>
            <h3 className={lab.criterionLabel}>The committed evidence is next door</h3>
            <p className={lab.figNote}>
              The matrix on{' '}
              <TextLink href={withCase('/lab', which)} arrow={false}>
                the report
              </TextLink>{' '}
              runs 4,300 duplicate pairs per cell for a standard error at or under .005. A
              100-pair demo run lands its SE in the few-hundredths — several times wider — and
              the run above prints its own beside the score. Where both picks are roster styles,
              the readout links the measured cell so the demo number is never the last word.
            </p>
          </div>
          <div className={lab.stack}>
            <h3 className={lab.criterionLabel}>Why the run is capped at {LIVE_PAIR_CAP} pairs</h3>
            <p className={lab.figNote}>
              This is one worker thread on your machine, and a us54 game spends hundreds of
              steps in declare windows: {LIVE_PAIR_CAP} pairs is {LIVE_PAIR_CAP * 2} games and a
              few hundred thousand decisions — tens of seconds of wall clock. Past that the demo
              stops demonstrating and starts being a bad way to run the real experiment, which
              is what the lab&rsquo;s worker pool is for. A backgrounded tab may throttle the
              run&rsquo;s timers; it then finishes late, not never, and leaving the page
              terminates it.
            </p>
          </div>
        </div>
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
        Score rate of {livePolicyLabel(config.a)}, duplicate-averaged · CI 95%{' '}
        {interval(cell.ci95)} · {count(cell.pairs)} pairs, {count(cell.games)} games
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
          <strong>Health gate: this run would be void at reporting scale.</strong> Illegal
          actions {cell.health.illegalActions}, invariant violations{' '}
          {cell.health.invariantViolations}, capped games {cell.health.cappedGames}. The numbers
          above are shown for debugging, not belief.
        </p>
      ) : null}

      <ScrollRegion
        label={`Per-side diagnostics — ${livePolicyLabel(config.a)} against ${livePolicyLabel(config.b)}`}
        style={{ marginTop: 18 }}
      >
        <table className={lab.table}>
          <caption>
            Per-side diagnostics · the §4.2 subset the demo reports · {count(cell.games)} games
          </caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">{livePolicyLabel(config.a)}</th>
              <th scope="col">{livePolicyLabel(config.b)}</th>
              <th scope="col">Definition</th>
            </tr>
          </thead>
          <tbody>
            {DIAGNOSTICS.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.label}</th>
                <td>{cell.metrics.a[d.key].toFixed(3)}</td>
                <td>{cell.metrics.b[d.key].toFixed(3)}</td>
                <td style={{ textAlign: 'left', whiteSpace: 'normal' }} className={lab.ns}>
                  {d.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>

      <p className={lab.figNote}>
        {partial
          ? 'A stopped run reports the pairs that finished and nothing more — the SE above is correspondingly wider. '
          : ''}
        This is a live demonstration at demo scale, not the committed evidence.{' '}
        {anchor ? (
          <>
            The measured number for this pairing, at 4,300 pairs, is{' '}
            <TextLink href={`${withCase('/lab/matrix', which)}#${anchor}`} arrow={false}>
              its cell on the matrix page
            </TextLink>
            .
          </>
        ) : (
          <>
            No committed cell exists for this pairing — the matrix measures the nine pure styles
            pairwise, and the adaptive engine&rsquo;s own evidence run is a separate experiment.
          </>
        )}
      </p>
    </div>
  )
}

export default LabLive
