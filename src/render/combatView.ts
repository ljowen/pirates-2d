import { Container, Graphics } from 'pixi.js'
import type { Ship } from '../sim/ship'
import type { Projectile, Splash } from '../sim/combat'
import { batteryBearing } from '../sim/combat'
import type { Wind } from '../sim/wind'

interface Smoke { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; r: number }

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

  constructor() {
    // Smoke under the shot so balls stay legible against it.
    this.view.addChild(this.smokeG, this.shotG)
  }

  update(ships: Ship[], projectiles: Projectile[], splashes: Splash[], wind: Wind, dt: number) {
    this.emitMuzzleSmoke(ships)
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
      const life = 1.1 + Math.random() * 0.9
      this.smoke.push({
        x: ship.pos.x + Math.cos(ship.heading) * along + bx * 10,
        y: ship.pos.y + Math.sin(ship.heading) * along + by * 10,
        vx: bx * (40 + Math.random() * 70),
        vy: by * (40 + Math.random() * 70),
        life, maxLife: life,
        r: 4 + Math.random() * 7,
      })
    }
  }

  private stepSmoke(wind: Wind, dt: number) {
    const wx = Math.cos(wind.to) * 26 * wind.strength
    const wy = Math.sin(wind.to) * 26 * wind.strength
    const alive: Smoke[] = []
    for (const s of this.smoke) {
      s.life -= dt
      if (s.life <= 0) continue
      // Muzzle velocity bleeds off fast; after that the bank just drifts with
      // the wind, which quietly reinforces where the wind is coming from.
      s.vx += (wx - s.vx) * 2.2 * dt
      s.vy += (wy - s.vy) * 2.2 * dt
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
      const grow = 1 + (1 - t) * 2.4
      g.circle(s.x, s.y, s.r * grow).fill({ color: 0xd8d8d0, alpha: t * 0.34 })
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
        .stroke({ width: 5.5, color: 0xffffff, alpha: 0.42 })
      g.moveTo(hx, hy).lineTo(p.pos.x, p.pos.y)
        .stroke({ width: 3, color: 0x120d08, alpha: 0.92 })
      g.circle(p.pos.x, p.pos.y, 2.6).fill({ color: 0x120d08, alpha: 0.95 })
    }

    for (const s of splashes) {
      const t = s.life / s.maxLife
      if (s.hit) {
        // Strike: a brief hot flash and splinters.
        g.circle(s.pos.x, s.pos.y, 6 + (1 - t) * 16)
          .fill({ color: 0xffb347, alpha: t * 0.75 })
        g.circle(s.pos.x, s.pos.y, 2 + (1 - t) * 7)
          .fill({ color: 0xfff1cf, alpha: t })
      } else {
        // Miss: a ring of spray where the ball fell short.
        g.circle(s.pos.x, s.pos.y, 3 + (1 - t) * 13)
          .stroke({ width: 2, color: 0xdff2ff, alpha: t * 0.7 })
      }
    }
  }

  clear() {
    this.smoke = []
    this.lastGun.clear()
    this.smokeG.clear()
    this.shotG.clear()
  }
}
