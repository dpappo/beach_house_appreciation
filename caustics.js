// Dappled light on the table: soft bokeh-like dots with prismatic fringes,
// drifting in patches the way sun falls through textured glass.
// The light slows and dims while the music is paused, and a few cards bring their own light.
(() => {
  const canvas = document.getElementById("light");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: false, antialias: false });
  if (!gl) return;

  const vert = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
  const frag = `
    precision mediump float;
    uniform vec2 res; uniform float t; uniform vec3 warm;
    uniform float amp;                 // 1 while music plays, lower while paused
    uniform float mode, modeAmt;       // signature light for some cards (see MOODS)
    uniform vec3 spark;                // x, y (0..1, y up) and age in seconds
    vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
    float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= .5; } return v; }
    // distance to nearest drifting point
    float cells(vec2 p){
      vec2 ip = floor(p), fp = fract(p); float d = 9.;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
        vec2 g = vec2(float(x), float(y)); vec2 o = h2(ip + g);
        o = .5 + .32 * sin(t * .22 + 6.2831 * o);
        d = min(d, length(g + o - fp));
      }
      return d;
    }
    float spot(vec2 p){ return 1. - smoothstep(.10, .30, cells(p)); }
    // sparse twinkling points, one per occupied cell; drift is in cells per second (+y falls)
    float motes(vec2 uv, float sc, vec2 drift, float size, float density, float seed){
      vec2 q = uv * sc + drift * t;
      vec2 id = floor(q), f = fract(q);
      float r = h1(id + seed);
      if (r > density) return 0.;
      vec2 o = .25 + .5 * h2(id + seed * 1.7);
      float tw = .55 + .45 * sin(t * (1. + r * 3.) + r * 40.);
      return (1. - smoothstep(0., size, length(f - o))) * tw;
    }
    // light through moving water
    float water(vec2 uv){
      float tt = t * .3 + 23.;
      vec2 p = mod(uv * 6.2831 * .8, 6.2831) - 250.;
      vec2 i = p; float c = 1.;
      for (int n = 0; n < 4; n++){
        float tn = tt * (1. - 3.5 / float(n + 1));
        i = p + vec2(cos(tn - i.x) + sin(tn + i.y), sin(tn - i.y) + cos(tn + i.x));
        c += 1. / length(vec2(p.x / (sin(i.x + tn) / .005), p.y / (cos(i.y + tn) / .005)));
      }
      c = 1.17 - pow(c / 4., 1.4);
      return clamp(pow(abs(c), 8.), 0., 1.);
    }
    void main(){
      vec2 uv = gl_FragCoord.xy / res.y;
      float k = res.x / res.y;
      // light comes in at an angle: stretched dots, slow warp
      vec2 w = vec2(fbm(uv * 1.3 + t * .015), fbm(uv * 1.3 + 9.1 - t * .012)) - .5;
      vec2 p = vec2(uv.x * 11. + uv.y * 3., uv.y * 7.5) + w * 3.2;
      float ca = .045;
      vec3 col = vec3(spot(p + vec2(ca, 0.)), spot(p), spot(p - vec2(ca, 0.)));
      // patches of light, strongest toward the upper corners
      float patchy = smoothstep(.42, .72, fbm(uv * 1.1 + vec2(t * .01, -t * .008)));
      vec2 c = vec2(uv.x / k, uv.y);
      float bias = .45 + .55 * max(smoothstep(.55, 1., c.y) * smoothstep(.6, .0, c.x), smoothstep(.35, 1., c.y + c.x * .4 - .25));
      float beam = smoothstep(.35, .0, abs(c.x * .8 - c.y * .55 - .1)) * .25;
      float m = patchy * bias;
      vec3 outc = (col * m * warm + beam * warm * .5) * amp * (1. - .45 * modeAmt);

      vec3 extra = vec3(0.);
      if (modeAmt > .001) {
        if (mode < 1.5) {        // falling stars
          float s = motes(uv, 24., vec2(0., .5), .12, .3, 1.) + motes(uv, 14., vec2(.03, .8), .1, .28, 7.) * 1.3;
          extra = vec3(s) * (.6 + .4 * bias);
        } else if (mode < 2.5) { // water
          extra = vec3(water(uv * .9 + w * .08)) * warm * (.35 + .65 * bias) * 1.9;
        } else if (mode < 3.5) { // dust rising through warm light
          vec2 sw = vec2(sin(t * .3 + uv.y * 3.) * .03, 0.);
          float d = motes(uv + sw, 11., vec2(0., -.18), .2, .35, 3.) + motes(uv - sw, 20., vec2(0., -.3), .14, .3, 11.) * .8;
          extra = vec3(d) * warm * vec3(1., .9, .75) * (.4 + .6 * bias);
        } else if (mode < 4.5) { // yellow through venetian blinds, slowly breathing
          float s = fract(uv.y * 6. - uv.x * .35 + .08 * sin(uv.x * 2. + t * .2));
          float band = smoothstep(0., .1, s) * smoothstep(.62, .5, s);
          float breathe = .65 + .35 * sin(t * .7);
          extra = vec3(1., .82, .28) * band * breathe * (.35 + .65 * smoothstep(.1, 1., c.x + c.y * .3)) * .9;
        } else {                 // mirror-ball dots turning slowly
          vec2 cc = uv - vec2(k * .5, 1.1); float a = t * .035;
          float s = motes(mat2(cos(a), -sin(a), sin(a), cos(a)) * cc, 17., vec2(0.), .11, .45, 21.);
          extra = vec3(s) * 1.1;
        }
        extra *= modeAmt;
      }
      if (spark.z < 5.) {        // a spark passing: a flash, a ring, a few rays
        vec2 dv = uv - vec2(spark.x * k, spark.y); float d = length(dv), age = spark.z;
        float flash = exp(-d * 3.5) * exp(-age * 1.6) * .9;
        float ring = smoothstep(.03, .0, abs(d - age * .55)) * exp(-age * 1.4) * .8;
        float rays = pow(abs(cos(atan(dv.y, dv.x) * 5. + age * .25)), 40.) * exp(-d * 2.2) * exp(-age * 1.5) * .9;
        extra += (flash + ring + rays) * vec3(1., .94, .86);
      }
      gl_FragColor = vec4(.5 + (outc + extra) * .55, 1.);  // 0.5 = neutral for soft-light
    }`;

  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(["res", "t", "warm", "amp", "mode", "modeAmt", "spark"].map((n) => [n, gl.getUniformLocation(prog, n)]));

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const redraw = () => { if (still) { last = 0; requestAnimationFrame(frame); } }; // no running loop to pick changes up

  // the light takes on the colour of the card in hand (app.js dispatches "tint")
  const warm = [1, .96, .88], target = [...warm];
  addEventListener("tint", (e) => { target.splice(0, 3, ...(e.detail || [1, .96, .88])); redraw(); });

  // card number -> signature light: 1 falling stars, 2 water, 3 rising dust, 4 lemon blinds, 5 mirror ball
  const MOODS = { 30: 1, 41: 1, 52: 1, 0: 2, 27: 2, 51: 2, 28: 3, 32: 3, 53: 3, 42: 4, 40: 5 };
  let mode = 0, wantMode = 0, modeAmt = 0;
  addEventListener("mood", (e) => { wantMode = MOODS[e.detail] || 0; redraw(); });

  // app.js says whether Spotify is playing; paused, the room goes still
  let amp = 1, wantAmp = 1, speed = 1, wantSpeed = 1;
  addEventListener("music", (e) => { wantAmp = e.detail.playing ? 1 : .5; wantSpeed = e.detail.playing ? 1 : .15; redraw(); });

  let spark = [0, 0], sparkAt = -1e9;
  addEventListener("spark", (e) => { if (!still) { spark = [e.detail.x, e.detail.y]; sparkAt = performance.now(); } });

  const scale = 0.5; // render at half resolution; the blur hides it
  function resize() {
    canvas.width = Math.max(1, Math.round(innerWidth * scale));
    canvas.height = Math.max(1, Math.round(innerHeight * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.res, canvas.width, canvas.height);
  }
  resize();
  addEventListener("resize", resize);

  let time = 40, last = 0, prev = performance.now();
  function frame(now) {
    if (!document.hidden && now - last > 33) { // ~30fps is plenty for slow light
      last = now;
      const ease = still ? 1 : .04;
      amp += (wantAmp - amp) * ease;
      speed += (wantSpeed - speed) * (still ? 1 : .03);
      time += Math.min(.1, (now - prev) / 1000) * speed;
      prev = now;
      if (mode !== wantMode) { modeAmt = still ? 0 : Math.max(0, modeAmt - .04); if (!modeAmt) mode = wantMode; }
      if (mode === wantMode) modeAmt = mode ? Math.min(1, modeAmt + (still ? 1 : .02)) : 0;
      for (let i = 0; i < 3; i++) warm[i] += (target[i] - warm[i]) * ease;
      gl.uniform1f(u.t, time);
      gl.uniform3fv(u.warm, warm);
      gl.uniform1f(u.amp, amp);
      gl.uniform1f(u.mode, mode);
      gl.uniform1f(u.modeAmt, modeAmt);
      gl.uniform3f(u.spark, spark[0], spark[1], (now - sparkAt) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (!still) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
