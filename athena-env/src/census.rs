//! The branch census of replay-format.md §9.2 and ATHENA.md §4.6's floor table, row for row with the reference's
//! `classifyStep` and `classifyEnd` (`scripts/athena/replay-codec.ts`), plus the checker's integrity counters.

use crate::rules::{Action, Event, Game, Window, AWAIT_PASS, FINISHED, KIND_DECLINE, PLAYING};

/// Each floor is this many occurrences over the corpus.
pub const FLOOR: u64 = 50;

/// §4.6's floor table: (id, label), in the reference checker's order.
pub const BRANCHES: [(&str, &str); 17] = [
    ("hitEmptiesTarget", "hit empties the target (player_out on a hit)"),
    ("windowClosedBySixDeclines", "window closed by six declines"),
    ("forcedDeclare", "forced declare (the MUST_DECLARE window)"),
    ("declareRight", "declare right"),
    ("declareWrongOpponentHeld", "declare wrong, an opponent held a card"),
    (
        "declareWrongMisassigned",
        "declare wrong, own team held all six (misassigned)",
    ),
    ("outOfTurnDeclare", "out-of-turn declare"),
    ("cardlessDeclare", "declare by a cardless seat"),
    (
        "turnHolderDeclarerEmptiedAwaitPass",
        "declarer who held the turn emptied -> awaitPass",
    ),
    (
        "otherDeclareEmptiesTurnHolderAwaitPass",
        "another seat's declare empties the turn-holder -> awaitPass",
    ),
    ("wholeTeamOutNextSeat", "whole team out -> next seat with cards"),
    ("pass", "pass"),
    ("finish5to0", "finish 5-0"),
    ("finish5to4", "finish 5-4"),
    (
        "declareAfterDecline",
        "declare after at least one decline in the same window",
    ),
    ("cardlessSeatDeclines", "cardless seat declines"),
    (
        "declareByLastSeat",
        "a declare by the window's last seat (declined = 5)",
    ),
];

/// Rows counted from P0 on; their labels carry "(not counted before P0)".
pub const NEW_BRANCH_IDS: [&str; 3] = ["declareAfterDecline", "cardlessSeatDeclines", "declareByLastSeat"];

/// The information rows printed under the table.
pub const INFO_ROWS: [&str; 9] = [
    "finish5to1",
    "finish5to2",
    "finish5to3",
    "games",
    "steps",
    "action:ask",
    "action:decline",
    "action:claim",
    "action:pass",
];

/// A counter.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(usize)]
#[allow(missing_docs)]
pub enum C {
    Steps,
    ActionAsk,
    ActionDecline,
    ActionClaim,
    ActionPass,
    HitEmptiesTarget,
    WindowClosedBySixDeclines,
    ForcedDeclare,
    DeclareRight,
    DeclareWrongOpponentHeld,
    DeclareWrongMisassigned,
    OutOfTurnDeclare,
    CardlessDeclare,
    TurnHolderDeclarerEmptiedAwaitPass,
    OtherDeclareEmptiesTurnHolderAwaitPass,
    WholeTeamOutNextSeat,
    Pass,
    DeclareAfterDecline,
    CardlessSeatDeclines,
    DeclareByLastSeat,
    Games,
    Capped,
    Finished,
    FallbackAlone,
    FallbackCoincided,
    ProbeVerdicts,
    ProbeAccepted,
    CodeDiffs,
    RecordsOk,
    RecordsBad,
    ActionKindNotInL,
    SummaryClaimWindowClosed,
    SummaryOtherDiff,
    BankSeeds,
    BankSeedStepMismatch,
    HeaderRevisionDiffers,
    HeaderRulesHashDiffers,
    MismatchDeal,
    MismatchD,
    MismatchL,
    MismatchV,
    MismatchProbe,
    MismatchRefused,
    MismatchLength,
    MismatchEnd,
    MismatchGame,
    MismatchDecode,
    Count,
}

const N: usize = C::Count as usize;

/// Counters for one population (or one worker's share of it).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Tally {
    c: [u64; N],
    /// `finish{hi}to{lo}`, by the game_over score.
    finish: [[u64; 10]; 10],
}

impl Default for Tally {
    fn default() -> Self {
        Tally {
            c: [0; N],
            finish: [[0; 10]; 10],
        }
    }
}

impl Tally {
    /// Add one to a counter.
    #[inline]
    pub fn bump(&mut self, k: C) {
        self.c[k as usize] += 1;
    }

    /// Add `n` to a counter.
    #[inline]
    pub fn add(&mut self, k: C, n: u64) {
        self.c[k as usize] += n;
    }

    /// A counter's value.
    #[inline]
    pub fn at(&self, k: C) -> u64 {
        self.c[k as usize]
    }

    /// Merge another tally into this one.
    pub fn merge(&mut self, o: &Tally) {
        for i in 0..N {
            self.c[i] += o.c[i];
        }
        for hi in 0..10 {
            for lo in 0..10 {
                self.finish[hi][lo] += o.finish[hi][lo];
            }
        }
    }

    /// A counter by the reference's key (`hitEmptiesTarget`, `finish5to4`, `action:ask`, `games`, ...).
    pub fn get(&self, id: &str) -> u64 {
        if let Some((hi, lo)) = id.strip_prefix("finish").and_then(|rest| rest.split_once("to")) {
            if let (Ok(hi), Ok(lo)) = (hi.parse::<usize>(), lo.parse::<usize>()) {
                return if hi < 10 && lo < 10 { self.finish[hi][lo] } else { 0 };
            }
        }
        let k = match id {
            "steps" => C::Steps,
            "action:ask" => C::ActionAsk,
            "action:decline" => C::ActionDecline,
            "action:claim" => C::ActionClaim,
            "action:pass" => C::ActionPass,
            "hitEmptiesTarget" => C::HitEmptiesTarget,
            "windowClosedBySixDeclines" => C::WindowClosedBySixDeclines,
            "forcedDeclare" => C::ForcedDeclare,
            "declareRight" => C::DeclareRight,
            "declareWrongOpponentHeld" => C::DeclareWrongOpponentHeld,
            "declareWrongMisassigned" => C::DeclareWrongMisassigned,
            "outOfTurnDeclare" => C::OutOfTurnDeclare,
            "cardlessDeclare" => C::CardlessDeclare,
            "turnHolderDeclarerEmptiedAwaitPass" => C::TurnHolderDeclarerEmptiedAwaitPass,
            "otherDeclareEmptiesTurnHolderAwaitPass" => C::OtherDeclareEmptiesTurnHolderAwaitPass,
            "wholeTeamOutNextSeat" => C::WholeTeamOutNextSeat,
            "pass" => C::Pass,
            "declareAfterDecline" => C::DeclareAfterDecline,
            "cardlessSeatDeclines" => C::CardlessSeatDeclines,
            "declareByLastSeat" => C::DeclareByLastSeat,
            "games" => C::Games,
            "capped" => C::Capped,
            "finished" => C::Finished,
            "fallbackAlone" => C::FallbackAlone,
            "fallbackCoincided" => C::FallbackCoincided,
            _ => return 0,
        };
        self.at(k)
    }

    /// `classifyStep`: the census of one applied step. `pre` and `post` are the states around it, `kinds` is L_t.
    pub fn classify_step(&mut self, pre: &Game, action: &Action, post: &Game, events: &[Event], kinds: u8) {
        self.bump(C::Steps);
        match *action {
            Action::Ask { .. } => {
                self.bump(C::ActionAsk);
                if events.iter().any(|e| matches!(e, Event::PlayerOut { .. })) {
                    self.bump(C::HitEmptiesTarget);
                }
            }
            Action::Decline { seat } => {
                self.bump(C::ActionDecline);
                if post.window().is_none() {
                    self.bump(C::WindowClosedBySixDeclines);
                }
                if pre.count(seat) == 0 {
                    self.bump(C::CardlessSeatDeclines);
                }
            }
            Action::Pass { .. } => {
                self.bump(C::ActionPass);
                self.bump(C::Pass);
            }
            Action::Claim { seat, .. } => {
                self.bump(C::ActionClaim);
                let team = seat % 2;
                if let Some(Event::Claim { outcome, holders, .. }) = events.first() {
                    if *outcome == team {
                        self.bump(C::DeclareRight);
                    } else if holders.iter().any(|h| h % 2 != team) {
                        self.bump(C::DeclareWrongOpponentHeld);
                    } else {
                        self.bump(C::DeclareWrongMisassigned);
                    }
                }
                if kinds & KIND_DECLINE == 0 {
                    self.bump(C::ForcedDeclare);
                }
                if seat != pre.turn() {
                    self.bump(C::OutOfTurnDeclare);
                }
                if pre.count(seat) == 0 {
                    self.bump(C::CardlessDeclare);
                }
                if let Some(Window { declined, .. }) = pre.window() {
                    if declined >= 1 {
                        self.bump(C::DeclareAfterDecline);
                    }
                    if declined == 5 {
                        self.bump(C::DeclareByLastSeat);
                    }
                }
                if post.phase() == AWAIT_PASS {
                    self.bump(if seat == pre.turn() {
                        C::TurnHolderDeclarerEmptiedAwaitPass
                    } else {
                        C::OtherDeclareEmptiesTurnHolderAwaitPass
                    });
                }
                if post.phase() == PLAYING && post.turn() != pre.turn() {
                    self.bump(C::WholeTeamOutNextSeat);
                }
            }
        }
        for e in events {
            if let Event::GameOver { score, .. } = e {
                let hi = score[0].max(score[1]) as usize;
                let lo = score[0].min(score[1]) as usize;
                if hi < 10 && lo < 10 {
                    self.finish[hi][lo] += 1;
                }
            }
        }
    }

    /// `classifyEnd`: capped, finished, and which terminator fired. `capped` is the record's end being `capped`.
    pub fn classify_end(&mut self, last: &Game, end: Option<&str>) {
        self.bump(C::Games);
        if end == Some("capped") {
            self.bump(C::Capped);
            return;
        }
        if last.phase() != FINISHED {
            return;
        }
        self.bump(C::Finished);
        let won = last.awarded();
        let clinched = won[0].max(won[1]) >= 5;
        if !clinched {
            self.bump(C::FallbackAlone);
        } else if last.resolved_count() == 9 {
            self.bump(C::FallbackCoincided);
        }
    }
}
