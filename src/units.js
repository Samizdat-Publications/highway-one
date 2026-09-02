// Unit conversions and small math helpers shared by every module.
export const MPS_TO_MPH = 2.2369363;
export const MPH_TO_MPS = 1 / MPS_TO_MPH;
export const M_TO_MI = 1 / 1609.344;
export const RPM_TO_RAD = Math.PI / 30;    // rpm → rad/s
export const RAD_TO_RPM = 30 / Math.PI;
export const DEG = Math.PI / 180;
export const G = 9.81;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp01((v - a) / (b - a));
export const remap = (v, a, b, c, d) => c + (d - c) * invLerp(a, b, v);
export const smoothstep = (a, b, v) => { const t = invLerp(a, b, v); return t * t * (3 - 2 * t); };
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const wrapAngle = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
// Frame-rate independent exponential approach: moves `a` toward `b` with time constant 1/lambda.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const moveToward = (a, b, maxDelta) => (Math.abs(b - a) <= maxDelta ? b : a + sign(b - a) * maxDelta);

// Second-order spring (mass-spring-damper) integrated semi-implicitly. `s` = { x, v }.
export function spring2(s, target, wn, zeta, dt) {
  const acc = wn * wn * (target - s.x) - 2 * zeta * wn * s.v;
  s.v += acc * dt;
  s.x += s.v * dt;
  return s.x;
}

// Piecewise-linear lookup over [[x, y], ...] sorted by x; clamps at the ends.
export function curve(points) {
  return (x) => {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (x <= points[i][0]) {
        const [x0, y0] = points[i - 1], [x1, y1] = points[i];
        return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
      }
    }
    return points[points.length - 1][1];
  };
}

export const fmtTime = (s) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`;
};
export const fmtClock = (hour) => {
  const h = ((Math.floor(hour) % 24) + 24) % 24, m = Math.floor((hour % 1) * 60);
  const ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m < 10 ? '0' : ''}${m} ${ap}`;
};
export const fmtDist = (m) => (m < 300 ? `${Math.round(m * 3.28084 / 10) * 10} ft` : `${(m * M_TO_MI).toFixed(1)} mi`);
