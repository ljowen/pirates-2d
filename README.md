# Pirates2D

A silly little pirate game. You steer; the cannons fire themselves; the wind decides
where you can actually go.

**[Play it in your browser →](https://ljowen.github.io/pirates-2d/)**

TypeScript, PixiJS v8, Vite. No other runtime dependencies — the water, hulls, rigging,
weather and every sound are generated procedurally at runtime.

## Running it

```sh
npm install
npm run dev     # http://localhost:5173
npm run build   # typecheck + production build
```

## Controls

| Input | Action |
|---|---|
| ← / → (or LMB / RMB) | Turn |
| ↑ / ↓ | Make / shorten sail — furled, courses, topsails, royals |
| 1–4 | Pick a card during a level-up draft, or a hull at the start |
| P | Pause |
| T | Turbo (4× time) |
| M | Mute |
| C | Sail on into endless mode (offered when you complete a voyage) |
| R | Reset the run |
| E | Spawn an enemy |
| Q | Spawn a squall to windward |
| F1 | Debug overlay — polar plot, velocity vectors, numbers |
| ` | Live tuning panel (or click **⚙ Tune**, bottom right) |

A control legend sits along the bottom of the screen, so none of this has to be
memorised from here.

## Documentation

Design notes, measurements and the reasoning behind the tuning live in [docs/](docs/) —
[ARCHITECTURE](docs/ARCHITECTURE.md), [SAILING](docs/SAILING.md),
[COMBAT](docs/COMBAT.md), [PROGRESSION](docs/PROGRESSION.md),
[TERRAIN](docs/TERRAIN.md), [AUDIO](docs/AUDIO.md), [TUNING](docs/TUNING.md),
[DECISIONS](docs/DECISIONS.md), and the forward plans in
[ROADMAP](docs/ROADMAP.md) and [docs/plans/](docs/plans/).

The one rule that matters: **`sim/` knows nothing about rendering, audio or UI.**
