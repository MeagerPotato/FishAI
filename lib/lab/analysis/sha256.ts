/**
 * sha256.ts — FIPS 180-4 SHA-256, in pure TypeScript.
 *
 * ## Why not `node:crypto`
 *
 * `meta.rulesHash` is the artifact's staleness detector: BOT_LAB.md §7.1 and SITE_SPEC.md §1.1
 * require the site to **refuse to render** results whose rules hash does not match the shipped
 * `RULES_US54.md`. That check has to run in the browser as well as in the emitter, and the
 * repository has no `@types/node`, so a `node:crypto` import could neither be typechecked nor
 * reused by the site. Forty lines of pure arithmetic with a NIST test vector under it is the
 * cheaper and more portable answer, and it keeps the hash a *pure function of the file's bytes*
 * on both sides of the contract.
 *
 * `TextEncoder` is the only ambient used, and it is in `tsconfig.app.json`'s `DOM` lib as well as
 * in every runtime this repo targets.
 */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0
}

/** SHA-256 of raw bytes, lower-case hex. */
export function sha256Bytes(bytes: Uint8Array): string {
  const bitLen = bytes.length * 8
  // Padded length: message + 0x80 + zeros + 8-byte big-endian bit length, rounded to 64 bytes.
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  // Bit lengths above 2^32 need the high word; a rules document never gets there, but the
  // arithmetic is written correctly rather than assumed small.
  const hi = Math.floor(bitLen / 0x100000000)
  const lo = bitLen >>> 0
  const tail = padded.length - 8
  padded[tail] = (hi >>> 24) & 0xff
  padded[tail + 1] = (hi >>> 16) & 0xff
  padded[tail + 2] = (hi >>> 8) & 0xff
  padded[tail + 3] = hi & 0xff
  padded[tail + 4] = (lo >>> 24) & 0xff
  padded[tail + 5] = (lo >>> 16) & 0xff
  padded[tail + 6] = (lo >>> 8) & 0xff
  padded[tail + 7] = lo & 0xff

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19
  const w = new Uint32Array(64)

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] =
        ((padded[off + i * 4] << 24) |
          (padded[off + i * 4 + 1] << 16) |
          (padded[off + i * 4 + 2] << 8) |
          padded[off + i * 4 + 3]) >>>
        0
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0
      const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0
      const ch = ((e & f) ^ (~e & g)) >>> 0
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const t2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, '0')).join('')
}

/** SHA-256 of a string's UTF-8 bytes, lower-case hex. */
export function sha256(text: string): string {
  return sha256Bytes(new TextEncoder().encode(text))
}

/**
 * The hash the artifact records for a rules document.
 *
 * Line endings are normalised to `\n` and a single trailing newline is enforced **before**
 * hashing, so a Windows checkout and a Linux CI runner agree. Without that the site would refuse
 * to render on one platform and not the other, which is the failure mode of a staleness check
 * that is more annoying than no check at all.
 */
export function rulesHash(text: string): string {
  const normalised = text.replace(/\r\n/g, '\n').replace(/\s*$/, '') + '\n'
  return sha256(normalised)
}
