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

// These checks use visible ellipse dimensions and axes. They deliberately do
// not duplicate the spring equation or require a particular internal state.
const openBounds={minX:8,minY:8,maxX:2400,maxY:2000};
const elastic=options=>create({x:600,y:600,bounds:openBounds,diameter:100,...options});
function dragFor(motion,pointer,vx,vy,seconds=.35,fps=60){
  const start={...pointer},states=[];
  for(let elapsed=0;elapsed<seconds-1e-9;){
    const dt=Math.min(1/fps,seconds-elapsed);elapsed+=dt;
    pointer.x=start.x+vx*elapsed;pointer.y=start.y+vy*elapsed;
    motion.follow(pointer.x,pointer.y);states.push(motion.step(dt));
  }
  return states;
}
function shapeMatrix(state){
  const c=Math.cos(state.angle),s=Math.sin(state.angle),a=state.stretch,b=state.squash;
  return [a*c*c+b*s*s,(a-b)*c*s,a*s*s+b*c*c];
}
function validShape(state){
  for(const key of ['stretch','squash','angle'])assert.ok(Number.isFinite(state[key]),key+' must be finite');
  assert.ok(state.stretch>=1&&state.stretch<=1.65+1e-9,'stretch must remain within the safe visible range');
  assert.ok(state.squash>0);assert.ok(Math.abs(state.stretch*state.squash-1)<1e-9,'stretch preserves the apparent area');
}
function circular(state){
  validShape(state);assert.equal(state.stretch,1);assert.equal(state.squash,1);
}
function aligned(state,angle){
  assert.ok(Math.abs(Math.cos(state.angle-angle))>.96,'the long axis must follow the drag direction, modulo a half turn');
}
function contained(state,diameter,limits){
  validShape(state);
  const radius=diameter/2,cx=state.x+radius,cy=state.y+radius;
  const ex=radius*Math.hypot(state.stretch*Math.cos(state.angle),state.squash*Math.sin(state.angle));
  const ey=radius*Math.hypot(state.stretch*Math.sin(state.angle),state.squash*Math.cos(state.angle));
  assert.ok(cx-ex>=limits.minX-1e-6&&cx+ex<=limits.maxX+diameter+1e-6,'the visible ellipse must fit horizontally');
  assert.ok(cy-ey>=limits.minY-1e-6&&cy+ey<=limits.maxY+diameter+1e-6,'the visible ellipse must fit vertically');
}

test('ordinary central dragging visibly stretches the bubble by at least twenty percent',()=>{
  for(const speed of [400,550,700]){
    const motion=elastic(),pointer={x:600,y:600};motion.begin();
    const states=dragFor(motion,pointer,speed,0);
    states.forEach(validShape);
    assert.ok(states.at(-1).stretch>1.2,`${speed} px/s must look stretched, not almost circular`);
    assert.ok(states.at(-1).squash<.84,'the perpendicular axis contracts with the stretch');
  }
});

test('horizontal, vertical and diagonal drags stretch along their actual axes',()=>{
  const shapes=[0,Math.PI/2,Math.PI/4,-Math.PI/4].map(angle=>{
    const motion=elastic(),pointer={x:600,y:600};motion.begin();
    const state=dragFor(motion,pointer,550*Math.cos(angle),550*Math.sin(angle)).at(-1);
    validShape(state);assert.ok(state.stretch>1.2);aligned(state,angle);return state;
  });
  assert.ok(Math.max(...shapes.map(s=>s.stretch))-Math.min(...shapes.map(s=>s.stretch))<.02,'equal-speed drags have comparable deformation in every direction');
});

test('sharp axis changes and reversals keep the visible shape continuous',()=>{
  for(const angle of [Math.PI/2,Math.PI]){
    const motion=elastic(),pointer={x:600,y:600};motion.begin();
    const before=dragFor(motion,pointer,600,0).at(-1),turn=dragFor(motion,pointer,600*Math.cos(angle),600*Math.sin(angle));
    let previous=shapeMatrix(before);
    for(const state of turn){
      validShape(state);const current=shapeMatrix(state);
      assert.ok(Math.hypot(...current.map((value,i)=>value-previous[i]))<.25,'one display frame cannot abruptly flip or reset the shape');
      previous=current;
    }
    assert.ok(turn.at(-1).stretch>1.2);aligned(turn.at(-1),angle);
  }
});

test('release preserves the loaded shape before a finite elastic return to a circle',()=>{
  const motion=elastic(),pointer={x:600,y:600};motion.begin();
  const before=dragFor(motion,pointer,550,0).at(-1),released=motion.release({velocityX:550});
  assert.ok(before.stretch>1.2);assert.deepEqual(shapeMatrix(released),shapeMatrix(before),'lifting the pointer must not reset the shape');
  const first=motion.step(1/60);assert.ok(first.stretch>1.15,'recovery takes visible time rather than one abrupt frame');
  const late=advance(motion,2);circular(late);assert.equal(late.moving,false);
  assert.deepEqual(advance(motion,1),late,'a settled shape must not restart its animation');
});

test('shape recovery keeps requesting frames after translation is already idle, then stops',()=>{
  const motion=elastic();motion.begin();motion.follow(760,600);
  let resting=null;
  for(let frame=0;frame<120;frame++){
    const state=motion.step(1/60);
    if(state.x===760&&state.vx===0&&state.vy===0){resting=state;break;}
  }
  assert.ok(resting&&resting.stretch>1.001,'a stopped body can still hold elastic deformation');
  const released=motion.release();assert.equal(released.mode,'idle');assert.equal(released.vx,0);assert.equal(released.vy,0);
  assert.ok(released.moving,'the animation loop must remain alive for the shape alone');
  let state=released,frames=0;
  while(state.moving&&frames<120){state=motion.step(1/60);frames++;assert.equal(state.x,released.x);assert.equal(state.y,released.y);}
  assert.ok(frames>1&&frames<120,'shape-only recovery must run for a finite number of frames');
  circular(state);assert.equal(state.moving,false);
});

test('stop and reduced motion immediately remove deformation without reviving it later',()=>{
  for(const reset of ['stop','reduced']){
    const motion=elastic(),pointer={x:600,y:600};motion.begin();
    assert.ok(dragFor(motion,pointer,600,0).at(-1).stretch>1.2);
    const state=reset==='stop'?motion.stop():motion.setReducedMotion(true);
    circular(state);assert.equal(state.moving,false);assert.deepEqual(advance(motion,1),state);
    if(reset==='reduced'){
      motion.follow(950,720);const direct=motion.snapshot();circular(direct);
      assert.equal(direct.x,950);assert.equal(direct.y,720);assert.equal(direct.moving,false);
      motion.setReducedMotion(false);circular(motion.snapshot());assert.equal(motion.snapshot().moving,false);
    }
  }
});

test('the complete stretched ellipse stays inside every desktop edge and corner',()=>{
  const tight={minX:8,minY:8,maxX:408,maxY:308};
  for(const diameter of [75,100,125])for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
    const motion=elastic({x:208,y:158,bounds:tight,diameter}),pointer={x:208,y:158};motion.begin();
    const length=Math.hypot(dx,dy),vx=1000*dx/length,vy=1000*dy/length;
    for(const state of dragFor(motion,pointer,vx,vy,.5))contained(state,diameter,tight);
    contained(motion.release({velocityX:vx,velocityY:vy}),diameter,tight);
    for(let frame=0;frame<120;frame++)contained(motion.step(1/60),diameter,tight);
    assert.equal(motion.snapshot().moving,false);
  }
});

test('deformation scales with bubble diameter and responds to a changed size',()=>{
  const shapes=[75,100,125].map(diameter=>{
    const motion=elastic({diameter}),pointer={x:600,y:600};motion.begin();
    return dragFor(motion,pointer,diameter*5.5,0).at(-1);
  });
  assert.ok(shapes.every(state=>state.stretch>1.2));
  assert.ok(Math.max(...shapes.map(s=>s.stretch))-Math.min(...shapes.map(s=>s.stretch))<.015,'the same drag in bubble-diameters per second has the same visual elasticity');
  const resized=elastic();resized.setDiameter(125);resized.begin();
  const state=dragFor(resized,{x:600,y:600},125*5.5,0).at(-1);
  assert.ok(Math.abs(state.stretch-shapes[2].stretch)<1e-9,'changing size updates the deformation scale used by subsequent dragging');
});
