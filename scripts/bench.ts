import { World } from '../src/sim/world'
import { PLAYER_CLASSES, type ShipClass } from '../src/sim/shipClasses'
import { simulateRun } from '../src/dev/testPilot'
import { REFITS, STOCK_VOYAGE, type Voyage } from '../src/sim/voyage'
import { UPGRADES } from '../src/sim/upgrades'

/**
 * The balance harness, headless.
 *
 * `benchmark` has always been reachable from the browser console, which is
 * fine for one measurement and useless for a table of them. The simulation
 * has no knowledge of rendering, so it runs under Node unchanged: this is the
 * same pilot and the same seeds, just without a tab open.
 *
 * A run is a function of (seed, hull, voyage), so a row is a hull *and* a
 * career: the same sea is measured for a captain on their first voyage and
 * for one who has bought everything, and the curve is always the curve for a
 * stated career rather than for whoever last played.
 *
 *   npm run bench                 the arc: a spread of careers, 16 seeds
 *   npm run bench -- 32           the same, 32 seeds
 *   npm run bench -- 16 hulls     every hull on a fresh career
 *   npm run bench -- 16 early     the first few hours only
 *   npm run bench -- 16 ladder    a full career up the notoriety ladder
 */
const seeds = Number(process.argv[2] ?? 16)
const mode = process.argv[3] ?? 'arc'

const hull = (id: string): ShipClass => {
  const cls = PLAYER_CLASSES.find((c) => c.id === id)
  if (!cls) throw new Error(`no such hull: ${id}`)
  return cls
}

/** A career with every refit at `share` of its ranks and every card earned. */
const career = (share: number, notoriety = 0): Voyage => ({
  refits: Object.fromEntries(REFITS.map((r) => [r.id, Math.round(r.maxRank * share)])),
  notoriety,
  cards: share > 0
    ? new Set(UPGRADES.filter((u) => u.requires).map((u) => u.id))
    : new Set(),
})

interface Row { label: string; cls: ShipClass; voyage: Voyage }

const rows: Row[] =
  mode === 'hulls'
    ? PLAYER_CLASSES.map((cls) => ({ label: `${cls.name}, fresh`, cls, voyage: STOCK_VOYAGE }))
    : mode === 'early'
      ? [
          { label: 'Sloop, first voyage', cls: hull('sloop'), voyage: STOCK_VOYAGE },
          { label: 'Pinnace, first voyage', cls: hull('player-pinnace'), voyage: STOCK_VOYAGE },
          { label: 'Sloop, a third refitted', cls: hull('sloop'), voyage: career(0.34) },
          { label: 'Brigantine, half refitted', cls: hull('player-brigantine'), voyage: career(0.5) },
        ]
    : mode === 'ladder'
      ? [0, 2, 4, 6, 8, 10].flatMap((n) => [
          { label: `Frigate, full, notoriety ${n}`, cls: hull('player-frigate'), voyage: career(1, n) },
          { label: `Man-o'-War, full, notoriety ${n}`, cls: hull('player-man-of-war'), voyage: career(1, n) },
        ])
      : [
          { label: 'Sloop, maiden voyage', cls: hull('sloop'), voyage: { ...STOCK_VOYAGE, sailed: 0 } },
          { label: 'Sloop, second voyage', cls: hull('sloop'), voyage: { ...STOCK_VOYAGE, sailed: 1 } },
          { label: 'Sloop, full strength', cls: hull('sloop'), voyage: STOCK_VOYAGE },
          { label: 'Sloop, a third refitted', cls: hull('sloop'), voyage: career(0.34) },
          { label: 'Brigantine, half refitted', cls: hull('player-brigantine'), voyage: career(0.5) },
          { label: 'Frigate, three quarters', cls: hull('player-frigate'), voyage: career(0.75) },
          { label: 'Galleon, full', cls: hull('player-galleon'), voyage: career(1) },
          { label: "Man-o'-War, full", cls: hull('player-man-of-war'), voyage: career(1) },
          { label: "Man-o'-War, full, notoriety 5", cls: hull('player-man-of-war'), voyage: career(1, 5) },
          { label: "Man-o'-War, full, notoriety 10", cls: hull('player-man-of-war'), voyage: career(1, 10) },
        ]

const world = new World()
console.log(
  'career'.padEnd(34), 'win'.padStart(5), 'median'.padStart(7), 'level'.padStart(6),
  'plunder'.padStart(8), 'hunter: slipped/beaten/died to',
)
for (const row of rows) {
  const runs = Array.from(
    { length: seeds }, (_, i) => simulateRun(world, i + 1, 500, 'reads', row.cls, row.voyage),
  )
  const median = (pick: (r: (typeof runs)[number]) => number) =>
    runs.map(pick).sort((a, b) => a - b)[Math.floor(runs.length / 2)]
  const sum = (pick: (r: (typeof runs)[number]) => number) =>
    runs.reduce((total, r) => total + pick(r), 0)
  // She arrives about a minute in. A run that ended after that without
  // slipping or beating her ended with her still on the chase.
  const met = runs.filter((r) => r.seconds > 60).length
  const slipped = sum((r) => Math.min(1, r.huntersSlipped))
  const beaten = sum((r) => Math.min(1, r.huntersBeaten))
  console.log(
    row.label.padEnd(34),
    `${Math.round((100 * runs.filter((r) => r.won).length) / runs.length)}%`.padStart(5),
    `${median((r) => r.seconds)}s`.padStart(7),
    String(median((r) => r.level)).padStart(6),
    String(median((r) => r.plunder)).padStart(8),
    `${slipped}/${beaten}/${Math.max(0, met - slipped - beaten)}`.padStart(9),
  )
}
