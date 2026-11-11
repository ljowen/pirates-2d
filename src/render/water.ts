import { Container, Graphics, Texture, TilingSprite } from 'pixi.js'
import type { Camera } from './camera'
import type { WindSample } from '../sim/wind'
import type { Vec2 } from '../core/math'
import { P } from './palette'

/**
 * Open water, built from two procedurally generated tiling layers scrolling at
 * different rates. Without a textured surface the ship has nothing to move
 * against and all sense of speed disappears, so this earns its keep.
 */
export class Water {
  readonly view = new Container()
  private readonly deep: TilingSprite
  private readonly swell: TilingSprite
  private readonly gusts = new Graphics()
  private driftX = 0
  private driftY = 0
  private gustClock = 0

  constructor(width: number, height: number) {
    // Lighter water than a realistic deep-sea blue, chosen so dark shot reads
    // clearly against it. Legibility of what is about to hit you beats mood.
    this.deep = new TilingSprite({ texture: makeWaveTexture(256, P().water.deep, P().water.light, 420, 1.6), width, height })
    this.swell = new TilingSprite({ texture: makeWaveTexture(512, 0x000000, P().water.swell, 150, 3.2, true), width, height })
    this.swell.alpha = 0.42
    this.view.addChild(this.deep, this.swell, this.gusts)
  }

  resize(w: number, h: number) {
    this.deep.width = this.swell.width = w
    this.deep.height = this.swell.height = h
  }

  /**
   * Cat's paws: the darker ruffled patches that mark stronger wind, and the
   * glassy ones that mark a lull.
   *
   * Without this, wind that varies by place is invisible until you have
   * already sailed into it — the player can feel a lull but never see one
   * coming, which makes local weather something that happens *to* them rather
   * than something to read and use. Sampled on a coarse grid around the
   * camera and rebuilt only as it moves.
   */
  updateGusts(camera: Camera, windAt: (p: Vec2) => WindSample, dt: number) {
    this.gustClock -= dt
    if (this.gustClock > 0) return
    this.gustClock = 0.25

    const g = this.gusts
    g.clear()

    const step = 190 / camera.zoom
    const cols = Math.ceil(camera.viewW / (step * camera.zoom)) + 2
    const rows = Math.ceil(camera.viewH / (step * camera.zoom)) + 2
    const originX = camera.pos.x - (cols / 2) * step
    const originY = camera.pos.y - (rows / 2) * step

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        // Offset alternate rows so the sampling grid never reads as a lattice.
        const x = originX + (i + (j % 2) * 0.5) * step
        const y = originY + j * step
        const sample = windAt({ x, y })

        // Deviation from a steady breeze, in either direction.
        const delta = sample.strength - 1
        if (Math.abs(delta) < 0.07) continue

        // Generously overlapping, so the samples blend into a field of
        // ruffled and glassy water rather than reading as discrete blobs.
        const r = step * 1.15
        if (delta > 0) {
          g.circle(x, y, r).fill({ color: P().water.gustDark, alpha: Math.min(0.1, delta * 0.2) })
        } else {
          g.circle(x, y, r).fill({ color: P().water.gustLight, alpha: Math.min(0.08, -delta * 0.16) })
        }
      }
    }
  }

  update(camera: Camera, wind: WindSample, dt: number) {
    // Surface texture creeps downwind, independent of camera motion.
    this.driftX += Math.cos(wind.to) * 11 * wind.strength * dt
    this.driftY += Math.sin(wind.to) * 11 * wind.strength * dt

    const z = camera.zoom
    this.deep.tileScale.set(z)
    this.swell.tileScale.set(z * 1.6)

    this.deep.tilePosition.set(
      (-camera.pos.x + this.driftX) * z + camera.viewW / 2,
      (-camera.pos.y + this.driftY) * z + camera.viewH / 2,
    )
    this.swell.tilePosition.set(
      (-camera.pos.x + this.driftX * 1.9) * z * 1.6 + camera.viewW / 2,
      (-camera.pos.y + this.driftY * 1.9) * z * 1.6 + camera.viewH / 2,
    )
  }
}

/** Renders a seamless wave-speckle tile to an offscreen canvas. */
function makeWaveTexture(
  size: number,
  base: number,
  accent: number,
  count: number,
  scale: number,
  transparent = false,
): Texture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!

  if (transparent) {
    ctx.clearRect(0, 0, size, size)
  } else {
    ctx.fillStyle = hex(base)
    ctx.fillRect(0, 0, size, size)
  }

  ctx.strokeStyle = hex(accent)
  ctx.lineCap = 'round'

  // Deterministic placement so the tile is stable across reloads.
  let s = 0x2545f491
  const rnd = () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 0xffffffff
  }

  for (let i = 0; i < count; i++) {
    const x = rnd() * size
    const y = rnd() * size
    const len = (2 + rnd() * 7) * scale
    // Chop runs roughly in one direction but never perfectly aligned.
    const angle = (rnd() - 0.5) * 0.7
    ctx.globalAlpha = 0.25 + rnd() * 0.45
    ctx.lineWidth = 1 + rnd() * scale * 0.6
    // Draw each dash nine times so strokes crossing an edge wrap seamlessly.
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        ctx.beginPath()
        ctx.moveTo(x + ox * size, y + oy * size)
        ctx.lineTo(x + ox * size + len * Math.cos(angle), y + oy * size + len * Math.sin(angle))
        ctx.stroke()
      }
    }
  }

  return Texture.from(c)
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0')
