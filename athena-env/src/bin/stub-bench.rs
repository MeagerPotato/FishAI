//! stub-bench: the port's raw step loop under the mixed stub's rule, for information (ATHENA.md §4.3, §4.6 G0b).
//! This is NOT G0b: G0b is measured later through the Python batch API with the stub in NumPy and the observation
//! buffers filled.
//!
//! ```text
//! cargo run --release --bin stub-bench -- [--games N] [--threads 1,4] [--warmup W]
//! cargo run --release --bin stub-bench -- --verify FILE.tsv [--threads N]
//! ```
//!
//! - Bench: plays N games (`athena-p0-bench-<i>`, start seat i mod 6) with `rules::Game` and `stub::mixed_stub_action`
//!   until each finishes or hits the 6,000-step cap, on T threads (each takes every T-th game), after W warm-up games
//!   a thread. No digest, no codec: the core and the stub only.
//! - Verify: regenerates each record of an H5 (mixed stub) or H4 (fuzz policy) corpus file with the Rust policy and
//!   the Rust recorder, and compares columns 9-17 (T, end, deal, actions, d, l, v, probes, game) with the file's,
//!   byte for byte: the port emits the reference's records.

use athena_env::codec::STEP_CAP;
use athena_env::replay::{parse_line, record_game};
use athena_env::rules::{Events, Game, FINISHED};
use athena_env::stub::{fuzz_policy_action, fuzz_policy_rng, mixed_stub_action, mixed_stub_rng};
use std::fmt::Write as _;
use std::io::{BufRead, BufReader};
use std::process::ExitCode;
use std::time::Instant;

struct Played {
    games: u64,
    steps: u64,
    capped: u64,
    refused: u64,
}

fn play_range(first: u64, count: u64, stride: u64, prefix: &str) -> Played {
    let mut seed = String::with_capacity(64);
    let mut ev = Events::new();
    let mut out = Played {
        games: 0,
        steps: 0,
        capped: 0,
        refused: 0,
    };
    for k in 0..count {
        let i = first + k * stride;
        seed.clear();
        let _ = write!(seed, "{prefix}{i}");
        let mut g = Game::new(&seed, (i % 6) as u8).expect("a printable seed deals");
        let mut rng = mixed_stub_rng(&seed);
        let mut steps = 0u32;
        while g.phase() != FINISHED && steps < STEP_CAP {
            let seat = g.acting_seat();
            let a = mixed_stub_action(&g, seat, &mut rng);
            if g.apply(&a, &mut ev).is_err() {
                out.refused += 1;
                break;
            }
            steps += 1;
        }
        if g.phase() != FINISHED {
            out.capped += 1;
        }
        out.games += 1;
        out.steps += steps as u64;
    }
    out
}

fn bench(games: u64, threads: u64, warmup: u64) {
    // Warm-up on every thread, then the timed run.
    std::thread::scope(|s| {
        for t in 0..threads {
            s.spawn(move || play_range(t, warmup, threads, "athena-p0-benchwarm-"));
        }
    });
    let t0 = Instant::now();
    let parts: Vec<Played> = std::thread::scope(|s| {
        let hs: Vec<_> = (0..threads)
            .map(|t| {
                let n = games / threads + u64::from(t < games % threads);
                s.spawn(move || play_range(t, n, threads, "athena-p0-bench-"))
            })
            .collect();
        hs.into_iter()
            .map(|h| h.join().expect("a bench thread panicked"))
            .collect()
    });
    let secs = t0.elapsed().as_secs_f64();
    let g: u64 = parts.iter().map(|p| p.games).sum();
    let st: u64 = parts.iter().map(|p| p.steps).sum();
    let capped: u64 = parts.iter().map(|p| p.capped).sum();
    let refused: u64 = parts.iter().map(|p| p.refused).sum();
    println!(
        "core + mixed stub, {threads} thread{}: {g} games in {secs:.3} s = {:.0} games/s ({:.0} a thread); {:.1} actions a game, {:.3} us an action; capped {capped}, refused {refused}",
        if threads == 1 { "" } else { "s" },
        g as f64 / secs,
        g as f64 / secs / threads as f64,
        st as f64 / g as f64,
        1e6 * secs / st as f64
    );
}

fn verify(path: &str, threads: usize) -> bool {
    let fh = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("{path}: {e}");
            return false;
        }
    };
    let lines: Vec<String> = BufReader::new(fh)
        .lines()
        .map_while(Result::ok)
        .filter(|l| !l.is_empty())
        .collect();
    let t0 = Instant::now();
    let chunk = lines.len().div_ceil(threads.max(1));
    let results: Vec<(u64, u64, Vec<String>)> = std::thread::scope(|s| {
        let hs: Vec<_> = lines
            .chunks(chunk.max(1))
            .map(|part| {
                s.spawn(move || {
                    let (mut equal, mut differ) = (0u64, 0u64);
                    let mut notes = Vec::new();
                    for line in part {
                        let rec = match parse_line(line) {
                            Ok(r) => r,
                            Err(e) => {
                                differ += 1;
                                notes.push(format!("parse: {e}"));
                                continue;
                            }
                        };
                        let cols = match rec.population {
                            "H5" => {
                                let mut rng = mixed_stub_rng(rec.seed);
                                record_game(rec.seed, rec.start, |g, acting| mixed_stub_action(g, acting, &mut rng))
                            }
                            "H4" => {
                                let (mut rng, start) = fuzz_policy_rng(rec.seed);
                                if start != rec.start {
                                    Err(format!("start seat {start} vs recorded {}", rec.start))
                                } else {
                                    record_game(rec.seed, start, |g, _| fuzz_policy_action(g, &mut rng))
                                }
                            }
                            p => Err(format!("population {p} is not driven by a Rust policy")),
                        };
                        let recorded_tail = line.splitn(9, '\t').nth(8).unwrap_or("");
                        match cols {
                            Ok(c) if c.tail() == recorded_tail => equal += 1,
                            Ok(c) => {
                                differ += 1;
                                if notes.len() < 5 {
                                    let (ra, rs) = (rec.actions_hex, rec.steps);
                                    let at = c
                                        .actions
                                        .as_bytes()
                                        .iter()
                                        .zip(ra.iter())
                                        .position(|(a, b)| a != b)
                                        .unwrap_or(c.actions.len().min(ra.len()));
                                    notes.push(format!(
                                        "{} #{}: {} steps vs recorded {rs}; actions first differ at hex offset {at}",
                                        rec.population, rec.index, c.steps
                                    ));
                                }
                            }
                            Err(e) => {
                                differ += 1;
                                notes.push(format!("{} #{}: {e}", rec.population, rec.index));
                            }
                        }
                    }
                    (equal, differ, notes)
                })
            })
            .collect();
        hs.into_iter()
            .map(|h| h.join().expect("a verify thread panicked"))
            .collect()
    });
    let equal: u64 = results.iter().map(|r| r.0).sum();
    let differ: u64 = results.iter().map(|r| r.1).sum();
    for r in &results {
        for n in &r.2 {
            println!("  {n}");
        }
    }
    println!(
        "verify {path}: {equal} of {} records regenerated by the Rust policy and recorder equal the corpus line (columns 9-17) byte for byte; {differ} differ ({:.1} s)",
        equal + differ,
        t0.elapsed().as_secs_f64()
    );
    differ == 0
}

fn main() -> ExitCode {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let arg = |k: &str| argv.iter().position(|a| a == k).and_then(|i| argv.get(i + 1)).cloned();
    let threads_list: Vec<u64> = arg("--threads")
        .unwrap_or_else(|| "1".into())
        .split(',')
        .map(|t| t.trim().parse().expect("--threads takes numbers"))
        .collect();
    if threads_list.iter().any(|&t| !(1..=4).contains(&t)) {
        eprintln!("--threads must be 1..4 (at most 4 threads)");
        return ExitCode::from(2);
    }
    if let Some(path) = arg("--verify") {
        let ok = verify(&path, threads_list[0] as usize);
        return if ok { ExitCode::SUCCESS } else { ExitCode::from(1) };
    }
    let games: u64 = arg("--games").map(|g| g.parse().expect("--games N")).unwrap_or(200_000);
    let warmup: u64 = arg("--warmup")
        .map(|g| g.parse().expect("--warmup N"))
        .unwrap_or(10_000);
    println!("stub-bench: the core's raw step loop under the mixed stub's rule (information for G0b; not G0b)");
    for t in threads_list {
        bench(games, t, warmup);
    }
    ExitCode::SUCCESS
}
