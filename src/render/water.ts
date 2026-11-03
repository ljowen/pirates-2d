import { Container, Texture, TilingSprite } from 'pixi.js'
import type { Camera } from './camera'
import type { Wind } from '../sim/wind'

/**
 * Open water, built from two procedurally generated tiling layers scrolling at
 * different rates. Without a textured surface the ship has nothing to move
 * against and all sense of speed disappears, so this earns its keep.
 */
export class Water {
  readonly view = new Container()
  private readonly deep: TilingSprite
  private readonly swell: TilingSprite
  private driftX = 0
  private driftY = 0

  constructor(width: number, height: number) {
    // Lighter water than a realistic deep-sea blue, chosen so dark shot reads
    // clearly against it. Legibility of what is about to hit you beats mood.
    this.deep = new TilingSprite({ texture: makeWaveTexture(256, 0x2e6f94, 0x55a0c4, 420, 1.6), width, height })
    this.swell = new TilingSprite({ texture: makeWaveTexture(512, 0x000000, 0xdcf2ff, 150, 3.2, true), width, height })
    this.swell.alpha = 0.42
    this.view.addChild(this.deep, this.swell)
  }

  resize(w: number, h: number) {
    this.deep.width = this.swell.width = w
    this.deep.height = this.swell.height = h
  }

  update(camera: Camera, wind: Wind, dt: number) {
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
