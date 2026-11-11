import { Noise1D, Noise2D } from '../core/noise'
import { T } from './tuning'
import { clamp, wrapAngle, type Vec2 } from '../core/math'
import { Weather } from './weather'

/** The wind as experienced at one spot on the sea. */
export interface WindSample {
  /** Heading the wind blows FROM. */
  from: number
  /** Heading it pushes TOWARD. */
  to: number
  strength: number
  /**
   * How deep in a squall this point is, 0 outside and 1 in the thick of one.
   *
   * Carried on the sample so a ship can be hurt by *weather* without knowing
   * that weather cells exist — and, more importantly, so the hurt does not
   * depend on what the ambient wind happened to be doing. Keyed to absolute
   * strength instead, the identical squall split canvas at full force one
   * minute and did nothing at all the next.
   */
  squall: number
}

/**
 * A persistent, slowly wandering wind that also varies from place to place.
 *
 * The ambient direction and strength drift over time, and on top of that a
 * slowly moving noise field veers and gusts the wind locally. So the best
 * point of sail is never a fact you learn once — it changes both as time
 * passes and as you sail across the map, and a favourable lane is something
 * worth going to find.
 *
 * Squalls ride on top of all this and are owned here rather than by the
 * World, because a weather cell is a property of the wind and nothing else —
 * it needs no terrain and no ships. That keeps `at()` the single place any
 * part of the game asks what the air is doing.
 *
 * This class stays pure: islands blanketing the wind in their lee is handled
 * by `World.windAt`, which is the layer that knows about terrain.
 */
export class Wind {
  /** Heading the wind blows FROM, in world radians. */
  from: number
  /** Heading the wind pushes TOWARD. */
  get to() { return wrapAngle(this.from + Math.PI) }

  strength = 1
  readonly weather = new Weather()
  private readonly meanFrom: number
  private swingNoise: Noise1D
  private gustNoise: Noise1D
  private veerField: Noise2D
  private gustField: Noise2D
  private t = 0
  /** The weather pattern itself travels downwind. */
  private patternX = 0
  private patternY = 0

  constructor(seed = 1337, meanFromDeg = -45) {
    this.meanFrom = (meanFromDeg * Math.PI) / 180
    this.from = this.meanFrom
    this.swingNoise = new Noise1D(seed)
    this.gustNoise = new Noise1D(seed ^ 0x9e3779b9)
    this.veerField = new Noise2D(seed ^ 0x51ed270b)
    this.gustField = new Noise2D(seed ^ 0x2545f491)
  }

  step(dt: number, focus: Vec2 = ORIGIN) {
    this.t += dt

    const swing = this.swingNoise.fbm(this.t * T.windSwingRate, 3)
    this.from = wrapAngle(this.meanFrom + swing * (T.windSwingDegrees * Math.PI) / 180)

    const gust = this.gustNoise.fbm(this.t * T.windGustRate, 3)
    this.strength = clamp(T.windBaseStrength * (1 + gust * T.windGustAmount), 0.1, 3)

    // Weather moves with the wind, so a patch of calm drifts across the map
    // rather than sitting over one stretch of water forever.
    this.patternX -= Math.cos(this.to) * T.windPatternDrift * dt
    this.patternY -= Math.sin(this.to) * T.windPatternDrift * dt

    this.weather.step(dt, this.to, this.from, focus)
  }

  /**
   * The wind at a particular spot. Everything that has a position should ask
   * for this rather than reading the ambient values.
   */
  at(x: number, y: number): WindSample {
    const scale = Math.max(1, T.windPatternScale)
    const sx = (x + this.patternX) / scale
    const sy = (y + this.patternY) / scale

    // Sampled on its own length scale so direction and strength do not simply
    // change together — otherwise every lull is also a header and the wind
    // reads as one quantity rather than two.
    const vs = T.windVeerScale
    const veer = this.veerField.fbm(sx * vs, sy * vs, 2) * (T.windVeerDegrees * Math.PI) / 180
    const gust = this.gustField.fbm(sx * 1.3 + 11.7, sy * 1.3 - 4.2, 2) * T.windLocalGust

    const squall = this.weather.sample(x, y)
    const from = wrapAngle(this.from + veer + squall.veer)
    return {
      from,
      to: wrapAngle(from + Math.PI),
      strength: clamp(this.strength * (1 + gust) * (1 + squall.gain), 0.05, 4),
      squall: squall.intensity,
    }
  }

  /** The ambient wind, ignoring local variation. */
  get ambient(): WindSample {
    return { from: this.from, to: this.to, strength: this.strength, squall: 0 }
  }

  /**
   * Return to the start of the wind's wander.
   *
   * Without this the internal clock carried across runs, so `World.reset(seed)`
   * began each one at a different point in the weather — making every
   * benchmark quietly irreproducible, and adding noise to comparisons that
   * were supposed to differ only by the change under test.
   */
  /** A fresh weather pattern, so no two voyages meet the same sea. */
  reseed(seed: number) {
    this.swingNoise = new Noise1D(seed)
    this.gustNoise = new Noise1D(seed ^ 0x9e3779b9)
    this.veerField = new Noise2D(seed ^ 0x51ed270b)
    this.gustField = new Noise2D(seed ^ 0x2545f491)
    this.weather.reseed(seed)
  }

  reset() {
    this.t = 0
    this.from = this.meanFrom
    this.strength = 1
    this.patternX = 0
    this.patternY = 0
    this.weather.reset()
  }

  /** Beaufort-ish label for the HUD. */
  describe(strengthOverride?: number): string {
    const s = strengthOverride ?? this.strength
    if (s < 0.55) return 'Light airs'
    if (s < 0.85) return 'Gentle breeze'
    if (s < 1.15) return 'Steady breeze'
    if (s < 1.45) return 'Fresh breeze'
    if (s < 1.75) return 'Strong breeze'
    if (s < 2.3) return 'Gale'
    return 'Hard gale'
  }
}

const ORIGIN: Vec2 = { x: 0, y: 0 }
