import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import { App } from './App.tsx'

/**
 * Entry point. The harness that used to live here — a single `/design` route standing in for an
 * app that did not exist yet — is gone; `App.tsx` owns the routes now, and `/design` survives
 * inside it as one of them, per SITE_SPEC.md §1.
 *
 * Nothing is imported here that a lab route needs: the artifact, the rules document and the
 * engine all arrive with their lazily-loaded page.
 */
const root = document.getElementById('root')
if (!root) throw new Error('No #root element in index.html')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
