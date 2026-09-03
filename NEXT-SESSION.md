# NEXT-SESSION — checkpoint 2026-09-02 (first build day, all ten phases landed)

**Live:** https://samizdat-publications.github.io/highway-one/  ·  **Repo (public):** github.com/Samizdat-Publications/highway-one
Deploy = push to `main` (GitHub Pages workflow, no build step). Dev server: `preview_start highway-one` (autoPort; the fixed port 8432 was busy on this machine) or `python serve.py 8432`.

## Status: playable end to end, verified in the in-app browser with `__game.tick()`
- **Car** (`src/vehicle/`): 120 Hz model — torque curve + ECU anti-stall governor, two-state clutch with bite point, auto (P R N D with torque-converter creep + shift logic) and manual (H-pattern keys 1–6/0, or sequential), Pacejka-lite tyres with semi-implicit wheel spin, ABS, handbrake, weight transfer, slope, visual suspension. Headless check: `node --import ./tools/node-three-register.mjs <script>` (see the physics test in the scratchpad history: 0–60 ≈ 11 s, 60–0 ≈ 37 m, idle creep 3.8 mph, 3rd-gear clutch dump stalls, limiter 6400).
- **Cockpit** (`src/cockpit/`): merged procedural cabin, 900° wheel + stalks, canvas cluster (needles with lag, PRND/gear LCD, odometer, clock, 12 lamps), pedals/shifter/handbrake animation, wipers with a droplet mask the blades erase, three render-target mirrors (layer 2 = world only), headlights/brake/reverse/dome/signals, nav screen (heading-up map, route, next turn, ETA), radio display.
- **World** (`src/world/`): road graph (lanes, intersections, bezier connectors, signal phases, `surfaceAt`), Pelican Point grid + Ocean Ave + pier lot + PCH north (tunnels at z ≈ −955/−2145, canyon bridge z ≈ −1310, Canyon Rd switchbacks, overlook loop) + PCH south lot; terrain with cliffs/hills/canyon/headlands flattened along corridors; ocean shader with surf; buildings with lit windows; pier + Ferris wheel; palms, street lights (8-light recycled pool), signal heads driven by `signals.js`, stop/speed signs, crosswalks, parked cars, benches.
- **Weather** (`src/weather.js`): clear / fog / rain — fog density, rain sheet, wet-road material blend + grip, haze.
- **Traffic** (`src/traffic/`): 36 instanced agents, IDM car-following, signals / stop signs / yields / box occupancy, turn choice with signals, player treated as a vehicle. `__game.bot.start()` autopilots the player for soaks (`__game.bot.report()`): 75 s on PCH with traffic = 0 collisions.
- **Audio** (`src/audio/`): engine synth (exhaust harmonics + clipper, intake, limiter stutter, starter, stall, clunks), road/wind/squeal/indicator/wiper/horn/ABS/rain/collision, ocean/gulls/pier/town ambience with a cabin lowpass, tunnel reverb, three procedural radio stations + static. Not audible in the preview pane (needs a real browser).
- **Modes** (`src/modes/`): free roam; deliveries (Dijkstra route on the lane graph → nav route line + turn prompts + par time + earnings persisted); driving test (rules monitor emits speeding / red light / stop sign / no signal / oncoming lane / off road / collision → score + report card); time trials (3 courses, splits, best times persisted).
- **Input**: keyboard + mouse look (drag fallback), Gamepad API (Xbox standard map; wheels get an auto-guess map + `gamepad.startCalibration()`), options persisted (`highwayone_opts`).

## Numbers (preview pane, high quality, downtown with traffic)
~750 draw calls / ~1.0 M tris per frame before the cabin merge and 5 m terrain step landed at the end of the day — re-measure with F3 in a real browser first thing. If a laptop struggles: quality preset `medium` (mirrors every 2nd frame, 1024 shadow), traffic count in `main.js` (`createTraffic(..., { count: 36 })`), terrain `STEP`.

## Not yet done / ideas
- Gamepad + wheel paths are untested on real hardware (no pad in the preview). Calibration UI is code-only (`__game.gamepad.startCalibration(cb)`); wire a button in the pause menu.
- Quality preset changes need a reload (renderer/shadow/mirror sizes are read at boot).
- Ocean Ave → PCH transition is an abrupt width change (4-lane → 2-lane). Add a taper segment.
- Pedestrians, lane changes for traffic, traffic on the pier lots looks odd (they drive the lot loops on the sand — the lot ribbons are narrow).
- Tuning with a real mouse/keyboard: keyboard steer rates in `src/input.js`, shift points in `drivetrain.js`, exposure/bloom in `main.js`/`post.js`.
- Sound levels were set blind; balance in a real browser.

## Gotchas
- Preview pane refuses pointer lock and throttles rAF when hidden → `__game.start(); __game.tick(n)`; free camera `__game.debugShot(x,y,z, tx,ty,tz)` / `debugShot(null)`.
- The console error list in the preview tool persists across reloads; the three stale ones (read-only `position`, a syntax error, a mergeGeometries failure) are from earlier builds.
- `Object.assign(mesh, { position })` throws on r185 — use `mesh.position.set`.
- Ribbon/fan winding: CCW seen from above or the road is back-face culled.
- Collider boxes are (hw across, hd along) — pass thickness first for anything that runs along the road.
- Patch files with Python scripts using `assert s.count(old) == 1`; an empty `old` once shredded main.js.
