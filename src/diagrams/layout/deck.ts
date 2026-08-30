/**
 * DECK ASSEMBLY — 54 cards separating into 9 sets of 6.
 *
 * The single most distinctive rule in this project, and the fact the whole
 * site depends on: under RULES_US54 the deck is 54 cards (the standard 52
 * with the 8s kept in, plus two distinguishable jokers) and it partitions
 * into NINE half-suits of six — eight suit halves plus one EIGHTS set of
 * `8C 8D 8H 8S XR XB`.
 *
 * Built with pleurat's self-drawing technique — stroke-dashoffset plus CSS
 * keyframes, staggered per column — and NOT with WebGL. There is no rAF
 * loop, no canvas, and no animation library; `prefers-reduced-motion` lands
 * on the finished frame, which is the real diagram.
 *
 * The teaching test the brief sets: if it does not teach the 9-set
 * structure, it does not ship. It teaches it four ways at once — nine
 * labelled columns, every one of the 54 cards named, a per-column count of
 * 6, and the arithmetic printed as `54 = 9 x 6`.
 */

import type { Scene, SceneRect } from '../scene'
import { C } from '../tokens'

const CARD_W = 56
const CARD_H = 32
const CARD_GAP = 8
const COL_W = 72
const COL_PITCH = 84
const COL_X0 = 40
const COL_Y = 96
const COL_H = 248
const ROW_STRIDE = 40
const RULE_Y = 48

export interface DeckCard {
  id: string
  /** Printed face, e.g. `2C`, `XR`. */
  face: string
  x: number
  y: number
  w: number
  h: number
  /** Animation order, so the reveal reads column by column. */
  order: number
}

export interface DeckSet {
  id: string
  /** `LOW` / `HIGH` / `EIGHTS`. */
  kind: string
  /** Suit glyph, or `+ JOKERS`. */
  qualifier: string
  x: number
  y: number
  w: number
  h: number
  /** Path length of the column boundary, for stroke-dashoffset. */
  perimeter: number
  accent: boolean
  cards: DeckCard[]
}

export interface DeckModel {
  scene: Scene
  sets: DeckSet[]
  ruleY: number
  /** Baselines for the per-column count row. */
  countY: number
  countLabelY: number
  /** The arithmetic readout, the second and last accent element. */
  arithmetic: string
}

const SUITS: Array<{ code: string; glyph: string }> = [
  { code: 'C', glyph: '♣' },
  { code: 'D', glyph: '♦' },
  { code: 'H', glyph: '♥' },
  { code: 'S', glyph: '♠' },
]

const LOW_RANKS = ['2', '3', '4', '5', '6', '7']
const HIGH_RANKS = ['9', 'T', 'J', 'Q', 'K', 'A']

export function layoutDeck(figNo = 'FIG. 01'): DeckModel {
  const specs: Array<{ id: string; kind: string; qualifier: string; faces: string[] }> = []

  for (const suit of SUITS) {
    specs.push({
      id: `LOW-${suit.code}`,
      kind: 'LOW',
      qualifier: suit.glyph,
      faces: LOW_RANKS.map((r) => `${r}${suit.glyph}`),
    })
    specs.push({
      id: `HIGH-${suit.code}`,
      kind: 'HIGH',
      qualifier: suit.glyph,
      faces: HIGH_RANKS.map((r) => `${r}${suit.glyph}`),
    })
  }
  // The ninth set, and the reason the deck is 54 rather than 52.
  specs.push({
    id: 'EIGHTS',
    kind: 'EIGHTS',
    qualifier: '+ JOKERS',
    faces: ['8♣', '8♦', '8♥', '8♠', 'XR', 'XB'],
  })

  if (specs.length !== 9) throw new Error(`deck: ${specs.length} sets, us54 has exactly 9`)

  const sets: DeckSet[] = specs.map((s, j) => {
    const x = COL_X0 + j * COL_PITCH
    const accent = s.id === 'EIGHTS'
    if (s.faces.length !== 6) throw new Error(`deck: set ${s.id} has ${s.faces.length} cards, not 6`)
    return {
      id: s.id,
      kind: s.kind,
      qualifier: s.qualifier,
      x,
      y: COL_Y,
      w: COL_W,
      h: COL_H,
      perimeter: 2 * (COL_W + COL_H),
      accent,
      cards: s.faces.map((face, r) => ({
        id: `${s.id}-${r}`,
        face,
        x: x + CARD_GAP,
        y: COL_Y + CARD_GAP + r * ROW_STRIDE,
        w: CARD_W,
        h: CARD_H,
        order: j * 6 + r,
      })),
    }
  })

  const totalCards = sets.reduce((n, s) => n + s.cards.length, 0)
  if (totalCards !== 54) throw new Error(`deck: ${totalCards} cards, us54 deals 54`)

  const lastX = sets[sets.length - 1].x + COL_W
  const viewW = lastX + COL_X0
  const countY = COL_Y + COL_H + 16
  const countLabelY = countY + 16
  const legendY = 400
  const viewH = legendY + 48

  const rects: SceneRect[] = [
    ...sets.map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h })),
    ...sets.flatMap((s) => s.cards.map((c) => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h }))),
  ]

  const scene: Scene = {
    slug: 'deck-assembly',
    title: 'The 54-card deck separating into nine half-suits of six',
    desc:
      'Nine columns of six cards each. Eight columns are the suit halves — low is two through ' +
      'seven, high is nine through ace, in clubs, diamonds, hearts and spades. The ninth ' +
      'column, highlighted, is the eights set: the four eights plus the red and black jokers. ' +
      'Nine sets of six is fifty-four cards, dealt nine each to six seats.',
    viewW,
    viewH,
    budget: { nodes: sets.length, arrows: 0, accents: 2 },
    rects,
    arrows: [],
    legendY,
    legend: [
      { key: 'suit', label: 'SUIT HALF-SUIT x 8', mark: 'swatch', fill: C.sheet, stroke: C.ink },
      { key: 'eights', label: 'EIGHTS + JOKERS x 1', mark: 'swatch', fill: C.accentTint, stroke: C.accent },
      { key: 'count', label: '6 CARDS PER SET', mark: 'line', stroke: C.rule },
    ],
    fontSizes: [12, 16],
    fig: `${figNo} — DECK ASSEMBLY · 54 CARDS · 9 SETS OF 6`,
    caption:
      'The 48-card default drops the eights and plays eight sets. us54 keeps them and adds two ' +
      'distinguishable jokers (XR red, XB black — never JR/JB, which the engine would parse as ' +
      'rank Jack), making a ninth set. Inside EIGHTS the ask licence is uniform: holding ANY ' +
      'eight, or either joker, lets you ask for any other card in the set. All 54 are dealt, ' +
      'nine to each of six seats, and the game ends the moment a team is awarded its fifth set.',
  }

  return {
    scene,
    sets,
    ruleY: RULE_Y,
    countY,
    countLabelY,
    arithmetic: '54 = 9 × 6',
  }
}
