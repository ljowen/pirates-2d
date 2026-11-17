import { Ship, STOCK_MODS, SAIL_FIGHTING, SAIL_STATES } from './ship'
import {
  BARQUE, BRIGANTINE, FLUYT, FRIGATE, GALLEON, MAN_OF_WAR, PINNACE, PLAYER_CLASSES, SLOOP, type ShipClass,
} from './shipClasses'
import { dropPlunder, stepPlunder, type Plunder } from './plunder'
import { draughtDepth, Terrain } from './terrain'
import { Wind } from './wind'
import { PolarCurve } from './polar'
import { LEVELS, type Level } from './levels'
import { CaptainAI } from './ai'
import { makeRng } from '../core/rng'
import { clamp, type Vec2 } from '../core/math'
import { T } from './tuning'
import {
  updateGunnery, releasePending, stepProjectiles, stepSplashes,
  type Projectile, type PendingShot, type Splash, type CombatEvents,
} from './combat'
import { groundShips, placeClearOfLand, separateShips, windWithLee } from './physics'
import { MissionBoard, type AiKind, type Mission, type MissionHost, type MissionKind, type Settlement } from './missions'

/**
 * The open sea: one chart, many captains, and the work the sea finds for
 * them.
 *
 * The voyage's `World` is built around a single player — the director, the
 * weather and the spoils all centre on her — so rather than bend it, the
 * shared sea is its own small world assembled from the same parts. What
 * decides a fight is exactly the hull physics, gunnery and terrain that
 * decide one in a voyage.
 *
 * Captains are every other captain's enemy unless a mission has made them
 * crew together (see `missions.ts`). The AI hulls that missions bring — a
 * bounty, merchants, raiders — sail with the voyage's own `CaptainAI`, and
 * the two settlements' walls are hulls that never move, so the ordinary
 * gunnery lays on them and the ordinary shot knocks them down.
 *
 * Like `World`, this knows nothing of rendering or of the network.
 */

/** Seconds a captain waits on the bottom before being raised again. */
export const RESPAWN_SECONDS = 5
/** How long a wreck stays afloat after sinking: the renderer's plunge. */
const WRECK_LINGER = 3.2
/** What every sinking of a captain puts in the water before her own hold. */
const BOUNTY = 6
/** The share of her hold a sinking captain spills. */
const SPILL = 0.5
/** A newly raised hull is placed at least this far from anyone afloat, when it can be. */
const SPAWN_CLEARANCE = 1400
/** What an AI hull spills when she goes down. */
const AI_SPOILS: Record<AiKind, number> = { raider: 5, convoy: 14, bounty: 10 }
/** A raider ignores her objective for a captain this close. */
const RAIDER_DISTRACTION = 520
/** A bounty turns on any captain this close; otherwise she wanders. */
const BOUNTY_ATTENTION = 1300
/** A settlement's battery. */
const FORT_RANGE = 640
const FORT_RELOAD = 3.2

export const ARENA_CLASSES: ShipClass[] = PLAYER_CLASSES

/**
 * The walls, as gunnery and shot see them: a large, stout target that never
 * sails. Built on a Galleon so it has every field a hull needs.
 */
const WALLS: ShipClass = { ...GALLEON, id: 'walls', name: 'Walls', hullStrength: 11, scale: 2.1 }

const SETTLEMENT_NAMES = ['Port Hallow', 'Saltmarsh']

/** Every hull that can be afloat here, by id: the captains' and the ones missions bring. */
const CLASS_BY_ID = new Map(
  [...ARENA_CLASSES, BARQUE, BRIGANTINE, FLUYT, FRIGATE, GALLEON, MAN_OF_WAR, PINNACE].map((c) => [c.id, c]),
)
export const arenaClass = (id: string): ShipClass => CLASS_BY_ID.get(id) ?? SLOOP
/** Only the hulls a captain may take out. Anything else asked for is a Sloop. */
export const captainClass = (id: string): ShipClass => ARENA_CLASSES.find((c) => c.id === id) ?? SLOOP

/** Something that happened, at a sim time, for the browsers to play back. */
export type ArenaEvent =
  | { k: 'fire'; at: number; id: number; x: number; y: number; vx: number; vy: number; life: number; owner: number }
  | { k: 'gone'; at: number; id: number }
  | { k: 'splash'; at: number; x: number; y: number; hit: boolean; victim: number }
  | { k: 'sunk'; at: number; ship: number; captain: number; by: number }
  | { k: 'pickup'; at: number; captain: number; x: number; y: number; value: number }
  | { k: 'news'; at: number; text: string; mission: MissionKind }
  | { k: 'reward'; at: number; captain: number; plunder: number; renown: number }

export interface Captain {
  readonly id: number
  readonly name: string
  /** The hull she will be raised in next. */
  cls: ShipClass
  /** Afloat, sinking, or null while waiting to be raised. */
  ship: Ship | null
  steer: number
  sail: number
  /** Seconds left on the bottom; counts only while `ship` is null or sunk. */
  respawn: number
  /** Coin aboard right now. Half of it goes over the side when she sinks. */
  plunder: number
  sinkings: number
  deaths: number
  /** Renown earned this session, from missions. */
  renown: number
}

/** An AI hull and what she is for. */
interface Crewless {
  kind: AiKind
  ai: CaptainAI
  mission: Mission
  name: string
  /** Where a bounty with nobody near is drifting to. */
  wander: Vec2
  wanderLeft: number
}

export type ShipKind = 'captain' | AiKind

export class ArenaWorld implements MissionHost {
  readonly polar = new PolarCurve()
  readonly wind = new Wind()
  readonly terrain = new Terrain()
  readonly level: Level
  readonly captains = new Map<number, Captain>()
  /** Every hull afloat or still going down, in no particular order. Walls are not hulls. */
  ships: Ship[] = []
  projectiles: Projectile[] = []
  pendingShots: PendingShot[] = []
  splashes: Splash[] = []
  plunder: Plunder[] = []
  settlements: Settlement[] = []
  readonly board: MissionBoard
  /** Sim seconds since the sea opened. */
  time = 0

  private readonly random: () => number
  private gunRand: () => number
  private events: ArenaEvent[] = []
  /** Shot are plain objects that persist from step to step, so an identity map names them. */
  private shotIds = new Map<Projectile, number>()
  private nextShotId = 1
  private shipCaptain = new Map<number, Captain>()
  private crewless = new Map<number, Crewless>()

  constructor(readonly seed: number, level: Level = LEVELS[0]) {
    this.level = level
    this.random = makeRng(seed)
    this.gunRand = makeRng(seed ^ 0x9e3779b9)
    this.terrain.load(level.map, level.size)
    this.terrain.reseed(seed ^ 0x5eed)
    this.wind.reseed(seed ^ 0x1234567)
    this.wind.reset()
    this.wind.squalls = false
    this.settlements = this.foundSettlements()
    this.board = new MissionBoard(this)
  }

  readonly rand = (): number => this.random()

  windAt(p: Vec2) {
    return windWithLee(this.wind, this.terrain, p)
  }

  /** The chart's half-width. A fixed map repeats; the open sea is one copy of it. */
  get bound() { return this.level.size > 0 ? this.level.size / 2 : 5000 }

  captainOf(ship: Ship): Captain | undefined {
    return this.shipCaptain.get(ship.id)
  }

  kindOf(ship: Ship): ShipKind {
    return this.crewless.get(ship.id)?.kind ?? 'captain'
  }

  /** An AI hull's name, for the tag over her. */
  nameOf(ship: Ship): string | undefined {
    return this.crewless.get(ship.id)?.name
  }

  /** Captains with a hull on the water, by user id. */
  afloat(): Map<number, Ship> {
    const out = new Map<number, Ship>()
    for (const c of this.captains.values()) if (c.ship && !c.ship.sunk) out.set(c.id, c.ship)
    return out
  }

  /**
   * Whether these two would fire on each other. Raiders and bounties are
   * everyone's enemy and each other's friend; merchants and walls fight only
   * raiders; captains fight every captain they are not crew with.
   */
  hostile(a: Ship, b: Ship): boolean {
    if (a === b) return false
    const ka = this.wallsOf(a) ? 'walls' : this.kindOf(a)
    const kb = this.wallsOf(b) ? 'walls' : this.kindOf(b)
    const pirate = (k: string) => k === 'raider' || k === 'bounty'
    const keeper = (k: string) => k === 'convoy' || k === 'walls'
    if (pirate(ka) && pirate(kb)) return false
    if (keeper(ka) || keeper(kb)) {
      // Only raiders go for merchants and walls; bounties keep to their own business.
      return (keeper(ka) && kb === 'raider') || (keeper(kb) && ka === 'raider')
    }
    if (ka === 'captain' && kb === 'captain') {
      const ca = this.shipCaptain.get(a.id)
      const cb = this.shipCaptain.get(b.id)
      return !ca || !cb || !this.board.allied(ca.id, cb.id)
    }
    return true
  }

  private wallsOf(ship: Ship): Settlement | undefined {
    return ship.faction === 'walls' ? this.settlements.find((s) => s.walls === ship) : undefined
  }

  // --- Captains -------------------------------------------------------------------

  /** Bring a captain to sea, or change the hull she will next be raised in. */
  join(id: number, name: string, cls: ShipClass) {
    let captain = this.captains.get(id)
    if (!captain) {
      captain = {
        id, name, cls, ship: null, steer: 0, sail: SAIL_FIGHTING,
        respawn: 0, plunder: 0, sinkings: 0, deaths: 0, renown: 0,
      }
      this.captains.set(id, captain)
    }
    const changed = captain.cls !== cls
    captain.cls = cls
    // A hull afloat is swapped at once only if she is unhurt and new to the
    // water: changing ship is not a way out of a losing fight.
    const ship = captain.ship
    if (!ship) { if (captain.respawn <= 0) this.raise(captain) }
    else if (changed && !ship.sunk && ship.hull >= 0.999 && ship.sinceHit > 30) {
      this.removeShip(ship)
      this.raise(captain)
    }
  }

  /** Back to port: her ship leaves the sea, and with her whatever she had aboard. */
  leave(id: number) {
    const captain = this.captains.get(id)
    if (!captain) return
    if (captain.ship) this.removeShip(captain.ship)
    this.captains.delete(id)
    this.board.forget(id)
  }

  setInput(id: number, steer: number, sail: number) {
    const captain = this.captains.get(id)
    if (!captain) return
    captain.steer = Number.isFinite(steer) ? clamp(steer, -1, 1) : 0
    captain.sail = Number.isFinite(sail) ? clamp(Math.round(sail), 0, SAIL_STATES.length - 1) : captain.sail
  }

  /** Everything that has happened since the last call. */
  drainEvents(): ArenaEvent[] {
    const out = this.events
    this.events = []
    return out
  }

  private removeShip(ship: Ship) {
    const i = this.ships.indexOf(ship)
    if (i >= 0) this.ships.splice(i, 1)
    const captain = this.shipCaptain.get(ship.id)
    if (captain && captain.ship === ship) captain.ship = null
    this.shipCaptain.delete(ship.id)
    this.crewless.delete(ship.id)
  }

  /**
   * A fresh hull for this captain, somewhere quiet. Several places are tried
   * and the one furthest from anyone already afloat is taken, so a captain is
   * never raised under someone else's guns.
   */
  private raise(captain: Captain) {
    const ship = new Ship(this.polar)
    ship.faction = `p${captain.id}`
    ship.cls = captain.cls
    const mods = { ...STOCK_MODS }
    mods.hullRepair = T.playerHullRepair
    mods.sailRepair = T.playerSailRepair
    mods.crewRepair = T.playerCrewRepair
    if (captain.cls.playerMods) Object.assign(mods, captain.cls.playerMods)
    ship.mods = mods
    ship.sailOrder = SAIL_FIGHTING
    captain.sail = SAIL_FIGHTING
    captain.steer = 0

    const span = this.bound * 1.6
    let best: Vec2 = { x: 0, y: 0 }
    let bestGap = -1
    for (let i = 0; i < 8; i++) {
      const at = { x: (this.rand() - 0.5) * span, y: (this.rand() - 0.5) * span }
      let gap = Infinity
      for (const other of this.ships) {
        if (other.sunk) continue
        gap = Math.min(gap, Math.hypot(other.pos.x - at.x, other.pos.y - at.y))
      }
      if (gap > bestGap) { best = at; bestGap = gap }
      if (gap >= SPAWN_CLEARANCE) break
    }
    placeClearOfLand(ship, best, this.terrain, (p) => this.windAt(p))

    captain.ship = ship
    captain.respawn = 0
    this.ships.push(ship)
    this.shipCaptain.set(ship.id, captain)
  }

  // --- What missions call ------------------------------------------------------------

  spawnAi(kind: AiKind, cls: ShipClass, at: Vec2, heading: number, mission: Mission, name = cls.name): Ship {
    const ship = new Ship(this.polar)
    ship.faction = kind
    ship.cls = cls
    ship.pos = { ...at }
    ship.prevPos = { ...at }
    ship.heading = heading
    ship.prevHeading = heading
    ship.mods = { ...STOCK_MODS }
    ship.canvas = 1
    this.ships.push(ship)
    mission.ships.push(ship)
    this.crewless.set(ship.id, {
      kind, ai: new CaptainAI(), mission, name, wander: { ...at }, wanderLeft: 0,
    })
    return ship
  }

  retire(ship: Ship) {
    const crewless = this.crewless.get(ship.id)
    if (crewless) {
      const i = crewless.mission.ships.indexOf(ship)
      if (i >= 0) crewless.mission.ships.splice(i, 1)
    }
    this.removeShip(ship)
  }

  openWater(near: Vec2 | null, spread: number, clear: number, cls: ShipClass): Vec2 {
    const b = this.bound * 0.92
    const needs = Math.max(0.9, draughtDepth(cls.draught) * 1.5)
    const afloat = [...this.afloat().values()]
    let best: Vec2 | null = null
    let bestScore = -Infinity
    for (let i = 0; i < 24; i++) {
      const c = near ?? { x: 0, y: 0 }
      const at = {
        x: clamp(c.x + (this.rand() - 0.5) * 2 * spread, -b, b),
        y: clamp(c.y + (this.rand() - 0.5) * 2 * spread, -b, b),
      }
      if (this.terrain.probe(at).depth < needs) continue
      let gap = Infinity
      for (const s of afloat) gap = Math.min(gap, Math.hypot(s.pos.x - at.x, s.pos.y - at.y))
      const score = Math.min(gap, clear)
      if (score > bestScore) { best = at; bestScore = score }
      if (gap >= clear) break
    }
    return best ?? (near ? { ...near } : { x: 0, y: 0 })
  }

  pay(captainId: number, plunder: number, renown: number) {
    const captain = this.captains.get(captainId)
    if (!captain) return
    captain.plunder += plunder
    captain.renown += renown
    this.events.push({ k: 'reward', at: this.time, captain: captainId, plunder, renown })
  }

  announce(mission: Mission, text: string) {
    this.events.push({ k: 'news', at: this.time, text, mission: mission.kind })
  }

  // --- Settlements -----------------------------------------------------------------

  /**
   * Two towns, one on each side of the chart. Each is put on the first
   * stretch of coast, searching out from the middle of its side, with deep
   * water close under it — somewhere a fight can be had — and a shore near
   * enough to stand on.
   */
  private foundSettlements(): Settlement[] {
    const b = this.bound
    const found: Settlement[] = []
    for (const [i, side] of ([-1, 1] as const).entries()) {
      let pick: { pos: Vec2; land: number } | null = null
      // A town wants an island big enough to stand on; an islet will do only if there is nothing else.
      for (const room of [260, 160, 0]) {
        search:
        for (let ring = 0; ring < 30; ring++) {
          for (const dy of ring === 0 ? [0] : [ring, -ring]) {
            for (const dx of [0, 1, -1, 2, -2]) {
              const pos = { x: side * 0.62 * b + dx * 260, y: dy * 160 }
              const probe = this.terrain.probe(pos)
              if (!probe.island || probe.island.radius < room) continue
              if (probe.depth < 1 || probe.distance < 70 || probe.distance > 300) continue
              const q = this.terrain.local(pos)
              pick = { pos, land: Math.atan2(probe.island.y - q.y, probe.island.x - q.x) }
              break search
            }
          }
        }
        if (pick) break
      }
      // A chart with no coast where one was wanted still gets its town, at sea.
      pick ??= { pos: { x: side * 0.62 * b, y: 0 }, land: side > 0 ? 0 : Math.PI }

      const walls = new Ship(this.polar)
      walls.faction = 'walls'
      walls.cls = WALLS
      walls.pos = { ...pick.pos }
      walls.prevPos = { ...pick.pos }
      walls.heading = pick.land + Math.PI / 2
      walls.mods = { ...STOCK_MODS }
      found.push({
        id: i + 1, name: SETTLEMENT_NAMES[i], pos: pick.pos, land: pick.land,
        walls, state: 'standing', rebuild: 0, reload: 0,
      })
    }
    return found
  }

  /** A settlement's guns: a few balls at the nearest raider in reach, on a slow reload. */
  private fortGuns(dt: number) {
    for (const s of this.settlements) {
      s.reload = Math.max(0, s.reload - dt)
      if (s.state !== 'standing' || s.reload > 0) continue
      let target: Ship | null = null
      let best = FORT_RANGE
      for (const ship of this.ships) {
        if (ship.sunk || this.kindOf(ship) !== 'raider') continue
        const d = Math.hypot(ship.pos.x - s.pos.x, ship.pos.y - s.pos.y)
        if (d < best) { best = d; target = ship }
      }
      if (!target) continue
      s.reload = FORT_RELOAD
      const lead = best / T.ballSpeed
      for (let i = 0; i < 3; i++) {
        const aim = Math.atan2(
          target.pos.y + target.vel.y * lead - s.pos.y,
          target.pos.x + target.vel.x * lead - s.pos.x,
        ) + (this.gunRand() - 0.5) * 0.12
        this.projectiles.push({
          pos: { x: s.pos.x, y: s.pos.y },
          vel: { x: Math.cos(aim) * T.ballSpeed, y: Math.sin(aim) * T.ballSpeed },
          life: (FORT_RANGE * 1.15) / T.ballSpeed,
          ownerId: s.walls.id,
          ownerFaction: 'walls',
          damage: T.damagePerBall * 0.55,
          split: { hull: 0.62, sails: 0.25, crew: 0.13 },
        })
      }
    }
  }

  // --- AI helms ----------------------------------------------------------------------

  /** Choose what each AI hull is after this step, and let her captain think about it. */
  private helms(dt: number) {
    const afloat = [...this.afloat().values()]
    const nearestHostile = (ship: Ship, within: number, among: Ship[]) => {
      let best: Ship | null = null
      let bestD = within
      for (const other of among) {
        if (other.sunk || !this.hostile(ship, other)) continue
        const d = Math.hypot(other.pos.x - ship.pos.x, other.pos.y - ship.pos.y)
        if (d < bestD) { bestD = d; best = other }
      }
      return best
    }

    for (const ship of this.ships) {
      const c = this.crewless.get(ship.id)
      if (!c || ship.sunk) continue
      const wind = this.windAt(ship.pos)
      const m = c.mission

      switch (c.kind) {
        case 'convoy': {
          const to = m.to
          if (to) c.ai.think(ship, to.walls, wind, this.terrain, dt, 'make-for')
          break
        }
        case 'raider': {
          // A captain who comes close is dealt with first; otherwise the job.
          const captain = nearestHostile(ship, RAIDER_DISTRACTION, afloat)
          let target: Ship | null = captain
          if (!target && m.kind === 'defend' && m.settlement?.state === 'standing') target = m.settlement.walls
          if (!target) {
            target = m.ships.find((s) => !s.sunk && this.kindOf(s) === 'convoy') ??
              nearestHostile(ship, Infinity, afloat)
          }
          if (target) c.ai.think(ship, target, wind, this.terrain, dt)
          else { ship.aiSteer = 0 }
          break
        }
        case 'bounty': {
          const target = nearestHostile(ship, BOUNTY_ATTENTION, afloat)
          if (target) { c.ai.think(ship, target, wind, this.terrain, dt); break }
          // Nobody near: she cruises from one point to another.
          c.wanderLeft -= dt
          if (c.wanderLeft <= 0 || Math.hypot(c.wander.x - ship.pos.x, c.wander.y - ship.pos.y) < 300) {
            c.wander = this.openWater(ship.pos, 1800, 0, ship.cls)
            c.wanderLeft = 60
          }
          WAYPOINT.pos = c.wander
          c.ai.think(ship, WAYPOINT, wind, this.terrain, dt, 'make-for')
          // Cruising, not racing: she should be catchable.
          if (ship.sailOrder > SAIL_FIGHTING) ship.sailOrder = SAIL_FIGHTING
          break
        }
      }
    }
  }

  // --- The step -------------------------------------------------------------------------

  step(dt: number) {
    this.time += dt
    this.wind.step(dt)

    // --- Captains waiting on the bottom ---------------------------------------
    for (const captain of this.captains.values()) {
      if (captain.ship && !captain.ship.sunk) continue
      captain.respawn = Math.max(0, captain.respawn - dt)
      if (captain.respawn <= 0 && !captain.ship) this.raise(captain)
    }

    this.board.step(dt)
    this.helms(dt)

    // --- Sailing ----------------------------------------------------------------
    for (const ship of this.ships) {
      if (ship.sunk) continue
      const captain = this.shipCaptain.get(ship.id)
      if (captain) ship.sailOrder = captain.sail
      ship.step(dt, this.windAt(ship.pos), captain ? captain.steer : ship.aiSteer)
    }

    // --- Gunnery: each hull on whoever she is at odds with -----------------------
    const walls = this.settlements.filter((s) => s.state === 'standing').map((s) => s.walls)
    const targets = [...this.ships.filter((s) => !s.sunk), ...walls]
    const gunRand = () => this.gunRand()
    for (const ship of this.ships) {
      if (ship.sunk) continue
      updateGunnery(ship, targets.filter((t) => this.hostile(ship, t)), this.terrain, this.pendingShots, gunRand)
    }
    const before = this.projectiles.length
    this.pendingShots = releasePending(this.pendingShots, this.projectiles, dt)
    this.fortGuns(dt)
    for (let i = before; i < this.projectiles.length; i++) {
      const p = this.projectiles[i]
      const id = this.nextShotId++
      this.shotIds.set(p, id)
      const owner = this.shipCaptain.get(p.ownerId)?.id ?? 0
      this.events.push({
        k: 'fire', at: this.time, id, x: p.pos.x, y: p.pos.y, vx: p.vel.x, vy: p.vel.y, life: p.life, owner,
      })
    }

    separateShips(this.ships)
    const sunkThisStep: Ship[] = []
    groundShips(this.ships, this.terrain, dt, (ship) => sunkThisStep.push(ship))
    this.keepOnChart()

    // --- Shot -------------------------------------------------------------------
    const kills: { victim: Ship; by: number }[] = []
    const splashesBefore = this.splashes.length
    const events: CombatEvents = { splashes: this.splashes, sunk: sunkThisStep, kills }
    const flying = this.projectiles
    const everyone = [...this.ships, ...walls]
    const byId = new Map(everyone.map((s) => [s.id, s]))
    // A ball between two ships that are not at odds does nobody any harm.
    const spares = (ownerId: number, victim: Ship) => {
      const owner = byId.get(ownerId)
      return !!owner && !this.hostile(owner, victim)
    }
    this.projectiles = stepProjectiles(flying, everyone, this.terrain, dt, events, spares)
    if (this.projectiles.length !== flying.length) {
      const alive = new Set(this.projectiles)
      for (const p of flying) {
        if (alive.has(p)) continue
        const id = this.shotIds.get(p)
        this.shotIds.delete(p)
        if (id !== undefined) this.events.push({ k: 'gone', at: this.time, id })
      }
    }
    for (let i = splashesBefore; i < this.splashes.length; i++) {
      const s = this.splashes[i]
      const victim = s.victimFaction?.startsWith('p') ? Number(s.victimFaction.slice(1)) : 0
      this.events.push({ k: 'splash', at: this.time, x: s.pos.x, y: s.pos.y, hit: s.hit, victim })
    }
    this.splashes = stepSplashes(this.splashes, dt)

    // --- Sinkings -----------------------------------------------------------------
    const killer = new Map(kills.map((k) => [k.victim, k.by]))
    for (const ship of new Set(sunkThisStep)) {
      const settlement = this.wallsOf(ship)
      if (settlement) { this.board.burn(settlement); continue }

      const captain = this.shipCaptain.get(ship.id)
      const byShip = killer.get(ship)
      const by = byShip !== undefined ? this.shipCaptain.get(byShip) : undefined
      if (by && by !== captain) by.sinkings++
      const ai = this.crewless.get(ship.id)
      let spill = 0
      if (captain) {
        captain.deaths++
        captain.respawn = RESPAWN_SECONDS
        spill = BOUNTY + captain.plunder * SPILL
        captain.plunder -= captain.plunder * SPILL
      } else if (ai) {
        spill = AI_SPOILS[ai.kind]
      }
      dropPlunder(this.plunder, ship.pos, spill, () => this.rand())
      this.events.push({
        k: 'sunk', at: this.time, ship: ship.id, captain: captain?.id ?? 0, by: by?.id ?? 0,
      })
    }

    this.stepSpoils(dt)

    // --- Wrecks go under, and their captains wait to be raised ----------------------
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const ship = this.ships[i]
      if (!ship.sunk) continue
      ship.sinceSunk += dt
      if (ship.sinceSunk >= WRECK_LINGER) this.removeShip(ship)
    }
  }

  /**
   * Plunder goes to whoever is nearest. Each piece is handed to its nearest
   * captain's ordinary sweep, so magnets, pick-up radii and drift are exactly
   * a voyage's — and a piece nobody is near simply drifts, as it does there.
   */
  private stepSpoils(dt: number) {
    if (this.plunder.length === 0) return
    const afloat = [...this.afloat().values()]
    const groups = new Map<Ship | null, Plunder[]>()
    for (const piece of this.plunder) {
      let nearest: Ship | null = null
      let best = Infinity
      for (const ship of afloat) {
        const d = Math.hypot(ship.pos.x - piece.pos.x, ship.pos.y - piece.pos.y)
        if (d < best) { best = d; nearest = ship }
      }
      // Beyond any magnet, nobody's: it drifts on its own.
      if (best > T.plunderMagnetRadius * 3) nearest = null
      const group = groups.get(nearest)
      if (group) group.push(piece)
      else groups.set(nearest, [piece])
    }

    const remaining: Plunder[] = []
    const windAt = (p: Vec2) => this.windAt(p)
    for (const [ship, pieces] of groups) {
      // A drifting piece still needs a hull to measure from; a sunk dummy
      // collects nothing and leaves it to the wind.
      const sweeper = ship ?? DRIFT
      const swept = stepPlunder(pieces, sweeper, windAt, dt)
      remaining.push(...swept.remaining)
      if (!ship || swept.collected <= 0) continue
      const captain = this.shipCaptain.get(ship.id)
      if (!captain) continue
      captain.plunder += swept.collected
      for (const piece of swept.taken) {
        this.events.push({
          k: 'pickup', at: this.time, captain: captain.id, x: piece.pos.x, y: piece.pos.y, value: piece.value,
        })
      }
    }
    this.plunder = remaining
  }

  /**
   * The chart has edges. A fixed map repeats forever, and captains who sailed
   * off it in opposite directions would never meet again, so the open sea is
   * one copy of it and the edge holds a hull like a lee shore.
   */
  private keepOnChart() {
    const b = this.bound
    for (const ship of this.ships) {
      if (ship.sunk) continue
      if (ship.pos.x > b) { ship.pos.x = b; ship.vel.x = Math.min(0, ship.vel.x) }
      if (ship.pos.x < -b) { ship.pos.x = -b; ship.vel.x = Math.max(0, ship.vel.x) }
      if (ship.pos.y > b) { ship.pos.y = b; ship.vel.y = Math.min(0, ship.vel.y) }
      if (ship.pos.y < -b) { ship.pos.y = -b; ship.vel.y = Math.max(0, ship.vel.y) }
    }
  }
}

/** A hull that is never afloat, for plunder no captain is near. */
const DRIFT = (() => {
  const ship = new Ship(new PolarCurve())
  ship.sunk = true
  return ship
})()

/** A point to sail for, shaped as a hull because that is what a captain's mind takes. */
const WAYPOINT = new Ship(new PolarCurve(), -2)
