import { Container, Graphics } from 'pixi.js'
import type { Ship } from '../sim/ship'
import type { Projectile, Splash } from '../sim/combat'
import { batteryBearing } from '../sim/combat'
import type { WindSample } from '../sim/wind'
import { P } from './palette'

interface Smoke {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number; r: number
  /** Powder smoke is pale; a burning hull's is dark; flame is drawn hot and short. */
  kind: 'powder' | 'burning' | 'flame'
}

/** Below this much hull she smokes; below `ABLAZE` she is visibly on fire. */
const SMOULDER = 0.5
const ABLAZE = 0.25

/**
 * Shot, splashes and gun smoke. Smoke does most of the work here: a broadside
 * that just spawns dots reads as nothing happening, where a bank of smoke
 * rolling away downwind reads as a ship firing.
 */
export class CombatView {
  readonly view = new Container()
  private readonly smokeG = new Graphics()
  private readonly shotG = new Graphics()
  private smoke: Smoke[] = []
  private readonly lastGun = new Map<string, number>()
  private readonly owed = new Map<number, { smoke: number; flame: number }>()

  constructor() {
    // Smoke under the shot so balls stay legible against it.
    this.view.addChild(this.smokeG, this.shotG)
  }

  update(ships: Ship[], projectiles: Projectile[], splashes: Splash[], wind: WindSample, dt: number) {
    this.emitMuzzleSmoke(ships)
    this.emitDamageSmoke(ships, dt)
    this.stepSmoke(wind, dt)
    this.drawSmoke()
    this.drawShot(projectiles, splashes)
  }

  /**
   * One bank of smoke per gun, emitted when that gun actually fires.
   *
   * This watches the simulation's own per-gun counter rather than predicting
   * a schedule from the ripple gap. Since the gaps became irregular — gun
   * crews are not metronomes — a predicted schedule would drift out of step
   * with the shot leaving the side.
   */
  private emitMuzzleSmoke(ships: Ship[]) {
    for (const ship of ships) {
      for (const battery of [0, 1] as const) {
        const key = `${ship.id}:${battery}`
        const fired = ship.gunsFired[battery]
        const seen = this.lastGun.get(key)
        this.lastGun.set(key, fired)
        if (seen === undefined || fired === seen) continue
        // Catch up on anything missed in a dropped frame, within reason.
        const guns = Math.min(fired - seen, 8)
        for (let i = 0; i < guns; i++) this.puffFrom(ship, battery, fired - i)
      }
    }
  }

  /** One gun's worth of smoke, placed at its station along the ship's side. */
  private puffFrom(ship: Ship, battery: 0 | 1, index: number) {
    const bearing = batteryBearing(ship, battery)
    const bx = Math.cos(bearing)
    const by = Math.sin(bearing)
    // Guns speak in sequence, so walk the station along the hull.
    const along = ((index % 6) / 5 - 0.5) * 46

    for (let i = 0; i < 3; i++) {
      // Long enough that a fight leaves a haze over the water it was fought
      // on, and a broadside is still hanging there when the next one goes.
      const life = 4 + Math.random() * 3.5
      this.smoke.push({
        x: ship.pos.x + Math.cos(ship.heading) * along + bx * 10,
        y: ship.pos.y + Math.sin(ship.heading) * along + by * 10,
        vx: bx * (40 + Math.random() * 70),
        vy: by * (40 + Math.random() * 70),
        life, maxLife: life,
        r: 4 + Math.random() * 7,
        kind: 'powder',
      })
    }
  }

  /**
   * A badly hurt hull smokes, and a worse one burns.
   *
   * The bars already say how hurt a ship is, but only for the player's own.
   * This says it about every ship, at a distance, and from the direction the
   * smoke is blowing: which of three enemies is nearly done is something the
   * player should be able to see without reading anything.
   */
  private emitDamageSmoke(ships: Ship[], dt: number) {
    for (const ship of ships) {
      if (ship.sunk || ship.hull >= SMOULDER) continue
      const hurt = 1 - ship.hull / SMOULDER
      // Always the same spot on a given ship, a little abaft the mainmast.
      const along = (((ship.id * 37) % 11) / 11 - 0.6) * 26 * ship.cls.scale
      const x = ship.pos.x + Math.cos(ship.heading) * along
      const y = ship.pos.y + Math.sin(ship.heading) * along
      // Owed puffs are carried between frames, so the plume is as thick at
      // thirty frames a second as at a hundred and forty.
      const owed = this.owed.get(ship.id) ?? { smoke: 0, flame: 0 }
      this.owed.set(ship.id, owed)
      owed.smoke += (4 + hurt * 10) * dt
      owed.flame += ship.hull < ABLAZE ? 18 * dt : 0
      for (; owed.smoke >= 1; owed.smoke--) {
        const life = 2.6 + Math.random() * 2.4
        this.smoke.push({
          x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6,
          vx: ship.vel.x * 0.5, vy: ship.vel.y * 0.5,
          life, maxLife: life, r: 2.5 + Math.random() * 3 + hurt * 2.5, kind: 'burning',
        })
      }
      for (; owed.flame >= 1; owed.flame--) {
        const life = 0.25 + Math.random() * 0.3
        this.smoke.push({
          x: x + (Math.random() - 0.5) * 9, y: y + (Math.random() - 0.5) * 7,
          vx: ship.vel.x, vy: ship.vel.y,
          life, maxLife: life, r: 2.5 + Math.random() * 3, kind: 'flame',
        })
      }
    }
  }

  private stepSmoke(wind: WindSample, dt: number) {
    const wx = Math.cos(wind.to) * 26 * wind.strength
    const wy = Math.sin(wind.to) * 26 * wind.strength
    const alive: Smoke[] = []
    for (const s of this.smoke) {
      s.life -= dt
      if (s.life <= 0) continue
      // Muzzle velocity bleeds off fast; after that the bank just drifts with
      // the wind, which quietly reinforces where the wind is coming from.
      // Flame stays with the ship it is burning; smoke is carried off.
      const pull = s.kind === 'flame' ? 0 : 2.2
      s.vx += (wx - s.vx) * pull * dt
      s.vy += (wy - s.vy) * pull * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      alive.push(s)
    }
    this.smoke = alive
  }

  private drawSmoke() {
    const g = this.smokeG
    g.clear()
    for (const s of this.smoke) {
      const t = s.life / s.maxLife
      if (s.kind === 'flame') {
        g.circle(s.x, s.y, s.r * (0.6 + t * 0.6)).fill({ color: P().combat.flash, alpha: 0.85 * t })
        g.circle(s.x, s.y, s.r * 0.45 * t).fill({ color: P().combat.flashCore, alpha: t })
        continue
      }
      // Thick as it leaves the gun, then thinning for most of its life as it
      // spreads, so the bank lingers as haze rather than as solid puffs.
      const grow = 1 + (1 - t) * 3.4
      const dark = s.kind === 'burning'
      g.circle(s.x, s.y, s.r * grow).fill({
        color: dark ? P().combat.shotCore : P().combat.splash,
        alpha: (dark ? 0.3 : 0.34) * Math.min(1, t * 1.7) * (0.35 + 0.65 * t),
      })
    }
  }

  private drawShot(projectiles: Projectile[], splashes: Splash[]) {
    const g = this.shotG
    g.clear()

    for (const p of projectiles) {
      // A short streak along the line of flight reads better than a dot. The
      // trail is scaled by speed so slower shot still draws a visible streak.
      const tail = 0.05
      const hx = p.pos.x - p.vel.x * tail
      const hy = p.pos.y - p.vel.y * tail

      // Pale underlay first: a dark ball on open water disappears at a glance,
      // and seeing an incoming volley in time is the whole point.
      g.moveTo(hx, hy).lineTo(p.pos.x, p.pos.y)
        .stroke({ width: 5.5, color: P().combat.shotHalo, alpha: 0.42 })
      g.moveTo(hx, hy).lineTo(p.pos.x, p.pos.y)
        .stroke({ width: 3, color: P().combat.shotCore, alpha: 0.92 })
      g.circle(p.pos.x, p.pos.y, 2.6).fill({ color: P().combat.shotCore, alpha: 0.95 })
    }

    for (const s of splashes) {
      const t = s.life / s.maxLife
      if (s.hit) {
        // Strike: a brief hot flash and splinters.
        g.circle(s.pos.x, s.pos.y, 6 + (1 - t) * 16)
          .fill({ color: P().combat.flash, alpha: t * 0.75 })
        g.circle(s.pos.x, s.pos.y, 2 + (1 - t) * 7)
          .fill({ color: P().combat.flashCore, alpha: t })
      } else {
        // Miss: a ring of spray where the ball fell short.
        g.circle(s.pos.x, s.pos.y, 3 + (1 - t) * 13)
          .stroke({ width: 2, color: P().combat.spray, alpha: t * 0.7 })
      }
    }
  }

  clear() {
    this.smoke = []
    this.lastGun.clear()
    this.owed.clear()
    this.smokeG.clear()
    this.shotG.clear()
  }
}
