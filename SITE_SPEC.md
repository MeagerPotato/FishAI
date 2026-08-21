# SITE_SPEC.md — the Bot Lab site (`/lab`)

Functional and design specification for the simulation-results site. Reads one committed JSON
artifact; renders the style-spectrum research from [BOT_LAB.md](BOT_LAB.md) under the
[RULES_US54.md](RULES_US54.md) rule set.

**Design references**: pleurat.com for page architecture **and palette** (see §2 — the earlier
dark-felt constraint is void);
[cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) v2.6 for every
diagram. **All skinning uses the `--fa-*` tokens in [src/styles/tokens.css](src/styles/tokens.css)** — see §2.

---

## 1. Routes and page architecture

Three routes. One editorial long-scroll report plus two utility pages — mirroring pleurat's
structure, where the specimen sheet carries the argument and dense material lives one click away.

| Route | Character | Contents |
|---|---|---|
| **`/lab`** | The report. Long scroll, sticky-pin acts, the only place with a 3D surface. | Hero → the rule set (three.js deck assembly) → style roster → method → payoff matrix (pin act 1) → counter-graph (pin act 2) → verdict → exploitability → cross-play → sources |
| **`/lab/matrix`** | Dense data. No decoration. | Full N×N drill-down: every cell's CIs, sample size, BH q-value, and the whole §4.2 diagnostic table for both sides |
| **`/lab/replay/:id`** | Utility. | Replays a stored game through `reduce()` step by step, with the public log and per-seat counts |

Add to [src/App.tsx](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/App.tsx) via `React.lazy` (see §4.4). Widen the `active` union in
[AppShell.tsx:20](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/components/AppShell.tsx#L20) and add the nav `<Link>` at
[:32-40](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/components/AppShell.tsx#L32).

### 1.1 The honesty requirement

The site reports results for `us54`, which **is not what the live table at `/r/:code` plays** (that
stays `pagat48` — [RULES_US54.md §6](RULES_US54.md)). Every results page must state its rule set,
stamped from `meta.rulesHash`, and the site must refuse to render (with a clear message, not a blank
page) if the hash does not match the shipped `RULES_US54.md`.

---

## 2. Design system — pleurat's grammar and pleurat's skin

**This supersedes the dark-felt constraint that stood here.** FishAI is a standalone repository. The
felt/brass token set was copied in from the Canadian-Fish-Demo app by mistake, it belonged to a
different product, and it has been deleted — `src/styles/tokens.css` and `src/styles/global.css` were
rewritten from zero. The project owner asked for pleurat's visual design *and its colours*, so the
warm-paper palette is now the system rather than the forbidden thing.

**The palette.** Light is the default; dark is an explicit choice stored under `fa-theme` and applied
as `data-theme="dark"` on `<html>`. There is deliberately no `prefers-color-scheme` fallback — the
paper sheet is the reading surface the whole layout is built around.

| Role | Token | Light | Dark |
|---|---|---|---|
| Page ground | `--fa-page` | `#FFFCF0` | `#13120D` |
| Sheet | `--fa-sheet` | `#FFFDF3` | `#13120D` |
| Panel | `--fa-paper` / `--fa-paper-2` | `#FBF7E6` / `#F3EDD6` | `#17160E` / `#1F1C11` |
| Inset well | `--fa-tile` | `#EFE9D2` | `#221F13` |
| Ink | `--fa-ink` / `--fa-ink-2` / `--fa-ink-3` | `#16140E` / `#57534A` / `#6C685D` | `#F1EEE6` / `#A4A097` / `#928C7E` |
| Accent fill | `--fa-amber` | `#F3B44A` | `#F3B44A` |
| Accent text + focus ring | `--fa-amber-2` | `#935D07` | `#DD922F` |
| Hairlines | `--fa-line` / `--fa-line-2` / `--fa-frame` | 16% / 8% / 16% ink | 24% / 12% / 24% paper |

Two values differ from the reference sheet, both for contrast, both documented and reverted in one
line at [tokens.css §3.1](src/styles/tokens.css): `--fa-ink-3` (reference `#8B8577`, 3.62:1) and
`--fa-amber-2` (reference `#C77E0A`, 3.23:1). Both carry 10.5px text, which needs 4.5:1, and both
were re-derived against `--fa-tile` — the darkest light ground — not against the sheet.

**The typeface.** One family: **General Sans** (Fontshare) at **400 and 500 only**. The micro-label
voice is the same family shrunk to 10.5px and tracked 0.10–0.18em uppercase — it is made by shrinking
type, not by adding a family. Bodoni Moda, Instrument Sans and IBM Plex Mono are gone with the felt
tokens; `--fa-code` exists for data that must align by column and is otherwise unused.

**No radii anywhere.** Buttons, cards, tiles, badges and panels are square. The only round things in
the system are the nav's active-page dot and the theme toggle's hit area. After the crop marks this
is the strongest identity signal, and it is a review item.

### 2.1 What to adapt

| pleurat device | Implementation here |
|---|---|
| **The column rule** — `--fa-rule-x: max(gutter, calc(50% - max/2 + gutter))`. Build this first; everything else hangs off it. | Declared on `:root` in `tokens.css`. Because `50%` resolves against the *using* element, it lands on the sheet edge for anything full-bleed and collapses to exactly `--fa-gutter` inside a `.wrap`. Nav sheet, section badges, crop marks and footer brackets all anchor to it. |
| **Crop marks + hairlines at ~16% ink** | `--fa-frame` for page architecture (sheet edges, nav rule, section top rules), `--fa-line` / `--fa-line-2` for component chrome. Section top rules are **background-images**, not borders, so they stop at the gutter. |
| **The micro-label second voice** — 10.5px, uppercase, 0.10–0.18em | `<Eyebrow>`, with tone by *role* (`muted` passive, `accent` active/focal, `body` beside prose) and a five-step tracking ladder. |
| **Engineering-drawing copy** — the one borrowed device that carries real information | `FIG. 07 — PAYOFF MATRIX · 2,600 PAIRS · SE ≤ 0.005`; `RUN · style-v1 · rulesHash 4f2a…`; matrix cells addressed as `B3`. Badge copy stays sentence case and descriptive: `The roster`, `By the numbers`. |
| **Nav as a bounded sheet, not a full-bleed bar** | `<SiteNav>`. The bar is transparent; its ground and its bottom rule are pseudo-elements clipped to `--fa-rule-x`. No shadow, no blur, no scroll state. |
| **Exactly two sticky-pin scroll acts** | `<PinAct>`. A tall track whose height *is* the scrub length, with a `position: sticky` pin inside it; the hook only **reads** `getBoundingClientRect().top`. **IntersectionObserver + CSS transitions only** — no animation library, no canvas, no scroll hijack. Reduced motion and short viewports get a different **layout** (`flat`), not a disabled transition. |
| **Restraint as a measured budget** | Amber is a budget. Crop marks, badges and bar fills are free; accent **text** is spent on the verdict banner, the one focal matrix cell, and the highlighted cycle. **Nothing else.** This is a review checklist item, not a vibe. |

### 2.2 What to refuse

pleurat's bespoke `@keyframes` illustrations (the walking commuter, the self-drawing PCB traces, the
robot rig) and its 20-tile mosaic zoom-out. High maintenance, zero informational content here. The
*techniques* are in scope — stroke-dashoffset self-drawing, the reveal latch, the scrub — the
artwork is not.

## 3. Diagram system

Use diagram-design's **grammar** — geometry formulas, the six connector rules, complexity budgets,
the accessible-SVG contract, the 4px grid, one-accent discipline — and **re-skin the tokens only**.
The system is explicitly built for this: every type refers to tokens by semantic role, never by hex.

### 3.1 Token re-skin

The felt/brass mapping that stood here is void — those tokens no longer exist (see §2). Diagrams
skin to the `--fa-*` set, and they must read in **both** themes, so every role below refers to a
token, never to a hex.

| diagram-design role | This repo |
|---|---|
| `paper` | `--fa-sheet` |
| `paper-2` | `--fa-paper-2` |
| `ink` | `--fa-ink` |
| `muted` | `--fa-ink-2` |
| `soft` | `--fa-ink-3` |
| `rule` | `--fa-line-2` |
| `rule-solid` | `--fa-line` |
| `accent` | `--fa-amber` (fills, marks) |
| `accent-strong` | `--fa-amber-2` (accent text, focal labels) |
| `accent-tint` | `color-mix(in srgb, var(--fa-amber) 22%, transparent)` |
| serif / sans / mono | `--fa-sans` for all three; the mono voice is `--fa-sans` at `--fa-fs-micro` with 0.12–0.16em tracking, uppercase |

Series palette (multi-series charts only; accent stays reserved for the focal series): derive from
`--fa-ink-2` and `--fa-ink-3` plus hatch/dash patterns rather than inventing hues. This system has
**one** accent, and a five-colour series ramp would be a second palette.

**Three carry-overs that survive any re-skin:** never truncate a value axis; non-text marks need 3:1
contrast **carried by the boundary, not the accent fill**; and nothing gets a corner radius.

### 3.2 The five diagrams

| # | Visualization | diagram-design type | Budget forces out |
|---|---|---|---|
| 1 | **Payoff matrix** (8×8 score rates) | **DP security matrix**, verbatim geometry. **No arrows** — "cells emit no edges" is a hard rule. | 8 styles exceeds the 2–6 column cap → split into two 8×4 matrices, or a 6-style headline matrix with the full table below. Quantize score rate into the 4-level ink ramp **and** print the numeric SR in every cell so the encoding is redundant. Exactly **one** focal cell. `viewBox_w = 12+208+12+n·148+(n−1)·16+48`; `row_y(k)=140+40k`. |
| 2 | **Counter-graph** (who beats whom, cycles) | **Dependency graph** — built for multi-parent fan-in and cycles | Budget: 9 nodes / 14 edges / 4 ranks / **1** highlighted cycle / 2 accent elements. Eight styles fit exactly. The fan-in badge (`3 IN`, 28×12 rx=2) is mandatory and reads as "how many styles counter this one". Only one cycle may be accented; render others as muted forward edges. **This is the headline diagram whenever `verdict === 'cyclic'`.** |
| 3 | **Analysis pipeline** | **Data flow** (role-scoped), not Architecture | Lanes = Sim / Aggregate / Analyze / Site (4, at cap). Steps = Seed → Play → Record → Aggregate → Analyze → Emit (6, at cap). One focal step (Analyze); focal arrow labelled `style-results.json`. |
| 4 | **Turn + declare-window state machine** | **State machine** — and **split into two diagrams** (turn structure; clinch/endgame terminator) to stay under "transitions ≤ states × 2" | States 160×80 rx=8, name 14px/600, tag box `PHASE`. Turn loop = curved back-edge, dashed 5,4, labelled `MISS · TURN PASSES`. Spend the single accent on **declare resolution** — that is where the us54 rules bind. Every transition labelled `event [guard] / action`, ≤14 chars. |
| 5 | **Per-style metric charts** | **Bar** (one focal), **Line** (≤5 series), **Dumbbell** (style vs. Balanced control) — all on `0 0 1000 500`, margins L80/T40/R40/B60 so a row reads as one system | Bars pitch 110, width 72, 4–8 max. Dumbbell: connector declared first so dots cap it; hollow dot = control, solid accent = style. **Axis honesty is load-bearing on a research site** — floor/ceil from the data's range, never its observed extremes. State the sort order in the caption. |

### 3.3 Non-negotiables

Every diagram carries `role="img"` + `aria-labelledby`, `<title>` as the **literal first child before
`<defs>`**, slug-prefixed IDs so two inlined diagrams never collide, and a bottom legend strip (never
floating). Elbow connectors with r=8 quarter-arcs — **diagonals are an automatic fail**. Arrows drawn
before boxes. The 5-layer node box (opaque paper mask first, to stop arrows bleeding through).
Label masks with a 6–10px gap to the stroke.

Port `scripts/verify-geometry.py` and `self_check.py` as a **pre-commit gate** — hand-authored SVG
geometry is exactly the kind of thing that rots silently.

---

## 4. Three.js

**One surface. Possibly two. Everything else is refused.**

Every quantity this site reports is a 2D matrix, a directed graph, or a scalar per style — all of
which 3D makes *worse* through occlusion.

### 4.1 Ship: the deck assembly (hero)

A 54-card deck separating into 9 half-suits of 6, the 9th (four 8s + two jokers) resolving last.
It earns its place because cards are physical objects, the deck composition **is** the single most
distinctive rule in this project, and it teaches the fact the whole site depends on.

Scroll-scrubbed, no autoplay. Static SVG fallback. `React.lazy` + `Suspense`. `prefers-reduced-motion`
honored **in JS** — [global.css](src/styles/global.css)'s reduced-motion block and its `!important` does nothing to a
WebGL loop. **If it does not teach the 9-set structure, it does not ship.**

### 4.2 Conditional: the featured replay table

A 6-seat table replaying one hand-picked game with ask/hit/miss arcs between seats. Ships **only** if
it shows something [TableFelt.tsx](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/components/TableFelt.tsx) cannot — simultaneous turn flow
*and* per-seat belief state. If it degenerates into "the CSS table but tilted," refuse it;
`seatRing()` at [viewmodels/table.ts:24](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/viewmodels/table.ts#L24) already supplies seat angles.

### 4.3 Refuse explicitly

3D payoff surface (bars occlude; non-adjacent cells become incomparable — **the matrix is a matrix**)
· 3D bars for any metric · a 3D belief cube (6 seats × 9 sets × probability — a 2D heatmap with a
wasted axis) · camera fly-through of the counter-graph · particle backgrounds · floating card
confetti · 3D text · a WebGL felt replacing the CSS gradient.

### 4.4 Engineering constraints — non-negotiable

- **React 19.2.8 → `@react-three/fiber` ^9 + `@react-three/drei` ^10.** R3F v8 does not support
  React 19.
- **Bundle.** Today `dist/assets/index-*.js` is **615 KB raw / 180 KB gzip in one chunk** —
  [App.tsx:5-12](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/App.tsx#L5) statically imports every page and `vite.config.ts` has no `build`
  key. A static `three` import doubles-to-triples gzip **for every visitor of `/` and `/r/:code`**.
  `React.lazy()` is the only mechanism that emits a separate chunk under current defaults.
  [vercel.json:8](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/vercel.json#L8) already excludes `/assets/` from the SPA rewrite, so lazy chunks
  resolve.
- **Lint is the hard gate.** `eslint . --max-warnings 0`, with
  [eslint.config.js:19-22](eslint.config.js:19) applying react-hooks 7.1.1 `recommended-latest` — the
  full React Compiler rule set. Idiomatic R3F trips several. **Budget a scoped
  `files: ['src/lab/three/**']` override**; do not assume it lints clean.
- **`tsc -b` failures fail the Vercel deploy**, not just CI — `vercel.json` declares no
  `buildCommand`, so Vercel runs `npm run build` = `tsc -b && vite build`.
- **Vitest cannot test 3D as configured** — no jsdom, no setup file. Keep all math in pure modules
  so the Node-environment suite still covers it.
- **StrictMode is on** ([main.tsx:7](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/src/main.tsx#L7)) → effects double-invoke in dev; disposal must
  be correct. Playwright runs SwiftShader — **no pixel assertions on canvas**.

---

## 5. Data contract

Schema is [BOT_LAB.md §7.1](BOT_LAB.md). Two deltas for `us54`:

- `voidRate` → **`concedeRate`**. Under [RULES_US54.md](RULES_US54.md) row 14 the void outcome is
  abolished, so the "burn" metric is replaced by a "gift" metric. This is not a rename — it measures
  a different event, and pre-/post-decision matrices are **not comparable**.
- `ties` is retained in the schema but is **always 0** under `us54` (ties are arithmetically
  impossible — [RULES_US54.md §5](RULES_US54.md)). The site should assert this rather than render a
  tie column that can never populate.

**Serving.** Do **not** place the artifact at the dist root — [vercel.json:8](https://github.com/MeagerPotato/Canadian-Fish-Demo/blob/main/vercel.json#L8)
whitelists only `/api/` and `/assets/`, and no `public/` dir exists. Put it at
`src/lab/data/style-results.json` and **import it**, so Vite emits it under `/assets/`.

**Build order.** The site is built against a committed fixture that satisfies the schema, then the
fixture is swapped for real simulator output. The fixture must include one `cyclic` and one
`dominant` verdict case so both render paths are exercised before real data exists.

---

## 6. Definition of done

`npm test` green (192 baseline + all new) · `npm run typecheck` 0 · `npm run lint` 0 warnings ·
`npm run build` green · no horizontal scroll at 375/390/768/1280 · zero console errors on every
route · every diagram passes the geometry check · keyboard-operable throughout · the accent budget
audit (§2.1) passes · the three.js surface teaches the 9-set structure or is cut · initial JS for
`/` and `/r/:code` is **not** larger than today.
