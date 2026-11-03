import { clamp } from '../core/math'

/**
 * The polar curve: boat speed as a fraction of best speed, given the angle
 * between your heading and the eye of the wind (0 = pointing straight into it,
 * 180 = running dead downwind).
 *
 * This single curve carries most of the sailing feel, so it is a draggable
 * table rather than a formula. Tuned for "firm but forgiving": close-hauled
 * costs you two thirds of your speed, and the no-go zone is a soft stall you
 * can always claw out of rather than a hard wall.
 */
export interface PolarPoint { angle: number; mult: number }

export const DEFAULT_POLAR: PolarPoint[] = [
  { angle: 0, mult: 0.05 },
  { angle: 15, mult: 0.09 },
  { angle: 30, mult: 0.2 },
  { angle: 45, mult: 0.33 },
  { angle: 60, mult: 0.58 },
  { angle: 75, mult: 0.82 },
  { angle: 90, mult: 0.96 },
  { angle: 105, mult: 1.0 },
  { angle: 120, mult: 0.98 },
  { angle: 140, mult: 0.9 },
  { angle: 160, mult: 0.82 },
  { angle: 180, mult: 0.76 },
]

export class PolarCurve {
  points: PolarPoint[]

  constructor(points: PolarPoint[] = DEFAULT_POLAR) {
    this.points = points.map((p) => ({ ...p }))
  }

  /** Sample by angle-to-wind in radians, [0, PI]. */
  sample(awaRad: number): number {
    return this.sampleDeg((awaRad * 180) / Math.PI)
  }

  sampleDeg(awaDeg: number): number {
    const a = clamp(awaDeg, 0, 180)
    const pts = this.points
    if (a <= pts[0].angle) return pts[0].mult
    for (let i = 1; i < pts.length; i++) {
      if (a <= pts[i].angle) {
        const p0 = pts[i - 1]
        const p1 = pts[i]
        const span = p1.angle - p0.angle
        const t = span <= 0 ? 0 : (a - p0.angle) / span
        return p0.mult + (p1.mult - p0.mult) * t
      }
    }
    return pts[pts.length - 1].mult
  }

  /** Angle of best speed, in degrees — where you want to be when running away. */
  bestAngleDeg(): number {
    let best = this.points[0]
    for (const p of this.points) if (p.mult > best.mult) best = p
    return best.angle
  }

  toJSON() { return this.points.map((p) => ({ ...p })) }

  load(points: PolarPoint[]) {
    this.points = points.map((p) => ({ ...p })).sort((a, b) => a.angle - b.angle)
  }

  reset() { this.load(DEFAULT_POLAR) }
}
