import { T } from '../sim/tuning'
import { damp, type Vec2 } from '../core/math'
import type { Ship } from '../sim/ship'

/**
 * World-up camera, as in Pirates! Gold — north stays up and the ship rotates
 * on screen. It leads ahead of the bow and eases back as you make way, so
 * speed is legible without a readout.
 */
export class Camera {
  pos: Vec2 = { x: 0, y: 0 }
  zoom = T.cameraZoom
  viewW = 1
  viewH = 1

  private targetZoom = T.cameraZoom

  resize(w: number, h: number) {
    this.viewW = w
    this.viewH = h
  }

  follow(ship: Ship, dt: number) {
    const speed = ship.speed
    const leadScale = T.cameraLead
    const target = {
      x: ship.pos.x + ship.vel.x * leadScale,
      y: ship.pos.y + ship.vel.y * leadScale,
    }

    this.pos.x = damp(this.pos.x, target.x, T.cameraSmoothing, dt)
    this.pos.y = damp(this.pos.y, target.y, T.cameraSmoothing, dt)

    this.targetZoom = T.cameraZoom / (1 + (speed / 220) * T.cameraZoomOut)
    this.zoom = damp(this.zoom, this.targetZoom, 2, dt)
  }

  snapTo(p: Vec2) {
    this.pos = { ...p }
  }

  worldToScreen(p: Vec2): Vec2 {
    return {
      x: (p.x - this.pos.x) * this.zoom + this.viewW / 2,
      y: (p.y - this.pos.y) * this.zoom + this.viewH / 2,
    }
  }
}
