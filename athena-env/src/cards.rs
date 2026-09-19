//! The us54 deck and its sets, by canonical index (`lib/engine/cards.ts`; replay-format.md §1).
//!
//! - Cards are 0..=53, suit-major C, D, H, S; within a suit the ranks 2 3 4 5 6 7 8 9 T J Q K A; then XR = 52 and
//!   XB = 53. So 2C = 0, 8C = 6, AC = 12, 2D = 13, 8S = 45 and AS = 51.
//! - Sets are 0..=8: LOW-C, LOW-D, LOW-H, LOW-S, HIGH-C, HIGH-D, HIGH-H, HIGH-S, EIGHTS.
//! - A set's card order is ascending card index: rank order for a half-suit, and 8C, 8D, 8H, 8S, XR, XB for EIGHTS.
//! - A hand is a 54-bit mask, so iterating its bits in ascending order IS the canonical sort (`sortHand`).

/// Cards in the deck.
pub const NCARDS: usize = 54;
/// Sets in the deck.
pub const NSETS: usize = 9;
/// Seats at the table.
pub const NSEATS: usize = 6;
/// The byte for "no value" (replay-format.md §1).
pub const NONE: u8 = 0xFF;
/// The set index of EIGHTS.
pub const EIGHTS: u8 = 8;

const SUITS: [u8; 4] = *b"CDHS";
const RANKS: [u8; 13] = *b"23456789TJQKA";

const fn build_set_of_card() -> [u8; NCARDS] {
    let mut out = [0u8; NCARDS];
    let mut c = 0;
    while c < NCARDS {
        out[c] = if c >= 52 {
            EIGHTS
        } else {
            let suit = (c / 13) as u8;
            let rank = c % 13;
            if rank < 6 {
                suit
            } else if rank == 6 {
                EIGHTS
            } else {
                4 + suit
            }
        };
        c += 1;
    }
    out
}

const fn build_set_cards() -> [[u8; 6]; NSETS] {
    let mut out = [[0u8; 6]; NSETS];
    let mut b = 0;
    while b < 8 {
        let suit = (b % 4) as u8;
        let first = if b < 4 { 0 } else { 7 };
        let mut j = 0;
        while j < 6 {
            out[b][j] = suit * 13 + first + j as u8;
            j += 1;
        }
        b += 1;
    }
    out[8] = [6, 19, 32, 45, 52, 53];
    out
}

const fn build_set_mask(cards: &[[u8; 6]; NSETS]) -> [u64; NSETS] {
    let mut out = [0u64; NSETS];
    let mut b = 0;
    while b < NSETS {
        let mut j = 0;
        while j < 6 {
            out[b] |= 1u64 << cards[b][j];
            j += 1;
        }
        b += 1;
    }
    out
}

/// The set of every card.
pub const SET_OF_CARD: [u8; NCARDS] = build_set_of_card();
/// Each set's six cards, in the set's card order (ascending index).
pub const SET_CARDS: [[u8; 6]; NSETS] = build_set_cards();
/// Each set's six cards as a mask.
pub const SET_MASK: [u64; NSETS] = build_set_mask(&SET_CARDS);
/// All 54 cards as a mask.
pub const DECK_MASK: u64 = (1u64 << NCARDS) - 1;

/// The set names, in set order.
pub const SET_NAMES: [&str; NSETS] = [
    "LOW-C", "LOW-D", "LOW-H", "LOW-S", "HIGH-C", "HIGH-D", "HIGH-H", "HIGH-S", "EIGHTS",
];

/// Team = seat mod 2, so seats 0, 2 and 4 are team 0. Seat 6 (not a seat, in a probe) counts as team 0, as in the
/// reference's `seatTeam`.
#[inline(always)]
pub const fn team(seat: u8) -> u8 {
    seat & 1
}

/// Is `x` one of the six seats?
#[inline(always)]
pub const fn is_seat(x: u8) -> bool {
    x < 6
}

/// The card's two-character name (`2C`, `TS`, `XR`), for reports.
pub fn card_name(c: u8) -> [u8; 2] {
    match c {
        52 => *b"XR",
        53 => *b"XB",
        c if (c as usize) < 52 => [RANKS[c as usize % 13], SUITS[c as usize / 13]],
        _ => *b"??",
    }
}

/// The card index of a name such as `8H` or `XB`, if it is a us54 card.
pub fn card_index(name: &str) -> Option<u8> {
    let b = name.as_bytes();
    if b.len() != 2 {
        return None;
    }
    match b {
        b"XR" => return Some(52),
        b"XB" => return Some(53),
        _ => {}
    }
    let r = RANKS.iter().position(|&x| x == b[0])?;
    let s = SUITS.iter().position(|&x| x == b[1])?;
    Some((s * 13 + r) as u8)
}

/// The mask of one card.
#[inline(always)]
pub const fn bit(c: u8) -> u64 {
    1u64 << c
}

/// The cards of a mask in ascending (canonical) order.
pub fn cards_of(mut mask: u64) -> impl Iterator<Item = u8> {
    std::iter::from_fn(move || {
        if mask == 0 {
            None
        } else {
            let c = mask.trailing_zeros() as u8;
            mask &= mask - 1;
            Some(c)
        }
    })
}

/// A mask from a list of card names; panics on a name that is not a card (a test helper).
pub fn mask_of(names: &[&str]) -> u64 {
    names.iter().fold(0u64, |m, n| {
        m | bit(card_index(n).unwrap_or_else(|| panic!("{n} is not a us54 card")))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_indices_match_the_specification() {
        assert_eq!(card_index("2C"), Some(0));
        assert_eq!(card_index("8C"), Some(6));
        assert_eq!(card_index("AC"), Some(12));
        assert_eq!(card_index("2D"), Some(13));
        assert_eq!(card_index("8S"), Some(45));
        assert_eq!(card_index("AS"), Some(51));
        assert_eq!(card_index("XR"), Some(52));
        assert_eq!(card_index("XB"), Some(53));
        for c in 0..54u8 {
            let n = card_name(c);
            assert_eq!(card_index(std::str::from_utf8(&n).unwrap()), Some(c));
        }
    }

    #[test]
    fn sets_partition_the_deck_in_set_card_order() {
        let mut seen = 0u64;
        for (b, cards) in SET_CARDS.iter().enumerate() {
            for w in cards.windows(2) {
                assert!(w[0] < w[1], "set {b} is not in ascending card order");
            }
            for &c in cards {
                assert_eq!(SET_OF_CARD[c as usize] as usize, b);
                assert_eq!(seen & bit(c), 0);
                seen |= bit(c);
            }
        }
        assert_eq!(seen, DECK_MASK);
        assert_eq!(mask_of(&["8C", "8D", "8H", "8S", "XR", "XB"]), SET_MASK[8]);
        assert_eq!(mask_of(&["9H", "TH", "JH", "QH", "KH", "AH"]), SET_MASK[6]);
        assert_eq!(mask_of(&["2S", "3S", "4S", "5S", "6S", "7S"]), SET_MASK[3]);
    }
}
