import { Container, Graphics } from 'pixi.js'
import { Terrain, landRadius, shoalRadius, type Island } from '../sim/terrain'
import type { Camera } from './camera'

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

    const key = visible.map((i) => `${i.x.toFixed(0)},${i.y.toFixed(0)}`).join('|')
    if (key === this.lastKey) return
    this.lastKey = key

    this.g.clear()
    for (const island of visible) this.draw(island)
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
    g.poly(this.ring(island, shoal)).fill({ color: 0x79c3dd, alpha: 0.55 })
    g.poly(this.ring(island, shoal, 0.82)).fill({ color: 0x9ad8e8, alpha: 0.5 })

    // Surf breaking on the shore.
    g.poly(this.ring(island, land, 1.16)).fill({ color: 0xeaf7fb, alpha: 0.55 })
    g.poly(this.ring(island, land, 1.07)).fill({ color: 0xfdfefe, alpha: 0.75 })

    // Beach, then scrub, then a little relief inland so it reads as solid.
    g.poly(this.ring(island, land)).fill({ color: 0xe8d9a8 })
    g.poly(this.ring(island, land, 0.86)).fill({ color: 0xbfae79 })
    g.poly(this.ring(island, land, 0.68)).fill({ color: 0x6f8a52 })
    g.poly(this.ring(island, land, 0.4)).fill({ color: 0x55703f })
    g.poly(this.ring(island, land, 0.18)).fill({ color: 0x6b7d58 })

    g.poly(this.ring(island, land)).stroke({ width: 2, color: 0xc9b584, alpha: 0.9 })
  }

  clear() {
    this.lastKey = ''
    this.g.clear()
  }
}
