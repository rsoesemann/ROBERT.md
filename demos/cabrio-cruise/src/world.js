/* The world: circuit, terrain, road surface, roadside props, sky.
   Everything is generated from a seeded PRNG, so the map is the same on every
   load and can be described in the README without screenshots going stale. */
(function () {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const T = THREE;

  const WORLD = 4200;   // side of the ground plane, metres
  const GRID = 180;     // terrain vertices per side
  const SAMPLES = 1100; // road cross-sections, spaced by arc length

  /* Circuit control points, metres. The first four make the Autobahn straight
     down the east side; the rest wind back west through fields, a freight yard
     and a stretch of forest. */
  const NODES = [
    [880, -700], [900, -300], [900, 100], [880, 480],
    [720, 780], [430, 900], [110, 870], [-210, 770],
    [-520, 690], [-780, 500], [-880, 190], [-750, -140],
    [-500, -360], [-250, -570], [70, -770], [430, -830],
  ];
  const KINDS = [
    'autobahn', 'autobahn', 'autobahn', 'autobahn',
    'exit', 'country', 'industrial', 'industrial',
    'country', 'country', 'forest', 'forest',
    'country', 'country', 'country', 'country',
  ];
  const HALF = { autobahn: 8.6, exit: 6.2, country: 3.9, forest: 3.9, industrial: 4.8 };

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20260802);
  const rr = (a, b) => a + rnd() * (b - a);

  /* Large-scale relief. The road follows this exactly, so it stays smooth; the
     terrain adds detail on top everywhere except right next to the asphalt. */
  function baseHeight(x, z) {
    return 6.5 * Math.sin(x / 430) * Math.cos(z / 390)
         + 3.5 * Math.sin((x + z) / 265)
         + 2.0 * Math.cos((x - z * 0.6) / 620);
  }
  function detailHeight(x, z) {
    return 2.3 * Math.sin(x / 71 + 1.3) * Math.sin(z / 84)
         + 1.1 * Math.sin(x / 31) * Math.cos(z / 27)
         + 0.5 * Math.sin(x / 11.5 + z / 13);
  }

  // ---------------------------------------------------------------- road index

  /* Nearest-point lookup on the road, bucketed into a uniform grid. Used by the
     terrain build, by off-road detection and by the minimap. */
  class RoadIndex {
    constructor(samples) {
      this.samples = samples;
      this.cell = 64;
      this.buckets = new Map();
      samples.forEach((s, i) => {
        const key = this.key(s.x, s.z);
        let b = this.buckets.get(key);
        if (!b) this.buckets.set(key, (b = []));
        b.push(i);
      });
    }
    key(x, z) {
      return ((Math.floor(x / this.cell) + 512) << 11) | (Math.floor(z / this.cell) + 512);
    }
    nearest(x, z) {
      const cx = Math.floor(x / this.cell);
      const cz = Math.floor(z / this.cell);
      let best = null;
      let bestD = Infinity;
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          const b = this.buckets.get(((ix + 512) << 11) | (iz + 512));
          if (!b) continue;
          for (const i of b) {
            const s = this.samples[i];
            const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
            if (d < bestD) { bestD = d; best = s; }
          }
        }
      }
      return best ? { s: best, dist: Math.sqrt(bestD) } : null;
    }
  }

  // ------------------------------------------------------------------ textures

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function texture(c, repX, repY) {
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    t.wrapS = T.ClampToEdgeWrapping;
    t.wrapT = T.RepeatWrapping;
    t.repeat.set(repX || 1, repY || 1);
    return t;
  }
  function noiseOver(g, w, h, n, alpha) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(255,255,255,${alpha})`;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
      g.fillStyle = `rgba(0,0,0,${alpha})`;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  }

  /* One tile spans the full road width horizontally and 18 m of tarmac
     vertically, which is exactly one German dash cycle (6 m line, 12 m gap). */
  function asphaltTexture(kind) {
    const W = 512, H = 512;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    g.fillStyle = kind === 'industrial' ? '#4a4a4c' : '#494b50';
    g.fillRect(0, 0, W, H);
    noiseOver(g, W, H, 9000, 0.05);

    const line = (u, width, dashed) => {
      g.fillStyle = '#e9e9e4';
      const x = u * W - width / 2;
      if (dashed) g.fillRect(x, 0, width, H / 3);
      else g.fillRect(x, 0, width, H);
    };
    if (kind === 'autobahn') {
      line(0.045, 7, false); line(0.955, 7, false);   // hard-shoulder edges
      line(0.28, 5, true); line(0.72, 5, true);       // lane dividers
      line(0.487, 5, false); line(0.513, 5, false);   // double centre line
    } else if (kind === 'exit') {
      line(0.06, 6, false); line(0.94, 6, false);
      line(0.5, 5, true);
    } else if (kind === 'industrial') {
      line(0.07, 5, false); line(0.93, 5, false);
      line(0.5, 5, false);
    } else {
      line(0.065, 5, false); line(0.935, 5, false);
      line(0.5, 5, true);
    }
    // Worn wheel tracks either side of the centre line.
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(0.30 * W, 0, 0.10 * W, H);
    g.fillRect(0.60 * W, 0, 0.10 * W, H);
    return texture(c, 1, 1);
  }

  /* Aggregate bump for the tarmac, shared by every road type. Built as a
     height field of overlapping blobs and then differenced into a normal map —
     without it the asphalt is a flat grey ribbon under any lighting model. */
  let asphaltNormalCache = null;
  function asphaltNormal() {
    if (asphaltNormalCache) return asphaltNormalCache;
    const N = 256;
    const h = new Float32Array(N * N);
    for (let i = 0; i < 5200; i++) {
      const cx = rnd() * N, cy = rnd() * N, r = 1.2 + rnd() * 3.4;
      const amp = (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.75);
      const r0 = Math.ceil(r);
      for (let y = -r0; y <= r0; y++) {
        for (let x = -r0; x <= r0; x++) {
          const d = Math.hypot(x, y);
          if (d > r) continue;
          const px = (((cx + x) | 0) + N) % N;
          const py = (((cy + y) | 0) + N) % N;
          h[py * N + px] += amp * (1 - d / r);
        }
      }
    }
    const c = canvas(N, N);
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    const at = (x, y) => h[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = at(x + 1, y) - at(x - 1, y);
        const dy = at(x, y + 1) - at(x, y - 1);
        // Pack a unit normal of (-dx, -dy, 1) into RGB.
        const len = Math.hypot(dx, dy, 1);
        const o = (y * N + x) * 4;
        img.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
        img.data[o + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
        img.data[o + 2] = (1 / len) * 0.5 * 255 + 127.5;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c);
    t.wrapS = T.RepeatWrapping;
    t.wrapT = T.RepeatWrapping;
    t.repeat.set(6, 26);
    t.anisotropy = 8;
    asphaltNormalCache = t;
    return t;
  }

  function skyTexture() {
    const c = canvas(8, 256);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, '#1c4fa8');
    grad.addColorStop(0.35, '#3f83d8');
    grad.addColorStop(0.72, '#9cc6ee');
    grad.addColorStop(1.00, '#dbe8f2');
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 256);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  function cloudTexture() {
    const c = canvas(512, 256);
    const g = c.getContext('2d');
    g.scale(2, 2);
    for (let i = 0; i < 34; i++) {
      const x = 34 + rnd() * 188;
      const y = 86 - Math.pow(rnd(), 1.7) * 56;
      const r = 10 + rnd() * 30;
      const grd = g.createRadialGradient(x, y, r * 0.2, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.6, 'rgba(250,252,255,0.55)');
      grd.addColorStop(1, 'rgba(230,240,250,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  /* German road signs, drawn rather than downloaded so the page stays offline. */
  function signTexture(kind) {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    if (kind === 'direction') {
      g.fillStyle = '#f2c31c'; g.fillRect(0, 48, 256, 160);
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 5; g.strokeRect(3, 51, 250, 154);
      g.fillStyle = '#141414';
      g.font = 'bold 30px sans-serif';
      g.fillText('Hausach', 22, 104);
      g.fillText('Schönenberg', 22, 146);
      g.font = 'bold 24px sans-serif';
      g.fillText('▲  Zell', 22, 188);
    } else if (kind === 'autobahn') {
      g.fillStyle = '#0a4a9c'; g.fillRect(0, 40, 256, 176);
      g.fillStyle = '#fff';
      g.font = 'bold 100px sans-serif'; g.fillText('A5', 60, 160);
    } else if (kind === 'arrow') {
      g.fillStyle = '#0a4a9c';
      g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(128, 40); g.lineTo(190, 118); g.lineTo(154, 118);
      g.lineTo(154, 208); g.lineTo(102, 208); g.lineTo(102, 118);
      g.lineTo(66, 118); g.closePath(); g.fill();
    } else { // speed limit
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(128, 128, 122, 0, 7); g.fill();
      g.fillStyle = '#c8102e';
      g.beginPath(); g.arc(128, 128, 122, 0, 7); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(128, 128, 92, 0, 7); g.fill();
      g.fillStyle = '#141414';
      g.font = 'bold 96px sans-serif';
      g.fillText(kind === 'speed100' ? '100' : '70', kind === 'speed100' ? 48 : 68, 162);
    }
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  function trailerTexture(name, color) {
    const c = canvas(512, 128);
    const g = c.getContext('2d');
    g.fillStyle = '#f2f3f0'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let x = 0; x < 512; x += 16) g.fillRect(x, 0, 2, 128);
    g.fillStyle = color;
    g.font = 'bold 46px sans-serif';
    g.fillText(name, 40, 74);
    g.fillStyle = '#4a4a4a'; g.fillRect(0, 112, 512, 16);
    return texture(c, 1, 1);
  }

  // ------------------------------------------------------------------ builders

  function buildSky(scene) {
    const sky = new T.Mesh(
      new T.SphereGeometry(2600, 32, 20),
      new T.MeshBasicMaterial({ map: skyTexture(), side: T.BackSide, fog: false, depthWrite: false })
    );
    sky.renderOrder = -1;
    scene.add(sky);

    // Three different puff patterns, otherwise the sky reads as wallpaper.
    const cloudMats = [0, 1, 2].map(() => new T.SpriteMaterial({
      map: cloudTexture(), transparent: true, opacity: 0.92,
      depthWrite: false, fog: false,
    }));
    const clouds = new T.Group();
    for (let i = 0; i < 30; i++) {
      const s = new T.Sprite(cloudMats[i % 3]);
      const a = rnd() * Math.PI * 2;
      const r = 800 + rnd() * 1500;
      const scale = 320 + rnd() * 620;
      s.position.set(Math.cos(a) * r, 300 + rnd() * 400, Math.sin(a) * r);
      s.scale.set(scale, scale * (0.38 + rnd() * 0.2), 1);
      s.userData.drift = 2 + rnd() * 4;
      clouds.add(s);
    }
    scene.add(clouds);

    /* The sun disc. Its colour is set past 1.0 in linear space on purpose —
       it is the only real highlight in the scene, and without something over
       the bloom threshold the glare pass finds nothing to work with. */
    const discC = canvas(128, 128);
    const dg = discC.getContext('2d');
    const grd = dg.createRadialGradient(64, 64, 2, 64, 64, 62);
    grd.addColorStop(0.00, 'rgba(255,255,255,1)');
    grd.addColorStop(0.16, 'rgba(255,250,232,0.95)');
    grd.addColorStop(0.42, 'rgba(255,238,196,0.30)');
    grd.addColorStop(1.00, 'rgba(255,232,180,0)');
    dg.fillStyle = grd;
    dg.fillRect(0, 0, 128, 128);
    const sunTex = new T.CanvasTexture(discC);
    const sunMat = new T.SpriteMaterial({
      map: sunTex, transparent: true, depthWrite: false, depthTest: false, fog: false,
    });
    sunMat.color.setRGB(7.5, 6.4, 4.6);
    const sunSprite = new T.Sprite(sunMat);
    sunSprite.scale.set(340, 340, 1);
    sunSprite.renderOrder = -1;
    scene.add(sunSprite);

    return { clouds, sunSprite };
  }

  /* Reflection probe. A tiny stand-in world — sky gradient above, ground
     colour below — baked once through PMREM. Cheap, and it is the difference
     between painted plastic and something that looks like a car. */
  function buildEnvironment(renderer) {
    const probe = new T.Scene();
    const dome = new T.Mesh(
      new T.SphereGeometry(60, 24, 16),
      new T.MeshBasicMaterial({ map: skyTexture(), side: T.BackSide })
    );
    probe.add(dome);
    const floor = new T.Mesh(
      new T.CircleGeometry(58, 24).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({ color: 0x6d7a56 })
    );
    floor.position.y = -0.5;
    probe.add(floor);

    const pmrem = new T.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const target = pmrem.fromScene(probe, 0.04, 0.1, 200);
    pmrem.dispose();
    dome.geometry.dispose();
    floor.geometry.dispose();
    return target.texture;
  }

  function buildRoad(curve, samples, groups) {
    const meshes = [];
    const mats = {};
    for (const kind of Object.keys(HALF)) {
      mats[kind] = new T.MeshStandardMaterial({
        map: asphaltTexture(kind), normalMap: asphaltNormal(),
        normalScale: new T.Vector2(0.55, 0.55), roughness: 0.78, metalness: 0.0,
      });
    }
    const vergeMat = new T.MeshStandardMaterial({ color: 0x6e6a55, roughness: 0.95 });

    for (const g of groups) {
      const pos = [], uv = [], idx = [];
      const vpos = [], vidx = [];
      let v = 0, vv = 0;
      for (let k = g.from; k <= g.to; k++) {
        const s = samples[k % samples.length];
        const h = s.half;
        pos.push(s.x + s.nx * h, s.y + 0.05, s.z + s.nz * h);
        pos.push(s.x - s.nx * h, s.y + 0.05, s.z - s.nz * h);
        uv.push(0, s.dist / 18, 1, s.dist / 18);
        // Gravel verge, a touch lower so it never pokes through the tarmac.
        vpos.push(s.x + s.nx * (h + 1.5), s.y + 0.01, s.z + s.nz * (h + 1.5));
        vpos.push(s.x - s.nx * (h + 1.5), s.y + 0.01, s.z - s.nz * (h + 1.5));
        if (k > g.from) {
          idx.push(v - 2, v - 1, v, v - 1, v + 1, v);
          vidx.push(vv - 2, vv - 1, vv, vv - 1, vv + 1, vv);
        }
        v += 2; vv += 2;
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const m = new T.Mesh(geo, mats[g.kind]);
      m.receiveShadow = true;
      meshes.push(m);

      const vgeo = new T.BufferGeometry();
      vgeo.setAttribute('position', new T.Float32BufferAttribute(vpos, 3));
      vgeo.setIndex(vidx);
      vgeo.computeVertexNormals();
      const vm = new T.Mesh(vgeo, vergeMat);
      vm.receiveShadow = true;
      meshes.push(vm);
    }
    return meshes;
  }

  /* How far from the road the rolling detail is suppressed. The freight yard
     needs a much wider flat area than a country lane, or the halls and parked
     trailers end up floating over the bumps. */
  function flatTo(near) {
    return near && near.s.kind === 'industrial' ? 135 : 42;
  }

  /* Fine grass speckle. Vertices sit ~21 m apart, far too coarse to carry any
     surface detail on their own, so a tiled map does it instead. */
  function grassTexture() {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 150 + Math.floor(rnd() * 105);
      g.fillStyle = `rgba(${v},${v},${v},0.45)`;
      g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 3);
    }
    // One tile covers ~46 m, so only these broad blotches survive mip-mapping.
    for (let i = 0; i < 70; i++) {
      const x = rnd() * 256, y = rnd() * 256, r = 16 + rnd() * 52;
      const grd = g.createRadialGradient(x, y, 1, x, y, r);
      const dark = rnd() < 0.55;
      grd.addColorStop(0, dark ? 'rgba(128,142,108,0.42)' : 'rgba(255,252,226,0.34)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    const t = texture(c, WORLD / 46, WORLD / 46);
    t.wrapS = T.RepeatWrapping;
    return t;
  }

  function buildTerrain(index) {
    const geo = new T.PlaneGeometry(WORLD, WORLD, GRID, GRID);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const meadow = new T.Color(0x6f8f45);
    const dry = new T.Color(0xb3a765);
    const dark = new T.Color(0x4c6a33);
    const c = new T.Color();

    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const near = index.nearest(x, z);
      const half = near ? near.s.half : 6;
      const d = near ? near.dist : 999;
      const damp = T.MathUtils.smoothstep(d, half + 2.5, half + flatTo(near));
      p.setY(i, baseHeight(x, z) + detailHeight(x, z) * damp);

      // Fields come in patches: mown yellow, meadow green, darker pasture.
      const f = Math.sin(x / 118 + 2.1) * Math.cos(z / 104) + 0.7 * Math.sin((x + z) / 71);
      c.copy(f > 0.62 ? dry : f < -0.45 ? dark : meadow);
      c.offsetHSL(0, 0, (Math.sin(x / 19) * Math.cos(z / 23)) * 0.035);
      if (d < half + 6) c.lerp(dark, 0.35); // trodden strip along the tarmac
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({
      vertexColors: true, map: grassTexture(), roughness: 0.97, metalness: 0.0,
    }));
    mesh.receiveShadow = true;
    return mesh;
  }

  /* Two rings of broad, low mounds closing the horizon. Anything pointier
     reads as the Alps rather than the Black Forest.

     These cones are hundreds of metres across, so a naive ring drops them on
     top of the circuit and the car ends up driving inside a mountain. Every
     candidate is pushed outwards until it clears the road. */
  function buildHills(scene, samples) {
    const mat = new T.MeshStandardMaterial({ color: 0x4c6b52, roughness: 1.0 });
    const group = new T.Group();
    // The bucketed RoadIndex only looks one cell out, which is useless at this
    // range, so scan a thinned-out copy of the centreline instead.
    const coarse = samples.filter((_, i) => i % 6 === 0);
    const distToRoad = (x, z) => {
      let best = Infinity;
      for (const s of coarse) {
        const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
        if (d < best) best = d;
      }
      return Math.sqrt(best);
    };
    for (const [count, radius, lo, hi] of [[32, 1650, 70, 165], [24, 1950, 120, 240]]) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rr(-0.08, 0.08);
        const foot = rr(260, 560);
        const h = rr(lo, hi);
        let r = radius + rr(-100, 160);
        let x = 0, z = 0, ok = false;
        for (let tries = 0; tries < 6; tries++) {
          x = Math.cos(a) * r; z = Math.sin(a) * r;
          if (distToRoad(x, z) > foot + 90) { ok = true; break; }
          r += 140;
        }
        if (!ok) continue;
        const cone = new T.Mesh(new T.ConeGeometry(foot, h, 6), mat);
        cone.position.set(x, h / 2 - 45, z);
        cone.rotation.y = rnd() * 3;
        group.add(cone);
      }
    }
    scene.add(group);
  }

  /* Reusable helper: fill an InstancedMesh from a list of transforms.
     Nothing here casts a shadow by default: an InstancedMesh is culled as one
     object, so its bounding sphere always covers the map and every instance
     would be re-rendered into the shadow map on every frame. */
  function instance(geo, mat, list, scene, tint, cast) {
    if (!list.length) return null;
    const m = new T.InstancedMesh(geo, mat, list.length);
    const dummy = new T.Object3D();
    const col = new T.Color();
    list.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
      dummy.scale.setScalar(t.s || 1);
      if (t.sy) dummy.scale.y = (t.s || 1) * t.sy;
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (tint) {
        col.set(tint).offsetHSL(rr(-0.03, 0.03), rr(-0.08, 0.08), rr(-0.09, 0.09));
        m.setColorAt(i, col);
      }
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = !!cast;
    scene.add(m);
    return m;
  }

  function buildProps(scene, samples, colliders) {
    const trunks = [], leafy = [], firs = [], bushes = [], posts = [], rails = [];
    const guardPosts = [], guardRail = [];
    const props = new T.Group();
    scene.add(props);

    const groundAt = (x, z) => baseHeight(x, z) + detailHeight(x, z);

    const addTree = (x, z, kind) => {
      const y = groundAt(x, z);
      const s = rr(0.75, 1.5);
      trunks.push({ x, y, z, s, ry: rnd() * 3 });
      if (kind === 'fir') firs.push({ x, y, z, s, ry: rnd() * 3 });
      else leafy.push({ x, y, z, s, ry: rnd() * 3, sy: rr(0.8, 1.25) });
      colliders.circles.push({ x, z, r: 0.9 * s, kind: 'tree' });
    };

    // -- roadside pass -------------------------------------------------------
    for (let i = 0; i < samples.length; i += 3) {
      const s = samples[i];
      const y = s.y;
      const both = [1, -1];

      if (s.kind === 'country' || s.kind === 'exit') {
        for (const side of both) {
          if (rnd() < 0.30) {
            const o = s.half + rr(6, 55);
            addTree(s.x + s.nx * side * o, s.z + s.nz * side * o, rnd() < 0.25 ? 'fir' : 'leafy');
          }
          if (rnd() < 0.12) {
            const o = s.half + rr(3, 7);
            const x = s.x + s.nx * side * o, z = s.z + s.nz * side * o;
            bushes.push({ x, y: groundAt(x, z), z, s: rr(0.7, 1.4), ry: rnd() * 3 });
          }
        }
        if (i % 24 === 0) { // wooden field fence on one side
          const side = (i % 48 === 0) ? 1 : -1;
          const o = s.half + 9;
          const x = s.x + s.nx * side * o, z = s.z + s.nz * side * o;
          posts.push({ x, y: groundAt(x, z), z, ry: Math.atan2(s.tx, s.tz) });
          rails.push({ x, y: groundAt(x, z) + 0.75, z, ry: Math.atan2(s.tx, s.tz) });
          rails.push({ x, y: groundAt(x, z) + 0.42, z, ry: Math.atan2(s.tx, s.tz) });
        }
      } else if (s.kind === 'forest') {
        for (const side of both) {
          for (let k = 0; k < 2; k++) {
            if (rnd() < 0.75) {
              const o = s.half + rr(4.5, 48);
              addTree(s.x + s.nx * side * o, s.z + s.nz * side * o, rnd() < 0.7 ? 'fir' : 'leafy');
            }
          }
        }
      } else if (s.kind === 'autobahn') {
        for (const side of both) {
          const o = s.half + 1.9;
          const x = s.x + s.nx * side * o, z = s.z + s.nz * side * o;
          guardPosts.push({ x, y: y - 0.1, z, ry: Math.atan2(s.tx, s.tz) });
          if (rnd() < 0.16) {
            const to = s.half + rr(26, 80);
            addTree(s.x + s.nx * side * to, s.z + s.nz * side * to, rnd() < 0.5 ? 'fir' : 'leafy');
          }
        }
      }
    }

    /* Per-instance colours come from InstancedMesh.instanceColor and need no
       flag on the material. Setting vertexColors here would make the shader
       look for a per-vertex `color` attribute that does not exist, and the
       foliage would render black. */
    const barkMat = new T.MeshStandardMaterial({ color: 0x6b543a, roughness: 0.95 });
    const leafMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
    const firMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const bushMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });

    const trunkGeo = new T.CylinderGeometry(0.17, 0.28, 3.4, 6).translate(0, 1.7, 0);
    const leafGeo = new T.IcosahedronGeometry(2.7, 0).translate(0, 4.9, 0);
    const firGeo = new T.ConeGeometry(2.0, 8.0, 7).translate(0, 4.6, 0);
    const bushGeo = new T.IcosahedronGeometry(1.15, 0).translate(0, 0.95, 0);

    instance(trunkGeo, barkMat, trunks, props);
    instance(leafGeo, leafMat, leafy, props, 0x4f7a2e);
    instance(firGeo, firMat, firs, props, 0x2f5a2c);
    instance(bushGeo, bushMat, bushes, props, 0x5b8438);

    instance(new T.BoxGeometry(0.09, 1.15, 0.09).translate(0, 0.58, 0),
      new T.MeshStandardMaterial({ color: 0x8a7350, roughness: 0.92 }), posts, props);
    instance(new T.BoxGeometry(0.06, 0.09, 9).translate(0, 0, 4.5),
      new T.MeshStandardMaterial({ color: 0x9a835f, roughness: 0.92 }), rails, props);

    instance(new T.BoxGeometry(0.12, 0.9, 0.12).translate(0, 0.45, 0),
      new T.MeshStandardMaterial({ color: 0x8d949b, roughness: 0.55, metalness: 0.6 }), guardPosts, props);
    buildGuardrails(props, samples);

    return props;
  }

  /* One continuous ribbon per side rather than instanced segments: instanced
     boxes at every third sample leave 12 m gaps, and closing them costs
     thousands of instances that never get frustum culled. */
  function buildGuardrails(parent, samples) {
    const mat = new T.MeshStandardMaterial({
      color: 0xb6bcc2, roughness: 0.34, metalness: 0.85, side: T.DoubleSide,
    });
    for (const side of [1, -1]) {
      const pos = [], idx = [];
      let v = 0, run = 0;
      for (let i = 0; i <= samples.length; i++) {
        const s = samples[i % samples.length];
        if (s.kind !== 'autobahn') { run = 0; continue; }   // never bridge a gap
        const o = s.half + 1.9;
        const x = s.x + s.nx * side * o, z = s.z + s.nz * side * o;
        pos.push(x, s.y + 0.42, z, x, s.y + 0.86, z);
        if (run > 0) idx.push(v - 2, v - 1, v, v - 1, v + 1, v);
        v += 2; run++;
      }
      if (!idx.length) continue;
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      parent.add(new T.Mesh(geo, mat));
    }
  }

  function buildFreightYard(scene, samples, colliders) {
    const yard = new T.Group();
    scene.add(yard);
    const wallMat = new T.MeshStandardMaterial({ color: 0xdfe2e0, roughness: 0.72, metalness: 0.15 });
    const roofMat = new T.MeshStandardMaterial({ color: 0x8f9499, roughness: 0.6, metalness: 0.35 });
    const bandMat = new T.MeshStandardMaterial({ color: 0xf0a821, roughness: 0.6 });
    const tarmacMat = new T.MeshStandardMaterial({ color: 0x585a5c, roughness: 0.85 });
    const cabColors = [0xd23b2e, 0x2f6fc4, 0xf0f0f0, 0x2fa05a, 0xe8b21c];
    const brands = [
      ['TRANSPO', '#c0392b'], ['BERGMANN', '#1f5fa8'], ['SÜDLOG', '#2e7d4f'],
      ['KRAFT', '#b03a2e'], ['RHEIN CARGO', '#1a5276'],
    ];
    const trailerMats = brands.map(([n, c]) =>
      new T.MeshStandardMaterial({ map: trailerTexture(n, c), roughness: 0.62, metalness: 0.1 }));

    const industrial = samples.filter((s) => s.kind === 'industrial');
    if (!industrial.length) return yard;

    for (let n = 0; n < 9; n++) {
      const s = industrial[Math.floor((n + 0.5) / 9 * industrial.length)];
      const side = n % 2 ? 1 : -1;
      // Far enough back that the trailer rows in front of the loading doors
      // still land well clear of the carriageway.
      const o = s.half + rr(62, 100);
      const cx = s.x + s.nx * side * o;
      const cz = s.z + s.nz * side * o;
      const y = baseHeight(cx, cz);
      const ry = Math.atan2(s.tx, s.tz) + rr(-0.12, 0.12);
      const w = rr(26, 52), d = rr(16, 30), h = rr(7, 11);

      const hall = new T.Mesh(new T.BoxGeometry(w, h, d), wallMat);
      hall.position.set(cx, y + h / 2, cz);
      hall.rotation.y = ry;
      hall.castShadow = true; hall.receiveShadow = true;
      yard.add(hall);

      const roof = new T.Mesh(new T.BoxGeometry(w + 1.2, 0.5, d + 1.2), roofMat);
      roof.position.set(cx, y + h + 0.25, cz);
      roof.rotation.y = ry;
      yard.add(roof);

      const band = new T.Mesh(new T.BoxGeometry(w + 0.2, 1.1, d + 0.2), bandMat);
      band.position.set(cx, y + h * 0.72, cz);
      band.rotation.y = ry;
      yard.add(band);

      colliders.boxes.push({ x: cx, z: cz, hx: w / 2, hz: d / 2, ry });

      // Apron with a row of parked trailers facing the loading doors. The
      // terrain is flattened this far out, so a plain quad lies flush.
      const apron = new T.Mesh(new T.PlaneGeometry(w + 22, d + 20), tarmacMat);
      apron.rotation.x = -Math.PI / 2;
      apron.rotation.z = ry;
      apron.position.set(cx, y + 0.05, cz);
      apron.receiveShadow = true;
      yard.add(apron);

      const rows = 3 + Math.floor(rnd() * 4);
      for (let k = 0; k < rows; k++) {
        const px = cx + Math.cos(ry) * (k - rows / 2) * 4.2 - Math.sin(ry) * (d / 2 + 9);
        const pz = cz - Math.sin(ry) * (k - rows / 2) * 4.2 - Math.cos(ry) * (d / 2 + 9);
        const py = baseHeight(px, pz);
        const box = new T.Mesh(new T.BoxGeometry(2.55, 2.9, 13.6), trailerMats[(n + k) % trailerMats.length]);
        box.position.set(px, py + 2.6, pz);
        box.rotation.y = ry + Math.PI / 2;
        box.castShadow = true;
        yard.add(box);
        if (k % 2 === 0) {
          const cab = new T.Mesh(new T.BoxGeometry(2.5, 3.0, 5.4),
            new T.MeshStandardMaterial({
              color: cabColors[(n + k) % cabColors.length], roughness: 0.34, metalness: 0.5,
            }));
          cab.position.set(px + Math.cos(ry + Math.PI / 2) * 9.4, py + 1.8, pz - Math.sin(ry + Math.PI / 2) * 9.4);
          cab.rotation.y = ry + Math.PI / 2;
          cab.castShadow = true;
          yard.add(cab);
        }
        colliders.boxes.push({ x: px, z: pz, hx: 1.5, hz: 7.2, ry: ry + Math.PI / 2 });
      }
    }
    return yard;
  }

  function buildSigns(scene, samples, colliders) {
    const group = new T.Group();
    scene.add(group);
    const poleMat = new T.MeshStandardMaterial({ color: 0x9aa1a7, roughness: 0.5, metalness: 0.6 });
    const poleGeo = new T.CylinderGeometry(0.07, 0.07, 4.4, 6);
    const plan = [
      ['direction', 0.965, 3.4, 2.4], ['autobahn', 0.985, 2.6, 1.7],
      ['arrow', 0.10, 1.5, 1.5], ['speed100', 0.22, 1.6, 1.6],
      ['direction', 0.53, 3.4, 2.4], ['speed70', 0.61, 1.6, 1.6],
      ['arrow', 0.78, 1.5, 1.5], ['speed70', 0.36, 1.6, 1.6],
      ['direction', 0.30, 3.4, 2.4],
    ];
    for (const [kind, u, w, h] of plan) {
      const s = samples[Math.floor(u * samples.length) % samples.length];
      const o = s.half + 3.4;
      const x = s.x - s.nx * o, z = s.z - s.nz * o;   // right-hand side of travel
      const y = baseHeight(x, z);
      const ry = Math.atan2(s.tx, s.tz) + Math.PI;

      const pole = new T.Mesh(poleGeo, poleMat);
      pole.position.set(x, y + 2.2, z);
      group.add(pole);

      const face = new T.Mesh(
        new T.PlaneGeometry(w, h),
        new T.MeshStandardMaterial({
          map: signTexture(kind), transparent: true, side: T.DoubleSide,
          roughness: 0.42, metalness: 0.1,
        })
      );
      face.position.set(x, y + 3.6, z);
      face.rotation.y = ry;
      face.castShadow = true;
      group.add(face);
      colliders.circles.push({ x, z, r: 0.5, kind: 'sign' });
    }

    // Street lamps along the Autobahn and through the freight yard.
    const lampPole = new T.CylinderGeometry(0.10, 0.14, 9, 6).translate(0, 4.5, 0);
    const lampArm = new T.BoxGeometry(0.12, 0.12, 2.2).translate(0, 9, 1.1);
    const lampHead = new T.BoxGeometry(0.5, 0.22, 1.0).translate(0, 8.92, 2.1);
    const lampMat = new T.MeshStandardMaterial({ color: 0x9aa1a7, roughness: 0.5, metalness: 0.6 });
    const lamps = [];
    for (let i = 0; i < samples.length; i += 14) {
      const s = samples[i];
      if (s.kind !== 'autobahn' && s.kind !== 'industrial') continue;
      const o = s.half + 3.0;
      const x = s.x - s.nx * o, z = s.z - s.nz * o;
      lamps.push({ x, y: baseHeight(x, z), z, ry: Math.atan2(s.tx, s.tz) + Math.PI / 2 });
      colliders.circles.push({ x, z, r: 0.35, kind: 'lamp' });
    }
    instance(lampPole, lampMat, lamps, group);
    instance(lampArm, lampMat, lamps, group);
    instance(lampHead, new T.MeshStandardMaterial({ color: 0xb9c0c6, roughness: 0.4, metalness: 0.7 }), lamps, group);
    return group;
  }

  // ---------------------------------------------------------------------- API

  CC.buildWorld = function (scene, renderer) {
    const pts = NODES.map(([x, z]) => new T.Vector3(x, 0, z));
    for (const p of pts) p.y = baseHeight(p.x, p.z);
    const curve = new T.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    curve.arcLengthDivisions = 3000;
    const length = curve.getLength();

    const samples = [];
    for (let i = 0; i < SAMPLES; i++) {
      const u = i / SAMPLES;
      const t = curve.getUtoTmapping(u);
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t).setY(0).normalize();
      const fi = t * NODES.length;
      const i0 = Math.floor(fi) % NODES.length;
      const i1 = (i0 + 1) % NODES.length;
      const f = T.MathUtils.smoothstep(fi - Math.floor(fi), 0, 1);
      samples.push({
        i, u, t, dist: u * length,
        x: p.x, y: baseHeight(p.x, p.z), z: p.z,
        tx: tan.x, tz: tan.z,
        nx: tan.z, nz: -tan.x,                       // unit vector to the left
        half: T.MathUtils.lerp(HALF[KINDS[i0]], HALF[KINDS[i1]], f),
        kind: KINDS[f < 0.5 ? i0 : i1],
      });
    }

    // Split the ribbon where the road type changes; each piece gets its own
    // markings texture, and widths blend across the seam anyway.
    const groups = [];
    let start = 0;
    for (let i = 1; i <= SAMPLES; i++) {
      const cur = samples[i % SAMPLES].kind;
      if (cur !== samples[start].kind || i === SAMPLES) {
        groups.push({ from: start, to: i, kind: samples[start].kind });
        start = i;
      }
    }

    const index = new RoadIndex(samples);
    // Guardrails are not in here — the car clamps against the road edge on
    // Autobahn sections instead, which is cheaper and never lets you through.
    const colliders = { circles: [], boxes: [] };

    scene.environment = buildEnvironment(renderer);

    const terrain = buildTerrain(index);
    scene.add(terrain);
    for (const m of buildRoad(curve, samples, groups)) scene.add(m);
    buildHills(scene, samples);
    const { clouds, sunSprite } = buildSky(scene);
    buildProps(scene, samples, colliders);
    buildFreightYard(scene, samples, colliders);
    buildSigns(scene, samples, colliders);

    // Spatial hash over the point colliders — the car checks this every frame.
    const cGrid = new Map();
    const CELL = 24;
    const ckey = (x, z) => ((Math.floor(x / CELL) + 512) << 11) | (Math.floor(z / CELL) + 512);
    for (const c of colliders.circles) {
      const k = ckey(c.x, c.z);
      let b = cGrid.get(k);
      if (!b) cGrid.set(k, (b = []));
      b.push(c);
    }
    colliders.near = function (x, z) {
      const out = [];
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let ix = cx - 1; ix <= cx + 1; ix++)
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          const b = cGrid.get(((ix + 512) << 11) | (iz + 512));
          if (b) out.push(...b);
        }
      return out;
    };

    CC.terrainHeight = function (x, z) {
      const near = index.nearest(x, z);
      const half = near ? near.s.half : 6;
      const d = near ? near.dist : 999;
      const damp = T.MathUtils.smoothstep(d, half + 2.5, half + flatTo(near));
      return baseHeight(x, z) + detailHeight(x, z) * damp;
    };

    return { curve, samples, index, length, colliders, clouds, sunSprite, terrain, WORLD };
  };
})();
