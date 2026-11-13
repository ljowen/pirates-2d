/**
 * How the instruments are laid out on this screen.
 *
 * The panels were drawn for a laptop. On anything smaller they are not
 * redesigned; the whole instrument layer is drawn at a smaller scale, the
 * way a chart is the same chart at any size, and two things move:
 *
 *  - On a narrow screen (a phone held upright) the two columns of panels
 *    cannot sit either side of the clock, so they start below it.
 *  - On a touch screen the bottom of the view belongs to the thumbs, so the
 *    columns must end above the buttons, the panels that can be read off the
 *    water are dropped, and the compass and chart are drawn smaller.
 */
export interface Layout {
  /** The instrument layer is drawn at this fraction of full size. */
  scale: number
  /** Where the columns of panels start, in the layer's own units. */
  top: number
  /** Touch: fewer and smaller panels. */
  compact: boolean
  /**
   * A phone held upright: there is only room for the sails, the ship's
   * condition and the compass. The chart and the point-of-sail panel go.
   */
  slim: boolean
  /** Height kept clear at the foot of the screen, in the layer's own units. */
  foot: number
  /**
   * How far below the middle of the screen the ship is held, in real pixels,
   * so that she sits in the middle of the sea that is left and not under a panel.
   */
  focusY: number
}

/** Real pixels the touch buttons take up at the bottom of the screen: one row, or two when narrow. */
export const TOUCH_FOOT = 100
export const TOUCH_FOOT_NARROW = 164

/** The narrowest the layer can be and still hold both columns side by side. */
const MIN_WIDTH = 500
/** Below this the columns will not fit beside the clock. */
const WIDE = 900
const CLOCK = 100

export function layoutFor(w: number, h: number, touch: boolean): Layout {
  const fit = (top: number, column: number, reserved: number) =>
    Math.max(0.5, Math.min(1, w / MIN_WIDTH, (h - reserved) / (top + column)))
  // How tall the taller column is, from its top.
  let column = touch ? 376 : 500
  let reserved = touch ? TOUCH_FOOT : 0
  let top = 20
  let scale = fit(top, column, reserved)
  const narrow = w / scale < WIDE
  let slim = false
  if (narrow) {
    top = CLOCK
    if (touch) reserved = TOUCH_FOOT_NARROW
    scale = fit(top, column, reserved)
    // Slim only where the full column would leave too little sea between
    // the panels and the buttons: a phone, but not a tablet.
    slim = touch && (h - reserved) / scale - (top + column) < 260
    if (slim) {
      column = 222
      scale = fit(top, column, reserved)
    }
  }
  // Upright, the panels fill the top of the screen and the buttons the foot:
  // the ship belongs halfway between them.
  const focusY = narrow && touch ? ((top + column) * scale + (h - reserved)) / 2 - h / 2 : 0
  return { scale, top, compact: touch, slim, foot: reserved / scale, focusY }
}
