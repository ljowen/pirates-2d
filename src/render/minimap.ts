import type { World } from '../sim/world'
import { landRadius, shoalRadius, type Island, type Reef, type TerrainMap } from '../sim/terrain'
import { label, panel, ui } from '../ui/theme'

const SEA = '#b9cfd0'
const SHOAL = '#d6e5df'
const REEF = '#eef4e8'
const LAND = '#a88e58'

/**
 * The chart: the whole of a fixed map in one panel, with the player, the
 * enemies in sight of the lookout, and any squall marked on it.
 *
 * The land never changes during a voyage, so it is drawn once to an
 * off-screen canvas and stamped each frame; only the marks are live. There is
 * no chart on the endless sea, which has no whole to show.
 */
/** What a chart needs to know: a voyage's world, or the open sea's. */
export type Charted = Pick<World, 'terrain' | 'level' | 'wind' | 'ships' | 'player'>

/** Something worth a mark on the chart besides a hull: a town, or where work is. */
export interface ChartMark { x: number; y: number; kind: 'town' | 'burning' | 'mission' | 'crew' }

export class Minimap {
  private chart: HTMLCanvasElement | null = null
  private chartOf: TerrainMap | null = null

  /** Draws the panel with its top-left at (x, y) and returns its height. */
  draw(
    ctx: CanvasRenderingContext2D, world: Charted, x: number, y: number, side: number,
    marks: ChartMark[] = [],
  ): number {
    const map = world.terrain.map
    const size = world.terrain.size
    if (!map || size <= 0) return 0

    const pad = 10
    const head = 30
    const inner = side - pad * 2
    const height = head + inner + pad
    const t = ui().panel

    ctx.save()
    ctx.translate(x, y)
    panel(ctx, 0, 0, side, height)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    label(ctx, world.level.name.toUpperCase(), pad + 2, 11)

    if (this.chartOf !== map) {
      this.chart = paintChart(map, size, inner * 2)
      this.chartOf = map
    }
    ctx.drawImage(this.chart!, pad, head, inner, inner)

    // Marks, clipped to the chart so a squall on the edge does not spill.
    ctx.save()
    ctx.beginPath()
    ctx.rect(pad, head, inner, inner)
    ctx.clip()
    const k = inner / size
    const at = (p: { x: number; y: number }): [number, number] => {
      const q = world.terrain.local(p)
      return [pad + (q.x + size / 2) * k, head + (q.y + size / 2) * k]
    }

    for (const s of world.wind.weather.squalls) {
      if (s.power <= 0.01) continue
      const [sx, sy] = at(s)
      ctx.fillStyle = `rgba(42,24,12,${(0.28 * s.power).toFixed(3)})`
      ctx.beginPath()
      ctx.arc(sx, sy, Math.max(3, s.radius * k), 0, Math.PI * 2)
      ctx.fill()
    }

    for (const e of world.ships) {
      if (e.faction === 'player' || e.sunk) continue
      const [ex, ey] = at(e.pos)
      const r = e.isHunter || e.isBoss ? 3.6 : 2.4
      ctx.beginPath()
      ctx.arc(ex, ey, r, 0, Math.PI * 2)
      // A ship that has given up is a prize, marked pale rather than red; on
      // the open sea, so is a merchant, and a crewmate is marked as a friend.
      ctx.fillStyle = e.faction === 'ally' ? ui().ink.good
        : e.yielding || e.faction === 'neutral' ? '#fbf3dc' : ui().ink.bad
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = t.ink
      ctx.stroke()
    }

    for (const m of marks) {
      const [mx, my] = at(m)
      ctx.lineWidth = 1.5
      ctx.strokeStyle = t.ink
      if (m.kind === 'town' || m.kind === 'burning') {
        ctx.fillStyle = m.kind === 'burning' ? '#e0602a' : '#fbf3dc'
        ctx.fillRect(mx - 4, my - 4, 8, 8)
        ctx.strokeRect(mx - 4, my - 4, 8, 8)
      } else {
        // Work to be had: a gold diamond, solid once you are crew on it.
        ctx.beginPath()
        ctx.moveTo(mx, my - 6); ctx.lineTo(mx + 6, my); ctx.lineTo(mx, my + 6); ctx.lineTo(mx - 6, my)
        ctx.closePath()
        ctx.fillStyle = m.kind === 'crew' ? '#f0c14b' : 'rgba(240,193,75,0.45)'
        ctx.fill()
        ctx.stroke()
      }
    }

    const player = world.player
    const [px, py] = at(player.pos)
    ctx.translate(px, py)
    ctx.rotate(player.heading)
    ctx.beginPath()
    ctx.moveTo(7, 0)
    ctx.lineTo(-5, 4.6)
    ctx.lineTo(-2.5, 0)
    ctx.lineTo(-5, -4.6)
    ctx.closePath()
    ctx.fillStyle = '#fbf3dc'
    ctx.fill()
    ctx.lineWidth = 1.8
    ctx.strokeStyle = t.ink
    ctx.stroke()
    ctx.restore()

    ctx.lineWidth = 1.5
    ctx.strokeStyle = t.ink
    ctx.strokeRect(pad, head, inner, inner)
    ctx.restore()
    return height
  }
}

/** The land of a map, once, at `px` pixels a side. */
export function paintChart(map: TerrainMap, size: number, px: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = px
  const ctx = canvas.getContext('2d')!
  const k = px / size
  ctx.fillStyle = SEA
  ctx.fillRect(0, 0, px, px)

  // Anything over an edge is drawn again on the far side, as the map repeats.
  const shifts = [-size, 0, size]
  const everywhere = (paint: (ox: number, oy: number) => void) => {
    for (const ox of shifts) for (const oy of shifts) paint(ox + size / 2, oy + size / 2)
  }
  const ring = (i: Island, radius: (a: number) => number, ox: number, oy: number) => {
    ctx.beginPath()
    for (let n = 0; n < 28; n++) {
      const a = (n / 28) * Math.PI * 2
      const r = radius(a)
      const x = (i.x + ox + Math.cos(a) * r) * k
      const y = (i.y + oy + Math.sin(a) * r) * k
      if (n === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
  const bar = (r: Reef, ox: number, oy: number) => {
    ctx.beginPath()
    ctx.ellipse((r.x + ox) * k, (r.y + oy) * k, Math.max(1.5, r.length * k), Math.max(1.5, r.width * k), r.angle, 0, Math.PI * 2)
  }

  // By layer across the whole map, so overlapping islands merge as they do at sea.
  ctx.fillStyle = SHOAL
  everywhere((ox, oy) => { for (const i of map.islands) { ring(i, (a) => shoalRadius(i, a), ox, oy); ctx.fill() } })
  ctx.fillStyle = REEF
  everywhere((ox, oy) => { for (const r of map.reefs) { bar(r, ox, oy); ctx.fill() } })
  ctx.strokeStyle = ui().panel.ink
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  everywhere((ox, oy) => { for (const i of map.islands) { ring(i, (a) => landRadius(i, a), ox, oy); ctx.stroke() } })
  ctx.fillStyle = LAND
  everywhere((ox, oy) => { for (const i of map.islands) { ring(i, (a) => landRadius(i, a), ox, oy); ctx.fill() } })
  return canvas
}
