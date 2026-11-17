import { DurableObject } from 'cloudflare:workers'
import { ArenaWorld, captainClass, type Captain } from '../src/sim/arena'
import {
  CHAT_HISTORY, CHAT_MAX, SEA_CAPACITY, SNAPSHOT_HZ, r2,
  type BoardRow, type ChatMessage, type MissionSnap, type ClientMessage, type ServerMessage, type ShipSnap,
} from '../src/net/protocol'
import type { Env } from './worker'
import { BUILD } from './build'

/** The sim's own rate. Stepped in batches, one batch per snapshot. */
const SIM_HZ = 120
const STEP = 1 / SIM_HZ
/** How often the scoreboard goes out, and lifetime records are written. */
const BOARD_SECONDS = 1
const RECORD_SECONDS = 15
const CHAT_GAP_MS = 1000
/** Anything bigger than this from a browser is not a message we sent it to make. */
const MAX_FRAME = 2048

interface Session {
  userId: number
  name: string
  lastChat: number
}

/**
 * The open sea: one shared world, run here and nowhere else.
 *
 * Browsers send only their helm and sail orders; the guns, the shot and every
 * hit are decided here, so there is nothing a modified client can do but
 * steer badly. The sea runs only while someone is connected, and starts
 * fresh if the object is ever evicted — what lasts is in D1: accounts, chat
 * and each captain's lifetime record.
 */
export class Sea extends DurableObject<Env> {
  private readonly sessions = new Map<WebSocket, Session>()
  private readonly arena = new ArenaWorld(0x0be5ea)
  private timer: ReturnType<typeof setInterval> | null = null
  private last = 0
  private accumulator = 0
  private sinceBoard = 0
  private sinceRecord = 0
  private chat: ChatMessage[] | null = null
  private systemId = -1
  /** The best haul each captain has been recorded at, so a record is only written when beaten. */
  private recorded = new Map<number, number>()

  override async fetch(request: Request): Promise<Response> {
    // A connection sent by a newer Worker means this sea is running old code:
    // a live sea never idles, so it would otherwise go on serving the old
    // rules until everyone happened to leave at once. Tell everyone, close
    // up, and reset; the browsers reconnect to the new code a moment later.
    const build = request.headers.get('X-Build')
    if (build && build !== BUILD) {
      this.broadcast({ t: 'chat', msg: { id: this.systemId--, name: '', body: 'The sea is being refitted — back in a moment', at: Date.now(), system: true } })
      for (const ws of this.sessions.keys()) {
        try { ws.close(1012, 'refit') } catch { /* already gone */ }
      }
      this.ctx.abort('newer build')
    }
    const userId = Number(request.headers.get('X-User-Id'))
    const name = request.headers.get('X-User-Name') ?? ''
    if (!userId || !name) return new Response('Who are you?', { status: 400 })

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    server.accept()
    const session: Session = { userId, name, lastChat: 0 }
    this.sessions.set(server, session)

    server.addEventListener('message', (event) => this.onMessage(server, session, event.data))
    const close = () => this.onClose(server, session)
    server.addEventListener('close', close)
    server.addEventListener('error', close)

    this.send(server, {
      t: 'hello',
      you: { id: userId, name },
      seed: this.arena.seed,
      level: this.arena.level.id,
      size: this.arena.level.size,
      chat: await this.history(),
    })
    this.sendBoard()
    this.startClock()
    return new Response(null, { status: 101, webSocket: client })
  }

  // --- Messages ------------------------------------------------------------------

  private onMessage(ws: WebSocket, session: Session, data: string | ArrayBuffer) {
    if (typeof data !== 'string' || data.length > MAX_FRAME) return
    let msg: ClientMessage
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return

    switch (msg.t) {
      case 'join': {
        const already = this.arena.captains.has(session.userId)
        if (!already && this.arena.captains.size >= SEA_CAPACITY) {
          this.send(ws, { t: 'error', message: `The sea is full (${SEA_CAPACITY} ships). Try again shortly.` })
          return
        }
        this.arena.join(session.userId, session.name, captainClass(String(msg.hull)))
        if (!already) this.announce(`${session.name} has put to sea`)
        this.sendBoard()
        return
      }
      case 'leave':
        this.leaveSea(session)
        return
      case 'input':
        this.arena.setInput(session.userId, Number(msg.steer), Number(msg.sail))
        return
      case 'chat':
        void this.say(ws, session, msg.body)
        return
    }
  }

  private onClose(ws: WebSocket, session: Session) {
    if (!this.sessions.delete(ws)) return
    // Another tab may still be at the helm.
    const stillHere = [...this.sessions.values()].some((s) => s.userId === session.userId)
    if (!stillHere) this.leaveSea(session)
    if (this.sessions.size === 0) this.stopClock()
  }

  private leaveSea(session: Session) {
    const captain = this.arena.captains.get(session.userId)
    if (!captain) return
    this.record(captain)
    this.arena.leave(session.userId)
    this.announce(`${session.name} has made port`)
    this.sendBoard()
  }

  // --- Chat ----------------------------------------------------------------------

  private async history(): Promise<ChatMessage[]> {
    if (this.chat) return this.chat
    const { results } = await this.env.DB.prepare(
      'SELECT id, username AS name, body, created_at AS at FROM messages ORDER BY id DESC LIMIT ?',
    ).bind(CHAT_HISTORY).all<ChatMessage>()
    this.chat = results.reverse()
    return this.chat
  }

  private async say(ws: WebSocket, session: Session, raw: unknown) {
    if (typeof raw !== 'string') return
    // Control characters out, whitespace collapsed; the browser renders it as
    // text, never as markup, so nothing else needs escaping here.
    const body = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX)
    if (!body) return
    const now = Date.now()
    if (now - session.lastChat < CHAT_GAP_MS) {
      this.send(ws, { t: 'error', message: 'Steady — one message a second.' })
      return
    }
    session.lastChat = now

    const row = await this.env.DB.prepare(
      'INSERT INTO messages (user_id, username, body, created_at) VALUES (?, ?, ?, ?) RETURNING id',
    ).bind(session.userId, session.name, body, now).first<{ id: number }>()
    const msg: ChatMessage = { id: row?.id ?? 0, name: session.name, body, at: now }
    const history = await this.history()
    history.push(msg)
    if (history.length > CHAT_HISTORY) history.splice(0, history.length - CHAT_HISTORY)
    this.broadcast({ t: 'chat', msg })
  }

  /** A line from the sea itself. Not kept: it is news, not conversation. */
  private announce(body: string) {
    this.broadcast({ t: 'chat', msg: { id: this.systemId--, name: '', body, at: Date.now(), system: true } })
  }

  // --- The clock -----------------------------------------------------------------

  private startClock() {
    if (this.timer) return
    this.last = Date.now()
    this.accumulator = 0
    this.timer = setInterval(() => this.tick(), 1000 / SNAPSHOT_HZ)
  }

  private stopClock() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private tick() {
    const now = Date.now()
    // An evicted-and-resumed or badly delayed timer does not get to fast-forward the sea.
    this.accumulator += Math.min((now - this.last) / 1000, 0.25)
    this.last = now
    while (this.accumulator >= STEP) {
      this.arena.step(STEP)
      this.accumulator -= STEP
    }

    const events = this.arena.drainEvents()
    for (const e of events) {
      if (e.k === 'news') this.announce(e.text)
      else if (e.k === 'reward') void this.recordRenown(e.captain, e.renown)
      else if (e.k === 'sunk') {
        const victim = this.arena.captains.get(e.captain)
        const by = this.arena.captains.get(e.by)
        // A raider going down is not news; a captain going down is.
        if (victim) this.announce(by ? `${by.name} sank ${victim.name}` : `${victim.name} went down`)
        if (e.by || e.captain) void this.recordSinking(e.by, e.captain)
      }
    }

    this.broadcastSnapshot(events)

    this.sinceBoard += 1 / SNAPSHOT_HZ
    if (this.sinceBoard >= BOARD_SECONDS) {
      this.sinceBoard = 0
      this.sendBoard()
    }
    this.sinceRecord += 1 / SNAPSHOT_HZ
    if (this.sinceRecord >= RECORD_SECONDS) {
      this.sinceRecord = 0
      for (const captain of this.arena.captains.values()) this.record(captain)
    }
  }

  private broadcastSnapshot(events: ReturnType<ArenaWorld['drainEvents']>) {
    const arena = this.arena
    const ships: ShipSnap[] = []
    for (const s of arena.ships) {
      ships.push({
        id: s.id, c: arena.captainOf(s)?.id ?? 0, k: s.cls.id, f: arena.kindOf(s), n: arena.nameOf(s),
        x: r2(s.pos.x), y: r2(s.pos.y), vx: r2(s.vel.x), vy: r2(s.vel.y),
        h: r2(s.heading), hl: r2(s.heel), r: r2(s.rudder),
        so: s.sailOrder, cv: r2(s.canvas),
        hu: r2(s.hull), sa: r2(s.sails), cr: r2(s.crew),
        sunk: s.sunk, ag: s.aground, sh: r2(Math.min(s.sinceHit, 99)), bl: r2(s.blowout), md: r2(s.mending),
        gf: [s.gunsFired[0], s.gunsFired[1]],
        sc: [s.shotCount[0], s.shotCount[1]],
        sf: [r2(Math.min(s.sinceFired[0], 99)), r2(Math.min(s.sinceFired[1], 99))],
        rl: [r2(s.reload[0]), r2(s.reload[1])],
        aw: r2(s.awaSigned), pm: r2(s.polarMult),
      })
    }
    const plunder = arena.plunder.map((p) =>
      [r2(p.pos.x), r2(p.pos.y), r2(p.life / p.maxLife), p.drawn ? 1 : 0] as [number, number, number, 0 | 1])
    const settlements = arena.settlements.map((s) => ({
      id: s.id, name: s.name, x: r2(s.pos.x), y: r2(s.pos.y), land: r2(s.land),
      walls: r2(s.walls.hull), burning: s.state === 'burning', rebuild: Math.ceil(s.rebuild),
    }))
    const wind = arena.wind.state
    const time = arena.time

    for (const [ws, session] of this.sessions) {
      const captain = arena.captains.get(session.userId)
      this.send(ws, {
        t: 'snap', time, wind, ships, plunder, settlements, events,
        you: {
          ship: captain?.ship && !captain.ship.sunk ? captain.ship.id : null,
          respawn: captain ? r2(captain.respawn) : 0,
          plunder: captain ? r2(captain.plunder) : 0,
          sinkings: captain?.sinkings ?? 0,
          deaths: captain?.deaths ?? 0,
        },
      })
    }
  }

  private sendBoard() {
    const rows: BoardRow[] = [...this.arena.captains.values()]
      .map((c) => ({
        id: c.id, name: c.name, hull: c.cls.name,
        plunder: r2(c.plunder), sinkings: c.sinkings, deaths: c.deaths, renown: c.renown,
      }))
      .sort((a, b) => b.renown - a.renown || b.sinkings - a.sinkings || b.plunder - a.plunder)
    const board = this.arena.board
    const missions: MissionSnap[] = board.missions.map((m) => {
      const at = board.objective(m)
      return {
        id: m.id, kind: m.kind, title: m.title, state: m.state,
        at: at ? { x: r2(at.x), y: r2(at.y) } : null,
        need: m.need, crew: [...m.crew], engaged: m.engaged,
        progress: r2(board.progress(m)), left: Math.max(0, Math.ceil(m.left)),
        reward: m.reward, renown: m.renown,
      }
    })
    this.broadcast({ t: 'board', rows, missions })
  }

  // --- Lifetime records ------------------------------------------------------------

  private async recordSinking(by: number, victim: number) {
    const db = this.env.DB
    const statements = []
    if (by && by !== victim) {
      statements.push(db.prepare(
        `INSERT INTO stats (user_id, sinkings) VALUES (?, 1)
         ON CONFLICT(user_id) DO UPDATE SET sinkings = sinkings + 1`,
      ).bind(by))
    }
    if (victim) {
      statements.push(db.prepare(
        `INSERT INTO stats (user_id, deaths) VALUES (?, 1)
         ON CONFLICT(user_id) DO UPDATE SET deaths = deaths + 1`,
      ).bind(victim))
    }
    if (statements.length) await db.batch(statements).catch((err) => console.error('stats', err))
  }

  private async recordRenown(captain: number, renown: number) {
    if (!captain || renown <= 0) return
    await this.env.DB.prepare(
      `INSERT INTO stats (user_id, renown) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET renown = renown + excluded.renown`,
    ).bind(captain, renown).run().catch((err) => console.error('renown', err))
  }

  /** Write a captain's haul if it is the best she has had. */
  private record(captain: Captain) {
    const best = this.recorded.get(captain.id) ?? 0
    if (captain.plunder <= best) return
    this.recorded.set(captain.id, captain.plunder)
    void this.env.DB.prepare(
      `INSERT INTO stats (user_id, best_plunder) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET best_plunder = MAX(best_plunder, excluded.best_plunder)`,
    ).bind(captain.id, captain.plunder).run().catch((err) => console.error('record', err))
  }

  // --- Sending -----------------------------------------------------------------------

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      // Closed under us; the close handler tidies up.
    }
  }

  private broadcast(msg: ServerMessage) {
    const data = JSON.stringify(msg)
    for (const ws of this.sessions.keys()) {
      try { ws.send(data) } catch { /* closed */ }
    }
  }
}
