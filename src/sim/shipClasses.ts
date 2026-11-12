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

/**
 * How a hull is laid out, for the renderer. Every field is a proportion of
 * the standard hull, so 1 everywhere is the shape every ship used to share.
 */
export interface HullPlan {
  /** Length and beam against the standard hull, on top of `scale`. */
  length: number
  beam: number
  /**
   * Where she reaches full breadth, as a share of the half-length forward of
   * midships. High is a bluff, apple-cheeked bow; low is a long fine entry.
   */
  bow: number
  /** Breadth of the transom against her greatest beam. A Fluyt's is tiny. */
  stern: number
  /** Raised decks: a poop aft, and a forecastle too on the tall ships. */
  castle?: 'stern' | 'both'
  /** Gunports a side drawn along the rail, and how many rows of them. */
  ports?: number
  decks?: number
}

/**
 * One mast and what she sets on it.
 *
 *  - `square`: yards across the ship, one more per sail order up to `tiers`.
 *  - `gaff`: a fore-and-aft sail on a boom that swings to leeward, with a
 *    gaff topsail over it under full canvas.
 *  - `lateen`: a long slanted yard crossing the mast — the old Mediterranean
 *    rig, still carried on the mizzens of Galleons and Fluyts.
 */
export interface MastPlan {
  /** Fore-and-aft position as a share of the half-length; + is forward. */
  at: number
  kind: 'square' | 'gaff' | 'lateen'
  /** Square sails: yard half-width in beams. Fore-and-aft: boom in lengths. */
  size: number
  /** Square masts: the most yards she crosses. */
  tiers?: number
  /** Square masts: a gaff spanker set under the yards, as a Frigate's mizzen. */
  spanker?: number
}

export interface ShipLook {
  hull: HullPlan
  masts: MastPlan[]
  /** Headsails set from the bowsprit: 0, 1 or 2. */
  jibs: number
}

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
   * What she costs at the yard, in doubloons banked from earlier voyages.
   * Absent or zero means every captain has her from the start.
   */
  price?: number

  /**
   * A feat that has to be done before the yard will lay her down at any
   * price. The big hulls are earned at sea first and paid for second: you
   * build a Galleon after you have beaten one.
   */
  requires?: string

  /**
   * How deep she draws, 0–1. Shallow hulls cross shoals a deep one cannot, so
   * drawing a Brigantine over a reef is a weapon in its own right.
   */
  draught: number

  // --- Presentation --------------------------------------------------------
  /**
   * Rig and hull shape. Every ship used to be the same two-masted square
   * rigger in different sizes and colours, which made a Pinnace and a
   * Galleon the same silhouette at two zooms. Real rigs differ in kind, and
   * reading one at a glance is how a captain knew what was coming.
   */
  look: ShipLook
  scale: number
  colors: { hull: number; deck: number; trim: number; canvas: number }
}

// --- Rigs ---------------------------------------------------------------------
//
// Taken from what these ships actually carried, because the real differences
// are also the legible ones: a sloop is one mast and a boom, a brigantine is
// square forward and fore-and-aft aft, a Galleon has lateen mizzens under a
// castle. At the size a ship is drawn, that is the difference between knowing
// what is coming and reading a label.

/** A bare open boat: one lateen, nothing else. */
const LOOK_PINNACE: ShipLook = {
  hull: { length: 0.92, beam: 0.82, bow: 0.4, stern: 0.4 },
  masts: [{ at: 0.2, kind: 'lateen', size: 0.62 }],
  jibs: 0,
}

/** The player's Pinnace: the same boat, with a jib to point higher. */
const LOOK_PINNACE_ARMED: ShipLook = {
  hull: { length: 0.92, beam: 0.82, bow: 0.4, stern: 0.4 },
  masts: [{ at: 0.22, kind: 'lateen', size: 0.62 }],
  jibs: 1,
}

/** One tall mast, a long boom and a pair of headsails: the pirate's own. */
const LOOK_SLOOP: ShipLook = {
  hull: { length: 1, beam: 0.95, bow: 0.5, stern: 0.6 },
  masts: [{ at: 0.18, kind: 'gaff', size: 0.78 }],
  jibs: 2,
}

/** Square-rigged on the fore, a big fore-and-aft main aft. */
const LOOK_BRIGANTINE: ShipLook = {
  hull: { length: 1.05, beam: 1, bow: 0.55, stern: 0.7, ports: 4 },
  masts: [
    { at: 0.38, kind: 'square', size: 1.4, tiers: 2 },
    { at: -0.2, kind: 'gaff', size: 0.62 },
  ],
  jibs: 1,
}

/** Two square masts: what every ship looked like before, now only the navy's brig. */
const LOOK_BRIG: ShipLook = {
  hull: { length: 0.95, beam: 0.9, bow: 0.45, stern: 0.65, ports: 4 },
  masts: [
    { at: 0.36, kind: 'square', size: 1.35, tiers: 2 },
    { at: -0.3, kind: 'square', size: 1.2, tiers: 2, spanker: 0.42 },
  ],
  jibs: 1,
}

/** Three masts, square on two and fore-and-aft on the mizzen. A working ship. */
const LOOK_BARQUE: ShipLook = {
  hull: { length: 1.05, beam: 1.05, bow: 0.62, stern: 0.7 },
  masts: [
    { at: 0.46, kind: 'square', size: 1.3, tiers: 2 },
    { at: 0.02, kind: 'square', size: 1.4, tiers: 2 },
    { at: -0.5, kind: 'gaff', size: 0.42 },
  ],
  jibs: 1,
}

/**
 * The Dutch carrier: a pear-shaped hull that tumbles home to a tiny stern,
 * built to pay as little in tolls on deck breadth as possible. Square on two
 * masts, a lateen on the mizzen.
 */
const LOOK_FLUYT: ShipLook = {
  hull: { length: 1.02, beam: 1.22, bow: 0.72, stern: 0.32, castle: 'stern' },
  masts: [
    { at: 0.44, kind: 'square', size: 1.3, tiers: 2 },
    { at: 0.0, kind: 'square', size: 1.4, tiers: 2 },
    { at: -0.48, kind: 'lateen', size: 0.4 },
  ],
  jibs: 0,
}

/** Long, fine and fully square-rigged, with a spanker on the mizzen. */
const LOOK_FRIGATE: ShipLook = {
  hull: { length: 1.18, beam: 0.92, bow: 0.4, stern: 0.68, ports: 7 },
  masts: [
    { at: 0.46, kind: 'square', size: 1.3, tiers: 2 },
    { at: 0.02, kind: 'square', size: 1.45, tiers: 2 },
    { at: -0.48, kind: 'square', size: 1.05, tiers: 2, spanker: 0.38 },
  ],
  jibs: 2,
}

/**
 * Castles fore and aft on a broad hull, square courses and topsails on the
 * fore and main, and two lateen mizzens behind them. Nothing else afloat
 * has that profile.
 */
const LOOK_GALLEON: ShipLook = {
  hull: { length: 1.08, beam: 1.25, bow: 0.58, stern: 0.82, castle: 'both', ports: 6 },
  masts: [
    { at: 0.5, kind: 'square', size: 1.35, tiers: 2 },
    { at: 0.06, kind: 'square', size: 1.55, tiers: 2 },
    { at: -0.4, kind: 'lateen', size: 0.4 },
    { at: -0.72, kind: 'lateen', size: 0.3 },
  ],
  jibs: 0,
}

/** A ship of the line: two rows of guns, three tall square masts, a poop. */
const LOOK_MAN_OF_WAR: ShipLook = {
  hull: { length: 1.2, beam: 1.15, bow: 0.5, stern: 0.78, castle: 'stern', ports: 8, decks: 2 },
  masts: [
    { at: 0.46, kind: 'square', size: 1.45, tiers: 2 },
    { at: 0.02, kind: 'square', size: 1.6, tiers: 2 },
    { at: -0.46, kind: 'square', size: 1.2, tiers: 2, spanker: 0.4 },
  ],
  jibs: 2,
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
  look: LOOK_PINNACE,
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
  look: LOOK_BARQUE,
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
  look: LOOK_BRIGANTINE,
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
  look: LOOK_SLOOP,
  scale: 1.0,
  colors: { hull: 0x6b4423, deck: 0xa8763f, trim: 0x33210f, canvas: 0xf2ead6 },
  // Her multipliers must stay at 1.0 — every other number in the game is
  // balanced against them — so her signature lives here instead, where it
  // touches only the player's own ship: a well-found vessel with a crew who
  // know her. Without something of her own she was the only hull with no
  // identity, which is a poor reward for picking the honest option.
  playerMods: { crewSpeed: 1.15, reload: 0.93 },
  blurb: 'Baseline. +15% sail handling, -7% reload.',
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
  look: LOOK_PINNACE_ARMED,
  scale: 0.74,
  colors: { hull: 0x7a6a3f, deck: 0xbda95f, trim: 0x332c17, canvas: 0xf4efd8 },
  blurb: '+50% turn rate, +20% sail handling. -22% guns, -22% timbers. Crosses most shoals.',
  price: 400,
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
  look: LOOK_BRIGANTINE,
  scale: 1.15,
  colors: { hull: 0x58323c, deck: 0x90616a, trim: 0x29161b, canvas: 0xf0e4e4 },
  blurb: '+10% guns, +15% timbers, +5% damage. -32% turn rate, +14% reload. Deep draught.',
  price: 1600,
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
  look: LOOK_FLUYT,
  scale: 1.05,
  colors: { hull: 0x6a5230, deck: 0xa88a52, trim: 0x2e2415, canvas: 0xf0e6cd },
  // Her hold is the point: plunder from much further out, so she out-levels
  // every other hull and wins on upgrades rather than gunnery.
  playerMods: { pickupRadius: 2.1 },
  blurb: '+30% timbers, x2.1 plunder reach. -38% guns, -15% damage.',
  price: 900,
}

// --- The capital hulls ------------------------------------------------------
//
// The four above are sidegrades, held within a few points of each other on
// purpose. These three are not. They are the back half of the arc — the ships
// that hunted you, sailed by you — and they are simply better, which is why
// each is gated twice: by a feat done at sea and by a price that takes many
// voyages to raise. They are balanced against the notoriety ladder rather
// than against the Sloop.

/**
 * The warship that used to stand off and cut your rigging to ribbons. Fast,
 * long-armed and handy enough to choose her range, which is the one thing no
 * cheaper hull can do.
 */
export const PLAYER_FRIGATE: ShipClass = {
  id: 'player-frigate', name: 'Frigate', tier: 3, behaviour: 'standoff',
  turnRate: 0.95, thrust: 1.12, drag: 0.93, crewSpeed: 1.1,
  guns: 1.17, reload: 0.94, range: 1.16, damage: 1.05,
  hullStrength: 1.25,
  draught: 0.8,
  look: LOOK_FRIGATE,
  scale: 1.08,
  colors: { hull: 0x2f4a5c, deck: 0x6f95ad, trim: 0x15232c, canvas: 0xf4f1e6 },
  blurb: '+17% guns, +16% range, +6% speed, +25% timbers.',
  price: 4500,
  requires: 'cutting-out',
}

/**
 * The treasure ship. Ten guns a side behind timbers that shrug off a Barque
 * entirely. She cannot turn and she cannot run, and for the first time that
 * is somebody else's problem.
 */
export const PLAYER_GALLEON: ShipClass = {
  id: 'player-galleon', name: 'Galleon', tier: 4, behaviour: 'brawler',
  turnRate: 0.64, thrust: 0.93, drag: 1.08, crewSpeed: 0.88,
  guns: 1.67, reload: 1.16, range: 1.1, damage: 1.2,
  hullStrength: 1.95,
  draught: 1.0,
  look: LOOK_GALLEON,
  scale: 1.3,
  colors: { hull: 0x6b2f2a, deck: 0xb0705a, trim: 0x2c1210, canvas: 0xf6edd6 },
  blurb: '+67% guns, +20% damage, +95% timbers. -36% turn rate. Deep draught.',
  price: 8000,
  requires: 'treasure-fleet',
}

/**
 * The ship that was sent to kill you. Twelve guns a side. By the time a
 * captain can lay her keel there is very little left afloat to run from,
 * which is the point of her.
 */
export const PLAYER_MAN_OF_WAR: ShipClass = {
  id: 'player-man-of-war', name: "Man-o'-War", tier: 5, behaviour: 'brawler',
  turnRate: 0.6, thrust: 1.0, drag: 1.04, crewSpeed: 0.95,
  guns: 2.0, reload: 1.08, range: 1.18, damage: 1.25,
  hullStrength: 2.5,
  draught: 1.0,
  look: LOOK_MAN_OF_WAR,
  scale: 1.45,
  colors: { hull: 0x23232b, deck: 0x8c7a4a, trim: 0x0e0e12, canvas: 0xf2ecd8 },
  blurb: 'x2 guns, +25% damage, +18% range, x2.5 timbers. -40% turn rate. Deep draught.',
  price: 16000,
  requires: 'turnabout',
}

/**
 * Hulls the player may take to sea, in the order the yard sells them: the
 * Sloop every captain starts with, then dearest last.
 */
export const PLAYER_CLASSES: ShipClass[] = [
  SLOOP, PLAYER_PINNACE, PLAYER_FLUYT, PLAYER_BRIGANTINE,
  PLAYER_FRIGATE, PLAYER_GALLEON, PLAYER_MAN_OF_WAR,
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
  look: LOOK_FLUYT,
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
  look: LOOK_BRIG,
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
  look: LOOK_FRIGATE,
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
  look: LOOK_GALLEON,
  scale: 1.3,
  colors: { hull: 0x5a4330, deck: 0x9c7b4e, trim: 0x2b1f13, canvas: 0xf6edd6 },
}

/**
 * A ship of the line, sent for one captain in particular.
 *
 * She is not a fight. Against a stock hull she is four times the broadside
 * behind two and a half times the timbers, and the only answers are the ones
 * the sailing model already provides: she is a little slower than a Sloop
 * under full sail, she turns like a continent, and she draws so much water that
 * any bar will stop her. So for the first dozen voyages she is a reason to
 * know where the shoals are — and much later, refitted and in a capital hull,
 * she is the richest prize on the sea. Same ship, same numbers; the arc is
 * entirely in what the player has become.
 */
export const MAN_OF_WAR: ShipClass = {
  id: 'man-of-war', name: "Man-o'-War", tier: 5, behaviour: 'brawler',
  turnRate: 0.52, thrust: 0.86, drag: 1.1, crewSpeed: 0.9,
  guns: 1.84, reload: 1.2, range: 1.0, damage: 1.3,
  hullStrength: 2.6,
  draught: 1.0,
  look: LOOK_MAN_OF_WAR,
  scale: 1.5,
  colors: { hull: 0x23232b, deck: 0x8c7a4a, trim: 0x0e0e12, canvas: 0xf2ecd8 },
}

/** Enemy hulls in ascending difficulty. */
export const ENEMY_CLASSES: ShipClass[] = [
  PINNACE, ROYAL_SLOOP, FLUYT, BARQUE, FRIGATE, BRIGANTINE, GALLEON, MAN_OF_WAR,
]
