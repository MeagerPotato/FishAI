import { PinAct, pinHead, pinHeadAside } from '../acts/PinAct.tsx'
import { Board } from '../data/Board.tsx'
import type { BoardItem } from '../data/Board.tsx'
import { StatChart } from '../data/StatChart.tsx'
import type { Stat } from '../data/StatChart.tsx'
import { Section, SectionHead } from '../layout/Section.tsx'
import { Arrow } from '../primitives/Arrow.tsx'
import { Button, TextLink, buttonRow } from '../primitives/Button.tsx'
import { Eyebrow } from '../primitives/Eyebrow.tsx'
import { Hairline } from '../primitives/Hairline.tsx'
import { InkPanel, inkPanelBody, inkPanelNote } from '../primitives/InkPanel.tsx'
import { MaskedLines } from '../primitives/MaskedLines.tsx'
import { Reveal } from '../primitives/Reveal.tsx'
import { LabContents, type LabSection } from '../../lab/ui/LabContents.tsx'
import { LabShell } from '../../lab/ui/LabShell.tsx'
import s from './SystemDemo.module.css'

/* ---------------------------------------------------------------------------
   Content. Authored for FishAI; the numbers are structural facts about the
   us54 rule set and the roster, never simulation results — a specimen sheet is
   the wrong place to print a measurement, and this page prints none.
   --------------------------------------------------------------------------- */

/**
 * The in-page index, in place of the four bespoke nav links this page used to define.
 *
 * Those links were the whole `/design` defect: they replaced the site's own nav with a
 * different one, so a reader who clicked Design was dropped into a parallel site with four tabs
 * that went nowhere else and no way back. The four destinations were always in-page anchors, so
 * they belong in an in-page contents list — which is what the long lab routes already use.
 */
const CONTENTS: readonly LabSection[] = [
  { id: 'roster', label: 'The roster', note: 'Nine styles, as the Board renders them' },
  { id: 'numbers', label: 'By the numbers', note: 'The pinned scroll act and the stat chart' },
  { id: 'specimen', label: 'Specimen', note: 'Palette, scale, tracking, controls' },
  { id: 'method', label: 'Method', note: 'A centred section head' },
  { id: 'sign-off', label: 'The sign-off', note: 'The ink panel' },
]

const ROSTER: BoardItem[] = [
  {
    ix: 'S1',
    title: 'Balanced',
    role: 'Control',
    body: 'The tuned us54 baseline. Every other style is read against this one, which is why it is a style and not a default.',
  },
  {
    ix: 'S2',
    title: 'Blitz',
    role: 'Aggressive',
    body: 'Tempo and sets now; information is cheap. Declares early, targets the seat holding most, and never signals.',
  },
  {
    ix: 'S3',
    title: 'Punter',
    role: 'Aggressive',
    body: 'Chases the completing card and accepts the gift risk. Tolerates two guessed cards inside a declare.',
  },
  {
    ix: 'S4',
    title: 'Banker',
    role: 'Conservative',
    body: 'Never gifts a set. Declares only certainties, refuses long-shot asks, and targets the seat holding fewest.',
  },
  {
    ix: 'S5',
    title: 'Turtle',
    role: 'Passive',
    body: 'Minimum risk. Declares only half-suits held entirely in hand — the passive extreme, and the floor of the spectrum.',
  },
  {
    ix: 'S6',
    title: 'Hoarder',
    role: 'Optionality',
    body: 'Keeps ask-licences alive and delays. Holds a minimum hand size so it can never be walked out of the game.',
  },
  {
    ix: 'S7',
    title: 'Scout',
    role: 'Information',
    body: 'Deduce first, collect later. Weights narrowing over hitting, then converts the deduction into a certain declare.',
  },
  {
    ix: 'S8',
    title: 'Ghost',
    role: 'Information',
    body: 'Denies opponents the read. Injects deliberate noise into its own ask pattern once the leak threshold is crossed.',
  },
  {
    ix: 'S9',
    title: 'Archivist',
    role: 'Information',
    body: 'Tracks half-suits it holds nothing in and declares them for its partners — the axis out-of-turn declaring opened up.',
  },
]

const STATS: Stat[] = [
  { value: 9, label: 'Play styles on the roster, one shared inference engine' },
  { value: 36, label: 'Distinct style pairings in the round robin' },
  { value: 54, label: 'Cards in the us54 deck — 52 plus two jokers' },
  { value: 5, label: 'Sets that clinch the game; a tie is arithmetically impossible' },
]

const PALETTE = [
  { token: '--fa-page', label: 'Page', value: '#FFFCF0' },
  { token: '--fa-sheet', label: 'Sheet', value: '#FFFDF3' },
  { token: '--fa-paper', label: 'Paper', value: '#FBF7E6' },
  { token: '--fa-paper-2', label: 'Paper 2', value: '#F3EDD6' },
  { token: '--fa-tile', label: 'Tile', value: '#EFE9D2' },
  { token: '--fa-ink', label: 'Ink', value: '#16140E' },
  { token: '--fa-ink-2', label: 'Ink 2', value: '#57534A' },
  { token: '--fa-ink-3', label: 'Ink 3', value: '#8B8577' },
  { token: '--fa-amber', label: 'Amber', value: '#F3B44A' },
  { token: '--fa-amber-2', label: 'Amber 2', value: '#C77E0A' },
]

const SCALE = [
  { token: '--fa-fs-display', note: 'clamp(37, 4.05vw, 64)', size: 'var(--fa-fs-display)' },
  { token: '--fa-fs-h2', note: 'clamp(31, 3.05vw, 47)', size: 'var(--fa-fs-h2)' },
  { token: '--fa-fs-h4', note: '21px', size: 'var(--fa-fs-h4)' },
  { token: '--fa-fs-lead', note: '19px', size: 'var(--fa-fs-lead)' },
  { token: '--fa-fs-body', note: '17px', size: 'var(--fa-fs-body)' },
  { token: '--fa-fs-sm', note: '15px', size: 'var(--fa-fs-sm)' },
  { token: '--fa-fs-meta', note: '12.5px', size: 'var(--fa-fs-meta)' },
  { token: '--fa-fs-micro', note: '10.5px', size: 'var(--fa-fs-micro)' },
] as const

const TRACKING = [
  { track: 'tight', label: 'Tight · 0.10em' },
  { track: 'name', label: 'Name · 0.12em' },
  { track: 'legal', label: 'Legal · 0.14em' },
  { track: 'badge', label: 'Badge · 0.16em' },
  { track: 'head', label: 'Head · 0.18em' },
] as const

/* ------------------------------------------------------------------------- */

/**
 * The specimen route. Every primitive in the system appears here once, in the
 * layout it is meant to be used in — a design system you can only read is a
 * design system nobody checks.
 *
 * It sits in `LabShell`, the same shell as every other route, and that is the whole point of
 * this file's last revision. It used to build its own `SheetRoot` + `SiteNav` + `SiteFooter`
 * with four nav links of its own invention, so `/design` was a second site wearing the first
 * one's clothes: the tabs changed under the reader, none of them led anywhere outside this
 * page, and the way back was the browser's back button. A specimen sheet demonstrates the
 * system; it does not get to opt out of it.
 */
export function SystemDemo() {
  return (
    <LabShell
      current="/design"
      docTitle="Design specimen"
      stamp="Rule set us54 · specimen sheet"
      which="v2"
    >
      {/* --- hero ------------------------------------------------------ */}
      <Section noRule noMarks className={s.hero}>
        <div className={s.heroGrid}>
          <MaskedLines
            level="h1"
            lines={['Nine play styles.', 'One inference engine.', '*Style, not skill.*']}
          />

          <div className={s.heroRight}>
            <Reveal as="p">
              FishAI plays the us54 dialect of Canadian Fish and runs the roster against itself
              on duplicate deals. Every style shares the same deduction code, so what the payoff
              matrix measures is the policy — not one bot being better written than another.
            </Reveal>

            <div className={buttonRow}>
              <Button href="#numbers" variant="line">
                Read the numbers
              </Button>
              <Button href="/lab" variant="ghost">
                The measured report
              </Button>
            </div>
          </div>
        </div>

        <LabContents sections={CONTENTS} />
      </Section>

      {/* --- roster ---------------------------------------------------- */}
      <Section id="roster" badge="The roster">
        <SectionHead
          lines={['Nine theses about *how to play*,', 'tuned from scratch.']}
          sub="Under us54 a bad declare gifts the set to the opposition instead of voiding it — a two-point swing in a race to five. Every threshold inherited from the 48-card game is therefore too loose, so no style here is a port."
        />

        <div className={s.readout}>
          <Eyebrow tone="accent" track="badge">
            FIG. 001
          </Eyebrow>
          <span className={s.readoutName}>The style spectrum</span>
          <Eyebrow tone="body" track="tight">
            Aggressive → passive, plus three information styles
          </Eyebrow>
          <Eyebrow tone="muted" track="legal" className={s.readoutAhead}>
            9 items
          </Eyebrow>
        </div>

        <Board items={ROSTER} />
      </Section>

      {/* --- pinned act ------------------------------------------------ */}
      {/* The id lives on the wrapper rather than on the pin head, for the reason LabContents
          documents: the head is a few hundred pixels inside a sticky pin, far too short for the
          scroll observer to ever settle on. The wrapper is the whole act. */}
      <div id="numbers">
        <PinAct steps={STATS.length} badge="By the numbers">
          {(progress) => (
            <>
              <div className={pinHead}>
                <MaskedLines lines={['The shape of the', '*experiment*.']} />
                <div className={pinHeadAside}>
                  <p className={s.actNote}>
                    Structural facts about the rule set and the roster. No measurement appears
                    on this page: a specimen sheet exists to show how a figure is drawn, and a
                    number printed here would be a number nobody could check.
                  </p>
                  <TextLink href="/lab">The measured report</TextLink>
                </div>
              </div>
              <StatChart stats={STATS} progress={progress} />
            </>
          )}
        </PinAct>
      </div>

      {/* --- specimen -------------------------------------------------- */}
      <Section id="specimen" badge="Specimen" noRule>
        <SectionHead
          lines={['The parts, laid out', 'for *inspection*.']}
          sub="Palette, scale, tracking ladder and controls. If a value is not on this page it is not in the system."
        />

        <div className={s.specimen}>
          <div className={s.spec}>
            <Eyebrow track="head" className={s.specHead}>
              Palette
            </Eyebrow>
            <div className={s.swatches}>
              {PALETTE.map((entry) => (
                <div key={entry.token} className={s.swatch}>
                  <div
                    className={s.chip}
                    style={{ backgroundColor: `var(${entry.token})` }}
                  />
                  <Eyebrow tone="body" track="name" className={s.chipLabel}>
                    {entry.label}
                  </Eyebrow>
                  <span className={s.chipValue}>{entry.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={s.spec}>
            <Eyebrow track="head" className={s.specHead}>
              Type scale
            </Eyebrow>
            {SCALE.map((row) => (
              <div key={row.token} className={s.scaleRow}>
                <Eyebrow tone="muted" track="legal" className={s.scaleKey}>
                  {row.note}
                </Eyebrow>
                <span className={s.scaleSample} style={{ fontSize: row.size }}>
                  Half-suit
                </span>
              </div>
            ))}
          </div>

          <div className={s.spec}>
            <Eyebrow track="head" className={s.specHead}>
              Micro-label tracking
            </Eyebrow>
            <div className={s.rowStack}>
              {TRACKING.map((row) => (
                <Eyebrow key={row.track} tone="muted" track={row.track}>
                  {row.label}
                </Eyebrow>
              ))}
              <Eyebrow tone="accent" track="badge">
                Accent — this one is active
              </Eyebrow>
            </div>
          </div>

          <div className={s.spec}>
            <Eyebrow track="head" className={s.specHead}>
              Controls
            </Eyebrow>
            <div className={s.rowStack}>
              <div className={s.inline}>
                <Button>Amber</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="line">Line</Button>
                <Button variant="ghost" disabled>
                  Disabled
                </Button>
              </div>
              <div className={s.inline}>
                <TextLink href="#method">Text link</TextLink>
                <TextLink href="#roster">In-page anchor</TextLink>
              </div>
              <div className={s.inline}>
                <Eyebrow tone="muted" track="legal">
                  Arrows
                </Eyebrow>
                <Arrow direction="ne" />
                <Arrow direction="e" />
                <Arrow direction="sw" />
              </div>
              <Hairline variant="line" />
              <Hairline variant="soft" />
            </div>
          </div>
        </div>
      </Section>

      {/* --- method ---------------------------------------------------- */}
      <Section id="method" badge="Method">
        <SectionHead
          centre
          lines={['Duplicate deals, or', 'the result is *noise*.']}
          sub="Every pairing plays the same seeded deals from both sides, so a style is never credited for the cards it happened to be dealt. The engine is pure and deterministic: one seed, one byte-identical game."
        />
      </Section>

      {/* --- sign-off -------------------------------------------------- */}
      <Section id="sign-off" noMarks className={s.outro}>
        <InkPanel fig="FIG. 005 — The sign-off" live="Specimen · no data">
          <div className={inkPanelBody}>
            <MaskedLines
              lines={['Is there a best style,', 'or do they *counter* each other?']}
            />
            <div className={buttonRow}>
              <Button href="/lab#verdict" variant="ghost">
                The verdict, measured
              </Button>
            </div>
          </div>
          <p className={inkPanelNote}>
            If the payoff matrix is mostly transitive the lab names a best style. If it
            carries real cyclic energy there is not one, and the counter-structure is the
            finding. Both render paths existed before the data did; the answer the artifact
            actually gives is on the report, recomputed in the browser each time it loads.
          </p>
        </InkPanel>
      </Section>
    </LabShell>
  )
}

export default SystemDemo
