/**
 * The wire between the open sea's server and its browsers. Shared by both
 * sides, so a field renamed on one is a type error on the other.
 *
 * JSON throughout. A snapshot of a full sea is a few kilobytes at 20 Hz,
 * which is nothing next to the cost of a second, binary, encoding to keep in
 * step with this one.
 */
import type { WindState } from '../sim/wind'
import type { ArenaEvent, ShipKind } from '../sim/arena'
import type { MissionKind, MissionState } from '../sim/missions'

/** Snapshots per second. The simulation itself runs at 120 Hz on the server. */
export const SNAPSHOT_HZ = 20
/** How many captains one sea holds. */
export const SEA_CAPACITY = 16
export const CHAT_MAX = 300
export const CHAT_HISTORY = 50

export interface ChatMessage {
  id: number
  name: string
  body: string
  /** Epoch milliseconds. */
  at: number
  /** A notice from the sea itself (a sinking, an arrival) rather than a captain. */
  system?: boolean
}

// --- Browser → server ------------------------------------------------------

export type ClientMessage =
  /** Take a ship to sea, or change hull for the next time she is raised. */
  | { t: 'join'; hull: string }
  /** Back to the quay. Chat stays connected. */
  | { t: 'leave' }
  /** Helm in [-1, 1] and the ordered sail state. Sent on change and as a heartbeat. */
  | { t: 'input'; steer: number; sail: number }
  | { t: 'chat'; body: string }

// --- Server → browser ------------------------------------------------------

/** One hull, as the browser needs her to draw and to read her instruments. */
export interface ShipSnap {
  id: number
  /** The captain's user id. */
  c: number
  /** Hull class id. */
  k: string
  x: number; y: number
  vx: number; vy: number
  /** Heading, heel, rudder. */
  h: number; hl: number; r: number
  /** Sail order and canvas actually aloft. */
  so: number; cv: number
  /** Hull, rigging and crew, 0–1. */
  hu: number; sa: number; cr: number
  sunk: boolean
  ag: boolean
  sh: number
  bl: number
  md: number
  /** Guns fired and volleys ordered, per battery: what drives smoke and sound. */
  gf: [number, number]
  sc: [number, number]
  sf: [number, number]
  /** Reload left per battery, signed angle off the wind, and the polar's multiplier. */
  rl: [number, number]
  aw: number
  pm: number
  /** Whose she is: a captain's, or one of the hulls a mission brought. */
  f: ShipKind
  /** An AI hull's name ("Raider", a bounty's). Captains are named by the board. */
  n?: string
}

/** A mission as the browsers see it. Sent with the board, once a second. */
export interface MissionSnap {
  id: number
  kind: MissionKind
  title: string
  state: MissionState
  /** Where it is, for the chart and the arrows; null once it has nothing afloat. */
  at: { x: number; y: number } | null
  need: number
  /** Captains who have signed on by sailing into it. */
  crew: number[]
  /** Bounty: how many of them are on her now. */
  engaged: number
  progress: number
  left: number
  reward: number
  renown: number
}

/** A settlement: where it is, which way its land lies, and how its walls stand. */
export interface SettlementSnap {
  id: number
  name: string
  x: number
  y: number
  land: number
  walls: number
  burning: boolean
  /** Seconds until it is rebuilt, while burning. */
  rebuild: number
}

/** A thing that happened at a moment, played back when the view reaches that moment. */
export type SeaEvent = ArenaEvent

/** A captain's own standing, sent to them alone. */
export interface YouSnap {
  /** Your ship's id, or null while you are in port or waiting to be raised. */
  ship: number | null
  /** Seconds until you are raised again after sinking; 0 when afloat or in port. */
  respawn: number
  plunder: number
  sinkings: number
  deaths: number
}

export interface BoardRow {
  id: number
  name: string
  hull: string | null
  plunder: number
  sinkings: number
  deaths: number
  renown: number
}

export type ServerMessage =
  | {
    t: 'hello'
    you: { id: number; name: string }
    /** The sea's seed and chart, from which the browser builds the same terrain and wind. */
    seed: number
    level: string
    size: number
    chat: ChatMessage[]
  }
  | { t: 'chat'; msg: ChatMessage }
  | {
    t: 'snap'
    /** Server simulation time in seconds. */
    time: number
    wind: WindState
    ships: ShipSnap[]
    /** Floating plunder: x, y, life left as a fraction, drawn-in flag. */
    plunder: [number, number, number, 0 | 1][]
    settlements: SettlementSnap[]
    events: SeaEvent[]
    you: YouSnap
  }
  | { t: 'board'; rows: BoardRow[]; missions: MissionSnap[] }
  | { t: 'error'; message: string }

/** Two decimals is a hundredth of a pixel, far below anything visible. */
export const r2 = (v: number) => Math.round(v * 100) / 100
