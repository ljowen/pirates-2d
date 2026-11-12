import { Container, Graphics } from 'pixi.js'
import type { Squall, Weather } from '../sim/weather'
import type { Camera } from './camera'
import { P } from './palette'

/** Stable per-streak randomness, so the rain does not reshuffle every frame. */
function hash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16)
  n = (n + (n << 3)) | 0
  n = n ^ (n >>> 4)
  n = Math.imul(n, 0x27d4eb2d)
  n = n ^ (n >>> 15)
  return (n >>> 0) / 4294967296
}

/** A colour part of the way toward another. */
function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t) << shift
  return ch(16) | ch(8) | ch(0)
}

/**
 * Squalls on the water.
 *
 * The entire mechanic rests on being able to see one coming — a squall you
 * only discover by having your topsails split is a trap, not a decision, the
 * same rule the reefs are drawn by. So this is deliberately loud: a dark
 * shadow on the sea that is legible from well outside the cell, a bank of
 * cloud round its edge, and rain inside it.
 *
 * It used to be a ring: concentric discs with a pale line round them, which
 * read as a target painted on the sea. The shape is now irregular and its
 * edge soft, and the cloud does the job the line did.
 *
 * Two layers, because one would have to choose between hiding the ships and
 * being invisible under them. The shadow goes down with the terrain so hulls
 * and shot stay crisp on top of it; only the thin rain is drawn over them.
 */
export class SquallView {
  /** Darkened water. Belongs under the ships. */
  readonly shadow = new Container()
  /** Cloud and rain. Belong over them, and stay faint for that reason. */
  readonly rain = new Container()
  private readonly sg = new Graphics()
  private readonly rg = new Graphics()
  private t = 0

  constructor() {
    this.shadow.addChild(this.sg)
    this.rain.addChild(this.rg)
  }

  update(weather: Weather, camera: Camera, dt: number) {
    this.t += dt
    const sg = this.sg
    const rg = this.rg
    sg.clear()
    rg.clear()
    if (weather.squalls.length === 0) return

    const reach = Math.max(camera.viewW, camera.viewH) / camera.zoom
    for (const s of weather.squalls) {
      if (s.power <= 0.01) continue
      if (Math.hypot(s.x - camera.pos.x, s.y - camera.pos.y) > reach + s.radius) continue
      this.drawCell(sg, rg, s)
    }
  }

  /**
   * The outline of the cell at a fraction of its radius: a circle pushed in
   * and out by a few slow waves, so no two cells are the same shape and none
   * is a compass-drawn disc. The waves turn with time, which is what makes
   * the edge look like weather rather than a stamp.
   */
  private outline(s: Squall, at: number, phase: number): number[] {
    const N = 56
    const pts: number[] = []
    const k = s.seed % 1000
    const t = this.t
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const wobble =
        0.085 * Math.sin(a * 2 + k + phase + t * 0.05) +
        0.06 * Math.sin(a * 3 + k * 1.7 - phase * 1.3 - t * 0.08) +
        0.04 * Math.sin(a * 5 + k * 2.3 + phase * 2.1 + t * 0.11) +
        0.022 * Math.sin(a * 9 + k * 0.7 - t * 0.17)
      const r = s.radius * at * (1 + wobble)
      pts.push(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r)
    }
    return pts
  }

  /**
   * One cloud, as a single outline so it has no seams: the outer edge of a
   * handful of overlapping rounds of different sizes, strung out sideways.
   * Found by casting a ray from the middle at each angle and keeping the
   * furthest round it leaves.
   */
  private cloud(x: number, y: number, r: number, seed: number): number[] {
    const lobes: [number, number, number][] = [[0, 0, r * 0.62]]
    const n = 4 + Math.floor(hash(seed) * 3)
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + hash(seed + j * 13) * 0.9
      const size = r * (0.3 + hash(seed + j * 29) * 0.3)
      lobes.push([Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.34, size])
    }
    const N = 72
    const pts: number[] = []
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      let far = 0
      for (const [cx, cy, rho] of lobes) {
        const along = dx * cx + dy * cy
        const disc = along * along - (cx * cx + cy * cy) + rho * rho
        if (disc < 0) continue
        far = Math.max(far, along + Math.sqrt(disc))
      }
      pts.push(x + dx * far, y + dy * far)
    }
    return pts
  }

  private drawCell(sg: Graphics, rg: Graphics, s: Squall) {
    const p = s.power
    const w = P().weather

    // Many thin layers rather than a few thick ones, each its own slightly
    // different shape. Stacked, they thicken toward the middle the way the
    // wind does (full strength inside 45% of the radius), and because their
    // edges never line up the outside of the cell has no line to it at all:
    // it just gets darker as you go in.
    const BANDS = 11
    for (let i = 0; i < BANDS; i++) {
      const at = 1.08 - (i / BANDS) * 0.86
      sg.poly(this.outline(s, at, i * 0.9)).fill({ color: w.squallShadow, alpha: 0.05 * p })
    }

    // Cloud, banked round the rim and thinning toward the middle, so the
    // edge of the cell is still the thing you see first but the ships inside
    // are not hidden. Each has a dark underside set off below it, which is
    // the same one hard shade band everything else in the game is drawn with.
    const clouds = 10 + Math.round(hash(s.seed + 7) * 3)
    const spin = this.t * 0.012 * (s.veerSign || 1)
    const pale = mix(w.squallRim, 0xffffff, 0.45)
    for (let i = 0; i < clouds; i++) {
      const h1 = hash(s.seed + i * 7919)
      const h2 = hash(s.seed ^ (i * 104729))
      const h3 = hash(s.seed + i * 31337)
      const a = (i / clouds) * Math.PI * 2 + h1 * 0.5 + spin
      // Three out of four sit on the rim; the rest drift further in.
      const inner = i % 4 === 3
      const d = (inner ? 0.4 + h2 * 0.2 : 0.82 + h2 * 0.2) * s.radius
      const r = s.radius * (inner ? 0.16 : 0.2 + h3 * 0.14) * (0.6 + 0.4 * p)
      const x = s.x + Math.cos(a) * d
      const y = s.y + Math.sin(a) * d + Math.sin(this.t * 0.25 + h1 * 6.28) * 3
      const shape = s.seed + i * 977
      rg.poly(this.cloud(x + r * 0.06, y + r * 0.16, r, shape))
        .fill({ color: w.squallShadow, alpha: 0.22 * p })
      rg.poly(this.cloud(x, y, r, shape)).fill({ color: pale, alpha: (inner ? 0.36 : 0.5) * p })
    }

    const count = Math.round(Math.min(130, s.radius / 6))
    const len = 34
    // Rain falls with the wind, not vertically — the whole point is that this
    // is wind made visible.
    const drift = this.t * 0.55
    for (let i = 0; i < count; i++) {
      const a = hash(s.seed + i * 2654435761) * Math.PI * 2
      const rr = Math.sqrt(hash(s.seed ^ (i * 40503))) * 0.95
      // Each streak marches across the cell and wraps, so the rain reads as
      // falling through the squall rather than stuck to it.
      const slide = (hash(s.seed + i) + drift) % 1
      const u = Math.cos(a) * rr
      const v = Math.sin(a) * rr * 0.9 + (slide - 0.5) * 0.6
      if (u * u + v * v > 0.95) continue
      const x = s.x + u * s.radius
      const y = s.y + v * s.radius
      rg.moveTo(x, y).lineTo(x + len * 0.38, y + len)
    }
    rg.stroke({ width: 1.7, color: w.rain, alpha: 0.3 * p })
  }

  clear() {
    this.sg.clear()
    this.rg.clear()
  }
}
