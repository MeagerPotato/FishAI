/**
 * Routes.
 *
 * Every page is `React.lazy`, which under Vite's defaults is the only mechanism that emits a
 * separate chunk (SITE_SPEC.md §4.4). It matters here for a specific reason: the lab chunk
 * carries the results artifact, the whole rules document (hashed in the browser to verify the
 * artifact against it) and the rules engine for the replay. None of that should be in the
 * entry chunk, and none of it is.
 *
 * `/design` stays, per SITE_SPEC.md §1's note on `main.tsx` — a design system nobody can open is
 * a design system nobody checks.
 */

import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

const LabReport = lazy(() => import('./pages/LabReport.tsx'))
const LabMatrix = lazy(() => import('./pages/LabMatrix.tsx'))
const LabReplay = lazy(() => import('./pages/LabReplay.tsx'))
const LabAdaptive = lazy(() => import('./pages/LabAdaptive.tsx'))
const LabBounded = lazy(() => import('./pages/LabBounded.tsx'))
const LabLive = lazy(() => import('./pages/LabLive.tsx'))
const Papers = lazy(() => import('./pages/Papers.tsx'))
const PlayHub = lazy(() => import('./pages/PlayHub.tsx'))
const PlayTable = lazy(() => import('./pages/PlayTable.tsx'))
const SystemDemo = lazy(() => import('./components/demo/SystemDemo.tsx'))

/**
 * The loading state is a live region rather than a spinner. There is no indeterminate progress
 * to animate — the chunk either arrives or it does not — and a screen reader should be told that
 * something is happening rather than being handed a decorative element.
 */
function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        fontSize: 'var(--fa-fs-micro)',
        fontWeight: 500,
        letterSpacing: 'var(--fa-tr-badge)',
        textTransform: 'uppercase',
        color: 'var(--fa-ink-3)',
      }}
    >
      Loading the artifact…
    </div>
  )
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/lab" element={<LabReport />} />
        <Route path="/lab/matrix" element={<LabMatrix />} />
        <Route path="/lab/replay/:id" element={<LabReplay />} />
        <Route path="/lab/replay" element={<Navigate to="/lab" replace />} />
        <Route path="/lab/adaptive" element={<LabAdaptive />} />
        <Route path="/lab/bounded" element={<LabBounded />} />
        <Route path="/lab/live" element={<LabLive />} />
        {/*
          `/papers` is the page; `/papers/<name>.pdf` is a static file in `public/`, which the
          dev server and Vercel both serve from the filesystem before any router sees it. The
          two never collide, because this route has no `:param` segment for a PDF to match.
        */}
        <Route path="/papers" element={<Papers />} />
        <Route path="/play" element={<PlayHub />} />
        <Route path="/play/table" element={<PlayTable />} />
        <Route path="/design" element={<SystemDemo />} />
        <Route path="*" element={<Navigate to="/lab" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
