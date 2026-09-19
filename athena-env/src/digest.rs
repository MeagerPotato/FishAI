//! The house digest over byte strings (replay-format.md §3): `tests/bots/action-digest.ts`'s `ActionDigest`, element
//! for element. Two 32-bit xor-multiply lanes; each element is its 1-based ordinal in ASCII decimal, a 0x00, its
//! bytes, and a 0x01; `hex()` avalanches and cross-mixes without ending the stream.

use crate::rng::decimal;

/// A rolling digest stream.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ByteDigest {
    h1: u32,
    h2: u32,
    n: u64,
}

impl Default for ByteDigest {
    fn default() -> Self {
        Self::new()
    }
}

impl ByteDigest {
    /// A fresh stream.
    pub const fn new() -> Self {
        ByteDigest {
            h1: 0xDEAD_BEEF,
            h2: 0x41C6_CE57,
            n: 0,
        }
    }

    #[inline(always)]
    fn mix(&mut self, c: u8) {
        self.h1 = (self.h1 ^ c as u32).wrapping_mul(2_654_435_761);
        self.h2 = (self.h2 ^ c as u32).wrapping_mul(1_597_334_677);
    }

    /// Open an element: its ordinal's ASCII digits, then 0x00. Feed its bytes with [`ByteDigest::feed`] and close it
    /// with [`ByteDigest::close_element`]. [`ByteDigest::push`] does all three.
    pub fn open_element(&mut self) {
        self.n += 1;
        let mut buf = [0u8; 20];
        let n = self.n;
        for &d in decimal(n, &mut buf) {
            self.mix(d);
        }
        self.mix(0x00);
    }

    /// Feed bytes into the open element.
    #[inline]
    pub fn feed(&mut self, bytes: &[u8]) {
        let (mut h1, mut h2) = (self.h1, self.h2);
        for &c in bytes {
            h1 = (h1 ^ c as u32).wrapping_mul(2_654_435_761);
            h2 = (h2 ^ c as u32).wrapping_mul(1_597_334_677);
        }
        self.h1 = h1;
        self.h2 = h2;
    }

    /// Close the open element with 0x01.
    pub fn close_element(&mut self) {
        self.mix(0x01);
    }

    /// `push(B)`: one whole element.
    #[inline]
    pub fn push(&mut self, bytes: &[u8]) -> &mut Self {
        self.open_element();
        self.feed(bytes);
        self.close_element();
        self
    }

    /// How many elements have been pushed.
    pub fn count(&self) -> u64 {
        self.n
    }

    /// The digest so far as a u64 whose 16 lowercase hex digits are `hex()`: the high word is printed first.
    #[inline]
    pub fn value(&self) -> u64 {
        let mut a = (self.h1 ^ (self.h1 >> 16)).wrapping_mul(2_246_822_507);
        let mut b = (self.h2 ^ (self.h2 >> 13)).wrapping_mul(3_266_489_909);
        a ^= b;
        b ^= (a ^ (a >> 16)).wrapping_mul(2_246_822_507);
        ((b as u64) << 32) | a as u64
    }

    /// `hex()`: 16 lowercase ASCII hex characters. Pure: it does not end the stream.
    pub fn hex(&self) -> [u8; 16] {
        hex16(self.value())
    }
}

/// `digest(B)`: the value of a fresh stream after the single element B.
#[inline]
pub fn digest(bytes: &[u8]) -> u64 {
    let mut d = ByteDigest::new();
    d.push(bytes);
    d.value()
}

const HEX: &[u8; 16] = b"0123456789abcdef";

/// A u64 as 16 lowercase hex characters.
#[inline]
pub fn hex16(v: u64) -> [u8; 16] {
    let mut out = [0u8; 16];
    for (i, o) in out.iter_mut().enumerate() {
        *o = HEX[((v >> (60 - 4 * i)) & 0xF) as usize];
    }
    out
}

/// 16 lowercase hex characters as a u64, or None if they are not exactly that.
#[inline]
pub fn parse_hex16(s: &[u8]) -> Option<u64> {
    if s.len() != 16 {
        return None;
    }
    let mut v = 0u64;
    for &c in s {
        v = (v << 4) | hex_nibble(c)? as u64;
    }
    Some(v)
}

/// One lowercase hex digit's value.
#[inline(always)]
pub fn hex_nibble(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        _ => None,
    }
}

/// Decode lowercase hex of whole bytes into `out` (cleared first). False if it is not that.
pub fn decode_hex_into(s: &[u8], out: &mut Vec<u8>) -> bool {
    out.clear();
    if s.len() % 2 != 0 {
        return false;
    }
    out.reserve(s.len() / 2);
    for pair in s.chunks_exact(2) {
        match (hex_nibble(pair[0]), hex_nibble(pair[1])) {
            (Some(h), Some(l)) => out.push((h << 4) | l),
            _ => return false,
        }
    }
    true
}

/// A u64's 16 hex characters as a String, for reports.
pub fn hex_string(v: u64) -> String {
    String::from_utf8_lossy(&hex16(v)).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// replay-format.md §10.1.
    #[test]
    fn spec_vector_10_1_digest() {
        assert_eq!(&ByteDigest::new().hex(), b"baab8e9a1aee8d83");
        assert_eq!(&hex16(digest(&[0x00, 0x01, 0x7f, 0x80, 0xff])), b"3269ff52857644ca");
    }

    #[test]
    fn element_api_equals_push() {
        let mut a = ByteDigest::new();
        let mut b = ByteDigest::new();
        for k in 0..30u8 {
            let bytes: Vec<u8> = (0..k).map(|i| i.wrapping_mul(37).wrapping_add(k)).collect();
            a.push(&bytes);
            b.open_element();
            for chunk in bytes.chunks(3) {
                b.feed(chunk);
            }
            b.close_element();
            assert_eq!(a.value(), b.value());
        }
        assert_eq!(a.count(), 30);
    }

    #[test]
    fn hex_round_trip() {
        for v in [0u64, 1, 0xdead_beef_0123_4567, u64::MAX] {
            assert_eq!(parse_hex16(&hex16(v)), Some(v));
        }
        assert_eq!(parse_hex16(b"0123456789ABCDEF"), None);
        let mut out = Vec::new();
        assert!(decode_hex_into(b"00ff7f", &mut out));
        assert_eq!(out, vec![0, 255, 127]);
        assert!(!decode_hex_into(b"0", &mut out));
        assert!(!decode_hex_into(b"zz", &mut out));
    }
}
