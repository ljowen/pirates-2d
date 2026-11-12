/**
 * How the instruments and menus look, as opposed to the sea and the ships.
 *
 * A third axis beside the sea palette and the hull style, switched the same
 * way (`?ui=`, or `\` to cycle), so the candidates can be compared in play
 * rather than argued about. `modern` is the look the game had: dark glass and
 * monospace. The others are old-timey and cel shaded to match the ships —
 * flat fills, one hard shade band, a heavy ink outline and a hard offset
 * shadow, no blur and no gradients anywhere.
 *
 * The HUD was written against a fixed set of colours. Rather than thread a
 * token through every line, each theme remaps those colours by hue, keeping
 * their alpha, so the HUD's own hierarchy (55% labels, 14% tracks) carries
 * over to dark ink on paper as readily as to light text on glass.
 */

export interface UiTheme {
  id: string
  name: string
  blurb: string
  /** Paper or wood: text drawn over the sea needs a plaque behind it. */
  plaques: boolean
  font: {
    /** Values and anything bold: has to read at 12–16px. */
    display: string
    /** Big titles only — the end card, announcements, menu headings. Can be decorative. */
    heading: string
    /** Labels and body text. */
    body: string
    /** Size multipliers, because a serif at 11px reads smaller than a monospace. */
    displayScale: number
    bodyScale: number
    /** Display faces with no lowercase look shouty in long strings; this caps them. */
    displayWeight: string
  }
  panel: {
    fill: string
    /** The single hard shade band along the bottom. */
    shade: string
    ink: string
    inkWidth: number
    /** Hard offset shadow, no blur. */
    shadow: string
    shadowOffset: number
    /** Clipped-corner size, 0 for square. */
    corner: number
    /** An inner rule a few pixels in: brass trim, or a chart's double border. */
    rule: string | null
  }
  /** What each of the HUD's original colours becomes. */
  ink: {
    text: string
    accent: string
    good: string
    bad: string
    info: string
    gun: string
    warn: string
    endless: string
    gold: string
  }
  /** Full-screen wash behind the end card. */
  overlay: string
  /** The menus' backdrop, and the light inks drawn straight onto it rather than onto a card. */
  menu: { backdrop: string; text: string; dim: string; gold: string; good: string; heading: string }
  /**
   * Section labels on panels — SAILS, CONDITION. A log book rubricated its
   * headings in red ink; this is that, and it is what separates a label from
   * the value under it when both are in the same face.
   */
  rubric: string
  /** Shipped draft-card group colours, remapped to inks that read on this panel. */
  groups: { Sailing: string; Gunnery: string; Shot: string; Quarterdeck: string }
}

// Single-quoted names throughout: these strings go into inline style="…"
// attributes, where a double quote ends the attribute and the face silently
// falls back to the browser default.
const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif"

const MODERN: UiTheme = {
  id: 'modern', name: 'Modern', blurb: 'Dark glass and monospace. The control.',
  plaques: false,
  font: {
    display: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    heading: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    body: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    displayScale: 1, bodyScale: 1, displayWeight: 'bold',
  },
  panel: {
    fill: 'rgba(6,20,32,0.72)', shade: 'rgba(6,20,32,0)', ink: 'rgba(0,0,0,0)', inkWidth: 0,
    shadow: 'rgba(0,0,0,0)', shadowOffset: 0, corner: 0, rule: null,
  },
  ink: {
    text: '#ffffff', accent: '#ffd98a', good: '#7fe0a0', bad: '#ff7a6b', info: '#9fe8ff',
    gun: '#ffbe6e', warn: '#ffd27f', endless: '#ff9ad5', gold: '#f0c14b',
  },
  overlay: 'rgba(4,14,24,0.74)',
  rubric: 'rgba(255,255,255,0.55)',
  menu: {
    backdrop: 'rgba(4,14,24,0.92)', text: '#cfe6f5', dim: 'rgba(207,230,245,0.45)',
    gold: '#f0c14b', good: '#7fe0a0', heading: '#ffd98a',
  },
  groups: { Sailing: '#9fe8ff', Gunnery: '#ffbe6e', Shot: '#ff9ad5', Quarterdeck: '#7fe0a0' },
}

/** Ink on aged paper: a ship's log. */
const LOG: UiTheme = {
  id: 'log', name: "Captain's log", blurb: 'Ink on paper: blackletter titles, rubricated labels, a 19th-century serif for everything read.',
  plaques: true,
  // It used IM Fell English throughout, with blackletter for every value.
  // Fell is thin at 11px and has old-style figures (0 and 1 read as o and I),
  // and blackletter made "Courses" or "Beam Reach" a puzzle. Old Standard is
  // just as period, sturdier, and has lining figures; blackletter is kept
  // for titles, where it has room.
  font: {
    display: `'Old Standard TT', ${SERIF_FALLBACK}`,
    heading: `'Pirata One', ${SERIF_FALLBACK}`,
    body: `'Old Standard TT', ${SERIF_FALLBACK}`,
    displayScale: 1.02, bodyScale: 1.04, displayWeight: 'bold',
  },
  panel: {
    fill: '#f0e3c4', shade: '#dcc79a', ink: '#2a180c', inkWidth: 2.5,
    shadow: 'rgba(26,14,6,0.62)', shadowOffset: 3, corner: 7, rule: null,
  },
  ink: {
    text: '#22140a', accent: '#8a3f08', good: '#2f5e18', bad: '#a01d12', info: '#1a4766',
    gun: '#a8540a', warn: '#8a5800', endless: '#7c255f', gold: '#8a3f08',
  },
  overlay: 'rgba(20,12,6,0.5)',
  rubric: '#9a2a17',
  menu: {
    backdrop: 'rgba(26,16,8,0.95)', text: '#efe0bd', dim: 'rgba(239,224,189,0.55)',
    gold: '#f0c14b', good: '#b5df8f', heading: '#f0c14b',
  },
  groups: { Sailing: '#22506e', Gunnery: '#b5600e', Shot: '#86306a', Quarterdeck: '#3b6a22' },
}

/** Dark planking trimmed in brass: a tavern sign, or a captain's cabin. */
const CABIN: UiTheme = {
  id: 'cabin', name: "Captain's cabin", blurb: 'Dark wood trimmed in brass, cream lettering.',
  plaques: true,
  font: {
    display: `'Pirata One', ${SERIF_FALLBACK}`,
    heading: `'Pirata One', ${SERIF_FALLBACK}`,
    body: `'Alegreya', ${SERIF_FALLBACK}`,
    displayScale: 1.12, bodyScale: 1.06, displayWeight: 'normal',
  },
  panel: {
    fill: '#4a2e1b', shade: '#3a2314', ink: '#120904', inkWidth: 3,
    shadow: 'rgba(0,0,0,0.6)', shadowOffset: 3, corner: 5, rule: '#c9973a',
  },
  ink: {
    text: '#f4e4c1', accent: '#f2c14e', good: '#a7d97c', bad: '#ff7f5e', info: '#9fd3e6',
    gun: '#ffb35c', warn: '#ffd27f', endless: '#ff9ad5', gold: '#f2c14e',
  },
  overlay: 'rgba(10,5,2,0.55)',
  rubric: '#c9973a',
  menu: {
    backdrop: 'rgba(18,10,5,0.95)', text: '#f4e4c1', dim: 'rgba(244,228,193,0.55)',
    gold: '#f2c14e', good: '#a7d97c', heading: '#f2c14e',
  },
  groups: { Sailing: '#9fd3e6', Gunnery: '#ffb35c', Shot: '#ff9ad5', Quarterdeck: '#a7d97c' },
}

/** Navy ink on chart paper, engraved capitals: the Admiralty's own. */
const CHART: UiTheme = {
  id: 'chart', name: 'Admiralty chart', blurb: 'Navy ink on chart paper, engraved capitals, ruled borders.',
  plaques: true,
  font: {
    display: `'Cinzel', ${SERIF_FALLBACK}`,
    heading: `'Cinzel', ${SERIF_FALLBACK}`,
    body: `'EB Garamond', ${SERIF_FALLBACK}`,
    displayScale: 0.98, bodyScale: 1.12, displayWeight: 'bold',
  },
  panel: {
    fill: '#f1e9d2', shade: '#dcd0ae', ink: '#1e2f4a', inkWidth: 2.5,
    shadow: 'rgba(15,25,45,0.55)', shadowOffset: 3, corner: 0, rule: '#1e2f4a',
  },
  ink: {
    text: '#1e2f4a', accent: '#8a5410', good: '#2f6b3a', bad: '#ab2f25', info: '#2a5d8f',
    gun: '#c0601a', warn: '#946200', endless: '#7a2f6a', gold: '#8a5410',
  },
  overlay: 'rgba(10,18,32,0.5)',
  rubric: '#ab2f25',
  menu: {
    backdrop: 'rgba(14,24,40,0.95)', text: '#ece3c8', dim: 'rgba(236,227,200,0.55)',
    gold: '#e8bf62', good: '#9fd49a', heading: '#ece3c8',
  },
  groups: { Sailing: '#2a5d8f', Gunnery: '#c0601a', Shot: '#7a2f6a', Quarterdeck: '#2f6b3a' },
}

export const UI_THEMES: UiTheme[] = [LOG, CABIN, CHART, MODERN]

let active: UiTheme = LOG
export const ui = () => active

export function setUiTheme(id: string): UiTheme {
  active = UI_THEMES.find((t) => t.id === id) ?? LOG
  return active
}

/**
 * Chosen from the URL at load, before any UI is built — the menus bake their
 * colours in when they render, so the theme cannot change mid-session. A
 * comparison reloads, as the sea palette and hull style already do.
 */
if (typeof window !== 'undefined') {
  const m = /[?&]ui=([a-z]+)/i.exec(window.location.search)
  setUiTheme(m ? m[1].toLowerCase() : LOG.id)
}

// --- Colour ------------------------------------------------------------------

function parse(c: string): [number, number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(c)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(c)
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3], rgb[4] === undefined ? 1 : +rgb[4]]
  return null
}

/** The HUD's original palette, by RGB, and which ink each one stands for. */
const ROLES: Record<string, keyof UiTheme['ink']> = {
  '255,255,255': 'text',
  '207,230,245': 'text',
  '255,217,138': 'accent',
  '127,224,160': 'good',
  '159,232,255': 'info',
  '159,196,216': 'info',
  '255,122,107': 'bad',
  '255,190,110': 'gun',
  '255,210,127': 'warn',
  '255,214,138': 'warn',
  '255,154,213': 'endless',
  '240,193,75': 'gold',
  '8,20,30': 'text',
}

/**
 * One of the HUD's original colours, in this theme's ink. Alpha is kept, so a
 * faint white track becomes a faint ink track. Anything not in the table —
 * the speed ramp on the rose, a class colour — passes through unchanged.
 */
export function C(original: string, alpha?: number): string {
  const p = parse(original)
  if (!p) return original
  const role = ROLES[`${p[0]},${p[1]},${p[2]}`]
  let a = alpha ?? p[3]
  // On a pale panel the faint inks the HUD was built with (55% labels, 70%
  // secondary text) are washed out: light-on-dark tolerates low alpha far
  // better than dark-on-light. Anything meant to be read is lifted; tracks
  // and hairlines, below 30%, are left nearly as they were.
  if (role && paleTheme()) a = a >= 0.3 ? 0.62 + 0.38 * a : a * 1.25
  const target = role ? parse(active.ink[role]) : p
  if (!target) return original
  if (a >= 1) return `rgb(${target[0]},${target[1]},${target[2]})`
  return `rgba(${target[0]},${target[1]},${target[2]},${a})`
}

// --- Type --------------------------------------------------------------------

/** A title in the heading face, which may be decorative. */
export function Fh(px: number): string {
  const f = active.font
  return `${size(px * (f.heading === f.display ? f.displayScale : 1.12))}px ${f.heading}`
}

/** A canvas font string: bold is the display face, regular is the body face. */
export function F(px: number, bold = false): string {
  const f = active.font
  return bold
    ? `${f.displayWeight === 'bold' ? 'bold ' : ''}${size(px * f.displayScale)}px ${f.display}`
    : `${size(px * f.bodyScale)}px ${f.body}`
}

/**
 * Nothing the game sets is smaller than this. Anything asked for below it
 * is raised to it, so a stray 10px label cannot creep back in.
 */
export const MIN_FONT = 14

function size(px: number): string {
  return Math.max(MIN_FONT, px).toFixed(1)
}

/**
 * Ask the browser for the theme's faces up front. Canvas text does not
 * trigger a webfont load by itself, so without this the first frames — and
 * any frame drawn before the face happened to load — fall back to Georgia.
 */
export function loadUiFonts(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve()
  const f = active.font
  return Promise.all([
    document.fonts.load(`20px ${f.display}`),
    document.fonts.load(`20px ${f.heading}`),
    document.fonts.load(`${f.displayWeight === 'bold' ? 'bold ' : ''}20px ${f.display}`),
    document.fonts.load(`14px ${f.body}`),
  ]).catch(() => undefined)
}

// --- Canvas panels -------------------------------------------------------------

function outline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, round: boolean) {
  ctx.beginPath()
  if (round) {
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
  } else {
    // Clipped corners: the cut of a sign board or a label, not a phone UI.
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.lineTo(x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.lineTo(x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.lineTo(x, y + h - r)
    ctx.lineTo(x, y + r)
  }
  ctx.closePath()
}

/**
 * A panel. In a cel theme: hard shadow, flat fill, one hard shade band along
 * the bottom, an optional inner rule, and the ink outline last so nothing
 * paints over it — the same order the hull style draws a ship in.
 */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const t = active.panel
  ctx.save()
  if (active.id === MODERN.id) {
    ctx.fillStyle = t.fill
    outline(ctx, x, y, w, h, 6, true)
    ctx.fill()
    ctx.restore()
    return
  }
  // Rounded, not clipped: the menus are DOM, and a clipped corner cannot
  // carry a border and a hard shadow there, so the HUD and the menus share
  // the one shape both can draw — the same radius, outline, offset and band.
  const c = t.corner
  const round = c > 0
  const o = t.shadowOffset
  ctx.fillStyle = t.shadow
  outline(ctx, x + o, y + o, w, h, c, round)
  ctx.fill()

  outline(ctx, x, y, w, h, c, round)
  ctx.fillStyle = t.fill
  ctx.fill()
  ctx.save()
  ctx.clip()
  const band = Math.min(BAND, h * 0.16)
  ctx.fillStyle = t.shade
  ctx.fillRect(x, y + h - band, w, band)
  ctx.restore()

  if (t.rule) {
    const i = 4
    outline(ctx, x + i, y + i, w - i * 2, h - i * 2, Math.max(0, c - 3), round)
    ctx.strokeStyle = t.rule
    ctx.lineWidth = 1
    ctx.stroke()
  }
  outline(ctx, x, y, w, h, c, round)
  ctx.strokeStyle = t.ink
  ctx.lineWidth = t.inkWidth
  ctx.stroke()
  ctx.restore()
}

/** Height of the hard shade band along a panel's foot, on canvas and in CSS alike. */
const BAND = 8

/** A round panel, for the compass. */
export function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const t = active.panel
  ctx.save()
  if (active.id === MODERN.id) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = t.fill
    ctx.fill()
    ctx.restore()
    return
  }
  ctx.beginPath()
  ctx.arc(cx + t.shadowOffset, cy + t.shadowOffset, r, 0, Math.PI * 2)
  ctx.fillStyle = t.shadow
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = t.fill
  ctx.fill()
  if (t.rule) {
    ctx.beginPath()
    ctx.arc(cx, cy, r - 4, 0, Math.PI * 2)
    ctx.strokeStyle = t.rule
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = t.ink
  ctx.lineWidth = t.inkWidth
  ctx.stroke()
  ctx.restore()
}

/**
 * Text that sits over the sea. In a paper or wood theme the inks are dark,
 * so the text gets a small panel of its own; in the modern theme it is drawn
 * bare, as it always was. Uses the caller's font, colour and baseline.
 */
export function plaque(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  if (active.plaques) {
    const m = ctx.measureText(text)
    const asc = m.actualBoundingBoxAscent || 12
    const desc = m.actualBoundingBoxDescent || 4
    const left = ctx.textAlign === 'center' ? x - m.width / 2
      : ctx.textAlign === 'right' || ctx.textAlign === 'end' ? x - m.width : x
    const fill = ctx.fillStyle
    panel(ctx, left - 10, y - asc - 6, m.width + 20, asc + desc + 12)
    ctx.fillStyle = fill
  }
  ctx.fillText(text, x, y)
}

// --- DOM -----------------------------------------------------------------------

/** CSS for a menu card or panel: the DOM half of `panel`. */
export function cardCss(): string {
  const t = active.panel
  if (active.id === MODERN.id) return 'background: rgba(8,24,38,0.95); border-radius: 8px;'
  return `
    background: ${t.fill};
    border: ${t.inkWidth}px solid ${t.ink};
    border-radius: ${t.corner}px;
    box-shadow: ${restShadow()};`
}

function restShadow(): string {
  const t = active.panel
  return `${t.shadowOffset}px ${t.shadowOffset}px 0 ${t.shadow}, inset 0 -${BAND}px 0 ${t.shade}` +
    (t.rule ? `, inset 0 0 0 3px ${t.fill}, inset 0 0 0 4px ${t.rule}` : '')
}

/**
 * A card pressed into the page: no shadow, shifted onto where it was. The
 * selected tab and a held button, so "selected" reads as a physical state
 * rather than a colour.
 */
export function cardPressedCss(): string {
  const t = active.panel
  if (active.id === MODERN.id) return ''
  return `${cardCss()} box-shadow: inset 0 -${BAND}px 0 ${t.shade}; ` +
    `transform: translate(${t.shadowOffset}px, ${t.shadowOffset}px);`
}

/** A small key cap: the DOM twin of `keyHint`'s key, for steppers and toggles. */
export function keyCss(enabled = true): string {
  const t = active.panel
  return `background: ${t.fill}; border: 2px solid ${t.ink}; border-radius: ${Math.min(4, t.corner)}px; ` +
    `box-shadow: 2px 2px 0 ${t.ink}; opacity: ${enabled ? 1 : 0.35};`
}

/** The lifted state of a card under the pointer: the shadow grows, nothing blurs. */
export function cardHoverCss(): string {
  const t = active.panel
  if (active.id === MODERN.id) return ''
  return `${t.shadowOffset + 2}px ${t.shadowOffset + 2}px 0 ${t.shadow}, inset 0 -${BAND}px 0 ${t.shade}` +
    (t.rule ? `, inset 0 0 0 3px ${t.fill}, inset 0 0 0 4px ${t.rule}` : '')
}

/** CSS font-family for menu body text. */
export function bodyFamily(): string { return active.font.body }
export function displayFamily(): string { return active.font.display }
export function headingFamily(): string { return active.font.heading }

function paleTheme(): boolean {
  const p = parse(active.panel.fill)
  return !!p && (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) > 140
}

/** Ink for text on a card, from the menus' original light-on-dark colour. */
export function cardInk(original: string): string { return C(original) }

/** A call-to-action plate: a filled button in the theme's accent. */
export function callCss(): string {
  if (active.id === MODERN.id) return 'background:#f0c14b;color:#1a1204;font-weight:bold'
  return `background:${active.ink.accent};color:${active.panel.fill};border:2px solid ${active.panel.ink};` +
    `box-shadow:2px 2px 0 ${active.panel.ink}`
}

/** A quiet plate: information, not a button. */
export function quietCss(): string {
  if (active.id === MODERN.id) return 'background:rgba(255,255,255,0.07);color:rgba(207,230,245,0.75)'
  return `background:${active.panel.shade};color:${C('rgba(255,255,255,0.8)')}`
}

/** True for the cel themes: lets a menu pick ink-on-card styling over glass. */
export function isCel(): boolean { return active.id !== MODERN.id }

/** Whether panels are pale (paper) rather than dark (glass, wood), for picking a contrasting swatch. */
export function panelIsLight(): boolean {
  const p = parse(active.panel.fill)
  return !!p && (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) > 140
}

// --- Canvas pieces shared by the HUD -------------------------------------------

/**
 * A section label. Modern draws it as it always did; the period themes draw
 * small spaced capitals in the rubric ink, the same treatment the draft
 * cards give their group names, so a label is never mistaken for a value.
 */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.save()
  ctx.fillStyle = active.rubric
  if (active.id === MODERN.id) {
    ctx.font = F(12)
  } else {
    // Small capitals at the floor size: spaced and rubricated rather than
    // shrunk, which is what made them hard to read at 10.5px.
    ctx.font = F(MIN_FONT, true)
    ctx.letterSpacing = '1.2px'
  }
  ctx.fillText(text, x, y)
  ctx.restore()
}

/**
 * A gauge: track, fill and — in a cel theme — an ink outline, so bars belong
 * to the same inked world as the panels they sit on.
 */
export function bar(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  value: number, color: string,
) {
  ctx.save()
  ctx.fillStyle = C('rgba(255,255,255,0.14)')
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = color
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, value)), h)
  if (active.id !== MODERN.id) {
    ctx.strokeStyle = active.panel.ink
    ctx.lineWidth = 1.2
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  }
  ctx.restore()
}

/**
 * The speed ramp, in this theme's inks. The rose's rim is the polar curve
 * drawn in colour; on paper the original neon green-to-red was the loudest
 * thing on screen and the only colour that belonged to no ink.
 */
export function ramp(mult: number, neon: (m: number) => string): string {
  if (!paleTheme()) return neon(mult)
  const stops = [parse(active.ink.bad)!, parse(active.ink.warn)!, parse(active.ink.good)!]
  const m = Math.max(0, Math.min(1, mult)) * 2
  const i = Math.min(1, Math.floor(m))
  const t = m - i
  const a = stops[i], b = stops[i + 1]
  const mix = (k: number) => Math.round(a[k] + (b[k] - a[k]) * t)
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`
}

/**
 * A key hint — "C  continue" — with the key drawn as a small inked cap in the
 * period themes, centred as a unit on `cx`. Modern keeps its "C — continue".
 */
export function keyHint(ctx: CanvasRenderingContext2D, key: string, text: string, cx: number, y: number) {
  ctx.save()
  ctx.textBaseline = 'middle'
  if (active.id === MODERN.id) {
    ctx.textAlign = 'center'
    ctx.fillText(`${key} — ${text}`, cx, y)
    ctx.restore()
    return
  }
  const color = ctx.fillStyle
  ctx.textAlign = 'left'
  const kw = Math.max(20, ctx.measureText(key).width + 12)
  const tw = ctx.measureText(text).width
  const total = kw + 10 + tw
  const x = cx - total / 2
  // Same cap as the DOM's keyCss: rounded, 2px ink, a 2px hard shadow.
  const kr = Math.min(4, active.panel.corner)
  ctx.fillStyle = active.panel.ink
  outline(ctx, x + 2, y - 10, kw, 20, kr, kr > 0)
  ctx.fill()
  ctx.fillStyle = active.panel.fill
  outline(ctx, x, y - 12, kw, 20, kr, kr > 0)
  ctx.fill()
  ctx.strokeStyle = active.panel.ink
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = active.panel.ink
  ctx.textAlign = 'center'
  ctx.fillText(key, x + kw / 2, y - 2)
  ctx.textAlign = 'left'
  ctx.fillStyle = color
  ctx.fillText(text, x + kw + 10, y)
  ctx.restore()
}

/** Text over the open sea with no panel: a pale fill inside a dark ink halo, as a chart labels water. */
export function seaLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.save()
  if (active.id !== MODERN.id) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = active.panel.ink
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

/** Sentence case for the period themes: blackletter in all capitals is unreadable. */
export function titleCase(text: string): string {
  if (active.id === MODERN.id) return text
  return text.charAt(0) + text.slice(1).toLowerCase()
}
