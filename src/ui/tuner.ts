import { T, TUNING_SCHEMA, DEFAULT_TUNING, resetTuning, type TuningValues } from '../sim/tuning'
import type { World } from '../sim/world'
import { UPGRADES, type Upgrade } from '../sim/upgrades'
import { clamp } from '../core/math'

const STORAGE_KEY = 'pirates2d.tuning.v2'

/**
 * Live tuning panel (backtick to toggle). Sliders are generated from the
 * schema, and the polar curve gets a dedicated editor with draggable control
 * points — the curve is the most important thing to tune and the hardest to
 * get right by typing numbers at it.
 *
 * Everything persists to localStorage, and Copy JSON pulls a preset out so a
 * good feel can be committed to the defaults.
 */
export class Tuner {
  private readonly root: HTMLDivElement
  private readonly launcher: HTMLDivElement
  private readonly sliders = new Map<string, { input: HTMLInputElement; readout: HTMLSpanElement }>()
  private curveCanvas!: HTMLCanvasElement
  private dragIndex = -1
  private visible = false
  /**
   * Only parameters you have actually moved get persisted. Everything else
   * follows the code defaults, so changing a default in tuning.ts still takes
   * effect for someone who has a saved preset — otherwise a stale localStorage
   * entry silently pins every value and code changes appear to do nothing.
   */
  private readonly dirty = new Set<keyof TuningValues>()
  private polarDirty = false

  private readonly polar
  private benchRows: (() => void)[] = []

  constructor(private readonly world: World) {
    this.polar = world.polar
    this.root = document.createElement('div')
    this.root.style.cssText = `
      position: fixed; top: 0; right: 0; width: 340px; height: 100vh;
      overflow-y: auto; background: rgba(6,18,30,0.95); color: #cfe6f5;
      font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
      border-left: 1px solid rgba(159,232,255,0.25); padding: 12px 14px 60px;
      box-sizing: border-box; display: none; z-index: 10;
      backdrop-filter: blur(6px);
    `
    document.body.appendChild(this.root)

    // A keyboard shortcut nobody can see is a shortcut nobody uses, so the
    // panel gets a permanent on-screen handle and the key legend sits next
    // to it rather than living only in the README.
    this.launcher = document.createElement('div')
    this.launcher.style.cssText = `
      position: fixed; bottom: 14px; right: 14px; z-index: 11;
      display: flex; align-items: center; gap: 10px;
      font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
      color: rgba(207,230,245,0.65); transition: right 0.18s ease;
    `
    const legend = document.createElement('span')
    legend.innerHTML = '&larr;&rarr; steer &middot; &uarr;&darr; sails &middot; E spawn enemy &middot; P pause &middot; T turbo &middot; M mute &middot; R reset &middot; F1 debug'
    const toggle = document.createElement('button')
    toggle.innerHTML = '&#9881; Tune <span style="opacity:0.55">(`)</span>'
    toggle.style.cssText = `
      background: rgba(6,18,30,0.92); color: #9fe8ff;
      border: 1px solid rgba(159,232,255,0.4); border-radius: 4px;
      padding: 6px 11px; cursor: pointer; font: inherit; white-space: nowrap;
    `
    toggle.onclick = () => this.toggle()
    this.launcher.append(legend, toggle)
    document.body.appendChild(this.launcher)

    this.buildHeader()
    this.buildBench()
    this.buildCurveEditor()
    this.buildSliders()
    this.load()
  }

  toggle() {
    this.visible = !this.visible
    this.root.style.display = this.visible ? 'block' : 'none'
    // Stacks change constantly during play, so refresh on open rather than
    // trying to keep the bench live every frame.
    if (this.visible) this.refreshBench()
    // Step the handle aside so the open panel never covers its own toggle.
    this.launcher.style.right = this.visible ? '354px' : '14px'
  }

  private buildHeader() {
    const h = document.createElement('div')
    h.innerHTML = `<div style="font-size:13px;font-weight:bold;color:#9fe8ff;margin-bottom:2px">SAILING TUNER</div>
      <div style="opacity:0.55;margin-bottom:10px">\` toggles &middot; F1 debug &middot; P pause &middot; T turbo &middot; R reset ship</div>`
    this.root.appendChild(h)

    const bar = document.createElement('div')
    bar.style.cssText = 'display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap'
    bar.appendChild(this.button('Reset all', () => {
      resetTuning()
      this.polar.reset()
      this.dirty.clear()
      this.polarDirty = false
      this.syncFromValues()
      this.drawCurve()
      this.save()
    }))
    bar.appendChild(this.button('Copy JSON', async () => {
      const preset = JSON.stringify({ tuning: T, polar: this.polar.toJSON() }, null, 2)
      await navigator.clipboard.writeText(preset)
    }))
    this.root.appendChild(bar)
  }

  /**
   * The refit bench: grant or strip any upgrade mid-run, so a card can be felt
   * rather than reasoned about. Changes rebuild the player's modifiers from
   * scratch, which is the only correct way to remove a multiplicative stack.
   */
  private buildBench() {
    const label = document.createElement('div')
    label.textContent = 'REFIT BENCH — grant upgrades'
    label.style.cssText = 'color:#9fe8ff;opacity:0.8;margin:6px 0 4px;letter-spacing:0.5px'
    this.root.appendChild(label)

    const bar = document.createElement('div')
    bar.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap'
    bar.appendChild(this.button('All +1', () => this.bulk(() => 1)))
    bar.appendChild(this.button('Max all', () => this.bulk((u) => u.maxStacks)))
    bar.appendChild(this.button('Strip', () => this.bulk(() => 0)))
    bar.appendChild(this.button('Level up', () => {
      // Enough plunder to trip the next draft immediately.
      this.world.run.collect(this.world.run.plunderNeeded - this.world.run.plunder + 0.01)
    }))
    this.root.appendChild(bar)

    const note = document.createElement('div')
    note.textContent =
      'The bench ignores shot exclusivity so types can be compared directly — but ' +
      'opposing types cancel, and holding one still locks the draft.'
    note.style.cssText = 'opacity:0.45;margin:0 0 6px;line-height:1.4'
    this.root.appendChild(note)

    // Live damage split: the thing you actually want to see when tuning shot,
    // since the three types trade against each other rather than adding.
    const split = document.createElement('div')
    split.style.cssText =
      'margin:0 0 10px;padding:5px 7px;border:1px solid rgba(159,232,255,0.18);' +
      'border-radius:4px;display:flex;gap:10px;justify-content:space-between'
    this.root.appendChild(split)
    this.benchRows.push(() => {
      const m = this.world.player.mods
      const h = 0.62 * m.shotHull
      const r = 0.24 * m.shotSails
      const c = 0.14 * m.shotCrew
      const total = h + r + c
      const pct = (v: number) => `${Math.round((100 * v) / total)}%`
      split.innerHTML =
        `<span style="opacity:0.55">shot lands</span>` +
        `<span style="color:#ff7a6b">hull ${pct(h)}</span>` +
        `<span style="color:#9fe8ff">rig ${pct(r)}</span>` +
        `<span style="color:#ffd98a">crew ${pct(c)}</span>`
    })

    const groups = [...new Set(UPGRADES.map((u) => u.group))]
    for (const group of groups) {
      const head = document.createElement('div')
      head.textContent = group.toUpperCase()
      head.style.cssText = 'color:#9fe8ff;opacity:0.55;margin:8px 0 3px;font-size:10px'
      this.root.appendChild(head)

      for (const upgrade of UPGRADES.filter((u) => u.group === group)) {
        this.root.appendChild(this.benchRow(upgrade))
      }
    }

    const spacer = document.createElement('div')
    spacer.style.height = '14px'
    this.root.appendChild(spacer)
  }

  private benchRow(upgrade: Upgrade): HTMLDivElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px'

    const name = document.createElement('span')
    name.textContent = upgrade.name
    name.title = upgrade.text
    name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'

    const count = document.createElement('span')
    count.style.cssText = 'color:#ffd98a;min-width:30px;text-align:right'

    const step = (delta: number) => {
      const taken = this.world.run.taken
      const next = clamp((taken.get(upgrade.id) ?? 0) + delta, 0, upgrade.maxStacks)
      if (next === 0) taken.delete(upgrade.id)
      else taken.set(upgrade.id, next)
      this.world.rebuildPlayerMods()
      this.refreshBench()
    }

    const minus = this.button('−', () => step(-1))
    const plus = this.button('+', () => step(1))
    for (const b of [minus, plus]) b.style.padding = '1px 7px'

    row.append(name, count, minus, plus)
    this.benchRows.push(() => {
      const stacks = this.world.run.taken.get(upgrade.id) ?? 0
      count.textContent = `${stacks}/${upgrade.maxStacks}`
      count.style.color = stacks > 0 ? '#ffd98a' : 'rgba(255,255,255,0.25)'
    })
    return row
  }

  private bulk(stacksFor: (u: Upgrade) => number) {
    const taken = this.world.run.taken
    for (const upgrade of UPGRADES) {
      const n = clamp(stacksFor(upgrade), 0, upgrade.maxStacks)
      if (n === 0) taken.delete(upgrade.id)
      else taken.set(upgrade.id, n)
    }
    this.world.rebuildPlayerMods()
    this.refreshBench()
  }

  private refreshBench() {
    for (const update of this.benchRows) update()
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = `
      background: rgba(159,232,255,0.12); color: #9fe8ff; border: 1px solid rgba(159,232,255,0.35);
      border-radius: 4px; padding: 4px 9px; cursor: pointer; font: inherit;
    `
    b.onclick = onClick
    return b
  }

  // --- Polar curve editor --------------------------------------------------

  private buildCurveEditor() {
    const label = document.createElement('div')
    label.textContent = 'POLAR CURVE — drag points'
    label.style.cssText = 'color:#9fe8ff;opacity:0.8;margin:6px 0 4px;letter-spacing:0.5px'
    this.root.appendChild(label)

    const c = document.createElement('canvas')
    c.width = 312
    c.height = 170
    c.style.cssText = 'width:100%;border:1px solid rgba(159,232,255,0.2);border-radius:4px;cursor:ns-resize;display:block'
    this.curveCanvas = c
    this.root.appendChild(c)

    const hint = document.createElement('div')
    hint.textContent = 'Vertical only — angles stay fixed so the shape stays readable.'
    hint.style.cssText = 'opacity:0.45;margin:4px 0 14px;line-height:1.4'
    this.root.appendChild(hint)

    const pick = (e: PointerEvent) => {
      const rect = c.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * c.width
      const my = ((e.clientY - rect.top) / rect.height) * c.height
      let best = -1
      let bestDist = Infinity
      this.polar.points.forEach((p, i) => {
        const d = Math.hypot(this.cx(p.angle) - mx, this.cy(p.mult) - my)
        if (d < bestDist) { bestDist = d; best = i }
      })
      return bestDist < 26 ? best : -1
    }

    c.addEventListener('pointerdown', (e) => {
      this.dragIndex = pick(e)
      if (this.dragIndex >= 0) c.setPointerCapture(e.pointerId)
    })
    c.addEventListener('pointermove', (e) => {
      if (this.dragIndex < 0) return
      const rect = c.getBoundingClientRect()
      const my = ((e.clientY - rect.top) / rect.height) * c.height
      this.polar.points[this.dragIndex].mult = clamp(this.invY(my), 0, 1.2)
      this.polarDirty = true
      this.drawCurve()
      this.save()
    })
    const end = () => { this.dragIndex = -1 }
    c.addEventListener('pointerup', end)
    c.addEventListener('pointercancel', end)

    this.drawCurve()
  }

  private readonly padL = 30
  private readonly padB = 24
  private readonly padT = 12

  private cx(angleDeg: number) {
    return this.padL + (angleDeg / 180) * (this.curveCanvas.width - this.padL - 12)
  }
  private cy(mult: number) {
    const h = this.curveCanvas.height - this.padB - this.padT
    return this.padT + h - (mult / 1.2) * h
  }
  private invY(y: number) {
    const h = this.curveCanvas.height - this.padB - this.padT
    return ((this.padT + h - y) / h) * 1.2
  }

  private drawCurve() {
    const c = this.curveCanvas
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.fillStyle = 'rgba(8,24,38,0.9)'
    ctx.fillRect(0, 0, c.width, c.height)

    // No-go zone marker.
    ctx.fillStyle = 'rgba(255,90,80,0.12)'
    ctx.fillRect(this.cx(0), this.padT, this.cx(32) - this.cx(0), c.height - this.padB - this.padT)

    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.lineWidth = 1
    ctx.font = '9px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.textAlign = 'center'
    for (const a of [0, 45, 90, 135, 180]) {
      ctx.beginPath()
      ctx.moveTo(this.cx(a), this.padT)
      ctx.lineTo(this.cx(a), c.height - this.padB)
      ctx.stroke()
      ctx.fillText(`${a}°`, this.cx(a), c.height - 8)
    }
    ctx.textAlign = 'right'
    for (const m of [0, 0.5, 1.0]) {
      ctx.beginPath()
      ctx.moveTo(this.padL, this.cy(m))
      ctx.lineTo(c.width - 12, this.cy(m))
      ctx.stroke()
      ctx.fillText(m.toFixed(1), this.padL - 4, this.cy(m) + 3)
    }

    ctx.beginPath()
    for (let a = 0; a <= 180; a += 2) {
      const m = this.polar.sampleDeg(a)
      if (a === 0) ctx.moveTo(this.cx(a), this.cy(m))
      else ctx.lineTo(this.cx(a), this.cy(m))
    }
    ctx.strokeStyle = '#9fe8ff'
    ctx.lineWidth = 2
    ctx.stroke()

    for (const p of this.polar.points) {
      ctx.beginPath()
      ctx.arc(this.cx(p.angle), this.cy(p.mult), 4, 0, Math.PI * 2)
      ctx.fillStyle = '#ffd98a'
      ctx.fill()
    }
  }

  // --- Scalar sliders ------------------------------------------------------

  private buildSliders() {
    let currentGroup = ''
    for (const param of TUNING_SCHEMA) {
      if (param.group !== currentGroup) {
        currentGroup = param.group
        const g = document.createElement('div')
        g.textContent = currentGroup.toUpperCase()
        g.style.cssText = 'color:#9fe8ff;opacity:0.8;margin:14px 0 6px;letter-spacing:0.5px'
        this.root.appendChild(g)
      }

      const row = document.createElement('div')
      row.style.cssText = 'margin-bottom:9px'

      const top = document.createElement('div')
      top.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:2px'
      const name = document.createElement('span')
      name.textContent = param.label
      if (param.help) { name.title = param.help; name.style.borderBottom = '1px dotted rgba(207,230,245,0.3)' }
      const readout = document.createElement('span')
      readout.style.color = '#ffd98a'
      top.append(name, readout)

      const input = document.createElement('input')
      input.type = 'range'
      input.min = String(param.min)
      input.max = String(param.max)
      input.step = String(param.step)
      input.value = String(T[param.key])
      input.style.cssText = 'width:100%;accent-color:#9fe8ff;height:14px'
      input.oninput = () => {
        T[param.key] = Number(input.value)
        this.dirty.add(param.key)
        readout.textContent = format(T[param.key])
        this.save()
      }

      readout.textContent = format(T[param.key])
      row.append(top, input)
      this.root.appendChild(row)
      this.sliders.set(param.key, { input, readout })
    }
  }

  private syncFromValues() {
    for (const [key, { input, readout }] of this.sliders) {
      const v = T[key as keyof TuningValues]
      input.value = String(v)
      readout.textContent = format(v)
    }
  }

  // --- Persistence ---------------------------------------------------------

  private save() {
    try {
      const overrides: Partial<TuningValues> = {}
      for (const key of this.dirty) overrides[key] = T[key]
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        overrides,
        polar: this.polarDirty ? this.polar.toJSON() : null,
      }))
    } catch { /* private browsing — tuning just won't persist */ }
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as {
        overrides?: Partial<TuningValues>
        polar?: { angle: number; mult: number }[] | null
      }
      const overrides = data.overrides ?? {}
      Object.assign(T, DEFAULT_TUNING, overrides)
      for (const key of Object.keys(overrides) as (keyof TuningValues)[]) this.dirty.add(key)
      if (data.polar?.length) {
        this.polar.load(data.polar)
        this.polarDirty = true
      }
      this.syncFromValues()
      this.drawCurve()
    } catch { /* corrupt preset — fall back to defaults */ }
  }
}

function format(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 1) return v.toFixed(2)
  return v.toFixed(4)
}
