//! facts-check: ATHENA P1's G1a checks 1-5 and G1b for the Rust port (ATHENA.md §8.1, §8.2).
//!
//! ```text
//! cargo run --release --bin facts-check -- home [--corpus DIR] [--facts DIR] [--population H1,...] [--max-games N]
//!     [--threads 1..4] [--json FILE] [--show N]
//! cargo run --release --bin facts-check -- bridge [--records DIR] [--prefix panel-sestina-] [--facts DIR]
//!     [--threads 1..4] [--json FILE] [--show N]
//! cargo run --release --bin facts-check -- dump <corpus file>:<index>:<step> [--corpus DIR]
//! cargo run --release --features mutants --bin facts-check -- home ... --mutant M6|M7
//! cargo run --release --features mutants --bin facts-check -- home ... --control full-reveal
//! ```
//!
//! **home** reads every corpus record (`athena-replay-1`) and its line of `scripts/athena/emit-facts.mjs home` (the
//! reference's facts, `<facts>/home/<file>`), and plays the record's actions through two batches of the port's
//! `VecEnv`, one per regime, with the facts on:
//! - **check 1** (G1a): at every step, the digest of the six seats' facts (`VecEnv::facts_of`, in the canonical
//!   encoding `athena-facts-1`) equals the reference's `F`;
//! - **check 3** (G1a): at every window offer, the rail of the acting seat's facts row (the batch API's buffer)
//!   equals `railPlan`'s: one digest a game, `R`;
//! - **G1b**: at every step, the bridge batch's view digest of the acting seat (`VecEnv::digests`) equals the
//!   reference's `encodeView(..., 'reduced')`, `B`; and the acting seat's facts in that batch equal the reference's
//!   facts of that view (`G`, one digest a game; information);
//! - **the start seat**: the `game_started` row the observation delivers names the first event's actor; the rate at
//!   which that is not the true start seat is reported;
//! - **check 5**: the coverage counts over the home views (constraint, exhaustion, a singleton reached only by
//!   propagation), from the port's own computation, and the most distinct constraints any view has (the facts row
//!   holds `MAX_CONS`).
//!
//! **bridge** (check 2) reads the bridge's record files with the port's own reader and walk (`athena_env::bridge`,
//! G0a (ii)) and at every ask computes the asking seat's facts from the view the walk hands out (the hand, the
//! counts and the resolved sets of its bytes, the log so far), and compares their digest with the reference's
//! (`<facts>/bridge/<file>.tsv`).
//!
//! **Check 4**: with `--mutant M6` or `--mutant M7` (the `mutants` feature), check 1 must fail; the exit code is 0
//! when it does. **G1b's control**: with `--control full-reveal`, the bridge batch publishes every holder, and `B`
//! must differ; the exit code is 0 when it does.
//!
//! **dump** prints the port's facts of one corpus state in words, beside `emit-facts.mjs dump home:...`.
//!
//! Exit 0: every comparison held (or, with a mutant or the control, it was caught). 1: anything else.

use athena_env::bridge::{record_lines, walk_asks, Control, Line, RecordReader};
use athena_env::cards::{NCARDS, NONE, NSEATS, NSETS, SET_CARDS};
use athena_env::codec::decode_action;
use athena_env::digest::{decode_hex_into, digest, hex_string, parse_hex16, ByteDigest};
use athena_env::facts::{rail, resolved_mask, Facts, FactsInfo, FactsMutant, Walk, REGIME_BRIDGE};
use athena_env::replay::parse_line;
use athena_env::vecenv::{
    abs_seat, encode_action, ObsOut, StepOut, VecEnv, A_DECLINE, EVENT_LEN, E_ACTOR, E_TYPE, FACTS_LEN, F_RAIL,
    F_RAIL_ASSIGN, LEGAL_LEN, MAX_EVENTS, OBS_LEN, O_WINDOW,
};
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

const DEFAULT_CORPUS: &str = "C:/Projects/FishAI-bench/athena/corpus/7d85c2e";
const DEFAULT_FACTS: &str = "C:/Projects/FishAI-bench/athena/p1/a/facts";
const DEFAULT_RECORDS: &str = "C:/Projects/FishAI-bench/bridge/monet-v55/records";
const DEFAULT_PREFIX: &str = "panel-sestina-";
const FORMAT_HOME: &str = "athena-facts-home-1";
const FORMAT_BRIDGE: &str = "athena-facts-bridge-1";
/// Games a batch: each thread plays its batches through one home and one bridge `VecEnv`.
const BATCH: usize = 16;

struct Args {
    mode: String,
    spec: String,
    corpus: PathBuf,
    facts: PathBuf,
    records: PathBuf,
    prefix: String,
    pops: Option<Vec<String>>,
    max_games: usize,
    threads: usize,
    mutant: FactsMutant,
    control: bool,
    json: Option<PathBuf>,
    show: usize,
}

fn usage() -> ! {
    eprintln!(
        "usage: facts-check home|bridge|dump [<file>:<index>:<step>] [--corpus DIR] [--facts DIR] [--records DIR] \
         [--prefix P] [--population H1,...] [--max-games N] [--threads 1..4] [--json FILE] [--show N] \
         [--mutant M6|M7] [--control full-reveal]"
    );
    std::process::exit(2);
}

fn parse_args() -> Args {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    if argv.is_empty() {
        usage();
    }
    let mut a = Args {
        mode: argv[0].clone(),
        spec: String::new(),
        corpus: PathBuf::from(DEFAULT_CORPUS),
        facts: PathBuf::from(DEFAULT_FACTS),
        records: PathBuf::from(DEFAULT_RECORDS),
        prefix: DEFAULT_PREFIX.to_string(),
        pops: None,
        max_games: 0,
        threads: 4,
        mutant: FactsMutant::None,
        control: false,
        json: None,
        show: 8,
    };
    let mut i = 1;
    if a.mode == "dump" {
        a.spec = argv.get(1).cloned().unwrap_or_else(|| usage());
        i = 2;
    }
    while i < argv.len() {
        let val = |i: usize| argv.get(i + 1).cloned().unwrap_or_else(|| usage());
        match argv[i].as_str() {
            "--corpus" => a.corpus = PathBuf::from(val(i)),
            "--facts" => a.facts = PathBuf::from(val(i)),
            "--records" => a.records = PathBuf::from(val(i)),
            "--prefix" => a.prefix = val(i),
            "--population" => a.pops = Some(val(i).split(',').map(|s| s.trim().to_ascii_uppercase()).collect()),
            "--max-games" => a.max_games = val(i).parse().unwrap_or_else(|_| usage()),
            "--threads" => {
                a.threads = val(i).parse().unwrap_or_else(|_| usage());
                if !(1..=4).contains(&a.threads) {
                    eprintln!("--threads must be 1..4 (at most 4 threads)");
                    std::process::exit(2);
                }
            }
            "--json" => a.json = Some(PathBuf::from(val(i))),
            "--show" => a.show = val(i).parse().unwrap_or_else(|_| usage()),
            "--mutant" => {
                a.mutant = FactsMutant::parse(&val(i)).unwrap_or_else(|| usage());
                if a.mutant != FactsMutant::None && !cfg!(feature = "mutants") {
                    eprintln!("--mutant needs a build with --features mutants");
                    std::process::exit(2);
                }
            }
            "--control" => {
                if val(i) != "full-reveal" {
                    usage();
                }
                if !cfg!(feature = "mutants") {
                    eprintln!("--control needs a build with --features mutants");
                    std::process::exit(2);
                }
                a.control = true;
            }
            _ => usage(),
        }
        i += 2;
    }
    a
}

/* ----------------------------------------------------------------------------------------- the inputs --- */

/// One corpus game and the reference's facts line for it.
struct Game {
    file: String,
    pop: String,
    index: u64,
    seed: String,
    start: u8,
    codes: Vec<i32>,
    f: Vec<u64>,
    b: Vec<u64>,
    g: u64,
    r: u64,
    /// The reference's info column: offers, rails, views with a constraint, wrong declares, hidden holders.
    info: [u64; 5],
}

fn hex_list(s: &str) -> Result<Vec<u64>, String> {
    if s.len() % 16 != 0 {
        return Err("a digest column is not 16 hex characters an entry".into());
    }
    s.as_bytes()
        .chunks(16)
        .map(|c| parse_hex16(c).ok_or_else(|| "not hex".to_string()))
        .collect()
}

/// Pair a corpus line with its facts line.
fn read_game(file: &str, corpus_line: &str, facts_line: &str) -> Result<Game, String> {
    let rec = parse_line(corpus_line)?;
    let f: Vec<&str> = facts_line.split('\t').collect();
    if f.len() != 12 || f[0] != FORMAT_HOME {
        return Err(format!("{file}: a facts line is not {FORMAT_HOME} with 12 columns"));
    }
    if f[1] != rec.population || f[2] != rec.index.to_string() || f[3] != rec.seed {
        return Err(format!(
            "{file}: the facts line {} {} {} is not the corpus line {} {} {}",
            f[1], f[2], f[3], rec.population, rec.index, rec.seed
        ));
    }
    let mut bytes = Vec::new();
    if !decode_hex_into(rec.actions_hex, &mut bytes) {
        return Err(format!("{file} {}: the actions are not hex", rec.index));
    }
    let mut codes = Vec::with_capacity(rec.steps as usize);
    let mut pos = 0;
    while pos < bytes.len() {
        let (a, next) = decode_action(&bytes, pos).map_err(|e| format!("{file} {}: {e:?}", rec.index))?;
        codes.push(encode_action(&a).ok_or_else(|| format!("{file} {}: an action without a code", rec.index))?);
        pos = next;
    }
    let info: Vec<u64> = f[10].split(':').map(|x| x.parse().unwrap_or(u64::MAX)).collect();
    let g = Game {
        file: file.to_string(),
        pop: rec.population.to_string(),
        index: rec.index,
        seed: rec.seed.to_string(),
        start: rec.start,
        codes,
        f: hex_list(f[6])?,
        b: hex_list(f[7])?,
        g: parse_hex16(f[8].as_bytes()).ok_or("G is not hex")?,
        r: parse_hex16(f[9].as_bytes()).ok_or("R is not hex")?,
        info: [info[0], info[1], info[2], info[3], info[4]],
    };
    if g.codes.len() != rec.steps as usize || g.f.len() != g.codes.len() || g.b.len() != g.codes.len() {
        return Err(format!(
            "{file} {}: {} steps, {} actions, {} F, {} B",
            g.index,
            rec.steps,
            g.codes.len(),
            g.f.len(),
            g.b.len()
        ));
    }
    Ok(g)
}

fn corpus_files(dir: &Path, pops: &Option<Vec<String>>) -> Vec<String> {
    let mut files: Vec<String> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter(|f| f.starts_with('H') && f.ends_with(".tsv") && f.split('-').count() == 3)
        .filter(|f| {
            pops.as_ref()
                .map_or(true, |p| p.iter().any(|x| f.starts_with(&format!("{x}-"))))
        })
        .collect();
    files.sort_by_key(|f| {
        let p: Vec<&str> = f.trim_end_matches(".tsv").split('-').collect();
        (p[0].to_string(), p[1].parse::<u64>().unwrap_or(0))
    });
    files
}

/* ----------------------------------------------------------------------------------------- the tallies --- */

/// What one batch (or the run) found.
#[derive(Default, Clone)]
struct Tally {
    games: u64,
    steps: u64,
    views: u64,
    f_equal: u64,
    f_steps_bad: u64,
    f_games_bad: u64,
    b_equal: u64,
    b_steps_bad: u64,
    b_games_bad: u64,
    g_games_bad: u64,
    r_games_bad: u64,
    offers: u64,
    rails: u64,
    info_bad: u64,
    /// Coverage over the home views: a constraint, exhaustion, a propagated singleton, one inside the fixpoint.
    cov: [u64; 4],
    max_cons: usize,
    /// The start-seat rule: games whose delivered game_started named another seat than the true start seat.
    start_wrong: u64,
    start_games: u64,
    /// Per population: games, and games whose start seat the rule names wrong.
    start_by_pop: Vec<(String, u64, u64)>,
    /// Games whose rule named another seat although the first event was not a declare (must be 0).
    start_wrong_not_declare: u64,
    /// The first divergences, in words.
    first: Vec<String>,
}

impl Tally {
    fn merge(&mut self, o: &Tally, show: usize) {
        self.games += o.games;
        self.steps += o.steps;
        self.views += o.views;
        self.f_equal += o.f_equal;
        self.f_steps_bad += o.f_steps_bad;
        self.f_games_bad += o.f_games_bad;
        self.b_equal += o.b_equal;
        self.b_steps_bad += o.b_steps_bad;
        self.b_games_bad += o.b_games_bad;
        self.g_games_bad += o.g_games_bad;
        self.r_games_bad += o.r_games_bad;
        self.offers += o.offers;
        self.rails += o.rails;
        self.info_bad += o.info_bad;
        for k in 0..4 {
            self.cov[k] += o.cov[k];
        }
        self.max_cons = self.max_cons.max(o.max_cons);
        self.start_wrong += o.start_wrong;
        self.start_games += o.start_games;
        self.start_wrong_not_declare += o.start_wrong_not_declare;
        for (p, g, w) in &o.start_by_pop {
            self.start_pop(p, *g, *w);
        }
        for x in &o.first {
            if self.first.len() < show {
                self.first.push(x.clone());
            }
        }
    }

    fn start_pop(&mut self, pop: &str, games: u64, wrong: u64) {
        match self.start_by_pop.iter_mut().find(|x| x.0 == pop) {
            Some(x) => {
                x.1 += games;
                x.2 += wrong;
            }
            None => self.start_by_pop.push((pop.to_string(), games, wrong)),
        }
    }

    fn note(&mut self, s: String) {
        if self.first.len() < 64 {
            self.first.push(s);
        }
    }
}

fn add_cov(t: &mut Tally, i: &FactsInfo) {
    t.cov[0] += u64::from(i.constraint);
    t.cov[1] += u64::from(i.exhaustion);
    t.cov[2] += u64::from(i.propagated_singleton);
    t.cov[3] += u64::from(i.propagated_in_fixpoint);
}

/* ----------------------------------------------------------------------------------------- home --- */

/// Owned observation buffers for n games (the facts row on, no critic).
struct Bufs {
    seat: Vec<u8>,
    obs: Vec<u8>,
    legal: Vec<u8>,
    events: Vec<u8>,
    n_events: Vec<u8>,
    facts: Vec<u8>,
    reward: Vec<f32>,
    term: Vec<bool>,
    trunc: Vec<bool>,
}

impl Bufs {
    fn new(n: usize) -> Bufs {
        Bufs {
            seat: vec![0; n],
            obs: vec![0; n * OBS_LEN],
            legal: vec![0; n * LEGAL_LEN],
            events: vec![0; n * MAX_EVENTS * EVENT_LEN],
            n_events: vec![0; n],
            facts: vec![0; n * FACTS_LEN],
            reward: vec![0.0; 2 * n],
            term: vec![false; n],
            trunc: vec![false; n],
        }
    }
    fn split(&mut self) -> (StepOut<'_>, ObsOut<'_>) {
        (
            StepOut {
                reward: &mut self.reward,
                terminated: &mut self.term,
                truncated: &mut self.trunc,
            },
            ObsOut {
                seat: &mut self.seat,
                obs: &mut self.obs,
                legal: &mut self.legal,
                events: &mut self.events,
                n_events: &mut self.n_events,
                critic: None,
                facts: Some(&mut self.facts),
            },
        )
    }
}

/// Plant the run's mutant or control in a batch (the `mutants` feature only; parse_args refused them otherwise).
#[allow(unused_variables)]
fn plant(env: &mut VecEnv, mutant: FactsMutant, control: bool) {
    #[cfg(feature = "mutants")]
    {
        env.set_facts_mutant(mutant);
        env.set_full_reveal_control(control);
    }
}

/// Play one batch of games through a home and a bridge batch and compare everything.
fn check_batch(games: &[Game], args: &Args) -> Result<Tally, String> {
    let n = games.len();
    let mut t = Tally::default();
    let mut home = VecEnv::with_facts(n, 1, false, true)?;
    let mut bridge = VecEnv::with_facts(n, 1, true, true)?;
    plant(&mut home, args.mutant, false);
    plant(&mut bridge, args.mutant, args.control);
    let seeds: Vec<&str> = games.iter().map(|g| g.seed.as_str()).collect();
    let starts: Vec<u8> = games.iter().map(|g| g.start).collect();
    home.reset(&seeds, &starts)?;
    bridge.reset_regimes(&seeds, &starts, Some(&vec![REGIME_BRIDGE; n]))?;
    let (mut hb, mut bb) = (Bufs::new(n), Bufs::new(n));
    {
        let (_, o) = hb.split();
        home.observe(o)?;
        let (_, o) = bb.split();
        bridge.observe(o)?;
    }
    let mut f = Facts::default();
    let mut scratch = Vec::new();
    let mut enc = Vec::new();
    let (mut d, mut l, mut v) = (vec![0u64; n], vec![0u64; n], vec![0u64; n]);
    let mut gd: Vec<ByteDigest> = vec![ByteDigest::new(); n];
    let mut rd: Vec<ByteDigest> = vec![ByteDigest::new(); n];
    let mut f_bad = vec![false; n];
    let mut b_bad = vec![false; n];
    let mut offers = vec![0u64; n];
    let mut rails = vec![0u64; n];
    let mut cons = vec![0u64; n];
    // The delivered game_started row's actor, and the type of the event after it (the first event).
    let mut started: Vec<Option<(u8, u8)>> = vec![None; n];
    let mut codes = vec![A_DECLINE; n];
    let longest = games.iter().map(|g| g.codes.len()).max().unwrap_or(0);
    for step in 0..=longest {
        bridge.digests(&mut d, &mut l, &mut v)?;
        for (i, g) in games.iter().enumerate() {
            // The start seat: the game_started row, whenever a seat's delivery carries it.
            if started[i].is_none() {
                let me = hb.seat[i];
                let e0 = i * MAX_EVENTS * EVENT_LEN;
                for k in 0..hb.n_events[i] as usize {
                    let row = &hb.events[e0 + k * EVENT_LEN..e0 + (k + 1) * EVENT_LEN];
                    if row[E_TYPE] == 0 {
                        let next = &hb.events[e0 + (k + 1) * EVENT_LEN..e0 + (k + 2) * EVENT_LEN];
                        started[i] = Some((abs_seat(row[E_ACTOR], me), next[E_TYPE]));
                    }
                }
            }
            if step >= g.codes.len() {
                codes[i] = A_DECLINE;
                if home.ended(i) == 0 {
                    return Err(format!(
                        "{} {}: the game did not end after its {} actions",
                        g.file,
                        g.index,
                        g.codes.len()
                    ));
                }
                continue;
            }
            if home.ended(i) != 0 {
                return Err(format!(
                    "{} {}: the game ended at step {step}, before its actions ran out",
                    g.file, g.index
                ));
            }
            let acting = home.game(i).acting_seat();
            // Check 1: the six seats' facts.
            let mut fd = ByteDigest::new();
            let mut any_cons = 0u64;
            for s in 0..NSEATS as u8 {
                home.facts_of(i, s, &mut f)?;
                f.encode(&mut scratch, &mut enc);
                fd.push(&enc);
                add_cov(&mut t, &f.info);
                t.max_cons = t.max_cons.max(scratch.len());
                any_cons += u64::from(!f.cons.is_empty());
            }
            cons[i] += any_cons;
            t.views += NSEATS as u64;
            if fd.value() == g.f[step] {
                t.f_equal += 1;
            } else {
                t.f_steps_bad += 1;
                if !f_bad[i] {
                    f_bad[i] = true;
                    t.note(format!(
                        "F {} {} {} step {step}: the port's facts digest {} is not the reference's {} \
                         (emit-facts.mjs dump home:{}:{}:{step}; facts-check dump {}:{}:{step})",
                        g.file,
                        g.index,
                        g.seed,
                        hex_string(fd.value()),
                        hex_string(g.f[step]),
                        g.file,
                        g.index,
                        g.file,
                        g.index
                    ));
                }
            }
            // Check 3: the rail of the acting seat's facts row, at a window offer.
            let o = &hb.obs[i * OBS_LEN..(i + 1) * OBS_LEN];
            if o[O_WINDOW] == 1 {
                offers[i] += 1;
                let fr = &hb.facts[i * FACTS_LEN..(i + 1) * FACTS_LEN];
                let me = hb.seat[i];
                let mut rb = [NONE; 11];
                rb[..4].copy_from_slice(&(step as u32).to_le_bytes());
                if fr[F_RAIL] != NONE {
                    rails[i] += 1;
                    rb[4] = fr[F_RAIL];
                    for j in 0..6 {
                        rb[5 + j] = abs_seat(fr[F_RAIL_ASSIGN + j], me);
                    }
                }
                rd[i].push(&rb);
            }
            // G1b: the bridge batch's view digest and its acting seat's facts.
            if v[i] == g.b[step] {
                t.b_equal += 1;
            } else {
                t.b_steps_bad += 1;
                if !b_bad[i] {
                    b_bad[i] = true;
                    t.note(format!(
                        "B {} {} {} step {step}: the port's bridge-regime view digest {} is not the reference's {}",
                        g.file,
                        g.index,
                        g.seed,
                        hex_string(v[i]),
                        hex_string(g.b[step])
                    ));
                }
            }
            bridge.facts_of(i, acting, &mut f)?;
            f.encode(&mut scratch, &mut enc);
            gd[i].push(&enc);
            codes[i] = g.codes[step];
            t.steps += 1;
        }
        if step == longest {
            break;
        }
        let (r, o) = hb.split();
        home.step(&codes, r, Some(o))?;
        let (r, o) = bb.split();
        bridge.step(&codes, r, Some(o))?;
    }
    for (i, g) in games.iter().enumerate() {
        t.games += 1;
        t.offers += offers[i];
        t.rails += rails[i];
        if f_bad[i] {
            t.f_games_bad += 1;
        }
        if b_bad[i] {
            t.b_games_bad += 1;
        }
        if gd[i].value() != g.g {
            t.g_games_bad += 1;
            t.note(format!(
                "G {} {} {}: the bridge-regime facts digest differs",
                g.file, g.index, g.seed
            ));
        }
        if rd[i].value() != g.r {
            t.r_games_bad += 1;
            t.note(format!(
                "R {} {} {}: the rails differ ({} offers, {} rails; the reference's {} and {})",
                g.file, g.index, g.seed, offers[i], rails[i], g.info[0], g.info[1]
            ));
        }
        if offers[i] != g.info[0] || rails[i] != g.info[1] || cons[i] != g.info[2] {
            t.info_bad += 1;
        }
        t.start_games += 1;
        match started[i] {
            Some((s, first)) => {
                let wrong = s != g.start;
                t.start_wrong += u64::from(wrong);
                t.start_wrong_not_declare += u64::from(wrong && first != 2);
                t.start_pop(&g.pop, 1, u64::from(wrong));
            }
            None => return Err(format!("{} {}: no game_started row was delivered", g.file, g.index)),
        }
    }
    let _ = resolved_mask;
    Ok(t)
}

fn home_main(args: &Args) -> Result<Tally, String> {
    let t0 = Instant::now();
    let files = corpus_files(&args.corpus, &args.pops);
    if files.is_empty() {
        return Err(format!("no corpus files in {}", args.corpus.display()));
    }
    let mut total = Tally::default();
    for file in &files {
        let corpus = fs::read_to_string(args.corpus.join(file)).map_err(|e| format!("{file}: {e}"))?;
        let facts_path = args.facts.join("home").join(file);
        let facts = fs::read_to_string(&facts_path).map_err(|e| format!("{}: {e}", facts_path.display()))?;
        let mut games = Vec::new();
        let mut fl = facts.lines().filter(|l| l.starts_with(FORMAT_HOME));
        for line in corpus.lines().filter(|l| l.starts_with("athena-replay-1\t")) {
            if args.max_games > 0 && games.len() >= args.max_games {
                break;
            }
            let f = fl
                .next()
                .ok_or_else(|| format!("{file}: the facts file has fewer games than the corpus"))?;
            games.push(read_game(file, line, f)?);
        }
        if args.max_games == 0 && fl.next().is_some() {
            return Err(format!("{file}: the facts file has more games than the corpus"));
        }
        drop(corpus);
        drop(facts);
        let batches: Vec<&[Game]> = games.chunks(BATCH).collect();
        let next = AtomicUsize::new(0);
        let acc = Mutex::new((Tally::default(), None::<String>));
        std::thread::scope(|s| {
            for _ in 0..args.threads {
                s.spawn(|| loop {
                    let k = next.fetch_add(1, Ordering::Relaxed);
                    if k >= batches.len() {
                        break;
                    }
                    let r = check_batch(batches[k], args);
                    let mut a = acc.lock().unwrap();
                    match r {
                        Ok(t) => a.0.merge(&t, 64),
                        Err(e) => {
                            a.1.get_or_insert(e);
                        }
                    }
                });
            }
        });
        let (t, err) = acc.into_inner().unwrap();
        if let Some(e) = err {
            return Err(e);
        }
        println!(
            "  {file}: {} games, {} steps, F bad steps {}, B bad steps {}, R bad games {}, G bad games {}; {:.0} s",
            t.games,
            t.steps,
            t.f_steps_bad,
            t.b_steps_bad,
            t.r_games_bad,
            t.g_games_bad,
            t0.elapsed().as_secs_f64()
        );
        total.merge(&t, 64);
    }
    Ok(total)
}

/* ----------------------------------------------------------------------------------------- bridge --- */

#[derive(Default)]
struct BridgeTally {
    files: u64,
    games: u64,
    asks: u64,
    equal: u64,
    games_bad: u64,
    cons_views: u64,
    cons_views_ref: u64,
    cov: [u64; 4],
    max_cons: usize,
    first: Vec<String>,
}

/// The facts of every ask of one record file against the reference's.
fn bridge_file(path: &Path, facts_path: &Path, mutant: FactsMutant) -> Result<BridgeTally, String> {
    let name = path.file_name().unwrap().to_string_lossy().to_string();
    let text = fs::read_to_string(path).map_err(|e| format!("{name}: {e}"))?;
    let facts = fs::read_to_string(facts_path).map_err(|e| format!("{}: {e}", facts_path.display()))?;
    let mut exp = facts.lines().filter(|l| l.starts_with(FORMAT_BRIDGE));
    let mut t = BridgeTally {
        files: 1,
        ..BridgeTally::default()
    };
    let mut reader = RecordReader::new(Control::None);
    let mut walk = Walk::new();
    #[cfg(feature = "mutants")]
    walk.set_mutant(mutant);
    let _ = mutant;
    let mut f = Facts::default();
    let mut scratch = Vec::new();
    let mut enc = Vec::new();
    for line in record_lines(&text) {
        let g = match reader.read_line(line)? {
            Line::Header => continue,
            Line::Game(g) => g,
        };
        let e = exp
            .next()
            .ok_or_else(|| format!("{name}: the facts file has fewer games"))?;
        let c: Vec<&str> = e.split('\t').collect();
        if c.len() != 7 || c[2] != g.deal || c[3] != g.rot {
            return Err(format!(
                "{name}: the facts line for {}:{} is {}:{}",
                g.deal,
                g.rot,
                c.get(2).unwrap_or(&""),
                c.get(3).unwrap_or(&"")
            ));
        }
        let want = hex_list(c[5])?;
        t.cons_views_ref += c[6].parse::<u64>().unwrap_or(u64::MAX);
        walk.reset();
        let mut cursor = 0usize;
        let mut bad = false;
        let mut asks = 0usize;
        let mut err = None;
        walk_asks(&g, Control::None, |a| {
            while cursor < a.event as usize {
                walk.ingest(&g.events[cursor]);
                cursor += 1;
            }
            // The view's own bytes: counts at 11, the set block at 19, the hand's size at 145 and its cards after.
            let v = a.view;
            let mut counts = [0u8; NSEATS];
            counts.copy_from_slice(&v[11..17]);
            let mut resolved = 0u16;
            for b in 0..NSETS {
                if v[19 + 14 * b] != NONE {
                    resolved |= 1 << b;
                }
            }
            let mut hand = 0u64;
            for &c in &v[146..146 + v[145] as usize] {
                hand |= 1u64 << c;
            }
            walk.finish(a.asker, hand, &counts, resolved, &mut f);
            f.encode(&mut scratch, &mut enc);
            t.max_cons = t.max_cons.max(scratch.len());
            t.cons_views += u64::from(!f.cons.is_empty());
            t.cov[0] += u64::from(f.info.constraint);
            t.cov[1] += u64::from(f.info.exhaustion);
            t.cov[2] += u64::from(f.info.propagated_singleton);
            t.cov[3] += u64::from(f.info.propagated_in_fixpoint);
            let k = a.k as usize;
            if want.get(k) == Some(&digest(&enc)) {
                t.equal += 1;
            } else if !bad {
                bad = true;
                err = Some(format!(
                    "{name} {}:{} ask {k} (event {}, seat {}): the port's facts digest {} is not the reference's {} \
                     (emit-facts.mjs dump bridge:{name}:{}:{}:{k})\n{}",
                    g.deal,
                    g.rot,
                    a.event,
                    a.asker,
                    hex_string(digest(&enc)),
                    want.get(k).map_or("(none)".to_string(), |x| hex_string(*x)),
                    g.deal,
                    g.rot,
                    f.describe()
                ));
            }
            asks += 1;
        })?;
        t.games += 1;
        t.asks += asks as u64;
        if asks != want.len() {
            bad = true;
            err.get_or_insert(format!(
                "{name} {}:{}: {asks} asks, the reference has {}",
                g.deal,
                g.rot,
                want.len()
            ));
        }
        if bad {
            t.games_bad += 1;
            if let Some(e) = err {
                if t.first.len() < 16 {
                    t.first.push(e);
                }
            }
        }
    }
    if exp.next().is_some() {
        return Err(format!("{name}: the facts file has more games"));
    }
    Ok(t)
}

fn bridge_main(args: &Args) -> Result<BridgeTally, String> {
    let t0 = Instant::now();
    let mut files: Vec<PathBuf> = fs::read_dir(&args.records)
        .map_err(|e| format!("{}: {e}", args.records.display()))?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            let n = p.file_name().unwrap().to_string_lossy();
            n.starts_with(&args.prefix) && n.ends_with(".jsonl")
        })
        .collect();
    files.sort();
    let next = AtomicUsize::new(0);
    let acc = Mutex::new((BridgeTally::default(), None::<String>));
    std::thread::scope(|s| {
        for _ in 0..args.threads {
            s.spawn(|| loop {
                let k = next.fetch_add(1, Ordering::Relaxed);
                if k >= files.len() {
                    break;
                }
                let stem = files[k].file_stem().unwrap().to_string_lossy().to_string();
                let r = bridge_file(
                    &files[k],
                    &args.facts.join("bridge").join(format!("{stem}.tsv")),
                    args.mutant,
                );
                let mut a = acc.lock().unwrap();
                match r {
                    Ok(t) => {
                        println!(
                            "  {stem}: {} games, {} asks, {} equal; {:.0} s",
                            t.games,
                            t.asks,
                            t.equal,
                            t0.elapsed().as_secs_f64()
                        );
                        let x = &mut a.0;
                        x.files += t.files;
                        x.games += t.games;
                        x.asks += t.asks;
                        x.equal += t.equal;
                        x.games_bad += t.games_bad;
                        x.cons_views += t.cons_views;
                        x.cons_views_ref += t.cons_views_ref;
                        for j in 0..4 {
                            x.cov[j] += t.cov[j];
                        }
                        x.max_cons = x.max_cons.max(t.max_cons);
                        for e in t.first {
                            if x.first.len() < 16 {
                                x.first.push(e);
                            }
                        }
                    }
                    Err(e) => {
                        a.1.get_or_insert(e);
                    }
                }
            });
        }
    });
    let (t, err) = acc.into_inner().unwrap();
    match err {
        Some(e) => Err(e),
        None => Ok(t),
    }
}

/* ----------------------------------------------------------------------------------------- dump --- */

fn dump_main(args: &Args) -> Result<(), String> {
    let p: Vec<&str> = args.spec.split(':').collect();
    if p.len() != 3 {
        return Err("dump needs <corpus file>:<index>:<step>".into());
    }
    let (file, index, step) = (p[0], p[1], p[2].parse::<usize>().map_err(|e| e.to_string())?);
    let corpus = fs::read_to_string(args.corpus.join(file)).map_err(|e| format!("{file}: {e}"))?;
    let line = corpus
        .lines()
        .find(|l| l.split('\t').nth(2) == Some(index) && l.starts_with("athena-replay-1\t"))
        .ok_or_else(|| format!("no record {index} in {file}"))?;
    let rec = parse_line(line)?;
    let mut bytes = Vec::new();
    decode_hex_into(rec.actions_hex, &mut bytes);
    let mut codes = Vec::new();
    let mut pos = 0;
    while pos < bytes.len() {
        let (a, next) = decode_action(&bytes, pos).map_err(|e| format!("{e:?}"))?;
        codes.push(encode_action(&a).unwrap());
        pos = next;
    }
    if step >= codes.len() {
        return Err(format!("step {step} is past the record's {} steps", codes.len()));
    }
    let mut env = [
        VecEnv::with_facts(1, 1, false, true)?,
        VecEnv::with_facts(1, 1, true, true)?,
    ];
    env[0].reset(&[rec.seed], &[rec.start])?;
    env[1].reset_regimes(&[rec.seed], &[rec.start], Some(&[REGIME_BRIDGE]))?;
    let mut b = [Bufs::new(1), Bufs::new(1)];
    for &c in &codes[..step] {
        for k in 0..2 {
            let (r, _) = b[k].split();
            env[k].step(&[c], r, None)?;
        }
    }
    let g = env[0].game(0);
    let acting = g.acting_seat();
    let mut out = format!(
        "{} {} {} start {}, step {step}: acting seat {acting}, window {:?}\n",
        rec.population,
        rec.index,
        rec.seed,
        rec.start,
        g.window()
    );
    let mut f = Facts::default();
    let mut digests = Vec::new();
    let mut scratch = Vec::new();
    let mut enc = Vec::new();
    for s in 0..NSEATS as u8 {
        env[0].facts_of(0, s, &mut f)?;
        let _ = writeln!(out, "{}  [info {:?}]", f.describe(), f.info);
        f.encode(&mut scratch, &mut enc);
        digests.push(hex_string(digest(&enc)));
        if s == acting {
            let r = rail(&f, resolved_mask(g));
            let _ = writeln!(
                out,
                "  rail: {}",
                match r {
                    Some((set, a)) => format!(
                        "set {set} {:?} ({:?})",
                        a,
                        SET_CARDS[set as usize]
                            .map(|c| String::from_utf8_lossy(&athena_env::cards::card_name(c)).into_owned())
                    ),
                    None => "none".to_string(),
                }
            );
        }
    }
    env[1].facts_of(0, acting, &mut f)?;
    let _ = writeln!(out, "bridge regime, acting seat {acting}:\n{}", f.describe());
    let _ = writeln!(out, "facts digests: {}", digests.join(" "));
    let _ = NCARDS;
    print!("{out}");
    Ok(())
}

/* ----------------------------------------------------------------------------------------- main --- */

fn main() -> ExitCode {
    let args = parse_args();
    let t0 = Instant::now();
    let caught_mode = args.mutant != FactsMutant::None || args.control;
    match args.mode.as_str() {
        "home" => {
            println!(
                "=== facts-check home: {} against {} ({} threads{}{}) ===",
                args.corpus.display(),
                args.facts.join("home").display(),
                args.threads,
                if args.mutant != FactsMutant::None {
                    format!(", mutant {:?}", args.mutant)
                } else {
                    String::new()
                },
                if args.control { ", control full-reveal" } else { "" }
            );
            let t = match home_main(&args) {
                Ok(t) => t,
                Err(e) => {
                    eprintln!("facts-check: {e}");
                    return ExitCode::from(1);
                }
            };
            let secs = t0.elapsed().as_secs_f64();
            println!("games {}, steps {}, views {} (six a step)", t.games, t.steps, t.views);
            println!(
                "check 1 (home facts, six seats a step): {} of {} steps equal; {} steps in {} games differ",
                t.f_equal, t.steps, t.f_steps_bad, t.f_games_bad
            );
            println!(
                "check 3 (the rail at every window offer): {} offers, {} with a rail; {} games' rails differ; \
                 {} games' offer, rail or constraint counts differ from the reference's",
                t.offers, t.rails, t.r_games_bad, t.info_bad
            );
            println!(
                "G1b (bridge-regime view digest of the acting seat): {} of {} steps equal; {} steps in {} games differ",
                t.b_equal, t.steps, t.b_steps_bad, t.b_games_bad
            );
            println!(
                "G1b information (bridge-regime facts of the acting seat): {} games differ",
                t.g_games_bad
            );
            println!(
                "start seat: {} of {} games' game_started row names another seat than the true start seat ({:.4}%); of those, {} had a first event other than a declare",
                t.start_wrong,
                t.start_games,
                100.0 * t.start_wrong as f64 / t.start_games.max(1) as f64,
                t.start_wrong_not_declare
            );
            let mut by = t.start_by_pop.clone();
            by.sort();
            for (p, g, w) in &by {
                println!("  {p}: {w} of {g} ({:.4}%)", 100.0 * *w as f64 / (*g).max(1) as f64);
            }
            println!(
                "check 5 coverage (home views): with a constraint {}, exhaustion fired {}, a singleton reached only by \
                 propagation {} (inside the view's own fixpoint {}); most distinct constraints in a view {}",
                t.cov[0], t.cov[1], t.cov[2], t.cov[3], t.max_cons
            );
            for x in &t.first {
                println!("  {x}");
            }
            let all_equal = t.start_wrong_not_declare == 0
                && t.f_steps_bad == 0
                && t.b_steps_bad == 0
                && t.r_games_bad == 0
                && t.g_games_bad == 0
                && t.info_bad == 0;
            let (verdict, code) = if args.mutant != FactsMutant::None {
                if t.f_steps_bad > 0 {
                    ("CAUGHT (check 1 fails under the mutant)", 0)
                } else {
                    ("NOT CAUGHT", 1)
                }
            } else if args.control {
                if t.b_steps_bad > 0 {
                    ("CAUGHT (the full reveal differs from the reduced encoding)", 0)
                } else {
                    ("NOT CAUGHT", 1)
                }
            } else if all_equal && t.max_cons <= athena_env::vecenv::MAX_CONS {
                ("PASS", 0)
            } else {
                ("FAIL", 1)
            };
            println!("verdict: {verdict} ({secs:.0} s)");
            if let Some(p) = &args.json {
                let j = format!(
                    "{{\n  \"tool\": \"athena-env facts-check home\",\n  \"mutant\": \"{:?}\",\n  \"control\": {},\n  \"threads\": {},\n  \"seconds\": {secs:.1},\n  \"games\": {},\n  \"steps\": {},\n  \"views\": {},\n  \"check1\": {{\"stepsEqual\": {}, \"stepsBad\": {}, \"gamesBad\": {}}},\n  \"check3\": {{\"offers\": {}, \"rails\": {}, \"gamesBad\": {}, \"countsBad\": {}}},\n  \"g1b\": {{\"stepsEqual\": {}, \"stepsBad\": {}, \"gamesBad\": {}, \"factsGamesBad\": {}}},\n  \"startSeat\": {{\"games\": {}, \"wrong\": {}, \"wrongNotDeclare\": {}, \"byPopulation\": [{}]}},\n  \"coverage\": {{\"constraint\": {}, \"exhaustion\": {}, \"propagatedSingleton\": {}, \"propagatedInFixpoint\": {}, \"maxDistinctConstraints\": {}}},\n  \"first\": [{}],\n  \"verdict\": \"{verdict}\"\n}}\n",
                    args.mutant,
                    args.control,
                    args.threads,
                    t.games,
                    t.steps,
                    t.views,
                    t.f_equal,
                    t.f_steps_bad,
                    t.f_games_bad,
                    t.offers,
                    t.rails,
                    t.r_games_bad,
                    t.info_bad,
                    t.b_equal,
                    t.b_steps_bad,
                    t.b_games_bad,
                    t.g_games_bad,
                    t.start_games,
                    t.start_wrong,
                    t.start_wrong_not_declare,
                    t.start_by_pop
                        .iter()
                        .map(|(p, g, w)| format!("{{\"population\": \"{p}\", \"games\": {g}, \"wrong\": {w}}}"))
                        .collect::<Vec<_>>()
                        .join(", "),
                    t.cov[0],
                    t.cov[1],
                    t.cov[2],
                    t.cov[3],
                    t.max_cons,
                    t.first.iter().map(|x| format!("{x:?}")).collect::<Vec<_>>().join(", ")
                );
                if let Err(e) = fs::write(p, j) {
                    eprintln!("{}: {e}", p.display());
                }
            }
            let _ = caught_mode;
            ExitCode::from(code)
        }
        "bridge" => {
            println!(
                "=== facts-check bridge: {}{}* against {} ({} threads) ===",
                args.records.display(),
                args.prefix,
                args.facts.join("bridge").display(),
                args.threads
            );
            let t = match bridge_main(&args) {
                Ok(t) => t,
                Err(e) => {
                    eprintln!("facts-check: {e}");
                    return ExitCode::from(1);
                }
            };
            let secs = t0.elapsed().as_secs_f64();
            println!(
                "check 2 (bridge asks, the asking seat's view under the reduced reveal): {} files, {} games, {} of {} \
                 views equal; {} games differ",
                t.files, t.games, t.equal, t.asks, t.games_bad
            );
            println!(
                "coverage (bridge views): with a constraint {} (the reference counts {}), exhaustion fired {}, a \
                 singleton reached only by propagation {} (inside the fixpoint {}); most distinct constraints {}",
                t.cov[0], t.cons_views_ref, t.cov[1], t.cov[2], t.cov[3], t.max_cons
            );
            for x in &t.first {
                println!("  {x}");
            }
            let ok = t.games_bad == 0 && t.equal == t.asks && t.cons_views == t.cons_views_ref;
            let (verdict, code) = if args.mutant != FactsMutant::None {
                if t.equal < t.asks {
                    ("CAUGHT", 0)
                } else {
                    ("NOT CAUGHT", 1)
                }
            } else if ok {
                ("PASS", 0)
            } else {
                ("FAIL", 1)
            };
            println!("verdict: {verdict} ({secs:.0} s)");
            if let Some(p) = &args.json {
                let j = format!(
                    "{{\n  \"tool\": \"athena-env facts-check bridge\",\n  \"mutant\": \"{:?}\",\n  \"threads\": {},\n  \"seconds\": {secs:.1},\n  \"files\": {},\n  \"games\": {},\n  \"views\": {},\n  \"equal\": {},\n  \"gamesBad\": {},\n  \"coverage\": {{\"constraint\": {}, \"constraintRef\": {}, \"exhaustion\": {}, \"propagatedSingleton\": {}, \"propagatedInFixpoint\": {}, \"maxDistinctConstraints\": {}}},\n  \"first\": [{}],\n  \"verdict\": \"{verdict}\"\n}}\n",
                    args.mutant,
                    args.threads,
                    t.files,
                    t.games,
                    t.asks,
                    t.equal,
                    t.games_bad,
                    t.cov[0],
                    t.cons_views_ref,
                    t.cov[1],
                    t.cov[2],
                    t.cov[3],
                    t.max_cons,
                    t.first.iter().map(|x| format!("{x:?}")).collect::<Vec<_>>().join(", ")
                );
                if let Err(e) = fs::write(p, j) {
                    eprintln!("{}: {e}", p.display());
                }
            }
            ExitCode::from(code)
        }
        "dump" => match dump_main(&args) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("facts-check: {e}");
                ExitCode::from(1)
            }
        },
        _ => usage(),
    }
}
