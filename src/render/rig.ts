import type { SailDraw } from './hullStyle'

/** Hull dimensions the rig is laid out against. */
export const LENGTH = 58
export const BEAM = 17

/** What the rig looks like this instant, with no opinion about how to paint it. */
export interface RigSolution {
  /** Masts with no canvas on them: just a bare yard to draw. */
  bare: { spar: [number, number, number, number] }[]
  /** Sails, lowest yard first within each mast. */
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
  /** Yards actually carrying canvas. */
  yardsSet: number
}

/**
 * Where every yard and every sail is, right now.
 *
 * Pulled out of `ShipView` so it is not trapped inside a Pixi object: the
 * build's sprite sheet runs in Node and needs the identical geometry. Every
 * term here is simulation — the brace, the belly, the shiver and the shrink —
 * which is exactly why it must not be reimplemented anywhere. The styles are
 * handed the result and choose only how it looks.
 *
 * `time` is passed in rather than read from a clock, so a sheet can ask for a
 * specific, reproducible instant instead of whenever it happened to render.
 */
export function solveRig(ship: RigState, time: number): RigSolution {
  const canvas = ship.canvas
  const drawing = ship.polarMult
  const localWindTo = wrapPi(Math.PI - ship.awaSigned)

  const MAX_BRACE = 1.15
  const brace = Math.max(-MAX_BRACE, Math.min(MAX_BRACE, localWindTo))

  const yardA = Math.PI / 2 + brace
  const yx = Math.cos(yardA)
  const yy = Math.sin(yardA)

  let bx = -yy
  let by = yx
  if (bx * Math.cos(localWindTo) + by * Math.sin(localWindTo) < 0) { bx = -bx; by = -by }

  const masts = [LENGTH * 0.18, -LENGTH * 0.24]
  const yards = ship.yardsSet
  const out: RigSolution = { bare: [], sails: [] }

  masts.forEach((mx, i) => {
    // Shot-away canvas literally shrinks the sail, so a crippled ship looks
    // crippled before you read any health bar.
    const halfWidth = BEAM * (1.55 - i * 0.18) * (0.35 + 0.65 * ship.sails)

    if (yards === 0) {
      // Bare poles: the course yard stays crossed, which is what a ship under
      // furled canvas actually looks like from above.
      out.bare.push({
        spar: [mx - yx * halfWidth, -yy * halfWidth, mx + yx * halfWidth, yy * halfWidth],
      })
      return
    }

    const belly = BEAM * (0.25 + 0.95 * drawing) * canvas
    const shiver = (1 - drawing) * Math.sin(time * 0.02 + i * 2.1) * BEAM * 0.22

    // Each yard up the mast, lowest first.
    //
    // From directly overhead a course, a topsail and a royal sit at the same
    // plan position and would draw exactly on top of one another, so the
    // stack is faked: each higher yard is narrower and stepped a little
    // toward the bow. That is the same false perspective the two masts
    // already rely on, and it is what makes "more sail" visible as a *shape*
    // rather than only as a number in the corner.
    for (let j = yards - 1; j >= 0; j--) {
      const taper = 1 - j * 0.23
      const half = halfWidth * taper
      const push = (belly + shiver) * (1 - j * 0.1)
      const lift = mx + j * BEAM * 0.34

      const ax = lift - yx * half
      const ay = -yy * half
      const cx2 = lift + yx * half
      const cy2 = yy * half

      out.sails.push({
        points: [
          ax, ay,
          lift - yx * half * 0.45 + bx * push * 0.72, -yy * half * 0.45 + by * push * 0.72,
          lift + bx * push, by * push,
          lift + yx * half * 0.45 + bx * push * 0.72, yy * half * 0.45 + by * push * 0.72,
          cx2, cy2,
        ],
        spar: [ax, ay, cx2, cy2],
        push: [bx, by],
        depth: push,
        drawing,
        health: ship.sails,
        half,
        taper,
      })
    }
  })

  return out
}

export function wrapPi(a: number): number {
  let d = a % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
