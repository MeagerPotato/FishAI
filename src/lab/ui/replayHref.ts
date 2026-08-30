/**
 * The nav's replay link, resolved against the artifact actually loaded.
 *
 * This lives apart from `LabShell.tsx` for a measured reason. `loadArtifact` statically pulls in
 * the committed results artifact, and `LabShell` is imported by *every* route — so while this
 * function sat in that file, `/play`, `/design` and `/papers` each downloaded the entire research
 * corpus to render a footer link. Splitting it moved 1.4 MB off the shared chunk and onto the
 * pages that actually read the evidence.
 *
 * Keep it that way: nothing in `LabShell.tsx` may import `loadArtifact` again.
 */
import { loadArtifact, type ArtifactCase } from '../artifact.ts'
import { withCase } from './LabShell.tsx'

/**
 * The stored replays are part of each artifact, and the ids differ between the measured runs and
 * the synthetic fixture. A hard-coded id would 404 the link the moment the default case changed —
 * which is exactly how this helper came to exist.
 */
export function replayHref(which: ArtifactCase): string {
  const loaded = loadArtifact(which)
  const id = loaded.ok ? loaded.artifact.replays[0]?.id : undefined
  return id === undefined ? withCase('/lab', which) : withCase(`/lab/replay/${id}`, which)
}
