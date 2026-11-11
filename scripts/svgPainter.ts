import type { FillStyle, Painter, StrokeStyle } from '../src/render/painter'

const hex = (c: number) => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`
const n = (v: number) => (Math.round(v * 100) / 100).toString()

/**
 * A `Painter` that emits SVG instead of talking to a GPU.
 *
 * Pixi's `Graphics` keeps a path and then fills or strokes it, so this does
 * the same: calls accumulate a path, and `fill`/`stroke` flush it into an
 * element. Both may be called on one path — the cel style outlines the shape
 * it has just filled — so the path is only cleared when a new one starts.
 */
export class SvgPainter implements Painter {
  readonly out: string[] = []
  private path: string[] = []
  private pending = false

  private begin() {
    if (!this.pending) { this.path.length = 0; this.pending = true }
  }

  poly(points: number[]): Painter {
    this.begin()
    const p: string[] = []
    for (let i = 0; i < points.length; i += 2) {
      p.push(`${i === 0 ? 'M' : 'L'}${n(points[i])} ${n(points[i + 1])}`)
    }
    p.push('Z')
    this.path.push(p.join(' '))
    return this
  }

  rect(x: number, y: number, w: number, h: number): Painter {
    this.begin()
    this.path.push(`M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`)
    return this
  }

  ellipse(x: number, y: number, rx: number, ry: number): Painter {
    this.begin()
    // Two arcs, because SVG paths have no ellipse primitive.
    this.path.push(
      `M${n(x - rx)} ${n(y)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0` +
      `a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`,
    )
    return this
  }

  moveTo(x: number, y: number): Painter {
    this.begin()
    this.path.push(`M${n(x)} ${n(y)}`)
    return this
  }

  lineTo(x: number, y: number): Painter {
    this.begin()
    this.path.push(`L${n(x)} ${n(y)}`)
    return this
  }

  fill(style: FillStyle): Painter {
    const a = style.alpha ?? 1
    this.out.push(
      `<path d="${this.path.join(' ')}" fill="${hex(style.color)}"` +
      `${a < 1 ? ` fill-opacity="${n(a)}"` : ''}/>`,
    )
    this.pending = false
    return this
  }

  stroke(style: StrokeStyle): Painter {
    const a = style.alpha ?? 1
    this.out.push(
      `<path d="${this.path.join(' ')}" fill="none" stroke="${hex(style.color)}"` +
      ` stroke-width="${n(style.width)}" stroke-linejoin="round" stroke-linecap="round"` +
      `${a < 1 ? ` stroke-opacity="${n(a)}"` : ''}/>`,
    )
    this.pending = false
    return this
  }

  /** Everything painted so far, wrapped in a transform. */
  flush(transform: string): string {
    const body = this.out.join('')
    this.out.length = 0
    this.pending = false
    return `<g transform="${transform}">${body}</g>`
  }
}
