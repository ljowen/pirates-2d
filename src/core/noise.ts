/** Deterministic, seedable 1D value noise — used for wind drift and gusts. */
export class Noise1D {
  private readonly table: Float32Array

  constructor(seed: number, size = 512) {
    this.table = new Float32Array(size)
    let s = seed >>> 0
    for (let i = 0; i < size; i++) {
      // xorshift32
      s ^= s << 13; s >>>= 0
      s ^= s >>> 17
      s ^= s << 5; s >>>= 0
      this.table[i] = (s / 0xffffffff) * 2 - 1
    }
  }

  /** Smoothly interpolated noise in roughly [-1, 1]. */
  at(t: number): number {
    const n = this.table.length
    const i = Math.floor(t)
    const f = t - i
    const a = this.table[((i % n) + n) % n]
    const b = this.table[(((i + 1) % n) + n) % n]
    const u = f * f * (3 - 2 * f)
    return a + (b - a) * u
  }

  /** Layered octaves for a more organic signal. */
  fbm(t: number, octaves = 3): number {
    let sum = 0
    let amp = 1
    let norm = 0
    for (let o = 0; o < octaves; o++) {
      sum += this.at(t * (1 << o)) * amp
      norm += amp
      amp *= 0.5
    }
    return sum / norm
  }
}
