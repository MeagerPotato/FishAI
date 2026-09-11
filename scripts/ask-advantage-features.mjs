/**
 * ask-advantage-features.mjs - MONET.md 3.8aw: the feature row the learned ask ADVANTAGE reads, shared by
 * its data generator and its marker probe so that the two can never drift apart.
 *
 * One row per entry of the ranker's list (`rankAsksWith`, every legal ask): the clone's own forty-nine
 * (`askFeatureRows`' second set, exactly what sestina-clone-3 reads) and two more that hand the fit the
 * clone's OPINION of the ask - its score less the best score at the decision (`cloneRel`, 0 at the
 * clone's choice and negative elsewhere) and whether it IS the clone's choice (`isCloneTop`, the ask
 * v0.33 plays). With them a model can learn a correction to the clone instead of re-deriving the clone;
 * without them every alternative would have to be valued from nothing.
 *
 * Every column is computed from the seat's VIEW - nothing here reads the true deal - so a model fitted
 * on these rows can be played. The modules are passed in rather than imported, so the caller's own
 * module instances (and the ask models registered on them) are the ones used.
 */
export const ADV_EXTRA = Object.freeze(['cloneRel', 'isCloneTop'])

export function advFeatureNames(IMI) {
  return [...IMI.askFeatureNames(2), ...ADV_EXTRA]
}

export function advFeatureCount(IMI) {
  return IMI.askFeatureCount(2) + ADV_EXTRA.length
}

/** Rows for every entry of `ranked`, the clone's scores, and the index in `ranked` of the clone's choice. */
export function advFeatureRows(IMI, clone, view, k, ranked) {
  if (IMI.askFeatureSetOf(clone) !== 2) throw new Error('the advantage rows are built on the second feature set; the clone must be fitted at it')
  const base = IMI.askFeatureRows(view, k, ranked, 2)
  const cs = IMI.scoreAsks(clone, view, k, ranked)
  const top = IMI.chooseAskByModel(clone, view, k, ranked)
  const ti = ranked.indexOf(top)
  if (ti < 0) throw new Error('chooseAskByModel returned an ask that is not an entry of the list')
  let mx = -Infinity
  for (const v of cs) if (v > mx) mx = v
  const NA = IMI.askFeatureCount(2)
  const rows = base.map((b, j) => {
    const x = new Float64Array(NA + ADV_EXTRA.length)
    x.set(b)
    x[NA] = cs[j] - mx
    x[NA + 1] = j === ti ? 1 : 0
    return x
  })
  return { rows, cs, ti }
}
