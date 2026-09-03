// Traffic signal controllers: advance each signalised intersection's phase table, expose the state per
// approach group (NS / EW), and drive the emissive lamp materials on the signal heads.
import * as THREE from 'three';

export function createSignals(roads) {
  const list = roads.intersections.filter((i) => i.signal);
  for (const it of list) {
    const sg = it.signal;
    sg.total = sg.phases.reduce((a, p) => a + p.dur, 0);
    sg.state = { NS: 'red', EW: 'red' };
    // one material set per group: red / yellow / green lamps
    sg.mats = {};
    for (const grp of ['NS', 'EW']) {
      sg.mats[grp] = {
        red: new THREE.MeshStandardMaterial({ color: 0x3a0806, emissive: 0xff2a10, emissiveIntensity: 0, roughness: 0.4 }),
        yellow: new THREE.MeshStandardMaterial({ color: 0x3a2a06, emissive: 0xffb020, emissiveIntensity: 0, roughness: 0.4 }),
        green: new THREE.MeshStandardMaterial({ color: 0x063a12, emissive: 0x30ff60, emissiveIntensity: 0, roughness: 0.4 }),
      };
    }
  }
  function evaluate(it) {
    const sg = it.signal;
    let t = sg.t % sg.total;
    const st = { NS: 'red', EW: 'red' };
    for (const ph of sg.phases) {
      if (t < ph.dur) { if (ph.green) st[ph.green] = 'green'; if (ph.yellow) st[ph.yellow] = 'yellow'; break; }
      t -= ph.dur;
    }
    return st;
  }
  function update(dt) {
    for (const it of list) {
      const sg = it.signal;
      sg.t += dt;
      const st = evaluate(it);
      if (st.NS !== sg.state.NS || st.EW !== sg.state.EW) {
        sg.state = st;
        for (const grp of ['NS', 'EW']) for (const c of ['red', 'yellow', 'green']) sg.mats[grp][c].emissiveIntensity = st[grp] === c ? 3.0 : 0;
      }
    }
  }
  // state seen by traffic arriving on `approach` (group NS/EW): 'green' | 'yellow' | 'red' | null (uncontrolled)
  function stateFor(inter, approach) { return inter.signal ? inter.signal.state[approach.group] : null; }
  // initialise emissives
  for (const it of list) { const st = evaluate(it); it.signal.state = st; for (const grp of ['NS', 'EW']) for (const c of ['red', 'yellow', 'green']) it.signal.mats[grp][c].emissiveIntensity = st[grp] === c ? 3.0 : 0; }
  return { list, update, stateFor };
}
