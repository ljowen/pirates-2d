/**
 * Icons for the upgrades, the refits and the port's pages.
 *
 * Drawn here rather than taken from a pack, for the same reason the ships
 * are: an asset pack brings its own line weight and palette, and everything
 * else on screen is flat fill inside one heavy ink outline. Each icon is a
 * few SVG shapes on a 32-unit square, with the outline and the joins set once
 * on the wrapper so no icon can drift from the rest.
 */

const INK = '#2a180c'
const IRON = '#565c66'
const STEEL = '#8d949e'
const WOOD = '#a8703a'
const DARKWOOD = '#7a4d24'
const CANVAS = '#fbf3dc'
const BRASS = '#e0aa2e'
const ROPE = '#c9a66b'
const RED = '#a8281a'
const DARK = '#22140a'

/** A line with an ink outline: ink drawn wide, then the colour over it. */
const rod = (d: string, color: string, w = 2.6) =>
  `<path d="${d}" stroke="${INK}" stroke-width="${w + 3}" fill="none"/>` +
  `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none"/>`
const ball = (x: number, y: number, r: number, fill = IRON) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>` +
  `<path d="M${x - r * 0.55} ${y - r * 0.15}a${r * 0.6} ${r * 0.6} 0 0 1 ${r * 0.45} -${r * 0.45}" stroke="${STEEL}" stroke-width="${Math.max(1.2, r * 0.22)}" fill="none"/>`

const hammer =
  `<g transform="rotate(38 16 17)">` +
  rod('M16 30V11', WOOD) +
  `<path d="M7 4h14l4 4-4 4H7z" fill="${IRON}"/><path d="M11 4v8" stroke-width="1.6"/></g>`

const SHAPES: Record<string, string> = {
  // --- Sailing -------------------------------------------------------------
  'rakish-lines':
    `<path d="M11 3c6 6 7 15 3 26H8C4 18 5 9 11 3z" fill="${WOOD}"/>` +
    `<path d="M11 10v13" stroke-width="1.4"/>` +
    `<path d="M20 25c8-5 9-12 4-18" stroke-width="2.4"/>` +
    `<path d="M20 9l4.5-2.5 2 5z" fill="${BRASS}"/>`,
  'taller-masts':
    `<path d="M9 15.5h14l1.5 7h-17z" fill="${CANVAS}"/>` +
    `<path d="M11 8.5h10l1 5H10z" fill="${CANVAS}"/>` +
    rod('M16 29V5', DARKWOOD, 2) +
    `<path d="M7 15h18M9.5 8h13" stroke-width="2.4"/>` +
    `<path d="M16 2l9 2.2-9 2.6z" fill="${RED}"/>`,
  'veteran-topmen':
    `<path d="M16 5L6 28M16 5l10 23" />` +
    `<path d="M13 12h6M10.5 18h11M8 24h16" stroke-width="1.6"/>` +
    rod('M16 29V4', DARKWOOD, 2) +
    `<path d="M10 4h12v3.5H10z" fill="${WOOD}"/>`,
  'storm-canvas':
    `<path d="M5 5h22c-1.5 6-1.5 13 0 19H5c1.5-6 1.5-13 0-19z" fill="#cdbf9f"/>` +
    `<path d="M5.5 11h21M5 18h22" stroke-width="1.2" stroke-dasharray="2 2.5"/>` +
    `<path d="M18 7l-7 10h5l-3 10 9-12h-5l3-8z" fill="${BRASS}"/>`,

  // --- Gunnery -------------------------------------------------------------
  'heavier-shot': ball(16, 15, 10.5) + `<path d="M5 29h22" stroke-width="2.4"/>`,
  'powder-monkeys':
    `<path d="M18 9c0-4 4-3 5-5" />` +
    `<path d="M9 9h14c2.5 5 2.5 13 0 18H9c-2.5-5-2.5-13 0-18z" fill="${WOOD}"/>` +
    `<path d="M7.6 14h16.8M7.6 22h16.8" stroke-width="2.4"/>` +
    `<path d="M24.5 0.8l1 2.2 2.3.4-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.4z" fill="${BRASS}" stroke-width="1.2"/>`,
  'long-nines':
    `<circle cx="3.6" cy="16" r="2" fill="${IRON}"/>` +
    `<path d="M5 11.5l21 2v5l-21 2z" fill="${IRON}"/>` +
    `<path d="M26 12h3v8h-3z" fill="${STEEL}"/>` +
    `<path d="M11 12.2v7.6M18 12.8v6.4" stroke-width="1.6"/>` +
    `<circle cx="14" cy="21.5" r="2.2" fill="${STEEL}"/>`,
  'extra-gunport':
    `<path d="M3 6h26v20H3z" fill="${WOOD}"/>` +
    `<path d="M3 12.5h6M23 12.5h6M3 19.5h6M23 19.5h6" stroke-width="1.3"/>` +
    `<path d="M9.5 10h13v12h-13z" fill="${DARK}"/>` +
    `<circle cx="16" cy="16" r="4" fill="${STEEL}"/><circle cx="16" cy="16" r="1.5" fill="${DARK}" stroke="none"/>` +
    `<path d="M9 5.5h14v4H9z" fill="${RED}"/>`,
  'trained-gunners':
    `<circle cx="16" cy="16" r="9.5" fill="${CANVAS}"/>` +
    `<circle cx="16" cy="16" r="3.4" fill="${RED}"/>` +
    `<path d="M16 2v8M16 22v8M2 16h8M22 16h8" stroke-width="2.4"/>`,
  carronades:
    `<path d="M5 23h22v5H5z" fill="${WOOD}"/>` +
    `<circle cx="5.5" cy="15" r="2.2" fill="${IRON}"/>` +
    `<path d="M7.5 8.5h13l4 2v9l-4 2h-13z" fill="${IRON}"/>` +
    `<path d="M24.5 9.5h3v11h-3z" fill="${STEEL}"/>` +
    `<path d="M13 8.5v13" stroke-width="1.6"/>`,

  // --- Shot ----------------------------------------------------------------
  'chain-shot':
    `<circle cx="13.6" cy="17.8" r="2" stroke-width="1.6"/><circle cx="16" cy="16" r="2" stroke-width="1.6"/><circle cx="18.4" cy="14.2" r="2" stroke-width="1.6"/>` +
    ball(8, 22.5, 5.8) + ball(24, 9.5, 5.8),
  'grape-shot':
    [[9, 24], [16, 24], [23, 24], [12.5, 17.5], [19.5, 17.5], [16, 11]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.9" fill="${IRON}" stroke-width="1.7"/>`).join('') +
    `<path d="M16 7c0-3 3-3 3-5.5" stroke="${ROPE}" stroke-width="1.8"/>`,
  'round-shot': ball(11.5, 19, 8.2) + ball(21, 12.5, 8.2),

  // --- Quarterdeck -----------------------------------------------------------
  'ships-carpenter': hammer,
  sailmaker:
    `<path d="M4 13h15v15H4z" fill="${CANVAS}"/>` +
    `<path d="M7 16h9v9H7z" stroke-width="1.2" stroke-dasharray="1.6 2"/>` +
    `<path d="M25 6c5-5-5-6-8-1s-7 3-9 9" stroke="${RED}" stroke-width="1.7"/>` +
    rod('M8 26L25 7', STEEL, 1.6),
  'loot-hooks':
    `<path d="M18 4.5c5-3 10 1 6 6" stroke="${ROPE}" stroke-width="2.2"/>` +
    `<path d="M16 7v15M6.5 17c-1 9 9 10 9.5 4M25.5 17c1 9-9 10-9.5 4" stroke-width="3"/>` +
    `<path d="M3.5 19.5L6.5 14l3.5 5z" fill="${IRON}"/><path d="M28.5 19.5L25.5 14l-3.5 5z" fill="${IRON}"/>` +
    `<circle cx="16" cy="5.5" r="2.6" fill="${CANVAS}"/>`,
  'iron-knees':
    `<path d="M5 4h8c0 9 4 13 15 14v9H5z" fill="${IRON}"/>` +
    `<circle cx="9" cy="8.5" r="1.4" fill="${STEEL}" stroke-width="1.2"/><circle cx="9" cy="22.5" r="1.4" fill="${STEEL}" stroke-width="1.2"/><circle cx="23.5" cy="22.5" r="1.4" fill="${STEEL}" stroke-width="1.2"/>`,
  'prize-crews':
    `<path d="M9 6c5-3 9 3 17 0v12c-8 3-12-3-17 0z" fill="${RED}"/>` +
    `<path d="M9 12c5-3 9 3 17 0" stroke="${CANVAS}" stroke-width="2.2"/>` +
    rod('M8 3v26', DARKWOOD, 1.8),
  'letters-of-marque':
    `<path d="M7 6h18v21H7z" fill="${CANVAS}"/>` +
    `<path d="M4.5 3.500h23v4.500h-23z" fill="#e6d7b0"/>` +
    `<path d="M11 12.5h10M11 16.500h10M11 20.500h4" stroke-width="1.5"/>` +
    `<circle cx="21.5" cy="23.5" r="3.8" fill="${RED}"/>`,
  'boarding-axes':
    rod('M8 28L21 7', WOOD) +
    `<path d="M17 6.500c4-5 12-3 12 6-3-2.5-5-2.5-8 0z" fill="${STEEL}"/>`,

  // --- Refits ----------------------------------------------------------------
  'seasoned-timbers':
    `<path d="M3 6h22v5.500H3z" fill="${WOOD}"/><path d="M7 13.200h22v5.500H7z" fill="${DARKWOOD}"/><path d="M3 20.500h22V26H3z" fill="${WOOD}"/>` +
    `<path d="M7 8.700h7M11 16h8M7 23.200h5M17 23.200h4" stroke-width="1.2"/>`,
  'gun-drill':
    `<path d="M10 5c0 7 5 8 6 11 1-3 6-4 6-11z" fill="${CANVAS}"/><path d="M10 27c0-7 5-8 6-11 1 3 6 4 6 11z" fill="${CANVAS}"/>` +
    `<path d="M12.5 26.500c0-3.5 2.5-4 3.5-6 1 2 3.5 2.5 3.5 6z" fill="${BRASS}" stroke="none"/>` +
    `<path d="M7 4.500h18M7 27.500h18" stroke-width="3"/>`,
  'foundry-shot':
    `<path d="M16 1.500c2 2 3 3 1.5 5.5 2.5-1 3-3 2.5-4.5" stroke="${RED}" stroke-width="1.6"/>` +
    ball(9.5, 23, 6.3) + ball(22.5, 23, 6.3) + ball(16, 13, 6.3, '#c8551b'),
  'fine-sailcloth':
    `<path d="M6 6h20c2.5 7 1.5 14-2 21-5-2-11-2-16 0C4.5 20 3.5 13 6 6z" fill="${CANVAS}"/>` +
    `<path d="M12.5 6c-1.5 7-1.5 13-.5 19.500M19.5 6c1.5 7 1.5 13 .5 19.5" stroke-width="1.2"/>` +
    `<path d="M3 5.500h26" stroke-width="3"/>`,
  'balanced-rudder':
    `<path d="M21 9h-3c-5 4-8 9-8 19h11z" fill="${WOOD}"/>` +
    `<path d="M21 15h-6.500M21 22h-9" stroke-width="2.4"/>` +
    rod('M21 28V4', DARKWOOD, 2) +
    `<path d="M21 4.500H6" stroke-width="3"/>`,
  shipwrights:
    `<path d="M11 11l18 3v3.500l-2.3 2-1.7-1.6-2 2-1.8-1.7-2 2-1.8-1.7-2 2-1.8-1.7-2 2-.6-.5z" fill="${STEEL}"/>` +
    `<path d="M3 9.500l9-1 1 14-8 1.500z" fill="${WOOD}"/>` +
    `<path d="M6.5 13.500l3-.3.4 5-3 .5z" fill="#f0e3c4" stroke-width="1.4"/>`,
  'bored-barrels':
    `<circle cx="16" cy="16" r="12" fill="${IRON}"/><circle cx="16" cy="16" r="8" fill="${STEEL}"/><circle cx="16" cy="16" r="4.3" fill="${DARK}"/>` +
    `<path d="M16 2.500v3" stroke="${BRASS}" stroke-width="2.4"/>`,
  'deeper-hold':
    `<path d="M4 15c0-7 5-9 12-9s12 2 12 9z" fill="${DARKWOOD}"/>` +
    `<path d="M4 15h24v12H4z" fill="${WOOD}"/>` +
    `<path d="M8.5 7.500v19.500M23.5 7.500v19.5" stroke="${INK}" stroke-width="4.6"/><path d="M8.5 8v18.500M23.5 8v18.5" stroke="${BRASS}" stroke-width="2"/>` +
    `<path d="M13.5 12.500h5v6h-5z" fill="${BRASS}"/>`,
  quartermaster:
    `<g transform="rotate(-14 12 17)"><path d="M6 7h12v19H6z" fill="${CANVAS}"/></g>` +
    `<g transform="rotate(12 20 17)"><path d="M14 6.500h12v19H14z" fill="${CANVAS}"/><path d="M20 11l3.5 5-3.5 5-3.5-5z" fill="${RED}" stroke-width="1.3"/></g>`,
  'old-hands':
    `<path d="M5 15L16 5l11 10v6L16 11 5 21z" fill="${BRASS}"/>` +
    `<path d="M5 23l11-10 11 10v6L16 19 5 29z" fill="${BRASS}"/>`,

  // --- The port's pages --------------------------------------------------------
  yard:
    `<path d="M15 6L6 18h9z" fill="${CANVAS}"/><path d="M17.5 3.500L27 18h-9.500z" fill="${CANVAS}"/>` +
    `<path d="M16.2 19V3" stroke-width="2.4"/>` +
    `<path d="M3 20h26l-4.5 7.500h-17z" fill="${WOOD}"/>`,
  refit: hammer,
  log:
    `<path d="M16 8C12 5 8 5 3.5 6v19.500c4.5-1 8.5-1 12.5 2 4-3 8-3 12.5-2V6C24 5 20 5 16 8z" fill="${CANVAS}"/>` +
    `<path d="M16 8v19.5" /><path d="M7 11.500c2-.4 4-.2 6 .6M7 16c2-.4 4-.2 6 .6M19 12.100c2-.8 4-1 6-.6M19 16.600c2-.8 4-1 6-.6" stroke-width="1.3"/>`,
}

/** An icon as an SVG string, or nothing if there is none by that name. */
export function icon(id: string, size = 32): string {
  const shapes = SHAPES[id]
  if (!shapes) return ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" ` +
    `fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ` +
    `style="flex:none;display:block;overflow:visible">${shapes}</svg>`
}

export const ICON_IDS = Object.keys(SHAPES)

const images = new Map<string, HTMLImageElement>()

/** The same icon as an image, for drawing onto a canvas. Check `complete` before use. */
export function iconImage(id: string): HTMLImageElement | undefined {
  let img = images.get(id)
  if (!img) {
    const svg = icon(id, 64)
    if (!svg) return undefined
    img = new Image()
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    images.set(id, img)
  }
  return img
}
