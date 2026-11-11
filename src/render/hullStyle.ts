import type { Graphics } from 'pixi.js'
import type { ShipColors } from './palette'

/**
 * How a hull is drawn, as opposed to what colour it is.
 *
 * Palette and style are deliberately separate axes: the look of the sea was
 * settled first and should not have to be re-litigated to try a different
 * treatment of the ships. Each style gets the same geometry budget — length,
 * beam, and the class's own four colours — and decides how to spend it.
 *
 * Everything here is still procedural vector art, which is the only reason
 * comparing four treatments costs an afternoon rather than four art passes.
 */
export interface HullStyle {
  id: string
  name: string
  blurb: string
  /** Draw the static hull, bow at +x, centred on the origin. */
  drawHull: (g: Graphics, L: number, B: number, c: ShipColors) => void
  /** Outline weight on the sails. 0 for none. */
  sailOutline: number
  /** How solid the canvas sits against the water. */
  sailAlpha: number
  /** Spar weight, so a heavier style does not get spindly rigging. */
  sparWidth: number
}

// --- Colour helpers ---------------------------------------------------------

function shade(c: number, t: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t))))
  return (f(r) << 16) | (f(g) << 8) | f(b)
}

/** Crush a colour onto a coarse ramp — the look of a 16-bit framebuffer. */
function quantise(c: number, steps: number): number {
  const q = (v: number) => Math.round(Math.round((v / 255) * (steps - 1)) / (steps - 1) * 255)
  return (q((c >> 16) & 255) << 16) | (q((c >> 8) & 255) << 8) | q(c & 255)
}

// --- The hull outline every style starts from -------------------------------

function hullPoints(L: number, B: number): number[] {
  return [
    L, 0, L * 0.55, -B * 0.85, -L * 0.55, -B,
    -L, -B * 0.72, -L, B * 0.72, -L * 0.55, B, L * 0.55, B * 0.85,
  ]
}

// --- Styles -----------------------------------------------------------------

/** What has always been there: one filled polygon, a deck, two rails. */
const VECTOR: HullStyle = {
  id: 'vector', name: 'Flat vector', blurb: 'The current treatment — the control.',
  sailOutline: 1, sailAlpha: 0.88, sparWidth: 2.4,
  drawHull(g, L, B, c) {
    g.poly(hullPoints(L, B)).fill({ color: c.hull }).stroke({ width: 1.5, color: c.trim, alignment: 0.5 })
    g.poly([
      L * 0.78, 0, L * 0.4, -B * 0.55, -L * 0.78, -B * 0.6,
      -L * 0.78, B * 0.6, L * 0.4, B * 0.55,
    ]).fill({ color: c.deck })
    g.moveTo(L * 0.5, -B * 0.82).lineTo(-L * 0.8, -B * 0.88).stroke({ width: 2, color: c.trim })
    g.moveTo(L * 0.5, B * 0.82).lineTo(-L * 0.8, B * 0.88).stroke({ width: 2, color: c.trim })
    g.moveTo(L, 0).lineTo(L + 13, 0).stroke({ width: 2.5, color: c.trim })
  },
}

/**
 * Low-poly, in the PS1/N64 sense: the hull broken into a handful of flat-shaded
 * facets with hard seams and no outline at all, on a deliberately coarse colour
 * ramp. Form is carried by the shading breaks rather than by line work, which
 * is the whole grammar of that era.
 */
const LOWPOLY: HullStyle = {
  id: 'lowpoly', name: 'Low-poly', blurb: 'PS1-era flat-shaded facets, coarse colour ramp, no outlines.',
  sailOutline: 0, sailAlpha: 1, sparWidth: 2.6,
  drawHull(g, L, B, c) {
    const Q = 6
    const hull = quantise(c.hull, Q)
    const lit = quantise(shade(c.hull, 0.3), Q)
    const dark = quantise(shade(c.hull, -0.32), Q)
    const deck = quantise(c.deck, Q)
    const deckDark = quantise(shade(c.deck, -0.25), Q)

    // Port side catches the light, starboard falls away — a fixed key light,
    // as an untextured model of the period would have had baked in.
    g.poly([L, 0, L * 0.55, -B * 0.85, -L * 0.55, -B, -L, -B * 0.72, -L, 0]).fill({ color: lit })
    g.poly([L, 0, -L, 0, -L, B * 0.72, -L * 0.55, B, L * 0.55, B * 0.85]).fill({ color: dark })
    // A keel facet down the centreline to break the two halves.
    g.poly([L, 0, L * 0.5, -B * 0.2, -L * 0.85, -B * 0.18, -L * 0.85, B * 0.18, L * 0.5, B * 0.2])
      .fill({ color: hull })
    // Deck as two facets rather than one, so it faceted-shades too.
    g.poly([L * 0.72, 0, L * 0.38, -B * 0.5, -L * 0.74, -B * 0.55, -L * 0.74, 0]).fill({ color: deck })
    g.poly([L * 0.72, 0, -L * 0.74, 0, -L * 0.74, B * 0.55, L * 0.38, B * 0.5]).fill({ color: deckDark })
    // Bowsprit as a tapered facet, not a line.
    g.poly([L, -B * 0.1, L + 13, 0, L, B * 0.1]).fill({ color: quantise(c.trim, Q) })
  },
}

/**
 * Cel shading: one flat fill, one hard-edged shadow, and a heavy ink outline
 * that never varies with the light. The outline is the style — it is what makes
 * a shape read instantly against a busy sea, which is the hard problem in a
 * swarm game.
 */
const CEL: HullStyle = {
  id: 'cel', name: 'Cel shaded', blurb: 'Heavy ink outline, flat fill, one hard shadow band.',
  sailOutline: 2.6, sailAlpha: 1, sparWidth: 3,
  drawHull(g, L, B, c) {
    const ink = shade(c.trim, -0.45)
    g.poly(hullPoints(L, B)).fill({ color: shade(c.hull, 0.12) })

    // A single hard shadow terminator down the starboard side. No gradient:
    // the hard edge is the point.
    g.poly([L, 0, -L, 0, -L, B * 0.72, -L * 0.55, B, L * 0.55, B * 0.85])
      .fill({ color: shade(c.hull, -0.3) })

    g.poly([
      L * 0.78, 0, L * 0.4, -B * 0.55, -L * 0.78, -B * 0.6,
      -L * 0.78, B * 0.6, L * 0.4, B * 0.55,
    ]).fill({ color: c.deck }).stroke({ width: 2, color: ink, alignment: 0.5 })

    // The outline goes on last so nothing paints over it.
    g.poly(hullPoints(L, B)).stroke({ width: 3.4, color: ink, alignment: 0.5 })
    g.moveTo(L, 0).lineTo(L + 13, 0).stroke({ width: 3.4, color: ink })
  },
}

/**
 * Pixel art, with the caveat the art plan already raised: these cells are
 * **hull-aligned**, so they turn with the ship. Real pixel art keeps its grid
 * aligned to the *screen*, which is exactly why rotating it is hard and why
 * the plan called this a serious technical objection. Getting that honestly
 * needs the ship rendered to a low-resolution target and sampled nearest —
 * a renderer-level change, not a drawing one. Read this as "how chunky would
 * it look", not as a verdict on pixel art.
 */
const PIXEL: HullStyle = {
  id: 'pixel', name: 'Pixel (hull-aligned)', blurb: 'Chunky cells on a coarse ramp. See the caveat: the grid turns with the ship.',
  sailOutline: 0, sailAlpha: 1, sparWidth: 3,
  drawHull(g, L, B, c) {
    // 2.2 against a 58 x 17 hull gives roughly 26 x 8 cells — coarse enough to
    // read as pixels, fine enough that the sheer still reads as a sheer. At
    // 3.6 the hull was six cells wide and became an orange brick.
    const CELL = 2.2
    const Q = 10
    const hull = quantise(c.hull, Q)
    const lit = quantise(shade(c.hull, 0.26), Q)
    const dark = quantise(shade(c.hull, -0.3), Q)
    const deck = quantise(c.deck, Q)
    const trim = quantise(c.trim, Q)

    // Walk the bounding box and keep the cells whose centre is inside the
    // hull outline, which is what a sprite artist's first pass amounts to.
    const pts = hullPoints(L, B)
    for (let x = -L - CELL; x <= L + CELL * 4; x += CELL) {
      for (let y = -B - CELL; y <= B + CELL; y += CELL) {
        const cx = x + CELL / 2
        const cy = y + CELL / 2
        const bowsprit = cx > L && Math.abs(cy) < CELL
        if (!bowsprit && !inside(pts, cx, cy)) continue
        let col: number
        // Plank the hull fore-and-aft rather than shading it by side: a sprite
        // artist draws a run of planks, and the banding is what sells it.
        const plank = Math.floor((cy + B) / CELL) % 3
        if (bowsprit) col = trim
        else if (Math.abs(cy) < B * 0.5 && cx < L * 0.74 && cx > -L * 0.74) {
          col = plank === 0 ? quantise(shade(c.deck, 0.1), Q) : deck
        } else if (Math.abs(cy) > B * 0.78) col = trim
        else col = cy < 0 ? (plank === 1 ? lit : hull) : (plank === 1 ? hull : dark)
        g.rect(x, y, CELL, CELL).fill({ color: col })
      }
    }
  },
}

/** Even-odd point-in-polygon, on a flat [x, y, x, y, ...] list. */
function inside(pts: number[], x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

export const HULL_STYLES: HullStyle[] = [VECTOR, LOWPOLY, CEL, PIXEL]

let activeHull: HullStyle = VECTOR
export const H = () => activeHull

export function setHullStyle(id: string): HullStyle {
  activeHull = HULL_STYLES.find((s) => s.id === id) ?? VECTOR
  return activeHull
}

export function hullStyleFromLocation(search: string): HullStyle {
  const m = /[?&]hull=([a-z]+)/i.exec(search)
  return setHullStyle(m ? m[1].toLowerCase() : 'vector')
}
