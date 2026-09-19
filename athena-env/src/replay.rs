//! Replaying one corpus record from its seed, start seat and actions alone (replay-format.md §5, §7, §9.1): the
//! port's side of `replayRecord` in `scripts/athena/replay-codec.ts`, mismatch for mismatch.
//!
//! This module parses text it is given; it opens no file. The checker binary does the reading.

use crate::census::{Tally, C};
use crate::codec::{
    decode_action, encode_action, encode_event, encode_events, encode_legal, encode_state, encode_view,
    generate_probes, probe_action, probe_state_count, seed_ok, verdict, FORMAT, PROBES_PER_STATE, PROBE_EVERY,
    STATE_LEN, STEP_CAP,
};
use crate::digest::{decode_hex_into, hex16, hex_string, parse_hex16, ByteDigest};
use crate::rules::{Action, AskList, Event, Events, Game, Mutant, FINISHED};

/// The seventeen columns of a corpus line (replay-format.md §7.1).
pub const COLUMNS: usize = 17;

/// One parsed corpus line. Borrowed from the line: nothing is copied but the numbers.
#[derive(Clone, Debug)]
pub struct Record<'a> {
    /// `H1`..`H5`.
    pub population: &'a str,
    /// The game's index within its population.
    pub index: u64,
    /// The game seed.
    pub seed: &'a str,
    /// The start seat.
    pub start: u8,
    /// Who played it (information).
    pub driver: &'a str,
    /// The emitter's revision.
    pub revision: &'a str,
    /// The rules hash.
    pub rules_hash: &'a str,
    /// T.
    pub steps: u32,
    /// `finished` or `capped`.
    pub end: &'a str,
    /// The deal digest.
    pub deal: u64,
    /// The actions column, hex.
    pub actions_hex: &'a [u8],
    /// The d column, 16 hex a step.
    pub d: &'a [u8],
    /// The l column.
    pub l: &'a [u8],
    /// The v column.
    pub v: &'a [u8],
    /// The probe verdicts, hex.
    pub probes_hex: &'a [u8],
    /// The game digest.
    pub game: u64,
}

/// Parse and check a line's shape, as `parseLine` does.
pub fn parse_line(line: &str) -> Result<Record<'_>, String> {
    let line = line.strip_suffix('\n').unwrap_or(line);
    let line = line.strip_suffix('\r').unwrap_or(line);
    let mut f: [&str; COLUMNS] = [""; COLUMNS];
    let mut n = 0usize;
    for part in line.split('\t') {
        if n == COLUMNS {
            return Err(format!("a line has more than {COLUMNS} columns"));
        }
        f[n] = part;
        n += 1;
    }
    if n != COLUMNS {
        return Err(format!("a line has {n} columns, not {COLUMNS}"));
    }
    if f[0] != FORMAT {
        return Err(format!("format {}, expected {FORMAT}", f[0]));
    }
    let steps: u32 = f[8].parse().map_err(|_| format!("steps {}", f[8]))?;
    if steps > STEP_CAP {
        return Err(format!("steps {steps} above the cap"));
    }
    if f[9] != "finished" && f[9] != "capped" {
        return Err(format!("end {}", f[9]));
    }
    let deal = parse_hex16(f[10].as_bytes()).ok_or("deal is not 16 hex characters")?;
    let game = parse_hex16(f[16].as_bytes()).ok_or("game is not 16 hex characters")?;
    for (i, name) in [(12, "d"), (13, "l"), (14, "v")] {
        if f[i].len() != 16 * steps as usize || !f[i].bytes().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        {
            return Err(format!("column {name} is not 16 hex characters a step"));
        }
    }
    if f[15].len() != 2 * PROBES_PER_STATE * probe_state_count(steps) as usize {
        return Err(format!("{} probe hex characters for {steps} steps", f[15].len()));
    }
    if !seed_ok(f[3].as_bytes()) {
        return Err(format!("seed {:?} is not printable ASCII without spaces", f[3]));
    }
    let start: u8 = f[4].parse().map_err(|_| format!("start seat {}", f[4]))?;
    if start > 5 {
        return Err(format!("start seat {start}"));
    }
    let index: u64 = f[2].parse().map_err(|_| format!("index {}", f[2]))?;
    Ok(Record {
        population: f[1],
        index,
        seed: f[3],
        start,
        driver: f[5],
        revision: f[6],
        rules_hash: f[7],
        steps,
        end: f[9],
        deal,
        actions_hex: f[11].as_bytes(),
        d: f[12].as_bytes(),
        l: f[13].as_bytes(),
        v: f[14].as_bytes(),
        probes_hex: f[15].as_bytes(),
        game,
    })
}

/// One gated comparison that failed.
#[derive(Clone, Debug)]
pub struct Mismatch {
    /// `deal`, `d`, `l`, `v`, `probe`, `refused`, `length`, `decode`, `end` or `game`.
    pub what: &'static str,
    /// The step (d, l, v, refused, length, decode), the probe's position in the probe column, or -1.
    pub at: i64,
    /// What differed.
    pub detail: String,
}

/// The replay of one record.
#[derive(Clone, Debug)]
pub struct ReplayResult {
    /// Every gated comparison held.
    pub ok: bool,
    /// What failed, in the reference's order.
    pub mismatches: Vec<Mismatch>,
    /// Probes whose accept/refuse agreed but whose error code did not (information).
    pub code_diffs: u64,
    /// The earliest step at which anything differed, or -1.
    pub first_step: i64,
    /// The mismatch found at `first_step` (`d`, `l`, `v`, `refused`, `length` or `decode`), or "" when no step differed.
    pub first_field: &'static str,
    /// Steps applied.
    pub steps: u32,
    /// `finished`, `capped`, or None if the replay did not reach an end.
    pub end: Option<&'static str>,
    /// The replayed game digest, if the replay reached an end.
    pub game: Option<u64>,
    /// The last state reached.
    pub last: Game,
}

/// A reusable replayer: one per thread. Its buffers grow to the longest game once and are then reused.
pub struct Replayer {
    mutant: Mutant,
    actions: Vec<u8>,
    rec_probes: Vec<u8>,
    d: Vec<u64>,
    l: Vec<u64>,
    v: Vec<u64>,
    probes: Vec<u8>,
    asks: AskList,
    events: Events,
    buf: Vec<u8>,
    sbuf: [u8; STATE_LEN],
}

impl Default for Replayer {
    fn default() -> Self {
        Self::new(Mutant::None)
    }
}

/// The action as text, for a mismatch report.
pub fn describe_action(a: &Action) -> String {
    let card = |c: u8| String::from_utf8_lossy(&crate::cards::card_name(c)).into_owned();
    match *a {
        Action::Ask { seat, target, card: c } => format!("ask {seat}->{target} {}", card(c)),
        Action::Claim { seat, set, assign } => format!(
            "claim {seat} {} {:?}",
            crate::cards::SET_NAMES.get(set as usize).unwrap_or(&"?"),
            assign
        ),
        Action::Pass { seat, to } => format!("pass {seat}->{to}"),
        Action::Decline { seat } => format!("decline {seat}"),
    }
}

impl Replayer {
    /// A replayer that plays the reference's rules, or (with the `mutants` feature) a planted mutant.
    pub fn new(mutant: Mutant) -> Self {
        #[cfg(not(feature = "mutants"))]
        assert!(mutant == Mutant::None, "a mutant needs the `mutants` feature");
        Replayer {
            mutant,
            actions: Vec::new(),
            rec_probes: Vec::new(),
            d: Vec::new(),
            l: Vec::new(),
            v: Vec::new(),
            probes: Vec::new(),
            asks: AskList::new(),
            events: Events::new(),
            buf: vec![0u8; 1024],
            sbuf: [0u8; STATE_LEN],
        }
    }

    fn fresh_game(&self, seed: &str, start: u8) -> Game {
        #[allow(unused_mut)]
        let mut g = Game::new(seed, start).expect("a checked seed and start seat always deal");
        #[cfg(feature = "mutants")]
        g.set_mutant(self.mutant);
        let _ = self.mutant;
        g
    }

    fn probe_at(&mut self, g: &Game, seed: &[u8], t: u32, acting: u8) {
        for p in generate_probes(seed, t, acting, &self.asks) {
            self.probes.push(verdict(g, &probe_action(&p)));
        }
    }

    /// Replay `rec` and compare everything the gate compares. With `tally`, count the census of every applied step
    /// and the game's end, and the checker's per-step integrity counters.
    pub fn replay(&mut self, rec: &Record<'_>, mut tally: Option<&mut Tally>) -> ReplayResult {
        let mut mismatches: Vec<Mismatch> = Vec::new();
        self.d.clear();
        self.l.clear();
        self.v.clear();
        self.probes.clear();
        if !decode_hex_into(rec.actions_hex, &mut self.actions) {
            mismatches.push(Mismatch {
                what: "decode",
                at: 0,
                detail: "the actions column is not hex of whole bytes".into(),
            });
        }
        if !decode_hex_into(rec.probes_hex, &mut self.rec_probes) {
            mismatches.push(Mismatch {
                what: "decode",
                at: -1,
                detail: "the probes column is not hex of whole bytes".into(),
            });
        }
        let seed = rec.seed.as_bytes();
        let mut g = self.fresh_game(rec.seed, rec.start);

        // The chain header, the deal, and the log's first event.
        let mut chain = ByteDigest::new();
        chain.open_element();
        chain.feed(FORMAT.as_bytes());
        chain.feed(b"|");
        chain.feed(&[b'0' + rec.start]);
        chain.feed(b"|");
        chain.feed(seed);
        chain.close_element();
        encode_state(&g, &mut self.sbuf);
        chain.push(&self.sbuf);
        let deal = chain.value();
        let mut log = ByteDigest::new();
        let n = encode_event(&Event::GameStarted { start: rec.start }, &mut self.buf);
        log.push(&self.buf[..n]);
        let mut log_len: u32 = 1;

        let mut pos = 0usize;
        let mut t: u32 = 0;
        let mut broke = !mismatches.is_empty();
        while !broke && pos < self.actions.len() {
            if g.phase() == FINISHED || t >= STEP_CAP {
                mismatches.push(Mismatch {
                    what: "length",
                    at: t as i64,
                    detail: format!("the game ended at step {t} with actions left in the record"),
                });
                broke = true;
                break;
            }
            let (action, next) = match decode_action(&self.actions, pos) {
                Ok(x) => x,
                Err(e) => {
                    mismatches.push(Mismatch {
                        what: "decode",
                        at: t as i64,
                        detail: format!("{e:?}"),
                    });
                    broke = true;
                    break;
                }
            };
            pos = next;

            // observe: L_t, V_t and (every tenth step) the probes, all at S_t.
            let acting = g.acting_seat();
            g.legal_asks(acting, &mut self.asks);
            let kinds = g.legal_kinds(acting, &self.asks);
            let n = encode_legal(acting, kinds, &self.asks, &mut self.buf);
            self.l.push(crate::digest::digest(&self.buf[..n]));
            let lh = log.hex();
            let n = encode_view(&g, acting, log_len, &lh, &mut self.buf);
            self.v.push(crate::digest::digest(&self.buf[..n]));
            if t % PROBE_EVERY == 0 {
                self.probe_at(&g, seed, t, acting);
            }

            // apply A_t.
            let pre = g;
            if let Err(code) = g.apply(&action, &mut self.events) {
                mismatches.push(Mismatch {
                    what: "refused",
                    at: t as i64,
                    detail: format!(
                        "step {t}: the port refused {} ({})",
                        describe_action(&action),
                        code.name()
                    ),
                });
                broke = true;
                break;
            }
            let n = encode_action(&action, &mut self.buf);
            chain.push(&self.buf[..n]);
            let n = encode_events(self.events.as_slice(), &mut self.buf);
            chain.push(&self.buf[..n]);
            encode_state(&g, &mut self.sbuf);
            chain.push(&self.sbuf);
            self.d.push(chain.value());
            for e in self.events.as_slice() {
                let n = encode_event(e, &mut self.buf);
                log.push(&self.buf[..n]);
                log_len += 1;
            }
            if let Some(tl) = tally.as_deref_mut() {
                tl.classify_step(&pre, &action, &g, self.events.as_slice(), kinds);
                if kinds & action.kind_bit() == 0 {
                    tl.bump(C::ActionKindNotInL);
                }
                let summary = pre.summary_kinds();
                if summary != kinds {
                    let only_claim =
                        (summary ^ kinds) == crate::rules::KIND_CLAIM && summary & crate::rules::KIND_CLAIM != 0;
                    if only_claim && pre.window().is_none() && pre.phase() == crate::rules::PLAYING {
                        tl.bump(C::SummaryClaimWindowClosed);
                    } else {
                        tl.bump(C::SummaryOtherDiff);
                    }
                }
            }
            t += 1;
        }

        // finish(): the game must be over or capped; then the terminal probes at S_T.
        let mut end: Option<&'static str> = None;
        if !broke {
            if g.phase() == FINISHED {
                end = Some("finished");
            } else if t >= STEP_CAP {
                end = Some("capped");
            } else {
                mismatches.push(Mismatch {
                    what: "length",
                    at: t as i64,
                    detail: format!("the actions ended at step {t}, before the game did"),
                });
            }
            if end.is_some() {
                let acting = g.acting_seat();
                g.legal_asks(acting, &mut self.asks);
                self.probe_at(&g, seed, t, acting);
            }
        }

        // Compare, in the reference's order: deal, d, l, v, probes, end, game.
        if deal != rec.deal {
            mismatches.push(Mismatch {
                what: "deal",
                at: 0,
                detail: format!("{} vs recorded {}", hex_string(deal), hex_string(rec.deal)),
            });
        }
        let mut first: i64 = -1;
        let mut first_field: &'static str = "";
        for (what, mine, want) in [("d", &self.d, rec.d), ("l", &self.l, rec.l), ("v", &self.v, rec.v)] {
            let rec_n = want.len() / 16;
            let n = mine.len().min(rec_n);
            let mut at: Option<usize> = None;
            for (i, &x) in mine.iter().enumerate().take(n) {
                if parse_hex16(&want[16 * i..16 * i + 16]) != Some(x) {
                    at = Some(i);
                    break;
                }
            }
            if at.is_none() && mine.len() != rec_n {
                at = Some(n);
            }
            if let Some(i) = at {
                let m = mine.get(i).map(|&x| hex_string(x)).unwrap_or_else(|| "(none)".into());
                let w = if i < rec_n {
                    String::from_utf8_lossy(&want[16 * i..16 * i + 16]).into_owned()
                } else {
                    "(none)".into()
                };
                mismatches.push(Mismatch {
                    what,
                    at: i as i64,
                    detail: format!("{m} vs recorded {w}"),
                });
                if first < 0 || (i as i64) < first {
                    first = i as i64;
                    first_field = what;
                }
            }
        }
        let mut code_diffs = 0u64;
        let mut probe_mismatches = 0u64;
        let n = self.probes.len().min(self.rec_probes.len());
        for i in 0..n {
            let (a, b) = (self.probes[i], self.rec_probes[i]);
            if (a == 0) != (b == 0) {
                if probe_mismatches < 4 {
                    let state = i / PROBES_PER_STATE;
                    mismatches.push(Mismatch {
                        what: "probe",
                        at: i as i64,
                        detail: format!(
                            "verdict {a} vs recorded {b} (probe state {state}, step {})",
                            state as u32 * PROBE_EVERY
                        ),
                    });
                }
                probe_mismatches += 1;
            } else if a != b {
                code_diffs += 1;
            }
        }
        if probe_mismatches > 4 {
            mismatches.push(Mismatch {
                what: "probe",
                at: -1,
                detail: format!("{probe_mismatches} probe verdicts differ in all"),
            });
        }
        if self.probes.len() != self.rec_probes.len() {
            mismatches.push(Mismatch {
                what: "probe",
                at: n as i64,
                detail: format!("{} verdicts vs recorded {}", self.probes.len(), self.rec_probes.len()),
            });
        }
        let mut game = None;
        if let Some(e) = end {
            if t != rec.steps || e != rec.end {
                mismatches.push(Mismatch {
                    what: "end",
                    at: t as i64,
                    detail: format!("{t} {e} vs recorded {} {}", rec.steps, rec.end),
                });
            }
            let gd = self.game_digest(deal, t, e);
            if gd != rec.game {
                mismatches.push(Mismatch {
                    what: "game",
                    at: 0,
                    detail: format!("{} vs recorded {}", hex_string(gd), hex_string(rec.game)),
                });
            }
            game = Some(gd);
        }
        // A refusal (or a length or decode failure) at step t is why d_t is missing, so at an equal step it names the
        // divergence.
        for m in &mismatches {
            if matches!(m.what, "refused" | "length" | "decode") && m.at >= 0 && (first < 0 || m.at <= first) {
                first = m.at;
                first_field = m.what;
            }
        }
        if let Some(tl) = tally {
            tl.classify_end(&g, end);
        }
        ReplayResult {
            ok: mismatches.is_empty(),
            mismatches,
            code_diffs,
            first_step: first,
            first_field,
            steps: t,
            end,
            game,
            last: g,
        }
    }

    /// The game digest (replay-format.md §7.2) from the port's own digests and verdicts.
    fn game_digest(&self, deal: u64, steps: u32, end: &str) -> u64 {
        let mut g = ByteDigest::new();
        g.push(&hex16(deal));
        for col in [&self.d, &self.l, &self.v] {
            g.open_element();
            for &x in col.iter() {
                g.feed(&hex16(x));
            }
            g.close_element();
        }
        g.open_element();
        for &p in &self.probes {
            g.feed(if p == 0 { b"1" } else { b"0" });
        }
        g.close_element();
        g.push(format!("{steps}|{end}").as_bytes());
        g.value()
    }
}

/// The gated columns (11-17 of replay-format.md §7.1, with T and the end) of a game the port recorded itself.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Columns {
    /// T.
    pub steps: u32,
    /// `finished` or `capped`.
    pub end: &'static str,
    /// The deal digest, 16 hex.
    pub deal: String,
    /// The actions, hex.
    pub actions: String,
    /// d_0..d_{T-1}, 16 hex each.
    pub d: String,
    /// l_0..l_{T-1}.
    pub l: String,
    /// v_0..v_{T-1}.
    pub v: String,
    /// The probe verdict bytes, hex.
    pub probes: String,
    /// The game digest.
    pub game: String,
}

impl Columns {
    /// Columns 9-17 of a corpus line joined by tabs (steps, end, deal, actions, d, l, v, probes, game).
    pub fn tail(&self) -> String {
        [
            self.steps.to_string(),
            self.end.to_string(),
            self.deal.clone(),
            self.actions.clone(),
            self.d.clone(),
            self.l.clone(),
            self.v.clone(),
            self.probes.clone(),
            self.game.clone(),
        ]
        .join("\t")
    }
}

/// Play and record one game with `policy(game, acting_seat)` choosing every action, as the emitter does: the port's
/// own record of the game, in the corpus's columns. It stops at `finished` or at the step cap. A refused action is
/// an error (a policy bug).
pub fn record_game(seed: &str, start: u8, mut policy: impl FnMut(&Game, u8) -> Action) -> Result<Columns, String> {
    if !seed_ok(seed.as_bytes()) || start > 5 {
        return Err(format!("seed {seed:?} or start seat {start} refused"));
    }
    let mut g = Game::new(seed, start).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 1024];
    let mut sbuf = [0u8; STATE_LEN];
    let mut asks = AskList::new();
    let mut events = Events::new();
    let mut chain = ByteDigest::new();
    chain.push(format!("{FORMAT}|{start}|{seed}").as_bytes());
    encode_state(&g, &mut sbuf);
    chain.push(&sbuf);
    let deal = chain.value();
    let mut log = ByteDigest::new();
    let n = encode_event(&Event::GameStarted { start }, &mut buf);
    log.push(&buf[..n]);
    let mut log_len = 1u32;
    let (mut actions, mut d, mut l, mut v) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let mut probes: Vec<u8> = Vec::new();
    let mut t = 0u32;
    let probe = |g: &Game, t: u32, acting: u8, asks: &AskList, probes: &mut Vec<u8>| {
        for p in generate_probes(seed.as_bytes(), t, acting, asks) {
            probes.push(verdict(g, &probe_action(&p)));
        }
    };
    while g.phase() != FINISHED && t < STEP_CAP {
        let acting = g.acting_seat();
        g.legal_asks(acting, &mut asks);
        let kinds = g.legal_kinds(acting, &asks);
        let n = encode_legal(acting, kinds, &asks, &mut buf);
        l.push(crate::digest::digest(&buf[..n]));
        let n = encode_view(&g, acting, log_len, &log.hex(), &mut buf);
        v.push(crate::digest::digest(&buf[..n]));
        if t % PROBE_EVERY == 0 {
            probe(&g, t, acting, &asks, &mut probes);
        }
        let a = policy(&g, acting);
        g.apply(&a, &mut events).map_err(|e| {
            format!(
                "step {t}: the port refused the policy's {} ({})",
                describe_action(&a),
                e.name()
            )
        })?;
        let n = encode_action(&a, &mut buf);
        actions.extend_from_slice(&buf[..n]);
        chain.push(&buf[..n]);
        let n = encode_events(events.as_slice(), &mut buf);
        chain.push(&buf[..n]);
        encode_state(&g, &mut sbuf);
        chain.push(&sbuf);
        d.push(chain.value());
        for e in events.as_slice() {
            let n = encode_event(e, &mut buf);
            log.push(&buf[..n]);
            log_len += 1;
        }
        t += 1;
    }
    let end = if g.phase() == FINISHED { "finished" } else { "capped" };
    let acting = g.acting_seat();
    g.legal_asks(acting, &mut asks);
    probe(&g, t, acting, &asks, &mut probes);
    let hex_all = |xs: &[u64]| xs.iter().map(|&x| hex_string(x)).collect::<String>();
    let bytes_hex = |xs: &[u8]| xs.iter().map(|x| format!("{x:02x}")).collect::<String>();
    let mut r = Replayer::new(Mutant::None);
    r.d = d.clone();
    r.l = l.clone();
    r.v = v.clone();
    r.probes = probes.clone();
    let game = r.game_digest(deal, t, end);
    Ok(Columns {
        steps: t,
        end,
        deal: hex_string(deal),
        actions: bytes_hex(&actions),
        d: hex_all(&d),
        l: hex_all(&l),
        v: hex_all(&v),
        probes: bytes_hex(&probes),
        game: hex_string(game),
    })
}

/// The aggregate of a block: a fresh stream fed each game digest (ASCII) in index order.
pub fn aggregate<'a>(game_digests: impl IntoIterator<Item = &'a str>) -> u64 {
    let mut g = ByteDigest::new();
    for x in game_digests {
        g.push(x.as_bytes());
    }
    g.value()
}
