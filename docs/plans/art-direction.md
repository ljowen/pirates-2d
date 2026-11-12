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

## Decided: the sea stays, the hulls are cel shaded

Rendered rather than argued. Because everything is procedural vector art, a palette swap
*is* an art pass — so four looks for the water (`?style=`) and four for the hulls
(`?hull=`) were built and the same seeded scene shot under each. `render/palette.ts` and
`render/hullStyle.ts`; `]` and `[` cycle them in game.

**The water keeps its current palette.** Of the alternatives, Ink & parchment failed on a
problem the plan had not anticipated — sand and parchment are the same colour, so the
islands vanished into the sea — and Admiralty chart lost the ships, which at this zoom
have too little contrast against pale water.

**The hulls are cel shaded**: flat fill, one hard shadow terminator, ink outline.

Three things the renders settled that discussion would not have:

- **The canvas hides the hull.** Under full sail the four hull treatments are nearly
  indistinguishable; they only separate when furled. **The sails are the lever**, not the
  hull — so the styles now own the sails too. A style is handed solved geometry and
  decides only how it looks; the brace, the belly, the shiver and the shrink stay in
  `ShipView`, because every one of them is a readout of how you are sailing and none of
  them is decoration. Cel canvas is a flat fill, a hard terminator on the hollow side
  nearest the yard, two seams and an ink outline — flat canvas reads as paper, panelled
  canvas reads as sail.
- **Pixel art confirmed the objection below rather than refuting it.** Cells drawn into
  the hull's own geometry rotate with the ship, so they read as a noisy vector shape, not
  as pixels. Real pixel art keeps its grid aligned to the *screen*, which needs the ship
  rendered to a low-resolution target and sampled nearest — a renderer change, not a
  drawing one. Still worth building if pixel art is ever seriously wanted, if only to see
  the shimmer honestly.
- **Judge a style at the zoom it is played at.** Cel shading was chosen from renders at
  2.6x, where a 3.4-wide ink outline looked characterful. At the default 0.75 the whole
  ship is about 45px and the same line ate the fill, leaving a dark smudge with no hull
  colour in it. The shipped weights are 2.2 and a much shallower shadow. **Inspecting a
  style close up flatters heavy line work**, which is an easy way to ship one that does
  not work.

**Original lean, kept for the reasoning: C, with the ink-line sensibility of A.** Flat vector shapes with
engraved-feeling detail lines. It is continuous with what exists, solves rotation for
free, suits a swarm, and keeps the period flavour.

## Silhouette language

Ship class must be readable at a glance in a crowd. Now handled by rig and hull shape as
well as size and colour — see [SAILING.md](../SAILING.md#every-class-has-her-own-rig). The
name label is still drawn; whether it can go is a playtest question.

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

## UI: Captain's log

The instruments and menus have one look, defined in `src/ui/theme.ts`: ink on paper, cel
shaded to match the ships — flat fill, one hard shade band, heavy ink outline, hard offset
shadow, no blur or gradients. Fonts are bundled through `@fontsource`, not fetched from a
CDN.

Three other looks were built alongside it to compare — the original dark glass and
monospace, a wood-and-brass cabin, and an Admiralty chart in navy ink — and removed once
this one was chosen, along with the key that switched between them.

### The rules

What keeps it one thing:

- **Two faces, two jobs.** Blackletter (Pirata One) only for titles with room: the end
  card, announcements, "In port", "Choose an upgrade", and ship names on the port's cards.
  Never in capitals, which in blackletter is unreadable. Everything else is the system
  monospace (`ui-monospace`). Two serifs were tried in its place, IM Fell English and then
  Old Standard TT, and neither read as easily at 14px.
- **Rubrication.** Section labels (SAILS, CONDITION, REMAINING) and eyebrows (PIRATES,
  LEVEL) are small spaced capitals in red ink, as a log book rubricated its headings. The
  draft cards' group labels already worked this way, so the HUD now matches them.
- **Everything inked.** Panels, cards, bars, key caps and compass all carry the same dark
  ink outline and hard offset shadow. A bare rectangle anywhere reads as a mistake.
- **One panel, everywhere.** HUD panels (canvas) and menu cards (DOM) are the same shape:
  `panel()` and `cardCss()` share one corner radius, outline width, 3px shadow offset and
  8px shade band. Corners are rounded rather than clipped, because the DOM cannot clip a
  corner and keep its border and shadow. Buttons and steppers are key caps (`keyCss`,
  `keyHint`): 2px ink, 2px shadow. A selected tab is a card pressed into the page, its
  shadow gone and the card shifted onto it, so selection reads as a physical state.
- **Inks, not colours.** Iron-gall brown for text, red for danger and rubrics, navy, green
  and ochre for meaning. The compass's speed ramp runs red-ochre-green in those inks rather
  than neon.
- **Paper is pale, so ink is dark.** Faint inks the HUD was built with (55% labels) are lifted
  (`C()` raises any alpha over 0.3), since dark-on-light tolerates far less transparency
  than light-on-dark.
- **Nothing under 14px.** `F()` and `Fh()` floor every size at `MIN_FONT`; the HUD's column is
  laid out for it.
- **The sea is lettered like a chart.** Text drawn on the water with no panel behind it
  (enemy names) is pale type in a dark ink halo.
- **Menus are pages.** Port and the draft sit on a near-opaque backdrop, and banners and the
  key legend are hidden under them rather than bleeding through.
- **Locked is unprinted, not transparent.** A hull out of reach is faded and desaturated.
