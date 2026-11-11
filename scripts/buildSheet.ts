import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { SvgPainter } from './svgPainter'
import { SAIL_STATES } from '../src/sim/ship'
import { ENEMY_CLASSES, PLAYER_CLASSES, type ShipClass } from '../src/sim/shipClasses'
import { solveRig, LENGTH, BEAM, type RigState } from '../src/render/rig'
import { HULL_STYLES, setHullStyle } from '../src/render/hullStyle'
import { PALETTES, setPalette } from '../src/render/palette'

/**
 * The sprite sheet, built from the same art the game runs.
 *
 * It emits SVG through a `Painter` rather than screenshotting a browser, so
 * it needs no GPU and no headless Chrome — and, more to the point, it calls
 * the real `drawHull`, `drawSail` and `solveRig`. A sheet produced by a
 * second Node-side copy of the art would be a picture of code that stopped
 * being true the moment either copy changed.
 *
 * Deterministic on purpose: the rig is solved at a fixed instant rather than
 * at `performance.now()`, so an unchanged art pass produces a byte-identical
 * file and the diff only moves when the art does.
 */

const STYLE = process.env.SHEET_HULL ?? 'cel'
const PAL = process.env.SHEET_STYLE ?? 'current'
const OUT = resolve(process.argv[2] ?? 'docs/sprite-sheet.svg')

const hull = setHullStyle(STYLE)
const pal = setPalette(PAL)
if (!HULL_STYLES.some((h) => h.id === STYLE)) throw new Error(`unknown hull style: ${STYLE}`)
if (!PALETTES.some((p) => p.id === PAL)) throw new Error(`unknown palette: ${PAL}`)

const roster: { cls: ShipClass; side: 'PLAYABLE' | 'ENEMY' }[] = [
  ...PLAYER_CLASSES.map((cls) => ({ cls, side: 'PLAYABLE' as const })),
  ...ENEMY_CLASSES.map((cls) => ({ cls, side: 'ENEMY' as const })),
]

const CELL_W = 150
const CELL_H = 74
const LEFT = 118
const TOP = 52
const ZOOM = 1.25
const W = LEFT + SAIL_STATES.length * CELL_W + 16
const H = TOP + roster.length * CELL_H + 14

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
const hex = (c: number) => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`
const text = (s: string, x: number, y: number, size: number, fill: string, weight = 'normal') =>
  `<text x="${x}" y="${y}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"` +
  ` font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(s)}</text>`

const parts: string[] = []
parts.push(`<rect width="${W}" height="${H}" fill="${hex(pal.water.deep)}"/>`)
parts.push(text(`${hull.name} · ${pal.name}`, 14, 26, 15, '#ffffff', 'bold'))
SAIL_STATES.forEach((st, i) => {
  parts.push(text(st.name.toUpperCase(), LEFT + i * CELL_W + 6, 44, 10, '#aaccdd'))
})

let lastSide = ''
roster.forEach(({ cls, side }, r) => {
  const cy = TOP + r * CELL_H + CELL_H / 2
  if (side !== lastSide) {
    lastSide = side
    parts.push(`<rect x="10" y="${cy - CELL_H / 2 - 2}" width="${W - 26}" height="1" fill="#ffffff" fill-opacity="0.3"/>`)
    parts.push(text(side, 14, cy - CELL_H / 2 + 11, 9, '#aaccdd'))
  }
  parts.push(text(cls.name, 14, cy - 1, 12, '#ffffff', 'bold'))
  parts.push(text(`${cls.guns.toFixed(2)}g · ${cls.draught.toFixed(2)}dr`, 14, cy + 12, 9, '#aaccdd'))

  SAIL_STATES.forEach((st, c) => {
    const colors = pal.shipTint(cls.colors)
    const g = new SvgPainter()

    g.ellipse(0, 0, LENGTH * 0.55, BEAM * 0.95).fill({ color: pal.ship.shadow, alpha: 0.35 })
    hull.drawHull(g, LENGTH / 2, BEAM / 2, colors)

    // A beam reach at full draw: the yards brace round to something, rather
    // than sitting square and hiding the mechanic the rig exists to show.
    const state: RigState = {
      canvas: st.canvas,
      polarMult: 0.96,
      awaSigned: Math.PI / 2,
      sails: 1,
      yardsSet: st.yards,
    }
    // A fixed instant, so the shiver term is reproducible.
    const rig = solveRig(state, 0)
    for (const b of rig.bare) {
      g.moveTo(b.spar[0], b.spar[1]).lineTo(b.spar[2], b.spar[3])
        .stroke({ width: hull.sparWidth, color: pal.ship.spar })
    }
    for (const sail of rig.sails) {
      hull.drawSail(g, sail, colors, hull.sparWidth * sail.taper)
    }

    const s = cls.scale * ZOOM
    const x = LEFT + c * CELL_W + CELL_W / 2
    parts.push(g.flush(`translate(${x} ${cy}) scale(${s.toFixed(3)})`))
  })
})

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  parts.join('') +
  '</svg>\n'

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, svg)
console.log(`sheet: ${OUT}  ${W}x${H}  ${roster.length} hulls x ${SAIL_STATES.length} states`)
