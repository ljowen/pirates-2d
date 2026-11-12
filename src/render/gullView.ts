import { Container, Graphics } from 'pixi.js'
import type { Camera } from './camera'
import { P } from './palette'

interface Gull {
  x: number; y: number
  heading: number
  /** Which way she is circling, and how tightly. */
  turn: number
  /** Out of step with the others, so the flock never beats in time. */
  phase: number
  /** Seconds until she changes her mind about the circle. */
  mood: number
}

const COUNT = 6
const SPEED = 95

/**
 * Gulls. They do nothing: they are not a hazard, a hint or a pickup. They
 * wheel about near the ship because a sea with nothing alive over it looks
 * like a diagram, and because something moving that is not trying to kill
 * you makes the rest feel more dangerous.
 *
 * Each one flies a lazy circle, drifting toward wherever the camera is, and
 * is quietly put back at the edge of the view if she is left behind.
 */
export class GullView {
  readonly view = new Container()
  private readonly g = new Graphics()
  private readonly gulls: Gull[] = []
  private t = 0

  constructor() {
    this.view.addChild(this.g)
  }

  update(camera: Camera, dt: number) {
    this.t += dt
    const reach = Math.max(camera.viewW, camera.viewH) / camera.zoom * 0.75
    while (this.gulls.length < COUNT) this.gulls.push(this.arrive(camera, reach, true))

    const g = this.g
    g.clear()
    for (let i = 0; i < this.gulls.length; i++) {
      let gull = this.gulls[i]
      const dx = camera.pos.x - gull.x
      const dy = camera.pos.y - gull.y
      const far = Math.hypot(dx, dy)
      if (far > reach * 1.5) {
        gull = this.gulls[i] = this.arrive(camera, reach, false)
      }
      gull.mood -= dt
      if (gull.mood <= 0) {
        gull.turn = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.5)
        gull.mood = 3 + Math.random() * 6
      }
      // Circle, but lean back toward the ship when she has wandered off.
      let steer = gull.turn
      if (far > reach * 0.55) {
        const want = Math.atan2(dy, dx)
        let off = (want - gull.heading) % (Math.PI * 2)
        if (off > Math.PI) off -= Math.PI * 2
        if (off < -Math.PI) off += Math.PI * 2
        steer = Math.max(-1.2, Math.min(1.2, off * 1.5))
      }
      gull.heading += steer * dt
      gull.x += Math.cos(gull.heading) * SPEED * dt
      gull.y += Math.sin(gull.heading) * SPEED * dt
      this.draw(gull)
    }
  }

  private arrive(camera: Camera, reach: number, anywhere: boolean): Gull {
    const a = Math.random() * Math.PI * 2
    const d = anywhere ? Math.sqrt(Math.random()) * reach : reach * 1.2
    return {
      x: camera.pos.x + Math.cos(a) * d,
      y: camera.pos.y + Math.sin(a) * d,
      // Coming in, she is headed roughly for the ship.
      heading: anywhere ? Math.random() * Math.PI * 2 : a + Math.PI + (Math.random() - 0.5),
      turn: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.5),
      phase: Math.random() * 6,
      mood: 2 + Math.random() * 5,
    }
  }

  private draw(gull: Gull) {
    const g = this.g
    const c = Math.cos(gull.heading)
    const s = Math.sin(gull.heading)
    // A few beats, then a glide: wings held flat for part of every cycle.
    const beat = Math.max(0, Math.sin(this.t * 6 + gull.phase)) * Math.max(0, Math.sin(this.t * 0.7 + gull.phase))
    const span = 11 - beat * 4
    const sweep = 3 + beat * 3
    const at = (fx: number, fy: number, ox = 0, oy = 0): [number, number] =>
      [gull.x + fx * c - fy * s + ox, gull.y + fx * s + fy * c + oy]

    for (const [ox, oy, color, alpha, width] of [
      [9, 12, P().ship.shadow, 0.22, 2.6],
      [0, 0, 0xffffff, 1, 2.4],
    ] as const) {
      const [lx, ly] = at(-sweep, -span, ox, oy)
      const [mx, my] = at(2, 0, ox, oy)
      const [rx, ry] = at(-sweep, span, ox, oy)
      g.moveTo(lx, ly).lineTo(mx, my).lineTo(rx, ry).stroke({ width, color, alpha, join: 'round', cap: 'round' })
    }
    // Dark wingtips, which is what makes it a gull and not a white tick.
    const [tlx, tly] = at(-sweep, -span)
    const [trx, try_] = at(-sweep, span)
    g.circle(tlx, tly, 1.3).fill({ color: 0x2a2a2e })
    g.circle(trx, try_, 1.3).fill({ color: 0x2a2a2e })
  }

  clear() {
    this.gulls.length = 0
    this.g.clear()
  }
}
