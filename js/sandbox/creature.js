'use strict';

/* ------------------------------------------------------------------ *
 * creature.js - the body. An upright biped: pelvis, chest, shoulders, *
 * neck and head, two three-segment legs with feet, and two arms.      *
 * 21 point masses, 25 bones, 6 braces and 25 contractile muscles,     *
 * integrated as a verlet ragdoll. Nothing holds him up: the knees are  *
 * free hinges, so balance is a thing the brain has to learn.           *
 *                                                                     *
 * No rendering lives here on purpose: the trainer runs whole episodes *
 * against this class without touching WebGL.                          *
 * ------------------------------------------------------------------ */

const CR = {
  DT: 1 / 120,
  GRAVITY: 9.81,
  DAMP: 0.9975,
  MAX_STEP: 0.1,
  CONTRACT: 0.42,
  TONE: 0.09,
  MUSCLE_PASSES: 1,
  /* the race: 100 m from the start line, ten seconds on the clock,
     Usain Bolt's 9.58 s world record to beat */
  TRACK: 100,
  LANE: 2.4,
  RACE: 10,
  BOLT: 9.58,
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
};

/* id, x, y, z, radius. +x is the creature's left, +z is forward. */
const BODY_POINTS = [
  ['pelvis', 0, 0.86, 0, 0.105],
  ['chest', 0, 1.06, 0.005, 0.115],
  ['shoulders', 0, 1.22, 0, 0.1],
  ['neck', 0, 1.31, 0.01, 0.055],
  ['head', 0, 1.45, 0.025, 0.145],

  ['shoulderL', 0.21, 1.19, 0, 0.06],
  ['elbowL', 0.245, 0.97, 0.02, 0.05],
  ['handL', 0.255, 0.76, 0.06, 0.06],

  ['shoulderR', -0.21, 1.19, 0, 0.06],
  ['elbowR', -0.245, 0.97, 0.02, 0.05],
  ['handR', -0.255, 0.76, 0.06, 0.06],

  /* a wide stance and long feet: an inverted pendulum needs a base of
     support to fall back onto, or no feedback law can hold it up */
  ['hipL', 0.15, 0.8, 0, 0.07],
  ['kneeL', 0.17, 0.45, 0.015, 0.065],
  ['ankleL', 0.185, 0.13, 0, 0.055],
  ['heelL', 0.185, 0.045, -0.15, 0.05],
  ['toeL', 0.185, 0.04, 0.24, 0.052],

  ['hipR', -0.15, 0.8, 0, 0.07],
  ['kneeR', -0.17, 0.45, 0.015, 0.065],
  ['ankleR', -0.185, 0.13, 0, 0.055],
  ['heelR', -0.185, 0.045, -0.15, 0.05],
  ['toeR', -0.185, 0.04, 0.24, 0.052],
];

/* a, b, group */
const BODY_BONES = [
  ['pelvis', 'chest', 'torso'],
  ['chest', 'shoulders', 'torso'],
  ['shoulders', 'neck', 'neck'],
  ['neck', 'head', 'neck'],

  ['shoulders', 'shoulderL', 'arm'],
  ['shoulderL', 'elbowL', 'arm'],
  ['elbowL', 'handL', 'arm'],

  ['shoulders', 'shoulderR', 'arm'],
  ['shoulderR', 'elbowR', 'arm'],
  ['elbowR', 'handR', 'arm'],

  ['pelvis', 'hipL', 'leg'],
  ['hipL', 'kneeL', 'leg'],
  ['kneeL', 'ankleL', 'leg'],
  ['ankleL', 'heelL', 'leg'],
  ['ankleL', 'toeL', 'leg'],

  ['pelvis', 'hipR', 'leg'],
  ['hipR', 'kneeR', 'leg'],
  ['kneeR', 'ankleR', 'leg'],
  ['ankleR', 'heelR', 'leg'],
  ['ankleR', 'toeR', 'leg'],

  ['heelL', 'toeL', 'leg'],
  ['heelR', 'toeR', 'leg'],

  ['pelvis', 'neck', 'torso'],
  ['chest', 'head', 'neck'],
  ['shoulderL', 'shoulderR', 'torso'],
];

/* cross braces: a stiff spine is cheaper to control than a noodle */
const BODY_BRACES = [
  ['pelvis', 'shoulders'],
  ['chest', 'neck'],
  ['pelvis', 'head'],
  ['hipL', 'hipR'],
  ['shoulderL', 'hipL'],
  ['shoulderR', 'hipR'],
];

/* id, a, b, stiffness, min length as a fraction of rest.

   There is no brace holding the leg straight any more. The knee is a free
   hinge and the only thing that can extend it is the knee strut, so a body
   that switches its muscles off folds onto the floor. Standing up, staying up
   and then sprinting are all learned. */
const BODY_MUSCLES = [
  /* left leg: the bones hold it straight, these swing it at the hip */
  ['hipFlexL', 'pelvis', 'kneeL', 0.9],
  ['hipExtL', 'chest', 'kneeL', 0.85],
  ['toeLiftL', 'pelvis', 'toeL', 0.75],
  ['toeDropL', 'chest', 'toeL', 0.7],
  ['kneeL', 'hipL', 'ankleL', 0.95],

  /* right leg */
  ['hipFlexR', 'pelvis', 'kneeR', 0.9],
  ['hipExtR', 'chest', 'kneeR', 0.85],
  ['toeLiftR', 'pelvis', 'toeR', 0.75],
  ['toeDropR', 'chest', 'toeR', 0.7],
  ['kneeR', 'hipR', 'ankleR', 0.95],

  /* left arm */
  ['armSwingL', 'chest', 'elbowL', 0.8],
  ['armBackL', 'pelvis', 'elbowL', 0.7],
  ['elbowL', 'shoulders', 'handL', 0.75],
  ['wristL', 'elbowL', 'handL', 0.7],

  /* right arm */
  ['armSwingR', 'chest', 'elbowR', 0.8],
  ['armBackR', 'pelvis', 'elbowR', 0.7],
  ['elbowR', 'shoulders', 'handR', 0.75],
  ['wristR', 'elbowR', 'handR', 0.7],

  /* torso and head */
  ['belly', 'pelvis', 'chest', 0.9],
  ['lean', 'pelvis', 'shoulders', 0.9],
  ['sideBend', 'hipL', 'shoulderR', 0.7],
  ['neckLift', 'chest', 'neck', 0.85],
  ['headPitch', 'shoulders', 'head', 0.75],
  ['headTurn', 'shoulderL', 'head', 0.6],
  ['headTilt', 'shoulderR', 'head', 0.6],
];

const SENSOR_COUNT = 30;
const MUSCLE_COUNT = BODY_MUSCLES.length;

const SB = {
  clamp: CR.clamp,
  lerp: (a, b, t) => a + (b - a) * t,
  TAU: Math.PI * 2,
  /* deterministic rng so every candidate of a generation faces the same goal */
  rng: function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  gauss: function (rnd) {
    let u = 0;
    let v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  },
};

class Creature {
  constructor() {
    this.points = BODY_POINTS.map(([id, x, y, z, r]) => {
      const foot = id.indexOf('toe') === 0 || id.indexOf('heel') === 0 || id.indexOf('ankle') === 0;
      return {
        id, rx: x, ry: y, rz: z, r,
        x, y, z, px: x, py: y, pz: z,
        foot, friction: foot ? 0.9 : 0.18,
      };
    });
    this.index = {};
    this.points.forEach((p, i) => { this.index[p.id] = i; });

    this.bones = [];
    for (const [a, b, g] of BODY_BONES) this.bones.push(this.link(a, b, 1, g));
    for (const [a, b] of BODY_BRACES) this.bones.push(this.link(a, b, 0.6, 'brace'));

    this.muscles = BODY_MUSCLES.map(([id, a, b, k, minK]) => {
      const m = this.link(a, b, k, 'muscle');
      m.id = id;
      m.rest = m.len;
      m.minK = minK === undefined ? 0.5 : minK;
      return m;
    });

    this.act = new Float32Array(MUSCLE_COUNT);
    this.sensors = new Float32Array(SENSOR_COUNT);
    this.contacts = [false, false];
    this.time = 0;

    const d = (a, b) => {
      const A = this.points[this.index[a]];
      const B = this.points[this.index[b]];
      const dx = B.rx - A.rx;
      const dy = B.ry - A.ry;
      const dz = B.rz - A.rz;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    };
    this.restLimb = { L: d('hipL', 'ankleL'), R: d('hipR', 'ankleR') };
    this.legs = [
      { k: 'L', hip: 'hipL', knee: 'kneeL', ankle: 'ankleL', heel: 'heelL', toe: 'toeL' },
      { k: 'R', hip: 'hipR', knee: 'kneeR', ankle: 'ankleR', heel: 'heelR', toe: 'toeR' },
    ];
    this.restArm = { L: d('shoulderL', 'handL'), R: d('shoulderR', 'handR') };
    this.arms = [
      { k: 'L', shoulder: 'shoulderL', elbow: 'elbowL', hand: 'handL' },
      { k: 'R', shoulder: 'shoulderR', elbow: 'elbowR', hand: 'handR' },
    ];
    this.restHeight = this.points[this.index.pelvis].ry;
  }

  link(a, b, stiff, group) {
    const ai = this.index[a];
    const bi = this.index[b];
    const A = this.points[ai];
    const B = this.points[bi];
    const dx = B.rx - A.rx;
    const dy = B.ry - A.ry;
    const dz = B.rz - A.rz;
    return { a: ai, b: bi, len: Math.sqrt(dx * dx + dy * dy + dz * dz), stiff, group };
  }

  reset(offsets) {
    const pts = this.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      p.x = p.rx + (offsets ? offsets[i * 3] : 0);
      p.y = p.ry + (offsets ? offsets[i * 3 + 1] : 0);
      p.z = p.rz + (offsets ? offsets[i * 3 + 2] : 0);
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
    }
    this.act.fill(0);
    this.time = 0;
    for (let i = 0; i < this.contacts.length; i++) this.contacts[i] = false;
  }

  /* one fixed timestep */
  step() {
    const dt = CR.DT;
    const g = -CR.GRAVITY * dt * dt;
    const pts = this.points;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let vx = (p.x - p.px) * CR.DAMP;
      let vy = (p.y - p.py) * CR.DAMP;
      let vz = (p.z - p.pz) * CR.DAMP;
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (sp > CR.MAX_STEP) {
        const k = CR.MAX_STEP / sp;
        vx *= k;
        vy *= k;
        vz *= k;
      }
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      p.x += vx;
      p.y += vy + g;
      p.z += vz;
    }

    this.solveBones();
    this.solveBones();
    for (let i = 0; i < CR.MUSCLE_PASSES; i++) this.solveMuscles();
    this.solveBones();
    this.collide();
    this.time += dt;
  }

  solveBones() {
    const pts = this.points;
    const bones = this.bones;
    for (let i = 0; i < bones.length; i++) {
      const c = bones[i];
      const A = pts[c.a];
      const B = pts[c.b];
      let dx = B.x - A.x;
      let dy = B.y - A.y;
      let dz = B.z - A.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const k = ((d - c.len) / d) * 0.5 * c.stiff;
      dx *= k;
      dy *= k;
      dz *= k;
      A.x += dx;
      A.y += dy;
      A.z += dz;
      B.x -= dx;
      B.y -= dy;
      B.z -= dz;
    }
  }

  solveMuscles() {
    const pts = this.points;
    const muscles = this.muscles;
    for (let i = 0; i < muscles.length; i++) {
      const m = muscles[i];
      /* resting muscle tone: anatomy, not knowledge. Without it the skeleton
         folds flat the instant gravity arrives. */
      const a = this.act[i] + CR.TONE;
      let target = m.rest * (1 - CR.CONTRACT * a);
      if (target < m.rest * m.minK) target = m.rest * m.minK;
      if (target > m.rest * 1.3) target = m.rest * 1.3;

      const A = pts[m.a];
      const B = pts[m.b];
      let dx = B.x - A.x;
      let dy = B.y - A.y;
      let dz = B.z - A.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const k = ((d - target) / d) * 0.5 * m.stiff;
      dx *= k;
      dy *= k;
      dz *= k;
      A.x += dx;
      A.y += dy;
      A.z += dz;
      B.x -= dx;
      B.y -= dy;
      B.z -= dz;
    }
  }

  collide() {
    const pts = this.points;
    /* an open lane, not a ring: nothing to bounce off except the lane edges */
    const half = CR.LANE - 0.15;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.y < p.r) {
        p.y = p.r;
        const f = p.friction;
        p.x -= (p.x - p.px) * f;
        p.z -= (p.z - p.pz) * f;
        /* inelastic: kill the upward velocity as well, otherwise a stiff
           muscle pressing into the floor turns it into a trampoline and the
           body can be launched metres into the air */
        p.py = p.y;
      }
      if (p.x > half) {
        p.x = half;
        p.x -= (p.x - p.px) * 0.3;
      } else if (p.x < -half) {
        p.x = -half;
        p.x -= (p.x - p.px) * 0.3;
      }
      if (p.z < -3) {
        p.z = -3;
        p.z -= (p.z - p.pz) * 0.3;
      }
    }
    for (let l = 0; l < this.legs.length; l++) {
      const leg = this.legs[l];
      const heel = pts[this.index[leg.heel]];
      const toe = pts[this.index[leg.toe]];
      this.contacts[l] = heel.y < 0.09 && toe.y < 0.1;
    }
  }

  drive(out) {
    const n = Math.min(this.act.length, out.length);
    for (let i = 0; i < n; i++) {
      const v = out[i];
      this.act[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
  }

  pelvis() { return this.points[this.index.pelvis]; }

  pelvisY() { return this.pelvis().y; }

  headY() { return this.points[this.index.head].y; }

  pelvisSpeed() {
    const p = this.pelvis();
    const dx = p.x - p.px;
    const dy = p.y - p.py;
    const dz = p.z - p.pz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) / CR.DT;
  }

  distanceTo(x, z) {
    const p = this.pelvis();
    const dx = p.x - x;
    const dz = p.z - z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /* torso axis: from the pelvis up to the shoulders */
  torso() {
    const pts = this.points;
    const a = pts[this.index.shoulders];
    const b = pts[this.index.pelvis];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return { x: dx / d, y: dy / d, z: dz / d };
  }

  /* how far the torso leans off vertical: 0 is bolt upright */
  pitch() {
    return 1 - this.torso().y;
  }

  /* forward direction on the floor, from the pelvis/head axis and the hips */
  forward() {
    const pts = this.points;
    const a = pts[this.index.hipL];
    const b = pts[this.index.hipR];
    let lx = a.x - b.x;
    let lz = a.z - b.z;
    const ll = Math.sqrt(lx * lx + lz * lz) || 1;
    lx /= ll;
    lz /= ll;
    /* forward is the left axis turned a quarter turn on the floor, so that
       f points at the toes: at rest, left is +x and forward is +z */
    return { x: -lz, z: lx };
  }

  heading() {
    const f = this.forward();
    return Math.atan2(f.x, f.z);
  }

  upY() {
    const u = this.torso().y;
    return u > 1 ? 1 : u < -1 ? -1 : u;
  }

  energy() {
    let e = 0;
    for (let i = 0; i < this.act.length; i++) e += Math.abs(this.act[i]);
    return e / this.act.length;
  }

  /* 30 floats describing the body and the goal, all roughly [-1, 1] */
  sense(tx, tz) {
    const s = this.sensors;
    const pts = this.points;
    const I = this.index;
    const dt = CR.DT;

    const P = pts[I.pelvis];
    const H = pts[I.head];
    const N = pts[I.neck];
    const t = this.torso();
    const f = this.forward();

    const pvx = (P.x - P.px) / dt;
    const pvy = (P.y - P.py) / dt;
    const pvz = (P.z - P.pz) / dt;

    s[0] = (P.y - this.restHeight) * 2.4;
    s[1] = pvy * 6;
    s[2] = pvz * 3;
    s[3] = pvx * 3;
    s[4] = (1 - t.y) * 3;
    s[5] = f.x;
    s[6] = f.z;
    s[7] = H.y - 1.45;
    s[8] = (H.z - N.z) * 3;

    let o = 9;
    for (let l = 0; l < this.legs.length; l++) {
      const leg = this.legs[l];
      const hip = pts[I[leg.hip]];
      const ankle = pts[I[leg.ankle]];
      const dx = ankle.x - hip.x;
      const dy = ankle.y - hip.y;
      const dz = ankle.z - hip.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      s[o++] = (d / this.restLimb[leg.k] - 1) * 2.5;
      s[o++] = ankle.y * 3;
      s[o++] = this.contacts[l] ? 1 : 0;
    }

    for (let a = 0; a < this.arms.length; a++) {
      const arm = this.arms[a];
      const shoulder = pts[I[arm.shoulder]];
      const hand = pts[I[arm.hand]];
      const dx = hand.x - shoulder.x;
      const dy = hand.y - shoulder.y;
      const dz = hand.z - shoulder.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      s[o++] = (d / this.restArm[arm.k] - 1) * 2;
      s[o++] = (hand.z - shoulder.z) * 4;
    }

    s[o++] = (H.y - N.y) * 3;
    s[o++] = (H.x - N.x) * 3;

    const dx = tx - P.x;
    const dz = tz - P.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const along = dist > 1e-4 ? (dx * f.x + dz * f.z) / dist : 1;
    const side = dist > 1e-4 ? (dx * -f.z + dz * f.x) / dist : 0;
    s[o++] = side;
    s[o++] = along;
    s[o++] = Math.min(dist / 30, 3.4);
    s[o++] = t.x * 2;

    s[o++] = Math.sin(this.time * 1.2);
    s[o++] = Math.cos(this.time * 1.2);
    s[o++] = Math.sin(this.time * 0.45);
    s[o++] = Math.cos(this.time * 0.45);
    s[o++] = 0;

    for (let i = 0; i < SENSOR_COUNT; i++) {
      const v = s[i];
      s[i] = v !== v ? 0 : v > 4 ? 4 : v < -4 ? -4 : v;
    }
    return s;
  }
}
