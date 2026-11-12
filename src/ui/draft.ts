import { C, bodyFamily, callCss, cardCss, cardHoverCss, displayFamily, headingFamily, isCel, ui } from './theme'
import { isCommitting, type Upgrade } from '../sim/upgrades'
import { describeStats, type Stat, type StatGroup } from '../sim/stats'
import type { Ship } from '../sim/ship'

const GROUP_COLORS: Record<Upgrade['group'], string> = ui().groups

const GROUP_ORDER: StatGroup[] = ['Sailing', 'Gunnery', 'Shot', 'Quarterdeck']

const IMPROVED = C('#7fe0a0')
const WORSENED = C('#ff7a6b')
const M = ui().menu

/**
 * The level-up draft. A DOM overlay rather than canvas: three cards that want
 * hover states, keyboard shortcuts and readable body text are simply easier to
 * get right in HTML, and it sits above a paused game.
 *
 * Under the cards is the ship's own readout — top speed, reload, weight of
 * fire — and pointing at a card runs that readout forward to show what taking
 * it would do. The cards are written in multipliers because that is what an
 * upgrade *is*; the panel is written in knots and seconds because that is what
 * the player is actually choosing between, and "9% less drag" says nothing
 * about whether it beats another gunport.
 */
export class DraftUI {
  private readonly root: HTMLDivElement
  private onPick: ((u: Upgrade) => void) | null = null
  private current: Upgrade[] = []
  private onReroll: (() => void) | null = null

  /** The hull being refitted, kept so a preview can be recomputed on hover. */
  private ship: Ship | null = null
  /** Stats as they stand, before any card is taken. */
  private base: Stat[] = []
  private readonly rows = new Map<string, { row: HTMLDivElement; value: HTMLSpanElement }>()
  private statHeading: HTMLSpanElement | null = null

  constructor() {
    this.root = document.createElement('div')
    this.root.style.cssText = `
      position: fixed; inset: 0; z-index: 20; display: none;
      align-items: center; justify-content: center; flex-direction: column;
      overflow-y: auto; padding: 28px 0;
      background: ${M.backdrop}; ${isCel() ? '' : 'backdrop-filter: blur(3px);'}
      font-family: ${bodyFamily()};
    `
    document.body.appendChild(this.root)

    window.addEventListener('keydown', (e) => {
      if (!this.onPick) return
      if (e.code === 'Digit0' && this.onReroll) {
        e.preventDefault()
        this.onReroll()
        return
      }
      const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code)
      if (index >= 0 && this.current[index]) {
        e.preventDefault()
        this.pick(this.current[index])
      }
    })
  }

  get open() { return this.onPick !== null }

  show(
    upgrades: Upgrade[],
    level: number,
    taken: Map<string, number>,
    player: Ship,
    onPick: (u: Upgrade) => void,
    rerolls = 0,
    onReroll: (() => void) | null = null,
  ) {
    this.current = upgrades
    this.onPick = onPick
    this.onReroll = rerolls > 0 ? onReroll : null
    this.ship = player
    this.base = describeStats(player.cls, player.mods, player.polar)
    this.rows.clear()
    this.root.innerHTML = ''
    this.root.style.display = 'flex'

    const heading = document.createElement('div')
    heading.innerHTML = `
      <div style="color:${M.heading};font-size:${isCel() ? 16 : 13}px;letter-spacing:3px;font-weight:bold;text-align:center;font-family:${displayFamily()}">LEVEL ${level}</div>
      <div style="color:${M.text};font-size:${isCel() ? 32 : 20}px;margin:6px 0 26px;text-align:center;font-family:${headingFamily()}">Choose an upgrade</div>`
    this.root.appendChild(heading)

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:18px;flex-wrap:wrap;justify-content:center;padding:0 20px'
    upgrades.forEach((u, i) => row.appendChild(this.card(u, i, taken)))
    this.root.appendChild(row)

    // A redraw is a second look at the same pool, bought ashore and spent
    // here. Shown only when there is one to spend, so a captain who has not
    // bought the Quartermaster never sees a button that does nothing.
    if (this.onReroll) {
      const again = document.createElement('button')
      again.dataset.reroll = String(rerolls)
      again.textContent = `Redraw this hand  ·  ${rerolls} left  ·  0`
      again.style.cssText = `
        margin-top: 16px; font: inherit; font-size: 13px; cursor: pointer; padding: 7px 16px;
        ${isCel() ? `${callCss()}; border-radius: 4px;`
          : `border-radius: 6px; color: ${M.gold}; border: 1px solid ${M.gold}; background: transparent;`}`
      again.onclick = () => this.onReroll?.()
      this.root.appendChild(again)
    }

    this.root.appendChild(this.statPanel(player))

    const hint = document.createElement('div')
    hint.textContent =
      `click a card, or press ${upgrades.map((_, i) => i + 1).join(' / ')}`
    hint.style.cssText = `color:${M.dim};font-size:12px;margin-top:18px`
    this.root.appendChild(hint)
  }

  private card(u: Upgrade, i: number, taken: Map<string, number>): HTMLButtonElement {
    const stacks = taken.get(u.id) ?? 0
    const color = GROUP_COLORS[u.group]
    const card = document.createElement('button')
    card.style.cssText = `
      width: 212px; min-height: 190px; cursor: pointer; text-align: left;
      ${isCel() ? cardCss() : `background: rgba(8,24,38,0.95); border: 1px solid ${color}55; border-radius: 8px;`}
      padding: 16px; color: ${C('#cfe6f5')}; font: inherit;
      display: flex; flex-direction: column; gap: 9px; transition: all 0.12s ease;
    `
    // Pointing at a card and tabbing to it both mean "what would this do?", so
    // both drive the preview. Keyboard players pick by number, but they still
    // deserve to see the answer before they commit.
    const rest = card.style.boxShadow
    const enter = () => {
      if (isCel()) {
        card.style.transform = 'translate(-2px,-2px)'
        card.style.boxShadow = cardHoverCss()
      } else {
        card.style.borderColor = color
        card.style.transform = 'translateY(-3px)'
        card.style.background = 'rgba(14,38,58,0.98)'
      }
      this.preview(u)
    }
    const leave = () => {
      card.style.transform = 'none'
      if (isCel()) {
        card.style.boxShadow = rest
      } else {
        card.style.borderColor = `${color}55`
        card.style.background = 'rgba(8,24,38,0.95)'
      }
      this.preview(null)
    }
    card.onmouseenter = enter
    card.onfocus = enter
    card.onmouseleave = leave
    card.onblur = leave
    card.onclick = () => this.pick(u)

    // Taking a shot type locks out the others for the rest of the run, so
    // say so plainly rather than letting the player discover it later.
    const commits = isCommitting(u, taken)
    const footer = commits
      ? `<div style="font-size:10px;color:${color};opacity:0.95">
           ⚓ locks your shot type for this run
         </div>`
      : ''

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="color:${color};font-size:10px;letter-spacing:1.5px">${u.group.toUpperCase()}</span>
        <span style="opacity:0.4;font-size:10px">${i + 1}</span>
      </div>
      <div style="font-size:${isCel() ? 21 : 16}px;font-weight:${ui().font.displayWeight};font-family:${displayFamily()};color:${C('#ffffff')}">${u.name}</div>
      <div style="font-size:12px;line-height:1.55;opacity:0.78;flex:1">${u.text}</div>
      ${footer}
      <div style="font-size:10px;opacity:0.5">
        ${stacks > 0 ? `owned ${stacks}/${u.maxStacks}` : `up to ${u.maxStacks}`}
      </div>`
    return card
  }

  /** The ship's own numbers, grouped the same way the cards are. */
  private statPanel(player: Ship): HTMLDivElement {
    const panel = document.createElement('div')
    panel.style.cssText = `
      margin-top: 20px; width: min(920px, calc(100% - 40px));
      ${isCel() ? cardCss() : 'background: rgba(8,24,38,0.82); border: 1px solid rgba(159,232,255,0.18); border-radius: 8px;'}
      padding: 14px 18px 16px; color: ${C('#cfe6f5')};
      display: flex; flex-direction: column; gap: 10px;
    `

    const header = document.createElement('div')
    header.style.cssText =
      'display:flex;justify-content:space-between;align-items:baseline;font-size:10px;letter-spacing:1.5px'
    const title = document.createElement('span')
    title.textContent = `${player.cls.name.toUpperCase()} — CURRENT`
    title.style.cssText = `color:${C('rgba(255,255,255,0.6)')}`
    this.statHeading = title
    const note = document.createElement('span')
    note.textContent = 'hover a card to see the change'
    note.style.cssText = `color:${C('rgba(207,230,245,0.35)')};letter-spacing:0`
    header.append(title, note)
    panel.appendChild(header)

    const columns = document.createElement('div')
    columns.style.cssText =
      'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 22px;align-items:start'

    for (const group of GROUP_ORDER) {
      const stats = this.base.filter((s) => s.group === group)
      if (stats.length === 0) continue

      const column = document.createElement('div')
      column.style.cssText = 'display:flex;flex-direction:column;gap:2px'

      const label = document.createElement('div')
      label.textContent = group.toUpperCase()
      label.style.cssText =
        `color:${GROUP_COLORS[group]};font-size:9.5px;letter-spacing:1.5px;margin-bottom:4px;opacity:0.9`
      column.appendChild(label)

      for (const stat of stats) column.appendChild(this.statRow(stat))
      columns.appendChild(column)
    }
    panel.appendChild(columns)

    const foot = document.createElement('div')
    foot.textContent =
      'Full sail, steady breeze. Repair while furled. Broadside and weight of fire vs a standard hull.'
    foot.style.cssText = `font-size:10.5px;color:${C('rgba(207,230,245,0.5)')};line-height:1.5`
    panel.appendChild(foot)

    return panel
  }

  private statRow(stat: Stat): HTMLDivElement {
    const row = document.createElement('div')
    row.style.cssText = `
      display:flex;justify-content:space-between;align-items:baseline;gap:8px;
      font-size:11px;padding:2px 4px;border-radius:3px;transition:background 0.1s ease;
    `
    const label = document.createElement('span')
    label.textContent = stat.label
    label.style.cssText = `color:${C('rgba(207,230,245,0.5)')};white-space:nowrap`
    const value = document.createElement('span')
    value.textContent = stat.format(stat.value)
    value.style.cssText = `color:${C('rgba(255,255,255,0.88)')};white-space:nowrap`
    row.append(label, value)
    this.rows.set(stat.key, { row, value })
    return row
  }

  /**
   * Run the stats forward through a card without touching the ship. The
   * upgrade is applied to a *copy* of the modifiers, which is the whole reason
   * `apply` was kept to a pure edit of `ShipMods` — a preview is just the same
   * function run somewhere harmless.
   */
  private preview(upgrade: Upgrade | null) {
    if (!this.ship) return

    if (this.statHeading) {
      this.statHeading.textContent = upgrade
        ? `WITH ${upgrade.name.toUpperCase()}`
        : `${this.ship.cls.name.toUpperCase()} — AS SHE STANDS`
      this.statHeading.style.color = upgrade
        ? GROUP_COLORS[upgrade.group]
        : C('rgba(255,255,255,0.6)')
    }

    if (!upgrade) {
      for (const stat of this.base) {
        const row = this.rows.get(stat.key)
        if (!row) continue
        row.value.textContent = stat.format(stat.value)
        row.value.style.color = C('rgba(255,255,255,0.88)')
        row.row.style.background = 'transparent'
      }
      return
    }

    const next = { ...this.ship.mods }
    upgrade.apply(next)
    const after = describeStats(this.ship.cls, next, this.ship.polar)

    after.forEach((stat, i) => {
      const was = this.base[i]
      const row = this.rows.get(stat.key)
      if (!row || !was) return

      const before = stat.format(was.value)
      const now = stat.format(stat.value)
      // A change too small to show in the rendered value is not a change the
      // player can act on, so leave the row alone rather than printing
      // "7.2 kn → 7.2 kn" and calling it information.
      if (before === now) {
        row.value.textContent = now
        row.value.style.color = C('rgba(255,255,255,0.35)')
        row.row.style.background = 'transparent'
        return
      }

      const improved = stat.better === 'higher'
        ? stat.value > was.value
        : stat.better === 'lower' ? stat.value < was.value : null
      const color = improved === null
        ? GROUP_COLORS[upgrade.group]
        : improved ? IMPROVED : WORSENED

      row.value.innerHTML =
        `<span style="color:${C('rgba(255,255,255,0.4)')}">${before}</span>` +
        `<span style="color:${C('rgba(255,255,255,0.3)')}"> → </span>` +
        `<span style="color:${color};font-weight:bold">${now}</span>`
      row.row.style.background = C('rgba(255,255,255,0.07)')
    })
  }

  private pick(u: Upgrade) {
    const cb = this.onPick
    this.hide()
    cb?.(u)
  }

  hide() {
    this.onPick = null
    this.onReroll = null
    this.current = []
    this.ship = null
    this.rows.clear()
    this.statHeading = null
    this.root.style.display = 'none'
  }
}
