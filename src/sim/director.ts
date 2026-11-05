import { T } from './tuning'
import {
  PINNACE, ROYAL_SLOOP, FLUYT, BARQUE, FRIGATE, BRIGANTINE, GALLEON, type ShipClass,
} from './shipClasses'
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
  { at: 0.60, hulls: [FRIGATE, BARQUE, BARQUE], label: 'A Frigate and her escorts' },
  { at: 0.88, hulls: [GALLEON, FRIGATE, BARQUE, BARQUE], label: 'A Galleon, and the squadron with her' },
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
  /**
   * The mix of hulls at a given point in the run.
   *
   * Each tier fades in at its own point so the sea's character changes as the
   * voyage goes on rather than simply getting busier: skirmishers early,
   * brawlers through the middle, long-ranged and heavy hulls late. Traders
   * appear throughout at a low rate — they are a reward rather than pressure,
   * and finding one should feel like luck.
   */
  private weights(progress: number, wave: number): [ShipClass, number][] {
    // Past the voyage proper the mix keeps sliding toward heavy hulls, so the
    // sea does not merely get busier — it gets meaner.
    const heavy = Math.min(wave * 0.18, 0.75)
    const from = (start: number, rate: number, cap: number) =>
      progress < start ? 0 : clamp((progress - start) * rate, 0, cap)

    return [
      [PINNACE, Math.max(0.05, lerp(1, 0.2, progress) - heavy)],
      [ROYAL_SLOOP, from(0.12, 1.4, 0.45)],
      [FLUYT, progress < 0.08 ? 0 : 0.12],
      [BARQUE, from(0.22, 1.2, 0.5) + heavy * 0.4],
      [FRIGATE, from(0.40, 0.7, 0.24) + heavy * 0.3],
      [BRIGANTINE, from(0.56, 0.45, 0.15) + heavy * 0.5],
      [GALLEON, from(0.72, 0.45, 0.09) + heavy * 0.35],
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
    const heavies = Math.min(1 + Math.floor(wave / 2), 4)
    const escorts = Math.min(wave, 4)
    // Galleons lead from the third wave on; before that it is Brigantines.
    const flagship = wave >= 3 ? GALLEON : BRIGANTINE
    const escort = wave >= 2 ? FRIGATE : BARQUE
    return [
      ...Array.from({ length: heavies }, () => flagship),
      ...Array.from({ length: escorts }, () => escort),
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
