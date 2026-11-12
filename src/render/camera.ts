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

  /**
   * The player's own zoom, multiplied onto the tuned one. Limited at both
   * ends: further in and the next sail is off screen before it can be
   * answered, further out and hulls are specks.
   */
  userZoom = 1
  static readonly USER_ZOOM_MIN = 0.5
  static readonly USER_ZOOM_MAX = 2

  /** Zoom by a factor: above 1 moves in, below 1 moves out. */
  zoomBy(factor: number) {
    this.userZoom = Math.min(Camera.USER_ZOOM_MAX,
      Math.max(Camera.USER_ZOOM_MIN, this.userZoom * factor))
  }

  /** How hard the view is being shaken, 0 to 1. Bleeds away by itself. */
  private trauma = 0
  /** Where the shake has pushed the view this frame, in screen pixels. */
  readonly shake = { x: 0, y: 0 }

  /**
   * Jolt the view: a broadside going, or a ball coming aboard. Small by
   * design. The player has to read the water through it, so it is a nudge
   * that says something heavy happened, not a blur.
   */
  kick(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount)
  }

  resize(w: number, h: number) {
    this.viewW = w
    this.viewH = h
  }

  follow(ship: Ship, dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 2.6)
    // Squared, so a light knock barely shows and a heavy one lands.
    const push = this.trauma * this.trauma * 9
    this.shake.x = (Math.random() * 2 - 1) * push
    this.shake.y = (Math.random() * 2 - 1) * push
    const speed = ship.speed
    const leadScale = T.cameraLead
    const target = {
      x: ship.pos.x + ship.vel.x * leadScale,
      y: ship.pos.y + ship.vel.y * leadScale,
    }

    this.pos.x = damp(this.pos.x, target.x, T.cameraSmoothing, dt)
    this.pos.y = damp(this.pos.y, target.y, T.cameraSmoothing, dt)

    this.targetZoom = T.cameraZoom * this.userZoom / (1 + (speed / 220) * T.cameraZoomOut)
    // The player's zoom answers quickly; the speed zoom-out drifts.
    const settled = Math.abs(Math.log(this.zoom / this.targetZoom)) < 0.08
    this.zoom = damp(this.zoom, this.targetZoom, settled ? 2 : 9, dt)
  }

  snapTo(p: Vec2) {
    this.pos = { ...p }
  }

  worldToScreen(p: Vec2): Vec2 {
    return {
      x: (p.x - this.pos.x) * this.zoom + this.viewW / 2 + this.shake.x,
      y: (p.y - this.pos.y) * this.zoom + this.viewH / 2 + this.shake.y,
    }
  }
}
