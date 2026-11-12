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
  private rainGain!: GainNode

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

    // Rain: thin and bright, heard only inside a squall.
    this.rainGain = bed('highpass', 3200, 0.4).gain

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
   * @param squall01      how deep in a squall the listener is, 0..1
   */
  updateAmbience(windStrength: number, speed01: number, luff01: number, squall01 = 0) {
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

    this.rainGain.gain.setTargetAtTime(0.05 * clamp(squall01, 0, 1), t, 0.4)
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
   * A broadside: one crash made of several cracks, scattered across the same
   * window the guns themselves use, so what you hear lines up with the smoke
   * you see. They are drawn independently rather than spaced in sequence —
   * the guns go off together, and the scatter is only the hand of each gun
   * captain, not a roll down the ship's side.
   */
  cannon(x: number, y: number, guns: number, scatter = 0.06) {
    if (!this.canPlay(4)) return
    const { gain: dist, pan } = this.spatial(x, y)
    if (dist < 0.05) return
    const ctx = this.ctx!
    const now = ctx.currentTime
    const cracks = clamp(Math.round(guns / 1.5), 1, 6)
    // Overlapping cracks sum where a ripple's did not, so the peak has to come
    // down as the battery grows. The exponent is under a half deliberately: a
    // heavier broadside should still land heavier, just not loud enough to
    // clip the master and turn into mud.
    const peak = (dist * 0.5) / Math.pow(cracks, 0.42)

    for (let i = 0; i < cracks; i++) {
      const t = now + Math.random() * scatter
      // No two guns are charged quite alike either.
      const level = peak * (0.82 + Math.random() * 0.36)

      // Body: a noise burst with the filter sweeping shut.
      const v = this.voice(t, 0.6, pan)
      v.filter.type = 'lowpass'
      v.filter.Q.value = 1.2
      v.filter.frequency.setValueAtTime(2200, t)
      v.filter.frequency.exponentialRampToValueAtTime(140, t + 0.35)
      v.gain.gain.setValueAtTime(0, t)
      v.gain.gain.linearRampToValueAtTime(level, t + 0.006)
      v.gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.5)
    }

    // Sub: the thump you feel more than hear. One for the whole broadside
    // rather than one per crack — six sines at the same pitch inside the same
    // sixtieth of a second add coherently and boom rather than thump, and a
    // volley has one collective punch in any case. It grows with the battery,
    // which is where the weight of a heavy broadside now lives.
    const t0 = now + Math.random() * scatter * 0.5
    const thump = dist * 0.42 * Math.pow(cracks, 0.3)
    const osc = ctx.createOscillator()
    const og = ctx.createGain()
    const op = ctx.createStereoPanner()
    op.pan.value = pan
    osc.type = 'sine'
    osc.frequency.setValueAtTime(110, t0)
    osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.22)
    og.gain.setValueAtTime(0, t0)
    og.gain.linearRampToValueAtTime(thump, t0 + 0.012)
    og.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.4)
    osc.connect(og).connect(op).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + 0.45)
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

  /**
   * A ship going under: a heavy swallow of water rather than a groan.
   *
   * This was originally built around a sawtooth sweeping down to 28 Hz, which
   * read as a dying machine rather than a hull filling. Water has no pitch to
   * fall, so the whole thing is noise now — a broad splash, the sea closing
   * over, and a few bubbles.
   */
  sinking(x: number, y: number) {
    if (!this.canPlay(8)) return
    const { gain: dist, pan } = this.spatial(x, y)
    const ctx = this.ctx!
    const t = ctx.currentTime
    const level = dist * 0.45

    // The splash itself: bright at the moment she goes, settling as it spreads.
    const splash = this.voice(t, 1.9, pan)
    splash.filter.type = 'bandpass'
    splash.filter.Q.value = 0.5
    splash.filter.frequency.setValueAtTime(520, t)
    splash.filter.frequency.exponentialRampToValueAtTime(1700, t + 0.18)
    splash.filter.frequency.exponentialRampToValueAtTime(420, t + 1.6)
    splash.gain.gain.setValueAtTime(0, t)
    splash.gain.gain.linearRampToValueAtTime(level, t + 0.07)
    splash.gain.gain.exponentialRampToValueAtTime(0.0008, t + 1.8)

    // The sea closing over her — soft, low, no pitch movement at all.
    const swell = this.voice(t, 2.4, pan)
    swell.filter.type = 'lowpass'
    swell.filter.frequency.setValueAtTime(320, t)
    swell.gain.gain.setValueAtTime(0, t)
    swell.gain.gain.linearRampToValueAtTime(level * 0.55, t + 0.3)
    swell.gain.gain.exponentialRampToValueAtTime(0.0008, t + 2.3)

    // A last few bubbles breaking the surface.
    for (let i = 0; i < 4; i++) {
      const bt = t + 0.5 + Math.random() * 1.1
      const bubble = this.voice(bt, 0.2, pan)
      bubble.filter.type = 'bandpass'
      bubble.filter.Q.value = 5
      bubble.filter.frequency.setValueAtTime(300 + Math.random() * 500, bt)
      bubble.gain.gain.setValueAtTime(0, bt)
      bubble.gain.gain.linearRampToValueAtTime(level * 0.2, bt + 0.015)
      bubble.gain.gain.exponentialRampToValueAtTime(0.0008, bt + 0.18)
    }
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

  // --- Voices without a place -------------------------------------------------
  // Everything below is about the player's own ship or the menus, so it is not
  // panned or faded by distance.

  /** One oscillator note with a fast attack and an exponential tail. */
  private tone(
    type: OscillatorType, from: number, when: number, dur: number, level: number,
    to = from, lowpass = 0,
  ) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, when)
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, when + dur * 0.8)
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(level, when + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0008, when + dur)
    if (lowpass > 0) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = lowpass
      osc.connect(filter).connect(gain).connect(this.master)
    } else {
      osc.connect(gain).connect(this.master)
    }
    osc.start(when)
    osc.stop(when + dur + 0.05)
  }

  /** A burst of filtered noise. */
  private burst(
    type: BiquadFilterType, from: number, to: number, q: number,
    when: number, dur: number, level: number, attack = 0.005,
  ) {
    const v = this.voice(when, dur + 0.05, 0)
    v.filter.type = type
    v.filter.Q.value = q
    v.filter.frequency.setValueAtTime(from, when)
    if (to !== from) v.filter.frequency.exponentialRampToValueAtTime(to, when + dur * 0.8)
    v.gain.gain.setValueAtTime(0, when)
    v.gain.gain.linearRampToValueAtTime(level, when + attack)
    v.gain.gain.exponentialRampToValueAtTime(0.0008, when + dur)
  }

  /** A struck bell: a few partials that are not quite in tune with each other. */
  private bellAt(pitch: number, when: number, dur: number, level: number) {
    const partials: [number, number, number][] = [[1, 1, 1], [2.0, 0.5, 0.7], [2.76, 0.35, 0.5], [5.4, 0.18, 0.25]]
    for (const [ratio, amp, life] of partials) {
      this.tone('sine', pitch * ratio, when, dur * life, level * amp)
    }
  }

  /** A horn note: a sawtooth with the top taken off. */
  private brass(pitch: number, when: number, dur: number, level: number) {
    this.tone('sawtooth', pitch, when, dur, level, pitch, pitch * 3.2)
  }

  /** The keel striking: one heavy thud. */
  aground() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    this.tone('sine', 85, t, 0.45, 0.55, 34)
    this.burst('lowpass', 420, 160, 0.8, t, 0.35, 0.4)
  }

  /** Timber dragging over sand, repeated for as long as she is stuck. */
  scrape() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    this.burst('bandpass', 380 + Math.random() * 120, 210, 3.5, t, 0.55, 0.3, 0.09)
    this.burst('bandpass', 1500, 900, 1.2, t + 0.05, 0.4, 0.06, 0.08)
  }

  /** A prize taken: a short rising call on the horn. Stands in for a cheer. */
  prize() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    const notes = [392, 523.25, 659.25, 783.99]
    notes.forEach((f, i) => this.brass(f, t + i * 0.11, i === 3 ? 0.7 : 0.16, 0.085))
    this.brass(523.25, t + 0.33, 0.7, 0.05)
  }

  /** An enemy giving up: her canvas coming down, and two falling notes. */
  yielded() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    this.burst('bandpass', 1100, 380, 0.7, t, 0.6, 0.09, 0.1)
    this.tone('triangle', 587.33, t, 0.22, 0.07)
    this.tone('triangle', 440, t + 0.17, 0.4, 0.07)
  }

  /** A coin. `step` climbs through a quick run of them so a haul rings upward. */
  coin(step = 0) {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    const pitch = 1900 * Math.pow(1.0595, Math.min(step, 12) * 2)
    this.tone('sine', pitch, t, 0.16, 0.05)
    this.tone('sine', pitch * 1.5, t + 0.012, 0.11, 0.035)
  }

  /** Level up: two strokes on the ship's bell. */
  bell() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    this.bellAt(880, t, 0.9, 0.11)
    this.bellAt(880, t + 0.26, 1.4, 0.11)
  }

  /** A card taken, a tab turned: a flick of paper. */
  flick() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    this.burst('bandpass', 2600, 1500, 1.4, t, 0.08, 0.1, 0.004)
  }

  /** A hunter or a boss wave called out: two drum strokes and a low horn. */
  alarm() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    for (const at of [0, 0.2]) {
      this.tone('sine', 110, t + at, 0.3, 0.4, 48)
      this.burst('lowpass', 500, 200, 0.7, t + at, 0.16, 0.14)
    }
    this.brass(110, t + 0.42, 1.1, 0.12)
    this.brass(164.81, t + 0.42, 1.1, 0.06)
  }

  /** A battery loaded again: a knock of wood, quiet enough to ignore. */
  reloaded() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    this.tone('triangle', 330, t, 0.07, 0.07, 190)
    this.burst('bandpass', 1800, 1200, 2, t, 0.04, 0.05, 0.002)
  }

  /** The boom coming across as she tacks or gybes. */
  gybe() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    this.burst('bandpass', 900, 1500, 0.8, t, 0.3, 0.07, 0.08)
    this.burst('lowpass', 260, 120, 0.8, t + 0.16, 0.24, 0.2)
  }

  /** One pop of burning timber. Called many times a second while she is ablaze. */
  crackle() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    this.burst('highpass', 2200 + Math.random() * 2500, 2200, 0.5, t, 0.025 + Math.random() * 0.04,
      0.03 + Math.random() * 0.07, 0.002)
  }

  /** Doubloons counted out across a counter. */
  purchase() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.07
      const pitch = 1700 + Math.random() * 500
      this.tone('sine', pitch, at, 0.14, 0.05)
      this.tone('sine', pitch * 1.5, at + 0.01, 0.1, 0.03)
    }
    this.burst('lowpass', 300, 180, 0.8, t + 0.3, 0.12, 0.12)
  }

  /** A refit fitted: two strokes of a mallet. */
  refit() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    for (const at of [0, 0.19]) {
      this.tone('triangle', 210, t + at, 0.1, 0.16, 110)
      this.burst('bandpass', 1400, 900, 1.5, t + at, 0.05, 0.1, 0.002)
    }
  }

  /** Not enough in the purse, or not allowed. */
  refuse() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    this.tone('triangle', 150, t, 0.16, 0.14, 105)
  }

  /** The voyage completed. */
  won() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    const tune: [number, number, number][] = [[523.25, 0, 0.18], [523.25, 0.16, 0.14], [659.25, 0.3, 0.18], [783.99, 0.46, 0.2], [1046.5, 0.66, 1.2]]
    for (const [f, at, dur] of tune) this.brass(f, t + at, dur, 0.08)
    this.brass(659.25, t + 0.66, 1.2, 0.045)
    this.brass(783.99, t + 0.66, 1.2, 0.045)
  }

  /** The player's ship lost: a slow, low bell. */
  lost() {
    if (!this.canPlay(8)) return
    const t = this.ctx!.currentTime
    this.bellAt(196, t + 0.5, 2.6, 0.16)
    this.bellAt(196, t + 1.9, 3.2, 0.13)
  }

  /**
   * Every sound, by name: what the menus ask for by id, and what the tuning
   * panel lists so each can be heard on its own. World sounds are played at
   * the listener, which is as loud as they ever get.
   */
  readonly catalogue: { id: string; label: string; group: string; play: () => void }[] = [
    { group: 'Gunnery', id: 'cannon', label: 'Broadside', play: () => this.cannon(this.listenerX, this.listenerY, 6) },
    { group: 'Gunnery', id: 'cannon-far', label: 'Broadside, distant', play: () => this.cannon(this.listenerX + 700, this.listenerY, 6) },
    { group: 'Gunnery', id: 'hit', label: 'Hit on an enemy', play: () => this.hit(this.listenerX, this.listenerY, false) },
    { group: 'Gunnery', id: 'hit-own', label: 'Hit on your hull', play: () => this.hit(this.listenerX, this.listenerY, true) },
    { group: 'Gunnery', id: 'splash', label: 'Shot falling short', play: () => this.splash(this.listenerX, this.listenerY) },
    { group: 'Gunnery', id: 'reloaded', label: 'Battery reloaded', play: () => this.reloaded() },
    { group: 'Gunnery', id: 'sinking', label: 'Ship sinking', play: () => this.sinking(this.listenerX, this.listenerY) },
    { group: 'Gunnery', id: 'yielded', label: 'Enemy yields', play: () => this.yielded() },
    { group: 'Gunnery', id: 'prize', label: 'Prize taken', play: () => this.prize() },
    { group: 'Ship', id: 'sail-up', label: 'Make sail', play: () => this.sailChange(true) },
    { group: 'Ship', id: 'sail-down', label: 'Shorten sail', play: () => this.sailChange(false) },
    { group: 'Ship', id: 'gybe', label: 'Tack or gybe', play: () => this.gybe() },
    { group: 'Ship', id: 'aground', label: 'Run aground', play: () => this.aground() },
    { group: 'Ship', id: 'scrape', label: 'Scraping, while aground', play: () => this.scrape() },
    { group: 'Ship', id: 'crackle', label: 'Fire, one second', play: () => this.crackleFor(1) },
    { group: 'Ship', id: 'rain', label: 'Squall rain, two seconds', play: () => this.rainFor(2) },
    { group: 'Run', id: 'coin', label: 'Plunder, one piece', play: () => this.coin(0) },
    { group: 'Run', id: 'coins', label: 'Plunder, a run of five', play: () => this.coinRun(5) },
    { group: 'Run', id: 'bell', label: 'Level up', play: () => this.bell() },
    { group: 'Run', id: 'flick', label: 'Card or tab picked', play: () => this.flick() },
    { group: 'Run', id: 'alarm', label: 'Announcement', play: () => this.alarm() },
    { group: 'Run', id: 'won', label: 'Voyage complete', play: () => this.won() },
    { group: 'Run', id: 'lost', label: 'Sunk', play: () => this.lost() },
    { group: 'Port', id: 'purchase', label: 'Hull bought', play: () => this.purchase() },
    { group: 'Port', id: 'refit', label: 'Refit bought', play: () => this.refit() },
    { group: 'Port', id: 'refuse', label: 'Cannot afford', play: () => this.refuse() },
  ]

  /** Play a catalogue sound by id. Unknown ids are ignored. */
  play(id: string) {
    this.resume()
    this.catalogue.find((entry) => entry.id === id)?.play()
  }

  // Auditions for the continuous sounds, which the game drives every frame.
  private crackleFor(seconds: number) {
    for (let i = 0; i < seconds * 14; i++) window.setTimeout(() => this.crackle(), Math.random() * seconds * 1000)
  }
  private coinRun(n: number) {
    for (let i = 0; i < n; i++) window.setTimeout(() => this.coin(i), i * 90)
  }
  private rainFor(seconds: number) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.rainGain.gain.cancelScheduledValues(t)
    this.rainGain.gain.setTargetAtTime(0.05, t, 0.2)
    this.rainGain.gain.setTargetAtTime(0, t + seconds, 0.3)
  }
}
