'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../assets/orb-motion.js');
const bounds = {minX:8, minY:8, maxX:1200, maxY:700};
const fresh = options => create({x:100, y:100, bounds, ...options});
function advance(motion, seconds, fps=60) {
  for(let elapsed=0; elapsed<seconds-1e-9; elapsed+=1/fps)motion.step(Math.min(1/fps, seconds-elapsed));
  return motion.snapshot();
}
function movingDrag(motion, fps=60) {
  motion.begin();
  for(let frame=1;frame<=fps/2;frame++) {
    motion.follow(100+600*frame/fps,100+180*frame/fps);
    motion.step(1/fps);
  }
}

test('drag follows with spring lag, then settles at the held pointer',()=>{
  const motion=fresh();motion.begin();motion.follow(400,250);
  let state=motion.step(1/60);
  assert.ok(state.x>100&&state.x<400,'one frame must move without teleporting');
  assert.ok(state.y>100&&state.y<250);
  assert.ok(state.moving);
  state=advance(motion,2);
  assert.equal(state.x,400);assert.equal(state.y,250);
  assert.equal(state.moving,false,'a stationary drag must stop requesting frames');
});

test('release continues in the drag direction and comes to a finite rest',()=>{
  const motion=fresh();movingDrag(motion);
  const released=motion.snapshot();
  motion.release({velocityX:600,velocityY:180});
  const early=advance(motion,.1);
  assert.ok(early.x>released.x+10);assert.ok(early.y>released.y);
  const late=advance(motion,2);
  assert.equal(late.mode,'idle');assert.equal(late.moving,false);
  assert.ok(late.x<released.x+150,'release is a short glide, not a trip across the desktop');
  assert.deepEqual(advance(motion,3),late);
});

test('a flick between display frames still carries momentum',()=>{
  const motion=fresh();motion.begin();motion.follow(130,100);
  motion.release({velocityX:900,velocityY:0});
  assert.ok(advance(motion,.1).x>110);
});

test('coasting distance is consistent at 30, 60 and 144 Hz',()=>{
  const positions=[30,60,144].map(fps=>{
    const motion=fresh();motion.begin();motion.follow(140,110);
    motion.release({velocityX:1100,velocityY:350});
    return advance(motion,2,fps);
  });
  assert.ok(Math.max(...positions.map(s=>s.x))-Math.min(...positions.map(s=>s.x))<1);
  assert.ok(Math.max(...positions.map(s=>s.y))-Math.min(...positions.map(s=>s.y))<1);
  assert.ok(positions.every(s=>!s.moving));
});

test('desktop edges contain a fast release and absorb its rebound',()=>{
  const tight={minX:8,minY:8,maxX:305,maxY:205};
  const motion=fresh({x:300,y:200,bounds:tight});
  motion.begin();motion.release({velocityX:1800,velocityY:1600});
  let bounced=false;
  for(let frame=0;frame<180;frame++){
    const state=motion.step(1/60);
    assert.ok(state.x>=8&&state.x<=305);assert.ok(state.y>=8&&state.y<=205);
    if(state.vx<0&&state.vy<0)bounced=true;
  }
  assert.ok(bounced);assert.equal(motion.snapshot().moving,false);
});

test('cancelling and catching a moving bubble stop the previous gesture',()=>{
  const motion=fresh();movingDrag(motion);motion.release({velocityX:600});advance(motion,.05);
  const caught=motion.begin();
  assert.equal(caught.vx,0);assert.equal(caught.vy,0);
  assert.equal(advance(motion,.2).x,caught.x);
  motion.follow(500,300);advance(motion,.05);
  const stopped=motion.stop();
  assert.deepEqual(advance(motion,1),stopped);
});

test('reduced motion uses direct dragging and disables release inertia',()=>{
  const motion=fresh({reducedMotion:true});
  motion.begin();let state=motion.follow(400,250);
  assert.equal(state.x,400);assert.equal(state.y,250);assert.equal(state.moving,false);
  motion.release({velocityX:1500,velocityY:900});
  assert.equal(advance(motion,1).x,400);
  motion.setReducedMotion(false);movingDrag(motion);motion.release({velocityX:600});
  assert.ok(motion.snapshot().moving);
  const stopped=motion.setReducedMotion(true);
  assert.equal(stopped.moving,false);assert.deepEqual(advance(motion,1),stopped);
});

test('resizing clamps both the bubble and its current drag destination',()=>{
  const motion=fresh();motion.begin();motion.follow(1000,650);advance(motion,.2);
  motion.setBounds({minX:8,minY:8,maxX:250,maxY:180});
  const state=advance(motion,2);
  assert.equal(state.x,250);assert.equal(state.y,180);
  motion.setBounds({minX:8,minY:8,maxX:-40,maxY:-20});
  assert.equal(motion.snapshot().x,8);assert.equal(motion.snapshot().y,8);
});

test('a delayed frame cannot accumulate seconds of runaway motion',()=>{
  const motion=fresh();motion.begin();motion.release({velocityX:1800});
  const before=motion.snapshot(),after=motion.step(30);
  assert.ok(after.x-before.x<80);
  assert.ok(Number.isFinite(after.x)&&Number.isFinite(after.y));
});
