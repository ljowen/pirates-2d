import { Application, Container, Graphics, Text } from 'pixi.js'
import { Ship, SAIL_STATES } from '../sim/ship'
import { PolarCurve } from '../sim/polar'
import { ENEMY_CLASSES, PLAYER_CLASSES } from '../sim/shipClasses'
import { ShipView } from '../render/shipView'
import { P } from '../render/palette'
import { H } from '../render/hullStyle'

/**
 * Every hull at every sail state, laid out in a grid.
 *
 * Built because a style pass is judged on a handful of screenshots of
 * whichever ships happened to be on screen, which quietly means the Sloop and
 * whatever spawned near her. A sheet makes the comparison exhaustive: if the
 * Galleon's canvas disappears against her own deck, or two classes read as
 * the same silhouette, it is visible in one picture rather than discovered in
 * play weeks later.
 *
 * Each cell is a real `ShipView` driven by a real `Ship`, so this cannot drift
 * from what the game draws — the moment it needed its own drawing code it
 * would stop being evidence.
 */
export async function renderSpriteSheet(app: Application, host: HTMLElement) {
  const polar = new PolarCurve()
  // The playable roster and the enemy one share names deliberately — they are
  // tuned to be sailed and to be fought respectively — so the sheet has to say
  // which is which or two different hulls read as a duplicate row.
  const roster = [
    ...PLAYER_CLASSES.map((cls) => ({ cls, side: 'player' as const })),
    ...ENEMY_CLASSES.map((cls) => ({ cls, side: 'enemy' as const })),
  ]

  // Ships are drawn at about 58 x 17 and a sheet is for *looking* at them.
  const ZOOM = 1.32
  const CELL_W = 144
  const CELL_H = 84
  const LEFT = 118
  const TOP = 54
  // Two column groups, so the whole roster fits one screen and the sheet can
  // be read without scrolling — a comparison you have to scroll is one you
  // make from memory.
  const GROUP_W = LEFT + SAIL_STATES.length * CELL_W
  const rows = Math.ceil(roster.length / 2)

  const sheet = new Container()
  app.stage.addChild(sheet)

  const bg = new Graphics()
  bg.rect(0, 0, GROUP_W * 2 + 24, TOP + rows * CELL_H + 16).fill({ color: P().water.deep })
  sheet.addChild(bg)

  const label = (s: string, x: number, y: number, size = 13, dim = false) => {
    const t = new Text({
      text: s,
      style: {
        fill: dim ? 0xaaccdd : 0xffffff,
        fontSize: size,
        fontFamily: 'ui-monospace, monospace',
        fontWeight: dim ? 'normal' : 'bold',
      },
    })
    t.position.set(x, y)
    sheet.addChild(t)
  }

  label(`${H().name} · ${P().name}`, 16, 14, 15)
  for (let gcol = 0; gcol < 2; gcol++) {
    SAIL_STATES.forEach((st, i) => {
      label(st.name.toUpperCase(), gcol * (GROUP_W + 24) + LEFT + i * CELL_W + 6, 36, 10, true)
    })
  }

  let lastSide = ''
  for (let r = 0; r < roster.length; r++) {
    const { cls, side } = roster[r]
    const gcol = Math.floor(r / rows)
    const gx = gcol * (GROUP_W + 24)
    const cy = TOP + (r % rows) * CELL_H + CELL_H / 2
    if (side !== lastSide) {
      lastSide = side
      const rule = new Graphics()
      rule.rect(gx + 10, cy - CELL_H / 2 - 2, GROUP_W - 10, 1).fill({ color: 0xffffff, alpha: 0.3 })
      sheet.addChild(rule)
      label(side === 'player' ? 'PLAYABLE' : 'ENEMY', gx + 16, cy - CELL_H / 2 + 3, 9, true)
    }
    label(cls.name, gx + 16, cy - 10, 12)
    label(`${cls.guns.toFixed(2)}g · ${cls.draught.toFixed(2)}dr`, gx + 16, cy + 5, 9, true)

    for (let c = 0; c < SAIL_STATES.length; c++) {
      const ship = new Ship(polar)
      ship.cls = cls
      ship.faction = 'enemy'
      ship.sailOrder = c
      ship.canvas = SAIL_STATES[c].canvas
      // A beam reach: the yards brace round to something, rather than sitting
      // square and hiding the whole mechanic the rig exists to show.
      ship.heading = 0
      ship.awaSigned = Math.PI / 2
      ship.awa = Math.PI / 2
      ship.polarMult = 0.96

      const view = new ShipView(cls)
      view.update(ship, 1, 0)
      view.view.position.set(gx + LEFT + c * CELL_W + CELL_W / 2, cy)
      // `update` sets rotation from the ship's heading; override it so every
      // cell is the same broadside view and only the art differs.
      view.view.rotation = 0
      view.view.scale.set(view.view.scale.x * ZOOM, view.view.scale.y * ZOOM)
      sheet.addChild(view.view)
    }
  }

  const w = GROUP_W * 2 + 24
  const h = TOP + rows * CELL_H + 16
  app.renderer.resize(w, h)
  app.renderer.render(app.stage)

  // Hand back a PNG the page can offer for download.
  const canvas = app.renderer.extract.canvas(app.stage)
  const url = (canvas as HTMLCanvasElement).toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.textContent = 'sprite sheet ready — click to download'
  a.download = `pirates2d-sheet-${H().id}-${P().id}.png`
  a.style.cssText =
    'position:fixed;left:12px;bottom:12px;z-index:99;color:#ffd98a;' +
    'font:12px ui-monospace,monospace;background:rgba(6,20,32,0.9);padding:8px 12px;border-radius:6px'
  host.appendChild(a)
  return { width: w, height: h, hulls: roster.length, states: SAIL_STATES.length, url }
}
