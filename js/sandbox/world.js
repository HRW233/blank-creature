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
    for (let i = 0; i < creature.points.length; i++) {
      const p = creature.points[i];
      const mat = p.id === 'head' ? this.headMat : p.id === 'heelL' || p.id === 'toeL'
        ? this.footMat[0] : p.id === 'heelR' || p.id === 'toeR' ? this.footMat[1] : this.jointMat;
      const mesh = new THREE.Mesh(this.sphere, mat);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.joints.push({ mesh, i, r: p.r });
    }

    this.eyes = [];
    for (let e = 0; e < 2; e++) {
      const mesh = new THREE.Mesh(this.sphere, this.eyeMat);
      mesh.scale.setScalar(0.032);
      this.group.add(mesh);
      this.eyes.push({ mesh, side: e === 0 ? 1 : -1 });
    }

    this.xray = false;
    this.tmpDir = new THREE.Vector3();
    this.tmpMid = new THREE.Vector3();
    this.tmpRight = new THREE.Vector3();
    this.tmpFwd = new THREE.Vector3();
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
    for (let i = 0; i < 4; i++) {
      if (!this.creature.contacts[i]) continue;
      if (i % 2 === 0) leftFeet += 1;
      else rightFeet += 1;
    }
    this.footMat[0].emissiveIntensity = leftFeet ? 1.5 : this.xray ? 0.8 : 0.4;
    this.footMat[1].emissiveIntensity = rightFeet ? 1.5 : this.xray ? 0.8 : 0.4;

    /* eyes: head + forward + sideways, so the face reads even in silhouette */
    const I = this.creature.index;
    const head = pts[I.head];
    const neck = pts[I.neck];
    const sl = pts[I.hipFL];
    const sr = pts[I.hipFR];
    const fwd = this.tmpFwd;
    const right = this.tmpRight;
    fwd.set(head.x - neck.x, head.y - neck.y, head.z - neck.z).normalize();
    right.set(sl.x - sr.x, sl.y - sr.y, sl.z - sr.z).normalize();
    for (const eye of this.eyes) {
      eye.mesh.position.set(
        head.x + fwd.x * 0.125 + right.x * 0.05 * eye.side,
        head.y + fwd.y * 0.125 + right.y * 0.05 * eye.side + 0.025,
        head.z + fwd.z * 0.125 + right.z * 0.05 * eye.side
      );
    }
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
    this.scene.fog = new THREE.Fog(PAL.bg, 11, 32);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 90);
    this.orbit = { radius: 5.4, theta: 0.72, phi: 1.22 };
    this.focus = new THREE.Vector3(0, 0.6, 0);
    this.focusWanted = new THREE.Vector3(0, 0.6, 0);

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
      new THREE.PlaneGeometry(70, 70),
      new THREE.MeshStandardMaterial({ color: PAL.floorFar, roughness: 1, metalness: 0 })
    );
    far.rotation.x = -Math.PI / 2;
    far.position.y = -0.04;
    far.receiveShadow = true;
    scene.add(far);

    const platform = new THREE.Mesh(
      new THREE.CircleGeometry(CR.ARENA + 0.05, 96),
      new THREE.MeshStandardMaterial({ color: PAL.floor, roughness: 0.78, metalness: 0.25 })
    );
    platform.rotation.x = -Math.PI / 2;
    platform.receiveShadow = true;
    scene.add(platform);

    const ringMat = new THREE.MeshBasicMaterial({ color: PAL.ring, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    for (let r = 1; r <= 5; r++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.009, r + 0.009, 128), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.004;
      scene.add(ring);
    }

    const spokeMat = new THREE.MeshBasicMaterial({ color: 0x111b26, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    for (let s = 0; s < 12; s++) {
      const spoke = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 5), spokeMat);
      spoke.rotation.x = -Math.PI / 2;
      spoke.rotation.z = (s / 12) * Math.PI * 2;
      spoke.position.set(Math.sin((s / 12) * Math.PI * 2) * 2.5, 0.004, Math.cos((s / 12) * Math.PI * 2) * 2.5);
      scene.add(spoke);
    }

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(CR.ARENA + 0.05, 0.022, 8, 128),
      new THREE.MeshStandardMaterial({ color: 0x0b3b3a, emissive: 0x0a6b64, emissiveIntensity: 0.9, roughness: 0.4 })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.03;
    scene.add(rim);

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

    const cyan = new THREE.PointLight(0x00f5d4, 0.55, 12, 2);
    cyan.position.set(-4.2, 2.4, -3.4);
    scene.add(cyan);

    const magenta = new THREE.PointLight(0xff2e88, 0.5, 12, 2);
    magenta.position.set(4.2, 1.8, -3.2);
    scene.add(magenta);

    /* distant slabs: cheap depth cues at the edge of the fog */
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x0a1019, roughness: 0.85, metalness: 0.2, emissive: 0x04141a, emissiveIntensity: 0.5 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.3;
      const rad = 10 + (i % 4) * 2.6;
      const h = 1.6 + ((i * 37) % 9) * 0.55;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.5 + (i % 3) * 0.35, h, 0.5), slabMat);
      slab.position.set(Math.sin(a) * rad, h / 2 - 0.05, Math.cos(a) * rad);
      slab.rotation.y = a + 0.4;
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
    this.focusWanted.set(x * 0.85, y * 0.85 + 0.15, z * 0.85);
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
    const rad = Math.hypot(p.x, p.z);
    const lim = CR.ARENA - 0.35;
    if (rad > lim) {
      p.x *= lim / rad;
      p.z *= lim / rad;
    }
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
