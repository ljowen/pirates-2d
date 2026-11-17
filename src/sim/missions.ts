import type { Ship } from './ship'
import { BARQUE, BRIGANTINE, FLUYT, FRIGATE, GALLEON, MAN_OF_WAR, PINNACE, type ShipClass } from './shipClasses'
import type { Vec2 } from '../core/math'

/**
 * Work for captains on the open sea: something to do together besides
 * sinking each other.
 *
 * Three kinds, all joined by sailing into them — there is no board to sign:
 *
 *  - **Bounty.** A named ship somewhere on the chart, announced as needing
 *    N captains. Her timbers give only to company: the damage she takes is
 *    divided by how far short of N the captains engaging her are, so one
 *    captain alone on a three-captain bounty is scratching paint.
 *  - **Escort.** Merchants leave one settlement for the other and sail
 *    there on their own; raiders come out to meet them.
 *  - **Defence.** Raiders fall on a settlement. Sink them all before they
 *    beat its walls down, or it burns and is rebuilt some minutes later.
 *
 * Captains on the same mission are its crew, and a crew are allies while it
 * lasts: their guns never lay on one another and a stray ball between them
 * does no harm. Everyone else is still fair game.
 *
 * This module holds the rules and the bookkeeping. `ArenaWorld` owns the
 * ships and calls in through `MissionHost`, so neither has to know the
 * other's insides.
 */

export type MissionKind = 'bounty' | 'escort' | 'defend'
export type MissionState = 'active' | 'won' | 'lost'

/** What an AI hull is for. Captains are not in this list: they are people. */
export type AiKind = 'raider' | 'convoy' | 'bounty'

export interface Settlement {
  id: number
  name: string
  /** A point of deep water just off its shore: where ships lie and walls are hit. */
  pos: Vec2
  /** Bearing from `pos` to the land the town stands on, so it can be drawn ashore. */
  land: number
  /** An invisible, unmoving hull that stands in for the walls in the gunnery and the shot. */
  walls: Ship
  state: 'standing' | 'burning'
  /** Seconds until a burned settlement is rebuilt. */
  rebuild: number
  /** Seconds until its battery can fire again. */
  reload: number
}

export interface Mission {
  readonly id: number
  readonly kind: MissionKind
  readonly title: string
  /** Captains it takes. Only a bounty enforces it; for the others it is advice. */
  readonly need: number
  readonly reward: number
  readonly renown: number
  state: MissionState
  /** Seconds left before it ends on its own. */
  left: number
  readonly crew: Set<number>
  /** The AI hulls that belong to it: the bounty, the merchants, the raiders. */
  readonly ships: Ship[]
  readonly settlement?: Settlement
  readonly from?: Settlement
  readonly to?: Settlement
  /** Raider waves still to come, as seconds into the mission. */
  readonly waves: number[]
  /** Seconds since it began. */
  age: number
  /** Merchants that made port. */
  arrived: number
  /** Bounty only: crew engaging her now. */
  engaged: number
}

/** What the missions need from the world. */
export interface MissionHost {
  readonly time: number
  readonly bound: number
  rand(): number
  /** Captains with a hull on the water, by user id. */
  afloat(): Map<number, Ship>
  settlements: Settlement[]
  spawnAi(kind: AiKind, cls: ShipClass, at: Vec2, heading: number, mission: Mission, name?: string): Ship
  /** Somewhere open, clear of land and at least `clear` from every captain afloat. */
  openWater(near: Vec2 | null, spread: number, clear: number, cls: ShipClass): Vec2
  /** Take a hull off the sea without sinking her: a merchant in port, a bounty slipping away. */
  retire(ship: Ship): void
  pay(captain: number, plunder: number, renown: number, mission: Mission): void
  announce(mission: Mission, text: string): void
}

/** How close a captain must come to a mission to be counted in. */
export const SIGN_ON = 900
/** A settlement's raid is fought further out: its approaches count. */
const DEFEND_ZONE = 1300
/** How close a merchant must come to her destination to have made port. */
const ARRIVED = 280
const REBUILD_SECONDS = 240

const BOUNTY_NAMES = [
  'Black Gull', 'Widow\'s Due', 'Salt Hag', 'Crimson Tithe', 'Gallows Bell', 'Sea Wolf',
  'Drowned Saint', 'Iron Maiden', 'Hungry Tide', 'Grey Reaper', 'Kraken\'s Purse', 'Red Ledger',
]
/** The heavier the hull, the more captains she takes. */
const BOUNTY_HULLS: Record<number, ShipClass> = { 1: BRIGANTINE, 2: FRIGATE, 3: GALLEON, 4: MAN_OF_WAR }

export class MissionBoard {
  readonly missions: Mission[] = []
  private nextId = 1
  /** Seconds until each kind is next offered. */
  private due: Record<MissionKind, number> = { bounty: 15, escort: 60, defend: 110 }
  private escortWestward = false

  constructor(private readonly host: MissionHost) {}

  get active(): Mission[] { return this.missions.filter((m) => m.state === 'active') }

  missionOf(ship: Ship): Mission | undefined {
    return this.missions.find((m) => m.state === 'active' && m.ships.includes(ship))
  }

  /** True when these two captains are crew on some mission together. */
  allied(a: number, b: number): boolean {
    for (const m of this.missions) {
      if (m.state === 'active' && m.crew.has(a) && m.crew.has(b)) return true
    }
    return false
  }

  /** True when this captain is crew on the mission that owns `ship` (a merchant, say). */
  onMissionOf(captain: number, ship: Ship): boolean {
    const m = this.missionOf(ship)
    return !!m && m.crew.has(captain)
  }

  /** A captain has made port or gone: she is no longer anyone's crew. */
  forget(captain: number) {
    for (const m of this.missions) m.crew.delete(captain)
  }

  /** Where a mission is, for signing on and for the chart. */
  objective(m: Mission): Vec2 | null {
    if (m.kind === 'defend') return m.settlement!.pos
    const lead = m.ships.find((s) => !s.sunk && (m.kind === 'bounty' ? true : s.faction === 'convoy'))
    return lead ? lead.pos : null
  }

  /** How far along it is, 0–1, for the HUD's bar. */
  progress(m: Mission): number {
    switch (m.kind) {
      case 'bounty': {
        const target = m.ships[0]
        return target ? 1 - target.hull : 1
      }
      case 'defend':
        return m.settlement!.walls.hull
      case 'escort': {
        const lead = m.ships.find((s) => s.faction === 'convoy' && !s.sunk)
        if (!lead || !m.from || !m.to) return m.arrived > 0 ? 1 : 0
        const total = Math.hypot(m.to.pos.x - m.from.pos.x, m.to.pos.y - m.from.pos.y)
        const left = Math.hypot(m.to.pos.x - lead.pos.x, m.to.pos.y - lead.pos.y)
        return Math.max(0, Math.min(1, 1 - left / Math.max(1, total)))
      }
    }
  }

  step(dt: number) {
    const afloat = this.host.afloat()
    this.stepSettlements(dt)
    if (afloat.size > 0) this.schedule(dt, afloat.size)

    for (const m of this.active) {
      m.age += dt
      m.left -= dt
      this.signOn(m, afloat)
      switch (m.kind) {
        case 'bounty': this.stepBounty(m, afloat); break
        case 'escort': this.stepEscort(m); break
        case 'defend': this.stepDefence(m); break
      }
    }

    // Finished missions are kept a moment so the HUD can show how they ended.
    for (let i = this.missions.length - 1; i >= 0; i--) {
      const m = this.missions[i]
      if (m.state !== 'active' && m.left < -8) this.missions.splice(i, 1)
    }
  }

  // --- Offering work ------------------------------------------------------------

  private schedule(dt: number, captains: number) {
    for (const kind of ['bounty', 'escort', 'defend'] as const) {
      if (this.active.some((m) => m.kind === kind)) continue
      this.due[kind] -= dt
      if (this.due[kind] > 0) continue
      const started = this.offer(kind, captains) !== null
      // Nothing to offer (a settlement in ashes, say): look again shortly.
      this.due[kind] = started ? 90 + this.host.rand() * 90 : 20
    }
  }

  /**
   * Put a mission of this kind on the sea now, if there is one to be had.
   * The scheduler's way in, and the tests'. `need` fixes a bounty's company.
   */
  offer(kind: MissionKind, captains = 1, need?: number): Mission | null {
    if (this.active.some((m) => m.kind === kind)) return null
    return kind === 'bounty' ? this.offerBounty(captains, need)
      : kind === 'escort' ? this.offerEscort()
        : this.offerDefence()
  }

  private open(kind: MissionKind, title: string, need: number, reward: number, renown: number, left: number,
    extra: Partial<Pick<Mission, 'settlement' | 'from' | 'to'>> & { waves?: number[] } = {}): Mission {
    const m: Mission = {
      id: this.nextId++, kind, title, need, reward, renown, left, state: 'active',
      crew: new Set(), ships: [], waves: extra.waves ?? [], age: 0, arrived: 0, engaged: 0,
      settlement: extra.settlement, from: extra.from, to: extra.to,
    }
    this.missions.push(m)
    return m
  }

  private offerBounty(captains: number, fixed?: number): Mission {
    const r = this.host.rand
    const need = fixed ?? 1 + Math.floor(r() * Math.min(4, captains))
    const cls = BOUNTY_HULLS[need]
    const name = BOUNTY_NAMES[Math.floor(r() * BOUNTY_NAMES.length)]
    const m = this.open('bounty', `Bounty: the ${name}`, need, 20 * need, need, 300)
    const at = this.host.openWater(null, this.host.bound * 1.5, 1600, cls)
    this.host.spawnAi('bounty', cls, at, r() * Math.PI * 2, m, name)
    this.host.announce(m, `A bounty is posted on the ${name}, ${article(cls.name)} — ` +
      `${need === 1 ? 'any captain may take her' : `it will take ${need} captains`}`)
    return m
  }

  private offerEscort(): Mission | null {
    const [west, east] = this.host.settlements
    if (!west || !east || west.state !== 'standing' || east.state !== 'standing') return null
    this.escortWestward = !this.escortWestward
    const from = this.escortWestward ? east : west
    const to = this.escortWestward ? west : east
    const m = this.open('escort', `Escort: merchants for ${to.name}`, 2, 30, 2, 420, {
      from, to, waves: [12, 75, 150],
    })
    const heading = Math.atan2(to.pos.y - from.pos.y, to.pos.x - from.pos.x)
    const start = this.host.openWater(from.pos, 260, 0, FLUYT)
    this.host.spawnAi('convoy', FLUYT, start, heading, m, 'Merchant')
    this.host.announce(m, `Merchants are leaving ${from.name} for ${to.name} and want an escort`)
    return m
  }

  private offerDefence(): Mission | null {
    const standing = this.host.settlements.filter((s) => s.state === 'standing')
    if (standing.length === 0) return null
    const settlement = standing[Math.floor(this.host.rand() * standing.length)]
    const m = this.open('defend', `Defend ${settlement.name}`, 2, 40, 3, 360, {
      settlement, waves: [0, 70],
    })
    this.host.announce(m, `Raiders are making for ${settlement.name} — it needs defending`)
    return m
  }

  // --- Running it -------------------------------------------------------------------

  private signOn(m: Mission, afloat: Map<number, Ship>) {
    const at = this.objective(m)
    if (!at) return
    const zone = m.kind === 'defend' ? DEFEND_ZONE : SIGN_ON
    for (const [id, ship] of afloat) {
      if (m.crew.has(id)) continue
      if (Math.hypot(ship.pos.x - at.x, ship.pos.y - at.y) <= zone) m.crew.add(id)
    }
  }

  private stepBounty(m: Mission, afloat: Map<number, Ship>) {
    const target = m.ships[0]
    if (!target || target.sunk) { this.end(m, 'won', `The ${bountyName(m)} is sunk — the bounty is paid`); return }

    // Her armour answers to company. With the full number on her she takes
    // shot like any ship; with fewer, each ball is worth that much less.
    let engaged = 0
    for (const id of m.crew) {
      const ship = afloat.get(id)
      if (ship && Math.hypot(ship.pos.x - target.pos.x, ship.pos.y - target.pos.y) <= SIGN_ON) engaged++
    }
    m.engaged = engaged
    target.mods.armour = m.need / Math.max(1, Math.min(engaged, m.need))

    if (m.left <= 0) {
      this.host.retire(target)
      this.end(m, 'lost', `The ${bountyName(m)} has slipped away`)
    }
  }

  private stepEscort(m: Mission) {
    this.raiderWaves(m, () => {
      const lead = m.ships.find((s) => s.faction === 'convoy' && !s.sunk)
      if (!lead || !m.to) return null
      // Out ahead of her, across her course.
      const ahead = Math.atan2(m.to.pos.y - lead.pos.y, m.to.pos.x - lead.pos.x)
      return { x: lead.pos.x + Math.cos(ahead) * 1300, y: lead.pos.y + Math.sin(ahead) * 1300 }
    }, 2)

    for (const ship of m.ships) {
      if (ship.faction !== 'convoy' || ship.sunk || !m.to) continue
      if (Math.hypot(m.to.pos.x - ship.pos.x, m.to.pos.y - ship.pos.y) > ARRIVED) continue
      m.arrived++
      this.host.retire(ship)
    }
    // `retire` takes an arrived merchant out of `ships`, so what is left are the lost and the sailing.
    const convoy = m.ships.filter((s) => s.faction === 'convoy')
    if (m.arrived > 0 && !convoy.some((s) => !s.sunk)) {
      this.end(m, 'won', `The merchants have made ${m.to!.name}`)
    } else if (m.arrived === 0 && !convoy.some((s) => !s.sunk)) {
      this.end(m, 'lost', 'The merchants have gone to the bottom')
    } else if (m.left <= 0) {
      for (const s of convoy) this.host.retire(s)
      this.end(m, 'lost', 'The merchants have turned back')
    }
  }

  private stepDefence(m: Mission) {
    const settlement = m.settlement!
    this.raiderWaves(m, () => {
      // From the open sea, out beyond the town's own guns.
      const seaward = settlement.land + Math.PI + (this.host.rand() - 0.5) * 1.6
      return {
        x: settlement.pos.x + Math.cos(seaward) * 1700,
        y: settlement.pos.y + Math.sin(seaward) * 1700,
      }
    }, 3)

    if (settlement.state === 'burning') {
      for (const s of m.ships) if (!s.sunk) this.host.retire(s)
      this.end(m, 'lost', `${settlement.name} has fallen and is burning`)
      return
    }
    const raidersLeft = m.ships.some((s) => s.faction === 'raider' && !s.sunk)
    if (m.waves.length === 0 && !raidersLeft) this.end(m, 'won', `The raid on ${settlement.name} is beaten off`)
    else if (m.left <= 0) {
      // Nobody came: the raiders take their time and the town burns anyway.
      this.burn(settlement)
      for (const s of m.ships) if (!s.sunk) this.host.retire(s)
      this.end(m, 'lost', `${settlement.name} has fallen and is burning`)
    }
  }

  /** Send in whichever raider waves are due, `count` hulls each, more if the crew is large. */
  private raiderWaves(m: Mission, where: () => Vec2 | null, count: number) {
    while (m.waves.length > 0 && m.age >= m.waves[0]) {
      m.waves.shift()
      const at = where()
      if (!at) continue
      const n = count + Math.floor(m.crew.size / 3)
      for (let i = 0; i < n; i++) {
        const cls = RAIDERS[Math.floor(this.host.rand() * RAIDERS.length)]
        const spot = this.host.openWater(at, 420, 900, cls)
        const toward = m.kind === 'defend' ? m.settlement!.pos : at
        const heading = Math.atan2(toward.y - spot.y, toward.x - spot.x)
        this.host.spawnAi('raider', cls, spot, heading, m, 'Raider')
      }
    }
  }

  private end(m: Mission, state: 'won' | 'lost', text: string) {
    if (m.state !== 'active') return
    m.state = state
    m.left = 0
    if (state === 'won') {
      for (const captain of m.crew) this.host.pay(captain, m.reward, m.renown, m)
    }
    const paid = state === 'won' && m.crew.size > 0
      ? ` (${m.crew.size} captain${m.crew.size === 1 ? '' : 's'} paid ${m.reward} each)`
      : ''
    this.host.announce(m, text + paid)
    this.due[m.kind] = Math.max(this.due[m.kind], 60 + this.host.rand() * 60)
  }

  // --- Settlements ------------------------------------------------------------------

  /** Walls beaten down: called by the world when the stand-in sinks. */
  burn(settlement: Settlement) {
    if (settlement.state === 'burning') return
    settlement.state = 'burning'
    settlement.rebuild = REBUILD_SECONDS
    settlement.walls.hull = 0
    settlement.walls.sunk = true
  }

  private stepSettlements(dt: number) {
    for (const s of this.host.settlements) {
      if (s.state !== 'burning') continue
      s.rebuild -= dt
      if (s.rebuild > 0) continue
      s.state = 'standing'
      s.walls.sunk = false
      s.walls.hull = 1
      s.walls.sails = 1
      s.walls.crew = 1
    }
  }
}

const RAIDERS: ShipClass[] = [PINNACE, BARQUE, BARQUE, BRIGANTINE]

function article(name: string) { return /^[AEIOU]/.test(name) ? `an ${name}` : `a ${name}` }
function bountyName(m: Mission) { return m.title.replace(/^Bounty: the /, '') }
