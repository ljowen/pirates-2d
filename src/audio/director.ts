import type { World } from '../sim/world'
import type { Splash } from '../sim/combat'
import type { Audio } from './audio'
import type { Ship } from '../sim/ship'
import type { RunState } from '../sim/run'
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
  private readonly yielded = new WeakSet<Ship>()
  private readonly taken = new WeakSet<Ship>()
  private wasAground = false
  private nextScrape = 0
  private lastPlunder = 0
  private coinStep = 0
  private lastCoin = 0
  private lastState: RunState = 'sailing'
  private lastAnnouncement: string | null = null
  private readonly wasLoading: [boolean, boolean] = [false, false]
  private lastSide = 0
  private lastTime = 0
  private crackleOwed = 0

  constructor(private readonly audio: Audio) {}

  update(world: World, cameraX: number, cameraY: number, halfWidth: number) {
    this.audio.beginFrame()
    this.audio.setListener(cameraX, cameraY, halfWidth)

    this.gunfire(world)
    this.impacts(world)
    this.sinkings(world)
    this.rigging(world)
    this.prizes(world)
    this.grounding(world)
    this.fortunes(world)
    this.playerShip(world)
    this.ambience(world)
  }

  /** Enemies giving up, and enemies taken. */
  private prizes(world: World) {
    for (const ship of world.ships) {
      if (ship.faction !== 'enemy' || ship.sunk) continue
      if (ship.struck && !this.taken.has(ship)) {
        this.taken.add(ship)
        this.yielded.add(ship)
        this.audio.prize()
      } else if (ship.yielding && !this.yielded.has(ship)) {
        this.yielded.add(ship)
        this.audio.yielded()
      }
    }
  }

  /** A thud as the player takes the ground, and a scrape for as long as she sits on it. */
  private grounding(world: World) {
    const p = world.player
    const now = performance.now()
    const aground = p.aground && !p.sunk
    if (aground && !this.wasAground) {
      this.audio.aground()
      this.nextScrape = now + 700
    } else if (aground && now >= this.nextScrape) {
      this.audio.scrape()
      this.nextScrape = now + 800 + Math.random() * 500
    }
    this.wasAground = aground
  }

  /** Plunder, levels, announcements and how the voyage ended. */
  private fortunes(world: World) {
    const run = world.run
    const now = performance.now()
    if (run.plunder > this.lastPlunder && now - this.lastCoin > 70) {
      // A quick run of pieces climbs in pitch; a pause starts it again.
      this.coinStep = now - this.lastCoin < 700 ? this.coinStep + 1 : 0
      this.lastCoin = now
      this.audio.coin(this.coinStep)
    }
    this.lastPlunder = run.plunder

    if (run.state !== this.lastState) {
      if (run.state === 'drafting') this.audio.bell()
      else if (run.state === 'won') this.audio.won()
      else if (run.state === 'lost') this.audio.lost()
      this.lastState = run.state
    }

    const called = world.director.announcementTime > 0 ? world.director.announcement : null
    if (called && called !== this.lastAnnouncement) this.audio.alarm()
    this.lastAnnouncement = called
  }

  /** The player's own ship: guns loaded again, the boom coming across, and fire. */
  private playerShip(world: World) {
    const p = world.player
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.lastTime) / 1000)
    this.lastTime = now
    if (p.sunk) return

    let ready = false
    for (const battery of [0, 1] as const) {
      const loading = p.reload[battery] > 0
      if (this.wasLoading[battery] && !loading) ready = true
      this.wasLoading[battery] = loading
    }
    if (ready) this.audio.reloaded()

    // Only once the wind is clearly on the other side, as the rig is drawn.
    const lean = Math.sin(p.awaSigned)
    if (Math.abs(lean) > 0.12) {
      const side = Math.sign(lean)
      if (this.lastSide !== 0 && side !== this.lastSide && p.canvas > 0.2) this.audio.gybe()
      this.lastSide = side
    }

    if (p.hull < 0.25) {
      this.crackleOwed += 14 * dt
      for (; this.crackleOwed >= 1; this.crackleOwed--) this.audio.crackle()
    }
  }

  private gunfire(world: World) {
    for (const ship of world.ships) {
      for (const battery of [0, 1] as const) {
        const key = `${ship.id}:${battery}`
        const count = ship.shotCount[battery]
        const previous = this.lastShot.get(key)
        this.lastShot.set(key, count)
        if (previous === undefined || count === previous || count === 0) continue
        const guns = Math.max(
          1,
          Math.round(T.gunsPerBroadside * ship.cls.guns) + ship.mods.extraGuns,
        )
        this.audio.cannon(ship.pos.x, ship.pos.y, guns, T.gunVolleyScatter)
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
    // The wind the player is actually sitting in, so sailing into the lee of
    // an island is something you hear as well as feel.
    const squall = p.sunk ? 0 : world.wind.weather.sample(p.pos.x, p.pos.y).intensity
    this.audio.updateAmbience(world.windAt(p.pos).strength, p.speed / 200, luff, squall)
  }

  reset() {
    this.lastShot.clear()
    // Ships start on battle sails, so a reset must not fire a rigging sound.
    this.lastSailOrder = 1
    this.wasAground = false
    this.lastPlunder = 0
    this.coinStep = 0
    this.lastState = 'sailing'
    this.lastAnnouncement = null
    this.wasLoading[0] = this.wasLoading[1] = false
    this.lastSide = 0
    this.crackleOwed = 0
  }
}
