import { T } from './tuning'
import { SLOOP, type ShipClass } from './shipClasses'
import { PolarCurve } from './polar'
import type { WindSample } from './wind'
import { angleDiff, clamp, damp, smoothstep, type Vec2 } from '../core/math'

/**
 * Discrete sail states — Up/Down steps between them rather than ramping a
 * continuous throttle.
 *
 * They are a **sail plan**, set from the deck upward the way a square rigger
 * actually makes sail: courses first (the lowest and biggest), then topsails,
 * then the small kites at the top. That gives the control a shape the player
 * can see — each order is one more yard crossed on the mast — instead of an
 * abstract three-position throttle whose middle setting had to be explained.
 *
 * `yards` is how many sails each mast carries at this order, which is the
 * whole reason the silhouette changes. Keeping it here rather than in the
 * renderer means the picture cannot disagree with the physics.
 */
export interface SailState { name: string; short: string; canvas: number; yards: number }

/**
 * Canvas values are chosen so the two orders that existed before keep their
 * exact numbers: Topsails is the old Battle Sails at 0.55, and Royals is the
 * old Full Sails at 1.0. Every balance figure measured to date therefore
 * still holds, and Courses is a genuinely new option rather than a re-cut of
 * the old ones.
 */
export const SAIL_STATES: SailState[] = [
  { name: 'Furled', short: 'FURL', canvas: 0.0, yards: 0 },
  { name: 'Courses', short: 'CRSE', canvas: 0.32, yards: 1 },
  { name: 'Topsails', short: 'TOPS', canvas: 0.55, yards: 2 },
  { name: 'Royals', short: 'ROYL', canvas: 1.0, yards: 3 },
]

/**
 * Named orders, so nothing has to know that "fighting canvas" happens to be
 * index 2. Adding a state used to mean hunting for every bare 1 and 2 in the
 * AI, the test pilot and the physics.
 */
export const SAIL_FURLED = 0
export const SAIL_COURSES = 1
/** Topsails: the traditional fighting rig, and the handiest for a knife fight. */
export const SAIL_FIGHTING = 2
export const SAIL_FULL = 3

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
  /**
   * How fast her canvas splits in heavy weather.
   *
   * This exists because `thrust` and `drag` turned out to be the *same stat*:
   * steady speed solves `a.v^2 + b.v = thrust` where both a and b carry the
   * drag scale, so speed depends only on `thrust / drag` and nothing else.
   * Taller Masts at x1.1 and Careened Hull at /0.91 differed by 0.05% — two of
   * fifteen draft cards were one card. Careened Hull was deleted and Taller
   * Masts given a cost in a system a pure speed multiplier cannot reach.
   */
  blowout: number

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

  /**
   * Incoming damage is divided by this, on top of the hull's own strength.
   * The one defensive stat that is not a repair rate: it changes how long she
   * can stay in a fight rather than how long she must stay out of one.
   */
  armour: number

  // Utility
  pickupRadius: number
  /** Multiplies what every wreck and prize drops for this ship. */
  plunder: number
  /** Multiplies what a ship taken whole is worth, on top of `plunder`. */
  prize: number
  /** Multiplies the range at which a beaten ship strikes to her. */
  boarding: number
  /** Fraction of hull, rigging and crew restored per second. */
  hullRepair: number
  sailRepair: number
  crewRepair: number
}

export const STOCK_MODS: ShipMods = {
  turnRate: 1, thrust: 1, drag: 1, crewSpeed: 1, blowout: 1,
  damage: 1, reload: 1, range: 1, spread: 1, extraGuns: 0,
  shotHull: 1, shotSails: 1, shotCrew: 1, armour: 1,
  pickupRadius: 1, plunder: 1, prize: 1, boarding: 1,
  hullRepair: 0, sailRepair: 0, crewRepair: 0,
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
  /**
   * Sent for the player in particular. She is not part of the sea's ordinary
   * pressure and is not counted against it; she arrives, chases for a while,
   * and gives it up.
   */
  isHunter = false
  /** Seconds of chase she has left before she breaks off. */
  huntLeft = 0
  /** She has given up the chase and is standing away. Never comes back. */
  breakingOff = false

  get name() { return this.cls.name }

  pos: Vec2 = { x: 0, y: 0 }
  vel: Vec2 = { x: 0, y: 0 }
  heading = 0

  /** Index into SAIL_STATES — what the captain ordered. */
  sailOrder = SAIL_FIGHTING
  /** Actual canvas aloft, which chases the order as the crew works. */
  canvas = SAIL_STATES[SAIL_FIGHTING].canvas

  /** Actual rudder deflection, which chases the player's input. */
  rudder = 0
  /** Helm demanded by an AI captain, in [-1, 1]. Unused by the player ship. */
  aiSteer = 0

  /**
   * How hard her canvas is splitting right now, 0–1. Read by the HUD so the
   * warning is on screen while it is happening rather than afterwards, when
   * all the player would see is a rigging bar that had quietly dropped.
   */
  blowout = 0

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
   * How many yards are actually carrying canvas right now.
   *
   * Derived from the canvas aloft rather than from the order given, so the
   * sails appear one yard at a time as the crew works rather than snapping
   * into place the instant the key is pressed. The crew's time on the yards
   * is already a cost everywhere else; this is what it looks like.
   */
  get yardsSet(): number {
    let n = 0
    for (const st of SAIL_STATES) {
      // Halfway to a state is enough to show its yard: the sail is being set,
      // and a yard that appears only once the canvas is fully home would mean
      // the whole transition shows nothing.
      if (st.canvas > 0 && this.canvas >= st.canvas * 0.55) n = st.yards
    }
    return n
  }

  /**
   * How far the canvas is off her, 0 to 1. Zero at battle sails or more — the
   * fighting states — rising to one when she is lying under bare poles.
   *
   * Driven by `canvas`, the sail actually set, rather than by the order given,
   * so the crew's time on the yards is part of the cost of heaving to.
   */
  get hoveTo(): number {
    const fighting = SAIL_STATES[SAIL_FIGHTING].canvas
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
    // Under way she mends nothing. Not a trickle, nothing.
    //
    // A baseline repair rate meant attrition quietly reversed itself while the
    // player did what they were going to do anyway, so the hull bar only ever
    // moved when something big was already on top of them. Making the whole of
    // sustain conditional on heaving to turns recovery into the one thing the
    // rest of the game is also about: deciding where you can afford to be.
    this.mending = T.heaveToRepair * this.hoveTo
    if (this.mods.hullRepair > 0) {
      this.hull = clamp(this.hull + this.mods.hullRepair * this.mending * dt, 0, 1)
    }
    // Nobody bends on a new sail while the one aloft is blowing out of its
    // bolt-ropes. Without this the two rates simply cancelled: blow-out took
    // 0.0082/s in the thick of a squall against 0.0085/s of self-repair, so
    // the loudest warning in the game had a net effect of zero.
    //
    // Reads last frame's `blowout`, which is computed further down once the
    // local wind is known. One frame of lag, and worth it to keep the wind
    // sampled in exactly one place.
    if (this.mods.sailRepair > 0 && this.blowout <= 0.05) {
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

    // --- Canvas blowing out --------------------------------------------------
    // The speed penalty above is not a cost: even paying it, a full suit in a
    // squall still drives harder than battle sails in a steady breeze, so on
    // its own it never once made anyone shorten sail. This is the cost.
    //
    // Keyed to canvas between battle sails and a full suit, so the threshold
    // sits exactly where the existing three-position sail control already is:
    // reefed down she will ride out anything, and the decision the weather
    // asks for is one the player can already make with a key they know.
    //
    // Driven by how deep in the squall she is rather than by absolute wind
    // strength. Keyed to strength it was unreliable in a way that read as a
    // bug: the ambient wind wanders between 0.72 and 1.21, so the *same*
    // squall produced anything from no damage at all to full force, and a
    // typical core only ever reached 0.30 of the effect. Intensity also
    // matches what is drawn — a cell fading out looks faint and now is.
    this.blowout =
      smoothstep(T.blowoutAt, 1, wind.squall) *
      smoothstep(SAIL_STATES[SAIL_FIGHTING].canvas, 1, this.canvas)
    if (this.blowout > 0 && T.blowoutRate > 0) {
      // `blowout` stays a 0-1 reading of how hard it is blowing on her; the
      // rig's own vulnerability is a multiplier on the damage, so the HUD and
      // the AI thresholds keep meaning the same thing on every ship.
      const rate = T.blowoutRate * this.mods.blowout
      this.sails = clamp(this.sails - rate * this.blowout * dt, 0, 1)
    }

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
    const toughness = this.cls.hullStrength * this.mods.armour
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
    this.sailOrder = SAIL_FIGHTING
    this.canvas = SAIL_STATES[SAIL_FIGHTING].canvas
    this.hull = this.sails = this.crew = 1
    this.blowout = 0
    this.sunk = false
    this.sinceSunk = 0
    this.struck = false
    this.sinceStruck = 0
    this.reload[0] = this.reload[1] = 0
  }
}
