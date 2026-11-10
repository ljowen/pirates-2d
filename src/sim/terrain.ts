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
  return reef.least + (1 - reef.least) * smoothstep(0, 1, q)
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

export class Terrain {
  constructor(private worldSeed = 0x5eed) {}

  /**
   * Lay out a fresh archipelago. Terrain is a pure function of this seed, so
   * nothing needs regenerating — the whole map changes at once.
   */
  reseed(seed: number) {
    this.worldSeed = seed >>> 0
  }

  /** Islands whose influence could reach a point, cheaply. */
  near(p: Vec2, extra = 0): Island[] {
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
  probe(p: Vec2): Probe {
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
