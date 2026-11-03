# Plan: scenario — weather and terrain

Two very different pieces of work that are easy to conflate.

**Terrain is built** — islands, shoals, draught, grounding, cover and AI avoidance. See
[../TERRAIN.md](../TERRAIN.md) for what shipped and what it measured. The sequencing
below proved right: starting with simple obstacles answered "is this worth it?" cheaply,
and the steering-behaviour bet for AI navigation held up at 0.00% time aground.

**Weather is still open**, and remains the cheap half.

## Part 1: Weather (cheap, do it early)

The wind system already has direction drift, strength variation and gusts. Most of what
follows is new modulation of existing values rather than new machinery.

### Squalls

A travelling weather cell that crosses the arena. Inside it: wind strength spikes,
direction shifts sharply, visibility drops.

**Why it is good:** it makes the wind a *threat* rather than only a constraint, and it
rewards reading the sky. Carrying full canvas into a squall should hurt — the
`overcanvasPenalty` mechanic already exists and currently almost never triggers.

**Implementation:** a moving position and radius; the wind query becomes positional rather
than global. That is the one real change — `Wind.from` and `Wind.strength` become
functions of location. Every consumer already asks the wind object, so the blast radius is
small.

**Watch for:** the AI reads the same wind, so squalls affect enemies too. That is correct
and desirable, but it means a squall can scatter a swarm, which may be a feature or an
exploit depending on how it tunes.

### Calms

The opposite: a region of near-zero wind. Terrifying in a swarm game — you cannot
manoeuvre, and anything already moving closes on you.

Cheap to implement alongside squalls, and it gives the furled-sails state a purpose it
currently lacks.

### Night and weather states

A run could cycle through conditions — clear, overcast, squally, night — each with its own
palette and wind character. This pairs naturally with
[art-direction.md](art-direction.md) and gives a long run visual variety for very little
mechanical cost.

### Sea state

Wave height scaling with wind strength, affecting the water rendering and perhaps adding
a slow heave to the ship. Pure presentation, but it would sell the weather enormously.

## Part 2: Terrain (expensive, plan carefully)

Landmasses, reefs and shoals genuinely deepen the sailing game. They are also the single
largest piece of work remaining, and they force the structural question the project has
been deferring.

### Why it is worth wanting

- **Lee shores.** Being embayed with the wind pushing you onto rocks is the classic
  sailing nightmare, and this game has exactly the model to make it work.
- **Breaking line of sight.** Running behind an island to shake pursuit gives the wind
  a tactical use beyond raw speed.
- **Reefs as an asymmetric weapon.** Drawing a deep-draught Brigantine over a shoal that
  your Sloop can cross is a genuinely great idea, and plays directly into the hull-class
  system that already exists.
- **Shaping the arena.** An open sea is flat in every sense; terrain gives a run a shape.

### Why it is expensive

| Requirement | Difficulty |
|---|---|
| Collision between hulls and coastline | Moderate — needs a real geometry representation |
| Running aground: damage, grounding, refloating | Moderate — new state on `Ship` |
| **AI navigation around obstacles** | **Hard** — the current captains steer by bearing and would sail straight into cliffs |
| Map generation or authoring | Moderate to hard, depending on ambition |
| Rendering coastlines that read clearly from above | Moderate |
| Spawn placement that avoids land | Easy, but easy to forget |

The AI navigation is the real cost. `CaptainAI` currently computes a desired heading from
a bearing and clamps it for the wind. Obstacle avoidance means either steering behaviours
(cheap, imperfect, probably sufficient) or actual pathfinding over a navigable-water grid
(expensive, correct). **Steering behaviours are almost certainly the right call** for a
game where enemies only need to look competent for the thirty seconds they are on screen.

### The structural question this forces

**One continuous space, or an overworld plus a battle screen?**

Terrain only means something if there is somewhere to *be*. That pushes toward a map. But
Pirates!-style modal transitions would kill the swarm pressure that makes the current
design work.

A middle path worth considering: **one continuous space, but a large authored or generated
region** rather than infinite open sea — an archipelago you sail within, where the swarm
finds you wherever you are. Keeps the single-arena pressure while giving terrain somewhere
to exist.

This should be settled before terrain work starts. See [../ROADMAP.md](../ROADMAP.md).

### Suggested sequencing

1. **Static circular obstacles first.** Rocks and islets as circles — trivial collision,
   trivial avoidance, and it answers "does terrain make this game better?" in an afternoon.
2. If the answer is yes, **reefs** next (depth-dependent, so hull class matters) — they
   are the most interesting mechanic and need no new rendering beyond a colour.
3. **Proper coastlines** last, with the structural question answered first.

Do not start at step 3.
