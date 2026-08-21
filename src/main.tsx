import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './styles/global.css'
import { SystemDemo } from './components/index.ts'

/**
 * Entry point. This is a HARNESS, not the app: it exists so the design system's
 * specimen route is a real route you can open, and it is meant to be replaced
 * the moment `src/App.tsx` and the /lab routes land. Keep `/design` when that
 * happens — a design system nobody can open is a design system nobody checks.
 */
const root = document.getElementById('root')
if (!root) throw new Error('No #root element in index.html')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/design" element={<SystemDemo />} />
        <Route path="*" element={<Navigate to="/design" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
