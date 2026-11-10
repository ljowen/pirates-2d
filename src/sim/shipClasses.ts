import type { ShipMods } from './ship'

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
   * Modifiers applied when this hull is the *player's*, on top of the stock
   * set. Lets a hull carry a signature ability — a roomy hold that sweeps
   * plunder from further out, say — without inventing a parallel system.
   */
  playerMods?: Partial<ShipMods>

  /**
   * What this hull loads, as a bias on where her shot lands — the same split
   * the player's shot-type cards edit, renormalised the same way.
   *
   * This is how the rigging and crew pools come alive for the *player*. With
   * every hull afloat firing plain round shot, two of the three bars could
   * only ever be grazed, so the only ship that ever threatened your canvas was
   * one that did not exist. A Frigate standing off and cutting your rigging to
   * ribbons is a different fight from a Barque hammering your waterline, and
   * it is the same fight the player gets to pick when they draft chain.
   */
  shotBias?: { hull: number; sails: number; crew: number }

  /** One line of character, shown when choosing a ship. */
  blurb?: string

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

// --- Playable hulls -------------------------------------------------------
//
// Deliberately a separate roster from the enemy classes above. The enemy
// Brigantine and Galleon are tuned to be *fought* — reusing them as player
// ships would import boss numbers into the player's hands. These share only
// their names and silhouettes.

/**
 * The reference hull, identical to the tuning baseline in every respect.
 * Everything else in the game is balanced against exactly these numbers, so
 * this one must not drift.
 */
export const SLOOP: ShipClass = {
  id: 'sloop', name: 'Sloop', tier: 3, behaviour: 'brawler',
  turnRate: 1.0, thrust: 1.0, drag: 1.0, crewSpeed: 1.0,
  guns: 1.0, reload: 1.0, range: 1.0, damage: 1.0,
  hullStrength: 1.0,
  draught: 0.55,
  scale: 1.0,
  colors: { hull: 0x6b4423, deck: 0xa8763f, trim: 0x33210f, canvas: 0xf2ead6 },
  // Her multipliers must stay at 1.0 — every other number in the game is
  // balanced against them — so her signature lives here instead, where it
  // touches only the player's own ship: a well-found vessel with a crew who
  // know her. Without something of her own she was the only hull with no
  // identity, which is a poor reward for picking the honest option.
  playerMods: { crewSpeed: 1.15, reload: 0.93 },
  blurb: 'Handy, well armed, and a crew who know her. Quick on the sheets and quick to reload.',
}

/**
 * A cockleshell that draws almost nothing. She turns inside everything afloat
 * and can cross water that strands a Galleon, which turns the shoals from a
 * hazard into the place you live. She also cannot take a beating, so the
 * shallows are not a preference — they are the plan.
 */
export const PLAYER_PINNACE: ShipClass = {
  id: 'player-pinnace', name: 'Pinnace', tier: 1, behaviour: 'skirmisher',
  turnRate: 1.5, thrust: 1.04, drag: 0.94, crewSpeed: 1.2,
  guns: 0.78, reload: 0.84, range: 0.85, damage: 0.95,
  hullStrength: 0.78,
  draught: 0.22,
  scale: 0.74,
  colors: { hull: 0x7a6a3f, deck: 0xbda95f, trim: 0x332c17, canvas: 0xf4efd8 },
  blurb: 'Draws almost nothing and turns on a sixpence. Live in the shoals, where the heavy hulls cannot follow.',
}

/**
 * A heavy broadside on a sluggish hull that draws too much water to use the
 * shallows at all. No escape route, so the answer to everything is to turn
 * into it and out-shoot it.
 */
export const PLAYER_BRIGANTINE: ShipClass = {
  id: 'player-brigantine', name: 'Brigantine', tier: 3, behaviour: 'brawler',
  // Weight of shot has to be paid for. At 1.35 guns and 1.4 timbers she was
  // simply a better Sloop rather than a different one — strictly dominant at
  // a 67% win rate against the Sloop's 25%.
  turnRate: 0.68, thrust: 0.9, drag: 1.1, crewSpeed: 0.92,
  guns: 1.1, reload: 1.14, range: 1.05, damage: 1.05,
  hullStrength: 1.15,
  draught: 1.0,
  scale: 1.15,
  colors: { hull: 0x58323c, deck: 0x90616a, trim: 0x29161b, canvas: 0xf0e4e4 },
  blurb: 'Weight of shot and timber to soak it. Too deep for the shallows, so there is nowhere to run.',
}

/**
 * A merchantman turned pirate: poorly armed, roomy, and able to sweep up
 * plunder from a long way off. She levels faster than anything else afloat
 * and wins by out-growing her problems rather than out-shooting them.
 */
export const PLAYER_FLUYT: ShipClass = {
  id: 'player-fluyt', name: 'Fluyt', tier: 2, behaviour: 'trader',
  turnRate: 0.84, thrust: 1.0, drag: 1.0, crewSpeed: 0.9,
  guns: 0.62, reload: 1.12, range: 0.9, damage: 0.85,
  hullStrength: 1.3,
  draught: 0.8,
  scale: 1.05,
  colors: { hull: 0x6a5230, deck: 0xa88a52, trim: 0x2e2415, canvas: 0xf0e6cd },
  // Her hold is the point: plunder from much further out, so she out-levels
  // every other hull and wins on upgrades rather than gunnery.
  playerMods: { pickupRadius: 2.1 },
  blurb: 'Few guns and a vast hold. Sweep up plunder from far off and out-level your troubles.',
}

/** Hulls the player may take to sea. */
export const PLAYER_CLASSES: ShipClass[] = [
  SLOOP, PLAYER_PINNACE, PLAYER_BRIGANTINE, PLAYER_FLUYT,
]

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
  // She gets inside your reach and sweeps your deck. Little weight of shot,
  // but she thins your crew, and a thinned crew reloads slower — which is
  // exactly how an irritant that cannot sink you still beats you.
  shotBias: { hull: 0.9, sails: 1, crew: 2.6 },
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
  // She fights at arm's length, so she cuts up your rigging to keep you
  // there. This is the ship that makes the rigging bar frightening.
  shotBias: { hull: 0.85, sails: 2.4, crew: 1 },
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
