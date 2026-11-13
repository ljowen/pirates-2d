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

  private readonly port: HTMLButtonElement
  private small: HTMLButtonElement[] = []

  /** True once a finger has touched the screen. The layout changes when it does. */
  get active() { return this.shown }

  constructor(private readonly input: Input, canvas: HTMLElement, onActive: () => void) {
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

    // One row along the foot of the screen: steering under the left thumb,
    // sails under the right, and the small ones inboard of them.
    hold(button('◀', 'left:14px;bottom:16px;'), 'left')
    hold(button('▶', 'left:92px;bottom:16px;'), 'right')
    tap(button('▲', 'right:14px;bottom:16px;'), () => this.input.tap('sailUp'))
    tap(button('▼', 'right:92px;bottom:16px;'), () => this.input.tap('sailDown'))
    const plus = button('+', '', 46)
    const minus = button('−', '', 46)
    const pause = button('Ⅱ', '', 46)
    tap(plus, () => this.input.zoomStep(1))
    tap(minus, () => this.input.zoomStep(-1))
    tap(pause, () => this.input.tap('pause'))
    this.small = [pause, minus, plus]

    // Shown only while paused: the one thing the pause screen offers that
    // has no button of its own.
    this.port = document.createElement('button')
    this.port.textContent = 'Give up and make port'
    this.port.style.cssText = `${cardCss()} position:absolute; left:50%; transform:translateX(-50%); bottom:96px;
      font: bold 15px ui-monospace, monospace; color:${ui().panel.ink}; padding:10px 18px;
      pointer-events:auto; touch-action:none; display:none; white-space:nowrap;`
    this.port.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.tap('reset') })
    this.root.appendChild(this.port)
    this.narrow = false

    // The first touch anywhere brings them up. A tap on the sea itself also
    // answers the end card, which otherwise asks for a key nobody has.
    window.addEventListener('touchstart', () => {
      if (this.shown) return
      this.shown = true
      this.apply()
      onActive()
    }, { passive: true })
    canvas.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') this.input.tap('confirm') })
  }

  /**
   * Where the three small buttons go. On a wide screen they sit in the row,
   * inboard of the big ones; on a narrow one there is no room for that, so
   * they take a second row above.
   */
  set narrow(on: boolean) {
    const [pause, minus, plus] = this.small
    const place = (b: HTMLButtonElement, side: 'left' | 'right', px: number, bottom: number) => {
      b.style.left = b.style.right = ''
      b.style[side] = `${px}px`
      b.style.bottom = `${bottom}px`
    }
    if (on) {
      place(pause, 'left', 14, 98)
      place(minus, 'right', 68, 98)
      place(plus, 'right', 14, 98)
    } else {
      place(pause, 'left', 172, 16)
      place(minus, 'right', 226, 16)
      place(plus, 'right', 172, 16)
    }
    this.port.style.bottom = on ? '160px' : '96px'
  }

  /** While paused, the way back to port is offered. */
  set paused(on: boolean) {
    this.port.style.display = on ? 'block' : 'none'
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
