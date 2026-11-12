import type { World } from '../sim/world'
import { T } from '../sim/tuning'
import { SAIL_FURLED } from '../sim/ship'

const STORAGE_KEY = 'pirates2d.orders.v1'

interface Order {
  id: string
  text: string
  /** The moment this is worth saying. */
  when: (w: World, t: number) => boolean
  /** The player has done the thing, so it never needs saying again. */
  learned: (w: World) => boolean
}

/**
 * Sailing orders: the few things about this game that are not obvious, each
 * said at the moment it matters and dropped for good once the player has
 * done it.
 *
 * This is the whole tutorial. There is no separate level to play through and
 * nothing is ever paused to explain itself: a line appears under the clock
 * when it is relevant, stays while it is, and the first time the player does
 * what it says it is marked learned and stored, so a returning captain is
 * never told twice. In order of priority, so only the most pressing shows.
 */
const ORDERS: Order[] = [
  {
    id: 'aground',
    text: 'Aground. Furl sail and she will work herself off',
    when: (w) => w.player.aground,
    learned: () => false,
  },
  {
    id: 'irons',
    text: 'Too close to the wind. Turn away from it until the sails fill',
    when: (w, t) => t > 4 && w.player.canvas > 0.3 && w.player.polarMult < 0.3 && w.player.speed < 60,
    learned: (w) => w.run.elapsed > 150,
  },
  {
    id: 'prize',
    text: 'She has struck her colours. Sail alongside to take her whole',
    when: (w) => w.ships.some((s) => s.faction === 'enemy' && !s.sunk && s.yielding && !s.struck &&
      Math.hypot(s.pos.x - w.player.pos.x, s.pos.y - w.player.pos.y) < 1100),
    learned: (w) => w.run.shipsTaken > 0,
  },
  {
    id: 'plunder',
    text: 'Sail over the wreckage to haul the plunder aboard',
    when: (w) => w.plunder.length > 0,
    learned: (w) => w.run.totalPlunder > 0,
  },
  {
    id: 'mend',
    text: 'Badly hurt. Get clear, furl every sail with ↓, and the crew will mend her',
    when: (w) => w.player.hull < 0.5 && w.player.sailOrder !== SAIL_FURLED,
    learned: (w) => w.player.hull < 0.98 && w.player.sailOrder === SAIL_FURLED && w.player.speed < 25,
  },
  {
    id: 'guns',
    text: 'Turn side-on to her. Your guns fire by themselves when she is in the arc',
    when: (w) => w.enemies.some((s) =>
      Math.hypot(s.pos.x - w.player.pos.x, s.pos.y - w.player.pos.y) < T.gunRange * 1.9),
    learned: (w) => w.player.shotCount[0] + w.player.shotCount[1] >= 3,
  },
  {
    id: 'sail',
    text: '↑ make sail   ·   ← → steer   ·   keep the wind on your side or behind you',
    when: (_w, t) => t < 16,
    learned: (w) => w.run.elapsed > 6 && w.player.speed > 110,
  },
]

export class Coach {
  private readonly known = new Set<string>()
  /** How long the line now showing has been up, so it can fade in. */
  private shown = 0
  private current: string | null = null

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
      if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string') this.known.add(id)
    } catch { /* no storage, or nothing sensible in it */ }
  }

  /** The line to show now, if any, and how far it has faded in. */
  update(world: World, dt: number): { text: string; alpha: number } | null {
    if (world.run.state !== 'sailing' || world.player.sunk) { this.current = null; return null }
    let learnedNow = false
    let pick: Order | null = null
    for (const order of ORDERS) {
      if (this.known.has(order.id)) continue
      if (order.learned(world)) { this.known.add(order.id); learnedNow = true; continue }
      if (!pick && order.when(world, world.run.elapsed)) pick = order
    }
    if (learnedNow) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.known])) } catch { /* no storage */ }
    }
    if (!pick) { this.current = null; return null }
    if (pick.id !== this.current) { this.current = pick.id; this.shown = 0 }
    this.shown += dt
    return { text: pick.text, alpha: Math.min(1, this.shown / 0.4) }
  }
}
