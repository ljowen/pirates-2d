import { T } from './tuning'
import type { Terrain, Island } from './terrain'
import { landRadius } from './terrain'
import type { Vec2 } from '../core/math'

/**
 * A harbour you can careen, refit and repair in.
 *
 * Shipyards are what finally give the map a reason to exist. Terrain used to
 * be only an obstacle and a hiding place; now a yard upwind with a Galleon
 * between you and it is a genuine decision, and the wind and draught systems
 * do the work of making that decision hard.
 *
 * Stock is limited and does not replenish, so a yard is somewhere you visit
 * rather than somewhere you farm.
 */
export interface Shipyard {
  /** The island she is built on. */
  island: Island
  /** Mouth of the harbour, out in navigable water. */
  pos: Vec2
  /** Part ids still on the shelf here. */
  stock: string[]
  visited: boolean
}

/** Harbours are a deterministic property of an island, like its shape. */
export function harbourAt(island: Island): Vec2 {
  // Tucked into a bay on one side, chosen from the island's own seed.
  //
  // Placed a fixed distance clear of the shore rather than a multiple of the
  // island's size: a proportional offset left the mouths of small islands
  // inside the depth at which a laden ship touches bottom, so putting in
  // meant running aground.
  const bearing = island.seed * Math.PI * 2
  const reach = landRadius(island, bearing) + HARBOUR_CLEARANCE
  return { x: island.x + Math.cos(bearing) * reach, y: island.y + Math.sin(bearing) * reach }
}

/** Water between the shore and the harbour mouth. Must clear the deepest keel. */
const HARBOUR_CLEARANCE = 62

/** Does this island carry a yard? A stable fraction of them do. */
export function islandHasYard(island: Island): boolean {
  // Bigger islands are likelier to support a harbour, and the seed decides
  // the rest, so the same archipelago always has the same ports.
  const size = Math.min(1, (island.radius - T.islandMinRadius) /
    Math.max(1, T.islandMaxRadius - T.islandMinRadius))
  return island.seed < T.harbourChance * (0.45 + 0.9 * size)
}

/** Yards near a point, built on demand from the terrain. */
export function shipyardsNear(terrain: Terrain, p: Vec2, reach = 2600): Island[] {
  return terrain.near(p, reach).filter(islandHasYard)
}

/** The nearest yard the ship could make for, with its distance. */
export function nearestShipyard(
  terrain: Terrain,
  p: Vec2,
  reach = 6000,
): { island: Island; pos: Vec2; distance: number } | null {
  let best: { island: Island; pos: Vec2; distance: number } | null = null
  for (const island of shipyardsNear(terrain, p, reach)) {
    const pos = harbourAt(island)
    const distance = Math.hypot(pos.x - p.x, pos.y - p.y)
    if (!best || distance < best.distance) best = { island, pos, distance }
  }
  return best
}
