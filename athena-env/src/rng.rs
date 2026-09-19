//! The reference's generators, `lib/engine/rng.ts` (replay-format.md §2): xmur3 over UTF-16 code units, then
//! mulberry32. Only wrapping 32-bit integer operations, so every output equals the reference's bit for bit.

/// xmur3: a 32-bit seed generator from a string. Its state carries over between outputs, as in `hashSeed`.
#[derive(Clone, Copy, Debug)]
pub struct Xmur3 {
    h: u32,
}

impl Xmur3 {
    /// Hash a string's UTF-16 code units (`charCodeAt`), as the reference does.
    pub fn new(s: &str) -> Self {
        let len = s.encode_utf16().count() as u32;
        let mut x = Xmur3::start(len);
        for u in s.encode_utf16() {
            x.absorb(u as u32);
        }
        x
    }

    /// Hash the concatenation of string parts over their UTF-16 code units, with no allocation.
    pub fn from_str_parts(parts: &[&str]) -> Self {
        let len: usize = parts.iter().map(|p| p.encode_utf16().count()).sum();
        let mut x = Xmur3::start(len as u32);
        for p in parts {
            for u in p.encode_utf16() {
                x.absorb(u as u32);
            }
        }
        x
    }

    /// Hash the concatenation of byte parts, each byte one code unit. Equals [`Xmur3::new`] on the ASCII string the
    /// parts spell, with no allocation (the probe seeds are built this way).
    pub fn from_ascii_parts(parts: &[&[u8]]) -> Self {
        let len: usize = parts.iter().map(|p| p.len()).sum();
        let mut x = Xmur3::start(len as u32);
        for p in parts {
            for &b in p.iter() {
                x.absorb(b as u32);
            }
        }
        x
    }

    #[inline]
    fn start(len: u32) -> Self {
        Xmur3 {
            h: 1_779_033_703u32 ^ len,
        }
    }

    #[inline]
    fn absorb(&mut self, c: u32) {
        self.h = (self.h ^ c).wrapping_mul(3_432_918_353);
        self.h = self.h.rotate_left(13);
    }

    /// The next 32-bit output.
    #[inline]
    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> u32 {
        let mut h = self.h;
        h = (h ^ (h >> 16)).wrapping_mul(2_246_822_507);
        h = (h ^ (h >> 13)).wrapping_mul(3_266_489_909);
        h ^= h >> 16;
        self.h = h;
        h
    }
}

/// mulberry32. [`Mulberry32::next_u32`] is the reference's `rng() * 2^32`, exactly.
#[derive(Clone, Copy, Debug)]
pub struct Mulberry32 {
    s: u32,
}

impl Mulberry32 {
    /// Seed the generator.
    pub const fn new(a: u32) -> Self {
        Mulberry32 { s: a }
    }

    /// The next output as a u32.
    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        self.s = self.s.wrapping_add(0x6D2B_79F5);
        let mut t = self.s;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    /// The next output as the reference's float in [0, 1): u32 / 2^32, exact in f64.
    #[inline]
    pub fn next_f64(&mut self) -> f64 {
        self.next_u32() as f64 / 4_294_967_296.0
    }

    /// `randInt(rng, n)` = `floor(rng() * n)`, computed in integers: exact because u32 · n < 2^53.
    #[inline]
    pub fn rand_int(&mut self, n: u32) -> u32 {
        ((self.next_u32() as u64 * n as u64) >> 32) as u32
    }
}

/// `rngFromSeed(seed)` = `mulberry32(xmur3(seed)())`.
pub fn rng_from_seed(seed: &str) -> Mulberry32 {
    Mulberry32::new(Xmur3::new(seed).next())
}

/// The decimal digits of `n` into `buf`, returning the used tail (no allocation).
pub fn decimal(n: u64, buf: &mut [u8; 20]) -> &[u8] {
    let mut i = buf.len();
    let mut n = n;
    loop {
        i -= 1;
        buf[i] = b'0' + (n % 10) as u8;
        n /= 10;
        if n == 0 {
            break;
        }
    }
    &buf[i..]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// replay-format.md §10.2.
    #[test]
    fn spec_vector_10_2_generators() {
        let mut h = Xmur3::new("athena-p0-g0a-h5-0");
        assert_eq!([h.next(), h.next(), h.next()], [3775514569, 2325701542, 2974494939]);
        let mut r = rng_from_seed("athena-p0-g0a-h5-0");
        assert_eq!(
            [r.next_u32(), r.next_u32(), r.next_u32()],
            [4047008728, 2782573905, 2890889111]
        );
        let mut p = Xmur3::from_ascii_parts(&[b"athena-p0", b"-g0a-h5-0"]);
        assert_eq!(p.next(), 3775514569);
    }

    #[test]
    fn rand_int_equals_the_float_floor() {
        let mut a = Mulberry32::new(987_654_321);
        let mut b = a;
        for n in [1u32, 2, 3, 6, 7, 21, 54, 55, 162, 1000] {
            for _ in 0..1000 {
                let x = a.rand_int(n);
                let y = (b.next_f64() * n as f64).floor() as u32;
                assert_eq!(x, y);
            }
        }
    }

    #[test]
    fn utf16_code_units_not_bytes() {
        // 'é' is one UTF-16 code unit (0xE9) but two UTF-8 bytes: the hash must see the code unit.
        let mut a = Xmur3::new("\u{e9}");
        let mut b = Xmur3::start(1);
        b.absorb(0xE9);
        assert_eq!(a.next(), b.next());
    }

    #[test]
    fn decimal_digits() {
        let mut buf = [0u8; 20];
        assert_eq!(decimal(0, &mut buf), b"0");
        assert_eq!(decimal(1123, &mut buf), b"1123");
        assert_eq!(decimal(u64::MAX, &mut buf), b"18446744073709551615");
    }
}
