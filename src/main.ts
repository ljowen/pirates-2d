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
import { DraftUI } from './ui/draft'
import { ShipSelect } from './ui/shipSelect'
import { Hud } from './render/hud'
import { DebugOverlay } from './render/debug'
import { Tuner } from './ui/tuner'
import { benchmark, simulateRun, autoPilot } from './dev/testPilot'
import { Audio } from './audio/audio'
import { AudioDirector } from './audio/director'
import { T } from './sim/tuning'

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
  // Land sits on the water; wake above it so a ship's trail is never buried,
  // then plunder, hulls, and finally shot and smoke over everything.
  worldLayer.addChild(terrainView.view, wake.view, plunderView.view, shipLayer, combat.view)
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
  const debug = new DebugOverlay(octx)
  const tuner = new Tuner(world)
  const draft = new DraftUI()
  const shipSelect = new ShipSelect()

  /** Put the captain back at the quayside to pick a hull for the next voyage. */
  const chooseShip = () => {
    shipSelect.show((cls) => {
      world.reset(Math.floor(Math.random() * 0xffffff), cls)
      dropAllShipViews()
      wake.clear()
      combat.clear()
      plunderView.clear()
      terrainView.clear()
      audioDirector.reset()
      camera.snapTo(world.player.pos)
    })
  }

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
      if (input.consumePress('mute')) audio.muted = !audio.muted
      // Decline the safe harbour: the clock stops being a finish line.
      if (input.consumePress('continue')) world.run.continueEndless()
      // R returns to the quayside rather than restarting the same hull, so
      // trying a different ship never means reloading the page.
      if (input.consumePress('reset') && !shipSelect.open) {
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
          draft.show(world.run.draft, world.run.level, world.run.taken, (upgrade) => {
            world.run.choose(upgrade, world.player)
          })
        }
      } else if (draft.open) {
        draft.hide()
      }

      const frozen = paused || draft.open || shipSelect.open ||
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
      hud.draw(world, camera, paused, turbo, audio.muted || !audio.ready)
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
    world, camera, loop, input, audio,
    // Exposed so the "ship views must never outlive their hull" invariant can
    // be asserted rather than eyeballed — a ghost that re-sinks forever is
    // exactly the kind of bug that hides in a busy frame.
    viewCount: () => shipViews.size,
    benchmark: (seeds?: number) => { loop.stop(); return benchmark(world, seeds) },
    simulateRun: (seed: number) => { loop.stop(); return simulateRun(world, seed) },
    autoPilot,
  }
}

main()
