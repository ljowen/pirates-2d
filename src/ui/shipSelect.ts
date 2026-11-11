import { PLAYER_CLASSES, type ShipClass } from '../sim/shipClasses'
import { canAfford, owns, priceOf, type Ledger } from '../meta/career'

/**
 * Choose a hull before putting to sea.
 *
 * The hulls differ in ways that reach into every system already built —
 * draught decides whether the shoals are a refuge or a wall, turn rate
 * decides whether battle sails are worth it, weight of shot decides whether
 * you can afford to stand and fight. So the choice reshapes a run rather
 * than merely reskinning it, and the card says plainly which way each one
 * pushes you.
 *
 * It is also the shipyard. Doubloons banked from earlier voyages are spent
 * here and nowhere else, so the moment of deciding what to sail and the
 * moment of deciding what to buy are the same moment — a hull the captain
 * cannot yet afford sits beside the ones they can, with its price on it,
 * which is the whole of the pitch for one more run.
 */
export class ShipSelect {
  private readonly root: HTMLDivElement
  private onPick: ((cls: ShipClass) => void) | null = null

  constructor(private readonly ledger: Ledger) {
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
      const cls = PLAYER_CLASSES[index]
      if (!cls) return
      e.preventDefault()
      // The same key buys a hull and then sails her, so the yard can be worked
      // without the mouse — but never both on one press: paying for a ship
      // and putting to sea in her are separate decisions.
      if (owns(this.ledger.career, cls)) this.pick(cls)
      else if (this.ledger.buy(cls)) this.render()
    })
  }

  get open() { return this.onPick !== null }

  show(onPick: (cls: ShipClass) => void) {
    this.onPick = onPick
    this.root.style.display = 'flex'
    this.render()
  }

  /** Rebuilt whole after a purchase: four cards are cheaper to redraw than to patch. */
  private render() {
    const career = this.ledger.career
    this.root.innerHTML = ''

    const heading = document.createElement('div')
    const earned = this.ledger.earned
    heading.innerHTML = `
      <div style="color:#ffd98a;font-size:13px;letter-spacing:4px;text-align:center">PIRATES</div>
      <div style="color:#cfe6f5;font-size:21px;margin:8px 0 10px;text-align:center">Choose your ship</div>
      <div data-purse style="color:#f0c14b;font-size:14px;text-align:center">
        ${career.doubloons.toLocaleString()} doubloons${
          earned > 0 ? `<span style="color:#7fe0a0"> &nbsp;+${earned.toLocaleString()} last voyage</span>` : ''}
      </div>
      <div style="color:rgba(207,230,245,0.45);font-size:11px;margin:6px 0 24px;text-align:center">${
        career.voyages === 0
          ? 'Plunder hauled aboard is banked when the voyage ends, and buys new hulls here.'
          : `${career.voyages} voyage${career.voyages === 1 ? '' : 's'} &nbsp;·&nbsp; ${career.completed} completed`
      }</div>`
    this.root.appendChild(heading)

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;padding:0 20px'
    for (const [i, cls] of PLAYER_CLASSES.entries()) row.appendChild(this.card(cls, i))
    this.root.appendChild(row)

    const hint = document.createElement('div')
    hint.textContent = 'click a ship, or press 1 / 2 / 3 / 4 — a locked hull is bought first, then sailed'
    hint.style.cssText = 'color:rgba(207,230,245,0.4);font-size:11px;margin-top:26px'
    this.root.appendChild(hint)
  }

  private card(cls: ShipClass, index: number): HTMLButtonElement {
    const accent = '#' + cls.colors.deck.toString(16).padStart(6, '0')
    const career = this.ledger.career
    const owned = owns(career, cls)
    const affordable = canAfford(career, cls)
    const price = priceOf(cls)
    const card = document.createElement('button')
    card.dataset.hull = cls.id
    card.dataset.state = owned ? 'owned' : affordable ? 'affordable' : 'locked'
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
    card.onclick = () => {
      if (owned) this.pick(cls)
      else if (this.ledger.buy(cls)) this.render()
    }
    // A hull out of reach is dimmed but still fully legible: reading what she
    // does is what makes her worth saving for.
    if (!owned && !affordable) card.style.opacity = '0.62'

    const footer = owned ? '' : `
      <div style="margin-top:6px;padding:7px 9px;border-radius:5px;font-size:11.5px;text-align:center;
        ${affordable
          ? 'background:#f0c14b;color:#1a1204;font-weight:bold'
          : 'background:rgba(255,255,255,0.07);color:rgba(207,230,245,0.75)'}">
        ${affordable
          ? `Buy for ${price.toLocaleString()}`
          : `${price.toLocaleString()} doubloons &nbsp;·&nbsp; ${(price - career.doubloons).toLocaleString()} short`}
      </div>`

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
      </div>${footer}`
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
