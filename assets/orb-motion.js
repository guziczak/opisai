/* Time-based spring drag and damped release for the floating OpisAI bubble.
 * No DOM, timers or application actions: the caller owns the animation loop. */
(() => {
  'use strict';
  const SPRING = 580;
  const DAMPING = 34;
  const FRICTION = 7.5;
  const MAX_SPEED = 1800;
  const REST_SPEED = 7;
  const BOUNCE = .24;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function create({x = 0, y = 0, bounds = {}, reducedMotion = false} = {}) {
    let limits, targetX = x, targetY = y, vx = 0, vy = 0, mode = 'idle';
    let reduced = !!reducedMotion;

    function limitSpeed() {
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_SPEED) { vx *= MAX_SPEED / speed; vy *= MAX_SPEED / speed; }
    }
    function snapshot() {
      const unsettled = mode === 'drag' && Math.hypot(targetX - x, targetY - y) > .1;
      return {x, y, vx, vy, mode, moving: !reduced && (unsettled || Math.hypot(vx, vy) > 0)};
    }
    function stop() {
      vx = vy = 0; targetX = x; targetY = y; mode = 'idle';
      return snapshot();
    }
    function setBounds(next) {
      const minX = Number.isFinite(next.minX) ? next.minX : 0;
      const minY = Number.isFinite(next.minY) ? next.minY : 0;
      limits = {
        minX, minY,
        maxX: Math.max(minX, Number.isFinite(next.maxX) ? next.maxX : minX),
        maxY: Math.max(minY, Number.isFinite(next.maxY) ? next.maxY : minY)
      };
      x = clamp(x, limits.minX, limits.maxX); y = clamp(y, limits.minY, limits.maxY);
      targetX = clamp(targetX, limits.minX, limits.maxX);
      targetY = clamp(targetY, limits.minY, limits.maxY);
      if ((x === limits.minX && vx < 0) || (x === limits.maxX && vx > 0)) vx = 0;
      if ((y === limits.minY && vy < 0) || (y === limits.maxY && vy > 0)) vy = 0;
      return snapshot();
    }
    function place(nextX, nextY) {
      if (Number.isFinite(nextX)) x = clamp(nextX, limits.minX, limits.maxX);
      if (Number.isFinite(nextY)) y = clamp(nextY, limits.minY, limits.maxY);
      return stop();
    }
    function begin() { stop(); mode = 'drag'; return snapshot(); }
    function follow(nextX, nextY) {
      if (mode !== 'drag') return snapshot();
      if (Number.isFinite(nextX)) targetX = clamp(nextX, limits.minX, limits.maxX);
      if (Number.isFinite(nextY)) targetY = clamp(nextY, limits.minY, limits.maxY);
      if (reduced) { x = targetX; y = targetY; vx = vy = 0; }
      return snapshot();
    }
    function release({velocityX = 0, velocityY = 0} = {}) {
      if (mode !== 'drag' || reduced) return stop();
      // Input velocity also covers a quick flick between two display frames.
      const inputX = Number.isFinite(velocityX) ? velocityX : 0;
      const inputY = Number.isFinite(velocityY) ? velocityY : 0;
      vx = vx * .65 + clamp(inputX, -MAX_SPEED, MAX_SPEED) * .35;
      vy = vy * .65 + clamp(inputY, -MAX_SPEED, MAX_SPEED) * .35;
      limitSpeed(); mode = 'coast';
      if (Math.hypot(vx, vy) < REST_SPEED) return stop();
      return snapshot();
    }
    function setReducedMotion(value) {
      reduced = !!value;
      if (reduced) {
        if (mode === 'drag') { x = targetX; y = targetY; vx = vy = 0; }
        else stop();
      }
      return snapshot();
    }
    function step(seconds) {
      if (reduced || mode === 'idle' || !Number.isFinite(seconds) || seconds <= 0) return snapshot();
      // A hidden tab must not accumulate a large jump when frames resume.
      let remaining = Math.min(seconds, .05);
      while (remaining > 1e-7) {
        const dt = Math.min(remaining, 1 / 120); remaining -= dt;
        if (mode === 'drag') {
          vx += (SPRING * (targetX - x) - DAMPING * vx) * dt;
          vy += (SPRING * (targetY - y) - DAMPING * vy) * dt;
          limitSpeed(); x += vx * dt; y += vy * dt;
        } else {
          const decay = Math.exp(-FRICTION * dt);
          x += vx * (1 - decay) / FRICTION;
          y += vy * (1 - decay) / FRICTION;
          vx *= decay; vy *= decay;
        }
        if (x < limits.minX) { x = limits.minX; vx = mode === 'coast' ? Math.abs(vx) * BOUNCE : 0; }
        if (x > limits.maxX) { x = limits.maxX; vx = mode === 'coast' ? -Math.abs(vx) * BOUNCE : 0; }
        if (y < limits.minY) { y = limits.minY; vy = mode === 'coast' ? Math.abs(vy) * BOUNCE : 0; }
        if (y > limits.maxY) { y = limits.maxY; vy = mode === 'coast' ? -Math.abs(vy) * BOUNCE : 0; }
      }
      if (mode === 'drag' && Math.hypot(targetX - x, targetY - y) < .1 && Math.hypot(vx, vy) < REST_SPEED) {
        x = targetX; y = targetY; vx = vy = 0;
      } else if (mode === 'coast' && Math.hypot(vx, vy) < REST_SPEED) stop();
      return snapshot();
    }

    setBounds(bounds);
    return {snapshot, setBounds, place, begin, follow, release, stop, step, setReducedMotion};
  }

  const api = {create};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.OpisAIOrbMotion = api;
})();
