/**
 * The drawing surface the ship styles paint onto.
 *
 * This is the subset of Pixi's `Graphics` the art actually uses, named as an
 * interface so the same style code can paint somewhere that is not a browser.
 * Pixi's `Graphics` satisfies it structurally — nothing wraps or adapts it —
 * and the build's SVG emitter implements the same six calls.
 *
 * The point is the sprite sheet. A sheet drawn by a second, Node-side copy of
 * the art would be a picture of code that no longer exists the moment either
 * copy changed; a sheet drawn through this is the same `drawHull` and
 * `drawSail` the game runs.
 */
export interface FillStyle { color: number; alpha?: number }
export interface StrokeStyle { width: number; color: number; alpha?: number; alignment?: number }

export interface Painter {
  poly(points: number[]): Painter
  rect(x: number, y: number, w: number, h: number): Painter
  ellipse(x: number, y: number, rx: number, ry: number): Painter
  moveTo(x: number, y: number): Painter
  lineTo(x: number, y: number): Painter
  fill(style: FillStyle): Painter
  stroke(style: StrokeStyle): Painter
}
