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
  private g = new Graphics()
  private lastKey = ''

  /**
   * A fixed map is cut into pieces that are each drawn once and then only
   * shown when they are on screen: every bar, and every group of islands
   * whose shallows touch. A group is painted layer by layer as one, so
   * overlapping islands still merge; separate groups never overlap, so it
   * does not matter which is painted first.
   *
   * There are four copies of every piece, one for each repeat of the map the
   * screen can straddle at once. The copies share their shapes and differ
   * only in where they are put.
   */
  private readonly tiles: Container[] = []
  private pieces: { x: number; y: number; r: number; views: Graphics[] }[] = []

  constructor() {
    this.view.addChild(this.g)
    for (let i = 0; i < 4; i++) {
      const tile = new Container()
      this.tiles.push(tile)
      this.view.addChild(tile)
    }
  }

  /** Throw away the pieces of the last map and cut up this one. */
  private rebuild(map: { islands: Island[]; reefs: Reef[] }) {
    for (const piece of this.pieces) {
      const context = piece.views[0].context
      for (const view of piece.views) view.destroy()
      context.destroy()
    }
    this.pieces = []
    const main = this.g

    const add = (x: number, y: number, r: number, paint: () => void) => {
      const first = new Graphics()
      this.g = first
      paint()
      const views = [first, new Graphics(first.context), new Graphics(first.context), new Graphics(first.context)]
      views.forEach((view, i) => this.tiles[i].addChild(view))
      this.pieces.push({ x, y, r, views })
    }

    // Bars first, so a fringing reef lies under the island it runs up to.
    for (const reef of map.reefs) {
      add(reef.x, reef.y, Math.max(reef.length, reef.width) * 1.45, () => this.drawReef(reef))
    }

    // Islands whose shallows touch are one piece. Found by spreading out
    // from each island not yet claimed.
    const reach = (i: Island) => i.shoalRadius * 1.12
    const claimed = new Set<Island>()
    for (const start of map.islands) {
      if (claimed.has(start)) continue
      const group: Island[] = [start]
      claimed.add(start)
      for (let n = 0; n < group.length; n++) {
        for (const other of map.islands) {
          if (claimed.has(other)) continue
          if (Math.hypot(other.x - group[n].x, other.y - group[n].y) < reach(other) + reach(group[n])) {
            claimed.add(other)
            group.push(other)
          }
        }
      }
      const x = group.reduce((sum, i) => sum + i.x, 0) / group.length
      const y = group.reduce((sum, i) => sum + i.y, 0) / group.length
      const r = Math.max(...group.map((i) => Math.hypot(i.x - x, i.y - y) + reach(i)))
      add(x, y, r, () => this.drawIslands(group))
    }
    this.g = main
  }

  /** Put the map's repeats under the camera and show only the pieces in sight. */
  private place(size: number, camera: Camera) {
    const fixed = size > 0
    this.g.visible = !fixed
    for (const tile of this.tiles) tile.visible = fixed
    if (!fixed) return

    const tx = Math.round(camera.pos.x / size)
    const ty = Math.round(camera.pos.y / size)
    const sx = camera.pos.x >= tx * size ? 1 : -1
    const sy = camera.pos.y >= ty * size ? 1 : -1
    const at: [number, number][] = [[tx, ty], [tx + sx, ty], [tx, ty + sy], [tx + sx, ty + sy]]
    const halfW = camera.viewW / camera.zoom / 2 + 60
    const halfH = camera.viewH / camera.zoom / 2 + 60
    at.forEach(([x, y], i) => {
      this.tiles[i].position.set(x * size, y * size)
      // The camera, as this repeat of the map sees it.
      const cx = camera.pos.x - x * size
      const cy = camera.pos.y - y * size
      for (const piece of this.pieces) {
        piece.views[i].visible =
          Math.abs(piece.x - cx) < halfW + piece.r && Math.abs(piece.y - cy) < halfH + piece.r
      }
    })
  }

  update(terrain: Terrain, camera: Camera) {
    const map = terrain.map
    if (map) {
      // A fixed map is cut up and drawn once, and left alone until it changes.
      const key = `map${terrain.version}`
      if (key !== this.lastKey) {
        this.lastKey = key
        this.g.clear()
        this.rebuild(map)
      }
      this.place(terrain.size, camera)
      return
    }
    this.place(0, camera)

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
    const each = (paint: (island: Island) => void) => { for (const island of islands) paint(island) }

    // Shoal: lighter water, the visible warning that the bottom is coming up.
    // Drawn as one shape for the whole group, not a ring per island: rings
    // are translucent, so where two overlapped the water showed a lens of a
    // different blue with a hard edge through it.
    this.shoalBand(islands, 1, P().shoal.outer, 0.55)
    this.shoalBand(islands, 0.82, P().shoal.inner, 0.5)

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

    // What stands on the land. Cliffs first, since they are part of the
    // shore; then rocks along the beach; then trees over everything.
    each((i) => this.drawCliffs(i, islands))
    each((i) => this.drawRocks(i))
    each((i) => this.drawTrees(i))
  }

  /**
   * The shallows of a group of islands as a single shape.
   *
   * The shape is where a field goes negative: at each point, how far outside
   * the nearest island's shoal ring it is, with neighbouring rings blended
   * a little so that two which nearly touch run together instead of meeting
   * at a crease. It is found on a grid and filled cell by cell (marching
   * squares). The cells share their edges exactly and never overlap, so
   * however many islands contribute there is one even wash of colour.
   *
   * The blend makes the drawn shallows very slightly wider than the real
   * ones in the neck between two islands. That errs toward caution, and it
   * is a few units at most.
   */
  private shoalBand(islands: Island[], scale: number, color: number, alpha: number) {
    if (islands.length === 0) return
    const CELL = 18
    const BLEND = 46
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const i of islands) {
      const r = i.shoalRadius * 1.12 * scale + BLEND
      minX = Math.min(minX, i.x - r); maxX = Math.max(maxX, i.x + r)
      minY = Math.min(minY, i.y - r); maxY = Math.max(maxY, i.y + r)
    }
    const cols = Math.ceil((maxX - minX) / CELL) + 1
    const rows = Math.ceil((maxY - minY) / CELL) + 1

    // The field at every grid point. Positive is open water.
    const field = new Float32Array((cols + 1) * (rows + 1))
    for (let r = 0; r <= rows; r++) {
      const y = minY + r * CELL
      for (let c = 0; c <= cols; c++) {
        const x = minX + c * CELL
        let f = BLEND * 4
        for (const i of islands) {
          const dx = x - i.x
          const dy = y - i.y
          const d = Math.hypot(dx, dy)
          // Too far for this island to matter here: skip the trigonometry.
          if (d > i.shoalRadius * 1.12 * scale + BLEND) continue
          const here = d - shoalRadius(i, Math.atan2(dy, dx)) * scale
          // A smooth minimum: the nearer ring wins, eased where two are close.
          const h = Math.max(0, Math.min(1, 0.5 + (f - here) / (2 * BLEND)))
          f = f + (here - f) * h - BLEND * h * (1 - h)
        }
        field[r * (cols + 1) + c] = f
      }
    }

    const g = this.g
    const corner: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    for (let r = 0; r < rows; r++) {
      const y = minY + r * CELL
      // Cells wholly inside are joined along the row into one rectangle.
      let runFrom = -1
      const flush = (to: number) => {
        if (runFrom < 0) return
        g.rect(minX + runFrom * CELL, y, (to - runFrom) * CELL, CELL)
        runFrom = -1
      }
      for (let c = 0; c < cols; c++) {
        const v = corner.map(([cx, cy]) => field[(r + cy) * (cols + 1) + c + cx])
        const inside = v.map((f) => f < 0)
        const count = inside.filter(Boolean).length
        if (count === 4) { if (runFrom < 0) runFrom = c; continue }
        flush(c)
        if (count === 0) continue
        // Clip the cell to the shape: keep the corners inside, and add the
        // point on each edge where the field crosses zero.
        const pts: number[] = []
        for (let n = 0; n < 4; n++) {
          const m = (n + 1) % 4
          const ax = minX + (c + corner[n][0]) * CELL
          const ay = y + corner[n][1] * CELL
          if (inside[n]) pts.push(ax, ay)
          if (inside[n] !== inside[m]) {
            const t = v[n] / (v[n] - v[m])
            pts.push(
              ax + (corner[m][0] - corner[n][0]) * CELL * t,
              ay + (corner[m][1] - corner[n][1]) * CELL * t,
            )
          }
        }
        if (pts.length >= 6) g.poly(pts)
      }
      flush(cols)
    }
    g.fill({ color, alpha })
  }

  /**
   * A stretch of cliff on the bigger islands: the beach replaced by a band
   * of rock with a dark foot, round part of the shore. Purely how the shore
   * looks. The land's edge is where it always was, so nothing about where a
   * ship grounds has moved.
   */
  private drawCliffs(island: Island, all: Island[]) {
    if (island.radius < 110) return
    const roll = seeded(island.seed, 1)
    if (roll > 0.6) return
    const g = this.g
    const from = seeded(island.seed, 2) * Math.PI * 2
    const span = 0.7 + seeded(island.seed, 3) * 1.3
    const steps = Math.max(5, Math.round(span * 9))
    const outer: number[] = []
    const inner: number[] = []
    for (let n = 0; n <= steps; n++) {
      const a = from + (n / steps) * span
      const r = landRadius(island, a)
      // Tapered at both ends so the cliff runs out into beach, not a step.
      const depth = 0.15 * Math.sin((n / steps) * Math.PI)
      const ox = island.x + Math.cos(a) * r
      const oy = island.y + Math.sin(a) * r
      // Where another island's land covers this shore there is no shore.
      if (all.some((o) => o !== island && inside(o, ox, oy))) return
      outer.push(ox, oy)
      inner.unshift(island.x + Math.cos(a) * r * (1 - depth), island.y + Math.sin(a) * r * (1 - depth))
    }
    // `inner` was filled from the front, so it already runs back the other way.
    g.poly(outer.concat(inner)).fill({ color: P().flora.rock })
    g.poly(outer, false).stroke({ width: 3.5, color: P().flora.rockDark })
  }

  /** A few boulders along the beach, inside the shoreline so they hide no hazard. */
  private drawRocks(island: Island) {
    const g = this.g
    const count = 1 + Math.floor(seeded(island.seed, 10) * 4) + (island.radius > 150 ? 2 : 0)
    for (let n = 0; n < count; n++) {
      const a = seeded(island.seed, 11 + n * 3) * Math.PI * 2
      const r = landRadius(island, a) * (0.86 + seeded(island.seed, 12 + n * 3) * 0.1)
      const size = 5 + seeded(island.seed, 13 + n * 3) * 8
      const x = island.x + Math.cos(a) * r
      const y = island.y + Math.sin(a) * r
      const turn = seeded(island.seed, 14 + n * 3) * 6
      g.poly(ngon(x + 1.5, y + 2, size, 5, turn)).fill({ color: P().flora.rockDark })
      g.poly(ngon(x, y, size, 5, turn)).fill({ color: P().flora.rock })
    }
  }

  /**
   * Trees inland, of whatever kind the place grows. More on a bigger island,
   * all inside the scrub so they never stand on the beach. Each is a few
   * flat shapes with a hard shadow, the same way everything else is drawn.
   */
  private drawTrees(island: Island) {
    const g = this.g
    const flora = P().flora
    const dense = flora.kind === 'jungle' ? 1.7 : flora.kind === 'cypress' ? 0.7 : 1
    const count = Math.min(46, Math.round((island.radius * island.radius) / 3400 * dense))
    for (let n = 0; n < count; n++) {
      const a = seeded(island.seed, 40 + n * 2) * Math.PI * 2
      const out = Math.sqrt(seeded(island.seed, 41 + n * 2)) * 0.6
      const x = island.x + Math.cos(a) * landRadius(island, a) * out
      const y = island.y + Math.sin(a) * landRadius(island, a) * out
      const size = 0.8 + seeded(island.seed, 42 + n * 2) * 0.5
      const turn = seeded(island.seed, 43 + n * 2) * 6
      if (flora.kind === 'palm') {
        const r = 11 * size
        g.poly(star(x + 3, y + 4, r, r * 0.3, 6, turn)).fill({ color: P().land.scrubDark, alpha: 0.55 })
        g.poly(star(x, y, r, r * 0.3, 6, turn)).fill({ color: flora.tree })
        g.poly(ngon(x, y, r * 0.24, 5, turn)).fill({ color: flora.treeDark })
      } else if (flora.kind === 'jungle') {
        const r = 12 * size
        g.poly(ngon(x + 3, y + 4, r, 8, turn)).fill({ color: flora.treeDark })
        g.poly(ngon(x - r * 0.15, y - r * 0.2, r * 0.82, 8, turn)).fill({ color: flora.tree })
      } else {
        const r = 6.5 * size
        // A cypress is a small dark point with a long shadow.
        g.poly([x + 2, y + 2, x + r * 2.6, y + r * 2.4, x + r * 1.2, y + r * 3]).fill({ color: P().land.scrubDark, alpha: 0.6 })
        g.poly(ngon(x, y, r, 6, turn)).fill({ color: flora.treeDark })
        g.poly(ngon(x - r * 0.2, y - r * 0.25, r * 0.55, 6, turn)).fill({ color: flora.tree })
      }
    }
  }

  clear() {
    this.lastKey = ''
    this.g.clear()
  }
}

/** A stable value in [0,1) from an island's seed and a salt. */
function seeded(seed: number, salt: number): number {
  const x = Math.sin(seed * 9301.7 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Is this point on the island's dry land? */
function inside(island: Island, x: number, y: number): boolean {
  const dx = x - island.x
  const dy = y - island.y
  return Math.hypot(dx, dy) < landRadius(island, Math.atan2(dy, dx))
}

function ngon(x: number, y: number, r: number, sides: number, turn: number): number[] {
  const pts: number[] = []
  for (let n = 0; n < sides; n++) {
    const a = turn + (n / sides) * Math.PI * 2
    // Slightly uneven, so a boulder or a canopy is not a regular polygon.
    const rr = r * (0.82 + 0.18 * Math.sin(n * 2.4 + turn * 3))
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  return pts
}

function star(x: number, y: number, outer: number, inner: number, points: number, turn: number): number[] {
  const pts: number[] = []
  for (let n = 0; n < points * 2; n++) {
    const a = turn + (n / (points * 2)) * Math.PI * 2
    const r = n % 2 === 0 ? outer : inner
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  return pts
}
