'use strict';

/* ------------------------------------------------------------------ *
 * brain.js - a blank recurrent policy and the evolution strategy that *
 * writes into it. No pretrained weights, no heuristics: the policy is *
 * random noise until episodes tell us which noise was less bad.       *
 * ------------------------------------------------------------------ */

const BRAIN = {
  HIDDEN1: 20,
  HIDDEN2: 20,
  REC: 20,
  POP: 24,
  SIGMA: 0.1,
  LR: 0.025,
  STEPS: 1200,
  CONTROL_EVERY: 3,
  EVAL_MS: 7,
};

/* ------------------------------------------------------------------ *
 * The reward system. One episode pays out six named parts and their   *
 * sum is the return evolution ranks a candidate by. Nothing here is a *
 * script: the creature is never told to stand, it is only ever paid.  *
 * Metres count only while the torso is upright, so crawling to the    *
 * line earns nothing, and the finish pays a bonus for the clock left. *
 * ------------------------------------------------------------------ */
const REWARD = {
  PROGRESS: 5.0,      // per metre gained in the right direction
  STAY_FLOOR: 0.2,    // that much of the progress is paid whatever happens next
  STAY_GAIN: 0.8,     // the rest scales with how long he stays on his feet
  STAND: 20.0,        // per episode: standing tall, hips out of a crouch
  UPRIGHT: 1.0,       // per episode: torso kept near vertical
  SURVIVE: 2.0,       // per episode: lasting the full ten seconds
  EFFORT: 0.02,       // charged per episode for muscle effort spent
  FINISH: 40.0,       // crossing the line at all
  FINISH_TIME: 25.0,  // times the fraction of the ten seconds still left
  DOWN: 60,           // steps flat on the floor before the episode ends
};

class Reward {
  constructor() {
    this.parts = {};
    this.reset();
  }

  reset() {
    this.parts = { progress: 0, stand: 0, upright: 0, survive: 0, effort: 0, finish: 0 };
    this.total = 0;
    this.steps = 0;
    this.low = 0;
    this.fell = false;
    this.finished = false;
    this.timeLeft = 0;
  }

  /* one physics step: the only place the creature ever earns anything */
  step(c, gained, up) {
    this.steps++;
    const share = 1 / BRAIN.STEPS;

    /* forward progress, but only on two feet: the torso has to be within
       about forty degrees of vertical and the hips up out of a crouch, and
       the pay is discounted by how early in the episode it arrived, so a
       lunge that ends in a faceplant is never worth a stride */
    if (gained > 0 && up > 0.8 && c.pelvisY() > 0.6) {
      const stay = REWARD.STAY_FLOOR + REWARD.STAY_GAIN * (this.steps / BRAIN.STEPS);
      const pay = REWARD.PROGRESS * gained * stay;
      this.parts.progress += pay;
      this.total += pay;
    }

    const tall = Math.max(0, Math.min(1, (c.pelvisY() - 0.55) / 0.3));
    const stand = REWARD.STAND * tall * share;
    const posture = REWARD.UPRIGHT * Math.max(0, up) * share;
    const survive = REWARD.SURVIVE * share;
    const effort = -REWARD.EFFORT * c.energy() * share;
    this.parts.stand += stand;
    this.parts.upright += posture;
    this.parts.survive += survive;
    this.parts.effort += effort;
    this.total += stand + posture + survive + effort;

    /* half a second on the floor ends the episode: standing up is the first
       thing to learn, but a single stumbled frame is not a fall */
    if (c.headY() < 0.34 || c.pelvisY() < 0.3) {
      this.low++;
      if (this.low > REWARD.DOWN) this.fell = true;
    } else {
      this.low = 0;
    }
    return this.total;
  }

  /* the line: the only reward that cares how fast he got there */
  finish(timeLeft) {
    this.finished = true;
    this.timeLeft = Math.max(0, Math.min(1, timeLeft));
    const pay = REWARD.FINISH + REWARD.FINISH_TIME * this.timeLeft;
    this.parts.finish += pay;
    this.total += pay;
    return this.total;
  }
}

class Brain {
  constructor(inDim, h1, h2, outDim) {
    this.sizes = [inDim, h1, h2, outDim];
    this.offsets = [];
    let total = 0;
    for (let l = 0; l < 3; l++) {
      this.offsets.push(total);
      total += this.sizes[l + 1] * this.sizes[l] + this.sizes[l + 1];
    }
    this.offsets.push(total);
    this.paramCount = total;

    this.rec = BRAIN.REC;
    this.w = new Float32Array(total);
    this.inp = new Float32Array(inDim);
    this.h1 = new Float32Array(h1);
    this.h2 = new Float32Array(h2);
    this.h2prev = new Float32Array(h2);
    this.out = new Float32Array(outDim);
    this.randomize(SB.rng(1));
  }

  randomize(rnd) {
    const sz = this.sizes;
    const w = this.w;
    for (let l = 0; l < 3; l++) {
      const fanIn = sz[l];
      const fanOut = sz[l + 1];
      const scale = 0.85 / Math.sqrt(fanIn);
      const base = this.offsets[l];
      const nW = fanIn * fanOut;
      for (let i = 0; i < nW; i++) w[base + i] = SB.gauss(rnd) * scale;
      for (let i = 0; i < fanOut; i++) w[base + nW + i] = 0;
    }
  }

  setWeights(src) {
    this.w.set(src);
  }

  reset() {
    this.h2prev.fill(0);
  }

  forward(sensors) {
    const [I, H1, H2, O] = this.sizes;
    const w = this.w;
    const inp = this.inp;
    const h1 = this.h1;
    const h2 = this.h2;
    const out = this.out;

    const rec = this.rec;
    for (let i = 0; i < I - rec; i++) inp[i] = sensors[i];
    for (let i = 0; i < rec; i++) inp[I - rec + i] = this.h2prev[i];

    let base = this.offsets[0];
    for (let h = 0; h < H1; h++) {
      let sum = w[base + I * H1 + h];
      const row = base + h * I;
      for (let i = 0; i < I; i++) sum += w[row + i] * inp[i];
      h1[h] = Math.tanh(sum);
    }

    base = this.offsets[1];
    const b2 = base + H1 * H2;
    for (let h = 0; h < H2; h++) {
      let sum = w[b2 + h];
      const row = base + h * H1;
      for (let i = 0; i < H1; i++) sum += w[row + i] * h1[i];
      h2[h] = Math.tanh(sum);
    }

    base = this.offsets[2];
    const b3 = base + H2 * O;
    for (let o = 0; o < O; o++) {
      let sum = w[b3 + o];
      const row = base + o * H2;
      for (let i = 0; i < H2; i++) sum += w[row + i] * h2[i];
      out[o] = Math.tanh(sum);
    }

    this.h2prev.set(h2);
    return out;
  }
}

class Evolution {
  constructor() {
    const sizes = [SENSOR_COUNT + BRAIN.REC, BRAIN.HIDDEN1, BRAIN.HIDDEN2, MUSCLE_COUNT];
    this.sizes = sizes;
    this.brain = new Brain(sizes[0], sizes[1], sizes[2], sizes[3]);
    this.creature = new Creature();

    this.theta = this.brain.w.slice();
    this.bestTheta = this.theta.slice();
    this.bestFit = -Infinity;
    this.policyVersion = 0;

    this.m = new Float32Array(this.brain.paramCount);
    this.v = new Float32Array(this.brain.paramCount);
    this.adamT = 0;

    this.generation = 0;
    this.episodes = 0;
    this.curve = [];
    this.eps = [];
    this.candidates = [];
    this.cursor = 0;
    this.cfg = null;
    this.genClock = 0;

    this.lastMeans = { best: 0, mean: 0 };
  }

  startGeneration() {
    this.generation++;
    const rnd = SB.rng(this.generation * 7919 + 13);

    /* one finishing line and one starting wobble shared by the whole
       generation, so the scores of the candidates are actually comparable.
       The line is 100 m up the lane: this is a sprint, not a wander. */
    const cfg = {
      tx: (rnd() * 2 - 1) * 1.0,
      tz: CR.TRACK,
      offsets: new Float32Array(this.creature.points.length * 3),
    };
    for (let i = 0; i < cfg.offsets.length; i++) cfg.offsets[i] = (rnd() * 2 - 1) * 0.014;
    this.cfg = cfg;

    const P = this.brain.paramCount;
    const pairs = BRAIN.POP / 2;
    this.eps = [];
    for (let p = 0; p < pairs; p++) {
      const e = new Float32Array(P);
      for (let j = 0; j < P; j++) e[j] = SB.gauss(rnd);
      this.eps.push(e);
    }

    this.candidates = [];
    for (let i = 0; i < BRAIN.POP; i++) {
      const pair = i >> 1;
      const sign = i % 2 === 0 ? 1 : -1;
      const w = new Float32Array(P);
      const e = this.eps[pair];
      for (let j = 0; j < P; j++) w[j] = this.theta[j] + sign * BRAIN.SIGMA * e[j];
      this.candidates.push({ w, sign, pair, fit: 0 });
    }
    this.cursor = 0;
  }

  /* spread the generation over frames so the sandbox never stutters */
  advance(dt, interval) {
    this.genClock += dt;
    if (!this.candidates.length) {
      if (this.genClock < interval) return;
      this.genClock = 0;
      this.startGeneration();
    }
    const t0 = performance.now();
    while (this.cursor < this.candidates.length) {
      const cand = this.candidates[this.cursor];
      cand.fit = this.evaluate(cand.w);
      this.cursor++;
      this.episodes++;
      if (performance.now() - t0 > BRAIN.EVAL_MS) break;
    }
    if (this.cursor >= this.candidates.length) this.finishGeneration();
  }

  evaluate(weights) {
    const c = this.creature;
    const cfg = this.cfg;
    c.reset(cfg.offsets);
    this.brain.setWeights(weights);
    this.brain.reset();

    if (!this.reward) this.reward = new Reward();
    const rw = this.reward;
    rw.reset();

    let prevDist = c.distanceTo(cfg.tx, cfg.tz);

    for (let s = 0; s < BRAIN.STEPS; s++) {
      if (s % BRAIN.CONTROL_EVERY === 0) {
        const sens = c.sense(cfg.tx, cfg.tz);
        c.drive(this.brain.forward(sens));
      }
      c.step();

      const d = c.distanceTo(cfg.tx, cfg.tz);
      rw.step(c, prevDist - d, c.upY());
      prevDist = d;

      if (c.pelvis().z >= CR.TRACK) {
        rw.finish(1 - rw.steps / BRAIN.STEPS);
        break;
      }
      if (rw.fell) break;
    }

    /* what this candidate was actually paid, kept so the trainer and the page
       can show where an episode's points came from */
    this.lastReward = {
      total: rw.total,
      parts: { progress: rw.parts.progress, stand: rw.parts.stand, upright: rw.parts.upright,
        survive: rw.parts.survive, effort: rw.parts.effort, finish: rw.parts.finish },
      finished: rw.finished,
      steps: rw.steps,
    };
    return rw.total;
  }

  finishGeneration() {
    const cands = this.candidates;
    const n = cands.length;
    const P = this.brain.paramCount;

    const order = cands.map((c, i) => i).sort((a, b) => cands[a].fit - cands[b].fit);
    const rank = new Float32Array(n);
    for (let i = 0; i < n; i++) rank[order[i]] = i / (n - 1) - 0.5;

    const grad = new Float32Array(P);
    for (let i = 0; i < n; i++) {
      const c = cands[i];
      const e = this.eps[c.pair];
      const r = rank[i] * c.sign;
      for (let j = 0; j < P; j++) grad[j] += r * e[j];
    }
    const scale = 1 / (n * BRAIN.SIGMA);
    for (let j = 0; j < P; j++) grad[j] *= scale;

    this.adamT++;
    const b1 = 0.9;
    const b2 = 0.999;
    const c1 = 1 - Math.pow(b1, this.adamT);
    const c2 = 1 - Math.pow(b2, this.adamT);
    for (let j = 0; j < P; j++) {
      this.m[j] = b1 * this.m[j] + (1 - b1) * grad[j];
      this.v[j] = b2 * this.v[j] + (1 - b2) * grad[j] * grad[j];
      const mh = this.m[j] / c1;
      const vh = this.v[j] / c2;
      this.theta[j] += (BRAIN.LR * mh) / (Math.sqrt(vh) + 1e-8);
    }

    let best = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += cands[i].fit;
      if (cands[i].fit > cands[best].fit) best = i;
    }
    this.lastMeans.best = cands[best].fit;
    this.lastMeans.mean = sum / n;

    if (cands[best].fit > this.bestFit) {
      this.bestFit = cands[best].fit;
      this.bestTheta = cands[best].w.slice();
      this.policyVersion++;
    }

    this.curve.push({ best: this.lastMeans.best, mean: this.lastMeans.mean, top: this.bestFit });
    if (this.curve.length > 240) this.curve.shift();
    /* keep a coarse history for the published page: one point per 100 gens */
    if (this.generation === 1 || this.generation % 100 === 0) {
      if (!this.history) this.history = [];
      this.history.push([this.generation, Number(this.bestFit.toFixed(2)), Number(this.lastMeans.mean.toFixed(2))]);
    }

    this.candidates = [];
    this.cursor = 0;
  }

  reset() {
    const rnd = SB.rng((Math.random() * 1e9) | 0);
    this.theta = new Float32Array(this.brain.paramCount);
    for (let l = 0; l < 3; l++) {
      const fanIn = this.sizes[l];
      const fanOut = this.sizes[l + 1];
      const scale = 0.85 / Math.sqrt(fanIn);
      const base = this.brain.offsets[l];
      const nW = fanIn * fanOut;
      for (let i = 0; i < nW; i++) this.theta[base + i] = SB.gauss(rnd) * scale;
    }
    this.bestTheta = this.theta.slice();
    this.bestFit = -Infinity;
    this.policyVersion++;
    this.m.fill(0);
    this.v.fill(0);
    this.adamT = 0;
    this.generation = 0;
    this.episodes = 0;
    this.curve = [];
    this.candidates = [];
    this.cursor = 0;
    this.genClock = 0;
    this.lastMeans.best = 0;
    this.lastMeans.mean = 0;
  }
}
