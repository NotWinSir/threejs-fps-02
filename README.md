# Emberline — a three.js tactical FPS

A round-based 4v4 tactical shooter in a dusk foundry yard, built on three.js
0.187.0 (vendored, byte-exact) with no build step and no dependencies. Your
Ember squad attacks: plant the charge at the Furnace (site A) or the Depot
(site B), or wipe the Ash defenders. First to 7 rounds takes the match.

- **Complete round loop** — buy window, live round, planted phase with a
  35-second fuse, defuse, round-end economy and match end. Rounds restart
  on their own; the score, timer, alive counts and kill feed stay live.
- **Gunplay with texture** — headshots multiply damage, spread blooms while
  moving and while spraying, crouch steadies and shrinks you, armour cuts
  body damage, and every weapon falls off with range. Six guns plus a frag
  grenade: P9 Sidearm, VK-9 Carbine, Mule 12 scatter gun, AR-7 Longhand,
  Surveyor DMR and the vest.
- **An economy that matters** — $800 start, $3,250 / $1,900 win/loss,
  $300 a kill, $800 team plant bonus, $300 to the planter. Bots shop with
  the same rules the player does: full-buy rounds field rifles, poor
  rounds field carbines and armour.
- **Bots that play the objective** — a 31-node waypoint graph (every edge
  machine-checked to clear the map's solids), BFS routing, vision cones
  with real sight lines, hearing driven by gunshot noise events, burst
  discipline, proactive reloads, grenade answers to last-known positions,
  and plant/defuse channels that only run when no enemy is close enough
  to punish them.
- **An original map** — Ember Yard: a central steel stack, two shuttered
  mid lanes, north and south container lanes, a gantry deck in the east
  and two distinct sites with their own hold points and flank watches.

## Play

```sh
node serve.ts --port 8901
# open http://localhost:8901/
```

Click to play. WASD moves, the mouse looks, click fires, R reloads,
Ctrl crouches, G throws a frag, E (held) plants the charge, 1–6 buy in
the buy window, 1/2 swap guns in the round. Everything is simulated in a
fixed 60 Hz step; rendering only reads the result.

## Layout

- `main.ts` — the entry program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json`.
- `serve.ts` — a small static server for local play.
- `game/index.html` — the page, HUD and the single importmap.
- `game/src/main.js` — boot, the fixed-step loop, camera, view model and
  the `?shot=` staging used for the screenshots.
- `game/src/map.js` — Ember Yard: the solids table that drives meshes,
  collision and sight lines, the sites, spawns and the waypoint graph.
- `game/src/state.js` — the one state object: phases, fighters, bomb,
  noises, feed.
- `game/src/round.js` — match/round flow, the buy rules, channels,
  end-of-round settlement.
- `game/src/bots.js` — bot bodies, senses, decisions and movement.
- `game/src/combat.js` — hitscan against the visible meshes, tracers,
  grenades and explosions.
- `game/src/weapons.js` — the weapon table, reloads, spread and damage
  curves, the view models.
- `game/src/player.js`, `input.js`, `hud.js`, `audio.js`, `palette.js`,
  `rng.js` — the human's body and controls, the HUD, synthesized sound,
  the dusk palette and the seeded RNG (the simulation never calls
  `Math.random`).

Screenshots are real frames staged through the game's own `?shot=`
routes (menu, buy window, a live duel on site A, a round-end banner) —
what they show is what the code does.
