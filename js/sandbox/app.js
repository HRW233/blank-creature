'use strict';

/* ------------------------------------------------------------------ *
 * app.js - glue: run the trained actor in real time, optionally train *
 * a local fork, and draw the telemetry and the live network.          *
 * ------------------------------------------------------------------ */

(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('scene');

  const SPEEDS = { slow: 1.0, normal: 0.3, fast: 0.1 };
  const SPEED_ORDER = ['slow', 'normal', 'fast'];

  const MUSCLE_GROUPS = [
    { name: 'FRONT L', from: 0, to: 4 },
    { name: 'FRONT R', from: 4, to: 8 },
    { name: 'BACK L', from: 8, to: 12 },
    { name: 'BACK R', from: 12, to: 16 },
    { name: 'SPINE', from: 16, to: 23 },
    { name: 'TAIL', from: 23, to: 25 },
  ];

  const state = {
    paused: false,
    training: false,
    speed: 'normal',
    attempts: 1,
    downTime: 0,
    attemptTime: 0,
    accum: 0,
    tick: 0,
    policyVersion: -1,
    edgeVersion: -1,
    target: { x: 0, z: 2.6 },
    hudClock: 0,
    vizClock: 0,
  };

  let world = null;
  let view = null;
  let creature = null;
  let evo = null;
  let brain = null;
  let edges = [];
  let bars = [];
  let lastTime = 0;

  function boot() {
    try {
      world = new SandboxWorld(canvas);
    } catch (err) {
      const fatal = $('fatal');
      fatal.hidden = false;
      fatal.textContent = 'WebGL could not start: ' + (err && err.message ? err.message : err);
      return;
    }

    creature = new Creature();
    evo = new Evolution();
    brain = new Brain(SENSOR_COUNT + BRAIN.REC, BRAIN.HIDDEN1, BRAIN.HIDDEN2, MUSCLE_COUNT);
    loadSharedPolicy();
    view = new CreatureView(creature, world.scene);
    world.setTarget(state.target.x, state.target.z);

    buildBars();
    bindUI();
    bindPointer();
    respawn(true);
    setNote('shared · ' + POLICY.trained + ' gens');

    lastTime = performance.now();
    requestAnimationFrame(frame);
    window.addEventListener('resize', () => world.resize());
  }

  /* the baked champion from policy.js: every visitor runs these weights, so
     the link shows one shared creature instead of a private training run */
  function loadSharedPolicy() {
    evo.theta = Float32Array.from(POLICY.weights);
    evo.bestTheta = evo.theta.slice();
    evo.bestFit = POLICY.fitness;
    evo.generation = POLICY.trained;
    evo.episodes = POLICY.trained * BRAIN.POP;
    /* the offline run's history, so the curve shows what was actually learned */
    evo.curve = POLICY.curve
      ? POLICY.curve.map((c) => ({ gen: c[0], best: c[1], top: c[1], mean: c[2] }))
      : [];
    evo.policyVersion++;
    brain.setWeights(evo.bestTheta);
    state.policyVersion = evo.policyVersion;
    state.edgeVersion = -1;
  }

  function buildBars() {
    const host = $('bars');
    host.innerHTML = '';
    bars = MUSCLE_GROUPS.map((g) => {
      const row = document.createElement('div');
      row.className = 'bar';
      const label = document.createElement('span');
      label.textContent = g.name;
      const track = document.createElement('i');
      const fill = document.createElement('b');
      track.appendChild(fill);
      row.appendChild(label);
      row.appendChild(track);
      host.appendChild(row);
      return { fill, group: g };
    });
  }

  function respawn(initial) {
    const attempt = initial ? 1 : state.attempts + 1;
    /* fixed seed per attempt: two people watching the link see the same run */
    const rnd = SB.rng(0x9e3779b9 ^ (attempt * 2654435761));
    const offsets = new Float32Array(creature.points.length * 3);
    for (let i = 0; i < offsets.length; i++) offsets[i] = (rnd() * 2 - 1) * 0.012;
    creature.reset(offsets);
    brain.reset();
    state.downTime = 0;
    state.attemptTime = 0;
    state.accum = 0;
    state.attempts = attempt;
    if (world) world.clearTrail();
  }

  function resetToShared() {
    evo = new Evolution();
    loadSharedPolicy();
    respawn(true);
    setNote('shared · ' + POLICY.trained + ' gens');
  }

  function setNote(text) {
    const el = $('mind-note');
    if (el) el.textContent = text;
  }

  function flashHud() {
    const el = $('mind');
    if (!el) return;
    el.classList.remove('flash');
    /* force the animation to restart */
    void el.offsetWidth;
    el.classList.add('flash');
  }

  function stepActor(dt) {
    const STEP = CR.DT;
    state.accum += Math.min(dt, 0.05);
    let guard = 0;
    while (state.accum >= STEP && guard < 12) {
      if (state.tick % BRAIN.CONTROL_EVERY === 0) {
        const s = creature.sense(state.target.x, state.target.z);
        const out = brain.forward(s);
        creature.drive(out);
      }
      creature.step();
      state.accum -= STEP;
      state.attemptTime += STEP;
      state.tick++;
      guard++;
    }

    /* no walls around the stage: start the attempt again if it wanders off it */
    const pel = creature.pelvis();
    if (Math.sqrt(pel.x * pel.x + pel.z * pel.z) > CR.ARENA - 0.45) {
      respawn(false);
      return;
    }

    if (creature.headY() < 0.3 || creature.pelvisY() < 0.16) state.downTime += dt;
    else state.downTime = 0;

    if (state.downTime > 1.25 || state.attemptTime > 16) respawn(false);
    world.addTrailPoint(creature.pelvis().x, creature.pelvis().z, dt);
  }

  function frame(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;

    if (evo.policyVersion !== state.policyVersion) {
      state.policyVersion = evo.policyVersion;
      brain.setWeights(evo.bestTheta);
      world.flash();
      flashHud();
      setNote('policy ' + evo.policyVersion);
    }

    if (!state.paused) {
      if (state.training) evo.advance(dt, SPEEDS[state.speed]);
      stepActor(dt);
      world.animate(dt, now / 1000);
    }

    view.update();
    world.updateCamera(dt, creature.pelvis().x, creature.pelvis().y, creature.pelvis().z);
    world.render();

    state.hudClock += dt;
    if (state.hudClock > 0.08) {
      state.hudClock = 0;
      drawTelemetry();
      drawCurve();
    }
    state.vizClock += dt;
    if (state.vizClock > 0.055) {
      state.vizClock = 0;
      drawBrain();
    }
    requestAnimationFrame(frame);
  }

  function drawTelemetry() {
    const p = creature.pelvis();
    const dist = creature.distanceTo(state.target.x, state.target.z);
    const up = Math.max(0, creature.upY());
    const speed = creature.pelvisSpeed();

    $('stat-gen').textContent = evo.generation;
    $('stat-ep').textContent = evo.episodes;
    $('stat-best').textContent = evo.bestFit === -Infinity ? '—' : evo.bestFit.toFixed(2);
    $('stat-up').textContent = Math.round(up * 100) + '%';
    $('stat-range').textContent = dist.toFixed(2) + ' m';
    $('stat-attempts').textContent = state.attempts;
    $('stat-state').textContent = state.paused ? 'PAUSED'
      : state.downTime > 0.2 ? 'FALLING'
        : dist < 0.6 ? 'AT GOAL'
          : speed > 0.35 ? 'SEEKING' : 'HOLDING';

    const prog = evo.candidates.length ? evo.cursor / evo.candidates.length : 0;
    $('gen-bar').style.width = Math.round(prog * 100) + '%';

    for (const b of bars) {
      let sum = 0;
      const n = b.group.to - b.group.from;
      for (let i = b.group.from; i < b.group.to; i++) sum += Math.abs(creature.act[i]);
      b.fill.style.width = Math.round((sum / n) * 100) + '%';
    }

    $('stat-pos').textContent = p.x.toFixed(1) + ', ' + p.z.toFixed(1);
  }

  function fitCanvas(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w || !h) return null;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function drawCurve() {
    const c = fitCanvas($('curve'));
    if (!c) return;
    const { ctx, w, h } = c;
    const data = evo.curve;

    ctx.strokeStyle = 'rgba(0,245,212,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      const y = (h / 4) * i;
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();

    if (data.length < 2) {
      ctx.fillStyle = '#4d6b7a';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('collecting episodes…', 4, h / 2 + 3);
      return;
    }

    let lo = Infinity;
    let hi = -Infinity;
    for (const d of data) {
      if (d.best < lo) lo = d.best;
      if (d.best > hi) hi = d.best;
      if (d.top < lo) lo = d.top;
      if (d.top > hi) hi = d.top;
    }
    if (hi - lo < 1) { hi = lo + 1; }
    const x = (i) => (i / (data.length - 1)) * (w - 2) + 1;
    const y = (v) => h - 3 - ((v - lo) / (hi - lo)) * (h - 8);

    const line = (key, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      data.forEach((d, i) => {
        if (i === 0) ctx.moveTo(x(i), y(d[key]));
        else ctx.lineTo(x(i), y(d[key]));
      });
      ctx.stroke();
    };

    line('mean', 'rgba(120,160,180,0.4)', 1);
    line('best', 'rgba(0,245,212,0.55)', 1);
    line('top', 'rgba(255,183,3,0.95)', 1.6);

    ctx.fillStyle = 'rgba(255,183,3,0.8)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(hi.toFixed(1), 3, 9);
  }

  function buildEdges() {
    edges = [];
    const w = brain.w;
    const sizes = brain.sizes;
    const offs = brain.offsets;
    for (let l = 0; l < 3; l++) {
      const fanIn = sizes[l];
      const fanOut = sizes[l + 1];
      const base = offs[l];
      const list = [];
      const nW = fanIn * fanOut;
      for (let k = 0; k < nW; k++) {
        const v = w[base + k];
        if (Math.abs(v) < 0.14) continue;
        list.push({ i: k % fanIn, o: (k / fanIn) | 0, w: v });
      }
      list.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
      for (let i = 0; i < Math.min(44, list.length); i++) {
        edges.push({ l, i: list[i].i, o: list[i].o, w: list[i].w });
      }
    }
  }

  function drawBrain() {
    if (state.edgeVersion !== state.policyVersion) {
      state.edgeVersion = state.policyVersion;
      buildEdges();
    }
    const c = fitCanvas($('brain'));
    if (!c) return;
    const { ctx, w, h } = c;
    const cols = [
      { n: brain.sizes[0], x: w * 0.17, act: brain.inp, r: 1.7 },
      { n: brain.sizes[1], x: w * 0.44, act: brain.h1, r: 2.3 },
      { n: brain.sizes[2], x: w * 0.68, act: brain.h2, r: 2.3 },
      { n: brain.sizes[3], x: w * 0.93, act: brain.out, r: 2.1 },
    ];
    const top = 26;
    const bottom = h - 16;
    for (const col of cols) {
      const span = bottom - top;
      col.ys = [];
      for (let i = 0; i < col.n; i++) {
        col.ys.push(col.n === 1 ? (top + bottom) / 2 : top + (i / (col.n - 1)) * span);
      }
    }

    /* edges first: alpha follows how much signal is moving through them */
    for (const e of edges) {
      const a = cols[e.l];
      const b = cols[e.l + 1];
      const aa = Math.abs(a.act[e.i] || 0);
      const bb = Math.abs(b.act[e.o] || 0);
      const alpha = Math.min(0.85, 0.04 + Math.abs(e.w) * 0.5 * (0.3 + aa) * (0.3 + bb));
      ctx.strokeStyle = e.w >= 0
        ? 'rgba(0,245,212,' + alpha.toFixed(3) + ')'
        : 'rgba(255,46,136,' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(a.x, a.ys[e.i]);
      ctx.lineTo(b.x, b.ys[e.o]);
      ctx.stroke();
    }

    for (let li = 0; li < cols.length; li++) {
      const col = cols[li];
      for (let i = 0; i < col.n; i++) {
        const a = Math.abs(col.act[i] || 0);
        const lit = 0.18 + a * 0.82;
        if (li === 3) {
          ctx.fillStyle = col.act[i] >= 0
            ? 'rgba(255,183,3,' + lit.toFixed(3) + ')'
            : 'rgba(255,46,136,' + lit.toFixed(3) + ')';
        } else {
          ctx.fillStyle = 'rgba(130,255,238,' + lit.toFixed(3) + ')';
        }
        ctx.beginPath();
        ctx.arc(col.x, col.ys[i], col.r * (0.7 + a * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.font = '8px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(120,170,190,0.75)';
    ctx.textAlign = 'center';
    const labels = ['SENSES', 'H1', 'H2', 'MUSCLES'];
    for (let i = 0; i < cols.length; i++) ctx.fillText(labels[i], cols[i].x, 12);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(90,130,150,0.7)';
    ctx.fillText(brain.paramCount.toLocaleString() + ' weights · tanh', 4, h - 4);
  }

  function bindUI() {
    $('btn-train').addEventListener('click', () => {
      state.training = !state.training;
      $('btn-train').textContent = state.training ? 'TRAINING LOCALLY' : 'TRAIN LOCALLY';
      $('btn-train').classList.toggle('on', state.training);
      setNote(state.training ? 'local fork' : 'shared · ' + POLICY.trained + ' gens');
    });

    $('btn-speed').addEventListener('click', () => {
      const i = SPEED_ORDER.indexOf(state.speed);
      state.speed = SPEED_ORDER[(i + 1) % SPEED_ORDER.length];
      $('btn-speed').textContent = 'SPEED ' + state.speed.toUpperCase();
      evo.genClock = 0;
    });

    $('btn-pause').addEventListener('click', () => {
      state.paused = !state.paused;
      $('btn-pause').textContent = state.paused ? 'RESUME' : 'PAUSE';
      $('btn-pause').classList.toggle('off', state.paused);
    });

    $('btn-reset').addEventListener('click', () => respawn(false));
    $('btn-new').addEventListener('click', resetToShared);

    $('btn-xray').addEventListener('click', () => {
      view.setXray(!view.xray);
      $('btn-xray').classList.toggle('on', view.xray);
    });

    window.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        $('btn-pause').click();
      } else if (k === 't') $('btn-train').click();
      else if (k === 'r') respawn(false);
      else if (k === 'n') resetToShared();
      else if (k === 'x') $('btn-xray').click();
      else if (k === 's') $('btn-speed').click();
    });
  }

  function bindPointer() {
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) {
        world.orbit.theta -= dx * 0.006;
        world.orbit.phi = SB.clamp(world.orbit.phi - dy * 0.005, 0.32, 1.46);
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      dragging = false;
      if (moved > 6) return;
      const hit = world.screenToFloor(e.clientX, e.clientY);
      if (!hit) return;
      state.target.x = hit.x;
      state.target.z = hit.z;
      world.setTarget(hit.x, hit.z);
      world.clearTrail();
    });

    canvas.addEventListener('pointercancel', () => { dragging = false; });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = Math.sign(e.deltaY);
      world.orbit.radius = SB.clamp(world.orbit.radius + dir * 0.55, 3.2, 15);
    }, { passive: false });
  }

  boot();
})();
