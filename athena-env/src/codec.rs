//! The `athena-replay-1` encodings (replay-format.md §4) and probes (§6), written into caller-owned buffers.

use crate::cards::{NCARDS, NONE, NSEATS, NSETS};
use crate::rng::{decimal, Mulberry32, Xmur3};
use crate::rules::{Action, AskList, Event, Game, FINISHED};

/// The format tag: the first column of every corpus line and the first field of every chain header.
pub const FORMAT: &str = "athena-replay-1";
/// The harness's step cap (ATHENA.md §4.1 item 13).
pub const STEP_CAP: u32 = 6000;
/// Probes are taken at every S_t with t % PROBE_EVERY == 0 (t < T), and at S_T.
pub const PROBE_EVERY: u32 = 10;
/// Probes per probe state.
pub const PROBES_PER_STATE: usize = 4;
/// The view's rules byte: us54 with every toggle off.
pub const RULES_ID_US54: u8 = 1;
/// S_t's length.
pub const STATE_LEN: usize = 191;
/// Action tags.
pub const TAG_ASK: u8 = 1;
/// Claim tag.
pub const TAG_CLAIM: u8 = 2;
/// Pass tag.
pub const TAG_PASS: u8 = 3;
/// Decline tag.
pub const TAG_DECLINE: u8 = 4;

/// How many probe states a game of T steps has: t = 0, 10, ... below T, plus T.
pub fn probe_state_count(steps: u32) -> u32 {
    steps.div_ceil(PROBE_EVERY) + 1
}

/// Seeds are printable ASCII (0x21-0x7E), so every language hashes the same bytes and a TSV line stays one line.
pub fn seed_ok(seed: &[u8]) -> bool {
    !seed.is_empty() && seed.iter().all(|&b| (0x21..=0x7e).contains(&b))
}

#[inline]
fn window_bytes(g: &Game) -> [u8; 3] {
    match g.window() {
        Some(w) => [1, w.option, w.declined],
        None => [0, NONE, NONE],
    }
}

/// S_t (replay-format.md §4.3): 191 bytes.
pub fn encode_state(g: &Game, out: &mut [u8; STATE_LEN]) {
    out[0..4].copy_from_slice(&g.move_index().to_le_bytes());
    out[4] = g.phase();
    out[5] = g.turn();
    out[6..9].copy_from_slice(&window_bytes(g));
    out[9..9 + NCARDS].copy_from_slice(g.owners());
    out[63..189].copy_from_slice(g.set_block());
    let s = g.score();
    out[189] = s[0];
    out[190] = s[1];
}

/// A_t (§4.4) into `out`; returns its length.
pub fn encode_action(a: &Action, out: &mut [u8]) -> usize {
    match *a {
        Action::Ask { seat, target, card } => {
            out[..4].copy_from_slice(&[TAG_ASK, seat, target, card]);
            4
        }
        Action::Claim { seat, set, assign } => {
            out[..3].copy_from_slice(&[TAG_CLAIM, seat, set]);
            out[3..9].copy_from_slice(&assign);
            9
        }
        Action::Pass { seat, to } => {
            out[..3].copy_from_slice(&[TAG_PASS, seat, to]);
            3
        }
        Action::Decline { seat } => {
            out[..2].copy_from_slice(&[TAG_DECLINE, seat]);
            2
        }
    }
}

/// Why a recorded action could not be decoded.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DecodeError {
    /// The bytes ended inside an action.
    Truncated {
        /// Byte offset of the action.
        at: usize,
    },
    /// An unknown tag.
    Tag {
        /// Byte offset.
        at: usize,
        /// The tag byte.
        tag: u8,
    },
    /// A field out of range (a seat above 5, a card above 53, a set above 8).
    Field {
        /// Byte offset of the action.
        at: usize,
    },
}

/// Decode one recorded action at `pos`; returns it and the next position. Refuses, never panics.
pub fn decode_action(bytes: &[u8], pos: usize) -> Result<(Action, usize), DecodeError> {
    let need = |k: usize| {
        if pos + k > bytes.len() {
            Err(DecodeError::Truncated { at: pos })
        } else {
            Ok(())
        }
    };
    need(1)?;
    let seat_ok = |x: u8| {
        if (x as usize) < NSEATS {
            Ok(x)
        } else {
            Err(DecodeError::Field { at: pos })
        }
    };
    match bytes[pos] {
        TAG_ASK => {
            need(4)?;
            let card = bytes[pos + 3];
            if card as usize >= NCARDS {
                return Err(DecodeError::Field { at: pos });
            }
            Ok((
                Action::Ask {
                    seat: seat_ok(bytes[pos + 1])?,
                    target: seat_ok(bytes[pos + 2])?,
                    card,
                },
                pos + 4,
            ))
        }
        TAG_CLAIM => {
            need(9)?;
            let set = bytes[pos + 2];
            if set as usize >= NSETS {
                return Err(DecodeError::Field { at: pos });
            }
            let mut assign = [0u8; 6];
            for (j, a) in assign.iter_mut().enumerate() {
                *a = seat_ok(bytes[pos + 3 + j])?;
            }
            Ok((
                Action::Claim {
                    seat: seat_ok(bytes[pos + 1])?,
                    set,
                    assign,
                },
                pos + 9,
            ))
        }
        TAG_PASS => {
            need(3)?;
            Ok((
                Action::Pass {
                    seat: seat_ok(bytes[pos + 1])?,
                    to: seat_ok(bytes[pos + 2])?,
                },
                pos + 3,
            ))
        }
        TAG_DECLINE => {
            need(2)?;
            Ok((
                Action::Decline {
                    seat: seat_ok(bytes[pos + 1])?,
                },
                pos + 2,
            ))
        }
        tag => Err(DecodeError::Tag { at: pos, tag }),
    }
}

/// One event (§4.5) into `out`; returns its length.
pub fn encode_event(e: &Event, out: &mut [u8]) -> usize {
    match *e {
        Event::GameStarted { start } => {
            out[..2].copy_from_slice(&[0, start]);
            2
        }
        Event::Ask {
            asker,
            target,
            card,
            hit,
        } => {
            out[..5].copy_from_slice(&[1, asker, target, card, hit as u8]);
            5
        }
        Event::Claim {
            claimer,
            set,
            assign,
            holders,
            outcome,
        } => {
            out[..3].copy_from_slice(&[2, claimer, set]);
            out[3..9].copy_from_slice(&assign);
            out[9..15].copy_from_slice(&holders);
            out[15] = outcome;
            16
        }
        Event::Pass { from, to } => {
            out[..3].copy_from_slice(&[3, from, to]);
            3
        }
        Event::PlayerOut { seat } => {
            out[..2].copy_from_slice(&[4, seat]);
            2
        }
        Event::GameOver { score, winner } => {
            out[..4].copy_from_slice(&[5, score[0], score[1], winner]);
            4
        }
    }
}

/// E_t: a count byte, then the events in order; returns the length.
pub fn encode_events(events: &[Event], out: &mut [u8]) -> usize {
    out[0] = events.len() as u8;
    let mut n = 1;
    for e in events {
        n += encode_event(e, &mut out[n..]);
    }
    n
}

/// L_t (§4.6): acting seat, kind bits, the ask count (u16 LE), then (target, card) per legal ask; returns the length.
pub fn encode_legal(acting: u8, kinds: u8, asks: &AskList, out: &mut [u8]) -> usize {
    let n = asks.len();
    out[0] = acting;
    out[1] = kinds;
    out[2..4].copy_from_slice(&(n as u16).to_le_bytes());
    for i in 0..n {
        let (t, c) = asks.get(i);
        out[4 + 2 * i] = t;
        out[5 + 2 * i] = c;
    }
    4 + 2 * n
}

/// V_t (§4.7): the acting seat's SeatView, with the log as its length and its digest's 16 hex characters; returns
/// the length. Nothing of another seat's hand enters it.
pub fn encode_view(g: &Game, seat: u8, log_len: u32, log_hex: &[u8; 16], out: &mut [u8]) -> usize {
    encode_view_with_sets(g, seat, log_len, log_hex, g.set_block(), out)
}

/// V_t with the set block given. Under the bridge regime (ATHENA.md §8.2 G1b) a wrong declare's unpublished holders
/// are NONE in it (replay-format.md §12.4), and the log digest is then taken over the events as published.
pub fn encode_view_with_sets(
    g: &Game,
    seat: u8,
    log_len: u32,
    log_hex: &[u8; 16],
    sets: &[u8; 14 * NSETS],
    out: &mut [u8],
) -> usize {
    out[0] = RULES_ID_US54;
    out[1] = seat;
    out[2..6].copy_from_slice(&g.move_index().to_le_bytes());
    out[6] = g.phase();
    out[7] = g.turn();
    out[8..11].copy_from_slice(&window_bytes(g));
    out[11..17].copy_from_slice(&g.counts());
    let s = g.score();
    out[17] = s[0];
    out[18] = s[1];
    out[19..145].copy_from_slice(sets);
    let mut n = 146;
    let mut m = g.hand(seat);
    while m != 0 {
        out[n] = m.trailing_zeros() as u8;
        m &= m - 1;
        n += 1;
    }
    out[145] = (n - 146) as u8;
    out[n..n + 4].copy_from_slice(&log_len.to_le_bytes());
    out[n + 4..n + 20].copy_from_slice(log_hex);
    n + 20
}

/// One probe, in index form. `seat`, `target` and `to` may be 6 (not a seat), `card` 54 (not a card), `set` 9 (not a
/// set).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Probe {
    /// 0 ask, 1 claim, 2 decline, 3 pass.
    pub kind: u8,
    /// The acting seat of the probe.
    pub seat: u8,
    /// An ask's target.
    pub target: u8,
    /// An ask's card.
    pub card: u8,
    /// A claim's set.
    pub set: u8,
    /// A claim's stated seats.
    pub assign: [u8; 6],
    /// A pass's receiver.
    pub to: u8,
}

/// The four probes at S_t (§6): the generator `rngFromSeed(seed + ":probe:" + t)`, fifteen draws a probe whatever
/// its kind. `asks` is the acting seat's legal-ask list at S_t.
pub fn generate_probes(seed: &[u8], t: u32, acting: u8, asks: &AskList) -> [Probe; PROBES_PER_STATE] {
    let mut digits = [0u8; 20];
    let td = decimal(t as u64, &mut digits);
    let mut rng = Mulberry32::new(Xmur3::from_ascii_parts(&[seed, b":probe:", td]).next());
    let n = asks.len() as u32;
    let mut out = [Probe::default(); PROBES_PER_STATE];
    for p in out.iter_mut() {
        let kind = rng.rand_int(4) as u8;
        let seat_mode = rng.rand_int(2);
        let random_seat = rng.rand_int(7) as u8;
        let ask_mode = rng.rand_int(2);
        let ask_pick = rng.rand_int(n.max(1)) as usize;
        let seat_or_to = rng.rand_int(7) as u8;
        let card = rng.rand_int(55) as u8;
        let set = rng.rand_int(10) as u8;
        let assign_mode = rng.rand_int(4);
        let mut raw = [0u8; 6];
        for r in raw.iter_mut() {
            *r = rng.rand_int(21) as u8;
        }
        let seat = if seat_mode == 0 { acting } else { random_seat };
        let use_legal = ask_mode == 0 && n > 0;
        let (target, card) = if use_legal {
            asks.get(ask_pick)
        } else {
            (seat_or_to, card)
        };
        let mut assign = [0u8; 6];
        for j in 0..6 {
            assign[j] = if assign_mode == 0 {
                raw[j] % 7
            } else {
                (seat % 2) + 2 * (raw[j] % 3)
            };
        }
        *p = Probe {
            kind,
            seat,
            target,
            card,
            set,
            assign,
            to: seat_or_to,
        };
    }
    out
}

/// The probe as the action the reducer judges. Out-of-range values are carried as they are; the reducer refuses them.
pub fn probe_action(p: &Probe) -> Action {
    match p.kind {
        0 => Action::Ask {
            seat: p.seat,
            target: p.target,
            card: p.card,
        },
        1 => Action::Claim {
            seat: p.seat,
            set: p.set,
            assign: p.assign,
        },
        2 => Action::Decline { seat: p.seat },
        _ => Action::Pass { seat: p.seat, to: p.to },
    }
}

/// The verdict byte: 0 if the reducer accepts, else 1 + the error code's index.
#[inline]
pub fn verdict(g: &Game, a: &Action) -> u8 {
    match g.validate(a) {
        Ok(()) => 0,
        Err(e) => e.verdict(),
    }
}

/// Is the game over (the reference's `phase === 'finished'`)?
#[inline]
pub fn finished(g: &Game) -> bool {
    g.phase() == FINISHED
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::digest::{digest, hex16, ByteDigest};

    fn hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{x:02x}")).collect()
    }

    /// replay-format.md §10.3.
    #[test]
    fn spec_vector_10_3_first_state_legal_record_and_view() {
        let g = Game::new("athena-p0-g0a-h5-0", 0).unwrap();
        let mut s = [0u8; STATE_LEN];
        encode_state(&g, &mut s);
        let want = format!(
            "000000000000010000{}{}0000",
            "010401020300020304000503050100030204030005000205050302050402000503010403020501000004010403010204040105000201",
            "ff".repeat(126)
        );
        assert_eq!(hex(&s), want);
        let mut chain = ByteDigest::new();
        chain.push(b"athena-replay-1|0|athena-p0-g0a-h5-0");
        chain.push(&s);
        assert_eq!(&chain.hex(), b"e6810acfac4e1db1");

        let acting = g.acting_seat();
        let mut asks = AskList::new();
        g.legal_asks(acting, &mut asks);
        let kinds = g.legal_kinds(acting, &asks);
        let mut buf = [0u8; 512];
        let n = encode_legal(acting, kinds, &asks, &mut buf);
        assert_eq!(hex(&buf[..n]), "000a0000");
        assert_eq!(&hex16(digest(&buf[..n])), b"915460b5ef59eaa3");

        let mut log = ByteDigest::new();
        let k = encode_event(&Event::GameStarted { start: 0 }, &mut buf);
        log.push(&buf[..k]);
        assert_eq!(&log.hex(), b"c11386b34de6204b");
        let n = encode_view(&g, acting, 1, &log.hex(), &mut buf);
        assert_eq!(n, 175);
        let want = format!(
            "01000000000000000100000909090909090000{}0905090e13151e272833{}{}",
            "ff".repeat(126),
            "01000000",
            "63313133383662333464653632303462"
        );
        assert_eq!(hex(&buf[..n]), want);
        assert_eq!(&hex16(digest(&buf[..n])), b"2ff1e19e507ad997");
    }

    /// replay-format.md §10.4.
    #[test]
    fn spec_vector_10_4_probes_at_t0() {
        let g = Game::new("athena-p0-g0a-h5-0", 0).unwrap();
        let asks = AskList::new();
        let p = generate_probes(b"athena-p0-g0a-h5-0", 0, 0, &asks);
        let want = [
            (2, 0, 5, 49, 8, [2, 4, 2, 4, 2, 0], 5),
            (2, 1, 6, 42, 6, [1, 3, 1, 3, 1, 1], 6),
            (1, 0, 1, 8, 9, [4, 2, 4, 4, 0, 4], 1),
            (1, 0, 1, 8, 7, [4, 0, 2, 0, 4, 0], 1),
        ];
        for (got, w) in p.iter().zip(want.iter()) {
            assert_eq!(
                (got.kind, got.seat, got.target, got.card, got.set, got.assign, got.to),
                *w
            );
        }
        let verdicts: Vec<u8> = p.iter().map(|x| verdict(&g, &probe_action(x))).collect();
        assert_eq!(verdicts, vec![0, 18, 20, 0]);
    }

    #[test]
    fn decoder_refuses_never_panics() {
        assert!(decode_action(&[], 0).is_err());
        assert!(decode_action(&[9], 0).is_err());
        assert!(decode_action(&[1, 0, 1], 0).is_err());
        assert!(decode_action(&[1, 0, 1, 54], 0).is_err());
        assert!(decode_action(&[1, 6, 1, 3], 0).is_err());
        assert!(decode_action(&[2, 0, 9, 0, 0, 0, 0, 0, 0], 0).is_err());
        assert!(decode_action(&[2, 0, 8, 0, 0, 0, 0, 0, 7], 0).is_err());
        assert!(decode_action(&[3, 0, 6], 0).is_err());
        assert!(decode_action(&[4, 6], 0).is_err());
        for bytes in [
            &[1u8, 0, 1, 3][..],
            &[2, 1, 8, 1, 3, 5, 1, 3, 5][..],
            &[3, 2, 4][..],
            &[4, 5][..],
        ] {
            let (a, next) = decode_action(bytes, 0).unwrap();
            assert_eq!(next, bytes.len());
            let mut out = [0u8; 9];
            let n = encode_action(&a, &mut out);
            assert_eq!(&out[..n], bytes);
        }
    }

    #[test]
    fn seeds_are_printable_ascii() {
        assert!(seed_ok(b"athena-p0-g0a-h5-0"));
        assert!(!seed_ok(b""));
        assert!(!seed_ok(b"a b"));
        assert!(!seed_ok("\u{e9}".as_bytes()));
        assert_eq!(probe_state_count(0), 1);
        assert_eq!(probe_state_count(1), 2);
        assert_eq!(probe_state_count(10), 2);
        assert_eq!(probe_state_count(1124), 114);
    }
}
