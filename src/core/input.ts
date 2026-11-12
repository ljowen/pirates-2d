/**
 * Pirates! Gold control scheme:
 *   Left/Right arrow (or LMB/RMB) — turn
 *   Up/Down arrow                 — raise / lower sails
 *   Mouse wheel, + / -            — zoom in / out
 *   P — pause,  T — turbo,  R — reset,  E — spawn an enemy,  M — mute
 *   F1 — debug overlay,  ` — tuning panel
 *
 * Sail keys are edge-triggered: each press steps one sail state, matching the
 * original rather than ramping continuously while held.
 */
export class Input {
  private readonly down = new Set<string>()
  private readonly pressed = new Set<string>()
  private mouseLeft = false
  private mouseRight = false
  private wheel = 0

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      // Ctrl/Cmd with + and - is the browser's own zoom; leave it alone.
      if (e.ctrlKey || e.metaKey) return
      const k = this.normalize(e)
      if (!k) return
      e.preventDefault()
      this.down.add(k)
      this.pressed.add(k)
    })

    window.addEventListener('keyup', (e) => {
      const k = this.normalize(e)
      if (k) this.down.delete(k)
    })

    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseLeft = true
      if (e.button === 2) this.mouseRight = true
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseLeft = false
      if (e.button === 2) this.mouseRight = false
    })
    // Over the canvas only, so the menus and the tuning panel still scroll.
    target.addEventListener('wheel', (e) => {
      e.preventDefault()
      // Lines and pages (Firefox, some mice) brought to roughly pixels.
      this.wheel += e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1)
    }, { passive: false })
    // RMB is a steering input here, so suppress the context menu over the canvas.
    target.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('blur', () => {
      this.down.clear()
      this.mouseLeft = this.mouseRight = false
    })
  }

  private normalize(e: KeyboardEvent): string | null {
    switch (e.code) {
      case 'Equal': case 'NumpadAdd': return 'zoomIn'
      case 'Minus': case 'NumpadSubtract': return 'zoomOut'
      case 'ArrowLeft': case 'KeyA': return 'left'
      case 'ArrowRight': case 'KeyD': return 'right'
      case 'ArrowUp': case 'KeyW': return 'sailUp'
      case 'ArrowDown': case 'KeyS': return 'sailDown'
      case 'KeyP': return 'pause'
      case 'KeyT': return 'turbo'
      case 'F1': return 'debug'
      case 'Backquote': return 'tuner'
      case 'KeyR': return 'reset'
      case 'KeyE': return 'spawnEnemy'
      case 'KeyQ': return 'spawnSquall'
      case 'BracketRight': return 'styleNext'
      case 'BracketLeft': return 'hullNext'
      case 'KeyM': return 'mute'
      case 'KeyC': return 'continue'
      default: return null
    }
  }

  /** Rudder axis in [-1, 1]; negative is to port. */
  get steer(): number {
    const l = this.down.has('left') || this.mouseLeft
    const r = this.down.has('right') || this.mouseRight
    return (r ? 1 : 0) - (l ? 1 : 0)
  }

  /**
   * How far to zoom this frame, as a factor: above 1 is in. The keys zoom for
   * as long as they are held; the wheel by how far it turned.
   */
  consumeZoom(dt: number): number {
    const keys = (this.down.has('zoomIn') ? 1 : 0) - (this.down.has('zoomOut') ? 1 : 0)
    const wheel = Math.max(-600, Math.min(600, this.wheel))
    this.wheel = 0
    return Math.exp(keys * 1.4 * dt - wheel * 0.0015)
  }

  held(action: string) { return this.down.has(action) }

  /** True once per physical press. Consumed on read. */
  consumePress(action: string): boolean {
    if (!this.pressed.has(action)) return false
    this.pressed.delete(action)
    return true
  }

  endFrame() { this.pressed.clear() }
}
