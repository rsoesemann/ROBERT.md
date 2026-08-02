/* Camera look: the scene goes into an HDR buffer, gets a bloom pass, and is
   then tone mapped, vignetted, grained and radially smeared on the way to the
   canvas. Everything here is hand-rolled — the r147 UMD build ships no
   EffectComposer, and pulling the examples in for four passes is not worth it.

   Order matters: bloom and the radial blur happen in linear light, tone
   mapping and the sRGB curve come last. Doing it the other way round gives
   grey haze instead of glare. */
(function () {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const T = THREE;

  const QUAD_VERT = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`;

  const BRIGHT_FRAG = `
    uniform sampler2D tSrc;
    uniform float threshold;
    uniform float softness;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tSrc, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(c * smoothstep(threshold, threshold + softness, l), 1.0);
    }`;

  const BLUR_FRAG = `
    uniform sampler2D tSrc;
    uniform vec2 dir;          // texel-sized step, already scaled by radius
    varying vec2 vUv;
    void main() {
      // Nine-tap Gaussian, weights from the binomial row.
      float w[5];
      w[0] = 0.2270270270; w[1] = 0.1945945946; w[2] = 0.1216216216;
      w[3] = 0.0540540541; w[4] = 0.0162162162;
      vec3 sum = texture2D(tSrc, vUv).rgb * w[0];
      for (int i = 1; i < 5; i++) {
        vec2 o = dir * float(i);
        sum += texture2D(tSrc, vUv + o).rgb * w[i];
        sum += texture2D(tSrc, vUv - o).rgb * w[i];
      }
      gl_FragColor = vec4(sum, 1.0);
    }`;

  const COMPOSITE_FRAG = `
    uniform sampler2D tScene;
    uniform sampler2D tBloomNear;
    uniform sampler2D tBloomWide;
    uniform vec2 resolution;
    uniform float bloom;
    uniform float exposure;
    uniform float vignette;
    uniform float grain;
    uniform float motion;      // radial smear, 0 standing still
    uniform float aberration;
    uniform float time;
    varying vec2 vUv;

    // Narkowicz's ACES fit. Cheap, and it rolls highlights off the way film does.
    vec3 aces(vec3 x) {
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }

    void main() {
      vec2 off = vUv - 0.5;
      float r2 = dot(off, off);

      // Lens fringing grows towards the corners, like a phone lens.
      float ab = aberration * r2;
      vec3 base = vec3(
        texture2D(tScene, vUv - off * ab).r,
        texture2D(tScene, vUv).g,
        texture2D(tScene, vUv + off * ab).b);

      vec3 smear = base;
      if (motion > 0.0001) {
        vec3 sum = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          sum += texture2D(tScene, vUv - off * motion * (float(i) / 7.0)).rgb;
        }
        smear = sum * 0.125;
      }
      // Keep the middle of the frame sharp; only the edges streak.
      vec3 col = mix(base, smear, clamp(r2 * 5.5, 0.0, 1.0));

      col += texture2D(tBloomNear, vUv).rgb * bloom;
      col += texture2D(tBloomWide, vUv).rgb * bloom * 1.35;

      col = aces(col * exposure);
      col = pow(col, vec3(1.0 / 2.2));

      float v = smoothstep(0.92, 0.28, length(off * vec2(1.0, 0.86)));
      col *= mix(1.0, v, vignette);

      float n = fract(sin(dot(vUv * resolution + time, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * grain;

      gl_FragColor = vec4(col, 1.0);
    }`;

  function quad(fragmentShader, uniforms) {
    return new T.Mesh(
      new T.PlaneGeometry(2, 2),
      new T.ShaderMaterial({
        uniforms, vertexShader: QUAD_VERT, fragmentShader,
        depthTest: false, depthWrite: false,
      })
    );
  }

  CC.createPost = function (renderer) {
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const scene = new T.Scene();
    const type = renderer.capabilities.isWebGL2 ? T.HalfFloatType : T.UnsignedByteType;
    const rtOpts = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, type };

    const rtScene = new T.WebGLRenderTarget(2, 2, { ...rtOpts, depthBuffer: true });
    const rtA = new T.WebGLRenderTarget(2, 2, { ...rtOpts, depthBuffer: false });
    const rtB = new T.WebGLRenderTarget(2, 2, { ...rtOpts, depthBuffer: false });
    const rtC = new T.WebGLRenderTarget(2, 2, { ...rtOpts, depthBuffer: false });

    const brightU = {
      tSrc: { value: rtScene.texture },
      threshold: { value: 1.15 },
      softness: { value: 0.6 },
    };
    const blurU = { tSrc: { value: null }, dir: { value: new T.Vector2() } };
    const compU = {
      tScene: { value: rtScene.texture },
      tBloomNear: { value: rtC.texture },
      tBloomWide: { value: rtA.texture },
      resolution: { value: new T.Vector2() },
      bloom: { value: 0.34 },
      exposure: { value: 0.92 },
      vignette: { value: 0.46 },
      grain: { value: 0.028 },
      motion: { value: 0 },
      aberration: { value: 0.011 },
      time: { value: 0 },
    };

    const bright = quad(BRIGHT_FRAG, brightU);
    const blur = quad(BLUR_FRAG, blurU);
    const composite = quad(COMPOSITE_FRAG, compU);

    let half = new T.Vector2(1, 1);

    function draw(mesh, target) {
      scene.clear();
      scene.add(mesh);
      renderer.setRenderTarget(target || null);
      renderer.render(scene, camera);
    }

    function blurTo(src, target, dx, dy) {
      blurU.tSrc.value = src.texture;
      blurU.dir.value.set(dx / half.x, dy / half.y);
      draw(blur, target);
    }

    return {
      enabled: true,

      setSize(w, h) {
        const dpr = renderer.getPixelRatio();
        const fw = Math.max(2, Math.round(w * dpr));
        const fh = Math.max(2, Math.round(h * dpr));
        rtScene.setSize(fw, fh);
        half.set(Math.max(2, fw >> 1), Math.max(2, fh >> 1));
        rtA.setSize(half.x, half.y);
        rtB.setSize(half.x, half.y);
        rtC.setSize(half.x, half.y);
        compU.resolution.value.set(fw, fh);
      },

      /* motion: 0..1, how hard the frame streaks outwards. */
      render(worldScene, worldCamera, time, motion) {
        if (!this.enabled) {
          renderer.setRenderTarget(null);
          renderer.render(worldScene, worldCamera);
          return;
        }
        renderer.setRenderTarget(rtScene);
        renderer.clear();
        renderer.render(worldScene, worldCamera);

        draw(bright, rtA);
        blurTo(rtA, rtB, 1, 0);
        blurTo(rtB, rtC, 0, 1);      // rtC: tight glow
        blurTo(rtC, rtB, 2.7, 0);
        blurTo(rtB, rtA, 0, 2.7);    // rtA: wide halo

        compU.time.value = time;
        compU.motion.value = motion;
        draw(composite, null);
      },
    };
  };
})();
