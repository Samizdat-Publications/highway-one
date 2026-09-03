// Keyboard + mouse (+ gamepad, merged in by gamepad.js) → one normalized input object `I`.
// Analog channels are 0..1 (steer −1..1, left negative). `edge.*` fields are true for exactly
// one sim step after the key/button went down. `override` (from tests) wins over everything.
import { clamp, moveToward } from './units.js';
import { CONFIG } from './config.js';

export function createInput(canvas, hooks = {}) {
  const keys = new Set();
  const pressed = new Set(); // keys that went down since the last step (edge)
  const I = {
    throttle: 0, brake: 0, clutch: 0, steer: 0, handbrake: 0,
    // steering wheel target in degrees from the keyboard (integrated), analog devices set steerAnalog −1..1
    steerAnalog: null,
    lookDX: 0, lookDY: 0, quickLook: 0, // quickLook: -1 left, 1 right, 2 rear
    edge: {},
    enabled: false,
    override: null,
    device: 'keyboard',
    sens: 1,
    locked: false, lockDenied: false, dragging: false,
  };
  const EDGE_KEYS = {
    ShiftLeft: 'shiftUp', ShiftRight: 'shiftUp', ControlLeft: 'shiftDown', ControlRight: 'shiftDown',
    KeyQ: 'signalL', KeyE: 'signalR', KeyZ: 'hazards', KeyL: 'lights', KeyX: 'wipers', KeyT: 'transmission',
    KeyR: 'radio', KeyI: 'ignition', KeyB: 'seatbelt', KeyN: 'navZoom', KeyF: 'domeLight', KeyH: 'hornDown',
    Digit1: 'gear1', Digit2: 'gear2', Digit3: 'gear3', Digit4: 'gear4', Digit5: 'gear5', Digit6: 'gearR', Digit0: 'gearN',
    F3: 'perf', Escape: 'pause', KeyP: 'pause', KeyM: 'mode', Backspace: 'reset', KeyK: 'keys',
  };
  const ALWAYS = new Set(['F3', 'Escape', 'KeyP']);

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (!I.enabled && !ALWAYS.has(e.code)) return;
    keys.add(e.code); pressed.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3', 'Backspace'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape' && hooks.onEscape) hooks.onEscape();
    if (e.code === 'F3' && hooks.onPerf) hooks.onPerf();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); });

  // ---- mouse look: pointer lock when available, click-drag fallback (the preview pane refuses lock)
  let accDX = 0, accDY = 0, dragX = 0, dragY = 0, ignoreFirst = false;
  canvas.addEventListener('mousedown', (e) => {
    if (!I.enabled) return;
    if (!I.locked && !I.lockDenied) requestLock();
    if (!I.locked) { I.dragging = true; dragX = e.clientX; dragY = e.clientY; }
  });
  window.addEventListener('mouseup', () => { I.dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!I.enabled) return;
    if (I.locked) {
      if (ignoreFirst) { ignoreFirst = false; return; }
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      accDX += e.movementX; accDY += e.movementY;
    } else if (I.dragging) {
      accDX += e.clientX - dragX; accDY += e.clientY - dragY; dragX = e.clientX; dragY = e.clientY;
    }
  });
  function requestLock() {
    if (!canvas.requestPointerLock) { I.lockDenied = true; return; }
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { I.lockDenied = true; hooks.onLockDenied && hooks.onLockDenied(); });
    } catch (e) { I.lockDenied = true; hooks.onLockDenied && hooks.onLockDenied(); }
  }
  document.addEventListener('pointerlockchange', () => {
    I.locked = document.pointerLockElement === canvas; ignoreFirst = I.locked;
    hooks.onLockChange && hooks.onLockChange(I.locked);
  });
  document.addEventListener('pointerlockerror', () => { I.lockDenied = true; hooks.onLockDenied && hooks.onLockDenied(); });

  // ---- external analog source (gamepad.js writes here each frame)
  const pad = { active: false, throttle: 0, brake: 0, clutch: 0, steer: 0, handbrake: 0, lookX: 0, lookY: 0, buttons: {} };

  const kb = { steerDeg: 0 }; // keyboard steering wheel angle, integrated
  const C = CONFIG.car;

  // Called once per sim step. `speed` (m/s) scales the keyboard steering authority.
  function step(dt, speed) {
    const has = (c) => keys.has(c);
    const E = {};
    for (const code of pressed) { const n = EDGE_KEYS[code]; if (n) E[n] = true; }
    pressed.clear();
    I.edge = E;
    I.hornHeld = has('KeyH');

    let throttle = (has('KeyW') || has('ArrowUp')) ? 1 : 0;
    let brake = (has('KeyS') || has('ArrowDown')) ? 1 : 0;
    let clutch = has('KeyC') ? 1 : 0;
    let handbrake = has('Space') ? 1 : 0;
    const kbSteer = (has('KeyA') || has('ArrowLeft') ? -1 : 0) + (has('KeyD') || has('ArrowRight') ? 1 : 0);

    // Keyboard steering: integrate toward a speed-scaled max angle, spring back when released.
    const maxDeg = (C.lockToLock / 2) * clamp(1 - speed / 50, 0.12, 1);
    const rate = C.kbSteerRate * (0.22 + 0.78 * clamp(1 - speed / 30, 0, 1));
    if (kbSteer !== 0) kb.steerDeg = moveToward(kb.steerDeg, kbSteer * maxDeg, rate * dt);
    else kb.steerDeg = moveToward(kb.steerDeg, 0, C.kbReturnRate * dt * Math.min(1, 0.35 + speed / 8));
    let steerDeg = kb.steerDeg;
    I.steerAnalog = null;

    if (pad.active) {
      throttle = Math.max(throttle, pad.throttle); brake = Math.max(brake, pad.brake); clutch = Math.max(clutch, pad.clutch);
      handbrake = Math.max(handbrake, pad.handbrake);
      if (Math.abs(pad.steer) > 0.001 || kbSteer === 0) { steerDeg = pad.steer * (C.lockToLock / 2); I.steerAnalog = pad.steer; kb.steerDeg = 0; }
      for (const k in pad.buttons) if (pad.buttons[k]) E[k] = true;
      accDX += pad.lookX * 22 * dt * 60; accDY += pad.lookY * 22 * dt * 60;
    }

    I.throttle = throttle; I.brake = brake; I.clutch = clutch; I.handbrake = handbrake; I.steerDeg = steerDeg;
    I.lookDX = accDX * I.sens; I.lookDY = accDY * I.sens; accDX = 0; accDY = 0;
    I.quickLook = has('Comma') ? -1 : has('Period') ? 1 : has('Slash') ? 2 : 0;

    if (I.override) {
      const o = I.override;
      for (const k of ['throttle', 'brake', 'clutch', 'handbrake', 'quickLook']) if (o[k] != null) I[k] = o[k];
      if (o.steer != null) { I.steerDeg = o.steer * (C.lockToLock / 2); I.steerAnalog = o.steer; }
      if (o.steerDeg != null) I.steerDeg = o.steerDeg;
      if (o.edge) { Object.assign(I.edge, o.edge); o.edge = null; }
    }
    return I;
  }

  return { I, pad, keys, step, requestLock, exitLock() { if (document.pointerLockElement) document.exitPointerLock(); } };
}
