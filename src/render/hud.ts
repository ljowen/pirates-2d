import type { Ship } from '../sim/ship'
import { SAIL_STATES } from '../sim/ship'
import type { WindSample } from '../sim/wind'
import type { World } from '../sim/world'
import type { Camera } from './camera'
import { T } from '../sim/tuning'
import { angleDiff, compassName, deg } from '../core/math'
import { batteryBearing } from '../sim/combat'
import { UPGRADES_BY_ID, type Upgrade } from '../sim/upgrades'
import { draughtDepth } from '../sim/terrain'
import { nextHull, payoutFor, priceOf, type Ledger } from '../meta/career'

/**
 * Instruments, drawn on a plain 2D canvas over the Pixi view. Two of these are
 * load-bearing rather than decorative: the compass rose paints the polar curve
 * around its rim so you can see where you *could* go, and the gun arcs show
 * where your broadside actually bears so positioning is legible.
 */
export class Hud {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  draw(
    world: World, camera: Camera, paused: boolean, turbo: boolean, silent = false,
    ledger: Ledger | null = null,
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
    this.drawSailIndicator(player, 24, 24)
    this.drawReadouts(player, 24, 128)
    this.drawCondition(player, 24, 246)
    this.drawShoalWarning(player)
    this.drawSquallWarning(world, player)
    this.drawBroadsides(player, world, 24, 336)
    this.drawUpgrades(world, 24, 412)

    if (silent) {
      ctx.save()
      ctx.font = '11px ui-monospace, monospace'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgba(207,230,245,0.45)'
      ctx.fillText('sound off — M', w - 24, ctx.canvas.clientHeight - 48)
      ctx.restore()
    }

    if (world.run.state === 'won') this.endCard(world, true, ledger)
    else if (world.run.state === 'lost') this.endCard(world, false, ledger)
    else if (paused) this.banner('PAUSED', '#ffd27f', 150)
    else if (turbo) this.banner('TURBO', '#7fe0a0', 150)

    // Boss waves get called out, because three Brigantines appearing over the
    // horizon with no warning is just a sudden death.
    if (world.director.announcementTime > 0 && world.director.announcement) {
      const fade = Math.min(1, world.director.announcementTime / 1.2)
      ctx.save()
      ctx.font = 'bold 22px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = `rgba(255,122,107,${fade})`
      ctx.fillText(world.director.announcement, w / 2, 186)
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
        ctx.font = '10px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = TIER_COLORS[e.cls.tier] ?? 'rgba(255,255,255,0.7)'
        ctx.fillText(e.cls.name, s.x, s.y - 56)

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
        ctx.fillStyle = 'rgba(255,122,107,0.8)'
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

    ctx.beginPath()
    ctx.arc(0, 0, r + 14, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(6,20,32,0.72)'
    ctx.fill()

    const segments = 72
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2
      const a1 = ((i + 1) / segments) * Math.PI * 2
      const rel = Math.abs(normalize((a0 + a1) / 2 - wind.from))
      ctx.beginPath()
      ctx.arc(0, 0, r + 7, a0, a1)
      ctx.lineWidth = 9
      ctx.strokeStyle = speedColor(ship.polar.sample(rel))
      ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * (r - 8), Math.sin(a) * (r - 8))
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = '10px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('N', 0, -r + 2)

    const wl = r * (0.5 + 0.42 * Math.min(wind.strength, 2))
    ctx.save()
    ctx.rotate(wind.to)
    ctx.strokeStyle = '#9fe8ff'
    ctx.fillStyle = '#9fe8ff'
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
    ctx.fillStyle = '#ffd98a'
    ctx.beginPath()
    ctx.moveTo(r - 16, 0)
    ctx.lineTo(r - 30, -6)
    ctx.lineTo(r - 30, 6)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.restore()

    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.font = '11px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`${label} from ${compassName(wind.from)}`, cx, cy + r + 32)
  }

  private drawSailIndicator(ship: Ship, x: number, y: number) {
    const ctx = this.ctx
    // The panel grows a line when she is lying to, because the repair rate is
    // the whole reason a captain would ever choose to be stopped.
    const mending = ship.mending > 1.02
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = 'rgba(6,20,32,0.72)'
    roundRect(ctx, 0, 0, 186, mending ? 104 : 86, 6)
    ctx.fill()

    ctx.font = '12px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText('SAILS', 12, 11)
    ctx.fillStyle = '#ffd98a'
    ctx.font = 'bold 15px ui-monospace, monospace'
    ctx.fillText(ship.sailName, 12, 28)

    if (mending) {
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillStyle = '#7fe0a0'
      ctx.fillText(`⚒ mending  ×${ship.mending.toFixed(1)}`, 12, 84)
    }

    // The sail plan, drawn as the mast it is: yards crossed from the deck up,
    // widest at the bottom. A filled yard is carrying canvas; an outlined one
    // has been ordered and the hands are still getting it on her.
    //
    // This replaced three identical bars, which could say *how much* sail was
    // set but never *which* — and the whole point of ordering courses rather
    // than topsails is which.
    const set = ship.yardsSet
    const MAST_X = 142
    const FOOT = 74
    const STEP = 13
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(MAST_X, FOOT)
    ctx.lineTo(MAST_X, FOOT - STEP * 3 - 6)
    ctx.stroke()

    for (let i = 0; i < 3; i++) {
      const half = 17 - i * 3.6
      const y = FOOT - i * STEP - 7
      const ordered = i < SAIL_STATES[ship.sailOrder].yards
      if (i < set) {
        ctx.fillStyle = '#ffd98a'
        ctx.fillRect(MAST_X - half, y, half * 2, 5)
      } else if (ordered) {
        ctx.strokeStyle = 'rgba(255,217,138,0.55)'
        ctx.lineWidth = 1
        ctx.strokeRect(MAST_X - half + 0.5, y + 0.5, half * 2 - 1, 4)
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.14)'
        ctx.fillRect(MAST_X - half, y + 1.5, half * 2, 2)
      }
    }

    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.fillRect(12, 66, 104, 4)
    ctx.fillStyle = '#9fe8ff'
    ctx.fillRect(12, 66, 104 * ship.canvas, 4)
    ctx.restore()
  }

  private drawReadouts(ship: Ship, x: number, y: number) {
    const ctx = this.ctx
    const pos = ship.pointOfSail
    const inIrons = pos === 'In Irons'

    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = 'rgba(6,20,32,0.72)'
    roundRect(ctx, 0, 0, 186, 110, 6)
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText('POINT OF SAIL', 12, 11)
    ctx.font = 'bold 15px ui-monospace, monospace'
    ctx.fillStyle = inIrons ? '#ff7a6b' : speedColor(ship.polarMult)
    ctx.fillText(pos, 12, 28)
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(`${ship.speed.toFixed(0)} kn   ${deg(ship.awa).toFixed(0)}° off wind`, 12, 52)
    this.drawLeadline(ship, 12, 74)
    ctx.restore()

    if (inIrons && ship.canvas > 0.1 && !ship.sunk) {
      ctx.save()
      ctx.font = 'bold 16px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = `rgba(255,122,107,${0.55 + 0.45 * Math.sin(performance.now() * 0.006)})`
      ctx.fillText('IN IRONS — bear away',
        ctx.canvas.clientWidth / 2, ctx.canvas.clientHeight - 64)
      ctx.restore()
    }
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
    ctx.font = 'bold 16px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = touching
      ? `rgba(255,122,107,${0.6 + 0.4 * pulse})`
      : `rgba(255,214,138,${(0.35 + 0.45 * pulse) * (0.4 + 0.6 * urgency)})`
    ctx.fillText(
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
    ctx.font = 'bold 16px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = splitting
      ? `rgba(255,122,107,${0.6 + 0.4 * pulse})`
      : `rgba(159,196,216,${0.45 + 0.35 * pulse})`
    // Name the bearing rather than saying "to windward": a cell is only
    // upwind at the moment it makes up, and by the time it matters it has
    // travelled. Telling the player where to look is the entire job here.
    const where = coming && near ? ` ${compassName(near.bearing)}` : ''
    ctx.fillText(
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
    const color = touching ? '#ff7a6b' : margin < 1 ? '#ffd27f' : '#9fe8ff'

    ctx.font = '12px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText('SOUNDING', x, y)

    ctx.textAlign = 'right'
    ctx.fillStyle = color
    ctx.fillText(
      depth >= 1 ? 'no bottom' : `${(depth * FATHOMS).toFixed(1)} fm`,
      x + 162, y,
    )
    ctx.textAlign = 'left'

    const barW = 162
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fillRect(x, y + 17, barW, 8)
    ctx.fillStyle = color
    ctx.fillRect(x, y + 17, barW * scale(depth), 8)

    // The mark she draws. Everything to the left of it is bottom.
    const markX = x + barW * scale(needs)
    ctx.fillStyle = 'rgba(8,20,30,0.9)'
    ctx.fillRect(markX - 1.5, y + 15, 3, 12)
    ctx.fillStyle = touching ? '#ff7a6b' : 'rgba(255,255,255,0.8)'
    ctx.fillRect(markX - 0.5, y + 13, 1, 16)
  }

  /** Hull, rigging and crew. Rigging is the one that changes how you sail. */
  private drawCondition(ship: Ship, x: number, y: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = 'rgba(6,20,32,0.72)'
    roundRect(ctx, 0, 0, 186, 80, 6)
    ctx.fill()

    ctx.font = '12px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText('CONDITION', 12, 10)
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,217,138,0.8)'
    ctx.fillText(ship.cls.name, 174, 10)
    ctx.textAlign = 'left'

    const bars: [string, number, string][] = [
      ['Hull', ship.hull, '#ff7a6b'],
      ['Rigging', ship.sails, '#9fe8ff'],
      ['Crew', ship.crew, '#ffd98a'],
    ]
    const repair: number[] = [ship.mods.hullRepair, ship.mods.sailRepair, ship.mods.crewRepair]
    bars.forEach(([label, value, color], i) => {
      const by = 28 + i * 17
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillText(label, 12, by)
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      ctx.fillRect(72, by, 102, 8)
      ctx.fillStyle = color
      ctx.fillRect(72, by, 102 * value, 8)
      // A pale ghost ahead of the bar showing the next ten seconds of mending,
      // so repair is something you can watch happening rather than infer.
      const gain = repair[i] * ship.mending * 10
      if (gain > 0.004 && value < 1) {
        const ahead = Math.min(1 - value, gain)
        ctx.fillStyle = 'rgba(255,255,255,0.3)'
        ctx.fillRect(72 + 102 * value, by, 102 * ahead, 8)
      }
    })
    ctx.restore()
  }

  /** Reload state per battery, and whether anything is actually in the arc. */
  private drawBroadsides(ship: Ship, world: World, x: number, y: number) {
    const ctx = this.ctx
    const arc = (T.gunArcDegrees * Math.PI) / 180

    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = 'rgba(6,20,32,0.72)'
    roundRect(ctx, 0, 0, 186, 66, 6)
    ctx.fill()

    ctx.font = '12px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText('BROADSIDES', 12, 10)

    const names = ['Port', 'Starboard']
    for (const battery of [0, 1] as const) {
      const by = 28 + battery * 17
      const loaded = 1 - Math.min(1, ship.reload[battery] / T.gunReload)
      const bearing = batteryBearing(ship, battery)
      const bears = world.enemies.some((e) => {
        const d = Math.hypot(e.pos.x - ship.pos.x, e.pos.y - ship.pos.y)
        if (d > T.gunRange) return false
        const dir = Math.atan2(e.pos.y - ship.pos.y, e.pos.x - ship.pos.x)
        return Math.abs(angleDiff(dir, bearing)) <= arc
      })

      ctx.fillStyle = bears ? '#ffbe6e' : 'rgba(255,255,255,0.5)'
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillText(names[battery], 12, by)
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      ctx.fillRect(84, by, 90, 8)
      ctx.fillStyle = loaded >= 1 ? (bears ? '#ffbe6e' : '#7fe0a0') : 'rgba(159,232,255,0.6)'
      ctx.fillRect(84, by, 90 * loaded, 8)
    }
    ctx.restore()
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

    const rowH = 15
    const height = 26 + owned.length * rowH

    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = 'rgba(6,20,32,0.72)'
    roundRect(ctx, 0, 0, 186, height, 6)
    ctx.fill()

    ctx.font = '12px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText('REFIT', 12, 9)

    owned.forEach(({ upgrade, stacks }, i) => {
      const ry = 26 + i * rowH
      const color = GROUP_COLORS[upgrade.group]

      // A colour tab keeps the groups scannable without repeating the label.
      ctx.fillStyle = color
      ctx.fillRect(12, ry + 1, 3, 10)

      ctx.font = '11px ui-monospace, monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.82)'
      ctx.fillText(shortName(upgrade.name), 20, ry)

      // Pips: filled for what you hold, hollow for what is still available.
      const pipR = 3
      const gap = 7.5
      const right = 174
      for (let p = 0; p < upgrade.maxStacks; p++) {
        const px = right - (upgrade.maxStacks - 1 - p) * gap
        ctx.beginPath()
        ctx.arc(px, ry + 5.5, pipR, 0, Math.PI * 2)
        if (p < stacks) {
          ctx.fillStyle = color
          ctx.fill()
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.32)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }
    })
    ctx.restore()
  }

  private banner(text: string, color: string, y = 56) {
    const ctx = this.ctx
    ctx.save()
    ctx.font = 'bold 28px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.fillText(text, ctx.canvas.clientWidth / 2, y)
    ctx.restore()
  }

  /** Clock, level and plunder across the top — the run at a glance. */
  private drawRunBar(world: World, w: number) {
    const ctx = this.ctx
    const run = world.run
    const cx = w / 2

    ctx.save()
    ctx.fillStyle = 'rgba(6,20,32,0.78)'
    roundRect(ctx, cx - 180, 14, 360, 62, 7)
    ctx.fill()

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    if (run.endless) {
      // Past the voyage the clock counts up, because it is a score now.
      const over = run.overtime
      const mins = Math.floor(over / 60)
      const secs = Math.floor(over % 60)
      ctx.font = 'bold 22px ui-monospace, monospace'
      ctx.fillStyle = '#ff9ad5'
      ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, cx, 22)
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillStyle = 'rgba(255,154,213,0.75)'
      ctx.fillText(`SAILING ON  ·  WAVE ${run.wave}`, cx, 48)
    } else {
      // Time remaining, which is the actual win condition.
      const left = run.remaining
      const mins = Math.floor(left / 60)
      const secs = Math.floor(left % 60)
      ctx.font = 'bold 22px ui-monospace, monospace'
      ctx.fillStyle = left < 30 ? '#ff7a6b' : '#cfe6f5'
      ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, cx, 22)
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fillText('REMAINING', cx, 48)
    }

    // Level and the plunder bar filling toward the next draft.
    ctx.textAlign = 'left'
    ctx.font = 'bold 13px ui-monospace, monospace'
    ctx.fillStyle = '#ffd98a'
    ctx.fillText(`Lv ${run.level}`, cx - 166, 24)

    const barW = 96
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(cx - 166, 44, barW, 7)
    ctx.fillStyle = '#f0c14b'
    ctx.fillRect(cx - 166, 44, barW * Math.min(1, run.plunder / run.plunderNeeded), 7)

    ctx.textAlign = 'right'
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(
      run.shipsTaken > 0 ? `${run.shipsSunk} sunk · ${run.shipsTaken} taken` : `${run.shipsSunk} sunk`,
      cx + 166, 24,
    )
    ctx.fillStyle = 'rgba(240,193,75,0.8)'
    ctx.fillText(`${Math.floor(run.totalPlunder)} plunder`, cx + 166, 44)

    // A thin progress line along the bottom edge of the panel: progress through
    // the voyage, or through the current wave once endless.
    ctx.fillStyle = run.endless ? 'rgba(255,154,213,0.6)' : 'rgba(159,232,255,0.5)'
    ctx.fillRect(cx - 180, 73, 360 * run.waveProgress, 2)
    ctx.restore()
  }

  private endCard(world: World, won: boolean, ledger: Ledger | null) {
    const ctx = this.ctx
    const w = ctx.canvas.clientWidth
    const h = ctx.canvas.clientHeight
    const run = world.run

    ctx.save()
    ctx.fillStyle = 'rgba(4,14,24,0.74)'
    ctx.fillRect(0, 0, w, h)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 40px ui-monospace, monospace'
    ctx.fillStyle = won ? '#7fe0a0' : '#ff7a6b'
    ctx.fillText(won ? 'VOYAGE COMPLETE' : 'SUNK', w / 2, h / 2 - 64)

    const stamp = (seconds: number) =>
      `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`

    ctx.font = '15px ui-monospace, monospace'
    ctx.fillStyle = '#cfe6f5'
    ctx.fillText(
      `survived ${stamp(run.elapsed)}   ·   ${run.shipsSunk} sunk   ·   ` +
        `${run.shipsTaken} taken   ·   level ${run.level}`,
      w / 2, h / 2 - 16,
    )

    // Sailing on is its own achievement, so it gets its own line.
    if (run.endless) {
      ctx.font = '15px ui-monospace, monospace'
      ctx.fillStyle = '#ff9ad5'
      ctx.fillText(
        `sailed on ${stamp(run.overtime)} past the voyage   ·   reached wave ${run.wave}`,
        w / 2, h / 2 + 12,
      )
    }

    // What the voyage paid, and what that puts within reach. The second line
    // is the reason to press R: it names the next hull and how far off she is.
    let y = h / 2 + 46
    if (ledger) {
      const pay = payoutFor(run)
      ctx.font = 'bold 17px ui-monospace, monospace'
      ctx.fillStyle = '#f0c14b'
      ctx.fillText(
        pay.bonus > 0
          ? `+${pay.total.toLocaleString()} doubloons   (${pay.haul.toLocaleString()} plunder + ${pay.bonus} voyage)`
          : `+${pay.total.toLocaleString()} doubloons`,
        w / 2, y,
      )
      y += 24
      const career = ledger.career
      const next = nextHull(career)
      ctx.font = '13px ui-monospace, monospace'
      ctx.fillStyle = 'rgba(240,193,75,0.75)'
      let line = `${career.doubloons.toLocaleString()} in the purse`
      if (next) {
        const short = priceOf(next) - career.doubloons
        line += short <= 0
          ? `   ·   the ${next.name} is yours for ${priceOf(next).toLocaleString()}`
          : `   ·   ${short.toLocaleString()} short of the ${next.name}`
      }
      ctx.fillText(line, w / 2, y)
      y += 34
    }

    ctx.font = '13px ui-monospace, monospace'
    if (won) {
      ctx.fillStyle = '#ff9ad5'
      ctx.fillText('C — sail on into endless waves', w / 2, y)
      ctx.fillStyle = 'rgba(207,230,245,0.5)'
      ctx.fillText('R — make port', w / 2, y + 24)
    } else {
      ctx.fillStyle = 'rgba(207,230,245,0.55)'
      ctx.fillText('R — make port', w / 2, y)
    }
    ctx.restore()
  }
}

/** Matches the draft card colours, so a card and its panel row agree. */
const GROUP_COLORS: Record<Upgrade['group'], string> = {
  Sailing: '#9fe8ff',
  Gunnery: '#ffbe6e',
  Shot: '#ff9ad5',
  Quarterdeck: '#7fe0a0',
}

/** Keep names inside the panel; the pips carry the rest of the meaning. */
function shortName(name: string): string {
  const trimmed = name.replace(/^(Another|Ship's)\s+/, (m) => m.trim() === 'Another' ? '+1 ' : '')
  return trimmed.length > 15 ? `${trimmed.slice(0, 14)}…` : trimmed
}

/** Rising threat reads as rising heat. */
const TIER_COLORS: Record<number, string> = {
  1: 'rgba(170,220,255,0.85)',
  2: 'rgba(255,214,138,0.9)',
  3: 'rgba(255,138,122,0.95)',
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
