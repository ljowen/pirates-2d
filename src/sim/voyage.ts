import type { ShipMods } from './ship'

/**
 * Everything a run is handed before it starts, other than its seed and hull.
 *
 * This is the seam between a career and a run. The simulation used to be a
 * function of (seed, hull) and nothing else, which is what made it
 * measurable; permanent progression threatens exactly that, because a captain
 * with forty voyages behind them is no longer sailing the ship the docs were
 * written about. So the career never reaches into a run. It is boiled down to
 * this struct at the quayside, the run is a function of (seed, hull, voyage),
 * and the harness can be handed any voyage it likes — a fresh one, a full
 * one, a full one at the top of the notoriety ladder — and report a curve for
 * each instead of one curve for whoever last played in that browser.
 */
export interface Voyage {
  /** Ranks held in each permanent refit, by id. */
  refits: Readonly<Record<string, number>>
  /** How badly the Crown wants this captain. 0 is the sea as first tuned. */
  notoriety: number
  /** Ids of the gated draft cards this captain has earned. */
  cards: ReadonlySet<string>
}

export const STOCK_VOYAGE: Voyage = { refits: {}, notoriety: 0, cards: new Set() }

// --- Refits -----------------------------------------------------------------

/**
 * A permanent improvement, bought in ranks with doubloons and carried into
 * every voyage on every hull.
 *
 * These are the half of progression that the plan warned about: they move the
 * starting state, so they are small per rank, capped, and priced on a curve
 * that makes the last rank cost many voyages. The arc they exist to build is
 * prey → predator, and it only reads as an arc if each step is felt and none
 * is a cliff.
 *
 * `apply` edits `ShipMods` and nothing else, the same contract a draft card
 * has, and for the same reason: the stat panel can show what a rank does by
 * running it against a copy.
 */
export interface Refit {
  id: string
  name: string
  /** What one rank does, written as the number. */
  text: string
  maxRank: number
  /** Doubloons for the first rank. Later ranks climb from this. */
  baseCost: number
  /** Applied once per rank held. Absent for refits that act outside the hull. */
  apply?: (m: ShipMods) => void
}

export const REFITS: Refit[] = [
  {
    id: 'seasoned-timbers', name: 'Seasoned Timbers',
    text: '-7% damage taken.', maxRank: 5, baseCost: 180,
    apply: (m) => { m.armour *= 1.075 },
  },
  {
    id: 'gun-drill', name: 'Gun Drill',
    text: '-4% reload time.', maxRank: 5, baseCost: 180,
    apply: (m) => { m.reload *= 0.96 },
  },
  {
    id: 'foundry-shot', name: 'Foundry Shot',
    text: '+5% damage.', maxRank: 5, baseCost: 180,
    apply: (m) => { m.damage *= 1.05 },
  },
  {
    id: 'fine-sailcloth', name: 'Fine Sailcloth',
    text: '+2.5% top speed.', maxRank: 4, baseCost: 220,
    apply: (m) => { m.thrust *= 1.05 },
  },
  {
    id: 'balanced-rudder', name: 'Balanced Rudder',
    text: '+5% turn rate.', maxRank: 4, baseCost: 150,
    apply: (m) => { m.turnRate *= 1.05 },
  },
  {
    id: 'shipwrights', name: 'Shipwrights Aboard',
    text: '+15% mending of hull, rigging and crew, hove to.', maxRank: 4, baseCost: 200,
    apply: (m) => { m.hullRepair *= 1.15; m.sailRepair *= 1.15; m.crewRepair *= 1.15 },
  },
  {
    id: 'bored-barrels', name: 'Bored Barrels',
    text: '+4% range, -5% scatter.', maxRank: 3, baseCost: 240,
    apply: (m) => { m.range *= 1.04; m.spread *= 0.95 },
  },
  {
    id: 'deeper-hold', name: 'Deeper Hold',
    text: '+10% doubloons banked from every voyage.', maxRank: 5, baseCost: 250,
  },
  {
    id: 'quartermaster', name: 'Quartermaster',
    text: '+1 redraw of a draft hand each voyage.', maxRank: 3, baseCost: 350,
  },
  {
    id: 'old-hands', name: 'Old Hands',
    text: 'Put to sea one level up, with the draft that comes with it.', maxRank: 2, baseCost: 900,
  },
]

export const REFITS_BY_ID = new Map(REFITS.map((r) => [r.id, r]))

/**
 * What the next rank costs, given how many are held. Roughly ×1.7 a rank:
 * the first is an impulse buy after one decent voyage and the fifth is a
 * project, which is the shape that keeps a purse from ever being comfortable.
 */
export function refitCost(refit: Refit, held: number): number {
  return Math.round((refit.baseCost * Math.pow(1.7, held)) / 10) * 10
}

export function rankOf(voyage: Voyage, id: string): number {
  const refit = REFITS_BY_ID.get(id)
  if (!refit) return 0
  return Math.max(0, Math.min(refit.maxRank, Math.floor(voyage.refits[id] ?? 0)))
}

/** Lay every hull refit onto a set of modifiers. Order does not matter. */
export function applyRefits(mods: ShipMods, voyage: Voyage) {
  for (const refit of REFITS) {
    if (!refit.apply) continue
    for (let i = rankOf(voyage, refit.id); i > 0; i--) refit.apply(mods)
  }
}

// --- Notoriety ----------------------------------------------------------------

export const MAX_NOTORIETY = 10

const NOTORIETY_NAMES = [
  'Unknown', 'Nuisance', 'Wanted', 'Notorious', 'Hunted', 'Scourge',
  'Dread', 'Terror of the Main', 'Enemy of the Crown', 'Legend', 'Myth',
]

export function notorietyName(level: number): string {
  return NOTORIETY_NAMES[Math.max(0, Math.min(MAX_NOTORIETY, Math.floor(level)))]
}

/**
 * What a level of notoriety does to the sea.
 *
 * The lesson recorded in PROGRESSION.md is that the spawn curve is a poor
 * difficulty lever on its own: more hulls is also more plunder and a faster
 * draft, so both sides of the race speed up together. Notoriety therefore
 * leans on the levers that do *not* pay the player back — how much a hull
 * takes to sink and how hard she hits — and uses numbers only to change the
 * texture: heavier ships sooner, bosses with more company, a hunter who
 * stays longer.
 */
export interface Difficulty {
  /** Incoming damage to enemy hulls is divided by this. */
  enemyArmour: number
  enemyDamage: number
  /** Added to both ends of the enemy cap. */
  capBonus: number
  /** Multiplies the gap between routine spawns. Below 1 is busier. */
  intervalScale: number
  /** The hull mix is read this much further into the voyage than the clock says. */
  mixAdvance: number
  /** Extra escorts with each boss wave. */
  bossEscorts: number
  /** How long the Man-o'-War keeps the chase up, in seconds. */
  hunterSeconds: number
  /** How many times in a voyage she comes. */
  hunterVisits: number
  /** Multiplies the doubloons a voyage banks. */
  payout: number
}

export function difficultyFor(notoriety: number): Difficulty {
  const n = Math.max(0, Math.min(MAX_NOTORIETY, Math.floor(notoriety)))
  return {
    enemyArmour: 1 + 0.15 * n,
    enemyDamage: 1 + 0.08 * n,
    capBonus: Math.floor(n / 2),
    intervalScale: 1 / (1 + 0.06 * n),
    mixAdvance: 0.035 * n,
    bossEscorts: Math.floor((n + 1) / 3),
    hunterSeconds: 55 + 8 * n,
    hunterVisits: n >= 4 ? 2 : 1,
    payout: 1 + 0.3 * n,
  }
}
