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

  /**
   * Three more views of the same drawing, for a map that wraps. The screen
   * can straddle an edge in both directions at once, so up to four repeats
   * of the map are in sight; they share one set of shapes and differ only in
   * where they are put.
   */
  private readonly repeats: Graphics[] = []

  constructor() {
    this.view.addChild(this.g)
    for (let i = 0; i < 3; i++) {
      const copy = new Graphics(this.g.context)
      copy.visible = false
      this.repeats.push(copy)
      this.view.addChild(copy)
    }
  }

  /** Put the map's repeats under the camera: the tile it is over and the three nearest. */
  private place(size: number, camera: Camera) {
    if (size <= 0) {
      this.g.position.set(0, 0)
      for (const copy of this.repeats) copy.visible = false
      return
    }
    const tx = Math.round(camera.pos.x / size)
    const ty = Math.round(camera.pos.y / size)
    const sx = camera.pos.x >= tx * size ? 1 : -1
    const sy = camera.pos.y >= ty * size ? 1 : -1
    this.g.position.set(tx * size, ty * size)
    const others: [number, number][] = [[tx + sx, ty], [tx, ty + sy], [tx + sx, ty + sy]]
    others.forEach(([x, y], i) => {
      this.repeats[i].visible = true
      this.repeats[i].position.set(x * size, y * size)
    })
  }

  update(terrain: Terrain, camera: Camera) {
    this.place(terrain.size, camera)
    let visible: Island[]
    let reefs: Reef[]
    let key: string
    const map = terrain.map
    if (map) {
      // A fixed map is drawn once, whole, and left alone until it changes.
      key = `map${terrain.version}`
      if (key === this.lastKey) return
      visible = map.islands
      reefs = map.reefs
    } else {
      // Generous margin so islands are built before they scroll into view.
      const reach = Math.max(camera.viewW, camera.viewH) / camera.zoom
      visible = terrain.near(camera.pos, reach)
      reefs = terrain.reefsNear(camera.pos, reach)
      key = [
        ...visible.map((i) => `${i.x.toFixed(0)},${i.y.toFixed(0)}`),
        ...reefs.map((r) => `r${r.x.toFixed(0)},${r.y.toFixed(0)}`),
      ].join('|')
      if (key === this.lastKey) return
    }
    this.lastKey = key

    this.g.clear()
    // Bars first, so a fringing reef runs under the island it belongs to
    // rather than being painted over its beach.
    for (const reef of reefs) this.drawReef(reef)
    this.drawIslands(visible)
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

    // A flat-topped bar is shallowest all the way out to its plateau's edge,
    // so its palest contour is drawn there and the others crowd outside it.
    const top = reef.flat ?? 0.24
    const at = (k: number) => 1 - (1 - top) * (k / 3)
    const bands: [number, number, number][] = [
      [at(0), P().reef[0], 0.3 + 0.16 * shallow],
      [at(1), P().reef[1], 0.32 + 0.2 * shallow],
      [at(2), P().reef[2], 0.28 + 0.32 * shallow],
      [at(3), P().reef[3], 0.18 + 0.42 * shallow],
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

  /**
   * Every island, one layer at a time: all the shallows, then all the surf,
   * then all the beaches, and so on inland.
   *
   * Islands may overlap now, which is how a hook of land or a long shore is
   * made. Painted one whole island after another, each one's shallows would
   * lie across its neighbour's beach. Painted by layer, overlapping islands
   * simply merge, and the contours run round the lot as one piece of land.
   */
  private drawIslands(islands: Island[]) {
    const g = this.g
    const land = (island: Island) => (a: number) => landRadius(island, a)
    const shoal = (island: Island) => (a: number) => shoalRadius(island, a)
    const each = (paint: (island: Island) => void) => { for (const island of islands) paint(island) }

    // Shoal: lighter water, the visible warning that the bottom is coming up.
    each((i) => g.poly(this.ring(i, shoal(i))).fill({ color: P().shoal.outer, alpha: 0.55 }))
    each((i) => g.poly(this.ring(i, shoal(i), 0.82)).fill({ color: P().shoal.inner, alpha: 0.5 }))

    // Surf breaking on the shore.
    each((i) => g.poly(this.ring(i, land(i), 1.16)).fill({ color: P().shoal.surfOuter, alpha: 0.55 }))
    each((i) => g.poly(this.ring(i, land(i), 1.07)).fill({ color: P().shoal.surfInner, alpha: 0.75 }))

    // The shoreline, before the land that covers its inner half: where two
    // islands overlap, each one's beach paints out the other's line.
    each((i) => g.poly(this.ring(i, land(i))).stroke({ width: 4, color: P().land.edge, alpha: 0.9 }))

    // Beach, then scrub, then a little relief inland so it reads as solid.
    each((i) => g.poly(this.ring(i, land(i))).fill({ color: P().land.beach }))
    each((i) => g.poly(this.ring(i, land(i), 0.86)).fill({ color: P().land.sand }))
    each((i) => g.poly(this.ring(i, land(i), 0.68)).fill({ color: P().land.scrub }))
    each((i) => g.poly(this.ring(i, land(i), 0.4)).fill({ color: P().land.scrubDark }))
    each((i) => g.poly(this.ring(i, land(i), 0.18)).fill({ color: P().land.inland }))
  }

  clear() {
    this.lastKey = ''
    this.g.clear()
  }
}
