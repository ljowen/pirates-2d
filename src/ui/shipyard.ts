import type { Run } from '../sim/run'
import type { Ship } from '../sim/ship'
import { STATIONS, type Station } from '../sim/crew'
import type { Upgrade } from '../sim/upgrades'

const GROUP_COLORS: Record<Upgrade['group'], string> = {
  Sailing: '#9fe8ff',
  Gunnery: '#ffbe6e',
  Shot: '#ff9ad5',
  Quarterdeck: '#7fe0a0',
}

const STATION_LABEL: Record<Station, string> = {
  gunnery: 'Gunnery',
  sails: 'Sails',
  helm: 'Helm',
  repairs: 'Repairs',
}

/**
 * The shipyard: buy what you actually want, mend her, and tell the crew where
 * to work.
 *
 * Everything here shows the attribute it moves. A deliberate system is only
 * deliberate if you can see what you are choosing between, so each part lists
 * its effect and its price, and the ship's derived figures sit alongside so
 * the consequence is one glance away.
 */
export class ShipyardUI {
  private readonly root: HTMLDivElement
  private run: Run | null = null
  private ship: Ship | null = null
  private onClose: (() => void) | null = null

  constructor() {
    this.root = document.createElement('div')
    this.root.style.cssText = `
      position: fixed; inset: 0; z-index: 25; display: none;
      align-items: center; justify-content: center;
      background: rgba(4,14,24,0.88); backdrop-filter: blur(4px);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #cfe6f5;
    `
    document.body.appendChild(this.root)

    window.addEventListener('keydown', (e) => {
      if (!this.run) return
      if (e.code === 'Escape' || e.code === 'Enter') {
        e.preventDefault()
        this.close()
      }
    })
  }

  get open() { return this.run !== null }

  show(run: Run, ship: Ship, onClose: () => void) {
    this.run = run
    this.ship = ship
    this.onClose = onClose
    this.root.style.display = 'flex'
    this.render()
  }

  private close() {
    const cb = this.onClose
    this.run = null
    this.ship = null
    this.onClose = null
    this.root.style.display = 'none'
    cb?.()
  }

  // --- Derived figures ------------------------------------------------------

  /**
   * What the ship actually does, rather than what her modifiers say. These are
   * the numbers a captain cares about, so they are what the yard displays.
   */
  private attributes(ship: Ship): [string, string][] {
    const m = ship.mods
    const crew = ship.crew
    const gunners = ship.stations.manning('gunnery', crew)
    const helmsmen = ship.stations.manning('helm', crew)
    const guns = Math.max(1, Math.round(6 * ship.cls.guns) + m.extraGuns)
    const laden = (effect: number) => 1 + Math.max(0, m.burden - 1) * effect

    return [
      ['Guns a side', `${guns}`],
      ['Damage', `${(m.damage * ship.cls.damage).toFixed(2)}×`],
      ['Reload', `${(m.reload * ship.cls.reload / gunners).toFixed(2)}×`],
      ['Gun range', `${Math.round(500 * ship.cls.range * m.range)}`],
      ['Accuracy', `${(1 / m.spread).toFixed(2)}×`],
      ['Top speed', `${(ship.cls.thrust * m.thrust / laden(0.4) / (ship.cls.drag * m.drag)).toFixed(2)}×`],
      ['Turn rate', `${(ship.cls.turnRate * m.turnRate * helmsmen / laden(0.3)).toFixed(2)}×`],
      ['Timbers', `${(ship.cls.hullStrength * m.toughness).toFixed(2)}×`],
      ['Draught', ship.draught.toFixed(2)],
      ['Burden', m.burden.toFixed(2)],
    ]
  }

  // --- Rendering ------------------------------------------------------------

  private render() {
    const run = this.run
    const ship = this.ship
    if (!run || !ship) return

    this.root.innerHTML = ''

    const panel = document.createElement('div')
    panel.style.cssText = `
      width: min(1080px, 94vw); max-height: 92vh; overflow-y: auto;
      background: rgba(8,24,38,0.97); border: 1px solid rgba(159,232,255,0.3);
      border-radius: 10px; padding: 22px 26px;
    `
    this.root.appendChild(panel)

    panel.appendChild(this.header(run))

    const columns = document.createElement('div')
    columns.style.cssText = 'display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap'
    columns.appendChild(this.partsColumn(run, ship))
    columns.appendChild(this.sideColumn(run, ship))
    panel.appendChild(columns)

    const castOff = document.createElement('button')
    castOff.textContent = 'Cast off  ·  Esc'
    castOff.style.cssText = `
      margin-top: 20px; width: 100%; background: rgba(159,232,255,0.14);
      color: #9fe8ff; border: 1px solid rgba(159,232,255,0.45);
      border-radius: 6px; padding: 11px; cursor: pointer; font: inherit; font-size: 13px;
    `
    castOff.onclick = () => this.close()
    panel.appendChild(castOff)
  }

  private header(run: Run): HTMLElement {
    const head = document.createElement('div')
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px'
    head.innerHTML = `
      <div>
        <div style="color:#ffd98a;font-size:12px;letter-spacing:3px">SHIPYARD</div>
        <div style="font-size:19px;margin-top:4px">Careen, refit and make good</div>
      </div>
      <div style="font-size:19px;color:#f0c14b">${Math.floor(run.coins)} coin</div>`
    return head
  }

  private partsColumn(run: Run, ship: Ship): HTMLElement {
    const col = document.createElement('div')
    col.style.cssText = 'flex:1 1 560px;min-width:420px'

    const label = document.createElement('div')
    label.textContent = run.stock.length ? 'ON THE SHELF' : 'THIS YARD IS BARE'
    label.style.cssText = 'color:#9fe8ff;opacity:0.7;font-size:10px;letter-spacing:1.5px;margin-bottom:9px'
    col.appendChild(label)

    const grid = document.createElement('div')
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:10px'

    for (const part of run.stock) {
      const price = run.priceOf(part)
      const affordable = run.canAfford(part)
      const owned = run.taken.get(part.id) ?? 0
      const accent = GROUP_COLORS[part.group]

      const card = document.createElement('button')
      card.disabled = !affordable
      card.style.cssText = `
        text-align: left; font: inherit; color: #cfe6f5; padding: 12px;
        background: rgba(10,30,46,0.9); border: 1px solid ${accent}${affordable ? '66' : '22'};
        border-radius: 7px; cursor: ${affordable ? 'pointer' : 'not-allowed'};
        opacity: ${affordable ? 1 : 0.45}; display: flex; flex-direction: column; gap: 6px;
      `
      if (affordable) {
        card.onmouseenter = () => { card.style.borderColor = accent }
        card.onmouseleave = () => { card.style.borderColor = `${accent}66` }
        card.onclick = () => { run.buy(part, ship); this.render() }
      }
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:14px;font-weight:bold;color:#fff">${part.name}</span>
          <span style="color:#f0c14b;font-size:13px">${price}</span>
        </div>
        <div style="font-size:11px;line-height:1.5;opacity:0.8">${part.text}</div>
        ${part.cost ? `<div style="font-size:11px;line-height:1.45;color:#ff9a8a;opacity:0.85">
          &minus; ${part.cost}</div>` : ''}
        <div style="font-size:10px;opacity:0.45">${owned > 0 ? `${owned} fitted` : ''}</div>`
      grid.appendChild(card)
    }
    col.appendChild(grid)
    return col
  }

  private sideColumn(run: Run, ship: Ship): HTMLElement {
    const col = document.createElement('div')
    col.style.cssText = 'flex:0 0 300px;display:flex;flex-direction:column;gap:16px'
    col.appendChild(this.repairBlock(run, ship))
    col.appendChild(this.crewBlock(ship))
    col.appendChild(this.attributeBlock(ship))
    return col
  }

  private repairBlock(run: Run, ship: Ship): HTMLElement {
    const box = document.createElement('div')
    const price = run.repairPrice(ship)
    const needed = price > 0
    const affordable = needed && run.coins >= price

    const bar = (label: string, value: number, color: string) => `
      <div style="display:flex;align-items:center;gap:7px;font-size:10px;margin-bottom:3px">
        <span style="opacity:0.55;width:52px">${label}</span>
        <span style="flex:1;height:6px;background:rgba(255,255,255,0.13);border-radius:3px;overflow:hidden">
          <span style="display:block;height:100%;width:${value * 100}%;background:${color}"></span>
        </span>
      </div>`

    box.innerHTML = `
      <div style="color:#9fe8ff;opacity:0.7;font-size:10px;letter-spacing:1.5px;margin-bottom:9px">CONDITION</div>
      ${bar('Hull', ship.hull, '#ff7a6b')}
      ${bar('Rigging', ship.sails, '#9fe8ff')}
      ${bar('Crew', ship.crew, '#ffd98a')}`

    const button = document.createElement('button')
    button.textContent = needed ? `Make good — ${price} coin` : 'Sound in every respect'
    button.disabled = !affordable
    button.style.cssText = `
      margin-top: 9px; width: 100%; font: inherit; font-size: 12px; padding: 8px;
      border-radius: 5px; cursor: ${affordable ? 'pointer' : 'default'};
      background: ${affordable ? 'rgba(127,224,160,0.14)' : 'rgba(255,255,255,0.05)'};
      color: ${affordable ? '#7fe0a0' : 'rgba(207,230,245,0.4)'};
      border: 1px solid ${affordable ? 'rgba(127,224,160,0.45)' : 'rgba(255,255,255,0.12)'};
    `
    if (affordable) button.onclick = () => { run.repair(ship); this.render() }
    box.appendChild(button)
    return box
  }

  private crewBlock(ship: Ship): HTMLElement {
    const box = document.createElement('div')
    const head = document.createElement('div')
    head.innerHTML = `
      <div style="color:#9fe8ff;opacity:0.7;font-size:10px;letter-spacing:1.5px">CREW STATIONS</div>
      <div style="font-size:10px;opacity:0.45;margin:5px 0 9px;line-height:1.45">
        They take a few seconds to cross the deck, so this can be changed under way too.
      </div>`
    box.appendChild(head)

    for (const station of STATIONS) {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px'

      const name = document.createElement('span')
      name.textContent = STATION_LABEL[station]
      name.style.cssText = 'font-size:11px;opacity:0.7;width:58px'

      const slider = document.createElement('input')
      slider.type = 'range'
      slider.min = '0'
      slider.max = '0.7'
      slider.step = '0.01'
      slider.value = String(ship.stations.target[station])
      slider.style.cssText = 'flex:1;accent-color:#9fe8ff;height:14px'

      const readout = document.createElement('span')
      readout.style.cssText = 'font-size:11px;color:#ffd98a;width:42px;text-align:right'
      const refresh = () => {
        readout.textContent = `${Math.round(ship.stations.target[station] * 100)}%`
      }
      refresh()

      slider.oninput = () => {
        ship.stations.assign(station, Number(slider.value))
        // Everyone else shifts too, so redraw the whole block.
        this.render()
      }

      row.append(name, slider, readout)
      box.appendChild(row)
    }
    return box
  }

  private attributeBlock(ship: Ship): HTMLElement {
    const box = document.createElement('div')
    const rows = this.attributes(ship)
      .map(([k, v]) => `
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
          <span style="opacity:0.55">${k}</span><span style="color:#9fe8ff">${v}</span>
        </div>`).join('')
    box.innerHTML = `
      <div style="color:#9fe8ff;opacity:0.7;font-size:10px;letter-spacing:1.5px;margin-bottom:9px">SHE NOW</div>
      ${rows}`
    return box
  }
}
