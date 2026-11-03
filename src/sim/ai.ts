import { T } from './tuning'
import type { Ship } from './ship'
import type { Wind } from './wind'
import { angleDiff, clamp, wrapAngle } from '../core/math'

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

  think(self: Ship, target: Ship, wind: Wind, dt: number) {
    this.sinceTack += dt
    if (self.sunk) return

    const dx = target.pos.x - self.pos.x
    const dy = target.pos.y - self.pos.y
    const dist = Math.hypot(dx, dy)
    const bearing = Math.atan2(dy, dx)

    const desired = this.desiredHeading(self, bearing, dist)
    const sailable = this.nearestSailable(desired, bearing, wind)

    // Proportional helm: ease off as we come onto the new heading so she
    // settles rather than weaving.
    const error = angleDiff(sailable, self.heading)
    self.aiSteer = clamp(error * 1.8, -1, 1)

    // Shorten sail for the knife fight; crack on when there is ground to make.
    self.sailOrder = dist < T.aiStandoff * 1.25 ? 1 : 2
  }

  /**
   * Close, open, or circle. Holding the target abeam is what keeps a broadside
   * bearing, so a settled duel naturally becomes two ships turning circles
   * around each other.
   */
  private desiredHeading(self: Ship, bearing: number, dist: number): number {
    if (dist > T.aiStandoff * 1.3) return bearing
    // Only sheer off when genuinely about to foul — backing away from a good
    // firing position was what kept these two from ever trading shots.
    if (dist < T.aiMinRange) return wrapAngle(bearing + Math.PI * 0.7)

    // Put the target on whichever beam needs less helm.
    const toPort = wrapAngle(bearing + Math.PI / 2)
    const toStbd = wrapAngle(bearing - Math.PI / 2)
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
  private nearestSailable(desired: number, goalBearing: number, wind: Wind): number {
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
