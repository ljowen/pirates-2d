/**
 * Every colour on screen, named by the job it does rather than by what it is.
 *
 * Two reasons it is worth the indirection. The weather states this game is
 * heading for — clear, overcast, squall, night — want to re-*tint* the sea
 * rather than re-specify it, which is only possible if "deep water" is a role
 * something fills. And a style is otherwise 200-odd literals scattered over
 * eleven files, which makes comparing two looks a refactor instead of a
 * decision.
 *
 * Because the whole game is procedural vector art, a palette swap *is* an art
 * pass: there are no assets to redraw. That is what makes it worth rendering
 * the same seeded scene under each candidate and choosing from pictures.
 */
export interface ShipColors { hull: number; deck: number; trim: number; canvas: number }

export interface Palette {
  id: string
  name: string
  blurb: string

  water: { deep: number; light: number; swell: number; gustDark: number; gustLight: number }
  /** Four contours, palest innermost: how shallow a bar is, is how pale it is. */
  reef: [number, number, number, number]
  shoal: { outer: number; inner: number; surfOuter: number; surfInner: number }
  land: { beach: number; sand: number; scrub: number; scrubDark: number; inland: number; edge: number }
  /** What stands on the land: the kind of tree a place grows, and its rock. */
  flora: { kind: 'palm' | 'jungle' | 'cypress'; tree: number; treeDark: number; rock: number; rockDark: number }
  ship: { shadow: number; spar: number; line: number; canvas: number; hit: number }
  combat: { splash: number; shotCore: number; shotHalo: number; flash: number; flashCore: number; spray: number }
  weather: { squallShadow: number; squallRim: number; rain: number }
  wake: number
  coin: { body: number; drawn: number; glow: number; edge: number; highlight: number }
  /** The HUD's accent vocabulary: information, attention, threat, ready, ink. */
  hud: { info: string; attention: string; threat: string; ready: string; ink: string }

  /**
   * Re-tint a hull's own colours. Ship colour currently carries class
   * identity, so a style cannot simply override it — this lets a look own the
   * palette while keeping hulls distinguishable from one another.
   */
  shipTint: (c: ShipColors) => ShipColors
}

const asIs = (c: ShipColors) => c

/** Pull a colour toward a target, for styles that flatten hull identity. */
function toward(c: number, target: number, t: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255
  const tr = (target >> 16) & 255, tg = (target >> 8) & 255, tb = target & 255
  const m = (a: number, bb: number) => Math.round(a + (bb - a) * t)
  return (m(r, tr) << 16) | (m(g, tg) << 8) | m(b, tb)
}

const CURRENT: Palette = {
  id: 'current', name: 'Caribbean', blurb: 'Clear blue water, turquoise shallows, palms on pale sand.',
  water: { deep: 0x2e6f94, light: 0x55a0c4, swell: 0xdcf2ff, gustDark: 0x14455f, gustLight: 0xcbeaf7 },
  reef: [0x78c0da, 0x9fd9e8, 0xc7ecf4, 0xe6f6fa],
  shoal: { outer: 0x79c3dd, inner: 0x9ad8e8, surfOuter: 0xeaf7fb, surfInner: 0xfdfefe },
  land: { beach: 0xe8d9a8, sand: 0xbfae79, scrub: 0x6f8a52, scrubDark: 0x55703f, inland: 0x6b7d58, edge: 0xc9b584 },
  flora: { kind: 'palm', tree: 0x3f7a3a, treeDark: 0x2c5a2c, rock: 0x8f8a80, rockDark: 0x5f5a54 },
  ship: { shadow: 0x041420, spar: 0x4a3b22, line: 0xb9a88a, canvas: 0xfdfefe, hit: 0xffd0d0 },
  combat: { splash: 0xd8d8d0, shotCore: 0x120d08, shotHalo: 0xffffff, flash: 0xffb347, flashCore: 0xfff1cf, spray: 0xdff2ff },
  weather: { squallShadow: 0x0f2334, squallRim: 0xb6d6e6, rain: 0xc9e4f2 },
  wake: 0xffffff,
  coin: { body: 0xf0c14b, drawn: 0xffe9a8, glow: 0xffd98a, edge: 0x8a5a14, highlight: 0xfff6d8 },
  hud: { info: '#cfe6f5', attention: '#ffd98a', threat: '#ff7a6b', ready: '#7fe0a0', ink: '4,14,24' },
  shipTint: asIs,
}

/**
 * Parchment and ink. The engraving direction from the art plan, done in flat
 * vector rather than hatching: a pale sea, sepia land, and every edge a dark
 * line. Hull colours are pulled most of the way to ink so the fleet reads as
 * drawn rather than painted.
 */
const INK: Palette = {
  id: 'ink', name: 'Ink & parchment', blurb: 'Period engraving: pale sea, sepia land, every edge a line.',
  water: { deep: 0xcdbb97, light: 0xdbcba9, swell: 0xf3e9d2, gustDark: 0x8a7a58, gustLight: 0xf6efdc },
  reef: [0xc0ab84, 0xd0bd98, 0xe0d1b0, 0xeee3c8],
  shoal: { outer: 0xc4b08b, inner: 0xd6c6a3, surfOuter: 0xf2e8d1, surfInner: 0xfbf5e6 },
  land: { beach: 0xbda77c, sand: 0xa58e64, scrub: 0x7d6b48, scrubDark: 0x635435, inland: 0x8a7753, edge: 0x3a2c18 },
  flora: { kind: 'palm', tree: 0x5e4f30, treeDark: 0x43371f, rock: 0x8a7753, rockDark: 0x4a3a22 },
  ship: { shadow: 0x4a3a22, spar: 0x241a0c, line: 0x5e4a2c, canvas: 0xfbf5e6, hit: 0xffc9b0 },
  combat: { splash: 0xf3e9d2, shotCore: 0x1a1208, shotHalo: 0xfbf5e6, flash: 0xc98b34, flashCore: 0xf6e3b8, spray: 0xe8dcc0 },
  weather: { squallShadow: 0x4a3a22, squallRim: 0x6b5a38, rain: 0x8a7a58 },
  wake: 0xfbf5e6,
  coin: { body: 0xc89a35, drawn: 0xe0b852, glow: 0xd8ae48, edge: 0x5e4216, highlight: 0xf3e0a8 },
  hud: { info: '#4a3a22', attention: '#8a6a1e', threat: '#9b3a28', ready: '#4a6b3a', ink: '36,26,12' },
  shipTint: (c) => ({
    hull: toward(c.hull, 0x3a2c18, 0.55),
    deck: toward(c.deck, 0x6e5a38, 0.5),
    trim: toward(c.trim, 0x241a0c, 0.6),
    canvas: toward(c.canvas, 0xfbf5e6, 0.7),
  }),
}

/**
 * Dusk. Deep indigo water, warm lamplight on the hulls, hard silhouettes —
 * the highest-contrast of the candidates, and the one that most makes a
 * swarm read as shapes rather than as detail.
 */
const NOCTURNE: Palette = {
  id: 'nocturne', name: 'Nocturne', blurb: 'Dusk: indigo sea, lamplit hulls, hard silhouettes.',
  water: { deep: 0x142a44, light: 0x224263, swell: 0x8fb6d8, gustDark: 0x0b1a2c, gustLight: 0x9ec4e0 },
  reef: [0x2d5a78, 0x3f6f91, 0x5c8fae, 0x86b3cc],
  shoal: { outer: 0x2c5471, inner: 0x3e6f8e, surfOuter: 0xa8c8dd, surfInner: 0xd4e6f2 },
  land: { beach: 0x6b5f45, sand: 0x4f4634, scrub: 0x33452f, scrubDark: 0x253523, inland: 0x3c4a33, edge: 0x7d6f50 },
  flora: { kind: 'palm', tree: 0x1f3320, treeDark: 0x142416, rock: 0x4a4a4e, rockDark: 0x2a2a30 },
  ship: { shadow: 0x030a14, spar: 0x1a1710, line: 0xc4a46a, canvas: 0xe8dfc6, hit: 0xffb0a0 },
  combat: { splash: 0xaac4d4, shotCore: 0x05080c, shotHalo: 0xdfeaf4, flash: 0xffc266, flashCore: 0xfff3d0, spray: 0xbcd8ea },
  weather: { squallShadow: 0x050d18, squallRim: 0x7f9fc0, rain: 0x9fc0d8 },
  wake: 0xd8e8f4,
  coin: { body: 0xf5c64e, drawn: 0xffe9a8, glow: 0xffcf6a, edge: 0x6b4a10, highlight: 0xfff6d8 },
  hud: { info: '#bcd8ea', attention: '#ffc266', threat: '#ff6b5a', ready: '#6fd898', ink: '3,8,16' },
  shipTint: (c) => ({
    hull: toward(c.hull, 0x241d14, 0.45),
    deck: toward(c.deck, 0xb08c50, 0.3),
    trim: toward(c.trim, 0x0d0a06, 0.5),
    canvas: toward(c.canvas, 0xe8dfc6, 0.4),
  }),
}

/**
 * An Admiralty chart. Flat pale sea, crisp depth contours, land as a muted
 * fill with a hard coastline. The most legible of the four and the one that
 * suits the instruments already on screen — the lead line and the polar rim
 * are chart furniture to begin with.
 */
const CHART: Palette = {
  id: 'chart', name: 'Admiralty chart', blurb: 'Flat pale sea, crisp depth contours, hard coastlines.',
  water: { deep: 0x9fc4d8, light: 0xb4d4e4, swell: 0xe8f4fa, gustDark: 0x7fa8c0, gustLight: 0xe4f2f8 },
  reef: [0xb8dcea, 0xcde8f2, 0xdef2f8, 0xeff8fd],
  shoal: { outer: 0xbfe0ee, inner: 0xd6ecf5, surfOuter: 0xf0fafd, surfInner: 0xffffff },
  land: { beach: 0xe8dcc0, sand: 0xdccfa8, scrub: 0xc9bd92, scrubDark: 0xb4a87e, inland: 0xd2c69c, edge: 0x5a4a2c },
  flora: { kind: 'cypress', tree: 0x9c9670, treeDark: 0x7d7856, rock: 0xb0a890, rockDark: 0x7a705a },
  ship: { shadow: 0x2a3540, spar: 0x2a2318, line: 0x7a6a4c, canvas: 0xffffff, hit: 0xffb8b0 },
  combat: { splash: 0xe8f4fa, shotCore: 0x1a1a1a, shotHalo: 0xffffff, flash: 0xe08a30, flashCore: 0xffe0a0, spray: 0xdff0fa },
  weather: { squallShadow: 0x5a7a90, squallRim: 0x8fb4c8, rain: 0xaccee0 },
  wake: 0xffffff,
  coin: { body: 0xd4a52c, drawn: 0xf0c94e, glow: 0xe8bc44, edge: 0x6b4e12, highlight: 0xfae8b0 },
  hud: { info: '#2a4a5c', attention: '#a8700c', threat: '#b03020', ready: '#2f7a4a', ink: '26,34,42' },
  shipTint: (c) => ({
    hull: toward(c.hull, 0x4a4030, 0.35),
    deck: toward(c.deck, 0xcdbd95, 0.4),
    trim: toward(c.trim, 0x201a10, 0.4),
    canvas: toward(c.canvas, 0xffffff, 0.6),
  }),
}

/**
 * Sunset. The sea goes dusky violet and takes the sky's colour on every
 * crest; sand and canvas turn warm. Shallows read as pale rose rather than
 * turquoise, which keeps the one rule that matters: paler is shallower.
 */
const SUNSET: Palette = {
  id: 'sunset', name: 'Sunset', blurb: 'Violet water, crests lit orange, warm sand and canvas.',
  water: { deep: 0x46508a, light: 0xa07ea8, swell: 0xffd6a6, gustDark: 0x2c3264, gustLight: 0xffc49a },
  reef: [0x7f83b4, 0xa79cc0, 0xd8b6bc, 0xf6dcc6],
  shoal: { outer: 0x7c84b6, inner: 0xa59fc4, surfOuter: 0xf7dccd, surfInner: 0xfff2e4 },
  land: { beach: 0xeabf8e, sand: 0xc89466, scrub: 0x66704c, scrubDark: 0x4b563c, inland: 0x716f52, edge: 0x8e5e40 },
  flora: { kind: 'palm', tree: 0x3f5a3a, treeDark: 0x2a3f2c, rock: 0x8a7078, rockDark: 0x54424e },
  ship: { shadow: 0x18122e, spar: 0x3a2a1c, line: 0xc9a078, canvas: 0xfff0dc, hit: 0xffc4b4 },
  combat: { splash: 0xf0dcd0, shotCore: 0x140c10, shotHalo: 0xfff4e8, flash: 0xffa23c, flashCore: 0xfff0c8, spray: 0xffe6d6 },
  weather: { squallShadow: 0x1a1434, squallRim: 0xdcaab4, rain: 0xf2d2cc },
  wake: 0xffe9d6,
  coin: { body: 0xf5c64e, drawn: 0xffe9a8, glow: 0xffcf6a, edge: 0x7a4e10, highlight: 0xfff6d8 },
  hud: { info: '#f2d2cc', attention: '#ffc266', threat: '#ff6b5a', ready: '#9fd898', ink: '24,18,46' },
  shipTint: (c) => ({
    hull: toward(c.hull, 0x5a2e22, 0.18),
    deck: toward(c.deck, 0xd89a5c, 0.2),
    trim: c.trim,
    canvas: toward(c.canvas, 0xffe6c4, 0.5),
  }),
}

/**
 * The Mediterranean. Hard ultramarine water, bone-pale limestone, dry olive
 * scrub and dark cypress. Less green than anywhere else, and more glare.
 */
const MEDITERRANEAN: Palette = {
  id: 'mediterranean', name: 'Mediterranean', blurb: 'Ultramarine water, pale limestone, olive scrub and cypress.',
  water: { deep: 0x2060a8, light: 0x4c92d4, swell: 0xe4f2ff, gustDark: 0x123f7a, gustLight: 0xd0e6fa },
  reef: [0x4ea4d8, 0x7cc4e8, 0xb2e0f2, 0xe2f5fb],
  shoal: { outer: 0x4aa4da, inner: 0x7ccaea, surfOuter: 0xecf8fd, surfInner: 0xffffff },
  land: { beach: 0xf2e9d2, sand: 0xdccfa8, scrub: 0x97a064, scrubDark: 0x76824c, inland: 0xb0a274, edge: 0xb9aa84 },
  flora: { kind: 'cypress', tree: 0x3f5636, treeDark: 0x2a3d26, rock: 0xd8d0bc, rockDark: 0x9c927c },
  ship: { shadow: 0x06183a, spar: 0x4a3b22, line: 0xb9a88a, canvas: 0xfefefa, hit: 0xffd0d0 },
  combat: { splash: 0xdfe6ea, shotCore: 0x100c08, shotHalo: 0xffffff, flash: 0xffb347, flashCore: 0xfff1cf, spray: 0xe2f2ff },
  weather: { squallShadow: 0x0c1c3a, squallRim: 0xb8d0ea, rain: 0xcfe2f4 },
  wake: 0xffffff,
  coin: { body: 0xf0c14b, drawn: 0xffe9a8, glow: 0xffd98a, edge: 0x8a5a14, highlight: 0xfff6d8 },
  hud: { info: '#cfe6f5', attention: '#ffd98a', threat: '#ff7a6b', ready: '#7fe0a0', ink: '4,14,34' },
  shipTint: asIs,
}

/**
 * The East Indies. Green-teal water over dark volcanic sand, and jungle
 * right down to the shore: the lushest land and the least beach.
 */
const INDIES: Palette = {
  id: 'indies', name: 'East Indies', blurb: 'Teal water, dark volcanic sand, jungle to the shoreline.',
  water: { deep: 0x1f7078, light: 0x44aaa2, swell: 0xdafff2, gustDark: 0x104a54, gustLight: 0xc6f2e6 },
  reef: [0x50bfb0, 0x80d9c6, 0xb4ecd9, 0xe3f8ee],
  shoal: { outer: 0x4ab8ac, inner: 0x7ad6c4, surfOuter: 0xe6f8f0, surfInner: 0xfbfffd },
  land: { beach: 0xb9ad94, sand: 0x7e7668, scrub: 0x35803f, scrubDark: 0x23622e, inland: 0x2c6e36, edge: 0x5c564a },
  flora: { kind: 'jungle', tree: 0x1f6a2c, treeDark: 0x124a1e, rock: 0x5a5650, rockDark: 0x34312e },
  ship: { shadow: 0x04201c, spar: 0x4a3b22, line: 0xb9a88a, canvas: 0xfdfefa, hit: 0xffd0d0 },
  combat: { splash: 0xd8e0d8, shotCore: 0x100c08, shotHalo: 0xffffff, flash: 0xffb347, flashCore: 0xfff1cf, spray: 0xdff8ee },
  weather: { squallShadow: 0x0a2426, squallRim: 0xb4dcd4, rain: 0xc8eae2 },
  wake: 0xffffff,
  coin: { body: 0xf0c14b, drawn: 0xffe9a8, glow: 0xffd98a, edge: 0x8a5a14, highlight: 0xfff6d8 },
  hud: { info: '#cfe6f5', attention: '#ffd98a', threat: '#ff7a6b', ready: '#7fe0a0', ink: '4,24,24' },
  shipTint: asIs,
}

export const PALETTES: Palette[] = [CURRENT, SUNSET, MEDITERRANEAN, INDIES, INK, NOCTURNE, CHART]

let active: Palette = CURRENT

/** The palette everything draws from. Read per frame; never cached. */
export const P = () => active

export function setPalette(id: string): Palette {
  active = PALETTES.find((p) => p.id === id) ?? CURRENT
  return active
}

/**
 * A palette asked for in the address with `?style=`, which then overrides
 * every location's own. Without one, each location sets its palette as the
 * voyage starts, and the things that keep colour (the water's textures, the
 * drawn land, the ship views) are rebuilt then.
 */
export function paletteFromLocation(search: string): Palette | null {
  const m = /[?&]style=([a-z]+)/i.exec(search)
  return m ? setPalette(m[1].toLowerCase()) : null
}
