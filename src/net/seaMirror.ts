import { ArenaWorld, arenaClass } from '../sim/arena'
import { Ship } from '../sim/ship'
import { LEVELS_BY_ID } from '../sim/levels'
import { T } from '../sim/tuning'
import { angleDiff, type Vec2 } from '../core/math'
import type { Projectile, Splash } from '../sim/combat'
import type { Pickup, Plunder } from '../sim/plunder'
import type { WindState } from '../sim/wind'
import type {
  BoardRow, MissionSnap, SeaEvent, ServerMessage, SettlementSnap, ShipSnap, YouSnap,
} from './protocol'

/**
 * How far behind the server the view runs. Two snapshots' worth, so there is
 * nearly always one on each side of the moment being drawn and hulls glide
 * rather than step.
 */
const DELAY = 0.1

type Snap = Extract<ServerMessage, { t: 'snap' }>

/**
 * The open sea as this browser sees it: a copy of the server's world, made
 * from its snapshots and played back a tenth of a second behind.
 *
 * Hulls are real `Ship` objects with their state written in from the
 * snapshots, which is what lets every existing view — hulls, wakes, smoke,
 * shot, plunder, the sound — draw the open sea without knowing it is not a
 * voyage. Terrain and wind come from a local `ArenaWorld` built on the
 * server's seed, so they are the same sea by construction rather than by
 * being sent; only the wind's drift, which depends on its whole history,
 * comes over the wire.
 */
export class SeaMirror {
  /** Never stepped: it is here for the chart and the wind, built exactly as the server builds them. */
  readonly local: ArenaWorld
  readonly me: number
  ships: Ship[] = []
  projectiles: Projectile[] = []
  splashes: Splash[] = []
  plunder: Plunder[] = []
  you: YouSnap = { ship: null, respawn: 0, plunder: 0, sinkings: 0, deaths: 0 }
  board: BoardRow[] = []
  missions: MissionSnap[] = []
  settlements: SettlementSnap[] = []
  /** AI hulls' names, by ship id. */
  readonly shipNames = new Map<number, string>()
  /** Captain names by user id, for the tags over the hulls. */
  readonly names = new Map<number, string>()
  /** Which captain sails each hull, by ship id. */
  readonly captainOf = new Map<number, number>()
  /** Bumped whenever this captain is raised in a fresh hull, so the camera can cut to her. */
  raised = 0

  private snaps: Snap[] = []
  private queue: SeaEvent[] = []
  private byId = new Map<number, Ship>()
  private shot = new Map<number, Projectile>()
  private sunkEvents: Ship[] = []
  private pickupEvents: Pickup[] = []
  /** Server time minus local time, learned from the snapshots as they arrive. */
  private offset: number | null = null
  private lastPlayer: Ship

  constructor(hello: Extract<ServerMessage, { t: 'hello' }>) {
    const level = LEVELS_BY_ID.get(hello.level) ?? [...LEVELS_BY_ID.values()][0]
    this.local = new ArenaWorld(hello.seed, level)
    this.me = hello.you.id
    this.names.set(hello.you.id, hello.you.name)
    this.lastPlayer = new Ship(this.local.polar, -1)
    this.lastPlayer.faction = 'player'
    this.lastPlayer.sunk = true
  }

  get terrain() { return this.local.terrain }
  get wind() { return this.local.wind }
  get level() { return this.local.level }
  windAt(p: Vec2) { return this.local.windAt(p) }

  /** This captain's hull: afloat, going down, or the last one she had while she waits to be raised. */
  get player(): Ship { return this.lastPlayer }

  /** Every hull still in the fight that this captain's guns would lay on. */
  get enemies(): Ship[] { return this.ships.filter((s) => s.faction === 'rival' && !s.sunk) }

  /** Missions this captain is crew on, still running. */
  get mine(): MissionSnap[] {
    return this.missions.filter((m) => m.state === 'active' && m.crew.includes(this.me))
  }

  /** Whether another captain shares a mission with this one, and so is a friend for now. */
  allied(captain: number): boolean {
    return this.mine.some((m) => m.crew.includes(captain))
  }

  /** What to call a hull: her captain, or her name if a mission brought her. */
  nameOf(ship: Ship): string {
    const captain = this.captainOf.get(ship.id) ?? 0
    return captain ? this.names.get(captain) ?? '?' : this.shipNames.get(ship.id) ?? ship.cls.name
  }

  /** Whether this captain has a hull on the water right now. */
  get afloat() { return this.you.ship !== null && !this.lastPlayer.sunk }

  receive(msg: ServerMessage) {
    if (msg.t === 'snap') {
      const now = performance.now() / 1000
      const sample = msg.time - now
      // Late packets only ever make the estimate look smaller, so it jumps up
      // at once and drifts down slowly.
      if (this.offset === null || sample > this.offset) this.offset = sample
      else this.offset += (sample - this.offset) * 0.02
      // A big jump means the sea restarted (or the tab slept): start over from here.
      const last = this.snaps[this.snaps.length - 1]
      if (last && msg.time < last.time) this.snaps.length = 0
      this.snaps.push(msg)
      this.queue.push(...msg.events)
      this.you = msg.you
      this.settlements = msg.settlements
    } else if (msg.t === 'board') {
      this.board = msg.rows
      this.missions = msg.missions
      for (const row of msg.rows) this.names.set(row.id, row.name)
    }
  }

  drainSunk(): Ship[] {
    const out = this.sunkEvents
    this.sunkEvents = []
    return out
  }

  drainPickups(): Pickup[] {
    const out = this.pickupEvents
    this.pickupEvents = []
    return out
  }

  /** Bring the view up to the moment it should be showing. */
  update(dt: number) {
    if (this.offset === null || this.snaps.length === 0) return
    const t = performance.now() / 1000 + this.offset - DELAY

    // Keep the newest snapshot at or before the view, and everything after.
    while (this.snaps.length > 1 && this.snaps[1].time <= t) this.snaps.shift()
    const a = this.snaps[0]
    const b = this.snaps[1] ?? a
    const span = b.time - a.time
    const f = span > 0 ? Math.max(0, Math.min(1, (t - a.time) / span)) : 0

    this.wind.restore(lerpWind(a.wind, b.wind, f))
    this.placeShips(a, b, f)
    this.placePlunder(a)
    this.play(t, dt)
  }

  private placeShips(a: Snap, b: Snap, f: number) {
    const next = new Map(b.ships.map((s) => [s.id, s]))
    const present = new Set<number>()
    const ships: Ship[] = []

    for (const sa of a.ships) {
      const sb = next.get(sa.id) ?? sa
      let ship = this.byId.get(sa.id)
      if (!ship) {
        ship = new Ship(this.local.polar, sa.id)
        ship.cls = arenaClass(sa.k)
        this.byId.set(sa.id, ship)
        if (sa.c === this.me) this.raised++
      }
      this.captainOf.set(sa.id, sa.c)
      if (sa.n) this.shipNames.set(sa.id, sa.n)
      ship.faction = this.factionFor(sa)
      write(ship, sa, sb, f)
      present.add(sa.id)
      ships.push(ship)
      if (sa.c === this.me) this.lastPlayer = ship
    }

    for (const id of this.byId.keys()) {
      if (present.has(id)) continue
      this.byId.delete(id)
      this.captainOf.delete(id)
      this.shipNames.delete(id)
    }
    this.ships = ships
  }

  /**
   * How this captain should see a hull. The server decides who may shoot
   * whom; this only has to agree with it well enough to colour a name and
   * pick which hulls get the gun arcs and markers.
   */
  private factionFor(s: ShipSnap): string {
    switch (s.f) {
      case 'captain':
        if (s.c === this.me) return 'player'
        return this.allied(s.c) ? 'ally' : 'rival'
      case 'convoy':
        return this.mine.some((m) => m.kind === 'escort') ? 'ally' : 'neutral'
      default:
        return 'rival'
    }
  }

  private placePlunder(a: Snap) {
    const life = T.plunderLifetime
    this.plunder = a.plunder.map(([x, y, left, drawn]) => ({
      pos: { x, y }, vel: { x: 0, y: 0 }, kind: 'coin', value: 1,
      life: left * life, maxLife: life, drawn: drawn === 1,
    }))
  }

  /** Play every event the view has now reached, and fly the shot. */
  private play(t: number, dt: number) {
    for (const p of this.projectiles) {
      p.pos.x += p.vel.x * dt
      p.pos.y += p.vel.y * dt
      p.life -= dt
    }

    let i = 0
    for (; i < this.queue.length; i++) {
      const e = this.queue[i]
      if (e.at > t) break
      // Anything long past (a tab that slept) is bookkeeping only, not a show.
      const stale = t - e.at > 0.5
      switch (e.k) {
        case 'fire': {
          if (stale) break
          const late = t - e.at
          const p: Projectile = {
            pos: { x: e.x + e.vx * late, y: e.y + e.vy * late }, vel: { x: e.vx, y: e.vy },
            life: e.life - late, ownerId: 0, ownerFaction: e.owner === this.me ? 'player' : 'rival',
            damage: 0, split: { hull: 0, sails: 0, crew: 0 },
          }
          this.shot.set(e.id, p)
          this.projectiles.push(p)
          break
        }
        case 'gone': {
          const p = this.shot.get(e.id)
          this.shot.delete(e.id)
          if (p) p.life = 0
          break
        }
        case 'splash':
          if (stale) break
          this.splashes.push({
            pos: { x: e.x, y: e.y }, life: e.hit ? 0.35 : 0.5, maxLife: e.hit ? 0.35 : 0.5, hit: e.hit,
            victimFaction: e.victim === this.me ? 'player' : 'rival',
          })
          break
        case 'sunk': {
          const ship = this.byId.get(e.ship)
          if (ship && !stale) this.sunkEvents.push(ship)
          break
        }
        case 'pickup':
          if (e.captain === this.me && !stale) {
            this.pickupEvents.push({ pos: { x: e.x, y: e.y }, kind: 'coin', value: e.value })
          }
          break
      }
    }
    if (i > 0) this.queue.splice(0, i)

    this.projectiles = this.projectiles.filter((p) => p.life > 0)
    for (const [id, p] of this.shot) if (p.life <= 0) this.shot.delete(id)
    for (const s of this.splashes) s.life -= dt
    this.splashes = this.splashes.filter((s) => s.life > 0)
  }
}

function lerp(a: number, b: number, f: number) { return a + (b - a) * f }
function lerpAngle(a: number, b: number, f: number) { return a + angleDiff(b, a) * f }

function lerpWind(a: WindState, b: WindState, f: number): WindState {
  return { t: lerp(a.t, b.t, f), px: lerp(a.px, b.px, f), py: lerp(a.py, b.py, f) }
}

/** Set a mirrored hull to a moment between two snapshots of her. */
function write(ship: Ship, a: ShipSnap, b: ShipSnap, f: number) {
  // The views interpolate between prev and current themselves; this has
  // already done that, so both are the same moment.
  ship.pos = { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) }
  ship.prevPos = ship.pos
  ship.vel = { x: lerp(a.vx, b.vx, f), y: lerp(a.vy, b.vy, f) }
  ship.heading = lerpAngle(a.h, b.h, f)
  ship.prevHeading = ship.heading
  ship.heel = lerp(a.hl, b.hl, f)
  ship.prevHeel = ship.heel
  ship.rudder = lerp(a.r, b.r, f)
  ship.canvas = lerp(a.cv, b.cv, f)
  ship.awaSigned = lerpAngle(a.aw, b.aw, f)
  ship.awa = Math.abs(ship.awaSigned)
  ship.polarMult = lerp(a.pm, b.pm, f)
  // Discrete state is taken from the earlier snapshot, so nothing happens
  // before the moment it happened.
  ship.sailOrder = a.so
  ship.hull = a.hu
  ship.sails = a.sa
  ship.crew = a.cr
  ship.sunk = a.sunk
  ship.aground = a.ag
  ship.sinceHit = a.sh
  ship.blowout = a.bl
  ship.mending = a.md
  ship.gunsFired[0] = a.gf[0]; ship.gunsFired[1] = a.gf[1]
  ship.shotCount[0] = a.sc[0]; ship.shotCount[1] = a.sc[1]
  ship.sinceFired[0] = a.sf[0]; ship.sinceFired[1] = a.sf[1]
  ship.reload[0] = a.rl[0]; ship.reload[1] = a.rl[1]
}
