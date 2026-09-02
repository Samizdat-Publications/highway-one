# Highway One — first-person driving sim (three.js r185, no bundler, procedural)

Read `NEXT-SESSION.md` first: it is the checkpoint (what works, what is next, known issues).
Design/plan: `docs/PLAN.md`. This folder is **not** Last Stop; that project lives in `../Subway Zombies` and its repo is `subway-zombies`. Never point this folder at that remote or reuse that Worker name.

## Run / deploy
- Live: https://samizdat-publications.github.io/highway-one/ — GitHub Pages deploys on every push to `main` (`.github/workflows/deploy.yml`, no build step). Repo: github.com/Samizdat-Publications/highway-one (public).
- `preview_start` config **`highway-one`** (`.claude/launch.json` → `python serve.py 8432`), or `python serve.py` then open http://localhost:8432.
- ES modules + import map; **must** be served (file:// will not load modules).
- Everything is procedural: canvas textures (`src/textures.js`), code-built meshes, Web Audio SFX. No asset files, no npm.

## Layout
```
index.html / style.css        HUD DOM + menus + boot-error overlay
serve.py                      no-store dev server (port 8432)
vendor/three/                 r185 module + postprocessing/shaders/utils addons
src/main.js                   boot, wiring, 120 Hz fixed-step loop, game flow, window.__game test hooks
src/config.js                 every tunable (car, world, lights, quality presets)
src/rng.js, units.js          seeded xorshift; unit conversions + math helpers
src/textures.js, materials.js canvas texture factory; cached MeshStandardMaterials (+wet variants)
src/input.js, gamepad.js      keyboard/mouse/gamepad merged into one normalized input; wheel calibration
src/post.js                   EffectComposer: Render → Bloom → Output → SMAA → vignette/grain
src/sky.js, lighting.js       sky dome + sun/moon; light pool (≈18 real lights max); follow shadow
src/weather.js                fog / rain / wet road cross-fades
src/collide.js                2-D OBB spatial hash + SAT resolve
src/vehicle/                  engine.js, drivetrain.js, tyres.js, car.js (body sim), carmesh.js (exterior)
src/cockpit/                  interior, wheel, gauges, controls, wipers, mirrors, lights, nav, radio, camera
src/world/                    roads (graph + surfaceAt), layout (the map), roadmesh, terrain, ocean, town, props, signals
src/traffic/                  agents (instanced pool), driver (IDM + signals), bot (autopilot for soak tests)
src/audio/                    context, engine, sfx, ambient, radio
src/modes/                    base (event bus), freeroam, delivery, rules, timetrial, route
src/hud.js, menu.js, save.js  DOM HUD, options, localStorage
```

## World coordinates
three.js default: **x east, −z north, y up**. Car local: +x right, −z forward. Ocean is west (x < −110). Town grid centred at the origin, Ocean Ave at x = −40 running north–south, pier at z ≈ +120 reaching west. PCH runs north from z ≈ −260 along cliffs (tunnel ≈ z −900, bridge ≈ z −1300, mountain-pass T at z −700). See `src/world/layout.js` and `docs/PLAN.md`.

## Testing in the in-app browser (important)
- The preview pane refuses pointer lock and, when hidden, **throttles requestAnimationFrame to zero**. Drive frames manually:
  `window.__game.start(); window.__game.tick(120)` (tick(n, dt) runs n fixed sim steps + one render).
- Inputs: `__game.input.override = { throttle: 1, steer: -0.3, brake: 0 }` (fields mirror the normalized input object; `null` clears).
- Teleport: `__game.teleport(x, z, headingRad)`; time: `__game.setTime(hour)`; weather: `__game.setWeather('clear'|'fog'|'rain')`.
- Vehicle state: `__game.car.S` (speedMph, engine.rpm, drive.gear, wheels[], body pitch/roll…).
- `__game.game.timeScale` slows/freezes for screenshots. F3 toggles the perf overlay in a real browser.
- **Bot soak:** `main.js` calls `window.__botStep(i)` before each sim step if defined (`src/traffic/bot.js` installs an autopilot).
- Patch source with a Python script written to the scratchpad and run with `python` — bash heredocs containing JS quotes have bitten us.
- Verify with screenshots before claiming anything looks right.

## Conventions
- Dependency-free and procedural. Seeded rng for anything static so screenshots are comparable.
- Real-light budget ≈ 18 (forward renderer, MeshStandardMaterial, physical units). Prefer emissive + bloom; recycle a pool of PointLights near the player.
- Canvas textures used as `map`/`emissiveMap` get `colorSpace = SRGBColorSpace`; data maps stay linear. Small dynamic canvases, no mipmaps, ≤ 10 Hz uploads.
- Static world geometry is merged per material; anything animated needs `userData.noMerge = true`. Instanced props are chunked and get `computeBoundingSphere()` after filling.
- Movement queries go through `roads.surfaceAt(x, z)` (road height/lane/limit) falling back to `terrain.heightAt`.
- Shadows: `shadowMap.autoUpdate = false`, `needsUpdate = true` once per frame before the main pass (mirrors render first).
- Stewart works in ~3 h blocks: end every block at a committed, pushed (= deployed) checkpoint with `NEXT-SESSION.md` updated.
