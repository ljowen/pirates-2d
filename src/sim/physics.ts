import type { Ship } from './ship'
import { draughtDepth, type Terrain } from './terrain'
import { angleDiff, wrapAngle, type Vec2 } from '../core/math'
import { T } from './tuning'
import type { Wind, WindSample } from './wind'

/**
 * The parts of the world's physics that do not care who is sailing: shared by
 * the single-player `World` and the multiplayer `ArenaWorld`, so the two seas
 * cannot drift apart in how a hull meets land, wind or another hull.
 */

/**
 * The wind at a point, including the calm an island throws downwind of
 * itself.
 *
 * `Wind` stays pure and knows nothing of terrain; the coupling lives here
 * because this is the layer that owns both. The lee is the classic sailing
 * problem — ducking behind an island shelters you from pursuit but also
 * takes the way off your own ship.
 */
export function windWithLee(wind: Wind, terrain: Terrain, p: Vec2): WindSample {
  const sample = wind.at(p.x, p.y)
  if (T.windShadowStrength <= 0) return sample

  let shadow = 0
  // In the map's own tile, which is where its quick lookup answers.
  const q = terrain.local(p)
  for (const island of terrain.near(q)) {
    const dx = q.x - island.x
    const dy = q.y - island.y
    const dist = Math.hypot(dx, dy)
    const reach = island.radius * T.windShadowLength
    if (dist > reach || dist < 1e-3) continue

    // Only downwind of the island counts, and only within a narrowing cone.
    const bearingFromIsland = Math.atan2(dy, dx)
    const alignment = Math.cos(angleDiff(bearingFromIsland, sample.to))
    if (alignment <= 0) continue

    shadow = Math.max(shadow, alignment * alignment * (1 - dist / reach))
  }
  if (shadow <= 0) return sample

  return {
    from: sample.from,
    to: sample.to,
    strength: sample.strength * (1 - T.windShadowStrength * shadow),
    // An island takes the way off you; it does not stop the rain. The
    // squall reading is a property of the weather, not of the local lee.
    squall: sample.squall,
  }
}

/**
 * Hulls are solid. Without this, ships drift through each other at close
 * quarters and a knife fight stops reading as one.
 */
export function separateShips(ships: Ship[]) {
  const MIN = 46
  for (let i = 0; i < ships.length; i++) {
    const a = ships[i]
    if (a.sunk) continue
    for (let j = i + 1; j < ships.length; j++) {
      const b = ships[j]
      if (b.sunk) continue
      const dx = b.pos.x - a.pos.x
      const dy = b.pos.y - a.pos.y
      const d = Math.hypot(dx, dy)
      if (d >= MIN || d < 1e-4) continue
      const push = (MIN - d) / 2
      const nx = dx / d
      const ny = dy / d
      a.pos.x -= nx * push
      a.pos.y -= ny * push
      b.pos.x += nx * push
      b.pos.y += ny * push
    }
  }
}

/**
 * Land stops ships, and shallows slow the deep-draughted ones. Handled here
 * rather than inside `Ship` so the hull physics stay free of any knowledge
 * of terrain — the same reason gunnery and AI live outside it.
 *
 * `onSunk` hears about any hull that goes down on the rocks.
 */
export function groundShips(ships: Ship[], terrain: Terrain, dt: number, onSunk: (ship: Ship) => void) {
  for (const ship of ships) {
    if (ship.sunk) continue
    const { island, distance, depth, escape } = terrain.probe(ship.pos)
    ship.depth = depth
    ship.aground = false

    // Shallows drag on a deep keel long before she actually touches.
    if (depth < 1) {
      const bite = T.shoalDraughtPenalty * ship.cls.draught * (1 - depth)
      const scale = Math.max(0, 1 - bite * dt)
      ship.vel.x *= scale
      ship.vel.y *= scale
    }

    // Aground when the water is shallower than she draws.
    //
    // Depth rather than distance-to-a-beach, which is what lets a bar with
    // no land in it strand a Galleon while a Pinnace sails over the top. It
    // also makes the island shoals mean something: a heavy hull now touches
    // a long way out, where before every hull could close to within a few
    // lengths of any beach.
    const needs = draughtDepth(ship.cls.draught)
    // She still cannot sail up a beach, however little she draws.
    const beached = island !== null && distance < 8
    if (depth >= needs && !beached) continue
    ship.aground = true

    // Which way the water deepens. On an island that is straight out from
    // its middle; on a bar it is across her, by the shortest way off.
    let nx = escape?.x ?? 0
    let ny = escape?.y ?? 0
    if (beached && island) {
      const dx = ship.pos.x - island.x
      const dy = ship.pos.y - island.y
      const len = Math.hypot(dx, dy) || 1
      nx = dx / len
      ny = dy / len
    }
    if (nx === 0 && ny === 0) continue

    // Speed into the shoal at the moment of contact, used to scale the
    // damage: drifting onto a bank should not cost what charging it does.
    const into = ship.vel.x * nx + ship.vel.y * ny
    const impact = Math.max(0, -into)

    // Shove her toward deeper water, hard enough to work free but not so
    // hard that touching bottom flings her off it.
    const shortfall = Math.max(0, needs - depth) / Math.max(needs, 0.01)
    const push = (beached ? 26 : 18 * shortfall) * Math.min(1, T.groundingDrag * dt)
    ship.pos.x += nx * push
    ship.pos.y += ny * push

    if (into < 0) {
      ship.vel.x -= nx * into
      ship.vel.y -= ny * into
    }

    // A bar does not tear a hull open the way a rock does: it holds her.
    // Most of what a grounding costs should be the time and the beating you
    // take while stuck, not the damage itself.
    const severity = 0.25 + 0.75 * Math.min(1, impact / 140)
    const bite = beached ? 1 : 0.45
    const died = ship.applyDamage(T.groundingDamage * severity * bite * dt, 0, 0)
    if (died) onSunk(ship)

    const hold = Math.max(0, 1 - T.groundingDrag * dt)
    ship.vel.x *= hold
    ship.vel.y *= hold
  }
}

/**
 * Put a hull somewhere she can sail from, however the terrain seed falls,
 * and lay her on a beam reach.
 *
 * Deep water is not enough on its own. Broad shoals and bars across open
 * water can between them enclose a pool this hull cannot get out of, and
 * waking up in a lagoon is the one position the player never chose — so a
 * candidate also has to have several courses that run clear to sea. The
 * spiral is a sunflower pattern, which covers ground evenly without ever
 * retracing a ring.
 *
 * `origin` is where the search starts. A beam reach because it is the
 * easiest heading to steer from, and taken from the wind where she actually
 * is, since the field veers by place — a heading from the mean wind lands in
 * irons on exactly the seeds this is meant to fix.
 */
export function placeClearOfLand(
  ship: Ship,
  origin: Vec2,
  terrain: Terrain,
  windAt: (p: Vec2) => WindSample,
) {
  const needs = draughtDepth(ship.cls.draught)
  let best = { pos: { ...ship.pos }, ways: -1 }
  for (let i = 0; i < 96; i++) {
    const a = i * 2.39996
    const r = i === 0 ? 0 : 120 * Math.sqrt(i)
    const pos = { x: origin.x + Math.cos(a) * r, y: origin.y + Math.sin(a) * r }
    if (terrain.probe(pos).depth < 1) continue
    // Four courses clear to sea is plenty of sea room, and asking for more
    // walks a long way for no gain on a crowded seed.
    const ways = terrain.escapes(pos, needs)
    if (ways > best.ways) best = { pos, ways }
    if (ways >= 4) break
  }

  ship.pos = { ...best.pos }
  ship.prevPos = { ...ship.pos }

  const wind = windAt(ship.pos)
  const port = wrapAngle(wind.from + Math.PI / 2)
  const starboard = wrapAngle(wind.from - Math.PI / 2)
  // Both tacks are equally fast, so take the one with more water ahead of
  // her. Clear courses were checked at the position; this checks the bow.
  const waterAhead = (h: number) =>
    terrain.probe({
      x: ship.pos.x + Math.cos(h) * 420,
      y: ship.pos.y + Math.sin(h) * 420,
    }).depth
  ship.heading = waterAhead(starboard) > waterAhead(port) ? starboard : port
  ship.prevHeading = ship.heading
}
