import type { ShipMods } from './ship'

/**
 * The draft pool. Every upgrade does nothing but edit `ShipMods`, which keeps
 * the whole progression layer decoupled from the physics and the tuner.
 *
 * `weight` biases how often a card is offered; `maxStacks` stops any single
 * line running away.
 */
/**
 * Card text is the number, then the consequence only where the number does
 * not carry it on its own.
 *
 * It used to be prose — "Boys at the powder: reload 13% faster", "Straight at
 * the waterline" — which reads as padding on a card the player is choosing
 * between three others under fire. Two of them had also quietly gone *wrong*:
 * the repair cards still promised mending "under way" long after a ship stopped
 * mending under way at all. Flavour does not get checked against the code the
 * way a number does.
 *
 * Rates that only apply hove to are quoted hove to, because that is the only
 * rate the player can ever actually be paid. Shot cards quote the *landed*
 * split rather than the multiplier in `apply`: the three biases are
 * renormalised at damage time, so chain's `x2.1` into rigging arrives as +82%.
 *
 * Every number here was checked against `describeStats` rather than against
 * the `apply` beside it, which caught three that were wrong on the first pass
 * — Taller Masts among them, where +10% thrust is +5% speed because steady
 * speed goes as the square root of drive.
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
  /**
   * A feat that has to be done before this card can be dealt. Content
   * unlocks: they widen what a run can become without making any run
   * stronger at the start, so they cost the curve nothing.
   */
  requires?: string
  apply: (m: ShipMods) => void
}

export const UPGRADES: Upgrade[] = [
  // --- Sailing ------------------------------------------------------------
  {
    id: 'rakish-lines', name: 'Rakish Lines', group: 'Sailing',
    text: '+12% turn rate.',
    maxStacks: 5, weight: 1,
    apply: (m) => { m.turnRate *= 1.12 },
  },
  {
    id: 'taller-masts', name: 'Taller Masts', group: 'Sailing',
    text: '+5% top speed. +40% rigging lost in a squall.',
    maxStacks: 4, weight: 1,
    apply: (m) => { m.thrust *= 1.1; m.blowout *= 1.4 },
  },
  {
    id: 'veteran-topmen', name: 'Veteran Topmen', group: 'Sailing',
    text: '+18% sail handling. +4.8%/s crew repair while furled.',
    maxStacks: 3, weight: 0.9,
    // Deliberately no reload bonus: that is Powder Monkeys' job, and two cards
    // quietly doing the same thing made both harder to read.
    apply: (m) => { m.crewSpeed *= 1.18; m.crewRepair += 0.008 },
  },

  // --- Gunnery -------------------------------------------------------------
  {
    id: 'heavier-shot', name: 'Heavier Shot', group: 'Gunnery',
    text: '+16% damage.',
    maxStacks: 5, weight: 1.1,
    apply: (m) => { m.damage *= 1.16 },
  },
  {
    id: 'powder-monkeys', name: 'Powder Monkeys', group: 'Gunnery',
    text: '-13% reload time.',
    maxStacks: 5, weight: 1.1,
    apply: (m) => { m.reload *= 0.87 },
  },
  {
    id: 'long-nines', name: 'Long Nines', group: 'Gunnery',
    text: '+16% range.',
    maxStacks: 4, weight: 1,
    apply: (m) => { m.range *= 1.16 },
  },
  {
    id: 'extra-gunport', name: 'Another Gunport', group: 'Gunnery',
    text: '+1 gun a side.',
    maxStacks: 6, weight: 0.85,
    apply: (m) => { m.extraGuns += 1 },
  },
  {
    id: 'trained-gunners', name: 'Trained Gunners', group: 'Gunnery',
    text: '-18% scatter.',
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
    text: '+82% into rigging, -29% into hull.',
    maxStacks: 3, weight: 0.8,
    apply: (m) => { m.shotSails *= 2.1; m.shotHull *= 0.82 },
  },
  {
    id: 'grape-shot', exclusive: 'shot', name: 'Grape Shot', group: 'Shot',
    text: '+118% into crew, -23% into hull. -11% hits taken.',
    maxStacks: 3, weight: 0.8,
    apply: (m) => { m.shotCrew *= 2.4; m.shotHull *= 0.85 },
  },
  {
    id: 'round-shot', exclusive: 'shot', name: 'Double-Shotted', group: 'Shot',
    text: '+32% into hull, -53% into rigging and crew.',
    maxStacks: 3, weight: 0.8,
    // Has to be a harder shove than it was. Once chain and grape led to a
    // prize worth more than a wreck, merely sinking things a little faster was
    // not a doctrine at all — it measured level-for-level with taking no shot
    // card whatsoever.
    apply: (m) => { m.shotHull *= 2.1; m.shotSails *= 0.75; m.shotCrew *= 0.75 },
  },

  // --- Quarterdeck ---------------------------------------------------------
  {
    id: 'ships-carpenter', name: "Ship's Carpenter", group: 'Quarterdeck',
    text: '+3.6%/s hull repair while furled.',
    maxStacks: 3, weight: 0.95,
    apply: (m) => { m.hullRepair += 0.006 },
  },
  {
    id: 'sailmaker', name: 'Sailmaker', group: 'Quarterdeck',
    text: '+7.2%/s rigging repair while furled.',
    maxStacks: 3, weight: 0.95,
    apply: (m) => { m.sailRepair += 0.012 },
  },
  {
    id: 'loot-hooks', name: 'Grappling Hooks', group: 'Quarterdeck',
    text: '+55% plunder reach.',
    maxStacks: 3, weight: 0.9,
    apply: (m) => { m.pickupRadius *= 1.55 },
  },

  // --- Earned ---------------------------------------------------------------
  // Gated behind feats. Each one does something no stock card does — the rule
  // Careened Hull was deleted for breaking — so earning one changes which
  // builds exist rather than how big the numbers get.
  {
    id: 'carronades', name: 'Carronades', group: 'Gunnery', requires: 'well-found',
    text: '+28% damage, -12% range.',
    maxStacks: 3, weight: 0.85,
    apply: (m) => { m.damage *= 1.28; m.range *= 0.88 },
  },
  {
    id: 'storm-canvas', name: 'Storm Canvas', group: 'Sailing', requires: 'slipped-the-noose',
    text: '-50% rigging lost in a squall. +8% sail handling.',
    maxStacks: 2, weight: 0.8,
    apply: (m) => { m.blowout *= 0.5; m.crewSpeed *= 1.08 },
  },
  {
    id: 'iron-knees', name: 'Iron Knees', group: 'Quarterdeck', requires: 'scourge',
    text: '-10% damage taken.',
    maxStacks: 4, weight: 0.9,
    apply: (m) => { m.armour *= 1.111 },
  },
  {
    id: 'prize-crews', name: 'Prize Crews', group: 'Quarterdeck', requires: 'struck-colours',
    text: '+30% plunder from a ship taken whole.',
    maxStacks: 3, weight: 0.8,
    apply: (m) => { m.prize *= 1.3 },
  },
  {
    id: 'letters-of-marque', name: 'Letters of Marque', group: 'Quarterdeck', requires: 'home-and-dry',
    text: '+12% plunder from every wreck and prize.',
    maxStacks: 3, weight: 0.85,
    apply: (m) => { m.plunder *= 1.12 },
  },
  {
    id: 'boarding-axes', name: 'Boarding Axes', group: 'Quarterdeck', requires: 'wanted',
    text: '+45% boarding range.',
    maxStacks: 2, weight: 0.75,
    apply: (m) => { m.boarding *= 1.45 },
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
 * Deliberately empty: a captain puts to sea in a stock hull, so every point of
 * a build is one the player chose. A free stack of the same card in every run
 * is a head start nobody picked, and it spent one of the Carpenter's three
 * stacks before the first draft had been dealt.
 */
export const STARTING_UPGRADES: string[] = []

const NO_CARDS: ReadonlySet<string> = new Set()

/**
 * Draw a draft hand, excluding anything already maxed. Weighted, without
 * replacement, so a hand never offers the same card twice.
 */
export function drawDraft(
  taken: Map<string, number>,
  count: number,
  rand: () => number,
  earned: ReadonlySet<string> = NO_CARDS,
): Upgrade[] {
  // Whichever member of an exclusive family was taken first owns it.
  const committed = new Map<string, string>()
  for (const [id, stacks] of taken) {
    if (stacks <= 0) continue
    const family = UPGRADES_BY_ID.get(id)?.exclusive
    if (family && !committed.has(family)) committed.set(family, id)
  }

  const pool = UPGRADES.filter((u) => {
    if (u.requires && !earned.has(u.id)) return false
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
