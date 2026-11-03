export const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Frame-rate independent exponential smoothing. `rate` is roughly "1/seconds to settle". */
export const damp = (a: number, b: number, rate: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-rate * dt))

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Shortest signed difference a - b, wrapped to [-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

export function wrapAngle(a: number): number {
  let r = a % TAU
  if (r < 0) r += TAU
  return r
}

export const deg = (rad: number) => (rad * 180) / Math.PI
export const rad = (d: number) => (d * Math.PI) / 180

/**
 * World angles are screen-space: 0 = east (+X), increasing clockwise because
 * screen Y points down. North is therefore -PI/2.
 */
export function compassFromRad(a: number): number {
  return wrapAngle(a + Math.PI / 2) * (180 / Math.PI)
}

export function compassName(a: number): string {
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return names[Math.round(compassFromRad(a) / 22.5) % 16]
}

export interface Vec2 { x: number; y: number }
