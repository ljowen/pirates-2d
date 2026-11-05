import { PLAYER_CLASSES, type ShipClass } from '../sim/shipClasses'

/**
 * Choose a hull before putting to sea.
 *
 * The hulls differ in ways that reach into every system already built —
 * draught decides whether the shoals are a refuge or a wall, turn rate
 * decides whether battle sails are worth it, weight of shot decides whether
 * you can afford to stand and fight. So the choice reshapes a run rather
 * than merely reskinning it, and the card says plainly which way each one
 * pushes you.
 */
export class ShipSelect {
  private readonly root: HTMLDivElement
  private onPick: ((cls: ShipClass) => void) | null = null

  constructor() {
    this.root = document.createElement('div')
    this.root.style.cssText = `
      position: fixed; inset: 0; z-index: 30; display: none;
      align-items: center; justify-content: center; flex-direction: column;
      background: rgba(4,14,24,0.9); backdrop-filter: blur(4px);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    `
    document.body.appendChild(this.root)

    window.addEventListener('keydown', (e) => {
      if (!this.onPick) return
      const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code)
      if (index >= 0 && PLAYER_CLASSES[index]) {
        e.preventDefault()
        this.pick(PLAYER_CLASSES[index])
      }
    })
  }

  get open() { return this.onPick !== null }

  show(onPick: (cls: ShipClass) => void) {
    this.onPick = onPick
    this.root.innerHTML = ''
    this.root.style.display = 'flex'

    const heading = document.createElement('div')
    heading.innerHTML = `
      <div style="color:#ffd98a;font-size:13px;letter-spacing:4px;text-align:center">PIRATES</div>
      <div style="color:#cfe6f5;font-size:21px;margin:8px 0 28px;text-align:center">Choose your ship</div>`
    this.root.appendChild(heading)

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;padding:0 20px'
    for (const [i, cls] of PLAYER_CLASSES.entries()) row.appendChild(this.card(cls, i))
    this.root.appendChild(row)

    const hint = document.createElement('div')
    hint.textContent = 'click a ship, or press 1 / 2 / 3 / 4'
    hint.style.cssText = 'color:rgba(207,230,245,0.4);font-size:11px;margin-top:26px'
    this.root.appendChild(hint)
  }

  private card(cls: ShipClass, index: number): HTMLButtonElement {
    const accent = '#' + cls.colors.deck.toString(16).padStart(6, '0')
    const card = document.createElement('button')
    card.style.cssText = `
      width: 236px; cursor: pointer; text-align: left; font: inherit;
      background: rgba(8,24,38,0.95); border: 1px solid ${accent}55;
      border-radius: 8px; padding: 16px; color: #cfe6f5;
      display: flex; flex-direction: column; gap: 10px; transition: all 0.12s ease;
    `
    card.onmouseenter = () => {
      card.style.borderColor = accent
      card.style.transform = 'translateY(-3px)'
      card.style.background = 'rgba(14,38,58,0.98)'
    }
    card.onmouseleave = () => {
      card.style.borderColor = `${accent}55`
      card.style.transform = 'none'
      card.style.background = 'rgba(8,24,38,0.95)'
    }
    card.onclick = () => this.pick(cls)

    // Relative to the Sloop, which is the tuning baseline, so the bars read as
    // "how does this differ from the honest choice".
    const bar = (label: string, value: number, invert = false) => {
      const scaled = Math.max(0, Math.min(1, invert ? 1.6 - value : value / 1.6))
      return `
        <div style="display:flex;align-items:center;gap:7px;font-size:10px">
          <span style="opacity:0.5;width:58px">${label}</span>
          <span style="flex:1;height:5px;background:rgba(255,255,255,0.13);border-radius:3px;overflow:hidden">
            <span style="display:block;height:100%;width:${scaled * 100}%;background:${accent}"></span>
          </span>
        </div>`
    }

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span style="font-size:17px;font-weight:bold;color:#fff">${cls.name}</span>
        <span style="opacity:0.4;font-size:10px">${index + 1}</span>
      </div>
      <div style="font-size:11.5px;line-height:1.55;opacity:0.78;min-height:62px">${cls.blurb ?? ''}</div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:2px">
        ${bar('guns', cls.guns)}
        ${bar('timbers', cls.hullStrength)}
        ${bar('handling', cls.turnRate)}
        ${bar('shallows', cls.draught, true)}
      </div>`
    return card
  }

  private pick(cls: ShipClass) {
    const cb = this.onPick
    this.hide()
    cb?.(cls)
  }

  hide() {
    this.onPick = null
    this.root.style.display = 'none'
  }
}
