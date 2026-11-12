/**
 * How the instruments and menus look: Captain's log.
 *
 * Ink on paper, cel shaded to match the ships — flat fill, one hard shade
 * band, a heavy ink outline and a hard offset shadow, no blur and no
 * gradients anywhere. The rules that keep it one thing are written down in
 * docs/plans/art-direction.md; the short version is that every panel, card,
 * bar and key cap on screen comes from the helpers in this file.
 *
 * Three other looks (dark glass, a wood-and-brass cabin, an Admiralty chart)
 * were built alongside this one to compare, and removed once it was chosen.
 *
 * The HUD was originally written against a fixed set of light-on-dark
 * colours. Rather than rewrite every line, `C()` maps those colours onto
 * this look's inks by hue, keeping their alpha, so the HUD's own hierarchy
 * (labels fainter than values, tracks fainter still) carries over.
 */

// Single-quoted names throughout: these strings go into inline style="…"
// attributes, where a double quote ends the attribute and the face silently
// falls back to the browser default.
const SERIF = "Georgia, 'Times New Roman', serif"
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

const LOOK = {
  name: "Captain's log",
  font: {
    /**
     * Values and anything bold, and all body text: the system monospace. Two
     * serifs were tried first (IM Fell English, then Old Standard TT) and
     * neither read as easily at 14px; a monospace also keeps figures in
     * columns without any extra work.
     */
    display: MONO,
    body: MONO,
    /** Blackletter, for titles and ship names only, and never in capitals. */
    heading: `'Pirata One', ${SERIF}`,
    displayScale: 1,
    bodyScale: 1,
    headingScale: 1.12,
    displayWeight: 'bold',
  },
  panel: {
    fill: '#f0e3c4',
    /** The single hard shade band along the bottom. */
    shade: '#dcc79a',
    ink: '#2a180c',
    inkWidth: 2.5,
    /** Hard offset shadow, no blur. */
    shadow: 'rgba(26,14,6,0.62)',
    shadowOffset: 3,
    corner: 7,
  },
  /** What each of the HUD's original colours becomes. */
  ink: {
    text: '#22140a',
    accent: '#8a3f08',
    good: '#2f5e18',
    bad: '#a01d12',
    info: '#1a4766',
    gun: '#a8540a',
    warn: '#8a5800',
    endless: '#7c255f',
    gold: '#8a3f08',
  },
  /** Full-screen wash behind the end card. */
  overlay: 'rgba(20,12,6,0.5)',
  /**
   * Section labels on panels — SAILS, CONDITION. A log book rubricated its
   * headings in red ink; this is that, and it is what separates a label from
   * the value under it when both are in the same face.
   */
  rubric: '#9a2a17',
  /** The menus' backdrop, and the light inks drawn straight onto it rather than onto a card. */
  menu: {
    backdrop: 'rgba(26,16,8,0.95)',
    text: '#efe0bd',
    dim: 'rgba(239,224,189,0.55)',
    gold: '#f0c14b',
    good: '#b5df8f',
    heading: '#f0c14b',
  },
  /** Draft-card group colours, as inks that read on paper. */
  groups: { Sailing: '#22506e', Gunnery: '#b5600e', Shot: '#86306a', Quarterdeck: '#3b6a22' },
}

export const ui = () => LOOK

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
const ROLES: Record<string, keyof typeof LOOK.ink> = {
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
 * One of the HUD's original colours, in this look's ink. Alpha is kept, so a
 * faint white track becomes a faint ink track. Anything not in the table — a
 * class colour, say — passes through unchanged.
 */
export function C(original: string, alpha?: number): string {
  const p = parse(original)
  if (!p) return original
  const role = ROLES[`${p[0]},${p[1]},${p[2]}`]
  let a = alpha ?? p[3]
  // The faint inks the HUD was built with (55% labels, 70% secondary text)
  // wash out on paper: light-on-dark tolerates low alpha far better than
  // dark-on-light. Anything meant to be read is lifted; tracks and
  // hairlines, below 30%, are left nearly as they were.
  if (role) a = a >= 0.3 ? 0.62 + 0.38 * a : a * 1.25
  const target = role ? parse(LOOK.ink[role]) : p
  if (!target) return original
  if (a >= 1) return `rgb(${target[0]},${target[1]},${target[2]})`
  return `rgba(${target[0]},${target[1]},${target[2]},${a})`
}

/** Ink for text on a card, from the menus' original light-on-dark colour. */
export function cardInk(original: string): string { return C(original) }

// --- Type --------------------------------------------------------------------

/**
 * Nothing the game sets is smaller than this. Anything asked for below it is
 * raised to it, so a stray 10px label cannot creep back in.
 */
export const MIN_FONT = 14

function size(px: number): string {
  return Math.max(MIN_FONT, px).toFixed(1)
}

/** A canvas font string: bold is the display face, regular is the body face. */
export function F(px: number, bold = false): string {
  const f = LOOK.font
  return bold
    ? `bold ${size(px * f.displayScale)}px ${f.display}`
    : `${size(px * f.bodyScale)}px ${f.body}`
}

/** A title in the blackletter heading face. */
export function Fh(px: number): string {
  return `${size(px * LOOK.font.headingScale)}px ${LOOK.font.heading}`
}

export function bodyFamily(): string { return LOOK.font.body }
export function displayFamily(): string { return LOOK.font.display }
export function headingFamily(): string { return LOOK.font.heading }

/** Sentence case: blackletter in all capitals is unreadable. */
export function titleCase(text: string): string {
  return text.charAt(0) + text.slice(1).toLowerCase()
}

/**
 * Ask the browser for the faces up front. Canvas text does not trigger a
 * webfont load by itself, so without this the first frames — and any frame
 * drawn before the face happened to load — fall back to Georgia. Only the
 * heading face is a webfont; the rest is the system monospace.
 */
export function loadUiFonts(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve()
  const f = LOOK.font
  return Promise.all([
    document.fonts.load(`20px ${f.heading}`),
  ]).catch(() => undefined)
}

// --- Canvas panels -------------------------------------------------------------

/** Height of the hard shade band along a panel's foot, on canvas and in CSS alike. */
const BAND = 8

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * A panel: hard shadow, flat fill, one hard shade band along the bottom, and
 * the ink outline last so nothing paints over it — the same order the hull
 * style draws a ship in. Rounded rather than clipped, because the menus are
 * DOM and a clipped corner cannot carry a border and a hard shadow there; the
 * HUD and the menus share the one shape both can draw.
 */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const t = LOOK.panel
  ctx.save()
  ctx.fillStyle = t.shadow
  rounded(ctx, x + t.shadowOffset, y + t.shadowOffset, w, h, t.corner)
  ctx.fill()

  rounded(ctx, x, y, w, h, t.corner)
  ctx.fillStyle = t.fill
  ctx.fill()
  ctx.save()
  ctx.clip()
  const band = Math.min(BAND, h * 0.16)
  ctx.fillStyle = t.shade
  ctx.fillRect(x, y + h - band, w, band)
  ctx.restore()

  rounded(ctx, x, y, w, h, t.corner)
  ctx.strokeStyle = t.ink
  ctx.lineWidth = t.inkWidth
  ctx.stroke()
  ctx.restore()
}

/** A round panel, for the compass. */
export function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const t = LOOK.panel
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx + t.shadowOffset, cy + t.shadowOffset, r, 0, Math.PI * 2)
  ctx.fillStyle = t.shadow
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = t.fill
  ctx.fill()
  ctx.strokeStyle = t.ink
  ctx.lineWidth = t.inkWidth
  ctx.stroke()
  ctx.restore()
}

/**
 * Text that sits over the sea. The inks are dark, so it gets a small panel
 * of its own. Uses the caller's font, colour and alignment.
 */
export function plaque(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  const m = ctx.measureText(text)
  const asc = m.actualBoundingBoxAscent || 12
  const desc = m.actualBoundingBoxDescent || 4
  const align = ctx.textAlign
  let left = align === 'center' ? x - m.width / 2
    : align === 'right' || align === 'end' ? x - m.width : x
  // Kept on screen: a long label beside the edge slides in rather than clips.
  const viewW = ctx.canvas.clientWidth || ctx.canvas.width
  const moved = Math.max(16, Math.min(viewW - 16 - m.width, left)) - left
  left += moved
  x += moved
  const fill = ctx.fillStyle
  panel(ctx, left - 10, y - asc - 6, m.width + 20, asc + desc + 12)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

/** Text over open water with no panel: pale type inside a dark ink halo, as a chart letters the sea. */
export function seaLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = LOOK.panel.ink
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

/**
 * A section label: small spaced capitals in the rubric ink, the same
 * treatment the draft cards give their group names, so a label is never
 * mistaken for a value.
 */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.save()
  ctx.fillStyle = LOOK.rubric
  ctx.font = F(MIN_FONT, true)
  ctx.letterSpacing = '1.2px'
  ctx.fillText(text, x, y)
  ctx.restore()
}

/** A gauge: track, fill and an ink outline, so bars belong to the same inked world as their panels. */
export function bar(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  value: number, color: string,
) {
  ctx.save()
  ctx.fillStyle = C('rgba(255,255,255,0.14)')
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = color
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, value)), h)
  ctx.strokeStyle = LOOK.panel.ink
  ctx.lineWidth = 1.2
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.restore()
}

/**
 * The speed ramp — red through ochre to green — in this look's inks. The
 * rose's rim is the polar curve drawn in colour, and the original neon ramp
 * was the loudest thing on screen and the only colour that belonged to no ink.
 */
export function ramp(mult: number): string {
  const stops = [parse(LOOK.ink.bad)!, parse(LOOK.ink.warn)!, parse(LOOK.ink.good)!]
  const m = Math.max(0, Math.min(1, mult)) * 2
  const i = Math.min(1, Math.floor(m))
  const t = m - i
  const a = stops[i], b = stops[i + 1]
  const mix = (k: number) => Math.round(a[k] + (b[k] - a[k]) * t)
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`
}

/**
 * A key hint — "C  continue" — with the key drawn as a small inked cap,
 * centred as a unit on `cx`. The same cap as `keyCss` in the DOM.
 */
export function keyHint(ctx: CanvasRenderingContext2D, key: string, text: string, cx: number, y: number) {
  ctx.save()
  ctx.textBaseline = 'middle'
  const color = ctx.fillStyle
  ctx.textAlign = 'left'
  const kw = Math.max(20, ctx.measureText(key).width + 12)
  const tw = ctx.measureText(text).width
  const x = cx - (kw + 10 + tw) / 2
  const t = LOOK.panel
  const kr = Math.min(4, t.corner)
  ctx.fillStyle = t.ink
  rounded(ctx, x + 2, y - 10, kw, 20, kr)
  ctx.fill()
  ctx.fillStyle = t.fill
  rounded(ctx, x, y - 12, kw, 20, kr)
  ctx.fill()
  ctx.strokeStyle = t.ink
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = t.ink
  ctx.textAlign = 'center'
  ctx.fillText(key, x + kw / 2, y - 2)
  ctx.textAlign = 'left'
  ctx.fillStyle = color
  ctx.fillText(text, x + kw + 10, y)
  ctx.restore()
}

// --- DOM -----------------------------------------------------------------------

function restShadow(): string {
  const t = LOOK.panel
  return `${t.shadowOffset}px ${t.shadowOffset}px 0 ${t.shadow}, inset 0 -${BAND}px 0 ${t.shade}`
}

/** CSS for a menu card or panel: the DOM half of `panel`. */
export function cardCss(): string {
  const t = LOOK.panel
  return `
    background: ${t.fill};
    border: ${t.inkWidth}px solid ${t.ink};
    border-radius: ${t.corner}px;
    box-shadow: ${restShadow()};`
}

/** The lifted state of a card under the pointer: the shadow grows, nothing blurs. */
export function cardHoverCss(): string {
  const t = LOOK.panel
  return `${t.shadowOffset + 2}px ${t.shadowOffset + 2}px 0 ${t.shadow}, inset 0 -${BAND}px 0 ${t.shade}`
}

/**
 * A card pressed into the page: no shadow, shifted onto where it was. The
 * selected tab, so "selected" reads as a physical state rather than a colour.
 */
export function cardPressedCss(): string {
  const t = LOOK.panel
  return `${cardCss()} box-shadow: inset 0 -${BAND}px 0 ${t.shade}; ` +
    `transform: translate(${t.shadowOffset}px, ${t.shadowOffset}px);`
}

/** A small key cap: the DOM twin of `keyHint`'s key, for steppers and toggles. */
export function keyCss(enabled = true): string {
  const t = LOOK.panel
  return `background: ${t.fill}; border: 2px solid ${t.ink}; border-radius: ${Math.min(4, t.corner)}px; ` +
    `box-shadow: 2px 2px 0 ${t.ink}; opacity: ${enabled ? 1 : 0.35};`
}

/** A call-to-action plate: a filled button in the accent ink. */
export function callCss(): string {
  const t = LOOK.panel
  return `background:${LOOK.ink.accent};color:${t.fill};border:2px solid ${t.ink};box-shadow:2px 2px 0 ${t.ink}`
}

/** A quiet plate: information, not a button. */
export function quietCss(): string {
  return `background:${LOOK.panel.shade};color:${C('rgba(255,255,255,0.8)')}`
}
