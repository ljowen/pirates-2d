import { Ship, STOCK_MODS, type Faction } from './ship'
import { SLOOP, ENEMY_CLASSES, BARQUE, BRIGANTINE, type ShipClass } from './shipClasses'
import { Director } from './director'
import { Run } from './run'
import { dropPlunder, stepPlunder, type Plunder } from './plunder'
import { UPGRADES_BY_ID } from './upgrades'
import { makeRng } from '../core/rng'
import { T } from './tuning'
import { Wind } from './wind'
import { PolarCurve } from './polar'
import { CaptainAI } from './ai'
import {
  updateGunnery, stepProjectiles, stepSplashes,
  type Projectile, type Splash, type CombatEvents,
} from './combat'

/**
 * The simulation, with no knowledge of rendering. The player is simply ships[0]
 * and runs on exactly the same physics as everyone else — enemy captains get no
 * private relationship with the wind.
 */
const EMPTY_SHIPS: Ship[] = []

export class World {
  readonly polar = new PolarCurve()
  readonly wind = new Wind()
  readonly ships: Ship[] = []
  readonly captains = new Map<number, CaptainAI>()

  readonly director = new Director()
  private rand = makeRng(0xc0ffee)
  run = new Run(() => this.rand())

  projectiles: Projectile[] = []
  splashes: Splash[] = []
  plunder: Plunder[] = []
  /**
   * Ships that have sunk since a consumer last drained this. The simulation
   * must never depend on an external drain for its own correctness — it reads
   * a step-local list instead — but renderers and audio can miss frames, so
   * events accumulate here until explicitly taken.
   */
  private sunkEvents: Ship[] = []

  /** Player steering input for this step, in [-1, 1]. */
  steerInput = 0

  /** Which enemy class the next manual spawn will use. */
  private spawnCursor = 0

  constructor() {
    this.spawn('player', SLOOP, 0, 0, 0)
    this.run.grantStarting(this.player)
  }

  get player() { return this.ships[0] }

  get enemies() { return this.ships.filter((s) => s.faction === 'enemy' && !s.sunk) }

  spawn(faction: Faction, cls: ShipClass, x: number, y: number, heading: number): Ship {
    const ship = new Ship(this.polar)
    ship.faction = faction
    ship.cls = cls
    ship.pos = { x, y }
    ship.prevPos = { x, y }
    ship.heading = heading
    ship.prevHeading = heading
    if (faction === 'player') {
      // A baseline crew works at the pumps and the canvas. Without this,
      // attrition over a long run is one-way and the back half is unplayable.
      ship.mods.hullRepair = T.playerHullRepair
      ship.mods.sailRepair = T.playerSailRepair
      ship.mods.crewRepair = T.playerCrewRepair
    }
    this.ships.push(ship)
    if (faction === 'enemy') this.captains.set(ship.id, new CaptainAI())
    return ship
  }

  /**
   * Drop enemies around the player. Phase 3 replaces this with a director; for
   * now a manual spawn walks up the classes in order so each can be tried.
   */
  spawnWave(count = 1, cls?: ShipClass, radius = 700) {
    for (let i = 0; i < count; i++) {
      const chosen = cls ?? ENEMY_CLASSES[this.spawnCursor++ % ENEMY_CLASSES.length]
      const a = (this.ships.length + i) * 2.4
      const ship = this.spawn(
        'enemy',
        chosen,
        this.player.pos.x + Math.cos(a) * radius,
        this.player.pos.y + Math.sin(a) * radius,
        a + Math.PI,
      )
      ship.sailOrder = 2
      ship.canvas = 1
    }
  }

  /**
   * Recompute the player's modifiers from scratch: stock hull, then baseline
   * repair, then every upgrade held.
   *
   * Upgrades apply multiplicatively, so there is no way to un-apply a single
   * one — removing or changing a stack means rebuilding the whole set. Used by
   * the refit bench, and the natural home for a respec if one is ever added.
   */
  rebuildPlayerMods() {
    const player = this.player
    player.mods = { ...STOCK_MODS }
    player.mods.hullRepair = T.playerHullRepair
    player.mods.sailRepair = T.playerSailRepair
    player.mods.crewRepair = T.playerCrewRepair
    for (const [id, stacks] of this.run.taken) {
      const upgrade = UPGRADES_BY_ID.get(id)
      if (!upgrade) continue
      for (let i = 0; i < stacks; i++) upgrade.apply(player.mods)
    }
  }

  /** Take every sinking since the last call. Safe to skip frames. */
  drainSunk(): Ship[] {
    if (this.sunkEvents.length === 0) return EMPTY_SHIPS
    const out = this.sunkEvents
    this.sunkEvents = []
    return out
  }

  /** Plunder a wreck is worth, by hull. */
  private plunderValue(cls: ShipClass): number {
    if (cls === BRIGANTINE) return 14
    if (cls === BARQUE) return 5
    return 2
  }

  get bossesAlive() {
    return this.ships.filter((s) => s.isBoss && !s.sunk).length
  }

  /** Put a new hull on the horizon, clear of anyone already there. */
  private spawnAtRange(cls: ShipClass, isBoss = false) {
    const p = this.player
    const a = this.rand() * Math.PI * 2
    const r = T.spawnRadius * (0.92 + this.rand() * 0.22)
    const ship = this.spawn('enemy', cls, p.pos.x + Math.cos(a) * r, p.pos.y + Math.sin(a) * r, a + Math.PI)
    ship.sailOrder = 2
    ship.canvas = 1
    ship.isBoss = isBoss
  }

  step(dt: number) {
    this.wind.step(dt)

    // --- Run clock and spawning --------------------------------------------
    const live = this.run.tick(dt, this.player)
    if (live) {
      const wasBossWave = this.director.announcementTime
      const spawns = this.director.update(
        dt, this.run.progress, this.run.wave,
        this.enemies.length, this.bossesAlive, () => this.rand(),
      )
      // A wave that came with an announcement is a boss wave.
      const isBossWave = this.director.announcementTime > wasBossWave
      for (const cls of spawns) this.spawnAtRange(cls, isBossWave)
    }

    const player = this.player
    const enemies = this.enemies

    // --- Helm ---------------------------------------------------------------
    for (const ship of this.ships) {
      if (ship.sunk) continue
      if (ship.faction === 'enemy') {
        this.captains.get(ship.id)?.think(ship, player, this.wind, dt)
      }
    }

    // --- Sailing ------------------------------------------------------------
    for (const ship of this.ships) {
      if (ship.sunk) continue
      const steer = ship.faction === 'player' ? this.steerInput : ship.aiSteer
      ship.step(dt, this.wind, steer)
    }

    // --- Gunnery ------------------------------------------------------------
    if (!player.sunk) updateGunnery(player, enemies, this.projectiles)
    for (const ship of enemies) updateGunnery(ship, [player], this.projectiles)

    this.separate()

    // Step-local, so a sinking is accounted for exactly once no matter who is
    // or is not draining the public event list.
    const sunkThisStep: Ship[] = []
    const events: CombatEvents = { splashes: this.splashes, sunk: sunkThisStep }
    this.projectiles = stepProjectiles(this.projectiles, this.ships, dt, events)
    this.splashes = stepSplashes(this.splashes, dt)

    // --- Spoils --------------------------------------------------------------
    for (const ship of sunkThisStep) {
      if (ship.faction !== 'enemy') continue
      this.run.shipsSunk++
      dropPlunder(this.plunder, ship.pos, this.plunderValue(ship.cls), () => this.rand())
    }
    if (sunkThisStep.length) this.sunkEvents.push(...sunkThisStep)
    const swept = stepPlunder(this.plunder, this.player, this.wind, dt)
    this.plunder = swept.remaining
    this.run.collect(swept.collected)

    // Hulls that have finished going down stop being part of the simulation.
    if (this.ships.length > 24) {
      for (let i = this.ships.length - 1; i > 0; i--) {
        const s = this.ships[i]
        if (!s.sunk) continue
        this.captains.delete(s.id)
        this.ships.splice(i, 1)
      }
    }
  }

  /**
   * Hulls are solid. Without this, ships drift through each other at close
   * quarters and a knife fight stops reading as one.
   */
  private separate() {
    const MIN = 46
    for (let i = 0; i < this.ships.length; i++) {
      const a = this.ships[i]
      if (a.sunk) continue
      for (let j = i + 1; j < this.ships.length; j++) {
        const b = this.ships[j]
        if (b.sunk) continue
        const dx = b.pos.x - a.pos.x
        const dy = b.pos.y - a.pos.y
        const d = Math.hypot(dx, dy)
        if (d >= MIN || d < 1e-4) continue
        const push = (MIN - d) / 2
        const nx = dx / d
        const ny = dy / d
        a.pos.x -= nx * push
        a.pos.y -= ny * push
        b.pos.x += nx * push
        b.pos.y += ny * push
      }
    }
  }

  reset(seed = 0xc0ffee) {
    this.ships.length = 0
    this.captains.clear()
    this.projectiles = []
    this.splashes = []
    this.plunder = []
    this.sunkEvents = []
    this.spawnCursor = 0
    this.rand = makeRng(seed)
    this.run = new Run(() => this.rand())
    this.director.reset()
    this.spawn('player', SLOOP, 0, 0, 0)
    this.run.grantStarting(this.player)
  }
}
