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

/**
 * Deterministic 2D value noise, for fields that vary across the map rather
 * than over time — local wind being the first of them.
 */
export class Noise2D {
  constructor(private readonly seed: number) {}

  private lattice(ix: number, iy: number): number {
    let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(this.seed | 0, 2246822519)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 2147483647.5 - 1
  }

  /** Smoothly interpolated, roughly in [-1, 1]. */
  at(x: number, y: number): number {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const ux = fx * fx * (3 - 2 * fx)
    const uy = fy * fy * (3 - 2 * fy)

    const a = this.lattice(ix, iy)
    const b = this.lattice(ix + 1, iy)
    const c = this.lattice(ix, iy + 1)
    const d = this.lattice(ix + 1, iy + 1)

    const top = a + (b - a) * ux
    const bottom = c + (d - c) * ux
    return top + (bottom - top) * uy
  }

  /** Layered octaves, for a field with both broad and fine structure. */
  fbm(x: number, y: number, octaves = 2): number {
    let sum = 0
    let amp = 1
    let norm = 0
    let scale = 1
    for (let o = 0; o < octaves; o++) {
      sum += this.at(x * scale, y * scale) * amp
      norm += amp
      amp *= 0.5
      scale *= 2.1
    }
    return sum / norm
  }
}
