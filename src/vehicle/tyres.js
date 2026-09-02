// Tyre model: Pacejka-lite longitudinal/lateral curves with a friction-circle clamp, slip relaxation,
// and a semi-implicit wheel-spin integrator that stays stable at 120 Hz even at walking pace.
import { clamp, sign } from '../units.js';

export function pacejka(x, p) {
  const Bx = p.B * x;
  return Math.sin(p.C * Math.atan(Bx - p.E * (Bx - Math.atan(Bx))));
}

// numerically locate the slip at which the curve peaks
export function peakSlip(p, maxX) {
  let best = 0, bv = -1;
  for (let i = 1; i <= 400; i++) { const x = (i / 400) * maxX; const v = pacejka(x, p); if (v > bv) { bv = v; best = x; } }
  return best;
}

export function createTyreModel(C) {
  const pl = C.pacLong, pt = C.pacLat;
  const kPeak = peakSlip(pl, 1.0);
  const aPeak = peakSlip(pt, 1.0);

  // w: { omega, r, J, Fz, mu, vwx, vwy, kf, af, Tdrive, Tbrake, handbrake, locked, Jextra, mShare }
  function stepWheel(w, dt) {
    const r = w.r, J = w.J + (w.Jextra || 0);
    const vRef = Math.max(Math.abs(w.vwx), 1.0);
    const kappaOld = (w.omega * r - w.vwx) / vRef;
    const K = w.Fz * w.mu * pl.B * pl.C; // slip stiffness (N per unit slip)
    let omega;
    const Tb = w.Tbrake;

    if (Math.abs(kappaOld) <= kPeak) {
      // implicit in the linear region: road torque = -K r (omega_new r - vwx)/vRef
      const denom = 1 + (dt * K * r * r) / (J * vRef);
      omega = (w.omega + (dt / J) * (w.Tdrive + (K * r * w.vwx) / vRef)) / denom;
      const kappaNew = (omega * r - w.vwx) / vRef;
      if (Math.abs(kappaNew) > kPeak * 1.5) {
        // breaks loose: fall back to an explicit step with the saturated force
        const Fx = w.Fz * w.mu * pacejka(kappaOld, pl);
        omega = w.omega + (dt / J) * (w.Tdrive - Fx * r);
      }
    } else {
      const Fx = w.Fz * w.mu * pacejka(kappaOld, pl);
      omega = w.omega + (dt / J) * (w.Tdrive - Fx * r);
    }
    // Coulomb brake: cannot reverse the wheel within a step
    if (Tb > 0) {
      const dOmega = (Tb / J) * dt;
      if (Math.abs(omega) <= dOmega) omega = 0;
      else omega -= sign(omega) * dOmega;
    }
    w.omega = omega;
    w.lockedWheel = Tb > 0 && omega === 0 && Math.abs(w.vwx) > 0.05;

    // slip quantities (relaxed) and forces for the body
    const kappa = (w.omega * r - w.vwx) / vRef;
    const alpha = Math.atan2(w.vwy, vRef);
    const rate = Math.min(1, (dt * Math.max(vRef, 5)) / C.relaxLength);
    w.kf += (kappa - w.kf) * rate;
    w.af += (alpha - w.af) * rate;
    w.kappa = kappa; w.alpha = alpha;

    const muFz = w.Fz * w.mu;
    let Fx, Fy;
    if (w.omega === 0 && Tb > 0) {
      // static friction while locked: hold the contact patch still, up to the friction limit
      Fx = clamp((-w.mShare * w.vwx) / dt, -muFz, muFz);
      w.kf *= 0.7;
    } else {
      Fx = muFz * pacejka(w.kf, pl);
    }
    Fy = -muFz * pacejka(w.af, pt);
    // friction circle
    const mag = Math.hypot(Fx, Fy);
    if (mag > muFz) { const s = muFz / mag; Fx *= s; Fy *= s; }
    // never reverse the sliding direction within one step (kills low-speed chatter)
    const fyMax = (w.mShare * Math.abs(w.vwy)) / dt + 30;
    if (Math.abs(Fy) > fyMax) Fy = sign(Fy) * fyMax;
    w.Fx = Fx; w.Fy = Fy;
    w.slipRatio = kappa; w.slipAngle = alpha;
    w.gripUse = mag / Math.max(1, muFz);
  }

  return { stepWheel, kPeak, aPeak, pacejka };
}
