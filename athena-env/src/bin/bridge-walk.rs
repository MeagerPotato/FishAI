//! bridge-walk: G0a (ii) for the Rust port, the bridge walk (ATHENA.md §4.6 G0a (ii); replay-format.md §12).
//!
//! ```text
//! cargo run --release --bin bridge-walk -- --records DIR --expected FILE [--manifest FILE] [--threads 1..4]
//!     [--json FILE] [--show N]
//! cargo run --release --features mutants --bin bridge-walk -- ... --control score-by-side|full-reveal
//! ```
//!
//! Every cell named in the expected file (`scripts/athena/emit-bridge-views.mjs`'s output) is read from DIR by the
//! port's own reader (`athena_env::bridge`, std only): each `fish_record` line is parsed, translated by
//! `bridge-records.mjs`'s rules, and walked ask by ask into the asking seat's view, with the host's reduced reveal and
//! the score by team. Each view's digest is compared with the reference's. The first divergence of a game names the
//! game, the ask, its event, and the fields whose fingerprints differ.
//!
//! The manifest (default: `<expected stem>.manifest.json` beside the expected file; a repository manifest with
//! `sets` is read at the expected file's set) gives the reference's per-cell aggregates, which the port's must equal,
//! and its information counts, which are compared and reported.
//!
//! Exit 0: every view digest equal, every game and ask accounted for, every aggregate equal. 1: anything else.
//! With `--control`: exit 0 when the control is caught (at least one view digest differs), 2 when it is not.

use athena_env::bridge::json::{self, Json};
use athena_env::bridge::{
    describe_view, differing_fields, game_digest, record_lines, view_fingerprints, walk_asks, BridgeGame, Control,
    Line, RecordReader, FORMAT_BRIDGE,
};
use athena_env::cards::{team, NONE};
use athena_env::digest::{digest, hex_string, parse_hex16, ByteDigest};
use athena_env::rules::Event;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

struct Args {
    records: PathBuf,
    expected: PathBuf,
    manifest: Option<PathBuf>,
    threads: usize,
    control: Control,
    json: Option<PathBuf>,
    show: usize,
}

fn usage() -> ! {
    eprintln!(
        "usage: bridge-walk --records DIR --expected FILE [--manifest FILE] [--threads 1..4] [--json FILE] [--show N] [--control score-by-side|full-reveal]"
    );
    std::process::exit(2);
}

fn parse_args() -> Args {
    let mut records = None;
    let mut expected = None;
    let mut a = Args {
        records: PathBuf::new(),
        expected: PathBuf::new(),
        manifest: None,
        threads: 4,
        control: Control::None,
        json: None,
        show: 8,
    };
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < argv.len() {
        let val = |i: usize| argv.get(i + 1).cloned().unwrap_or_else(|| usage());
        match argv[i].as_str() {
            "--records" => records = Some(PathBuf::from(val(i))),
            "--expected" => expected = Some(PathBuf::from(val(i))),
            "--manifest" => a.manifest = Some(PathBuf::from(val(i))),
            "--threads" | "--workers" => {
                a.threads = val(i).parse().unwrap_or_else(|_| usage());
                if !(1..=4).contains(&a.threads) {
                    eprintln!("--threads must be 1..4 (at most 4 threads)");
                    std::process::exit(2);
                }
            }
            "--control" => {
                a.control = Control::parse(&val(i)).unwrap_or_else(|| usage());
                if a.control != Control::None && !cfg!(feature = "mutants") {
                    eprintln!("--control needs the mutants feature: cargo run --release --features mutants --bin bridge-walk -- ...");
                    std::process::exit(2);
                }
            }
            "--json" => a.json = Some(PathBuf::from(val(i))),
            "--show" => a.show = val(i).parse().unwrap_or_else(|_| usage()),
            "-h" | "--help" => usage(),
            other => {
                eprintln!("unknown argument {other}");
                usage();
            }
        }
        i += 2;
    }
    match (records, expected) {
        (Some(r), Some(e)) => {
            a.records = r;
            a.expected = e;
        }
        _ => usage(),
    }
    a
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

/* ------------------------------------------------------------ the expected file --- */

/// One game line of the expected file (replay-format.md §12.5).
struct Expected {
    deal: String,
    rot: String,
    orient: String,
    events: u64,
    asks: u64,
    v: String,
    f: String,
    game: String,
}

/// The expected file: the cells in order of first appearance, and each cell's games in index order.
type ExpectedFile = (Vec<String>, HashMap<String, Vec<Expected>>);

/// Read the expected file.
fn read_expected(path: &Path) -> Result<ExpectedFile, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut order = Vec::new();
    let mut cells: HashMap<String, Vec<Expected>> = HashMap::new();
    for (n, line) in text.lines().enumerate() {
        if line.is_empty() {
            continue;
        }
        let c: Vec<&str> = line.split('\t').collect();
        if c.len() != 11 || c[0] != FORMAT_BRIDGE {
            return Err(format!("expected line {}: not an {FORMAT_BRIDGE} line", n + 1));
        }
        let num = |s: &str| {
            s.parse::<u64>()
                .map_err(|_| format!("expected line {}: {s:?} is not a count", n + 1))
        };
        let (index, events, asks) = (num(c[2])?, num(c[6])?, num(c[7])?);
        if c[8].len() as u64 != 16 * asks || c[9].len() as u64 != 16 * asks || c[10].len() != 16 {
            return Err(format!(
                "expected line {}: a column's length does not match {asks} asks",
                n + 1
            ));
        }
        let list = cells.entry(c[1].to_string()).or_insert_with(|| {
            order.push(c[1].to_string());
            Vec::new()
        });
        if index != list.len() as u64 {
            return Err(format!(
                "expected line {}: index {index} out of order in {}",
                n + 1,
                c[1]
            ));
        }
        list.push(Expected {
            deal: c[3].to_string(),
            rot: c[4].to_string(),
            orient: c[5].to_string(),
            events,
            asks,
            v: c[8].to_string(),
            f: c[9].to_string(),
            game: c[10].to_string(),
        });
    }
    Ok((order, cells))
}

/// The reference's per-cell entries from a manifest: the emitter's own (`cells`), or a repository manifest's set.
fn read_manifest(path: &Path, set: &str) -> Result<HashMap<String, Json>, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let m = json::parse(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    let entry = match m.get("sets") {
        Some(sets) => sets
            .get(set)
            .ok_or_else(|| format!("{}: no set {set:?}", path.display()))?,
        None => &m,
    };
    let cells = entry
        .get("cells")
        .and_then(Json::as_array)
        .ok_or_else(|| format!("{}: no cells list", path.display()))?;
    let mut out = HashMap::new();
    for c in cells {
        if let Some(name) = c.get("cell").and_then(Json::as_str) {
            out.insert(name.to_string(), c.clone());
        }
    }
    Ok(out)
}

/* ------------------------------------------------------------------ the work --- */

/// The first divergence of one game.
#[derive(Clone)]
struct Divergence {
    cell: String,
    index: u64,
    deal: String,
    rot: String,
    orient: String,
    /// The ask's ordinal, or -1 when no ask is to blame (a reader refusal, a missing or extra game).
    ask: i64,
    /// The ask's event index (its `moveIndex`), or -1.
    event: i64,
    field: String,
    detail: String,
}

/// The counts the reference's manifest carries per cell, in its key names.
const INFO_KEYS: [&str; 11] = [
    "games",
    "events",
    "asks",
    "asksArmA",
    "asksArmB",
    "wrongDeclares",
    "forcedDeclares",
    "hiddenHolders",
    "hiddenViews",
    "asymmetricScoreViews",
    "asymmetricScoreViewsTeamA1",
];

#[derive(Default)]
struct CellResult {
    cell: String,
    games_expected: u64,
    asks_expected: u64,
    /// Games the port read and walked.
    games: u64,
    games_equal: u64,
    divergent_games: u64,
    /// Views compared: per game, the larger of the port's and the reference's ask counts.
    compared: u64,
    equal: u64,
    reader_errors: u64,
    identity_differs: u64,
    events_differ: u64,
    game_digest_differs: u64,
    /// The port's counts, keyed as [`INFO_KEYS`].
    info: [u64; 11],
    game_digests: Vec<(f64, f64, u64)>,
    first: Vec<Divergence>,
    seconds: f64,
}

impl CellResult {
    fn aggregate(&self) -> u64 {
        let mut d = ByteDigest::new();
        for g in &self.game_digests {
            d.push(&athena_env::digest::hex16(g.2));
        }
        d.value()
    }

    fn sorted_aggregate(&self) -> u64 {
        let mut s = self.game_digests.clone();
        s.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
        let mut d = ByteDigest::new();
        for g in &s {
            d.push(&athena_env::digest::hex16(g.2));
        }
        d.value()
    }
}

fn hex_at(s: &str, k: usize) -> Option<u64> {
    s.get(16 * k..16 * k + 16).and_then(|x| parse_hex16(x.as_bytes()))
}

fn game_info(g: &BridgeGame) -> (u64, u64) {
    let mut wrong = 0;
    let mut hidden = 0;
    for e in &g.events {
        if let Event::Claim {
            claimer,
            holders,
            outcome,
            ..
        } = *e
        {
            if outcome != team(claimer) {
                wrong += 1;
                hidden += holders.iter().filter(|&&h| h == NONE).count() as u64;
            }
        }
    }
    (wrong, hidden)
}

fn walk_cell(cell: &str, dir: &Path, expected: &[Expected], control: Control, show: usize) -> CellResult {
    let t0 = Instant::now();
    let mut r = CellResult {
        cell: cell.to_string(),
        games_expected: expected.len() as u64,
        asks_expected: expected.iter().map(|e| e.asks).sum(),
        ..Default::default()
    };
    let diverge = |r: &mut CellResult, d: Divergence| {
        r.divergent_games += 1;
        if r.first.len() < show {
            r.first.push(d);
        }
    };
    let text = match fs::read_to_string(dir.join(cell)) {
        Ok(t) => t,
        Err(e) => {
            r.reader_errors += 1;
            diverge(
                &mut r,
                Divergence {
                    cell: cell.to_string(),
                    index: 0,
                    deal: String::new(),
                    rot: String::new(),
                    orient: String::new(),
                    ask: -1,
                    event: -1,
                    field: "file".to_string(),
                    detail: e.to_string(),
                },
            );
            r.compared = r.asks_expected;
            return r;
        }
    };
    let mut reader = RecordReader::new(control);
    let mut index = 0usize;
    for line in record_lines(&text) {
        let g = match reader.read_line(line) {
            Ok(Line::Header) => continue,
            Ok(Line::Game(g)) => Ok(g),
            Err(e) => Err(e),
        };
        let exp = expected.get(index);
        let blank = |field: &str, detail: String| Divergence {
            cell: cell.to_string(),
            index: index as u64,
            deal: exp.map_or(String::new(), |e| e.deal.clone()),
            rot: exp.map_or(String::new(), |e| e.rot.clone()),
            orient: exp.map_or(String::new(), |e| e.orient.clone()),
            ask: -1,
            event: -1,
            field: field.to_string(),
            detail,
        };
        let g = match g {
            Ok(g) => g,
            Err(e) => {
                // a line the port's reader refused: the reference read it (or the expected file would not exist)
                r.reader_errors += 1;
                r.compared += exp.map_or(0, |e| e.asks);
                diverge(&mut r, blank("reader", e));
                index += 1;
                continue;
            }
        };
        r.games += 1;
        let Some(exp) = exp else {
            diverge(&mut r, blank("game", "a game the reference did not write".to_string()));
            index += 1;
            continue;
        };
        let mut views: Vec<u64> = Vec::with_capacity(exp.asks as usize);
        let mut equal = 0u64;
        let mut first: Option<Divergence> = None;
        let walked = walk_asks(&g, control, |a| {
            let d = digest(a.view);
            views.push(d);
            let k = a.k as usize;
            if hex_at(&exp.v, k) == Some(d) {
                equal += 1;
            } else if first.is_none() {
                let fp = view_fingerprints(a.view);
                let (field, note) = match hex_at(&exp.f, k) {
                    Some(want) => {
                        let fields = differing_fields(fp, want);
                        if fields.is_empty() {
                            (
                                "view".to_string(),
                                "no field fingerprint differs (a one-byte collision): field unknown".to_string(),
                            )
                        } else {
                            (fields.join(","), String::new())
                        }
                    }
                    None => ("view".to_string(), "an ask past the reference's last".to_string()),
                };
                first = Some(Divergence {
                    cell: cell.to_string(),
                    index: index as u64,
                    deal: exp.deal.clone(),
                    rot: exp.rot.clone(),
                    orient: exp.orient.clone(),
                    ask: k as i64,
                    event: a.event as i64,
                    field,
                    detail: format!(
                        "seat {} view digest {} vs the reference's {}{}; port view: {}",
                        a.asker,
                        hex_string(d),
                        exp.v.get(16 * k..16 * k + 16).unwrap_or("(none)"),
                        if note.is_empty() {
                            String::new()
                        } else {
                            format!(" ({note})")
                        },
                        describe_view(a.view)
                    ),
                });
            }
        });
        let info = match walked {
            Ok(info) => info,
            Err(e) => {
                r.reader_errors += 1;
                r.compared += exp.asks;
                diverge(&mut r, blank("walk", e));
                index += 1;
                continue;
            }
        };
        let port_asks = views.len() as u64;
        r.compared += port_asks.max(exp.asks);
        r.equal += equal;
        let identity = g.deal == exp.deal && g.rot == exp.rot && g.team_a.to_string() == exp.orient;
        if !identity {
            r.identity_differs += 1;
        }
        if g.events.len() as u64 != exp.events {
            r.events_differ += 1;
        }
        let gd = game_digest(&views);
        let game_ok = parse_hex16(exp.game.as_bytes()) == Some(gd);
        if !game_ok {
            r.game_digest_differs += 1;
        }
        let views_ok = equal == exp.asks && port_asks == exp.asks;
        if views_ok && identity && game_ok && g.events.len() as u64 == exp.events {
            r.games_equal += 1;
        } else {
            let d = first.unwrap_or_else(|| {
                let (field, detail) = if port_asks != exp.asks {
                    (
                        "asks",
                        format!("the port walked {port_asks} asks, the reference {}", exp.asks),
                    )
                } else if !identity {
                    (
                        "identity",
                        format!(
                            "the port read deal {} rot {} orient {}, the reference {} {} {}",
                            g.deal, g.rot, g.team_a, exp.deal, exp.rot, exp.orient
                        ),
                    )
                } else if g.events.len() as u64 != exp.events {
                    (
                        "events",
                        format!(
                            "the port's log has {} events, the reference's {}",
                            g.events.len(),
                            exp.events
                        ),
                    )
                } else {
                    ("game", format!("game digest {} vs {}", hex_string(gd), exp.game))
                };
                blank(field, detail)
            });
            diverge(&mut r, d);
        }
        let (wrong, hidden) = game_info(&g);
        let add = [
            1,
            g.events.len() as u64,
            port_asks,
            info.asks_arm_a as u64,
            (info.asks - info.asks_arm_a) as u64,
            wrong,
            g.forced as u64,
            hidden,
            info.hidden_views as u64,
            info.asymmetric_score_views as u64,
            if g.team_a == 1 {
                info.asymmetric_score_views as u64
            } else {
                0
            },
        ];
        for (acc, x) in r.info.iter_mut().zip(add) {
            *acc += x;
        }
        let num = |s: &str| s.parse::<f64>().unwrap_or(f64::NAN);
        r.game_digests.push((num(&g.deal), num(&g.rot), gd));
        index += 1;
    }
    if index < expected.len() {
        for e in &expected[index..] {
            r.compared += e.asks;
        }
        let missing = (expected.len() - index) as u64;
        r.divergent_games += missing - 1;
        diverge(
            &mut r,
            Divergence {
                cell: cell.to_string(),
                index: index as u64,
                deal: expected[index].deal.clone(),
                rot: expected[index].rot.clone(),
                orient: expected[index].orient.clone(),
                ask: -1,
                event: -1,
                field: "game".to_string(),
                detail: format!("{missing} game(s) of the reference's are missing from the records"),
            },
        );
    }
    r.seconds = t0.elapsed().as_secs_f64();
    r
}

fn main() -> ExitCode {
    let args = parse_args();
    let t0 = Instant::now();
    let (order, expected) = match read_expected(&args.expected) {
        Ok(x) => x,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::from(2);
        }
    };
    let set = args
        .expected
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let manifest_path = args.manifest.clone().or_else(|| {
        let p = args.expected.with_file_name(format!("{set}.manifest.json"));
        p.exists().then_some(p)
    });
    let manifest = match &manifest_path {
        Some(p) => match read_manifest(p, &set) {
            Ok(m) => Some(m),
            Err(e) => {
                eprintln!("{e}");
                return ExitCode::from(2);
            }
        },
        None => None,
    };
    let games_expected: usize = expected.values().map(Vec::len).sum();
    let asks_expected: u64 = expected.values().flatten().map(|e| e.asks).sum();
    println!("=== ATHENA P0 G0a (ii): the bridge walk, the Rust port (athena-env) against the reference's views ===");
    println!(
        "records {}; expected {} ({} cells, {} games, {} asks); manifest {}; {} thread{}; control {}",
        args.records.display(),
        args.expected.display(),
        order.len(),
        games_expected,
        asks_expected,
        manifest_path
            .as_ref()
            .map_or("(none)".to_string(), |p| p.display().to_string()),
        args.threads,
        if args.threads == 1 { "" } else { "s" },
        args.control.name()
    );

    let next = AtomicUsize::new(0);
    let results: Mutex<Vec<(usize, CellResult)>> = Mutex::new(Vec::new());
    std::thread::scope(|s| {
        for _ in 0..args.threads.min(order.len().max(1)) {
            s.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                let Some(cell) = order.get(i) else { break };
                let r = walk_cell(cell, &args.records, &expected[cell], args.control, args.show);
                results.lock().expect("a worker panicked").push((i, r));
            });
        }
    });
    let mut results = results.into_inner().expect("a worker panicked");
    results.sort_by_key(|x| x.0);
    let results: Vec<CellResult> = results.into_iter().map(|x| x.1).collect();
    let seconds = t0.elapsed().as_secs_f64();

    // Per cell: the port's aggregates against the manifest's, and its information counts against the reference's.
    println!(
        "{:<30} {:>6} {:>8} {:>8} {:>7} {:>6}  {:<16} {:<16} {:<16}",
        "cell", "games", "asks", "equal", "differ", "bad", "aggregate", "manifest", "sorted"
    );
    let mut integrity: Vec<String> = Vec::new();
    let mut info_diffs: Vec<String> = Vec::new();
    let mut agg_rows = Vec::new();
    for r in &results {
        let agg = hex_string(r.aggregate());
        let sorted = hex_string(r.sorted_aggregate());
        let m = manifest.as_ref().and_then(|m| m.get(&r.cell));
        let magg = m
            .and_then(|m| m.get("aggregate"))
            .and_then(Json::as_str)
            .unwrap_or("-")
            .to_string();
        let msorted = m
            .and_then(|m| m.get("sortedAggregate"))
            .and_then(Json::as_str)
            .unwrap_or("-")
            .to_string();
        println!(
            "{:<30} {:>6} {:>8} {:>8} {:>7} {:>6}  {:<16} {:<16} {:<16}",
            r.cell,
            r.games,
            r.compared,
            r.equal,
            r.compared - r.equal,
            r.divergent_games,
            agg,
            magg,
            sorted
        );
        if manifest.is_some() {
            if m.is_none() {
                integrity.push(format!("{}: not in the manifest", r.cell));
            } else {
                if agg != magg {
                    integrity.push(format!("{}: aggregate {agg} but the manifest says {magg}", r.cell));
                }
                if sorted != msorted {
                    integrity.push(format!(
                        "{}: sorted aggregate {sorted} but the manifest says {msorted}",
                        r.cell
                    ));
                }
                for (k, &port) in INFO_KEYS.iter().zip(r.info.iter()) {
                    let want = m.and_then(|m| m.get(k)).and_then(Json::as_f64);
                    if want != Some(port as f64) {
                        info_diffs.push(format!("{}: {k} {port} vs the reference's {want:?}", r.cell));
                    }
                }
            }
        }
        if r.games != r.games_expected {
            integrity.push(format!(
                "{}: the port read {} games, the reference {}",
                r.cell, r.games, r.games_expected
            ));
        }
        agg_rows.push((r.cell.clone(), r.games, agg, magg, sorted, msorted));
    }
    let sum = |f: fn(&CellResult) -> u64| results.iter().map(f).sum::<u64>();
    let games = sum(|r| r.games);
    let compared = sum(|r| r.compared);
    let equal = sum(|r| r.equal);
    let divergent = sum(|r| r.divergent_games);
    let reader_errors = sum(|r| r.reader_errors);
    let games_equal = sum(|r| r.games_equal);
    let mut info_total = [0u64; 11];
    for r in &results {
        for (a, b) in info_total.iter_mut().zip(r.info) {
            *a += b;
        }
    }
    println!(
        "total: {games} games walked ({games_expected} expected), {games_equal} games equal, {divergent} divergent; \
         {compared} asks compared ({asks_expected} expected), {equal} view digests equal, {} differ; \
         {reader_errors} reader or walk refusals; {seconds:.3}s ({:.0} games/s, {:.0} asks/s)",
        compared - equal,
        games as f64 / seconds,
        compared as f64 / seconds
    );
    println!(
        "information: asks by arm A {}, by SESTINA {}; wrong declares {} (forced declares {}), holders unrevealed {}, \
         views that show one {}; views with an uneven score {} (arm A on team 1: {})",
        info_total[3],
        info_total[4],
        info_total[5],
        info_total[6],
        info_total[7],
        info_total[8],
        info_total[9],
        info_total[10]
    );
    if manifest.is_some() {
        if info_diffs.is_empty() {
            println!("information counts: equal to the reference's in every cell");
        } else {
            println!("information counts: {} differ from the reference's", info_diffs.len());
            for d in info_diffs.iter().take(12) {
                println!("  {d}");
            }
        }
    }
    for i in &integrity {
        println!("INTEGRITY: {i}");
    }
    let firsts: Vec<&Divergence> = results.iter().flat_map(|r| r.first.iter()).take(args.show).collect();
    for d in &firsts {
        println!(
            "FIRST DIVERGENCE: {} game {} (deal {} rot {} orient {}) ask {} event {} field {}: {}",
            d.cell, d.index, d.deal, d.rot, d.orient, d.ask, d.event, d.field, d.detail
        );
    }
    let all_equal = equal == asks_expected && compared == asks_expected && divergent == 0 && reader_errors == 0;
    let (verdict, code) = if args.control == Control::None {
        if all_equal && integrity.is_empty() && games as usize == games_expected {
            ("PASS", 0u8)
        } else {
            ("FAIL", 1u8)
        }
    } else if compared > equal {
        ("control caught", 0)
    } else {
        ("control NOT caught", 2)
    };
    println!("VERDICT: {verdict}");

    if let Some(path) = &args.json {
        let cells: Vec<String> = results
            .iter()
            .zip(agg_rows.iter())
            .map(|(r, (cell, g, agg, magg, sorted, msorted))| {
                let info: Vec<String> = INFO_KEYS
                    .iter()
                    .zip(r.info.iter())
                    .map(|(k, v)| format!("{}: {v}", js(k)))
                    .collect();
                format!(
                    "{{\"cell\": {}, \"games\": {g}, \"gamesExpected\": {}, \"gamesEqual\": {}, \"divergentGames\": {}, \"asksCompared\": {}, \"asksExpected\": {}, \"viewDigestsEqual\": {}, \"readerRefusals\": {}, \"aggregate\": {}, \"manifestAggregate\": {}, \"sortedAggregate\": {}, \"manifestSortedAggregate\": {}, \"seconds\": {:.3}, \"info\": {{{}}}}}",
                    js(cell),
                    r.games_expected,
                    r.games_equal,
                    r.divergent_games,
                    r.compared,
                    r.asks_expected,
                    r.equal,
                    r.reader_errors,
                    js(agg),
                    js(magg),
                    js(sorted),
                    js(msorted),
                    r.seconds,
                    info.join(", ")
                )
            })
            .collect();
        let firsts_json: Vec<String> = firsts
            .iter()
            .map(|d| {
                format!(
                    "{{\"cell\": {}, \"index\": {}, \"deal\": {}, \"rot\": {}, \"orient\": {}, \"ask\": {}, \"event\": {}, \"field\": {}, \"detail\": {}}}",
                    js(&d.cell),
                    d.index,
                    js(&d.deal),
                    js(&d.rot),
                    js(&d.orient),
                    d.ask,
                    d.event,
                    js(&d.field),
                    js(&d.detail)
                )
            })
            .collect();
        let info: Vec<String> = INFO_KEYS
            .iter()
            .zip(info_total.iter())
            .map(|(k, v)| format!("{}: {v}", js(k)))
            .collect();
        let out = format!(
            "{{\n  \"gate\": \"ATHENA.md §4.6 G0a (ii): the port's bridge walk reproduces walkAsks's views\",\n  \"records\": {},\n  \"expected\": {},\n  \"manifest\": {},\n  \"threads\": {},\n  \"control\": {},\n  \"seconds\": {:.3},\n  \"games\": {games},\n  \"gamesExpected\": {games_expected},\n  \"gamesEqual\": {games_equal},\n  \"divergentGames\": {divergent},\n  \"asksCompared\": {compared},\n  \"asksExpected\": {asks_expected},\n  \"viewDigestsEqual\": {equal},\n  \"readerRefusals\": {reader_errors},\n  \"info\": {{{}}},\n  \"informationCountsEqual\": {},\n  \"integrity\": [{}],\n  \"cells\": [\n    {}\n  ],\n  \"firstDivergences\": [{}],\n  \"verdict\": {}\n}}\n",
            js(&args.records.display().to_string().replace('\\', "/")),
            js(&args.expected.display().to_string().replace('\\', "/")),
            manifest_path
                .as_ref()
                .map_or("null".to_string(), |p| js(&p.display().to_string().replace('\\', "/"))),
            args.threads,
            js(args.control.name()),
            seconds,
            info.join(", "),
            if manifest.is_some() {
                (info_diffs.is_empty()).to_string()
            } else {
                "null".to_string()
            },
            integrity.iter().map(|s| js(s)).collect::<Vec<_>>().join(", "),
            cells.join(",\n    "),
            firsts_json.join(", "),
            js(verdict)
        );
        if let Err(e) = fs::write(path, out) {
            eprintln!("{}: {e}", path.display());
        }
    }
    ExitCode::from(code)
}
