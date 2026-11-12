import type { Ship } from '../sim/ship'
import { MAX_YARDS, SAIL_STATES } from '../sim/ship'
import type { WindSample } from '../sim/wind'
import type { World } from '../sim/world'
import type { Camera } from './camera'
import { T } from '../sim/tuning'
import { angleDiff, compassName, deg } from '../core/math'
import { batteryBearing } from '../sim/combat'
import { UPGRADES_BY_ID, type Upgrade } from '../sim/upgrades'
import { draughtDepth } from '../sim/terrain'
import { outmatches, toKnots } from '../sim/stats'
import { iconImage } from '../ui/icons'
import { nextPurchase, payoutFor, type Ledger } from '../meta/career'
import { notorietyName } from '../sim/voyage'
import {
  C, F, Fh, bar, disc, keyHint, label, panel, plaque, ramp, seaLabel, titleCase, ui,
} from '../ui/theme'

/**
 * Instruments, drawn on a plain 2D canvas over the Pixi view. Two of these are
 * load-bearing rather than decorative: the compass rose paints the polar curve
 * around its rim so you can see where you *could* go, and the gun arcs show
 * where your broadside actually bears so positioning is legible.
 */
/**
 * The left column's measure. Sized for 14px text, the smallest the HUD sets:
 * it was 186 wide with 11–12px type, which was too small to read in play.
 */
const PW = 236
/** Inset from a panel's edge to its text. */
const IN = 14
/** One row of a list: a 14px label beside a gauge. */
const ROW = 22

export class Hud {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  draw(
    world: World, camera: Camera, paused: boolean, turbo: boolean, silent = false,
    ledger: Ledger | null = null,
    /** A menu is up: draw the instruments, but not banners that would show through it. */
    menu = false,
  ) {
    const ctx = this.ctx
    const w = ctx.canvas.clientWidth
    const player = world.player

    this.drawGunArcs(world, camera)
    this.drawEnemyMarkers(world, camera)

    this.drawRunBar(world, w)
    // The rose shows the wind where the player actually is, not the ambient
    // average — otherwise local weather would be invisible to them.
    const localWind = world.windAt(player.pos)
    this.drawRose(player, localWind, world.wind.describe(localWind.strength), w - 100, 100, 62)
    // Stacked by each panel's real height, so a panel can grow — the sails
    // panel gains a line while mending — without colliding with the next.
    let col = 20
    col += this.drawSailIndicator(player, 20, col) + 10
    col += this.drawReadouts(player, 20, col) + 10
    col += this.drawCondition(player, 20, col) + 10
    col += this.drawBroadsides(player, world, 20, col) + 10
    this.drawUpgrades(world, 20, col)
    this.drawShoalWarning(player)
    this.drawSquallWarning(world, player)

    if (silent) {
      ctx.save()
      ctx.font = F(11)
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillStyle = C('rgba(207,230,245,0.45)')
      plaque(ctx, 'sound off — M', w - 24, ctx.canvas.clientHeight - 48)
      ctx.restore()
    }

    if (world.run.state === 'won') this.endCard(world, true, ledger)
    else if (world.run.state === 'lost') this.endCard(world, false, ledger)
    else if (menu) { /* nothing over a menu */ }
    else if (paused) this.banner('PAUSED', C('#ffd27f'), 150)
    else if (turbo) this.banner('TURBO', C('#7fe0a0'), 150)

    // Boss waves get called out, because three Brigantines appearing over the
    // horizon with no warning is just a sudden death.
    if (!menu && world.director.announcementTime > 0 && world.director.announcement) {
      const fade = Math.min(1, world.director.announcementTime / 1.2)
      ctx.save()
      ctx.font = Fh(24)
      ctx.textAlign = 'center'
      ctx.fillStyle = C('rgb(255,122,107)', fade)
      plaque(ctx, world.director.announcement, w / 2, 186)
      ctx.restore()
    }
  }

  /**
   * Faint wedges showing where the guns bear, brightening when a target is
   * actually inside one. This teaches the broadside mechanic without a word of
   * tutorial: you can see the ship has to come abeam.
   */
  private drawGunArcs(world: World, camera: Camera) {
    const player = world.player
    if (player.sunk) return

    const enemies = world.enemies
    const nearest = enemies.reduce(
      (min, e) => Math.min(min, Math.hypot(e.pos.x - player.pos.x, e.pos.y - player.pos.y)),
      Infinity,
    )
    // Only clutter the screen when gunnery is actually relevant.
    const relevance = Math.max(0, Math.min(1, (T.gunRange * 1.8 - nearest) / (T.gunRange * 0.9)))
    if (relevance <= 0.01) return

    const ctx = this.ctx
    const s = camera.worldToScreen(player.pos)
    const arc = (T.gunArcDegrees * Math.PI) / 180
    // Drawn well short of true gun range: at full range the wedge overflows the
    // screen and reads as two stray diagonals instead of an arc. What this needs
    // to communicate is *direction* — whether the target bears is already on the
    // broadside panel.
    const r = T.gunRange * 0.32 * camera.zoom

    for (const battery of [0, 1] as const) {
      const bearing = batteryBearing(player, battery)
      const loaded = player.reload[battery] <= 0
      const bears = enemies.some((e) => {
        const d = Math.hypot(e.pos.x - player.pos.x, e.pos.y - player.pos.y)
        if (d > T.gunRange) return false
        const dir = Math.atan2(e.pos.y - player.pos.y, e.pos.x - player.pos.x)
        return Math.abs(angleDiff(dir, bearing)) <= arc
      })

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.arc(s.x, s.y, r, bearing - arc, bearing + arc)
      ctx.closePath()
      // A loaded battery with a target in it glows; everything else is a hint.
      const alpha = (bears && loaded ? 0.17 : bears ? 0.09 : 0.045) * relevance
      ctx.fillStyle = bears && loaded ? `rgba(255,190,110,${alpha})` : `rgba(159,232,255,${alpha})`
      ctx.fill()
      ctx.strokeStyle = bears && loaded
        ? `rgba(255,190,110,${0.55 * relevance})`
        : `rgba(159,232,255,${0.18 * relevance})`
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()
    }
  }

  /** Condition bars over visible enemies, direction arrows for the rest. */
  private drawEnemyMarkers(world: World, camera: Camera) {
    const ctx = this.ctx
    const w = ctx.canvas.clientWidth
    const h = ctx.canvas.clientHeight
    const player = world.player

    for (const e of world.enemies) {
      const s = camera.worldToScreen(e.pos)
      const onScreen = s.x > 40 && s.x < w - 40 && s.y > 40 && s.y < h - 40

      if (onScreen) {
        const bw = 48
        // Name the hull: a Pinnace and a Brigantine demand very different
        // decisions, and the silhouettes alone are easy to misread in a fight.
        ctx.font = F(10)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        // ...and say which ones are not fights. A new captain cannot tell a
        // Galleon from a Barque by weight of shot until one has sunk them;
        // the warning goes away by itself as the build outgrows the ship,
        // which is the whole progression of the game drawn on the water.
        const run = !e.yielding && outmatches(e, player)
        // On the water, not on a panel: lettered as a chart letters the sea,
        // light type in a dark ink halo, legible over any water.
        ctx.font = F(11)
        if (run) ctx.font = F(12, true)
        const text = run ? `☠ ${e.cls.name} — RUN` : e.cls.name
        seaLabel(ctx, text, s.x, s.y - 56, run ? '#ff5a4a' : ui().menu.text)
        // What she has loaded sits after her name as the draft card's own
        // icon, because it changes what fighting her costs and nothing else
        // on the water says so. Plain round shot shows nothing.
        const loaded = e.shot === 'round' ? undefined : iconImage(SHOT_ICON[e.shot])
        if (loaded?.complete && loaded.naturalWidth > 0) {
          const half = ctx.measureText(text).width / 2
          ctx.drawImage(loaded, s.x + half + 5, s.y - 70, 18, 18)
        }
        if (e.isHunter && !e.breakingOff) {
          ctx.font = F(9.5)
          seaLabel(ctx, `hunting · ${Math.ceil(e.huntLeft)}s`, s.x, s.y - 69, 'rgba(255,190,110,0.95)')
        }

        // All three pools, in the same order and colours as your own
        // condition panel. Rigging and crew are now things you shoot *for*
        // rather than incidental damage, so hiding two of them behind a
        // single hull bar left the player unable to see the shot they were
        // actually taking.
        const bars: [number, number, string][] = [
          [e.hull, 5, '#ff7a6b'],
          [e.sails, 3, '#9fe8ff'],
          [e.crew, 3, '#ffd98a'],
        ]
        let by = s.y - 50
        for (const [value, h, color] of bars) {
          ctx.fillStyle = 'rgba(4,14,24,0.6)'
          ctx.fillRect(s.x - bw / 2, by, bw, h)
          ctx.fillStyle = color
          ctx.fillRect(s.x - bw / 2, by, bw * value, h)
          ctx.strokeStyle = ui().panel.ink
          ctx.lineWidth = 1
          ctx.strokeRect(s.x - bw / 2 + 0.5, by + 0.5, bw - 1, h - 1)
          by += h + 1.5
        }
      } else {
        // Edge arrow so you always know where the fight is.
        const a = Math.atan2(e.pos.y - player.pos.y, e.pos.x - player.pos.x)
        const m = 44
        const cx = w / 2 + Math.cos(a) * (w / 2 - m)
        const cy = h / 2 + Math.sin(a) * (h / 2 - m)
        const x = Math.max(m, Math.min(w - m, cx))
        const y = Math.max(m, Math.min(h - m, cy))
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(a)
        // A ship to run from gets a bigger, hotter arrow: knowing where she
        // is matters most exactly when she is not on screen yet.
        const run = !e.yielding && outmatches(e, player)
        if (run) ctx.scale(1.7, 1.7)
        ctx.fillStyle = run ? '#ff3b2f' : 'rgba(255,122,107,0.8)'
        ctx.beginPath()
        ctx.moveTo(12, 0)
        ctx.lineTo(-6, -7)
        ctx.lineTo(-6, 7)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }
  }

  private drawRose(ship: Ship, wind: WindSample, label: string, cx: number, cy: number, r: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(cx, cy)

    disc(ctx, 0, 0, r + 14)

    const segments = 72
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2
      const a1 = ((i + 1) / segments) * Math.PI * 2
      const rel = Math.abs(normalize((a0 + a1) / 2 - wind.from))
      ctx.beginPath()
      ctx.arc(0, 0, r + 7, a0, a1)
      ctx.lineWidth = 9
      ctx.strokeStyle = ramp(ship.polar.sample(rel))
      ctx.stroke()
    }

    ctx.strokeStyle = C('rgba(255,255,255,0.3)')
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * (r - 8), Math.sin(a) * (r - 8))
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      ctx.stroke()
    }
    ctx.fillStyle = C('rgba(255,255,255,0.55)')
    ctx.font = F(10)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('N', 0, -r + 2)

    const wl = r * (0.5 + 0.42 * Math.min(wind.strength, 2))
    ctx.save()
    ctx.rotate(wind.to)
    ctx.strokeStyle = C('#9fe8ff')
    ctx.fillStyle = C('#9fe8ff')
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-wl, 0)
    ctx.lineTo(wl - 10, 0)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(wl, 0)
    ctx.lineTo(wl - 12, -7)
    ctx.lineTo(wl - 12, 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.rotate(ship.heading)
    ctx.fillStyle = C('#ffd98a')
    ctx.beginPath()
    ctx.moveTo(r - 16, 0)
    ctx.lineTo(r - 30, -6)
    ctx.lineTo(r - 30, 6)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.restore()

    ctx.fillStyle = C('rgba(255,255,255,0.75)')
    ctx.font = F(11)
    ctx.textAlign = 'center'
    plaque(ctx, `${label} from ${compassName(wind.from)}`, cx, cy + r + 32)
  }

  private drawSailIndicator(ship: Ship, x: number, y: number): number {
    const ctx = this.ctx
    // The panel grows a line when she is lying to, because the repair rate is
    // the whole reason a captain would ever choose to be stopped.
    const mending = ship.mending > 1.02
    ctx.save()
    ctx.translate(x, y)
    const height = mending ? 114 : 92
    panel(ctx, 0, 0, PW, height)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    label(ctx, 'SAILS', IN, 12)
    ctx.fillStyle = C('#ffd98a')
    ctx.font = F(18, true)
    ctx.fillText(ship.sailName, IN, 32)

    if (mending) {
      ctx.font = F(14)
      ctx.fillStyle = C('#7fe0a0')
      ctx.fillText(`⚒ mending  ×${ship.mending.toFixed(1)}`, IN, 86)
    }

    // The sail plan, drawn as the mast it is: yards crossed from the deck up,
    // widest at the bottom. A filled yard is carrying canvas; an outlined one
    // has been ordered and the hands are still getting it on her.
    //
    // This replaced three identical bars, which could say *how much* sail was
    // set but never *which* — and the whole point of ordering courses rather
    // than topsails is which.
    const set = ship.yardsSet
    const MAST_X = PW - 46
    const FOOT = 76
    const STEP = 17
    ctx.strokeStyle = C('rgba(255,255,255,0.3)')
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(MAST_X, FOOT)
    ctx.lineTo(MAST_X, FOOT - STEP * MAX_YARDS - 6)
    ctx.stroke()

    for (let i = 0; i < MAX_YARDS; i++) {
      const half = 21 - i * 5.5
      const y = FOOT - i * STEP - 8
      const ordered = i < SAIL_STATES[ship.sailOrder].yards
      if (i < set) {
        ctx.fillStyle = C('#ffd98a')
        ctx.fillRect(MAST_X - half, y, half * 2, 6)
      } else if (ordered) {
        ctx.strokeStyle = C('rgba(255,217,138,0.55)')
        ctx.lineWidth = 1
        ctx.strokeRect(MAST_X - half + 0.5, y + 0.5, half * 2 - 1, 5)
      } else {
        ctx.fillStyle = C('rgba(255,255,255,0.14)')
        ctx.fillRect(MAST_X - half, y + 1.5, half * 2, 2)
      }
    }

    bar(ctx, IN, 66, 130, 7, ship.canvas, C('#9fe8ff'))
    ctx.restore()
    return height
  }

  private drawReadouts(ship: Ship, x: number, y: number): number {
    const ctx = this.ctx
    const pos = ship.pointOfSail
    const inIrons = pos === 'In Irons'

    ctx.save()
    ctx.translate(x, y)
    const height = 136
    panel(ctx, 0, 0, PW, height)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    label(ctx, 'POINT OF SAIL', IN, 12)
    ctx.font = F(18, true)
    // The same red-ochre-green ramp as the compass rim, in ink.
    ctx.fillStyle = inIrons ? C('#ff7a6b') : ramp(ship.polarMult)
    ctx.fillText(pos, IN, 32)
    ctx.font = F(14)
    ctx.fillStyle = C('rgba(255,255,255,0.7)')
    ctx.fillText(`${toKnots(ship.speed).toFixed(1)} kn   ${deg(ship.awa).toFixed(0)}° off wind`, IN, 58)
    this.drawLeadline(ship, IN, 86)
    ctx.restore()

    if (inIrons && ship.canvas > 0.1 && !ship.sunk) {
      ctx.save()
      ctx.font = F(16, true)
      ctx.textAlign = 'center'
      ctx.fillStyle = C('rgb(255,122,107)', 0.55 + 0.45 * Math.sin(performance.now() * 0.006))
      plaque(ctx, 'IN IRONS — bear away',
        ctx.canvas.clientWidth / 2, ctx.canvas.clientHeight - 64)
      ctx.restore()
    }
    return 136
  }

  /**
   * Shoaling water, called before she touches. A bar carries nothing above
   * water to see, so without a reading of her own the first the player knows
   * of one is being stopped dead in it — and a hazard you can only learn by
   * hitting it is a trap rather than a tactic.
   */
  private drawShoalWarning(ship: Ship) {
    if (ship.sunk) return
    const needs = draughtDepth(ship.cls.draught)
    // Warn from half as deep again as she needs: enough water to put the helm
    // over, not so much that the warning is always on in an archipelago.
    const warnAt = needs * 2.2
    if (ship.depth >= warnAt) return

    const ctx = this.ctx
    const touching = ship.aground || ship.depth <= needs
    const urgency = 1 - Math.max(0, (ship.depth - needs) / Math.max(warnAt - needs, 0.01))
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * (touching ? 0.012 : 0.006))

    ctx.save()
    ctx.font = F(16, true)
    ctx.textAlign = 'center'
    ctx.fillStyle = touching
      ? C('rgb(255,122,107)', 0.6 + 0.4 * pulse)
      : C('rgb(255,214,138)', (0.35 + 0.45 * pulse) * (0.4 + 0.6 * urgency))
    plaque(ctx,
      touching ? 'AGROUND' : 'SHALLOW — about to run aground',
      ctx.canvas.clientWidth / 2, ctx.canvas.clientHeight - 92,
    )
    ctx.restore()
  }

  /**
   * Weather warnings.
   *
   * The squall itself is drawn on the water and is meant to be read there —
   * this is the backstop, because the one thing that must never happen is a
   * player discovering the mechanic by finding their rigging gone. Two
   * different messages, because they want two different actions: one while
   * there is still time to shorten sail, and one once the canvas is actually
   * splitting.
   */
  private drawSquallWarning(world: World, ship: Ship) {
    if (ship.sunk) return
    const ctx = this.ctx
    const splitting = ship.blowout > 0.02
    const near = world.wind.weather.nearest(ship.pos.x, ship.pos.y)
    // Roughly the time it takes to get the topsails in, converted to the
    // ground a cell covers in that time.
    const coming = !splitting && near !== null && near.power > 0.15 &&
      near.distance > 0 && near.distance < T.squallSpeed * 7
    if (!splitting && !coming) return

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * (splitting ? 0.014 : 0.005))
    ctx.save()
    ctx.font = F(16, true)
    ctx.textAlign = 'center'
    ctx.fillStyle = splitting
      ? C('rgb(255,122,107)', 0.6 + 0.4 * pulse)
      : C('rgb(159,196,216)', 0.45 + 0.35 * pulse)
    // Name the bearing rather than saying "to windward": a cell is only
    // upwind at the moment it makes up, and by the time it matters it has
    // travelled. Telling the player where to look is the entire job here.
    const where = coming && near ? ` ${compassName(near.bearing)}` : ''
    plaque(ctx,
      splitting ? 'CANVAS SPLITTING — shorten sail' : `SQUALL BEARING${where}`,
      ctx.canvas.clientWidth / 2, ctx.canvas.clientHeight - 116,
    )
    ctx.restore()
  }

  /**
   * The leadline: what is under the keel, against what she draws.
   *
   * A bare depth would be a number without a question attached — what the
   * player needs to know is not how deep the water is but whether *this hull*
   * can cross it, and those are different readings for a Pinnace and a
   * Brigantine. So the bar carries a fixed mark at the depth she draws, and
   * the reading is coloured by how much water is left above it.
   *
   * Quoted in fathoms purely so the numbers sound like soundings. Open sea is
   * twelve, which puts a Sloop at the two she really drew.
   */
  private drawLeadline(ship: Ship, x: number, y: number) {
    const ctx = this.ctx
    const FATHOMS = 12
    const needs = draughtDepth(ship.cls.draught)
    const depth = Math.min(1, ship.depth)
    // A linear bar wastes most of its width on open sea, where nothing is
    // happening. Everything the player cares about is in the bottom third, so
    // the scale is stretched there and squashed above it.
    const scale = (d: number) => {
      const knee = Math.min(0.45, Math.max(needs * 2.4, 0.18))
      return d <= knee ? (d / knee) * 0.68 : 0.68 + ((d - knee) / (1 - knee)) * 0.32
    }

    const margin = (depth - needs) / Math.max(needs, 0.01)
    const touching = ship.aground || depth <= needs
    const color = touching ? C('#ff7a6b') : margin < 1 ? C('#ffd27f') : C('#9fe8ff')

    ctx.font = F(14)
    ctx.fillStyle = C('rgba(255,255,255,0.55)')
    label(ctx, 'SOUNDING', x, y)

    ctx.textAlign = 'right'
    ctx.fillStyle = color
    ctx.fillText(
      depth >= 1 ? 'no bottom' : `${(depth * FATHOMS).toFixed(1)} fm`,
      x + (PW - IN * 2), y,
    )
    ctx.textAlign = 'left'

    const barW = PW - IN * 2
    bar(ctx, x, y + 22, barW, 9, scale(depth), color)

    // The mark she draws. Everything to the left of it is bottom.
    const markX = x + barW * scale(needs)
    ctx.fillStyle = C('rgba(8,20,30,0.9)')
    ctx.fillRect(markX - 1.5, y + 20, 3, 13)
    ctx.fillStyle = touching ? C('#ff7a6b') : C('rgba(255,255,255,0.8)')
    ctx.fillRect(markX - 0.5, y + 18, 1, 17)
  }

  /** Hull, rigging and crew. Rigging is the one that changes how you sail. */
  private drawCondition(ship: Ship, x: number, y: number): number {
    const ctx = this.ctx
    const height = 40 + 3 * ROW + 6
    ctx.save()
    ctx.translate(x, y)
    panel(ctx, 0, 0, PW, height)

    ctx.font = F(14)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    label(ctx, 'CONDITION', IN, 12)
    ctx.textAlign = 'right'
    ctx.fillStyle = C('rgba(255,217,138,0.8)')
    ctx.fillText(ship.cls.name, PW - IN, 10)
    ctx.textAlign = 'left'

    const bars: [string, number, string][] = [
      ['Hull', ship.hull, C('#ff7a6b')],
      ['Rigging', ship.sails, C('#9fe8ff')],
      ['Crew', ship.crew, C('#ffd98a')],
    ]
    const repair: number[] = [ship.mods.hullRepair, ship.mods.sailRepair, ship.mods.crewRepair]
    bars.forEach(([label, value, color], i) => {
      const by = 40 + i * ROW
      const bx = 88
      const bw = PW - bx - IN
      ctx.fillStyle = C('rgba(255,255,255,0.5)')
      ctx.font = F(14)
      ctx.fillText(label, IN, by)
      bar(ctx, bx, by + 3, bw, 9, value, color)
      // A pale ghost ahead of the bar showing the next ten seconds of mending,
      // so repair is something you can watch happening rather than infer.
      const gain = repair[i] * ship.mending * 10
      if (gain > 0.004 && value < 1) {
        const ahead = Math.min(1 - value, gain)
        ctx.fillStyle = C('rgba(255,255,255,0.3)')
        ctx.fillRect(bx + bw * value, by + 3, bw * ahead, 9)
      }
    })
    ctx.restore()
    return height
  }

  /** Reload state per battery, and whether anything is actually in the arc. */
  private drawBroadsides(ship: Ship, world: World, x: number, y: number): number {
    const ctx = this.ctx
    const arc = (T.gunArcDegrees * Math.PI) / 180

    ctx.save()
    ctx.translate(x, y)
    const height = 40 + 2 * ROW + 6
    panel(ctx, 0, 0, PW, height)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    label(ctx, 'BROADSIDES', IN, 12)

    const names = ['Port', 'Starboard']
    for (const battery of [0, 1] as const) {
      const by = 40 + battery * ROW
      const loaded = 1 - Math.min(1, ship.reload[battery] / T.gunReload)
      const bearing = batteryBearing(ship, battery)
      const bears = world.enemies.some((e) => {
        const d = Math.hypot(e.pos.x - ship.pos.x, e.pos.y - ship.pos.y)
        if (d > T.gunRange) return false
        const dir = Math.atan2(e.pos.y - ship.pos.y, e.pos.x - ship.pos.x)
        return Math.abs(angleDiff(dir, bearing)) <= arc
      })

      ctx.fillStyle = bears ? C('#ffbe6e') : C('rgba(255,255,255,0.5)')
      ctx.font = F(14)
      ctx.fillText(names[battery], IN, by)
      bar(ctx, 110, by + 3, PW - 110 - IN, 9, loaded,
        loaded >= 1 ? (bears ? C('#ffbe6e') : C('#7fe0a0')) : C('rgba(159,232,255,0.6)'))
    }
    ctx.restore()
    return height
  }

  /**
   * What the captain has accumulated. Worth its own panel rather than living
   * only on the draft screen: a build you cannot see is a build you cannot
   * plan around, and the stack counts are what tell you a line is nearly spent.
   */
  private drawUpgrades(world: World, x: number, y: number) {
    const ctx = this.ctx
    const taken = world.run.taken
    if (taken.size === 0) return

    // Group order matches the draft cards, so the two read the same way.
    const order: Upgrade['group'][] = ['Sailing', 'Gunnery', 'Shot', 'Quarterdeck']
    const owned = [...taken.entries()]
      .map(([id, stacks]) => ({ upgrade: UPGRADES_BY_ID.get(id)!, stacks }))
      .filter((row) => row.upgrade)
      .sort((a, b) =>
        order.indexOf(a.upgrade.group) - order.indexOf(b.upgrade.group) ||
        a.upgrade.name.localeCompare(b.upgrade.name))

    const rowH = 21
    const height = 38 + owned.length * rowH + 4

    ctx.save()
    ctx.translate(x, y)
    panel(ctx, 0, 0, PW, height)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    label(ctx, 'REFIT', IN, 12)

    owned.forEach(({ upgrade, stacks }, i) => {
      const ry = 38 + i * rowH
      const color = ui().groups[upgrade.group]

      // Each row leads with the card's icon, the same one the draft showed;
      // until it has decoded, a colour tab stands in for it.
      const art = iconImage(upgrade.id)
      if (art?.complete && art.naturalWidth > 0) {
        ctx.drawImage(art, IN - 2, ry - 2, 19, 19)
      } else {
        ctx.fillStyle = color
        ctx.fillRect(IN, ry + 2, 3, 13)
      }

      ctx.font = F(14)
      ctx.fillStyle = C('rgba(255,255,255,0.82)')
      ctx.fillText(shortName(upgrade.name), IN + 22, ry)

      // Pips: filled for what you hold, hollow for what is still available.
      const pipR = 3.6
      const gap = 9.5
      const right = PW - IN - 2
      for (let p = 0; p < upgrade.maxStacks; p++) {
        const px = right - (upgrade.maxStacks - 1 - p) * gap
        ctx.beginPath()
        ctx.arc(px, ry + 8, pipR, 0, Math.PI * 2)
        if (p < stacks) {
          ctx.fillStyle = color
          ctx.fill()
        } else {
          ctx.strokeStyle = C('rgba(255,255,255,0.4)')
          ctx.lineWidth = 1.2
          ctx.stroke()
        }
      }
    })
    ctx.restore()
  }

  private banner(text: string, color: string, y = 56) {
    const ctx = this.ctx
    ctx.save()
    ctx.font = Fh(30)
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    plaque(ctx, titleCase(text), ctx.canvas.clientWidth / 2, y)
    ctx.restore()
  }

  /** Clock, level and plunder across the top — the run at a glance. */
  private drawRunBar(world: World, w: number) {
    const ctx = this.ctx
    const run = world.run
    const cx = w / 2

    ctx.save()
    panel(ctx, cx - 200, 14, 400, 76)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    if (run.endless) {
      // Past the voyage the clock counts up, because it is a score now.
      const over = run.overtime
      const mins = Math.floor(over / 60)
      const secs = Math.floor(over % 60)
      ctx.font = F(26, true)
      ctx.fillStyle = C('#ff9ad5')
      ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, cx, 22)
      ctx.font = F(14)
      ctx.fillStyle = C('rgba(255,154,213,0.75)')
      ctx.fillText(`SAILING ON  ·  WAVE ${run.wave}`, cx, 56)
    } else {
      // Time remaining, which is the actual win condition.
      const left = run.remaining
      const mins = Math.floor(left / 60)
      const secs = Math.floor(left % 60)
      ctx.font = F(26, true)
      ctx.fillStyle = left < 30 ? C('#ff7a6b') : C('#cfe6f5')
      ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, cx, 22)
      ctx.font = F(10)
      ctx.fillStyle = C('rgba(255,255,255,0.45)')
      label(ctx, 'REMAINING', cx, 56)
    }

    // Level and the plunder bar filling toward the next draft.
    ctx.textAlign = 'left'
    ctx.font = F(16, true)
    ctx.fillStyle = C('#ffd98a')
    ctx.fillText(`Lv ${run.level}`, cx - 184, 24)

    const barW = 116
    bar(ctx, cx - 184, 52, barW, 9, run.plunder / run.plunderNeeded, C('#f0c14b'))

    ctx.textAlign = 'right'
    ctx.font = F(14)
    ctx.fillStyle = C('rgba(255,255,255,0.7)')
    ctx.fillText(
      run.shipsTaken > 0 ? `${run.shipsSunk} sunk · ${run.shipsTaken} taken` : `${run.shipsSunk} sunk`,
      cx + 184, 24,
    )
    ctx.fillStyle = C('rgba(240,193,75,0.8)')
    ctx.fillText(`${Math.floor(run.totalPlunder)} plunder`, cx + 184, 50)

    // A thin progress line along the bottom edge of the panel: progress through
    // the voyage, or through the current wave once endless.
    ctx.fillStyle = run.endless ? C('rgba(255,154,213,0.6)') : C('rgba(159,232,255,0.5)')
    ctx.fillRect(cx - 200, 87, 400 * run.waveProgress, 2)
    ctx.restore()
  }

  private endCard(world: World, won: boolean, ledger: Ledger | null) {
    const ctx = this.ctx
    const w = ctx.canvas.clientWidth
    const h = ctx.canvas.clientHeight
    const run = world.run
    const cx = w / 2

    const stamp = (seconds: number) =>
      `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`

    // Laid out as a list first and drawn second, so the sheet behind it is
    // exactly as tall as what it says. It used to be sized by estimate, which
    // left a dead band in the middle and slack at the foot.
    type Line = { text: string; font: string; color: string; height: number }
    const lines: Line[] = []
    const add = (text: string, font: string, color: string, height: number) =>
      lines.push({ text, font, color, height })
    const gap = (height: number) => lines.push({ text: '', font: '', color: '', height })

    add(titleCase(won ? 'VOYAGE COMPLETE' : 'SUNK'), Fh(46), won ? C('#7fe0a0') : C('#ff7a6b'), 60)
    add(
      `survived ${stamp(run.elapsed)}   ·   ${run.shipsSunk} sunk   ·   ` +
        `${run.shipsTaken} taken   ·   level ${run.level}`,
      F(15), C('#cfe6f5'), 26,
    )
    // Sailing on is its own achievement, so it gets its own line.
    if (run.endless) {
      add(`endless: ${stamp(run.overtime)}   ·   wave ${run.wave}`, F(15), C('#ff9ad5'), 24)
    }

    // What the voyage paid, what it opened, and what that puts within reach.
    // The last line is the reason to press R: it names the next thing and
    // how far off it is.
    if (ledger) {
      gap(14)
      const pay = payoutFor(run)
      const parts = [`${pay.haul.toLocaleString()} plunder`]
      if (pay.bonus > 0) parts.push(`${pay.bonus.toLocaleString()} voyage`)
      if (pay.bounty > 0) parts.push(`${pay.bounty.toLocaleString()} Man-o'-War`)
      const feats = ledger.news.reduce((sum, f) => sum + f.bounty, 0)
      if (feats > 0) parts.push(`${feats.toLocaleString()} feats`)
      add(`+${ledger.earned.toLocaleString()} doubloons`, F(20, true), C('#f0c14b'), 28)
      if (parts.length > 1) add(parts.join('  +  '), F(13), C('rgba(255,255,255,0.7)'), 22)
      for (const feat of ledger.news) {
        add(
          feat.opens === 'a bounty' ? `✓ ${feat.name}` : `✓ ${feat.name} — unlocks ${feat.opens}`,
          F(14), C('#7fe0a0'), 21,
        )
      }
      if (ledger.rung > 0) {
        add(`Notoriety ${ledger.rung} · ${notorietyName(ledger.rung)} unlocked`, F(14), C('#ff7a6b'), 21)
      }
      const career = ledger.career
      const next = nextPurchase(career)
      let purse = `${career.doubloons.toLocaleString()} in the purse`
      if (next) {
        const short = next.price - career.doubloons
        purse += short <= 0
          ? `   ·   enough for ${next.name}`
          : `   ·   ${short.toLocaleString()} short of ${next.name}`
      }
      add(purse, F(14), C('rgba(240,193,75,0.85)'), 24)
    }
    gap(16)
    const keysHeight = 26

    const pad = 26
    const height = lines.reduce((sum, l) => sum + l.height, 0) + keysHeight + pad * 2
    const top = Math.max(16, h / 2 - height / 2)

    ctx.save()
    ctx.fillStyle = ui().overlay
    ctx.fillRect(0, 0, w, h)
    // The card is a sheet of paper of its own.
    panel(ctx, cx - 380, top, 760, height)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let y = top + pad
    for (const line of lines) {
      if (line.text) {
        ctx.font = line.font
        ctx.fillStyle = line.color
        ctx.fillText(line.text, cx, y + line.height / 2)
      }
      y += line.height
    }

    // The two ways out, side by side, as keys rather than sentences.
    ctx.font = F(14)
    ctx.fillStyle = C('rgba(255,255,255,0.85)')
    const ky = y + keysHeight / 2
    if (won) {
      keyHint(ctx, 'C', 'sail on, endless', cx - 120, ky)
      keyHint(ctx, 'R', 'make port', cx + 120, ky)
    } else {
      keyHint(ctx, 'R', 'make port', cx, ky)
    }
    ctx.restore()
  }
}

/** Keep names inside the panel; the pips carry the rest of the meaning. */
/** The draft card whose icon stands for each enemy shot type. */
const SHOT_ICON = { chain: 'chain-shot', grape: 'grape-shot', double: 'round-shot' } as const

function shortName(name: string): string {
  const trimmed = name.replace(/^(Another|Ship's)\s+/, (m) => m.trim() === 'Another' ? '+1 ' : '')
  return trimmed.length > 14 ? `${trimmed.slice(0, 13)}…` : trimmed
}

function normalize(a: number): number {
  let d = a % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function speedColor(mult: number): string {
  const m = Math.max(0, Math.min(1, mult))
  if (m < 0.33) {
    const t = m / 0.33
    return `rgb(220, ${Math.round(70 + t * 90)}, ${Math.round(70 - t * 30)})`
  }
  const t = (m - 0.33) / 0.67
  return `rgb(${Math.round(220 - t * 130)}, ${Math.round(160 + t * 70)}, ${Math.round(40 + t * 90)})`
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
