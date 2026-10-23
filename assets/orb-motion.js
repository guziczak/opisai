/* Time-based elastic drag and damped release for the floating OpisAI bubble.
 * No DOM, timers or application actions: the caller owns the animation loop. */
(() => {
  'use strict';
  const SPRING = 580;
  const DAMPING = 34;
  const FRICTION = 7.5;
  const MAX_SPEED = 1800;
  const REST_SPEED = 7;
  const BOUNCE = .24;
  const SHAPE_SPRING = 420;
  const SHAPE_DAMPING = 22;
  const MAX_STRAIN = .65;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function create({x = 0, y = 0, bounds = {}, diameter = 100, reducedMotion = false} = {}) {
    let limits, targetX = x, targetY = y, vx = 0, vy = 0, mode = 'idle';
    let strainX = 0, strainY = 0, strainVX = 0, strainVY = 0;
    let size = Number.isFinite(diameter) && diameter > 0 ? diameter : 100;
    let reduced = !!reducedMotion;

    function limitSpeed() {
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_SPEED) { vx *= MAX_SPEED / speed; vy *= MAX_SPEED / speed; }
    }
    function shape() {
      let strain = reduced ? 0 : Math.min(MAX_STRAIN, Math.hypot(strainX, strainY));
      if (strain === 0) return {stretch:1, squash:1, angle:0};
      // An ellipse has an axis, not a heading. The double-angle representation
      // lets it turn smoothly without flipping when the pointer reverses.
      const angle = Math.atan2(strainY, strainX) / 2;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const roomX = 1 + 2 * Math.min(x - limits.minX, limits.maxX - x) / size;
      const roomY = 1 + 2 * Math.min(y - limits.minY, limits.maxY - y) / size;
      const fits = amount => {
        const stretch = 1 + amount, squash = 1 / stretch;
        return Math.hypot(stretch * cos, squash * sin) <= roomX + 1e-10 &&
          Math.hypot(stretch * sin, squash * cos) <= roomY + 1e-10;
      };
      // Keep the full ellipse within the desktop, without moving the hit area
      // or reserving a permanent wide margin for a resting circular bubble.
      if (!fits(strain)) {
        let low = 0, high = strain;
        for (let i = 0; i < 14; i++) {
          const middle = (low + high) / 2;
          if (fits(middle)) low = middle; else high = middle;
        }
        strain = low;
      }
      return {stretch:1 + strain, squash:1 / (1 + strain), angle};
    }
    function resetShape() { strainX = strainY = strainVX = strainVY = 0; }
    function stepShape(dt) {
      let goalX = 0, goalY = 0;
      if (mode === 'drag') {
        const dx = targetX - x, dy = targetY - y, lag = Math.hypot(dx, dy);
        if (lag > .1) {
          const strain = Math.min(.6, lag / (size * .75));
          goalX = strain * (dx * dx - dy * dy) / (lag * lag);
          goalY = strain * 2 * dx * dy / (lag * lag);
        }
      }
      // Load the rubber while the body trails the pointer. Releasing removes
      // that load, but preserves shape velocity for a short elastic recovery.
      strainVX += (SHAPE_SPRING * (goalX - strainX) - SHAPE_DAMPING * strainVX) * dt;
      strainVY += (SHAPE_SPRING * (goalY - strainY) - SHAPE_DAMPING * strainVY) * dt;
      strainX += strainVX * dt; strainY += strainVY * dt;
      if (goalX === 0 && goalY === 0 && Math.hypot(strainX, strainY) < .001 &&
          Math.hypot(strainVX, strainVY) < .015) resetShape();
    }
    function snapshot() {
      const unsettled = mode === 'drag' && Math.hypot(targetX - x, targetY - y) > .1;
      const deforming = strainX !== 0 || strainY !== 0 || strainVX !== 0 || strainVY !== 0;
      return {x, y, vx, vy, mode, ...shape(),
        moving: !reduced && (unsettled || Math.hypot(vx, vy) > 0 || deforming)};
    }
    function restPosition() {
      vx = vy = 0; targetX = x; targetY = y; mode = 'idle';
    }
    function stop() {
      restPosition(); resetShape();
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
    function setDiameter(value) {
      if (Number.isFinite(value) && value > 0) size = value;
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
      if (Math.hypot(vx, vy) < REST_SPEED) restPosition();
      return snapshot();
    }
    function setReducedMotion(value) {
      reduced = !!value;
      if (reduced) {
        resetShape();
        if (mode === 'drag') { x = targetX; y = targetY; vx = vy = 0; }
        else stop();
      }
      return snapshot();
    }
    function step(seconds) {
      if (reduced || !Number.isFinite(seconds) || seconds <= 0) return snapshot();
      // A hidden tab must not accumulate a large jump when frames resume.
      let remaining = Math.min(seconds, .05);
      while (remaining > 1e-7) {
        const dt = Math.min(remaining, 1 / 120); remaining -= dt;
        stepShape(dt);
        if (mode === 'drag') {
          vx += (SPRING * (targetX - x) - DAMPING * vx) * dt;
          vy += (SPRING * (targetY - y) - DAMPING * vy) * dt;
          limitSpeed(); x += vx * dt; y += vy * dt;
        } else if (mode === 'coast') {
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
      } else if (mode === 'coast' && Math.hypot(vx, vy) < REST_SPEED) restPosition();
      return snapshot();
    }

    setBounds(bounds);
    return {snapshot, setBounds, setDiameter, place, begin, follow, release, stop, step, setReducedMotion};
  }

  const api = {create};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.OpisAIOrbMotion = api;
})();
