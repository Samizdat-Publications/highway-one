// Gamepad API: Xbox-style standard mapping out of the box, generic wheel/pedal mapping with a calibration
// that records rest / min / max per function (pedal axes that rest at +1 are auto-inverted). Persisted by id.
import { clamp } from './units.js';

export function createGamepad(input, save) {
  const S = { connected: null, id: '', standard: false, map: null, calibrating: null, raw: null, lastButtons: [] };
  const DEADZONE = 0.06;
  const stored = save.get('gamepads', {});

  const defaultMap = () => ({ steer: { axis: 0, rest: 0, min: -1, max: 1 }, throttle: { axis: null, button: 7, rest: 0, min: 0, max: 1 }, brake: { axis: null, button: 6, rest: 0, min: 0, max: 1 }, clutch: { axis: null, button: null, rest: 0, min: 0, max: 1 }, lookX: { axis: 2 }, lookY: { axis: 3 } });
  const BTN = { 0: 'seatbelt', 1: 'hornDown', 2: 'wipers', 3: 'lights', 4: 'shiftDown', 5: 'shiftUp', 8: 'radio', 9: 'pause', 10: 'handbrakeToggle', 11: 'navZoom', 12: 'transmission', 13: 'domeLight', 14: 'signalL', 15: 'signalR' };

  function pick() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let best = null;
    for (const p of pads) if (p && p.connected) { if (!best || p.mapping === 'standard') best = p; }
    return best;
  }
  function axisValue(pad, m) {
    if (!m) return 0;
    if (m.axis != null && pad.axes[m.axis] != null) {
      const v = pad.axes[m.axis];
      const span = m.max - m.min; if (Math.abs(span) < 1e-3) return 0;
      let n = (v - m.min) / span; // 0..1 over the calibrated range
      if (m.invert) n = 1 - n;
      return clamp(n, 0, 1);
    }
    if (m.button != null && pad.buttons[m.button]) return pad.buttons[m.button].value;
    return 0;
  }
  function poll(dt) {
    const pad = pick();
    if (!pad) { if (S.connected) { S.connected = null; input.pad.active = false; } return; }
    if (!S.connected || S.id !== pad.id) {
      S.connected = pad; S.id = pad.id; S.standard = pad.mapping === 'standard';
      S.map = stored[pad.id] || defaultMap();
      if (!S.standard && !stored[pad.id]) { // wheel guess: steering axis 0, pedals on axes 1/2 resting at +1
        S.map.throttle = { axis: 1, rest: 1, min: 1, max: -1 }; S.map.brake = { axis: 2, rest: 1, min: 1, max: -1 }; S.map.clutch = { axis: 5, rest: 1, min: 1, max: -1 };
      }
      input.device = S.standard ? 'gamepad' : 'wheel';
    }
    S.raw = pad;
    const P = input.pad;
    P.active = true;
    // steering: −1..1 with deadzone for sticks, none for wheels
    const st = S.map.steer; const sv = pad.axes[st.axis] != null ? pad.axes[st.axis] : 0;
    const dz = S.standard ? DEADZONE : 0.01;
    P.steer = Math.abs(sv) < dz ? 0 : Math.sign(sv) * ((Math.abs(sv) - dz) / (1 - dz));
    if (S.standard) P.steer = Math.sign(P.steer) * Math.pow(Math.abs(P.steer), 1.4); // finer centre on sticks
    P.throttle = axisValue(pad, S.map.throttle); P.brake = axisValue(pad, S.map.brake); P.clutch = axisValue(pad, S.map.clutch);
    P.lookX = S.map.lookX && pad.axes[S.map.lookX.axis] != null && Math.abs(pad.axes[S.map.lookX.axis]) > DEADZONE ? pad.axes[S.map.lookX.axis] : 0;
    P.lookY = S.map.lookY && pad.axes[S.map.lookY.axis] != null && Math.abs(pad.axes[S.map.lookY.axis]) > DEADZONE ? pad.axes[S.map.lookY.axis] : 0;
    // buttons → edges
    P.buttons = {};
    for (let i = 0; i < pad.buttons.length; i++) {
      const down = pad.buttons[i].pressed, was = S.lastButtons[i] || false;
      if (down && !was && BTN[i]) P.buttons[BTN[i]] = true;
      S.lastButtons[i] = down;
    }
    P.handbrake = pad.buttons[10] && pad.buttons[10].pressed ? 1 : 0;
    P.hornHeld = pad.buttons[1] && pad.buttons[1].pressed;
    if (S.calibrating) calibrateStep(pad);
  }
  // ---- calibration: for each function, sample rest then min/max over 3 s of movement
  function startCalibration(onDone) { S.calibrating = { step: 'rest', t: 0, samples: {}, onDone }; }
  function calibrateStep(pad) {
    const c = S.calibrating; c.t += 1 / 60;
    const n = pad.axes.length;
    if (!c.rest) c.rest = pad.axes.slice();
    if (!c.min) { c.min = pad.axes.slice(); c.max = pad.axes.slice(); }
    for (let i = 0; i < n; i++) { c.min[i] = Math.min(c.min[i], pad.axes[i]); c.max[i] = Math.max(c.max[i], pad.axes[i]); }
    if (c.t > 8) {
      // axes that moved: largest span first → steer (bipolar), then throttle, brake, clutch
      const moved = []; for (let i = 0; i < n; i++) { const span = c.max[i] - c.min[i]; if (span > 0.4) moved.push({ i, span, rest: c.rest[i], min: c.min[i], max: c.max[i] }); }
      const bip = moved.filter((m) => Math.abs(m.rest) < 0.3).sort((a, b) => b.span - a.span);
      const uni = moved.filter((m) => Math.abs(m.rest) >= 0.3).sort((a, b) => a.i - b.i);
      const map = defaultMap();
      if (bip[0]) map.steer = { axis: bip[0].i, rest: bip[0].rest, min: bip[0].min, max: bip[0].max };
      const ped = (m) => (m ? { axis: m.i, rest: m.rest, min: m.rest, max: m.rest > 0 ? m.min : m.max } : { axis: null, button: null, rest: 0, min: 0, max: 1 });
      map.throttle = ped(uni[0]); map.brake = ped(uni[1]); map.clutch = ped(uni[2]);
      S.map = map; stored[S.id] = map; save.set('gamepads', stored);
      const done = c.onDone; S.calibrating = null; if (done) done(map);
    }
  }
  return { S, poll, startCalibration };
}
