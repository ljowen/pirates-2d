import { Noise1D } from '../core/noise'
import { T } from './tuning'
import { clamp, wrapAngle } from '../core/math'

/**
 * A persistent, slowly wandering wind. Direction drifts around a mean heading
 * and strength breathes in gusts, so the best point of sail is never a fact
 * you learn once — it is something you keep re-reading.
 */
export class Wind {
  /** Heading the wind blows FROM, in world radians. */
  from: number
  /** Heading the wind pushes TOWARD. */
  get to() { return wrapAngle(this.from + Math.PI) }

  strength = 1
  private readonly meanFrom: number
  private readonly swingNoise: Noise1D
  private readonly gustNoise: Noise1D
  private t = 0

  constructor(seed = 1337, meanFromDeg = -45) {
    this.meanFrom = (meanFromDeg * Math.PI) / 180
    this.from = this.meanFrom
    this.swingNoise = new Noise1D(seed)
    this.gustNoise = new Noise1D(seed ^ 0x9e3779b9)
  }

  step(dt: number) {
    this.t += dt

    const swing = this.swingNoise.fbm(this.t * T.windSwingRate, 3)
    this.from = wrapAngle(this.meanFrom + swing * (T.windSwingDegrees * Math.PI) / 180)

    const gust = this.gustNoise.fbm(this.t * T.windGustRate, 3)
    this.strength = clamp(T.windBaseStrength * (1 + gust * T.windGustAmount), 0.1, 3)
  }

  /**
   * Return to the start of the wind's wander.
   *
   * Without this the internal clock carried across runs, so `World.reset(seed)`
   * began each one at a different point in the weather — making every
   * benchmark quietly irreproducible, and adding noise to comparisons that
   * were supposed to differ only by the change under test.
   */
  reset() {
    this.t = 0
    this.from = this.meanFrom
    this.strength = 1
  }

  /** Beaufort-ish label for the HUD. */
  describe(): string {
    const s = this.strength
    if (s < 0.55) return 'Light airs'
    if (s < 0.85) return 'Gentle breeze'
    if (s < 1.15) return 'Steady breeze'
    if (s < 1.45) return 'Fresh breeze'
    if (s < 1.75) return 'Strong breeze'
    return 'Gale'
  }
}
