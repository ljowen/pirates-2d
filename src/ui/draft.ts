import { isCommitting, type Upgrade } from '../sim/upgrades'

const GROUP_COLORS: Record<Upgrade['group'], string> = {
  Sailing: '#9fe8ff',
  Gunnery: '#ffbe6e',
  Shot: '#ff9ad5',
  Quarterdeck: '#7fe0a0',
}

/**
 * The level-up draft. A DOM overlay rather than canvas: three cards that want
 * hover states, keyboard shortcuts and readable body text are simply easier to
 * get right in HTML, and it sits above a paused game.
 */
export class DraftUI {
  private readonly root: HTMLDivElement
  private onPick: ((u: Upgrade | null) => void) | null = null
  private current: Upgrade[] = []

  constructor() {
    this.root = document.createElement('div')
    this.root.style.cssText = `
      position: fixed; inset: 0; z-index: 20; display: none;
      align-items: center; justify-content: center; flex-direction: column;
      background: rgba(4,14,24,0.82); backdrop-filter: blur(3px);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    `
    document.body.appendChild(this.root)

    window.addEventListener('keydown', (e) => {
      if (!this.onPick) return
      const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code)
      if (index >= 0 && this.current[index]) {
        e.preventDefault()
        this.pick(this.current[index])
      } else if (e.code === 'Escape' || e.code === 'Digit0') {
        e.preventDefault()
        this.pick(null)
      }
    })
  }

  get open() { return this.onPick !== null }

  show(
    upgrades: Upgrade[],
    level: number,
    taken: Map<string, number>,
    onPick: (u: Upgrade | null) => void,
  ) {
    this.current = upgrades
    this.onPick = onPick
    this.root.innerHTML = ''
    this.root.style.display = 'flex'

    const heading = document.createElement('div')
    heading.innerHTML = `
      <div style="color:#ffd98a;font-size:13px;letter-spacing:3px;text-align:center">LEVEL ${level}</div>
      <div style="color:#cfe6f5;font-size:20px;margin:6px 0 26px;text-align:center">Choose your advantage</div>`
    this.root.appendChild(heading)

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:18px;flex-wrap:wrap;justify-content:center;padding:0 20px'

    upgrades.forEach((u, i) => {
      const stacks = taken.get(u.id) ?? 0
      const color = GROUP_COLORS[u.group]
      const card = document.createElement('button')
      card.style.cssText = `
        width: 212px; min-height: 190px; cursor: pointer; text-align: left;
        background: rgba(8,24,38,0.95); border: 1px solid ${color}55;
        border-radius: 8px; padding: 16px; color: #cfe6f5; font: inherit;
        display: flex; flex-direction: column; gap: 9px; transition: all 0.12s ease;
      `
      card.onmouseenter = () => {
        card.style.borderColor = color
        card.style.transform = 'translateY(-3px)'
        card.style.background = 'rgba(14,38,58,0.98)'
      }
      card.onmouseleave = () => {
        card.style.borderColor = `${color}55`
        card.style.transform = 'none'
        card.style.background = 'rgba(8,24,38,0.95)'
      }
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
        <div style="font-size:16px;font-weight:bold;color:#fff">${u.name}</div>
        <div style="font-size:12px;line-height:1.55;opacity:0.78">${u.text}</div>
        ${u.cost ? `<div style="font-size:11.5px;line-height:1.5;color:#ff9a8a;opacity:0.85">
            &minus; ${u.cost}
          </div>` : ''}
        <div style="flex:1"></div>
        ${footer}
        <div style="font-size:10px;opacity:0.5">
          ${stacks > 0 ? `owned ${stacks}/${u.maxStacks}` : `up to ${u.maxStacks}`}
        </div>`
      row.appendChild(card)
    })

    this.root.appendChild(row)

    // Refusing is a real option now that every card asks for something.
    const decline = document.createElement('button')
    decline.textContent = 'Sail on — take none of them'
    decline.style.cssText = `
      margin-top: 22px; background: none; color: rgba(207,230,245,0.55);
      border: 1px solid rgba(207,230,245,0.22); border-radius: 5px;
      padding: 7px 15px; cursor: pointer; font: inherit; font-size: 12px;
      transition: all 0.12s ease;
    `
    decline.onmouseenter = () => {
      decline.style.color = '#cfe6f5'
      decline.style.borderColor = 'rgba(207,230,245,0.5)'
    }
    decline.onmouseleave = () => {
      decline.style.color = 'rgba(207,230,245,0.55)'
      decline.style.borderColor = 'rgba(207,230,245,0.22)'
    }
    decline.onclick = () => this.pick(null)
    this.root.appendChild(decline)

    const hint = document.createElement('div')
    hint.textContent =
      `click a card, or press ${upgrades.map((_, i) => i + 1).join(' / ')} — Esc to refuse`
    hint.style.cssText = 'color:rgba(207,230,245,0.4);font-size:11px;margin-top:14px'
    this.root.appendChild(hint)
  }

  private pick(u: Upgrade | null) {
    const cb = this.onPick
    this.hide()
    cb?.(u)
  }

  hide() {
    this.onPick = null
    this.current = []
    this.root.style.display = 'none'
  }
}
