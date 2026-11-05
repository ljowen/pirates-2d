/**
 * Every number that shapes how sailing *feels* lives here, and every one of
 * them is editable live from the tuning panel (backtick key). Feel is found by
 * twiddling, not by reasoning, so nothing below should be hardcoded elsewhere.
 */
export interface TuningParam {
  key: keyof TuningValues
  label: string
  min: number
  max: number
  step: number
  group: string
  help?: string
}

export interface TuningValues {
  // --- Hull & drive -------------------------------------------------------
  thrustScale: number
  dragForward: number
  dragForwardLinear: number
  dragLateral: number
  dragLateralLinear: number
  leeway: number
  leewayAxial: number
  sternwayDrag: number

  // --- Steering -----------------------------------------------------------
  baseTurnRate: number
  rudderSpeed: number
  steerageFloor: number
  steerageRefSpeed: number
  fullSailTurnPenalty: number

  // --- Rigging ------------------------------------------------------------
  canvasChangeRate: number

  // --- Weather ------------------------------------------------------------
  windBaseStrength: number
  windGustAmount: number
  windGustRate: number
  windSwingDegrees: number
  windSwingRate: number
  overcanvasPenalty: number
  windPatternScale: number
  windVeerDegrees: number
  windLocalGust: number
  windPatternDrift: number
  windShadowStrength: number
  windShadowLength: number

  // --- Gunnery ------------------------------------------------------------
  gunRange: number
  gunArcDegrees: number
  gunReload: number
  gunsPerBroadside: number
  ballSpeed: number
  ballSpread: number
  gunRippleGap: number
  damagePerBall: number
  sailDriveFloor: number

  // --- The run ------------------------------------------------------------
  runDuration: number
  draftCards: number
  spawnIntervalStart: number
  spawnIntervalEnd: number
  enemyCapStart: number
  enemyCapEnd: number
  spawnRadius: number
  bossLull: number
  endlessWaveSeconds: number
  endlessRamp: number
  endlessCapGrowth: number
  endlessMinInterval: number
  playerHullRepair: number
  playerSailRepair: number
  playerCrewRepair: number
  plunderLifetime: number
  plunderPickupRadius: number
  plunderMagnetRadius: number
  plunderMagnetPull: number

  // --- Land --------------------------------------------------------------
  islandDensity: number
  islandCellSize: number
  islandMinRadius: number
  islandMaxRadius: number
  shoalScale: number
  groundingDamage: number
  groundingDrag: number
  shoalDraughtPenalty: number
  aiLandLookahead: number

  // --- Enemy captains -----------------------------------------------------
  aiStandoff: number
  aiMinRange: number
  aiBeatAngle: number
  aiTackHysteresis: number

  // --- Presentation -------------------------------------------------------
  heelFromTurn: number
  heelFromWind: number
  heelSmoothing: number
  cameraZoom: number
  cameraSmoothing: number
  cameraLead: number
  cameraZoomOut: number
  wakeRate: number
  masterVolume: number
}

export const DEFAULT_TUNING: TuningValues = {
  thrustScale: 55,
  dragForward: 0.0011,
  dragForwardLinear: 0.012,
  dragLateral: 0.06,
  dragLateralLinear: 1.8,
  leeway: 16,
  leewayAxial: 0.2,
  sternwayDrag: 6,

  baseTurnRate: 0.95,
  rudderSpeed: 3.0,
  steerageFloor: 0.12,
  steerageRefSpeed: 70,
  fullSailTurnPenalty: 0.6,

  canvasChangeRate: 0.45,

  windBaseStrength: 1.0,
  windGustAmount: 0.3,
  windGustRate: 0.05,
  windSwingDegrees: 28,
  windSwingRate: 0.012,
  overcanvasPenalty: 0.35,
  windPatternScale: 2200,
  windVeerDegrees: 26,
  windLocalGust: 0.38,
  windPatternDrift: 16,
  windShadowStrength: 0.7,
  windShadowLength: 2.4,

  gunRange: 500,
  gunArcDegrees: 62,
  gunReload: 2.0,
  gunsPerBroadside: 6,
  ballSpeed: 280,
  ballSpread: 0.055,
  gunRippleGap: 0.075,
  damagePerBall: 0.055,
  sailDriveFloor: 0.25,

  runDuration: 480,
  draftCards: 4,
  spawnIntervalStart: 7.0,
  spawnIntervalEnd: 2.6,
  enemyCapStart: 2,
  enemyCapEnd: 6,
  spawnRadius: 1400,
  bossLull: 22,
  endlessWaveSeconds: 55,
  endlessRamp: 0.5,
  endlessCapGrowth: 2,
  endlessMinInterval: 0.6,
  playerHullRepair: 0.0085,
  playerSailRepair: 0.026,
  playerCrewRepair: 0.016,
  plunderLifetime: 26,
  plunderPickupRadius: 46,
  plunderMagnetRadius: 190,
  plunderMagnetPull: 420,

  islandDensity: 0.42,
  islandCellSize: 1500,
  islandMinRadius: 90,
  islandMaxRadius: 260,
  shoalScale: 1.7,
  groundingDamage: 0.1,
  groundingDrag: 7,
  shoalDraughtPenalty: 0.55,
  aiLandLookahead: 320,

  aiStandoff: 230,
  aiMinRange: 120,
  aiBeatAngle: 60,
  aiTackHysteresis: 0.25,

  heelFromTurn: 0.0016,
  heelFromWind: 0.18,
  heelSmoothing: 4,
  cameraZoom: 0.75,
  cameraSmoothing: 3.2,
  cameraLead: 0.45,
  cameraZoomOut: 0.18,
  wakeRate: 40,
  masterVolume: 0.7,
}

export const TUNING_SCHEMA: TuningParam[] = [
  { key: 'thrustScale', label: 'Sail thrust', min: 10, max: 200, step: 1, group: 'Hull & drive', help: 'Raw drive from a full press of canvas at beam reach.' },
  { key: 'dragForward', label: 'Drag (quadratic)', min: 0, max: 0.006, step: 0.0001, group: 'Hull & drive', help: 'Dominates top speed.' },
  { key: 'dragForwardLinear', label: 'Drag (linear)', min: 0, max: 0.4, step: 0.005, group: 'Hull & drive', help: 'Dominates how quickly you coast to a stop.' },
  { key: 'dragLateral', label: 'Keel bite (quadratic)', min: 0, max: 0.4, step: 0.005, group: 'Hull & drive' },
  { key: 'dragLateralLinear', label: 'Keel bite (linear)', min: 0, max: 8, step: 0.1, group: 'Hull & drive', help: 'Higher means less sideways slide through a turn.' },
  { key: 'leeway', label: 'Leeway push', min: 0, max: 60, step: 1, group: 'Hull & drive', help: 'How hard the wind shoves you downwind. This is what drifts you out of irons.' },

  { key: 'leewayAxial', label: 'Leeway along hull', min: 0, max: 1, step: 0.01, group: 'Hull & drive', help: 'How much of the wind push acts fore-and-aft rather than sideways. Low values mean you slip rather than get blown astern.' },
  { key: 'sternwayDrag', label: 'Sternway drag', min: 1, max: 20, step: 0.5, group: 'Hull & drive', help: 'Extra drag when moving transom-first. A hull going backwards is not streamlined.' },

  { key: 'baseTurnRate', label: 'Max turn rate (rad/s)', min: 0.1, max: 2.5, step: 0.01, group: 'Steering' },
  { key: 'rudderSpeed', label: 'Rudder swing speed', min: 0.5, max: 12, step: 0.1, group: 'Steering', help: 'How fast the helm answers your input.' },
  { key: 'steerageFloor', label: 'Steerage at rest', min: 0, max: 1, step: 0.01, group: 'Steering', help: 'Rudder authority with no water flowing over it.' },
  { key: 'steerageRefSpeed', label: 'Full-steerage speed', min: 10, max: 250, step: 5, group: 'Steering' },
  { key: 'fullSailTurnPenalty', label: 'Full-sail turn penalty', min: 0.2, max: 1, step: 0.01, group: 'Steering', help: '1.0 removes the battle-sails advantage entirely.' },

  { key: 'canvasChangeRate', label: 'Sail change rate', min: 0.1, max: 3, step: 0.05, group: 'Rigging', help: 'How fast the crew works the canvas.' },

  { key: 'windBaseStrength', label: 'Base wind strength', min: 0.2, max: 2, step: 0.05, group: 'Weather' },
  { key: 'windGustAmount', label: 'Gust amount', min: 0, max: 1, step: 0.01, group: 'Weather' },
  { key: 'windGustRate', label: 'Gust rate', min: 0.005, max: 0.5, step: 0.005, group: 'Weather' },
  { key: 'windSwingDegrees', label: 'Wind swing (deg)', min: 0, max: 180, step: 1, group: 'Weather', help: 'How far the wind wanders from its mean heading.' },
  { key: 'windSwingRate', label: 'Wind swing rate', min: 0.001, max: 0.2, step: 0.001, group: 'Weather' },
  { key: 'overcanvasPenalty', label: 'Overcanvas penalty', min: 0, max: 1, step: 0.01, group: 'Weather', help: 'Speed lost for carrying full sail in heavy wind.' },

  { key: 'gunRange', label: 'Gun range', min: 120, max: 900, step: 10, group: 'Gunnery' },
  { key: 'gunArcDegrees', label: 'Broadside arc (±deg)', min: 10, max: 90, step: 1, group: 'Gunnery', help: 'How far off the beam the guns will bear. Small values demand precise positioning.' },
  { key: 'gunReload', label: 'Reload (s)', min: 0.5, max: 10, step: 0.1, group: 'Gunnery' },
  { key: 'gunsPerBroadside', label: 'Guns per broadside', min: 1, max: 16, step: 1, group: 'Gunnery' },
  { key: 'ballSpeed', label: 'Shot speed', min: 120, max: 1200, step: 10, group: 'Gunnery', help: 'Lower means more lead required, and more time to sail out from under an incoming volley.' },
  { key: 'gunRippleGap', label: 'Gun ripple gap (s)', min: 0, max: 0.4, step: 0.005, group: 'Gunnery', help: 'Delay between guns in a broadside. Zero fires them all at once; higher rolls the volley down the ship\'s side.' },
  { key: 'ballSpread', label: 'Shot spread', min: 0, max: 0.3, step: 0.005, group: 'Gunnery' },
  { key: 'damagePerBall', label: 'Damage per ball', min: 0.005, max: 0.3, step: 0.005, group: 'Gunnery' },
  { key: 'sailDriveFloor', label: 'Shredded-sail drive', min: 0, max: 1, step: 0.01, group: 'Gunnery', help: 'Drive remaining with sails fully shot away. This is what wires gunnery back into the sailing model.' },

  { key: 'runDuration', label: 'Run length (s)', min: 120, max: 1800, step: 30, group: 'The run' },
  { key: 'draftCards', label: 'Draft cards offered', min: 2, max: 5, step: 1, group: 'The run', help: 'More cards means less chance of a hand with nothing useful in it. Cuts run-to-run variance without raising the power ceiling.' },
  { key: 'spawnIntervalStart', label: 'Spawn gap, start (s)', min: 0.5, max: 15, step: 0.1, group: 'The run' },
  { key: 'spawnIntervalEnd', label: 'Spawn gap, end (s)', min: 0.3, max: 10, step: 0.1, group: 'The run' },
  { key: 'enemyCapStart', label: 'Enemy cap, start', min: 1, max: 20, step: 1, group: 'The run' },
  { key: 'enemyCapEnd', label: 'Enemy cap, end', min: 1, max: 40, step: 1, group: 'The run', help: 'How many hulls can be afloat at once late in a run. This is the survivability lever: the spawn gap governs how much plunder you earn, the cap governs how much is shooting at you at once.' },
  { key: 'spawnRadius', label: 'Spawn distance', min: 500, max: 3000, step: 20, group: 'The run', help: 'Enemies appear this far out. Must stay beyond the edge of the view, so it has to rise if you zoom out.' },
  { key: 'bossLull', label: 'Boss spawn lull (s)', min: 0, max: 40, step: 1, group: 'The run', help: 'Routine spawns pause this long when a boss arrives, so the boss is a duel rather than the last straw.' },
  { key: 'endlessWaveSeconds', label: 'Endless wave length (s)', min: 15, max: 180, step: 5, group: 'The run', help: 'How long each wave of the endless mode lasts before the next, larger one arrives.' },
  { key: 'endlessRamp', label: 'Endless pressure ramp', min: 0.05, max: 2, step: 0.05, group: 'The run', help: 'How sharply the spawn gap tightens each endless wave. Higher ends runs sooner.' },
  { key: 'endlessCapGrowth', label: 'Endless cap growth', min: 0, max: 8, step: 0.5, group: 'The run', help: 'Extra hulls allowed afloat per endless wave.' },
  { key: 'endlessMinInterval', label: 'Endless spawn floor (s)', min: 0.15, max: 4, step: 0.05, group: 'The run', help: 'Hard floor on the spawn gap, so the ramp cannot divide to nothing.' },

  { key: 'playerHullRepair', label: 'Hull repair /s', min: 0, max: 0.02, step: 0.0005, group: 'The run', help: 'Baseline self-repair. Rewards breaking off downwind to recover.' },
  { key: 'playerSailRepair', label: 'Rigging repair /s', min: 0, max: 0.08, step: 0.001, group: 'The run', help: 'Higher than hull repair: permanently shredded rigging means never escaping anything again.' },
  { key: 'playerCrewRepair', label: 'Crew recovery /s', min: 0, max: 0.08, step: 0.001, group: 'The run', help: 'Wounded hands returning to duty. Restores reload speed and sail handling.' },
  { key: 'plunderLifetime', label: 'Plunder lifetime (s)', min: 5, max: 90, step: 1, group: 'The run' },
  { key: 'plunderPickupRadius', label: 'Pickup radius', min: 15, max: 150, step: 1, group: 'The run' },
  { key: 'plunderMagnetRadius', label: 'Magnet radius', min: 30, max: 600, step: 10, group: 'The run', help: 'Plunder inside this is drawn to you. Larger means less sailing back for scraps.' },
  { key: 'plunderMagnetPull', label: 'Magnet strength', min: 50, max: 1500, step: 10, group: 'The run' },

  { key: 'islandDensity', label: 'Island frequency', min: 0, max: 1, step: 0.02, group: 'Land', help: 'Chance of an island per grid cell. 0 restores open ocean.' },
  { key: 'islandCellSize', label: 'Island spacing', min: 600, max: 4000, step: 50, group: 'Land', help: 'Grid cell size. Larger means islands are further apart.' },
  { key: 'islandMinRadius', label: 'Island size, min', min: 40, max: 400, step: 10, group: 'Land' },
  { key: 'islandMaxRadius', label: 'Island size, max', min: 60, max: 700, step: 10, group: 'Land' },
  { key: 'shoalScale', label: 'Shoal ring', min: 1, max: 3, step: 0.05, group: 'Land', help: 'How far shallow water extends beyond the beach, as a multiple of island radius.' },
  { key: 'groundingDamage', label: 'Grounding damage', min: 0, max: 0.5, step: 0.01, group: 'Land', help: 'Hull lost per second while aground.' },
  { key: 'groundingDrag', label: 'Grounding drag', min: 1, max: 30, step: 0.5, group: 'Land', help: 'How hard the bottom holds you once you touch it.' },
  { key: 'shoalDraughtPenalty', label: 'Shoal drag penalty', min: 0, max: 2, step: 0.05, group: 'Land', help: 'Extra drag in shallows, scaled by how deep the hull draws.' },
  { key: 'aiLandLookahead', label: 'AI land lookahead', min: 80, max: 800, step: 20, group: 'Enemy captains', help: 'How far ahead an enemy captain watches for a shore.' },

  { key: 'aiStandoff', label: 'AI standoff range', min: 80, max: 700, step: 10, group: 'Enemy captains' },
  { key: 'aiMinRange', label: 'AI minimum range', min: 40, max: 400, step: 10, group: 'Enemy captains', help: 'Closer than this and they sheer off rather than foul you.' },
  { key: 'aiBeatAngle', label: 'AI beat angle (deg)', min: 35, max: 90, step: 1, group: 'Enemy captains', help: "The angle off the wind an enemy holds when working to windward. Best VMG is near 60; lower means they pinch and crawl, which is the same trap it punishes the player for." },
  { key: 'aiTackHysteresis', label: 'AI tack reluctance', min: 0, max: 1, step: 0.01, group: 'Enemy captains', help: 'How much better the other tack must look before they put the helm over.' },

  { key: 'windPatternScale', label: 'Wind patch size', min: 400, max: 8000, step: 100, group: 'Weather', help: 'How far you must sail for the local wind to change. Small values make the sea fickle.' },
  { key: 'windVeerDegrees', label: 'Local veer (deg)', min: 0, max: 90, step: 1, group: 'Weather', help: 'How far the wind swings from place to place. 0 restores a single global wind.' },
  { key: 'windLocalGust', label: 'Local gust', min: 0, max: 1, step: 0.01, group: 'Weather', help: 'How much stronger or weaker the wind runs in one patch versus another.' },
  { key: 'windPatternDrift', label: 'Weather drift', min: 0, max: 120, step: 1, group: 'Weather', help: 'How fast the pattern of patches travels downwind.' },
  { key: 'windShadowStrength', label: 'Island lee', min: 0, max: 1, step: 0.05, group: 'Weather', help: 'How much an island blankets the wind downwind of it.' },
  { key: 'windShadowLength', label: 'Lee length', min: 0.5, max: 6, step: 0.1, group: 'Weather', help: 'How far the calm reaches behind an island, in island radii.' },

  { key: 'heelFromTurn', label: 'Heel from turning', min: 0, max: 0.01, step: 0.0001, group: 'Presentation' },
  { key: 'heelFromWind', label: 'Heel from wind', min: 0, max: 1, step: 0.01, group: 'Presentation' },
  { key: 'heelSmoothing', label: 'Heel smoothing', min: 0.5, max: 20, step: 0.1, group: 'Presentation' },
  { key: 'cameraZoom', label: 'Camera zoom', min: 0.4, max: 4, step: 0.05, group: 'Presentation', help: 'How close the view sits to the ship. Zooming out means raising Spawn distance to match, or hulls appear inside the view.' },
  { key: 'cameraSmoothing', label: 'Camera smoothing', min: 0.5, max: 20, step: 0.1, group: 'Presentation' },
  { key: 'cameraLead', label: 'Camera lead', min: 0, max: 1.5, step: 0.01, group: 'Presentation', help: 'How far the view sits ahead of your bow.' },
  { key: 'cameraZoomOut', label: 'Speed zoom-out', min: 0, max: 0.6, step: 0.01, group: 'Presentation' },
  { key: 'wakeRate', label: 'Wake density', min: 5, max: 120, step: 1, group: 'Presentation' },
  { key: 'masterVolume', label: 'Volume', min: 0, max: 1, step: 0.01, group: 'Presentation', help: 'M mutes without changing this.' },
]

export const T: TuningValues = { ...DEFAULT_TUNING }

export function applyTuning(values: Partial<TuningValues>) {
  Object.assign(T, values)
}

export function resetTuning() {
  Object.assign(T, DEFAULT_TUNING)
}
