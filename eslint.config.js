import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.claude/worktrees` holds throwaway checkouts of this same repository. Without this ignore
  // eslint parses every copy, which is both meaningless and slow: it reported 2,474 parser errors
  // across ~43 worktrees, none of them about this checkout's code.
  // `athena-env` is the Rust rules core (ATHENA.md §5, D12): no JavaScript lives there, and its `target/` build tree
  // must never be walked.
  globalIgnores(['dist', 'node_modules', '.claude', 'athena-env']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },
])
