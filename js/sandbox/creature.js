'use strict';

/* ------------------------------------------------------------------ *
 * creature.js - the body. Four legs with a five joint chain each, a    *
 * spine, neck and tail: 29 point masses, 39 bones and 25 contractile   *
 * muscles, integrated as a verlet ragdoll.                             *
 *                                                                      *
 * No rendering lives here on purpose: the trainer runs whole episodes   *
 * against this class without touching WebGL.                            *
 * ------------------------------------------------------------------ */

const CR = {
  DT: 1 / 120,
  GRAVITY: 9.81,
  DAMP: 0.9975,
  MAX_STEP: 0.2,
  CONTRACT: 0.42,
  TONE: 0.05,
  MUSCLE_PASSES: 1,
  ARENA: 5.2,
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
};

/* id, x, y, z, radius. +x is the creature's left, +z is forward. */
const BODY_POINTS = [
  ['withers', 0, 0.7, 0.4, 0.1],
  ['chest', 0, 0.64, 0.18, 0.11],
  ['spine', 0, 0.62, -0.06, 0.11],
  ['hip', 0, 0.64, -0.3, 0.1],
  ['rump', 0, 0.6, -0.48, 0.09],

  ['neck', 0, 0.78, 0.58, 0.07],
  ['head', 0, 0.84, 0.76, 0.13],

  ['tail1', 0, 0.62, -0.62, 0.05],
  ['tail2', 0, 0.54, -0.84, 0.04],

  ['hipFL', 0.2, 0.58, 0.34, 0.075],
  ['kneeFL', 0.21, 0.34, 0.22, 0.07],
  ['ankleFL', 0.21, 0.14, 0.32, 0.06],
  ['heelFL', 0.21, 0.045, 0.27, 0.05],
  ['toeFL', 0.21, 0.04, 0.44, 0.05],

  ['hipFR', -0.2, 0.58, 0.34, 0.075],
  ['kneeFR', -0.21, 0.34, 0.22, 0.07],
  ['ankleFR', -0.21, 0.14, 0.32, 0.06],
  ['heelFR', -0.21, 0.045, 0.27, 0.05],
  ['toeFR', -0.21, 0.04, 0.44, 0.05],

  ['hipBL', 0.2, 0.58, -0.26, 0.075],
  ['kneeBL', 0.21, 0.35, -0.38, 0.07],
  ['ankleBL', 0.21, 0.14, -0.28, 0.06],
  ['heelBL', 0.21, 0.045, -0.34, 0.05],
  ['toeBL', 0.21, 0.04, -0.5, 0.05],

  ['hipBR', -0.2, 0.58, -0.26, 0.075],
  ['kneeBR', -0.21, 0.35, -0.38, 0.07],
  ['ankleBR', -0.21, 0.14, -0.28, 0.06],
  ['heelBR', -0.21, 0.045, -0.34, 0.05],
  ['toeBR', -0.21, 0.04, -0.5, 0.05],
];

/* a, b, group */
const BODY_BONES = [
  ['withers', 'chest', 'torso'],
  ['chest', 'spine', 'torso'],
  ['spine', 'hip', 'torso'],
  ['hip', 'rump', 'torso'],

  ['withers', 'neck', 'neck'],
  ['neck', 'head', 'neck'],

  ['rump', 'tail1', 'tail'],
  ['tail1', 'tail2', 'tail'],

  ['withers', 'hipFL', 'leg'],
  ['hipFL', 'kneeFL', 'leg'],
  ['kneeFL', 'ankleFL', 'leg'],
  ['ankleFL', 'heelFL', 'leg'],
  ['ankleFL', 'toeFL', 'leg'],

  ['withers', 'hipFR', 'leg'],
  ['hipFR', 'kneeFR', 'leg'],
  ['kneeFR', 'ankleFR', 'leg'],
  ['ankleFR', 'heelFR', 'leg'],
  ['ankleFR', 'toeFR', 'leg'],

  ['hip', 'hipBL', 'leg'],
  ['hipBL', 'kneeBL', 'leg'],
  ['kneeBL', 'ankleBL', 'leg'],
  ['ankleBL', 'heelBL', 'leg'],
  ['ankleBL', 'toeBL', 'leg'],

  ['hip', 'hipBR', 'leg'],
  ['hipBR', 'kneeBR', 'leg'],
  ['kneeBR', 'ankleBR', 'leg'],
  ['ankleBR', 'heelBR', 'leg'],
  ['ankleBR', 'toeBR', 'leg'],
];

/* cross braces: a stiff spine is cheaper to control than a noodle */
const BODY_BRACES = [
  ['withers', 'spine'],
  ['chest', 'hip'],
  ['withers', 'hip'],
  ['chest', 'rump'],
  ['withers', 'head'],
  ['hipFL', 'hipFR'],
  ['hipBL', 'hipBR'],
  /* spreader bars: without them the legs splay and the body pancakes */
  ['kneeFL', 'kneeFR'],
  ['kneeBL', 'kneeBR'],
  ['ankleFL', 'ankleFR'],
  ['ankleBL', 'ankleBR'],
];

/* id, a, b, stiffness, min length as a fraction of rest.

   Each leg is a braced triangle: the lift muscle runs shoulder-to-ankle over
   the knee (a telescoping strut), the fwd/back muscles pin the toe fore and
   aft of it, and the ankle muscle sets the hoof angle. A triangle cannot
   buckle, so the body stands without any control at all. */
const BODY_MUSCLES = [
  ['fLiftL', 'withers', 'ankleFL', 1, 0.8],
  ['fForwardL', 'withers', 'toeFL', 0.85],
  ['fBackL', 'chest', 'toeFL', 0.85],
  ['fAnkleL', 'kneeFL', 'heelFL', 0.8],

  ['fLiftR', 'withers', 'ankleFR', 1, 0.8],
  ['fForwardR', 'withers', 'toeFR', 0.85],
  ['fBackR', 'chest', 'toeFR', 0.85],
  ['fAnkleR', 'kneeFR', 'heelFR', 0.8],

  ['bLiftL', 'hip', 'ankleBL', 1, 0.8],
  ['bForwardL', 'spine', 'toeBL', 0.85],
  ['bBackL', 'rump', 'toeBL', 0.85],
  ['bAnkleL', 'kneeBL', 'heelBL', 0.8],

  ['bLiftR', 'hip', 'ankleBR', 1, 0.8],
  ['bForwardR', 'spine', 'toeBR', 0.85],
  ['bBackR', 'rump', 'toeBR', 0.85],
  ['bAnkleR', 'kneeBR', 'heelBR', 0.8],

  ['arch', 'withers', 'hip', 0.9],
  ['neckLift', 'chest', 'neck', 0.8],
  ['headPitch', 'withers', 'head', 0.7],
  ['headL', 'hipFL', 'head', 0.6],
  ['headR', 'hipFR', 'head', 0.6],
  ['bendL', 'hipFL', 'rump', 0.7],
  ['bendR', 'hipFR', 'rump', 0.7],

  ['tailCurl', 'rump', 'tail2', 0.7],
  ['tailLift', 'hip', 'tail2', 0.6],
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
        foot, friction: foot ? 0.72 : 0.18,
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
    this.contacts = [false, false, false, false];
    this.time = 0;

    const d = (a, b) => {
      const A = this.points[this.index[a]];
      const B = this.points[this.index[b]];
      const dx = B.rx - A.rx;
      const dy = B.ry - A.ry;
      const dz = B.rz - A.rz;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    };
    this.restLimb = {
      FL: d('hipFL', 'ankleFL'),
      FR: d('hipFR', 'ankleFR'),
      BL: d('hipBL', 'ankleBL'),
      BR: d('hipBR', 'ankleBR'),
    };
    this.legs = [
      { k: 'FL', hip: 'hipFL', ankle: 'ankleFL', heel: 'heelFL', toe: 'toeFL' },
      { k: 'FR', hip: 'hipFR', ankle: 'ankleFR', heel: 'heelFR', toe: 'toeFR' },
      { k: 'BL', hip: 'hipBL', ankle: 'ankleBL', heel: 'heelBL', toe: 'toeBL' },
      { k: 'BR', hip: 'hipBR', ankle: 'ankleBR', heel: 'heelBR', toe: 'toeBR' },
    ];
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
    for (let i = 0; i < 4; i++) this.contacts[i] = false;
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
    const arena = CR.ARENA;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.y < p.r) {
        p.y = p.r;
        const f = p.friction;
        p.x -= (p.x - p.px) * f;
        p.z -= (p.z - p.pz) * f;
      }
      const rad = Math.sqrt(p.x * p.x + p.z * p.z);
      const lim = arena - p.r;
      if (rad > lim) {
        const k = lim / rad;
        p.x *= k;
        p.z *= k;
        p.x -= (p.x - p.px) * 0.4;
        p.z -= (p.z - p.pz) * 0.4;
      }
    }
    for (let l = 0; l < 4; l++) {
      const leg = this.legs[l];
      const heel = pts[this.index[leg.heel]];
      const toe = pts[this.index[leg.toe]];
      this.contacts[l] = heel.y < 0.1 && toe.y < 0.1;
    }
  }

  drive(out) {
    const n = Math.min(this.act.length, out.length);
    for (let i = 0; i < n; i++) {
      const v = out[i];
      this.act[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
  }

  pelvis() { return this.points[this.index.spine]; }

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

  /* torso pitch relative to level: 0 when the back is horizontal */
  pitch() {
    const pts = this.points;
    const a = pts[this.index.withers];
    const b = pts[this.index.rump];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return dy / d;
  }

  heading() {
    const pts = this.points;
    const a = pts[this.index.withers];
    const b = pts[this.index.rump];
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.atan2(dx, dz);
  }

  upY() {
    return Math.max(-1, Math.min(1, 1 - Math.abs(this.pitch()) * 2));
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

    const P = pts[I.spine];
    const W = pts[I.withers];
    const R = pts[I.rump];

    const pvx = (P.x - P.px) / dt;
    const pvy = (P.y - P.py) / dt;
    const pvz = (P.z - P.pz) / dt;

    let fdx = W.x - R.x;
    let fdz = W.z - R.z;
    const fl = Math.sqrt(fdx * fdx + fdz * fdz) || 1;
    fdx /= fl;
    fdz /= fl;

    const head = pts[I.head];
    const neck = pts[I.neck];

    s[0] = P.y;
    s[1] = pvy * 6;
    s[2] = pvz * 3;
    s[3] = pvx * 3;
    s[4] = this.pitch() * 3;
    s[5] = fdx;
    s[6] = (pts[I.hipFL].y - pts[I.hipFR].y) * 4;
    s[7] = head.y;
    s[8] = (pts[I.tail2].y - 0.54) * 3;

    let o = 9;
    for (let l = 0; l < 4; l++) {
      const leg = this.legs[l];
      const hip = pts[I[leg.hip]];
      const ankle = pts[I[leg.ankle]];
      const dx = ankle.x - hip.x;
      const dy = ankle.y - hip.y;
      const dz = ankle.z - hip.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      s[o++] = (d / this.restLimb[leg.k] - 1) * 2.5;
      s[o++] = ankle.y * 4;
      s[o++] = this.contacts[l] ? 1 : 0;
    }

    s[21] = (head.z - neck.z) * 4;
    s[22] = (head.y - neck.y) * 4;

    const dx = tx - P.x;
    const dz = tz - P.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const along = dist > 1e-4 ? (dx * fdx + dz * fdz) / dist : 1;
    const side = dist > 1e-4 ? (dx * -fdz + dz * fdx) / dist : 0;
    s[23] = side;
    s[24] = along;
    s[25] = Math.min(dist / 4, 1.4);

    s[26] = Math.sin(this.time * 1.2);
    s[27] = Math.cos(this.time * 1.2);
    s[28] = Math.sin(this.time * 0.45);
    s[29] = Math.cos(this.time * 0.45);

    for (let i = 0; i < SENSOR_COUNT; i++) {
      const v = s[i];
      s[i] = v !== v ? 0 : v > 4 ? 4 : v < -4 ? -4 : v;
    }
    return s;
  }
}
