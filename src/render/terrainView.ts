import { Container, Graphics } from 'pixi.js'
import { Terrain, landRadius, shoalRadius, reefField, type Island, type Reef } from '../sim/terrain'
import type { Camera } from './camera'
import { P } from './palette'

const SEGMENTS = 54

/**
 * Islands, drawn from the same edge function the physics uses — a circle for
 * collision and a blob for the eye would be a bug waiting to happen.
 *
 * Only islands near the camera are built, and the geometry is rebuilt only
 * when the visible set changes, so sailing across open water costs nothing.
 */
export class TerrainView {
  readonly view = new Container()
  private readonly g = new Graphics()
  private lastKey = ''

  constructor() {
    this.view.addChild(this.g)
  }

  update(terrain: Terrain, camera: Camera) {
    // Generous margin so islands are built before they scroll into view.
    const reach = Math.max(camera.viewW, camera.viewH) / camera.zoom
    const visible = terrain.near(camera.pos, reach)
    const reefs = terrain.reefsNear(camera.pos, reach)

    const key = [
      ...visible.map((i) => `${i.x.toFixed(0)},${i.y.toFixed(0)}`),
      ...reefs.map((r) => `r${r.x.toFixed(0)},${r.y.toFixed(0)}`),
    ].join('|')
    if (key === this.lastKey) return
    this.lastKey = key

    this.g.clear()
    // Bars first, so a fringing reef runs under the island it belongs to
    // rather than being painted over its beach.
    for (const reef of reefs) this.drawReef(reef)
    for (const island of visible) this.draw(island)
  }

  /**
   * A bar: pale water, and nothing above it.
   *
   * Drawn from `reefField`, the same function the physics reads, so what the
   * player steers around is exactly what they would have touched. **How pale
   * it is, is how shallow it is** — the one thing they need to judge at a
   * glance is whether their own hull can cross, so the least depth is carried
   * by the colour rather than discovered by grounding on it.
   *
   * Four contours rather than three, and the innermost near-white on the
   * worst bars. An earlier version scattered white blobs along the spine as
   * breakers; at the zoom this game is played at they read as objects sitting
   * on the water rather than as sea breaking over a shoal, so the shading
   * carries the whole job now.
   */
  private drawReef(reef: Reef) {
    const g = this.g
    const shallow = 1 - reef.least / 0.4

    const bands: [number, number, number][] = [
      [1.0, P().reef[0], 0.3 + 0.16 * shallow],
      [0.74, P().reef[1], 0.32 + 0.2 * shallow],
      [0.48, P().reef[2], 0.28 + 0.32 * shallow],
      [0.24, P().reef[3], 0.18 + 0.42 * shallow],
    ]
    for (const [at, color, alpha] of bands) {
      g.poly(this.reefRing(reef, at)).fill({ color, alpha })
    }
  }

  /** A contour of the bar at a given fraction of its extent. */
  private reefRing(reef: Reef, at: number): number[] {
    const pts: number[] = []
    const c = Math.cos(reef.angle)
    const s = Math.sin(reef.angle)
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2
      // Walk out along this bearing until the shared field function says we
      // have reached the contour, rather than guessing an ellipse that would
      // disagree with the physics at the wobbly edges.
      const u = Math.cos(a)
      const v = Math.sin(a)
      let lo = 0
      let hi = 1.6
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2
        const px = reef.x + (u * mid * reef.length) * c - (v * mid * reef.width) * s
        const py = reef.y + (u * mid * reef.length) * s + (v * mid * reef.width) * c
        if (reefField(reef, { x: px, y: py }) < at) lo = mid
        else hi = mid
      }
      const m = (lo + hi) / 2
      pts.push(
        reef.x + (u * m * reef.length) * c - (v * m * reef.width) * s,
        reef.y + (u * m * reef.length) * s + (v * m * reef.width) * c,
      )
    }
    return pts
  }

  private ring(island: Island, radiusAt: (a: number) => number, inflate = 1): number[] {
    const pts: number[] = []
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2
      const r = radiusAt(a) * inflate
      pts.push(island.x + Math.cos(a) * r, island.y + Math.sin(a) * r)
    }
    return pts
  }

  private draw(island: Island) {
    const g = this.g
    const land = (a: number) => landRadius(island, a)
    const shoal = (a: number) => shoalRadius(island, a)

    // Shoal: lighter water, the visible warning that the bottom is coming up.
    g.poly(this.ring(island, shoal)).fill({ color: P().shoal.outer, alpha: 0.55 })
    g.poly(this.ring(island, shoal, 0.82)).fill({ color: P().shoal.inner, alpha: 0.5 })

    // Surf breaking on the shore.
    g.poly(this.ring(island, land, 1.16)).fill({ color: P().shoal.surfOuter, alpha: 0.55 })
    g.poly(this.ring(island, land, 1.07)).fill({ color: P().shoal.surfInner, alpha: 0.75 })

    // Beach, then scrub, then a little relief inland so it reads as solid.
    g.poly(this.ring(island, land)).fill({ color: P().land.beach })
    g.poly(this.ring(island, land, 0.86)).fill({ color: P().land.sand })
    g.poly(this.ring(island, land, 0.68)).fill({ color: P().land.scrub })
    g.poly(this.ring(island, land, 0.4)).fill({ color: P().land.scrubDark })
    g.poly(this.ring(island, land, 0.18)).fill({ color: P().land.inland })

    g.poly(this.ring(island, land)).stroke({ width: 2, color: P().land.edge, alpha: 0.9 })
  }

  clear() {
    this.lastKey = ''
    this.g.clear()
  }
}
