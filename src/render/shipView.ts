import { Container, Graphics } from 'pixi.js'
import type { Ship } from '../sim/ship'
import type { ShipClass } from '../sim/shipClasses'
import { lerp } from '../core/math'
import { P } from './palette'
import { solveRig, hullSize, mainMast, leewardSide, BEAM } from './rig'
import { H } from './hullStyle'


/**
 * Programmer art, deliberately: a hull polygon with square-rigged sails that
 * fill and luff. Feel comes out of motion long before it comes out of sprites,
 * so this stays vector until the model is locked.
 */
export class ShipView {
  readonly view = new Container()
  private readonly heelLayer = new Container()
  private readonly hull = new Graphics()
  private readonly sails = new Graphics()
  private readonly shadow = new Graphics()
  /** A white flag at the main, drawn only once she has given up. */
  private readonly colours = new Graphics()
  private sinkTime = 0
  /** Which side the booms and headsails are on, eased between -1 and 1. */
  private side = 0
  private sideTarget = 0
  private rigged = false

  private readonly palette: ShipClass['colors']
  private readonly baseScale: number
  private readonly look: ShipClass['look']

  constructor(cls: ShipClass) {
    this.look = cls.look
    this.palette = P().shipTint(cls.colors)
    this.view.addChild(this.shadow, this.heelLayer)
    this.heelLayer.addChild(this.hull, this.sails, this.colours)
    // Hull size is a class property, so a Pinnace reads as small at a glance.
    this.view.scale.set(cls.scale)
    this.baseScale = cls.scale
    this.drawHull()
    this.drawShadow()
  }

  private drawShadow() {
    const { L, B } = hullSize(this.look.hull)
    this.shadow.ellipse(0, 0, L * 1.1, B * 1.9).fill({ color: P().ship.shadow, alpha: 0.35 })
  }

  /** The shape is the class's; how it is drawn belongs to the hull style. */
  private drawHull() {
    const { L, B } = hullSize(this.look.hull)
    H().drawHull(this.hull, L, B, this.palette, this.look.hull)
  }

  /**
   * Redrawn each frame. A square rig braces its yards round as the wind moves
   * aft — hard round when close hauled, square across the hull when running —
   * and the canvas bellies out to leeward. That makes the rig itself a readout
   * of your point of sail, which is worth more than any HUD element.
   */
  private drawSails(ship: Ship, dt: number) {
    const s = this.sails
    s.clear()

    // Ease the booms and headsails across as she tacks or gybes. The target
    // only changes once the wind is clearly on the other side, so running
    // dead before it does not flog the boom from side to side on every
    // flicker of the wind.
    const lean = Math.sin(ship.awaSigned)
    if (!this.rigged || Math.abs(lean) > 0.08) this.sideTarget = leewardSide(ship.awaSigned)
    // A ship first seen is already on her tack, not swinging onto it.
    if (!this.rigged) { this.side = this.sideTarget; this.rigged = true }
    // About three quarters of a second from one side to the other.
    const step = 2.6 * dt
    this.side += Math.max(-step, Math.min(step, this.sideTarget - this.side))

    // Geometry from the shared solver; paint from the style. The build's
    // sprite sheet runs the same `solveRig` in Node, which is what stops the
    // sheet from being a picture of a second, drifting copy of the art.
    const side = this.side * this.side * (3 - 2 * Math.abs(this.side)) * Math.sign(this.side)
    const rig = solveRig({
      canvas: ship.canvas, polarMult: ship.polarMult, awaSigned: ship.awaSigned,
      sails: ship.sails, yardsSet: ship.yardsSet, side,
    }, performance.now(), this.look)
    for (const b of rig.bare) {
      s.moveTo(b.spar[0], b.spar[1]).lineTo(b.spar[2], b.spar[3])
        .stroke({ width: H().sparWidth, color: P().ship.spar })
    }
    for (const sail of rig.sails) {
      H().drawSail(s, sail, this.palette, H().sparWidth * sail.taper)
    }
  }

  update(ship: Ship, alpha: number, dt: number) {
    const x = lerp(ship.prevPos.x, ship.pos.x, alpha)
    const y = lerp(ship.prevPos.y, ship.pos.y, alpha)
    const heading = ship.prevHeading + shortestDelta(ship.prevHeading, ship.heading) * alpha
    const heel = lerp(ship.prevHeel, ship.heel, alpha)

    this.view.position.set(x, y)
    this.view.rotation = heading

    this.view.scale.set(this.baseScale)
    this.heelLayer.scale.set(1, Math.cos(heel * 1.3))
    this.heelLayer.position.set(0, Math.sin(heel) * BEAM * 0.5)
    this.shadow.position.set(-Math.sin(heel) * 5, Math.sin(heel) * 3)

    this.drawSails(ship, dt)
    this.drawColours(ship)

    // A fresh hit whitens the hull for an instant — the cheapest possible
    // confirmation that your shot connected.
    this.hull.tint = ship.sinceHit < 0.12 ? P().ship.hit : 0xffffff

    if (ship.sunk) {
      // Settle by the head, roll over, and go under.
      this.sinkTime += dt
      const t = Math.min(this.sinkTime / 2.4, 1)
      this.view.alpha = 1 - t
      this.view.scale.set(this.baseScale * (1 - t * 0.45))
      this.heelLayer.rotation = t * 0.8
    }
  }

  /**
   * A white flag at the main, flown from the moment she is beaten.
   *
   * This is the *only* signal that a ship can be taken — there was a caption
   * over her for a while, and a caption is a worse version of the same idea:
   * it says in words what the ship can say about herself, it sits in the
   * instrument layer rather than on the water, and it reads as UI in a scene
   * that is otherwise entirely diegetic.
   *
   * It flies before she strikes, not after. A flag that appears only once the
   * capture has happened is a receipt; what the player needs is a ship saying
   * *come and take me* while there is still a decision to make about whether
   * to go. It goes when she does.
   */
  private drawColours(ship: Ship) {
    const c = this.colours
    c.clear()
    if (ship.sunk || ship.faction !== 'enemy') return
    if (!ship.yielding) return

    const mx = mainMast(this.look)
    const flutter = Math.sin(performance.now() * 0.006) * 1.6
    // Flagstaff at the main, and a plain white flag hanging off it.
    c.moveTo(mx, 0).lineTo(mx, -BEAM * 1.5).stroke({ width: 1.6, color: P().ship.spar })
    c.poly([
      mx, -BEAM * 1.5,
      mx + BEAM * 0.95, -BEAM * 1.32 + flutter,
      mx + BEAM * 0.9, -BEAM * 0.82 + flutter,
      mx, -BEAM * 0.95,
    ]).fill({ color: P().ship.canvas, alpha: 0.95 }).stroke({ width: 1, color: P().ship.line })
  }

  /** True once the sinking animation has finished and the view can be dropped. */
  get finishedSinking() { return this.sinkTime >= 2.4 }
}


function shortestDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
