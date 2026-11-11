import { makeRng } from '../core/rng'
import { clamp, smoothstep, type Vec2 } from '../core/math'
import { T } from './tuning'

/**
 * A squall: a cell of hard wind travelling downwind across the sea.
 *
 * Kept as plain data so the renderer can draw exactly the cell the physics
 * reads, the same contract the reefs use. `power` is cached each step rather
 * than recomputed per sample, because every ship and every cat's paw on the
 * water asks the wind where it is.
 */
export interface Squall {
  x: number
  y: number
  radius: number
  /** Which way the wind bends inside her. +1 veers, -1 backs. */
  veerSign: number
  age: number
  life: number
  /** 0 as she makes up and as she blows out, 1 in the thick of her. */
  power: number
  /** Stable per-cell value, so the rain inside one does not reshuffle. */
  seed: number
}

/**
 * The weather above the wind: squalls that make up to windward, cross, and
 * blow themselves out.
 *
 * They are spawned *upwind of the player* rather than anywhere on the map, for
 * two reasons. The honest one is that weather you never meet is weather that
 * does not exist — the arena is unbounded, so a cell placed at random would
 * almost never be seen. The better one is that a squall must arrive from
 * somewhere you can watch it come from: the whole decision this mechanic asks
 * for — shorten sail, or carry on and risk the rig — is only a decision if you
 * get the warning in time to make it.
 */
export class Weather {
  readonly squalls: Squall[] = []
  private rand: () => number = makeRng(1)
  private until = 0
  private spawned = 0

  reseed(seed: number) {
    this.rand = makeRng((seed ^ 0x5bf03635) >>> 0)
  }

  reset() {
    this.squalls.length = 0
    this.spawned = 0
    // Never on the first stroke of the clock: the opening of a run is the one
    // moment the player has no sea room and no idea what they are sailing.
    this.until = T.squallFirst
  }

  /**
   * Advance the cells and make up new ones. `focus` is the point weather is
   * generated around — the player, in practice.
   */
  step(dt: number, windTo: number, windFrom: number, focus: Vec2) {
    for (let i = this.squalls.length - 1; i >= 0; i--) {
      const s = this.squalls[i]
      s.age += dt
      if (s.age >= s.life) { this.squalls.splice(i, 1); continue }
      s.x += Math.cos(windTo) * T.squallSpeed * dt
      s.y += Math.sin(windTo) * T.squallSpeed * dt
      const t = s.age / s.life
      // Makes up quickly, hangs, then blows out more gently than it arrived.
      s.power = Math.min(smoothstep(0, 0.14, t), 1 - smoothstep(0.7, 1, t))
    }

    if (T.squallInterval <= 0) return
    this.until -= dt
    if (this.until > 0) return
    this.until = T.squallInterval * (0.6 + 0.8 * this.rand())
    this.spawn(windFrom, focus)
  }

  /**
   * Make up a squall to windward of `focus` right now.
   *
   * Public because weather you have to wait forty seconds for is weather you
   * cannot iterate on: the debug key calls this directly so a squall can be
   * conjured and sailed into on demand.
   */
  spawn(windFrom: number, focus: Vec2) {
    const radius = T.squallRadius * (0.75 + 0.6 * this.rand())
    // Far enough upwind to be seen coming, offset across the wind so she does
    // not simply run the player down every time.
    const reach = T.squallSpawnRange
    const across = (this.rand() * 2 - 1) * reach * 0.55
    const ux = Math.cos(windFrom)
    const uy = Math.sin(windFrom)
    this.squalls.push({
      x: focus.x + ux * reach - uy * across,
      y: focus.y + uy * reach + ux * across,
      radius,
      veerSign: this.rand() < 0.5 ? -1 : 1,
      age: 0,
      life: T.squallLife * (0.75 + 0.5 * this.rand()),
      power: 0,
      seed: (this.spawned++ * 2654435761) >>> 0,
    })
  }

  /**
   * What the squalls do to the wind at a point: a multiplier added to the
   * ambient strength, and a bend in its direction.
   *
   * Overlapping cells take the strongest rather than the sum — two squalls
   * meeting should be one bad patch of sea, not a hurricane.
   */
  sample(x: number, y: number): { gain: number; veer: number; intensity: number } {
    let gain = 0
    let veer = 0
    let worst = 0
    for (const s of this.squalls) {
      if (s.power <= 0) continue
      const d = Math.hypot(x - s.x, y - s.y)
      if (d >= s.radius) continue
      // Select on intensity, not on the gain it produces. Ranking by gain
      // means a `squallGain` of zero makes every cell equally unremarkable
      // and quietly takes the wind shift away with it — which is wrong on its
      // own terms, and makes "strength only" and "veer only" impossible to
      // tell apart when tuning.
      const i = s.power * (1 - smoothstep(0.45, 1, d / s.radius))
      if (i > worst) {
        worst = i
        gain = i * T.squallGain
        veer = i * s.veerSign * (T.squallVeer * Math.PI) / 180
      }
    }
    return { gain, veer, intensity: worst }
  }

  /** How hard it is blowing at a point, 0–1, for the renderer and the HUD. */
  intensityAt(x: number, y: number): number {
    let worst = 0
    for (const s of this.squalls) {
      if (s.power <= 0) continue
      const d = Math.hypot(x - s.x, y - s.y)
      if (d >= s.radius) continue
      worst = Math.max(worst, s.power * (1 - smoothstep(0.45, 1, d / s.radius)))
    }
    return clamp(worst, 0, 1)
  }

  /**
   * Distance and bearing to the nearest squall that has not yet reached a
   * point, so the HUD can say one is coming rather than only that it arrived.
   */
  nearest(x: number, y: number): { distance: number; bearing: number; power: number } | null {
    let best: Squall | null = null
    let bestEdge = Infinity
    for (const s of this.squalls) {
      // A cell still making up or already blowing out is not the one worth
      // warning about, and letting it win on distance would mask a real
      // squall standing right behind it.
      if (s.power <= 0.1) continue
      const edge = Math.hypot(x - s.x, y - s.y) - s.radius
      if (edge < bestEdge) { bestEdge = edge; best = s }
    }
    if (!best) return null
    return {
      distance: bestEdge,
      bearing: Math.atan2(best.y - y, best.x - x),
      power: best.power,
    }
  }
}
