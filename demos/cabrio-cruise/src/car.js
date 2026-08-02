/* The cars. Everything is built from boxes and cylinders — no model files, so
   the page works from a plain file:// open.

   Local axes for every vehicle: +Z is forward, +X is the driver's side (left,
   this is Germany), origin sits on the road under the middle of the car. */
(function () {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const T = THREE;

  const PAINTS = {
    'Alpinweiß': 0xeef1f2,
    'Zinnoberrot': 0xc4171c,
    'Diamantschwarz': 0x141619,
    'Lazurblau': 0x2f5f9e,
    'Bahamabeige': 0xd9c48a,
  };
  CC.PAINTS = PAINTS;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function tex(c) {
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  function roundelTexture() {
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    g.fillStyle = '#0b0b0d';
    g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.save();
    g.beginPath(); g.arc(64, 64, 44, 0, 7); g.clip();
    g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#1a6ec0';
    g.fillRect(64, 0, 64, 64); g.fillRect(0, 64, 64, 64);
    g.restore();
    g.strokeStyle = '#d8dce0'; g.lineWidth = 3;
    g.beginPath(); g.arc(64, 64, 44, 0, 7); g.stroke();
    g.fillStyle = '#f4f6f8';
    g.font = 'bold 15px sans-serif';
    g.fillText('B', 30, 27); g.fillText('M', 55, 24); g.fillText('W', 82, 27);
    return tex(c);
  }

  function plateTexture(text) {
    const c = canvas(256, 56);
    const g = c.getContext('2d');
    g.fillStyle = '#f5f5f2'; g.fillRect(0, 0, 256, 56);
    g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 52);
    g.fillStyle = '#003399'; g.fillRect(3, 3, 26, 50);
    g.fillStyle = '#ffcc00'; g.font = 'bold 11px sans-serif'; g.fillText('D', 12, 46);
    g.fillStyle = '#111'; g.font = 'bold 34px sans-serif'; g.fillText(text, 40, 42);
    return tex(c);
  }

  function rimTexture() {
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    g.fillStyle = '#20242a'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#b7bec6';
    g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.fillStyle = '#5a6069';
    for (let i = 0; i < 14; i++) {   // BBS-style cross spokes
      g.save(); g.translate(64, 64); g.rotate((i / 14) * Math.PI * 2);
      g.beginPath(); g.moveTo(-4, -18); g.lineTo(4, -18); g.lineTo(9, -56); g.lineTo(-9, -56);
      g.closePath(); g.fill(); g.restore();
    }
    g.fillStyle = '#cdd3d9';
    g.beginPath(); g.arc(64, 64, 19, 0, 7); g.fill();
    g.fillStyle = '#1a6ec0';
    g.beginPath(); g.arc(64, 64, 13, 0, 7); g.fill();
    g.fillStyle = '#f2f4f6';
    g.beginPath(); g.arc(64, 64, 13, -0.2, 1.4); g.lineTo(64, 64); g.fill();
    g.beginPath(); g.arc(64, 64, 13, 2.94, 4.54); g.lineTo(64, 64); g.fill();
    return tex(c);
  }

  function dialTexture() {
    const c = canvas(256, 128);
    const g = c.getContext('2d');
    g.fillStyle = '#0d0e10'; g.fillRect(0, 0, 256, 128);
    for (const cx of [70, 178]) {
      g.strokeStyle = '#3a3f45'; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, 64, 48, 0, 7); g.stroke();
      g.fillStyle = '#d9dde2';
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
        g.beginPath();
        g.arc(cx + Math.cos(a) * 40, 64 + Math.sin(a) * 40, i % 5 === 0 ? 3 : 1.6, 0, 7);
        g.fill();
      }
      g.strokeStyle = '#e2452f'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, 64);
      g.lineTo(cx + Math.cos(2.5) * 34, 64 + Math.sin(2.5) * 34); g.stroke();
    }
    g.fillStyle = '#8d949b'; g.font = '11px sans-serif';
    g.fillText('km/h', 52, 100); g.fillText('1/min', 158, 100);
    return tex(c);
  }

  function radioTexture() {
    const c = canvas(256, 96);
    const g = c.getContext('2d');
    g.fillStyle = '#1a1b1e'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#0a0a0c'; g.fillRect(14, 14, 228, 44);
    g.fillStyle = '#e250c8'; g.font = 'bold 24px monospace';
    g.fillText('FM 1  98.7', 26, 46);
    g.fillStyle = '#7a3f9c';
    for (let i = 0; i < 6; i++) g.fillRect(24 + i * 38, 68, 26, 16);
    return tex(c);
  }

  /* Position a unit-height cylinder so it spans from `a` to `b`. */
  const UP = new T.Vector3(0, 1, 0);
  const _d = new T.Vector3();
  function aim(mesh, a, b) {
    _d.subVectors(b, a);
    const len = _d.length() || 0.0001;
    mesh.position.copy(a);
    mesh.quaternion.setFromUnitVectors(UP, _d.divideScalar(len));
    mesh.scale.set(1, len, 1);
  }

  function limb(radius, mat) {
    const g = new T.CylinderGeometry(radius, radius * 0.85, 1, 7).translate(0, 0.5, 0);
    const m = new T.Mesh(g, mat);
    m.castShadow = true;
    return m;
  }

  // ------------------------------------------------------------ the E30 cabrio

  CC.buildCabrio = function (paintName) {
    const g = new T.Group();
    const refs = {};

    // Two-layer car paint: a slightly metallic base under a clearcoat. This
    // is what stops the body reading as coloured plastic.
    const paint = new T.MeshPhysicalMaterial({
      color: PAINTS[paintName] || PAINTS['Alpinweiß'],
      roughness: 0.26, metalness: 0.42,
      clearcoat: 1.0, clearcoatRoughness: 0.06,
      envMapIntensity: 1.7,
    });
    refs.paint = paint;
    const dark = new T.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.62, metalness: 0.25 });
    const chrome = new T.MeshStandardMaterial({ color: 0xd2d7dc, roughness: 0.14, metalness: 1.0 });
    const cabin = new T.MeshStandardMaterial({ color: 0x121315, roughness: 0.78 });
    const leather = new T.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.52 });
    const glass = new T.MeshPhysicalMaterial({
      color: 0x9dc0d4, transparent: true, opacity: 0.16, side: T.DoubleSide,
      roughness: 0.04, metalness: 0.0, envMapIntensity: 2.0,
    });

    const add = (geo, mat, x, y, z, rx) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      m.castShadow = true;
      g.add(m);
      return m;
    };

    /* Vertical layout, metres above the road. These are the real numbers for
       an E30: sill 0.28, beltline 1.06, windscreen header 1.44, floor pan
       0.38. Getting the floor wrong is what makes a car model read as a
       pickup truck — the occupants end up sitting a head too high. */
    const FLOOR = 0.38, BELT = 1.06, HEADER = 1.44;

    // Body shell: two door skins, a solid nose and a solid tail, open between.
    for (const s of [1, -1]) {
      add(new T.BoxGeometry(0.17, 0.78, 3.34), paint, s * 0.765, 0.67, -0.08);
    }
    add(new T.BoxGeometry(1.70, 0.58, 1.50), paint, 0, 0.59, 1.36);    // engine bay
    add(new T.BoxGeometry(1.70, 0.76, 1.26), paint, 0, 0.68, -1.45);   // boot
    add(new T.BoxGeometry(1.44, 0.08, 2.34), cabin, 0, FLOOR, -0.14);  // floor pan
    add(new T.BoxGeometry(1.74, 0.14, 3.30), dark, 0, 0.34, -0.08);    // sill
    add(new T.BoxGeometry(1.58, 0.08, 1.28), paint, 0, 0.92, 1.49, -0.03);        // bonnet
    add(new T.BoxGeometry(1.62, 0.09, 1.02), paint, 0, BELT + 0.02, -1.52);        // boot lid
    add(new T.BoxGeometry(1.68, 0.22, 0.30), paint, 0, BELT - 0.11, 0.76);         // scuttle
    add(new T.BoxGeometry(1.78, 0.028, 3.30), chrome, 0, 0.72, -0.08);            // side trim
    for (const s of [1, -1]) {                                          // door shutlines
      add(new T.BoxGeometry(0.02, 0.66, 0.03), dark, s * 0.855, 0.70, 0.50);
      add(new T.BoxGeometry(0.02, 0.66, 0.03), dark, s * 0.855, 0.70, -0.86);
    }

    // Folded soft top behind the seats — the reason you can see the sky.
    const canvasTop = new T.MeshStandardMaterial({ color: 0x2b2724, roughness: 0.82 });
    add(new T.BoxGeometry(1.46, 0.22, 0.74), canvasTop, 0, BELT + 0.06, -1.02);
    add(new T.BoxGeometry(1.52, 0.05, 0.84), canvasTop, 0, BELT + 0.18, -1.02);

    // Windscreen: pillars, header rail and glass all share the same rake.
    const rake = -0.38;
    const glassMid = (BELT + HEADER) / 2;
    add(new T.BoxGeometry(0.07, 0.44, 0.09), dark, 0.70, glassMid, 0.60, rake);
    add(new T.BoxGeometry(0.07, 0.44, 0.09), dark, -0.70, glassMid, 0.60, rake);
    add(new T.BoxGeometry(1.48, 0.075, 0.10), dark, 0, HEADER, 0.44);
    add(new T.PlaneGeometry(1.40, 0.43), glass, 0, glassMid, 0.59, rake);
    add(new T.BoxGeometry(0.42, 0.025, 0.025), dark, 0.28, BELT - 0.06, 0.86);  // wipers
    add(new T.BoxGeometry(0.42, 0.025, 0.025), dark, -0.20, BELT - 0.06, 0.86);

    // Mirrors, hung off the base of the A-pillars.
    for (const s of [1, -1]) {
      add(new T.BoxGeometry(0.15, 0.045, 0.045), dark, s * 0.84, BELT - 0.03, 0.52);
      add(new T.BoxGeometry(0.065, 0.10, 0.18), dark, s * 0.93, BELT - 0.01, 0.50);
    }

    // Nose: bumper, kidneys, four round lamps, plate.
    add(new T.BoxGeometry(1.74, 0.20, 0.26), dark, 0, 0.46, 2.05);
    add(new T.BoxGeometry(1.62, 0.13, 0.17), dark, 0, 0.30, 2.05);
    for (const s of [1, -1]) {
      add(new T.BoxGeometry(0.30, 0.18, 0.06), chrome, s * 0.17, 0.80, 2.05);
      add(new T.BoxGeometry(0.25, 0.14, 0.08), dark, s * 0.17, 0.80, 2.06);
    }
    const lampGeo = new T.CylinderGeometry(0.10, 0.10, 0.07, 18).rotateX(Math.PI / 2);
    const lampGeoS = new T.CylinderGeometry(0.078, 0.078, 0.07, 16).rotateX(Math.PI / 2);
    const lampMat = new T.MeshPhysicalMaterial({
      color: 0xdfe8ef, roughness: 0.06, metalness: 0.1,
      clearcoat: 1.0, envMapIntensity: 2.6,
    });
    refs.headlamps = lampMat;
    const amber = new T.MeshStandardMaterial({ color: 0xe8a22a, roughness: 0.25 });
    for (const s of [1, -1]) {
      add(lampGeo, lampMat, s * 0.57, 0.78, 2.04);
      add(lampGeoS, lampMat, s * 0.36, 0.78, 2.04);
      add(new T.BoxGeometry(0.15, 0.09, 0.05), amber, s * 0.75, 0.66, 2.05);
    }
    const plate = new T.MeshBasicMaterial({ map: plateTexture('OG · BM 320') });
    add(new T.PlaneGeometry(0.48, 0.105), plate, 0, 0.54, 2.19);
    const roundel = new T.MeshBasicMaterial({ map: roundelTexture(), transparent: true });
    add(new T.CircleGeometry(0.07, 20), roundel, 0, 0.93, 2.00, -0.62);

    // Tail.
    add(new T.BoxGeometry(1.74, 0.21, 0.26), dark, 0, 0.52, -2.05);
    const tailMat = new T.MeshStandardMaterial({
      color: 0xa01818, emissive: 0x3a0606, roughness: 0.18, metalness: 0.1,
    });
    refs.tail = tailMat;
    for (const s of [1, -1]) {
      add(new T.BoxGeometry(0.52, 0.21, 0.06), tailMat, s * 0.52, 0.83, -2.10);
    }
    add(new T.PlaneGeometry(0.48, 0.105), plate, 0, 0.62, -2.19).rotation.y = Math.PI;
    add(new T.CircleGeometry(0.07, 20), roundel, 0, BELT + 0.07, -1.60, -1.57);
    add(new T.CylinderGeometry(0.035, 0.035, 0.18, 10).rotateX(Math.PI / 2),
      new T.MeshStandardMaterial({ color: 0x6b7076, roughness: 0.3, metalness: 0.9 }), 0.35, 0.36, -2.14);

    // Wheels: steer on the outer group, spin on the inner one.
    const tyreGeo = new T.CylinderGeometry(0.315, 0.315, 0.21, 22).rotateZ(Math.PI / 2);
    const rimGeo = new T.CylinderGeometry(0.205, 0.205, 0.215, 22).rotateZ(Math.PI / 2);
    const tyreMat = new T.MeshStandardMaterial({ color: 0x131315, roughness: 0.92 });
    const rimSide = new T.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.3, metalness: 0.85 });
    const rimFace = new T.MeshStandardMaterial({ map: rimTexture(), roughness: 0.28, metalness: 0.8 });
    refs.wheels = [];
    for (const [x, z, front] of [[0.79, 1.28, 1], [-0.79, 1.28, 1], [0.79, -1.29, 0], [-0.79, -1.29, 0]]) {
      const steerG = new T.Group();
      steerG.position.set(x, 0.315, z);
      const spin = new T.Group();
      const tyre = new T.Mesh(tyreGeo, tyreMat); tyre.castShadow = true;
      const rim = new T.Mesh(rimGeo, [rimSide, rimFace, rimFace]);
      spin.add(tyre, rim);
      steerG.add(spin);
      g.add(steerG);
      refs.wheels.push({ steer: steerG, spin, front: !!front });
    }

    // ------------------------------------------------------------- interior
    add(new T.BoxGeometry(1.46, 0.30, 0.44), cabin, 0, 0.86, 0.52);       // dash
    add(new T.BoxGeometry(1.46, 0.05, 0.22), cabin, 0, 1.02, 0.72, -0.34); // dash top
    for (const s of [-0.30, -0.02]) {                                     // centre vents
      add(new T.BoxGeometry(0.19, 0.055, 0.03), dark, s, 0.99, 0.285);
    }
    const dials = new T.Mesh(new T.PlaneGeometry(0.42, 0.21),
      new T.MeshBasicMaterial({ map: dialTexture() }));
    dials.position.set(0.42, 0.96, 0.28); dials.rotation.y = Math.PI; dials.rotation.x = 0.2;
    g.add(dials);
    add(new T.BoxGeometry(0.28, 0.44, 0.58), cabin, 0, 0.64, 0.40);       // centre console
    const radio = new T.Mesh(new T.PlaneGeometry(0.24, 0.13),
      new T.MeshBasicMaterial({ map: radioTexture() }));
    radio.position.set(0, 0.90, 0.28); radio.rotation.y = Math.PI; radio.rotation.x = 0.25;
    g.add(radio);

    /* Steering wheel, 25° off vertical with the top edge leaning away from
       the driver — you reach further for twelve o'clock than for six. A
       positive tilt about X is what does that; a negative one lays the wheel
       almost flat and tips it the wrong way, like a bus. */
    const TILT = 0.435;
    const wheelG = new T.Group();
    wheelG.position.set(0.42, 0.97, 0.18);
    wheelG.rotation.x = TILT;
    const rimSpin = new T.Group();
    const swMat = new T.MeshStandardMaterial({ color: 0x18181a, roughness: 0.55 });
    rimSpin.add(new T.Mesh(new T.TorusGeometry(0.185, 0.021, 8, 28), swMat));
    for (let i = 0; i < 3; i++) {
      const spoke = new T.Mesh(new T.BoxGeometry(0.33, 0.03, 0.016), swMat);
      spoke.rotation.z = (i / 3) * Math.PI * 2 + 0.5;
      rimSpin.add(spoke);
    }
    const hub = new T.Mesh(new T.CircleGeometry(0.045, 18),
      new T.MeshBasicMaterial({ map: roundelTexture(), transparent: true }));
    hub.position.z = -0.014;        // the face the driver sees is the -Z one
    hub.rotation.y = Math.PI;
    rimSpin.add(hub);
    wheelG.add(rimSpin);
    g.add(wheelG);
    refs.steerWheel = rimSpin;
    refs.wheelCentre = new T.Vector3(0.42, 0.97, 0.18);
    // In-plane basis of the tilted steering wheel, for placing the hands.
    refs.wheelAxisX = new T.Vector3(1, 0, 0);
    refs.wheelAxisY = new T.Vector3(0, Math.cos(TILT), Math.sin(TILT));

    add(new T.CylinderGeometry(0.016, 0.016, 0.22, 8), cabin, 0.02, 0.80, 0.06);
    add(new T.SphereGeometry(0.036, 10, 8), leather, 0.02, 0.92, 0.06);
    add(new T.BoxGeometry(0.05, 0.05, 0.26), cabin, -0.18, 0.76, -0.04, -0.4);

    // Seats. Low enough that the occupants' shoulders clear the backrests —
    // otherwise raised arms look like they sprout from behind the seat.
    for (const s of [1, -1]) {
      add(new T.BoxGeometry(0.52, 0.12, 0.54), leather, s * 0.42, 0.47, -0.34);
      add(new T.BoxGeometry(0.50, 0.52, 0.15), leather, s * 0.42, 0.78, -0.64, 0.14);
      add(new T.BoxGeometry(0.25, 0.16, 0.13), leather, s * 0.42, 1.12, -0.70);
    }

    // ----------------------------------------------------------- occupants
    const skin = new T.MeshStandardMaterial({ color: 0xd8a687, roughness: 0.72 });
    const people = [];

    function person(side, opts) {
      const p = { side };
      const body = new T.Group();
      const shirt = new T.MeshStandardMaterial({ color: opts.shirt, roughness: 0.86 });
      const torso = new T.Mesh(new T.BoxGeometry(0.42, 0.56, 0.27), shirt);
      torso.position.set(side * 0.42, 0.84, -0.32);
      torso.castShadow = true;
      body.add(torso);
      p.torso = torso;

      const head = new T.Group();
      head.position.set(side * 0.42, 1.24, -0.32);
      const skull = new T.Mesh(new T.SphereGeometry(0.115, 14, 12), skin);
      skull.scale.set(1, 1.12, 1.05);
      skull.castShadow = true;
      head.add(skull);

      const hatMat = new T.MeshStandardMaterial({ color: opts.hat, roughness: 0.88 });
      const crown = new T.Mesh(new T.CylinderGeometry(0.113, 0.122, 0.14, 16), hatMat);
      crown.position.y = 0.13;
      const brim = new T.Mesh(new T.CylinderGeometry(0.215, 0.215, 0.018, 20), hatMat);
      brim.position.y = 0.075;
      const band = new T.Mesh(new T.CylinderGeometry(0.126, 0.126, 0.035, 16),
        new T.MeshStandardMaterial({ color: opts.band, roughness: 0.8 }));
      band.position.y = 0.088;
      crown.castShadow = true; brim.castShadow = true;
      head.add(crown, brim, band);

      if (opts.hair) {
        const hairMat = new T.MeshStandardMaterial({ color: opts.hair, roughness: 0.45, side: T.DoubleSide });
        // A cap that sits under the hat, plus strands that stream behind.
        const cap = new T.Mesh(new T.SphereGeometry(0.134, 14, 10), hairMat);
        cap.scale.set(1, 0.98, 1.12);
        cap.position.set(0, -0.012, -0.06);   // pushed back so the face stays clear
        head.add(cap);

        const hair = new T.Group();
        hair.position.set(0, -0.04, -0.08);
        for (let i = 0; i < 9; i++) {
          const strand = new T.Mesh(new T.PlaneGeometry(0.085, 0.46), hairMat);
          const a = -1.0 + (i / 8) * 2.0;
          strand.position.set(Math.sin(a) * 0.105, -0.21, Math.cos(a) * 0.03);
          strand.rotation.y = a * 0.55;
          hair.add(strand);
        }
        head.add(hair);
        p.hair = hair;
      }
      body.add(head);
      p.head = head;

      const arms = [];
      for (let i = 0; i < 2; i++) {
        const upper = limb(0.038, shirt);
        const lower = limb(0.037, skin);
        const hand = new T.Mesh(new T.SphereGeometry(0.047, 10, 8), skin);
        body.add(upper, lower, hand);
        arms.push({
          upper, lower, hand,
          shoulder: new T.Vector3(side * 0.42 + (i ? -0.20 : 0.20), 1.05, -0.32),
        });
      }
      p.arms = arms;
      g.add(body);
      p.group = body;
      return p;
    }

    people.push(person(1, { shirt: 0xe9e6df, hat: 0xd8d2c4, band: 0xb9b1a0 }));
    people.push(person(-1, { shirt: 0x2a2b33, hat: 0x6d3a44, band: 0xe3d9c4, hair: 0xc79a4e }));
    refs.people = people;

    // Blob shadow, so the car still sits on the ground outside the shadow map.
    const blobC = canvas(64, 64);
    const bg = blobC.getContext('2d');
    const grd = bg.createRadialGradient(32, 32, 4, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,0.42)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    bg.fillStyle = grd; bg.fillRect(0, 0, 64, 64);
    const blob = new T.Mesh(new T.PlaneGeometry(3.2, 5.2),
      new T.MeshBasicMaterial({ map: tex(blobC), transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    g.add(blob);

    return { group: g, refs };
  };

  /* Animate the bits that move: wheels, steering, occupants. */
  CC.animateCabrio = function (refs, st, time) {
    for (const w of refs.wheels) {
      w.spin.rotation.x -= st.speed * 0.06;
      if (w.front) w.steer.rotation.y = st.steer;
    }
    refs.steerWheel.rotation.z = -st.steer * 3.4;
    refs.tail.emissive.setHex(st.braking ? 0xd01010 : 0x3a0606);

    const c = refs.wheelCentre, ax = refs.wheelAxisX, ay = refs.wheelAxisY;
    const rimPoint = (deg) => {
      const a = T.MathUtils.degToRad(deg) - st.steer * 3.4;
      return new T.Vector3(
        c.x + (Math.cos(a) * ax.x) * 0.185,
        c.y + (Math.sin(a) * ay.y) * 0.185,
        c.z + (Math.sin(a) * ay.z) * 0.185
      );
    };

    const kmh = Math.abs(st.speed) * 3.6;
    const lean = T.MathUtils.clamp(-st.lateral * 0.035, -0.22, 0.22);
    const jiggle = Math.sin(time * 17) * 0.004 * Math.min(kmh / 80, 1.6);

    // Driver: both hands on the wheel, at ten to two. arms[0] hangs off the
    // outboard shoulder, so it takes the rim point on the same side.
    const drv = refs.people[0];
    drv.group.rotation.z = lean;
    drv.group.position.y = jiggle;
    drv.head.rotation.z = lean * 0.6;
    setArm(drv.arms[0], rimPoint(25));
    setArm(drv.arms[1], rimPoint(155));

    // Passenger: hands in her lap until it gets fast, then arms in the wind.
    const pax = refs.people[1];
    pax.group.rotation.z = lean * 1.4;
    pax.group.position.y = jiggle * 1.3;
    const up = T.MathUtils.clamp((kmh - 80) / 30, 0, 1);
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const rest = new T.Vector3(-0.42 + s * 0.20, 0.70, -0.16);
      const wind = new T.Vector3(
        -0.42 + s * 0.21 + Math.sin(time * 3.1 + i) * 0.05,
        1.78 + Math.sin(time * 4.3 + i * 1.7) * 0.08,
        -0.44
      );
      setArm(pax.arms[i], rest.lerp(wind, up));
    }
    if (pax.hair) {
      pax.hair.rotation.x = -Math.min(kmh / 130, 1) * 0.42 + Math.sin(time * 6) * 0.04;
      pax.hair.rotation.z = Math.sin(time * 4.6) * 0.08;
    }
  };

  function setArm(arm, target) {
    const elbow = new T.Vector3().addVectors(arm.shoulder, target).multiplyScalar(0.5);
    elbow.y -= 0.07;
    elbow.z -= 0.05;
    aim(arm.upper, arm.shoulder, elbow);
    aim(arm.lower, elbow, target);
    arm.hand.position.copy(target);
  }

  // ---------------------------------------------------------- traffic & police

  const TRAFFIC_COLOURS = [0xbfc4c9, 0x2b3a4a, 0x8e2020, 0x27543a, 0xd6d2c4, 0x1c1e22, 0x35608f];

  CC.buildTrafficCar = function (rng) {
    const g = new T.Group();
    const col = TRAFFIC_COLOURS[Math.floor(rng() * TRAFFIC_COLOURS.length)];
    const paint = new T.MeshPhysicalMaterial({
      color: col, roughness: 0.35, metalness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1,
    });
    const glass = new T.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.08, metalness: 0.2 });
    const dark = new T.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });
    const body = new T.Mesh(new T.BoxGeometry(1.76, 0.78, 4.30), paint);
    body.position.y = 0.68; body.castShadow = true;
    const roof = new T.Mesh(new T.BoxGeometry(1.62, 0.58, 2.30), paint);
    roof.position.set(0, 1.34, -0.28); roof.castShadow = true;
    const win = new T.Mesh(new T.BoxGeometry(1.66, 0.42, 2.34), glass);
    win.position.set(0, 1.36, -0.28);
    g.add(body, win, roof);
    const t = new T.CylinderGeometry(0.32, 0.32, 0.22, 14).rotateZ(Math.PI / 2);
    for (const [x, z] of [[0.82, 1.35], [-0.82, 1.35], [0.82, -1.32], [-0.82, -1.32]]) {
      const w = new T.Mesh(t, dark); w.position.set(x, 0.32, z); g.add(w);
    }
    for (const s of [1, -1]) {
      const l = new T.Mesh(new T.BoxGeometry(0.4, 0.16, 0.05),
        new T.MeshStandardMaterial({ color: 0xf0f0e0, roughness: 0.1 }));
      l.position.set(s * 0.55, 0.86, 2.16); g.add(l);
      const r = new T.Mesh(new T.BoxGeometry(0.4, 0.16, 0.05),
        new T.MeshStandardMaterial({ color: 0x901010, emissive: 0x2a0303, roughness: 0.2 }));
      r.position.set(s * 0.55, 0.88, -2.16); g.add(r);
    }
    return g;
  };

  CC.buildTruck = function (rng, trailerMat) {
    const g = new T.Group();
    const col = [0xd23b2e, 0x2f6fc4, 0xf2f2f2, 0x2fa05a, 0xe8b21c][Math.floor(rng() * 5)];
    const cab = new T.Mesh(new T.BoxGeometry(2.50, 2.90, 5.80),
      new T.MeshPhysicalMaterial({ color: col, roughness: 0.34, metalness: 0.35, clearcoat: 0.8 }));
    cab.position.set(0, 1.95, 5.20); cab.castShadow = true;
    const glass = new T.Mesh(new T.BoxGeometry(2.36, 1.05, 0.12),
      new T.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.07, metalness: 0.2 }));
    glass.position.set(0, 2.70, 8.06);
    const box = new T.Mesh(new T.BoxGeometry(2.55, 2.95, 13.4), trailerMat);
    box.position.set(0, 2.55, -3.20); box.castShadow = true;
    const skirt = new T.Mesh(new T.BoxGeometry(2.40, 0.7, 13.0),
      new T.MeshStandardMaterial({ color: 0x3a3d41, roughness: 0.8 }));
    skirt.position.set(0, 0.90, -3.20);
    g.add(cab, glass, box, skirt);
    const t = new T.CylinderGeometry(0.52, 0.52, 0.30, 14).rotateZ(Math.PI / 2);
    const rubber = new T.MeshStandardMaterial({ color: 0x141416, roughness: 0.93 });
    for (const [x, z] of [[1.15, 6.6], [-1.15, 6.6], [1.15, 3.2], [-1.15, 3.2],
      [1.15, -7.4], [-1.15, -7.4], [1.15, -8.7], [-1.15, -8.7]]) {
      const w = new T.Mesh(t, rubber); w.position.set(x, 0.52, z); g.add(w);
    }
    return g;
  };

  CC.buildPolice = function () {
    const g = new T.Group();
    const silver = new T.MeshPhysicalMaterial({
      color: 0xd8dce0, roughness: 0.3, metalness: 0.55, clearcoat: 0.9,
    });
    const blueStripe = new T.MeshPhysicalMaterial({ color: 0x1747a8, roughness: 0.3, clearcoat: 0.9 });
    const glass = new T.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.07, metalness: 0.2 });
    const body = new T.Mesh(new T.BoxGeometry(1.80, 0.80, 4.50), silver);
    body.position.y = 0.70; body.castShadow = true;
    const stripe = new T.Mesh(new T.BoxGeometry(1.84, 0.26, 3.20), blueStripe);
    stripe.position.set(0, 0.74, 0);
    const roof = new T.Mesh(new T.BoxGeometry(1.64, 0.60, 2.40), silver);
    roof.position.set(0, 1.38, -0.30); roof.castShadow = true;
    const win = new T.Mesh(new T.BoxGeometry(1.68, 0.44, 2.44), glass);
    win.position.set(0, 1.40, -0.30);
    g.add(body, stripe, win, roof);
    const t = new T.CylinderGeometry(0.33, 0.33, 0.22, 14).rotateZ(Math.PI / 2);
    const rubber = new T.MeshStandardMaterial({ color: 0x141416, roughness: 0.93 });
    for (const [x, z] of [[0.84, 1.42], [-0.84, 1.42], [0.84, -1.38], [-0.84, -1.38]]) {
      const w = new T.Mesh(t, rubber); w.position.set(x, 0.33, z); g.add(w);
    }
    const bar = new T.Mesh(new T.BoxGeometry(1.30, 0.14, 0.24),
      new T.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.7 }));
    bar.position.set(0, 1.74, -0.30);
    g.add(bar);
    const lights = [];
    for (const s of [1, -1]) {
      const l = new T.Mesh(new T.BoxGeometry(0.52, 0.13, 0.22),
        new T.MeshStandardMaterial({ color: 0x2244cc, emissive: 0x000000, roughness: 0.2 }));
      l.position.set(s * 0.32, 1.75, -0.30);
      g.add(l); lights.push(l.material);
    }
    return { group: g, lights };
  };
})();
