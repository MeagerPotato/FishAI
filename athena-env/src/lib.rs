//! # athena-env: ATHENA's us54 rules core
//!
//! A port of the TypeScript reference engine in `lib/engine/` (ATHENA.md §4.1), which stays the only judge. The port
//! is gated by G0a (i) (ATHENA.md §4.6): from each record's seed, start seat and actions alone it must reproduce every
//! per-step state digest, legal-move digest, view digest and probe verdict of the `athena-replay-1` corpus, whose
//! language-neutral specification is `scripts/athena/replay-format.md`.
//!
//! - [`rules`]: the us54 core over array state: the deal, ask, claim (declare), decline, pass, the declare window,
//!   `declareTail`, `nextSeatWithCards` and the clinch, with the reference's error orderings. No allocation per step.
//! - [`codec`]: the semantic-state, action, event, legal-move and view encodings, and the probes.
//! - [`digest`] and [`rng`]: the house digest and the reference's generators, bit for bit.
//! - [`replay`] and [`census`]: replaying one corpus record, and the branch census of §4.6's floor table.
//! - [`stub`]: the mixed stub, G0a's population H5 and G0b's stub.
//! - [`vecenv`]: the batch environment behind the Python API (`API.md`): action codes, legal masks, observations.
//!
//! D12 (ATHENA.md §5): this library is pure computation. It has no dependencies, forbids `unsafe`, and opens no file,
//! socket or process; the `replay-check` and `stub-bench` binaries do the reading.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod bridge;
pub mod cards;
pub mod census;
pub mod codec;
pub mod digest;
pub mod replay;
pub mod rng;
pub mod rules;
pub mod stub;
pub mod vecenv;

#[cfg(test)]
mod vectors;
