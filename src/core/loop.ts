/**
 * Fixed-timestep simulation decoupled from rendering.
 *
 * The sim always advances in equal slices so sailing physics stay identical
 * regardless of display refresh rate; render receives an interpolation alpha
 * so motion still looks smooth between steps.
 */
export class GameLoop {
  readonly stepSeconds: number
  private accumulator = 0
  private lastTime = 0
  private running = false
  private rafId = 0

  /** Simulation speed multiplier — turbo mode drives this. */
  timeScale = 1

  constructor(
    private readonly step: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
    hz = 120,
  ) {
    this.stepSeconds = 1 / hz
  }

  start() {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this.rafId = requestAnimationFrame(this.frame)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  private frame = (now: number) => {
    if (!this.running) return
    this.rafId = requestAnimationFrame(this.frame)

    // Clamp so an alt-tab pause doesn't spiral into hundreds of catch-up steps.
    const frameDt = Math.min((now - this.lastTime) / 1000, 0.25)
    this.lastTime = now

    this.accumulator += frameDt * this.timeScale

    let steps = 0
    while (this.accumulator >= this.stepSeconds && steps < 240) {
      this.step(this.stepSeconds)
      this.accumulator -= this.stepSeconds
      steps++
    }

    this.render(this.accumulator / this.stepSeconds, frameDt)
  }
}
