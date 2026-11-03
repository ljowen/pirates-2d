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
export interface ShipClass {
  id: string
  name: string
  /** Rough difficulty rank, used by the spawner and for display. */
  tier: number

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
  id: 'pinnace', name: 'Pinnace', tier: 1,
  turnRate: 1.45, thrust: 0.88, drag: 1.12, crewSpeed: 1.2,
  guns: 0.34, reload: 1.2, range: 0.72, damage: 0.8,
  hullStrength: 0.26,
  draught: 0.3,
  scale: 0.66,
  colors: { hull: 0x5c5a4a, deck: 0x8e8a72, trim: 0x2a2922, canvas: 0xe8e2d2 },
}

/** A working trader with a modest battery. Slower, tougher, hits back. */
export const BARQUE: ShipClass = {
  id: 'barque', name: 'Barque', tier: 2,
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
  id: 'brigantine', name: 'Brigantine', tier: 3,
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
  id: 'sloop', name: 'Sloop', tier: 3,
  turnRate: 1.0, thrust: 1.0, drag: 1.0, crewSpeed: 1.0,
  guns: 1.0, reload: 1.0, range: 1.0, damage: 1.0,
  hullStrength: 1.0,
  draught: 0.55,
  scale: 1.0,
  colors: { hull: 0x6b4423, deck: 0xa8763f, trim: 0x33210f, canvas: 0xf2ead6 },
}

/** Enemy hulls in ascending difficulty. */
export const ENEMY_CLASSES: ShipClass[] = [PINNACE, BARQUE, BRIGANTINE]
