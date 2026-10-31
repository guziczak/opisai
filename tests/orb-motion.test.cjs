'use strict';
// Pure models of the 0.12.0rc32 bubble: following and release (Bubble._tick),
// gesture recognition (ui/bubble_gestures.py), the painted contour, the idle
// jelly bounce (ui/bubble_motion.py) and its droplets (ui/bubble_splash.py).
const test = require('node:test');
const assert = require('node:assert/strict');
const {TICK, create, createGesture, contour, createJelly, splash, sampleDrop} = require('../assets/orb-motion.js');
const fresh = options => create({x:100, y:100, ...options});
function advance(motion, seconds, fps = 60) {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 1 / fps) motion.step(Math.min(1 / fps, seconds - elapsed));
  return motion.snapshot();
}
function movingDrag(motion, fps = 60) {
  motion.begin();
  for (let frame = 1; frame <= fps / 2; frame++) { motion.follow(100 + 600 * frame / fps, 100 + 180 * frame / fps); motion.step(1 / fps); }
}
function points(d) {
  const n = d.match(/-?[\d.]+/g).map(Number), p = [];
  for (let i = 0; i < n.length; i += 2) p.push([n[i], n[i + 1]]);
  return [p[0], ...p.filter((_, i) => i > 0 && i % 3 === 0)];
}

test('drag follows the pointer by 20 % per 33 ms tick and never overshoots it', () => {
  const motion = fresh(); motion.begin(); motion.follow(400, 250);
  const first = motion.step(TICK);
  assert.ok(Math.abs(first.x - (100 + 300 * .2)) < 1e-9, 'one rc32 tick covers a fifth of the distance');
  assert.ok(Math.abs(first.y - (100 + 150 * .2)) < 1e-9);
  let previous = first.x;
  for (let frame = 0; frame < 240; frame++) {
    const state = motion.step(1 / 120);
    assert.ok(state.x >= previous - 1e-9 && state.x <= 400, 'the approach is monotonic: no spring overshoot');
    previous = state.x;
  }
  const rest = motion.snapshot();
  assert.equal(rest.x, 400); assert.equal(rest.y, 250); assert.equal(rest.moving, false, 'a held pointer stops the animation loop');
});

test('release glides with the bubble own velocity, which decays by 0.82 per tick, then stops', () => {
  const motion = fresh(); movingDrag(motion);
  const released = motion.release();
  assert.equal(released.mode, 'coast'); assert.ok(released.vx > 0 && released.vy > 0, 'the glide keeps the smoothed drag direction');
  const next = motion.step(TICK);
  assert.ok(Math.abs(next.vx / released.vx - .82) < 1e-9, 'velocity decay per 33 ms is the rc32 throw decay');
  const late = advance(motion, 2);
  assert.equal(late.mode, 'idle'); assert.equal(late.moving, false);
  assert.ok(late.x > released.x + 20 && late.x < released.x + 250, 'a short, finite glide');
  assert.deepEqual(advance(motion, 2), late);
});

test('a bubble that never moved has nothing to throw', () => {
  const motion = fresh(); motion.begin();
  const released = motion.release();
  assert.equal(released.mode, 'idle'); assert.equal(released.moving, false);
});

test('glide distance is the same at 30, 60 and 144 Hz', () => {
  const positions = [30, 60, 144].map(fps => {
    const motion = fresh(); movingDrag(motion, 60); motion.release();
    return advance(motion, 2, fps);
  });
  assert.ok(Math.max(...positions.map(s => s.x)) - Math.min(...positions.map(s => s.x)) < 1);
  assert.ok(Math.max(...positions.map(s => s.y)) - Math.min(...positions.map(s => s.y)) < 1);
});

test('there are no desktop edges in the model: no clamping and no rebound', () => {
  const motion = create({x:30, y:30}); motion.begin();
  for (let frame = 1; frame <= 20; frame++) { motion.follow(30 - frame * 25, 30 - frame * 25); motion.step(1 / 60); }
  const released = motion.release();
  let previous = released;
  for (let frame = 0; frame < 120; frame++) {
    const state = motion.step(1 / 60);
    assert.ok(state.vx <= 0 && state.vy <= 0, 'a glide never reverses at an edge');
    assert.ok(state.x <= previous.x && state.y <= previous.y);
    previous = state;
  }
  assert.ok(previous.x < 0 && previous.y < 0, 'the bubble may leave the desktop; the controller rescues it later');
});

test('catching a gliding bubble stops it at once', () => {
  const motion = fresh(); movingDrag(motion); motion.release(); advance(motion, .05);
  const caught = motion.begin();
  assert.equal(caught.vx, 0); assert.equal(caught.vy, 0);
  assert.equal(advance(motion, .3).x, caught.x);
  const stopped = motion.stop();
  assert.deepEqual(advance(motion, 1), stopped);
});

test('reduced motion follows directly and never glides or deforms', () => {
  const motion = fresh({reducedMotion:true}); motion.begin();
  const state = motion.follow(400, 250);
  assert.equal(state.x, 400); assert.equal(state.y, 250); assert.equal(state.moving, false); assert.equal(state.stretch, 0);
  motion.release(); assert.equal(advance(motion, 1).x, 400);
  motion.setReducedMotion(false); movingDrag(motion); motion.release();
  assert.ok(motion.snapshot().moving);
  const stopped = motion.setReducedMotion(true);
  assert.equal(stopped.moving, false); assert.deepEqual(advance(motion, 1), stopped);
});

test('a delayed frame cannot accumulate seconds of motion', () => {
  const motion = fresh(); movingDrag(motion); motion.release();
  const before = motion.snapshot(), after = motion.step(30);
  assert.ok(after.x - before.x < 150); assert.ok(Number.isFinite(after.x) && Number.isFinite(after.y));
});

test('only the contour stretches: up to 45 % along the motion with a leading bump', () => {
  const motion = fresh(); motion.begin();
  let stretch = 0;
  for (let frame = 1; frame <= 60; frame++) { motion.follow(100 + frame * 40, 100); stretch = Math.max(stretch, motion.step(1 / 60).stretch); }
  assert.ok(stretch > .3 && stretch <= .45 + 1e-12, 'a fast drag shows a strong but capped stretch');
  assert.ok(Math.abs(motion.snapshot().angle) < 1e-9, 'the ellipse points along the motion');
  const right = points(contour({r:50, stretch:.44, angle:0}));
  const xs = right.map(p => p[0]);
  assert.ok(Math.abs(Math.max(...xs) - 50 * (1.44 + .25 * .44)) < .01, 'front: ellipse plus a quarter-stretch bump');
  assert.ok(Math.abs(Math.min(...xs) + 50 * 1.44) < .01, 'back: the plain ellipse');
  const side = right.reduce((p, q) => Math.abs(q[0]) < Math.abs(p[0]) && q[1] > 0 ? q : p);
  assert.ok(Math.abs(side[1] - 50 * (1 - .44 / 1.44)) < .01, 'area-preserving short axis across the motion');
  const front = right.filter(p => p[0] > 35).map(p => Math.abs(p[1])), back = right.filter(p => p[0] < -35).map(p => Math.abs(p[1]));
  assert.ok(Math.max(...front) > Math.max(...back), 'drop shape: the leading half is fuller');
  for (const [x, y] of points(contour({r:50}))) assert.ok(Math.abs(Math.hypot(x, y) - 50) < .01, 'at rest the outline is a circle');
});

test('the stretch follows the direction of motion', () => {
  for (const angle of [Math.PI / 2, -Math.PI / 4, Math.PI]) {
    const motion = fresh(); motion.begin();
    for (let frame = 1; frame <= 30; frame++) { motion.follow(100 + 900 * Math.cos(angle) * frame / 60, 100 + 900 * Math.sin(angle) * frame / 60); motion.step(1 / 60); }
    assert.ok(Math.cos(motion.snapshot().angle - angle) > .999);
  }
});

// ui/bubble_gestures.py decisions, with the same cases as rc32's tests.
function gesture() { const g = createGesture(); const session = g.start([100, 200], 10, {distance:10}); return {g, session}; }
test('a click tolerates small motion; the excursion threshold starts a pending drag', () => {
  let {g} = gesture();
  assert.deepEqual(g.move([104, 204], 10.1), []); assert.deepEqual(g.release([105, 203], 10.15), ['click']);
  ({g} = gesture());
  assert.deepEqual(g.move([105, 205], 10.05), []); assert.equal(g.phase, 'pending'); assert.equal(g.holdPending, false);
  assert.ok(Math.abs(g.nextDeadline - 10.18) < 1e-9);
  assert.deepEqual(g.advance(10.179), []); assert.deepEqual(g.advance(10.18), ['drag-start']); assert.deepEqual(g.position, [105, 205]);
});
test('release before the 180 ms drag delay cancels: no click, hold, move or drop', () => {
  let {g} = gesture();
  g.move([200, 200], 10.05); assert.deepEqual(g.release([200, 200], 10.179), ['cancel']); assert.deepEqual(g.advance(10.45), []);
  ({g} = gesture());
  g.move([120, 200], 10.04); g.move([100, 200], 10.08); assert.deepEqual(g.release([100, 200], 10.12), ['cancel'], 'an excursion stays latched');
  ({g} = gesture());
  for (let i = 0; i < 20; i++) g.move([i % 2 ? 104 : 96, 200], 10.01 + i * .005);
  assert.deepEqual(g.release([100, 200], 10.15), ['click'], 'jitter is distance from the press, not path length');
});
test('a drag starts from the remembered position and ends with one drop', () => {
  const {g} = gesture();
  g.move([120, 200], 10.04); g.move([140, 230], 10.10);
  assert.deepEqual(g.advance(10.18), ['drag-start']); assert.deepEqual(g.position, [140, 230]);
  assert.deepEqual(g.move([150, 240], 10.2), ['drag-move']); assert.deepEqual(g.release([170, 260], 10.25), ['drop']);
  assert.deepEqual(g.release([170, 260], 10.26), []);
});
test('hold fires once at 450 ms and then ignores movement', () => {
  let {g} = gesture();
  assert.ok(g.holdPending); assert.ok(Math.abs(g.nextDeadline - 10.45) < 1e-9);
  assert.deepEqual(g.advance(10.449), []); assert.deepEqual(g.advance(10.45), ['hold']); assert.equal(g.phase, 'held');
  assert.deepEqual(g.advance(11), []); assert.deepEqual(g.move([400, 500], 11.1), []); assert.deepEqual(g.release([400, 500], 11.2), []);
  ({g} = gesture()); assert.deepEqual(g.release([100, 200], 10.449), ['click']);
  ({g} = gesture()); assert.deepEqual(g.release([100, 200], 10.45), ['cancel'], 'a late hold timer cannot become a click');
  g.start([100, 200], 10, {distance:10, allowHold:false});
  assert.equal(g.nextDeadline, null); assert.deepEqual(g.release([100, 200], 15), ['click'], 'without hold a long press is a click');
});
test('stale timers and repeated cancels have no effect', () => {
  const {g, session} = gesture();
  g.cancel();
  const newer = g.start([100, 200], 10.1, {distance:10});
  g.move([120, 200], 10.12);
  assert.deepEqual(g.advance(10.18, session), []); assert.deepEqual(g.advance(10.28, newer), ['drag-start']);
  assert.deepEqual(g.cancel(), ['cancel']); assert.deepEqual(g.cancel(), []); assert.deepEqual(g.release([1, 1], 11), []);
});

// Recorded from the Python originals (opisai_app/ui/bubble_motion.py, bubble_splash.py).
test('the jelly bounce reproduces rc32 JellyBounce frames', () => {
  const model = createJelly(250, 50), frames = [];
  for (let i = 0; i < 240; i++) frames.push(model.advance(1 / 60));
  const expect = {20:[66.540673, 1.018809, 0, 0], 40:[253.493568, .930129, .232905, 1], 120:[265.868585, .682628, 1, 2], 200:[251.567813, .956886, 0, 3]};
  for (const [index, [offset, scaleY, contact, impacts]] of Object.entries(expect)) {
    const f = frames[index];
    assert.ok(Math.abs(f.offset - offset) < 1e-5, `offset at frame ${index}`); assert.ok(Math.abs(f.scaleY - scaleY) < 1e-5);
    assert.ok(Math.abs(f.contact - contact) < 1e-5); assert.equal(f.impactCount, impacts);
    assert.ok(Math.abs(f.scaleX * f.scaleY - 1) < 1e-12, 'squash preserves the area');
  }
  assert.ok(Math.abs(frames[40].impactSpeed - 741.354) < 1e-3);
});
test('the jelly bounce is independent of frame rate and settles', () => {
  const models = [createJelly(330), createJelly(330), createJelly(330)];
  for (let i = 0; i < 96; i++) models[0].advance(1 / 30);
  for (let i = 0; i < 384; i++) models[1].advance(1 / 120);
  for (let i = 0; i < 32; i++) for (const dt of [.0125, .025, .0625]) models[2].advance(dt);
  for (const model of models.slice(1)) {
    assert.ok(Math.abs(model.frame.offset - models[0].frame.offset) < 1e-8); assert.ok(Math.abs(model.frame.scaleY - models[0].frame.scaleY) < 1e-8);
  }
  const model = createJelly(250);
  let frame = model.advance(10); assert.ok(frame.offset < 12, 'a stalled tick has bounded catch-up');
  for (let i = 0; i < 400 && !frame.settled; i++) frame = model.advance(1 / 30);
  assert.ok(frame.settled); assert.ok(frame.impactCount >= 2 && frame.impactCount <= 6);
});
test('impact droplets follow rc32 counts and launch values', () => {
  const burst = changes => splash({centerX:600, floorY:900, radius:50, halfWidth:68, scaleY:.68, impactSpeed:700, impactIndex:0, ...changes});
  for (const [speed, impact, count] of [[179, 0, 0], [180, 0, 4], [699, 0, 4], [700, 0, 6], [700, 1, 4], [300, 1, 2], [349, 2, 0], [350, 2, 2], [1200, 3, 0]])
    assert.equal(burst({impactSpeed:speed, impactIndex:impact}).length, count, `${speed} px/s, impact ${impact}`);
  const [first, second] = burst({});
  assert.ok(Math.abs(first.x - 538.443397) < 1e-5 && Math.abs(first.y - 885.174129) < 1e-5);
  assert.ok(Math.abs(first.vx + 150.48774) < 1e-5 && Math.abs(first.vy + 132.559057) < 1e-5 && Math.abs(first.radius - 2.213257) < 1e-5);
  assert.ok(second.vx > 0 && Math.abs(second.vx) !== Math.abs(first.vx), 'small deterministic asymmetry');
  const sample = sampleDrop(first, .08);
  assert.ok(Math.abs(sample.x - 526.941573) < 1e-5 && Math.abs(sample.y - 878.089404) < 1e-5); assert.equal(sample.phase, 'flight');
  assert.equal(sampleDrop(first, first.lifetime + .01), null);
});
