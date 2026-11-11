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
/**
 * One sail, with its geometry already solved.
 *
 * The *shape* is simulation: the yard braces round with the point of sail, the
 * canvas bellies by how hard she is drawing, it shivers when she is not, and
 * it shrinks as the rigging is shot away. All of that is load-bearing — the
 * rig is a readout of how you are sailing — so it stays in `ShipView` and the
 * style is handed the result. A style chooses how canvas *looks*, never how it
 * behaves.
 */
export interface SailDraw {
  /** The bellied outline: spar end, three belly points, spar end. */
  points: number[]
  /** The yard itself. */
  spar: [number, number, number, number]
  /** Unit vector the belly pushes along, away from the wind. */
  push: [number, number]
  /** Belly depth in hull units. Zero when she is luffing. */
  depth: number
  /** How hard she is drawing, 0–1. */
  drawing: number
  /** Rigging condition, 0–1. */
  health: number
  /** Half the yard's length, for scaling detail to the sail. */
  half: number
}

export interface HullStyle {
  id: string
  name: string
  blurb: string
  /** Draw the static hull, bow at +x, centred on the origin. */
  drawHull: (g: Graphics, L: number, B: number, c: ShipColors) => void
  /** Draw one sail from solved geometry. */
  drawSail: (g: Graphics, s: SailDraw, c: ShipColors, spar: number) => void
  /** Spar weight, so a heavier style does not get spindly rigging. */
  sparWidth: number
}

/** The same belly, drawn shallower — the inner edge of a hard shadow. */
function innerBelly(s: SailDraw, scale: number): number[] {
  const [px, py] = s.push
  const d = s.depth * (1 - scale)
  const p = s.points.slice()
  // Points 1..3 are the bellied ones; pull them back toward the spar.
  for (let i = 2; i <= 6; i += 2) {
    p[i] -= px * d * (i === 4 ? 1 : 0.72)
    p[i + 1] -= py * d * (i === 4 ? 1 : 0.72)
  }
  return p
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
  sparWidth: 2.4,
  drawSail(g, s, c, spar) {
    g.poly(s.points).fill({ color: c.canvas, alpha: 0.88 * (0.45 + 0.55 * s.health) })
      .stroke({ width: 1, color: shade(c.canvas, -0.35) })
    g.moveTo(s.spar[0], s.spar[1]).lineTo(s.spar[2], s.spar[3]).stroke({ width: spar, color: shade(c.trim, -0.1) })
  },
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
  sparWidth: 2.6,
  drawSail(g, s, c, spar) {
    // Two flat facets with a hard seam between them, no outline: the canvas is
    // a folded plane, which is how a low-poly rig would have been built.
    const Q = 6
    g.poly(s.points).fill({ color: quantise(c.canvas, Q), alpha: 0.45 + 0.55 * s.health })
    g.poly(innerBelly(s, 0.5)).fill({ color: quantise(shade(c.canvas, -0.22), Q), alpha: 0.45 + 0.55 * s.health })
    g.moveTo(s.spar[0], s.spar[1]).lineTo(s.spar[2], s.spar[3])
      .stroke({ width: spar, color: quantise(shade(c.trim, -0.1), Q) })
  },
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
  id: 'cel', name: 'Cel shaded', blurb: 'Ink outline, flat fill, one hard shadow band.',
  // Weights tuned at the zoom the game is *played* at, not the zoom a style is
  // judged at. At 2.6x a 3.4-wide outline looked characterful; at the default
  // 0.75 the whole ship is about 45px and the same line ate the fill, leaving
  // a dark smudge with no hull colour in it. Flattering a style by inspecting
  // it close up is an easy way to ship one that does not work.
  sparWidth: 2.6,
  drawSail(g, s, c, spar) {
    const ink = shade(c.trim, -0.45)
    const fade = 0.5 + 0.5 * s.health

    g.poly(s.points).fill({ color: c.canvas, alpha: fade })
    // One hard terminator, on the hollow side nearest the yard — the same
    // convention the hull uses, so a ship lights consistently.
    if (s.depth > 0.6) {
      g.poly(innerBelly(s, 0.42)).fill({ color: shade(c.canvas, -0.28), alpha: fade })
    }
    // Two seams, because flat canvas reads as paper and panelled canvas reads
    // as sail. Scaled off the yard so they stay put as the sail shrinks.
    for (const t of [-0.42, 0.42]) {
      const ax = s.spar[0] + (s.spar[2] - s.spar[0]) * (0.5 + t * 0.5)
      const ay = s.spar[1] + (s.spar[3] - s.spar[1]) * (0.5 + t * 0.5)
      g.moveTo(ax, ay)
        .lineTo(ax + s.push[0] * s.depth * 0.62, ay + s.push[1] * s.depth * 0.62)
        .stroke({ width: 1.2, color: shade(c.canvas, -0.42), alpha: 0.85 * fade })
    }
    g.poly(s.points).stroke({ width: 1.5, color: ink, alignment: 0.5, alpha: fade })
    g.moveTo(s.spar[0], s.spar[1]).lineTo(s.spar[2], s.spar[3]).stroke({ width: spar, color: ink })
  },
  drawHull(g, L, B, c) {
    const ink = shade(c.trim, -0.45)
    // Lifted, because the outline and the shadow both darken the read at size.
    g.poly(hullPoints(L, B)).fill({ color: shade(c.hull, 0.2) })

    // A single hard shadow terminator down the starboard side. No gradient:
    // the hard edge is the point. Shallow enough that it still reads as one
    // hull rather than as two tones stuck together.
    g.poly([L, 0, -L, 0, -L, B * 0.72, -L * 0.55, B, L * 0.55, B * 0.85])
      .fill({ color: shade(c.hull, -0.16) })

    g.poly([
      L * 0.78, 0, L * 0.4, -B * 0.55, -L * 0.78, -B * 0.6,
      -L * 0.78, B * 0.6, L * 0.4, B * 0.55,
    ]).fill({ color: c.deck }).stroke({ width: 1.4, color: ink, alignment: 0.5 })

    // The outline goes on last so nothing paints over it.
    g.poly(hullPoints(L, B)).stroke({ width: 2.2, color: ink, alignment: 0.5 })
    g.moveTo(L, 0).lineTo(L + 13, 0).stroke({ width: 2.2, color: ink })
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
  sparWidth: 3,
  drawSail(g, s, c, spar) {
    const Q = 10
    g.poly(s.points).fill({ color: quantise(c.canvas, Q), alpha: 0.45 + 0.55 * s.health })
    g.poly(innerBelly(s, 0.55)).fill({ color: quantise(shade(c.canvas, -0.16), Q), alpha: 0.45 + 0.55 * s.health })
    g.moveTo(s.spar[0], s.spar[1]).lineTo(s.spar[2], s.spar[3])
      .stroke({ width: spar, color: quantise(shade(c.trim, -0.1), Q) })
  },
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

// Cel first, because it is the shipped default: a heavy outline is the only
// one of these treatments that is *about* silhouette, which is the hard
// problem in a game where a dozen hulls overlap on a textured sea.
export const HULL_STYLES: HullStyle[] = [CEL, VECTOR, LOWPOLY, PIXEL]

let activeHull: HullStyle = CEL
export const H = () => activeHull

export function setHullStyle(id: string): HullStyle {
  activeHull = HULL_STYLES.find((s) => s.id === id) ?? VECTOR
  return activeHull
}

export function hullStyleFromLocation(search: string): HullStyle {
  const m = /[?&]hull=([a-z]+)/i.exec(search)
  return setHullStyle(m ? m[1].toLowerCase() : 'cel')
}
