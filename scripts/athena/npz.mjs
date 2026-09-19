/**
 * npz.mjs: read NumPy's `.npz` archives (np.savez / np.savez_compressed) in Node, for the scripts that read ATHENA
 * P1's stored games (`gen-belief-games.py`'s parts). Only what those files use: a zip of `.npy` members, stored or
 * deflated, zip64 extras included (NumPy writes every member with `force_zip64`), little-endian numeric dtypes, bool
 * and fixed-width unicode (`<U n`). Anything else is refused.
 *
 *     import { readNpz } from './npz.mjs'
 *     const z = readNpz('part-00000.npz')   // { name: { dtype, shape, data } }, data a typed array or string[]
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const TYPED = {
  '|u1': Uint8Array,
  '<u1': Uint8Array,
  '|i1': Int8Array,
  '|b1': Uint8Array,
  '<u2': Uint16Array,
  '<i2': Int16Array,
  '<u4': Uint32Array,
  '<i4': Int32Array,
  '<f4': Float32Array,
  '<f8': Float64Array,
  '<i8': BigInt64Array,
  '<u8': BigUint64Array,
}

/** One `.npy` member's bytes into { dtype, shape, data }. */
export function parseNpy(raw, name = 'array') {
  if (raw[0] !== 0x93 || raw.toString('latin1', 1, 6) !== 'NUMPY') throw new Error(`${name}: not an .npy member`)
  const major = raw[6]
  const hlen = major === 1 ? raw.readUInt16LE(8) : raw.readUInt32LE(8)
  const hstart = major === 1 ? 10 : 12
  const header = raw.toString('latin1', hstart, hstart + hlen)
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1]
  const fortran = /'fortran_order':\s*(True|False)/.exec(header)?.[1]
  const shapeText = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1]
  if (!descr || fortran === undefined || shapeText === undefined) throw new Error(`${name}: unreadable header ${header}`)
  if (fortran === 'True') throw new Error(`${name}: Fortran order is not supported`)
  const shape = shapeText.split(',').map((s) => s.trim()).filter(Boolean).map(Number)
  const count = shape.reduce((a, b) => a * b, 1)
  const body = raw.subarray(hstart + hlen)
  const uni = /^<U(\d+)$/.exec(descr)
  if (uni) {
    const w = Number(uni[1])
    const out = new Array(count)
    for (let i = 0; i < count; i++) {
      let s = ''
      for (let j = 0; j < w; j++) {
        const cp = body.readUInt32LE((i * w + j) * 4)
        if (cp === 0) break
        s += String.fromCodePoint(cp)
      }
      out[i] = s
    }
    return { dtype: descr, shape, data: out }
  }
  const T = TYPED[descr]
  if (!T) throw new Error(`${name}: dtype ${descr} is not supported`)
  const bytes = count * T.BYTES_PER_ELEMENT
  if (body.length < bytes) throw new Error(`${name}: ${body.length} bytes of data, ${bytes} expected`)
  const copy = new Uint8Array(bytes)
  copy.set(body.subarray(0, bytes))
  return { dtype: descr, shape, data: new T(copy.buffer) }
}

/** Every member of an `.npz` file, by name without the `.npy` suffix. */
export function readNpz(file) {
  const buf = fs.readFileSync(file)
  let e = buf.length - 22
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--
  if (e < 0) throw new Error(`${file}: no zip end record`)
  let entries = buf.readUInt16LE(e + 10)
  let cd = buf.readUInt32LE(e + 16)
  if (entries === 0xffff || cd === 0xffffffff) {
    const loc = e - 20
    if (loc < 0 || buf.readUInt32LE(loc) !== 0x07064b50) throw new Error(`${file}: a zip64 archive without its locator`)
    const e64 = Number(buf.readBigUInt64LE(loc + 8))
    entries = Number(buf.readBigUInt64LE(e64 + 32))
    cd = Number(buf.readBigUInt64LE(e64 + 48))
  }
  const out = {}
  let off = cd
  for (let k = 0; k < entries; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error(`${file}: bad central directory entry ${k}`)
    const method = buf.readUInt16LE(off + 10)
    let csize = buf.readUInt32LE(off + 20)
    let usize = buf.readUInt32LE(off + 24)
    const nlen = buf.readUInt16LE(off + 28)
    const xlen = buf.readUInt16LE(off + 30)
    const clen = buf.readUInt16LE(off + 32)
    let lho = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nlen)
    // zip64: the extra field 0x0001 holds, in order, each of these that the entry marks 0xFFFFFFFF
    let x = off + 46 + nlen
    const xend = x + xlen
    while (x + 4 <= xend) {
      const id = buf.readUInt16LE(x)
      const sz = buf.readUInt16LE(x + 2)
      if (id === 0x0001) {
        let p = x + 4
        if (usize === 0xffffffff) { usize = Number(buf.readBigUInt64LE(p)); p += 8 }
        if (csize === 0xffffffff) { csize = Number(buf.readBigUInt64LE(p)); p += 8 }
        if (lho === 0xffffffff) { lho = Number(buf.readBigUInt64LE(p)); p += 8 }
      }
      x += 4 + sz
    }
    if (buf.readUInt32LE(lho) !== 0x04034b50) throw new Error(`${file}: bad local header for ${name}`)
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28)
    const data = buf.subarray(start, start + csize)
    let raw
    if (method === 0) raw = data
    else if (method === 8) raw = zlib.inflateRawSync(data)
    else throw new Error(`${file}: ${name} uses zip method ${method}`)
    if (raw.length !== usize) throw new Error(`${file}: ${name} inflates to ${raw.length} bytes, not ${usize}`)
    out[name.replace(/\.npy$/, '')] = parseNpy(raw, name)
    off += 46 + nlen + xlen + clen
  }
  return out
}
