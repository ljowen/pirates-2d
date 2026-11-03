import { T } from './tuning'
import { PINNACE, BARQUE, BRIGANTINE, type ShipClass } from './shipClasses'
import { clamp, lerp } from '../core/math'

export interface BossWave { at: number; hulls: ShipClass[]; label: string }

/**
 * Boss waves punctuate the run. The Brigantine is a fair fight against a stock
 * ship, so its first appearance is placed late enough that the draft has had
 * time to matter.
 *
 * Escalation adds *escorts* rather than more Brigantines. Multiplying a fair
 * fight does not scale: a Brigantine stays dangerous however strong the player
 * gets, so two of them was a wall every run broke on — and because suppression
 * only stops new spawns rather than clearing the sea, "two Brigantines" in
 * practice meant two Brigantines plus whatever was already in pursuit.
 */
export const BOSS_WAVES: BossWave[] = [
  { at: 0.34, hulls: [BRIGANTINE], label: 'A Brigantine stands out to meet you' },
  { at: 0.60, hulls: [BRIGANTINE, BARQUE, BARQUE], label: 'A Brigantine and her escorts' },
  { at: 0.88, hulls: [BRIGANTINE, BRIGANTINE, BARQUE, BARQUE], label: 'The squadron has found you' },
]

/**
 * Decides what the sea throws at you and when. Everything is expressed against
 * run progress rather than absolute seconds, so changing the run length in the
 * tuner rescales the whole curve instead of breaking it.
 */
export class Director {
  private cooldown = 2
  private firedBosses = new Set<number>()
  private lastEndlessWave = 0
  /** Set when a boss wave lands, drained by the HUD for its announcement. */
  announcement: string | null = null
  announcementTime = 0

  /**
   * Hull mix over the run. Barques are held back deliberately: two of them
   * will sink a stock ship, so they must not arrive before the draft has.
   */
  private weights(progress: number, wave: number): [ShipClass, number][] {
    // Past the voyage proper the mix keeps sliding toward heavy hulls, so the
    // sea does not merely get busier — it gets meaner.
    const heavy = Math.min(wave * 0.18, 0.75)
    return [
      [PINNACE, Math.max(0.06, lerp(1, 0.25, progress) - heavy)],
      [BARQUE, (progress < 0.22 ? 0 : clamp((progress - 0.22) * 1.2, 0, 0.55)) + heavy * 0.5],
      [BRIGANTINE, (progress < 0.62 ? 0 : clamp((progress - 0.62) * 0.4, 0, 0.14)) + heavy],
    ]
  }

  interval(progress: number, wave = 0) {
    const base = lerp(T.spawnIntervalStart, T.spawnIntervalEnd, progress)
    if (wave <= 0) return base
    return Math.max(T.endlessMinInterval, base / (1 + wave * T.endlessRamp))
  }

  cap(progress: number, wave = 0) {
    const base = lerp(T.enemyCapStart, T.enemyCapEnd, progress)
    return Math.round(base + Math.max(0, wave) * T.endlessCapGrowth)
  }

  /**
   * The squadron sent against you at the start of each endless wave. Counts are
   * capped so the spawn ring never becomes a solid wall of hulls — past a
   * point, more ships stop adding difficulty and just add lag.
   */
  private endlessSquadron(wave: number): ShipClass[] {
    const brigs = Math.min(1 + Math.floor(wave / 2), 4)
    const barques = Math.min(wave, 4)
    return [
      ...Array.from({ length: brigs }, () => BRIGANTINE),
      ...Array.from({ length: barques }, () => BARQUE),
    ]
  }

  /**
   * Returns the hulls to spawn this step. The world does the placing — the
   * director only decides what and how many.
   */
  update(
    dt: number,
    progress: number,
    wave: number,
    aliveEnemies: number,
    bossesAlive: number,
    rand: () => number,
  ): ShipClass[] {
    this.announcementTime = Math.max(0, this.announcementTime - dt)

    // --- Endless waves ------------------------------------------------------
    if (wave > 0 && wave !== this.lastEndlessWave) {
      this.lastEndlessWave = wave
      this.announcement = wave === 1
        ? 'You sail on. They are still coming.'
        : `Wave ${wave} — the sea closes in`
      this.announcementTime = 4
      this.cooldown = Math.max(this.cooldown, T.bossLull * 0.5)
      return this.endlessSquadron(wave)
    }

    // --- Boss waves ---------------------------------------------------------
    for (let i = 0; i < BOSS_WAVES.length; i++) {
      const wave = BOSS_WAVES[i]
      if (progress < wave.at || this.firedBosses.has(i)) continue
      this.firedBosses.add(i)
      this.announcement = wave.label
      this.announcementTime = 4.5
      // Hold the routine spawns back for a moment so the boss is a duel rather
      // than the last straw on top of a crowd already shooting at you.
      this.cooldown = Math.max(this.cooldown, T.bossLull)
      return [...wave.hulls]
    }

    // --- Routine pressure ---------------------------------------------------
    // While a boss is afloat the sea stays clear. A Brigantine is a fair duel
    // on its own terms; fought with four other hulls still arriving it is just
    // a wall, and the fight that was tuned and signed off never happens.
    if (bossesAlive > 0) return []

    this.cooldown -= dt
    if (this.cooldown > 0) return []
    this.cooldown = this.interval(progress, wave) * (0.75 + rand() * 0.5)

    if (aliveEnemies >= this.cap(progress, wave)) return []

    const table = this.weights(progress, wave).filter(([, w]) => w > 0)
    const total = table.reduce((sum, [, w]) => sum + w, 0)
    let roll = rand() * total
    for (const [cls, w] of table) {
      roll -= w
      if (roll <= 0) return [cls]
    }
    return [PINNACE]
  }

  reset() {
    this.cooldown = 2
    this.firedBosses.clear()
    this.lastEndlessWave = 0
    this.announcement = null
    this.announcementTime = 0
  }
}
