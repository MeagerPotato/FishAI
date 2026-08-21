/// <reference types="vite/client" />

/**
 * tsconfig.app.json sets `noUncheckedSideEffectImports: true`, which rejects
 * `import './skin.css'` unless the module is declared. Vite's own client
 * types declare it; referencing them here keeps this directory self-contained
 * rather than depending on another module's reference surviving a refactor.
 * The directive is idempotent, so a second reference elsewhere is harmless.
 */
export {}
