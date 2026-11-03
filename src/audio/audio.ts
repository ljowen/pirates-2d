import { clamp } from '../core/math'

/**
 * A small procedural audio engine. Everything is synthesised at runtime from
 * noise and oscillators — there are no sound files to load, which keeps the
 * prototype self-contained and means every sound is a tunable number rather
 * than a fixed asset.
 *
 * Browsers will not start an AudioContext without a user gesture, so the
 * context is created lazily and resumed on the first input.
 */
export class Audio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private noiseBuffer!: AudioBuffer

  /** Listener position, so distant guns are quieter and panned. */
  private listenerX = 0
  private listenerY = 0
  private halfWidth = 600

  muted = false
  masterVolume = 0.7

  /** Voices started this frame, used to stop a broadside becoming a wall of mud. */
  private voicesThisFrame = 0

  // Continuous beds, modulated every frame from the simulation.
  private windGain!: GainNode
  private windFilter!: BiquadFilterNode
  private seaGain!: GainNode
  private seaFilter!: BiquadFilterNode
  private luffGain!: GainNode
  private luffDepth!: GainNode

  get ready() { return this.ctx !== null && this.ctx.state === 'running' }

  /** Safe to call on every input event; only the first does any work. */
  resume() {
    if (!this.ctx) this.init()
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private init() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.masterVolume
    this.master.connect(this.ctx.destination)

    // Two seconds of white noise, reused by every noise-based voice.
    const len = this.ctx.sampleRate * 2
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1

    this.initAmbience()
  }

  /**
   * Three continuous beds, each one driven by a value the player is already
   * steering: wind strength, hull speed, and how badly the sails are drawing.
   * The luffing bed is the useful one — you can hear yourself heading into the
   * no-go zone before you see it on any instrument.
   */
  private initAmbience() {
    const ctx = this.ctx!

    const bed = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = type
      filter.frequency.value = freq
      filter.Q.value = q
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(filter).connect(gain).connect(this.master)
      src.start()
      return { filter, gain }
    }

    const wind = bed('lowpass', 420, 0.9)
    this.windFilter = wind.filter
    this.windGain = wind.gain

    const sea = bed('bandpass', 900, 0.5)
    this.seaFilter = sea.filter
    this.seaGain = sea.gain

    const luff = bed('bandpass', 1400, 1.1)
    this.luffGain = luff.gain

    // Flapping canvas: a tremolo on the luff bed rather than a steady hiss.
    this.luffDepth = ctx.createGain()
    this.luffDepth.gain.value = 0
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 5.5
    lfo.connect(this.luffDepth).connect(this.luffGain.gain)
    lfo.start()
  }

  /**
   * @param windStrength  wind.strength
   * @param speed01       hull speed as a fraction of a good turn of speed
   * @param luff01        how badly the sails are shivering, 0..1
   */
  updateAmbience(windStrength: number, speed01: number, luff01: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const glide = 0.12

    const w = clamp(windStrength, 0, 2)
    this.windGain.gain.setTargetAtTime(0.055 * w, t, glide)
    this.windFilter.frequency.setTargetAtTime(280 + 320 * w, t, glide)

    const s = clamp(speed01, 0, 1.4)
    this.seaGain.gain.setTargetAtTime(0.012 + 0.075 * s, t, glide)
    this.seaFilter.frequency.setTargetAtTime(500 + 1100 * s, t, glide)

    const l = clamp(luff01, 0, 1)
    this.luffGain.gain.setTargetAtTime(0.085 * l, t, glide)
    this.luffDepth.gain.setTargetAtTime(0.07 * l, t, glide)
  }

  setListener(x: number, y: number, halfWidth: number) {
    this.listenerX = x
    this.listenerY = y
    this.halfWidth = Math.max(1, halfWidth)
  }

  beginFrame() {
    this.voicesThisFrame = 0
    if (this.ctx) this.master.gain.value = this.muted ? 0 : this.masterVolume
  }

  /** Distance falloff and stereo placement for a sound happening out in the world. */
  private spatial(x: number, y: number): { gain: number; pan: number } {
    const dx = x - this.listenerX
    const dy = y - this.listenerY
    const dist = Math.hypot(dx, dy)
    return {
      gain: 1 / (1 + (dist / 420) ** 1.6),
      pan: clamp(dx / this.halfWidth, -1, 1),
    }
  }

  /** Builds the common noise → filter → gain → pan chain. */
  private voice(when: number, dur: number, pan: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    // Start at a random offset so repeated shots never sound identical.
    const offset = Math.random() * 1.5
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    src.connect(filter).connect(gain).connect(panner).connect(this.master)
    src.start(when, offset)
    src.stop(when + dur)
    return { ctx, filter, gain }
  }

  private canPlay(limit = 6) {
    if (!this.ctx || this.muted) return false
    if (this.voicesThisFrame >= limit) return false
    this.voicesThisFrame++
    return true
  }

  /**
   * A broadside. Fired as a short ripple rather than one blast — guns were
   * often touched off in sequence, and it reads far better than a single thump.
   */
  cannon(x: number, y: number, guns: number) {
    if (!this.canPlay(4)) return
    const { gain: dist, pan } = this.spatial(x, y)
    if (dist < 0.05) return
    const ctx = this.ctx!
    const now = ctx.currentTime
    const cracks = clamp(Math.round(guns / 2), 1, 4)

    for (let i = 0; i < cracks; i++) {
      const t = now + i * (0.035 + Math.random() * 0.04)
      const level = dist * 0.5 * (1 - i * 0.12)

      // Body: a noise burst with the filter sweeping shut.
      const v = this.voice(t, 0.6, pan)
      v.filter.type = 'lowpass'
      v.filter.Q.value = 1.2
      v.filter.frequency.setValueAtTime(2200, t)
      v.filter.frequency.exponentialRampToValueAtTime(140, t + 0.35)
      v.gain.gain.setValueAtTime(0, t)
      v.gain.gain.linearRampToValueAtTime(level, t + 0.006)
      v.gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.5)

      // Sub: the thump you feel more than hear.
      const osc = ctx.createOscillator()
      const og = ctx.createGain()
      const op = ctx.createStereoPanner()
      op.pan.value = pan
      osc.type = 'sine'
      osc.frequency.setValueAtTime(110, t)
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.22)
      og.gain.setValueAtTime(0, t)
      og.gain.linearRampToValueAtTime(level * 1.1, t + 0.012)
      og.gain.exponentialRampToValueAtTime(0.0008, t + 0.4)
      osc.connect(og).connect(op).connect(this.master)
      osc.start(t)
      osc.stop(t + 0.45)
    }
  }

  /** Shot striking timber: a hard crack with a splintery tail. */
  hit(x: number, y: number, onPlayer: boolean) {
    if (!this.canPlay(3)) return
    const { gain: dist, pan } = this.spatial(x, y)
    if (dist < 0.05) return
    const ctx = this.ctx!
    const t = ctx.currentTime
    const level = dist * (onPlayer ? 0.65 : 0.4)

    const v = this.voice(t, 0.4, pan)
    v.filter.type = 'bandpass'
    v.filter.Q.value = 0.8
    v.filter.frequency.setValueAtTime(onPlayer ? 900 : 1500, t)
    v.filter.frequency.exponentialRampToValueAtTime(260, t + 0.22)
    v.gain.gain.setValueAtTime(0, t)
    v.gain.gain.linearRampToValueAtTime(level, t + 0.004)
    v.gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.33)

    // A low knock so a hit on your own hull lands in the chest.
    if (onPlayer) {
      const osc = ctx.createOscillator()
      const og = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(150, t)
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.18)
      og.gain.setValueAtTime(level * 0.8, t)
      og.gain.exponentialRampToValueAtTime(0.0008, t + 0.3)
      osc.connect(og).connect(this.master)
      osc.start(t)
      osc.stop(t + 0.32)
    }
  }

  /** A ball falling short. */
  splash(x: number, y: number) {
    if (!this.canPlay(2)) return
    const { gain: dist, pan } = this.spatial(x, y)
    if (dist < 0.08) return
    const ctx = this.ctx!
    const t = ctx.currentTime
    const level = dist * 0.22

    const v = this.voice(t, 0.45, pan)
    v.filter.type = 'bandpass'
    v.filter.Q.value = 0.6
    v.filter.frequency.setValueAtTime(700, t)
    v.filter.frequency.exponentialRampToValueAtTime(2600, t + 0.07)
    v.filter.frequency.exponentialRampToValueAtTime(500, t + 0.4)
    v.gain.gain.setValueAtTime(0, t)
    v.gain.gain.linearRampToValueAtTime(level, t + 0.015)
    v.gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.42)
  }

  /** A ship going down: timbers groaning and a long rush of water. */
  sinking(x: number, y: number) {
    if (!this.canPlay(8)) return
    const { gain: dist, pan } = this.spatial(x, y)
    const ctx = this.ctx!
    const t = ctx.currentTime
    const level = dist * 0.5

    const v = this.voice(t, 2.6, pan)
    v.filter.type = 'lowpass'
    v.filter.frequency.setValueAtTime(900, t)
    v.filter.frequency.exponentialRampToValueAtTime(180, t + 2.2)
    v.gain.gain.setValueAtTime(0, t)
    v.gain.gain.linearRampToValueAtTime(level, t + 0.25)
    v.gain.gain.exponentialRampToValueAtTime(0.0008, t + 2.5)

    const osc = ctx.createOscillator()
    const og = ctx.createGain()
    const op = ctx.createStereoPanner()
    op.pan.value = pan
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(90, t)
    osc.frequency.exponentialRampToValueAtTime(28, t + 2.0)
    og.gain.setValueAtTime(0, t)
    og.gain.linearRampToValueAtTime(level * 0.35, t + 0.3)
    og.gain.exponentialRampToValueAtTime(0.0008, t + 2.3)
    osc.connect(og).connect(op).connect(this.master)
    osc.start(t)
    osc.stop(t + 2.4)
  }

  /** Canvas being made or shortened: a soft rush of cloth and rope. */
  sailChange(raising: boolean) {
    if (!this.canPlay(8)) return
    const ctx = this.ctx!
    const t = ctx.currentTime
    const v = this.voice(t, 0.75, 0)
    v.filter.type = 'bandpass'
    v.filter.Q.value = 0.7
    v.filter.frequency.setValueAtTime(raising ? 500 : 900, t)
    v.filter.frequency.exponentialRampToValueAtTime(raising ? 1500 : 380, t + 0.6)
    v.gain.gain.setValueAtTime(0, t)
    v.gain.gain.linearRampToValueAtTime(0.14, t + 0.12)
    v.gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.7)
  }
}
