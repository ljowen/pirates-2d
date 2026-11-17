import type { ClientMessage, ServerMessage } from './protocol'

export type Link = 'offline' | 'connecting' | 'open'

/**
 * The browser's end of the open sea's WebSocket: one per signed-in captain,
 * kept open from port so chat works there too, and reconnected on its own
 * when the line drops.
 */
export class SeaClient {
  private ws: WebSocket | null = null
  private token: string | null = null
  private retry = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  /** The hull last asked for, so a dropped line puts the captain back to sea. */
  private hull: string | null = null
  link: Link = 'offline'

  onMessage: (msg: ServerMessage) => void = () => {}
  onLink: (link: Link) => void = () => {}
  /** Several failures in a row: the token may no longer be good. */
  onTrouble: () => void = () => {}

  connect(token: string) {
    if (this.token === token && this.ws) return
    this.disconnect()
    this.token = token
    this.open()
  }

  disconnect() {
    this.token = null
    this.hull = null
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.setLink('offline')
  }

  /** Put to sea in this hull, or change hull. Remembered across reconnects. */
  join(hull: string) {
    this.hull = hull
    this.send({ t: 'join', hull })
  }

  leave() {
    this.hull = null
    this.send({ t: 'leave' })
  }

  get atSea() { return this.hull !== null }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private open() {
    if (!this.token) return
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${scheme}://${location.host}/ws?token=${encodeURIComponent(this.token)}`)
    this.ws = ws
    this.setLink('connecting')

    ws.onopen = () => {
      if (this.ws !== ws) return
      this.retry = 0
      this.setLink('open')
      if (this.hull) this.send({ t: 'join', hull: this.hull })
    }
    ws.onmessage = (event) => {
      if (this.ws !== ws || typeof event.data !== 'string') return
      let msg: ServerMessage
      try { msg = JSON.parse(event.data) } catch { return }
      this.onMessage(msg)
    }
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      this.setLink('connecting')
      this.retry++
      if (this.retry === 3) this.onTrouble()
      // Back off to ten seconds; a sea that has gone away is not hammered.
      const wait = Math.min(10_000, 500 * 2 ** Math.min(this.retry, 5))
      this.retryTimer = setTimeout(() => this.open(), wait)
    }
  }

  private setLink(link: Link) {
    if (this.link === link) return
    this.link = link
    this.onLink(link)
  }
}
