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

/**
 * Squalls on the water.
 *
 * The entire mechanic rests on being able to see one coming — a squall you
 * only discover by having your topsails split is a trap, not a decision, the
 * same rule the reefs are drawn by. So this is deliberately loud: a dark
 * shadow on the sea that is legible from well outside the cell, and rain
 * inside it that says plainly where the edge is.
 *
 * Two layers, because one would have to choose between hiding the ships and
 * being invisible under them. The shadow goes down with the terrain so hulls
 * and shot stay crisp on top of it; only the thin rain is drawn over them.
 */
export class SquallView {
  /** Darkened water. Belongs under the ships. */
  readonly shadow = new Container()
  /** Rain. Belongs over them, and stays faint for that reason. */
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

  private drawCell(sg: Graphics, rg: Graphics, s: Squall) {
    const p = s.power

    // Many thin discs rather than a few thick ones. Four bands read as
    // concentric rings — a target painted on the sea — where nine stacking
    // faintly read as shadow thickening toward the middle, which is what the
    // physics actually does: full strength inside 45% of the radius, falling
    // away to nothing at the edge.
    const BANDS = 9
    for (let i = 0; i < BANDS; i++) {
      const at = 1 - (i / BANDS) * 0.82
      sg.circle(s.x, s.y, s.radius * at).fill({ color: P().weather.squallShadow, alpha: 0.055 * p })
    }

    // The squall line: the rim is what the player sees first and the only
    // part that says the cell has an edge and is moving across the water.
    sg.circle(s.x, s.y, s.radius)
      .stroke({ width: 4, color: P().weather.squallRim, alpha: 0.3 * p })

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
    rg.stroke({ width: 1.7, color: P().weather.rain, alpha: 0.3 * p })
  }

  clear() {
    this.sg.clear()
    this.rg.clear()
  }
}
