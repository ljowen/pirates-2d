import { T } from './tuning'
import { STARTING_UPGRADES, UPGRADES_BY_ID, type Upgrade } from './upgrades'
import type { Ship } from './ship'

export type RunState = 'sailing' | 'docked' | 'won' | 'lost'

/**
 * Timed survival, funded by plunder.
 *
 * Plunder is **coin**, not experience: it buys specific parts at a shipyard
 * rather than drawing a random hand. A draft dilutes as the catalogue grows —
 * with two dozen parts and four offered, building toward a doctrine was
 * largely luck, and a trade you did not choose is only a tax. Buying what you
 * want is what makes trade-offs into decisions.
 *
 * Nothing persists between runs, so the difficulty curve has one variable.
 */
export class Run {
  elapsed = 0
  state: RunState = 'sailing'

  /** Set once the captain declines to go home and sails into the endless. */
  endless = false

  /** Coin in hand, and the total taken this voyage. */
  coins = 0
  totalCoins = 0
  shipsSunk = 0

  /** Parts fitted, by id. */
  readonly taken = new Map<string, number>()

  /** The yard she is lying in, if any. */
  dockedAt: { x: number; y: number } | null = null
  /** Parts this yard still has on the shelf. */
  stock: Upgrade[] = []
  /** Seconds before she may put in again, so casting off does not re-dock. */
  undockGrace = 0

  constructor(private readonly rand: () => number) {}

  get progress() { return Math.min(this.elapsed / T.runDuration, 1) }
  get remaining() { return Math.max(0, T.runDuration - this.elapsed) }
  get overtime() { return Math.max(0, this.elapsed - T.runDuration) }

  get wave() {
    if (!this.endless) return 0
    return Math.floor(this.overtime / T.endlessWaveSeconds) + 1
  }

  get waveProgress() {
    if (!this.endless) return this.progress
    return (this.overtime % T.endlessWaveSeconds) / T.endlessWaveSeconds
  }

  /** Apply the captain's starting parts, free of charge. */
  grantStarting(player: Ship) {
    for (const id of STARTING_UPGRADES) {
      const part = UPGRADES_BY_ID.get(id)
      if (!part) continue
      part.apply(player.mods)
      this.taken.set(part.id, (this.taken.get(part.id) ?? 0) + 1)
    }
  }

  /** Advance the clock. Returns true while the run is still live. */
  tick(dt: number, player: Ship): boolean {
    this.undockGrace = Math.max(0, this.undockGrace - dt)
    if (this.state !== 'sailing') return false

    this.elapsed += dt

    if (player.sunk) {
      this.state = 'lost'
      return false
    }
    if (!this.endless && this.elapsed >= T.runDuration) {
      this.state = 'won'
      return false
    }
    return true
  }

  collect(value: number) {
    if (value <= 0 || this.state === 'won' || this.state === 'lost') return
    this.coins += value
    this.totalCoins += value
  }

  /** What a part costs her, given how many are already aboard. */
  priceOf(part: Upgrade): number {
    const owned = this.taken.get(part.id) ?? 0
    // Each successive fitting is dearer, so a single line cannot simply be
    // bought out the moment you can afford it.
    return Math.round(part.price * (1 + owned * T.partPriceGrowth))
  }

  canAfford(part: Upgrade): boolean {
    const owned = this.taken.get(part.id) ?? 0
    return owned < part.maxStacks && this.coins >= this.priceOf(part)
  }

  /** Fit a part, if she can pay for it. */
  buy(part: Upgrade, player: Ship): boolean {
    if (!this.canAfford(part)) return false
    this.coins -= this.priceOf(part)
    part.apply(player.mods)
    this.taken.set(part.id, (this.taken.get(part.id) ?? 0) + 1)
    this.stock = this.stock.filter((p) => p !== part)
    return true
  }

  /** Put her back together. Priced by how much there is to mend. */
  repairPrice(player: Ship): number {
    const missing = (1 - player.hull) + (1 - player.sails) * 0.7 + (1 - player.crew) * 0.7
    return Math.ceil(missing * T.repairPrice)
  }

  repair(player: Ship): boolean {
    const price = this.repairPrice(player)
    if (price <= 0 || this.coins < price) return false
    this.coins -= price
    player.hull = 1
    player.sails = 1
    player.crew = 1
    return true
  }

  dock(at: { x: number; y: number }, stock: Upgrade[]) {
    if (this.state !== 'sailing') return
    this.state = 'docked'
    this.dockedAt = at
    this.stock = stock
  }

  castOff() {
    if (this.state !== 'docked') return
    this.state = 'sailing'
    this.dockedAt = null
    this.stock = []
    this.undockGrace = 4
  }

  /** Decline the safe harbour and sail on past the end of the voyage. */
  continueEndless() {
    if (this.state !== 'won') return
    this.endless = true
    this.state = 'sailing'
  }

  /** A yard's shelf: a few parts, drawn without replacement. */
  rollStock(pool: Upgrade[], count: number): Upgrade[] {
    const available = pool.slice()
    const out: Upgrade[] = []
    while (out.length < count && available.length) {
      const total = available.reduce((sum, p) => sum + p.weight, 0)
      let roll = this.rand() * total
      let index = available.length - 1
      for (let i = 0; i < available.length; i++) {
        roll -= available[i].weight
        if (roll <= 0) { index = i; break }
      }
      out.push(available[index])
      available.splice(index, 1)
    }
    return out
  }
}
