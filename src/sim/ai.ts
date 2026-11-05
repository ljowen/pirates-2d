import { T } from './tuning'
import type { Ship } from './ship'
import type { WindSample } from './wind'
import { angleDiff, clamp, wrapAngle } from '../core/math'
import { landRadius, type Island, type Terrain } from './terrain'

/**
 * An enemy captain, bound by exactly the same wind the player is. This is the
 * point: an AI that could sail straight upwind would turn the wind into a
 * handicap the player alone pays. Because these captains have to tack too, the
 * wind reads as a law of the world, and running upwind becomes a real escape.
 */
export class CaptainAI {
  /** Which side of the wind we are currently clawing up on: -1 or +1. */
  private tackSide: -1 | 1 = 1
  private sinceTack = 99

  think(self: Ship, target: Ship, wind: WindSample, terrain: Terrain, dt: number) {
    this.sinceTack += dt
    if (self.sunk) return

    const dx = target.pos.x - self.pos.x
    const dy = target.pos.y - self.pos.y
    const dist = Math.hypot(dx, dy)
    const bearing = Math.atan2(dy, dx)

    const desired = this.desiredHeading(self, bearing, dist, wind)
    const sailable = this.nearestSailable(desired, bearing, wind)
    // Land overrides everything. A captain who holds a perfect firing course
    // onto a reef is not a captain.
    const clear = this.avoidLand(self, sailable, terrain)

    // Proportional helm: ease off as we come onto the new heading so she
    // settles rather than weaving.
    const error = angleDiff(clear, self.heading)
    self.aiSteer = clamp(error * 1.8, -1, 1)

    // Shorten sail for the knife fight; crack on when there is ground to make.
    // A runner never shortens sail — her whole plan is speed.
    const station = this.station(self)
    self.sailOrder = self.cls.behaviour === 'trader' || dist > station * 1.25 ? 2 : 1
  }

  /**
   * Steer around a shore rather than into it.
   *
   * Steering behaviour, not pathfinding: these captains only need to look
   * competent for the half-minute they are on screen, and a navigation mesh
   * over infinite procedural terrain would cost far more than it returns. The
   * ship grazes past an obstacle along its tangent, which rounds a headland
   * naturally and never produces the stuttering of a replanned path.
   */
  private avoidLand(self: Ship, desired: number, terrain: Terrain): number {
    const look = T.aiLandLookahead
    // Deep hulls must respect the shoals too, not just the beach.
    const margin = 30 + 70 * self.cls.draught

    let island: Island | null = null
    for (const t of [0.35, 0.7, 1]) {
      const probe = terrain.probe({
        x: self.pos.x + Math.cos(desired) * look * t,
        y: self.pos.y + Math.sin(desired) * look * t,
      })
      if (!probe.island || probe.distance > margin) continue
      island = probe.island
      break
    }
    if (!island) return desired
    const dx = island.x - self.pos.x
    const dy = island.y - self.pos.y
    const range = Math.hypot(dx, dy) || 1
    const toIsland = Math.atan2(dy, dx)

    // Already on top of it: turn straight out to sea and sort it out later.
    const edge = landRadius(island, Math.atan2(-dy, -dx))
    if (range < edge + margin * 0.5) return wrapAngle(toIsland + Math.PI)

    // Otherwise graze past it, taking whichever side needs less helm.
    const safe = Math.min(1, (edge + margin) / range)
    const half = Math.asin(safe)
    const a = wrapAngle(toIsland + half)
    const b = wrapAngle(toIsland - half)
    return Math.abs(angleDiff(a, desired)) < Math.abs(angleDiff(b, desired)) ? a : b
  }

  /**
   * The range this captain wants to fight at. A frigate uses her reach; a
   * skirmisher gets inside yours.
   */
  private station(self: Ship): number {
    switch (self.cls.behaviour) {
      case 'standoff': return T.aiStandoff * 1.75 * self.cls.range
      case 'skirmisher': return T.aiStandoff * 0.6
      default: return T.aiStandoff
    }
  }

  /**
   * Close, open, or circle — according to how this hull fights.
   *
   * Holding the target abeam is what keeps a broadside bearing, so a settled
   * duel naturally becomes two ships turning circles around each other. The
   * variations on that are what make one encounter feel unlike another:
   * frigates refuse to come inside your reach, skirmishers crowd you, and
   * traders simply run.
   */
  private desiredHeading(self: Ship, bearing: number, dist: number, wind: WindSample): number {
    // A trader never fights. She puts the wind on her quarter — her fastest
    // point of sail — and runs for it.
    if (self.cls.behaviour === 'trader') {
      return wrapAngle(wind.to + (angleDiff(bearing, wind.to) > 0 ? -0.5 : 0.5))
    }

    const station = this.station(self)
    if (dist > station * 1.3) return bearing

    // Only sheer off when genuinely about to foul — backing away from a good
    // firing position was what kept these two from ever trading shots.
    if (dist < T.aiMinRange) return wrapAngle(bearing + Math.PI * 0.7)

    // A standoff ship edges away as well as circling, to hold the long range
    // where her guns out-reach yours.
    const drift = self.cls.behaviour === 'standoff' && dist < station * 0.85 ? 0.45 : 0

    // Put the target on whichever beam needs less helm.
    const toPort = wrapAngle(bearing + Math.PI / 2 + drift)
    const toStbd = wrapAngle(bearing - Math.PI / 2 - drift)
    return Math.abs(angleDiff(toPort, self.heading)) < Math.abs(angleDiff(toStbd, self.heading))
      ? toPort
      : toStbd
  }

  /**
   * If the course we want lies too close to the wind, we cannot simply take
   * it — we have to beat. Lay off to the angle that makes the best ground to
   * windward rather than pinching at the edge of the no-go zone: pinching is
   * the exact mistake this game punishes the player for, and an AI that does it
   * crawls at a quarter speed and can never close. Hysteresis keeps the helm
   * from chattering at the midpoint between tacks.
   */
  private nearestSailable(desired: number, goalBearing: number, wind: WindSample): number {
    const beat = (T.aiBeatAngle * Math.PI) / 180
    const off = angleDiff(desired, wind.from)
    if (Math.abs(off) >= beat) return desired

    const portTack = wrapAngle(wind.from - beat)
    const stbdTack = wrapAngle(wind.from + beat)

    // Score each tack by how much ground it makes toward the goal.
    const vmg = (heading: number) => Math.cos(angleDiff(heading, goalBearing))
    const portScore = vmg(portTack)
    const stbdScore = vmg(stbdTack)

    const current = this.tackSide === -1 ? portScore : stbdScore
    const other = this.tackSide === -1 ? stbdScore : portScore

    // Coming about costs real speed, so only do it for a real gain.
    if (other > current + T.aiTackHysteresis && this.sinceTack > 3) {
      this.tackSide = this.tackSide === -1 ? 1 : -1
      this.sinceTack = 0
    }

    return this.tackSide === -1 ? portTack : stbdTack
  }
}
