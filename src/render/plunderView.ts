import { Container, Graphics } from 'pixi.js'
import type { Plunder } from '../sim/plunder'

/**
 * Floating spoils. Pieces being drawn in by the magnet get a brighter glow and
 * a trailing streak, so the pull is legible from across the screen — otherwise
 * it reads as coins mysteriously sliding about.
 *
 * The two kinds are told apart by **silhouette before colour**: coin is a small
 * bright disc, timber a long pale baulk lying across the swell. A player
 * glancing at the water while being shot at has to know which prize is which
 * without reading anything, and shape survives at a distance, at speed and on
 * a busy sea where a hue does not.
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
      if (p.kind === 'timber') this.timber(p, bob, alpha)
      else this.coin(p, bob, alpha)
    }
  }

  /** Plunder: a bright gold disc with a highlight. Progress. */
  private coin(p: Plunder, bob: number, alpha: number) {
    const g = this.g
    const r = 5 + Math.min(p.value, 4) * 0.9

    if (p.drawn) {
      g.circle(p.pos.x, p.pos.y + bob, r * 2.6)
        .fill({ color: 0xffd98a, alpha: 0.13 * alpha })
    }

    g.circle(p.pos.x, p.pos.y + bob, r)
      .fill({ color: p.drawn ? 0xffe9a8 : 0xf0c14b, alpha })
      .stroke({ width: 1.2, color: 0x8a5a14, alpha })
    g.circle(p.pos.x - r * 0.3, p.pos.y + bob - r * 0.3, r * 0.32)
      .fill({ color: 0xfff6d8, alpha: 0.8 * alpha })
  }

  /**
   * Spare timber: a baulk of pale planking, drawn long and low with a grain
   * line down it. Lies at its own angle rather than square to the world, so a
   * field of them reads as wreckage adrift instead of a tidy row of blocks.
   */
  private timber(p: Plunder, bob: number, alpha: number) {
    const g = this.g
    // Each baulk keeps its own heading, derived from where it floats so it
    // never flickers between frames.
    const angle = Math.sin(p.pos.x * 0.07 + p.pos.y * 0.05) * 1.4 + this.t * 0.25
    // Deliberately longer than a coin is wide. A baulk of timber is salvage
    // worth turning the ship for, and at the zoom this game is played at a
    // piece smaller than the coins beside it reads as sea litter instead.
    const len = 17 + Math.min(p.value, 0.12) * 120
    const half = len / 2
    const thick = 4.2
    const cx = p.pos.x
    const cy = p.pos.y + bob
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    // Perpendicular, to give the plank its thickness.
    const px = -dy * thick
    const py = dx * thick

    if (p.drawn) {
      g.circle(cx, cy, len * 1.1)
        .fill({ color: 0xcfe6f5, alpha: 0.11 * alpha })
    }

    const corners: [number, number][] = [
      [cx - dx * half - px, cy - dy * half - py],
      [cx + dx * half - px, cy + dy * half - py],
      [cx + dx * half + px, cy + dy * half + py],
      [cx - dx * half + px, cy - dy * half + py],
    ]
    g.poly(corners.flat())
      .fill({ color: p.drawn ? 0xfaf0d8 : 0xe8d2a6, alpha })
      .stroke({ width: 1.3, color: 0x5e4423, alpha })
    // A single grain line down the plank: enough to say sawn timber rather
    // than a floating slab, at one more line segment.
    g.moveTo(cx - dx * half * 0.75 + px * 0.2, cy - dy * half * 0.75 + py * 0.2)
      .lineTo(cx + dx * half * 0.75 + px * 0.2, cy + dy * half * 0.75 + py * 0.2)
      .stroke({ width: 0.9, color: 0xa8854f, alpha: 0.8 * alpha })
  }

  clear() { this.g.clear() }
}
