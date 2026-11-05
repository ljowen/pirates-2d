import type { Ship } from '../sim/ship'
import type { WindSample } from '../sim/wind'
import type { World } from '../sim/world'
import type { Camera } from './camera'
import { T } from '../sim/tuning'
import { angleDiff, compassName, deg } from '../core/math'
import { batteryBearing } from '../sim/combat'
import { harbourAt, shipyardsNear } from '../sim/shipyard'
import { UPGRADES_BY_ID, type Upgrade } from '../sim/upgrades'

/**
 * Instruments, drawn on a plain 2D canvas over the Pixi view. Two of these are
 * load-bearing rather than decorative: the compass rose paints the polar curve
 * around its rim so you can see where you *could* go, and the gun arcs show
 * where your broadside actually bears so positioning is legible.
 */
export class Hud {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  draw(world: World, camera: Camera, paused: boolean, turbo: boolean, silent = false) {
    const ctx = this.ctx
    const w = ctx.canvas.clientWidth
    const player = world.player

    this.drawGunArcs(world, camera)
    this.drawHarbourMarkers(world, camera)
    this.drawEnemyMarkers(world, camera)

    this.drawRunBar(world, w)
    // The rose shows the wind where the player actually is, not the ambient
    // average — otherwise local weather would be invisible to them.
    const localWind = world.windAt(player.pos)
    this.drawRose(player, localWind, world.wind.describe(localWind.strength), w - 100, 100, 62)
    this.drawSailIndicator(player, 24, 24)
    this.drawReadouts(player, 24, 128)
    this.drawCondition(player, 24, 210)
    this.drawBroadsides(player, world, 24, 300)
    this.drawUpgrades(world, 24, 376)

    if (silent) {
      ctx.save()
      ctx.font = '11px ui-monospace, monospace'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgba(207,230,245,0.45)'
      ctx.fillText('sound off — M', w - 24, ctx.canvas.clientHeight - 48)
      ctx.restore()
    }

    if (world.run.state === 'won') this.endCard(world, true)
    else if (world.run.state === 'lost') this.endCard(world, false)
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

  /**
   * Where the yards are.
   *
   * The economy asks the player to sail somewhere specific, which is only a
   * decision if they can see where. Visible harbours get a mark on the water;
   * the nearest one gets a bearing and a range at the screen edge so it can be
   * steered for from anywhere.
   */
  private drawHarbourMarkers(world: World, camera: Camera) {
    const ctx = this.ctx
    const w = ctx.canvas.clientWidth
    const h = ctx.canvas.clientHeight
    const player = world.player
    const reach = Math.max(camera.viewW, camera.viewH) / camera.zoom

    for (const island of shipyardsNear(world.terrain, camera.pos, reach)) {
      const mouth = harbourAt(island)
      const p = camera.worldToScreen(mouth)
      if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) continue

      const pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.003)
      ctx.save()
      ctx.strokeStyle = `rgba(240,193,75,${0.75 * pulse})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(p.x, p.y, 13, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = `rgba(240,193,75,${0.9 * pulse})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.font = '9px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('YARD', p.x, p.y + 26)
      ctx.restore()
    }

    // A standing bearing to the nearest, so port is always findable.
    const nearest = world.nearestYard
    if (!nearest) return
    const onScreen = (() => {
      const p = camera.worldToScreen(nearest.pos)
      return p.x > 0 && p.x < w && p.y > 0 && p.y < h
    })()
    if (onScreen) return

    const angle = Math.atan2(nearest.pos.y - player.pos.y, nearest.pos.x - player.pos.x)
    const margin = 70
    const x = Math.max(margin, Math.min(w - margin, w / 2 + Math.cos(angle) * (w / 2 - margin)))
    const y = Math.max(margin, Math.min(h - margin, h / 2 + Math.sin(angle) * (h / 2 - margin)))

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.fillStyle = 'rgba(240,193,75,0.85)'
    ctx.beginPath()
    ctx.moveTo(13, 0)
    ctx.lineTo(-6, -7)
    ctx.lineTo(-6, 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.font = '10px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(240,193,75,0.75)'
    ctx.fillText(`yard ${Math.round(nearest.distance)}`, x, y + 22)
    ctx.restore()
  }

  /** Health pips over visible enemies, direction arrows for the rest. */
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
        ctx.fillText(e.cls.name, s.x, s.y - 52)

        ctx.fillStyle = 'rgba(4,14,24,0.6)'
        ctx.fillRect(s.x - bw / 2, s.y - 46, bw, 5)
        ctx.fillStyle = '#ff7a6b'
        ctx.fillRect(s.x - bw / 2, s.y - 46, bw * e.hull, 5)
        // A thin second bar for rigging — the thing you shoot to stop them fleeing.
        ctx.fillStyle = 'rgba(4,14,24,0.6)'
        ctx.fillRect(s.x - bw / 2, s.y - 40, bw, 3)
        ctx.fillStyle = '#dcd2d8'
        ctx.fillRect(s.x - bw / 2, s.y - 40, bw * e.sails, 3)
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
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = 'rgba(6,20,32,0.72)'
    roundRect(ctx, 0, 0, 186, 86, 6)
    ctx.fill()

    ctx.font = '12px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText('SAILS', 12, 11)
    ctx.fillStyle = '#ffd98a'
    ctx.font = 'bold 15px ui-monospace, monospace'
    ctx.fillText(ship.sailName, 12, 28)

    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i <= ship.sailOrder ? '#ffd98a' : 'rgba(255,255,255,0.18)'
      ctx.fillRect(12 + i * 32, 54, 26, 7)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.fillRect(12, 66, 162, 4)
    ctx.fillStyle = '#9fe8ff'
    ctx.fillRect(12, 66, 162 * ship.canvas, 4)
    ctx.restore()
  }

  private drawReadouts(ship: Ship, x: number, y: number) {
    const ctx = this.ctx
    const pos = ship.pointOfSail
    const inIrons = pos === 'In Irons'

    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = 'rgba(6,20,32,0.72)'
    roundRect(ctx, 0, 0, 186, 74, 6)
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
    ctx.restore()

    if (inIrons && ship.canvas > 0.1 && !ship.sunk) {
      ctx.save()
      ctx.font = 'bold 16px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = `rgba(255,122,107,${0.55 + 0.45 * Math.sin(performance.now() * 0.006)})`
      ctx.fillText('IN IRONS — bear away to fill your sails',
        ctx.canvas.clientWidth / 2, ctx.canvas.clientHeight - 64)
      ctx.restore()
    }
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
    ctx.fillText(ship.cls.name, 118, 10)
    ctx.textAlign = 'left'

    const bars: [string, number, string][] = [
      ['Hull', ship.hull, '#ff7a6b'],
      ['Rigging', ship.sails, '#9fe8ff'],
      ['Crew', ship.crew, '#ffd98a'],
    ]

    // How deep she is riding. Everything taken aboard shows here, so the cost
    // of arming heavily is visible before a shoal makes it obvious.
    ctx.textAlign = 'right'
    ctx.font = '10px ui-monospace, monospace'
    const laden = ship.draught
    ctx.fillStyle = laden > 0.9
      ? '#ff7a6b'
      : laden > 0.7 ? '#ffd98a' : 'rgba(159,232,255,0.75)'
    ctx.fillText(`draws ${laden.toFixed(2)}`, 174, 10)
    ctx.textAlign = 'left'
    bars.forEach(([label, value, color], i) => {
      const by = 28 + i * 17
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '11px ui-monospace, monospace'
      ctx.fillText(label, 12, by)
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      ctx.fillRect(72, by, 102, 8)
      ctx.fillStyle = color
      ctx.fillRect(72, by, 102 * value, 8)
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

    // Coin in hand — the thing a shipyard cares about.
    ctx.textAlign = 'left'
    ctx.font = 'bold 15px ui-monospace, monospace'
    ctx.fillStyle = '#f0c14b'
    ctx.fillText(`${Math.floor(run.coins)}`, cx - 166, 22)
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(240,193,75,0.6)'
    ctx.fillText('COIN', cx - 166, 44)

    ctx.textAlign = 'right'
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(`${run.shipsSunk} sunk`, cx + 166, 24)
    ctx.fillStyle = 'rgba(240,193,75,0.8)'
    ctx.fillText(`${Math.floor(run.totalCoins)} taken`, cx + 166, 44)

    // A thin progress line along the bottom edge of the panel: progress through
    // the voyage, or through the current wave once endless.
    ctx.fillStyle = run.endless ? 'rgba(255,154,213,0.6)' : 'rgba(159,232,255,0.5)'
    ctx.fillRect(cx - 180, 73, 360 * run.waveProgress, 2)
    ctx.restore()
  }

  private endCard(world: World, won: boolean) {
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
    ctx.fillText(won ? 'YOU HELD THE SEA' : 'YOUR SHIP IS LOST', w / 2, h / 2 - 64)

    const stamp = (seconds: number) =>
      `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`

    ctx.font = '15px ui-monospace, monospace'
    ctx.fillStyle = '#cfe6f5'
    ctx.fillText(
      `survived ${stamp(run.elapsed)}   ·   ${run.shipsSunk} sunk   ·   ${Math.floor(run.totalCoins)} coin taken`,
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

    ctx.font = '13px ui-monospace, monospace'
    if (won) {
      ctx.fillStyle = '#ff9ad5'
      ctx.fillText('press C to sail on — the sea will not forgive it', w / 2, h / 2 + 52)
      ctx.fillStyle = 'rgba(207,230,245,0.5)'
      ctx.fillText('or R to make port and start afresh', w / 2, h / 2 + 76)
    } else {
      ctx.fillStyle = 'rgba(207,230,245,0.55)'
      ctx.fillText('press R to sail again', w / 2, h / 2 + 52)
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
