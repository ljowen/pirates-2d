import { SvgPainter } from './svgPainter'
import { solveRig, hullSize, type RigState } from './rig'
import { H } from './hullStyle'
import { P } from './palette'
import { SAIL_STATES } from '../sim/ship'
import type { ShipClass } from '../sim/shipClasses'

const hex = (c: number) => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`

/**
 * A ship as she looks at sea, as an SVG string for a menu card.
 *
 * Painted by the same `drawHull`, `drawSail` and `solveRig` the game runs, in
 * whichever hull style and palette are showing, so the card is a picture of
 * the ship the player will actually get. Every hull is drawn at one zoom, so
 * the cards also show how the hulls compare in size.
 */
export function shipPortrait(cls: ShipClass, width: number, height: number, zoom = 1.15): string {
  const hull = H()
  const pal = P()
  const colors = pal.shipTint(cls.colors)
  const g = new SvgPainter()

  const { L, B } = hullSize(cls.look.hull)
  g.ellipse(0, 0, L * 1.1, B * 1.9).fill({ color: pal.ship.shadow, alpha: 0.35 })
  hull.drawHull(g, L, B, colors, cls.look.hull)

  // Full sail on a broad reach, as the sprite sheet draws her: braced round
  // far enough that the rigs can be told apart.
  const full = SAIL_STATES[SAIL_STATES.length - 1]
  const state: RigState = {
    canvas: full.canvas, polarMult: 0.96, awaSigned: Math.PI * 0.72, sails: 1, yardsSet: full.yards,
  }
  const rig = solveRig(state, 0, cls.look)
  for (const b of rig.bare) {
    g.moveTo(b.spar[0], b.spar[1]).lineTo(b.spar[2], b.spar[3])
      .stroke({ width: hull.sparWidth, color: pal.ship.spar })
  }
  for (const sail of rig.sails) hull.drawSail(g, sail, colors, hull.sparWidth * sail.taper)

  const s = cls.scale * zoom
  // A few strokes of swell, placed by hand so they sit clear of the hull.
  const swell = [[18, 16, 26], [width - 52, 22, 30], [30, height - 15, 22], [width - 70, height - 12, 34]]
    .map(([x, y, w]) => `<path d="M${x} ${y}h${w}" stroke="${hex(pal.water.light)}" stroke-width="2" stroke-linecap="round"/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block">` +
    `<rect width="${width}" height="${height}" fill="${hex(pal.water.deep)}"/>${swell}` +
    g.flush(`translate(${width / 2} ${height / 2}) scale(${s.toFixed(3)})`) +
    '</svg>'
}
