import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, lerp, DEG, fmtClock, MPS_TO_MPH } from './units.js';
import { makeTextures } from './textures.js';
import { makeMaterials } from './materials.js';
import { createInput } from './input.js';
import { createPost } from './post.js';
import { createSky } from './sky.js';
import { createLighting } from './lighting.js';
import { createRoads } from './world/roads.js';
import { buildLayout } from './world/layout.js';
import { createTerrain } from './world/terrain.js';
import { buildRoadMesh } from './world/roadmesh.js';
import { createCollide } from './collide.js';
import { buildOcean } from './world/ocean.js';
import { createWeather } from './weather.js';
import { createSignals } from './world/signals.js';
import { buildProps } from './world/props.js';
import { buildTown } from './world/town.js';
import { createDriver } from './traffic/driver.js';
import { createTraffic } from './traffic/agents.js';
import { createBot } from './traffic/bot.js';
import { createAudioContext } from './audio/context.js';
import { createEngineAudio } from './audio/engine.js';
import { createSfx } from './audio/sfx.js';
import { createAmbient } from './audio/ambient.js';
import { createRadioAudio } from './audio/radio.js';
import { createSave } from './save.js';
import { createGamepad } from './gamepad.js';
import { createRouter } from './modes/route.js';
import { createEvents, createRulesMonitor } from './modes/base.js';
import { createModes } from './modes/modes.js';
import { createCar } from './vehicle/car.js';
import { buildCarMesh } from './vehicle/carmesh.js';
import { buildInterior } from './cockpit/interior.js';
import { buildWheel } from './cockpit/wheel.js';
import { buildGauges } from './cockpit/gauges.js';
import { createCameraRig } from './cockpit/camera.js';
import { buildControls } from './cockpit/controls.js';
import { buildWipers } from './cockpit/wipers.js';
import { buildMirrors } from './cockpit/mirrors.js';
import { buildVehicleLights } from './cockpit/lights.js';
import { buildNav } from './cockpit/nav.js';
import { buildRadio } from './cockpit/radio.js';
import { createHUD } from './hud.js';
import { createMenu } from './menu.js';

// ---------------------------------------------------------------- renderer / scene
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
const VW = () => window.innerWidth || 1280, VH = () => window.innerHeight || 720;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(VW(), VH());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xbfd7ea, 0.0009);
const camera = new THREE.PerspectiveCamera(CONFIG.cockpit.fov, VW() / VH(), 0.05, 3000);
camera.layers.enable(0); camera.layers.enable(2);

const game = { state: 'menu', time: 0, timeScale: 1, hour: 15.5, ignitionOn: false, dashDim: 1, mode: 'freeroam', quality: 'high' };

const hud = createHUD();
const menu = createMenu({ onStart: start, onResume: resume, onMainMenu: toMainMenu, onOption: applyOption });
const T = makeTextures(CONFIG.world.seed);
const M = makeMaterials(T);
const sky = createSky(scene);
const Q = CONFIG.quality[menu.opts.quality] || CONFIG.quality.high;
const lighting = createLighting(scene, renderer, sky, Q);
const post = createPost(renderer, scene, camera);
post.u.grain.value = 0.02; post.u.vignette.value = 0.35;
const roads = createRoads(); buildLayout(roads);
const collide = createCollide();
const terrain = createTerrain(roads, M, T); scene.add(terrain.build());
const roadMesh = buildRoadMesh(roads, terrain, M, T, collide); scene.add(roadMesh.group);
const ocean = buildOcean(scene, terrain, sky, T);
const signals = createSignals(roads);
const props = buildProps(scene, roads, terrain, M, T, collide, lighting, signals);
const town = buildTown(scene, roads, terrain, M, T, collide, lighting);
const driver = createDriver(roads, signals);
const world = {
  roads, terrain, collide,
  surfaceAt(x, z) {
    const r = roads.surfaceAt(x, z);
    if (r.onRoad || r.seg) return r;
    const h = terrain.heightAt(x, z);
    return { onRoad: false, height: h, surface: terrain.surfaceType(x, z, h), limitMph: 25, laneIndex: 0, lateral: 0, tunnel: false, seg: null, name: '' };
  },
};
const car = createCar(CONFIG.car, world);

// car rig: carRoot (pos/yaw) → body (pitch/roll/heave) → exterior + interior + head
const carRoot = new THREE.Group(); scene.add(carRoot);
const body = new THREE.Group(); carRoot.add(body);
const exterior = buildCarMesh(M, CONFIG.car); body.add(exterior.root);
const interior = buildInterior(M, T); body.add(interior.root);
const wheel = buildWheel(M, interior.anchors, CONFIG.cockpit);
const gauges = buildGauges(M, interior.anchors, car, game);
const rig = createCameraRig(camera, body, CONFIG.cockpit);
const controls = buildControls(M, T, interior.anchors, car);
const wipers = buildWipers(M, interior.anchors, car);
const mirrors = buildMirrors(M, interior.anchors, exterior, scene, renderer, Q);
const vlights = buildVehicleLights(exterior, interior.anchors, car, game);
const nav = buildNav(M, interior.anchors, roads, car, game);
const radio = buildRadio(M, interior.anchors, game);
const weather = createWeather(scene, camera, sky, M, wipers, car, Q);
const traffic = createTraffic(scene, roads, driver, car, { count: 36 });
// mirror cameras see layer 2: everything in the world except the cabin
scene.traverse((o) => { o.layers.enable(2); });
interior.root.traverse((o) => { o.layers.disable(2); });
sky.dome.layers.enable(2);

const input = createInput(canvas, {
  onEscape: () => { if (game.state === 'playing') pause(); else if (game.state === 'paused') resume(); },
  onPerf: () => hud.togglePerf(),
  onLockDenied: () => hud.setLockHint('POINTER LOCK REFUSED BY HOST — CLICK-DRAG TO LOOK'),
  onLockChange: (locked) => { hud.setLockHint(locked ? '' : (input.I.lockDenied ? 'CLICK-DRAG TO LOOK' : 'CLICK TO CAPTURE MOUSE')); if (!locked && game.state === 'playing' && !input.I.lockDenied) pause(); },
});
const bot = createBot(game, car, roads, driver, traffic, input.I);
const audio = createAudioContext();
const engineAudio = createEngineAudio(audio, car);
const sfx = createSfx(audio, car);
const ambientAudio = createAmbient(audio, car, terrain);
radio.ignition = () => game.ignitionOn;
const radioAudio = createRadioAudio(audio, radio);
document.addEventListener('visibilitychange', () => { if (document.hidden) audio.suspend(); else if (game.state === 'playing') audio.resume(); });
const save = createSave();
const gamepad = createGamepad(input.I, save);
const router = createRouter(roads, driver);
const events = createEvents();
const rules = createRulesMonitor(events, car, roads, signals, driver, collide);
const modes = createModes({ game, car, roads, driver, router, nav, hud, events, rules, save, traffic, menu });
car.S.odometer = save.get('odometer', car.S.odometer);
setInterval(() => save.set('odometer', car.S.odometer), 15000);

// ---------------------------------------------------------------- options
function applyOption(k, v) {
  switch (k) {
    case 'sens': input.I.sens = v; break;
    case 'vol': audio.setVolume(v); break;
    case 'fov': rig.S.fovTarget = v; break;
    case 'seat': rig.S.seatY = v; break;
    case 'trans': car.drivetrain.setMode(v); break;
    case 'hour': game.hour = v; sky.setHour(v); break;
    case 'hudspeed': hud.S.showSpeed = v === 'on'; break;
    case 'weather': weather.set(v, game.state === 'menu'); break;
    default: break;
  }
}
function applyAllOptions() { for (const k of Object.keys(menu.opts)) applyOption(k, menu.opts[k]); }
applyAllOptions();

// ---------------------------------------------------------------- flow
function start() {
  game.mode = menu.opts.mode;
  game.state = 'playing'; input.I.enabled = true;
  menu.showMain(false); menu.showPause(false);
  input.requestLock();
  audio.init(); audio.resume();
  if (!game.ignitionOn) {
    game.ignitionOn = true; car.engine.start();
    if (car.drivetrain.S.mode === 'auto') { car.drivetrain.S.sel = 'D'; car.drivetrain.S.gear = 1; car.drivetrain.S.G = car.drivetrain.ratio(1); }
  }
  if (!modes.active || game.mode !== menu.opts.mode) modes.set(menu.opts.mode);
  else hud.toast('HIGHWAY ONE', '', 2);
}
function pause() { if (game.state !== 'playing') return; game.state = 'paused'; input.I.enabled = false; menu.showPause(true); document.body.classList.add('menu-open'); audio.suspend(); }
function resume() { game.state = 'playing'; input.I.enabled = true; menu.showPause(false); document.body.classList.remove('menu-open'); input.requestLock(); audio.resume(); }
function toMainMenu() { game.state = 'menu'; input.I.enabled = false; menu.showPause(false); menu.showMain(true); input.exitLock(); }

// ---------------------------------------------------------------- per-step controls (edge-triggered keys)
function handleEdges(I) {
  const E = I.edge, S = car.S, L = S.lights, D = car.drivetrain;
  if (E.shiftUp) D.requestSequential(1, S.vFwd);
  if (E.shiftDown) D.requestSequential(-1, S.vFwd);
  for (let g = 1; g <= 5; g++) if (E['gear' + g]) D.requestGear(g);
  if (E.gearR) D.requestGear(-1); if (E.gearN) D.requestGear(0);
  if (E.signalL) L.signal = L.signal === 'L' ? null : 'L';
  if (E.signalR) L.signal = L.signal === 'R' ? null : 'R';
  if (E.hazards) L.hazards = !L.hazards;
  if (E.lights) { if (!L.low) { L.low = true; L.high = false; } else if (!L.high) L.high = true; else { L.low = false; L.high = false; } }
  if (E.wipers) { S.wipers.mode = (S.wipers.mode + 1) % 4; hud.toast(['WIPERS OFF', 'WIPERS · INTERMITTENT', 'WIPERS · LOW', 'WIPERS · HIGH'][S.wipers.mode], '', 1.2); }
  if (E.lights) L.manual = true;
  if (E.navZoom) nav.cycleZoom();
  if (E.mode) { const order = ['freeroam', 'delivery', 'rules', 'timetrial']; const next = order[(order.indexOf(game.mode) + 1) % order.length]; menu.opts.mode = next; menu.refresh(); menu.save(); modes.set(next); hud.toast(modes.active.name, '', 2); }
  if (E.handbrakeToggle) I.handbrakeLatch = !I.handbrakeLatch;
  if (E.radio) radio.cycle();
  if (E.transmission) { const order = ['auto', 'manualH', 'manualSeq']; const next = order[(order.indexOf(D.S.mode) + 1) % 3]; D.setMode(next); menu.opts.trans = next; menu.refresh(); menu.save(); hud.toast(({ auto: 'AUTOMATIC', manualH: 'MANUAL · H-PATTERN (1-6, 0=N)', manualSeq: 'MANUAL · SEQUENTIAL' })[next], '', 2); }
  if (E.ignition) { if (car.engine.S.running) { car.engine.stop(); } else { game.ignitionOn = true; car.engine.start(); } }
  if (E.seatbelt) { S.seatbelt = !S.seatbelt; sfx.chime(); }
  S.hornOn = !!I.hornHeld;
  if (E.domeLight) L.dome = !L.dome;
  // signal auto-cancel after the wheel returns from a turn
  if (L.signal) {
    const sd = S.steerWheelDeg;
    if (!L.sigArmed && Math.abs(sd) > 60 && Math.sign(sd) === (L.signal === 'L' ? -1 : 1)) L.sigArmed = true;
    if (L.sigArmed && Math.abs(sd) < 15) { L.signal = null; L.sigArmed = false; }
  } else L.sigArmed = false;
}

// ---------------------------------------------------------------- fixed-step loop
const DT = 1 / CONFIG.sim.hz;
let acc = 0, last = performance.now(), frames = 0, fpsT = 0, fps = 0;
const fwdV = new THREE.Vector3(), focusV = new THREE.Vector3();

function simStep(dt) {
  if (window.__botStep) window.__botStep(dt);
  gamepad.poll(dt);
  const I = input.step(dt, car.S.speed);
  if (I.handbrakeLatch) I.handbrake = 1;
  if (game.state === 'playing') handleEdges(I);
  else { I.throttle = 0; I.brake = Math.max(I.brake, 0); }
  car.step(dt, I);
  collide.resolveCar(car, traffic.nearBoxes(car.S.x, car.S.z, 12));
  signals.update(dt);
  const hereNow = roads.surfaceAt(car.S.x, car.S.z);
  if (car.S.stepCount % CONFIG.sim.aiDivider === 0) traffic.update(dt * CONFIG.sim.aiDivider, hereNow, sky.S.night);
  if (game.state === 'playing') { rules.update(dt, hereNow); modes.update(dt); }
  game.time += dt;
  game.hour = (game.hour + dt / 3600 * 12) % 24; // 2-hour day for now (12× real time) — tuned later
  rig.update(dt, I, car);
  wheel.update(dt, car);
  controls.update(dt);
  wipers.update(dt);
  // auto headlights at dusk unless the player has used the switch
  if (!car.S.lights.manual && !car.S.lights.low && sky.S.sunElev < 3 && game.state === 'playing') { car.S.lights.low = true; hud.toast('HEADLIGHTS ON', '', 1.5); }
}

function syncVisuals() {
  const S = car.S;
  carRoot.position.set(S.x, S.y, S.z); carRoot.rotation.y = S.yaw;
  body.rotation.set(-S.body.pitchOut, 0, S.body.rollOut, 'XZY');
  body.position.y = S.body.heaveOut;
  exterior.update(car);
}

function render(dt) {
  syncVisuals();
  if (game.debugCam) {
    const d = game.debugCam; carRoot.updateMatrixWorld(true);
    if (camera.parent !== scene) { camera.parent.remove(camera); scene.add(camera); }
    camera.fov = d.fov; camera.updateProjectionMatrix(); camera.position.set(d.x, d.y, d.z); camera.lookAt(d.tx, d.ty, d.tz); camera.updateMatrixWorld(true);
  } else if (camera.parent === scene) { scene.remove(camera); rig.pivot.add(camera); camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); camera.fov = rig.S.fov; camera.updateProjectionMatrix(); }
  gauges.update(dt, sky.S.night);
  vlights.update(dt, sky.S.night);
  radio.update(dt);
  engineAudio.update(dt); sfx.update(dt, weather, car.S.inTunnel); ambientAudio.update(dt); radioAudio.update(dt);
  nav.update(dt, roads.surfaceAt(car.S.x, car.S.z));
  sky.setHour(game.hour);
  weather.update(dt);
  sky.update(camera);
  sky.refreshEnvironment(renderer);
  ocean.update(dt);
  town.update(dt, sky.S.night, lighting.S.streetOn);
  props.lampHead.emissiveIntensity = lighting.S.streetOn ? 2.5 : 0;
  car.S.inTunnel = !!roads.surfaceAt(car.S.x, car.S.z).tunnel;
  carRoot.updateMatrixWorld(true);
  fwdV.set(-Math.sin(car.S.yaw), 0, -Math.cos(car.S.yaw)); focusV.set(car.S.x, car.S.y, car.S.z);
  lighting.update(dt, focusV, fwdV);
  terrain.cull(car.S.x, car.S.z, weather.S.kind === 'fog' ? 500 : 1500);
  renderer.shadowMap.needsUpdate = true;
  renderer.info.reset();
  if (!game.debugCam) mirrors.render(camera);
  post.render(dt);
  hud.update(dt);
  hud.setClock(fmtClock(game.hour));
  const here = roads.surfaceAt(car.S.x, car.S.z);
  hud.setSpeed(car.S.speedMph, here.limitMph);
  hud.setStreet(here.name);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt * game.timeScale;
  let steps = 0;
  while (acc >= DT && steps < CONFIG.sim.maxStepsPerFrame) { simStep(DT); acc -= DT; steps++; }
  if (steps === CONFIG.sim.maxStepsPerFrame) acc = 0;
  render(dt);
  frames++; fpsT += dt; if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  if (document.getElementById('perf').style.display === 'block') {
    const S = car.S, E = S.engine, D = S.drive;
    hud.setPerf(`${fps.toFixed(0)} fps  calls ${renderer.info.render.calls}  tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k\n${S.speedMph.toFixed(1)} mph  ${E.rpm.toFixed(0)} rpm  gear ${car.drivetrain.gearLabel()} ${D.clutchState}  tc ${D.tc.toFixed(0)}\nwheel ${S.steerWheelDeg.toFixed(0)}°  ax ${S.axF.toFixed(2)} ay ${S.ayF.toFixed(2)}  slip ${S.wheels.map((w) => w.kf.toFixed(2)).join(' ')}\npos ${S.x.toFixed(1)} ${S.z.toFixed(1)}  yaw ${(S.yaw / DEG).toFixed(0)}°  ${sky.S.hour.toFixed(2)}h elev ${sky.S.sunElev.toFixed(0)}°`);
  }
}

window.addEventListener('resize', () => { renderer.setSize(VW(), VH()); camera.aspect = VW() / VH(); camera.updateProjectionMatrix(); post.setSize(VW(), VH()); });

// ---------------------------------------------------------------- boot
car.teleport(-38.25, 230, 0); // Ocean Ave, right-hand northbound lane, heading −z
game.hour = menu.opts.hour; sky.setHour(game.hour);
menu.setReady(true, '');
requestAnimationFrame(frame);

// ---------------------------------------------------------------- test hooks
window.__game = {
  THREE, scene, camera, renderer, game, car, input: input.I, rig, sky, lighting, world, roads, terrain, collide, roadMesh, controls, wipers, mirrors, vlights, nav, radio, weather, ocean, signals, props, town, driver, traffic, bot, audio, modes, router, rules, events, gamepad, save, menu, hud, gauges, interior, exterior,
  start, pause, resume,
  tick(n = 1, dt = DT) { for (let i = 0; i < n; i++) simStep(dt); render(dt * n); },
  teleport(x, z, yaw = 0) { car.teleport(x, z, yaw); syncVisuals(); },
  setTime(h) { game.hour = h; sky.setHour(h); },
  setWeather(kind, instant = true) { weather.set(kind, instant); },
  // free camera for inspecting the world from above: debugShot(x,y,z, tx,ty,tz [,fov]); debugShot(null) restores the rig
  debugShot(x, y, z, tx, ty, tz, fov = 60) { game.debugCam = x == null ? null : { x, y, z, tx, ty, tz, fov }; render(0.016); },
};
