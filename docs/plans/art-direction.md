# Plan: art direction

**Write the direction now; make the art later.** Knowing the intended silhouette
language, palette and HUD vocabulary costs almost nothing and stops later work pulling in
different directions. The actual art should wait until the entity roster stops changing —
committing to a style before you know what is on screen means redoing it.

Everything currently on screen is procedural vector art, deliberately. Feel comes out of
motion long before it comes out of sprites, and the current look is legible enough to keep
playtesting against indefinitely.

## What is already load-bearing

Three visual decisions are *mechanics*, not decoration, and any art pass must preserve
them:

| Element | Why it must survive |
|---|---|
| **Yards bracing round with point of sail** | The rig is a readout of how you are sailing |
| **Compass rose rim painted with the polar curve** | Shows where you *could* go, not just where the wind is |
| **Gun arc wedges on the water** | Teaches "you must come abeam" with no tutorial |

Also functional: sails shrink as rigging is shot away, canvas shivers when not drawing,
hulls flash on hit, smoke drifts downwind.

## Candidate directions

### A. Period engraving

Ink-line, cross-hatched, parchment and sepia. Ships as woodcut silhouettes, the sea as
engraved swell lines.

**For:** instantly evokes the period and the source material; suits procedural generation
well (hatching is cheap); ages better than pixel art; the existing vector approach could
evolve into it rather than being replaced.
**Against:** risks being monochrome and flat; needs careful work to keep a swarm readable.

### B. Chunky pixel art

Explicitly retro, a nod to the 1987 original and to Vampire Survivors' own aesthetic.

**For:** strong nostalgic pull; readable at small sizes; a known quantity.
**Against:** the most common choice in the genre; rotation at arbitrary angles is
genuinely hard in pixel art, and this game rotates everything constantly. **This is a
serious technical objection** — ships point in every direction.

### C. Clean flat vector, stylised

Evolve what exists: flat colour, strong silhouettes, limited palette, generous use of
shape to carry information.

**For:** continuous with the current codebase; rotation is free; scales to many entities;
easy to keep readable.
**Against:** risks looking like a prototype forever; needs real design discipline to feel
intentional rather than unfinished.

### D. Painterly top-down

Richer, textured, closer to the 2004 Pirates! remake.

**For:** most visually impressive ceiling.
**Against:** by far the most asset-hungry, and the least suited to procedural generation.

**Current lean: C, with the ink-line sensibility of A.** Flat vector shapes with
engraved-feeling detail lines. It is continuous with what exists, solves rotation for
free, suits a swarm, and keeps the period flavour.

## Silhouette language

Ship class must be readable at a glance in a crowd. Currently handled by size and colour
plus a name label — the label is a crutch that should eventually not be needed.

Suggested axes:
- **Length and beam ratio** — a Pinnace is short and fine, a Brigantine long and full
- **Number of masts** — the clearest period-correct signal
- **Sail plan** — fore-and-aft versus square rig reads differently even from above
- **Colour for allegiance**, not class — if nations ever matter

## Palette

Needs to work across the weather states proposed in [scenario.md](scenario.md): clear,
overcast, squall, night. That argues for a palette defined as a small set of roles — deep
water, shallow water, foam, hull, canvas, hostile, plunder, danger — which each weather
state re-tints, rather than a fixed set of colours.

The HUD already uses a consistent accent set worth formalising: cyan for information,
amber for the player and attention, red for threat, green for ready.

## HUD

The current instruments are functional and dense. A pass should ask:

- **Can the compass rose carry more?** It already shows wind, heading and the polar
  curve. Enemy bearings would suit it.
- **Should condition be diegetic?** Damage already shows on the ship itself — shrinking
  sails, hit flashes. Bars may be redundant for rigging.
- **The run bar is doing a lot.** Clock, level, plunder, kills, progress. Worth splitting.
- **Boss announcements deserve more weight** — currently one line of text for what should
  feel like a moment.

## Inspirations worth collecting

Not yet gathered — this is the first task of an art pass.

- *Sid Meier's Pirates!* (1987 and 2004) — the source
- Age of Sail period engravings and marine painting — for the ink-line direction
- *Vampire Survivors* — for swarm readability under pressure, which is the hard problem
- *FTL* — for making a schematic, diegetic HUD feel like part of the world
- *Sunless Sea* — for atmosphere and for how little visual information a sea game needs

## When to start

After [balance](balance.md) and ideally after
[combat refinement](combat-refinement.md), since new shot types and enemy behaviours will
all want visual identity. Starting earlier means drawing things twice.

The exception is **collecting references and writing the style guide**, which can happen
any time and should.
