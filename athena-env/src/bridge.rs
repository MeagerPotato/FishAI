//! The bridge walk of G0a (ii) (ATHENA.md §4.6; `scripts/athena/replay-format.md` §12).
//!
//! FishLab's host plays our bots and writes one `fish_record` JSON line a game. The reference reads those lines into
//! the engine's shapes with `scripts/bridge-records.mjs` (`readRecordFile`, `toRecord`) and walks each game with its
//! `walkAsks`, which hands the caller the asking seat's own view at every ask event;
//! `scripts/athena/emit-bridge-views.mjs` digests each of those views. This module is the port's own reader and walk,
//! rule for rule:
//!
//! - [`RecordReader`] is `readRecordFile`. A header line gives the deck's translation ([`Deck`]); every other line is a
//!   game, translated by `toRecord`'s rules ([`to_record`]) into a [`BridgeGame`]: the deal and the public event log,
//!   with `player_out` rebuilt from the host's hand counts. It makes the same checks: after every event each tracked
//!   hand count equals the host's, and every set's award equals the host's.
//! - [`walk_asks`] is `walkAsks`. At every ask event it checks the recorded hit against the tracked deal, builds the
//!   asking seat's view V_b and hands it to the caller.
//! - **The reduced reveal** (ATHENA.md §4.1; `botpkg/bridge.mjs:133-150`). A wrong declare publishes only the true
//!   holders a hit had already shown; the others are NONE, in the set block and in the claim event of the log.
//! - **The score is by team, never by side** (`scripts/attribute.mjs:286-289`).
//!
//! V_b is V_t of §4.7 with the walk's values: `moveIndex` and the log length are the event's index, the phase is
//! `playing`, the turn is the asker's, and the window is closed. [`encode_view_parts`] writes the same layout as
//! [`crate::codec::encode_view`], which a test checks byte for byte on home games.
//!
//! Like the rest of the library, this module opens no file: the `bridge-walk` binary does the reading.

pub mod json;

use crate::cards::{bit, card_index, team, NCARDS, NONE, NSEATS, NSETS, SET_CARDS, SET_OF_CARD};
use crate::codec::{encode_event, RULES_ID_US54};
use crate::digest::{digest, hex16, ByteDigest};
use crate::rng::decimal;
use crate::rules::{Event, PLAYING};
use json::Json;

/// The expected-file format tag (replay-format.md §12.5).
pub const FORMAT_BRIDGE: &str = "athena-bridge-view-1";
/// The longest view: 146 fixed bytes, at most 54 cards, the log length and the log digest's 16 characters.
pub const VIEW_MAX: usize = 146 + NCARDS + 20;
/// The eight fields of a view, in the order of the fingerprints (replay-format.md §12.6).
pub const FIELD_NAMES: [&str; 8] = [
    "head",
    "moveIndex",
    "counts",
    "score",
    "sets",
    "hand",
    "logLength",
    "logDigest",
];

/// A negative control of G0a (ii): a planted fault that the check must catch. Its code paths exist only with the
/// `mutants` feature, as G0a (i)'s mutants do.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Control {
    /// The reference walk.
    None,
    /// (a) The score by side instead of by team: arm A's sets first, wherever it sits. It differs from the team order
    /// exactly when arm A plays team 1 and the score is uneven (the bug `attribute.mjs` fixed on 2026-09-16).
    ScoreBySide,
    /// (b) No reduced reveal: a wrong declare fills every true holder from the tracked deal, as the home engine does.
    FullReveal,
}

impl Control {
    /// `none`, `score-by-side` or `full-reveal`.
    pub fn parse(s: &str) -> Option<Control> {
        match s {
            "none" => Some(Control::None),
            "score-by-side" => Some(Control::ScoreBySide),
            "full-reveal" => Some(Control::FullReveal),
            _ => None,
        }
    }

    /// The flag's spelling.
    pub fn name(self) -> &'static str {
        match self {
            Control::None => "none",
            Control::ScoreBySide => "score-by-side",
            Control::FullReveal => "full-reveal",
        }
    }
}

fn check_control(control: Control) {
    #[cfg(not(feature = "mutants"))]
    assert!(
        control == Control::None,
        "a negative control needs the `mutants` feature"
    );
    let _ = control;
}

/// A FishLab card name as the us54 card index: `toAi`'s translation (`RJ` to `XR`, `BJ` to `XB`, `10x` to `Tx`), then
/// the canonical index. None if the result is not a us54 card.
pub fn to_ai(name: &str) -> Option<u8> {
    match name {
        "RJ" => card_index("XR"),
        "BJ" => card_index("XB"),
        _ => match name.strip_prefix("10") {
            Some(suit) => card_index(&format!("T{suit}")),
            None => card_index(name),
        },
    }
}

/// The deck's translation from a record file's header line.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Deck {
    /// The us54 card at each position of the header's `cards` list.
    pub card: [u8; NCARDS],
    /// The us54 set of each of the header's half-suits: six consecutive positions of `cards`.
    pub set: [u8; NSETS],
}

impl Deck {
    /// Read a header object's `cards`: 54 distinct names, each run of six in one us54 set (`readRecordFile`'s check
    /// that no half-suit spans two books).
    pub fn from_header(h: &Json) -> Result<Deck, String> {
        let cards = h
            .get("cards")
            .and_then(Json::as_array)
            .ok_or("the header has no cards list")?;
        if cards.len() != NCARDS {
            return Err(format!("the header lists {} cards, not 54", cards.len()));
        }
        let mut card = [0u8; NCARDS];
        let mut seen = 0u64;
        for (i, c) in cards.iter().enumerate() {
            let name = c.as_str().ok_or_else(|| format!("header card {i} is not a string"))?;
            let ai = to_ai(name).ok_or_else(|| format!("header card {i} ({name}) is not a us54 card"))?;
            if seen & bit(ai) != 0 {
                return Err(format!("the header lists {name} twice"));
            }
            seen |= bit(ai);
            card[i] = ai;
        }
        let mut set = [0u8; NSETS];
        for (s, out) in set.iter_mut().enumerate() {
            let b = SET_OF_CARD[card[s * 6] as usize];
            if (1..6).any(|j| SET_OF_CARD[card[s * 6 + j] as usize] != b) {
                return Err(format!("half-suit {s} spans more than one us54 set"));
            }
            *out = b;
        }
        Ok(Deck { card, set })
    }
}

/// One game of a record file, translated (`toRecord`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BridgeGame {
    /// `deal`, as JavaScript prints it.
    pub deal: String,
    /// `rot`, as JavaScript prints it.
    pub rot: String,
    /// `orient`: the team arm A played (`teamA`). SESTINA played the other.
    pub team_a: u8,
    /// The dealt hands.
    pub hands0: [u64; NSEATS],
    /// The public event log: `game_started`, then every ask, claim and pass with the `player_out` events rebuilt
    /// from the host's counts. It has no `game_over`, as the reference's has none.
    pub events: Vec<Event>,
    /// Forced declares (kind 3), for information.
    pub forced: u32,
}

fn seat_of_json(x: &Json, what: &str, label: &str) -> Result<u8, String> {
    match x.as_index() {
        Some(s) if s < NSEATS => Ok(s as u8),
        _ => Err(format!("{label}: {what} {} is not a seat", x.js_string())),
    }
}

fn counts_of_json(x: &Json, label: &str, n: usize) -> Result<[u32; NSEATS], String> {
    let a = x
        .as_array()
        .filter(|a| a.len() >= NSEATS)
        .ok_or_else(|| format!("{label}: event {n} has no six hand counts"))?;
    let mut out = [0u32; NSEATS];
    for (o, v) in out.iter_mut().zip(a) {
        *o = v.as_index().filter(|&c| c <= NCARDS).ok_or_else(|| {
            format!(
                "{label}: event {n} has a hand count {} that is not a count",
                v.js_string()
            )
        })? as u32;
    }
    Ok(out)
}

/// Translate one game line's object by `toRecord`'s rules, with its checks. `control` plants a negative control
/// (only with the `mutants` feature).
pub fn to_record(o: &Json, deck: &Deck, control: Control) -> Result<BridgeGame, String> {
    check_control(control);
    let deal = o.get("deal").map_or_else(|| "undefined".to_string(), Json::js_string);
    let rot = o.get("rot").map_or_else(|| "undefined".to_string(), Json::js_string);
    let label = format!("{deal}:{rot}");
    let team_a = match o.get("orient").and_then(Json::as_index) {
        Some(t) if t < 2 => t as u8,
        _ => return Err(format!("{label}: orient is not 0 or 1")),
    };
    let dealt = o
        .get("dealt")
        .and_then(Json::as_array)
        .filter(|d| d.len() == NSEATS)
        .ok_or_else(|| format!("{label}: dealt is not six hands"))?;
    let mut hands0 = [0u64; NSEATS];
    let mut seat_of = [NONE; NCARDS];
    for (x, h) in dealt.iter().enumerate() {
        for c in h.as_array().ok_or_else(|| format!("{label}: hand {x} is not a list"))? {
            let c = c
                .as_index()
                .filter(|&c| c < NCARDS)
                .ok_or_else(|| format!("{label}: hand {x} lists {} (not a card index)", c.js_string()))?;
            let card = deck.card[c];
            if seat_of[card as usize] != NONE {
                return Err(format!("{label}: a card is dealt twice"));
            }
            seat_of[card as usize] = x as u8;
            hands0[x] |= bit(card);
        }
    }
    let raw = o
        .get("events")
        .and_then(Json::as_array)
        .ok_or_else(|| format!("{label}: no events list"))?;
    let mut hands = hands0;
    // the seat a public hit moved a card to, while its set is open (NONE: never hit, or resolved)
    let mut public_at = [NONE; NCARDS];
    let mut prev = hands0.map(|h| h.count_ones());
    let mut events: Vec<Event> = Vec::with_capacity(raw.len() + 8);
    let mut outcomes: Vec<(usize, u8)> = Vec::new();
    let mut forced = 0u32;
    let mut started = false;
    for (n, e) in raw.iter().enumerate() {
        let e = e
            .as_array()
            .filter(|a| a.len() >= 8)
            .ok_or_else(|| format!("{label}: event {n} is not an eight-field list"))?;
        let kind = e[0]
            .as_index()
            .ok_or_else(|| format!("{label}: event {n} has kind {}", e[0].js_string()))?;
        if kind == 4 {
            continue;
        }
        let actor = seat_of_json(&e[1], "the actor", &label)?;
        if !started {
            events.push(Event::GameStarted { start: actor });
            started = true;
        }
        match kind {
            0 => {
                let target = seat_of_json(&e[2], "the target", &label)?;
                let c = e[3]
                    .as_index()
                    .filter(|&c| c < NCARDS)
                    .ok_or_else(|| format!("{label}: event {n} asks for {} (not a card index)", e[3].js_string()))?;
                let card = deck.card[c];
                let hit = e[5].truthy();
                events.push(Event::Ask {
                    asker: actor,
                    target,
                    card,
                    hit,
                });
                if hit {
                    hands[target as usize] &= !bit(card);
                    hands[actor as usize] |= bit(card);
                    seat_of[card as usize] = actor;
                    public_at[card as usize] = actor;
                }
            }
            1 | 3 => {
                let s = e[4]
                    .as_index()
                    .filter(|&s| s < NSETS)
                    .ok_or_else(|| format!("{label}: event {n} declares {} (not a half-suit)", e[4].js_string()))?;
                let set = deck.set[s];
                let owner = e[6]
                    .as_array()
                    .filter(|a| a.len() >= 6)
                    .ok_or_else(|| format!("{label}: event {n} has no six stated owners"))?;
                let ok = e[5].truthy();
                let mut assign = [NONE; 6];
                let mut holders = [NONE; 6];
                for (j, stated) in owner.iter().take(6).enumerate() {
                    let card = deck.card[s * 6 + j];
                    let k = SET_CARDS[set as usize]
                        .iter()
                        .position(|&x| x == card)
                        .expect("the deck maps a half-suit onto one set");
                    assign[k] = seat_of_json(stated, "a stated owner", &label)?;
                    // a right declare publishes every holder; a wrong one only the cards a hit had already shown
                    holders[k] = if ok {
                        seat_of[card as usize]
                    } else {
                        public_at[card as usize]
                    };
                    #[cfg(feature = "mutants")]
                    if control == Control::FullReveal {
                        holders[k] = seat_of[card as usize];
                    }
                }
                let outcome = if ok { team(actor) } else { 1 - team(actor) };
                events.push(Event::Claim {
                    claimer: actor,
                    set,
                    assign,
                    holders,
                    outcome,
                });
                outcomes.push((s, outcome));
                if kind == 3 {
                    forced += 1;
                }
                for j in 0..6 {
                    let card = deck.card[s * 6 + j] as usize;
                    let x = seat_of[card];
                    if x != NONE {
                        hands[x as usize] &= !bit(card as u8);
                    }
                    seat_of[card] = NONE;
                    public_at[card] = NONE;
                }
            }
            2 => {
                let to = seat_of_json(&e[2], "the pass target", &label)?;
                events.push(Event::Pass { from: actor, to });
            }
            k => return Err(format!("{label}: unknown event kind {k}")),
        }
        let hc = counts_of_json(&e[7], &label, n)?;
        for x in 0..NSEATS {
            if prev[x] > 0 && hc[x] == 0 {
                events.push(Event::PlayerOut { seat: x as u8 });
            }
        }
        prev = hc;
        for x in 0..NSEATS {
            let tracked = hands[x].count_ones();
            if tracked != hc[x] {
                return Err(format!(
                    "{label}: tracked count {tracked} at seat {x} but the engine says {} after event {}",
                    hc[x],
                    events.len()
                ));
            }
        }
    }
    if let Some(sw) = o.get("setWinner").and_then(Json::as_array) {
        for &(s, t) in &outcomes {
            if sw.get(s).and_then(Json::as_f64) != Some(t as f64) {
                return Err(format!(
                    "{label}: half-suit {s} awarded to {} by the engine but {t} by the events",
                    sw.get(s).map_or_else(|| "undefined".to_string(), Json::js_string)
                ));
            }
        }
    }
    Ok(BridgeGame {
        deal,
        rot,
        team_a,
        hands0,
        events,
        forced,
    })
}

/// What a record line held.
#[derive(Clone, Debug)]
pub enum Line {
    /// A header: the deck's translation was (re)read.
    Header,
    /// A game.
    Game(Box<BridgeGame>),
}

/// `readRecordFile`'s reader state: the deck of the last header line.
#[derive(Clone, Debug)]
pub struct RecordReader {
    deck: Option<Deck>,
    control: Control,
}

impl RecordReader {
    /// A reader for one record file. `control` is [`Control::None`] unless the `mutants` feature is on.
    pub fn new(control: Control) -> Self {
        check_control(control);
        RecordReader { deck: None, control }
    }

    /// One non-empty line of a record file.
    pub fn read_line(&mut self, line: &str) -> Result<Line, String> {
        let o = json::parse(line).map_err(|e| e.to_string())?;
        if o.get("header").is_some_and(Json::truthy) {
            self.deck = Some(Deck::from_header(&o)?);
            return Ok(Line::Header);
        }
        let deck = self.deck.as_ref().ok_or("a game before the header")?;
        Ok(Line::Game(Box::new(to_record(&o, deck, self.control)?)))
    }
}

/// The lines `readRecordFile` reads: the text split on LF, with empty lines dropped (its `.filter(Boolean)`).
pub fn record_lines(text: &str) -> impl Iterator<Item = &str> {
    text.split('\n').filter(|l| !l.is_empty())
}

/// The values of one view, V_t's fields (replay-format.md §4.7).
#[derive(Clone, Copy, Debug)]
pub struct ViewParts<'a> {
    /// The viewing seat.
    pub seat: u8,
    /// `moveIndex`.
    pub move_index: u32,
    /// The phase code.
    pub phase: u8,
    /// The turn seat.
    pub turn: u8,
    /// The window: open, option seat, declined; or 0, NONE, NONE.
    pub window: [u8; 3],
    /// Every seat's hand count.
    pub counts: [u8; NSEATS],
    /// The score of team 0, then team 1.
    pub score: [u8; 2],
    /// The set block (§4.1).
    pub sets: &'a [u8; 14 * NSETS],
    /// The viewer's hand.
    pub hand: u64,
    /// The log's length.
    pub log_len: u32,
    /// The log digest's 16 hex characters.
    pub log_hex: &'a [u8; 16],
}

/// V (§4.7) from its values into `out`; returns the length. The layout of [`crate::codec::encode_view`].
pub fn encode_view_parts(p: &ViewParts<'_>, out: &mut [u8]) -> usize {
    out[0] = RULES_ID_US54;
    out[1] = p.seat;
    out[2..6].copy_from_slice(&p.move_index.to_le_bytes());
    out[6] = p.phase;
    out[7] = p.turn;
    out[8..11].copy_from_slice(&p.window);
    out[11..17].copy_from_slice(&p.counts);
    out[17] = p.score[0];
    out[18] = p.score[1];
    out[19..145].copy_from_slice(p.sets);
    let mut n = 146;
    let mut m = p.hand;
    while m != 0 {
        out[n] = m.trailing_zeros() as u8;
        m &= m - 1;
        n += 1;
    }
    out[145] = (n - 146) as u8;
    out[n..n + 4].copy_from_slice(&p.log_len.to_le_bytes());
    out[n + 4..n + 20].copy_from_slice(p.log_hex);
    n + 20
}

/// The byte ranges of a view's fields after the head (§12.6); the head is bytes 0..2 and 6..11.
fn field_ranges(v: &[u8]) -> [std::ops::Range<usize>; 7] {
    let h = v[145] as usize;
    [
        2..6,
        11..17,
        17..19,
        19..145,
        145..146 + h,
        146 + h..150 + h,
        150 + h..166 + h,
    ]
}

/// The view's eight field fingerprints (§12.6): per field, the low byte of its digest, the head's first. As a u64,
/// its 16 hex characters are the expected file's `f` entry.
pub fn view_fingerprints(v: &[u8]) -> u64 {
    let mut d = ByteDigest::new();
    d.open_element();
    d.feed(&v[0..2]);
    d.feed(&v[6..11]);
    d.close_element();
    let mut out = d.value() & 0xff;
    for r in field_ranges(v) {
        out = (out << 8) | (digest(&v[r]) & 0xff);
    }
    out
}

/// The names of the fields whose fingerprints differ.
pub fn differing_fields(port: u64, expected: u64) -> Vec<&'static str> {
    (0..8)
        .filter(|&i| (port >> (56 - 8 * i)) & 0xff != (expected >> (56 - 8 * i)) & 0xff)
        .map(|i| FIELD_NAMES[i])
        .collect()
}

/// A view, field by field, for a divergence report.
pub fn describe_view(v: &[u8]) -> String {
    let hexs = |b: &[u8]| b.iter().map(|x| format!("{x:02x}")).collect::<String>();
    let r = field_ranges(v);
    let mut sets = String::new();
    for s in 0..NSETS {
        let o = 19 + 14 * s;
        if v[o] != NONE {
            sets.push_str(&format!(
                " {}:{}/{}/{}/{}",
                crate::cards::SET_NAMES[s],
                v[o],
                v[o + 1],
                hexs(&v[o + 2..o + 8]),
                hexs(&v[o + 8..o + 14])
            ));
        }
    }
    let hand: Vec<String> = v[r[4].start + 1..r[4].end]
        .iter()
        .map(|&c| String::from_utf8_lossy(&crate::cards::card_name(c)).into_owned())
        .collect();
    format!(
        "head {} | moveIndex {} | counts {} | score {} | sets{} | hand [{}] | logLength {} | logDigest {}",
        hexs(&[&v[0..2], &v[6..11]].concat()),
        u32::from_le_bytes([v[2], v[3], v[4], v[5]]),
        hexs(&v[r[1].clone()]),
        hexs(&v[r[2].clone()]),
        if sets.is_empty() { " none".to_string() } else { sets },
        hand.join(" "),
        u32::from_le_bytes([v[r[5].start], v[r[5].start + 1], v[r[5].start + 2], v[r[5].start + 3]]),
        String::from_utf8_lossy(&v[r[6].clone()])
    )
}

/// What the walk hands its caller at an ask event.
#[derive(Clone, Copy, Debug)]
pub struct Ask<'a> {
    /// The ask's ordinal in the game, from 0.
    pub k: u32,
    /// The event's index in the log: the view's `moveIndex` and its log length.
    pub event: u32,
    /// The asking seat, whose view it is.
    pub asker: u8,
    /// The encoded view V_b.
    pub view: &'a [u8],
}

/// Counts from one game's walk.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct WalkInfo {
    /// Ask events.
    pub asks: u32,
    /// Asks by arm A's team.
    pub asks_arm_a: u32,
    /// Views that show a resolved set with an unrevealed true holder.
    pub hidden_views: u32,
    /// Views whose score is uneven.
    pub asymmetric_score_views: u32,
}

/// `walkAsks`: at every ask event, the asking seat's view V_b, handed to `on_ask`. Errors if a recorded hit
/// disagrees with the tracked deal. `control` plants a negative control (only with the `mutants` feature).
pub fn walk_asks(g: &BridgeGame, control: Control, mut on_ask: impl FnMut(&Ask<'_>)) -> Result<WalkInfo, String> {
    check_control(control);
    let mut hands = g.hands0;
    let mut seat_of = [NONE; NCARDS];
    for (x, &h) in hands.iter().enumerate() {
        let mut m = h;
        while m != 0 {
            seat_of[m.trailing_zeros() as usize] = x as u8;
            m &= m - 1;
        }
    }
    let mut sets = [NONE; 14 * NSETS];
    let mut awarded = [0u8; 2];
    let mut log = ByteDigest::new();
    let mut ebuf = [0u8; 32];
    let mut vbuf = [0u8; VIEW_MAX];
    let mut info = WalkInfo::default();
    for (i, ev) in g.events.iter().enumerate() {
        match *ev {
            Event::Ask {
                asker,
                target,
                card,
                hit,
            } => {
                if (seat_of[card as usize] == target) != hit {
                    return Err(format!(
                        "{}:{}: event {i} says hit={hit} but the tracked deal says {}",
                        g.deal, g.rot, !hit
                    ));
                }
                // the score by team, as the engine keeps it
                #[allow(unused_mut)]
                let mut score = awarded;
                #[cfg(feature = "mutants")]
                if control == Control::ScoreBySide && g.team_a == 1 {
                    score.swap(0, 1);
                }
                let log_hex = log.hex();
                let n = encode_view_parts(
                    &ViewParts {
                        seat: asker,
                        move_index: i as u32,
                        phase: PLAYING,
                        turn: asker,
                        window: [0, NONE, NONE],
                        counts: hands.map(|h| h.count_ones() as u8),
                        score,
                        sets: &sets,
                        hand: hands[asker as usize],
                        log_len: i as u32,
                        log_hex: &log_hex,
                    },
                    &mut vbuf,
                );
                on_ask(&Ask {
                    k: info.asks,
                    event: i as u32,
                    asker,
                    view: &vbuf[..n],
                });
                info.asks += 1;
                if team(asker) == g.team_a {
                    info.asks_arm_a += 1;
                }
                if (0..NSETS).any(|s| sets[14 * s] != NONE && sets[14 * s + 8..14 * s + 14].contains(&NONE)) {
                    info.hidden_views += 1;
                }
                if score[0] != score[1] {
                    info.asymmetric_score_views += 1;
                }
                if hit {
                    hands[target as usize] &= !bit(card);
                    hands[asker as usize] |= bit(card);
                    seat_of[card as usize] = asker;
                }
            }
            Event::Claim {
                claimer,
                set,
                assign,
                holders,
                outcome,
            } => {
                let o = 14 * set as usize;
                sets[o] = outcome;
                sets[o + 1] = claimer;
                sets[o + 2..o + 8].copy_from_slice(&assign);
                sets[o + 8..o + 14].copy_from_slice(&holders);
                awarded[if outcome == 0 { 0 } else { 1 }] += 1;
                for &c in &SET_CARDS[set as usize] {
                    let x = seat_of[c as usize];
                    if x != NONE {
                        hands[x as usize] &= !bit(c);
                    }
                    seat_of[c as usize] = NONE;
                }
            }
            _ => {}
        }
        let n = encode_event(ev, &mut ebuf);
        log.push(&ebuf[..n]);
    }
    Ok(info)
}

/// One game walked: its per-ask view digests and fingerprints, and its counts.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GameViews {
    /// The view digest at every ask, in event order.
    pub views: Vec<u64>,
    /// The field fingerprints at every ask.
    pub fingerprints: Vec<u64>,
    /// The walk's counts.
    pub info: WalkInfo,
}

impl GameViews {
    /// The game digest (§12.5): a fresh stream with the ASCII of the `v` column, then the decimal ask count.
    pub fn game_digest(&self) -> u64 {
        game_digest(&self.views)
    }
}

/// Walk a game and digest every ask's view.
pub fn game_views(g: &BridgeGame, control: Control) -> Result<GameViews, String> {
    let mut views = Vec::with_capacity(g.events.len());
    let mut fingerprints = Vec::with_capacity(g.events.len());
    let info = walk_asks(g, control, |a| {
        views.push(digest(a.view));
        fingerprints.push(view_fingerprints(a.view));
    })?;
    Ok(GameViews {
        views,
        fingerprints,
        info,
    })
}

/// The game digest of a list of view digests (§12.5).
pub fn game_digest(views: &[u64]) -> u64 {
    let mut d = ByteDigest::new();
    d.open_element();
    for &v in views {
        d.feed(&hex16(v));
    }
    d.close_element();
    let mut buf = [0u8; 20];
    d.push(decimal(views.len() as u64, &mut buf));
    d.value()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codec::encode_view;
    use crate::digest::{hex_string, parse_hex16};
    use crate::rules::{Events, Game, FINISHED};
    use crate::stub::{mixed_stub_action, mixed_stub_rng};

    /// A hand-built record in the bridge's schema (not a FishLab record): a header whose card order is our own (sets
    /// in reverse canonical order, each set's cards descending, FishLab's spellings `10x`, `RJ`, `BJ`), and two games
    /// on decks dealt by our own generator from the seeds `athena-g0a2-fixture-0` and `-1`. They have hits, misses,
    /// a right declare, a wrong declare with two of six holders revealed, a forced wrong declare with one revealed,
    /// a hit that empties its target (`player_out`), a pass, and arm A on team 0 and on team 1. The same text is
    /// `tests/athena/bridge-walk.test.ts`'s fixture, and the digests below are the reference emitter's for it.
    const FIXTURE: &str = concat!(
        r#"{"header":1,"specA":"fixture-a","specB":"fixture-b","games":2,"rotations":1,"seed":"fixture","sets":9,"cards":["BJ","RJ","8S","8H","8D","8C","AS","KS","QS","JS","10S","9S","AH","KH","QH","JH","10H","9H","AD","KD","QD","JD","10D","9D","AC","KC","QC","JC","10C","9C","7S","6S","5S","4S","3S","2S","7H","6H","5H","4H","3H","2H","7D","6D","5D","4D","3D","2D","7C","6C","5C","4C","3C","2C"]}"#,
        "\n",
        r#"{"deal":0,"rot":0,"orient":0,"shift":0,"seed":"athena-g0a2-fixture-0","dealt":[[2,12,26,31,36,39,40,44,48],[1,5,6,11,13,18,25,34,46],[3,7,16,20,28,37,50,52,53],[0,8,15,22,41,42,43,45,47],[14,19,21,24,29,30,33,49,51],[4,9,10,17,23,27,32,35,38]],"events":[[0,0,1,46,7,1,[0,0,0,0,0,0],[10,8,9,9,9,9]],[0,0,1,53,8,0,[0,0,0,0,0,0],[10,8,9,9,9,9]],[0,1,0,40,6,1,[0,0,0,0,0,0],[9,9,9,9,9,9]],[0,1,0,39,6,1,[0,0,0,0,0,0],[8,10,9,9,9,9]],[0,1,2,37,6,1,[0,0,0,0,0,0],[8,11,8,9,9,9]],[0,1,0,36,6,1,[0,0,0,0,0,0],[7,12,8,9,9,9]],[1,1,0,0,6,1,[1,1,5,1,1,3],[7,8,8,8,9,8]],[0,1,2,35,5,0,[0,0,0,0,0,0],[7,8,8,8,9,8]],[0,2,1,11,1,1,[0,0,0,0,0,0],[7,7,9,8,9,8]],[0,2,5,10,1,1,[0,0,0,0,0,0],[7,7,10,8,9,7]],[1,2,0,0,1,0,[2,2,2,2,2,2],[7,6,7,7,9,6]],[0,2,3,51,8,0,[0,0,0,0,0,0],[7,6,7,7,9,6]],[0,3,0,44,7,1,[0,0,0,0,0,0],[6,6,7,8,9,6]],[0,3,0,2,0,1,[0,0,0,0,0,0],[5,6,7,9,9,6]],[0,3,0,12,2,1,[0,0,0,0,0,0],[4,6,7,10,9,6]],[0,3,0,26,4,1,[0,0,0,0,0,0],[3,6,7,11,9,6]],[0,3,0,48,8,1,[0,0,0,0,0,0],[2,6,7,12,9,6]],[0,3,0,31,5,1,[0,0,0,0,0,0],[1,6,7,13,9,6]],[0,3,0,46,7,1,[0,0,0,0,0,0],[0,6,7,14,9,6]],[3,3,0,0,0,0,[3,1,3,3,5,1],[0,4,6,12,9,5]],[2,3,1,0,0,0,[0,0,0,0,0,0],[0,4,6,12,9,5]],[0,1,2,35,5,0,[0,0,0,0,0,0],[0,4,6,12,9,5]],[4,0,0,0,0,0,[0,0,0,0,0,0],[0,4,6,12,9,5]]],"winner":1,"score":[1,2],"hitLimit":false,"setWinner":[0,1,-1,-1,-1,-1,1,-1,-1]}"#,
        "\n",
        r#"{"deal":1,"rot":0,"orient":1,"shift":0,"seed":"athena-g0a2-fixture-1","dealt":[[3,5,12,27,30,38,43,48,51],[1,15,17,24,25,32,35,39,41],[4,8,16,26,29,33,36,40,45],[9,13,14,18,20,21,31,34,44],[6,7,10,19,22,37,46,50,53],[0,2,11,23,28,42,47,49,52]],"events":[[0,3,4,46,7,1,[0,0,0,0,0,0],[9,9,9,10,8,9]],[0,3,4,47,7,0,[0,0,0,0,0,0],[9,9,9,10,8,9]],[0,4,1,41,6,1,[0,0,0,0,0,0],[9,8,9,10,9,9]],[0,4,1,39,6,1,[0,0,0,0,0,0],[9,7,9,10,10,9]],[1,4,0,0,6,1,[2,4,0,4,2,4],[8,7,7,10,7,9]],[0,4,5,51,8,0,[0,0,0,0,0,0],[8,7,7,10,7,9]],[0,5,4,10,1,1,[0,0,0,0,0,0],[8,7,7,10,6,10]],[0,5,2,8,1,1,[0,0,0,0,0,0],[8,7,6,10,6,11]],[1,5,0,0,1,0,[5,5,5,5,5,5],[8,7,6,9,4,8]],[0,5,0,53,8,0,[0,0,0,0,0,0],[8,7,6,9,4,8]],[0,0,1,35,5,1,[0,0,0,0,0,0],[9,6,6,9,4,8]],[0,0,1,24,4,1,[0,0,0,0,0,0],[10,5,6,9,4,8]],[0,0,1,1,0,1,[0,0,0,0,0,0],[11,4,6,9,4,8]],[0,0,1,25,4,1,[0,0,0,0,0,0],[12,3,6,9,4,8]],[0,0,1,32,5,1,[0,0,0,0,0,0],[13,2,6,9,4,8]],[0,0,1,15,2,1,[0,0,0,0,0,0],[14,1,6,9,4,8]],[0,0,1,17,2,1,[0,0,0,0,0,0],[15,0,6,9,4,8]],[3,0,0,0,0,0,[0,0,0,0,2,0],[12,0,5,9,4,6]],[2,0,2,0,0,0,[0,0,0,0,0,0],[12,0,5,9,4,6]],[0,2,3,47,7,0,[0,0,0,0,0,0],[12,0,5,9,4,6]],[4,0,0,0,0,0,[0,0,0,0,0,0],[12,0,5,9,4,6]]],"winner":0,"score":[2,1],"hitLimit":false,"setWinner":[1,0,-1,-1,-1,-1,0,-1,-1]}"#,
        "\n"
    );

    /// The reference emitter's game digests, ask counts and event counts for [`FIXTURE`], and its aggregate.
    const FIXTURE_GAMES: [(&str, u32, usize); 2] = [("835d2c982b45cd1f", 18, 24), ("2e1230f2a6714221", 16, 22)];
    const FIXTURE_AGGREGATE: &str = "fcf8d27177cc8a58";

    fn fixture_games(control: Control) -> Vec<BridgeGame> {
        let mut r = RecordReader::new(control);
        record_lines(FIXTURE)
            .filter_map(|l| match r.read_line(l).unwrap() {
                Line::Game(g) => Some(*g),
                Line::Header => None,
            })
            .collect()
    }

    fn aggregate_of(digests: &[u64]) -> u64 {
        let mut d = ByteDigest::new();
        for &g in digests {
            d.push(&hex16(g));
        }
        d.value()
    }

    #[test]
    fn to_ai_translates_fishlab_names() {
        assert_eq!(to_ai("RJ"), Some(52));
        assert_eq!(to_ai("BJ"), Some(53));
        assert_eq!(to_ai("10S"), card_index("TS"));
        assert_eq!(to_ai("10C"), card_index("TC"));
        assert_eq!(to_ai("8H"), card_index("8H"));
        assert_eq!(to_ai("XR"), Some(52));
        assert_eq!(to_ai("1S"), None);
        assert_eq!(to_ai("10"), None);
        assert_eq!(to_ai("ZZ"), None);
    }

    #[test]
    fn the_fixture_walks_to_the_reference_digests() {
        let games = fixture_games(Control::None);
        assert_eq!(games.len(), 2);
        let mut digests = Vec::new();
        for (g, &(want, asks, events)) in games.iter().zip(FIXTURE_GAMES.iter()) {
            let gv = game_views(g, Control::None).unwrap();
            assert_eq!(gv.info.asks, asks);
            assert_eq!(g.events.len(), events);
            assert_eq!(gv.views.len(), asks as usize);
            assert_eq!(hex_string(gv.game_digest()), want);
            digests.push(gv.game_digest());
        }
        assert_eq!(hex_string(aggregate_of(&digests)), FIXTURE_AGGREGATE);
        assert_eq!((games[0].team_a, games[1].team_a), (0, 1));
        assert_eq!((games[0].deal.as_str(), games[1].rot.as_str()), ("0", "0"));
        assert_eq!(games[0].forced + games[1].forced, 2);
    }

    #[test]
    fn the_fixture_game_0_log_as_the_reference_reads_it() {
        let g = &fixture_games(Control::None)[0];
        let c = |n: &str| card_index(n).unwrap();
        assert_eq!(g.events[0], Event::GameStarted { start: 0 });
        assert_eq!(
            g.events[1],
            Event::Ask {
                asker: 0,
                target: 1,
                card: c("3D"),
                hit: true
            }
        );
        // The wrong declare of HIGH-S by seat 2: stated all to seat 2; only 9S and TS, which seat 2 had hit, revealed.
        let Event::Claim {
            claimer,
            set,
            assign,
            holders,
            outcome,
        } = g.events[11]
        else {
            panic!("event 11 is not a claim: {:?}", g.events[11]);
        };
        assert_eq!((claimer, set, outcome), (2, 7, 1));
        assert_eq!(assign, [2; 6]);
        assert_eq!(holders, [2, 2, NONE, NONE, NONE, NONE]);
        // The hit that empties seat 0 is followed by its player_out, then the forced declare of EIGHTS: 8S revealed.
        assert_eq!(g.events[20], Event::PlayerOut { seat: 0 });
        let Event::Claim { set, holders, .. } = g.events[21] else {
            panic!("event 21 is not a claim");
        };
        assert_eq!(set, 8);
        assert_eq!(holders, [NONE, NONE, NONE, 3, NONE, NONE]);
        assert_eq!(g.events[22], Event::Pass { from: 3, to: 1 });
    }

    #[test]
    fn views_carry_the_reduced_reveal_and_the_team_score() {
        let g = &fixture_games(Control::None)[1];
        let mut seen = Vec::new();
        walk_asks(g, Control::None, |a| {
            seen.push((a.event, a.asker, a.view.to_vec()));
        })
        .unwrap();
        // The first view: seat 3 at event 1, nothing resolved, the window closed, the log one event long.
        let (event, asker, v) = &seen[0];
        assert_eq!((*event, *asker), (1, 3));
        assert_eq!(&v[..11], &[1, 3, 1, 0, 0, 0, PLAYING, 3, 0, NONE, NONE]);
        assert!(v[19..145].iter().all(|&b| b == NONE));
        // The last view: after LOW-H right (team 0), HIGH-S wrong by seat 5 (team 0), EIGHTS wrong by seat 0
        // (team 1). Arm A is team 1 here, and the score is still team 0's first: 2 to 1.
        let (_, _, v) = seen.last().unwrap();
        assert_eq!(&v[17..19], &[2, 1]);
        let hs = 19 + 14 * 7;
        assert_eq!(v[hs], 0);
        assert_eq!(&v[hs + 8..hs + 14], &[NONE, 5, NONE, 5, NONE, NONE]);
        let e8 = 19 + 14 * 8;
        assert_eq!(v[e8], 1);
        assert_eq!(&v[e8 + 8..e8 + 14], &[NONE, NONE, NONE, NONE, 0, NONE]);
    }

    #[test]
    fn the_readers_checks_refuse_a_tampered_record() {
        let lines: Vec<&str> = record_lines(FIXTURE).collect();
        let game = |text: &str| {
            let mut r = RecordReader::new(Control::None);
            r.read_line(lines[0]).unwrap();
            match r.read_line(text)? {
                Line::Game(g) => game_views(&g, Control::None).map(|_| ()),
                Line::Header => Err("a header".to_string()),
            }
        };
        assert!(game(lines[1]).is_ok());
        // A hand count the tracked deal does not have.
        let bad = lines[1].replacen("[10,8,9,9,9,9]", "[9,9,9,9,9,9]", 1);
        assert_ne!(bad, lines[1]);
        assert!(game(&bad).unwrap_err().contains("tracked count"));
        // An award the events do not make.
        let bad = lines[1].replacen("\"setWinner\":[", "\"setWinner\":[7,", 1);
        let err = game(&bad).unwrap_err();
        assert!(err.contains("awarded"), "{err}");
        // A game before any header.
        let mut r = RecordReader::new(Control::None);
        assert!(r.read_line(lines[1]).unwrap_err().contains("before the header"));
        // A header whose half-suit spans two sets.
        let bad = lines[0].replacen("\"BJ\"", "\"XX\"", 1);
        assert!(RecordReader::new(Control::None).read_line(&bad).is_err());
        let bad = lines[0].replacen("\"BJ\",\"RJ\"", "\"RJ\",\"BJ\"", 1);
        assert!(RecordReader::new(Control::None).read_line(&bad).is_ok());
        // Not JSON.
        assert!(RecordReader::new(Control::None).read_line("{").is_err());
    }

    #[test]
    fn a_recorded_hit_the_tracked_deal_denies_is_refused_by_the_walk() {
        let mut g = fixture_games(Control::None)[0].clone();
        let Event::Ask {
            asker,
            target,
            card,
            hit,
        } = g.events[2]
        else {
            panic!("event 2 is not an ask");
        };
        assert!(!hit);
        g.events[2] = Event::Ask {
            asker,
            target,
            card,
            hit: true,
        };
        assert!(game_views(&g, Control::None).unwrap_err().contains("tracked deal"));
    }

    /// The bridge encoder writes V_t's layout: on home games, from a `Game`'s fields, it equals `codec::encode_view`
    /// byte for byte at every step.
    #[test]
    fn view_parts_equal_the_codec_view_on_home_games() {
        let mut a = [0u8; VIEW_MAX];
        let mut b = [0u8; VIEW_MAX];
        let mut steps = 0;
        for i in 0..6u8 {
            let seed = format!("athena-g0a2-home-{i}");
            let mut g = Game::new(&seed, i).unwrap();
            let mut rng = mixed_stub_rng(&seed);
            let mut events = Events::new();
            let mut log = ByteDigest::new();
            let mut ebuf = [0u8; 32];
            let n = encode_event(&Event::GameStarted { start: i }, &mut ebuf);
            log.push(&ebuf[..n]);
            let mut log_len = 1u32;
            while g.phase() != FINISHED && steps < 20_000 {
                let seat = g.acting_seat();
                let hex = log.hex();
                let na = encode_view(&g, seat, log_len, &hex, &mut a);
                let window = match g.window() {
                    Some(w) => [1, w.option, w.declined],
                    None => [0, NONE, NONE],
                };
                let nb = encode_view_parts(
                    &ViewParts {
                        seat,
                        move_index: g.move_index(),
                        phase: g.phase(),
                        turn: g.turn(),
                        window,
                        counts: g.counts(),
                        score: g.score(),
                        sets: g.set_block(),
                        hand: g.hand(seat),
                        log_len,
                        log_hex: &hex,
                    },
                    &mut b,
                );
                assert_eq!(&a[..na], &b[..nb]);
                let act = mixed_stub_action(&g, seat, &mut rng);
                g.apply(&act, &mut events).unwrap();
                for e in events.as_slice() {
                    let n = encode_event(e, &mut ebuf);
                    log.push(&ebuf[..n]);
                    log_len += 1;
                }
                steps += 1;
            }
        }
        assert!(steps > 1000);
    }

    #[test]
    fn fingerprints_name_the_field_that_changed() {
        let g = &fixture_games(Control::None)[0];
        let mut views = Vec::new();
        walk_asks(g, Control::None, |a| views.push(a.view.to_vec())).unwrap();
        let v = views.last().unwrap().clone();
        let base = view_fingerprints(&v);
        let h = v[145] as usize;
        for (at, field) in [
            (1usize, "head"),
            (9, "head"),
            (3, "moveIndex"),
            (12, "counts"),
            (18, "score"),
            (40, "sets"),
            (146, "hand"),
            (146 + h, "logLength"),
            (155 + h, "logDigest"),
        ] {
            let mut w = v.clone();
            w[at] ^= 0x01;
            let f = view_fingerprints(&w);
            // A one-byte fingerprint can collide; these do not, and the test pins that they name the field.
            assert_eq!(differing_fields(f, base), vec![field], "byte {at}");
        }
        assert!(describe_view(&v).contains("moveIndex 23"));
        assert_eq!(parse_hex16(&hex16(base)), Some(base));
    }

    #[cfg(feature = "mutants")]
    #[test]
    fn both_controls_change_a_fixture_digest() {
        let base: Vec<u64> = fixture_games(Control::None)
            .iter()
            .map(|g| game_views(g, Control::None).unwrap().game_digest())
            .collect();
        // (a) The score by side: game 0 has arm A on team 0, so nothing changes; game 1 has it on team 1.
        let side: Vec<u64> = fixture_games(Control::None)
            .iter()
            .map(|g| game_views(g, Control::ScoreBySide).unwrap().game_digest())
            .collect();
        assert_eq!(side[0], base[0]);
        assert_ne!(side[1], base[1]);
        // (b) The full reveal, planted in the reader: both games have a wrong declare followed by an ask.
        let full: Vec<u64> = fixture_games(Control::FullReveal)
            .iter()
            .map(|g| game_views(g, Control::None).unwrap().game_digest())
            .collect();
        assert_ne!(full[0], base[0]);
        assert_ne!(full[1], base[1]);
    }
}
