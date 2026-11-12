import { Container, Graphics } from 'pixi.js'
import type { Ship } from '../sim/ship'
import type { ShipClass } from '../sim/shipClasses'
import { lerp } from '../core/math'
import { P } from './palette'
import { solveRig, hullSize, mainMast, leewardSide, BEAM } from './rig'
import type { SailDraw } from './hullStyle'
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
  /** Shot holes in the hull, over the paint and under the canvas. */
  private readonly scars = new Graphics()
  private scarCount = -1
  /** A white flag at the main, drawn only once she has given up. */
  private readonly colours = new Graphics()
  private sinkTime = 0
  /** Which side the booms and headsails are on, eased between -1 and 1. */
  private side = 0
  private sideTarget = 0
  private rigged = false
  /** How far the yards are braced round, eased: 0 squared away under bare poles, 1 trimmed to the wind. */
  private brace = 1

  private readonly palette: ShipClass['colors']
  private readonly baseScale: number
  private readonly look: ShipClass['look']

  constructor(cls: ShipClass) {
    this.look = cls.look
    this.palette = P().shipTint(cls.colors)
    this.view.addChild(this.shadow, this.heelLayer)
    this.heelLayer.addChild(this.hull, this.scars, this.sails, this.colours)
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
    // Furled, the yards are squared across the hull and the booms lie along
    // it. They swing round to the wind as sail is made, and back as it comes
    // in, over about a second.
    const braceTarget = ship.yardsSet === 0 ? 0 : 1
    if (!this.rigged) this.brace = braceTarget
    const swing = 1.1 * dt
    this.brace += Math.max(-swing, Math.min(swing, braceTarget - this.brace))
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
      brace: this.brace * this.brace * (3 - 2 * this.brace),
    }, performance.now(), this.look)
    for (const b of rig.bare) {
      s.moveTo(b.spar[0], b.spar[1]).lineTo(b.spar[2], b.spar[3])
        .stroke({ width: H().sparWidth, color: P().ship.spar })
    }
    for (const [n, sail] of rig.sails.entries()) {
      H().drawSail(s, sail, this.palette, H().sparWidth * sail.taper)
      this.drawHoles(s, sail, ship, n)
    }
  }

  /**
   * Shot holes in a sail: more of them as the rigging goes.
   *
   * The canvas already shrinks and fades as it is shot away, which shows how
   * much is left. Holes show that it was *shot*, and they are what makes a
   * ship that has taken chain look different from one that has reefed.
   */
  private drawHoles(g: Graphics, sail: SailDraw, ship: Ship, n: number) {
    const lost = 1 - sail.health
    const holes = Math.min(MAX_HOLES, Math.floor(lost * (MAX_HOLES + 1)))
    if (holes === 0 || sail.depth < 2) return
    const [x1, y1, x2, y2] = sail.spar
    const yard = Math.hypot(x2 - x1, y2 - y1)
    for (let i = 0; i < holes; i++) {
      const seed = ship.id * 131 + n * 17 + i * 53
      const along = 0.2 + rnd(seed) * 0.6
      const out = (0.25 + rnd(seed + 1) * 0.45) * sail.depth
      const x = x1 + (x2 - x1) * along + sail.push[0] * out
      const y = y1 + (y2 - y1) * along + sail.push[1] * out
      const r = Math.min(yard * 0.09, 1.6 + rnd(seed + 2) * 1.6)
      g.poly(ragged(x, y, r, seed)).fill({ color: P().ship.shadow, alpha: 0.75 })
    }
  }

  /**
   * Shot holes in the hull, in the same places on a given ship every time.
   * Redrawn only when the count changes; the last to appear is the first
   * mended, so repair visibly undoes the damage in order.
   */
  private drawScars(ship: Ship) {
    const count = ship.sunk ? MAX_SCARS : Math.min(MAX_SCARS, Math.floor((1 - ship.hull) * (MAX_SCARS + 1)))
    if (count === this.scarCount) return
    this.scarCount = count
    const g = this.scars
    g.clear()
    const { L, B } = hullSize(this.look.hull)
    for (let i = 0; i < count; i++) {
      const seed = ship.id * 977 + i * 61
      const x = (-0.72 + rnd(seed) * 1.35) * L
      // The hull narrows toward the bow, so the holes do too.
      const taper = 1 - Math.max(0, x / L) ** 2 * 0.7
      const side = rnd(seed + 1) < 0.5 ? -1 : 1
      const y = side * (0.25 + rnd(seed + 2) * 0.5) * B * taper
      const r = 1.7 + rnd(seed + 3) * 1.5
      g.poly(ragged(x, y, r, seed)).fill({ color: SCAR, alpha: 0.9 })
      // A pale splinter or two thrown up beside it.
      for (let k = 0; k < 2; k++) {
        const a = rnd(seed + 7 + k) * Math.PI * 2
        g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
          .lineTo(x + Math.cos(a) * (r + 2.4), y + Math.sin(a) * (r + 2.4))
          .stroke({ width: 0.9, color: SPLINTER, alpha: 0.9 })
      }
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
    this.drawScars(ship)

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


const MAX_SCARS = 9
const MAX_HOLES = 3
const SCAR = 0x1c110a
const SPLINTER = 0xe9d3a6

/** Stable randomness from a whole number, so damage sits still between frames. */
function rnd(n: number): number {
  const x = Math.sin(n * 12.9898 + 4.1414) * 43758.5453
  return x - Math.floor(x)
}

/** A small jagged hole. */
function ragged(x: number, y: number, r: number, seed: number): number[] {
  const pts: number[] = []
  const N = 7
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rnd(seed + 20) * 2
    const rr = r * (0.6 + rnd(seed + 30 + i) * 0.7)
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  return pts
}

function shortestDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
