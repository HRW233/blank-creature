'use strict';

/* ------------------------------------------------------------------ *
 * world.js - the three.js stage (arena, lights, camera) and the meshes *
 * that draw the ragdoll over its simulated points.                    *
 * ------------------------------------------------------------------ */

const PAL = {
  bg: 0x05080e,
  floor: 0x0c111a,
  floorFar: 0x070a10,
  ring: 0x1a2b3a,
  rim: 0x0d5a58,
  shell: 0x2a3142,
  limb: 0x343d51,
  head: 0x3b4762,
  joint: 0x00f5d4,
  gold: 0xffb703,
  magenta: 0xff2e88,
};

const UPV = new THREE.Vector3(0, 1, 0);

class CreatureView {
  constructor(creature, scene) {
    this.creature = creature;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.shellMat = new THREE.MeshStandardMaterial({
      color: PAL.shell, roughness: 0.5, metalness: 0.35, emissive: 0x061014,
    });
    this.limbMat = new THREE.MeshStandardMaterial({
      color: PAL.limb, roughness: 0.42, metalness: 0.5, emissive: 0x050d10,
    });
    this.headMat = new THREE.MeshStandardMaterial({
      color: PAL.head, roughness: 0.32, metalness: 0.62, emissive: 0x0a1420,
    });
    this.jointMat = new THREE.MeshStandardMaterial({
      color: 0x0a2323, roughness: 0.3, metalness: 0.2,
      emissive: PAL.joint, emissiveIntensity: 0.55,
    });
    this.footMat = [
      new THREE.MeshStandardMaterial({ color: 0x0a2323, roughness: 0.3, emissive: PAL.joint, emissiveIntensity: 0.45 }),
      new THREE.MeshStandardMaterial({ color: 0x0a2323, roughness: 0.3, emissive: PAL.joint, emissiveIntensity: 0.45 }),
    ];
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0x2a0410, roughness: 0.2, emissive: PAL.magenta, emissiveIntensity: 1.6,
    });

    this.cylinder = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
    this.sphere = new THREE.SphereGeometry(1, 16, 12);

    this.parts = [];
    for (const bone of creature.bones) {
      if (bone.group === 'brace') continue;
      const A = creature.points[bone.a];
      const B = creature.points[bone.b];
      const mat = bone.group === 'torso' ? this.shellMat : this.limbMat;
      const mesh = new THREE.Mesh(this.cylinder, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.parts.push({
        mesh,
        a: bone.a,
        b: bone.b,
        radius: Math.min(A.r, B.r) * (bone.group === 'torso' ? 1.06 : 0.82),
        kind: 'bone',
      });
    }

    this.joints = [];
    const I = creature.index;
    for (let i = 0; i < creature.points.length; i++) {
      const p = creature.points[i];
      const mat = p.id === 'head' ? this.headMat : p.id === 'heelL' || p.id === 'toeL'
        ? this.footMat[0] : p.id === 'heelR' || p.id === 'toeR' ? this.footMat[1] : this.jointMat;
      const mesh = new THREE.Mesh(this.sphere, mat);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.joints.push({ mesh, i, r: p.r, foot: mat === this.footMat[0] ? 0 : mat === this.footMat[1] ? 1 : -1 });
    }

    this.buildFace();

    this.xray = false;
    this.tmpDir = new THREE.Vector3();
    this.tmpMid = new THREE.Vector3();
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();
    this.tmpUp = new THREE.Vector3();
    this.tmpRight = new THREE.Vector3();
    this.tmpFwd = new THREE.Vector3();
    this.tmpLook = new THREE.Vector3();
  }

  /* a goofy ahh smiley face, built in local space facing +z and glued to the
     head every frame */
  buildFace() {
    const face = new THREE.Group();
    this.group.add(face);
    this.face = face;

    const white = new THREE.MeshStandardMaterial({
      color: 0xf6f9ff, roughness: 0.32, metalness: 0.02, emissive: 0x121a26, emissiveIntensity: 0.5,
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x0a1016, roughness: 0.18, metalness: 0.05, emissive: 0x14040a, emissiveIntensity: 0.4,
    });
    const tooth = new THREE.MeshStandardMaterial({
      color: 0xfff3cf, roughness: 0.35, metalness: 0.02, emissive: 0x2a2410, emissiveIntensity: 0.55,
    });

    const ball = (mat, x, y, z, r) => {
      const m = new THREE.Mesh(this.sphere, mat);
      m.position.set(x, y, z);
      m.scale.setScalar(r);
      face.add(m);
      return m;
    };

    /* big dumb eyes */
    ball(white, 0.058, 0.028, 0.104, 0.056);
    ball(white, -0.058, 0.028, 0.104, 0.056);
    const pupilL = ball(black, 0.066, 0.034, 0.152, 0.023);
    const pupilR = ball(black, -0.066, 0.034, 0.152, 0.023);
    this.pupils = [pupilL, pupilR];

    /* a wide, stupid grin: half a torus lying on its back */
    const grin = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.015, 8, 26, Math.PI), tooth);
    grin.position.set(0, -0.028, 0.118);
    grin.rotation.z = Math.PI;
    face.add(grin);

    /* two buck teeth hanging over the smile */
    const teeth = new THREE.BoxGeometry(0.024, 0.034, 0.012);
    for (const side of [1, -1]) {
      const t = new THREE.Mesh(teeth, tooth);
      t.position.set(side * 0.015, -0.052, 0.132);
      t.rotation.z = side * 0.06;
      face.add(t);
    }

    /* eyebrows, permanently surprised */
    const brow = new THREE.BoxGeometry(0.062, 0.013, 0.013);
    for (const side of [1, -1]) {
      const b = new THREE.Mesh(brow, black);
      b.position.set(side * 0.06, 0.098, 0.122);
      b.rotation.z = side * -0.3;
      face.add(b);
    }
  }

  setXray(on) {
    this.xray = on;
    const mats = [this.shellMat, this.limbMat, this.headMat];
    for (const m of mats) {
      m.transparent = on;
      m.opacity = on ? 0.14 : 1;
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
    this.jointMat.emissiveIntensity = on ? 0.95 : 0.55;
    for (const f of this.footMat) f.emissiveIntensity = on ? 0.8 : 0.45;
  }

  update() {
    const pts = this.creature.points;
    const dir = this.tmpDir;
    const mid = this.tmpMid;

    for (const part of this.parts) {
      const A = pts[part.a];
      const B = pts[part.b];
      dir.set(B.x - A.x, B.y - A.y, B.z - A.z);
      const len = dir.length() || 1e-4;
      dir.multiplyScalar(1 / len);
      mid.set((A.x + B.x) * 0.5, (A.y + B.y) * 0.5, (A.z + B.z) * 0.5);
      part.mesh.position.copy(mid);
      part.mesh.quaternion.setFromUnitVectors(UPV, dir);
      part.mesh.scale.set(part.radius, len, part.radius);
    }

    for (const j of this.joints) {
      const p = pts[j.i];
      j.mesh.position.set(p.x, p.y, p.z);
      j.mesh.scale.setScalar(j.r);
    }

    let leftFeet = 0;
    let rightFeet = 0;
    for (let i = 0; i < this.creature.contacts.length; i++) {
      if (!this.creature.contacts[i]) continue;
      if (i % 2 === 0) leftFeet += 1;
      else rightFeet += 1;
    }
    this.footMat[0].emissiveIntensity = leftFeet ? 1.5 : this.xray ? 0.8 : 0.4;
    this.footMat[1].emissiveIntensity = rightFeet ? 1.5 : this.xray ? 0.8 : 0.4;

    /* the face rides the head, oriented by the torso and the body's heading */
    const I = this.creature.index;
    const head = pts[I.head];
    const torso = this.creature.torso ? this.creature.torso() : { x: 0, y: 1, z: 0 };
    const f = this.creature.forward ? this.creature.forward() : { x: 0, z: 1 };
    this.face.position.set(head.x, head.y, head.z);
    this.face.up.set(torso.x, torso.y, torso.z);
    this.tmpLook.set(head.x + f.x, head.y + torso.y * 0.1, head.z + f.z);
    this.face.lookAt(this.tmpLook);
  }
}

class SandboxWorld {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAL.bg);
    this.scene.fog = new THREE.Fog(PAL.bg, 18, 120);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 260);
    /* behind the runner, looking up the lane toward the finish */
    this.orbit = { radius: 7.2, theta: Math.PI, phi: 1.16 };
    this.focus = new THREE.Vector3(0, 0.8, 0);
    this.focusWanted = new THREE.Vector3(0, 0.8, 0);

    this.buildStage();
    this.buildTarget();
    this.buildTrail();
    this.buildFlashes();

    this.clock = 0;
    this.trailTimer = 0;
    this.resize();
  }

  buildStage() {
    const scene = this.scene;

    const far = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 170),
      new THREE.MeshStandardMaterial({ color: PAL.floorFar, roughness: 1, metalness: 0 })
    );
    far.rotation.x = -Math.PI / 2;
    far.position.set(0, -0.04, CR.TRACK / 2);
    far.receiveShadow = true;
    scene.add(far);

    /* the lane: a straight hundred metres from the start line to the gate */
    const trackLen = CR.TRACK + 14;
    const platform = new THREE.Mesh(
      new THREE.PlaneGeometry(CR.LANE * 2 + 0.9, trackLen),
      new THREE.MeshStandardMaterial({ color: PAL.floor, roughness: 0.78, metalness: 0.25 })
    );
    platform.rotation.x = -Math.PI / 2;
    platform.position.set(0, 0, CR.TRACK / 2);
    platform.receiveShadow = true;
    scene.add(platform);

    /* twenty-metre bands: cheap motion cue while the camera chases him */
    const bandMat = new THREE.MeshBasicMaterial({ color: 0x101b27, transparent: true, opacity: 0.5 });
    for (let z = -7; z < CR.TRACK + 7; z += 20) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(CR.LANE * 2 + 0.9, 10), bandMat);
      band.rotation.x = -Math.PI / 2;
      band.position.set(0, 0.002, z + 5);
      scene.add(band);
    }

    const lineMat = new THREE.MeshBasicMaterial({ color: PAL.ring, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    for (const side of [1, -1]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.06, trackLen), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(side * CR.LANE, 0.003, CR.TRACK / 2);
      scene.add(line);
    }

    /* distance ticks every ten metres, heavier every fifty */
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x1b2c3c });
    const tickMatMid = new THREE.MeshBasicMaterial({ color: 0x27414f });
    for (let z = 10; z < CR.TRACK; z += 10) {
      const tick = new THREE.Mesh(
        new THREE.PlaneGeometry(CR.LANE * 2, z % 50 === 0 ? 0.2 : 0.09),
        z % 50 === 0 ? tickMatMid : tickMat
      );
      tick.rotation.x = -Math.PI / 2;
      tick.position.set(0, 0.004, z);
      scene.add(tick);
    }

    const startLine = new THREE.Mesh(new THREE.PlaneGeometry(CR.LANE * 2, 0.18), lineMat);
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(0, 0.005, 0);
    scene.add(startLine);

    /* the finish line and the gate over it */
    const goldLine = new THREE.MeshBasicMaterial({ color: PAL.gold, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const finishLine = new THREE.Mesh(new THREE.PlaneGeometry(CR.LANE * 2, 0.32), goldLine);
    finishLine.rotation.x = -Math.PI / 2;
    finishLine.position.set(0, 0.006, CR.TRACK);
    scene.add(finishLine);

    const postMat = new THREE.MeshStandardMaterial({ color: 0x1a1409, emissive: 0x3a2a05, emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.4 });
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16), postMat);
      post.position.set(side * (CR.LANE + 0.35), 1.6, CR.TRACK);
      post.castShadow = true;
      scene.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(CR.LANE * 2 + 0.9, 0.55, 0.12), postMat);
    banner.position.set(0, 3.2, CR.TRACK);
    scene.add(banner);

    this.hemi = new THREE.HemisphereLight(0x5d7fa8, 0x05070c, 0.55);
    scene.add(this.hemi);

    this.key = new THREE.DirectionalLight(0xdcecff, 1.15);
    this.key.position.set(5.5, 9, 5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.left = -7;
    this.key.shadow.camera.right = 7;
    this.key.shadow.camera.top = 7;
    this.key.shadow.camera.bottom = -7;
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 26;
    this.key.shadow.bias = -0.0009;
    this.key.shadow.normalBias = 0.02;
    scene.add(this.key);
    /* the light rides along with the runner, otherwise the shadow map is
       stuck at the start line and a hundred metres of track goes unlit */
    if (this.key.target) scene.add(this.key.target);

    const cyan = new THREE.PointLight(0x00f5d4, 0.55, 12, 2);
    cyan.position.set(-4.2, 2.4, -3.4);
    scene.add(cyan);

    const magenta = new THREE.PointLight(0xff2e88, 0.5, 12, 2);
    magenta.position.set(4.2, 1.8, -3.2);
    scene.add(magenta);

    /* distant slabs: cheap depth cues down both sides of the lane */
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x0a1019, roughness: 0.85, metalness: 0.2, emissive: 0x04141a, emissiveIntensity: 0.5 });
    for (let i = 0; i < 44; i++) {
      const z = -8 + i * 2.6;
      const side = i % 2 === 0 ? 1 : -1;
      const h = 0.9 + ((i * 37) % 9) * 0.3;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.4 + (i % 3) * 0.3, h, 0.4), slabMat);
      slab.position.set(side * (CR.LANE + 2.6 + (i % 4) * 0.7), h / 2 - 0.05, z);
      slab.rotation.y = side * 0.3;
      scene.add(slab);
    }
  }

  buildTarget() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0x402a00, emissive: PAL.gold, emissiveIntensity: 1.8, roughness: 0.25 })
    );
    core.position.y = 0.45;
    g.add(core);
    this.targetCore = core;

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.235, 64),
      new THREE.MeshBasicMaterial({ color: PAL.gold, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.006;
    g.add(halo);
    this.targetHalo = halo;

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.16, 0.45, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: PAL.gold, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 0.23;
    g.add(beam);
    this.targetBeam = beam;

    this.targetLight = new THREE.PointLight(PAL.gold, 0.9, 4, 2);
    this.targetLight.position.y = 0.45;
    g.add(this.targetLight);

    this.targetGroup = g;
    this.scene.add(g);
  }

  setTarget(x, z) {
    this.targetGroup.position.set(x, 0, z);
  }

  buildTrail() {
    this.trailMax = 320;
    const pos = new Float32Array(this.trailMax * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: PAL.joint, transparent: true, opacity: 0.4 });
    this.trail = new THREE.Line(geo, mat);
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this.trailCount = 0;
  }

  addTrailPoint(x, z, dt) {
    this.trailTimer += dt;
    if (this.trailTimer < 0.05) return;
    this.trailTimer = 0;
    if (this.trailCount >= this.trailMax) return;
    const arr = this.trail.geometry.attributes.position.array;
    arr[this.trailCount * 3] = x;
    arr[this.trailCount * 3 + 1] = 0.012;
    arr[this.trailCount * 3 + 2] = z;
    this.trailCount++;
    this.trail.geometry.setDrawRange(0, this.trailCount);
    this.trail.geometry.attributes.position.needsUpdate = true;
  }

  clearTrail() {
    this.trailCount = 0;
    this.trail.geometry.setDrawRange(0, 0);
  }

  buildFlashes() {
    this.flashes = [];
    const geo = new THREE.RingGeometry(0.9, 1, 64);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: PAL.joint, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      mesh.visible = false;
      this.scene.add(mesh);
      this.flashes.push({ mesh, life: 0 });
    }
    this.flashIndex = 0;
  }

  flash() {
    const f = this.flashes[this.flashIndex];
    this.flashIndex = (this.flashIndex + 1) % this.flashes.length;
    f.life = 0.9;
    f.mesh.visible = true;
  }

  animate(dt, t) {
    this.clock = t;
    const pulse = 1 + Math.sin(t * 3.4) * 0.09;
    this.targetCore.scale.setScalar(pulse);
    this.targetCore.position.y = 0.45 + Math.sin(t * 2.1) * 0.035;
    this.targetHalo.scale.setScalar(1 + Math.sin(t * 3.4 + 1) * 0.12);
    this.targetBeam.scale.setScalar(1 + Math.sin(t * 2.2) * 0.08);
    this.targetLight.intensity = 0.75 + Math.sin(t * 4.1) * 0.22;

    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.visible = false;
        f.mesh.material.opacity = 0;
        continue;
      }
      const k = 1 - f.life / 0.9;
      f.mesh.scale.setScalar(0.4 + k * 4.2);
      f.mesh.material.opacity = (1 - k) * 0.5;
      f.mesh.position.y = 0.02;
    }
  }

  updateCamera(dt, x, y, z) {
    this.focusWanted.set(x, y * 0.55 + 0.7, z + 1.2);
    const k = 1 - Math.pow(0.0015, Math.min(dt, 0.05));
    this.focus.lerp(this.focusWanted, k);

    const r = this.orbit.radius;
    const sp = Math.sin(this.orbit.phi);
    this.camera.position.set(
      this.focus.x + Math.sin(this.orbit.theta) * sp * r,
      this.focus.y + Math.cos(this.orbit.phi) * r,
      this.focus.z + Math.cos(this.orbit.theta) * sp * r
    );
    this.camera.lookAt(this.focus);

    /* keep the shadow-casting light centred on the runner */
    this.key.position.set(x + 5.5, 9, z + 5);
    if (this.key.target) this.key.target.position.set(x, 0, z);
  }

  screenToFloor(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: nx, y: ny }, this.camera);
    const p = new THREE.Vector3();
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    if (!hit) return null;
    /* the lane is a corridor now, so clamp to it instead of a circle */
    p.x = SB.clamp(p.x, -CR.LANE + 0.3, CR.LANE - 0.3);
    p.z = SB.clamp(p.z, -2, CR.TRACK + 2);
    return { x: p.x, z: p.z };
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
