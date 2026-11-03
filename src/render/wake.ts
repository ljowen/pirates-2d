import { Container, Graphics } from 'pixi.js'
import { T } from '../sim/tuning'
import type { Ship } from '../sim/ship'

interface Puff { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; r: number }

/**
 * Wake and bow spray for every ship at once, drawn into a single Graphics.
 * Pure garnish, but it is most of what sells speed and turning weight — the
 * hulls barely move on screen, the water does.
 */
export class Wake {
  readonly view = new Container()
  private readonly g = new Graphics()
  private puffs: Puff[] = []
  private readonly emitters = new Map<number, number>()

  constructor() {
    this.view.addChild(this.g)
  }

  update(ships: Ship[], dt: number) {
    for (const ship of ships) {
      if (ship.sunk) continue
      const speed01 = Math.min(ship.speed / 200, 1.4)
      let acc = (this.emitters.get(ship.id) ?? 0) + dt * T.wakeRate * speed01
      while (acc >= 1) {
        acc -= 1
        this.emitStern(ship, speed01)
        if (speed01 > 0.55) this.emitBowSpray(ship, speed01)
      }
      this.emitters.set(ship.id, acc)
    }

    const alive: Puff[] = []
    for (const p of this.puffs) {
      p.life -= dt
      if (p.life <= 0) continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 1 - 1.6 * dt
      p.vy *= 1 - 1.6 * dt
      alive.push(p)
    }
    this.puffs = alive

    this.g.clear()
    for (const p of this.puffs) {
      const t = p.life / p.maxLife
      this.g.circle(p.x, p.y, p.r * (1.4 - t * 0.4)).fill({ color: 0xffffff, alpha: t * t * 0.38 })
    }
  }

  private emitStern(ship: Ship, speed01: number) {
    const bx = ship.pos.x - Math.cos(ship.heading) * 20
    const by = ship.pos.y - Math.sin(ship.heading) * 20
    const lx = -Math.sin(ship.heading)
    const ly = Math.cos(ship.heading)
    for (const side of [-1, 1]) {
      const spread = 26 + speed01 * 34
      const life = 1.5 + speed01 * 0.9
      this.puffs.push({
        x: bx + lx * side * 4,
        y: by + ly * side * 4,
        vx: lx * side * spread - Math.cos(ship.heading) * 14,
        vy: ly * side * spread - Math.sin(ship.heading) * 14,
        life, maxLife: life,
        r: 1.6 + Math.random() * 2.2,
      })
    }
  }

  private emitBowSpray(ship: Ship, speed01: number) {
    const bx = ship.pos.x + Math.cos(ship.heading) * 26
    const by = ship.pos.y + Math.sin(ship.heading) * 26
    const lx = -Math.sin(ship.heading)
    const ly = Math.cos(ship.heading)
    const side = Math.sign(ship.heel) || 1
    this.puffs.push({
      x: bx, y: by,
      vx: Math.cos(ship.heading) * 30 + lx * side * 40 * speed01,
      vy: Math.sin(ship.heading) * 30 + ly * side * 40 * speed01,
      life: 0.45, maxLife: 0.45,
      r: 1.2 + Math.random() * 2,
    })
  }

  clear() {
    this.puffs = []
    this.emitters.clear()
    this.g.clear()
  }
}
