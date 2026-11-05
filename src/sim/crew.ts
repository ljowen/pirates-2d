import { clamp } from '../core/math'

/**
 * Where the hands are working.
 *
 * A finite crew spread across four stations, and the split is a live dial
 * rather than a loadout: all hands to the sails to run for port, then back to
 * the guns when you turn and fight. Moving them takes a few seconds, so it is
 * a decision rather than a toggle.
 *
 * This is also what finally gives crew casualties weight. Losing hands thins
 * *every* station at once, so grape shot degrades the whole ship rather than
 * nudging one number.
 */
export type Station = 'gunnery' | 'sails' | 'helm' | 'repairs'

export const STATIONS: Station[] = ['gunnery', 'sails', 'helm', 'repairs']

/** An even four-way split, which is the tuning baseline for every ship. */
const EVEN = 1 / STATIONS.length

export class CrewStations {
  /** Where the captain wants them. Shares, summing to 1. */
  readonly target: Record<Station, number> =
    { gunnery: EVEN, sails: EVEN, helm: EVEN, repairs: EVEN }

  /** Where they actually are. Eases toward the target as they move. */
  readonly current: Record<Station, number> =
    { gunnery: EVEN, sails: EVEN, helm: EVEN, repairs: EVEN }

  /** Set one station's share, taking the difference from the others pro rata. */
  assign(station: Station, share: number) {
    const wanted = clamp(share, 0, 1)
    const others = STATIONS.filter((s) => s !== station)
    const remaining = 1 - wanted
    const othersTotal = others.reduce((sum, s) => sum + this.target[s], 0)

    this.target[station] = wanted
    for (const s of others) {
      // Keep the relative balance of everyone else intact.
      this.target[s] = othersTotal > 1e-6
        ? (this.target[s] / othersTotal) * remaining
        : remaining / others.length
    }
  }

  /** Hands take time to cross the deck. */
  step(dt: number, rate: number) {
    for (const s of STATIONS) {
      const delta = this.target[s] - this.current[s]
      const move = Math.sign(delta) * Math.min(Math.abs(delta), rate * dt)
      this.current[s] += move
    }
    // Floating-point drift would slowly break the invariant, so renormalise.
    const total = STATIONS.reduce((sum, s) => sum + this.current[s], 0)
    if (total > 1e-6) for (const s of STATIONS) this.current[s] /= total
  }

  /**
   * How well a station is worked, where 1.0 is an even split at full strength.
   *
   * Square-rooted so doubling a station's hands is worth about 40% rather
   * than 100% — concentrating everyone on the guns should be a real choice,
   * not an obvious one.
   *
   * @param health the ship's crew condition, 0–1
   */
  manning(station: Station, health: number): number {
    const share = this.current[station] / EVEN
    return clamp(Math.sqrt(share * Math.max(health, 0.05)), 0.3, 1.9)
  }

  reset() {
    for (const s of STATIONS) {
      this.target[s] = EVEN
      this.current[s] = EVEN
    }
  }
}
