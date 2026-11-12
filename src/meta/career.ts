import { PLAYER_CLASSES, SLOOP, type ShipClass } from '../sim/shipClasses'
import type { Run } from '../sim/run'
import { UPGRADES } from '../sim/upgrades'
import {
  difficultyFor, MAX_NOTORIETY, rankOf, refitCost, REFITS, REFITS_BY_ID,
  type Refit, type Voyage,
} from '../sim/voyage'
import { FEATS, FEATS_BY_ID, type Feat } from './feats'

/**
 * What outlives a voyage.
 *
 * A run's plunder is spent inside the run: it fills the bar and buys the next
 * draft, and when the ship goes down it is gone. The career is the other half
 * of that — the same haul, counted again at the end and banked as doubloons,
 * which buy hulls and refits; and the things done at sea, recorded as feats,
 * which decide what is for sale.
 *
 * Kept apart from `sim/` on purpose. The simulation is a function of a seed,
 * a hull and a `Voyage`, and knows nothing of who is playing it; that is what
 * lets the harness measure it. Everything here sits *around* a run — it boils
 * the career down to a `Voyage` before one starts and reads what one ended
 * with — and never reaches into one while it is being sailed.
 */
export interface Career {
  /** Unspent. */
  doubloons: number
  /** Everything ever banked, spent or not. A score, never a balance. */
  lifetime: number
  /** Ids of the hulls in the captain's yard. */
  hulls: string[]
  /** Ranks held in each permanent refit. */
  refits: Record<string, number>
  /** Ids of feats done. */
  feats: string[]
  /** The level of notoriety the next voyage will be sailed at. */
  notoriety: number
  /** The highest level open. Completing a voyage at this level opens the next. */
  notorietyMax: number
  voyages: number
  /** Voyages that reached the end of the clock. */
  completed: number
  /** Longest a ship has stayed afloat, in seconds. */
  bestSeconds: number
  /** Hulls sunk or taken, ever. */
  beaten: number
  /** The hull last taken to sea, so the quayside can offer her again. */
  lastHull: string
}

/** Doubloons paid per point of plunder hauled aboard. */
export const DOUBLOONS_PER_PLUNDER = 10
/** Paid once for bringing her home. Sinking in endless does not take it back. */
export const VOYAGE_BONUS = 250
/** Paid for outlasting the Man-o'-War: running well is a thing done, not a thing lost. */
export const SLIPPED_BOUNTY = 120
/** Paid for beating her instead. */
export const HUNTER_BOUNTY = 800

export function freshCareer(): Career {
  return {
    doubloons: 0, lifetime: 0, hulls: [SLOOP.id], refits: {}, feats: [],
    notoriety: 0, notorietyMax: 0,
    voyages: 0, completed: 0, bestSeconds: 0, beaten: 0, lastHull: SLOOP.id,
  }
}

// --- Reading a career ---------------------------------------------------------

export function hasFeat(career: Career, id: string | undefined): boolean {
  return id === undefined || career.feats.includes(id)
}

/** What a hull costs at the yard. The Sloop is the one every captain starts with. */
export function priceOf(cls: ShipClass): number {
  return cls.price ?? 0
}

export function owns(career: Career, cls: ShipClass): boolean {
  return priceOf(cls) === 0 || career.hulls.includes(cls.id)
}

/** The yard will build her: whatever she requires has been done. */
export function permitted(career: Career, cls: ShipClass): boolean {
  return hasFeat(career, cls.requires)
}

export function canAfford(career: Career, cls: ShipClass): boolean {
  return !owns(career, cls) && permitted(career, cls) && career.doubloons >= priceOf(cls)
}

/** The cheapest thing still to buy that the captain is allowed to buy. */
export function nextPurchase(career: Career): { name: string; price: number } | null {
  let best: { name: string; price: number } | null = null
  const offer = (name: string, price: number) => {
    if (!best || price < best.price) best = { name, price }
  }
  for (const cls of PLAYER_CLASSES) {
    if (!owns(career, cls) && permitted(career, cls)) offer(`the ${cls.name}`, priceOf(cls))
  }
  for (const refit of REFITS) {
    const held = career.refits[refit.id] ?? 0
    if (held < refit.maxRank) offer(refit.name, refitCost(refit, held))
  }
  return best
}

/**
 * Boil the career down to what a run is allowed to know. Built fresh at the
 * quayside for each voyage and never mutated after: a refit bought mid-screen
 * is in the next voyage, not smuggled into the one already at sea.
 */
export function voyageOf(career: Career): Voyage {
  const cards = new Set<string>()
  for (const u of UPGRADES) {
    if (u.requires && hasFeat(career, u.requires)) cards.add(u.id)
  }
  return {
    refits: { ...career.refits },
    notoriety: Math.min(career.notoriety, career.notorietyMax),
    cards,
  }
}

// --- Paying a voyage out ------------------------------------------------------

export interface Payout {
  /** From plunder hauled aboard, after notoriety and the hold. */
  haul: number
  /** For completing the voyage. */
  bonus: number
  /** For the Man-o'-War: outlasted, or beaten. */
  bounty: number
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
 *
 * Notoriety multiplies everything. A harder sea that paid the same would be
 * a dare; one that pays a third more a rung is the fastest way to afford the
 * things that make the next rung possible, which is the loop.
 */
export function payoutFor(run: Run): Payout {
  const scale = difficultyFor(run.voyage.notoriety).payout
  const hold = 1 + 0.1 * rankOf(run.voyage, 'deeper-hold')
  const haul = Math.floor(run.totalPlunder * DOUBLOONS_PER_PLUNDER * scale * hold)
  const bonus = run.endless || run.state === 'won' ? Math.round(VOYAGE_BONUS * scale) : 0
  const bounty = Math.round(
    (run.huntersSlipped * SLIPPED_BOUNTY + run.huntersBeaten * HUNTER_BOUNTY) * scale,
  )
  return { haul, bonus, bounty, total: haul + bonus + bounty }
}

/**
 * Keeps the books for one voyage at a time.
 *
 * `settle` is safe to call every frame: it pays whatever the run is worth
 * beyond what this voyage has already been paid, records whatever feats have
 * newly been done, and does nothing otherwise.
 */
export class Ledger {
  /** Paid out for the voyage in progress, feats' bounties included. */
  private paid = 0
  private paidRun = 0
  private countedBeaten = 0
  private counted = false
  private finished = false
  /** Feats done on the voyage in progress, for the end card. */
  readonly news: Feat[] = []
  /** Set when the voyage in progress opened a new rung of notoriety. */
  rung = 0

  constructor(readonly career: Career, private readonly persist: (c: Career) => void) {}

  /** Doubloons banked from the current voyage so far. */
  get earned() { return this.paid }

  /** Start a fresh page. Call when a new voyage puts to sea. */
  open(cls: ShipClass) {
    this.paid = 0
    this.paidRun = 0
    this.countedBeaten = 0
    this.counted = false
    this.finished = false
    this.news.length = 0
    this.rung = 0
    if (this.career.lastHull !== cls.id) {
      this.career.lastHull = cls.id
      this.persist(this.career)
    }
  }

  settle(run: Run): number {
    const career = this.career
    let dirty = false
    let gained = 0

    if (!this.counted) {
      this.counted = true
      career.voyages++
      dirty = true
    }
    const beaten = run.shipsSunk + run.shipsTaken
    if (beaten > this.countedBeaten) {
      career.beaten += beaten - this.countedBeaten
      this.countedBeaten = beaten
      dirty = true
    }
    if (!this.finished && (run.endless || run.state === 'won')) {
      this.finished = true
      career.completed++
      // The ladder is climbed one rung at a time, and only from the top one.
      if (run.voyage.notoriety >= career.notorietyMax && career.notorietyMax < MAX_NOTORIETY) {
        career.notorietyMax++
        this.rung = career.notorietyMax
      }
      dirty = true
    }
    if (run.elapsed > career.bestSeconds) {
      career.bestSeconds = Math.floor(run.elapsed)
      dirty = true
    }
    for (const feat of FEATS) {
      if (career.feats.includes(feat.id) || !feat.done(run, career)) continue
      career.feats.push(feat.id)
      this.news.push(feat)
      gained += feat.bounty
      dirty = true
    }
    const due = payoutFor(run).total - this.paidRun
    if (due > 0) {
      this.paidRun += due
      gained += due
    }
    if (gained > 0) {
      this.paid += gained
      career.doubloons += gained
      career.lifetime += gained
      dirty = true
    }
    if (dirty) this.persist(career)
    return gained
  }

  /** Pay for a hull. Returns false, and changes nothing, if she cannot be had. */
  buyHull(cls: ShipClass): boolean {
    if (!canAfford(this.career, cls)) return false
    this.career.doubloons -= priceOf(cls)
    this.career.hulls.push(cls.id)
    this.persist(this.career)
    return true
  }

  /** Pay for the next rank of a refit. */
  buyRefit(refit: Refit): boolean {
    const held = this.career.refits[refit.id] ?? 0
    const cost = refitCost(refit, held)
    if (held >= refit.maxRank || this.career.doubloons < cost) return false
    this.career.doubloons -= cost
    this.career.refits[refit.id] = held + 1
    this.persist(this.career)
    return true
  }

  /**
   * Save a career that was edited directly. Only the tuning panel does this:
   * every in-game change goes through a method above that saves for itself.
   */
  commit() {
    this.career.notorietyMax = Math.max(0, Math.min(MAX_NOTORIETY, this.career.notorietyMax))
    this.career.notoriety = Math.max(0, Math.min(this.career.notorietyMax, this.career.notoriety))
    this.persist(this.career)
  }

  setNotoriety(level: number) {
    const clamped = Math.max(0, Math.min(this.career.notorietyMax, Math.floor(level)))
    if (clamped === this.career.notoriety) return
    this.career.notoriety = clamped
    this.persist(this.career)
  }
}

// --- Storage ----------------------------------------------------------------

const STORAGE_KEY = 'pirates2d.career.v1'

/**
 * Read the career back, tolerating anything.
 *
 * A save is the one piece of state a player cannot get back by reloading, so
 * it is read defensively: a missing key, private-mode storage that throws, a
 * half-written record, a field from a newer build or an id that no longer
 * exists all fall back to a sound default field by field rather than
 * discarding the lot. The key has not changed since the first version, which
 * held only doubloons and hulls — an older save simply has nothing in the
 * newer fields.
 */
export function loadCareer(): Career {
  const career = freshCareer()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return career
    const saved = JSON.parse(raw) as Partial<Career>
    const count = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
    const ids = (v: unknown, known: (id: string) => boolean): string[] =>
      Array.isArray(v)
        ? [...new Set(v.filter((id): id is string => typeof id === 'string' && known(id)))]
        : []

    career.doubloons = count(saved.doubloons)
    career.lifetime = Math.max(count(saved.lifetime), career.doubloons)
    career.voyages = count(saved.voyages)
    career.completed = count(saved.completed)
    career.bestSeconds = count(saved.bestSeconds)
    career.beaten = count(saved.beaten)
    career.notorietyMax = Math.min(MAX_NOTORIETY, count(saved.notorietyMax))
    career.notoriety = Math.min(career.notorietyMax, count(saved.notoriety))

    const hulls = new Set(PLAYER_CLASSES.map((c) => c.id))
    for (const id of ids(saved.hulls, (h) => hulls.has(h))) {
      if (!career.hulls.includes(id)) career.hulls.push(id)
    }
    career.feats = ids(saved.feats, (f) => FEATS_BY_ID.has(f))
    if (saved.refits && typeof saved.refits === 'object') {
      for (const [id, rank] of Object.entries(saved.refits)) {
        const refit = REFITS_BY_ID.get(id)
        if (refit) career.refits[id] = Math.min(refit.maxRank, count(rank))
      }
    }
    if (typeof saved.lastHull === 'string' && career.hulls.includes(saved.lastHull)) {
      career.lastHull = saved.lastHull
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
