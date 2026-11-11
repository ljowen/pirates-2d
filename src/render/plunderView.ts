import { Container, Graphics } from 'pixi.js'
import type { Plunder } from '../sim/plunder'
import { P } from './palette'

/**
 * Floating spoils. Pieces being drawn in by the magnet get a brighter glow and
 * a trailing streak, so the pull is legible from across the screen — otherwise
 * it reads as coins mysteriously sliding about.
 *
 * There was a second kind once — baulks of timber that mended the hull — told
 * apart from coin by silhouette before colour. That rule still holds if a
 * second flotsam ever returns: a player glancing at the water while being shot
 * at has to know which prize is which without reading anything, and shape
 * survives at a distance where a hue does not.
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
      this.coin(p, bob, alpha)
    }
  }

  /** Plunder: a bright gold disc with a highlight. Progress. */
  private coin(p: Plunder, bob: number, alpha: number) {
    const g = this.g
    const r = 5 + Math.min(p.value, 4) * 0.9

    if (p.drawn) {
      g.circle(p.pos.x, p.pos.y + bob, r * 2.6)
        .fill({ color: P().coin.glow, alpha: 0.13 * alpha })
    }

    g.circle(p.pos.x, p.pos.y + bob, r)
      .fill({ color: p.drawn ? P().coin.drawn : P().coin.body, alpha })
      .stroke({ width: 1.2, color: P().coin.edge, alpha })
    g.circle(p.pos.x - r * 0.3, p.pos.y + bob - r * 0.3, r * 0.32)
      .fill({ color: P().coin.highlight, alpha: 0.8 * alpha })
  }

  clear() { this.g.clear() }
}
