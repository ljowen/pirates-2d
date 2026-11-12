# Goal: publishable

Get the game to a state where a stranger can open the link, understand it inside a minute,
enjoy a first voyage, and have a reason to come back tomorrow. It should feel made by someone
who loves it, not assembled.

This is the working list for the `claude/polish-publishable` branch. Items are ticked as they
land; anything left open at the end is the honest remainder.

## What "publishable" means here

| Test | Passes when |
|---|---|
| **First minute** | A new player sees what the game is, how to sail, and is at sea within two key presses. Nothing on screen is a developer tool. |
| **First voyage** | They can survive long enough to learn something, and the game tells them the three things that are not obvious: sails, broadsides, shallows. |
| **Second visit** | There is something named and close to earn: a ship, a refit, a new chart, a best to beat. |
| **Charm** | Small things that did not need to exist: a ship with a name, a flag in the wind, gulls, a line of salt in the end card. |
| **It runs** | On a modest laptop, with touch as well as keys, and the page has a title, an icon and a description. |

## Deficits found at the start

- Developer tooling is the first thing a player sees: a key legend naming debug keys, a Tune
  button, and live keys that spawn enemies and squalls.
- No welcome. A new career opens on seven stat cards, six of them unaffordable.
- Nothing teaches sailing. Guns firing by themselves when a ship is abeam is the core of the
  game and is never said.
- Maps exist but can only be chosen from the developer panel.
- No personal bests, so no "one more go" beyond the purse.
- The page is titled "Sailing Prototype", with no icon or description.
- Keyboard and mouse only.
- The whole map is drawn every frame with no culling.
- A first voyage in the stock Sloop is very short: the scripted pilot wins 6% and lasts two minutes.

## The list

- [x] Developer tools behind `?dev`
- [x] Page title, icon, description
- [x] Welcome sheet for a new career
- [x] Sailing orders: hints on the first voyages, each shown until learned
- [x] Charts page in port: pick a map, see its chart, earn the next one
- [x] Personal bests per map, called out on the end card
- [x] A kinder first few voyages
- [x] Charm: ship names, a flag at the masthead, gulls, screen shake, end-card epitaphs
- [x] Touch controls
- [x] Cull the map drawing
- [x] Player-facing README

## Still open

Found while working through the list, and not fixed:

- **Not played by a person.** Everything here was checked in a headless browser and against
  the scripted pilot. The hints' wording and timing, the feel of the shake, the difficulty of
  the eased voyages and every sound need a human.
- **Phones.** Touch buttons exist, but the instrument panels are sized for a laptop and will
  crowd a phone held sideways.
- **Lumpy coasts.** Big islands are visibly made of overlapping rounds.
- **Frame rate is unmeasured.** The map is culled now, but nothing has been profiled on a
  slow machine.
- **The pilot has not learned the new maps.** Bench figures on fixed maps understate what a
  person can do.

## Not attempted

Recorded so nobody assumes they were considered done: music, a recorded cheer for a capture,
a phone-sized HUD layout, localisation, gamepad support, cloud saves.
