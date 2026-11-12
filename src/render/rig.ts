import type { SailDraw } from './hullStyle'
import type { HullPlan, MastPlan, ShipLook } from '../sim/shipClasses'

/** Hull dimensions of the standard ship. A class's plan scales these. */
export const LENGTH = 58
export const BEAM = 17

/** What the rig looks like this instant, with no opinion about how to paint it. */
export interface RigSolution {
  /** Spars with no canvas on them: a bare yard, a stowed boom. */
  bare: { spar: [number, number, number, number] }[]
  /**
   * Sails in paint order: lowest first, so each higher and smaller sail is
   * drawn over the one below it, the way it is seen from aloft.
   */
  sails: SailDraw[]
}

/** Everything the rig needs to know about a ship, and nothing else. */
export interface RigState {
  canvas: number
  /** How hard she is drawing, 0–1. */
  polarMult: number
  /** Signed angle of the wind off the bow. */
  awaSigned: number
  /** Rigging condition, 0–1. */
  sails: number
  /** Sail orders actually set: 0 bare poles … 3 everything. */
  yardsSet: number
  /**
   * Which side the booms and headsails are on, -1 to 1, eased by the caller
   * as she tacks or gybes so the canvas swings across instead of jumping.
   * Omitted, it is taken straight from the wind (the sprite sheet does this).
   */
  side?: number
  /**
   * How far the yards and booms are swung round to the wind, 0 to 1. Zero is
   * squared away: yards straight across the hull, booms along the centreline,
   * which is how a furled ship lies. The caller eases it so they swing round
   * as sail is made. Omitted, they are fully braced.
   */
  brace?: number
}

/**
 * The side a fore-and-aft sail wants to be on: -1 or 1, the leeward side.
 * The ship view eases toward this; it is exported so that the two can never
 * disagree about which way is leeward.
 */
export function leewardSide(awaSigned: number): number {
  return Math.sin(awaSigned) >= 0 ? 1 : -1
}

/** Half-length and half-beam of a hull drawn to this plan. */
export function hullSize(plan: HullPlan): { L: number; B: number } {
  return { L: (LENGTH / 2) * plan.length, B: (BEAM / 2) * plan.beam }
}

/** Where the white flag flies: the tallest mast, which is the biggest one. */
export function mainMast(look: ShipLook): number {
  let best = look.masts[0]
  for (const m of look.masts) if (m.kind === 'square' && (best.kind !== 'square' || m.size > best.size)) best = m
  return best.at * hullSize(look.hull).L
}

/**
 * Where every yard, boom and sail is, right now.
 *
 * Pulled out of `ShipView` so it is not trapped inside a Pixi object: the
 * build's sprite sheet runs in Node and needs the identical geometry. Every
 * term here is simulation — the brace, the belly, the shiver and the shrink —
 * which is exactly why it must not be reimplemented anywhere. The styles are
 * handed the result and choose only how it looks, and they draw a square
 * course, a gaff main and a jib with the same `drawSail`: from overhead each
 * is a spar with canvas bellying away from the wind.
 *
 * `time` is passed in rather than read from a clock, so a sheet can ask for a
 * specific, reproducible instant instead of whenever it happened to render.
 */
export function solveRig(ship: RigState, time: number, look: ShipLook): RigSolution {
  const canvas = ship.canvas
  const drawing = ship.polarMult
  const health = ship.sails
  const yards = ship.yardsSet
  const localWindTo = wrapPi(Math.PI - ship.awaSigned)
  const windX = Math.cos(localWindTo)
  const windY = Math.sin(localWindTo)
  const { L } = hullSize(look.hull)
  const side = ship.side ?? (windY >= 0 ? 1 : -1)
  const brace = ship.brace ?? 1
  const out: RigSolution = { bare: [], sails: [] }
  // Fore-and-aft canvas is set low, on stays and booms; square canvas is
  // carried on yards above it. So every fore-and-aft sail is painted first,
  // whichever mast it is on, and the square sails go over the lot — a
  // brigantine's gaff main or a frigate's spanker used to be painted over
  // the yards forward of it simply because its mast came later in the list.
  const below: SailDraw[] = []
  const above: SailDraw[] = []

  // Every sail bellies away from the wind, whichever way her spar points.
  const leeward = (dx: number, dy: number): [number, number] => {
    const len = Math.hypot(dx, dy) || 1
    let nx = -dy / len
    let ny = dx / len
    if (nx * windX + ny * windY < 0) { nx = -nx; ny = -ny }
    return [nx, ny]
  }

  /**
   * A sail on a spar from (ax, ay) to (cx, cy), bellied by `push`. Square
   * sails belly to leeward of the wind. Fore-and-aft sails are handed the
   * direction instead (`normal`, and a signed push), because they belly to
   * whichever side the boom is on — which mid-gybe is not yet leeward.
   */
  const sail = (
    into: SailDraw[],
    ax: number, ay: number, cx: number, cy: number, push: number, half: number, taper: number,
    normal?: [number, number],
  ) => {
    let [bx, by] = normal ?? leeward(cx - ax, cy - ay)
    if (push < 0) { bx = -bx; by = -by; push = -push }
    const at = (t: number, k: number) =>
      [ax + (cx - ax) * t + bx * push * k, ay + (cy - ay) * t + by * push * k]
    into.push({
      points: [ax, ay, ...at(0.275, 0.72), ...at(0.5, 1), ...at(0.725, 0.72), cx, cy],
      spar: [ax, ay, cx, cy],
      push: [bx, by],
      depth: push,
      drawing,
      health,
      half,
      taper,
    })
  }

  // --- Headsails ------------------------------------------------------------
  // Set first, because they are the lowest thing forward and the foremast's
  // canvas overhangs them. One jib under fighting canvas, the flying jib as
  // well under full sail. A stay has no yard to brace round, so it lies fore and aft and
  // only the canvas moves.
  const tip = L + 13
  const jibs = Math.min(look.jibs, yards)
  for (let j = 0; j < jibs; j++) {
    const from = tip - j * 2
    const to = L * (0.42 + j * 0.3)
    const push = BEAM * (0.35 + 0.9 * drawing) * canvas * (0.9 - j * 0.15) +
      (1 - drawing) * Math.sin(time * 0.025 + j) * BEAM * 0.15
    // Signed by the side, so through a tack the jib flattens against its
    // stay and fills again on the other tack rather than flicking across.
    sail(below, from, 0, to, 0, push * (0.4 + 0.6 * health) * side, (from - to) / 2, 0.45, [0, 1])
  }

  // --- Masts -----------------------------------------------------------------
  for (const [i, mast] of look.masts.entries()) {
    const mx = mast.at * L
    const shiver = (1 - drawing) * Math.sin(time * 0.02 + i * 2.1) * BEAM * 0.22
    if (mast.kind === 'square') {
      squareMast(mast, mx, i)
      continue
    }
    foreAndAft(mast.kind, mast.size, mx, shiver, mast.kind === 'gaff' && yards >= 2)
  }
  out.sails = below.concat(above)
  return out

  /**
   * A boom or a lateen yard. It trims to leeward by how far off the wind she
   * is — nearly fore and aft close-hauled, squared right out when running —
   * so a fore-and-aft rig reads its point of sail exactly as the braced yards
   * of a square rig do.
   */
  function foreAndAft(kind: 'gaff' | 'lateen', size: number, mx: number, shiver: number, topsail: boolean) {
    const off = Math.abs(wrapPi(ship.awaSigned))
    const trim = Math.max(0.12, Math.min(1.35, off * 0.47))
    // `side` eases through zero as she tacks or gybes, so the boom swings
    // across the centreline rather than appearing on the other side.
    const angle = Math.PI - side * trim * brace
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    // Perpendicular to the boom, on the +y side; `side` signs it.
    const normal: [number, number] = [dy, -dx]
    // A lateen yard crosses the mast and reaches well forward of it.
    const lead = kind === 'lateen' ? 0.32 : 0
    const length = LENGTH * size

    if (yards === 0) {
      // Stowed along the centreline, which is how a furled boom lies.
      const l = length * 0.85
      out.bare.push({ spar: [mx + l * lead, 0, mx - l * (1 - lead), 0] })
      return
    }

    // Fighting canvas is a reefed main; full sail is the whole of it.
    const reef = yards === 1 ? 0.82 : 1
    const l = length * reef * (0.4 + 0.6 * health)
    // Slack as the boom crosses: the canvas only fills once it is out.
    const push = (BEAM * (0.3 + 1.1 * drawing) * canvas + shiver * 0.6) * side
    sail(below, mx - dx * l * lead, -dy * l * lead, mx + dx * l * (1 - lead), dy * l * (1 - lead),
      push, l / 2, 1, normal)

    if (topsail) {
      // A gaff topsail above it, on the same spar line and shallower, so the
      // main's belly shows round it.
      const t = l * 0.55
      sail(below, mx, 0, mx + dx * t, dy * t, push * 0.6, t / 2, 0.6, normal)
    }
  }

  function squareMast(mast: MastPlan, mx: number, i: number) {
    // Braced no further round than a real yard goes, which is about 45°
    // before it fouls the shrouds. This was 66°, and on any course near the
    // wind it folded a three-masted ship's canvas into one fore-and-aft
    // stack — the one rig every class then looked like.
    const MAX_BRACE = 0.8
    const yardA = Math.PI / 2 + Math.max(-MAX_BRACE, Math.min(MAX_BRACE, localWindTo)) * brace
    const yx = Math.cos(yardA)
    const yy = Math.sin(yardA)
    // Shot-away canvas literally shrinks the sail, so a crippled ship looks
    // crippled before you read any health bar.
    const halfWidth = BEAM * mast.size * 1.1 * (0.35 + 0.65 * health)

    if (mast.spanker && yards > 0) {
      // Fore-and-aft, so it lands in `below` with the rest of them.
      const shiver = (1 - drawing) * Math.sin(time * 0.02 + i * 2.1) * BEAM * 0.22
      foreAndAft('gaff', mast.spanker, mx, shiver, false)
    }

    const set = Math.min(yards, mast.tiers ?? 2)
    if (set === 0) {
      // Bare poles: the course yard stays crossed, which is what a ship under
      // furled canvas actually looks like from above.
      out.bare.push({
        spar: [mx - yx * halfWidth, -yy * halfWidth, mx + yx * halfWidth, yy * halfWidth],
      })
      return
    }

    const belly = BEAM * (0.25 + 0.95 * drawing) * canvas
    const shiver = (1 - drawing) * Math.sin(time * 0.02 + i * 2.1) * BEAM * 0.22

    // Each yard up the mast, *lowest first*, so the topsail is painted over
    // the course.
    //
    // From directly overhead a course and a topsail hang from yards
    // on the same mast, so they share one line: each higher yard is laid on
    // the course's yard, narrower, with a shallower belly, and the course's
    // canvas shows round it. They used to be stepped toward the bow as false
    // perspective, which once the yards were braced round put each upper
    // sail out on the belly of the one below instead of on its yard.
    for (let j = 0; j < set; j++) {
      const taper = 1 - j * 0.23
      const half = halfWidth * taper
      const push = (belly + shiver) * (1 - j * 0.26)
      sail(above, mx - yx * half, -yy * half, mx + yx * half, yy * half, push, half, taper)
    }
  }
}

export function wrapPi(a: number): number {
  let d = a % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
