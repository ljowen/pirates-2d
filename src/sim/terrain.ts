import { T } from './tuning'
import { smoothstep, type Vec2 } from '../core/math'

/**
 * Land and the water over it, generated on demand from a hashed grid rather
 * than stored.
 *
 * The arena is unbounded — the player can sail in one direction forever — so
 * terrain cannot be a fixed list. Instead every grid cell deterministically
 * hashes to its features, which gives infinite, reproducible coastline for no
 * memory and no generation step.
 *
 * There are two kinds of feature and they do different jobs:
 *
 * - **Islands** are obstacles. They block shot, break the wind, and sink you
 *   if you hit them. Their shoals are a graded approach, so the danger is
 *   announced long before it bites.
 * - **Reefs and bars** are pure draught. Nothing shows above water, nothing
 *   blocks shot, nothing breaks the wind — they simply decide which hulls may
 *   pass. They exist so that drawing little is useful in open water and not
 *   only in the half ship-length beside a beach, which was the whole problem
 *   with draught as a mechanic: the only place it paid was the one place every
 *   hull was in danger anyway.
 */
export interface Island {
  x: number
  y: number
  /** Mean radius of dry land. The actual edge is irregular — see `landRadius`. */
  radius: number
  /** Outer radius of the shoal ring, where deep hulls ground but shallow ones pass. */
  shoalRadius: number
  /** Stable per-island value driving its silhouette. */
  seed: number
}

/**
 * A reef or sandbar: a shoal patch with no dry land in it at all.
 *
 * Elongated on purpose. A circular hazard is just a thing to steer round; a
 * bar lying across your course is a question — go about and lose the ground,
 * or cross it and find out what you draw.
 */
export interface Reef {
  x: number
  y: number
  /** Half-length along the bar, and half-width across it. */
  length: number
  width: number
  /** Orientation of the long axis, radians. */
  angle: number
  /** Least depth over it: 0 dries at low water, 1 is no obstruction at all. */
  least: number
  seed: number
  /**
   * How much of the bar is flat-topped, 0 to 1. Unset, the bottom rises
   * smoothly from the edge to the middle, which suits a lone sandbar. A
   * barrier reef wants a plateau: the same least depth most of the way out,
   * so that bars laid end to end make a wall with no soft joints in it.
   */
  flat?: number
}

/** One value in [0,1) per (cell, salt). Deterministic and cheap. */
function hashCell(cx: number, cy: number, salt: number): number {
  let h = Math.imul(cx | 0, 374761393) ^ Math.imul(cy | 0, 668265263) ^ Math.imul(salt | 0, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * The irregular edge of an island at a given bearing. Collision and rendering
 * both call this, so what you see is exactly what you hit — a circle for
 * physics and a blob for the eye would be a bug waiting to happen.
 */
export function landRadius(island: Island, angle: number): number {
  const s = island.seed * 6.283
  return island.radius * (
    1 +
    0.15 * Math.sin(angle * 3 + s) +
    0.09 * Math.sin(angle * 5 - s * 1.7) +
    0.05 * Math.sin(angle * 7 + s * 2.3)
  )
}

export function shoalRadius(island: Island, angle: number): number {
  return island.shoalRadius * (1 + 0.1 * Math.sin(angle * 3 + island.seed * 4.1))
}

/**
 * How far out on a bar a point lies: 0 over the shallowest part, 1 at the edge
 * where it meets deep water, more than 1 clear of it.
 *
 * The same function the renderer draws from, for the same reason `landRadius`
 * is shared — a bar you can see and a bar you hit must be one object.
 */
export function reefField(reef: Reef, p: Vec2): number {
  const c = Math.cos(reef.angle)
  const s = Math.sin(reef.angle)
  const dx = p.x - reef.x
  const dy = p.y - reef.y
  const u = (dx * c + dy * s) / reef.length
  const v = (-dx * s + dy * c) / reef.width
  const q = Math.hypot(u, v)
  if (q === 0) return 0
  // An irregular edge, from the same sort of harmonic sum as the shoreline.
  const t = Math.atan2(v, u)
  const wobble =
    1 + 0.2 * Math.sin(t * 3 + reef.seed * 6.283) + 0.09 * Math.sin(t * 5 - reef.seed * 4.1)
  return q / wobble
}

/** Depth over a bar at a point: `least` over the middle, 1 in open water. */
export function reefDepth(reef: Reef, p: Vec2): number {
  const q = reefField(reef, p)
  if (q >= 1) return 1
  return reef.least + (1 - reef.least) * smoothstep(reef.flat ?? 0, 1, q)
}

/** Unit vector from a point on a bar toward open water, by the shortest way off. */
function reefEscape(reef: Reef, p: Vec2): Vec2 {
  const c = Math.cos(reef.angle)
  const s = Math.sin(reef.angle)
  const dx = p.x - reef.x
  const dy = p.y - reef.y
  const u = (dx * c + dy * s) / reef.length
  const v = (-dx * s + dy * c) / reef.width
  // Dead centre: the shortest way off a bar is across it, not along it.
  if (u === 0 && v === 0) return { x: -s, y: c }
  // Outward in the ellipse's own frame, mapped back to the world. Dividing by
  // the semi-axes again is what makes a long thin bar push you across its
  // width rather than down its length.
  const ex = (u / reef.length) * c + (v / reef.width) * -s
  const ey = (u / reef.length) * s + (v / reef.width) * c
  const len = Math.hypot(ex, ey) || 1
  return { x: ex / len, y: ey / len }
}

/** How much water a hull of this draught needs under her to float clear. */
export function draughtDepth(draught: number): number {
  return T.draughtDepth * draught
}

export interface Probe {
  /** Nearest island, if any is in reach. Null over open water or a bare reef. */
  island: Island | null
  /** Signed distance to the nearest dry land; negative means inland. */
  distance: number
  /** Water under the keel: 1 open sea, 0 on the beach or on a drying bank. */
  depth: number
  /** Unit vector toward deeper water, from whatever is shoaling here. */
  escape: Vec2 | null
}

/** A fixed map: every island and bar of one location, listed. */
export interface TerrainMap {
  islands: Island[]
  reefs: Reef[]
}

const NO_ISLANDS: Island[] = []
const NO_REEFS: Reef[] = []
/** Side of one bucket of the index, in world units. */
const BUCKET = 700
/** The furthest an island reaches, in radii: its lee, at the top of the tuning slider. */
const LEE_REACH = 6

/**
 * A fixed map, sorted into a grid of buckets once when it is loaded.
 *
 * Each bucket lists everything that can affect a point inside it, so asking
 * what is under a keel is one array lookup and a walk over the two or three
 * features that could matter. The endless sea has to hash a block of cells to
 * answer the same question, every time it is asked.
 */
class MapIndex {
  private readonly minX: number
  private readonly minY: number
  private readonly cols: number
  private readonly rows: number
  private readonly islands: Island[][]
  private readonly reefs: Reef[][]

  constructor(readonly map: TerrainMap, size: number) {
    let minX = 0, minY = 0, maxX = 0, maxY = 0
    if (size > 0) {
      // A wrapping map is exactly one tile, and anything that reaches over an
      // edge is listed again on the far side, shifted by a tile, so a point
      // near the edge finds it without knowing the map wraps.
      minX = minY = -size / 2
      maxX = maxY = size / 2
    } else {
      const grow = (x: number, y: number, r: number) => {
        minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r)
        minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r)
      }
      for (const i of map.islands) grow(i.x, i.y, MapIndex.islandReach(i))
      for (const r of map.reefs) grow(r.x, r.y, MapIndex.reefReach(r))
    }
    this.minX = minX
    this.minY = minY
    this.cols = Math.max(1, Math.ceil((maxX - minX) / BUCKET))
    this.rows = Math.max(1, Math.ceil((maxY - minY) / BUCKET))
    this.islands = Array.from({ length: this.cols * this.rows }, () => [])
    this.reefs = Array.from({ length: this.cols * this.rows }, () => [])
    const shifts = size > 0 ? [-size, 0, size] : [0]
    for (const ox of shifts) {
      for (const oy of shifts) {
        const here = ox === 0 && oy === 0
        for (const i of map.islands) {
          const reach = MapIndex.islandReach(i)
          if (!this.touches(i.x + ox, i.y + oy, reach, maxX, maxY)) continue
          this.insert(this.islands, here ? i : { ...i, x: i.x + ox, y: i.y + oy }, i.x + ox, i.y + oy, reach)
        }
        for (const r of map.reefs) {
          const reach = MapIndex.reefReach(r)
          if (!this.touches(r.x + ox, r.y + oy, reach, maxX, maxY)) continue
          this.insert(this.reefs, here ? r : { ...r, x: r.x + ox, y: r.y + oy }, r.x + ox, r.y + oy, reach)
        }
      }
    }
  }

  private touches(x: number, y: number, reach: number, maxX: number, maxY: number): boolean {
    return x + reach >= this.minX && x - reach <= maxX && y + reach >= this.minY && y - reach <= maxY
  }

  private static islandReach(i: Island): number {
    return Math.max(i.shoalRadius * 1.12, i.radius * LEE_REACH)
  }

  private static reefReach(r: Reef): number {
    // The edge wobbles out to about 1.3 of the nominal ellipse.
    return Math.max(r.length, r.width) * 1.35
  }

  private insert<F>(into: F[][], feature: F, x: number, y: number, reach: number) {
    const x0 = Math.max(0, Math.floor((x - reach - this.minX) / BUCKET))
    const x1 = Math.min(this.cols - 1, Math.floor((x + reach - this.minX) / BUCKET))
    const y0 = Math.max(0, Math.floor((y - reach - this.minY) / BUCKET))
    const y1 = Math.min(this.rows - 1, Math.floor((y + reach - this.minY) / BUCKET))
    for (let by = y0; by <= y1; by++) {
      for (let bx = x0; bx <= x1; bx++) into[by * this.cols + bx].push(feature)
    }
  }

  private bucket(p: Vec2): number {
    const bx = Math.floor((p.x - this.minX) / BUCKET)
    const by = Math.floor((p.y - this.minY) / BUCKET)
    if (bx < 0 || by < 0 || bx >= this.cols || by >= this.rows) return -1
    return by * this.cols + bx
  }

  islandsAt(p: Vec2): Island[] {
    const b = this.bucket(p)
    return b < 0 ? NO_ISLANDS : this.islands[b]
  }

  reefsAt(p: Vec2): Reef[] {
    const b = this.bucket(p)
    return b < 0 ? NO_REEFS : this.reefs[b]
  }
}

export class Terrain {
  constructor(private worldSeed = 0x5eed) {}

  private index: MapIndex | null = null
  /** Changes whenever the land does, so a view knows to redraw. */
  version = 0

  /**
   * Use a fixed map, or pass null to go back to the endless hashed sea.
   * Everything else on this class answers the same questions either way.
   */
  load(map: TerrainMap | null, size = 0) {
    this.index = map ? new MapIndex(map, size) : null
    this.size = map ? size : 0
    this.version++
  }

  /**
   * Side of the tile a fixed map repeats on, or 0 if it does not. The map
   * wraps by repeating: positions are never folded, so nothing in the sim
   * ever sees a seam, and sailing off one edge simply brings the same land
   * round again from the other.
   */
  size = 0

  /** A point brought into the map's own tile. The point itself where nothing wraps. */
  local(p: Vec2): Vec2 {
    const s = this.size
    if (s <= 0) return p
    return { x: p.x - s * Math.round(p.x / s), y: p.y - s * Math.round(p.y / s) }
  }

  /** The fixed map in use, if there is one. */
  get map(): TerrainMap | null { return this.index?.map ?? null }

  /**
   * Lay out a fresh archipelago. Terrain is a pure function of this seed, so
   * nothing needs regenerating — the whole map changes at once.
   */
  reseed(seed: number) {
    this.worldSeed = seed >>> 0
    if (!this.index) this.version++
  }

  /** Islands whose influence could reach a point, cheaply. */
  near(p: Vec2, extra = 0): Island[] {
    if (this.index) {
      // The quick lookup answers in the map's own tile: pass it `local(p)`
      // and measure from that, as `probe` and the wind's lee do.
      if (extra <= 0) return this.index.islandsAt(p)
      // A wider look is rare (a pilot choosing a refuge), and a fixed map is
      // short enough to walk. These come back where the asker is, whichever
      // repeat of the map that happens to be.
      const out: Island[] = []
      const s = this.size
      for (const i of this.index.map.islands) {
        let dx = i.x - p.x
        let dy = i.y - p.y
        if (s > 0) { dx -= s * Math.round(dx / s); dy -= s * Math.round(dy / s) }
        if (Math.hypot(dx, dy) > extra + Math.max(i.shoalRadius, i.radius * LEE_REACH)) continue
        out.push(s > 0 ? { ...i, x: p.x + dx, y: p.y + dy } : i)
      }
      return out
    }
    const reach = T.islandMaxRadius * 2 * T.shoalScale + extra
    const out: Island[] = []
    this.forCells(p, reach, (cx, cy) => {
      const island = this.cellIsland(cx, cy)
      if (island) out.push(island)
    })
    return out
  }

  /** Bars whose influence could reach a point. */
  reefsNear(p: Vec2, extra = 0): Reef[] {
    if (this.index) {
      if (extra <= 0) return this.index.reefsAt(p)
      const out: Reef[] = []
      const s = this.size
      for (const r of this.index.map.reefs) {
        let dx = r.x - p.x
        let dy = r.y - p.y
        if (s > 0) { dx -= s * Math.round(dx / s); dy -= s * Math.round(dy / s) }
        if (Math.hypot(dx, dy) > extra + Math.max(r.length, r.width) * 1.35) continue
        out.push(s > 0 ? { ...r, x: p.x + dx, y: p.y + dy } : r)
      }
      return out
    }
    const out: Reef[] = []
    this.forCells(p, this.reefReach() + extra, (cx, cy) => {
      const reef = this.cellReef(cx, cy)
      if (reef) out.push(reef)
    })
    return out
  }

  private reefReach(): number {
    return 520 * T.reefSize
  }

  private forCells(p: Vec2, reach: number, visit: (cx: number, cy: number) => void) {
    const cell = T.islandCellSize
    const minX = Math.floor((p.x - reach) / cell)
    const maxX = Math.floor((p.x + reach) / cell)
    const minY = Math.floor((p.y - reach) / cell)
    const maxY = Math.floor((p.y + reach) / cell)
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) visit(cx, cy)
    }
  }

  /**
   * How crowded this part of the sea is, varying slowly across a coarse grid
   * so the map has archipelagos and open stretches rather than a uniform
   * sprinkle. Without it the underlying lattice is plainly visible.
   */
  private regionDensity(cx: number, cy: number): number {
    const coarse = 4
    const rx = Math.floor(cx / coarse)
    const ry = Math.floor(cy / coarse)
    // Average the four nearest region cells so density drifts instead of
    // stepping at region boundaries.
    const a = hashCell(rx, ry, this.worldSeed + 11)
    const b = hashCell(rx + 1, ry, this.worldSeed + 11)
    const c = hashCell(rx, ry + 1, this.worldSeed + 11)
    const d = hashCell(rx + 1, ry + 1, this.worldSeed + 11)
    const fx = cx / coarse - rx
    const fy = cy / coarse - ry
    const top = a + (b - a) * fx
    const bottom = c + (d - c) * fx
    return 0.25 + 1.75 * (top + (bottom - top) * fy)
  }

  /** The island occupying this cell, if any. Pure function of the cell. */
  cellIsland(cx: number, cy: number): Island | null {
    const chance = T.islandDensity * this.regionDensity(cx, cy)
    if (hashCell(cx, cy, this.worldSeed) > chance) return null

    const cell = T.islandCellSize
    const jx = hashCell(cx, cy, this.worldSeed + 1)
    const jy = hashCell(cx, cy, this.worldSeed + 2)
    const sizeRoll = hashCell(cx, cy, this.worldSeed + 3)

    // Squared so small islets outnumber large islands, as a real chain does.
    const radius = T.islandMinRadius +
      sizeRoll * sizeRoll * (T.islandMaxRadius - T.islandMinRadius)
    // How far her shoals run out varies island by island. A steep-to rock is
    // a poor refuge; one standing in a mile of flats is a fortress a heavy
    // hull cannot come at. Uniform shoals made every island the same island.
    const flats = hashCell(cx, cy, this.worldSeed + 5)
    const shoal = radius * T.shoalScale * (1 - T.shoalVariation / 2 + T.shoalVariation * flats)

    // Inset by this island's own reach rather than the largest possible one.
    // Insetting by the global maximum pinned every island near its cell centre
    // and made the lattice obvious; this lets islets roam their whole cell
    // while still guaranteeing land never crosses a cell boundary.
    const inset = Math.min(shoal, cell * 0.45)
    const span = Math.max(0, cell - inset * 2)

    return {
      x: cx * cell + inset + jx * span,
      y: cy * cell + inset + jy * span,
      radius,
      shoalRadius: shoal,
      seed: hashCell(cx, cy, this.worldSeed + 4),
    }
  }

  /**
   * The bar occupying this cell, if any. Independent of the island layer, so
   * open stretches of sea get hazards of their own rather than every danger
   * being an announcement of land.
   */
  cellReef(cx: number, cy: number): Reef | null {
    const chance = T.reefDensity * this.regionDensity(cx, cy)
    if (hashCell(cx, cy, this.worldSeed + 21) > chance) return null

    const cell = T.islandCellSize
    const jx = hashCell(cx, cy, this.worldSeed + 22)
    const jy = hashCell(cx, cy, this.worldSeed + 23)
    const sizeRoll = hashCell(cx, cy, this.worldSeed + 24)
    const shapeRoll = hashCell(cx, cy, this.worldSeed + 25)
    const depthRoll = hashCell(cx, cy, this.worldSeed + 26)
    const angleRoll = hashCell(cx, cy, this.worldSeed + 27)

    const length = (150 + sizeRoll * sizeRoll * 330) * T.reefSize
    // Never close to round: a bar has to be long enough that going about and
    // going round are genuinely different answers.
    const width = length * (0.16 + shapeRoll * 0.2)
    // Squared so most bars are shallow enough to matter to something, with the
    // truly drying banks rare. The spread is the point: one bar stops a
    // Galleon, the next stops everything but a Pinnace.
    const least = 0.03 + depthRoll * depthRoll * 0.36

    const reach = Math.max(length, width)
    const inset = Math.min(reach, cell * 0.45)
    const span = Math.max(0, cell - inset * 2)
    let x = cx * cell + inset + jx * span
    let y = cy * cell + inset + jy * span

    // Keep a bar off its own cell's island, so it reads as an outlying danger
    // rather than a smear over the beach. Bars from neighbouring cells may
    // still run up to a shore, which is exactly what a fringing reef does.
    const island = this.cellIsland(cx, cy)
    if (island) {
      const dx = x - island.x
      const dy = y - island.y
      const d = Math.hypot(dx, dy) || 1
      const clear = island.shoalRadius + reach * 0.75
      if (d < clear) {
        x = island.x + (dx / d) * clear
        y = island.y + (dy / d) * clear
      }
    }

    return {
      x, y, length, width,
      angle: angleRoll * Math.PI,
      least,
      seed: hashCell(cx, cy, this.worldSeed + 28),
    }
  }

  /**
   * Signed distance to the nearest dry land, the depth of water here, and
   * which way deeper water lies.
   */
  probe(at: Vec2): Probe {
    // Worked out in the map's own tile, then handed back where it was asked.
    const p = this.local(at)
    let best: Island | null = null
    let bestDist = Infinity
    let depth = 1
    let escape: Vec2 | null = null

    for (const island of this.near(p)) {
      const dx = p.x - island.x
      const dy = p.y - island.y
      const d = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      const edge = landRadius(island, angle)
      const dist = d - edge
      if (dist < bestDist) {
        bestDist = dist
        best = island
      }
      const shoal = shoalRadius(island, angle)
      if (d < shoal) {
        // Linear ramp from open water at the shoal edge to nothing at the beach.
        const here = Math.max(0, (d - edge) / Math.max(1, shoal - edge))
        if (here < depth) {
          depth = here
          const len = d || 1
          escape = { x: dx / len, y: dy / len }
        }
      }
    }

    for (const reef of this.reefsNear(p)) {
      const here = reefDepth(reef, p)
      if (here < depth) {
        depth = here
        escape = reefEscape(reef, p)
      }
    }

    if (best && (p.x !== at.x || p.y !== at.y)) best = { ...best, x: best.x + at.x - p.x, y: best.y + at.y - p.y }
    return { island: best, distance: bestDist, depth, escape }
  }

  /** Is there dry land on the segment from a to b? Used for spawn placement. */
  blocked(a: Vec2, b: Vec2, samples = 8): boolean {
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (this.probe(p).distance < 0) return true
    }
    return false
  }

  /**
   * Can a hull drawing this much get from here to open water?
   *
   * Cast a fan of courses and ask whether any of them runs clear. This exists
   * because the two new things on this page — broad shoals and bars across
   * open water — between them can enclose a pool of deep water that a given
   * hull cannot get out of. Fine as a hiding place you chose; unacceptable as
   * the place the run begins, which is the one position the player never
   * picked. See `World.placePlayerClearOfLand`.
   */
  escapes(from: Vec2, needs: number, range = 1500, courses = 16): number {
    let open = 0
    for (let i = 0; i < courses; i++) {
      const a = (i / courses) * Math.PI * 2
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      let clear = true
      for (let d = 80; d <= range; d += 80) {
        const probe = this.probe({ x: from.x + dx * d, y: from.y + dy * d })
        if (probe.depth > needs) continue
        clear = false
        break
      }
      if (clear) open++
    }
    return open
  }
}
