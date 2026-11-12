import { T, TUNING_SCHEMA, DEFAULT_TUNING, resetTuning, type TuningValues } from '../sim/tuning'
import type { World } from '../sim/world'
import { UPGRADES, type Upgrade } from '../sim/upgrades'
import { clamp } from '../core/math'
import { PLAYER_CLASSES, type ShipClass } from '../sim/shipClasses'
import { MAX_NOTORIETY, notorietyName, REFITS } from '../sim/voyage'
import { freshCareer, owns, priceOf, type Ledger } from '../meta/career'
import { FEATS } from '../meta/feats'
import { P } from '../render/palette'
import { H } from '../render/hullStyle'
import { C, bodyFamily, cardCss, ui } from './theme'

const STORAGE_KEY = 'pirates2d.tuning.v2'
const TAB_KEY = 'pirates2d.tuning.tab'

type TabId = 'career' | 'upgrades' | 'sailing' | 'combat' | 'run' | 'world'

const TABS: { id: TabId; label: string }[] = [
  { id: 'career', label: 'Career' },
  { id: 'upgrades', label: 'Upgrades' },
  { id: 'sailing', label: 'Sailing' },
  { id: 'combat', label: 'Combat' },
  { id: 'run', label: 'Run' },
  { id: 'world', label: 'World' },
]

/** Which tab each schema group's sliders live on. Unlisted groups go to World. */
const TAB_OF_GROUP: Record<string, TabId> = {
  'Steering': 'sailing',
  'Hull & drive': 'sailing',
  'Rigging': 'sailing',
  'Gunnery': 'combat',
  'Enemy captains': 'combat',
  'The run': 'run',
}

/** What the panel needs from the game to edit a career and act on it. */
export interface TunerHooks {
  ledger: Ledger
  /** Put to sea in this hull now, skipping port. */
  sail: (cls: ShipClass) => void
  /** The career was edited; anything showing it should redraw. */
  careerChanged: () => void
}

/**
 * Live tuning panel (backtick to toggle). Sliders are generated from the
 * schema, and the polar curve gets a dedicated editor with draggable control
 * points — the curve is the most important thing to tune and the hardest to
 * get right by typing numbers at it.
 *
 * Everything persists to localStorage, and Copy JSON pulls a preset out so a
 * good feel can be committed to the defaults.
 *
 * Split into tabs, because one long scroll of ninety sliders, a bench and a
 * curve had stopped being something anyone could find a value in. The
 * Career tab is the shortcut through progression: own any hull, set any
 * refit, mark any feat, and put to sea in one click, so an unlock can be
 * tried in the time it takes to want to try it rather than a dozen voyages.
 */
export class Tuner {
  private readonly root: HTMLDivElement
  /** Where the builders are currently appending: one tab's pane. */
  private pane!: HTMLDivElement
  private readonly panes = new Map<TabId, HTMLDivElement>()
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>()
  private careerRows: (() => void)[] = []
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

  constructor(private readonly world: World, private readonly hooks: TunerHooks) {
    this.polar = world.polar
    this.root = document.createElement('div')
    this.root.dataset.tuner = ''
    // Above port and the draft, so the panel can be worked while either is up.
    this.root.style.cssText = `
      position: fixed; top: 0; right: 0; width: 340px; height: 100vh;
      overflow-y: auto; background: rgba(6,18,30,0.95); color: #cfe6f5;
      font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
      border-left: 1px solid rgba(159,232,255,0.25); padding: 12px 14px 60px;
      box-sizing: border-box; display: none; z-index: 40;
      backdrop-filter: blur(6px);
    `
    document.body.appendChild(this.root)

    // A keyboard shortcut nobody can see is a shortcut nobody uses, so the
    // panel gets a permanent on-screen handle and the key legend sits next
    // to it rather than living only in the README.
    this.launcher = document.createElement('div')
    this.launcher.style.cssText = `
      position: fixed; bottom: 14px; right: 14px; z-index: 41;
      display: flex; align-items: center; gap: 10px;
      font: 14px ui-monospace, SFMono-Regular, Menlo, monospace;
      max-width: calc(100vw - 28px); justify-content: flex-end;
      color: rgba(207,230,245,0.65); transition: right 0.18s ease;
    `
    const legend = document.createElement('span')
    // The three look switches name what they switch and what is showing,
    // since a key labelled only "style" says nothing about which style.
    const look = (key: string, what: string, name: string) =>
      `${key} ${what}: <span style="color:${ui().panel.ink};font-weight:bold">${name}</span>`
    // Each key stays on one line with its action, so a wrap never strands one.
    legend.innerHTML = [
      '&larr;&rarr; steer', '&uarr;&darr; sails', 'E spawn enemy', 'Q squall',
      look(']', 'sea', P().name), look('[', 'hull', H().name),
      'P pause', 'T turbo', 'M mute', 'R port', 'F1 debug',
    ].map((item) => `<span style="white-space:nowrap">${item}</span>`).join(' &middot; ')
    const toggle = document.createElement('button')
    toggle.innerHTML = '&#9881; Tune <span style="opacity:0.55">(`)</span>'
    // The strip along the bottom is on screen the whole time, so it is a
    // paper label like every other panel.
    toggle.style.cssText = `${cardCss()} color: ${ui().panel.ink}; padding: 5px 11px; cursor: pointer;
      font: 14px ${bodyFamily()}; white-space: nowrap;`
    toggle.onclick = () => this.toggle()
    // At 14px the legend outgrows a narrow window, so it wraps, right-aligned.
    legend.style.cssText = `${cardCss()} color: ${C('rgba(255,255,255,0.75)')}; padding: 4px 10px;
      font: 14px ${bodyFamily()}; text-align: right; line-height: 1.5;`
    this.launcher.append(legend, toggle)
    document.body.appendChild(this.launcher)

    this.buildHeader()
    this.buildTabs()
    this.pane = this.panes.get('career')!
    this.buildCareer()
    this.pane = this.panes.get('upgrades')!
    this.buildBench()
    this.pane = this.panes.get('sailing')!
    this.buildCurveEditor()
    this.buildSliders()
    this.load()
    let saved: string | null = null
    try { saved = localStorage.getItem(TAB_KEY) } catch { /* no storage */ }
    this.select(TABS.some((t) => t.id === saved) ? saved as TabId : 'career')
  }

  private buildTabs() {
    const bar = document.createElement('div')
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin:0 0 12px'
    for (const t of TABS) {
      const b = document.createElement('button')
      b.textContent = t.label
      b.dataset.tab = t.id
      b.style.cssText = `
        flex: 1 0 30%; font: inherit; cursor: pointer; padding: 5px 0; border-radius: 4px;
        border: 1px solid rgba(159,232,255,0.3); background: transparent; color: #cfe6f5;`
      b.onclick = () => this.select(t.id)
      bar.appendChild(b)
      this.tabButtons.set(t.id, b)

      const pane = document.createElement('div')
      pane.dataset.pane = t.id
      pane.style.display = 'none'
      this.panes.set(t.id, pane)
    }
    this.root.appendChild(bar)
    for (const pane of this.panes.values()) this.root.appendChild(pane)
  }

  private select(id: TabId) {
    for (const [tab, pane] of this.panes) pane.style.display = tab === id ? 'block' : 'none'
    for (const [tab, b] of this.tabButtons) {
      const on = tab === id
      b.style.background = on ? 'rgba(159,232,255,0.18)' : 'transparent'
      b.style.color = on ? '#9fe8ff' : '#cfe6f5'
      b.style.borderColor = on ? '#9fe8ff' : 'rgba(159,232,255,0.3)'
    }
    try { localStorage.setItem(TAB_KEY, id) } catch { /* no storage */ }
    this.refreshBench()
    this.refreshCareer()
    this.root.scrollTop = 0
  }

  /** The key legend is for play; over port or the draft it only covers the cards. */
  set legendVisible(on: boolean) {
    const legend = this.launcher.firstElementChild as HTMLElement | null
    if (legend) legend.style.visibility = on ? 'visible' : 'hidden'
  }

  toggle() {
    this.visible = !this.visible
    this.root.style.display = this.visible ? 'block' : 'none'
    // Stacks change constantly during play, so refresh on open rather than
    // trying to keep the bench live every frame.
    if (this.visible) { this.refreshBench(); this.refreshCareer() }
    // Step the handle aside so the open panel never covers its own toggle.
    this.launcher.style.right = this.visible ? '354px' : '14px'
  }

  private buildHeader() {
    const h = document.createElement('div')
    h.innerHTML = `<div style="font-size:13px;font-weight:bold;color:#9fe8ff;margin-bottom:2px">TUNER</div>
      <div style="opacity:0.55;margin-bottom:10px">\` toggles &middot; F1 debug &middot; P pause &middot; T turbo &middot; R port</div>`
    this.root.appendChild(h)

    const bar = document.createElement('div')
    bar.style.cssText = 'display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap'
    bar.appendChild(this.button('Reset tuning', () => {
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

  // --- Career ---------------------------------------------------------------

  /**
   * Progression, editable. Everything here writes the saved career, the same
   * one port reads, so it is a cheat and is labelled as one. Hulls, refits,
   * feats and notoriety are read when a voyage *starts*; the Sail buttons
   * start one at once so a change can be felt without walking through port.
   */
  private buildCareer() {
    const career = this.hooks.ledger.career
    const changed = () => {
      this.hooks.ledger.commit()
      this.hooks.careerChanged()
      this.refreshCareer()
    }

    const status = document.createElement('div')
    status.style.cssText =
      'margin:0 0 10px;padding:6px 8px;border:1px solid rgba(240,193,75,0.3);border-radius:4px;line-height:1.6'
    this.pane.appendChild(status)
    this.careerRows.push(() => {
      const atSea = this.world.player.cls
      status.innerHTML =
        `<span style="color:#f0c14b">${career.doubloons.toLocaleString()} doubloons</span>` +
        ` <span style="opacity:0.5">· ${career.lifetime.toLocaleString()} lifetime</span><br>` +
        `<span style="opacity:0.7">${career.voyages} voyages · ${career.completed} completed · ` +
        `${career.feats.length}/${FEATS.length} feats</span><br>` +
        `<span style="opacity:0.7">at sea in the <b style="color:#fff">${atSea.name}</b>, notoriety ` +
        `${this.world.voyage.notoriety}</span>`
    })

    const bar = (...buttons: HTMLButtonElement[]) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap'
      row.append(...buttons)
      this.pane.appendChild(row)
    }
    bar(
      this.button('Unlock everything', () => {
        for (const cls of PLAYER_CLASSES) if (!career.hulls.includes(cls.id)) career.hulls.push(cls.id)
        for (const r of REFITS) career.refits[r.id] = r.maxRank
        career.feats = FEATS.map((f) => f.id)
        career.notorietyMax = MAX_NOTORIETY
        changed()
      }),
      this.button('Fresh career', () => {
        if (!confirm('Wipe the saved career and start over?')) return
        Object.assign(career, freshCareer())
        changed()
      }),
    )

    this.section('PURSE')
    bar(
      this.button('+1,000', () => { career.doubloons += 1000; changed() }),
      this.button('+10,000', () => { career.doubloons += 10000; changed() }),
      this.button('Empty', () => { career.doubloons = 0; changed() }),
    )

    this.section('NOTORIETY — next voyage')
    const stepper = (
      label: string, read: () => number, write: (v: number) => void, describe?: (v: number) => string,
    ) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px'
      const name = document.createElement('span')
      name.textContent = label
      name.style.cssText = 'flex:1'
      const value = document.createElement('span')
      value.style.cssText = 'color:#ffd98a;min-width:110px;text-align:right'
      const minus = this.button('−', () => { write(read() - 1); changed() })
      const plus = this.button('+', () => { write(read() + 1); changed() })
      for (const b of [minus, plus]) b.style.padding = '1px 7px'
      row.append(name, value, minus, plus)
      this.pane.appendChild(row)
      this.careerRows.push(() => {
        const v = read()
        value.textContent = describe ? describe(v) : String(v)
      })
    }
    stepper('Sail at', () => career.notoriety, (v) => {
      career.notoriety = clamp(v, 0, MAX_NOTORIETY)
      career.notorietyMax = Math.max(career.notorietyMax, career.notoriety)
    }, (v) => `${v} · ${notorietyName(v)}`)
    stepper('Open to', () => career.notorietyMax, (v) => { career.notorietyMax = clamp(v, 0, MAX_NOTORIETY) })

    this.section('HULLS — Sail starts a voyage now')
    for (const cls of PLAYER_CLASSES) {
      const row = document.createElement('div')
      row.dataset.hull = cls.id
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px'
      const name = document.createElement('span')
      name.textContent = cls.name
      name.title = cls.blurb ?? ''
      name.style.cssText = 'flex:1'
      const own = this.button('', () => {
        const i = career.hulls.indexOf(cls.id)
        if (i >= 0) career.hulls.splice(i, 1)
        else career.hulls.push(cls.id)
        changed()
      })
      own.style.minWidth = '62px'
      // Sailing a hull nobody has bought is allowed: this is the place to try
      // one before deciding whether she is worth her price.
      const sail = this.button('Sail', () => {
        this.hooks.sail(cls)
        this.refreshBench()
        this.refreshCareer()
      })
      row.append(name, own, sail)
      this.pane.appendChild(row)
      this.careerRows.push(() => {
        const free = priceOf(cls) === 0
        own.disabled = free
        own.textContent = free ? 'free' : owns(career, cls) ? 'owned' : 'locked'
        own.style.opacity = free ? '0.4' : '1'
        own.style.color = owns(career, cls) ? '#7fe0a0' : 'rgba(207,230,245,0.55)'
        name.style.color = this.world.player.cls === cls ? '#fff' : ''
        name.style.fontWeight = this.world.player.cls === cls ? 'bold' : ''
      })
    }

    this.section('REFITS — ranks, next voyage')
    bar(
      this.button('All max', () => { for (const r of REFITS) career.refits[r.id] = r.maxRank; changed() }),
      this.button('All 0', () => { for (const r of REFITS) delete career.refits[r.id]; changed() }),
    )
    for (const refit of REFITS) {
      stepper(refit.name, () => career.refits[refit.id] ?? 0, (v) => {
        const rank = clamp(v, 0, refit.maxRank)
        if (rank === 0) delete career.refits[refit.id]
        else career.refits[refit.id] = rank
      }, (v) => `${v}/${refit.maxRank}`)
    }

    this.section('FEATS — open cards and hulls')
    for (const feat of FEATS) {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px'
      const name = document.createElement('span')
      name.textContent = feat.name
      name.title = `${feat.how} → ${feat.opens}`
      name.style.cssText = 'flex:1'
      const toggle = this.button('', () => {
        const i = career.feats.indexOf(feat.id)
        if (i >= 0) career.feats.splice(i, 1)
        else career.feats.push(feat.id)
        changed()
      })
      toggle.style.minWidth = '50px'
      row.append(name, toggle)
      this.pane.appendChild(row)
      this.careerRows.push(() => {
        const done = career.feats.includes(feat.id)
        toggle.textContent = done ? 'done' : '—'
        toggle.style.color = done ? '#7fe0a0' : 'rgba(207,230,245,0.55)'
      })
    }

    const note = document.createElement('div')
    note.textContent =
      'Edits the saved career. Changes apply from the next voyage — use Sail to start one. ' +
      'Feats set here pay no bounty.'
    note.style.cssText = 'opacity:0.45;margin:10px 0 0;line-height:1.4'
    this.pane.appendChild(note)
  }

  private section(text: string) {
    const head = document.createElement('div')
    head.textContent = text
    head.style.cssText = 'color:#9fe8ff;opacity:0.8;margin:12px 0 5px;letter-spacing:0.5px'
    this.pane.appendChild(head)
  }

  private refreshCareer() {
    for (const update of this.careerRows) update()
  }

  /**
   * The refit bench: grant or strip any upgrade mid-run, so a card can be felt
   * rather than reasoned about. Changes rebuild the player's modifiers from
   * scratch, which is the only correct way to remove a multiplicative stack.
   */
  private buildBench() {
    const label = document.createElement('div')
    label.textContent = 'UPGRADES — add cards to the current voyage'
    label.style.cssText = 'color:#9fe8ff;opacity:0.8;margin:6px 0 4px;letter-spacing:0.5px'
    this.pane.appendChild(label)

    const bar = document.createElement('div')
    bar.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap'
    bar.appendChild(this.button('All +1', () => this.bulk(() => 1)))
    bar.appendChild(this.button('Max all', () => this.bulk((u) => u.maxStacks)))
    bar.appendChild(this.button('Strip', () => this.bulk(() => 0)))
    bar.appendChild(this.button('Level up', () => {
      // Enough plunder to trip the next draft immediately.
      this.world.run.collect(this.world.run.plunderNeeded - this.world.run.plunder + 0.01)
    }))
    this.pane.appendChild(bar)

    const note = document.createElement('div')
    note.textContent =
      'Shot types can be mixed here; opposing types cancel out. Holding one still locks the draft.'
    note.style.cssText = 'opacity:0.45;margin:0 0 6px;line-height:1.4'
    this.pane.appendChild(note)

    // Live damage split: the thing you actually want to see when tuning shot,
    // since the three types trade against each other rather than adding.
    const split = document.createElement('div')
    split.style.cssText =
      'margin:0 0 10px;padding:5px 7px;border:1px solid rgba(159,232,255,0.18);' +
      'border-radius:4px;display:flex;gap:10px;justify-content:space-between'
    this.pane.appendChild(split)
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
      this.pane.appendChild(head)

      for (const upgrade of UPGRADES.filter((u) => u.group === group)) {
        this.pane.appendChild(this.benchRow(upgrade))
      }
    }

    const spacer = document.createElement('div')
    spacer.style.height = '14px'
    this.pane.appendChild(spacer)
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
    this.pane.appendChild(label)

    const c = document.createElement('canvas')
    c.width = 312
    c.height = 170
    c.style.cssText = 'width:100%;border:1px solid rgba(159,232,255,0.2);border-radius:4px;cursor:ns-resize;display:block'
    this.curveCanvas = c
    this.pane.appendChild(c)

    const hint = document.createElement('div')
    hint.textContent = 'Drag points up or down.'
    hint.style.cssText = 'opacity:0.45;margin:4px 0 14px;line-height:1.4'
    this.pane.appendChild(hint)

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
        this.pane = this.panes.get(TAB_OF_GROUP[currentGroup] ?? 'world')!
        const g = document.createElement('div')
        g.textContent = currentGroup.toUpperCase()
        g.style.cssText = 'color:#9fe8ff;opacity:0.8;margin:6px 0 6px;letter-spacing:0.5px'
        this.pane.appendChild(g)
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
      this.pane.appendChild(row)
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
