import { T } from './tuning'
import { SLOOP, type ShipClass } from './shipClasses'
import { PolarCurve } from './polar'
import type { WindSample } from './wind'
import { angleDiff, clamp, damp, smoothstep, type Vec2 } from '../core/math'

/**
 * Discrete sail states, as in Pirates! Gold — Up/Down step between them rather
 * than ramping a continuous throttle. Battle sails are the interesting one:
 * slower, but a far tighter turning circle.
 */
export interface SailState { name: string; canvas: number }

export const SAIL_STATES: SailState[] = [
  { name: 'Furled', canvas: 0.0 },
  { name: 'Battle Sails', canvas: 0.55 },
  { name: 'Full Sails', canvas: 1.0 },
]

/**
 * Everything an upgrade is allowed to touch. All multiplicative and 1.0 on a
 * stock ship, except `extraGuns` which is a flat addition and the repair rates
 * which are absolute per-second values.
 *
 * Keeping the whole upgrade surface in one struct means the draft never has to
 * reach into the physics or the global tuning values — it only ever edits these.
 */
export interface ShipMods {
  // Sailing
  turnRate: number
  thrust: number
  drag: number
  crewSpeed: number

  // Gunnery
  damage: number
  reload: number
  range: number
  spread: number
  extraGuns: number

  /**
   * Bias on where shot lands. Chain shot pushes weight into rigging, grape into
   * crew, round into hull. Normalised at damage time, so stacking two types
   * blends them rather than inflating total damage.
   */
  shotHull: number
  shotSails: number
  shotCrew: number

  // Utility
  pickupRadius: number
  /** Fraction of hull, rigging and crew restored per second. */
  hullRepair: number
  sailRepair: number
  crewRepair: number
}

export const STOCK_MODS: ShipMods = {
  turnRate: 1, thrust: 1, drag: 1, crewSpeed: 1,
  damage: 1, reload: 1, range: 1, spread: 1, extraGuns: 0,
  shotHull: 1, shotSails: 1, shotCrew: 1,
  pickupRadius: 1, hullRepair: 0, sailRepair: 0, crewRepair: 0,
}

export type PointOfSail =
  | 'In Irons' | 'Close Hauled' | 'Close Reach' | 'Beam Reach' | 'Broad Reach' | 'Running'

export type Faction = 'player' | 'enemy'

let nextShipId = 1

export class Ship {
  readonly id = nextShipId++
  faction: Faction = 'enemy'
  /** The hull. Effective stat = tuning baseline × class × mods. */
  cls: ShipClass = SLOOP
  /** Part of a boss wave. The sea holds its breath while one of these is afloat. */
  isBoss = false

  get name() { return this.cls.name }

  pos: Vec2 = { x: 0, y: 0 }
  vel: Vec2 = { x: 0, y: 0 }
  heading = 0

  /** Index into SAIL_STATES — what the captain ordered. */
  sailOrder = 1
  /** Actual canvas aloft, which chases the order as the crew works. */
  canvas = SAIL_STATES[1].canvas

  /** Actual rudder deflection, which chases the player's input. */
  rudder = 0
  /** Helm demanded by an AI captain, in [-1, 1]. Unused by the player ship. */
  aiSteer = 0

  /** Visual roll, in radians. Presentation only — never fed back into physics. */
  heel = 0

  /**
   * Repair multiplier in force this step: 1 under way, up to `heaveToRepair`
   * with the canvas off her. Derived each step and read by the HUD, so what
   * the instruments say is what the physics did.
   */
  mending = 1

  readonly polar: PolarCurve

  /** Upgrade modifiers. Mutate these; the physics reads them every step. */
  mods: ShipMods = { ...STOCK_MODS }

  // --- Condition ----------------------------------------------------------
  /** All three run 1 (sound) to 0 (gone). */
  hull = 1
  sails = 1
  crew = 1
  sunk = false
  /** Seconds since she went down, so the wreck can be cleared once she is gone. */
  sinceSunk = 0
  /**
   * She has struck her colours. Out of the fight: she neither fires nor
   * steers, and shot no longer touches her — a prize you have taken is not a
   * target. Her sails come down and a prize crew takes her shortly after.
   */
  struck = false
  sinceStruck = 0
  /** Seconds since the last hit — drives damage flashes and smoke. */
  sinceHit = 99
  /** Water depth under the keel this step: 1 open sea, 0 on the beach. */
  depth = 1
  /** True while the keel is actually on the bottom. */
  aground = false

  /** Reload timers per battery, port then starboard. */
  readonly reload: [number, number] = [0, 0]
  /** Seconds since each battery last fired, for muzzle smoke. */
  readonly sinceFired: [number, number] = [99, 99]
  /** Monotonic count of volleys ordered, so audio can spot the moment. */
  readonly shotCount: [number, number] = [0, 0]
  /**
   * Monotonic count of individual guns that have spoken. Separate from
   * `shotCount` because smoke belongs to each gun as it fires, while the
   * broadside's report belongs to the volley.
   */
  readonly gunsFired: [number, number] = [0, 0]

  // Previous-step state, so rendering can interpolate between fixed steps.
  prevPos: Vec2 = { x: 0, y: 0 }
  prevHeading = 0
  prevHeel = 0

  // Derived values, recomputed each step and read by the HUD and debug overlay.
  awa = Math.PI          // angle to wind, radians, [0, PI]
  awaSigned = Math.PI    // signed — tells us which side the wind is on
  polarMult = 1
  forwardSpeed = 0
  lateralSpeed = 0
  turnRate = 0

  constructor(polar: PolarCurve) {
    this.polar = polar
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.y) }

  get sailName() { return SAIL_STATES[this.sailOrder].name }

  /**
   * How far the canvas is off her, 0 to 1. Zero at battle sails or more — the
   * fighting states — rising to one when she is lying under bare poles.
   *
   * Driven by `canvas`, the sail actually set, rather than by the order given,
   * so the crew's time on the yards is part of the cost of heaving to.
   */
  get hoveTo(): number {
    const fighting = SAIL_STATES[1].canvas
    return clamp(1 - this.canvas / fighting, 0, 1)
  }

  get pointOfSail(): PointOfSail {
    const d = (this.awa * 180) / Math.PI
    if (d < 32) return 'In Irons'
    if (d < 55) return 'Close Hauled'
    if (d < 80) return 'Close Reach'
    if (d < 100) return 'Beam Reach'
    if (d < 150) return 'Broad Reach'
    return 'Running'
  }

  trimSails(delta: number) {
    this.sailOrder = clamp(this.sailOrder + delta, 0, SAIL_STATES.length - 1)
  }

  step(dt: number, wind: WindSample, steerInput: number) {
    this.prevPos = { ...this.pos }
    this.prevHeading = this.heading
    this.prevHeel = this.heel

    this.sinceHit += dt

    // --- Heaving to to mend --------------------------------------------------
    // Hands cannot be on the yards and at the pumps at once. Take the canvas
    // off her and the carpenter's crew get to work properly; carry it and all
    // they manage is what can be done under way.
    //
    // This is the one lever that turns recovery into a decision rather than a
    // trickle: you have to make the sea room first, which is the same
    // positional problem the rest of the game poses. The cost is that you are
    // stopped, visible and barely able to answer while it happens.
    this.mending = 1 + (T.heaveToRepair - 1) * this.hoveTo
    if (this.mods.hullRepair > 0) {
      this.hull = clamp(this.hull + this.mods.hullRepair * this.mending * dt, 0, 1)
    }
    if (this.mods.sailRepair > 0) {
      this.sails = clamp(this.sails + this.mods.sailRepair * this.mending * dt, 0, 1)
    }
    // Wounded hands return to duty. Without this, crew damage was the one
    // wound that never healed, so a long run bled gunnery and handling away
    // permanently.
    if (this.mods.crewRepair > 0) {
      this.crew = clamp(this.crew + this.mods.crewRepair * this.mending * dt, 0, 1)
    }
    this.sinceFired[0] += dt
    this.sinceFired[1] += dt

    // A thinned crew works the guns and the yards more slowly, and so does one
    // with half its number below plugging shot holes.
    const crewFactor = 0.4 + 0.6 * this.crew
    const gunCrew = crewFactor * (1 - (1 - T.heaveToGunnery) * this.hoveTo)
    this.reload[0] = Math.max(0, this.reload[0] - dt * gunCrew)
    this.reload[1] = Math.max(0, this.reload[1] - dt * gunCrew)

    // --- Rigging: the crew takes real time to make or shorten sail ----------
    const orderedCanvas = SAIL_STATES[this.sailOrder].canvas
    this.canvas = damp(
      this.canvas,
      orderedCanvas,
      T.canvasChangeRate * 4 * this.cls.crewSpeed * this.mods.crewSpeed * crewFactor,
      dt,
    )

    // --- Where the wind is relative to us -----------------------------------
    this.awaSigned = angleDiff(this.heading, wind.from)
    this.awa = Math.abs(this.awaSigned)
    this.polarMult = this.polar.sample(this.awa)

    // Carrying full canvas in heavy air costs you speed instead of gaining it.
    const overcanvas = 1 - T.overcanvasPenalty * this.canvas * smoothstep(1.1, 2.0, wind.strength)

    // --- Drive ---------------------------------------------------------------
    // The polar multiplier is squared because drag here is dominated by its
    // quadratic term, where speed goes as the square root of thrust. Squaring
    // on the way in makes the curve mean what it says: a point drawn at 0.3 in
    // the tuner really does produce 30% of best speed, which is the whole
    // reason the curve is editable in the first place.
    const drive = this.polarMult * this.polarMult
    // Shot-away canvas is the loop that ties gunnery back to sailing: lose your
    // sails and you lose the ability to choose where you are, which is the only
    // defence this game has.
    const rigDrive = T.sailDriveFloor + (1 - T.sailDriveFloor) * this.sails
    const thrust =
      T.thrustScale * drive * this.canvas * rigDrive * wind.strength * overcanvas *
      this.cls.thrust * this.mods.thrust

    const fx = Math.cos(this.heading)
    const fy = Math.sin(this.heading)
    // Lateral axis, 90 degrees to starboard in screen space.
    const lx = -fy
    const ly = fx

    let vF = this.vel.x * fx + this.vel.y * fy
    let vL = this.vel.x * lx + this.vel.y * ly

    // A hull moving transom-first is not streamlined, so sternway is punished
    // far harder than headway. Without this, leeway alone blows a stalled ship
    // backwards faster than it can sail close-hauled.
    const sternway = vF < 0 ? T.sternwayDrag : 1
    const dragF = sternway * this.cls.drag * this.mods.drag *
      (-T.dragForward * vF * Math.abs(vF) - T.dragForwardLinear * vF)
    // The keel resists sideways motion far harder than forward motion. This is
    // what makes a turn feel like a ship pivoting rather than a car skidding.
    const dragL = -T.dragLateral * vL * Math.abs(vL) - T.dragLateralLinear * vL

    vF += (thrust + dragF) * dt
    vL += dragL * dt

    this.forwardSpeed = vF
    this.lateralSpeed = vL

    this.vel.x = fx * vF + lx * vL
    this.vel.y = fy * vF + ly * vL

    // --- Leeway: the wind shoves hull and rig bodily downwind ----------------
    // Split across the hull axes rather than applied as a raw world force. The
    // rig's useful forward drive is already accounted for by the polar curve,
    // so what is left over is mostly sideways slip; only a fraction of it acts
    // fore-and-aft. That fraction is what eventually drifts a stalled ship back
    // out of irons.
    // Scaled by how badly the rig is drawing: a sail that is converting wind
    // into forward drive is not simultaneously being shoved sideways by it.
    // Sailing well is therefore self-stabilising, and stalling compounds.
    const slipping = 1 - this.polarMult
    const leeway = this.struck
      ? 0
      : T.leeway * wind.strength * (0.25 + 0.75 * this.canvas) * slipping
    const leeAxial = (Math.cos(wind.to) * fx + Math.sin(wind.to) * fy) * T.leewayAxial
    const leeLateral = Math.cos(wind.to) * lx + Math.sin(wind.to) * ly
    this.vel.x += (fx * leeAxial + lx * leeLateral) * leeway * dt
    this.vel.y += (fy * leeAxial + ly * leeLateral) * leeway * dt

    // --- A ship that has struck takes her way off ----------------------------
    // She has given up: her canvas is coming down and nobody is at the helm.
    // Her own drag would stop her eventually, but "eventually" is longer than
    // a prize is on the water for, and a hull still making way under bare
    // poles reads as one trying to get away — the exact opposite of what a
    // prize should look like. So her way comes off deliberately, and the wind
    // stops pushing her about with it.
    if (this.struck) {
      const stop = Math.max(0, 1 - T.prizeStop * dt)
      this.vel.x *= stop
      this.vel.y *= stop
    }

    this.pos.x += this.vel.x * dt
    this.pos.y += this.vel.y * dt

    // --- Steering -------------------------------------------------------------
    this.rudder = damp(this.rudder, clamp(steerInput, -1, 1), T.rudderSpeed, dt)

    // A rudder only bites when water is flowing past it.
    const steerage =
      T.steerageFloor +
      (1 - T.steerageFloor) * smoothstep(0, T.steerageRefSpeed, Math.abs(vF))
    // More canvas aloft means a wider, more sluggish turn.
    const canvasTurn = 1 + (T.fullSailTurnPenalty - 1) * this.canvas
    // And canvas *shot away* costs her the helm as well as her legs. Without
    // this, rigging damage only slowed a ship down — a hull with her rigging
    // in ribbons still came round as smartly as a sound one, which made
    // "tears rigging and strands them" a half-truth and left chain shot
    // doing much less than the card promised. The source is explicit that a
    // dismasted ship is no longer under any control.
    const rigTurn = T.sailTurnFloor + (1 - T.sailTurnFloor) * this.sails

    this.turnRate = this.struck
      ? 0
      : T.baseTurnRate * this.cls.turnRate * this.mods.turnRate *
        this.rudder * steerage * canvasTurn * rigTurn
    this.heading += this.turnRate * dt

    // --- Heel (visual only) ---------------------------------------------------
    const heelTarget =
      -this.turnRate * Math.min(this.speed, 300) * T.heelFromTurn +
      Math.sin(this.awaSigned) * this.canvas * wind.strength * T.heelFromWind
    this.heel = damp(this.heel, heelTarget, T.heelSmoothing, dt)
  }

  /** Returns true if this hit sank her. A weak hull soaks up far less. */
  applyDamage(hull: number, sails: number, crew: number): boolean {
    const toughness = this.cls.hullStrength
    this.hull = clamp(this.hull - hull / toughness, 0, 1)
    this.sails = clamp(this.sails - sails / toughness, 0, 1)
    this.crew = clamp(this.crew - crew / toughness, 0, 1)
    this.sinceHit = 0
    if (this.hull <= 0 && !this.sunk) {
      this.sunk = true
      this.sinceSunk = 0
      return true
    }
    return false
  }

  reset() {
    this.pos = { x: 0, y: 0 }
    this.prevPos = { x: 0, y: 0 }
    this.vel = { x: 0, y: 0 }
    this.heading = 0
    this.prevHeading = 0
    this.rudder = 0
    this.heel = 0
    this.prevHeel = 0
    this.sailOrder = 1
    this.canvas = SAIL_STATES[1].canvas
    this.hull = this.sails = this.crew = 1
    this.sunk = false
    this.sinceSunk = 0
    this.struck = false
    this.sinceStruck = 0
    this.reload[0] = this.reload[1] = 0
  }
}
