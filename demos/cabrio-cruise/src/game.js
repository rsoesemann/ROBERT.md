/* Game loop: driving physics, cameras, traffic, police, HUD, sound. */
(function () {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const T = THREE;

  const WHEELBASE = 2.57;
  const POWER = 240;        // roughly a 325i: 234 km/h flat out, 0–100 in ~7 s
  const CAMS = ['Fahrersicht', 'Cockpit', 'Verfolger', 'Kino'];

  let renderer, scene, camera, sun, world, cabrio, refs, post;
  let raf = 0, last = 0, time = 0, started = false;

  const st = {
    x: 0, y: 0, z: 0, heading: 0,
    speed: 0, lateral: 0, steer: 0, braking: false,
    onRoad: true, u: 0, gear: 1, rpm: 0,
    pitch: 0, roll: 0, cam: 0,
    cash: 0, wanted: 0, damage: 0, topSpeed: 0,
    busted: 0, missionTime: 0, checkpoints: 0,
  };
  CC.st = st;

  const keys = new Set();
  const touch = { steer: 0, gas: 0, brake: 0 };
  const shake = { x: 0, y: 0 };
  const camPos = new T.Vector3();
  const camAim = new T.Vector3();

  function rngFactory(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = rngFactory(4711);

  // ------------------------------------------------------------------- sound

  const snd = {
    ctx: null, muted: false, radioOn: false,
    start() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);

      // Engine: two saws through a lowpass that opens with revs.
      this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
      this.engFilter = ctx.createBiquadFilter();
      this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 700;
      this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
      this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      this.osc1.connect(this.engFilter); this.osc2.connect(g2); g2.connect(this.engFilter);
      this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
      this.osc1.start(); this.osc2.start();

      // Wind and tyre noise share one noise buffer.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      this.wind = ctx.createBufferSource();
      this.wind.buffer = buf; this.wind.loop = true;
      this.windF = ctx.createBiquadFilter();
      this.windF.type = 'bandpass'; this.windF.frequency.value = 500; this.windF.Q.value = 0.6;
      this.windG = ctx.createGain(); this.windG.gain.value = 0;
      this.wind.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
      this.wind.start();

      this.tyre = ctx.createBufferSource();
      this.tyre.buffer = buf; this.tyre.loop = true;
      this.tyreF = ctx.createBiquadFilter();
      this.tyreF.type = 'highpass'; this.tyreF.frequency.value = 1800;
      this.tyreG = ctx.createGain(); this.tyreG.gain.value = 0;
      this.tyre.connect(this.tyreF); this.tyreF.connect(this.tyreG); this.tyreG.connect(this.master);
      this.tyre.start();

      this.sirenOsc = ctx.createOscillator(); this.sirenOsc.type = 'triangle';
      this.sirenG = ctx.createGain(); this.sirenG.gain.value = 0;
      this.sirenOsc.connect(this.sirenG); this.sirenG.connect(this.master);
      this.sirenOsc.start();

      this.radioG = ctx.createGain(); this.radioG.gain.value = 0;
      this.radioG.connect(this.master);
    },
    update(dt, rpmNorm, throttle, speed, slip, sirenNear) {
      if (!this.ctx) return;
      const m = this.muted ? 0 : 1;
      const f = 32 + rpmNorm * 108;
      this.osc1.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
      this.osc2.frequency.setTargetAtTime(f * 0.5, this.ctx.currentTime, 0.05);
      this.engFilter.frequency.setTargetAtTime(420 + rpmNorm * 2200 + throttle * 600, this.ctx.currentTime, 0.08);
      this.engGain.gain.setTargetAtTime(m * (0.05 + throttle * 0.09 + rpmNorm * 0.05), this.ctx.currentTime, 0.08);
      this.windG.gain.setTargetAtTime(m * Math.min(speed / 70, 1) * 0.22, this.ctx.currentTime, 0.15);
      this.windF.frequency.setTargetAtTime(360 + speed * 12, this.ctx.currentTime, 0.2);
      this.tyreG.gain.setTargetAtTime(m * Math.min(slip / 7, 1) * 0.28, this.ctx.currentTime, 0.05);
      if (sirenNear > 0) {
        const two = Math.floor(time * 1.6) % 2 ? 880 : 620;
        this.sirenOsc.frequency.setTargetAtTime(two, this.ctx.currentTime, 0.02);
        this.sirenG.gain.setTargetAtTime(m * 0.10 * sirenNear, this.ctx.currentTime, 0.1);
      } else {
        this.sirenG.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      }
    },
    crash(force) {
      if (!this.ctx || this.muted) return;
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(Math.min(force, 1) * 0.6, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.45);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(); s.stop(this.ctx.currentTime + 0.5);
    },
    horn() {
      if (!this.ctx || this.muted) return;
      for (const f of [440, 554]) {
        const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
        const g = this.ctx.createGain(); g.gain.value = 0.09;
        g.gain.setTargetAtTime(0, this.ctx.currentTime + 0.28, 0.05);
        o.connect(g); g.connect(this.master);
        o.start(); o.stop(this.ctx.currentTime + 0.6);
      }
    },
    /* Two bars of something vaguely radio-shaped, scheduled a bar at a time. */
    radioTick() {
      if (!this.ctx || !this.radioOn || this.muted) return;
      const t0 = this.ctx.currentTime;
      const root = [0, 3, 5, 3][this.bar % 4];
      const notes = [0, 7, 12, 16, 12, 7];
      for (let i = 0; i < notes.length; i++) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = 220 * Math.pow(2, (root + notes[i]) / 12);
        const g = this.ctx.createGain();
        const at = t0 + i * 0.25;
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.05, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.24);
        o.connect(g); g.connect(this.master);
        o.start(at); o.stop(at + 0.26);
      }
      const b = this.ctx.createOscillator();
      b.type = 'sine';
      b.frequency.value = 55 * Math.pow(2, root / 12);
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0.10, t0);
      bg.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4);
      b.connect(bg); bg.connect(this.master);
      b.start(t0); b.stop(t0 + 1.5);
      this.bar = (this.bar || 0) + 1;
    },
  };
  CC.snd = snd;

  // ----------------------------------------------------------------- geometry

  function sampleAt(u) {
    const s = world.samples;
    const n = s.length;
    const f = (((u % 1) + 1) % 1) * n;
    const i0 = Math.floor(f) % n;
    const i1 = (i0 + 1) % n;
    const k = f - Math.floor(f);
    const a = s[i0], b = s[i1];
    const L = T.MathUtils.lerp;
    const tx = L(a.tx, b.tx, k), tz = L(a.tz, b.tz, k);
    const inv = 1 / (Math.hypot(tx, tz) || 1);
    return {
      x: L(a.x, b.x, k), y: L(a.y, b.y, k), z: L(a.z, b.z, k),
      tx: tx * inv, tz: tz * inv, nx: tz * inv, nz: -tx * inv,
      half: L(a.half, b.half, k), kind: a.kind,
    };
  }

  // ------------------------------------------------------------------ traffic

  const traffic = [];
  const police = [];
  let policeContact = 0, policeClear = 0;

  function spawnTraffic() {
    const trailerMats = [];
    for (const [name, col] of [['SÜDLOG', '#2e7d4f'], ['TRANSPO', '#c0392b'],
      ['BERGMANN', '#1f5fa8'], ['KRAFT', '#b03a2e']]) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#f2f3f0'; g.fillRect(0, 0, 512, 128);
      g.fillStyle = col; g.font = 'bold 46px sans-serif'; g.fillText(name, 40, 76);
      g.fillStyle = '#4a4a4a'; g.fillRect(0, 112, 512, 16);
      const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding;
      trailerMats.push(new T.MeshLambertMaterial({ map: tx }));
    }

    for (let i = 0; i < 30; i++) {
      const isTruck = rng() < 0.34;
      const dir = rng() < 0.45 ? -1 : 1;
      const v = {
        u: i / 30 + rng() * 0.01,
        dir,
        truck: isTruck,
        laneFrac: isTruck ? 0.54 : (rng() < 0.25 ? 0.20 : 0.52),
        speed: isTruck ? 19 + rng() * 4 : 24 + rng() * 14,
        hw: isTruck ? 1.5 : 1.0,
        hl: isTruck ? 9.5 : 2.4,
      };
      v.group = isTruck ? CC.buildTruck(rng, trailerMats[i % trailerMats.length]) : CC.buildTrafficCar(rng);
      scene.add(v.group);
      traffic.push(v);
    }
  }

  function placeOnRoad(group, u, dir, laneFrac, extraOffset) {
    const s = sampleAt(u);
    const off = (s.half * laneFrac + (extraOffset || 0)) * (dir > 0 ? -1 : 1);
    group.position.set(s.x + s.nx * off, s.y + 0.05, s.z + s.nz * off);
    group.rotation.y = Math.atan2(s.tx * dir, s.tz * dir);
    return s;
  }

  function updateTraffic(dt) {
    for (const v of traffic) {
      // Slow down through the villages and the yard, wind up on the Autobahn.
      const s = sampleAt(v.u);
      const cap = s.kind === 'autobahn' ? 1 : s.kind === 'industrial' ? 0.55 : 0.75;
      v.u += (v.dir * v.speed * cap * dt) / world.length;
      placeOnRoad(v.group, v.u, v.dir, v.laneFrac);
    }
  }

  function collideTraffic() {
    if (grace > 0) return;
    const px = st.x, pz = st.z;
    for (const v of traffic) {
      const g = v.group;
      const dx = px - g.position.x, dz = pz - g.position.z;
      if (dx * dx + dz * dz > 400) continue;
      const c = Math.cos(-g.rotation.y), sn = Math.sin(-g.rotation.y);
      const lx = dx * c - dz * sn;            // player in the other car's frame
      const lz = dx * sn + dz * c;
      const ox = v.hw + 0.95 - Math.abs(lx);
      const oz = v.hl + 2.15 - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      const cy = Math.cos(g.rotation.y), sy = Math.sin(g.rotation.y);
      let wx, wz;
      if (ox < oz) {                          // shove sideways, out of the lane
        const push = Math.sign(lx || 1) * ox;
        wx = cy * push; wz = -sy * push;
        st.lateral *= -0.3;
      } else {                                // rear-ended: shove along its axis
        const push = Math.sign(lz || 1) * oz;
        wx = sy * push; wz = cy * push;
      }
      st.x += wx; st.z += wz;
      const len = Math.hypot(wx, wz) || 1;
      const closing = closingSpeed(wx / len, wz / len);
      if (closing < 1) continue;              // rubbing along, not crashing into
      st.speed *= closing > 3 ? 0.45 : 0.85;
      if (closing <= 3) continue;
      bump(Math.min(closing / 30, 1.3));
      wanted(1, 'Unfall mit Verkehr');
    }
  }

  /* Speed at which the car is closing on an obstacle, along the escape
     direction (nx, nz). Negative means it is already driving away — applying
     the crash penalty then would pin it against the obstacle forever. */
  function closingSpeed(nx, nz) {
    const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
    const vx = fx * st.speed - fz * st.lateral;
    const vz = fz * st.speed + fx * st.lateral;
    return -(vx * nx + vz * nz);
  }

  function collideProps() {
    for (const c of world.colliders.near(st.x, st.z)) {
      const dx = st.x - c.x, dz = st.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 1.1;
      if (d > min || d === 0) continue;
      const nx = dx / d, nz = dz / d;
      st.x = c.x + nx * min;
      st.z = c.z + nz * min;
      const closing = closingSpeed(nx, nz);
      if (closing < 1) continue;                    // resting against it, or leaving
      st.speed *= closing > 3 ? (c.kind === 'tree' ? 0.22 : 0.5) : 0.85;
      if (closing > 3) bump(Math.min(closing / 26, 1.2));
    }
    for (const b of world.colliders.boxes) {
      const dx = st.x - b.x, dz = st.z - b.z;
      if (dx * dx + dz * dz > 3600) continue;
      const c = Math.cos(-b.ry), sn = Math.sin(-b.ry);
      const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      const ox = b.hx + 1.1 - Math.abs(lx);
      const oz = b.hz + 1.1 - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      let px = 0, pz = 0;
      if (ox < oz) px = Math.sign(lx || 1) * ox; else pz = Math.sign(lz || 1) * oz;
      const wx = px * Math.cos(b.ry) + pz * Math.sin(b.ry);
      const wz = -px * Math.sin(b.ry) + pz * Math.cos(b.ry);
      st.x += wx; st.z += wz;
      const len = Math.hypot(wx, wz) || 1;
      const closing = closingSpeed(wx / len, wz / len);
      if (closing < 1) continue;
      st.speed *= closing > 3 ? 0.3 : 0.85;
      if (closing > 3) bump(Math.min(closing / 24, 1.2));
    }
  }

  function bump(force) {
    shake.x += (Math.random() - 0.5) * force * 0.9;
    shake.y += (Math.random() - 0.5) * force * 0.7;
    st.damage = Math.min(100, st.damage + force * 6);
    snd.crash(force);
  }

  // ------------------------------------------------------------------- police

  function wanted(n, why) {
    if (st.wanted >= 5) return;
    st.wanted = Math.min(5, st.wanted + n);
    policeClear = 0;
    while (police.length < Math.min(st.wanted, 3)) {
      const p = CC.buildPolice();
      scene.add(p.group);
      police.push({
        ...p, u: st.u - 0.018, laneFrac: 0.35, speed: 30, flash: 0,
      });
    }
    flash(why + ' — Fahndungsstufe ' + st.wanted);
  }

  function updatePolice(dt) {
    let near = 0;
    for (const p of police) {
      // Close the gap along the road, then sit on the player's bumper.
      let delta = st.u - p.u;
      delta = ((delta % 1) + 1.5) % 1 - 0.5;
      const want = T.MathUtils.clamp(Math.abs(st.speed) + delta * world.length * 0.55 + 4, 12, 62);
      p.speed += (want - p.speed) * Math.min(dt * 1.6, 1);
      p.u += (p.speed * dt) / world.length;
      const s = placeOnRoad(p.group, p.u, 1, p.laneFrac);
      p.group.position.y = s.y + 0.05;

      const d = Math.hypot(p.group.position.x - st.x, p.group.position.z - st.z);
      near = Math.max(near, T.MathUtils.clamp(1 - d / 140, 0, 1));
      p.flash += dt;
      const on = Math.floor(p.flash * 7) % 2;
      p.lights[0].emissive.setHex(on ? 0x2255ff : 0x000000);
      p.lights[1].emissive.setHex(on ? 0x000000 : 0x2255ff);
      if (d < 8) policeContact += dt;
    }
    if (police.length) {
      if (policeContact > 2.6) {
        busted();
      }
      if (near < 0.35) {
        policeClear += dt;
        if (policeClear > 12) {
          policeClear = 0;
          st.wanted = Math.max(0, st.wanted - 1);
          while (police.length > Math.min(st.wanted, 3)) {
            scene.remove(police.pop().group);
          }
          if (st.wanted === 0) flash('Abgehängt.');
        }
      } else {
        policeClear = 0;
      }
      policeContact = Math.max(0, policeContact - dt * 0.35);
    }
    return near;
  }

  function busted() {
    const fine = Math.min(st.cash, 500);
    st.cash -= fine;
    st.wanted = 0;
    policeContact = 0;
    while (police.length) scene.remove(police.pop().group);
    flash('BUSTED — ' + fine + ' € Bußgeld', 2600);
    respawn();
  }

  // -------------------------------------------------------------- checkpoints

  let ring = null, ringU = 0;

  function nextCheckpoint(first) {
    ringU = (first ? st.u + 0.03 : ringU + 0.035 + rng() * 0.045) % 1;
    const s = sampleAt(ringU);
    if (!ring) {
      ring = new T.Mesh(
        new T.TorusGeometry(4.6, 0.30, 8, 28),
        new T.MeshBasicMaterial({ color: 0xffc733, transparent: true, opacity: 0.85 })
      );
      scene.add(ring);
    }
    ring.position.set(s.x, s.y + 3.4, s.z);
    ring.rotation.set(0, Math.atan2(s.tx, s.tz) + Math.PI / 2, 0);
    st.missionTime = 26 + rng() * 8;
  }

  function updateCheckpoint(dt) {
    if (!ring) return;
    ring.rotation.z += dt * 0.9;
    const d = Math.hypot(ring.position.x - st.x, ring.position.z - st.z);
    if (d < 7.5) {
      const bonus = Math.round(Math.abs(st.speed) * 6);
      st.cash += 250 + bonus;
      st.checkpoints++;
      flash('Checkpoint  +' + (250 + bonus) + ' €');
      nextCheckpoint(false);
      return;
    }
    st.missionTime -= dt;
    if (st.missionTime <= 0) {
      flash('Zeit abgelaufen — neue Lieferung');
      nextCheckpoint(true);
    }
  }

  // -------------------------------------------------------------------- input

  function readInput() {
    const k = (a, b) => keys.has(a) || keys.has(b);
    let steer = touch.steer;
    if (k('a', 'arrowleft')) steer += 1;
    if (k('d', 'arrowright')) steer -= 1;   // +X is left, so left turn is +steer
    const gas = (k('w', 'arrowup') ? 1 : 0) || touch.gas;
    const brake = (k('s', 'arrowdown') ? 1 : 0) || touch.brake;
    return {
      steer: T.MathUtils.clamp(steer, -1, 1),
      gas, brake,
      handbrake: keys.has(' '),
    };
  }

  // ------------------------------------------------------------------ physics

  function drive(dt, inp) {
    const v = st.speed;
    const av = Math.abs(v);

    const near = world.index.nearest(st.x, st.z);
    const half = near ? near.s.half : 5;
    const distToCentre = near ? near.dist : 999;
    st.onRoad = distToCentre < half + 1.2;
    if (near) st.u = near.s.u;

    // Steering authority falls away with speed, as it should.
    const maxSteer = 0.58 * (1 - 0.72 * Math.min(av / 62, 1));
    const target = inp.steer * maxSteer;
    const rate = (4.2 - Math.min(av / 30, 2.4)) * dt;
    st.steer += T.MathUtils.clamp(target - st.steer, -rate, rate);
    if (!inp.steer) st.steer *= Math.max(0, 1 - dt * 5);

    const surface = st.onRoad ? 1 : 0.55;
    let accel = 0;
    if (inp.gas) accel += Math.min(POWER / Math.max(av, 9), 4.4) * surface * inp.gas;
    st.braking = inp.brake > 0;
    if (inp.brake) {
      if (v > 0.6) accel -= 16 * surface;
      else accel -= 4.5;              // creep into reverse
    }
    accel -= 0.00080 * v * av;        // aero
    /* Rolling resistance in the field has to stay under the acceleration the
       field allows, or a car that stops on the grass can never pull away
       again. It grows with speed instead, which caps the meadow at ~110 km/h. */
    accel -= (st.onRoad ? 0.35 : 0.5 + 0.10 * av) * Math.sign(v);
    if (inp.handbrake) accel -= 9 * Math.sign(v);
    st.speed += accel * dt;
    if (Math.abs(st.speed) < 0.12 && !inp.gas && !inp.brake) st.speed = 0;
    st.speed = T.MathUtils.clamp(st.speed, -9, 68);

    const yawRate = (st.speed / WHEELBASE) * Math.tan(st.steer);
    st.heading += yawRate * dt;

    // Lateral slide, so the back steps out under the handbrake.
    const grip = inp.handbrake ? 1.7 : st.onRoad ? 7.2 : 4.0;
    st.lateral += yawRate * st.speed * dt;
    st.lateral *= Math.exp(-grip * dt);
    st.lateral = T.MathUtils.clamp(st.lateral, -18, 18);

    const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
    const rx = -fz, rz = fx;          // right-hand side of travel
    st.x += (fx * st.speed + rx * st.lateral) * dt;
    st.z += (fz * st.speed + rz * st.lateral) * dt;

    // Autobahn guardrails are solid.
    if (near && near.s.kind === 'autobahn' && distToCentre > half + 1.55) {
      const s = near.s;
      const side = Math.sign((st.x - s.x) * s.nx + (st.z - s.z) * s.nz) || 1;
      const lim = half + 1.55;
      st.x = s.x + s.nx * side * lim;
      st.z = s.z + s.nz * side * lim;
      st.lateral *= -0.15;
      st.speed *= 0.90;
      if (av > 12) bump(Math.min(av / 40, 0.8));
    }

    collideProps();
    collideTraffic();

    // Ground contact and body attitude from four sampled wheel points.
    const h = CC.terrainHeight;
    const gy = h(st.x, st.z) + (st.onRoad ? 0.05 : 0);
    st.y += (gy - st.y) * Math.min(dt * 14, 1);
    const front = h(st.x + fx * 1.3, st.z + fz * 1.3);
    const back = h(st.x - fx * 1.3, st.z - fz * 1.3);
    const left = h(st.x - rx * 0.85, st.z - rz * 0.85);
    const right = h(st.x + rx * 0.85, st.z + rz * 0.85);
    const pitchT = Math.atan2(front - back, 2.6) - accel * 0.010;
    const rollT = Math.atan2(right - left, 1.7) + st.lateral * 0.014;
    st.pitch += (pitchT - st.pitch) * Math.min(dt * 9, 1);
    st.roll += (rollT - st.roll) * Math.min(dt * 9, 1);

    // Gearbox is cosmetic, but the revs drive the engine note.
    const bands = [0, 15, 27, 39, 51, 68];
    let gear = 1;
    for (let i = 1; i < bands.length; i++) if (av >= bands[i - 1]) gear = i;
    st.gear = st.speed < -0.3 ? 0 : gear;
    const lo = bands[gear - 1], hi = bands[gear];
    st.rpm = T.MathUtils.clamp(0.16 + ((av - lo) / (hi - lo)) * 0.84, 0.1, 1);
    st.topSpeed = Math.max(st.topSpeed, av * 3.6);
  }

  let grace = 0, snapCam = true;

  function respawn() {
    const s = sampleAt(st.u);
    const off = s.half * 0.5;
    st.x = s.x - s.nx * off;
    st.z = s.z - s.nz * off;
    st.y = s.y + 0.05;
    st.heading = Math.atan2(s.tx, s.tz);
    st.speed = 0; st.lateral = 0; st.steer = 0;
    st.pitch = 0; st.roll = 0;
    // You land in a live lane, so ignore traffic for a moment — otherwise a
    // truck sitting on the spawn point starts the whole chase over again.
    grace = 1.8;
    snapCam = true;
  }

  // ------------------------------------------------------------------ cameras

  /* Rig 0 is the driver's own eye — behind the wheel, under the windscreen
     header. Rig 1 is the phone-on-a-stick shot from the clips. */
  /* The driver's eye has to sit at the driver's head, not behind it: a
     centimetre too far back and you are looking at the back of his own shirt. */
  const CAM_RIGS = [
    { pos: [0.42, 1.26, -0.30], aim: [0.42, 0.56, 13], fov: 68, lag: 0.0 },
    { pos: [0, 1.74, -1.72], aim: [0, 0.86, 14], fov: 76, lag: 0.0 },
    { pos: [0, 2.35, -7.4], aim: [0, 1.00, 6], fov: 62, lag: 0.10 },
    { pos: [7.6, 1.75, -3.0], aim: [0, 0.85, 3], fov: 40, lag: 0.22 },
  ];

  function updateCamera(dt) {
    const rig = CAM_RIGS[st.cam];
    // From the driver's own eye you would otherwise be looking at the inside
    // of his skull.
    refs.people[0].head.visible = st.cam !== 0;
    if (camera.fov !== rig.fov) { camera.fov = rig.fov; camera.updateProjectionMatrix(); }
    const m = cabrio.matrixWorld;
    camPos.set(rig.pos[0], rig.pos[1], rig.pos[2]).applyMatrix4(m);
    camAim.set(rig.aim[0], rig.aim[1], rig.aim[2]).applyMatrix4(m);

    const k = snapCam || rig.lag <= 0 ? 1 : 1 - Math.exp(-dt / rig.lag);
    snapCam = false;
    camera.position.lerp(camPos, k);

    const speedShake = Math.min(Math.abs(st.speed) / 70, 1) * (st.onRoad ? 0.02 : 0.09);
    shake.x *= Math.exp(-dt * 6);
    shake.y *= Math.exp(-dt * 6);
    camera.position.x += shake.x * 0.4 + Math.sin(time * 23) * speedShake * 0.05;
    camera.position.y += shake.y * 0.25 + Math.sin(time * 31) * speedShake * 0.06;
    camera.lookAt(camAim);
    camera.rotateZ(-st.lateral * 0.004 + shake.x * 0.02);
  }

  // ---------------------------------------------------------------------- HUD

  let ui = {};
  let msgTimer = 0;

  function flash(text, ms) {
    ui.msg.textContent = text;
    ui.msg.style.opacity = '1';
    msgTimer = (ms || 1800) / 1000;
  }

  function drawSpeedo() {
    const c = ui.speedoCtx;
    const S = 168;
    c.clearRect(0, 0, S, S);
    c.save();
    c.translate(S / 2, S / 2);

    c.beginPath(); c.arc(0, 0, 76, 0, 7);
    c.fillStyle = 'rgba(8,12,20,0.72)'; c.fill();
    c.strokeStyle = 'rgba(150,175,210,0.30)'; c.lineWidth = 1.5; c.stroke();

    const kmh = Math.abs(st.speed) * 3.6;
    const A0 = Math.PI * 0.78, A1 = Math.PI * 2.22;
    for (let i = 0; i <= 12; i++) {
      const a = A0 + (i / 12) * (A1 - A0);
      const big = i % 2 === 0;
      c.strokeStyle = i >= 10 ? '#e2452f' : 'rgba(210,222,236,0.75)';
      c.lineWidth = big ? 2.4 : 1.2;
      c.beginPath();
      c.moveTo(Math.cos(a) * 62, Math.sin(a) * 62);
      c.lineTo(Math.cos(a) * (big ? 50 : 55), Math.sin(a) * (big ? 50 : 55));
      c.stroke();
      if (big) {
        c.fillStyle = 'rgba(190,205,222,0.8)';
        c.font = '9px ui-sans-serif, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(i * 20), Math.cos(a) * 41, Math.sin(a) * 41);
      }
    }
    const a = A0 + T.MathUtils.clamp(kmh / 240, 0, 1) * (A1 - A0);
    c.strokeStyle = '#ff6a3d'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-Math.cos(a) * 8, -Math.sin(a) * 8);
    c.lineTo(Math.cos(a) * 58, Math.sin(a) * 58); c.stroke();
    c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fillStyle = '#ff6a3d'; c.fill();

    // Digits live in the lower half, where the scale has its gap.
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#eef3f8';
    c.font = '600 27px ui-sans-serif, sans-serif';
    c.fillText(String(Math.round(kmh)), 0, 34);
    c.fillStyle = '#8e9bb0';
    c.font = '10px ui-sans-serif, sans-serif';
    c.fillText('km/h', 0, 47);
    c.fillStyle = '#c3ccd8';
    c.font = '600 11px ui-sans-serif, sans-serif';
    c.fillText(st.gear === 0 ? 'R' : st.gear + '. Gang', 0, 64);
    c.restore();
  }

  let miniPath = null;
  function drawMinimap() {
    const c = ui.miniCtx;
    const S = 160, R = 76;
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(S / 2, S / 2, R, 0, 7);
    c.fillStyle = 'rgba(8,12,20,0.72)'; c.fill();
    c.strokeStyle = 'rgba(150,175,210,0.30)'; c.lineWidth = 1.5; c.stroke();
    c.clip();

    const scale = 0.055;              // ~18 m per pixel
    c.translate(S / 2, S / 2);
    c.rotate(st.heading);             // north-up would be useless in a car
    c.scale(1, -1);
    c.translate(-st.x * scale, -st.z * scale);

    c.lineWidth = 3.2;
    c.strokeStyle = 'rgba(226,232,240,0.75)';
    c.beginPath();
    miniPath.forEach((p, i) => (i ? c.lineTo(p[0] * scale, p[1] * scale) : c.moveTo(p[0] * scale, p[1] * scale)));
    c.closePath(); c.stroke();

    for (const v of traffic) {
      c.fillStyle = v.truck ? '#b9c2cc' : '#7f8b99';
      c.fillRect(v.group.position.x * scale - 1.6, v.group.position.z * scale - 1.6, 3.2, 3.2);
    }
    for (const p of police) {
      c.fillStyle = '#3b7dff';
      c.beginPath(); c.arc(p.group.position.x * scale, p.group.position.z * scale, 2.6, 0, 7); c.fill();
    }
    if (ring) {
      c.fillStyle = '#ffc733';
      c.beginPath(); c.arc(ring.position.x * scale, ring.position.z * scale, 3.4, 0, 7); c.fill();
    }
    c.restore();

    c.save();
    c.translate(S / 2, S / 2);
    c.fillStyle = '#ff6a3d';
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6);
    c.closePath(); c.fill();
    c.restore();
  }

  function drawHud(dt) {
    drawSpeedo();
    drawMinimap();
    ui.cash.textContent = st.cash.toLocaleString('de-DE') + ' €';
    ui.stars.textContent = '★'.repeat(st.wanted) + '☆'.repeat(5 - st.wanted);
    ui.stars.className = st.wanted ? 'stars on' : 'stars';
    ui.mission.textContent = 'Lieferung ' + (st.checkpoints + 1) + ' · ' + Math.max(0, st.missionTime).toFixed(1) + ' s';
    ui.damage.style.width = st.damage + '%';
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) ui.msg.style.opacity = '0';
    }
  }

  // ---------------------------------------------------------------------- run

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000 || 0, 0.05);
    last = now;
    time += dt;

    if (!started) {   // title screen: slow orbit around the parked car
      cabrio.position.set(st.x, st.y, st.z);
      cabrio.rotation.set(0, st.heading, 0, 'YXZ');
      cabrio.updateMatrixWorld(true);
      CC.animateCabrio(refs, st, time);
      const a = time * 0.18;
      camera.fov = 46; camera.updateProjectionMatrix();
      camera.position.set(st.x + Math.cos(a) * 8.6, st.y + 1.9, st.z + Math.sin(a) * 8.6);
      camera.lookAt(st.x, st.y + 0.75, st.z);
      sun.position.set(st.x + 60, 110, st.z - 45);
      sun.target.position.set(st.x, 0, st.z);
      sun.target.updateMatrixWorld();
      placeSun();
      post.render(scene, camera, time, 0);
      return;
    }

    grace = Math.max(0, grace - dt);
    drive(dt, readInput());
    updateTraffic(dt);
    const sirenNear = updatePolice(dt);
    updateCheckpoint(dt);

    cabrio.position.set(st.x, st.y, st.z);
    cabrio.rotation.set(st.pitch, st.heading, st.roll, 'YXZ');
    cabrio.updateMatrixWorld(true);
    CC.animateCabrio(refs, st, time);

    // Keep the shadow frustum on the car; a world-sized one would be mush.
    sun.position.set(st.x + 60, 110, st.z - 45);
    sun.target.position.set(st.x, 0, st.z);
    sun.target.updateMatrixWorld();

    for (const c of world.clouds.children) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 2400) c.position.x -= 4800;   // long sessions drift far
    }

    snd.update(dt, st.rpm, keys.has('w') || keys.has('arrowup') || touch.gas ? 1 : 0,
      Math.abs(st.speed), Math.abs(st.lateral), sirenNear);
    if (snd.radioOn && (!snd.nextBar || snd.ctx.currentTime > snd.nextBar)) {
      snd.radioTick();
      snd.nextBar = (snd.ctx ? snd.ctx.currentTime : 0) + 1.5;
    }

    updateCamera(dt);
    drawHud(dt);
    placeSun();
    // The smear only really shows above about 120 km/h, and never in the
    // cinematic rig where the car is meant to be the subject.
    const motion = st.cam === 3 ? 0
      : T.MathUtils.clamp((Math.abs(st.speed) - 26) / 90, 0, 1) * 0.055;
    post.render(scene, camera, time, motion);
  }

  /* The sun disc rides with the camera so it stays in the sky rather than
     falling behind, and it is the one genuinely over-bright thing in the
     scene — without it there is nothing for the bloom to catch. */
  const SUN_DIR = new T.Vector3(0.46, 0.79, -0.35).normalize();
  function placeSun() {
    if (!world.sunSprite) return;
    world.sunSprite.position.copy(camera.position).addScaledVector(SUN_DIR, 2100);
  }

  // -------------------------------------------------------------------- setup

  function bindInput() {
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (!keys.has(k)) {
        if (k === 'c') { st.cam = (st.cam + 1) % CAMS.length; flash('Kamera: ' + CAMS[st.cam]); }
        if (k === 'h') snd.horn();
        if (k === 'm') { snd.muted = !snd.muted; flash(snd.muted ? 'Ton aus' : 'Ton an'); }
        if (k === 'r') { snd.radioOn = !snd.radioOn; flash(snd.radioOn ? 'Radio: FM 1' : 'Radio aus'); }
        if (k === 't') { respawn(); flash('Zurück auf die Straße'); }
        if (k === 'p') { post.enabled = !post.enabled; flash(post.enabled ? 'Filmlook an' : 'Filmlook aus'); }
      }
      keys.add(k);
    });
    addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => keys.clear());

    for (const [id, prop, val] of [['t-left', 'steer', 1], ['t-right', 'steer', -1],
      ['t-gas', 'gas', 1], ['t-brake', 'brake', 1]]) {
      const el = document.getElementById(id);
      const on = (e) => { e.preventDefault(); touch[prop] = val; };
      const off = (e) => { e.preventDefault(); touch[prop] = 0; };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    }
  }

  CC.init = function () {
    // three r147 ships with legacy colour handling: hex values are pushed
    // straight into a linear pipeline and everything comes out washed out.
    // Turning legacy mode off makes setHex mean sRGB, which is what we type.
    T.ColorManagement.legacyMode = false;

    const app = document.getElementById('app');
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    // Tone mapping and the sRGB curve are applied by the composite pass, so
    // the scene has to arrive there as linear HDR.
    renderer.outputEncoding = T.LinearEncoding;
    renderer.toneMapping = T.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    app.insertBefore(renderer.domElement, app.firstChild);

    scene = new T.Scene();
    scene.fog = new T.FogExp2(0x9fbdd8, 0.00072);
    // Near plane has to clear the steering wheel, which sits 30 cm from the eye.
    camera = new T.PerspectiveCamera(70, innerWidth / innerHeight, 0.06, 4000);

    // The environment map already fills in the ambient term, so the hemisphere
    // light only lifts the shadowed sides a little.
    scene.add(new T.HemisphereLight(0xa8c8ea, 0x4a5730, 0.35));
    sun = new T.DirectionalLight(0xfff1d6, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
    sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
    sun.shadow.camera.near = 20; sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.0012;
    scene.add(sun, sun.target);

    world = CC.buildWorld(scene, renderer);
    miniPath = world.samples.filter((_, i) => i % 6 === 0).map((s) => [s.x, s.z]);

    const built = CC.buildCabrio(localStorage.getItem('cc-paint') || 'Alpinweiß');
    cabrio = built.group;
    refs = built.refs;
    scene.add(cabrio);

    spawnTraffic();
    st.u = 0.02;
    respawn();
    nextCheckpoint(true);

    ui = {
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      mission: document.getElementById('mission'),
      damage: document.getElementById('damage-bar'),
      msg: document.getElementById('msg'),
      speedoCtx: document.getElementById('speedo').getContext('2d'),
      miniCtx: document.getElementById('minimap').getContext('2d'),
    };

    post = CC.createPost(renderer);
    post.setSize(innerWidth, innerHeight);

    bindInput();
    addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      post.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    });

    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  /* Drop the car onto any point of the circuit, 0–1 along its length. Handy
     for looking at one section without driving there; used by make_preview.js. */
  CC.teleport = function (u) {
    st.u = ((u % 1) + 1) % 1;
    respawn();
    nextCheckpoint(true);
  };

  CC.stats = function () {
    return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  };

  CC.setPaint = function (paint) {
    if (!refs || !CC.PAINTS[paint]) return;
    refs.paint.color.setHex(CC.PAINTS[paint]);
    localStorage.setItem('cc-paint', paint);
  };

  CC.start = function (paint) {
    CC.setPaint(paint);
    snd.start();
    started = true;
    last = performance.now();
  };
})();
