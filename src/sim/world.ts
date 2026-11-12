import { Ship, STOCK_MODS, SAIL_FURLED, SAIL_FULL, type Faction } from './ship'
import {
  SLOOP, ENEMY_CLASSES, BARQUE, BRIGANTINE, FLUYT, FRIGATE, GALLEON, MAN_OF_WAR, ROYAL_SLOOP,
  type ShipClass,
} from './shipClasses'
import { Director } from './director'
import { Run } from './run'
import { dropPlunder, stepPlunder, type Pickup, type Plunder } from './plunder'
import { UPGRADES_BY_ID } from './upgrades'
import { applyRefits, difficultyFor, STOCK_VOYAGE, type Difficulty, type Voyage } from './voyage'
import { draughtDepth, Terrain } from './terrain'
import { makeRng } from '../core/rng'
import { angleDiff, wrapAngle, type Vec2 } from '../core/math'
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
const EMPTY_PICKUPS: Pickup[] = []

/**
 * How long a wreck stays in the world after sinking. Must outlast the
 * renderer's sinking animation, or the hull vanishes mid-plunge.
 */
const WRECK_LINGER = 3.2

/** Plunder credited for outlasting the Man-o'-War: about three early levels. */
const SLIPPED_PLUNDER = 9

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
  private pickupEvents: Pickup[] = []

  /** Player steering input for this step, in [-1, 1]. */
  steerInput = 0

  /** Which enemy class the next manual spawn will use. */
  private spawnCursor = 0

  /** The hull the captain took to sea. Chosen before the run begins. */
  playerClass: ShipClass = SLOOP
  /** What the captain carried in from earlier voyages. Fixed for the run. */
  voyage: Voyage = STOCK_VOYAGE
  private difficulty: Difficulty = difficultyFor(0)

  constructor() {
    this.placePlayerClearOfLand()
    this.run.grantStarting(this.player)
  }

  /**
   * Open the run in open water with somewhere to go, however the terrain seed
   * falls.
   *
   * Deep water is not enough on its own. Broad shoals and bars across open
   * water can between them enclose a pool this hull cannot get out of, and
   * waking up in a lagoon is the one position the player never chose — so a
   * candidate also has to have several courses that run clear to sea. The
   * spiral is a sunflower pattern, which covers ground evenly without ever
   * retracing a ring.
   */
  private placePlayerClearOfLand() {
    const ship = this.spawn('player', this.playerClass, 0, 0, 0)
    const needs = draughtDepth(ship.cls.draught)
    let best = { pos: { ...ship.pos }, ways: -1 }

    for (let i = 0; i < 96; i++) {
      const a = i * 2.39996
      const r = i === 0 ? 0 : 120 * Math.sqrt(i)
      const pos = { x: Math.cos(a) * r, y: Math.sin(a) * r }
      if (this.terrain.probe(pos).depth < 1) continue
      // Four courses clear to sea is plenty of sea room, and asking for more
      // walks a long way for no gain on a crowded seed.
      const ways = this.terrain.escapes(pos, needs)
      if (ways > best.ways) best = { pos, ways }
      if (ways >= 4) break
    }

    ship.pos = { ...best.pos }
    ship.prevPos = { ...ship.pos }

    // Lay her on a beam reach, not head to wind.
    //
    // She used to open on a fixed easterly heading, which against the mean
    // wind is close-hauled at best and *in irons* whenever the local veer
    // happened to run the wrong way. That is the one point of sail from which
    // nothing the player does works: the first thing they learn is that the
    // controls appear to be broken. A beam reach is 0.96 of best speed on the
    // polar and the easiest heading to steer from, so she is already sailing
    // before anyone has to understand why.
    //
    // Taken from the wind *where she actually is*, since the field veers by
    // place — a heading computed from the mean would land in irons again on
    // exactly the seeds this is meant to fix.
    const wind = this.windAt(ship.pos)
    const port = wrapAngle(wind.from + Math.PI / 2)
    const starboard = wrapAngle(wind.from - Math.PI / 2)
    // Both tacks are equally fast, so take the one with more water ahead of
    // her. Clear courses were checked at the position; this checks the bow.
    const waterAhead = (h: number) =>
      this.terrain.probe({
        x: ship.pos.x + Math.cos(h) * 420,
        y: ship.pos.y + Math.sin(h) * 420,
      }).depth
    ship.heading = waterAhead(starboard) > waterAhead(port) ? starboard : port
    ship.prevHeading = ship.heading
  }

  get player() { return this.ships[0] }

  get enemies() { return this.ships.filter((s) => s.faction === 'enemy' && !s.sunk && !s.struck) }

  /**
   * Enemies that actually press the player, which is what the spawn cap is
   * meant to limit. Traders are opportunities, not pressure: counting them
   * let a few fleeing Fluyts occupy the cap, crowd out killable targets, and
   * quietly starve the run of plunder and levels.
   */
  get threats() {
    return this.ships.filter(
      (s) => s.faction === 'enemy' && !s.sunk && !s.yielding &&
        s.cls.behaviour !== 'trader' && !s.isHunter,
    )
  }

  /** The Man-o'-War still on the chase, if there is one. */
  get hunter(): Ship | null {
    for (const s of this.ships) {
      if (s.isHunter && !s.sunk && !s.yielding && !s.breakingOff) return s
    }
    return null
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
      ship.mods = this.playerBaseMods(cls)
    } else {
      // Notoriety is felt here and in the director, and nowhere else: the
      // hulls are the same hulls, harder to sink and heavier of shot.
      ship.mods.armour = this.difficulty.enemyArmour
      ship.mods.damage = this.difficulty.enemyDamage
    }
    this.ships.push(ship)
    if (faction === 'enemy') this.captains.set(ship.id, new CaptainAI())
    return ship
  }

  /**
   * The player's modifiers before any card: stock, then the baseline crew at
   * the pumps, then the hull's own signature, then whatever was refitted
   * ashore. One function, because the refit bench rebuilds from here too and
   * two copies of this list had already begun to drift.
   */
  private playerBaseMods(cls: ShipClass) {
    const mods = { ...STOCK_MODS }
    // A baseline crew works at the pumps and the canvas. Without this,
    // attrition over a long run is one-way and the back half is unplayable.
    mods.hullRepair = T.playerHullRepair
    mods.sailRepair = T.playerSailRepair
    mods.crewRepair = T.playerCrewRepair
    // A hull's own signature, such as a Fluyt's roomy hold.
    if (cls.playerMods) Object.assign(mods, cls.playerMods)
    applyRefits(mods, this.voyage)
    return mods
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
      ship.sailOrder = SAIL_FULL
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
    player.mods = this.playerBaseMods(player.cls)
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
      // An island takes the way off you; it does not stop the rain. The
      // squall reading is a property of the weather, not of the local lee.
      squall: sample.squall,
    }
  }

  /** Take every sinking since the last call. Safe to skip frames. */
  drainSunk(): Ship[] {
    if (this.sunkEvents.length === 0) return EMPTY_SHIPS
    const out = this.sunkEvents
    this.sunkEvents = []
    return out
  }

  /** Take every piece collected since the last call. Safe to skip frames. */
  drainPickups(): Pickup[] {
    if (this.pickupEvents.length === 0) return EMPTY_PICKUPS
    const out = this.pickupEvents
    this.pickupEvents = []
    return out
  }

  /** Plunder a wreck is worth, by hull. */
  private plunderValue(cls: ShipClass): number {
    // A Fluyt is the prize: little threat, but her hold is worth running a
    // chase for, which is the whole reason she is in the game.
    // The hunter is the richest thing afloat, and for most of a career that
    // is academic.
    if (cls === MAN_OF_WAR) return 70
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
  private spawnAtRange(cls: ShipClass, isBoss = false, isHunter = false) {
    const p = this.player
    let a = 0
    let r = 0
    let x = 0
    let y = 0
    // Never put a hull on a beach. A handful of tries is plenty; the fallback
    // is simply the last position, which is at worst a brief grounding.
    for (let attempt = 0; attempt < 12; attempt++) {
      a = this.rand() * Math.PI * 2
      // A hunter is raised further out. She is announced as she appears, and
      // the announcement has to be worth something: at the ordinary radius a
      // captain caught on the wrong tack had her alongside before the sails
      // were up.
      r = T.spawnRadius * (0.92 + this.rand() * 0.22) * (isHunter ? 1.35 : 1)
      x = p.pos.x + Math.cos(a) * r
      y = p.pos.y + Math.sin(a) * r
      if (this.terrain.probe({ x, y }).depth > Math.max(0.9, draughtDepth(cls.draught) * 1.5)) break
    }
    const ship = this.spawn('enemy', cls, x, y, a + Math.PI)
    ship.sailOrder = SAIL_FULL
    ship.canvas = 1
    ship.isBoss = isBoss
    ship.isHunter = isHunter
    ship.huntLeft = this.difficulty.hunterSeconds
  }

  step(dt: number) {
    // Weather makes up to windward of the player: see `Weather` for why it is
    // generated around her rather than scattered over an unbounded sea.
    this.wind.step(dt, this.player.pos)

    // --- Run clock and spawning --------------------------------------------
    const live = this.run.tick(dt, this.player)
    if (live) {
      const spawns = this.director.update(
        dt, this.run.progress, this.run.wave,
        this.threats.length, this.bossesAlive, () => this.rand(),
      )
      for (const cls of spawns.hulls) this.spawnAtRange(cls, spawns.boss, spawns.hunter)
      this.hunt(dt)
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
      this.run.tally(ship.cls, false)
      if (ship.isHunter) this.run.huntersBeaten++
      // Everything she carries goes to the bottom with her, so a wreck is
      // worth markedly less than a prize taken afloat.
      dropPlunder(
        this.plunder, ship.pos,
        this.plunderValue(ship.cls) * T.sinkShare * player.mods.plunder, () => this.rand(),
      )
    }
    this.strikings()
    if (sunkThisStep.length) this.sunkEvents.push(...sunkThisStep)
    const swept = stepPlunder(this.plunder, this.player, (p) => this.windAt(p), dt)
    // Presentation drains these; the simulation never looks at them again.
    if (swept.taken.length) this.pickupEvents.push(...swept.taken)
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
    // A prize is sailed away by a prize crew once she has had a moment to
    // read as taken. Removed rather than sunk: she was not sunk.
    for (let i = this.ships.length - 1; i > 0; i--) {
      const ship = this.ships[i]
      if (!ship.struck || ship.sunk) continue
      ship.sinceStruck += dt
      if (ship.sinceStruck < T.prizeLinger) continue
      this.captains.delete(ship.id)
      this.ships.splice(i, 1)
    }

    const escapeRange = T.spawnRadius * 1.6
    for (let i = this.ships.length - 1; i > 0; i--) {
      const ship = this.ships[i]
      // A beaten ship left far astern is as good as escaped: she no longer
      // fights and can no longer be sunk, so without this she would sit on
      // the edge of the world forever.
      if (ship.sunk || ship.struck ||
          (ship.cls.behaviour !== 'trader' && !ship.breakingOff && !ship.yielding)) continue
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
   * Run the chase down.
   *
   * A hunter is on a clock rather than a leash. She does not lose interest
   * because the player got far enough away — that would make running in a
   * straight line the whole answer — she loses it because she has been out
   * for as long as her orders allow, and where the player is when that
   * happens is the player's business. Time spent stuck on a bar counts
   * double: putting her aground is the intended answer, and it should feel
   * like one.
   */
  private hunt(dt: number) {
    for (const ship of this.ships) {
      // A beaten hunter is waiting to be boarded, not running down her clock.
      if (!ship.isHunter || ship.sunk || ship.yielding || ship.breakingOff) continue
      ship.huntLeft -= dt * (ship.aground ? 2 : 1)
      if (ship.huntLeft > 0) continue
      ship.breakingOff = true
      if (this.player.sunk) continue
      this.run.huntersSlipped++
      // Running is not free: a minute spent with the wind on the quarter is a
      // minute of wrecks not made, and measured, a captain who slipped her
      // cleanly still arrived at the Brigantine two levels short and died to
      // that instead. So getting away pays about what the chase cost. It is
      // the only plunder in the game that is not fished out of the water,
      // and the reason is that there is nobody left to sink.
      this.run.collect(SLIPPED_PLUNDER)
      this.director.announce("The Man-o'-War has given up the chase", 5)
    }
  }

  /**
   * Ships that have had enough strike their colours.
   *
   * Both halves come from the *Pirates!* manual rather than invention. It says
   * a ship whose sails are destroyed is no longer under control and may give
   * up when you next come near; and its advice for taking a prize is to cut
   * the crew down with grape before boarding, because a thinned crew loses the
   * boarding action. So rigging and crew each give the player a way to take a
   * ship that is not sinking her.
   *
   * The approach matters. A dismasted ship does not surrender to an enemy
   * half a mile off; she surrenders when you come alongside and it is plain
   * there is nothing left to do. That keeps chain and grape honest — they set
   * up the capture, they do not perform it — and it means the last act of a
   * fight is a decision to close rather than a damage threshold quietly
   * passing.
   */
  private strikings() {
    const player = this.player
    if (player.sunk) return

    for (const ship of this.ships) {
      if (ship.faction !== 'enemy' || ship.sunk || ship.struck) continue
      if (!ship.yielding) continue
      const range = Math.hypot(ship.pos.x - player.pos.x, ship.pos.y - player.pos.y)
      if (range > T.boardingRange * player.mods.boarding) continue

      ship.struck = true
      ship.sinceStruck = 0
      // Her sails come down as she gives up, which is the whole visual tell.
      ship.sailOrder = SAIL_FURLED
      ship.aiSteer = 0
      this.run.tally(ship.cls, true)
      if (ship.isHunter && !ship.breakingOff) this.run.huntersBeaten++

      // The manual is blunt that capturing pays far better than sinking, since
      // a wreck takes her cargo down with her — and equally blunt that every
      // ball you put into a ship lowers what she is worth. So a prize battered
      // to the waterline is barely better than a wreck, and an intact one is
      // worth going to some trouble for.
      //
      // Her crew was tried as a second factor here — a prize has to be sailed
      // home, and a ship whose people are gone has nobody left to work her —
      // and it was reverted. Grape captures are *by definition* low-crew
      // captures, so the factor was not a trade but a flat tax on one
      // doctrine: even at a modest weight it cost that build two levels and a
      // hundred seconds of run, and dropped its plunder below taking no shot
      // card at all. Whatever separates the two doctrines has to live
      // somewhere other than the value of the prize.
      const prize = this.plunderValue(ship.cls) * T.prizeValue * (0.45 + 0.55 * ship.hull) *
        player.mods.plunder * player.mods.prize
      dropPlunder(this.plunder, ship.pos, prize, () => this.rand())
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
      const { island, distance, depth, escape } = this.terrain.probe(ship.pos)
      ship.depth = depth
      ship.aground = false

      // Shallows drag on a deep keel long before she actually touches.
      if (depth < 1) {
        const bite = T.shoalDraughtPenalty * ship.cls.draught * (1 - depth)
        const scale = Math.max(0, 1 - bite * dt)
        ship.vel.x *= scale
        ship.vel.y *= scale
      }

      // Aground when the water is shallower than she draws.
      //
      // Depth rather than distance-to-a-beach, which is what lets a bar with
      // no land in it strand a Galleon while a Pinnace sails over the top. It
      // also makes the island shoals mean something: a heavy hull now touches
      // a long way out, where before every hull could close to within a few
      // lengths of any beach.
      const needs = draughtDepth(ship.cls.draught)
      // She still cannot sail up a beach, however little she draws.
      const beached = island !== null && distance < 8
      if (depth >= needs && !beached) continue
      ship.aground = true

      // Which way the water deepens. On an island that is straight out from
      // its middle; on a bar it is across her, by the shortest way off.
      let nx = escape?.x ?? 0
      let ny = escape?.y ?? 0
      if (beached && island) {
        const dx = ship.pos.x - island.x
        const dy = ship.pos.y - island.y
        const len = Math.hypot(dx, dy) || 1
        nx = dx / len
        ny = dy / len
      }
      if (nx === 0 && ny === 0) continue

      // Speed into the shoal at the moment of contact, used to scale the
      // damage: drifting onto a bank should not cost what charging it does.
      const into = ship.vel.x * nx + ship.vel.y * ny
      const impact = Math.max(0, -into)

      // Shove her toward deeper water, hard enough to work free but not so
      // hard that touching bottom flings her off it.
      const shortfall = Math.max(0, needs - depth) / Math.max(needs, 0.01)
      const push = (beached ? 26 : 18 * shortfall) * Math.min(1, T.groundingDrag * dt)
      ship.pos.x += nx * push
      ship.pos.y += ny * push

      if (into < 0) {
        ship.vel.x -= nx * into
        ship.vel.y -= ny * into
      }

      // A bar does not tear a hull open the way a rock does: it holds her.
      // Most of what a grounding costs should be the time and the beating you
      // take while stuck, not the damage itself.
      const severity = 0.25 + 0.75 * Math.min(1, impact / 140)
      const bite = beached ? 1 : 0.45
      const died = ship.applyDamage(T.groundingDamage * severity * bite * dt, 0, 0)
      if (died) this.sunkEvents.push(ship)

      const hold = Math.max(0, 1 - T.groundingDrag * dt)
      ship.vel.x *= hold
      ship.vel.y *= hold
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

  reset(
    seed = 0xc0ffee,
    playerClass: ShipClass = this.playerClass,
    voyage: Voyage = this.voyage,
  ) {
    this.playerClass = playerClass
    this.voyage = voyage
    this.difficulty = difficultyFor(voyage.notoriety)
    this.ships.length = 0
    this.captains.clear()
    this.projectiles = []
    this.pendingShots = []
    this.splashes = []
    this.plunder = []
    this.sunkEvents = []
    this.pickupEvents = []
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
    this.run = new Run(() => this.rand(), voyage)
    this.director.reset(voyage.notoriety)
    this.placePlayerClearOfLand()
    this.run.grantStarting(this.player)
  }
}
