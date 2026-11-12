import type { Input } from '../core/input'
import { cardCss, ui } from './theme'

/**
 * On-screen controls for a finger.
 *
 * They appear the first time the screen is touched and never on a machine
 * that is only ever driven by keys and a mouse. Steering is held; everything
 * else is a tap. The buttons are the same paper cards as the rest of the
 * interface, set low in the two corners where thumbs already are.
 */
export class TouchControls {
  private readonly root: HTMLDivElement
  private shown = false
  private wanted = true

  constructor(private readonly input: Input, canvas: HTMLElement) {
    this.root = document.createElement('div')
    this.root.style.cssText = 'position:fixed;inset:0;z-index:20;pointer-events:none;display:none;' +
      'user-select:none;-webkit-user-select:none;touch-action:none'
    document.body.appendChild(this.root)

    const button = (label: string, css: string, size = 68): HTMLButtonElement => {
      const b = document.createElement('button')
      b.textContent = label
      b.style.cssText = `${cardCss()} position:absolute; ${css} width:${size}px; height:${size}px;
        font: bold ${Math.round(size * 0.42)}px ui-monospace, monospace; color:${ui().panel.ink};
        pointer-events:auto; touch-action:none; opacity:0.88; padding:0;`
      this.root.appendChild(b)
      return b
    }
    const hold = (b: HTMLButtonElement, action: string) => {
      const set = (on: boolean) => (e: Event) => { e.preventDefault(); this.input.hold(action, on) }
      b.addEventListener('pointerdown', set(true))
      for (const end of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(end, set(false))
    }
    const tap = (b: HTMLButtonElement, act: () => void) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); act() })
    }

    hold(button('◀', 'left:18px;bottom:22px;'), 'left')
    hold(button('▶', 'left:98px;bottom:22px;'), 'right')
    tap(button('▲', 'right:18px;bottom:102px;'), () => this.input.tap('sailUp'))
    tap(button('▼', 'right:18px;bottom:22px;'), () => this.input.tap('sailDown'))
    tap(button('+', 'right:98px;bottom:102px;', 46), () => this.input.zoomStep(1))
    tap(button('−', 'right:98px;bottom:22px;', 46), () => this.input.zoomStep(-1))
    tap(button('Ⅱ', 'left:50%;margin-left:-23px;bottom:22px;', 46), () => this.input.tap('pause'))

    // The first touch anywhere brings them up. A tap on the sea itself also
    // answers the end card, which otherwise asks for a key nobody has.
    window.addEventListener('touchstart', () => { this.shown = true; this.apply() }, { passive: true })
    canvas.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') this.input.tap('confirm') })
  }

  /** Hidden while a menu is up, so they never sit on top of a card. */
  set visible(on: boolean) {
    if (on === this.wanted) return
    this.wanted = on
    this.apply()
  }

  private apply() {
    this.root.style.display = this.shown && this.wanted ? 'block' : 'none'
  }
}
