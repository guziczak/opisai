/* Bubble models ported from OpisAI 0.12.0rc32: pointer following and release
 * (legacy_ui.py Bubble._tick), gesture recognition (ui/bubble_gestures.py),
 * the painted contour (Bubble._build_contour_path), the idle taskbar bounce
 * (ui/bubble_motion.py) and its droplets (ui/bubble_splash.py).
 * No DOM, timers or application actions: the caller owns the animation loop. */
(() => {
  'use strict';
  // rc32 animates on a 33 ms timer. Per-tick constants are converted to
  // elapsed time, so 30, 60 and 144 Hz displays follow the same curve.
  const TICK = 1 / 30, FOLLOW = .20, VEL_SMOOTH = .18, THROW_DECAY = .82;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const ease = (k, dt) => 1 - Math.pow(1 - k, dt / TICK);
  const THROW_RATE = -Math.log(THROW_DECAY) / TICK;

  /* Exponential following without overshoot ("NIGDY overshoot"); velocity is a
   * smoothed per-tick displacement, kept after release for a short glide. */
  function create({x = 0, y = 0, reducedMotion = false} = {}) {
    let targetX = x, targetY = y, vx = 0, vy = 0, mode = 'idle', reduced = !!reducedMotion;
    function shape() {
      const speed = Math.hypot(vx, vy);
      if (reduced || speed <= .01) return {stretch:0, angle:0};
      // Contour-only ellipse: up to +45 % along the motion, area preserving.
      return {stretch:Math.min(speed * .022, .45) * clamp((speed - .1) / 1.9, 0, 1), angle:Math.atan2(vy, vx)};
    }
    function snapshot() {
      const following = mode === 'drag' && (Math.hypot(targetX - x, targetY - y) >= .5 || Math.hypot(vx, vy) >= .3);
      return {x, y, vx:vx / TICK, vy:vy / TICK, mode, ...shape(), moving:!reduced && (following || mode === 'coast')};
    }
    function stop() { vx = vy = 0; targetX = x; targetY = y; mode = 'idle'; return snapshot(); }
    function place(nextX, nextY) { if (Number.isFinite(nextX)) x = nextX; if (Number.isFinite(nextY)) y = nextY; return stop(); }
    function begin() { stop(); mode = 'drag'; return snapshot(); }
    function follow(nextX, nextY) {
      if (mode !== 'drag') return snapshot();
      if (Number.isFinite(nextX)) targetX = nextX;
      if (Number.isFinite(nextY)) targetY = nextY;
      if (reduced) { x = targetX; y = targetY; vx = vy = 0; }
      return snapshot();
    }
    function release() {
      // The glide continues with the bubble's own smoothed velocity, as in rc32.
      if (mode !== 'drag' || reduced) return stop();
      targetX = x; targetY = y; mode = 'coast';
      if (Math.abs(vx) <= .05 && Math.abs(vy) <= .05) return stop();
      return snapshot();
    }
    function setReducedMotion(value) {
      reduced = !!value;
      if (reduced) { if (mode === 'drag') { x = targetX; y = targetY; vx = vy = 0; } else stop(); }
      return snapshot();
    }
    function step(seconds) {
      if (reduced || !Number.isFinite(seconds) || seconds <= 0) return snapshot();
      const dt = Math.min(seconds, .1); // a hidden tab cannot accumulate a jump
      if (mode === 'drag') {
        const dx = (targetX - x) * FOLLOW, dy = (targetY - y) * FOLLOW, smooth = ease(VEL_SMOOTH, dt), follow = ease(FOLLOW, dt);
        vx += (dx - vx) * smooth; vy += (dy - vy) * smooth;
        x += (targetX - x) * follow; y += (targetY - y) * follow;
        if (Math.hypot(targetX - x, targetY - y) < .5 && Math.hypot(vx, vy) < .3) { x = targetX; y = targetY; vx = vy = 0; }
      } else if (mode === 'coast') {
        const decay = Math.exp(-THROW_RATE * dt);
        x += vx / TICK * (1 - decay) / THROW_RATE; y += vy / TICK * (1 - decay) / THROW_RATE;
        vx *= decay; vy *= decay;
        if (Math.abs(vx) <= .05 && Math.abs(vy) <= .05) stop();
      }
      return snapshot();
    }
    return {snapshot, place, begin, follow, release, stop, step, setReducedMotion};
  }

  /* Click, hold and drag decisions (ui/bubble_gestures.py). A meaningful
   * excursion rules out click and hold; release before the 180 ms drag delay
   * is a CANCEL; after HOLD all movement is ignored until release. */
  function createGesture({dragDelay = .180, holdDelay = .450} = {}) {
    let phase = 'idle', session = 0, position = null, origin = null, started = null, distance = 0, maxDistance = 0, allowHold = false;
    const holdPending = () => phase === 'pressed' && allowHold;
    const deadline = () => started === null ? null : phase === 'pending' ? started + dragDelay : holdPending() ? started + holdDelay : null;
    function observe(point) {
      position = [+point[0], +point[1]];
      maxDistance = Math.max(maxDistance, Math.abs(position[0] - origin[0]) + Math.abs(position[1] - origin[1]));
      if (phase === 'pressed' && maxDistance > 0 && maxDistance >= distance) phase = 'pending';
    }
    return {
      get phase() { return phase; }, get session() { return session; }, get position() { return position; },
      get active() { return phase !== 'idle'; }, get holdPending() { return holdPending(); }, get nextDeadline() { return deadline(); },
      start(point, now, options = {}) {
        session++; phase = 'pressed'; position = origin = [+point[0], +point[1]]; started = now;
        distance = Math.max(0, +options.distance || 0); maxDistance = 0; allowHold = options.allowHold !== false;
        return session;
      },
      move(point, now) {
        if (phase === 'idle' || phase === 'held') return [];
        observe(point);
        if (phase === 'dragging') return ['drag-move'];
        if (phase === 'pending' && now >= deadline()) { phase = 'dragging'; return ['drag-start']; }
        return [];
      },
      advance(now, from = null) {
        if (from !== null && from !== session) return [];
        const due = deadline();
        if (due === null || now < due) return [];
        if (phase === 'pending') { phase = 'dragging'; return ['drag-start']; }
        phase = 'held'; return ['hold'];
      },
      release(point, now) {
        if (phase === 'idle') return [];
        if (phase === 'held') { phase = 'idle'; return []; }
        observe(point);
        const was = phase, holdDue = holdPending() ? deadline() : null;
        phase = 'idle';
        if (was === 'dragging') return ['drop'];
        if (was === 'pending' || (holdDue !== null && now >= holdDue)) return ['cancel'];
        return ['click'];
      },
      cancel() { if (phase === 'idle') return []; phase = 'idle'; return ['cancel']; }
    };
  }

  /* Unit contour with wider lower shoulders during floor contact. */
  function contactPoint(angle, contact) {
    let x = Math.cos(angle), y = Math.sin(angle);
    const amount = clamp(contact, 0, 1);
    if (amount) { const lower = Math.max(0, y); x *= 1 + .13 * amount * lower; y += .35 * amount * lower * lower * (1 - lower); }
    return [x, y];
  }

  /* The 56-point painted outline: hover breathing, contour-only drag ellipse
   * with a leading bump, cell-division bulge, squash and jelly contact. */
  function contour({r = 50, amp = 0, hp1 = 0, hp2 = 0, angle = 0, stretch = 0, bulge = 0, bulgeAngle = 0, sx = 1, sy = 1, anchor = 0, contact = 0} = {}) {
    const N = 56, pts = [], a = r * (1 + stretch), b = r * (1 - stretch / (1 + stretch));
    let jelly = null, areaScale = 1;
    if (contact > .001) {
      jelly = Array.from({length:N}, (_, i) => contactPoint(2 * Math.PI * i / N, contact));
      let area = 0;
      for (let i = 0; i < N; i++) { const p = jelly[i], q = jelly[(i + 1) % N]; area += p[0] * q[1] - q[0] * p[1]; }
      areaScale = (N * Math.sin(2 * Math.PI / N) / 2) / Math.abs(area / 2);
    }
    for (let i = 0; i < N; i++) {
      const t = 2 * Math.PI * i / N;
      if (jelly) { pts.push([r * jelly[i][0] * areaScale * sx, r * jelly[i][1] * sy]); continue; }
      let deform = (Math.sin(t * 2 + .8 + hp1) * 1.7 + Math.sin(t * 3 + 2.1 + hp2 * 1.3)) * amp, radius = r;
      if (stretch > .001) {
        const c = Math.cos(t - angle), s = Math.sin(t - angle), den = Math.hypot(b * c, a * s);
        radius = (den > 1e-6 ? a * b / den : r) + Math.max(0, c) * r * .25 * stretch;
        if (c > 0) deform *= Math.max(.15, 1 - .85 * c * (stretch / .45));
      }
      radius += deform;
      if (Math.abs(bulge) > .005) { const c = Math.cos(t - bulgeAngle); if (c > 0) radius += bulge * r * .8 * c * c; }
      pts.push([radius * Math.cos(t) * sx, r * (1 - sy) * anchor + radius * Math.sin(t) * sy]);
    }
    const f = n => (Math.round(n * 100) / 100).toString();
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i + N - 1) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d + 'Z';
  }

  /* Idle taskbar bounce: two vertical masses on a hardening, damped spring;
   * only the lower mass meets the floor (ui/bubble_motion.py JellyBounce). */
  const J = {STEP:1 / 960, GRAVITY:1100, TOP_MASS:.92, STIFFNESS:110, HARDENING:80, HARDENING_START:.35, MAX_COMPRESSION:.58,
    DAMPING:.70, LATE_DAMPING:4.5, SETTLING_DAMPING:8, SETTLING_ENERGY:2000};
  J.MIN_HEIGHT = 1 - J.MAX_COMPRESSION;
  function createJelly(fall, radius = 50) {
    const distance = Math.max(0, +fall || 0), r = Math.max(1, +radius || 50), length = r * 2;
    let top = -length, bottom = 0, topV = 0, bottomV = 0, remainder = 0, flightStretch = 0, quietAge = 0, grounded = false;
    let impactCount = 0, impactSpeed = 0, settled = false;
    function frame() {
      const height = clamp((bottom - top) / length, J.MIN_HEIGHT, 1.18);
      let fade = Math.min(1, Math.max(0, distance - bottom) / (r * .8)); fade = fade * fade * (3 - 2 * fade);
      const scaleY = height * (1 + flightStretch * fade), compression = Math.max(0, 1 - height);
      return {offset:bottom + r * (1 - scaleY), velocity:(topV + bottomV) / 2, scaleX:1 / scaleY, scaleY,
        contact:grounded ? Math.min(1, compression / .30) : 0, impactCount, impactSpeed, settled};
    }
    function integrate(dt) {
      const compression = length - (bottom - top), span = J.MAX_COMPRESSION - J.HARDENING_START;
      const hardening = Math.min(.985, Math.max(0, (compression / length - J.HARDENING_START) / span)), reserve = 1 - hardening;
      const hardeningForce = J.HARDENING * length * hardening ** 3 / reserve ** 2;
      const hardeningEnergy = J.HARDENING * length ** 2 * span * (1 / reserve + 3 * Math.log1p(-hardening) + 3 * hardening - hardening ** 2 / 2 - 1);
      const equilibrium = J.GRAVITY * J.TOP_MASS / J.STIFFNESS;
      const energy = .5 * J.TOP_MASS * topV ** 2 + .5 * (1 - J.TOP_MASS) * bottomV ** 2 + J.GRAVITY * Math.max(0, distance - bottom)
        + .5 * J.STIFFNESS * (compression - equilibrium) ** 2 + hardeningEnergy;
      const quietBlend = 1 / (1 + (energy / J.SETTLING_ENERGY) ** 2);
      const lossBlend = 1 / (1 + (energy / Math.max(J.SETTLING_ENERGY, J.GRAVITY * distance * .28)) ** 4);
      let damping = J.DAMPING + (J.LATE_DAMPING - J.DAMPING) * lossBlend;
      damping += (J.SETTLING_DAMPING - damping) * quietBlend;
      const force = J.STIFFNESS * compression + hardeningForce + damping * (topV - bottomV);
      topV += (J.GRAVITY - force / J.TOP_MASS) * dt; bottomV += (J.GRAVITY + force / (1 - J.TOP_MASS)) * dt;
      top += topV * dt; bottom += bottomV * dt;
      const was = grounded;
      grounded = bottom >= distance;
      if (grounded) {
        if (!was && bottomV > 18) { impactCount++; impactSpeed = bottomV; }
        bottom = distance; bottomV = Math.min(0, bottomV);
      }
      if (bottom - top < length * J.MIN_HEIGHT) { top = bottom - length * J.MIN_HEIGHT; topV = Math.min(topV, bottomV); }
      const speed = Math.abs((topV + bottomV) / 2), wanted = grounded ? 0 : Math.min(.065, speed / 900 * .065);
      flightStretch += (wanted - flightStretch) * (1 - Math.exp(-dt / .12));
      const rest = length - J.GRAVITY * J.TOP_MASS / J.STIFFNESS;
      quietAge = grounded && Math.abs(topV) < 2 && Math.abs((bottom - top) - rest) < .35 ? quietAge + dt : 0;
      settled = quietAge >= .22;
    }
    function fixedStep(dt) {
      // Resolve the short, stiff pressure pulse with bounded substeps.
      let remaining = dt;
      const span = J.MAX_COMPRESSION - J.HARDENING_START;
      while (remaining > 1e-12) {
        const compression = (length - bottom + top) / length;
        const hardening = Math.min(.985, Math.max(0, (compression - J.HARDENING_START) / span)), reserve = 1 - hardening;
        const stiffness = J.STIFFNESS + J.HARDENING / span * (3 * hardening ** 2 / reserve ** 2 + 2 * hardening ** 3 / reserve ** 3);
        const inverseMass = 1 / J.TOP_MASS + (grounded ? 0 : 1 / (1 - J.TOP_MASS));
        const closing = Math.max(1, topV - bottomV);
        const substep = Math.min(remaining, .025 / Math.sqrt(stiffness * inverseMass), .01 * Math.max(.0001, J.MAX_COMPRESSION - compression) * length / closing);
        integrate(substep); remaining -= substep;
      }
    }
    return {
      get frame() { return frame(); },
      advance(dt) {
        if (settled) return frame();
        remainder += Math.min(.12, Math.max(0, +dt || 0)); // a delayed tick cannot teleport the bubble
        while (remainder + 1e-12 >= J.STEP && !settled) { fixedStep(J.STEP); remainder -= J.STEP; }
        return frame();
      }
    };
  }

  /* Small ballistic droplets shed from the lower shoulders at an impact. */
  const SPLASH = {GRAVITY:1100, AIR_DRAG:1.15, LIGAMENT:.052, WET:.19};
  function splash({centerX, floorY, radius, halfWidth, scaleY, impactSpeed, impactIndex}) {
    const values = [centerX, floorY, radius, halfWidth, scaleY, impactSpeed];
    if (!values.every(Number.isFinite) || radius <= 0 || halfWidth <= 0 || scaleY <= 0 || impactSpeed < 180 || impactIndex < 0 || impactIndex >= 3) return [];
    const count = impactIndex === 0 ? (impactSpeed >= 700 ? 6 : 4) : impactIndex === 1 ? (impactSpeed >= 450 ? 4 : 2) : impactSpeed >= 350 ? 2 : 0;
    const strength = clamp((impactSpeed - 180) / 700, 0, 1), size = clamp(radius / 50, .65, 1.6), contact = clamp((1 - scaleY) / .30, 0, 1);
    const variants = [[.91, .86, .92], [1.05, 1.02, 1.04], [1.12, .69, .78]];
    let widest = 0;
    for (let i = 0; i < 56; i++) widest = Math.max(widest, Math.abs(contactPoint(2 * Math.PI * i / 56, contact)[0]));
    const drops = [];
    for (let index = 0; index < count; index++) {
      const side = index % 2 === 0 ? -1 : 1, [lateral, upward, dropSize] = variants[index >> 1], asymmetry = side < 0 ? .97 : 1.035;
      const [ux, uy] = contactPoint(Math.acos(.855 + (index >> 1) * .012), contact), dropRadius = (1.7 + .95 * strength) * dropSize * size;
      const x = centerX + side * halfWidth * ux / widest, y = Math.min(floorY - radius * scaleY * (1 - uy), floorY - dropRadius);
      const vx = side * (91 + 107 * strength) * lateral * asymmetry, vy = -(73 + 103 * strength) * upward / asymmetry;
      const flight = (-vy + Math.sqrt(vy * vy + 2 * SPLASH.GRAVITY * Math.max(0, floorY - dropRadius - y))) / SPLASH.GRAVITY;
      drops.push({x, y, vx, vy, radius:dropRadius, floorY, delay:(index >> 1) * .009, flight, lifetime:(index >> 1) * .009 + flight + SPLASH.WET});
    }
    return drops;
  }
  function sampleDrop(drop, age) {
    const elapsed = age - drop.delay;
    if (elapsed < 0 || age >= drop.lifetime) return null;
    const horizontal = t => { const decay = Math.exp(-SPLASH.AIR_DRAG * t); return [drop.x + drop.vx * (1 - decay) / SPLASH.AIR_DRAG, drop.vx * decay]; };
    if (elapsed >= drop.flight) {
      const progress = Math.min(1, (elapsed - drop.flight) / SPLASH.WET);
      return {x:horizontal(drop.flight)[0], y:drop.floorY, vx:0, vy:0, radius:drop.radius, opacity:(1 - progress) ** 1.65, phase:'wet', progress, ligament:0};
    }
    const [x, vx] = horizontal(elapsed);
    return {x, y:Math.min(drop.floorY - drop.radius, drop.y + drop.vy * elapsed + .5 * SPLASH.GRAVITY * elapsed * elapsed), vx, vy:drop.vy + SPLASH.GRAVITY * elapsed,
      radius:drop.radius, opacity:1, phase:'flight', progress:elapsed / drop.flight, ligament:Math.max(0, 1 - elapsed / SPLASH.LIGAMENT)};
  }

  const api = {TICK, ease, create, createGesture, contour, contactPoint, createJelly, splash, sampleDrop};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.OpisAIOrbMotion = api;
})();
