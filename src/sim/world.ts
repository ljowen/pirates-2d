import { Ship, STOCK_MODS, type Faction } from './ship'
import {
  SLOOP, ENEMY_CLASSES, BARQUE, BRIGANTINE, FLUYT, FRIGATE, GALLEON, ROYAL_SLOOP,
  type ShipClass,
} from './shipClasses'
import { Director } from './director'
import { Run } from './run'
import { dropPlunder, stepPlunder, type Plunder } from './plunder'
import { UPGRADES_BY_ID } from './upgrades'
import { Terrain } from './terrain'
import { makeRng } from '../core/rng'
import { angleDiff, type Vec2 } from '../core/math'
import { T } from './tuning'
import { Wind, type WindSample } from './wind'
import { PolarCurve } from './polar'
import { CaptainAI } from './ai'
import {
  updateGunnery, releasePending, stepProjectiles, stepSplashes,
  type Projectile, type PendingShot, type Splash, type CombatEvents,
} from './combat'

/**
 * The simulation, with no knowledge of rendering. The player is simply ships[0]
 * and runs on exactly the same physics as everyone else — enemy captains get no
 * private relationship with the wind.
 */
const EMPTY_SHIPS: Ship[] = []

/**
 * How long a wreck stays in the world after sinking. Must outlast the
 * renderer's sinking animation, or the hull vanishes mid-plunge.
 */
const WRECK_LINGER = 3.2

export class World {
  readonly polar = new PolarCurve()
  readonly wind = new Wind()
  readonly ships: Ship[] = []
  readonly captains = new Map<number, CaptainAI>()

  readonly terrain = new Terrain()
  readonly director = new Director()
  private rand = makeRng(0xc0ffee)
  /**
   * Gunnery draws from its own stream.
   *
   * Sharing the world PRNG meant the number of shots fired shifted every
   * later draw — spawn positions, plunder scatter, the draft — so adding
   * jitter to the ripple silently rerolled the entire run. Deterministic
   * systems need independent streams or they are not independently testable.
   */
  private gunRand = makeRng(0xc0ffee ^ 0x9e3779b9)
  run = new Run(() => this.rand())

  projectiles: Projectile[] = []
  /** Guns laid and waiting their turn in a ripple-fired broadside. */
  pendingShots: PendingShot[] = []
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

  /** The hull the captain took to sea. Chosen before the run begins. */
  playerClass: ShipClass = SLOOP

  constructor() {
    this.placePlayerClearOfLand()
    this.run.grantStarting(this.player)
  }

  /** Open the run in open water, however the terrain seed falls. */
  private placePlayerClearOfLand() {
    const ship = this.spawn('player', this.playerClass, 0, 0, 0)
    for (let i = 0; i < 64 && this.terrain.probe(ship.pos).depth < 1; i++) {
      const a = i * 2.39996
      const r = 120 * Math.sqrt(i + 1)
      ship.pos = { x: Math.cos(a) * r, y: Math.sin(a) * r }
    }
    ship.prevPos = { ...ship.pos }
  }

  get player() { return this.ships[0] }

  get enemies() { return this.ships.filter((s) => s.faction === 'enemy' && !s.sunk) }

  /**
   * Enemies that actually press the player, which is what the spawn cap is
   * meant to limit. Traders are opportunities, not pressure: counting them
   * let a few fleeing Fluyts occupy the cap, crowd out killable targets, and
   * quietly starve the run of plunder and levels.
   */
  get threats() {
    return this.ships.filter(
      (s) => s.faction === 'enemy' && !s.sunk && s.cls.behaviour !== 'trader',
    )
  }

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
      // A hull's own signature, such as a Fluyt's roomy hold.
      if (cls.playerMods) Object.assign(ship.mods, cls.playerMods)
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
    if (player.cls.playerMods) Object.assign(player.mods, player.cls.playerMods)
    for (const [id, stacks] of this.run.taken) {
      const upgrade = UPGRADES_BY_ID.get(id)
      if (!upgrade) continue
      for (let i = 0; i < stacks; i++) upgrade.apply(player.mods)
    }
  }

  /**
   * The wind at a point, including the calm an island throws downwind of
   * itself.
   *
   * `Wind` stays pure and knows nothing of terrain; the coupling lives here
   * because this is the layer that owns both. The lee is the classic sailing
   * problem — ducking behind an island shelters you from pursuit but also
   * takes the way off your own ship.
   */
  windAt(p: Vec2): WindSample {
    const sample = this.wind.at(p.x, p.y)
    if (T.windShadowStrength <= 0) return sample

    let shadow = 0
    for (const island of this.terrain.near(p)) {
      const dx = p.x - island.x
      const dy = p.y - island.y
      const dist = Math.hypot(dx, dy)
      const reach = island.radius * T.windShadowLength
      if (dist > reach || dist < 1e-3) continue

      // Only downwind of the island counts, and only within a narrowing cone.
      const bearingFromIsland = Math.atan2(dy, dx)
      const alignment = Math.cos(angleDiff(bearingFromIsland, sample.to))
      if (alignment <= 0) continue

      shadow = Math.max(shadow, alignment * alignment * (1 - dist / reach))
    }
    if (shadow <= 0) return sample

    return {
      from: sample.from,
      to: sample.to,
      strength: sample.strength * (1 - T.windShadowStrength * shadow),
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
    // A Fluyt is the prize: little threat, but her hold is worth running a
    // chase for, which is the whole reason she is in the game.
    if (cls === FLUYT) return 26
    if (cls === GALLEON) return 30
    if (cls === BRIGANTINE) return 14
    if (cls === FRIGATE) return 16
    if (cls === BARQUE) return 5
    if (cls === ROYAL_SLOOP) return 4
    return 2
  }

  get bossesAlive() {
    return this.ships.filter((s) => s.isBoss && !s.sunk).length
  }

  /** Put a new hull on the horizon, clear of anyone already there. */
  private spawnAtRange(cls: ShipClass, isBoss = false) {
    const p = this.player
    let a = 0
    let r = 0
    let x = 0
    let y = 0
    // Never put a hull on a beach. A handful of tries is plenty; the fallback
    // is simply the last position, which is at worst a brief grounding.
    for (let attempt = 0; attempt < 12; attempt++) {
      a = this.rand() * Math.PI * 2
      r = T.spawnRadius * (0.92 + this.rand() * 0.22)
      x = p.pos.x + Math.cos(a) * r
      y = p.pos.y + Math.sin(a) * r
      if (this.terrain.probe({ x, y }).depth > 0.9) break
    }
    const ship = this.spawn('enemy', cls, x, y, a + Math.PI)
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
        this.threats.length, this.bossesAlive, () => this.rand(),
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
        this.captains.get(ship.id)?.think(ship, player, this.windAt(ship.pos), this.terrain, dt)
      }
    }

    // --- Sailing ------------------------------------------------------------
    for (const ship of this.ships) {
      if (ship.sunk) continue
      const steer = ship.faction === 'player' ? this.steerInput : ship.aiSteer
      // Each hull feels the wind where she actually is.
      ship.step(dt, this.windAt(ship.pos), steer)
    }

    // --- Gunnery ------------------------------------------------------------
    const gunRand = () => this.gunRand()
    if (!player.sunk) updateGunnery(player, enemies, this.terrain, this.pendingShots, gunRand)
    for (const ship of enemies) updateGunnery(ship, [player], this.terrain, this.pendingShots, gunRand)
    this.pendingShots = releasePending(this.pendingShots, this.projectiles, dt)

    this.separate()
    this.groundings(dt)

    // Step-local, so a sinking is accounted for exactly once no matter who is
    // or is not draining the public event list.
    const sunkThisStep: Ship[] = []
    const events: CombatEvents = { splashes: this.splashes, sunk: sunkThisStep }
    this.projectiles = stepProjectiles(this.projectiles, this.ships, this.terrain, dt, events)
    this.splashes = stepSplashes(this.splashes, dt)

    // --- Spoils --------------------------------------------------------------
    for (const ship of sunkThisStep) {
      if (ship.faction !== 'enemy') continue
      this.run.shipsSunk++
      dropPlunder(this.plunder, ship.pos, this.plunderValue(ship.cls), () => this.rand())
    }
    if (sunkThisStep.length) this.sunkEvents.push(...sunkThisStep)
    const swept = stepPlunder(this.plunder, this.player, (p) => this.windAt(p), dt)
    this.plunder = swept.remaining
    // Spoils washed up on a beach would be unreachable through no fault of the
    // player, so nudge any that drift ashore back into navigable water.
    for (const piece of this.plunder) {
      const probe = this.terrain.probe(piece.pos)
      if (!probe.island || probe.distance > 0) continue
      const dx = piece.pos.x - probe.island.x
      const dy = piece.pos.y - probe.island.y
      const len = Math.hypot(dx, dy) || 1
      piece.pos.x += (dx / len) * (-probe.distance + 12)
      piece.pos.y += (dy / len) * (-probe.distance + 12)
    }
    this.run.collect(swept.collected)

    // A trader that has run far enough has got clean away, and should stop
    // being tracked — otherwise escaped prizes accumulate off-screen forever.
    const escapeRange = T.spawnRadius * 1.6
    for (let i = this.ships.length - 1; i > 0; i--) {
      const ship = this.ships[i]
      if (ship.sunk || ship.cls.behaviour !== 'trader') continue
      const away = Math.hypot(ship.pos.x - this.player.pos.x, ship.pos.y - this.player.pos.y)
      if (away < escapeRange) continue
      this.captains.delete(ship.id)
      this.ships.splice(i, 1)
    }

    // Clear wrecks once they have finished going under.
    //
    // This used to happen only when the fleet grew past 24 hulls, which left
    // sunk ships in the world indefinitely. The renderer would finish their
    // sinking animation, destroy the view, then find the ship still present
    // next frame and build a fresh view — restarting the animation forever.
    // Culling on a timer removes the cause rather than papering over it.
    for (let i = this.ships.length - 1; i > 0; i--) {
      const ship = this.ships[i]
      if (!ship.sunk) continue
      ship.sinceSunk += dt
      if (ship.sinceSunk < WRECK_LINGER) continue
      this.captains.delete(ship.id)
      this.ships.splice(i, 1)
    }
  }

  /**
   * Land stops ships, and shallows slow the deep-draughted ones. Handled here
   * rather than inside `Ship` so the hull physics stay free of any knowledge
   * of terrain — the same reason gunnery and AI live outside it.
   */
  private groundings(dt: number) {
    for (const ship of this.ships) {
      if (ship.sunk) continue
      const { island, distance, depth } = this.terrain.probe(ship.pos)
      ship.depth = depth
      ship.aground = false
      if (!island) continue

      const dx = ship.pos.x - island.x
      const dy = ship.pos.y - island.y
      const len = Math.hypot(dx, dy) || 1
      const nx = dx / len
      const ny = dy / len

      // Shallows drag on a deep keel long before she actually touches.
      if (depth < 1) {
        const bite = T.shoalDraughtPenalty * ship.cls.draught * (1 - depth)
        const scale = Math.max(0, 1 - bite * dt)
        ship.vel.x *= scale
        ship.vel.y *= scale
      }

      // Aground: the bottom has come up to meet the keel. Contact is measured
      // against the hull's half-beam, not against the shoreline itself — a
      // ship touches before her centre is over dry land, and testing for the
      // latter meant grounding could never fire at all.
      // How far out she touches depends on how deep she draws. This is what
      // makes draught a real mechanic rather than a drag modifier: a Pinnace
      // can cross water that strands a Brigantine, so leading a heavy hull
      // over a shoal is a weapon.
      const keel = 10 + 26 * ship.cls.draught
      if (distance < keel) {
        ship.aground = true

        // Speed into the shore at the moment of contact, used to scale the
        // damage: drifting onto a beach should not cost what charging it does.
        const into = ship.vel.x * nx + ship.vel.y * ny
        const impact = Math.max(0, -into)

        const push = (keel - distance) * Math.min(1, T.groundingDrag * dt)
        ship.pos.x += nx * push
        ship.pos.y += ny * push

        if (into < 0) {
          ship.vel.x -= nx * into
          ship.vel.y -= ny * into
        }

        const severity = 0.25 + 0.75 * Math.min(1, impact / 140)
        const died = ship.applyDamage(T.groundingDamage * severity * dt, 0, 0)
        if (died) this.sunkEvents.push(ship)

        const hold = Math.max(0, 1 - T.groundingDrag * dt)
        ship.vel.x *= hold
        ship.vel.y *= hold
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

  reset(seed = 0xc0ffee, playerClass: ShipClass = this.playerClass) {
    this.playerClass = playerClass
    this.ships.length = 0
    this.captains.clear()
    this.projectiles = []
    this.pendingShots = []
    this.splashes = []
    this.plunder = []
    this.sunkEvents = []
    this.spawnCursor = 0
    this.rand = makeRng(seed)
    this.gunRand = makeRng(seed ^ 0x9e3779b9)
    // The map and the weather are part of the run, not fixtures of the game.
    // Both were built once at construction and never reseeded, so every
    // voyage met the identical archipelago under the identical wind pattern —
    // a large loss of variety, and it made seeded benchmarks far less
    // representative than they appeared.
    this.terrain.reseed(seed ^ 0x5eed)
    this.wind.reseed(seed ^ 0x1234567)
    this.wind.reset()
    this.run = new Run(() => this.rand())
    this.director.reset()
    this.placePlayerClearOfLand()
    this.run.grantStarting(this.player)
  }
}
