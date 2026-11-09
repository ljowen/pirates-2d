import type { ShipMods } from './ship'

/**
 * The draft pool. Every upgrade does nothing but edit `ShipMods`, which keeps
 * the whole progression layer decoupled from the physics and the tuner.
 *
 * `weight` biases how often a card is offered; `maxStacks` stops any single
 * line running away.
 */
export interface Upgrade {
  id: string
  name: string
  /** One line, written for the player rather than the programmer. */
  text: string
  group: 'Sailing' | 'Gunnery' | 'Shot' | 'Quarterdeck'
  maxStacks: number
  weight: number
  /**
   * Cards sharing an exclusive family lock each other out: take one and its
   * siblings never appear again this run. Used for shot types, where mixing
   * opposing kinds silently cancelled out and wasted picks.
   */
  exclusive?: string
  apply: (m: ShipMods) => void
}

export const UPGRADES: Upgrade[] = [
  // --- Sailing ------------------------------------------------------------
  {
    id: 'rakish-lines', name: 'Rakish Lines', group: 'Sailing',
    text: 'Answers the helm 12% faster.',
    maxStacks: 5, weight: 1,
    apply: (m) => { m.turnRate *= 1.12 },
  },
  {
    id: 'careened-hull', name: 'Careened Hull', group: 'Sailing',
    text: 'Weed scraped off: 9% less drag, so more speed everywhere.',
    maxStacks: 4, weight: 1,
    apply: (m) => { m.drag *= 0.91 },
  },
  {
    id: 'taller-masts', name: 'Taller Masts', group: 'Sailing',
    text: '10% more drive from every point of sail.',
    maxStacks: 4, weight: 1,
    apply: (m) => { m.thrust *= 1.1 },
  },
  {
    id: 'veteran-topmen', name: 'Veteran Topmen', group: 'Sailing',
    text: 'Hands who know their work. Sails change 18% faster, and the wounded return to duty sooner.',
    maxStacks: 3, weight: 0.9,
    // Deliberately no reload bonus: that is Powder Monkeys' job, and two cards
    // quietly doing the same thing made both harder to read.
    apply: (m) => { m.crewSpeed *= 1.18; m.crewRepair += 0.008 },
  },

  // --- Gunnery -------------------------------------------------------------
  {
    id: 'heavier-shot', name: 'Heavier Shot', group: 'Gunnery',
    text: '16% more damage from every ball.',
    maxStacks: 5, weight: 1.1,
    apply: (m) => { m.damage *= 1.16 },
  },
  {
    id: 'powder-monkeys', name: 'Powder Monkeys', group: 'Gunnery',
    text: 'Boys at the powder: reload 13% faster.',
    maxStacks: 5, weight: 1.1,
    apply: (m) => { m.reload *= 0.87 },
  },
  {
    id: 'long-nines', name: 'Long Nines', group: 'Gunnery',
    text: 'Reach 16% further, and open fire before they can answer.',
    maxStacks: 4, weight: 1,
    apply: (m) => { m.range *= 1.16 },
  },
  {
    id: 'extra-gunport', name: 'Another Gunport', group: 'Gunnery',
    text: 'One more gun in every broadside.',
    maxStacks: 6, weight: 0.85,
    apply: (m) => { m.extraGuns += 1 },
  },
  {
    id: 'trained-gunners', name: 'Trained Gunners', group: 'Gunnery',
    text: 'A tighter pattern: 18% less scatter at range.',
    maxStacks: 3, weight: 0.9,
    apply: (m) => { m.spread *= 0.82 },
  },

  // --- Shot types ----------------------------------------------------------
  // One family, mutually exclusive: the first one taken locks out the others
  // for the rest of the run. They trade rather than add — the split is
  // renormalised, so loading chain buys rigging damage by giving up hull
  // damage — which meant opposing types cancelled almost exactly and a mixed
  // loadout silently wasted draft picks.
  {
    id: 'chain-shot', exclusive: 'shot', name: 'Chain Shot', group: 'Shot',
    text: 'Bar and chain, aimed high. Tears rigging and strands them — at the cost of hull damage.',
    maxStacks: 3, weight: 0.8,
    apply: (m) => { m.shotSails *= 2.1; m.shotHull *= 0.82 },
  },
  {
    id: 'grape-shot', exclusive: 'shot', name: 'Grape Shot', group: 'Shot',
    text: 'Sweeps the deck. Guts their crew, blunting their gunnery and their helm.',
    maxStacks: 3, weight: 0.8,
    apply: (m) => { m.shotCrew *= 2.4; m.shotHull *= 0.85 },
  },
  {
    id: 'round-shot', exclusive: 'shot', name: 'Double-Shotted', group: 'Shot',
    text: 'Straight at the waterline. Everything into the hull — the fastest way to sink her.',
    maxStacks: 3, weight: 0.8,
    apply: (m) => { m.shotHull *= 1.7; m.shotSails *= 0.8; m.shotCrew *= 0.8 },
  },

  // --- Quarterdeck ---------------------------------------------------------
  {
    id: 'ships-carpenter', name: "Ship's Carpenter", group: 'Quarterdeck',
    text: 'Plugs shot holes under way. Slowly mends your hull.',
    maxStacks: 3, weight: 0.95,
    apply: (m) => { m.hullRepair += 0.006 },
  },
  {
    id: 'sailmaker', name: 'Sailmaker', group: 'Quarterdeck',
    text: 'Patches canvas as you sail. Slowly mends your rigging.',
    maxStacks: 3, weight: 0.95,
    apply: (m) => { m.sailRepair += 0.012 },
  },
  {
    id: 'loot-hooks', name: 'Grappling Hooks', group: 'Quarterdeck',
    text: 'Sweeps up plunder from 55% further out.',
    maxStacks: 3, weight: 0.9,
    apply: (m) => { m.pickupRadius *= 1.55 },
  },
]

export const UPGRADES_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]))

/**
 * True when taking this card would commit the run to an exclusive family that
 * is still open — i.e. the choice locks something out. The draft shows this so
 * the commitment is never a surprise.
 */
export function isCommitting(upgrade: Upgrade, taken: Map<string, number>): boolean {
  if (!upgrade.exclusive) return false
  for (const [id, stacks] of taken) {
    if (stacks > 0 && UPGRADES_BY_ID.get(id)?.exclusive === upgrade.exclusive) return false
  }
  return true
}

/**
 * Upgrades every captain begins with, before drafting anything. These count
 * against their own max stacks and show in the draft as already owned, so the
 * head start is honest rather than hidden.
 *
 * The Carpenter is here because sustain, not firepower, was the thing runs were
 * short of — see docs/plans/balance.md.
 */
export const STARTING_UPGRADES: string[] = ['ships-carpenter']

/**
 * Draw a draft hand, excluding anything already maxed. Weighted, without
 * replacement, so a hand never offers the same card twice.
 */
export function drawDraft(
  taken: Map<string, number>,
  count: number,
  rand: () => number,
): Upgrade[] {
  // Whichever member of an exclusive family was taken first owns it.
  const committed = new Map<string, string>()
  for (const [id, stacks] of taken) {
    if (stacks <= 0) continue
    const family = UPGRADES_BY_ID.get(id)?.exclusive
    if (family && !committed.has(family)) committed.set(family, id)
  }

  const pool = UPGRADES.filter((u) => {
    if ((taken.get(u.id) ?? 0) >= u.maxStacks) return false
    if (u.exclusive) {
      const chosen = committed.get(u.exclusive)
      if (chosen && chosen !== u.id) return false
    }
    return true
  })
  const hand: Upgrade[] = []

  while (hand.length < count && pool.length > 0) {
    const total = pool.reduce((sum, u) => sum + u.weight, 0)
    let roll = rand() * total
    let index = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight
      if (roll <= 0) { index = i; break }
    }
    hand.push(pool[index])
    pool.splice(index, 1)
  }

  return hand
}
