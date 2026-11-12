import { icon } from './icons'
import { shipPortrait } from '../render/shipPortrait'
import { PLAYER_CLASSES, type ShipClass } from '../sim/shipClasses'
import {
  difficultyFor, notorietyName, refitCost, REFITS, type Refit,
} from '../sim/voyage'
import { canAfford, chartOf, chartOpen, owns, permitted, priceOf, type Ledger } from '../meta/career'
import { LEVELS, type Level } from '../sim/levels'
import { paintChart } from '../render/minimap'
import { PALETTES } from '../render/palette'
import { SLOOP } from '../sim/shipClasses'
import { FEATS, FEATS_BY_ID } from '../meta/feats'
import {
  C, bodyFamily, callCss, cardPressedCss, keyCss, cardCss, cardHoverCss, cardInk, displayFamily, headingFamily, quietCss, ui,
} from './theme'

type Tab = 'yard' | 'refit' | 'chart' | 'log'
const TABS: { id: Tab; label: string }[] = [
  { id: 'yard', label: 'Shipyard' },
  { id: 'refit', label: 'Refits' },
  { id: 'chart', label: 'Charts' },
  { id: 'log', label: "Captain's log" },
]

// Two sets of ink: the menu's, drawn straight onto the backdrop, and the
// card's, drawn onto paper — dark ink on light.
const M = ui().menu
const GOLD = cardInk('#f0c14b')
const INK = cardInk('#cfe6f5')
const DIM = cardInk('rgba(207,230,245,0.45)')
const GOOD = cardInk('#7fe0a0')
const WHITE = cardInk('#ffffff')
const RED = (a: number) => C('rgb(255,122,107)', a)

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
      background: ${M.backdrop}; 
      font-family: ${bodyFamily()}; color: ${M.text};
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
        this.onSound('flick')
        this.render()
        return
      }
      if (e.code === 'Comma' || e.code === 'Period') {
        e.preventDefault()
        this.ledger.setNotoriety(this.ledger.career.notoriety + (e.code === 'Period' ? 1 : -1))
        this.render()
        return
      }
      if (this.welcoming) {
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.hullAction(SLOOP) }
        return
      }
      // Enter sails the hull last taken out, so going again is one key.
      if (e.code === 'Enter') {
        e.preventDefault()
        const last = PLAYER_CLASSES.find((c) => c.id === this.ledger.career.lastHull)
        if (last && owns(this.ledger.career, last)) this.hullAction(last)
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
        if (refit) this.buyRefit(refit)
      } else if (this.tab === 'chart') {
        const level = LEVELS[index]
        if (level) this.chooseChart(level)
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

  /** Asked for by id; the game points this at the audio engine. */
  onSound: (id: string) => void = () => {}

  private buyRefit(refit: Refit) {
    if (this.ledger.buyRefit(refit)) {
      this.onSound('refit')
      this.render()
    } else {
      this.onSound('refuse')
    }
  }

  private hullAction(cls: ShipClass) {
    if (owns(this.ledger.career, cls)) {
      const cb = this.onSail
      this.hide()
      cb?.(cls)
    } else if (this.ledger.buyHull(cls)) {
      this.onSound('purchase')
      this.render()
    } else {
      this.onSound('refuse')
    }
  }

  /** A captain who has never sailed is shown the welcome, until they sail or ask for the port. */
  private skippedWelcome = false
  private get welcoming(): boolean {
    return this.ledger.career.voyages === 0 && !this.skippedWelcome
  }

  /**
   * The first thing a new player sees: what the game is, the three things
   * about sailing that are not obvious, and one key to be at sea. The port
   * proper, with its seven hulls and their prices, means nothing to someone
   * who has not yet sailed, so it waits until they have.
   */
  private renderWelcome() {
    const key = (k: string) => `<span style="${keyCss()};color:${ui().panel.ink};display:inline-block;padding:1px 8px;margin:0 2px;font-weight:bold">${k}</span>`
    const order = (head: string, body: string) => `
      <div style="display:flex;gap:14px;align-items:baseline;margin:10px 0">
        <span style="color:${ui().rubric};letter-spacing:1.5px;font-size:14px;width:128px;flex:none">${head}</span>
        <span style="font-size:15px;line-height:1.55">${body}</span>
      </div>`
    const sheet = el('div', `${cardCss()} color:${INK}; width:min(640px, calc(100% - 40px)); box-sizing:border-box;
      padding:30px 34px 26px; margin:auto 0; text-align:left`)
    sheet.innerHTML = `
      <div style="text-align:center">
        <div style="font-family:${headingFamily()};font-size:64px;line-height:1;color:${INK}">Pirates</div>
        <div style="font-size:15px;opacity:0.75;margin:10px 0 20px">
          Five minutes of sea, a small ship, and everyone else has more guns than you.
        </div>
      </div>
      ${order('THE WIND', `You cannot sail straight into it. ${key('&larr;')}${key('&rarr;')} steer; keep the wind on your side or behind you.`)}
      ${order('THE SAILS', `${key('&uarr;')} makes sail, ${key('&darr;')} takes it in. With every sail furled you stop, and the crew mends the ship.`)}
      ${order('THE GUNS', 'They fire by themselves. Turn side-on to an enemy and the broadside goes when she is in the arc.')}
      ${order('THE PLUNDER', 'Sail over what a beaten ship leaves behind. It is banked as doubloons even if you sink.')}
      <div style="text-align:center;margin-top:22px">
        <button data-sail style="${callCss()};font:inherit;font-size:17px;font-weight:bold;cursor:pointer;padding:9px 26px;border-radius:5px">
          Set sail &nbsp;${key('Enter')}
        </button>
        <div style="margin-top:14px"><button data-port style="background:none;border:none;font:inherit;font-size:14px;
          color:${INK};opacity:0.6;cursor:pointer;text-decoration:underline">or look round the port first</button></div>
      </div>`
    ;(sheet.querySelector('[data-sail]') as HTMLButtonElement).onclick = () => this.hullAction(SLOOP)
    ;(sheet.querySelector('[data-port]') as HTMLButtonElement).onclick = () => { this.skippedWelcome = true; this.render() }
    this.root.appendChild(sheet)
  }

  private chooseChart(level: Level) {
    if (!chartOpen(this.ledger.career, level)) { this.onSound('refuse'); return }
    this.ledger.setChart(level.id)
    this.onSound('flick')
    this.render()
  }

  /** A location: its chart, what it is like, the best haul there, or what earns it. */
  private chartCard(level: Level, index: number): HTMLButtonElement {
    const career = this.ledger.career
    const open = chartOpen(career, level)
    const chosen = chartOf(career).id === level.id
    const card = cardShell('#f0c14b', open)
    card.dataset.chart = level.id
    card.dataset.state = chosen ? 'chosen' : open ? 'open' : 'locked'
    card.style.width = '216px'
    if (chosen) card.style.outline = `3px solid ${ui().ink.accent}`
    if (!open) card.style.filter = 'saturate(0.4) brightness(0.86)'
    card.onclick = () => this.chooseChart(level)

    const theme = PALETTES.find((p) => p.id === level.theme)?.name ?? ''
    const best = career.best[level.id] ?? 0
    const footer = chosen
      ? `<div style="margin-top:6px;font-size:14px;color:${GOOD};text-align:center;font-weight:bold">sailing here next</div>`
      : open
        ? plate('Sail here', true)
        : plate(`${level.unlock.toLocaleString()} doubloons banked, ever<br>
            <span style="opacity:0.7">${(level.unlock - career.lifetime).toLocaleString()} to go</span>` +
            progress(career.lifetime / level.unlock), false)
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span style="font-size:24px;line-height:1;font-family:${headingFamily()};color:${WHITE}">${level.name}</span>
        <span style="opacity:0.4;font-size:14px">${index + 1}</span>
      </div>
      <div data-chart-art style="border:2px solid ${ui().panel.ink};border-radius:4px;overflow:hidden;height:184px;
        display:flex;align-items:center;justify-content:center;background:#b9cfd0;color:${INK};font-size:14px"></div>
      <div style="font-size:14px;line-height:1.5;opacity:0.78;min-height:63px">${level.blurb}</div>
      <div style="font-size:14px;display:flex;justify-content:space-between;gap:8px">
        <span style="color:${DIM}">${theme}</span>
        <span style="white-space:nowrap">${best > 0 ? `best ${best.toLocaleString()}` : open ? 'new' : ''}</span>
      </div>${footer}`
    const art = card.querySelector('[data-chart-art]') as HTMLElement
    if (level.map) {
      let canvas = chartArt.get(level.id)
      if (!canvas) {
        canvas = paintChart(level.map, level.size, 368)
        chartArt.set(level.id, canvas)
      }
      // A canvas can only be in one place, and the cards are rebuilt on every change.
      const img = document.createElement('img')
      img.src = canvas.toDataURL()
      img.style.cssText = 'width:184px;height:184px;display:block'
      art.appendChild(img)
    } else {
      art.innerHTML = '<span style="opacity:0.6;text-align:center;line-height:1.6">uncharted<br>different every voyage</span>'
    }
    return card
  }

  /** Rebuilt whole after any change: a screenful of cards is cheaper to redraw than to patch. */
  private render() {
    const career = this.ledger.career
    this.root.innerHTML = ''
    if (this.welcoming) { this.renderWelcome(); return }

    const earned = this.ledger.earned
    const head = el('div', 'text-align:center')
    head.innerHTML = `
      <div style="color:${M.heading};font-size:15px;letter-spacing:4px;font-weight:bold;font-family:${displayFamily()}">PIRATES</div>
      <div style="font-size:34px;margin:8px 0 10px;font-family:${headingFamily()}">In port</div>
      <div data-purse style="color:${M.gold};font-size:16px">
        ${career.doubloons.toLocaleString()} doubloons${
          earned > 0 ? `<span style="color:${M.good}"> &nbsp;+${earned.toLocaleString()} last voyage</span>` : ''}
      </div>
      <div style="color:${M.dim};font-size:14px;margin-top:6px">${
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
        font: inherit; font-size: 14px; cursor: pointer; padding: 7px 16px;
        ${active
          // Every tab is the same paper card; the selected one is pressed
          // into the page, which reads as a state rather than a colour.
          ? `${cardPressedCss()} color: ${INK}; font-weight: bold; padding: 6px 16px;`
          : `${cardCss()} color: ${DIM}; padding: 6px 16px;`}`)
      b.dataset.tab = t.id
      b.style.display = 'flex'
      b.style.alignItems = 'center'
      b.style.gap = '7px'
      b.innerHTML = `${icon(t.id, 20)}<span>${t.label}${this.badge(t.id)}</span>`
      b.onclick = () => { this.tab = t.id; this.onSound('flick'); this.render() }
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
    } else if (this.tab === 'chart') {
      for (const [i, level] of LEVELS.entries()) body.appendChild(this.chartCard(level, i))
    } else {
      body.style.flexDirection = 'column'
      body.style.gap = '6px'
      body.style.width = 'min(760px, 100%)'
      for (const feat of FEATS) body.appendChild(this.featRow(feat.id))
    }
    this.root.appendChild(body)

    const hint = el('div', `color:${M.dim};font-size:14px;margin-top:22px;text-align:center;padding:0 20px`)
    hint.textContent = this.tab === 'yard'
      ? 'click or press 1–7 to sail or buy  ·  Tab changes page'
      : this.tab === 'refit'
        ? 'click or press 1–9 to buy a rank  ·  refits apply to every hull  ·  Tab changes page'
        : this.tab === 'chart'
          ? 'click or press 1–5 to choose where to sail  ·  charts are earned by doubloons banked, ever  ·  Tab changes page'
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
    // A chart earned and never yet sailed is worth a nudge too.
    if (tab === 'chart') n = LEVELS.filter((l) => chartOpen(career, l) && !(career.best[l.id] > 0) && chartOf(career).id !== l.id).length
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
      margin-top:14px;display:flex;align-items:center;gap:10px;font-size:14px;color:${INK};
      padding:7px 12px;${cardCss()}`)
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
        font:inherit;width:26px;height:24px;cursor:${ok ? 'pointer' : 'default'};
        ${keyCss(ok)} color:${RED(1)};`)
      b.textContent = glyph
      b.dataset.step = String(delta)
      if (ok) b.onclick = () => { this.ledger.setNotoriety(target); this.render() }
      return b
    }
    const label = el('span', 'min-width:300px;text-align:center')
    label.innerHTML = level === 0
      ? `Notoriety 0 · <b>Unknown</b> <span style="color:${DIM}">— base difficulty</span>`
      : `Notoriety ${level} · <b style="color:${RED(1)}">${notorietyName(level)}</b>
         <span style="color:${DIM}"> — heavier ships sooner, +${d.capBonus} at once, ×${(1 / d.intervalScale).toFixed(1)} as often,</span>
         <span style="color:${GOLD}">pay ×${d.payout.toFixed(1)}</span>`
    box.append(step(-1, '◀'), label, step(1, '▶'))
    const top = el('span', `color:${DIM};font-size:14px`)
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
    // The hull's own colour on the bars: the light deck tone on a dark card,
    // the darker hull tone on paper, so the swatch never vanishes into it.
    const swatch = cls.colors.hull
    const accent = '#' + swatch.toString(16).padStart(6, '0')
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
    if (!owned && !affordable) {
      if (!allowed) {
        // Only a hull the yard will not build yet is faded and drained of
        // colour. One that is merely too dear stays on full paper with its
        // price and how close the purse is: on a new career that is every
        // hull but the Sloop, and fading them all made the yard read as six
        // dead cards instead of six things to save for.
        card.style.opacity = '0.78'
        card.style.filter = 'saturate(0.45)'
      }
    }

    // Relative to the Sloop, which is the tuning baseline, so the bars read as
    // "how does this differ from the honest choice". The scale runs to 2.6 so
    // a ship of the line fits on it without the small hulls vanishing.
    const bar = (label: string, value: number, top: number, invert = false) => {
      const scaled = Math.max(0, Math.min(1, invert ? (top - value) / top : value / top))
      return `
        <div style="display:flex;align-items:center;gap:7px;font-size:14px">
          <span style="color:${DIM};width:74px">${label}</span>
          <span style="flex:1;height:6px;background:${C('rgba(255,255,255,0.13)')};overflow:hidden;border:1px solid ${ui().panel.ink};box-sizing:border-box">
            <span style="display:block;height:100%;width:${scaled * 100}%;background:${accent}"></span>
          </span>
        </div>`
    }

    const feat = cls.requires ? FEATS_BY_ID.get(cls.requires) : undefined
    const footer = owned
      ? (last ? `<div style="margin-top:6px;font-size:14px;color:${DIM};text-align:center">last sailed</div>` : '')
      : !allowed && feat
        ? plate(`Locked. <b style="color:${INK}">${feat.name}</b>: ${feat.how}<br>
            <span style="opacity:0.7">then ${price.toLocaleString()} doubloons</span>`, false)
        : affordable
          ? plate(`Buy for ${price.toLocaleString()}`, true)
          : plate(`${price.toLocaleString()} doubloons &nbsp;·&nbsp; ${(price - career.doubloons).toLocaleString()} short` +
              progress(career.doubloons / price), false)

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span style="font-size:26px;line-height:1;font-family:${headingFamily()};color:${WHITE}">${cls.name}</span>
        <span style="opacity:0.4;font-size:14px">${index + 1}</span>
      </div>${career.names[cls.id]
        ? `<div style="font-size:14px;margin-top:-4px;color:${DIM}">the <i>${career.names[cls.id]}</i></div>` : ''}
      <div style="border:2px solid ${ui().panel.ink};border-radius:4px;overflow:hidden">${shipPortrait(cls, 204, 92)}</div>
      <div style="font-size:14px;line-height:1.55;opacity:0.78;min-height:62px">${cls.blurb ?? ''}</div>
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
    card.style.width = '228px'
    card.onclick = () => this.buyRefit(refit)

    const pips = Array.from({ length: refit.maxRank }, (_, i) =>
      `<span style="display:inline-block;width:14px;height:5px;border-radius:2px;margin-right:3px;
        background:${i < held ? GOOD : C('rgba(255,255,255,0.14)')}"></span>`).join('')

    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;min-height:40px">
        ${icon(refit.id, 40)}
        <span style="flex:1;font-size:18px;line-height:1.2;font-weight:${ui().font.displayWeight};font-family:${displayFamily()};color:${WHITE}">${refit.name}</span>
        <span style="opacity:0.4;font-size:14px;align-self:flex-start">${index < 9 ? index + 1 : ''}</span>
      </div>
      <div>${pips}</div>
      <div style="font-size:14px;line-height:1.5;opacity:0.78;min-height:50px">
        ${refit.text}<span style="opacity:0.55"> &nbsp;Per rank.</span>
      </div>
      ${maxed
        ? `<div style="margin-top:4px;font-size:14px;color:${GOOD};text-align:center">max rank</div>`
        : affordable
          ? plate(`Rank ${held + 1} for ${cost.toLocaleString()}`, true)
          : plate(`rank ${held + 1} · ${cost.toLocaleString()} &nbsp;·&nbsp; ${(cost - career.doubloons).toLocaleString()} short` +
              progress(career.doubloons / cost), false)}`
    return card
  }

  private featRow(id: string): HTMLElement {
    const feat = FEATS_BY_ID.get(id)!
    const done = this.ledger.career.feats.includes(id)
    const row = el('div', `
      display:flex;gap:12px;align-items:baseline;padding:9px 12px;font-size:14px;color:${INK};
      ${cardCss()}`)
    row.dataset.feat = id
    row.dataset.done = String(done)
    row.innerHTML = `
      <span style="width:14px;color:${done ? GOOD : DIM}">${done ? '✓' : '·'}</span>
      <span style="width:150px;font-weight:bold;color:${done ? GOOD : WHITE}">${feat.name}</span>
      <span style="flex:1;line-height:1.5;opacity:${done ? 0.55 : 0.85}">${feat.how}
        <span style="color:${GOLD};opacity:0.85"> &nbsp;→ ${
          feat.opens === 'a bounty'
            ? `${feat.bounty.toLocaleString()} doubloons`
            : `${feat.opens}, ${feat.bounty.toLocaleString()} doubloons`}</span></span>`
    return row
  }
}

/** Each chart, painted once and kept. */
const chartArt = new Map<string, HTMLCanvasElement>()

function el(tag: string, css: string): HTMLElement {
  const node = document.createElement(tag)
  node.style.cssText = css
  return node
}

function cardShell(accent: string, live: boolean): HTMLButtonElement {
  const card = document.createElement('button')
  card.style.cssText = `
    cursor: ${live ? 'pointer' : 'default'}; text-align: left; font: inherit;
    ${cardCss()}
    padding: 14px; color: ${INK};
    display: flex; flex-direction: column; gap: 9px; transition: all 0.12s ease;
  `
  const rest = card.style.boxShadow
  // Lift toward the light: the card moves up-left and its hard shadow grows.
  card.onmouseenter = () => {
    if (!live) return
    card.style.transform = 'translate(-2px,-2px)'
    card.style.boxShadow = cardHoverCss()
  }
  card.onmouseleave = () => {
    card.style.transform = 'none'
    card.style.boxShadow = rest
  }
  return card
}

/** How far the purse is toward a price: a thin inked gauge under the figure. */
function progress(share: number): string {
  const pct = Math.max(0, Math.min(1, share)) * 100
  const edge = `border:1px solid ${ui().panel.ink};box-sizing:border-box;`
  return `<div style="margin:6px auto 1px;width:80%;height:5px;background:${C('rgba(255,255,255,0.13)')};${edge}overflow:hidden">
    <div style="height:100%;width:${pct}%;background:${GOLD}"></div></div>`
}

function plate(html: string, call: boolean): string {
  return `
    <div style="margin-top:6px;padding:7px 9px;border-radius:4px;font-size:14px;text-align:center;line-height:1.5;
      ${call ? callCss() : quietCss()}">${html}</div>`
}
