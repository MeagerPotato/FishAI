/**
 * gen-ask-model-module.mjs - MONET.md 3.8ac: write a fitted ask model (scripts/fit-imitation.mjs's JSON) as a
 * committed, typechecked data module the registry can register at load - `lib/engine/bots/data/<name>.ts`,
 * exporting a frozen `DenseModel` and the fit's provenance (its meta: the data files, the decisions, the
 * holdout agreement and the baselines it was read against). Generated: do not edit by hand.
 *
 *     node scripts/gen-ask-model-module.mjs --model models/v30-mlp64.json --name sestina-clone --export SESTINA_CLONE
 *     node scripts/gen-ask-model-module.mjs --model models/v33-f3.json --name sestina-clone-3 --export SESTINA_CLONE_3 --section 3.8af
 *     node scripts/gen-ask-model-module.mjs --model adv-2.json --name adv-2 --export ASK_ADVANTAGE_2 --section 3.8ax
 *
 * An ask ADVANTAGE model (scripts/fit-ask-advantage.mjs, MONET.md 3.8aw-3.8ay) is told by its meta.kind and written with
 * its own header, as `registerAskAdvantageModel` takes it; its `data` paths are left out beside the clone's `files`.
 */
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import fs from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BOTS = await import(pathToFileURL(join(ROOT, 'lib/engine/bots/index.ts')).href)

function argOf(flag, dflt) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt
}
const MODEL = argOf('--model', '')
const NAME = argOf('--name', 'sestina-clone')
const EXPORT = argOf('--export', 'SESTINA_CLONE')
// the MONET.md section whose fit this is: 3.8ac fitted the first clone (33 features), 3.8af the second (49)
const SECTION = argOf('--section', '3.8ac')
if (!MODEL) {
  console.error('--model is required')
  process.exit(2)
}
const text = fs.readFileSync(MODEL, 'utf8')
const model = JSON.parse(text)
const md5 = createHash('md5').update(text).digest('hex')
const meta = model.meta ?? {}
// MONET.md 3.8ay: an ask ADVANTAGE model (scripts/fit-ask-advantage.mjs's JSON, meta.kind 'ask-advantage') is written the
// same way, with its own width, header and registration; its feature names must be ASK_ADVANTAGE_FEATURES in order
const ADVANTAGE = meta.kind === 'ask-advantage'
// the engine must accept it before it is written as data
const SET = model.features === BOTS.ASK_FEATURE_COUNT_2 ? 2 : 1
if (ADVANTAGE) {
  BOTS.compileNet(model, BOTS.ASK_ADVANTAGE_FEATURE_COUNT, 1)
  if (JSON.stringify(meta.featureNames) !== JSON.stringify([...BOTS.ASK_ADVANTAGE_FEATURES])) {
    console.error('the model was not fitted on ASK_ADVANTAGE_FEATURES, in that order')
    process.exit(2)
  }
} else BOTS.compileNet(model, BOTS.askFeatureCount(SET), 1)
const num = (v) => (typeof v === 'number' ? Number(v.toPrecision(9)) : v)
const layers = model.layers.map((l) => `    Object.freeze({ w: Object.freeze([${l.w.map(num).join(', ')}]), b: Object.freeze([${l.b.map(num).join(', ')}]) })`).join(',\n')
const q = (v, d) => (typeof v === 'number' ? v.toFixed(d) : '?')
const header = ADVANTAGE
  ? ` * Do not edit by hand; re-fit (scripts/fit-ask-advantage.mjs) and re-run the generator.
 *
 * MONET.md §${SECTION} — the learned ask advantage: a score over one legal ask (lib/engine/bots/imitation.ts,
 * \`chooseAskByAdvantage\`) fitted on pairs of play-outs from the true deal, the clone's ask and an alternative
 * rolled out to the end under one key, so that the difference of two asks' scores predicts the difference in the
 * asking team's final ${meta.target === 'win' ? 'result' : 'set differential'}; over the ${model.features} features of \`ASK_ADVANTAGE_FEATURES\` (the clone's forty-nine and its
 * opinion of each ask), ${Array.isArray(meta.hidden) && meta.hidden.length > 0 ? `an MLP of ${JSON.stringify(meta.hidden)} ReLU units` : 'a linear scorer'}.
 * Provenance: ${meta.pairs ?? '?'} pairs at ${meta.decisions ?? '?'} decisions of ${meta.games ?? '?'} self-play games (${meta.train ?? '?'} training, ${meta.holdout ?? '?'} held out by
 * game, every game 0 mod ${meta.holdoutMod ?? '?'}), ${meta.epochs ?? '?'} epochs (epoch ${meta.kept ?? '?'} kept, the lowest holdout MSE), seed ${meta.seed ?? '?'}; holdout MSE
 * ${q(meta.holdoutMse?.mlp, 4)} against the clone baseline's ${q(meta.holdoutMse?.clone, 4)}, the linear model's ${q(meta.holdoutMse?.linear, 4)} and zero's ${q(meta.holdoutMse?.zero, 4)} (gate B1: lower
 * than the clone's by ${q(meta.gateB1?.mean, 4)}, SE ${q(meta.gateB1?.se, 4)}, z ${q(meta.gateB1?.z, 2)}). Source file md5 ${md5}.
 * Frozen numeric data plus the DenseModel type from './../net.ts'; nothing in it takes a view.
 */
import type { DenseModel } from '../net.ts'

/** The fitted model, as \`registerAskAdvantageModel('${NAME}', ${EXPORT})\` takes it. */`
  : ` * Do not edit by hand; re-fit (scripts/fit-imitation.mjs) and re-run the generator.
 *
 * MONET.md §${SECTION} — the SESTINA clone: an ask model (lib/engine/bots/imitation.ts) fitted on SESTINA v1.0's
 * own ask decisions from the bridge records (their engine's output — data, not code), a conditional logit
 * over the ${model.features} per-ask features of \`ASK_FEATURES${SET === 2 ? '_2' : ''}\`, ${meta.model === 'mlp' ? `an MLP of ${JSON.stringify(meta.hidden)} ReLU units` : 'a linear scorer'}.
 * Provenance: ${meta.decisions ?? '?'} decisions (${meta.train ?? '?'} training, ${meta.holdout ?? '?'} held out by record file), ${meta.epochs ?? '?'} epochs
 * (epoch ${meta.kept ?? '?'} kept, the best holdout log-likelihood), seed ${meta.seed ?? '?'}; holdout top-1 agreement with SESTINA's
 * choice ${meta.holdoutTop1 !== undefined ? (100 * meta.holdoutTop1).toFixed(2) + '%' : '?'} (top-3 ${meta.holdoutTop3 !== undefined ? (100 * meta.holdoutTop3).toFixed(2) + '%' : '?'}, NLL ${meta.holdoutNll !== undefined ? meta.holdoutNll.toFixed(4) : '?'}) against the ranker's top
 * ${meta.baselineRankerTop1 !== undefined ? (100 * meta.baselineRankerTop1).toFixed(2) + '%' : '?'} and the stack's own decision ${meta.baselineStackTop1 !== undefined ? (100 * meta.baselineStackTop1).toFixed(2) + '%' : '?'}. Source file md5 ${md5}.
 * Frozen numeric data plus the DenseModel type from './../net.ts'; nothing in it takes a view.
 */
import type { DenseModel } from '../net.ts'

/** The fitted model, as \`registerAskModel('${NAME}', ${EXPORT})\` takes it. */`
const out = `/**
 * ${NAME}.ts — GENERATED by \`node scripts/gen-ask-model-module.mjs --model ${basename(MODEL)} --name ${NAME} --export ${EXPORT} --section ${SECTION}\`.
${header}
export const ${EXPORT}: DenseModel = Object.freeze({
  features: ${model.features},
  mean: Object.freeze([${model.mean.map(num).join(', ')}]),
  std: Object.freeze([${model.std.map(num).join(', ')}]),
  layers: Object.freeze([
${layers},
  ]),
  meta: Object.freeze(${JSON.stringify({ ...meta, files: undefined, ...(ADVANTAGE ? { data: undefined } : {}), sourceMd5: md5 })}),
}) as DenseModel
`
const dest = join(ROOT, 'lib/engine/bots/data', `${NAME}.ts`)
fs.writeFileSync(dest, out)
console.log(`wrote ${dest} (${(out.length / 1024).toFixed(0)} KB; source md5 ${md5}; holdout top-1 ${meta.holdoutTop1 !== undefined ? (100 * meta.holdoutTop1).toFixed(2) + '%' : '?'})`)
