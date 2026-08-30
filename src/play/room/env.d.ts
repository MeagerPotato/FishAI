/// <reference types="vite/client" />

/**
 * `*.module.css` and `import.meta.env` are both declared by Vite's own client types.
 * Referencing them here keeps this directory self-contained rather than depending on another
 * module's reference surviving a refactor — the same reason src/diagrams/css.d.ts exists.
 */
export {}
