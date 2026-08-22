/**
 * One place where "which artifact, is it valid, does it match the rules, and what does its
 * matrix actually say" is answered, so the three routes cannot answer it three different ways.
 *
 * Everything here is computed at module load of the lab chunk, not during render: the artifacts
 * are static, the derivation is pure, and a component that memoises across renders would be
 * caching something that can never change.
 */

import { ARTIFACT_CASES, loadArtifact, type ArtifactCase, type LabArtifact } from './artifact.ts'
import { checkRules, type RulesCheck } from './rules.ts'
import { derive, reconcile, type Derived } from './verdict.ts'

export type LabModel =
  | { ok: false; which: ArtifactCase; file: string; detail: string }
  | {
      ok: true
      which: ArtifactCase
      file: string
      artifact: LabArtifact
      /** The artifact as the DIAGRAMS see it: recomputed ranking, so figure and banner agree. */
      results: LabArtifact
      derived: Derived
      check: RulesCheck
    }

function build(which: ArtifactCase): LabModel {
  const loaded = loadArtifact(which)
  if (!loaded.ok) return { ok: false, which, file: loaded.file, detail: loaded.detail }
  const derived = derive(loaded.artifact)
  return {
    ok: true,
    which,
    file: loaded.file,
    artifact: loaded.artifact,
    results: reconcile(loaded.artifact, derived),
    derived,
    check: checkRules(loaded.artifact.meta.rulesHash, loaded.file),
  }
}

const MODELS = Object.fromEntries(ARTIFACT_CASES.map((c) => [c, build(c)])) as Record<
  ArtifactCase,
  LabModel
>

export function labModel(which: ArtifactCase): LabModel {
  return MODELS[which]
}
