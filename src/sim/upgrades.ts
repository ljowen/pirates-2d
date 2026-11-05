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
  /** Coin to fit one of these at a yard. */
  price: number
  /** Relative chance of a yard carrying it. */
  weight: number
  /**
   * What this card is *for*, used to steer a build. The draft does not read
   * these; the scripted pilot does, so it can commit to an archetype instead
   * of taking contradictory cards and making the whole system look broken.
   */
  tags?: string[]
  /** The price, in one short clause. Shown on the card so nothing is hidden. */
  cost?: string
  /**
   * Cards sharing an exclusive family lock each other out: take one and its
   * siblings never appear again this run. Used for shot types, where mixing
   * opposing kinds silently cancelled out and wasted picks.
   */
  exclusive?: string
  apply: (m: ShipMods) => void
}

/**
 * The draft pool.
 *
 * One structural truth shapes this list: **you cannot survive by not dying.**
 * The spawn cap means hulls accumulate until you clear them, so every viable
 * build has to kill at a decent rate. Firepower is therefore not one option
 * among several — it is mandatory, and a "speed instead of guns" build was
 * measured dying in half the time of a gunline on the very same hull.
 *
 * So the trade is not guns *versus* speed. It is **how** you arm: heavy long
 * guns that sink you into your marks, or light quick-serving carronades that
 * hit hard but cannot reach. Both kill; they ask for different ships.
 *
 * Most cards buy power with something: displacement, drag, reload, or
 * toughness. That is deliberate — a ship that improves in every direction at
 * once has no identity, and the game's own sail mechanic already teaches that
 * power costs handling. A handful of genuinely free cards survive at low
 * stack limits so that levelling still feels like growth rather than treading
 * water; the trades shape *direction*, they do not cap the curve.
 *
 * Burden is the main currency. It slows you, widens your turns, and sinks you
 * deeper into your marks — and that last one closes off the shoals, so arming
 * heavily is a decision about where you can sail, not just how fast.
 */
export const UPGRADES: Upgrade[] = [
  // --- Free gains -----------------------------------------------------------
  // The backbone of progression. Few, and capped low.
  {
    id: 'careened-hull', name: 'Careened Hull', group: 'Sailing',
    text: 'Weed scraped off. 9% less drag, and nothing given up for it.',
    maxStacks: 3, price: 20, weight: 1, tags: ['speed'],
    apply: (m) => { m.drag *= 0.91 },
  },
  {
    id: 'veteran-topmen', name: 'Veteran Topmen', group: 'Sailing',
    text: 'Hands who know their work. Sails change 18% faster and the wounded return to duty sooner.',
    maxStacks: 3, price: 22, weight: 0.9, tags: ['handling'],
    apply: (m) => { m.crewSpeed *= 1.18; m.crewRepair += 0.008 },
  },
  {
    id: 'trained-gunners', name: 'Trained Gunners', group: 'Gunnery',
    text: 'A tighter pattern: 20% less scatter at range.',
    cost: 'laying a gun properly takes time — 7% slower',
    maxStacks: 3, price: 22, weight: 0.9, tags: ['guns', 'reach'],
    apply: (m) => { m.spread *= 0.8; m.reload *= 1.07 },
  },
  {
    id: 'powder-monkeys', name: 'Powder Monkeys', group: 'Gunnery',
    text: 'Boys at the powder. Reload 13% faster, and they weigh nothing.',
    maxStacks: 4, price: 20, weight: 1.1, tags: ['guns', 'light'],
    apply: (m) => { m.reload *= 0.87 },
  },
  {
    id: 'carronades', name: 'Carronades', group: 'Gunnery',
    text: 'Short, light smashers. 28% more damage and quick to serve.',
    cost: 'useless at any distance — 22% less reach',
    maxStacks: 4, price: 26, weight: 1, tags: ['guns', 'light'],
    apply: (m) => { m.damage *= 1.28; m.reload *= 0.93; m.range *= 0.78; m.burden += 0.025 },
  },

  // --- Gunnery: a space of internal trades ----------------------------------
  //
  // Four axes — power, reach, rate and accuracy — and most cards buy one with
  // another. This is where build identity actually lives, because unlike
  // "guns versus speed" every option here still kills, so none of them is a
  // trap. A long-range sniper, a close-quarters smasher and a volume shooter
  // are all viable ships that want different seas and different hulls.
  //
  // Reach is quietly the most valuable of the four: it governs how *often* you
  // can engage at all, not merely how far. Cards that cut it have to give back
  // a great deal.
  //
  // Reach also has the only *saturating* benefit here — past a point there is
  // nothing further away to shoot — while its reload cost keeps compounding.
  // Stacked without limit that produced a build measurably worse than taking
  // no upgrades at all, so the reach cards are deliberately capped low.
  {
    id: 'extra-gunport', name: 'Another Gunport', group: 'Gunnery',
    text: 'One more gun in every broadside.',
    cost: 'and the weight of her, riding lower',
    maxStacks: 6, price: 32, weight: 1.05, tags: ['guns', 'heavy'],
    apply: (m) => { m.extraGuns += 1; m.burden += 0.085 },
  },
  {
    id: 'heavier-shot', name: 'Heavier Shot', group: 'Gunnery',
    text: '17% more weight behind every ball.',
    cost: 'shot and powder enough to feel',
    maxStacks: 5, price: 26, weight: 1.1, tags: ['guns', 'heavy'],
    apply: (m) => { m.damage *= 1.17; m.burden += 0.05 },
  },
  {
    id: 'long-nines', name: 'Long Nines', group: 'Gunnery',
    text: 'Reach 18% further, and open fire before they can answer.',
    cost: 'long guns are slow guns: 7% longer to serve',
    maxStacks: 3, price: 24, weight: 1, tags: ['guns', 'reach'],
    apply: (m) => { m.range *= 1.18; m.reload *= 1.07 },
  },
  {
    id: 'carronades', name: 'Carronades', group: 'Gunnery',
    text: 'Short brutal smashers: 32% more damage, and quick to serve.',
    cost: 'no reach at all — 12% less',
    maxStacks: 4, price: 26, weight: 1, tags: ['guns', 'light', 'close'],
    apply: (m) => { m.damage *= 1.32; m.reload *= 0.95; m.range *= 0.88 },
  },
  {
    id: 'quick-match', name: 'Quick Match', group: 'Gunnery',
    text: 'Hurried loading: 17% faster between broadsides.',
    cost: 'lighter charges, 9% less behind each ball',
    maxStacks: 4, price: 22, weight: 1, tags: ['guns', 'light'],
    apply: (m) => { m.reload *= 0.83; m.damage *= 0.91 },
  },
  {
    id: 'double-charged', name: 'Double-Charged', group: 'Gunnery',
    text: 'Twice the powder behind every ball: 26% more damage.',
    cost: 'and 15% longer to load',
    maxStacks: 3, price: 24, weight: 0.9, tags: ['guns', 'close'],
    apply: (m) => { m.damage *= 1.26; m.reload *= 1.15 },
  },
  {
    id: 'chase-guns', name: 'Chase Guns', group: 'Gunnery',
    text: 'Long, finely bored pieces: 16% further and 14% tighter.',
    cost: 'only two of them, and slow — 8% longer to load',
    maxStacks: 2, price: 28, weight: 0.9, tags: ['guns', 'reach'],
    apply: (m) => { m.range *= 1.16; m.spread *= 0.86; m.reload *= 1.08 },
  },

  // --- Timber and iron ------------------------------------------------------
  {
    id: 'doubled-timbers', name: 'Doubled Timbers', group: 'Quarterdeck',
    text: 'Her scantlings doubled: 18% harder to hurt.',
    cost: 'and a great deal heavier',
    maxStacks: 4, price: 30, weight: 1, tags: ['tough', 'heavy'],
    apply: (m) => { m.toughness *= 1.18; m.burden += 0.1 },
  },
  {
    id: 'ships-carpenter', name: "Ship's Carpenter", group: 'Quarterdeck',
    text: 'Plugs shot holes under way. Slowly mends your hull.',
    maxStacks: 3, price: 24, weight: 0.95, tags: ['tough'],
    apply: (m) => { m.hullRepair += 0.006 },
  },
  {
    id: 'sailmaker', name: 'Sailmaker', group: 'Quarterdeck',
    text: 'Patches canvas as you sail. Slowly mends your rigging.',
    maxStacks: 3, price: 22, weight: 0.95, tags: ['tough', 'handling'],
    apply: (m) => { m.sailRepair += 0.012 },
  },

  // --- Shedding weight: the glass-cannon enablers ---------------------------
  {
    id: 'lighten-ship', name: 'Lighten Ship', group: 'Sailing',
    text: 'Stores, spare spars and half the shot go over the side. She rides higher at once.',
    cost: 'and there is less of her between you and the sea',
    maxStacks: 4, price: 18, weight: 1, tags: ['speed', 'light'],
    apply: (m) => { m.burden = Math.max(0.55, m.burden - 0.13); m.toughness *= 0.96 },
  },
  {
    id: 'racing-trim', name: 'Racing Trim', group: 'Sailing',
    text: 'Everything shifted for speed: 13% less drag.',
    cost: 'nothing left where it ought to be when shot comes aboard',
    maxStacks: 3, price: 20, weight: 0.9, tags: ['speed', 'light'],
    apply: (m) => { m.drag *= 0.87; m.toughness *= 0.96 },
  },

  // --- Rig and helm ---------------------------------------------------------
  {
    id: 'taller-masts', name: 'Taller Masts', group: 'Sailing',
    text: '11% more drive from every point of sail.',
    cost: 'weight aloft, where it is felt most',
    maxStacks: 4, price: 24, weight: 1, tags: ['speed', 'heavy'],
    apply: (m) => { m.thrust *= 1.11; m.burden += 0.04 },
  },
  {
    id: 'larger-rudder', name: 'Larger Rudder', group: 'Sailing',
    text: 'Answers the helm 15% faster.',
    cost: 'and drags through the water for it',
    maxStacks: 4, price: 24, weight: 1, tags: ['handling'],
    apply: (m) => { m.turnRate *= 1.15; m.drag *= 1.07 },
  },
  {
    id: 'rakish-lines', name: 'Rakish Lines', group: 'Sailing',
    text: 'Cut away forward: 12% quicker on the helm.',
    cost: 'less hull to take a beating',
    maxStacks: 4, price: 22, weight: 1, tags: ['handling', 'light'],
    apply: (m) => { m.turnRate *= 1.12; m.toughness *= 0.95 },
  },

  // --- Shot types -----------------------------------------------------------
  // One family, mutually exclusive: the first one taken locks out the others
  // for the rest of the run. They trade rather than add — the split is
  // renormalised, so loading chain buys rigging damage by giving up hull
  // damage — which meant opposing types cancelled almost exactly and a mixed
  // loadout silently wasted draft picks.
  {
    id: 'chain-shot', name: 'Chain Shot', exclusive: 'shot', group: 'Shot',
    text: 'Bar and chain, aimed high. Tears rigging and strands them — at the cost of hull damage.',
    maxStacks: 3, price: 26, weight: 0.8, tags: ['guns'],
    apply: (m) => { m.shotSails *= 2.1; m.shotHull *= 0.82 },
  },
  {
    id: 'grape-shot', name: 'Grape Shot', exclusive: 'shot', group: 'Shot',
    text: 'Sweeps the deck. Guts their crew, blunting their gunnery and their helm.',
    maxStacks: 3, price: 26, weight: 0.8, tags: ['guns'],
    apply: (m) => { m.shotCrew *= 2.4; m.shotHull *= 0.85 },
  },
  {
    id: 'round-shot', name: 'Double-Shotted', exclusive: 'shot', group: 'Shot',
    text: 'Straight at the waterline. Everything into the hull — the fastest way to sink her.',
    maxStacks: 3, price: 26, weight: 0.8, tags: ['guns'],
    apply: (m) => { m.shotHull *= 1.7; m.shotSails *= 0.8; m.shotCrew *= 0.8 },
  },

  // --- Quarterdeck ----------------------------------------------------------
  {
    id: 'loot-hooks', name: 'Grappling Hooks', group: 'Quarterdeck',
    text: 'Sweeps up plunder from 55% further out.',
    maxStacks: 3, price: 20, weight: 0.9, tags: ['economy'],
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
