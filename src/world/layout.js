// The map: Pelican Point grid, Ocean Ave, the pier lot, Pacific Coast Highway north along the cliffs
// (tunnel, canyon bridge, Canyon Rd switchbacks, overlook loop) and south to a beach lot.
// Coordinates: x east, −z north. Ocean is west of x ≈ −112. Town sits at y ≈ 2.

export const TOWN = {
  ewStreets: [[-175, 'Palm Ave'], [-105, 'Cabrillo St'], [-35, 'Main St'], [35, 'Seaview Ave'], [105, 'Pier Ave'], [175, 'Marina Way']],
  nsStreets: [[50, '1st St'], [140, '2nd St'], [230, '3rd St'], [320, '4th St'], [410, '5th St']],
  oceanAveX: -40, y: 2,
};

// PCH centreline north of town as [x, y, z] — also used by terrain for the cliff profile
export const PCH_NORTH = [
  [-40, 2, -260], [-45, 3, -330], [-60, 5, -400], [-72, 10, -500], [-70, 18, -600], [-58, 26, -700], [-52, 31, -800],
  [-60, 36, -880], [-66, 38, -960], [-70, 40, -1040], [-80, 42, -1160], [-84, 44, -1240], [-84, 44, -1370], [-76, 45, -1460],
  [-70, 45, -1560], [-84, 42, -1680], [-92, 41, -1780], [-84, 42, -1900], [-72, 41, -2000], [-62, 40, -2080], [-62, 40, -2200],
  [-70, 38, -2320], [-78, 36, -2440], [-80, 34, -2540],
];
export const PCH_SOUTH = [[-40, 2, 260], [-44, 2, 340], [-50, 2.5, 440], [-58, 3, 560], [-62, 3, 680], [-60, 3, 800]];
export const CANYON_RD = [
  [-58, 26, -700], [-20, 22, -722], [30, 26, -712], [70, 36, -690], [98, 50, -740], [70, 62, -790], [30, 72, -830],
  [60, 88, -890], [110, 102, -930], [90, 118, -990], [40, 128, -1030], [70, 142, -1090], [112, 150, -1150],
  [96, 146, -1240], [60, 132, -1330], [30, 116, -1440], [10, 100, -1560], [-6, 84, -1660], [-26, 66, -1760], [-52, 50, -1840], [-84, 42, -1900],
];

export function buildLayout(R) {
  const { ewStreets, nsStreets, oceanAveX, y } = TOWN;
  // ---- town nodes: Ocean Ave T's and the grid
  for (const [z, name] of ewStreets) {
    R.addNode(`O${z}`, oceanAveX, y, z);
    for (const [x] of nsStreets) R.addNode(`G${x}_${z}`, x, y, z);
  }
  // Ocean Ave (avenue, 2 lanes each way) from the south end to the north end, split at each E-W street
  const oceanZ = [260, ...ewStreets.map((e) => e[0]).sort((a, b) => b - a), -260];
  R.addNode('O260', oceanAveX, y, 260); R.addNode('O-260', oceanAveX, y, -260);
  for (let i = 0; i < oceanZ.length - 1; i++) {
    R.addSegment({ id: `ocean${i}`, a: `O${oceanZ[i]}`, b: `O${oceanZ[i + 1]}`, type: 'avenue', lanes: 2, limit: 35, sidewalk: true, name: 'Ocean Ave' });
  }
  // E-W streets from Ocean Ave east through the grid
  for (const [z, name] of ewStreets) {
    const xs = [oceanAveX, ...nsStreets.map((n) => n[0])];
    for (let i = 0; i < xs.length - 1; i++) {
      const a = i === 0 ? `O${z}` : `G${xs[i]}_${z}`, b = `G${xs[i + 1]}_${z}`;
      R.addSegment({ id: `ew${z}_${i}`, a, b, type: 'street', lanes: 1, limit: 25, sidewalk: true, parking: true, name });
    }
  }
  // N-S streets
  for (const [x, name] of nsStreets) {
    const zs = ewStreets.map((e) => e[0]);
    for (let i = 0; i < zs.length - 1; i++) {
      R.addSegment({ id: `ns${x}_${i}`, a: `G${x}_${zs[i]}`, b: `G${x}_${zs[i + 1]}`, type: 'street', lanes: 1, limit: 25, sidewalk: true, parking: true, name });
    }
  }
  // controls: signals on Ocean Ave at Main / Pier / Marina and along 2nd St; the rest 4-way stops
  for (const z of [-35, 105, 175]) R.setControl(`O${z}`, 'signal');
  for (const z of [-105, -175, 35]) R.setControl(`O${z}`, 'stop2');
  for (const [z] of ewStreets) R.setControl(`G140_${z}`, 'signal');
  R.setControl('G230_-35', 'signal'); R.setControl('G320_-35', 'signal');

  // ---- the pier: Pier Ave → ramp up to the deck → deck road along the pier → turnaround loop at the end
  const PZ = 108, DY = 5.0;
  R.addNode('pierIn', -60, y, 105); R.addNode('pierTop', -92, DY, PZ); R.addNode('pierEnd', -372, DY, PZ);
  R.addNode('pE1', -392, DY, PZ - 11); R.addNode('pE2', -404, DY, PZ + 1); R.addNode('pE3', -392, DY, PZ + 12);
  R.addSegment({ id: 'pier0', a: 'O105', b: 'pierIn', type: 'street', lanes: 1, limit: 15, sidewalk: true, name: 'Pier Ave' });
  R.addSegment({ id: 'pierRamp', a: 'pierIn', b: 'pierTop', type: 'lot', lanes: 1, limit: 10, name: 'Pier Ramp', ctrl: [[-72, y + 0.6, 106], [-84, DY - 0.6, 107.5]] });
  R.addSegment({ id: 'pierDeck', a: 'pierTop', b: 'pierEnd', type: 'pier', lanes: 1, limit: 10, name: 'Pelican Point Pier' });
  R.addSegment({ id: 'pierL1', a: 'pierEnd', b: 'pE1', type: 'pier', lanes: 1, limit: 10, name: 'Pier Turnaround', ctrl: [[-383, DY, PZ - 8]] });
  R.addSegment({ id: 'pierL2', a: 'pE1', b: 'pE2', type: 'pier', lanes: 1, limit: 10, name: 'Pier Turnaround', ctrl: [[-401, DY, PZ - 7]] });
  R.addSegment({ id: 'pierL3', a: 'pE2', b: 'pE3', type: 'pier', lanes: 1, limit: 10, name: 'Pier Turnaround', ctrl: [[-401, DY, PZ + 8]] });
  R.addSegment({ id: 'pierL4', a: 'pE3', b: 'pierEnd', type: 'pier', lanes: 1, limit: 10, name: 'Pier Turnaround', ctrl: [[-383, DY, PZ + 9]] });
  R.setControl('pierIn', 'stop2');
  // Main St beach access west of Ocean Ave (short stub to a lot loop)
  R.addNode('beachIn', -75, y, -35); R.addNode('beachA', -98, y - 0.3, -52); R.addNode('beachB', -98, y - 0.3, -18);
  R.addSegment({ id: 'beach0', a: 'O-35', b: 'beachIn', type: 'street', lanes: 1, limit: 15, sidewalk: true, name: 'Main St' });
  R.addSegment({ id: 'beach1', a: 'beachIn', b: 'beachA', type: 'lot', lanes: 1, limit: 15, name: 'Beach Lot', ctrl: [[-86, y - 0.1, -46]] });
  R.addSegment({ id: 'beach2', a: 'beachA', b: 'beachB', type: 'lot', lanes: 1, limit: 15, name: 'Beach Lot', ctrl: [[-110, y - 0.5, -35]] });
  R.addSegment({ id: 'beach3', a: 'beachB', b: 'beachIn', type: 'lot', lanes: 1, limit: 15, name: 'Beach Lot', ctrl: [[-86, y - 0.1, -24]] });
  R.setControl('beachIn', 'stop2');

  // ---- PCH north: split at the Canyon Rd junction (index 5) and the rejoin (index 17)
  const P = PCH_NORTH;
  R.addNode('pchJ1', ...P[5]); R.addNode('pchJ2', ...P[17]); R.addNode('pchEnd', ...P[P.length - 1]);
  const mkSeg = (id, aId, bId, pts, extra) => R.addSegment({ id, a: aId, b: bId, ctrl: pts.slice(1, -1), type: 'highway', lanes: 1, limit: 55, name: 'Pacific Coast Hwy', ...extra });
  mkSeg('pchN0', 'O-260', 'pchJ1', P.slice(0, 6), { rail: 'L' });
  // tunnel through the headland around z −900..−1000 and the canyon bridge around z −1260..−1370 live in this segment
  mkSeg('pchN1', 'pchJ1', 'pchJ2', P.slice(5, 18), { rail: 'L', tunnelZ: [-900, -1010], bridgeZ: [-1250, -1370] });
  mkSeg('pchN2', 'pchJ2', 'pchEnd', P.slice(17), { rail: 'L', tunnelZ: [-2100, -2190] });
  // overlook loop at the north end
  const e = P[P.length - 1];
  R.addNode('ovA', e[0] - 30, e[1] - 1, e[2] - 45); R.addNode('ovB', e[0] + 10, e[1] - 1, e[2] - 80);
  R.addSegment({ id: 'ov1', a: 'pchEnd', b: 'ovA', type: 'lot', lanes: 1, limit: 15, name: 'Overlook', ctrl: [[e[0] - 28, e[1] - 0.5, e[2] - 18]] });
  R.addSegment({ id: 'ov2', a: 'ovA', b: 'ovB', type: 'lot', lanes: 1, limit: 15, name: 'Overlook', ctrl: [[e[0] - 16, e[1] - 1.5, e[2] - 84]] });
  R.addSegment({ id: 'ov3', a: 'ovB', b: 'pchEnd', type: 'lot', lanes: 1, limit: 15, name: 'Overlook', ctrl: [[e[0] + 22, e[1] - 0.5, e[2] - 40]] });
  R.setControl('pchEnd', 'stop2');

  // ---- Canyon Rd (mountain pass)
  const C = CANYON_RD;
  R.addSegment({ id: 'canyon', a: 'pchJ1', b: 'pchJ2', ctrl: C.slice(1, -1), type: 'side', lanes: 1, limit: 35, name: 'Canyon Rd', laneW: 3.2, shoulder: 0.4 });
  R.setControl('pchJ1', 'stop2'); R.setControl('pchJ2', 'stop2');

  // ---- PCH south to a beach lot loop
  const S = PCH_SOUTH;
  R.addNode('pchSEnd', ...S[S.length - 1]);
  R.addSegment({ id: 'pchS0', a: 'O260', b: 'pchSEnd', ctrl: S.slice(1, -1), type: 'highway', lanes: 1, limit: 45, name: 'Pacific Coast Hwy' });
  const s = S[S.length - 1];
  R.addNode('sbA', s[0] - 28, s[1] - 0.5, s[2] + 40); R.addNode('sbB', s[0] + 14, s[1] - 0.5, s[2] + 75);
  R.addSegment({ id: 'sb1', a: 'pchSEnd', b: 'sbA', type: 'lot', lanes: 1, limit: 15, name: 'South Beach Lot', ctrl: [[s[0] - 26, s[1], s[2] + 16]] });
  R.addSegment({ id: 'sb2', a: 'sbA', b: 'sbB', type: 'lot', lanes: 1, limit: 15, name: 'South Beach Lot', ctrl: [[s[0] - 12, s[1] - 1, s[2] + 80]] });
  R.addSegment({ id: 'sb3', a: 'sbB', b: 'pchSEnd', type: 'lot', lanes: 1, limit: 15, name: 'South Beach Lot', ctrl: [[s[0] + 24, s[1], s[2] + 36]] });
  R.setControl('pchSEnd', 'stop2');

  R.build();
  // convert tunnel/bridge z-ranges into distances along the segment now that samples exist
  for (const seg of R.segments) {
    const toS = (zr) => { let s0 = 1e9, s1 = -1e9; for (const sm of seg.samples) { if (sm.p.z <= zr[0] && sm.p.z >= zr[1]) { s0 = Math.min(s0, sm.s); s1 = Math.max(s1, sm.s); } } return s0 < s1 ? [s0, s1] : null; };
    const o = seg; // options were spread onto the segment
    if (o.tunnelZ) seg.tunnel = toS(o.tunnelZ);
    if (o.bridgeZ) seg.bridge = toS(o.bridgeZ);
  }
}
