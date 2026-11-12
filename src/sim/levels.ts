import { makeRng } from '../core/rng'
import type { Island, Reef, TerrainMap } from './terrain'

/**
 * Locations.
 *
 * A level is a fixed map. It is written as a recipe (an atoll here, a chain
 * of islets there) and expanded once into a plain list of islands and bars,
 * which is all the rest of the game ever sees. The recipe is the authoring
 * tool, not a generator the game runs while you sail: the same level is the
 * same sea every time, so it can be learned, and nothing about it is worked
 * out per frame.
 *
 * Every place below is made of the two things terrain already had. What
 * changed is that they may now overlap and be arranged, so land can join up
 * into a hook round a harbour and bars can close into a ring.
 */
export interface Level {
  id: string
  name: string
  blurb: string
  /** Side of the square the map fills, centred on the origin. It repeats beyond that, so the sea wraps. */
  size: number
  /** Null for the endless hashed sea, which has no list to give. */
  map: TerrainMap | null
}

type Rng = () => number

/** Collects a map as the places are laid down, and remembers where they are. */
class Chart {
  readonly islands: Island[] = []
  readonly reefs: Reef[] = []
  /** Rough circles round each place, so scattered extras keep clear of them. */
  private readonly taken: [number, number, number][] = []

  constructor(readonly rng: Rng) {}

  island(x: number, y: number, radius: number, shoal: number) {
    this.islands.push({ x, y, radius, shoalRadius: radius * shoal, seed: this.rng() })
  }

  reef(x: number, y: number, length: number, width: number, angle: number, least: number, flat?: number) {
    this.reefs.push({ x, y, length, width, angle, least, seed: this.rng(), flat })
  }

  claim(x: number, y: number, r: number) { this.taken.push([x, y, r]) }

  free(x: number, y: number, r: number): boolean {
    return this.taken.every(([tx, ty, tr]) => Math.hypot(x - tx, y - ty) > r + tr)
  }

  /**
   * A chain: islets strung along a bowed line, close enough that their
   * shallows mostly run together. The gaps are the point. Some are deep and
   * anyone may use them; some only a shallow hull can thread.
   */
  chain(x0: number, y0: number, x1: number, y1: number, bow: number, count: number) {
    const rng = this.rng
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy)
    const nx = -dy / len
    const ny = dx / len
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1)
      // A parabola off the straight line, plus a little scatter either side.
      const off = bow * 4 * t * (1 - t) + (rng() - 0.5) * 150
      const x = x0 + dx * t + nx * off
      const y = y0 + dy * t + ny * off
      this.island(x, y, 70 + rng() * 95, 1.9 + rng() * 0.9)
    }
    this.claim((x0 + x1) / 2 + nx * bow * 0.6, (y0 + y1) / 2 + ny * bow * 0.6, len / 2 + 300)
  }

  /**
   * An atoll: a ring of reef with a few cays on it and deep water inside.
   * Two passes let any hull through; one stretch of the ring is just deep
   * enough for the shallowest hulls to cross where nothing else can follow.
   */
  atoll(cx: number, cy: number, R: number) {
    const rng = this.rng
    const segments = Math.max(8, Math.round((2 * Math.PI * R) / 430))
    const step = (2 * Math.PI) / segments
    const start = rng() * Math.PI * 2
    const passA = Math.floor(rng() * segments)
    // The second pass is roughly across the lagoon from the first.
    const passB = (passA + Math.floor(segments / 2) + (rng() < 0.5 ? 0 : 1)) % segments
    const low = (passA + Math.floor(segments / 4)) % segments
    // Half as long again as its share of the ring, so neighbours overlap on
    // their flat tops and the wall has no soft joints.
    const half = R * Math.sin(step / 2) * 1.55

    for (let i = 0; i < segments; i++) {
      if (i === passA || i === passB) continue
      const a = start + i * step
      const x = cx + Math.cos(a) * R
      const y = cy + Math.sin(a) * R
      const least = i === low ? 0.1 + rng() * 0.03 : 0.025 + rng() * 0.035
      this.reef(x, y, half, 80 + rng() * 30, a + Math.PI / 2, least, 0.7)
      // A cay on about one stretch in three, never beside a pass.
      const besidePass = [passA, passB].some((p) => Math.abs(((i - p + segments) % segments)) <= 1 ||
        ((p - i + segments) % segments) <= 1)
      if (!besidePass && i !== low && rng() < 0.45) {
        this.island(x, y, 48 + rng() * 34, 1.7)
      }
    }
    this.claim(cx, cy, R + 450)
  }

  /**
   * A crescent: one island bent round a bay. Built from rounds overlapping
   * along a hook, fattest at the back of the bay and tapering to the points.
   * Inside is shelter from shot, and from the wind, which is not always what
   * a ship wants.
   */
  crescent(cx: number, cy: number, R: number, mouth: number, gap: number) {
    const rng = this.rng
    const from = mouth + gap / 2
    const sweep = Math.PI * 2 - gap
    let a = 0
    while (a <= sweep) {
      const t = a / sweep
      // 0 at the points, 1 at the back of the bay.
      const fat = Math.sin(t * Math.PI)
      const r = (0.2 + 0.2 * fat) * R * (0.92 + rng() * 0.16)
      const at = from + a
      this.island(cx + Math.cos(at) * R, cy + Math.sin(at) * R, r, 1.5 + 0.15 * fat)
      // Close enough to overlap even where both shores wobble inward.
      a += (r * 0.95) / R
    }
    this.claim(cx, cy, R * 1.5 + 500)
  }

  /**
   * A large island: big rounds wandering along a spine, with headlands
   * thrown out from it. Between the headlands are bays; round the outside is
   * a long shore to be caught against.
   */
  mainland(cx: number, cy: number, heading: number, lobes: number) {
    const rng = this.rng
    let x = cx - Math.cos(heading) * lobes * 170
    let y = cy - Math.sin(heading) * lobes * 170
    let dir = heading
    for (let i = 0; i < lobes; i++) {
      const r = 300 + rng() * 170
      this.island(x, y, r, 1.3 + rng() * 0.2)
      // A headland off about every other lobe, to one side or the other.
      if (rng() < 0.6) {
        const side = dir + (rng() < 0.5 ? 1 : -1) * (Math.PI / 2 + (rng() - 0.5) * 0.7)
        const reach = r * (0.95 + rng() * 0.35)
        this.island(x + Math.cos(side) * reach, y + Math.sin(side) * reach, 120 + rng() * 90, 1.5)
      }
      dir += (rng() - 0.5) * 0.9
      x += Math.cos(dir) * r * 0.95
      y += Math.sin(dir) * r * 0.95
    }
    this.claim(cx, cy, lobes * 330 + 500)
  }

  /** Lone islets and sandbars in whatever sea the places have left open. */
  scatter(size: number, islets: number, bars: number) {
    const rng = this.rng
    const place = (r: number, put: (x: number, y: number) => void) => {
      for (let tries = 0; tries < 40; tries++) {
        const x = (rng() - 0.5) * size
        const y = (rng() - 0.5) * size
        if (!this.free(x, y, r)) continue
        put(x, y)
        this.claim(x, y, r)
        return
      }
    }
    for (let i = 0; i < islets; i++) {
      place(520, (x, y) => this.island(x, y, 80 + rng() * rng() * 150, 1.7 + rng() * 2.2))
    }
    for (let i = 0; i < bars; i++) {
      place(450, (x, y) => {
        const length = 170 + rng() * rng() * 320
        this.reef(x, y, length, length * (0.16 + rng() * 0.2), rng() * Math.PI, 0.03 + rng() * rng() * 0.36)
      })
    }
  }

  get map(): TerrainMap { return { islands: this.islands, reefs: this.reefs } }
}

function windwardCays(): TerrainMap {
  const c = new Chart(makeRng(0x71de))
  // North-east: the harbour, its mouth open to the south-west.
  c.crescent(2650, -2750, 560, Math.PI * 0.75, 1.5)
  // South-west: the big atoll.
  c.atoll(-2600, 2650, 900)
  // A smaller one off to the south-east.
  c.atoll(3150, 2950, 620)
  // The long chain across the north-west.
  c.chain(-4100, -2700, -500, -3750, 480, 9)
  // A second chain down the middle, which is what most runs will meet first.
  c.chain(-1350, -700, 1700, 1500, -430, 8)
  // The big island on the western side.
  c.mainland(-3500, -500, Math.PI * 0.42, 4)
  // A little hook of an island in the south.
  c.crescent(350, 3900, 380, -Math.PI / 2, 1.7)
  c.scatter(9400, 5, 12)
  return c.map
}

export const LEVELS: Level[] = [
  {
    id: 'windward-cays', name: 'Windward Cays', size: 10000,
    blurb: 'Two chains, two atolls, a harbour and a big island.',
    map: windwardCays(),
  },
  {
    id: 'endless', name: 'Open Sea', size: 0,
    blurb: 'The endless sea: scattered islands and bars, different every voyage.',
    map: null,
  },
]

export const LEVELS_BY_ID = new Map(LEVELS.map((l) => [l.id, l]))
