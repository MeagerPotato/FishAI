//! replay-check: G0a (i) for the Rust port (ATHENA.md §4.5 item 3, §4.6).
//!
//! ```text
//! cargo run --release --bin replay-check -- [--corpus DIR] [--threads 1..4] [--population H1,...] [--max-games N]
//! cargo run --release --features mutants --bin replay-check -- --mutant M1..M5 [...]
//! ```
//!
//! Every record of the `athena-replay-1` corpus is replayed through the port from its seed, start seat and ACTIONS
//! ALONE; every per-step state digest, legal-move digest and view digest, every probe's accept or refuse, the deal,
//! T and the end, and the game digest are compared with what the reference emitter wrote. Error codes of probes are
//! information only. It then prints, per population, the same branch-coverage table as the reference self-check
//! (`scripts/athena/check-replay-corpus.mjs`), and the same integrity lines: capped games, the `resolved === 9`
//! terminator firing alone, H2's bank step counts, block aggregates against the manifest.
//!
//! The corpus is read with the standard library alone (one game per tab-separated line). Exit 0: every comparison
//! held and every floor was met. 1: a record did not replay, or an integrity check failed. 3: integrity held but a
//! floor is short. With `--mutant`: exit 0 when the mutant is caught (at least one divergent game), 2 when it is not.

use athena_env::census::{Tally, BRANCHES, C, FLOOR, INFO_ROWS, NEW_BRANCH_IDS};
use athena_env::digest::hex_string;
use athena_env::replay::{aggregate, parse_line, Mismatch, Replayer};
use athena_env::rules::Mutant;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::mpsc::{sync_channel, Receiver};
use std::sync::{Arc, Mutex};
use std::time::Instant;

const REPO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/..");
const REGISTERED_H4: u64 = 4000;
const GROUPS: [&str; 6] = ["H1", "H2", "H3", "H4", "H5", "H4x"];
const BAD_KEEP: usize = 20;

struct Args {
    corpus: Option<PathBuf>,
    threads: usize,
    mutant: Mutant,
    populations: Option<Vec<String>>,
    max_games: usize,
    bank: PathBuf,
    json: Option<PathBuf>,
}

fn usage() -> ! {
    eprintln!(
        "usage: replay-check [--corpus DIR] [--threads 1..4] [--population H1,H2,...] [--max-games N] [--bank FILE] [--mutant M1..M5] [--json FILE]"
    );
    std::process::exit(2);
}

/// A JSON string literal.
fn js(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn parse_args() -> Args {
    let mut a = Args {
        corpus: None,
        threads: 4,
        mutant: Mutant::None,
        populations: None,
        max_games: 0,
        bank: PathBuf::from(format!("{REPO}/tests/bots/data/monet-v054-bank.ts")),
        json: None,
    };
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < argv.len() {
        let val = |i: usize| argv.get(i + 1).cloned().unwrap_or_else(|| usage());
        match argv[i].as_str() {
            "--corpus" => a.corpus = Some(PathBuf::from(val(i))),
            "--threads" | "--workers" => {
                a.threads = val(i).parse().unwrap_or_else(|_| usage());
                if !(1..=4).contains(&a.threads) {
                    eprintln!("--threads must be 1..4 (at most 4 threads)");
                    std::process::exit(2);
                }
            }
            "--mutant" => {
                a.mutant = Mutant::parse(&val(i)).unwrap_or_else(|| usage());
                if a.mutant != Mutant::None && !cfg!(feature = "mutants") {
                    eprintln!("--mutant needs the mutants feature: cargo run --release --features mutants --bin replay-check -- ...");
                    std::process::exit(2);
                }
            }
            "--population" => a.populations = Some(val(i).split(',').map(|s| s.trim().to_ascii_uppercase()).collect()),
            "--max-games" => a.max_games = val(i).parse().unwrap_or_else(|_| usage()),
            "--bank" => a.bank = PathBuf::from(val(i)),
            "--json" => a.json = Some(PathBuf::from(val(i))),
            "-h" | "--help" => usage(),
            other => {
                eprintln!("unknown argument {other}");
                usage();
            }
        }
        i += 2;
    }
    a
}

/* ------------------------------------------------------- minimal manifest reads --- */

/// The string value of the first `"key": "..."` at or after `from`. The manifest is the emitter's own JSON.
fn json_str<'a>(text: &'a str, from: usize, key: &str) -> Option<&'a str> {
    let pat = format!("\"{key}\": \"");
    let at = text[from..].find(&pat)? + from + pat.len();
    let end = text[at..].find('"')? + at;
    Some(&text[at..end])
}

/// The number value of the first `"key": N` at or after `from`.
fn json_num(text: &str, from: usize, key: &str) -> Option<u64> {
    let pat = format!("\"{key}\": ");
    let at = text[from..].find(&pat)? + from + pat.len();
    let digits: String = text[at..].chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

struct Manifest {
    revision: Option<String>,
    rules_hash: Option<String>,
    /// block -> (games, aggregate)
    blocks: HashMap<String, (u64, String)>,
}

fn read_manifest(path: &Path) -> Option<Manifest> {
    let text = fs::read_to_string(path).ok()?;
    let mut blocks = HashMap::new();
    if let Some(b) = text.find("\"blocks\": {") {
        let mut from = b;
        while let Some(off) = text[from..].find("\"file\": \"") {
            let at = from + off;
            // Stop at the end of the blocks object (the "runs" array follows it).
            if text[b..at].contains("\"runs\"") {
                break;
            }
            let file = json_str(&text, at, "file")?;
            let key = file.trim_end_matches(".tsv").to_string();
            let games = json_num(&text, at, "games").unwrap_or(0);
            let agg = json_str(&text, at, "aggregate").unwrap_or("").to_string();
            blocks.insert(key, (games, agg));
            from = at + 8;
        }
    }
    Some(Manifest {
        revision: json_str(&text, 0, "revision").map(str::to_string),
        rules_hash: json_str(&text, 0, "rulesHash").map(str::to_string),
        blocks,
    })
}

/// The v0.54 bank's decision count per seed, from `tests/bots/data/monet-v054-bank.ts`'s game rows.
fn read_bank(path: &Path) -> HashMap<String, u32> {
    let mut out = HashMap::new();
    let Ok(text) = fs::read_to_string(path) else {
        return out;
    };
    for line in text.lines() {
        let (Some(s), Some(d)) = (line.find("seed: '"), line.find("decisions: ")) else {
            continue;
        };
        let seed = &line[s + 7..];
        let Some(q) = seed.find('\'') else { continue };
        let digits: String = line[d + 11..].chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(n) = digits.parse() {
            out.insert(seed[..q].to_string(), n);
        }
    }
    out
}

/* ------------------------------------------------------------------ the work --- */

struct BadGame {
    file: usize,
    population: String,
    index: u64,
    seed: String,
    first_step: i64,
    mismatches: Vec<Mismatch>,
}

#[derive(Default)]
struct Acc {
    groups: [Tally; 6],
    /// (file, index, game digest or "!" + the recorded one)
    games: Vec<(usize, u64, String)>,
    bad: Vec<BadGame>,
    parse_errors: Vec<String>,
    lines: u64,
}

fn group_of(pop: &str, index: u64) -> usize {
    match pop {
        "H1" => 0,
        "H2" => 1,
        "H3" => 2,
        "H4" if index >= REGISTERED_H4 => 5,
        "H4" => 3,
        "H5" => 4,
        _ => 5,
    }
}

struct Ctx<'a> {
    revision: Option<&'a str>,
    rules_hash: Option<&'a str>,
    bank: &'a HashMap<String, u32>,
}

fn check_line(r: &mut Replayer, acc: &mut Acc, ctx: &Ctx<'_>, file: usize, line: &str) {
    acc.lines += 1;
    let rec = match parse_line(line) {
        Ok(rec) => rec,
        Err(e) => {
            acc.parse_errors.push(format!("file {file}: {e}"));
            return;
        }
    };
    let gi = group_of(rec.population, rec.index);
    let res = r.replay(&rec, Some(&mut acc.groups[gi]));
    let t = &mut acc.groups[gi];
    t.add(C::ProbeVerdicts, rec.probes_hex.len() as u64 / 2);
    t.add(
        C::ProbeAccepted,
        rec.probes_hex.chunks_exact(2).filter(|p| *p == b"00").count() as u64,
    );
    t.add(C::CodeDiffs, res.code_diffs);
    if res.ok {
        t.bump(C::RecordsOk);
    } else {
        t.bump(C::RecordsBad);
        let mut kinds: Vec<&str> = res.mismatches.iter().map(|m| m.what).collect();
        kinds.sort_unstable();
        kinds.dedup();
        for k in kinds {
            t.bump(match k {
                "deal" => C::MismatchDeal,
                "d" => C::MismatchD,
                "l" => C::MismatchL,
                "v" => C::MismatchV,
                "probe" => C::MismatchProbe,
                "refused" => C::MismatchRefused,
                "length" => C::MismatchLength,
                "end" => C::MismatchEnd,
                "game" => C::MismatchGame,
                _ => C::MismatchDecode,
            });
        }
        if acc.bad.len() < BAD_KEEP {
            acc.bad.push(BadGame {
                file,
                population: rec.population.to_string(),
                index: rec.index,
                seed: rec.seed.to_string(),
                first_step: res.first_step,
                mismatches: res.mismatches.iter().take(6).cloned().collect(),
            });
        }
    }
    if ctx.revision.is_some_and(|v| v != rec.revision) {
        t.bump(C::HeaderRevisionDiffers);
    }
    if ctx.rules_hash.is_some_and(|v| v != rec.rules_hash) {
        t.bump(C::HeaderRulesHashDiffers);
    }
    if let Some(&n) = ctx.bank.get(rec.seed) {
        t.bump(C::BankSeeds);
        if rec.steps != n || res.steps != n {
            t.bump(C::BankSeedStepMismatch);
        }
    }
    let digest = match res.game {
        Some(g) => hex_string(g),
        None => format!("!{}", hex_string(rec.game)),
    };
    acc.games.push((file, rec.index, digest));
}

fn corpus_files(dir: &Path, pops: &Option<Vec<String>>) -> Vec<(String, String, u64)> {
    let mut out = Vec::new();
    let Ok(rd) = fs::read_dir(dir) else {
        return out;
    };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let Some(stem) = name.strip_suffix(".tsv") else {
            continue;
        };
        let parts: Vec<&str> = stem.split('-').collect();
        if parts.len() != 3 || parts[0].len() != 2 || !parts[0].starts_with('H') {
            continue;
        }
        let (Ok(from), Ok(_to)) = (parts[1].parse::<u64>(), parts[2].parse::<u64>()) else {
            continue;
        };
        if pops.as_ref().is_some_and(|p| !p.iter().any(|x| x == parts[0])) {
            continue;
        }
        out.push((name.clone(), parts[0].to_string(), from));
    }
    out.sort_by(|a, b| a.1.cmp(&b.1).then(a.2.cmp(&b.2)));
    out
}

fn main() -> ExitCode {
    let args = parse_args();
    let t0 = Instant::now();
    let repo_manifest = PathBuf::from(format!("{REPO}/scripts/athena/corpus-manifest.json"));
    let corpus = match args.corpus.clone() {
        Some(c) => c,
        None => {
            let text = fs::read_to_string(&repo_manifest).unwrap_or_default();
            match json_str(&text, 0, "corpusDir") {
                Some(d) => PathBuf::from(d),
                None => {
                    eprintln!("no --corpus given and no corpusDir in {}", repo_manifest.display());
                    return ExitCode::from(2);
                }
            }
        }
    };
    let manifest = read_manifest(&corpus.join("manifest.json"));
    let bank = read_bank(&args.bank);
    let files = corpus_files(&corpus, &args.populations);
    if files.is_empty() {
        eprintln!("no corpus files in {}", corpus.display());
        return ExitCode::from(2);
    }
    let revision = manifest.as_ref().and_then(|m| m.revision.clone());
    let rules_hash = manifest.as_ref().and_then(|m| m.rules_hash.clone());
    println!(
        "=== ATHENA P0 G0a (i): the Rust port (athena-env) replays {} ===",
        corpus.display()
    );
    println!(
        "corpus revision {}; rules hash {}; {} replay thread{}; mutant {:?}; bank rows {}",
        revision.as_deref().unwrap_or("(no manifest)"),
        rules_hash.as_deref().unwrap_or("(no manifest)"),
        args.threads,
        if args.threads == 1 {
            " (single-threaded: reading and replaying on one thread)"
        } else {
            "s plus the reader"
        },
        args.mutant,
        bank.len()
    );
    let ctx = Ctx {
        revision: revision.as_deref(),
        rules_hash: rules_hash.as_deref(),
        bank: &bank,
    };

    // Read every file line by line; replay inline on one thread, or hand batches of lines to N workers.
    let mut acc = Acc::default();
    let mut read_err: Option<String> = None;
    let each_line = |f: &mut dyn FnMut(usize, String)| -> Result<(), String> {
        for (fi, (name, _, _)) in files.iter().enumerate() {
            let fh = fs::File::open(corpus.join(name)).map_err(|e| format!("{name}: {e}"))?;
            let mut rd = BufReader::with_capacity(1 << 22, fh);
            let mut n = 0usize;
            loop {
                let mut line = String::new();
                let k = rd.read_line(&mut line).map_err(|e| format!("{name}: {e}"))?;
                if k == 0 {
                    break;
                }
                if line.trim_end().is_empty() {
                    continue;
                }
                if args.max_games > 0 && n >= args.max_games {
                    break;
                }
                n += 1;
                f(fi, line);
            }
        }
        Ok(())
    };
    if args.threads == 1 {
        let mut r = Replayer::new(args.mutant);
        if let Err(e) = each_line(&mut |fi, line| check_line(&mut r, &mut acc, &ctx, fi, &line)) {
            read_err = Some(e);
        }
    } else {
        type Job = (usize, Vec<String>);
        let (tx, rx) = sync_channel::<Job>(2 * args.threads);
        let rx: Arc<Mutex<Receiver<Job>>> = Arc::new(Mutex::new(rx));
        let results: Vec<Acc> = std::thread::scope(|s| {
            let mut handles = Vec::new();
            for _ in 0..args.threads {
                let rx = Arc::clone(&rx);
                let ctx = &ctx;
                let mutant = args.mutant;
                handles.push(s.spawn(move || {
                    let mut r = Replayer::new(mutant);
                    let mut acc = Acc::default();
                    loop {
                        let job = rx.lock().expect("the job queue lock").recv();
                        let Ok((fi, lines)) = job else { break };
                        for line in lines {
                            check_line(&mut r, &mut acc, ctx, fi, &line);
                        }
                    }
                    acc
                }));
            }
            let mut batch: Vec<String> = Vec::new();
            let mut bytes = 0usize;
            let mut cur = usize::MAX;
            let res = each_line(&mut |fi, line| {
                if fi != cur && !batch.is_empty() {
                    tx.send((cur, std::mem::take(&mut batch))).expect("a worker is alive");
                    bytes = 0;
                }
                cur = fi;
                bytes += line.len();
                batch.push(line);
                if batch.len() >= 64 || bytes > 2_000_000 {
                    tx.send((fi, std::mem::take(&mut batch))).expect("a worker is alive");
                    bytes = 0;
                }
            });
            if !batch.is_empty() {
                tx.send((cur, std::mem::take(&mut batch))).expect("a worker is alive");
            }
            drop(tx);
            if let Err(e) = res {
                read_err = Some(e);
            }
            handles
                .into_iter()
                .map(|h| h.join().expect("a worker panicked"))
                .collect()
        });
        for r in results {
            for (g, t) in acc.groups.iter_mut().zip(r.groups.iter()) {
                g.merge(t);
            }
            acc.games.extend(r.games);
            acc.bad.extend(r.bad);
            acc.parse_errors.extend(r.parse_errors);
            acc.lines += r.lines;
        }
    }
    let seconds = t0.elapsed().as_secs_f64();
    report(&args, &files, manifest.as_ref(), acc, read_err, seconds)
}

fn report(
    args: &Args,
    files: &[(String, String, u64)],
    manifest: Option<&Manifest>,
    mut acc: Acc,
    read_err: Option<String>,
    seconds: f64,
) -> ExitCode {
    let order: Vec<usize> = (0..6).filter(|&g| acc.groups[g].get("games") > 0).collect();
    let sum = |k: C| order.iter().map(|&g| acc.groups[g].at(k)).sum::<u64>();
    let sum_id = |k: &str| order.iter().map(|&g| acc.groups[g].get(k)).sum::<u64>();
    let mut integrity: Vec<String> = Vec::new();
    if let Some(e) = &read_err {
        integrity.push(format!("reading the corpus failed: {e}"));
    }
    for e in acc.parse_errors.iter().take(5) {
        integrity.push(format!("a line did not parse: {e}"));
    }
    if !acc.parse_errors.is_empty() {
        integrity.push(format!("{} lines did not parse", acc.parse_errors.len()));
    }
    let games = sum_id("games");
    let steps = sum_id("steps");
    println!(
        "\nrecords: {} of {} replay to every recorded digest ({} steps, {} lines read, {:.1} s)",
        sum(C::RecordsOk),
        games,
        steps,
        acc.lines,
        seconds
    );
    println!(
        "throughput: {:.0} games/s, {:.0} steps/s, wall clock {:.2} s on {} thread{}",
        games as f64 / seconds,
        steps as f64 / seconds,
        seconds,
        args.threads,
        if args.threads == 1 { "" } else { "s" }
    );
    if sum(C::RecordsBad) > 0 {
        integrity.push(format!("{} records do not replay", sum(C::RecordsBad)));
    }
    for (k, name) in [
        (C::MismatchDeal, "deal"),
        (C::MismatchD, "d"),
        (C::MismatchL, "l"),
        (C::MismatchV, "v"),
        (C::MismatchProbe, "probe"),
        (C::MismatchRefused, "refused"),
        (C::MismatchLength, "length"),
        (C::MismatchEnd, "end"),
        (C::MismatchGame, "game"),
        (C::MismatchDecode, "decode"),
    ] {
        if sum(k) > 0 {
            println!("  !!! {} records with a {name} mismatch", sum(k));
        }
    }
    println!(
        "probes: {} verdicts, {} accepted; accept/refuse differing in {} records; error codes differing where the verdict agreed: {} (information)",
        sum(C::ProbeVerdicts),
        sum(C::ProbeAccepted),
        sum(C::MismatchProbe),
        sum(C::CodeDiffs)
    );
    acc.games.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    let mut json_aggregates: Vec<String> = Vec::new();
    for (fi, (name, _, _)) in files.iter().enumerate() {
        let got: Vec<&str> = acc.games.iter().filter(|g| g.0 == fi).map(|g| g.2.as_str()).collect();
        let agg = hex_string(aggregate(got.iter().copied()));
        let key = name.trim_end_matches(".tsv");
        let want = manifest.and_then(|m| m.blocks.get(key));
        let verdict = match want {
            None => "no manifest entry".to_string(),
            Some((n, _)) if got.len() as u64 != *n => format!("partial ({} of {n})", got.len()),
            Some((_, a)) if *a == agg => "equal to the manifest".to_string(),
            Some((_, a)) => {
                integrity.push(format!("{key}: aggregate differs from the manifest"));
                format!("DIFFERS from the manifest's {a}")
            }
        };
        println!("  {:<16} {:>5} games  aggregate {agg}  {verdict}", key, got.len());
        json_aggregates.push(format!(
            "{{\"block\": {}, \"games\": {}, \"aggregate\": {}, \"manifest\": {}, \"verdict\": {}}}",
            js(key),
            got.len(),
            js(&agg),
            want.map(|w| js(&w.1)).unwrap_or_else(|| "null".into()),
            js(&verdict)
        ));
    }
    if sum(C::HeaderRevisionDiffers) > 0 {
        integrity.push(format!(
            "{} records name another revision",
            sum(C::HeaderRevisionDiffers)
        ));
    }
    if sum(C::HeaderRulesHashDiffers) > 0 {
        integrity.push(format!(
            "{} records name another rules hash",
            sum(C::HeaderRulesHashDiffers)
        ));
    }
    let cap_line: Vec<String> = order
        .iter()
        .map(|&g| format!("{} {}", GROUPS[g], acc.groups[g].get("capped")))
        .collect();
    println!("capped at 6000: {}  (G0a: none in H1-H3 or H5)", cap_line.join(", "));
    for g in [0usize, 1, 2, 4] {
        if acc.groups[g].get("capped") > 0 {
            integrity.push(format!("{} capped games in {}", acc.groups[g].get("capped"), GROUPS[g]));
        }
    }
    println!(
        "resolved === 9 alone: {} games (must be 0); coinciding with the clinch (5-4 at the 9th set): {}",
        sum_id("fallbackAlone"),
        sum_id("fallbackCoincided")
    );
    if sum_id("fallbackAlone") > 0 {
        integrity.push("the resolved === 9 terminator fired alone".into());
    }
    if acc.groups[1].get("games") > 0 {
        println!(
            "H2 bank seeds: {} of {} step counts equal the v0.54 bank's decision counts",
            sum(C::BankSeeds) - sum(C::BankSeedStepMismatch),
            sum(C::BankSeeds)
        );
        if sum(C::BankSeedStepMismatch) > 0 {
            integrity.push("an H2 bank game differs from its bank decision count".into());
        }
        let whole_h2 = files.iter().any(|f| f.0 == "H2-0-1800.tsv");
        if whole_h2 && args.max_games == 0 && sum(C::BankSeeds) != 36 {
            integrity.push(format!(
                "{} bank seeds found in the whole of H2, not 36",
                sum(C::BankSeeds)
            ));
        }
    }
    if sum(C::ActionKindNotInL) > 0 {
        integrity.push(format!(
            "{} recorded actions of a kind L_t says is illegal",
            sum(C::ActionKindNotInL)
        ));
    }
    println!(
        "legalActionsSummary vs L_t (the reducer's verdict): 'claim' listed with the us54 window closed at {} steps; other differences {} (information)",
        sum(C::SummaryClaimWindowClosed),
        sum(C::SummaryOtherDiff)
    );

    // The coverage table: the same lines as check-replay-corpus.mjs prints.
    let mut cols: Vec<&str> = order.iter().map(|&g| GROUPS[g]).collect();
    cols.push("total");
    let col_of = |c: &str, k: &str| -> u64 {
        if c == "total" {
            sum_id(k)
        } else {
            acc.groups[GROUPS.iter().position(|g| *g == c).unwrap()].get(k)
        }
    };
    println!("\nbranch coverage, floor {FLOOR} each over the corpus (§4.6):");
    println!(
        "| {:<58} | {} | floor |",
        "branch",
        cols.iter().map(|c| format!("{c:>8}")).collect::<Vec<_>>().join(" | ")
    );
    println!(
        "|{}|{}|:---:|",
        "-".repeat(60),
        cols.iter()
            .map(|_| format!("{}:", "-".repeat(9)))
            .collect::<Vec<_>>()
            .join("|")
    );
    let mut short: Vec<&str> = Vec::new();
    let mut json_rows: Vec<String> = Vec::new();
    for (id, label) in BRANCHES {
        let total = sum_id(id);
        let met = total >= FLOOR;
        if !met {
            short.push(id);
        }
        let label = if NEW_BRANCH_IDS.contains(&id) {
            format!("{label} (not counted before P0)")
        } else {
            label.to_string()
        };
        let per: Vec<String> = order
            .iter()
            .map(|&g| format!("{}: {}", js(GROUPS[g]), acc.groups[g].get(id)))
            .collect();
        json_rows.push(format!(
            "{{\"id\": {}, \"label\": {}, \"perPopulation\": {{{}}}, \"total\": {total}, \"met\": {met}}}",
            js(id),
            js(&label),
            per.join(", ")
        ));
        println!(
            "| {:<58} | {} | {} |",
            label,
            cols.iter()
                .map(|c| format!("{:>8}", col_of(c, id)))
                .collect::<Vec<_>>()
                .join(" | "),
            if met { " met " } else { "SHORT" }
        );
    }
    for k in INFO_ROWS {
        println!(
            "| {:<58} | {} |       |",
            format!("(information) {k}"),
            cols.iter()
                .map(|c| format!("{:>8}", col_of(c, k)))
                .collect::<Vec<_>>()
                .join(" | ")
        );
    }

    acc.bad.sort_by(|a, b| a.file.cmp(&b.file).then(a.index.cmp(&b.index)));
    for b in acc.bad.iter().take(BAD_KEEP) {
        let ms: Vec<String> = b
            .mismatches
            .iter()
            .map(|m| format!("{}@{} {}", m.what, m.at, m.detail))
            .collect();
        println!(
            "MISMATCH {} #{} {}: first divergence at step {}: {}",
            b.population,
            b.index,
            b.seed,
            b.first_step,
            ms.join("; ")
        );
    }
    for s in &integrity {
        println!("!!! {s}");
    }
    let bad = sum(C::RecordsBad);
    let (verdict, code) = if args.mutant != Mutant::None {
        let per: Vec<String> = order
            .iter()
            .map(|&g| format!("{} {}", GROUPS[g], acc.groups[g].at(C::RecordsBad)))
            .collect();
        let caught = bad > 0;
        println!(
            "\nmutant {:?}: {bad} of {games} games diverge ({}) -> {}",
            args.mutant,
            per.join(", "),
            if caught {
                "CAUGHT: the mutant fails G0a, as it must"
            } else {
                "NOT CAUGHT"
            }
        );
        (
            if caught { "mutant caught" } else { "mutant NOT caught" }.to_string(),
            if caught { ExitCode::SUCCESS } else { ExitCode::from(2) },
        )
    } else if !integrity.is_empty() {
        ("FAIL (integrity)".to_string(), ExitCode::from(1))
    } else if !short.is_empty() {
        (format!("floors short: {}", short.join(", ")), ExitCode::from(3))
    } else {
        ("PASS".to_string(), ExitCode::SUCCESS)
    };
    if args.mutant == Mutant::None {
        println!("\nG0a (i), port replay: {verdict}");
    }
    if let Some(path) = &args.json {
        let per_group = |k: C| -> String {
            order
                .iter()
                .map(|&g| format!("{}: {}", js(GROUPS[g]), acc.groups[g].at(k)))
                .collect::<Vec<_>>()
                .join(", ")
        };
        let command = std::iter::once("replay-check".to_string())
            .chain(std::env::args().skip(1))
            .collect::<Vec<_>>()
            .join(" ");
        let unix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let first: Vec<String> = acc
            .bad
            .iter()
            .take(5)
            .map(|b| {
                let m = b.mismatches.first();
                format!(
                    "{{\"population\": {}, \"index\": {}, \"seed\": {}, \"step\": {}, \"field\": {}, \"detail\": {}}}",
                    js(&b.population),
                    b.index,
                    js(&b.seed),
                    b.first_step,
                    js(m.map(|m| m.what).unwrap_or("")),
                    js(&m.map(|m| m.detail.clone()).unwrap_or_default())
                )
            })
            .collect();
        let json = format!(
            "{{\n  \"tool\": \"athena-env replay-check\",\n  \"command\": {},\n  \"unixTime\": {unix},\n  \"threads\": {},\n  \"mutant\": {},\n  \"seconds\": {:.3},\n  \"gamesPerSecond\": {:.0},\n  \"stepsPerSecond\": {:.0},\n  \"games\": {games},\n  \"steps\": {steps},\n  \"recordsOk\": {},\n  \"recordsBad\": {bad},\n  \"divergentByPopulation\": {{{}}},\n  \"firstDivergences\": [{}],\n  \"probeVerdicts\": {},\n  \"probeAccepted\": {},\n  \"probeCodeDiffs\": {},\n  \"capped\": {{{}}},\n  \"fallbackAlone\": {},\n  \"fallbackCoincided\": {},\n  \"bankSeeds\": {},\n  \"bankSeedStepMismatch\": {},\n  \"aggregates\": [{}],\n  \"integrity\": [{}],\n  \"coverage\": {{\"floor\": {FLOOR}, \"rows\": [\n    {}\n  ], \"short\": [{}]}},\n  \"verdict\": {}\n}}\n",
            js(&command),
            args.threads,
            js(&format!("{:?}", args.mutant)),
            seconds,
            games as f64 / seconds,
            steps as f64 / seconds,
            sum(C::RecordsOk),
            per_group(C::RecordsBad),
            first.join(", "),
            sum(C::ProbeVerdicts),
            sum(C::ProbeAccepted),
            sum(C::CodeDiffs),
            per_group(C::Capped),
            sum_id("fallbackAlone"),
            sum_id("fallbackCoincided"),
            sum(C::BankSeeds),
            sum(C::BankSeedStepMismatch),
            json_aggregates.join(", "),
            integrity.iter().map(|s| js(s)).collect::<Vec<_>>().join(", "),
            json_rows.join(",\n    "),
            short.iter().map(|s| js(s)).collect::<Vec<_>>().join(", "),
            js(&verdict)
        );
        if let Err(e) = fs::write(path, json) {
            eprintln!("--json {}: {e}", path.display());
        }
    }
    code
}
