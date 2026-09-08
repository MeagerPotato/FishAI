/**
 * probe-clone-errors.mjs - MONET.md 3.8af's instrument: where a fitted ask clone (scripts/fit-imitation.mjs) still
 * disagrees with SESTINA, read on held-out bridge records with the true deal known. At every SESTINA ask decision
 * (a sample of the holdout files) the stack's ranking and features are rebuilt as the clone sees them, the clone's
 * choice is taken by the engine's own `chooseAskByModel`, and the two choices are compared: the same ask, the same
 * half-suit at another seat or card, or another half-suit; which of the two would have hit on the true deal; the
 * clone's rank of SESTINA's ask; the certain-hit decisions (available, taken, declined) and what SESTINA asks
 * instead; the split by the game's progress and by hand size.
 *
 *     node scripts/probe-clone-errors.mjs --records <dir>[,<dir>...] --model <fit.json> [--sample 0.02] [--holdout-mod 5]
 *          [--max-files N] [--version v0.9] [--override <json>] [--sample-salt s] [--out summary.json]
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENG = await import(pathToFileURL(join(ROOT, 'lib/engine/index.ts')).href)
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)
const MON = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/monet.ts')).href)
const CARDS = await import(pathToFileURL(join(ROOT, 'lib/engine/cards.ts')).href)
const REC = await import(pathToFileURL(join(ROOT, 'scripts/bridge-records.mjs')).href)
const { hashSeed } = ENG

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const DIRS = argOf('--records', '').split(',').filter(Boolean)
const MODEL = argOf('--model', '')
const MAXF = Number(argOf('--max-files', 0))
const SAMPLE = Number(argOf('--sample', 0.02))
const HOLD = Number(argOf('--holdout-mod', 5))
const VERSION = argOf('--version', 'v0.9')
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const SALT = argOf('--sample-salt', '')
const OUT = argOf('--out', '')
const SPEC_B = argOf('--spec-b', 'v07:r12=25,rtie=1,pool=-1,oppfloor=-1,force=1000000,askfloor=-1,stall=12,s1=1,det=12,cand=4,kappa=2.5,rbelief=indep,depth=12,maxq=26')
if (DIRS.length === 0 || !MODEL) {
  console.error('--records and --model are required')
  process.exit(2)
}
const pol0 = MON.monetPolicy(VERSION)
const pol = OVER ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...OVER }) }) : pol0
const { skill, style } = BOTS.resolvePolicy(pol)
const marginal = style.pModel === 'marginal'
const KOPTS = { logWindow: skill.logWindow, useConstraints: skill.useConstraints, marginal, choiceKappa: marginal ? style.choiceKappa : undefined, choiceAdapt: marginal ? style.choiceAdapt : undefined, choicePrior: marginal ? style.choicePrior : undefined }
BOTS.registerAskModel('probe-clone', JSON.parse(fs.readFileSync(MODEL, 'utf8')))
const M = BOTS.askModelOf('probe-clone')
const F = Object.fromEntries(BOTS.ASK_FEATURES.map((n, i) => [n, i]))
const uniform = (key) => (hashSeed(key)() >>> 0) / 4294967296

let files = []
let skipped = 0
for (const d of DIRS) for (const f of REC.recordFiles(d)) { const h = REC.readHeader(f); if (h.specB !== SPEC_B || !String(h.specA).startsWith('bot:')) { skipped++; continue } files.push(f) }
const holdoutFiles = files.filter((_, fi) => fi % HOLD === 0)
const useFiles = MAXF > 0 ? holdoutFiles.slice(0, MAXF) : holdoutFiles

const S = {
  n: 0, agree: 0, sameBookSameTarget: 0, sameBookDiffTarget: 0, diffBook: 0,
  hitS: 0, hitM: 0, disHitS: 0, disHitM: 0, disPS: 0, disPM: 0,
  rankTop: [0, 0, 0, 0, 0], // the clone's rank of SESTINA's ask: 1, 2, 3, 4-5, 6+
  certAvail: 0, certS: 0, certM: 0, certBoth: 0, certSonly: 0, certMonly: 0,
  declS: { n: 0, p: 0, hit: 0, mHit: 0, bookMe: 0, bookMate: 0, bookThem: 0, gamble: 0, lastTarget: 0, ownHeld: 0, mAgree: 0 },
  byProgress: [0, 1, 2].map(() => ({ n: 0, agree: 0 })),
  byHand: [0, 1, 2].map(() => ({ n: 0, agree: 0 })),
  byLegal: [0, 1, 2, 3].map(() => ({ n: 0, agree: 0 })), // legal asks: <=20, 21-45, 46-80, 81+
  ourAgree: 0,
  // the same half-suit at the same seat, another card: the card's index within the half-suit (the engine's order)
  cardLowerS: 0, cardHigherS: 0, cardSameP: 0, sLowestLegal: 0, sLowestN: 0, mLowestLegal: 0, sHighestLegal: 0, randomLowest: 0, sSamePAll: 0,
}
const t0 = Date.now()
let games = 0
for (let fi = 0; fi < useFiles.length; fi++) {
  for (const rec of REC.readRecordFile(useFiles[fi])) {
    games++
    REC.walkAsks(rec, ({ i, ev, view, hands }) => {
      const isSestina = (ev.asker % 2) !== rec.teamA
      if (!isSestina) return
      if (SAMPLE < 1 && uniform(`${rec.label}:${i}:sample${SALT ? ':' + SALT : ''}`) >= SAMPLE) return
      const k = BOTS.buildKnowledge(view, KOPTS)
      const ranked = BOTS.rankAsksWith(view, k, style)
      const cs = ranked.findIndex((r) => r.target === ev.target && r.card === ev.card)
      if (cs < 0) return
      const feats = BOTS.askFeatureRows(view, k, ranked)
      const scores = BOTS.scoreAsks(M, view, k, ranked)
      const mAsk = BOTS.chooseAskByModel(M, view, k, ranked)
      const cm = ranked.findIndex((r) => r.target === mAsk.target && r.card === mAsk.card)
      const holder = (card) => hands.findIndex((h) => h.includes(card))
      const hitS = ev.hit
      const hitM = holder(ranked[cm].card) === ranked[cm].target
      const agree = cm === cs
      S.n++
      if (agree) S.agree++
      const bookS = CARDS.cardBook(ranked[cs].card), bookM = CARDS.cardBook(ranked[cm].card)
      if (!agree) {
        if (bookS === bookM && ranked[cs].target === ranked[cm].target) {
          S.sameBookSameTarget++
          const order = CARDS.bookCards(bookS, ENG.us54Config)
          const iS = order.indexOf(ranked[cs].card), iM = order.indexOf(ranked[cm].card)
          if (iS < iM) S.cardLowerS++; else S.cardHigherS++
          if (Math.abs(feats[cs][F.p] - feats[cm][F.p]) < 1e-9) S.cardSameP++
        }
        else if (bookS === bookM) S.sameBookDiffTarget++
        else S.diffBook++
        if (hitS) S.disHitS++
        if (hitM) S.disHitM++
        S.disPS += feats[cs][F.p]; S.disPM += feats[cm][F.p]
      }
      if (hitS) S.hitS++
      if (hitM) S.hitM++
      // among the legal asks of SESTINA's half-suit at its target, is its card the lowest in the engine's order?
      {
        const order = CARDS.bookCards(bookS, ENG.us54Config)
        const legalIdx = ranked.filter((r) => r.target === ranked[cs].target && CARDS.cardBook(r.card) === bookS).map((r) => order.indexOf(r.card))
        if (legalIdx.length > 1) { S.sLowestN++; S.randomLowest += 1 / legalIdx.length; if (order.indexOf(ranked[cs].card) === Math.max(...legalIdx)) S.sHighestLegal++; { const ps = ranked.filter((r) => r.target === ranked[cs].target && CARDS.cardBook(r.card) === bookS).map((r, j) => feats[ranked.indexOf(r)][F.p]); if (ps.every((p) => Math.abs(p - ps[0]) < 1e-9)) S.sSamePAll++ } if (order.indexOf(ranked[cs].card) === Math.min(...legalIdx)) S.sLowestLegal++; if (order.indexOf(ranked[cm].card) === Math.min(...legalIdx) && bookM === bookS && ranked[cm].target === ranked[cs].target) S.mLowestLegal++ }
      }
      // the clone's rank of SESTINA's ask
      let rank = 1
      for (let j = 0; j < scores.length; j++) if (scores[j] > scores[cs]) rank++
      S.rankTop[rank === 1 ? 0 : rank === 2 ? 1 : rank === 3 ? 2 : rank <= 5 ? 3 : 4]++
      // certain hits
      const anyCert = feats.some((f) => f[F.certain] > 0.5)
      if (anyCert) {
        S.certAvail++
        const sCert = feats[cs][F.certain] > 0.5, mCert = feats[cm][F.certain] > 0.5
        if (sCert) S.certS++
        if (mCert) S.certM++
        if (sCert && mCert) S.certBoth++
        if (sCert && !mCert) S.certSonly++
        if (!sCert && mCert) S.certMonly++
        if (!sCert) {
          const d = S.declS
          d.n++; d.p += feats[cs][F.p]; if (hitS) d.hit++; if (hitM) d.mHit++
          if (feats[cs][F.bookAskedByMe] > 0.5) d.bookMe++
          if (feats[cs][F.bookAskedByMate] > 0.5) d.bookMate++
          if (feats[cs][F.bookAskedByThem] > 0.5) d.bookThem++
          if (feats[cs][F.gamble] > 0.5) d.gamble++
          if (feats[cs][F.lastTargetSame] > 0.5) d.lastTarget++
          d.ownHeld += feats[cs][F.ownHeld]
          if (agree) d.mAgree++
        }
      }
      const prog = feats[cs][F.progress]
      const bp = S.byProgress[prog < 1 / 3 ? 0 : prog < 2 / 3 ? 1 : 2]; bp.n++; if (agree) bp.agree++
      const hand = hands[ev.asker].length
      const bh = S.byHand[hand <= 3 ? 0 : hand <= 6 ? 1 : 2]; bh.n++; if (agree) bh.agree++
      const L = ranked.length
      const bl = S.byLegal[L <= 20 ? 0 : L <= 45 ? 1 : L <= 80 ? 2 : 3]; bl.n++; if (agree) bl.agree++
    })
  }
  if ((fi + 1) % 5 === 0) console.error(`  ${fi + 1}/${useFiles.length} files, ${S.n} decisions, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}
const pct = (a, b) => (b ? (100 * a / b).toFixed(2) + '%' : '-')
const out = []
out.push(`probe-clone-errors: ${useFiles.length} holdout files of ${files.length} (${skipped} skipped), ${games} games, ${S.n} SESTINA decisions (sample ${SAMPLE}), model ${MODEL.split(/[\\/]/).pop()}`)
out.push(`agree ${pct(S.agree, S.n)}; disagree: same half-suit & target (another card) ${pct(S.sameBookSameTarget, S.n)}, same half-suit another seat ${pct(S.sameBookDiffTarget, S.n)}, another half-suit ${pct(S.diffBook, S.n)}`)
const dis = S.n - S.agree
out.push(`on disagreements (${dis}): SESTINA's ask hits ${pct(S.disHitS, dis)} at belief p ${(S.disPS / Math.max(1, dis)).toFixed(3)}; the clone's ask hits ${pct(S.disHitM, dis)} at p ${(S.disPM / Math.max(1, dis)).toFixed(3)}; over all decisions SESTINA hits ${pct(S.hitS, S.n)}, the clone's choice would hit ${pct(S.hitM, S.n)}`)
out.push(`the same half-suit and seat as SESTINA (the card aside): ${pct(S.agree + S.sameBookSameTarget, S.n)}`)
out.push(`same half-suit & seat, another card (${S.sameBookSameTarget}): SESTINA's card lower in the half-suit's order ${pct(S.cardLowerS, S.sameBookSameTarget)}, higher ${pct(S.cardHigherS, S.sameBookSameTarget)}; the two cards at the same belief p ${pct(S.cardSameP, S.sameBookSameTarget)}. Where more than one card of its half-suit is legal at its target (${S.sLowestN}): SESTINA asks the lowest ${pct(S.sLowestLegal, S.sLowestN)} and the highest ${pct(S.sHighestLegal, S.sLowestN)} against a random pick's ${pct(S.randomLowest, S.sLowestN)}; the clone the lowest ${pct(S.mLowestLegal, S.sLowestN)}; every legal card of that half-suit at that seat at the same belief p in ${pct(S.sSamePAll, S.sLowestN)} of them`)
out.push(`the clone's rank of SESTINA's ask: 1st ${pct(S.rankTop[0], S.n)}, 2nd ${pct(S.rankTop[1], S.n)}, 3rd ${pct(S.rankTop[2], S.n)}, 4th-5th ${pct(S.rankTop[3], S.n)}, 6th+ ${pct(S.rankTop[4], S.n)}`)
out.push(`certain hit on the table at ${pct(S.certAvail, S.n)} of decisions: SESTINA takes one ${pct(S.certS, S.certAvail)}, the clone ${pct(S.certM, S.certAvail)}; both ${pct(S.certBoth, S.certAvail)}, SESTINA only ${pct(S.certSonly, S.certAvail)}, the clone only ${pct(S.certMonly, S.certAvail)}`)
const d = S.declS
out.push(`when SESTINA declines a certain hit (${d.n}): its ask hits ${pct(d.hit, d.n)} at p ${(d.p / Math.max(1, d.n)).toFixed(3)}; into a half-suit it asked before ${pct(d.bookMe, d.n)}, its partner asked ${pct(d.bookMate, d.n)}, an opponent asked ${pct(d.bookThem, d.n)}; a gamble ${pct(d.gamble, d.n)}; the last target again ${pct(d.lastTarget, d.n)}; own cards of the half-suit ${(d.ownHeld / Math.max(1, d.n)).toFixed(2)}; the clone agrees ${pct(d.mAgree, d.n)} and its choice hits ${pct(d.mHit, d.n)}`)
out.push(`agreement by progress: early ${pct(S.byProgress[0].agree, S.byProgress[0].n)} (${S.byProgress[0].n}), mid ${pct(S.byProgress[1].agree, S.byProgress[1].n)} (${S.byProgress[1].n}), late ${pct(S.byProgress[2].agree, S.byProgress[2].n)} (${S.byProgress[2].n})`)
out.push(`agreement by hand size: 1-3 ${pct(S.byHand[0].agree, S.byHand[0].n)} (${S.byHand[0].n}), 4-6 ${pct(S.byHand[1].agree, S.byHand[1].n)} (${S.byHand[1].n}), 7+ ${pct(S.byHand[2].agree, S.byHand[2].n)} (${S.byHand[2].n})`)
out.push(`agreement by legal asks: <=20 ${pct(S.byLegal[0].agree, S.byLegal[0].n)} (${S.byLegal[0].n}), 21-45 ${pct(S.byLegal[1].agree, S.byLegal[1].n)} (${S.byLegal[1].n}), 46-80 ${pct(S.byLegal[2].agree, S.byLegal[2].n)} (${S.byLegal[2].n}), 81+ ${pct(S.byLegal[3].agree, S.byLegal[3].n)} (${S.byLegal[3].n})`)
console.log(out.join('\n'))
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ files: useFiles.length, games, model: MODEL, stats: S }, null, 1))
