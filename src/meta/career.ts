import { PLAYER_CLASSES, SLOOP, type ShipClass } from '../sim/shipClasses'
import type { Run } from '../sim/run'

/**
 * What outlives a voyage.
 *
 * A run's plunder is spent inside the run: it fills the bar and buys the next
 * draft, and when the ship goes down it is gone. The career is the other half
 * of that — the same haul, counted again at the end and banked as doubloons,
 * which are the only thing a captain carries from one voyage to the next.
 *
 * Kept apart from `sim/` on purpose. The simulation is deterministic from a
 * seed and a hull and knows nothing of who is playing it; that is what lets
 * the harness measure it. Everything here sits *around* a run — it chooses
 * what a run may start with and reads what a run ended with — and never
 * reaches into one while it is being sailed.
 */
export interface Career {
  /** Unspent. */
  doubloons: number
  /** Everything ever banked, spent or not. A score, never a balance. */
  lifetime: number
  /** Ids of the hulls in the captain's yard. */
  hulls: string[]
  voyages: number
  /** Voyages that reached the end of the clock. */
  completed: number
  /** Longest a ship has stayed afloat, in seconds. */
  bestSeconds: number
}

/** Doubloons paid per point of plunder hauled aboard. */
export const DOUBLOONS_PER_PLUNDER = 10
/** Paid once for bringing her home. Sinking in endless does not take it back. */
export const VOYAGE_BONUS = 250

export function freshCareer(): Career {
  return {
    doubloons: 0, lifetime: 0, hulls: [SLOOP.id],
    voyages: 0, completed: 0, bestSeconds: 0,
  }
}

/** What a hull costs at the yard. The Sloop is the one every captain starts with. */
export function priceOf(cls: ShipClass): number {
  return cls.price ?? 0
}

export function owns(career: Career, cls: ShipClass): boolean {
  return priceOf(cls) === 0 || career.hulls.includes(cls.id)
}

export function canAfford(career: Career, cls: ShipClass): boolean {
  return !owns(career, cls) && career.doubloons >= priceOf(cls)
}

/** Pay for a hull. Returns false, and changes nothing, if the purse is short. */
export function buyHull(career: Career, cls: ShipClass): boolean {
  if (!canAfford(career, cls)) return false
  career.doubloons -= priceOf(cls)
  career.hulls.push(cls.id)
  return true
}

/** The cheapest hull still locked, for telling the player what to save toward. */
export function nextHull(career: Career): ShipClass | null {
  let best: ShipClass | null = null
  for (const cls of PLAYER_CLASSES) {
    if (owns(career, cls)) continue
    if (!best || priceOf(cls) < priceOf(best)) best = cls
  }
  return best
}

export interface Payout {
  /** From plunder hauled aboard. */
  haul: number
  /** For completing the voyage. */
  bonus: number
  total: number
}

/**
 * What a run is worth so far.
 *
 * A function of the run rather than an event, so it can be asked at any point
 * and always gives the same answer for the same run. That matters because a
 * voyage can end twice: once when the clock runs out, and again — if the
 * captain sails on — when the sea finally takes her. Paying the difference
 * each time is simpler and harder to get wrong than deciding which ending is
 * the real one.
 */
export function payoutFor(run: Run): Payout {
  const haul = Math.floor(run.totalPlunder * DOUBLOONS_PER_PLUNDER)
  const bonus = run.endless || run.state === 'won' ? VOYAGE_BONUS : 0
  return { haul, bonus, total: haul + bonus }
}

/**
 * Keeps the books for one voyage at a time.
 *
 * `settle` is safe to call every frame: it pays whatever the run is worth
 * beyond what this voyage has already been paid, and nothing otherwise.
 */
export class Ledger {
  /** Paid out for the voyage in progress. */
  private paid = 0
  private counted = false
  private finished = false

  constructor(readonly career: Career, private readonly persist: (c: Career) => void) {}

  /** Doubloons banked from the current voyage so far. */
  get earned() { return this.paid }

  /** Start a fresh page. Call when a new voyage puts to sea. */
  open() {
    this.paid = 0
    this.counted = false
    this.finished = false
  }

  settle(run: Run): number {
    const due = payoutFor(run).total - this.paid
    const career = this.career
    let dirty = false

    if (!this.counted) {
      this.counted = true
      career.voyages++
      dirty = true
    }
    if (!this.finished && (run.endless || run.state === 'won')) {
      this.finished = true
      career.completed++
      dirty = true
    }
    if (run.elapsed > career.bestSeconds) {
      career.bestSeconds = Math.floor(run.elapsed)
      dirty = true
    }
    if (due > 0) {
      this.paid += due
      career.doubloons += due
      career.lifetime += due
      dirty = true
    }
    if (dirty) this.persist(career)
    return Math.max(0, due)
  }

  buy(cls: ShipClass): boolean {
    if (!buyHull(this.career, cls)) return false
    this.persist(this.career)
    return true
  }
}

// --- Storage ----------------------------------------------------------------

const STORAGE_KEY = 'pirates2d.career.v1'

/**
 * Read the career back, tolerating anything.
 *
 * A save is the one piece of state a player cannot get back by reloading, so
 * it is read defensively: a missing key, private-mode storage that throws, a
 * half-written record or a field from a newer build all fall back to a sound
 * default field by field rather than discarding the lot.
 */
export function loadCareer(): Career {
  const career = freshCareer()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return career
    const saved = JSON.parse(raw) as Partial<Career>
    const count = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
    career.doubloons = count(saved.doubloons)
    career.lifetime = Math.max(count(saved.lifetime), career.doubloons)
    career.voyages = count(saved.voyages)
    career.completed = count(saved.completed)
    career.bestSeconds = count(saved.bestSeconds)
    if (Array.isArray(saved.hulls)) {
      const known = new Set(PLAYER_CLASSES.map((c) => c.id))
      for (const id of saved.hulls) {
        if (typeof id === 'string' && known.has(id) && !career.hulls.includes(id)) {
          career.hulls.push(id)
        }
      }
    }
  } catch {
    // Unreadable storage is the same as none: start a new career.
  }
  return career
}

export function saveCareer(career: Career) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(career))
  } catch {
    // Storage full or forbidden. The career still works for this session.
  }
}
