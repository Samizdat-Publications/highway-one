# Highway One — first-person 3D driving sim (three.js r185, procedural, no bundler)

## Context

Stewart wants a 3D driving simulator, entirely first-person from the driver's seat, with a fully working cockpit (animated steering wheel, gauges, indicator lights, mirrors, wipers, shifter, pedals) and "everything you can reasonably build." Decisions from the kickoff questions (2026-09-02):

- **Style:** open-road coastal cruise on a Pacific Coast Highway near a beach-town pier (Santa Monica / Malibu feel), city-driving sim rather than racing. A regular sedan.
- **Transmission:** automatic by default, switchable to manual (clutch, H-pattern or sequential, stalling).
- **Activities:** free roam always on; plus delivery/taxi missions, traffic-rules scoring (driving-test style), and point-to-point time trials.
- **Name / repo / hosting:** **Highway One**, slug `highway-one`, **public** repo under `Samizdat-Publications`, **GitHub Pages** (static, no build step). No Cloudflare Worker; if one is ever added it must not be named `subway-zombies`.
- **Stack:** the proven Last Stop / 13F pattern: three.js r185 ES modules + import map, `vendor/three/` copied, everything procedural (canvas textures, code-built meshes, Web Audio SFX), `serve.py` no-store dev server, `window.__game` test hooks driven with `tick()` in the in-app browser.

### Repo situation (fix first)
`…\Fable 5.1\3d Driving Sim` is a **stale copy of Last Stop**: its `.git` remote is `subway-zombies`, and the sibling `…\Fable 5.1\Subway Zombies` is the real Last Stop checkout (4 commits ahead plus uncommitted work). Stewart approved wiping this folder and re-initialising it. `secrets/` (elevenlabs.txt, gemini.txt) also exists in Subway Zombies; it stays untracked and untouched.

World frame: three.js default, **x east, −z north, y up**; car local +x right, −z forward; ocean to the west. Sim at **120 Hz fixed step**, traffic AI at 60 Hz, render at rAF. Units shown to the player: mph / miles / °F-ish gauges (temp gauge is C/H only).

---

## Phase 0 — Reset the folder, create the repo (first 20 min)

1. Delete from `3d Driving Sim`: `.git`, `.wrangler`, `src/` (except `src/post.js`, `src/rng.js`, which are reused as-is), `tools/`, `.claude/`, `index.html`, `style.css`, `CLAUDE.md`, `NEXT-SESSION.md`, `README.md`, `serve.py`, `wrangler.jsonc`, `.assetsignore`, `.gitignore`. **Keep** `vendor/three/` and `secrets/`.
2. `git init -b main`; `.gitignore`: `secrets/`, `node_modules/`, `.wrangler/`, `*.log`, `Thumbs.db`, `.DS_Store`.
3. `serve.py` (copy of Last Stop's, default port **8432** so it never collides with Subway Zombies on 8431) and `.claude/launch.json` config **`highway-one`** → `python serve.py 8432`.
4. `.github/workflows/deploy.yml`: on push to `main`: checkout → `actions/configure-pages@v5` → `actions/upload-pages-artifact@v5` (`path: .`) → `actions/deploy-pages@v5` (v5 line needed on Node 24 runners, per Ranch Defense Force's notes). All `index.html` paths stay relative (`./vendor/...`, `./src/...`) so the `/highway-one/` sub-path works.
5. `gh repo create Samizdat-Publications/highway-one --public --source . --push`, then `gh api -X POST repos/Samizdat-Publications/highway-one/pages -f build_type=workflow`. Live URL: `https://samizdat-publications.github.io/highway-one/`.
6. New `CLAUDE.md` (layout, world coordinates, test hooks, conventions) + `README.md` (player-facing) + `NEXT-SESSION.md` checkpoint, refreshed at the end of every ~3 h block (Stewart works in blocks; always stop at a clean, committed, deployed checkpoint).

---

## File layout (`src/`, one responsibility per file, aim < 600 lines)

Root: `main.js` (boot, renderer, wiring, fixed-step accumulator, state machine, `window.__game`, F3 perf overlay) · `config.js` (every tunable in one object) · `rng.js` (reused) · `units.js` (mph/m/s, rpm, lerp/damp/clamp) · `textures.js` (canvas factory: asphalt with 3 baked lane-marking layouts, concrete, sand, grass, cliff, 4 facade styles, leather, soft-touch plastic, brushed metal, decking, sign faces, gauge faces, icon atlas, noise/cloud/foam) · `materials.js` (cached MeshStandardMaterials, wet/dry variants, LED emissive palette, `rep()` tiling clones) · `input.js` (keyboard + mouse look + gamepad + `override` merged into one normalized `I`) · `gamepad.js` (Gamepad API polling, Xbox preset, generic wheel mapping + calibration, persisted by `gamepad.id`) · `hud.js` · `menu.js` (menu/pause/options DOM) · `save.js` (localStorage) · `post.js` (reused: Render → Bloom → Output → SMAA → final vignette/grain) · `sky.js` · `lighting.js` · `weather.js` · `collide.js` (2-D OBB/circle spatial hash + SAT resolve + collision events).

`vehicle/`: `engine.js` (torque curve, friction, idle governor, limiter, starter/stall, fuel/temp) · `drivetrain.js` (two-state clutch, ratios, auto shift logic, manual H/sequential, final drive) · `tyres.js` (Pacejka-lite, combined slip, μ table, semi-implicit wheel spin) · `car.js` (body state, weight transfer, steering, brakes/ABS/handbrake, aero/slope, suspension filters, odometer, `applyInput`, `teleport`) · `carmesh.js` (hood/fenders/pillars/mirror housings/roof/tail/wheels + lamp emissives).

`cockpit/`: `interior.js` (dash, binnacle, center stack, console, doors, seats, headliner, glass; returns named anchors) · `wheel.js` (wheel + stalks) · `gauges.js` (cluster canvas day/night, needle meshes with lag springs, LCD strip, warning-lamp InstancedMesh) · `controls.js` (pedals, shifter PRND/H-pattern, handbrake) · `wipers.js` (arms + droplet mask canvas) · `mirrors.js` (3 render targets, staggered) · `lights.js` (head/high/brake/reverse/dome lights, signal blink timer, dash backlight) · `nav.js` (nav-screen canvas: heading-up map crop, route, next turn, speed/limit/clock) · `radio.js` (display glue) · `camera.js` (seat, look-around with return spring, quick-look keys, head bob/sway, FOV).

`world/`: `roads.js` (graph, spline samples every 2 m, spatial hash, `surfaceAt`, lane graph, connectors) · `layout.js` (the actual map as node/segment lists) · `roadmesh.js` (ribbons with baked-marking UVs, intersection fans, decals, sidewalks, guardrails, tunnels, bridges) · `terrain.js` (fbm heightfield + cliff ridge + beach shelf, road-corridor flattening, chunks, `heightAt`) · `ocean.js` (Gerstner shader, sun glint, surf/foam band, shoreline function) · `town.js` (instanced facade buildings with signage, pier + Ferris wheel bulb chases, lots) · `props.js` (instanced palms, street lights, signal poles/heads, signs, parked cars, benches, hydrants; registers colliders + light-pool spots) · `signals.js` (phase controllers, head emissives, stop-sign metadata).

`traffic/`: `agents.js` (pool, spawn ring, InstancedMesh bodies/wheels/lamps) · `driver.js` (lane following, IDM car-following, signal/stop-sign logic, intersection tickets, turn choice) · `bot.js` (player autopilot via `__botStep` for soak tests).

`audio/`: `context.js` (buses, compressor, listener, noise buffers, `param()` via `setTargetAtTime`) · `engine.js` · `sfx.js` · `ambient.js` · `radio.js` (3 procedural stations + static).

`modes/`: `base.js` (mode interface + event bus: collision, redLight, stopSign, speeding, laneDepart, signalMissed, checkpoint) · `freeroam.js` · `delivery.js` · `rules.js` · `timetrial.js` · `route.js` (Dijkstra on junction graph + turn instructions).

---

## Vehicle model (the heart of the sim)

**Constants** (1,400 kg FWD sedan, ~150 hp; all in `config.js`): wheelbase 2.65, track 1.55, CG h 0.55, 60 % front, Iz 2300; r 0.31, Jw 1.2, Je 0.18. Torque curve rpm→Nm 800:120, 1500:155, 2500:185, 3500:200, 4500:205, 5500:195, 6000:185, 6500:160; friction `15 + 0.006·rpm`; idle 800, limiter 6400 (100 ms cut). Gears 3.55 / 2.02 / 1.35 / 1.00 / 0.78, R 3.30, final 4.10, η 0.90, clutch cap 300 Nm. Brakes 1500 F / 900 R Nm per wheel, handbrake 1200 R. Steering 900° lock-to-lock, ratio 12.9; keyboard steer rate 500°/s, return 900°/s, keyboard max angle × `clamp(1 − v/60, 0.15, 1)`. Drag `0.5·1.2·0.68·v²`, rolling 0.013·m·g. μ dry 1.0 / wet 0.7 / sand 0.55 / grass 0.6 / dirt 0.75. Pacejka long B10 C1.9 E0.97, lat B8 C1.3 E−1.5. Visual suspension: pitch 2°/g, roll 4°/g, second-order filters (1.6 Hz ζ0.45; heave 1.3 Hz ζ0.30).

**Per-step order (1/120 s):** inputs (pedals filtered 30 ms) → steering (road δ = wheelDeg/12.9; self-centre when released, scaled by `min(1, v/5)`) → `surfaceAt` at 4 wheels (heights, μ, on-road; groundPitch/Roll) → wheel loads with longitudinal + lateral transfer (clamp ≥ 50 N, use last step's filtered ax/ay) → wheel kinematics with slip relaxation (`κf += (κ−κf)·min(1, dt·vRef/0.3)`, vRef ≥ 1 m/s) → tyre forces (Pacejka, friction-circle clamp) → engine torque (curve·throttle − friction + idle governor, limiter, starter) → clutch/drivetrain two-state (slipping: `Tc = Tcap·sign(Δω)` with linear band; locked: combined inertia `Je·G² + 2Jw`; auto = torque-converter creep `Tcap = 300·clamp((rpm−700)/1500)`, shifts ramp Tcap 0 over 120 ms then back over 200 ms) → brakes/ABS (Coulomb clamp so ω never reverses in a step; ABS cut at κ < −0.20, reapply > −0.08, drives lamp + 12 Hz pedal pulse) → semi-implicit wheel spin integration (stable at 120 Hz) → body integration (forces + drag + rolling + slope; yaw from Σ r×F / Iz) → collisions (OBB MTV push-out, e 0.25, friction 0.4, yaw impulse, emits event) → suspension filters → auto shift logic at 60 Hz (up `lerp(2300, 6100, throttle^1.5)`, down `lerp(1100, 3900, throttle)`, kickdown, 0.8 s min gap, PRND rules) → stall check (manual, clutch engaged, rpm < 450 for 0.25 s → engine off, lamps on, needles drop; restart hold E 0.6 s) → bookkeeping (mph, odometer, fuel, temp, blink 85/min).

State exposed as `car.S` (pos, yaw, vel, wheels[4], engine, drive, steerWheelDeg, abs, body pitch/roll/heave, odometer, fuel, temp, lights, wipers, speedMph).

---

## Road network and world

- **Data:** `nodes[]`, `segments[]` (Catmull-Rom control points, type highway/street/side/lot, lanesF/lanesB, laneW 3.5 (3.2 streets), shoulders, sidewalk/parking flags, limitMph, tunnel/bridge ranges, name). Samples every 2 m: `{p, t, n, up, s}`. Lanes are virtual offsets `sign(k)·(|k|−0.5)·laneW`; US right-hand. `intersections[]` with kind signal/stop4/stop2/yield, approaches (stopS, lanes, crosswalk, stopSign), precomputed bezier connectors tagged L/S/R with phase groups, and signal phase tables (green 22 / yellow 3.5 / all-red 1.5, seeded offsets).
- **`surfaceAt(x,z)`:** 20 m spatial-hash cells → project onto nearest sample chord → `{onRoad, height (+2 % crossfall), normal, seg, s, lateral, laneIndex, laneDir, surface, limitMph, inIntersection, tunnel}`; cache last hit per querier; off-road falls to `terrain.heightAt` with surface type.
- **Mesh:** ribbon per segment with ~7 vertex columns, UV v = s/12 so the 3 m dash / 9 m gap cadence is baked in the texture (no decal z-fighting); intersections as fans with stop-line/crosswalk/arrow decals on `polygonOffset`; sidewalks + curbs; instanced guardrail posts + merged W-beam; tunnel arches (extruded profile) with sodium lamps; bridge deck + piers + railings. Merge static geometry per material; register colliders.
- **Layout (fictional town "Pelican Point"):** 4×6 blocks (90×70 m, 25 mph, parking), Ocean Ave 4-lane divided (35 mph) at x = −40 with signals at 3 T-junctions and stop signs elsewhere; Pier Ave signal → pier lot; beach x −60…−110, shoreline x −112 (surf band animates ±8 m); pier deck x −70…−390 at z +120 with Ferris wheel at x −340. North: Ocean Ave becomes PCH at z −260 (S-curve, climbs 5→45 m along cliffs, 55 mph), tunnel ≈ z −900 (120 m), canyon bridge ≈ z −1300 (90 m), mountain-pass T at z −700 climbing east to y 150 via 6 switchbacks (35 mph) rejoining at z −1900, second tunnel ≈ z −2100, overlook loop at z −2600. South: 800 m to a beach-lot turnaround. ≈ 8 road miles. Terrain generated after the graph and flattened within a 12 m corridor (cubic blend to 30 m).
- **Traffic:** ~40 agents in 3 instanced draws; IDM car-following (amax 1.6, b 2.5, s0 2.5, T 1.4, v0 = limit × 0.9…1.08 per seed); virtual zero-speed leaders at stop lines (run the yellow if `dist < v·1.2`), 1.5 s stop-sign dwell, intersection tickets for conflicts, turn weights S 0.6 / R 0.25 / L 0.15, signals set 30 m before the stop line. Player car inserted into lane lists from its `surfaceAt`. Spawn/despawn ring 120–250 m.

---

## Cockpit

- **Hierarchy:** `carRoot (pos,yaw)` → `body (pitch/roll/heave)` → `exterior` (layers 0+2), `interior` (layer 0 only), `headPivot` → `camera`. Mirror cameras render layer 2 only, so the cabin never appears in mirrors.
- **Interior:** extruded dash profile with bevel, binnacle hood, tilted center stack with recessed nav bezel, console with lathe cup holders and shifter boot, door cards with canvas grille/handle textures, seats with bolsters and stitched leather, pillars/headliner/visors, glass (transparent, roughness 0.05, envMap 1.5, tint band). Materials: soft-touch black, piano black, brushed aluminum, leather, chrome, painted body with clearcoat look. `scene.environment` from a PMREM of the sky so the plastics and chrome read correctly.
- **Gauges:** 1024×512 cluster canvas (speedo 0–160 mph 240° sweep, tach 0–8 with redline, fuel + temp quarter dials, LCD zone) in day `map` + night `emissiveMap` variants; needles are tapered meshes on pivot Object3Ds with 5 Hz ζ0.7 lag springs; 12 warning lamps as one InstancedMesh with `instanceColor` (signals blink with `lights.blinkOn`); odometer/gear/clock on a 256×64 LCD strip re-uploaded at 10 Hz.
- **Controls:** torus wheel + 3 spokes + hub, column tilted 22°, `rotation.z = −steerWheelDeg`; stalks flick on signal/wiper; pedals rotate 0→18°; shifter lerps between named gate positions through neutral (0.25 s); handbrake lever.
- **Wipers:** cowl-pivoted arms, `θ = 80°·(1−cos 2π·phase)/2` at 0.9/1.4 Hz with intermittent pause; 512×256 droplet-mask canvas (rain paints, wipers erase with `destination-out` arcs) as `alphaMap` on an overlay hugging the glass.
- **Mirrors:** rear 256×96, sides 160×96 render targets (no colorSpace, composer tone-maps once), horizontal flip via `repeat.x = −1`; rear FOV 28°, sides 24°; even frames rear, odd frames alternate sides; shadows updated once per frame only on the main pass.
- **Nav screen:** 2048² master map drawn once; 384×256 heading-up crop with route polyline, chevron, street name, speed/limit, next-turn arrow + distance, ETA, clock, mode objective; `emissiveMap` at 10 Hz. Radio display 256×64 at 4 Hz.
- **Camera:** eye at (−0.37, 1.12, −0.10) with seat options; look yaw ±150°, pitch −40…+35°; pointer lock or drag; return-to-center spring after 0.6 s; quick-look keys (left / rear / right); head y from sprung-mass lag + idle shiver (0.4 mm at 25 Hz, fades above 3 m/s) + ABS pulse; lateral/forward from roll/pitch; horizon tilts with the body. FOV 70 (55–95). Near 0.05, far 3000.

---

## Lighting, sky, weather, ocean (18 real lights max)

Sun DirectionalLight (elevation from hour, sets over the ocean in the west; intensity 3.2 → 0, color warms near the horizon; 2048 PCFSoft shadow, ortho ±35 m following the car and snapped to texel grid; `normalBias 0.03`) + moon 0.06 + hemisphere. Sky dome shader (gradient, sun disc, stars, cloud sprites), `fog:false`; `scene.fog.color` tracks the horizon; PMREM environment regenerated when the sun moves > 4°. Street/pier/tunnel lights: emissive heads + additive ground-pool quads (instanced, dusk fade) + a **pool of 6 recycled PointLights** near the player (+4 for pier/Ferris). Car: 2 headlight SpotLights (low 1400 cd / high 3200 cd), brake PointLight, reverse PointLight, dome light; lens emissives with bloom. Weather: FogExp2 clear 0.0009 / dusk 0.0013 / rain 0.0035 / fog 0.012 with 8 s cross-fades; rain = 1200 instanced streak quads in a box ahead of the camera, leaning with car velocity, hidden in tunnels; wet road = material swap (darker, roughness 0.32, envMap 1.3, puddle roughnessMap) over 20 s + μ switch. Ocean: 2400 m plane, 4 Gerstner waves, Fresnel + sun glint, foam band on `shoreline(t) = −112 + 6·sin(2πt/11)`, three.js fog chunks included; beach with a wet strip tracking the shoreline.

---

## Audio (Web Audio, procedural)

Buses engine/sfx/ambient/radio → compressor; `setTargetAtTime` everywhere; init on first gesture, suspend when hidden. **Engine:** 4-cyl firing `f0 = rpm/30`; exhaust = custom PeriodicWave (24 harmonics, odd +40 %) → soft-clip WaveShaper (drive with load) → lowpass; sub at f0/2; intake noise bandpass following rpm × throttle; whine; idle AM jitter; overrun burble; limiter gating at 15 Hz; starter cranks, stall shudder, shift clunk. **SFX:** road noise (lowpass by speed, surface variants), wind, tyre squeal from |α|/|κ| excess, indicator relay tick/tock, wiper sweep + reversal thunk, horn (two saws), seatbelt chime, collision crunch scaled by speed, ABS buzz, rain on roof. **Ambient:** ocean bed by shoreline distance (cabin lowpass 2.2 kHz), seagull FM chirps, pier murmur + Ferris hum, tunnel reverb send. **Radio:** 101.5 Surf FM (100 bpm I–V–vi–IV sequencer), 88.9 Late Night Jazz (swing, walking bass, Rhodes chords), 640 AM Talk (formant-noise murmur), static between stations.

---

## Modes and HUD

`modes/base.js` event bus feeds all modes. **Free roam** default. **Delivery:** seeded pickup/dropoff pairs on named streets, `route.js` Dijkstra with lane-direction constraints, route line + turn prompts on the nav, timer vs par, earnings tally. **Rules:** monitors speeding (> limit + 5 for > 3 s), red-light/stop-sign runs (stop line crossed while red / speed > 1 mph through a stop approach), unsignaled turns at intersections, lane departures, collisions; live score + end-of-drive report card (driving-test style, letter grade). **Time trial:** 3 courses (town loop, cliff run, mountain pass), checkpoints, splits, best times in `save.js`. HUD is minimal DOM (mode/objective/timer, toasts, optional mph); dashboard remains the primary instrument. Pause/options: sensitivity, FOV, volume, units, quality preset (shadow size, mirror rate, rain count), seat position, transmission mode, gamepad calibration.

---

## Build order (each step ends screenshot-verified in the preview pane + `__game.tick()` smoke check, then commit + push = deploy)

1. **Phase 0** reset + repo + Pages + `index.html`/`style.css` skeleton with boot-error catcher; verify the empty page deploys.
2. **Drivable car in cockpit on a flat test road:** `main.js` loop + `__game` hooks, config/units/textures/materials/post, `input.js`, `vehicle/*` (auto only), temporary flat road ribbon, `interior`, `wheel`, `gauges` (speedo/tach/gear), `camera`. Checks: 0–60 mph ≈ 9–10 s, 60–0 ≈ 40 m, needles lag, wheel turns, head bob.
3. **Road network + terrain + town skeleton:** `roads`, `layout`, `roadmesh`, `terrain`, `collide`; real `surfaceAt`; nav shows map + car dot; `teleport`.
4. **Full cockpit:** `controls`, `wipers`, `mirrors`, `lights`, `carmesh`, nav route drawing, radio display; manual gearbox + clutch + stalling; all indicator lamps.
5. **Sky / lighting / weather / ocean:** `sky`, `lighting` light pool + follow shadow, `weather`, `ocean`, beach; `setTime`/`setWeather`; dusk street lights; night dash backlight.
6. **Town, pier, props, signals:** buildings, pier + Ferris wheel, palms, parked cars, signal heads, stop signs, crosswalks; instancing/chunking perf pass to hold 60 fps.
7. **Traffic:** `agents`, `driver`, lane lists, tickets, spawn ring; `traffic/bot.js` 10-minute soak via `__botStep` (assert finite state, no stuck agents, collision rate).
8. **Audio:** engine first, then cabin cues, ambient, radio.
9. **Gamepad + menus + HUD + save:** Xbox preset, generic wheel mapping + calibration screen, options, quality presets.
10. **Modes:** `route`, `delivery`, `rules` report card, `timetrial` best times.
11. **Tuning + hardening:** feel (keyboard steer curves, shift points), traffic density, exposure/bloom per time of day, night + rain bot soak, README/CLAUDE.md/NEXT-SESSION refresh.

Steps 1–2 are the first ~3 h block; every later block ends at a committed, deployed checkpoint with `NEXT-SESSION.md` updated.

---

## Gotchas to honor (r185 + platform)

- Canvas textures used as `map`/`emissiveMap` need `colorSpace = SRGBColorSpace`; data/roughness/alpha maps stay linear. OutputPass tone-maps once; bloom before it; sky `fog:false`; ocean shader includes fog chunks.
- Physical light units: spots in the thousands, points 10–200, sun ~3. Tune `emissiveIntensity` (2–6) against bloom threshold 0.85 before adding lights.
- `shadowMap.autoUpdate=false`, `needsUpdate=true` once per frame before the main pass so mirror renders don't redo shadows; `renderer.info.reset()` once per frame with `autoReset=false`.
- Render mirrors with `setRenderTarget(rt)` before `composer.render`, then reset to null; leave RT colorSpace untouched.
- InstancedMesh: chunk static props and `computeBoundingSphere()` after fill; moving instances `frustumCulled=false` + `DynamicDrawUsage`; `setColorAt` on every instance before first render. `mergeGeometries` needs identical attribute sets.
- Canvas texture uploads: small canvases, `generateMipmaps=false`, `LinearFilter`, ≤ 10 Hz.
- Gamepad (Windows/Chrome): appears only after a button press; poll `getGamepads()` every frame; Xbox triggers are `buttons[6]/[7].value`; DirectInput wheels have `mapping ""`, pedal axes read 0 until moved then rest at +1 (auto-invert when rest ≈ max), persist calibration by `gamepad.id`.
- Preview pane refuses pointer lock and throttles rAF when hidden: keep drag-look fallback and `tick(n, dt)`; clamp the accumulator to 8 steps; ignore the first big `movementX` after lock.
- Low-speed tyre slip is the divergence source: slip relaxation + semi-implicit wheel integration are mandatory; assert finite state in `tick()` during soak.
- Patch source with Python scripts in the scratchpad rather than bash heredocs containing JS quotes (per Last Stop's notes).

---

## Verification

- **Per step:** `preview_start` `highway-one` → `window.__game.start(); __game.tick(120)` → screenshot; console clean; `read_console_messages` for errors.
- **Physics:** with `__game.input.override = {throttle:1}` tick 1200 steps and read `car.S.speedMph` (0–60 in ~9–10 s); full brake from 60 mph stops in ~40 m; ABS lamp toggles; manual mode: clutch up in 3rd at idle → stall; rev limiter holds at 6400.
- **Cockpit:** screenshots at steer ±450°, at night with signals on, in rain with wipers mid-sweep; mirrors show the road behind and never the cabin.
- **World:** `teleport` to pier, tunnel, bridge, switchbacks; `setTime(6.5 / 12 / 18.3 / 23)`; `setWeather('rain' | 'fog')`; frame-time overlay (F3) stays ≤ 16 ms on the laptop.
- **Traffic:** bot soak 10 min at 60 Hz AI: no NaNs, no agent stuck > 20 s, agents stop at reds and stop signs (spot-check screenshots at Ocean Ave signals).
- **Modes:** run one delivery end to end, one rules drive producing a report card, one time trial saving a best time; reload the page and confirm persistence.
- **Deploy:** push → Actions green → live page loads with a clean console at `https://samizdat-publications.github.io/highway-one/`.
