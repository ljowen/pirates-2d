import { CHAT_MAX, type ChatMessage } from '../net/protocol'
import { bodyFamily, cardCss, cardInk, keyCss, ui } from './theme'

const INK = cardInk('#cfe6f5')
const DIM = cardInk('rgba(207,230,245,0.55)')
const SYSTEM = ui().ink.info
const KEEP = 80

/**
 * The open sea's chat: one channel for every signed-in captain, in port or
 * at sea.
 *
 * A small paper card in the bottom-left corner, folded to a single button
 * until it is wanted. Enter (at sea) or / (anywhere) opens it and puts the
 * cursor in the line; Escape puts it away again. Every message is set as
 * text, never as markup.
 */
export class ChatPanel {
  private readonly root: HTMLDivElement
  private readonly log: HTMLDivElement
  private readonly input: HTMLInputElement
  private readonly toggle: HTMLButtonElement
  private open = false
  private unread = 0
  private shown = false
  onSend: (body: string) => void = () => {}

  constructor() {
    this.root = document.createElement('div')
    this.root.style.cssText = `
      position: fixed; left: 12px; bottom: 12px; z-index: 40; display: none;
      flex-direction: column; align-items: flex-start; gap: 6px;
      font-family: ${bodyFamily()}; font-size: 14px; color: ${INK};
      max-width: calc(100vw - 24px);`

    this.log = document.createElement('div')
    this.log.style.cssText = `${cardCss()}; width: min(380px, calc(100vw - 24px)); height: min(240px, 40vh);
      overflow-y: auto; padding: 8px 10px; box-sizing: border-box; line-height: 1.4; display: none;
      overflow-wrap: anywhere`

    const row = document.createElement('form')
    row.style.cssText = 'display:flex; gap:6px; align-items:center'

    this.toggle = document.createElement('button')
    this.toggle.type = 'button'
    this.toggle.style.cssText = `${keyCss()}; color:${ui().panel.ink}; font:inherit; font-weight:bold;
      padding:4px 10px; cursor:pointer`
    this.toggle.onclick = () => this.setOpen(!this.open)

    this.input = document.createElement('input')
    this.input.maxLength = CHAT_MAX
    this.input.placeholder = 'Say something to the sea…'
    this.input.style.cssText = `${keyCss()}; color:${ui().panel.ink}; font:inherit; padding:5px 8px;
      width: min(300px, calc(100vw - 110px)); box-shadow:none; display:none`
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.input.blur(); this.setOpen(false) }
    })

    row.onsubmit = (e) => {
      e.preventDefault()
      const body = this.input.value.trim()
      if (!body) { this.input.blur(); return }
      this.onSend(body)
      this.input.value = ''
    }
    row.append(this.toggle, this.input)
    this.root.append(this.log, row)
    document.body.appendChild(this.root)

    window.addEventListener('keydown', (e) => {
      if (!this.shown || document.activeElement === this.input) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (e.key === '/' || (e.key === 'Enter' && this.enterOpens)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        this.setOpen(true)
        this.input.focus()
      }
    }, { capture: true })
    this.drawToggle()
  }

  /** Clear of the touch helm, which owns the bottom corners on a phone. */
  set lifted(on: boolean) {
    this.root.style.bottom = on ? '104px' : '12px'
  }

  /** Enter opens the chat only where Enter means nothing else: at sea. */
  enterOpens = false

  show() {
    this.shown = true
    this.root.style.display = 'flex'
  }

  hide() {
    this.shown = false
    this.root.style.display = 'none'
    this.input.blur()
  }

  /** Replace the log, as on (re)connecting. */
  reset(messages: ChatMessage[]) {
    this.log.innerHTML = ''
    for (const m of messages) this.append(m)
    this.unread = 0
    this.drawToggle()
  }

  add(message: ChatMessage) {
    this.append(message)
    if (!this.open && !message.system) {
      this.unread++
      this.drawToggle()
    }
  }

  /** A line only this captain sees: an error, a refusal. */
  notice(text: string) {
    this.add({ id: 0, name: '', body: text, at: Date.now(), system: true })
  }

  private append(m: ChatMessage) {
    const line = document.createElement('div')
    if (m.system) {
      line.style.cssText = `color:${SYSTEM}; font-style:italic`
      line.textContent = m.body
    } else {
      const time = document.createElement('span')
      time.style.color = DIM
      time.textContent = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' '
      const who = document.createElement('b')
      who.textContent = `${m.name}: `
      line.append(time, who, document.createTextNode(m.body))
    }
    const atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 30
    this.log.appendChild(line)
    while (this.log.childElementCount > KEEP) this.log.firstElementChild?.remove()
    if (atBottom) this.log.scrollTop = this.log.scrollHeight
  }

  private setOpen(open: boolean) {
    this.open = open
    this.log.style.display = open ? 'block' : 'none'
    this.input.style.display = open ? 'block' : 'none'
    if (open) {
      this.unread = 0
      this.log.scrollTop = this.log.scrollHeight
    }
    this.drawToggle()
  }

  private drawToggle() {
    this.toggle.textContent = this.open ? 'Chat ▾' : this.unread > 0 ? `Chat (${this.unread})` : 'Chat ▸'
  }
}
