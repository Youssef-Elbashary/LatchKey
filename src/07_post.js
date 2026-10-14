// ---------------------------------------------------------------------------
// post: bloom → tone map → a film/VHS pass that also draws eyelids and the peephole lens
// ---------------------------------------------------------------------------
const FX_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uGrain: { value: 0.07 }, uVig: { value: 0.2 }, uCA: { value: 0.002 }, uDistort: { value: 0.03 }, uEyes: { value: 0 },
    uFlash: { value: 0 }, uRed: { value: 0 }, uPeep: { value: 0 }, uGlitch: { value: 0 }, uGamma: { value: 1 }, uLook: { value: 0 },
    uFade: { value: 0 }, uDesat: { value: 0.22 }, uPulse: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uGrain, uVig, uCA, uDistort, uEyes, uFlash, uRed, uPeep, uGlitch, uGamma, uLook, uFade, uDesat, uPulse;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      float aspect = uRes.x / uRes.y;
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      // peephole: strong barrel distortion inside a brass ring
      vec2 q = c * vec2(aspect, 1.0);
      float pr = length(q);
      if (uPeep > 0.001) {
        vec2 qs = q * (0.5 + 1.25 * pr * pr);
        uv = mix(uv, 0.5 + qs / vec2(aspect, 1.0), uPeep);
      }
      uv = 0.5 + (uv - 0.5) * (1.0 + uDistort * dot(c, c));
      uv.x += sin(uv.y * 30.0 + uTime * 9.0) * 0.004 * uLook;
      uv.y += sin(uv.x * 24.0 - uTime * 7.0) * 0.003 * uLook;
      float band = floor(uv.y * 48.0);
      float g = step(1.0 - uGlitch * 0.35, hash(vec2(band, floor(uTime * 18.0))));
      uv.x += g * (hash(vec2(band * 3.1, floor(uTime * 18.0))) - 0.5) * 0.12 * uGlitch;
      vec2 dir = (uv - 0.5) * (uCA + uPeep * 0.01 * pr);
      vec3 col = vec3(texture2D(tDiffuse, uv + dir).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir).b);
      col = pow(max(col, 0.0), vec3(1.0 / uGamma));
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), uDesat);
      col *= mix(vec3(0.84, 0.97, 1.07), vec3(1.04, 1.0, 0.93), smoothstep(0.04, 0.55, l));
      col = col * 0.97 + 0.008;
      float vig = smoothstep(1.05, 0.2, length(c * vec2(aspect * 0.78, 1.0)) * (1.0 + uVig));
      col *= mix(1.0, vig, 0.88);
      col *= 1.0 - uPulse * 0.3 * smoothstep(0.15, 0.75, length(c * vec2(aspect, 1.0)));
      float n = hash(uv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
      col += n * uGrain * (0.5 + 0.9 * (1.0 - l));
      col *= 0.975 + 0.025 * sin(gl_FragCoord.y * 3.14159);
      col = mix(col, vec3(0.5, 0.02, 0.01) + col * 0.3, uRed * 0.65);
      if (uPeep > 0.001) {
        float ring = smoothstep(0.455, 0.44, pr);
        float lens = smoothstep(0.3, 0.46, pr);
        col *= mix(1.0, 1.0 - lens * 0.55, uPeep);
        col *= vec3(1.0, 0.98, 0.88);
        col = mix(col, vec3(0.0), (1.0 - ring) * uPeep);
        col += smoothstep(0.43, 0.455, pr) * smoothstep(0.47, 0.455, pr) * vec3(0.18, 0.13, 0.07) * uPeep;
      }
      if (uEyes > 0.001) {
        float open = 1.0 - uEyes;
        float x = c.x * aspect * 0.9;
        float h = open * 0.78 * (1.0 - 0.55 * x * x);
        float lid = smoothstep(-0.035, 0.035, abs(c.y) - h);
        vec3 inside = vec3(0.045, 0.006, 0.004) * (0.55 + 0.45 * uPulse);
        col = mix(col, inside, max(lid, smoothstep(0.9, 1.0, uEyes)));
      }
      col = mix(col, vec3(1.0), uFlash);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const Post = {
  init(renderer, scene, camera) {
    this.renderer = renderer;
    const comp = this.composer = new EffectComposer(renderer);
    comp.addPass(this.renderPass = new RenderPass(scene, camera));
    // only real light sources bloom (lamps, eyes, signs); lit walls stay crisp
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 1.6);
    comp.addPass(this.bloom);
    comp.addPass(new OutputPass());
    this.fx = new ShaderPass(FX_SHADER);
    comp.addPass(this.fx);
    this.u = this.fx.uniforms;
    this.flash = 0; this.red = 0; this.glitch = 0; this.fade = 1; this.fadeTarget = 1; this.fadeSpeed = 1; this.look = 0; this.peep = 0;
  },
  resize(w, h, pr) {
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    this.u.uRes.value.set(w * pr, h * pr);
  },
  fadeTo(v, seconds = 1) { this.fadeTarget = v; this.fadeSpeed = seconds <= 0 ? 1e6 : 1 / seconds; if (seconds <= 0) this.fade = v; },
  update(dt) {
    const u = this.u, f = P.fear;
    this.flash = Math.max(0, this.flash - dt * 2.5); this.red = Math.max(0, this.red - dt * 1.2); this.glitch = Math.max(0, this.glitch - dt * 1.5);
    const d = this.fadeTarget - this.fade; this.fade += Math.sign(d) * Math.min(Math.abs(d), dt * this.fadeSpeed);
    u.uTime.value = G.time + performance.now() * 0.0001;
    u.uGrain.value = 0.06 + f * 0.07 + this.glitch * 0.1;
    u.uVig.value = 0.15 + f * 0.55;
    u.uCA.value = 0.0015 + f * 0.004 + this.look * 0.01 + this.glitch * 0.01;
    u.uDistort.value = 0.04 + this.look * 0.08;
    u.uEyes.value = P.eyesClosed;
    u.uFlash.value = Settings.reduceFlashing ? this.flash * 0.25 : this.flash;
    u.uRed.value = this.red; u.uGlitch.value = Math.min(1, this.glitch + this.look * 0.15); u.uLook.value = this.look;
    u.uFade.value = this.fade; u.uPeep.value = this.peep;
    u.uGamma.value = Settings.brightness;
    u.uDesat.value = 0.2 + f * 0.25;
    const beat = A.ctx ? (A.ctx.currentTime % (60 / (64 + f * 96))) / (60 / (64 + f * 96)) : 0;
    u.uPulse.value = Math.max(0, f - 0.3) * Math.exp(-beat * 6);
  },
  render() { this.composer.render(); },
};
