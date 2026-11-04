# Sound

Entirely procedural — synthesised at runtime from noise buffers and oscillators. There
are no audio files, so every sound is a tunable number rather than a fixed asset, and the
whole project stays self-contained.

`M` mutes. Volume is a slider in the tuner.

## Structure

| File | Responsibility |
|---|---|
| `audio/audio.ts` | The synthesiser — voices, beds, spatialisation |
| `audio/director.ts` | Watches simulation state and decides what to play |

The split exists for the same reason as everywhere else: the simulation does not know
audio exists. The director detects gunfire by comparing `ship.shotCount` against the value
it last saw, tracks already-played splashes in a `WeakSet`, and drains sinkings through
`world.drainSunk()`.

## Browser autoplay

An `AudioContext` cannot start without a user gesture, so the context is created lazily
and `resume()` is called on every `keydown` and `pointerdown`. All calls after the first
are harmless no-ops. The HUD shows "sound off — M" whenever the context is not running or
the game is muted.

## One-shots

| Sound | Construction |
|---|---|
| **Cannon** | Up to 6 ripple cracks, each a noise burst sweeping 2200→140 Hz plus a 110→38 Hz sine sub, spaced by the same `gunRippleGap` the guns themselves use |
| **Hit** | Bandpass noise crack, 900–1500 Hz sweeping down; hits on your own hull add a low triangle knock |
| **Splash** | Bandpass noise sweeping up then down, highpassed |
| **Sinking** | A broad splash, the sea closing over, and a few bubbles — all noise, no oscillators |
| **Sail change** | Filtered noise, sweeping up when making sail and down when shortening |

Broadsides fire as a **ripple rather than one blast**, timed off `gunRippleGap` so what
you hear lines up with the smoke you see and the shot that leaves the side. The spacing is
jittered, because a perfectly even ripple sounds mechanical.

**Sinking is water, not a dying machine.** It was originally built around a sawtooth
sweeping down to 28 Hz, which read as something mechanical expiring. Water has no pitch to
fall, so the whole sound is noise now — a broad splash, a low swell with no pitch movement
at all as the sea closes over her, and a few last bubbles breaking the surface. Distance attenuation and stereo placement come from the
camera position. Voices are capped per frame so a broadside cannot become a wall of mud.

## The simulation-driven beds

Three continuous noise beds, each modulated every frame by a value the player is already
steering:

| Bed | Driven by |
|---|---|
| **Wind** | `wind.strength` — gain and filter frequency both rise |
| **Sea rush** | hull speed |
| **Luffing canvas** | `(1 − polarMult) × canvas`, with a 5.5 Hz tremolo for the flap |

The luffing bed is the useful one. Measured:

| State | Sea | Luffing canvas |
|---|---|---|
| Beam reach, 215 units/s | 0.092 | **0.0007** |
| In irons, stalled, 16 units/s | 0.019 | **0.0795** |
| In irons, sails furled | 0.015 | 0.0013 |

Shivering canvas is **113× louder** when stalled than when drawing, and silent once you
furl. **You can hear yourself sailing into the no-go zone before any instrument shows
it** — which is exactly the kind of feedback the sailing model deserves.

Gun smoke drifts downwind too, so the wind is reinforced visually and audibly at once.
