import { Container, Graphics } from 'pixi.js'
import type { Terrain } from '../sim/terrain'
import type { WindSample } from '../sim/wind'
import type { SettlementSnap } from '../net/protocol'

const INK = 0x2a180c
const TIMBER = 0x8a5a2b
const PLASTER = 0xf0e3c4
const ROOF = [0xa0402a, 0x8a3f08, 0xb5600e]
const CHARRED = 0x3a2a20

interface Plan {
  /** The middle of the town, ashore. */
  cx: number
  cy: number
  /** Where the pier meets deep water. */
  px: number
  py: number
  /** Bearing from the water to the town. */
  land: number
  /** How large it is drawn: a town on a small island is a smaller town. */
  k: number
  houses: { x: number; y: number; w: number; h: number; a: number; roof: number }[]
}

interface Puff { x: number; y: number; r: number; life: number; max: number }

/**
 * The open sea's two towns, drawn ashore from the point of water where their
 * walls are fought over: a pier out to that point, a palisade facing the sea,
 * a handful of houses and a flag. While a town burns its roofs go black,
 * fire licks the houses and smoke drifts off downwind until it is rebuilt.
 *
 * Painted in the same flat, ink-outlined manner as the hulls.
 */
export class SettlementView {
  readonly view = new Container()
  private readonly g = new Graphics()
  private readonly smokeG = new Graphics()
  private plans = new Map<number, Plan>()
  private smoke: Puff[] = []
  private t = 0

  constructor() {
    this.view.addChild(this.g, this.smokeG)
  }

  update(settlements: SettlementSnap[], terrain: Terrain, wind: WindSample, dt: number) {
    this.t += dt
    const g = this.g
    g.clear()
    for (const s of settlements) {
      let plan = this.plans.get(s.id)
      if (!plan) {
        plan = this.layOut(s, terrain)
        this.plans.set(s.id, plan)
      }
      this.draw(plan, s)
      if (s.burning) this.smoulder(plan, dt)
    }
    this.drift(wind, dt)
  }

  clear() {
    this.g.clear()
    this.smokeG.clear()
    this.plans.clear()
    this.smoke = []
  }

  /** Where everything goes, worked out once per town from where its shore is. */
  private layOut(s: SettlementSnap, terrain: Terrain): Plan {
    const probe = terrain.probe({ x: s.x, y: s.y })
    const shore = Math.max(0, probe.distance)
    const ux = Math.cos(s.land)
    const uy = Math.sin(s.land)
    // As big as the land behind the beach allows: walk inland until it ends.
    let inland = 0
    while (inland < 300 &&
      terrain.probe({ x: s.x + ux * (shore + inland + 20), y: s.y + uy * (shore + inland + 20) }).distance < 0) {
      inland += 20
    }
    const k = Math.max(0.45, Math.min(1, inland / 280))
    const reach = shore + 130 * k
    const cx = s.x + ux * reach
    const cy = s.y + uy * reach
    // The same town every time it is drawn: placed from its id, not at random.
    let seed = s.id * 9301 + 49297
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    const houses = []
    for (let i = 0; i < 11; i++) {
      // A loose ring of houses and a second, inner one, across the town.
      const inner = i >= 7
      const a = s.land + Math.PI + (inner ? (i - 8) * 0.9 : (i - 3) * 0.55) + (rnd() - 0.5) * 0.25
      const r = (inner ? 18 + rnd() * 22 : 62 + rnd() * 40) * k
      houses.push({
        // Inside the palisade, between it and the middle of the town.
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        w: (26 + rnd() * 16) * k, h: (18 + rnd() * 10) * k, a: a + (rnd() - 0.5) * 0.6,
        roof: ROOF[i % ROOF.length],
      })
    }
    return { cx, cy, px: s.x + ux * 8, py: s.y + uy * 8, land: s.land, k, houses }
  }

  private draw(p: Plan, s: SettlementSnap) {
    const g = this.g
    const burning = s.burning

    // The pier, from the town out to deep water.
    const k = p.k
    const fromX = p.cx - Math.cos(p.land) * 130 * k
    const fromY = p.cy - Math.sin(p.land) * 130 * k
    g.moveTo(fromX, fromY).lineTo(p.px, p.py).stroke({ width: 14, color: INK })
    g.moveTo(fromX, fromY).lineTo(p.px, p.py).stroke({ width: 9, color: burning ? CHARRED : TIMBER })

    // The palisade: an arc of stakes on the seaward side, gapped where they fall.
    const stakes = 34
    for (let i = 0; i < stakes; i++) {
      const a = p.land + Math.PI + (i / (stakes - 1) - 0.5) * 3.3
      // Gaps open as the walls are knocked down.
      if (s.walls < ((i * 7) % 10) / 10) continue
      const x = p.cx + Math.cos(a) * 128 * k
      const y = p.cy + Math.sin(a) * 128 * k
      g.circle(x, y, 6.5 * Math.sqrt(k)).fill(burning ? CHARRED : TIMBER).stroke({ width: 2, color: INK })
    }

    for (const h of p.houses) {
      const corners = rect(h.x, h.y, h.w, h.h, h.a)
      g.poly(corners).fill(burning ? CHARRED : PLASTER).stroke({ width: 2, color: INK })
      const roof = rect(h.x, h.y, h.w * 0.9, h.h * 0.5, h.a)
      g.poly(roof).fill(burning ? 0x1e1610 : h.roof)
      if (burning) {
        // Fire on what is left: flickering, never the same twice.
        const f = 0.6 + 0.4 * Math.sin(this.t * 11 + h.x)
        g.circle(h.x, h.y, (8 + f * 7) * k).fill({ color: 0xe0602a, alpha: 0.85 })
        g.circle(h.x + 1, h.y - 1, (4 + f * 3.5) * k).fill({ color: 0xf0c14b, alpha: 0.9 })
      }
    }

    if (!burning) {
      // A flag over the town, standing out on the breeze.
      const fx = p.cx
      const fy = p.cy
      const fk = Math.max(0.7, k)
      g.moveTo(fx, fy).lineTo(fx, fy - 56 * fk).stroke({ width: 4, color: INK })
      const wave = Math.sin(this.t * 4) * 3.5 * fk
      g.poly([fx, fy - 56 * fk, fx + 34 * fk, fy - 49 * fk + wave, fx, fy - 40 * fk])
        .fill(0xf0e3c4).stroke({ width: 2, color: INK })
      g.moveTo(fx + 2, fy - 48 * fk).lineTo(fx + 29 * fk, fy - 48 * fk + wave * 0.8)
        .stroke({ width: 3.5 * fk, color: 0xa01d12 })
    }
  }

  private smoulder(p: Plan, dt: number) {
    if (Math.random() > dt * 9) return
    const h = p.houses[Math.floor(Math.random() * p.houses.length)]
    const max = 4 + Math.random() * 3
    this.smoke.push({ x: h.x, y: h.y, r: 14, life: max, max })
  }

  private drift(wind: WindSample, dt: number) {
    const g = this.smokeG
    g.clear()
    const vx = Math.cos(wind.to) * 26 * wind.strength
    const vy = Math.sin(wind.to) * 26 * wind.strength
    const alive: Puff[] = []
    for (const s of this.smoke) {
      s.life -= dt
      if (s.life <= 0) continue
      s.x += vx * dt
      s.y += vy * dt
      s.r += 16 * dt
      g.circle(s.x, s.y, s.r).fill({ color: 0x4a4440, alpha: 0.4 * (s.life / s.max) })
      alive.push(s)
    }
    this.smoke = alive
  }
}

function rect(x: number, y: number, w: number, h: number, a: number): number[] {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const pts: number[] = []
  for (const [dx, dy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
    pts.push(x + dx * c - dy * s, y + dx * s + dy * c)
  }
  return pts
}
