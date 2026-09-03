# NEXT-SESSION — checkpoint 2026-09-03 (block 3: cabin geometry + world graphics)

**Stewart's usage credits renew 2026-09-04 at 2:00 PM — schedule the next block after that.** Graphics remain the focus; gameplay features are queued in `docs/ROADMAP.md`.

## Block 3 (2026-09-03)
- Cabin rebuilt for correct proportions: windshield + rear glass flipped to lean the right way, A-pillars are thin tapered beams rising rearward, sun visors flush, dash top lowered (cowl 0.94 m), **cluster is a raised hooded pod** (centre y ≈ 1.0, tilted 22° toward the driver) fully visible above the dash and over the wheel rim, wheel hub lowered/raked, eye at 1.25 m, **default FOV 60°** (was 70; the wide FOV was showing too much roof/dash), two-tone tan lower dash, darker dash top.
- Sunset light column fixed: windshield/tint glass reflectivity cut (envMapIntensity 0.12, roughness 0.25) and hood paint less mirror-like.
- Ocean Ave got a raised landscaped median with palms; every building has a storefront sign + striped awning facing its street; empty lots are paved parking with stalls; town lawns tinted green; beach umbrellas, towels, volleyball nets; clouds patchier.
- Roller coaster animation guarded (NaN once reached the curve → uses getPoint with wrapped s).

## Previous block (2026-09-02, block 2)

**Live:** https://samizdat-publications.github.io/highway-one/  ·  **Repo (public):** github.com/Samizdat-Publications/highway-one
Deploy = push to `main`. Dev server: `preview_start highway-one` (autoPort) or `python serve.py 8432`.

## What changed in block 2 (Stewart's first feedback)
- **Reverse assist** (auto box): hold S at a standstill ≈ 0.5 s → R, S then backs up, W at a standstill → D. Shift/Ctrl still step P R N D. Manual modes untouched.
- **Hotkey panel** bottom-right (K or its KEYS tab collapses; state persisted). **Backspace** = reset to the nearest lane; a toast hints at it after 5 s of being stuck.
- **Cluster** bigger and backlit in daylight; digital MPH under the gear on the LCD; binnacle raised/tilted so both dials clear the wheel rim.
- **Pier rebuilt as Pacific Park** (`src/world/pier.js` + `layout.js`): Pier Ave → ramp (lot type, terrain embankment) → deck road (`pier` type, decking texture, terrain not flattened) → turnaround loop at the end. Entrance arch + banner, carousel pavilion (spinning), Playland arcade + kiosks with awnings/signs, Ferris wheel (bulb chase at night), running West Coaster roller coaster (TubeGeometry track, 3-car train), scrambler, drop tower, bait shop, lamps (light-pool spots), benches, railings (colliders). Traffic never spawns on the pier but may wander onto it.
- **Photo textures via Gemini** (`tools/gen_textures.py`, model `gemini-3.1-flash-image`, key in `secrets/gemini.txt`, outputs `assets/textures/*.jpg`, wrap-blended to tile): asphalt base under the baked markings, sidewalk concrete, sand, coastal scrub grass, cliff rock, decking, roof gravel, palm bark, three facades (stucco/deco/brick, cropped 6–94 % to drop the roof/sidewalk strips; the other three styles stay canvas so lit windows line up). Terrain now uses a **three-way splat** (grass/sand/rock weights per vertex, two-scale sampling to hide tiling) via `onBeforeCompile`. Everything falls back to the canvases if a JPG is missing.
- **Clouds**: soft canvas cloud disc at 950 m scrolling slowly, sun-tinted, thinned at night.
- **Cars**: traffic + parked cars share a real sedan silhouette (`src/world/carshape.js`: extruded profile + greenhouse + hubs).
- **Voice via ElevenLabs** (`tools/gen_voice.py`, `assets/audio/voice/*.mp3`, 23 clips, ~600 KB): Surf FM DJ (Roger), KJAZ (George), KPCH traffic/weather (Sarah), nav prompts + dispatcher (River/Sarah). `src/audio/voice.js` plays DJ breaks between songs with music ducking, nav prompts at ~300 ft and at the turn, "you have arrived", dispatcher lines. Quota: ~2 k of 37 k characters used.
- Exposure 0.92, concrete darkened (sidewalks were blowing out).

## Roadmap ideas (GTA-style free roam, in rough priority)
1. **Pedestrians** on sidewalks, the boardwalk and the pier; crosswalk crossings that traffic waits for; beach-goers.
2. **Gas station** on 2nd St (fuel gauge already drains): pull in, stop, hold a key → refuel; low-fuel = engine dies until you push/reset.
3. **Police**: a patrol car in traffic; speeding/red-light near it → pull-over mini event (stop within 10 s or lose score/money).
4. **Parking mode**: marked bays in the pier lot / beach lot; park inside the lines → "parked" bonus; parallel parking on streets.
5. **Car damage**: cracked-windshield overlay + rattles after hard hits; repair at the garage on 4th St.
6. **Phone / map menu**: full-screen map (the nav master canvas) with fast travel to POIs, mission list, collectibles (viewpoints, hidden beach spots, pier photo ops).
7. **Ambient life**: seagull flocks, a beach bus / ice-cream truck on a fixed route, boats offshore, joggers, a lifeguard truck on the sand.
8. **Traffic upgrades**: lane changes, horns when you block them, headlights in tunnels, a few trucks/buses shapes.
9. **Radio**: song titles per track (ElevenLabs clips read them), more music variety, news reacting to weather/time.
10. **Photo mode** (free camera exists as `debugShot`) and a chase/hood camera toggle for screenshots only.

## Known rough edges
- Preview pane: refuses pointer lock, throttles rAF when hidden; drive with `__game.start(); __game.tick(n)`.
- The console error list in the preview tool persists across reloads; the `rides` error listed is from an earlier build.
- Kiosks on the pier are plain boxes with signs; the Ferris wheel legs are simple; roller coaster has one rail (a tube) plus ties.
- Ocean Ave → PCH still an abrupt width change. Traffic on the pier is rare but possible (turn weights).
- Gamepad/wheel untested on hardware; audio levels set blind; measure fps with F3 in a real browser.
- Photo facades have no night-lit windows (only the canvas styles glow).

## Gotchas (see CLAUDE.md too)
- `Object.assign(mesh, { position })` throws on r185. Ribbon/fan winding must be CCW from above. Collider boxes are (hw across, hd along).
- Patch files with Python scripts that `assert s.count(old) == 1`; run them from a file, not a bash heredoc (JS quotes break the heredoc).
- Any new mesh must `layers.enable(2)` to show in the mirrors; cabin meshes stay on layer 0.
