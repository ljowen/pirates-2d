/**
 * Pirates! Gold control scheme:
 *   Left/Right arrow (or LMB/RMB) — turn
 *   Up/Down arrow                 — raise / lower sails
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

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
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
    // RMB is a steering input here, so suppress the context menu over the canvas.
    target.addEventListener('contextmenu', (e) => e.preventDefault())
    window.addEventListener('blur', () => {
      this.down.clear()
      this.mouseLeft = this.mouseRight = false
    })
  }

  private normalize(e: KeyboardEvent): string | null {
    switch (e.code) {
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
      case 'Backslash': return 'uiNext'
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

  held(action: string) { return this.down.has(action) }

  /** True once per physical press. Consumed on read. */
  consumePress(action: string): boolean {
    if (!this.pressed.has(action)) return false
    this.pressed.delete(action)
    return true
  }

  endFrame() { this.pressed.clear() }
}
