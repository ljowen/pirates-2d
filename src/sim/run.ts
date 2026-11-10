import { T } from './tuning'
import { drawDraft, STARTING_UPGRADES, UPGRADES_BY_ID, type Upgrade } from './upgrades'
import type { Ship } from './ship'

export type RunState = 'sailing' | 'drafting' | 'won' | 'lost'

/** Plunder needed for each level. Rises steadily so later levels feel earned. */
function plunderForLevel(level: number) {
  // Deliberately shallow. Softening the spawn curve does not help on its own,
  // because fewer enemies also means less plunder and a slower draft — the two
  // curves move together. The only lever that reliably helps the player is
  // levelling faster than the sea escalates.
  return 2 + (level - 1) * 0.9
}

/**
 * Timed survival: last the full run against an escalating sea. Everything the
 * player accumulates lives here and on their `ShipMods`; nothing persists
 * between runs by design, so the difficulty curve has exactly one variable.
 */
export class Run {
  elapsed = 0
  state: RunState = 'sailing'

  /**
   * Set once the captain declines to go home. The clock stops being a finish
   * line and becomes a score: waves keep arriving, larger each time, until
   * something finally sinks you.
   */
  endless = false

  level = 1
  plunder = 0
  plunderNeeded = plunderForLevel(1)
  totalPlunder = 0
  shipsSunk = 0
  /** Ships that struck their colours and were taken rather than sunk. */
  shipsTaken = 0

  /** Cards currently on offer; non-null exactly when state is 'drafting'. */
  draft: Upgrade[] | null = null
  readonly taken = new Map<string, number>()

  constructor(private readonly rand: () => number) {}

  /** Clamped at 1: drives the ordinary difficulty curve and the progress bar. */
  get progress() { return Math.min(this.elapsed / T.runDuration, 1) }
  get remaining() { return Math.max(0, T.runDuration - this.elapsed) }

  /** Seconds survived past the end of the voyage proper. */
  get overtime() { return Math.max(0, this.elapsed - T.runDuration) }

  /** 0 during the voyage; 1, 2, 3… once endless. Each wave is harder. */
  get wave() {
    if (!this.endless) return 0
    return Math.floor(this.overtime / T.endlessWaveSeconds) + 1
  }

  /** How far through the current endless wave, 0–1. */
  get waveProgress() {
    if (!this.endless) return this.progress
    return (this.overtime % T.endlessWaveSeconds) / T.endlessWaveSeconds
  }

  /** Advance the clock. Returns true while the run is still live. */
  tick(dt: number, player: Ship): boolean {
    if (this.state !== 'sailing') return false

    this.elapsed += dt

    if (player.sunk) {
      this.state = 'lost'
      return false
    }
    // In endless the clock never runs out; only the sea stops you.
    if (!this.endless && this.elapsed >= T.runDuration) {
      this.state = 'won'
      return false
    }
    return true
  }

  /** Apply the captain's starting upgrades. Called once, after the player exists. */
  grantStarting(player: Ship) {
    for (const id of STARTING_UPGRADES) {
      const upgrade = UPGRADES_BY_ID.get(id)
      if (!upgrade) continue
      upgrade.apply(player.mods)
      this.taken.set(upgrade.id, (this.taken.get(upgrade.id) ?? 0) + 1)
    }
  }

  /** Decline the safe harbour and sail on. Only valid from a completed run. */
  continueEndless() {
    if (this.state !== 'won') return
    this.endless = true
    this.state = 'sailing'
  }

  collect(value: number) {
    if (this.state !== 'sailing' || value <= 0) return
    this.plunder += value
    this.totalPlunder += value
    if (this.plunder >= this.plunderNeeded) this.levelUp()
  }

  private levelUp() {
    this.plunder -= this.plunderNeeded
    this.level++
    this.plunderNeeded = plunderForLevel(this.level)
    const hand = drawDraft(this.taken, Math.round(T.draftCards), this.rand)
    if (hand.length === 0) {
      // Every line is maxed, so levels are cosmetic from here. They should
      // still track plunder honestly rather than stalling at one level per
      // pickup, which made the counter under-report late in a long run.
      if (this.plunder >= this.plunderNeeded) this.levelUp()
      return
    }
    this.draft = hand
    this.state = 'drafting'
  }

  /** Take one of the offered cards and return to sailing. */
  choose(upgrade: Upgrade, player: Ship) {
    if (this.state !== 'drafting') return
    upgrade.apply(player.mods)
    this.taken.set(upgrade.id, (this.taken.get(upgrade.id) ?? 0) + 1)
    this.draft = null
    this.state = 'sailing'
    // Levelling again off banked plunder chains straight into another draft.
    if (this.plunder >= this.plunderNeeded) this.levelUp()
  }
}
