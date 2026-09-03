/**
 * The determinization sampler lives in `lib/engine/bots/determinize.ts` since MONET.md 3.8b (the
 * determinized declare needs it inside the bots directory's public-view boundary, which it never
 * crossed: it reads a seat's view and knowledge and nothing else). This re-export keeps the search
 * arm's import where 3.8a put it.
 */
export { sampleDeal } from '../bots/determinize.ts'
export type { Rng } from '../bots/determinize.ts'
