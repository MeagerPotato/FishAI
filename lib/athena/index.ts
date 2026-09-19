/**
 * ATHENA's inference contract (ATHENA.md §4.5 item 6, G0d): the observation encoder of the Rust port's layout, the
 * candidate network's deterministic forward, and the stub policy with its rules-certain declare rail. The ATHENA-stub
 * FishLab package (`athena-stub/`, built by `scripts/athena/build-stub-package.mjs`) ships this barrel's runtime
 * import closure, type-stripped.
 */
export * from './encode.ts'
export * from './net.ts'
export * from './policy.ts'
