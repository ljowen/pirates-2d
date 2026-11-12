import { Application, Container } from 'pixi.js'
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
import { PALETTES, paletteFromLocation } from './render/palette'
import { HULL_STYLES, hullStyleFromLocation } from './render/hullStyle'
import { DraftUI } from './ui/draft'
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
import { Ledger, loadCareer, saveCareer, freshCareer, voyageOf } from './meta/career'

async function main() {
  const host = document.getElementById('app')!

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

  // Chosen before anything is constructed: the water's tiling textures and
  // every cached geometry are built from it, so it cannot change mid-run.
  const style = paletteFromLocation(window.location.search)
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
  // Land sits on the water; the shadow of a squall falls across both. Wake
  // above that so a ship's trail is never buried, then plunder, hulls, shot
  // and smoke — and the rain last of all, thin enough to see through.
  worldLayer.addChild(
    terrainView.view, squallView.shadow, wake.view, plunderView.view,
    shipLayer, combat.view, squallView.rain,
  )
  app.stage.addChild(water.view, worldLayer)

  // One view per ship, created on sight and dropped once she has gone under.
  const shipViews = new Map<number, ShipView>()
  const syncShipViews = (dt: number, alpha: number) => {
    for (const ship of world.ships) {
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
    const present = new Set(world.ships.map((s) => s.id))
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
  for (const event of ['keydown', 'pointerdown'] as const) {
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
  const port = new PortUI(ledger)
  /** False until a hull has been chosen, so the idle sea behind the first quayside is never paid. */
  let atSea = false

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
    world.reset(Math.floor(Math.random() * 0xffffff), cls, voyageOf(ledger.career))
    dropAllShipViews()
    wake.clear()
    combat.clear()
    plunderView.clear()
    terrainView.clear()
    squallView.clear()
    pickupText.clear()
    audioDirector.reset()
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
  })

  let showDebug = false
  let paused = false
  let turbo = false
  let fps = 60

  const resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio, 2)
    overlay.width = w * dpr
    overlay.height = h * dpr
    overlay.style.width = `${w}px`
    overlay.style.height = `${h}px`
    octx.setTransform(dpr, 0, 0, dpr, 0, 0)
    camera.resize(w, h)
    water.resize(w, h)
  }
  window.addEventListener('resize', resize)
  resize()
  camera.snapTo(world.player.pos)

  const loop = new GameLoop(
    (dt) => {
      world.steerInput = input.steer
      world.step(dt)
    },
    (alpha, frameDt) => {
      if (input.consumePress('pause')) paused = !paused
      if (input.consumePress('turbo')) turbo = !turbo
      if (input.consumePress('debug')) showDebug = !showDebug
      if (input.consumePress('tuner')) tuner.toggle()
      if (input.consumePress('sailUp')) world.player.trimSails(1)
      if (input.consumePress('sailDown')) world.player.trimSails(-1)
      if (input.consumePress('spawnEnemy')) world.spawnWave(1)
      // Weather on demand. A squall arrives every forty-odd seconds on its
      // own, which is far too slow to judge how one looks or handles.
      // Cycle the look. A reload rather than a live swap: the water's
      // textures and every cached outline are built from the palette, and
      // rebuilding all of it is a lot of machinery for a comparison made once.
      if (input.consumePress('styleNext')) {
        const i = PALETTES.findIndex((p) => p.id === style.id)
        const next = PALETTES[(i + 1) % PALETTES.length]
        window.location.search = `?style=${next.id}&hull=${hullStyle.id}`
      }
      if (input.consumePress('hullNext')) {
        const i = HULL_STYLES.findIndex((h) => h.id === hullStyle.id)
        const next = HULL_STYLES[(i + 1) % HULL_STYLES.length]
        window.location.search = `?style=${style.id}&hull=${next.id}`
      }
      if (input.consumePress('spawnSquall')) {
        world.wind.weather.spawn(world.wind.from, world.player.pos)
      }
      if (input.consumePress('mute')) audio.muted = !audio.muted
      // Decline the safe harbour: the clock stops being a finish line.
      if (input.consumePress('continue')) world.run.continueEndless()
      // R returns to the quayside rather than restarting the same hull, so
      // trying a different ship never means reloading the page.
      if (input.consumePress('reset') && !port.open) {
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

      camera.follow(world.player, frameDt)
      // Presentation uses the wind where the camera and the player actually
      // are, so local weather is visible rather than averaged away.
      const cameraWind = world.windAt(camera.pos)
      const playerWind = world.windAt(world.player.pos)
      water.update(camera, cameraWind, frameDt)
      water.updateGusts(camera, (p) => world.windAt(p), frameDt)
      terrainView.update(world.terrain, camera)
      squallView.update(world.wind.weather, camera, frameDt)
      wake.update(world.ships, dt)
      syncShipViews(dt, alpha)
      combat.update(world.ships, world.projectiles, world.splashes, cameraWind, dt)
      plunderView.update(world.plunder, dt)

      audio.masterVolume = T.masterVolume
      audioDirector.update(world, camera.pos.x, camera.pos.y, camera.viewW / 2 / camera.zoom)

      worldLayer.scale.set(camera.zoom)
      worldLayer.position.set(
        -camera.pos.x * camera.zoom + camera.viewW / 2,
        -camera.pos.y * camera.zoom + camera.viewH / 2,
      )
      app.renderer.render(app.stage)

      fps += (1 / Math.max(frameDt, 1e-4) - fps) * 0.1
      octx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight)
      // Pickup numbers sit under the instruments: they are the loudest thing
      // on screen for a second and must never cover a reading.
      pickupText.update(world, dt)
      pickupText.draw(octx, camera)
      hud.draw(world, camera, paused, turbo, audio.muted || !audio.ready, ledger)
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
    T, style, hullStyle,
    // Exposed so the "ship views must never outlive their hull" invariant can
    // be asserted rather than eyeballed — a ghost that re-sinks forever is
    // exactly the kind of bug that hides in a busy frame.
    viewCount: () => shipViews.size,
    benchmark: (seeds?: number) => { loop.stop(); return benchmark(world, seeds) },
    simulateRun: (seed: number) => { loop.stop(); return simulateRun(world, seed) },
    port,
    autoPilot,
  }
}

main()
