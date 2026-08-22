/// <reference types="vite/client" />

/**
 * `tsconfig.app.json` does not set `resolveJsonModule`, and the lab is not allowed to change it.
 * That is not a workaround here, it is the better contract anyway: the artifact is imported with
 * `?raw` and parsed once through `parseArtifact`, so the committed file stays a byte-exact,
 * diffable JSON document rather than a TypeScript module the bundler happens to inline, and the
 * shape is *validated* at the boundary instead of being asserted by a compiler that never saw
 * the file the simulator will eventually write.
 *
 * `*?raw` and `*.module.css` are both declared by Vite's own client types; referencing them here
 * keeps this directory self-contained.
 */
export {}
