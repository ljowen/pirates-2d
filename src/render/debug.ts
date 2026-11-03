import type { Ship } from '../sim/ship'
import type { Wind } from '../sim/wind'
import type { Camera } from './camera'
import { deg } from '../core/math'
import { roundRect, speedColor } from './hud'

/**
 * F1 overlay: the polar curve with your current position marked, the velocity
 * decomposition, and a numeric dump. This is the instrument you actually tune
 * against — the HUD tells you how it feels, this tells you why.
 */
export class DebugOverlay {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  draw(ship: Ship, wind: Wind, camera: Camera, fps: number) {
    const ctx = this.ctx
    const h = ctx.canvas.clientHeight

    this.drawPolarPlot(ship, 24, h - 220, 260, 150)
    this.drawVectors(ship, camera)
    this.drawNumbers(ship, wind, fps, 312, h - 220)
  }

  private drawPolarPlot(ship: Ship, x: number, y: number, w: number, h: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x, y)

    ctx.fillStyle = 'rgba(4,14,24,0.86)'
    roundRect(ctx, 0, 0, w, h + 28, 6)
    ctx.fill()

    const padL = 30
    const padB = 22
    const plotW = w - padL - 12
    const plotH = h - 20

    const px = (angleDeg: number) => padL + (angleDeg / 180) * plotW
    const py = (mult: number) => plotH - mult * (plotH - 10) + 10

    // Point-of-sail bands behind the curve.
    const bands: [number, number, string][] = [
      [0, 32, 'rgba(255,90,80,0.14)'],
      [32, 55, 'rgba(255,170,70,0.1)'],
      [55, 100, 'rgba(120,230,150,0.08)'],
    ]
    for (const [a0, a1, color] of bands) {
      ctx.fillStyle = color
      ctx.fillRect(px(a0), 10, px(a1) - px(a0), plotH)
    }

    // Axes.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padL, 10)
    ctx.lineTo(padL, plotH + 10)
    ctx.lineTo(padL + plotW, plotH + 10)
    ctx.stroke()

    ctx.font = '9px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.textAlign = 'center'
    for (const a of [0, 45, 90, 135, 180]) ctx.fillText(`${a}°`, px(a), plotH + padB)
    ctx.textAlign = 'right'
    for (const m of [0, 0.5, 1]) ctx.fillText(m.toFixed(1), padL - 4, py(m) + 3)

    // The curve itself.
    ctx.beginPath()
    for (let a = 0; a <= 180; a += 2) {
      const m = ship.polar.sampleDeg(a)
      if (a === 0) ctx.moveTo(px(a), py(m))
      else ctx.lineTo(px(a), py(m))
    }
    ctx.strokeStyle = '#9fe8ff'
    ctx.lineWidth = 2
    ctx.stroke()

    // Where we are on it right now.
    const curDeg = deg(ship.awa)
    const curMult = ship.polarMult
    ctx.beginPath()
    ctx.moveTo(px(curDeg), 10)
    ctx.lineTo(px(curDeg), plotH + 10)
    ctx.strokeStyle = 'rgba(255,217,138,0.5)'
    ctx.setLineDash([3, 3])
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    ctx.arc(px(curDeg), py(curMult), 4.5, 0, Math.PI * 2)
    ctx.fillStyle = speedColor(curMult)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillText('POLAR  speed vs angle off wind', padL, h + 20)

    ctx.restore()
  }

  /** Velocity, heading and wind drawn on the ship itself. */
  private drawVectors(ship: Ship, camera: Camera) {
    const ctx = this.ctx
    const s = camera.worldToScreen(ship.pos)
    const z = camera.zoom

    const arrow = (dx: number, dy: number, color: string, label: string) => {
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(s.x + dx, s.y + dy)
      ctx.stroke()
      const a = Math.atan2(dy, dx)
      ctx.beginPath()
      ctx.moveTo(s.x + dx, s.y + dy)
      ctx.lineTo(s.x + dx - Math.cos(a - 0.4) * 8, s.y + dy - Math.sin(a - 0.4) * 8)
      ctx.lineTo(s.x + dx - Math.cos(a + 0.4) * 8, s.y + dy - Math.sin(a + 0.4) * 8)
      ctx.closePath()
      ctx.fill()
      ctx.font = '10px ui-monospace, monospace'
      ctx.textAlign = 'left'
      ctx.fillText(label, s.x + dx + 6, s.y + dy)
    }

    arrow(ship.vel.x * 0.42 * z, ship.vel.y * 0.42 * z, '#7fe0a0', 'vel')
    arrow(Math.cos(ship.heading) * 60 * z, Math.sin(ship.heading) * 60 * z, '#ffd98a', 'heading')

    // Lateral slip, drawn only when it is actually doing something.
    if (Math.abs(ship.lateralSpeed) > 2) {
      const lx = -Math.sin(ship.heading)
      const ly = Math.cos(ship.heading)
      arrow(lx * ship.lateralSpeed * 1.6 * z, ly * ship.lateralSpeed * 1.6 * z, '#ff9ad5', 'slip')
    }
  }

  private drawNumbers(ship: Ship, wind: Wind, fps: number, x: number, y: number) {
    const ctx = this.ctx
    const rows: [string, string][] = [
      ['fps', fps.toFixed(0)],
      ['speed', ship.speed.toFixed(1)],
      ['fwd / lat', `${ship.forwardSpeed.toFixed(1)} / ${ship.lateralSpeed.toFixed(1)}`],
      ['awa', `${deg(ship.awa).toFixed(1)}°`],
      ['polar mult', ship.polarMult.toFixed(3)],
      ['canvas', ship.canvas.toFixed(2)],
      ['rudder', ship.rudder.toFixed(2)],
      ['turn rate', `${deg(ship.turnRate).toFixed(1)}°/s`],
      ['heel', `${deg(ship.heel).toFixed(1)}°`],
      ['wind from', `${deg(wind.from).toFixed(0)}°`],
      ['wind str', wind.strength.toFixed(2)],
      ['pos', `${ship.pos.x.toFixed(0)}, ${ship.pos.y.toFixed(0)}`],
    ]

    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = 'rgba(4,14,24,0.86)'
    roundRect(ctx, 0, 0, 210, rows.length * 16 + 18, 6)
    ctx.fill()
    ctx.font = '11px ui-monospace, monospace'
    ctx.textBaseline = 'top'
    rows.forEach(([k, v], i) => {
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fillText(k, 10, 10 + i * 16)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#9fe8ff'
      ctx.fillText(v, 200, 10 + i * 16)
    })
    ctx.restore()
  }
}
