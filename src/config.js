// Every tunable in one place. Units are SI unless the name says otherwise.
export const CONFIG = {
  sim: { hz: 120, maxStepsPerFrame: 8, aiDivider: 2 },

  car: {
    mass: 1400, wheelbase: 2.65, track: 1.55, cgHeight: 0.55, frontWeight: 0.60, yawInertia: 2300,
    length: 4.55, width: 1.82, height: 1.45,
    wheelRadius: 0.31, wheelInertia: 1.2, engineInertia: 0.18,
    drive: 'front',
    // engine
    idleRpm: 800, redlineRpm: 6500, limiterRpm: 6400, limiterCut: 0.1, stallRpm: 450,
    torqueCurve: [[0, 60], [800, 125], [1500, 165], [2500, 198], [3500, 214], [4500, 220], [5500, 210], [6000, 198], [6500, 172], [7000, 95]],
    frictionBase: 15, frictionPerRpm: 0.006,
    starterTorque: 60, starterTime: 0.8,
    // gearbox
    gears: [3.55, 2.02, 1.35, 1.00, 0.78], reverse: 3.30, finalDrive: 4.10, efficiency: 0.90, clutchCap: 300,
    autoShiftMinGap: 0.8, shiftCutTime: 0.08, shiftBlendTime: 0.15,
    // brakes
    brakeFront: 1500, brakeRear: 900, handbrake: 1200,
    absOn: -0.20, absOff: -0.08,
    // steering
    lockToLock: 900, steerRatio: 12.9, kbSteerRate: 500, kbReturnRate: 900,
    // aero / rolling
    dragCoef: 0.5 * 1.2 * 0.68, rollCoef: 0.013,
    // tyres
    pacLong: { B: 10, C: 1.9, E: 0.97 }, pacLat: { B: 8, C: 1.3, E: -1.5 },
    relaxLength: 0.3,
    mu: { asphalt: 1.0, wet: 0.7, sand: 0.55, grass: 0.6, dirt: 0.75, concrete: 0.95 },
    // visual suspension
    pitchPerG: 2.0, rollPerG: 4.0, pitchWn: 1.6, pitchZeta: 0.45, heaveWn: 1.3, heaveZeta: 0.30,
    tankHours: 5,
  },

  cockpit: {
    eye: { x: -0.37, y: 1.19, z: 0.40 },
    fov: 70, lookYawMax: 150, lookPitchMin: -40, lookPitchMax: 35,
    returnDelay: 0.6, returnWn: 1.2, returnZeta: 0.9,
    wheelHub: { x: -0.37, y: 0.90, z: -0.18 }, wheelTilt: 24, wheelRadius: 0.185,
  },

  world: { shorelineX: -112, seed: 0x48574f4e },

  lights: { poolSize: 6, pierPool: 4 },

  quality: {
    high: { shadow: 2048, mirrorEvery: 1, rain: 1200, pixelRatio: 1.5 },
    medium: { shadow: 1024, mirrorEvery: 2, rain: 600, pixelRatio: 1.25 },
    low: { shadow: 512, mirrorEvery: 4, rain: 250, pixelRatio: 1.0 },
  },
};
