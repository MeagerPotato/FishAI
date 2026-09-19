//! The us54 rules core: a port of `lib/engine/reduce.ts`, `helpers.ts` and `deal.ts` over array state.
//!
//! The reference is the judge (ATHENA.md §2, §4.1). Each function below names the reference function it mirrors, and
//! the order of every legality check is the reference's (§4.1 items 4, 6, 10 and 11). The state is a handful of fixed
//! arrays: a 54-bit mask per hand (its ascending bits are the canonical sort), the owner of every card, the six hand
//! counts, and the 126-byte set block of replay-format.md §4.1, which is also the store of every resolved set. Nothing
//! allocates: `apply` writes its events into a caller-owned fixed buffer.
//!
//! Only us54 with every toggle off is implemented. [`RulesConfig::check`] refuses anything else loudly (§4.1 item
//! 15), and no pagat48 path (`endgame`, `awaitDesignate`, `designate`, `void` outcomes from play, own-turn claims)
//! exists here.

use crate::cards::{bit, is_seat, team, NCARDS, NONE, NSEATS, NSETS, SET_CARDS, SET_MASK, SET_OF_CARD};
use crate::rng::rng_from_seed;

/// Phase `playing`.
pub const PLAYING: u8 = 0;
/// Phase `awaitPass`.
pub const AWAIT_PASS: u8 = 1;
/// Phase `finished`.
pub const FINISHED: u8 = 2;
/// `clinchTarget`: floor(9 / 2) + 1 awarded sets.
pub const CLINCH_TARGET: u8 = 5;
/// Outcome byte: team 0 was awarded the set.
pub const TEAM0: u8 = 0;
/// Outcome byte: team 1 was awarded the set.
pub const TEAM1: u8 = 1;
/// Outcome byte `void`: a pagat48 outcome, unreachable by us54 play. Only a hand-built test state carries it.
pub const VOID: u8 = 2;
/// The `game_over` winner byte for a tie (the fallback terminator on a level board; unreachable by us54 play).
pub const TIE: u8 = 2;

/// L_t's kind bits (replay-format.md §4.6).
pub const KIND_ASK: u8 = 1;
/// Claim kind bit.
pub const KIND_CLAIM: u8 = 2;
/// Pass kind bit.
pub const KIND_PASS: u8 = 4;
/// Decline kind bit.
pub const KIND_DECLINE: u8 = 8;

/// The most legal asks a position can have: three targets times fewer than 54 askable cards.
pub const MAX_ASKS: usize = 3 * NCARDS;

/// The reference's error codes, in `lib/engine/types.ts` order. A refused probe verdict is `1 + code as u8`.
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(missing_docs)]
pub enum ErrorCode {
    WrongPhase = 0,
    NotYourTurn,
    AskerOut,
    TargetTeammate,
    TargetSelf,
    TargetOut,
    NoCardOfBook,
    AskingOwnCard,
    InvalidCard,
    BookResolved,
    BadAssignments,
    AssignOpponent,
    PassTargetOut,
    PassTargetNotTeammate,
    DesignateTargetInvalid,
    DeclareWindowOpen,
    NoDeclareWindow,
    NotYourOption,
    MustDeclare,
    InvalidAction,
}

impl ErrorCode {
    /// The reference's name for the code.
    pub const fn name(self) -> &'static str {
        match self {
            ErrorCode::WrongPhase => "WRONG_PHASE",
            ErrorCode::NotYourTurn => "NOT_YOUR_TURN",
            ErrorCode::AskerOut => "ASKER_OUT",
            ErrorCode::TargetTeammate => "TARGET_TEAMMATE",
            ErrorCode::TargetSelf => "TARGET_SELF",
            ErrorCode::TargetOut => "TARGET_OUT",
            ErrorCode::NoCardOfBook => "NO_CARD_OF_BOOK",
            ErrorCode::AskingOwnCard => "ASKING_OWN_CARD",
            ErrorCode::InvalidCard => "INVALID_CARD",
            ErrorCode::BookResolved => "BOOK_RESOLVED",
            ErrorCode::BadAssignments => "BAD_ASSIGNMENTS",
            ErrorCode::AssignOpponent => "ASSIGN_OPPONENT",
            ErrorCode::PassTargetOut => "PASS_TARGET_OUT",
            ErrorCode::PassTargetNotTeammate => "PASS_TARGET_NOT_TEAMMATE",
            ErrorCode::DesignateTargetInvalid => "DESIGNATE_TARGET_INVALID",
            ErrorCode::DeclareWindowOpen => "DECLARE_WINDOW_OPEN",
            ErrorCode::NoDeclareWindow => "NO_DECLARE_WINDOW",
            ErrorCode::NotYourOption => "NOT_YOUR_OPTION",
            ErrorCode::MustDeclare => "MUST_DECLARE",
            ErrorCode::InvalidAction => "INVALID_ACTION",
        }
    }

    /// The probe verdict byte of a refusal: 1 + the code's index (replay-format.md §1).
    pub const fn verdict(self) -> u8 {
        1 + self as u8
    }
}

/// An action. Fields are raw bytes so that a probe can carry values no rule accepts: seat, target or `to` = 6 is not
/// a seat, card = 54 is not a card, set = 9 is not a set. The reducer refuses them with the reference's code; it never
/// panics on them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    /// `ask`: `seat` asks `target` for `card`.
    Ask {
        /// The asking seat.
        seat: u8,
        /// The seat asked.
        target: u8,
        /// The card asked for.
        card: u8,
    },
    /// `claim` (a declare): `seat` states a seat for each of the set's six cards, in set card order.
    Claim {
        /// The declaring seat.
        seat: u8,
        /// The set declared.
        set: u8,
        /// The stated seat of each card, in set card order.
        assign: [u8; 6],
    },
    /// `pass`: the emptied turn-holder hands the turn to a teammate.
    Pass {
        /// The passing seat.
        seat: u8,
        /// The receiving seat.
        to: u8,
    },
    /// `decline`: the option seat passes up the declare option.
    Decline {
        /// The declining seat.
        seat: u8,
    },
}

impl Action {
    /// The acting seat byte.
    pub const fn seat(&self) -> u8 {
        match *self {
            Action::Ask { seat, .. }
            | Action::Claim { seat, .. }
            | Action::Pass { seat, .. }
            | Action::Decline { seat } => seat,
        }
    }

    /// This action's L_t kind bit.
    pub const fn kind_bit(&self) -> u8 {
        match self {
            Action::Ask { .. } => KIND_ASK,
            Action::Claim { .. } => KIND_CLAIM,
            Action::Pass { .. } => KIND_PASS,
            Action::Decline { .. } => KIND_DECLINE,
        }
    }
}

/// A public event (`PublicEvent`, us54 kinds only; `game_started` is the log's first entry and never emitted by an
/// action).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    /// `game_started`: only in the initial log.
    GameStarted {
        /// The starting seat.
        start: u8,
    },
    /// `ask`, with its outcome.
    Ask {
        /// Who asked.
        asker: u8,
        /// Who was asked.
        target: u8,
        /// The card.
        card: u8,
        /// Whether the target held it.
        hit: bool,
    },
    /// `claim`: a resolved declare, its stated seats, the true holders and the outcome.
    Claim {
        /// The declarer.
        claimer: u8,
        /// The set.
        set: u8,
        /// Stated seats, in set card order.
        assign: [u8; 6],
        /// True holders before removal, in set card order.
        holders: [u8; 6],
        /// The outcome byte.
        outcome: u8,
    },
    /// `pass`.
    Pass {
        /// The passer.
        from: u8,
        /// The receiver.
        to: u8,
    },
    /// `player_out`: a seat's hand emptied.
    PlayerOut {
        /// The emptied seat.
        seat: u8,
    },
    /// `game_over`.
    GameOver {
        /// The score at the end.
        score: [u8; 2],
        /// 0, 1, or [`TIE`].
        winner: u8,
    },
}

/// The events of one action, in the reference's order. At most a claim, six `player_out` and a `game_over`.
#[derive(Clone, Copy, Debug)]
pub struct Events {
    buf: [Event; 8],
    len: usize,
}

impl Default for Events {
    fn default() -> Self {
        Self::new()
    }
}

impl Events {
    /// An empty buffer.
    pub const fn new() -> Self {
        Events {
            buf: [Event::PlayerOut { seat: 0 }; 8],
            len: 0,
        }
    }

    #[inline]
    fn clear(&mut self) {
        self.len = 0;
    }

    #[inline]
    fn push(&mut self, e: Event) {
        self.buf[self.len] = e;
        self.len += 1;
    }

    /// The events, in order.
    #[inline]
    pub fn as_slice(&self) -> &[Event] {
        &self.buf[..self.len]
    }
}

/// The legal asks of a position, in `legalAsks` order: targets ascending, cards ascending within a target.
#[derive(Clone, Debug)]
pub struct AskList {
    n: usize,
    target: [u8; MAX_ASKS],
    card: [u8; MAX_ASKS],
}

impl Default for AskList {
    fn default() -> Self {
        Self::new()
    }
}

impl AskList {
    /// An empty list.
    pub const fn new() -> Self {
        AskList {
            n: 0,
            target: [0; MAX_ASKS],
            card: [0; MAX_ASKS],
        }
    }

    /// How many legal asks.
    #[inline]
    pub fn len(&self) -> usize {
        self.n
    }

    /// No legal ask.
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.n == 0
    }

    /// The i-th legal ask as (target, card).
    #[inline]
    pub fn get(&self, i: usize) -> (u8, u8) {
        (self.target[i], self.card[i])
    }
}

/// A planted mutant of ATHENA.md §4.6 G0a. Its code paths exist only with the `mutants` feature.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Mutant {
    /// The reference's rules.
    #[default]
    None,
    /// The turn-pass rule before commit `f3390c6`: an out-of-turn declare that empties the turn-holder advances the
    /// turn to the next seat with cards instead of entering `awaitPass`.
    M1,
    /// A misassigned own-team declare scores for the declarer.
    M2,
    /// A declare does not re-open the window from the top: the window continues its cycle, the option moving on to
    /// the next seat as after a decline (and closing after the sixth seat).
    M3,
    /// A decline is allowed when the turn-holder cannot ask (no `MUST_DECLARE`).
    M4,
    /// After a miss the window opens on the asker, not on the target (who still takes the turn).
    M5,
}

impl Mutant {
    /// Parse `M1`..`M5` (or `none`).
    pub fn parse(s: &str) -> Option<Mutant> {
        match s.to_ascii_uppercase().as_str() {
            "NONE" => Some(Mutant::None),
            "M1" => Some(Mutant::M1),
            "M2" => Some(Mutant::M2),
            "M3" => Some(Mutant::M3),
            "M4" => Some(Mutant::M4),
            "M5" => Some(Mutant::M5),
            _ => None,
        }
    }
}

/// A rule set's variant (`RulesConfig.variant`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Variant {
    /// RULES.md, the 48-card default. Not implemented here.
    Pagat48,
    /// RULES_US54.md. The only rule set in scope.
    Us54,
}

/// `RulesConfig.toggles`, all of which must be off.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[allow(missing_docs)]
pub struct Toggles {
    pub jokers: bool,
    pub rank_quartet: bool,
    pub mandatory_declare: bool,
    pub announce_last_card: bool,
    pub high_books_double: bool,
    pub ask_own_card_allowed: bool,
    pub declarer_chooses_next: bool,
    pub claim_any_turn: bool,
    pub strict_memory: bool,
}

/// A rules configuration, in the reference's shape, so that a caller asking for anything but us54 is refused loudly.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RulesConfig {
    /// Must be 6.
    pub player_count: u8,
    /// Must be us54.
    pub variant: Variant,
    /// Must all be off.
    pub toggles: Toggles,
}

/// Why a configuration or a game setup was refused.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SetupError(pub String);

impl std::fmt::Display for SetupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for SetupError {}

impl RulesConfig {
    /// `us54Config`: us54 with every toggle off.
    pub const fn us54() -> Self {
        RulesConfig {
            player_count: 6,
            variant: Variant::Us54,
            toggles: Toggles {
                jokers: false,
                rank_quartet: false,
                mandatory_declare: false,
                announce_last_card: false,
                high_books_double: false,
                ask_own_card_allowed: false,
                declarer_chooses_next: false,
                claim_any_turn: false,
                strict_memory: false,
            },
        }
    }

    /// Refuse every configuration except us54 with every toggle off (ATHENA.md §4.1 item 15).
    pub fn check(&self) -> Result<(), SetupError> {
        let mut problems: Vec<String> = Vec::new();
        if self.player_count != 6 {
            problems.push(format!("playerCount is {}, not 6", self.player_count));
        }
        if self.variant != Variant::Us54 {
            problems.push(format!("variant {:?} is not us54", self.variant));
        }
        let t = self.toggles;
        let on: Vec<&str> = [
            ("jokers", t.jokers),
            ("rankQuartet", t.rank_quartet),
            ("mandatoryDeclare", t.mandatory_declare),
            ("announceLastCard", t.announce_last_card),
            ("highBooksDouble", t.high_books_double),
            ("askOwnCardAllowed", t.ask_own_card_allowed),
            ("declarerChoosesNext", t.declarer_chooses_next),
            ("claimAnyTurn", t.claim_any_turn),
            ("strictMemory", t.strict_memory),
        ]
        .iter()
        .filter(|(_, v)| *v)
        .map(|(k, _)| *k)
        .collect();
        if !on.is_empty() {
            problems.push(format!("toggles on: {}", on.join(", ")));
        }
        if problems.is_empty() {
            Ok(())
        } else {
            Err(SetupError(format!(
                "athena-env implements us54 with every toggle off and nothing else (ATHENA.md §4.1 item 15); refused: {}",
                problems.join("; ")
            )))
        }
    }
}

/// A us54 game state. `Copy`: about 250 bytes of fixed arrays.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Game {
    /// Each seat's hand as a card mask.
    hand: [u64; NSEATS],
    /// Each card's holder, or NONE once its set has resolved.
    owner: [u8; NCARDS],
    /// Each seat's hand count.
    count: [u8; NSEATS],
    /// The set block (replay-format.md §4.1): per set, outcome, claimer, six stated seats, six true holders.
    set_block: [u8; 14 * NSETS],
    phase: u8,
    turn: u8,
    window_open: bool,
    option: u8,
    declined: u8,
    move_index: u32,
    score: [u8; 2],
    /// Sets awarded to each team, counted by outcome (`awardedSets`), never from the score.
    won: [u8; 2],
    resolved: u8,
    #[cfg(feature = "mutants")]
    mutant: Mutant,
}

/// The open declare window, if any.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Window {
    /// The seat holding the option.
    pub option: u8,
    /// Consecutive declines since it opened (0..=5).
    pub declined: u8,
}

impl Game {
    /// `newGame(seed, us54Config, startSeat)`: the deal of `deal.ts`, then the window open at the start seat.
    ///
    /// The seed is hashed over its UTF-16 code units, as the reference does; any string is accepted here (the
    /// replay format further restricts seeds to printable ASCII).
    pub fn new(seed: &str, start: u8) -> Result<Game, SetupError> {
        Game::with_config(seed, &RulesConfig::us54(), start)
    }

    /// As [`Game::new`], refusing any configuration but us54 with every toggle off.
    pub fn with_config(seed: &str, config: &RulesConfig, start: u8) -> Result<Game, SetupError> {
        config.check()?;
        if !is_seat(start) {
            return Err(SetupError(format!("start seat {start} is not a seat")));
        }
        // dealHands: Fisher-Yates over the canonical deck with randInt(rng, i + 1) for i = 53..1, then round-robin.
        let mut rng = rng_from_seed(seed);
        let mut deck = [0u8; NCARDS];
        for (i, d) in deck.iter_mut().enumerate() {
            *d = i as u8;
        }
        for i in (1..NCARDS).rev() {
            let j = rng.rand_int(i as u32 + 1) as usize;
            deck.swap(i, j);
        }
        let mut hand = [0u64; NSEATS];
        for (i, &c) in deck.iter().enumerate() {
            hand[i % NSEATS] |= bit(c);
        }
        Ok(Game::from_hands(hand, start))
    }

    /// A game from given hands (a partition of the deck), turn and window at `start`, nothing resolved. The deal
    /// uses it; so do hand-built test positions (the reference tests' `game54`).
    pub fn from_hands(hand: [u64; NSEATS], start: u8) -> Game {
        let mut owner = [NONE; NCARDS];
        let mut count = [0u8; NSEATS];
        for (seat, &h) in hand.iter().enumerate() {
            let mut m = h;
            while m != 0 {
                let c = m.trailing_zeros() as usize;
                m &= m - 1;
                owner[c] = seat as u8;
                count[seat] += 1;
            }
        }
        Game {
            hand,
            owner,
            count,
            set_block: [NONE; 14 * NSETS],
            phase: PLAYING,
            turn: start,
            window_open: true,
            option: start,
            declined: 0,
            move_index: 0,
            score: [0, 0],
            won: [0, 0],
            resolved: 0,
            #[cfg(feature = "mutants")]
            mutant: Mutant::None,
        }
    }

    /// Plant a mutant (only with the `mutants` feature).
    #[cfg(feature = "mutants")]
    pub fn set_mutant(&mut self, m: Mutant) {
        self.mutant = m;
    }

    #[cfg(feature = "mutants")]
    #[inline(always)]
    fn is_mutant(&self, m: Mutant) -> bool {
        self.mutant == m
    }

    /* ------------------------------------------------------------------ reads --- */

    /// The phase byte.
    #[inline]
    pub fn phase(&self) -> u8 {
        self.phase
    }
    /// The turn seat.
    #[inline]
    pub fn turn(&self) -> u8 {
        self.turn
    }
    /// The open window, if any.
    #[inline]
    pub fn window(&self) -> Option<Window> {
        self.window_open.then_some(Window {
            option: self.option,
            declined: self.declined,
        })
    }
    /// `moveIndex`: every accepted action, declines included.
    #[inline]
    pub fn move_index(&self) -> u32 {
        self.move_index
    }
    /// A seat's hand as a card mask (ascending bits are the canonical order).
    #[inline]
    pub fn hand(&self, seat: u8) -> u64 {
        self.hand[seat as usize]
    }
    /// A seat's hand count.
    #[inline]
    pub fn count(&self, seat: u8) -> u8 {
        self.count[seat as usize]
    }
    /// All six hand counts.
    #[inline]
    pub fn counts(&self) -> [u8; NSEATS] {
        self.count
    }
    /// A card's holder, or NONE once its set has resolved.
    #[inline]
    pub fn owner(&self, card: u8) -> u8 {
        self.owner[card as usize]
    }
    /// Every card's holder.
    #[inline]
    pub fn owners(&self) -> &[u8; NCARDS] {
        &self.owner
    }
    /// The score.
    #[inline]
    pub fn score(&self) -> [u8; 2] {
        self.score
    }
    /// Sets awarded to each team by outcome.
    #[inline]
    pub fn awarded(&self) -> [u8; 2] {
        self.won
    }
    /// How many sets have resolved.
    #[inline]
    pub fn resolved_count(&self) -> u8 {
        self.resolved
    }
    /// The 126-byte set block.
    #[inline]
    pub fn set_block(&self) -> &[u8; 14 * NSETS] {
        &self.set_block
    }
    /// Has this set resolved?
    #[inline]
    pub fn is_resolved(&self, set: u8) -> bool {
        self.set_block[set as usize * 14] != NONE
    }
    /// A resolved set's outcome byte, or NONE.
    #[inline]
    pub fn set_outcome(&self, set: u8) -> u8 {
        self.set_block[set as usize * 14]
    }
    /// A resolved set's claimer, or NONE.
    #[inline]
    pub fn set_claimer(&self, set: u8) -> u8 {
        self.set_block[set as usize * 14 + 1]
    }
    /// A resolved set's stated seats, in set card order.
    pub fn set_assignments(&self, set: u8) -> [u8; 6] {
        let o = set as usize * 14 + 2;
        let mut a = [0u8; 6];
        a.copy_from_slice(&self.set_block[o..o + 6]);
        a
    }
    /// A resolved set's true holders, in set card order.
    pub fn set_holders(&self, set: u8) -> [u8; 6] {
        let o = set as usize * 14 + 8;
        let mut a = [0u8; 6];
        a.copy_from_slice(&self.set_block[o..o + 6]);
        a
    }

    /// `legalActionsSummary(s).seat`: the option seat while a window is open in a running game, else the turn seat.
    #[inline]
    pub fn acting_seat(&self) -> u8 {
        if self.window_open && self.phase != FINISHED {
            self.option
        } else {
            self.turn
        }
    }

    /// The cards `seat` may name (`askableCards`): cards of a set it holds at least one of, not already in hand.
    #[inline]
    pub fn askable(&self, seat: u8) -> u64 {
        let h = self.hand[seat as usize];
        let mut sets = 0u64;
        for m in SET_MASK {
            if h & m != 0 {
                sets |= m;
            }
        }
        sets & !h
    }

    /// Does any opponent of `seat` hold a card (`askTargets(s, seat).length > 0`)?
    #[inline]
    fn opponents_hold(&self, seat: u8) -> bool {
        let s = seat as usize;
        self.count[(s + 1) % 6] + self.count[(s + 3) % 6] + self.count[(s + 5) % 6] > 0
    }

    /// `turnHolderCanAsk`: could the turn-holder ask if the window closed now? Phase `playing`, the turn-holder holds
    /// cards, an opponent holds cards, and the turn-holder holds some set with 1-5 of its cards.
    #[inline]
    pub fn turn_holder_can_ask(&self) -> bool {
        let t = self.turn;
        if self.phase != PLAYING || self.count[t as usize] == 0 {
            return false;
        }
        self.opponents_hold(t) && self.askable(t) != 0
    }

    /// `legalAsks(s, seat)` into `out`, in the reference's order.
    pub fn legal_asks(&self, seat: u8, out: &mut AskList) {
        out.n = 0;
        if self.window_open || self.phase != PLAYING || self.turn != seat || self.count[seat as usize] == 0 {
            return;
        }
        let askable = self.askable(seat);
        if askable == 0 {
            return;
        }
        for target in 0..NSEATS as u8 {
            if team(target) == team(seat) || self.count[target as usize] == 0 {
                continue;
            }
            let mut m = askable;
            while m != 0 {
                let c = m.trailing_zeros() as u8;
                m &= m - 1;
                out.target[out.n] = target;
                out.card[out.n] = c;
                out.n += 1;
            }
        }
    }

    /// The number of legal asks of `seat`, and the i-th of them, without building the list (a stub's pick).
    pub fn nth_legal_ask(&self, seat: u8, pick: impl FnOnce(u32) -> u32) -> Option<(u8, u8)> {
        if self.window_open || self.phase != PLAYING || self.turn != seat || self.count[seat as usize] == 0 {
            return None;
        }
        let askable = self.askable(seat);
        let per = askable.count_ones();
        let mut targets = [0u8; 3];
        let mut nt = 0usize;
        for target in 0..NSEATS as u8 {
            if team(target) != team(seat) && self.count[target as usize] > 0 {
                targets[nt] = target;
                nt += 1;
            }
        }
        let total = per * nt as u32;
        if total == 0 {
            return None;
        }
        let i = pick(total);
        let target = targets[(i / per) as usize];
        let mut m = askable;
        for _ in 0..(i % per) {
            m &= m - 1;
        }
        Some((target, m.trailing_zeros() as u8))
    }

    /// The first unresolved set in set order.
    #[inline]
    pub fn first_open_set(&self) -> Option<u8> {
        (0..NSETS as u8).find(|&b| !self.is_resolved(b))
    }

    /// L_t's kind bits by the reducer's own verdict (replay-format.md §4.6): each kind's representative action from
    /// `acting` is judged by [`Game::validate`]. `asks` is `acting`'s legal-ask list.
    pub fn legal_kinds(&self, acting: u8, asks: &AskList) -> u8 {
        let mut k = 0u8;
        if !asks.is_empty() {
            k |= KIND_ASK;
        }
        if let Some(set) = self.first_open_set() {
            let claim = Action::Claim {
                seat: acting,
                set,
                assign: [acting; 6],
            };
            if self.validate(&claim).is_ok() {
                k |= KIND_CLAIM;
            }
        }
        let base = acting % 2;
        for t in [base, base + 2, base + 4] {
            if t == acting || self.count[t as usize] == 0 {
                continue;
            }
            if self.validate(&Action::Pass { seat: acting, to: t }).is_ok() {
                k |= KIND_PASS;
            }
            break;
        }
        if self.validate(&Action::Decline { seat: acting }).is_ok() {
            k |= KIND_DECLINE;
        }
        k
    }

    /// `legalActionsSummary(s).kinds` as bits, for the checker's information count only. It lists `claim` with the
    /// window closed in `playing`, which the reducer refuses (replay-format.md §4.6); L_t does not copy that.
    pub fn summary_kinds(&self) -> u8 {
        let unresolved = self.resolved < NSETS as u8;
        let mut k = 0u8;
        if self.window_open && self.phase != FINISHED {
            if unresolved {
                k |= KIND_CLAIM;
            }
            if self.turn_holder_can_ask() {
                k |= KIND_DECLINE;
            }
            return k;
        }
        match self.phase {
            PLAYING => {
                let mut asks = AskList::new();
                self.legal_asks(self.turn, &mut asks);
                if !asks.is_empty() {
                    k |= KIND_ASK;
                }
                if unresolved {
                    k |= KIND_CLAIM;
                }
            }
            AWAIT_PASS => k |= KIND_PASS,
            _ => {}
        }
        k
    }

    /* ------------------------------------------------------------- legality --- */

    /// Would the reference accept this action? The first failing check's code, in the reference's order.
    pub fn validate(&self, a: &Action) -> Result<(), ErrorCode> {
        match *a {
            Action::Ask { seat, target, card } => self.check_ask(seat, target, card),
            Action::Claim { seat, set, ref assign } => self.check_claim(seat, set, assign),
            Action::Pass { seat, to } => self.check_pass(seat, to),
            Action::Decline { seat } => self.check_decline(seat),
        }
    }

    /// `reduceAsk`'s checks (ATHENA.md §4.1 item 4).
    fn check_ask(&self, seat: u8, target: u8, card: u8) -> Result<(), ErrorCode> {
        if self.phase != PLAYING {
            return Err(ErrorCode::WrongPhase);
        }
        if self.window_open {
            return Err(ErrorCode::DeclareWindowOpen);
        }
        if seat != self.turn {
            return Err(ErrorCode::NotYourTurn);
        }
        let hand = self.hand[seat as usize];
        if hand == 0 {
            return Err(ErrorCode::AskerOut);
        }
        if !is_seat(target) {
            return Err(ErrorCode::InvalidAction);
        }
        if team(target) == team(seat) && target != seat {
            return Err(ErrorCode::TargetTeammate);
        }
        if target == seat {
            return Err(ErrorCode::TargetSelf);
        }
        if self.count[target as usize] == 0 {
            return Err(ErrorCode::TargetOut);
        }
        if card as usize >= NCARDS {
            return Err(ErrorCode::InvalidCard);
        }
        if hand & SET_MASK[SET_OF_CARD[card as usize] as usize] == 0 {
            return Err(ErrorCode::NoCardOfBook);
        }
        if hand & bit(card) != 0 {
            return Err(ErrorCode::AskingOwnCard);
        }
        Ok(())
    }

    /// `reduceClaim`'s checks in the us54 order (§4.1 item 6): WRONG_PHASE, BOOK_RESOLVED, NO_DECLARE_WINDOW,
    /// NOT_YOUR_OPTION, INVALID_ACTION (not a set), ASSIGN_OPPONENT in set card order. BAD_ASSIGNMENTS cannot arise:
    /// an [`Action::Claim`] states exactly one seat for each of the set's six cards.
    fn check_claim(&self, seat: u8, set: u8, assign: &[u8; 6]) -> Result<(), ErrorCode> {
        if self.phase != PLAYING {
            return Err(ErrorCode::WrongPhase);
        }
        if (set as usize) < NSETS && self.is_resolved(set) {
            return Err(ErrorCode::BookResolved);
        }
        if !self.window_open {
            return Err(ErrorCode::NoDeclareWindow);
        }
        if seat != self.option {
            return Err(ErrorCode::NotYourOption);
        }
        if set as usize >= NSETS {
            return Err(ErrorCode::InvalidAction);
        }
        let t = team(seat);
        for &s in assign {
            if !is_seat(s) || team(s) != t {
                return Err(ErrorCode::AssignOpponent);
            }
        }
        // "Unreachable for an unresolved book (deck conservation), but never throw."
        for &c in &SET_CARDS[set as usize] {
            if self.owner[c as usize] == NONE {
                return Err(ErrorCode::InvalidAction);
            }
        }
        Ok(())
    }

    /// `reducePass`'s checks (§4.1 item 11).
    fn check_pass(&self, seat: u8, to: u8) -> Result<(), ErrorCode> {
        if self.phase != AWAIT_PASS {
            return Err(ErrorCode::WrongPhase);
        }
        if seat != self.turn {
            return Err(ErrorCode::NotYourTurn);
        }
        if !is_seat(to) || team(to) != team(seat) {
            return Err(ErrorCode::PassTargetNotTeammate);
        }
        if self.count[to as usize] == 0 {
            return Err(ErrorCode::PassTargetOut);
        }
        Ok(())
    }

    /// `reduceDecline`'s checks (§4.1 item 10).
    fn check_decline(&self, seat: u8) -> Result<(), ErrorCode> {
        if !self.window_open {
            return Err(ErrorCode::NoDeclareWindow);
        }
        if !is_seat(seat) {
            return Err(ErrorCode::InvalidAction);
        }
        if seat != self.option {
            return Err(ErrorCode::NotYourOption);
        }
        #[cfg(feature = "mutants")]
        if self.is_mutant(Mutant::M4) {
            return Ok(());
        }
        if !self.turn_holder_can_ask() {
            return Err(ErrorCode::MustDeclare);
        }
        Ok(())
    }

    /* ---------------------------------------------------------------- reduce --- */

    /// `reduce`: apply an action if the reference would accept it. On refusal nothing changes (`moveIndex`
    /// included) and the code is returned; on acceptance `events` holds the action's events and `moveIndex` is one
    /// more.
    pub fn apply(&mut self, a: &Action, events: &mut Events) -> Result<(), ErrorCode> {
        self.validate(a)?;
        events.clear();
        match *a {
            Action::Ask { seat, target, card } => self.do_ask(seat, target, card, events),
            Action::Claim { seat, set, assign } => self.do_claim(seat, set, &assign, events),
            Action::Pass { seat, to } => self.do_pass(seat, to, events),
            Action::Decline { .. } => self.do_decline(),
        }
        self.move_index += 1;
        Ok(())
    }

    #[inline]
    fn open_window(&mut self, seat: u8) {
        self.window_open = true;
        self.option = seat;
        self.declined = 0;
    }

    #[inline]
    fn close_window(&mut self) {
        self.window_open = false;
        self.option = NONE;
        self.declined = NONE;
    }

    /// `reduceAsk`'s resolution. A miss passes the turn to the target and opens the window on it; a hit moves the
    /// card, emits `player_out` if the target is emptied, and re-opens the window on the asker, who keeps the turn.
    fn do_ask(&mut self, seat: u8, target: u8, card: u8, ev: &mut Events) {
        let hit = self.owner[card as usize] == target;
        ev.push(Event::Ask {
            asker: seat,
            target,
            card,
            hit,
        });
        if !hit {
            self.turn = target;
            #[cfg(feature = "mutants")]
            if self.is_mutant(Mutant::M5) {
                self.open_window(seat);
                return;
            }
            self.open_window(target);
            return;
        }
        let b = bit(card);
        self.hand[target as usize] &= !b;
        self.hand[seat as usize] |= b;
        self.owner[card as usize] = seat;
        self.count[target as usize] -= 1;
        self.count[seat as usize] += 1;
        if self.count[target as usize] == 0 {
            ev.push(Event::PlayerOut { seat: target });
        }
        let t = self.turn;
        self.open_window(t);
    }

    /// `reduceClaim`'s resolution (§4.1 items 7-8), then `declareTail` (item 9).
    fn do_claim(&mut self, seat: u8, set: u8, assign: &[u8; 6], ev: &mut Events) {
        let t = team(seat);
        let cards = SET_CARDS[set as usize];
        let mut holders = [0u8; 6];
        let mut opponent_holds = false;
        let mut all_correct = true;
        for j in 0..6 {
            let h = self.owner[cards[j] as usize];
            holders[j] = h;
            if team(h) != t {
                opponent_holds = true;
            }
            if assign[j] != h {
                all_correct = false;
            }
        }
        // us54 has no void: a misassigned own-team declare also goes to the opponents.
        #[allow(unused_mut)]
        let mut misassigned_to = 1 - t;
        #[cfg(feature = "mutants")]
        if self.is_mutant(Mutant::M2) {
            misassigned_to = t;
        }
        let outcome = if opponent_holds {
            1 - t
        } else if all_correct {
            t
        } else {
            misassigned_to
        };
        let o = set as usize * 14;
        self.set_block[o] = outcome;
        self.set_block[o + 1] = seat;
        self.set_block[o + 2..o + 8].copy_from_slice(assign);
        self.set_block[o + 8..o + 14].copy_from_slice(&holders);
        self.score[outcome as usize] += 1;
        self.won[outcome as usize] += 1;
        self.resolved += 1;
        ev.push(Event::Claim {
            claimer: seat,
            set,
            assign: *assign,
            holders,
            outcome,
        });
        let before = self.count;
        for j in 0..6 {
            let c = cards[j];
            let h = holders[j] as usize;
            self.hand[h] &= !bit(c);
            self.count[h] -= 1;
            self.owner[c as usize] = NONE;
        }
        // `player_out` for every newly emptied seat, in seat order 0..5, after the claim event.
        for (s, (&was, &now)) in before.iter().zip(self.count.iter()).enumerate() {
            if was > 0 && now == 0 {
                ev.push(Event::PlayerOut { seat: s as u8 });
            }
        }
        // Termination, highest precedence: a clinch at 5 awarded sets, or the `resolved === 9` fallback.
        let clinched = self.won[0].max(self.won[1]) >= CLINCH_TARGET;
        if clinched || self.resolved as usize == NSETS {
            let winner = if clinched {
                if self.won[0] > self.won[1] {
                    0
                } else {
                    1
                }
            } else if self.won[0] > self.won[1] {
                0
            } else if self.won[1] > self.won[0] {
                1
            } else {
                TIE
            };
            ev.push(Event::GameOver {
                score: self.score,
                winner,
            });
            self.phase = FINISHED;
            self.close_window();
            return;
        }
        self.declare_tail(seat);
    }

    /// `declareTail`: where the turn and the window go after a declare that did not end the game.
    fn declare_tail(&mut self, declarer: u8) {
        let turn = self.turn;
        #[cfg(not(feature = "mutants"))]
        let _ = declarer;
        if self.count[turn as usize] > 0 {
            #[cfg(feature = "mutants")]
            if self.is_mutant(Mutant::M3) {
                let d = self.declined + 1;
                if d < 6 {
                    self.option = (self.option + 1) % 6;
                    self.declined = d;
                } else {
                    self.close_window();
                }
                return;
            }
            self.open_window(turn);
            return;
        }
        let t = team(turn);
        let mate_holds = [t, t + 2, t + 4]
            .iter()
            .any(|&s| s != turn && self.count[s as usize] > 0);
        #[allow(unused_mut)]
        let mut to_await_pass = mate_holds;
        #[cfg(feature = "mutants")]
        if self.is_mutant(Mutant::M1) && declarer != turn {
            to_await_pass = false;
        }
        if to_await_pass {
            self.phase = AWAIT_PASS;
            self.close_window();
            return;
        }
        let to = self.next_seat_with_cards(turn).unwrap_or(turn);
        self.turn = to;
        self.open_window(to);
    }

    /// `nextSeatWithCards`: the next seat strictly after `from`, ascending and cyclic, holding cards; `from` last.
    fn next_seat_with_cards(&self, from: u8) -> Option<u8> {
        (1..=6u8).map(|i| (from + i) % 6).find(|&s| self.count[s as usize] > 0)
    }

    /// `reducePass` and `handoff`: the receiver takes the turn, the phase is `playing`, the window opens on it.
    fn do_pass(&mut self, seat: u8, to: u8, ev: &mut Events) {
        ev.push(Event::Pass { from: seat, to });
        self.turn = to;
        self.phase = PLAYING;
        self.open_window(to);
    }

    /// `reduceDecline`: the option moves to the next seat; the sixth consecutive decline closes the window.
    fn do_decline(&mut self) {
        let d = self.declined + 1;
        if d < 6 {
            self.option = (self.option + 1) % 6;
            self.declined = d;
        } else {
            self.close_window();
        }
    }

    /* --------------------------------------------------------- test fixtures --- */

    /// Pre-load a resolved set on a hand-built position (the reference tests' `books` patch). Its cards must already
    /// be out of every hand. The score is left alone; set it with [`Game::set_score`].
    #[doc(hidden)]
    pub fn fixture_resolve(&mut self, set: u8, outcome: u8, claimer: u8, assign: [u8; 6], holders: [u8; 6]) {
        let o = set as usize * 14;
        self.set_block[o] = outcome;
        self.set_block[o + 1] = claimer;
        self.set_block[o + 2..o + 8].copy_from_slice(&assign);
        self.set_block[o + 8..o + 14].copy_from_slice(&holders);
        if outcome == TEAM0 || outcome == TEAM1 {
            self.won[outcome as usize] += 1;
        }
        self.resolved += 1;
    }

    /// Overwrite the score on a hand-built position.
    #[doc(hidden)]
    pub fn set_score(&mut self, score: [u8; 2]) {
        self.score = score;
    }

    /// Overwrite the window on a hand-built position.
    #[doc(hidden)]
    pub fn set_window(&mut self, w: Option<Window>) {
        match w {
            Some(w) => {
                self.window_open = true;
                self.option = w.option;
                self.declined = w.declined;
            }
            None => self.close_window(),
        }
    }
}
