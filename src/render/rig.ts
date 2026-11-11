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
  const out: RigSolution = { bare: [], sails: [] }

  // Every sail bellies away from the wind, whichever way her spar points.
  const leeward = (dx: number, dy: number): [number, number] => {
    const len = Math.hypot(dx, dy) || 1
    let nx = -dy / len
    let ny = dx / len
    if (nx * windX + ny * windY < 0) { nx = -nx; ny = -ny }
    return [nx, ny]
  }

  /** A sail on a spar from (ax, ay) to (cx, cy), bellied by `push` to leeward. */
  const sail = (
    ax: number, ay: number, cx: number, cy: number, push: number, half: number, taper: number,
  ) => {
    const [bx, by] = leeward(cx - ax, cy - ay)
    const at = (t: number, k: number) =>
      [ax + (cx - ax) * t + bx * push * k, ay + (cy - ay) * t + by * push * k]
    out.sails.push({
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
  // canvas overhangs them. One jib from topsails up, the flying jib with
  // royals. A stay has no yard to brace round, so it lies fore and aft and
  // only the canvas moves.
  const tip = L + 13
  const jibs = Math.min(look.jibs, Math.max(0, yards - 1))
  for (let j = 0; j < jibs; j++) {
    const from = tip - j * 2
    const to = L * (0.42 + j * 0.3)
    const push = BEAM * (0.35 + 0.9 * drawing) * canvas * (0.9 - j * 0.15) +
      (1 - drawing) * Math.sin(time * 0.025 + j) * BEAM * 0.15
    sail(from, 0, to, 0, push * (0.4 + 0.6 * health), (from - to) / 2, 0.45)
  }

  // --- Masts -----------------------------------------------------------------
  for (const [i, mast] of look.masts.entries()) {
    const mx = mast.at * L
    const shiver = (1 - drawing) * Math.sin(time * 0.02 + i * 2.1) * BEAM * 0.22
    if (mast.kind === 'square') {
      squareMast(mast, mx, i)
      continue
    }
    foreAndAft(mast.kind, mast.size, mx, shiver, mast.kind === 'gaff' && yards >= 3)
  }
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
    const side = windY >= 0 ? 1 : -1
    const angle = Math.PI - side * trim
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    // A lateen yard crosses the mast and reaches well forward of it.
    const lead = kind === 'lateen' ? 0.32 : 0
    const length = LENGTH * size

    if (yards === 0) {
      // Stowed along the centreline, which is how a furled boom lies.
      const l = length * 0.85
      out.bare.push({ spar: [mx + l * lead, 0, mx - l * (1 - lead), 0] })
      return
    }

    // Courses is a reefed main; anything more is the whole sail.
    const reef = yards === 1 ? 0.75 : 1
    const l = length * reef * (0.4 + 0.6 * health)
    const push = BEAM * (0.3 + 1.1 * drawing) * canvas + shiver * 0.6
    sail(mx - dx * l * lead, -dy * l * lead, mx + dx * l * (1 - lead), dy * l * (1 - lead), push, l / 2, 1)

    if (topsail) {
      // A gaff topsail above it, stepped forward in the same false
      // perspective the square rigs use to show height from overhead.
      const t = l * 0.55
      const ax = mx + BEAM * 0.28
      sail(ax, 0, ax + dx * t, dy * t, push * 0.8, t / 2, 0.6)
    }
  }

  function squareMast(mast: MastPlan, mx: number, i: number) {
    // Braced no further round than a real yard goes, which is about 45°
    // before it fouls the shrouds. This was 66°, and on any course near the
    // wind it folded a three-masted ship's canvas into one fore-and-aft
    // stack — the one rig every class then looked like.
    const MAX_BRACE = 0.8
    const yardA = Math.PI / 2 + Math.max(-MAX_BRACE, Math.min(MAX_BRACE, localWindTo))
    const yx = Math.cos(yardA)
    const yy = Math.sin(yardA)
    // Shot-away canvas literally shrinks the sail, so a crippled ship looks
    // crippled before you read any health bar.
    const halfWidth = BEAM * mast.size * 1.1 * (0.35 + 0.65 * health)

    if (mast.spanker && yards > 0) {
      const shiver = (1 - drawing) * Math.sin(time * 0.02 + i * 2.1) * BEAM * 0.22
      foreAndAft('gaff', mast.spanker, mx, shiver, false)
    }

    const set = Math.min(yards, mast.tiers ?? 3)
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
    // the course and the royal over the topsail.
    //
    // From directly overhead a course, a topsail and a royal sit at the same
    // plan position and would draw exactly on top of one another, so the
    // stack is faked: each higher yard is narrower and stepped a little
    // toward the bow. That is the same false perspective the masts already
    // rely on, and it is what makes "more sail" visible as a *shape* rather
    // than only as a number in the corner. This loop used to run highest
    // first, which hid each smaller sail under the bigger one beneath it.
    for (let j = 0; j < set; j++) {
      const taper = 1 - j * 0.23
      const half = halfWidth * taper
      const push = (belly + shiver) * (1 - j * 0.1)
      const lift = mx + j * BEAM * 0.3
      sail(lift - yx * half, -yy * half, lift + yx * half, yy * half, push, half, taper)
    }
  }
}

export function wrapPi(a: number): number {
  let d = a % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
