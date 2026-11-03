import { Container, Graphics } from 'pixi.js'
import type { Plunder } from '../sim/plunder'

/**
 * Floating spoils. Pieces being drawn in by the magnet get a brighter glow and
 * a trailing streak, so the pull is legible from across the screen — otherwise
 * it reads as coins mysteriously sliding about.
 */
export class PlunderView {
  readonly view = new Container()
  private readonly g = new Graphics()
  private t = 0

  constructor() {
    this.view.addChild(this.g)
  }

  update(plunder: Plunder[], dt: number) {
    this.t += dt
    const g = this.g
    g.clear()

    for (const p of plunder) {
      // Blink out as it is about to sink, so losing one never feels arbitrary.
      const fading = p.life < 4
      const alpha = fading ? 0.35 + 0.65 * Math.abs(Math.sin(p.life * 6)) : 1
      const bob = Math.sin(this.t * 3 + p.pos.x * 0.03) * 1.6
      const r = 5 + Math.min(p.value, 4) * 0.9

      if (p.drawn) {
        g.circle(p.pos.x, p.pos.y + bob, r * 2.6)
          .fill({ color: 0xffd98a, alpha: 0.13 * alpha })
      }

      g.circle(p.pos.x, p.pos.y + bob, r)
        .fill({ color: p.drawn ? 0xffe9a8 : 0xf0c14b, alpha: alpha })
        .stroke({ width: 1.2, color: 0x8a5a14, alpha: alpha })
      g.circle(p.pos.x - r * 0.3, p.pos.y + bob - r * 0.3, r * 0.32)
        .fill({ color: 0xfff6d8, alpha: 0.8 * alpha })
    }
  }

  clear() { this.g.clear() }
}
