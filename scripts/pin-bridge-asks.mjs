/**
 * pin-bridge-asks.mjs - the in-engine pin of a bridge arm's asks (MONET.md 3.8ay). Every ask our side made in the
 * given records is rebuilt as the asking seat's own view by bridge-records.mjs's walk and decided again by the arm's
 * own policy; the pin holds when every replayed decision is the recorded ask. SESTINA's asks are not ours to
 * reproduce and are not read.
 *
 *   node scripts/pin-bridge-asks.mjs --records <dir|file> [--prefix p] [--version v0.33] [--override <json>]
 *        [--advantage-model <file>] [--show 12]
 *
 * --advantage-model registers an ask-advantage model under its file's own name before any decision, as the v0.53
 * arm does, so an --override naming that file plays it. The exit code is 0 only when the agreement is total; a
 * mutation run (the arm's records replayed without its knob) is expected to exit 1 and is read by its count.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as REC from './bridge-records.mjs'

const ENG = await import(pathToFileURL(process.cwd() + '/lib/engine/index.ts').href)
const BOTS = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/index.ts').href)
const MON = await import(pathToFileURL(process.cwd() + '/lib/engine/bots/monet.ts').href)

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const RECORDS = argOf('--records', '')
const PREFIX = argOf('--prefix', '')
const VERSION = argOf('--version', 'v0.33')
const OVER = argOf('--override', '') ? JSON.parse(argOf('--override', '')) : null
const ADV = argOf('--advantage-model', '')
const SHOW = Number(argOf('--show', 12))
if (!RECORDS) {
  console.error('usage: node scripts/pin-bridge-asks.mjs --records <dir|file> [--prefix p] [--version v0.33] [--override <json>] [--advantage-model <file>] [--show 12]')
  process.exit(2)
}
if (ADV) BOTS.registerAskAdvantageModel(path.basename(ADV), JSON.parse(fs.readFileSync(ADV, 'utf8')))
const pol0 = MON.monetPolicy(VERSION)
const POL = OVER ? Object.freeze({ skill: pol0.skill, style: Object.freeze({ ...pol0.style, ...OVER }) }) : pol0

const files = REC.recordFiles(RECORDS, PREFIX)
if (files.length === 0) throw new Error(`no record files under ${RECORDS} with the prefix "${PREFIX}"`)
const t0 = Date.now()
let games = 0
let n = 0
let agree = 0
let notAsk = 0
const shown = []
for (const rec of REC.readRecords(RECORDS, PREFIX)) {
  games++
  REC.walkAsks(rec, ({ i, ev, view }) => {
    if (ev.asker % 2 !== rec.teamA) return
    n++
    const a = ENG.decide(view, POL, ENG.hashSeed(`${rec.label}:pin:${i}`)())
    if (a.type === 'ask' && a.card === ev.card && a.target === ev.target) {
      agree++
      return
    }
    if (a.type !== 'ask') notAsk++
    if (shown.length < SHOW) shown.push(`  ${rec.label} event ${i}: recorded ${ev.card} at seat ${ev.target}, replayed ${a.type === 'ask' ? `${a.card} at seat ${a.target}` : a.type}`)
  })
}
const held = n > 0 && agree === n
const policy = `${VERSION}${OVER ? ` + ${JSON.stringify(OVER)}` : ''}${ADV ? ` (advantage model ${path.basename(ADV)} registered)` : ''}`
console.log(`pin-bridge-asks: ${files.length} file(s), ${games} games, ${n} of our ask decisions replayed by ${policy}, ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log(`  agree ${agree} of ${n} (${n > 0 ? ((100 * agree) / n).toFixed(3) : '-'}%), differ ${n - agree} (not an ask ${notAsk})`)
for (const s of shown) console.log(s)
console.log(held ? 'PIN HOLDS' : 'PIN FAILS')
process.exitCode = held ? 0 : 1
