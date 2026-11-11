import { World } from '../src/sim/world'
import { PLAYER_CLASSES } from '../src/sim/shipClasses'
import { simulateRun } from '../src/dev/testPilot'

/**
 * The balance harness, headless.
 *
 * `benchmark` has always been reachable from the browser console, which is
 * fine for one measurement and useless for a table of them. The simulation
 * has no knowledge of rendering, so it runs under Node unchanged: this is the
 * same pilot and the same seeds, just without a tab open.
 *
 *   npm run bench            all hulls, 16 seeds
 *   npm run bench -- 32      all hulls, 32 seeds
 *   npm run bench -- 16 sloop
 */
const seeds = Number(process.argv[2] ?? 16)
const only = process.argv[3]

const world = new World()
for (const cls of PLAYER_CLASSES) {
  if (only && cls.id !== only) continue
  world.playerClass = cls
  const runs = Array.from({ length: seeds }, (_, i) => simulateRun(world, i + 1))
  const sorted = (pick: (r: (typeof runs)[number]) => number) =>
    runs.map(pick).sort((a, b) => a - b)
  const median = (pick: (r: (typeof runs)[number]) => number) =>
    sorted(pick)[Math.floor(runs.length / 2)]
  const plunder = sorted((r) => r.plunder)
  console.log(
    cls.name.padEnd(12),
    `win ${String(Math.round((100 * runs.filter((r) => r.won).length) / runs.length)).padStart(3)}%`,
    `median ${median((r) => r.seconds)}s`,
    `level ${median((r) => r.level)}`,
    `plunder ${plunder[0]}–${median((r) => r.plunder)}–${plunder[plunder.length - 1]}`,
  )
}
