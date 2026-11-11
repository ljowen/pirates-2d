import { T } from './tuning'
import { shotSplit } from './combat'
import type { ShipMods } from './ship'
import type { ShipClass } from './shipClasses'
import type { PolarCurve } from './polar'
import { deg, smoothstep } from '../core/math'

/**
 * What a refit actually *does*, in the units the player thinks in.
 *
 * Upgrades edit `ShipMods`, which are abstract multipliers: "9% less drag" is
 * true and useless, because nobody knows what drag is worth in knots. These
 * functions run the same arithmetic the physics and the gunnery run, so the
 * draft can show a real top speed before and after a card is taken, and the
 * numbers on the card can never drift from the numbers in the sea.
 *
 * Everything here is quoted for a sound ship in a steady breeze: full canvas,
 * whole rigging, a fresh crew. Those are the only conditions under which two
 * builds can honestly be compared.
 */

export type StatGroup = 'Sailing' | 'Gunnery' | 'Shot' | 'Quarterdeck'

export interface Stat {
  key: string
  group: StatGroup
  label: string
  value: number
  /**
   * Which way counts as an improvement. Shot placement is 'none': more weight
   * into the rigging is a different plan, not a better one.
   */
  better: 'higher' | 'lower' | 'none'
  /** Rendered form of `value`, units and all. */
  format: (v: number) => string
}

// --- Formatting -----------------------------------------------------------

// Speeds run into the hundreds in world units, which is what the HUD already
// reads out, so a decimal is noise once past a hundred.
const knots = (v: number) => `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} kn`
const perSecond = (v: number) => `${v.toFixed(0)}°/s`
const seconds = (v: number) => `${v.toFixed(2)}s`
const whole = (v: number) => `${Math.round(v)}`
const percent = (v: number) => `${Math.round(v * 100)}%`
const degrees = (v: number) => `±${v.toFixed(1)}°`
const mending = (v: number) => (Number.isFinite(v) ? `${Math.round(v)}s` : 'never')

// --- The physics, solved rather than simulated ------------------------------

/**
 * Steady-state speed for a given drive: the point where thrust and drag
 * cancel. Drag is `a·v² + b·v`, so this is the positive root of the quadratic
 * — the same balance the integrator in `Ship.step` converges on, reached
 * directly rather than by running the ship for a minute.
 */
function steadySpeed(thrust: number, dragScale: number): number {
  const a = T.dragForward * dragScale
  const b = T.dragForwardLinear * dragScale
  if (a <= 0) return b > 0 ? thrust / b : 0
  return (-b + Math.sqrt(b * b + 4 * a * thrust)) / (2 * a)
}

/** Best speed this hull can make, at her best point of sail under full canvas. */
export function topSpeed(cls: ShipClass, mods: ShipMods, polar: PolarCurve): number {
  const mult = polar.sampleDeg(polar.bestAngleDeg())
  const wind = T.windBaseStrength
  // Mirrors Ship.step: the polar is squared on the way in, and carrying full
  // canvas in heavy air costs rather than gains.
  const overcanvas = 1 - T.overcanvasPenalty * smoothstep(1.1, 2.0, wind)
  const thrust =
    T.thrustScale * mult * mult * wind * overcanvas * cls.thrust * mods.thrust
  return steadySpeed(thrust, cls.drag * mods.drag)
}

/** Guns that will speak in one broadside. */
export function gunsPerBroadside(cls: ShipClass, mods: ShipMods): number {
  return Math.max(1, Math.round(T.gunsPerBroadside * cls.guns) + mods.extraGuns)
}

/**
 * Seconds for the crew to make or shorten sail. `damp` is exponential and so
 * never strictly arrives; this is the time to cover nine tenths of the change,
 * which is the point at which the ship has visibly answered.
 */
function makeSailTime(cls: ShipClass, mods: ShipMods): number {
  const rate = T.canvasChangeRate * 4 * cls.crewSpeed * mods.crewSpeed
  return rate > 0 ? Math.log(10) / rate : Infinity
}

/** Seconds to mend from nothing at all, given a repair rate per second. */
const mendTime = (rate: number) => (rate > 0 ? 1 / rate : Infinity)

/**
 * The full readout for a hull carrying these modifications.
 *
 * Returned as a flat list rather than an object so the draft can diff two of
 * them row by row without knowing what any of the rows mean.
 */
export function describeStats(cls: ShipClass, mods: ShipMods, polar: PolarCurve): Stat[] {
  const guns = gunsPerBroadside(cls, mods)
  const broadside = guns * T.damagePerBall * cls.damage * mods.damage
  const reload = T.gunReload * cls.reload * mods.reload
  const split = shotSplit(mods, cls.shotBias)

  return [
    // --- Sailing ---------------------------------------------------------
    {
      key: 'topSpeed', group: 'Sailing', label: 'Top speed', better: 'higher',
      value: topSpeed(cls, mods, polar), format: knots,
    },
    {
      key: 'helm', group: 'Sailing', label: 'Helm', better: 'higher',
      // Quoted under full sail, with full steerage: the same conditions as top
      // speed, so the two rows describe one ship rather than two.
      value: deg(T.baseTurnRate * cls.turnRate * mods.turnRate * T.fullSailTurnPenalty),
      format: perSecond,
    },
    {
      key: 'makeSail', group: 'Sailing', label: 'Make sail', better: 'lower',
      value: makeSailTime(cls, mods), format: seconds,
    },
    {
      key: 'rigAtRisk', group: 'Sailing', label: 'Rig in a squall', better: 'lower',
      // Rigging lost per second under a full suit in the thick of one. This is
      // what stops Taller Masts being a pure speed multiplier — and a pure
      // speed multiplier is indistinguishable from any other, since steady
      // speed depends only on thrust over drag.
      value: T.blowoutRate * mods.blowout,
      format: (v) => `${(v * 100).toFixed(0)}%/s`,
    },

    // --- Gunnery ---------------------------------------------------------
    {
      key: 'guns', group: 'Gunnery', label: 'Guns a side', better: 'higher',
      value: guns, format: whole,
    },
    {
      key: 'reload', group: 'Gunnery', label: 'Reload', better: 'lower',
      value: reload, format: seconds,
    },
    {
      key: 'broadside', group: 'Gunnery', label: 'Broadside', better: 'higher',
      // As a share of a standard hull, which is what makes the number mean
      // something: 33% is three broadsides to sink a Brigantine.
      value: broadside, format: percent,
    },
    {
      key: 'weightOfFire', group: 'Gunnery', label: 'Weight of fire', better: 'higher',
      // Broadside over reload. The only row that answers "more damage or
      // faster reload?", which is the commonest decision in the draft.
      value: reload > 0 ? broadside / reload : 0,
      format: (v) => `${(v * 100).toFixed(0)}%/s`,
    },
    {
      key: 'range', group: 'Gunnery', label: 'Range', better: 'higher',
      value: T.gunRange * cls.range * mods.range, format: whole,
    },
    {
      key: 'scatter', group: 'Gunnery', label: 'Scatter', better: 'lower',
      value: deg(T.ballSpread * mods.spread), format: degrees,
    },

    // --- Shot ------------------------------------------------------------
    {
      key: 'intoHull', group: 'Shot', label: 'Into hull', better: 'none',
      value: split.hull, format: percent,
    },
    {
      key: 'intoRigging', group: 'Shot', label: 'Into rigging', better: 'none',
      value: split.sails, format: percent,
    },
    {
      key: 'intoCrew', group: 'Shot', label: 'Into crew', better: 'none',
      value: split.crew, format: percent,
    },

    // --- Quarterdeck ------------------------------------------------------
    // Every one of these is quoted hove to, because that is the only state in
    // which a ship mends at all — showing an under-way figure would be quoting
    // a rate the player can never be paid. The condition is stated once in the
    // panel's footnote rather than suffixed onto all three labels.
    {
      key: 'mendHull', group: 'Quarterdeck', label: 'Mend hull', better: 'lower',
      value: mendTime(mods.hullRepair * T.heaveToRepair), format: mending,
    },
    {
      key: 'mendRigging', group: 'Quarterdeck', label: 'Mend rigging', better: 'lower',
      value: mendTime(mods.sailRepair * T.heaveToRepair), format: mending,
    },
    {
      key: 'mendCrew', group: 'Quarterdeck', label: 'Mend crew', better: 'lower',
      value: mendTime(mods.crewRepair * T.heaveToRepair), format: mending,
    },
    {
      key: 'plunderReach', group: 'Quarterdeck', label: 'Plunder reach', better: 'higher',
      value: T.plunderMagnetRadius * mods.pickupRadius, format: whole,
    },
  ]
}
