import { ArenaWorld, arenaClass, RESPAWN_SECONDS, type ArenaEvent } from '../src/sim/arena'
import { SAIL_FIGHTING, type Ship } from '../src/sim/ship'
import { angleDiff, clamp } from '../src/core/math'

/**
 * The open sea, headless: two scripted captains are put within sight of each
 * other and left to fight. Checks that the shared world does what the server
 * promises the browsers — shot is announced and retired, a sinking is
 * credited to whoever fired the ball, the wreck spills plunder, and her
 * captain is raised again somewhere else.
 *
 *   npm run arena
 */
const failures: string[] = []
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`)
  if (!ok) failures.push(what)
}

const sea = new ArenaWorld(0x5ea)
sea.join(1, 'Anne', arenaClass('sloop'))
sea.join(2, 'Mary', arenaClass('sloop'))
const a = sea.captains.get(1)!
const b = sea.captains.get(2)!
check(!!a.ship && !!b.ship, 'both captains are raised on joining')
const raisedApart = Math.hypot(a.ship!.pos.x - b.ship!.pos.x, a.ship!.pos.y - b.ship!.pos.y)
check(raisedApart > 600, `raised well apart (${raisedApart.toFixed(0)} px)`)

// Bring them together in open water: the fight is the thing under test, not
// the search for one.
for (const ship of [a.ship!, b.ship!]) {
  const near = { ...a.ship!.pos }
  if (ship === b.ship) near.x += 300
  ship.pos = { ...near }
  ship.prevPos = { ...near }
}

/** Steer to bring the other ship onto the beam once in range, otherwise close her. */
const pilot = (me: typeof a, them: typeof a) => {
  const ship = me.ship
  const target = them.ship
  if (!ship || ship.sunk || !target || target.sunk) return
  const bearing = Math.atan2(target.pos.y - ship.pos.y, target.pos.x - ship.pos.x)
  const range = Math.hypot(target.pos.x - ship.pos.x, target.pos.y - ship.pos.y)
  const desired = range > 260 ? bearing : bearing + Math.PI / 2
  sea.setInput(me.id, clamp(angleDiff(desired, ship.heading) * 2, -1, 1), SAIL_FIGHTING)
}

const events: ArenaEvent[] = []
const firstShips = new Set([a.ship!.id, b.ship!.id])
const dt = 1 / 120
let sunkAt = -1
for (let i = 0; i < 120 * 600; i++) {
  pilot(a, b)
  pilot(b, a)
  sea.step(dt)
  events.push(...sea.drainEvents())
  if (sunkAt < 0 && events.some((e) => e.k === 'sunk')) sunkAt = sea.time
  // Long enough after the first sinking to be raised and see it.
  if (sunkAt >= 0 && sea.time > sunkAt + RESPAWN_SECONDS + 1) break
}

const fired = events.filter((e) => e.k === 'fire')
const gone = events.filter((e) => e.k === 'gone')
const sunk = events.filter((e) => e.k === 'sunk')
check(fired.length > 0, `guns fire (${fired.length} balls)`)
check(gone.length > 0 && gone.length <= fired.length, `shot is retired (${gone.length})`)
check(events.some((e) => e.k === 'splash' && e.hit && e.victim > 0), 'hits name the captain struck')
check(sunk.length > 0, `someone sinks (after ${sunkAt.toFixed(1)} s)`)
if (sunk.length > 0) {
  const s = sunk[0] as Extract<ArenaEvent, { k: 'sunk' }>
  const victim = s.captain === 1 ? a : b
  const victor = s.captain === 1 ? b : a
  check(s.by === victor.id, 'the sinking is credited to the captain who fired the ball')
  check(victor.sinkings === 1 && victim.deaths === 1, 'sinkings and deaths are counted')
  check(!!victim.ship && !victim.ship.sunk && !firstShips.has(victim.ship.id), 'the victim is raised in a new hull')
  const gap = victim.ship && victor.ship
    ? Math.hypot(victim.ship.pos.x - victor.ship.pos.x, victim.ship.pos.y - victor.ship.pos.y)
    : 0
  check(gap > 600, `and raised away from her killer (${gap.toFixed(0)} px)`)
  check(sea.plunder.length > 0 || events.some((e) => e.k === 'pickup'), 'the wreck spills plunder')
}

// Leaving takes the hull off the sea.
sea.leave(2)
check(!sea.captains.has(2) && sea.ships.every((s) => sea.captainOf(s)?.id !== 2), 'leaving clears her ship')

// --- Missions ---------------------------------------------------------------------

const put = (ship: Ship, at: { x: number; y: number }) => {
  ship.pos = { ...at }
  ship.prevPos = { ...at }
  ship.vel = { x: 0, y: 0 }
}
/** A captain who sails for the nearest thing she is at odds with and lays her broadside on it. */
const hunter = (w: ArenaWorld, id: number) => {
  const ship = w.captains.get(id)?.ship
  if (!ship || ship.sunk) return
  let target: Ship | null = null
  let best = Infinity
  for (const other of w.ships) {
    if (other.sunk || !w.hostile(ship, other)) continue
    const d = Math.hypot(other.pos.x - ship.pos.x, other.pos.y - ship.pos.y)
    if (d < best) { best = d; target = other }
  }
  if (!target) { w.setInput(id, 0, SAIL_FIGHTING); return }
  const bearing = Math.atan2(target.pos.y - ship.pos.y, target.pos.x - ship.pos.x)
  w.setInput(id, clamp(angleDiff(best > 260 ? bearing : bearing + Math.PI / 2, ship.heading) * 2, -1, 1), SAIL_FIGHTING)
}
const run = (w: ArenaWorld, seconds: number, each?: () => boolean | void) => {
  const all: ArenaEvent[] = []
  for (let i = 0; i < seconds * 120; i++) {
    w.step(dt)
    all.push(...w.drainEvents())
    if (i % 12 === 0 && each?.()) break
  }
  return all
}

console.log('\nmissions')
{
  const w = new ArenaWorld(0x5ea)
  const [west, east] = w.settlements
  check(w.settlements.length === 2 && west.pos.x < 0 && east.pos.x > 0,
    `two settlements, one each side (${west.name} at ${west.pos.x.toFixed(0)}, ${east.name} at ${east.pos.x.toFixed(0)})`)
  check(w.settlements.every((s) => w.terrain.probe(s.pos).depth >= 1), 'both lie in water a ship can reach')
}

{
  // Nobody comes: the raiders beat the walls down, the town burns, and in time is rebuilt.
  const w = new ArenaWorld(0x5ea)
  const m = w.board.offer('defend')!
  const town = m.settlement!
  let lowest = 1
  const events = run(w, 420, () => { lowest = Math.min(lowest, town.walls.hull); return town.state === 'burning' })
  check(events.some((e) => e.k === 'fire'), 'raiders fire on an undefended town')
  check(lowest < 0.8, `and its walls come down (to ${(lowest * 100).toFixed(0)}%)`)
  check(town.state === 'burning' && m.state === 'lost', `undefended, it burns (after ${m.age.toFixed(0)} s)`)
  run(w, 250)
  check(town.state === 'standing' && town.walls.hull === 1, 'and is rebuilt a few minutes later')
}

{
  // Two captains defend it: they become crew, allies, and beat the raid off.
  const w = new ArenaWorld(0x5ea)
  const m = w.board.offer('defend')!
  const town = m.settlement!
  w.join(1, 'Anne', arenaClass('player-frigate'))
  w.join(2, 'Mary', arenaClass('player-frigate'))
  const a = w.captains.get(1)!.ship!
  const b = w.captains.get(2)!.ship!
  const seaward = town.land + Math.PI
  put(a, { x: town.pos.x + Math.cos(seaward) * 400, y: town.pos.y + Math.sin(seaward) * 400 - 120 })
  put(b, { x: town.pos.x + Math.cos(seaward) * 400, y: town.pos.y + Math.sin(seaward) * 400 + 120 })
  run(w, 1)
  check(m.crew.has(1) && m.crew.has(2), 'captains who sail into a raid are its crew')
  check(w.board.allied(1, 2) && !w.hostile(a, b), 'and crew are allies: their guns hold fire on each other')
  const hpA = a.hull
  const hpB = b.hull
  let friendly = 0
  const events = run(w, 360, () => {
    hunter(w, 1)
    hunter(w, 2)
    return m.state !== 'active'
  })
  for (const e of events) if (e.k === 'sunk' && e.captain > 0 && e.by > 0) friendly++
  check(friendly === 0, 'no crewmate is sunk by another')
  console.log(`      (raid ${m.state} after ${m.age.toFixed(0)} s; walls ${(town.walls.hull * 100).toFixed(0)}%; ` +
    `hulls ${(a.hull * 100).toFixed(0)}% / ${(b.hull * 100).toFixed(0)}% from ${(hpA * 100).toFixed(0)} / ${(hpB * 100).toFixed(0)})`)
  check(m.state === 'won', 'two frigates beat the raid off')
  // Only this raid's pay: the sea may have offered them other work meanwhile.
  const paid = events.filter((e) => e.k === 'reward' && e.plunder === m.reward && e.renown === m.renown)
  check(paid.length === 2,
    'and each is paid plunder and renown')
}

{
  // A bounty that takes three: alone, her timbers barely give; with three, normally.
  const w = new ArenaWorld(0x5ea)
  const m = w.board.offer('bounty', 3, 3)!
  const target = m.ships[0]
  check(target.cls.name === 'Galleon' && m.need === 3, `a three-captain bounty is a heavy hull (${target.cls.name})`)
  for (const id of [1, 2, 3]) w.join(id, `C${id}`, arenaClass('sloop'))
  const ship = (id: number) => w.captains.get(id)!.ship!
  put(ship(1), { x: target.pos.x + 300, y: target.pos.y })
  // Somewhere far off: the opposite corner of the chart from her.
  const far = (k: number) => ({ x: -Math.sign(target.pos.x || 1) * (4200 - k * 400), y: -Math.sign(target.pos.y || 1) * 4200 })
  put(ship(2), far(0))
  put(ship(3), far(1))
  run(w, 0.2)
  check(Math.abs(target.mods.armour - 3) < 1e-9, `one captain on her: she takes a third of the damage (armour ×${target.mods.armour})`)
  put(ship(2), { x: target.pos.x - 300, y: target.pos.y })
  put(ship(3), { x: target.pos.x, y: target.pos.y + 300 })
  run(w, 0.2)
  check(m.engaged === 3 && Math.abs(target.mods.armour - 1) < 1e-9, 'three on her: full damage')
  check(w.board.allied(1, 2) && w.board.allied(2, 3), 'and the three are crew together')
}

{
  // An escort that makes port pays its crew.
  const w = new ArenaWorld(0x5ea)
  const m = w.board.offer('escort')!
  const merchant = m.ships.find((s) => s.faction === 'convoy')!
  const to = m.to!
  w.join(1, 'Anne', arenaClass('sloop'))
  put(merchant, { x: to.pos.x + (m.from!.pos.x > to.pos.x ? 900 : -900), y: to.pos.y })
  put(w.captains.get(1)!.ship!, { x: merchant.pos.x, y: merchant.pos.y + 200 })
  const before = w.captains.get(1)!.plunder
  run(w, 180, () => m.state !== 'active')
  check(m.state === 'won' && m.arrived > 0, `the merchant makes port (${m.state}, ${m.age.toFixed(0)} s)`)
  check(w.captains.get(1)!.plunder >= before + m.reward && w.captains.get(1)!.renown === m.renown,
    'and her escort is paid')
  check(!w.ships.includes(merchant), 'a merchant in port leaves the sea')
}

{
  // Left alone, a merchant really does sail for port: tacking and clearing land on her own.
  const w = new ArenaWorld(0x5ea)
  const m = w.board.offer('escort')!
  m.waves.length = 0
  let best = 0
  run(w, 240, () => { best = Math.max(best, w.board.progress(m)); return m.state !== 'active' })
  check(best > 0.35, `an unescorted merchant makes her way across the chart (${(best * 100).toFixed(0)}% of it, ${m.state})`)
}

{
  // The sea keeps work going, but never two raids or two escorts at once.
  const w = new ArenaWorld(0x5ea)
  w.join(1, 'Anne', arenaClass('sloop'))
  const seen = new Set<string>()
  let doubled = false
  run(w, 900, () => {
    const kinds = w.board.active.map((m) => m.kind)
    for (const k of kinds) seen.add(k)
    if (new Set(kinds).size !== kinds.length) doubled = true
  })
  check(seen.size === 3, `bounties, escorts and raids all come up (${[...seen].join(', ')})`)
  check(!doubled, 'never two of a kind at once')
}

if (failures.length) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log('\nall passed')
