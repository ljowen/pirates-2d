import type { World } from '../sim/world'
import type { Splash } from '../sim/combat'
import type { Audio } from './audio'
import { T } from '../sim/tuning'

/**
 * Watches the simulation and turns state changes into sound. Lives here rather
 * than in the sim or the renderer so that neither has to know audio exists —
 * the same reason the renderer detects gunfire by watching `shotCount`.
 */
export class AudioDirector {
  private readonly lastShot = new Map<string, number>()
  private readonly heard = new WeakSet<Splash>()
  private lastSailOrder = 1

  constructor(private readonly audio: Audio) {}

  update(world: World, cameraX: number, cameraY: number, halfWidth: number) {
    this.audio.beginFrame()
    this.audio.setListener(cameraX, cameraY, halfWidth)

    this.gunfire(world)
    this.impacts(world)
    this.sinkings(world)
    this.rigging(world)
    this.ambience(world)
  }

  private gunfire(world: World) {
    for (const ship of world.ships) {
      for (const battery of [0, 1] as const) {
        const key = `${ship.id}:${battery}`
        const count = ship.shotCount[battery]
        const previous = this.lastShot.get(key)
        this.lastShot.set(key, count)
        if (previous === undefined || count === previous || count === 0) continue
        const guns = Math.max(1, Math.round(T.gunsPerBroadside * ship.cls.guns))
        this.audio.cannon(ship.pos.x, ship.pos.y, guns)
      }
    }
  }

  private impacts(world: World) {
    for (const splash of world.splashes) {
      if (this.heard.has(splash)) continue
      this.heard.add(splash)
      if (splash.hit) {
        this.audio.hit(splash.pos.x, splash.pos.y, splash.victimFaction === 'player')
      } else {
        this.audio.splash(splash.pos.x, splash.pos.y)
      }
    }
  }

  private sinkings(world: World) {
    for (const ship of world.drainSunk()) {
      this.audio.sinking(ship.pos.x, ship.pos.y)
    }
  }

  private rigging(world: World) {
    const order = world.player.sailOrder
    if (order !== this.lastSailOrder) {
      this.audio.sailChange(order > this.lastSailOrder)
      this.lastSailOrder = order
    }
  }

  private ambience(world: World) {
    const p = world.player
    // Shivering canvas: sails that are up but not drawing. This is the bed that
    // lets you hear yourself sailing too close to the wind.
    const luff = p.sunk ? 0 : (1 - p.polarMult) * p.canvas
    this.audio.updateAmbience(world.wind.strength, p.speed / 200, luff)
  }

  reset() {
    this.lastShot.clear()
    // Ships start on battle sails, so a reset must not fire a rigging sound.
    this.lastSailOrder = 1
  }
}
