import { T } from './tuning'
import type { Vec2 } from '../core/math'

/**
 * Land, generated on demand from a hashed grid rather than stored.
 *
 * The arena is unbounded — the player can sail in one direction forever — so
 * terrain cannot be a fixed list. Instead every grid cell deterministically
 * hashes to "island here or not", which gives infinite, reproducible coastline
 * for no memory and no generation step.
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
    const cell = T.islandCellSize
    const reach = T.islandMaxRadius * 2 + extra
    const minX = Math.floor((p.x - reach) / cell)
    const maxX = Math.floor((p.x + reach) / cell)
    const minY = Math.floor((p.y - reach) / cell)
    const maxY = Math.floor((p.y + reach) / cell)

    const out: Island[] = []
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const island = this.cellIsland(cx, cy)
        if (island) out.push(island)
      }
    }
    return out
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
    const shoal = radius * T.shoalScale

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
   * Signed distance to the nearest dry land: negative means aground.
   * Also reports the shoal depth at that point, 1 = open water, 0 = on the beach.
   */
  probe(p: Vec2): { island: Island | null; distance: number; depth: number } {
    let best: Island | null = null
    let bestDist = Infinity
    let depth = 1

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
        depth = Math.min(depth, Math.max(0, (d - edge) / Math.max(1, shoal - edge)))
      }
    }

    return { island: best, distance: bestDist, depth }
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
}
