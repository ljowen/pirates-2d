import { PLAYER_CLASSES, type ShipClass } from '../sim/shipClasses'
import {
  difficultyFor, notorietyName, refitCost, REFITS, type Refit,
} from '../sim/voyage'
import { canAfford, owns, permitted, priceOf, type Ledger } from '../meta/career'
import { FEATS, FEATS_BY_ID } from '../meta/feats'

type Tab = 'yard' | 'refit' | 'log'
const TABS: { id: Tab; label: string }[] = [
  { id: 'yard', label: 'Shipyard' },
  { id: 'refit', label: 'Refits' },
  { id: 'log', label: "Captain's log" },
]

const GOLD = '#f0c14b'
const INK = '#cfe6f5'
const DIM = 'rgba(207,230,245,0.45)'
const GOOD = '#7fe0a0'

/**
 * Port: everything that happens between voyages, on one screen.
 *
 * Choosing a hull, spending the purse and deciding how hard the next voyage
 * will be are the same moment — the one where a captain who has just been
 * sunk decides whether to go again — so they share a screen rather than
 * being a menu to walk. Three tabs:
 *
 *  - **Shipyard** — the hulls. An owned one puts to sea; an affordable one is
 *    bought; one the yard will not yet build says what has to be done first.
 *  - **Refits** — permanent ranks, carried on every hull.
 *  - **Captain's log** — feats done and not done, each naming what it opens.
 *    This is the page that says what to try next.
 *
 * A hull the captain cannot yet have sits beside the ones they can, with its
 * price or its condition on it. That is the whole of the pitch for one more
 * run, and it is why nothing here is ever hidden — only dimmed.
 */
export class PortUI {
  private readonly root: HTMLDivElement
  private onSail: ((cls: ShipClass) => void) | null = null
  private tab: Tab = 'yard'

  constructor(private readonly ledger: Ledger) {
    this.root = document.createElement('div')
    this.root.style.cssText = `
      position: fixed; inset: 0; z-index: 30; display: none;
      align-items: center; flex-direction: column; overflow-y: auto;
      padding: 34px 0 28px; box-sizing: border-box;
      background: rgba(4,14,24,0.92); backdrop-filter: blur(4px);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: ${INK};
    `
    document.body.appendChild(this.root)

    window.addEventListener('keydown', (e) => {
      if (!this.onSail) return
      // Keys pressed while working the tuning panel are the panel's.
      if ((e.target as HTMLElement | null)?.closest?.('[data-tuner]')) return
      if (e.code === 'Tab') {
        e.preventDefault()
        const i = TABS.findIndex((t) => t.id === this.tab)
        this.tab = TABS[(i + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length].id
        this.render()
        return
      }
      if (e.code === 'Comma' || e.code === 'Period') {
        e.preventDefault()
        this.ledger.setNotoriety(this.ledger.career.notoriety + (e.code === 'Period' ? 1 : -1))
        this.render()
        return
      }
      const digit = /^Digit([1-9])$/.exec(e.code)
      if (!digit) return
      e.preventDefault()
      const index = Number(digit[1]) - 1
      if (this.tab === 'yard') {
        const cls = PLAYER_CLASSES[index]
        // The same key buys a hull and then sails her, so the yard can be
        // worked without the mouse — but never both on one press: paying for
        // a ship and putting to sea in her are separate decisions.
        if (cls) this.hullAction(cls)
      } else if (this.tab === 'refit') {
        const refit = REFITS[index]
        if (refit && this.ledger.buyRefit(refit)) this.render()
      }
    })
  }

  get open() { return this.onSail !== null }

  show(onSail: (cls: ShipClass) => void) {
    this.onSail = onSail
    this.tab = 'yard'
    this.root.style.display = 'flex'
    this.root.scrollTop = 0
    this.render()
  }

  /** Redraw if open — the tuning panel edits the career under it. */
  refresh() {
    if (this.onSail) this.render()
  }

  hide() {
    this.onSail = null
    this.root.style.display = 'none'
  }

  private hullAction(cls: ShipClass) {
    if (owns(this.ledger.career, cls)) {
      const cb = this.onSail
      this.hide()
      cb?.(cls)
    } else if (this.ledger.buyHull(cls)) {
      this.render()
    }
  }

  /** Rebuilt whole after any change: a screenful of cards is cheaper to redraw than to patch. */
  private render() {
    const career = this.ledger.career
    this.root.innerHTML = ''

    const earned = this.ledger.earned
    const head = el('div', 'text-align:center')
    head.innerHTML = `
      <div style="color:#ffd98a;font-size:13px;letter-spacing:4px">PIRATES</div>
      <div style="font-size:21px;margin:8px 0 10px">In port</div>
      <div data-purse style="color:${GOLD};font-size:15px">
        ${career.doubloons.toLocaleString()} doubloons${
          earned > 0 ? `<span style="color:${GOOD}"> &nbsp;+${earned.toLocaleString()} last voyage</span>` : ''}
      </div>
      <div style="color:${DIM};font-size:11px;margin-top:6px">${
        career.voyages === 0
          ? 'Plunder is banked as doubloons when a voyage ends, even if you sink.'
          : `${career.voyages} voyage${career.voyages === 1 ? '' : 's'} &nbsp;·&nbsp; ` +
            `${career.completed} completed &nbsp;·&nbsp; ${career.beaten} ship${career.beaten === 1 ? '' : 's'} beaten &nbsp;·&nbsp; ` +
            `${career.feats.length}/${FEATS.length} feats`
      }</div>`
    this.root.appendChild(head)

    this.root.appendChild(this.notoriety())

    const tabs = el('div', 'display:flex;gap:6px;margin:18px 0 18px')
    for (const t of TABS) {
      const active = t.id === this.tab
      const b = el('button', `
        font: inherit; font-size: 12px; cursor: pointer; padding: 7px 16px; border-radius: 6px;
        border: 1px solid ${active ? GOLD : 'rgba(207,230,245,0.2)'};
        background: ${active ? 'rgba(240,193,75,0.14)' : 'transparent'};
        color: ${active ? GOLD : INK};`)
      b.dataset.tab = t.id
      b.textContent = t.label + this.badge(t.id)
      b.onclick = () => { this.tab = t.id; this.render() }
      tabs.appendChild(b)
    }
    this.root.appendChild(tabs)

    const body = el('div', `
      display:flex;gap:14px;flex-wrap:wrap;justify-content:center;
      padding:0 20px;max-width:1180px;box-sizing:border-box`)
    if (this.tab === 'yard') {
      for (const [i, cls] of PLAYER_CLASSES.entries()) body.appendChild(this.hullCard(cls, i))
    } else if (this.tab === 'refit') {
      for (const [i, refit] of REFITS.entries()) body.appendChild(this.refitCard(refit, i))
    } else {
      body.style.flexDirection = 'column'
      body.style.gap = '6px'
      body.style.width = 'min(760px, 100%)'
      for (const feat of FEATS) body.appendChild(this.featRow(feat.id))
    }
    this.root.appendChild(body)

    const hint = el('div', `color:rgba(207,230,245,0.4);font-size:11px;margin-top:22px;text-align:center;padding:0 20px`)
    hint.textContent = this.tab === 'yard'
      ? 'click or press 1–7 to sail or buy  ·  Tab changes page'
      : this.tab === 'refit'
        ? 'click or press 1–9 to buy a rank  ·  refits apply to every hull  ·  Tab changes page'
        : 'Tab changes page'
    this.root.appendChild(hint)
  }

  /** How many things on a page can be bought right now, as a nudge on its tab. */
  private badge(tab: Tab): string {
    const career = this.ledger.career
    let n = 0
    if (tab === 'yard') n = PLAYER_CLASSES.filter((c) => canAfford(career, c)).length
    if (tab === 'refit') {
      n = REFITS.filter((r) => {
        const held = career.refits[r.id] ?? 0
        return held < r.maxRank && career.doubloons >= refitCost(r, held)
      }).length
    }
    return n > 0 ? `  (${n})` : ''
  }

  /**
   * The difficulty the next voyage is sailed at, and what it pays.
   *
   * Shown from the first visit, closed, because knowing there is a ladder is
   * part of wanting to finish a voyage. Stepping down is always allowed: the
   * top rung is where the money is, not a ratchet.
   */
  private notoriety(): HTMLElement {
    const career = this.ledger.career
    const box = el('div', `
      margin-top:14px;display:flex;align-items:center;gap:10px;font-size:12px;
      padding:7px 12px;border-radius:6px;border:1px solid rgba(255,122,107,0.25);
      background:rgba(255,122,107,0.06)`)
    box.dataset.notoriety = String(career.notoriety)

    if (career.notorietyMax === 0) {
      box.innerHTML = `<span style="color:${DIM}">Notoriety: <b style="color:${INK}">Unknown</b>
        &nbsp;·&nbsp; complete a voyage to unlock</span>`
      return box
    }

    const level = career.notoriety
    const d = difficultyFor(level)
    const step = (delta: number, glyph: string) => {
      const target = level + delta
      const ok = target >= 0 && target <= career.notorietyMax
      const b = el('button', `
        font:inherit;width:26px;height:24px;border-radius:4px;cursor:${ok ? 'pointer' : 'default'};
        border:1px solid rgba(255,122,107,${ok ? 0.6 : 0.15});background:transparent;
        color:rgba(255,122,107,${ok ? 1 : 0.25})`)
      b.textContent = glyph
      b.dataset.step = String(delta)
      if (ok) b.onclick = () => { this.ledger.setNotoriety(target); this.render() }
      return b
    }
    const label = el('span', 'min-width:300px;text-align:center')
    label.innerHTML = level === 0
      ? `Notoriety 0 · <b>Unknown</b> <span style="color:${DIM}">— base difficulty</span>`
      : `Notoriety ${level} · <b style="color:#ff9a8a">${notorietyName(level)}</b>
         <span style="color:${DIM}"> — hulls ×${d.enemyArmour.toFixed(2)}, shot ×${d.enemyDamage.toFixed(2)},</span>
         <span style="color:${GOLD}">pay ×${d.payout.toFixed(1)}</span>`
    box.append(step(-1, '◀'), label, step(1, '▶'))
    const top = el('span', `color:${DIM};font-size:10.5px`)
    top.textContent = career.notorietyMax >= 10 && level === 10
      ? 'the top'
      : level === career.notorietyMax
        ? 'complete a voyage here to unlock the next'
        : `unlocked to ${career.notorietyMax}  ·  keys , .`
    box.appendChild(top)
    return box
  }

  private hullCard(cls: ShipClass, index: number): HTMLButtonElement {
    const career = this.ledger.career
    const accent = '#' + cls.colors.deck.toString(16).padStart(6, '0')
    const owned = owns(career, cls)
    const allowed = permitted(career, cls)
    const affordable = canAfford(career, cls)
    const price = priceOf(cls)
    const last = owned && career.lastHull === cls.id

    const card = cardShell(accent, owned || affordable)
    card.dataset.hull = cls.id
    card.dataset.state = owned ? 'owned' : affordable ? 'affordable' : allowed ? 'locked' : 'sealed'
    card.style.width = '236px'
    card.onclick = () => this.hullAction(cls)
    // A hull out of reach is dimmed but still fully legible: reading what she
    // does is what makes her worth saving for.
    if (!owned && !affordable) card.style.opacity = allowed ? '0.66' : '0.5'

    // Relative to the Sloop, which is the tuning baseline, so the bars read as
    // "how does this differ from the honest choice". The scale runs to 2.6 so
    // a ship of the line fits on it without the small hulls vanishing.
    const bar = (label: string, value: number, top: number, invert = false) => {
      const scaled = Math.max(0, Math.min(1, invert ? (top - value) / top : value / top))
      return `
        <div style="display:flex;align-items:center;gap:7px;font-size:10px">
          <span style="opacity:0.5;width:58px">${label}</span>
          <span style="flex:1;height:5px;background:rgba(255,255,255,0.13);border-radius:3px;overflow:hidden">
            <span style="display:block;height:100%;width:${scaled * 100}%;background:${accent}"></span>
          </span>
        </div>`
    }

    const feat = cls.requires ? FEATS_BY_ID.get(cls.requires) : undefined
    const footer = owned
      ? (last ? `<div style="margin-top:6px;font-size:10px;color:${DIM};text-align:center">last sailed</div>` : '')
      : !allowed && feat
        ? plate(`Locked. <b style="color:${INK}">${feat.name}</b>: ${feat.how}<br>
            <span style="opacity:0.7">then ${price.toLocaleString()} doubloons</span>`, false)
        : affordable
          ? plate(`Buy for ${price.toLocaleString()}`, true)
          : plate(`${price.toLocaleString()} doubloons &nbsp;·&nbsp; ${(price - career.doubloons).toLocaleString()} short`, false)

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span style="font-size:17px;font-weight:bold;color:#fff">${cls.name}</span>
        <span style="opacity:0.4;font-size:10px">${index + 1}</span>
      </div>
      <div style="font-size:11.5px;line-height:1.55;opacity:0.78;min-height:62px">${cls.blurb ?? ''}</div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:2px">
        ${bar('guns', cls.guns, 2.1)}
        ${bar('timbers', cls.hullStrength, 2.6)}
        ${bar('handling', cls.turnRate, 1.6)}
        ${bar('shallows', cls.draught, 1.25, true)}
      </div>${footer}`
    return card
  }

  private refitCard(refit: Refit, index: number): HTMLButtonElement {
    const career = this.ledger.career
    const held = career.refits[refit.id] ?? 0
    const maxed = held >= refit.maxRank
    const cost = refitCost(refit, held)
    const affordable = !maxed && career.doubloons >= cost

    const card = cardShell('#7fe0a0', affordable)
    card.dataset.refit = refit.id
    card.dataset.rank = String(held)
    card.dataset.state = maxed ? 'maxed' : affordable ? 'affordable' : 'locked'
    card.style.width = '216px'
    card.onclick = () => { if (this.ledger.buyRefit(refit)) this.render() }

    const pips = Array.from({ length: refit.maxRank }, (_, i) =>
      `<span style="display:inline-block;width:14px;height:5px;border-radius:2px;margin-right:3px;
        background:${i < held ? GOOD : 'rgba(255,255,255,0.14)'}"></span>`).join('')

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span style="font-size:15px;font-weight:bold;color:#fff">${refit.name}</span>
        <span style="opacity:0.4;font-size:10px">${index < 9 ? index + 1 : ''}</span>
      </div>
      <div>${pips}</div>
      <div style="font-size:11.5px;line-height:1.5;opacity:0.78;min-height:50px">
        ${refit.text}<span style="opacity:0.55"> &nbsp;Per rank.</span>
      </div>
      ${maxed
        ? `<div style="margin-top:4px;font-size:11px;color:${GOOD};text-align:center">max rank</div>`
        : affordable
          ? plate(`Rank ${held + 1} for ${cost.toLocaleString()}`, true)
          : plate(`rank ${held + 1} · ${cost.toLocaleString()} &nbsp;·&nbsp; ${(cost - career.doubloons).toLocaleString()} short`, false)}`
    return card
  }

  private featRow(id: string): HTMLElement {
    const feat = FEATS_BY_ID.get(id)!
    const done = this.ledger.career.feats.includes(id)
    const row = el('div', `
      display:flex;gap:12px;align-items:baseline;padding:9px 12px;border-radius:6px;font-size:12px;
      background:rgba(8,24,38,0.9);border:1px solid ${done ? 'rgba(127,224,160,0.35)' : 'rgba(207,230,245,0.12)'}`)
    row.dataset.feat = id
    row.dataset.done = String(done)
    row.innerHTML = `
      <span style="width:14px;color:${done ? GOOD : DIM}">${done ? '✓' : '·'}</span>
      <span style="width:150px;font-weight:bold;color:${done ? GOOD : '#fff'}">${feat.name}</span>
      <span style="flex:1;line-height:1.5;opacity:${done ? 0.55 : 0.85}">${feat.how}
        <span style="color:${GOLD};opacity:0.85"> &nbsp;→ ${
          feat.opens === 'a bounty'
            ? `${feat.bounty.toLocaleString()} doubloons`
            : `${feat.opens}, ${feat.bounty.toLocaleString()} doubloons`}</span></span>`
    return row
  }
}

function el(tag: string, css: string): HTMLElement {
  const node = document.createElement(tag)
  node.style.cssText = css
  return node
}

function cardShell(accent: string, live: boolean): HTMLButtonElement {
  const card = document.createElement('button')
  card.style.cssText = `
    cursor: ${live ? 'pointer' : 'default'}; text-align: left; font: inherit;
    background: rgba(8,24,38,0.95); border: 1px solid ${accent}55;
    border-radius: 8px; padding: 14px; color: ${INK};
    display: flex; flex-direction: column; gap: 9px; transition: all 0.12s ease;
  `
  card.onmouseenter = () => {
    card.style.borderColor = accent
    if (live) card.style.transform = 'translateY(-3px)'
    card.style.background = 'rgba(14,38,58,0.98)'
  }
  card.onmouseleave = () => {
    card.style.borderColor = `${accent}55`
    card.style.transform = 'none'
    card.style.background = 'rgba(8,24,38,0.95)'
  }
  return card
}

function plate(html: string, call: boolean): string {
  return `
    <div style="margin-top:6px;padding:7px 9px;border-radius:5px;font-size:11px;text-align:center;line-height:1.5;
      ${call
        ? `background:${GOLD};color:#1a1204;font-weight:bold`
        : 'background:rgba(255,255,255,0.07);color:rgba(207,230,245,0.75)'}">${html}</div>`
}
