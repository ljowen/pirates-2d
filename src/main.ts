import { Application, Container } from 'pixi.js'
// Bundled rather than fetched from a font CDN, so the game still runs offline
// and from GitHub Pages with nothing outside the repo. Latin subsets only.
import '@fontsource/pirata-one/latin-400.css'
import { loadUiFonts } from './ui/theme'
import { GameLoop } from './core/loop'
import { Input } from './core/input'
import { World } from './sim/world'
import { Camera } from './render/camera'
import { Water } from './render/water'
import { Wake } from './render/wake'
import { ShipView } from './render/shipView'
import { CombatView } from './render/combatView'
import { PlunderView } from './render/plunderView'
import { TerrainView } from './render/terrainView'
import { SquallView } from './render/squallView'
import { GullView } from './render/gullView'
import { SettlementView } from './render/settlementView'
import { P, PALETTES, paletteFromLocation, setPalette } from './render/palette'
import { HULL_STYLES, hullStyleFromLocation } from './render/hullStyle'
import { DraftUI } from './ui/draft'
import { TouchControls } from './ui/touch'
import { layoutFor } from './ui/layout'
import { LEVELS_BY_ID } from './sim/levels'
import { PortUI } from './ui/port'
import type { ShipClass } from './sim/shipClasses'
import { Hud } from './render/hud'
import { PickupText } from './render/pickupText'
import { DebugOverlay } from './render/debug'
import { Tuner } from './ui/tuner'
import { benchmark, simulateRun, autoPilot } from './dev/testPilot'
import { Audio } from './audio/audio'
import { AudioDirector } from './audio/director'
import { T } from './sim/tuning'
import { Ledger, chartOf, loadCareer, saveCareer, freshCareer, voyageOf } from './meta/career'
import { Accounts, SEA_ENABLED } from './net/api'
import { SeaClient } from './net/seaClient'
import { SeaMirror } from './net/seaMirror'
import { ChatPanel } from './ui/chat'
import { renderSeaPage } from './ui/seaPort'
import { SAIL_FIGHTING, SAIL_STATES } from './sim/ship'
import type { Ship } from './sim/ship'

/**
 * Developer tools: the tuning panel, the debug overlay, the keys that spawn
 * things and switch looks. On with `?dev` in the address, off for players.
 */
const DEV = /[?&]dev\b/.test(window.location.search)

async function main() {
  const host = document.getElementById('app')!
  // Before the first frame, so the menus and the HUD open in their own type.
  await loadUiFonts()

  // Pixi renders the world; a plain 2D canvas on top renders the instruments.
  const app = new Application()
  await app.init({
    resizeTo: window,
    antialias: true,
    background: 0x2a6a8e,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  })
  host.appendChild(app.canvas)
  app.ticker.stop()

  const overlay = document.createElement('canvas')
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5'
  host.appendChild(overlay)
  const octx = overlay.getContext('2d')!

  // A palette named in the address overrides every location's own, which is
  // how the looks are compared. Otherwise each location brings its palette.
  const forcedStyle = paletteFromLocation(window.location.search)
  const hullStyle = hullStyleFromLocation(window.location.search)

  const world = new World()
  const camera = new Camera()
  const input = new Input(app.canvas)

  const water = new Water(window.innerWidth, window.innerHeight)
  const worldLayer = new Container()
  const wake = new Wake()
  const shipLayer = new Container()
  const combat = new CombatView()
  const plunderView = new PlunderView()
  const terrainView = new TerrainView()
  const squallView = new SquallView()
  const gulls = new GullView()
  const towns = new SettlementView()
  // Land sits on the water; the shadow of a squall falls across both. Wake
  // above that so a ship's trail is never buried, then plunder, hulls, shot
  // and smoke — and the rain last of all, thin enough to see through.
  worldLayer.addChild(
    terrainView.view, towns.view, squallView.shadow, wake.view, plunderView.view,
    shipLayer, combat.view, squallView.rain, gulls.view,
  )
  app.stage.addChild(water.view, worldLayer)

  // One view per ship, created on sight and dropped once she has gone under.
  const shipViews = new Map<number, ShipView>()
  const syncShipViews = (ships: Ship[], dt: number, alpha: number) => {
    for (const ship of ships) {
      let view = shipViews.get(ship.id)
      if (!view) {
        // Never raise a view for a hull that has already gone down: doing so
        // restarts her sinking animation from the top.
        if (ship.sunk) continue
        view = new ShipView(ship.cls)
        shipViews.set(ship.id, view)
        shipLayer.addChild(view.view)
      }
      view.update(ship, alpha, dt)
    }
    // Drop a view when its hull has finished going under *or* has left the
    // world by any other route. Keying only on the sinking animation leaked a
    // view for every trader that escaped, since those are removed alive.
    const present = new Set(ships.map((s) => s.id))
    for (const [id, view] of shipViews) {
      if (!view.finishedSinking && present.has(id)) continue
      shipLayer.removeChild(view.view)
      view.view.destroy({ children: true })
      shipViews.delete(id)
    }
  }
  const dropAllShipViews = () => {
    for (const [, view] of shipViews) {
      shipLayer.removeChild(view.view)
      view.view.destroy({ children: true })
    }
    shipViews.clear()
  }

  const audio = new Audio()
  const audioDirector = new AudioDirector(audio)
  // Browsers refuse to start an AudioContext without a gesture, so every input
  // doubles as permission to make noise. Both listeners are harmless repeats
  // after the first.
  for (const event of ['keydown', 'pointerdown', 'touchend'] as const) {
    window.addEventListener(event, () => audio.resume())
  }

  const hud = new Hud(octx)
  const pickupText = new PickupText()
  const debug = new DebugOverlay(octx)
  const draft = new DraftUI()
  // The career is read once and written on every change to it. `?career=new`
  // starts a clean one, which is the only way to see the opening again.
  if (/[?&]career=new\b/.test(window.location.search)) saveCareer(freshCareer())
  const ledger = new Ledger(loadCareer(), saveCareer)
  // `?level=` picks a chart for this visit without touching the career.
  const askedLevel = LEVELS_BY_ID.get(/[?&]level=([\w-]+)/.exec(window.location.search)?.[1] ?? '')
  const levelToSail = () => askedLevel ?? chartOf(ledger.career)
  world.level = levelToSail()
  if (!forcedStyle && P().id !== world.level.theme) {
    setPalette(world.level.theme)
    water.retheme()
  }
  const port = new PortUI(ledger)
  port.onSound = draft.onSound = (id) => audio.play(id)
  /** False until a hull has been chosen, so the idle sea behind the first quayside is never paid. */
  let atSea = false

  /** Forget everything drawn on the sea that was, before drawing another. */
  const clearViews = () => {
    dropAllShipViews()
    wake.clear()
    combat.clear()
    plunderView.clear()
    terrainView.clear()
    squallView.clear()
    gulls.clear()
    towns.clear()
    pickupText.clear()
    audioDirector.reset()
  }

  /**
   * Put to sea in this hull. Reached from port, and straight from the tuning
   * panel, which skips port so a hull or a refit can be tried in one click.
   */
  const startVoyage = (cls: ShipClass) => {
    // Whatever she hauled is banked however the voyage ended — sunk, home, or
    // abandoned at the quay. Only the bonus is reserved for finishing.
    if (atSea) ledger.settle(world.run)
    port.hide()
    draft.hide()
    ledger.open(cls)
    atSea = true
    // The career is boiled down to a voyage here and not looked at again
    // until the run is over.
    world.level = levelToSail()
    // The location's colours, before anything that keeps colour is rebuilt.
    if (!forcedStyle && P().id !== world.level.theme) {
      setPalette(world.level.theme)
      water.retheme()
      tuner.themeChanged()
    }
    world.reset(Math.floor(Math.random() * 0xffffff), cls, voyageOf(ledger.career))
    clearViews()
    camera.snapTo(world.player.pos)
  }

  /** Put the captain back at the quayside to pick a hull for the next voyage. */
  const chooseShip = () => {
    if (atSea) ledger.settle(world.run)
    atSea = false
    port.show(startVoyage)
  }

  const tuner = new Tuner(world, {
    ledger,
    sail: startVoyage,
    careerChanged: () => port.refresh(),
    audio,
    setLevel: (id) => {
      // The developer's choice is written straight into the career, earned or not.
      if (!LEVELS_BY_ID.has(id)) return
      ledger.career.chart = id
      ledger.career.lifetime = Math.max(ledger.career.lifetime, LEVELS_BY_ID.get(id)!.unlock)
      ledger.commit()
      startVoyage(world.player.cls)
    },
  })

  tuner.launcherVisible = DEV

  let showDebug = false
  let lastFired = 0
  let lastSinceHit = 0
  let paused = false
  let turbo = false
  let fps = 60

  // The open sea's chat. Made here because the layout below places it.
  const chat = new ChatPanel()

  // Made before the first layout, which depends on whether fingers are in use,
  // and laid out again the moment the first one lands.
  const touch = new TouchControls(input, app.canvas, () => resize())
  const resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio, 2)
    // The instruments are laid out in their own units and the whole layer is
    // scaled to the screen: its box is the size it thinks it is, shrunk by a
    // transform, and its pixels are the screen's so nothing is blurred.
    const layout = layoutFor(w, h, touch.active)
    hud.layout = layout
    camera.overlayScale = layout.scale
    camera.focusY = layout.focusY
    touch.narrow = layout.compact && layout.top > 20
    chat.lifted = touch.active
    overlay.width = w * dpr
    overlay.height = h * dpr
    overlay.style.width = `${w / layout.scale}px`
    overlay.style.height = `${h / layout.scale}px`
    overlay.style.transformOrigin = '0 0'
    overlay.style.transform = `scale(${layout.scale})`
    octx.setTransform(dpr * layout.scale, 0, 0, dpr * layout.scale, 0, 0)
    camera.resize(w, h)
    water.resize(w, h)
  }
  window.addEventListener('resize', resize)
  resize()
  camera.snapTo(world.player.pos)


  // --- The open sea -----------------------------------------------------------
  //
  // A second mode beside the voyage. The server runs the world; this browser
  // sends its helm and sail orders and draws a mirror of what comes back.
  // The voyage's `World` sits untouched underneath, so making port drops
  // straight back into the career.
  let mode: 'solo' | 'sea' = 'solo'
  let sea: SeaMirror | null = null
  /** The sail order this captain has given, sent with every input. */
  let seaSail = SAIL_FIGHTING
  let lastRaised = -1
  let lastSteerSent = NaN
  let lastSailSent = -1
  let lastInputAt = 0
  const accounts = new Accounts()
  const seaClient = new SeaClient()

  const startSea = (cls: ShipClass) => {
    if (atSea) ledger.settle(world.run)
    atSea = false
    port.hide()
    draft.hide()
    mode = 'sea'
    chat.enterOpens = true
    seaSail = SAIL_FIGHTING
    lastRaised = -1
    const theme = (sea?.level ?? LEVELS_BY_ID.get('windward-cays'))?.theme
    if (!forcedStyle && theme && P().id !== theme) {
      setPalette(theme)
      water.retheme()
      tuner.themeChanged()
    }
    clearViews()
    seaClient.join(cls.id)
  }

  const leaveSea = () => {
    if (mode !== 'sea') return
    seaClient.leave()
    mode = 'solo'
    chat.enterOpens = false
    clearViews()
    camera.snapTo(world.player.pos)
    chooseShip()
  }

  if (SEA_ENABLED) {
    port.seaPage = (body) => renderSeaPage(body, {
      accounts,
      link: () => seaClient.link,
      sail: startSea,
      redraw: () => port.refresh(),
    })
    accounts.onChange = () => {
      if (accounts.account && accounts.token) {
        seaClient.connect(accounts.token)
        chat.show()
      } else {
        leaveSea()
        seaClient.disconnect()
        sea = null
        chat.hide()
      }
      port.refresh()
    }
    seaClient.onLink = () => port.refresh()
    // A line that will not stay up may mean the session has gone; check it.
    seaClient.onTrouble = () => { void accounts.restore() }
    seaClient.onMessage = (msg) => {
      switch (msg.t) {
        case 'hello':
          chat.reset(msg.chat)
          sea = new SeaMirror(msg)
          if (mode === 'sea') { clearViews(); lastRaised = -1 }
          break
        case 'chat':
          chat.add(msg.msg)
          break
        case 'error':
          chat.notice(msg.message)
          break
        default:
          sea?.receive(msg)
      }
    }
    chat.onSend = (body) => seaClient.send({ t: 'chat', body })
    // A hidden tab stops drawing, and with it the helm's heartbeat; the
    // server would hold her rudder over for as long as the tab is away.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && mode === 'sea') {
        seaClient.send({ t: 'input', steer: 0, sail: seaSail })
        lastSteerSent = 0
      }
    })
    void accounts.restore()
  }

  /** One frame of the open sea: read the helm, send it, draw what the server says. */
  const renderSea = (frameDt: number) => {
    // Keys that mean something only in a voyage are swallowed, not queued.
    for (const k of ['pause', 'turbo', 'debug', 'spawnEnemy', 'spawnSquall', 'continue', 'confirm', 'styleNext', 'hullNext']) {
      input.consumePress(k)
    }
    if (DEV && input.consumePress('tuner')) tuner.toggle()
    if (input.consumePress('mute')) audio.muted = !audio.muted
    const afloat = sea?.afloat ?? false
    if (input.consumePress('sailUp') && afloat) seaSail = Math.min(SAIL_STATES.length - 1, seaSail + 1)
    if (input.consumePress('sailDown') && afloat) seaSail = Math.max(0, seaSail - 1)
    if (input.consumePress('reset') && !port.open) { input.endFrame(); leaveSea(); return }
    input.endFrame()

    // Helm on every change, and a heartbeat so a lost packet never leaves the rudder stuck.
    const now = performance.now()
    const steer = input.steer
    if (steer !== lastSteerSent || seaSail !== lastSailSent || now - lastInputAt > 250) {
      seaClient.send({ t: 'input', steer, sail: seaSail })
      lastSteerSent = steer
      lastSailSent = seaSail
      lastInputAt = now
    }

    loop.timeScale = 1
    const dt = frameDt
    const ctx = octx
    ctx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight)
    if (!sea) {
      app.renderer.render(app.stage)
      ctx.save()
      ctx.font = '16px ' + 'ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff'
      ctx.fillText('Reaching the open sea…', overlay.clientWidth / 2, overlay.clientHeight / 2)
      ctx.restore()
      return
    }

    sea.update(dt)
    const p = sea.player
    // Her sails answer the order at once on this screen; the server catches up a moment later.
    if (sea.afloat) p.sailOrder = seaSail
    if (sea.raised !== lastRaised) {
      lastRaised = sea.raised
      seaSail = SAIL_FIGHTING
      camera.snapTo(p.pos)
      lastFired = p.shotCount[0] + p.shotCount[1]
      lastSinceHit = p.sinceHit
    }

    const fired = p.shotCount[0] + p.shotCount[1]
    if (fired > lastFired) camera.kick(0.32)
    lastFired = fired
    if (p.sinceHit < lastSinceHit) camera.kick(0.5)
    lastSinceHit = p.sinceHit
    camera.zoomBy(input.consumeZoom(frameDt))
    camera.follow(p, frameDt)

    const cameraWind = sea.windAt(camera.pos)
    water.update(camera, cameraWind, frameDt)
    water.updateGusts(camera, (q) => sea!.windAt(q), frameDt)
    terrainView.update(sea.terrain, camera)
    towns.update(sea.settlements, sea.terrain, cameraWind, dt)
    gulls.update(camera, dt)
    wake.update(sea.ships, dt)
    syncShipViews(sea.ships, dt, 1)
    combat.update(sea.ships, sea.projectiles, sea.splashes, cameraWind, dt)
    plunderView.update(sea.plunder, dt)

    audio.masterVolume = T.masterVolume
    audioDirector.updateSea(sea, camera.pos.x, camera.pos.y, camera.viewW / 2 / camera.zoom)

    worldLayer.scale.set(camera.zoom)
    worldLayer.position.set(
      -camera.pos.x * camera.zoom + camera.viewW / 2 + camera.shake.x,
      -camera.pos.y * camera.zoom + camera.viewH / 2 + camera.focusY + camera.shake.y,
    )
    app.renderer.render(app.stage)

    pickupText.update(sea, dt)
    pickupText.draw(ctx, camera)
    const menu = port.open
    hud.drawSea(sea, camera, seaClient.link === 'open', audio.muted || !audio.ready, menu)
    tuner.legendVisible = false
    touch.visible = !menu
    touch.paused = false
  }

  const loop = new GameLoop(
    (dt) => {
      // On the open sea the server steps the world; this browser only draws it.
      if (mode === 'sea') return
      world.steerInput = input.steer
      world.step(dt)
    },
    (alpha, frameDt) => {
      if (mode === 'sea') { renderSea(frameDt); return }
      if (input.consumePress('pause')) paused = !paused
      if (DEV && input.consumePress('turbo')) turbo = !turbo
      if (DEV && input.consumePress('debug')) showDebug = !showDebug
      if (DEV && input.consumePress('tuner')) tuner.toggle()
      if (input.consumePress('sailUp')) world.player.trimSails(1)
      if (input.consumePress('sailDown')) world.player.trimSails(-1)
      if (DEV && input.consumePress('spawnEnemy')) world.spawnWave(1)
      // Weather on demand. A squall arrives every forty-odd seconds on its
      // own, which is far too slow to judge how one looks or handles.
      // Cycle the look. A reload rather than a live swap: the water's
      // textures and every cached outline are built from the palette, and
      // rebuilding all of it is a lot of machinery for a comparison made once.
      if (DEV && input.consumePress('styleNext')) {
        const i = PALETTES.findIndex((p) => p.id === P().id)
        const next = PALETTES[(i + 1) % PALETTES.length]
        window.location.search = `?style=${next.id}&hull=${hullStyle.id}`
      }
      if (DEV && input.consumePress('hullNext')) {
        const i = HULL_STYLES.findIndex((h) => h.id === hullStyle.id)
        const next = HULL_STYLES[(i + 1) % HULL_STYLES.length]
        window.location.search = `?${forcedStyle ? `style=${forcedStyle.id}&` : ''}hull=${next.id}`
      }
      if (DEV && input.consumePress('spawnSquall')) {
        world.wind.weather.spawn(world.wind.from, world.player.pos)
      }
      if (input.consumePress('mute')) audio.muted = !audio.muted
      // Decline the safe harbour: the clock stops being a finish line.
      if (input.consumePress('continue')) world.run.continueEndless()
      // R returns to the quayside rather than restarting the same hull, so
      // trying a different ship never means reloading the page.
      // Only once the voyage is over, or from the pause panel: R in the
      // middle of a fight used to throw the whole run away on one stray key.
      const ended = world.run.state === 'won' || world.run.state === 'lost'
      const leave = input.consumePress('reset')
      const confirm = input.consumePress('confirm')
      if (!port.open && ((leave && (ended || paused || DEV)) || (confirm && ended))) {
        paused = false
        draft.hide()
        chooseShip()
      }
      input.endFrame()

      // A level-up stops the world: the draft is a decision, not a reflex test.
      // Visibility is driven purely by run state rather than by the card's own
      // callback, so any other path out of 'drafting' — a reset, or a level
      // resolved elsewhere — can never strand a stale hand on screen.
      if (world.run.state === 'drafting' && world.run.draft) {
        if (!draft.open) {
          draft.show(
            world.run.draft, world.run.level, world.run.taken, world.player,
            (upgrade) => { world.run.choose(upgrade, world.player) },
            world.run.rerolls,
            // Close and let the next frame reopen on the new hand, the same
            // way a chained level-up does.
            () => { if (world.run.reroll()) draft.hide() },
          )
        }
      } else if (draft.open) {
        draft.hide()
      }

      // Bank the voyage the moment it ends, not when the player next presses
      // a key: a tab closed on the end card must not cost the haul. Settling
      // is idempotent, so asking every frame pays only what is newly owed —
      // which is also what lets a voyage end twice, home and then sunk in
      // overtime, without either ending being special.
      const over = world.run.state === 'won' || world.run.state === 'lost'
      if (atSea && over) ledger.settle(world.run)

      const frozen = paused || draft.open || port.open ||
        world.run.state === 'won' || world.run.state === 'lost'
      const timeScale = frozen ? 0 : turbo ? 4 : 1
      loop.timeScale = timeScale

      // Presentation advances on *simulation* time, not wall-clock time.
      // Running them on real time meant that in turbo the world moved four
      // times faster than the animations: wrecks were culled from the sim
      // while their hulls were still visibly sinking, and wake, smoke and
      // plunder all drifted at the wrong rate.
      const dt = frameDt * timeScale

      // The view jolts when her own guns go and when she is struck.
      const p = world.player
      const fired = p.shotCount[0] + p.shotCount[1]
      if (fired > lastFired) camera.kick(0.32)
      lastFired = fired
      if (p.sinceHit < lastSinceHit) camera.kick(0.5)
      lastSinceHit = p.sinceHit
      camera.zoomBy(input.consumeZoom(frameDt))
      // Hulls are raised just beyond the view, so the further out the player
      // looks the further out they have to appear.
      world.viewReach = Math.max(1, 1 / camera.userZoom)
      camera.follow(world.player, frameDt)
      // Presentation uses the wind where the camera and the player actually
      // are, so local weather is visible rather than averaged away.
      const cameraWind = world.windAt(camera.pos)
      const playerWind = world.windAt(world.player.pos)
      water.update(camera, cameraWind, frameDt)
      water.updateGusts(camera, (p) => world.windAt(p), frameDt)
      terrainView.update(world.terrain, camera)
      squallView.update(world.wind.weather, camera, frameDt)
      gulls.update(camera, dt)
      wake.update(world.ships, dt)
      syncShipViews(world.ships, dt, alpha)
      combat.update(world.ships, world.projectiles, world.splashes, cameraWind, dt)
      plunderView.update(world.plunder, dt)

      audio.masterVolume = T.masterVolume
      audioDirector.update(world, camera.pos.x, camera.pos.y, camera.viewW / 2 / camera.zoom)

      worldLayer.scale.set(camera.zoom)
      worldLayer.position.set(
        -camera.pos.x * camera.zoom + camera.viewW / 2 + camera.shake.x,
        -camera.pos.y * camera.zoom + camera.viewH / 2 + camera.focusY + camera.shake.y,
      )
      app.renderer.render(app.stage)

      fps += (1 / Math.max(frameDt, 1e-4) - fps) * 0.1
      octx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight)
      // Pickup numbers sit under the instruments: they are the loudest thing
      // on screen for a second and must never cover a reading.
      pickupText.update(world, dt)
      pickupText.draw(octx, camera)
      const menu = port.open || draft.open
      hud.draw(world, camera, paused, turbo, audio.muted || !audio.ready, ledger, menu)
      tuner.legendVisible = !menu
      touch.visible = !menu
      touch.paused = paused && !menu
      if (showDebug) debug.draw(world.player, playerWind, camera, fps)
    },
    120,
  )

  loop.start()
  chooseShip()

  // Prototype hook: lets the sim be driven and inspected from the console,
  // which is how the model gets regression-checked without a human at the helm.
  // Prototype hook plus the measurement harness, so balance can be checked
  // from the console with a pilot that does not drift between runs.
  ;(window as unknown as Record<string, unknown>).__game = {
    world, camera, loop, input, audio, ledger,
    // The tuning object itself, so a look can be framed and compared from the
    // console — zooming in on a hull is not something the game needs a control
    // for, but it is exactly what judging one requires.
    T, style: P, hullStyle,
    // Exposed so the "ship views must never outlive their hull" invariant can
    // be asserted rather than eyeballed — a ghost that re-sinks forever is
    // exactly the kind of bug that hides in a busy frame.
    viewCount: () => shipViews.size,
    benchmark: (seeds?: number) => { loop.stop(); return benchmark(world, seeds) },
    simulateRun: (seed: number) => { loop.stop(); return simulateRun(world, seed) },
    port,
    autoPilot,
    // The open sea, for poking at from the console.
    sea: () => sea, seaClient, accounts,
  }
}

main()
