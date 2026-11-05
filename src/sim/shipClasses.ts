/**
 * Ship classes — the hull you are sailing, as distinct from `ShipMods`, which
 * are the upgrades layered on top of it. Effective stat = tuning baseline ×
 * class × mods, so the tuning sliders stay authoritative over the whole fleet
 * and a class is only ever a relative statement about a hull.
 *
 * Hull types are taken from the Pirates! ship list rather than invented.
 *
 * Colours live here so that one hull is defined in exactly one place. The
 * simulation never reads them; the renderer does.
 */
/**
 * How a captain fights. Stats alone make hulls that feel the same at
 * different speeds; behaviour is what makes an encounter read differently.
 */
export type Behaviour =
  /** Closes and holds you abeam. The default duel. */
  | 'brawler'
  /** Fast and light: presses in close, turns inside you, hurts little. */
  | 'skirmisher'
  /** Keeps her distance and uses her reach. Must be chased down. */
  | 'standoff'
  /** Will not fight. Runs downwind and is worth a great deal if caught. */
  | 'trader'

export interface ShipClass {
  id: string
  name: string
  /** Rough difficulty rank, used by the spawner and for display. */
  tier: number
  behaviour: Behaviour

  // --- Sailing, as multipliers on the tuning baseline ---------------------
  turnRate: number
  thrust: number
  drag: number
  crewSpeed: number

  // --- Gunnery, as multipliers on the tuning baseline ---------------------
  guns: number
  reload: number
  range: number
  damage: number

  /** Incoming damage is divided by this. Below 1 means she is fragile. */
  hullStrength: number

  /**
   * How deep she draws, 0–1. Shallow hulls cross shoals a deep one cannot, so
   * drawing a Brigantine over a reef is a weapon in its own right.
   */
  draught: number

  // --- Presentation --------------------------------------------------------
  scale: number
  colors: { hull: number; deck: number; trim: number; canvas: number }
}

/**
 * A nimble little scout with almost no teeth. Turns inside anything afloat but
 * cannot take or deal a real beating — the intended first encounter.
 */
export const PINNACE: ShipClass = {
  id: 'pinnace', name: 'Pinnace', tier: 1, behaviour: 'skirmisher',
  turnRate: 1.45, thrust: 0.88, drag: 1.12, crewSpeed: 1.2,
  guns: 0.34, reload: 1.2, range: 0.72, damage: 0.8,
  hullStrength: 0.26,
  draught: 0.3,
  scale: 0.66,
  colors: { hull: 0x5c5a4a, deck: 0x8e8a72, trim: 0x2a2922, canvas: 0xe8e2d2 },
}

/** A working trader with a modest battery. Slower, tougher, hits back. */
export const BARQUE: ShipClass = {
  id: 'barque', name: 'Barque', tier: 2, behaviour: 'brawler',
  turnRate: 1.12, thrust: 0.94, drag: 1.04, crewSpeed: 1.0,
  guns: 0.67, reload: 1.08, range: 0.88, damage: 0.9,
  hullStrength: 0.58,
  draught: 0.75,
  scale: 0.87,
  colors: { hull: 0x4e4436, deck: 0x8a7558, trim: 0x241f17, canvas: 0xe4dcc8 },
}

/**
 * The hull Phase 2 was balanced against: a full broadside, a tough hull and a
 * captain who knows how to work to windward. A fair fight on its own, which
 * makes it a boss rather than a mook.
 */
export const BRIGANTINE: ShipClass = {
  id: 'brigantine', name: 'Brigantine', tier: 3, behaviour: 'brawler',
  turnRate: 1.0, thrust: 1.0, drag: 1.0, crewSpeed: 1.0,
  guns: 1.0, reload: 1.0, range: 1.0, damage: 1.0,
  hullStrength: 1.0,
  draught: 1.0,
  scale: 1.0,
  colors: { hull: 0x4a3a46, deck: 0x7d6470, trim: 0x241c22, canvas: 0xdcd2d8 },
}

/**
 * The player's hull. Deliberately identical to the tuning baseline in every
 * respect: the Brigantine fight was balanced and signed off against exactly
 * these numbers, so giving the player even a small handling edge here would
 * quietly make the intended boss easier. Player hull variety is Phase 4.
 */
export const SLOOP: ShipClass = {
  id: 'sloop', name: 'Sloop', tier: 3, behaviour: 'brawler',
  turnRate: 1.0, thrust: 1.0, drag: 1.0, crewSpeed: 1.0,
  guns: 1.0, reload: 1.0, range: 1.0, damage: 1.0,
  hullStrength: 1.0,
  draught: 0.55,
  scale: 1.0,
  colors: { hull: 0x6b4423, deck: 0xa8763f, trim: 0x33210f, canvas: 0xf2ead6 },
}

/**
 * A fat Dutch cargo hauler that wants no part of a fight. She runs downwind
 * the moment she sees you and carries a fortune in her hold, so chasing one
 * is a real decision: the plunder is worth several kills, but the chase takes
 * you off station while the rest of the sea closes in.
 *
 * She is also the clearest argument for chain shot — shoot out her rigging
 * and she cannot run.
 */
export const FLUYT: ShipClass = {
  id: 'fluyt', name: 'Fluyt', tier: 2, behaviour: 'trader',
  // Just slower than the player's Sloop: a stern chase is winnable but long,
  // which is the price of the prize. Faster than the player and she could
  // never be caught at all, which would make her pointless.
  turnRate: 0.7, thrust: 0.9, drag: 1.06, crewSpeed: 0.8,
  guns: 0.34, reload: 1.5, range: 0.7, damage: 0.7,
  hullStrength: 0.95,
  draught: 0.85,
  scale: 1.0,
  colors: { hull: 0x6a5230, deck: 0xa88a52, trim: 0x2e2415, canvas: 0xf0e6cd },
}

/**
 * A light, fast naval sloop. Little weight of shot, but she turns inside
 * almost anything and presses the range, so she is an irritant that will not
 * be shaken off rather than a threat you can trade with.
 */
export const ROYAL_SLOOP: ShipClass = {
  id: 'royal-sloop', name: 'Royal Sloop', tier: 2, behaviour: 'skirmisher',
  turnRate: 1.35, thrust: 1.08, drag: 0.95, crewSpeed: 1.15,
  guns: 0.5, reload: 0.85, range: 0.8, damage: 0.8,
  hullStrength: 0.42,
  draught: 0.4,
  scale: 0.8,
  colors: { hull: 0x3c4f63, deck: 0x6f8498, trim: 0x1b242e, canvas: 0xeef2f6 },
}

/**
 * A proper warship: fast, long-ranged and disciplined. She stands off at the
 * edge of her reach and pounds you, which means you cannot simply hold her
 * abeam and trade — you have to close under fire or leave.
 */
export const FRIGATE: ShipClass = {
  id: 'frigate', name: 'Frigate', tier: 3, behaviour: 'standoff',
  turnRate: 1.0, thrust: 1.12, drag: 0.92, crewSpeed: 1.1,
  // Out-ranges the player, but only just. A wide gap meant she could plink
  // away with no reply at all, which is oppressive rather than interesting —
  // the point is that closing costs you, not that closing is the only option.
  guns: 0.84, reload: 0.95, range: 1.18, damage: 1.0,
  hullStrength: 0.8,
  draught: 0.8,
  scale: 0.95,
  colors: { hull: 0x53333a, deck: 0x8a5f62, trim: 0x251418, canvas: 0xf4ece0 },
}

/**
 * The heaviest thing afloat. Slow, enormous broadside, and she draws so much
 * water that a shoal will strand her outright — which is the intended answer
 * to her, since trading broadsides is not one.
 */
export const GALLEON: ShipClass = {
  id: 'galleon', name: 'Galleon', tier: 4, behaviour: 'brawler',
  turnRate: 0.62, thrust: 0.9, drag: 1.1, crewSpeed: 0.85,
  guns: 1.5, reload: 1.3, range: 1.1, damage: 1.25,
  hullStrength: 1.7,
  draught: 1.0,
  scale: 1.3,
  colors: { hull: 0x5a4330, deck: 0x9c7b4e, trim: 0x2b1f13, canvas: 0xf6edd6 },
}

/** Enemy hulls in ascending difficulty. */
export const ENEMY_CLASSES: ShipClass[] = [
  PINNACE, ROYAL_SLOOP, FLUYT, BARQUE, FRIGATE, BRIGANTINE, GALLEON,
]
