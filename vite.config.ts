import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// No dev proxy: FishAI has no backend. The lab site is a pure reader of a
// committed results artifact, and the simulator runs in Node, not the browser.
export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
