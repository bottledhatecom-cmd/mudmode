/* mudpity - early access. All original code and low-poly shapes built in code.
   Game logic is the same as the original 2D version (logical 320x180 px room space); this file adds a three.js view.
   Genre mechanics only (run, jump pits, swing on vines, avoid hazards, collect treasure, countdown).
   dev-moves: physical shield (approved plan, items 1-11). It rides on his back; the block input brings it round to the front.
   A block stops projectiles, physical attacks and logs; the shove and the stamina cost both scale with how hard the hit is.
   Stamina runs out while blocking = the shield drops where he stands and he has to walk over it to pick it up. With no shield
   he blocks with his hands and takes reduced damage. Stamina refills slowly on its own. An unblocked hit costs a heart; pits
   still cost a heart straight away. Every shield / stamina number is in the TUNE block below. */
(() => {
'use strict';
const W = 320, H = 180, GY = 130;          // logical size, ground line
const ROOMS = 12, TREASURES = 6, TIME = 180, LIVES = 3;
const BOSS_ROOMS = [3, 7, 11];            // rooms 4, 8 and 12 (1-based) are boss arenas
const SPEED = 70, JUMP_V = 190, GRAV = 520, STEP = 1 / 60;
const VINE_L = 78, VINE_A = 0.85, VINE_W = 2.1, VINE_Y = 28;
const SNAP_C = 2.8;
/* ======================= TUNING (shield + stamina) =======================
   Every shield and stamina number lives here. These are DEFAULTS for Michael to set in playtest; nothing else in the file
   hard-codes them. Units: stamina 0..STAM_MAX; force 1 = an ordinary rolling log; speeds in logical px/s (a room is 320 px
   wide, the hero runs at 70); times in seconds. */
const TUNE = {
  STAM_MAX: 100,               // full stamina
  BLOCK_COST_PER_FORCE: 25,    // stamina drained by one block = hit force x this (a force-1 log costs 25: 4 log blocks from full)
  REGEN_PER_SEC: 4,            // slow refill on its own, stamina per second (empty -> full in 25 s)
  REGEN_DELAY: 1.5,            // seconds after a block before the refill starts again
  RAISE_TIME: 0.18,            // seconds to reach back and bring the shield to the front; a block only counts once it is in front
  LOWER_TIME: 0.22,            // seconds to put it back on his back (look only)
  HAND_RAISE_TIME: 0.08,       // seconds to get his hands up when he has no shield
  HAND_BLOCK_DAMAGE: 0.5,      // hearts lost per hand block (an unblocked hit costs 1 heart); 0.5 = half damage
  REACT_VX_PER_FORCE: 110,     // shove speed per unit of force (no fixed push: a force-0.5 hit shoves half as hard)
  REACT_VY_PER_FORCE: 70,      // upward pop per unit of force
  REACT_T_PER_FORCE: 0.30,     // seconds of stagger per unit of force (no running or jumping while staggered)
  REACT_T_MAX: 0.8,            // a stagger never lasts longer than this
  BLOCK_INV: 0.45,             // seconds after a block in which the same hit can't land again
  PICKUP_RANGE: 8,             // px: walk this close over the dropped shield to pick it up
  BLOCK_MOVE_SCALE: 1,         // run speed while blocking (1 = unchanged)
  BLOCK_MODE_DEFAULT: 'press', // 'press' = tap to raise, tap again to lower; 'hold' = up while held (the player picks on the title screen)
  FORCE: {                     // how hard each hit is: more force = bigger shove and more stamina per block
    log: 1.0,                  //   x the log's speed / 57 (logs roll at 50-64 px/s)
    crawler: 0.6, snap: 0.8,
    mudBall: 0.8, mudSplash: 0.5, bogjaw: 1.6,      // boss 1 (BOGJAW)
    seedBomb: 1.2, swoop: 1.4,                      // boss 2 (GLOOMWING)
    totem: 2.0, shockwave: 1.0, totemBall: 0.9      // boss 3 (MUDTOTEM)
  },
  GLOW_MIN: 0.08,              // shield glow brightness at empty stamina
  GLOW_MAX: 1.0                // shield glow brightness at full stamina
};
const STAM_MAX = TUNE.STAM_MAX, FORCE = TUNE.FORCE;
const BLOCK_MODE_KEY = 'mudpity-block-mode';   // the player's press / hold choice, stored on this device only
const BEST_KEY = s => 'mudpity-best-v2:' + s;   // new best-score key: the shield changes scoring, so old bests stay under their old key

const P = { // earthy palette matching the approved art textures
  sky1:'#8fbfae', sky2:'#e9dfb8', trunk:'#2c6c66', trunk2:'#3a8079', canopy:'#5a3a22', canopy2:'#3f2616',
  grass:'#4f9a72', dirt:'#7a5233', dirt2:'#5e3d25', hole:'#1b1410', tar:'#17110e', cream:'#f3e6c4',
  orange:'#d9894a', ink:'#3f2616', vine:'#6f8a3a', log:'#8a5a30', gem:['#d9534f','#4aa3d9','#e8c14a']
};

/* ---------- seeded rng + generator ---------- */
function hash(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

function genWorld(seed){
  const rk = mulberry(hash(seed+'|kinds'));
  const kinds = ['log'];
  const bag = [['log',2],['pit',2],['vine',3],['snap',2],['crawl',2],['twin',1]];
  const tot = bag.reduce((s,b)=>s+b[1],0);
  for(let i=1;i<ROOMS;i++){
    let k, guard=0;
    do { let r=rk()*tot; k=bag[0][0]; for(const b of bag){ if((r-=b[1])<0){k=b[0];break;} } } while(k===kinds[i-1] && ++guard<20);
    kinds.push(k);
  }
  BOSS_ROOMS.forEach((ri,k)=>{ kinds[ri]='boss'+(k+1); });
  const rt = mulberry(hash(seed+'|treasure'));
  const idx=[]; for(let i=1;i<ROOMS;i++) idx.push(i);
  for(let i=idx.length-1;i>0;i--){const j=Math.floor(rt()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
  const tset = new Set(idx.filter(i=>!BOSS_ROOMS.includes(i)).slice(0,TREASURES));
  const rooms=[]; for(let i=0;i<ROOMS;i++) rooms.push(genRoom(seed,i,kinds[i],tset.has(i)));
  return {seed, rooms};
}
function genRoom(seed,i,kind,hasT){
  const r = mulberry(hash(seed+'|room|'+i));
  const rnd=(a,b)=>a+r()*(b-a), rint=(a,b)=>Math.floor(rnd(a,b+1));
  const room={i,kind,holes:[],pools:[],vines:[],crawlers:[],logs:false,treasure:null,trees:[],drips:[],holeKind:r()<.5?'void':'tar'};
  if(kind==='log'){ room.logs=true; }
  if(kind==='pit'){ const w=rint(30,40), x=rint(110,200); room.holes.push({x0:x,x1:x+w}); }
  if(kind==='twin'){ const w1=rint(26,32), w2=rint(26,32), x1=rint(70,100), x2=rint(190,225); room.holes.push({x0:x1,x1:x1+w1},{x0:x2,x1:x2+w2}); room.logs=r()<.4; }
  if(kind==='vine'){ const w=rint(86,100), x=rint(110,170); room.holes.push({x0:x,x1:x+w});
    room.vines.push({ax:x+w/2, ph:rnd(0,6.28), len:VINE_L}); }
  if(kind==='snap'){ const n=rint(3,4), w=n*24, x=rint(90,150); room.pools.push({x0:x,x1:x+w,n,ph:Array.from({length:n},()=>rnd(0,SNAP_C))}); }
  if(kind==='crawl'){ const n=rint(1,2); for(let k=0;k<n;k++) room.crawlers.push({cx:rint(110+k*90,150+k*90),range:rint(22,36),sp:rnd(18,28)}); room.logs=r()<.5; }
  if(kind==='boss1'){ room.logs=true; }                                   // logs roll through the mire arena
  if(kind==='boss2'){ room.vines.push({ax:56,ph:rnd(0,6.28),len:VINE_L},{ax:264,ph:rnd(0,6.28),len:VINE_L}); }
  if(kind==='boss3'){ room.vines.push({ax:92,ph:rnd(0,6.28),len:VINE_L}); }
  // treasure
  if(hasT){
    const hz=[]; room.holes.forEach(h=>hz.push([h.x0,h.x1])); room.pools.forEach(p=>hz.push([p.x0,p.x1]));
    let tx, ty=GY-8, tries=0;
    if(room.holes.length && r()<.6){ const h=room.holes[0]; tx=(h.x0+h.x1)/2; ty=GY-48; }
    else { do { tx=rint(40,280); tries++; } while(tries<30 && hz.some(z=>tx>z[0]-14&&tx<z[1]+14)); if(r()<.5) ty=GY-44; }
    room.treasure={x:tx,y:ty,kind:rint(0,2)};
  }
  for(let k=0;k<5;k++) room.trees.push({x:rint(-10,310),w:rint(10,20),c:r()<.5?0:1});
  for(let x=0;x<W;x+=10) room.drips.push(rint(4,18));
  return room;
}

/* ---------- state ---------- */
const qs=new URLSearchParams(location.search);
const G={state:'title', seed:(qs.get('seed')||'mud').slice(0,24), world:null, t:0, timeLeft:TIME, lives:LIVES, score:0,
  got:new Set(), bosses:{}, burst:[], winT:0, drop:null, blocks:0, lastBlock:null, allGems:false, room:0, p:null, rs:null, result:'', msg:'', msgT:0, best:0};
try{ G.best=+localStorage.getItem(BEST_KEY(G.seed))||0; }catch(e){}
const keys={left:false,right:false,jump:false,block:false}; let jumpQ=0;
/* block input: 'press' toggles the block on and off, 'hold' blocks while the key / button is down */
let blockMode=TUNE.BLOCK_MODE_DEFAULT, blockLatch=false;
try{ const m=localStorage.getItem(BLOCK_MODE_KEY); if(m==='press'||m==='hold') blockMode=m; }catch(e){}
function setBlockMode(m){ blockMode=m==='hold'?'hold':'press'; blockLatch=false; keys.block=false; try{ localStorage.setItem(BLOCK_MODE_KEY,blockMode); }catch(e){} }
function blockInput(down){ if(blockMode==='hold') keys.block=!!down; else if(down) blockLatch=!blockLatch; }
const wantBlock=()=>blockMode==='hold'?keys.block:blockLatch;
G.world=genWorld(G.seed);

function newPlayer(x){return {x,y:GY,vx:0,vy:0,face:1,onGround:true,coyote:0,vine:null,vs:1,grabCd:0,kick:0,inv:0,dead:0,step:0,stam:STAM_MAX,react:0,binv:0,shield:true,blocking:false,blk:0,chip:0,regenT:0};}
function startRun(){
  G.world=genWorld(G.seed); G.t=0; G.timeLeft=TIME; G.lives=LIVES; G.score=0; G.got=new Set(); G.result='';
  G.bosses={}; G.winT=0; G.burst=[]; G.allGems=false; G.drop=null; G.blocks=0; G.lastBlock=null; blockLatch=false; keys.block=false;
  G.state='play'; enterRoom(0,null); sfx(520,.08);
}
function enterRoom(i,from){
  G.room=i; const room=G.world.rooms[i];
  const sx = from==='L'?14 : from==='R'?W-14 : 22;
  G.rs={spawn:sx, logs:[], logT:1.2, rng:mulberry(hash(G.seed+'|run|'+i)), crawlers:room.crawlers.map((c,k)=>({x:c.cx,d:k%2?1:-1}))};
  G.burst=[]; rs_boss();
  if(!G.p) G.p=newPlayer(sx);
}
function rs_boss(){ const room=G.world.rooms[G.room]; G.rs.boss=BOSS_DEF[room.kind]?mkBoss(room):null; }
function gid(i){return G.seed+'#'+i;}

/* ---------- helpers ---------- */
function holeAt(room,x){ for(const h of room.holes) if(x>h.x0&&x<h.x1) return h; return null; }
function vineAngle(v,t){ return VINE_A*Math.sin(VINE_W*t+v.ph); }
function vineVel(v,t){ return VINE_A*VINE_W*Math.cos(VINE_W*t+v.ph); }
function vinePt(v,t,s){ const a=vineAngle(v,t); return {x:v.ax+Math.sin(a)*v.len*s, y:VINE_Y+Math.cos(a)*v.len*s}; }
function snapOpen(pool,k,t){ return ((t+pool.ph[k])%SNAP_C)>1.7; }
function snapWarn(pool,k,t){ const m=((t+pool.ph[k])%SNAP_C); return m>1.4&&m<=1.7; }

let ac=null;
function sfx(f,d,type){ try{ if(!ac){ac=new (window.AudioContext||window.webkitAudioContext)();} const o=ac.createOscillator(),g=ac.createGain();
  o.type=type||'square'; o.frequency.value=f; g.gain.value=.04; g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+d);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+d); }catch(e){} }

function loseLife(why){
  const p=G.p; if(p.dead>0) return;
  p.dead=0.8; p.vine=null; p.chip=0; G.lives--; G.msg=why; G.msgT=1.2; sfx(110,.35,'sawtooth');
}
/* shield (plan items 3-10). A hit from a projectile, a physical attack or a log:
   - blocking with the shield in front: stamina drops by force x BLOCK_COST_PER_FORCE and he is shoved by the force of the hit;
     if that empties his stamina the shield drops on the ground where he is
   - blocking with no shield (hands): same shove, and HAND_BLOCK_DAMAGE of a heart instead of a whole one
   - not blocking (or the shield is still coming round): the hit costs a heart */
const blockReady=p=>p.blocking&&p.blk>=(p.shield?TUNE.RAISE_TIME:TUNE.HAND_RAISE_TIME);
function harm(why,sx,force){
  const p=G.p; if(p.inv>0||p.binv>0||p.dead>0) return;
  const f=force===undefined?1:Math.max(0,force);
  if(!blockReady(p)){ loseLife(why); return; }
  const d=(sx===undefined||sx===p.x)?-p.face:(p.x<sx?-1:1);
  p.vine=null; p.grabCd=0.3; p.kick=0; p.vx=d*TUNE.REACT_VX_PER_FORCE*f; p.vy=-TUNE.REACT_VY_PER_FORCE*f; if(p.vy<0) p.onGround=false; p.coyote=0;
  p.react=Math.min(TUNE.REACT_T_MAX,TUNE.REACT_T_PER_FORCE*f); p.binv=TUNE.BLOCK_INV; jumpQ=0;
  G.blocks++; G.lastBlock={why,force:f,hand:!p.shield,cost:p.shield?f*TUNE.BLOCK_COST_PER_FORCE:0};
  if(p.shield){
    p.stam=Math.max(0,p.stam-f*TUNE.BLOCK_COST_PER_FORCE); p.regenT=TUNE.REGEN_DELAY;
    if(p.stam<=0) dropShield(); else { G.msg='blocked: '+why; G.msgT=.7; sfx(520,.09,'triangle'); }
  } else {
    p.chip+=TUNE.HAND_BLOCK_DAMAGE;
    if(p.chip>=1-1e-9){ const rest=p.chip-1; loseLife(why+' (hand block)'); p.chip=Math.max(0,rest); }
    else { G.msg='hand block: '+why; G.msgT=.8; sfx(300,.1,'square'); }
  }
}
/* stamina ran out while blocking: the shield falls where he stands (over a pit it lands on the nearer edge) */
function dropShield(){
  const p=G.p, room=G.world.rooms[G.room]; let x=Math.max(8,Math.min(W-8,p.x)); const h=holeAt(room,x);
  if(h) x=(x-h.x0<h.x1-x)?h.x0-6:h.x1+6;
  G.drop={room:G.room,x:Math.max(8,Math.min(W-8,x))}; p.shield=false;
  G.msg='shield dropped! walk over it to pick it up'; G.msgT=1.6; sfx(160,.3,'sawtooth');
}
function addScore(n){ G.score+=n; }
function endRun(result){
  G.state='end'; G.result=result;
  if(result==='win') addScore(Math.max(0,Math.floor(G.timeLeft))*10);
  try{ if(G.score>G.best){G.best=G.score; localStorage.setItem(BEST_KEY(G.seed),String(G.best));} }catch(e){}
  sfx(result==='win'?880:140,.4);
}

/* ---------- update ---------- */
function update(dt){
  if(G.state!=='play') return;
  const room=G.world.rooms[G.room], p=G.p, rs=G.rs;
  G.t+=dt; G.timeLeft-=dt; if(G.msgT>0) G.msgT-=dt;
  if(G.timeLeft<=0){ G.timeLeft=0; endRun('time'); return; }
  if(jumpQ>0) jumpQ-=dt;
  if(p.grabCd>0) p.grabCd-=dt; if(p.inv>0) p.inv-=dt; if(p.binv>0) p.binv-=dt; if(p.react>0) p.react-=dt; if(p.kick>0) p.kick-=dt;
  // stamina refills slowly on its own (a short pause after each block)
  if(p.regenT>0) p.regenT-=dt; else p.stam=Math.min(STAM_MAX,p.stam+TUNE.REGEN_PER_SEC*dt);
  // block input: blk counts how long the block has been up (the shield has to come round from his back first)
  p.blocking=wantBlock()&&!p.vine&&p.dead<=0; p.blk=p.blocking?p.blk+dt:0;
  if(G.winT>0){ G.winT-=dt; if(G.winT<=0){ endRun('win'); return; } }

  // dying: wait then respawn or end
  if(p.dead>0){
    p.dead-=dt; p.y+=Math.min(p.vy,60)*dt;
    if(p.dead<=0){
      if(G.lives<=0){ endRun('lives'); return; }
      p.x=rs.spawn; p.y=GY; p.vx=0; p.vy=0; p.onGround=true; p.vine=null; p.inv=1.6; p.dead=0; jumpQ=0; p.kick=0; p.react=0; p.binv=0; if(rs.boss) bossReset(rs.boss);
    }
    stepWorld(room,rs,dt); return;
  }

  const ax=(keys.right?1:0)-(keys.left?1:0);
  if(p.vine){
    const v=p.vine, pt=vinePt(v,G.t,p.vs);
    p.x=pt.x; p.y=pt.y+14; p.vx=0; p.vy=0; p.onGround=false;
    if(ax) p.face=ax;
    if(jumpQ>0){ // release: carry the swing's velocity
      jumpQ=0; const a=vineAngle(v,G.t), w=vineVel(v,G.t), r=v.len*p.vs;
      p.vx=Math.max(-150,Math.min(150,r*w*Math.cos(a)))+ax*15; p.vy=-r*w*Math.sin(a)-70;
      p.vine=null; p.grabCd=0.35; p.kick=0.8; sfx(660,.07);
    }
  } else {
    if(p.onGround) p.coyote=0.08; else if(p.coyote>0) p.coyote-=dt;
    if(ax) p.face=ax;
    if(p.onGround&&p.react<=0){ p.vx=ax*SPEED*(p.blocking?TUNE.BLOCK_MOVE_SCALE:1); }
    else if(p.onGround){ p.vx*=Math.exp(-6*dt); }   // a shove from a blocked hit slides him along the ground and fades
    else { const tv=ax*SPEED, d=tv-p.vx, m=260*dt; p.vx+=Math.abs(d)<m?d:Math.sign(d)*m; }
    if(jumpQ>0 && p.coyote>0 && p.react<=0){ p.vy=-JUMP_V; p.onGround=false; p.coyote=0; jumpQ=0; sfx(440,.08); }
    const prevY=p.y;
    p.vy+=GRAV*dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
    if(p.onGround) p.step+=Math.abs(p.vx)*dt;
    // ground
    const hole=holeAt(room,p.x);
    if(p.y>=GY && prevY<=GY+1 && p.vy>=0 && !hole){ p.y=GY; p.vy=0; p.onGround=true; }
    else if(p.y>=GY && p.vy>=0 && !hole && p.y<GY+6){ p.y=GY; p.vy=0; p.onGround=true; }
    else if(p.y>GY+3 && hole){ p.x=Math.max(hole.x0+2,Math.min(hole.x1-2,p.x)); p.onGround=false; }
    else if(p.y<GY-0.5) p.onGround=false;
    if(!p.onGround && p.y>GY+2 && hole && p.y>H+8){ loseLife('into the pit'); }
    if(p.onGround && hole){ p.onGround=false; }
    // vine grab
    if(!p.onGround && p.grabCd<=0){
      for(const v of room.vines){
        for(let s=1;s>=0.4;s-=0.1){ const pt=vinePt(v,G.t,s);
          if(Math.hypot(p.x-pt.x,(p.y-18)-pt.y)<10){ p.vine=v; p.vs=s; sfx(300,.06); break; } }
        if(p.vine) break;
      }
    }
  }
  if(p.dead>0) return;
  // dropped shield: walk over it to pick it up
  if(!p.shield && G.drop && G.drop.room===G.room && p.onGround && Math.abs(p.x-G.drop.x)<TUNE.PICKUP_RANGE){
    p.shield=true; G.drop=null; G.msg='shield picked up'; G.msgT=.9; sfx(700,.08,'triangle'); }

  // room transitions
  if(!p.vine){
    const locked=isLocked();
    if(p.x>W){ if(G.room<ROOMS-1&&!locked){ p.x=3; enterRoom(G.room+1,'L'); } else p.x=W; }
    else if(p.x<0){ if(G.room>0&&!locked){ p.x=W-3; enterRoom(G.room-1,'R'); } else p.x=0; }
  }
  const room2=G.world.rooms[G.room], rs2=G.rs;
  stepWorld(room2,rs2,dt); bossUpdate(dt); burstUpdate(dt);

  // hazards (skip while invulnerable)
  if(p.inv<=0 && p.dead<=0){
    for(const l of rs2.logs) if(Math.abs(p.x-l.x)<9 && p.y>GY-13){ harm('hit by a log',l.x,FORCE.log*l.sp/57); break; }
    if(p.dead<=0) for(const c of rs2.crawlers) if(Math.abs(p.x-c.x)<9 && p.y>GY-8){ harm('crawler bite',c.x,FORCE.crawler); break; }
    if(p.dead<=0 && p.onGround) for(const pl of room2.pools){
      if(p.x>pl.x0&&p.x<pl.x1){ const k=Math.min(pl.n-1,Math.floor((p.x-pl.x0)/((pl.x1-pl.x0)/pl.n))); if(snapOpen(pl,k,G.t)) harm('snapped',undefined,FORCE.snap); } }
  }
  // treasure
  const tr=room2.treasure;
  if(tr && !G.got.has(gid(room2.i)) && p.dead<=0 && Math.abs(p.x-tr.x)<10 && Math.abs((p.y-12)-tr.y)<15){
    G.got.add(gid(room2.i)); addScore([500,300,800][tr.kind]); sfx(990,.1); G.msg='treasure!'; G.msgT=.8;
    if(G.got.size>=TREASURES&&!G.allGems){ G.allGems=true; addScore(1000); G.msg='all gems! +1000'; G.msgT=1.5; }
  }
}
function stepWorld(room,rs,dt){
  if(room.logs){
    rs.logT-=dt;
    if(rs.logT<=0){ rs.logs.push({x:W+8,sp:50+rs.rng()*14,rot:0}); rs.logT=2.2+rs.rng()*1.4; }
  }
  for(let i=rs.logs.length-1;i>=0;i--){ const l=rs.logs[i]; l.x-=l.sp*dt; l.rot+=dt*l.sp/7;
    if(l.x<-10 || holeAt(room,l.x)) rs.logs.splice(i,1); }
  room.crawlers.forEach((cr,k)=>{ const s=rs.crawlers[k]; s.x+=s.d*cr.sp*dt;
    if(s.x>cr.cx+cr.range){s.x=cr.cx+cr.range;s.d=-1;} if(s.x<cr.cx-cr.range){s.x=cr.cx-cr.range;s.d=1;} });
}


/* ---------- bosses (logic, logical px space; rooms 4, 8 and 12 are locked arenas) ---------- */
const BOSS_DEF = {
  boss1: { name: 'BOGJAW (mire beast)',     short: 'BOGJAW',    hp: 3, reward: 1500, gems: 8  },
  boss2: { name: 'GLOOMWING (canopy flyer)', short: 'GLOOMWING', hp: 4, reward: 2500, gems: 10 },
  boss3: { name: 'MUDTOTEM (final boss)',    short: 'MUDTOTEM',  hp: 5, reward: 5000, gems: 14 }
};  // boss names shown in the game
function isLocked(){ return !!(G.rs && G.rs.boss && !G.rs.boss.dead); }
function nextBoss(){ for(const ri of BOSS_ROOMS){ const sv=G.bosses[ri]; if(!(sv&&sv.done)&&ri>=G.room) return ri; } return -1; }
function mkBoss(room){
  const def=BOSS_DEF[room.kind]; if(!def) return null;
  const sv=G.bosses[room.i]||(G.bosses[room.i]={hp:def.hp,done:false}); if(sv.done) return null;
  G.msg='BOSS: '+def.short; G.msgT=1.8;
  return {kind:room.kind,name:def.name,def,sv,max:def.hp,hp:sv.hp,state:'intro',t:0,hurtCd:0,flash:0,dead:false,
    x:room.kind==='boss3'?248:160,y:room.kind==='boss2'?70:GY,h:0,cx:160,wait:0,n:0,seq:0,proj:[],arm:0,mouth:0,fired:0,shots:0,sx:0,ex:0};
}
function bossReset(b){          // after losing a life: same health, fresh telegraph
  b.state='idle'; b.t=0; b.wait=1.3; b.proj=[]; b.hurtCd=0; b.flash=0; b.arm=0; b.mouth=0; G.rs.logs=[]; G.rs.logT=2;
  if(b.kind==='boss1'){ b.h=0; } if(b.kind==='boss2'){ b.x=160; b.y=70; b.state='hover'; } if(b.kind==='boss3'){ b.x=248; b.h=78; }
}
const B_go=(b,s)=>{ b.state=s; b.t=0; };
function hitP(why,sx,f){ const p=G.p; if(p.inv<=0&&p.dead<=0) harm(why,sx,f); }
function stompOn(b,top,half){ const p=G.p; return p.vy>0&&!p.vine&&p.dead<=0&&Math.abs(p.x-b.x)<half+4&&p.y>=top-5&&p.y<=top+12; }
function bounceP(){ const p=G.p; p.vy=-170; p.onGround=false; p.coyote=0; }
function kickOn(b,hw,hh,cy){ const p=G.p; return p.kick>0&&!p.onGround&&!p.vine&&p.dead<=0&&Math.abs(p.x-b.x)<hw+6&&Math.abs((p.y-12)-cy)<hh+12; }
function kickBoss(b){ const p=G.p; if(hurtBoss(b)){ p.kick=0; p.vx=(p.x<b.x?-1:1)*90; p.vy=-90; return true; } return false; }
function hurtBoss(b){
  if(b.hurtCd>0||b.dead||b.state==='intro'||b.state==='dying') return false;
  b.hp--; b.sv.hp=Math.max(0,b.hp); b.hurtCd=1.1; b.flash=.6; addScore(250); sfx(200,.15,'sawtooth');
  if(b.hp<=0) bossDefeat(b);
  return true;
}
function bossDefeat(b){
  b.dead=true; b.state='dying'; b.t=0; b.sv.done=true; b.sv.hp=0; b.proj=[]; G.rs.logs=[];
  G.timeLeft+=15; addScore(b.def.reward); G.msg=b.def.short+' DEFEATED! +15 sec'; G.msgT=2.4; sfx(880,.3);
  const r=G.rs.rng; G.burst=[];
  for(let i=0;i<b.def.gems;i++) G.burst.push({x:b.x,y:(b.kind==='boss2'?b.y:GY-30),vx:(r()-.5)*190,vy:-(110+r()*120),kind:i%3,t:0});
  if(b.kind==='boss3') G.winT=3.4;
}
function burstUpdate(dt){
  const p=G.p; if(!G.burst||!G.burst.length||p.dead>0) return;
  for(let i=G.burst.length-1;i>=0;i--){ const g=G.burst[i]; g.t+=dt;
    if(g.t<.9){ g.vy+=GRAV*dt; g.x+=g.vx*dt; g.y+=g.vy*dt; if(g.y>GY-6){ g.y=GY-6; g.vy*=-.4; g.vx*=.7; } g.x=Math.max(4,Math.min(W-4,g.x)); }
    else { const tx=p.x,ty=p.y-12,dx=tx-g.x,dy=ty-g.y,d=Math.hypot(dx,dy)||1,sp=Math.min(d/dt,230); g.x+=dx/d*sp*dt; g.y+=dy/d*sp*dt; }
    if(Math.hypot(p.x-g.x,(p.y-12)-g.y)<9){ G.burst.splice(i,1); addScore(100); sfx(1100,.05); }
  }
}
function bossUpdate(dt){
  const rs=G.rs, b=rs.boss; if(!b) return; const p=G.p, enr=b.hp<=Math.ceil(b.max/2), m=enr?.7:1;
  b.t+=dt; if(b.hurtCd>0) b.hurtCd-=dt; if(b.flash>0) b.flash-=dt;
  if(b.state==='dying'){ if(b.t>1.4) rs.boss=null; return; }
  if(b.kind==='boss1') ai1(b,dt,p,rs,enr,m); else if(b.kind==='boss2') ai2(b,dt,p,rs,enr,m); else ai3(b,dt,p,rs,enr,m);
}
/* ---- boss 1: BOGJAW, a mire beast that lunges out of the mud ---- */
function ai1(b,dt,p,rs,enr,m){
  const P0=56,P1=264, clampC=x=>Math.max(P0+12,Math.min(P1-12,x));
  if(b.state==='intro'){ b.x=b.cx=160; b.h=22+5*Math.sin(b.t*3); if(b.t>1.5){ B_go(b,'idle'); b.wait=.7; } return; }
  if(b.h>=14){   // damage method: a rolling log that reaches the exposed head hurts it
    for(let i=rs.logs.length-1;i>=0;i--){ if(Math.abs(rs.logs[i].x-b.x)<18){ rs.logs.splice(i,1); if(hurtBoss(b)&&!b.dead&&b.state==='stun') B_go(b,'sink'); break; } }
    if(!b.dead&&kickOn(b,16,b.h/2,GY-b.h/2)&&kickBoss(b)&&!b.dead&&b.state==='stun') B_go(b,'sink');   // vine kick
  }
  if(b.dead) return;
  switch(b.state){
    case 'idle': b.h=Math.max(0,b.h-100*dt); b.wait-=dt;
      if(b.wait<=0){ b.n++; if(b.n===1||rs.rng()<.6){ b.cx=clampC(p.x+p.vx*.3); B_go(b,'tele'); } else { b.cx=p.x<160?236:84; B_go(b,'stele'); } } break;
    case 'tele': { const dur=1.0*m; b.h=0; b.x=b.cx; if(b.t>=dur) B_go(b,'lunge'); break; }   // the ripple marks where it will lunge; step out of it
    case 'lunge': b.x=b.cx; b.h=52*Math.sin(Math.min(1,b.t/.2)*Math.PI/2); b.mouth=1;
      if(p.dead<=0&&Math.abs(p.x-b.cx)<16&&p.y>GY-b.h+2&&b.h>8) hitP('mauled by Bogjaw',b.cx,FORCE.bogjaw);
      if(b.t>=.45) B_go(b,'stun'); break;
    case 'stun': b.x=b.cx; b.h=Math.max(24,b.h-160*dt); b.mouth=.3;
      if(stompOn(b,GY-b.h,16)){ bounceP(); hurtBoss(b); if(!b.dead) B_go(b,'sink'); break; }
      if(b.t>=(enr?1.6:2.0)) B_go(b,'sink'); break;
    case 'sink': b.x=b.cx; b.mouth=0; b.h=Math.max(0,b.h-90*dt); if(b.h<=0&&b.t>.3){ B_go(b,'idle'); b.wait=(enr?.6:1.0)+rs.rng()*.4; } break;
    case 'stele': b.x=b.cx; b.h=30*Math.min(1,b.t/.3); b.mouth=.4; if(b.t>=.8*m){ B_go(b,'spit'); b.shots=enr?2:1; b.fired=0; } break;
    case 'spit': b.x=b.cx; b.h=30; b.mouth=1;
      if(b.fired<b.shots&&b.t>=b.fired*.4){ const T=.9,y0=GY-30,tx=p.x+(b.fired?p.vx*.45:0); b.proj.push({t:'ball',x:b.cx,y:y0,vx:Math.max(-210,Math.min(210,(tx-b.cx)/T)),vy:(GY-y0-.5*GRAV*T*T)/T}); b.fired++; sfx(250,.1,'sawtooth'); }
      if(b.t>=.4*b.shots+.3) B_go(b,'sink'); break;
  }
  for(let i=b.proj.length-1;i>=0;i--){ const q=b.proj[i];
    if(q.t==='ball'){ q.vy+=GRAV*dt; q.x+=q.vx*dt; q.y+=q.vy*dt; if(q.y>=GY-4){ q.t='puddle'; q.y=GY; q.life=.55; }
      else if(p.dead<=0&&Math.hypot(p.x-q.x,(p.y-12)-q.y)<9) hitP('mud ball',q.x,FORCE.mudBall); }
    else { q.life-=dt; if(q.life<=0){ b.proj.splice(i,1); continue; } if(p.dead<=0&&Math.abs(p.x-q.x)<13&&p.y>GY-9) hitP('mud splash',q.x,FORCE.mudSplash); }
  }
}
/* ---- boss 2: GLOOMWING, a canopy creature: seed-bombs, swoops, then lands exhausted ---- */
function ai2(b,dt,p,rs,enr,m){
  const ease=(k)=>Math.min(1,dt*k);
  if(b.state==='intro'){ b.x=160; b.y=70+4*Math.sin(b.t*3); if(b.t>1.5){ B_go(b,'hover'); b.wait=.9; } return; }
  const kickable=['hover','btele','bombs','stel'].includes(b.state);
  if(kickable&&kickOn(b,20,14,b.y)&&kickBoss(b)&&!b.dead){ B_go(b,'hover'); b.wait=1.1; }   // vine kick
  if(b.dead) return;
  switch(b.state){
    case 'hover': b.x+=(160+88*Math.sin(G.t*.9)-b.x)*ease(3); b.y+=(74-b.y)*ease(4); b.wait-=dt;
      if(b.wait<=0){ b.n++; B_go(b,(b.n===1||rs.rng()<.5)?'btele':'stel'); } break;
    case 'btele': b.x+=(160+88*Math.sin(G.t*.9)-b.x)*ease(2); b.y+=(52-b.y)*ease(5); if(b.t>=.8*m){ B_go(b,'bombs'); b.fired=0; b.shots=enr?5:3; } break;
    case 'bombs': { const gap=.28*m;
      if(b.fired<b.shots&&b.t>=b.fired*gap){ const k=b.fired, off=k===0?0:(k%2?1:-1)*Math.ceil(k/2)*46; b.proj.push({t:'bomb',x:Math.max(14,Math.min(W-14,p.x+p.vx*.4+off)),y:b.y+10,vy:0,st:'fall',tt:0}); b.fired++; sfx(330,.06); }
      if(b.fired>=b.shots&&b.t>b.shots*gap+.3){ B_go(b,'hover'); b.wait=(enr?.8:1.3)+rs.rng()*.4; } break; }
    case 'stel': { const tx=p.x<160?Math.min(296,p.x+110):Math.max(24,p.x-110); b.x+=(tx-b.x)*ease(5); b.y+=(46-b.y)*ease(5);
      if(b.t>=.9*m){ b.sx=b.x; b.ex=Math.max(-20,Math.min(340,2*p.x-b.sx)); B_go(b,'swoop'); sfx(150,.3,'sawtooth'); } break; }   // dives straight through where you stood: jump it
    case 'swoop': { const dur=1.6*m, u=Math.min(1,b.t/dur); b.x=b.sx+(b.ex-b.sx)*u; b.y=46+(GY-12-46)*Math.sin(Math.PI*u);
      if(p.dead<=0&&Math.abs(p.x-b.x)<18&&Math.abs((p.y-12)-b.y)<16) hitP('Gloomwing swoop',b.x,FORCE.swoop);
      if(u>=1){ B_go(b,'land'); } break; }
    case 'land': b.y+=(GY-14-b.y)*ease(7); b.x+=(Math.max(30,Math.min(290,b.x))-b.x)*ease(8); if(b.t>=.6){ b.y=GY-14; B_go(b,'rest'); } break;
    case 'rest': b.y=GY-14;
      if(stompOn(b,b.y-13,20)){ bounceP(); hurtBoss(b); if(!b.dead){ B_go(b,'rise'); } break; }
      if(b.t>=(enr?1.6:2.2)) B_go(b,'rise'); break;
    case 'rise': b.y+=(74-b.y)*ease(4); if(b.t>=.7){ B_go(b,'hover'); b.wait=(enr?.7:1.1); } break;
  }
  for(let i=b.proj.length-1;i>=0;i--){ const q=b.proj[i]; q.tt+=dt;
    if(q.st==='fall'){ q.vy+=380*dt; q.y+=q.vy*dt; if(q.y>=GY-5){ q.y=GY-5; q.st='fuse'; q.tt=0; } }
    else if(q.st==='fuse'){ if(q.tt>=.75){ q.st='boom'; q.tt=0; sfx(90,.25,'sawtooth'); } }
    else { if(p.dead<=0&&Math.hypot(p.x-q.x,(p.y-10)-q.y)<18&&q.tt<.25) hitP('seed bomb',q.x,FORCE.seedBomb); if(q.tt>=.3) b.proj.splice(i,1); }
  }
}
/* ---- boss 3: MUDTOTEM, ground slams send shockwaves along the floor; jump over them ---- */
function ai3(b,dt,p,rs,enr,m){
  const SEQ=['slam','volley','slam'];
  b.x=248;
  if(b.state==='intro'){ b.h=78; b.arm=0; if(b.t>1.6){ B_go(b,'idle'); b.wait=.9; } return; }
  const vuln=['idle','stele','vtele','volley'].includes(b.state);
  if(vuln&&kickOn(b,22,b.h/2,GY-b.h/2)&&kickBoss(b)&&!b.dead){ B_go(b,'idle'); b.wait=1.2; }   // vine kick
  if(b.dead) return;
  const wave=(x,v)=>b.proj.push({t:'wave',x,v}), waves=v=>{ wave(b.x-28,-v); wave(b.x+28,v); };
  switch(b.state){
    case 'idle': b.h=78; b.arm=Math.max(0,b.arm-3*dt); b.mouth=0; b.wait-=dt;
      if(b.wait<=0){ const s=SEQ[b.seq++%SEQ.length]; B_go(b,s==='slam'?'stele':'vtele'); } break;
    case 'stele': { const dur=1.0*m; b.arm=Math.min(1,b.t/dur); if(b.t>=dur){ sfx(70,.3,'sawtooth'); waves(enr?135:105); b.pend=enr?.85:-1; B_go(b,'dazed'); b.arm=0; } break; }
    case 'dazed': b.h=Math.max(26,b.h-220*dt);
      if(b.pend>0){ b.pend-=dt; if(b.pend<=0){ waves(135); sfx(70,.3,'sawtooth'); } }
      if(stompOn(b,GY-b.h,22)){ bounceP(); hurtBoss(b); if(!b.dead) B_go(b,'recover'); break; }
      if(b.t>=(enr?2.2:2.4)) B_go(b,'recover'); break;
    case 'recover': b.h=Math.min(78,b.h+90*dt); if(b.t>=.8){ B_go(b,'idle'); b.h=78; b.wait=(enr?.8:1.1)+rs.rng()*.3; } break;
    case 'vtele': b.mouth=Math.min(1,b.t/(.9*m)); if(b.t>=.9*m){ B_go(b,'volley'); b.fired=0; b.shots=enr?4:3; } break;
    case 'volley': { const gap=enr?.55:.7;
      if(b.fired<b.shots&&b.t>=b.fired*gap){ b.proj.push({t:'ball',x:b.x-22,y:((b.seq+b.fired)%2)?GY-46:GY-8,v:-(enr?110:100)}); b.fired++; sfx(200,.08,'square'); }
      if(b.fired>=b.shots&&b.t>b.shots*gap+.4){ B_go(b,'idle'); b.wait=(enr?.8:1.0); } break; }
  }
  if(vuln&&b.state!=='dazed'&&(b.state!=='idle'||b.t>.7)&&p.dead<=0&&Math.abs(p.x-b.x)<24&&p.y>GY-b.h+4) hitP('crushed by the totem',b.x,FORCE.totem);
  for(let i=b.proj.length-1;i>=0;i--){ const q=b.proj[i];
    if(q.t==='wave'){ q.x+=q.v*dt; if(q.x<-10||q.x>W+10){ b.proj.splice(i,1); continue; } if(p.dead<=0&&Math.abs(p.x-q.x)<7&&p.y>GY-13) hitP('shockwave',q.x,FORCE.shockwave); }
    else { q.x+=q.v*dt; if(q.x<-10){ b.proj.splice(i,1); continue; } if(p.dead<=0&&Math.abs(p.x-q.x)<8&&p.y>q.y-7&&(p.y-25)<q.y+7) hitP('mud ball',q.x,FORCE.totemBall); }
  }
}

/* ======================= 3D renderer (three.js, plain WebGL) =======================
   Layout of this half of the file (the game logic above is v2 plus the dev-moves physical shield):
   setup + quality -> noise / materials / textures -> shared geometry -> particles
   -> ART BUILDERS (buildHero / buildCrawler / buildLog / buildSnapper / buildGem / buildBoss1-3: each returns a Group plus the
   handles the animation code drives, so real art can replace one builder at a time) -> room builder -> per-frame sync -> camera -> HUD -> input -> loop.
   Models and fonts are code-only; surface textures are the approved art textures embedded in art/tex.js, and the glow/star sprites are drawn on a canvas at start-up. */
const S = 0.1;                                  // 1 logical px = 0.1 world units; a room is 32 units wide
const X = px => px * S, Y = py => (GY - py) * S; // logical y grows downward, world y grows upward
const cv = document.getElementById('c');
const isTouch = ('ontouchstart' in window) || matchMedia('(pointer: coarse)').matches;

/* ---- quality presets: LOW = touch default (no shadow maps, fewer instances); HIGH = desktop default ---- */
const QLEV = [
  { name: 'LOW',  shadows: false, pr: 1.25, res: 1.1, grass: 90,  fern: 12, rock: 12, flower: 14, pebble: 16, lian: 5,  rays: 3, motes: 0,  leaf: 3, far: 10, pmax: 90,  pf: .5 },
  { name: 'HIGH', shadows: true,  pr: 2,    res: .5,  grass: 420, fern: 36, rock: 26, flower: 50, pebble: 48, lian: 12, rays: 7, motes: 34, leaf: 5, far: 15, pmax: 240, pf: 1 }
];
let Qi = isTouch ? 0 : 1;
{ const qq = qs.get('q'); if (qq === 'low') Qi = 0; else if (qq === 'high') Qi = 1; else { try { const s = localStorage.getItem('jr3d-quality'); if (s === 'low') Qi = 0; else if (s === 'high') Qi = 1; } catch (e) {} } }
const QL = () => QLEV[Qi];

let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !isTouch, powerPreference: 'high-performance' }); }
catch (e) { document.getElementById('err').style.display = 'flex'; }
if (renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;   // filmic curve = the colour grade
  renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.enabled = QL().shadows;
}
const FOGC = '#b9cfb0';
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 170);
scene.background = new THREE.Color(FOGC);
scene.fog = new THREE.FogExp2(FOGC, 0.022);     // exponential fog: clear lane, deep layered distance

/* ---- lights: hemisphere + warm sun from behind-left (long shadows toward the camera, light shafts) + weak front fill ---- */
const hemi = new THREE.HemisphereLight('#d7efd6', '#6d4c2d', 1.15); scene.add(hemi);
const SUNOFF = new THREE.Vector3(-12, 20, -8);
const sun = new THREE.DirectionalLight('#ffd49a', 2.6); scene.add(sun, sun.target);
sun.shadow.mapSize.set(2048, 2048); { const c = sun.shadow.camera; c.left = -22; c.right = 22; c.top = 20; c.bottom = -20; c.near = 1; c.far = 80; }
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05; sun.shadow.radius = 3; sun.castShadow = QL().shadows;
const fill = new THREE.DirectionalLight('#ffe7c8', 0.7); fill.position.set(-6, 9, 22); scene.add(fill);

/* ---- sky gradient dome (follows the camera; not tone-mapped so its horizon matches the fog colour exactly) ---- */
const sky = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  uniforms: { uTop: { value: new THREE.Color('#5aa7a6') }, uMid: { value: new THREE.Color('#c4dcb6') }, uHor: { value: new THREE.Color(FOGC) }, uSun: { value: SUNOFF.clone().normalize() } },
  vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 uTop,uMid,uHor,uSun; varying vec3 vD; void main(){ vec3 d=normalize(vD); float h=clamp(d.y,0.,1.); vec3 c=mix(uHor,uMid,smoothstep(0.,.22,h)); c=mix(c,uTop,smoothstep(.18,.85,h)); float s=max(dot(d,uSun),0.); c+=vec3(1.,.8,.45)*(pow(s,5.)*.22+pow(s,48.)*.6); gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n }'
}));
sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

/* ---- small helpers: noise, colours, canvas textures ---- */
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const h2 = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
const h3 = (x, y, z) => { const n = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 997) * 78.233 + Math.round(z * 997) * 37.719) * 43758.5453; return n - Math.floor(n); };
function vn(x, z) { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(h2(xi, zi), h2(xi + 1, zi), u), lerp(h2(xi, zi + 1), h2(xi + 1, zi + 1), u), v); }
const fbm = (x, z) => vn(x, z) * .6 + vn(x * 2.1 + 7, z * 2.1 + 3) * .3 + vn(x * 4.3, z * 4.3 + 9) * .1;
const _c = new THREE.Color(), _c2 = new THREE.Color();
function mkTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const texGlow = mkTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.3, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
const texSoft = mkTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(.6, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
const texStar = mkTex(64, 64, (g, w, h) => { g.translate(32, 32); g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 4 : 30; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 14); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64); });
const texRay = mkTex(32, 128, (g, w, h) => { const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(255,236,190,0)'); v.addColorStop(.12, 'rgba(255,236,190,.85)'); v.addColorStop(.7, 'rgba(255,236,190,.35)'); v.addColorStop(1, 'rgba(255,236,190,0)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in'; const hh = g.createLinearGradient(0, 0, w, 0); hh.addColorStop(0, 'rgba(0,0,0,0)'); hh.addColorStop(.5, 'rgba(0,0,0,1)'); hh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = hh; g.fillRect(0, 0, w, h); });

/* ---- materials (cached by colour; smooth shaded Lambert unless flat shading is asked for) ---- */
const uTime = { value: 0 };
const allMats = new Set(); const matCache = {};
const reg = m => { allMats.add(m); return m; };
const M = (hex, emissive, flat) => { const k = hex + (emissive || '') + (flat ? 'F' : ''); return matCache[k] || (matCache[k] = reg(new THREE.MeshLambertMaterial({ color: hex, flatShading: !!flat, emissive: emissive || '#000000' }))); };
const MS = (hex, rough, metal, emissive, flat) => { const k = 's' + hex + rough + metal + (emissive || '') + (flat ? 'F' : ''); return matCache[k] || (matCache[k] = reg(new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, flatShading: !!flat, emissive: emissive || '#000000' }))); };
const MB = (hex, op, add) => { const k = 'b' + hex + op + (add ? 'A' : ''); return matCache[k] || (matCache[k] = reg(new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, depthWrite: false, fog: !add, blending: add ? THREE.AdditiveBlending : 1 }))); };
// wind sway for foliage: expr is a GLSL float using the local `position`; instanced meshes get a per-instance phase
function swayMat(key, expr, flat, side) {
  const m = reg(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !!flat, side: side ? THREE.DoubleSide : 0 }));
  m.onBeforeCompile = sh => { sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float sP=0.;\n#ifdef USE_INSTANCING\n sP=instanceMatrix[3].x*.35+instanceMatrix[3].z*.27;\n#endif\n float sA=' + expr + ';\n transformed.x+=sin(uTime*1.4+sP)*sA; transformed.z+=cos(uTime*1.1+sP*1.3)*sA*.6;'); };
  m.customProgramCacheKey = () => 'sway' + key; return m;
}
// water / tar with animated shimmer: moving glint streaks added to the emissive term (still lit, shadowed and fogged)
function waterMat(key, color, alpha, glint, speed, tint, streak = 1) {   // streak: strength of the thin diagonal glint lines (0 = none)
  const m = reg(new THREE.MeshLambertMaterial({ color, transparent: true, opacity: alpha, depthWrite: false }));
  m.onBeforeCompile = sh => { sh.uniforms.uTime = uTime;
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = 'uniform float uTime; varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n vec2 wp=vWP.xz; float tt=uTime*' + speed.toFixed(2) + ';\n float w1=sin(wp.x*2.7+tt*1.7+sin(wp.y*2.1+tt)*1.4); float w2=sin(wp.y*4.3-tt*1.3+wp.x*1.7);\n float gl=smoothstep(.7,1.,w1*w2*.5+.5)*.8+pow(max(0.,sin((wp.x*.8+wp.y)*6.+tt*2.1)),16.)*' + (.6 * streak).toFixed(2) + ';\n totalEmissiveRadiance+=vec3(' + tint + ')*gl*' + glint.toFixed(2) + ';\n diffuseColor.rgb*=.85+.15*w1;'); };
  m.customProgramCacheKey = () => 'water' + key; return m;
}
const mats = {
  leaf: swayMat('leaf', '.05*max(position.y+.35,0.)', true, false),
  grass: swayMat('grass', '.16*position.y*position.y', false, true),
  fern: swayMat('fern', '.1*position.y', false, true),
  lian: swayMat('lian', '.35*max(-position.y,0.)*max(-position.y,0.)', false, false),
  water: waterMat('w', '#2f6f6a', .88, .9, 1.0, '.75,.95,.85'),
  tar: waterMat('t', '#1b1410', .96, .2, .45, '.55,.5,.6', 0),   // tar: no glint lines (they read as slats) and a dimmer sheen, still dark and glossy
  mire: waterMat('m', '#33281b', .95, .15, .6, '.7,.6,.45', 0)   // mud: no glint lines and only a faint wet sheen; strong water glints read as old slats over the approved art texture
};

/* ---- shared geometry (built once) ---- */
const gBox = new THREE.BoxGeometry(1, 1, 1), gCyl = new THREE.CylinderGeometry(.5, .5, 1, 10), gSph = new THREE.SphereGeometry(.5, 14, 10);
const gIco = new THREE.IcosahedronGeometry(.5, 0), gOct = new THREE.OctahedronGeometry(.5, 0), gCone = new THREE.ConeGeometry(.5, 1, 8);
const gHalf = new THREE.SphereGeometry(.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const gDisc = new THREE.CircleGeometry(.5, 20); gDisc.rotateX(-Math.PI / 2);
const gRing = new THREE.TorusGeometry(.5, .035, 6, 32); gRing.rotateX(Math.PI / 2);
const gQuad = new THREE.PlaneGeometry(1, 1), gFlat = new THREE.PlaneGeometry(1, 1); gFlat.rotateX(-Math.PI / 2);
const gTorus = new THREE.TorusGeometry(.5, .2, 8, 18);
const capCache = {};
const capG = (r, len) => { const k = r + '_' + len; return capCache[k] || (capCache[k] = new THREE.CapsuleGeometry(r, len, 5, 12)); };
function rcyl(r, h, e, seg) {         // rounded cylinder (lathe) standing on y=0
  const pts = [new THREE.Vector2(0, 0)]; const n = 5;
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / n * Math.PI / 2; pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, e + Math.sin(a) * e)); }
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI / 2; pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, h - e + Math.sin(a) * e)); }
  pts.push(new THREE.Vector2(0, h)); return new THREE.LatheGeometry(pts, seg || 14);
}
function paintVC(g, fn) {               // write per-vertex colours from fn(x,y,z,nx,ny,nz) -> THREE.Color-ish [r,g,b] (linear multipliers)
  const p = g.attributes.position, nrm = g.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const c = fn(p.getX(i), p.getY(i), p.getZ(i), nrm ? nrm.getX(i) : 0, nrm ? nrm.getY(i) : 1, nrm ? nrm.getZ(i) : 0); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
const gTrunk = (() => {                 // lathe trunk with root flare + bark noise + moss at the foot; unit height, radius .5, scaled per tree
  const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(.5 * (1 - .4 * t) + .5 * Math.exp(-t * 8), t)); }
  const g = new THREE.LatheGeometry(pts, 14), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + (vn(a * 1.7 + 4, y * 7) - .5) * .24 + Math.sin(a * 6 + y * 3) * .05 + (vn(a * 5, y * 30) - .5) * .06; p.setX(i, x * k); p.setZ(i, z * k); }
  return paintVC(g, (x, y, z) => { const a = Math.atan2(z, x), s = .62 + .5 * vn(a * 3 + 1, y * 4.5) * (.7 + .3 * Math.sin(a * 9)), m = sstep(.3, 0, y) * .8;
    return [s * (1 - m * .45), s * (1 + m * .05), s * (1 - m * .5)]; });
})();
function blobGeo(detail, jit, up) {      // jittered, faceted blob; vertex colour = fake ambient occlusion (dark underside)
  const g = new THREE.IcosahedronGeometry(.5, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z), k = 1 + (h3(x / l, y / l, z / l) - .5) * jit; p.setXYZ(i, x * k, y * k, z * k); }
  g.computeVertexNormals();
  return paintVC(g, (x, y, z) => { const t = sstep(-.45, .45, y), r = lerp(.55, 1.15, t) * (up ? 1 : .9); return [r * lerp(.95, 1.05, t), r, r * lerp(.95, .9, t)]; });
}
const gBlob = blobGeo(1, .5, true), gRock = blobGeo(1, .55, false);
(() => { const g = gRock, p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * .75); })();
function tuftGeo(blades, hMin, hMax, w, seg, spread) {   // clump of curved blades (double sided), colour dark at the root -> light at the tip
  const pos = [], col = [], idx = []; let n = 0;
  for (let b = 0; b < blades; b++) {
    const ang = b * 2.399 + h2(b, 3) * .6, rad = .02 + h2(b, 5) * .08, hh = lerp(hMin, hMax, h2(b, 7)), lean = (.15 + h2(b, 9) * .5) * spread, ca = Math.cos(ang), sa = Math.sin(ang), px = -sa, pz = ca;
    for (let s = 0; s <= seg; s++) { const t = s / seg, c = rad + lean * t * t * hh, cx = ca * c, cz = sa * c, cy = hh * t, ww = w * (1 - t * .92) * .5, sh = .45 + .85 * t;
      pos.push(cx - px * ww, cy, cz - pz * ww, cx + px * ww, cy, cz + pz * ww); col.push(sh * .8, sh, sh * .65, sh * .8, sh, sh * .65);
      if (s > 0) { const a = n - 2, d = n; idx.push(a, a + 1, d, a + 1, d + 1, d); } n += 2; }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nm = []; for (let i = 0; i < pos.length / 3; i++) nm.push(0, 1, 0); g.setAttribute('normal', new THREE.Float32BufferAttribute(nm, 3)); g.setIndex(idx); return g;
}
const gTuft = tuftGeo(6, .45, 1.0, .09, 3, 1.2);
const gFern = (() => {                 // arching fronds with a serrated edge
  const pos = [], col = [], idx = []; let n = 0; const F = 8, seg = 7;
  for (let f = 0; f < F; f++) { const ang = f / F * Math.PI * 2 + h2(f, 1) * .4, ca = Math.cos(ang), sa = Math.sin(ang), L = .9 + h2(f, 2) * .5;
    for (let s = 0; s <= seg; s++) { const t = s / seg, r = L * t * .9, y = L * (1.15 * t - .9 * t * t) + .08, ww = (.12 + .1 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (s % 2 ? 1 : .6) * (1 - t * .7), px = -sa, pz = ca, sh = .5 + .7 * t;
      pos.push(ca * r - px * ww, y, sa * r - pz * ww, ca * r + px * ww, y, sa * r + pz * ww); col.push(sh * .8, sh, sh * .7, sh * .8, sh, sh * .7); if (s > 0) { const a = n - 2, d = n; idx.push(a, a + 1, d, a + 1, d + 1, d); } n += 2; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const nm = []; for (let i = 0; i < pos.length / 3; i++) nm.push(0, 1, 0); g.setAttribute('normal', new THREE.Float32BufferAttribute(nm, 3)); g.setIndex(idx); return g;
})();
const gLian = (() => { const g = new THREE.CylinderGeometry(.5, .35, 1, 5, 6, true); g.translate(0, -.5, 0); return paintVC(g, (x, y) => { const s = .6 + .5 * (1 + y); return [s * .8, s, s * .7]; }); })();
const gLogBody = (() => { const g = new THREE.CylinderGeometry(.5, .5, 1, 16, 8, true); g.rotateX(Math.PI / 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(y, x), k = 1 + (vn(a * 2.2 + 3, z * 5) - .5) * .12 + Math.sin(a * 7) * .03; p.setX(i, x * k); p.setY(i, y * k); }
  return paintVC(g, (x, y, z) => { const a = Math.atan2(y, x), s = .7 + .45 * vn(a * 3 + 2, z * 3.5) * (.75 + .25 * Math.sin(a * 11)); return [s, s * .96, s * .9]; }); })();
const gLeafCard = new THREE.CircleGeometry(.5, 4);

/* ---- particles: two instanced billboard pools (normal = dust / mud, additive = sparkles / glow), per-particle alpha ---- */
const PMAX = 240, camQ = new THREE.Quaternion();
function mkPool(add, tex) {
  const geo = new THREE.PlaneGeometry(1, 1), al = new THREE.InstancedBufferAttribute(new Float32Array(PMAX), 1); geo.setAttribute('aA', al);
  const m = reg(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, blending: add ? THREE.AdditiveBlending : 1 }));
  m.onBeforeCompile = sh => { sh.vertexShader = 'attribute float aA; varying float vA;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vA=aA;');
    sh.fragmentShader = 'varying float vA;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a*=vA;'); };
  m.customProgramCacheKey = () => 'part';
  const mesh = new THREE.InstancedMesh(geo, m, PMAX); mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 5;
  mesh.setColorAt(0, _c.set('#ffffff')); scene.add(mesh); return { mesh, al, list: [], add };
}
const poolN = mkPool(false, texSoft), poolA = mkPool(true, texStar);
function emit(pool, x, y, z, vx, vy, vz, life, size, color, grav, drag, grow) {
  if (pool.list.length >= Math.min(PMAX, QL().pmax)) return;
  pool.list.push({ x, y, z, vx, vy, vz, life, max: life, size, c: new THREE.Color(color), grav: grav || 0, drag: drag || 0, grow: grow || 0 });
}
const _o = new THREE.Object3D(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
function updatePool(pool, dt) {
  const L = pool.list; let n = 0;
  for (let i = L.length - 1; i >= 0; i--) { const q = L[i]; q.life -= dt; if (q.life <= 0) { L[i] = L[L.length - 1]; L.pop(); } }
  for (let i = 0; i < L.length; i++) { const q = L[i], t = q.life / q.max;
    q.vy -= q.grav * dt; const d = Math.max(0, 1 - q.drag * dt); q.vx *= d; q.vy *= d; q.vz *= d; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    const s = q.size * (1 + q.grow * (1 - t)); _o.position.set(q.x, q.y, q.z); _o.quaternion.copy(camQ); _o.scale.set(s, s, s); _o.updateMatrix();
    pool.mesh.setMatrixAt(n, _o.matrix); pool.mesh.setColorAt(n, q.c); pool.al.array[n] = Math.min(1, t * 2.2) * (pool.add ? 1 : .8); n++; }
  pool.mesh.count = n; pool.mesh.instanceMatrix.needsUpdate = true; if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true; pool.al.needsUpdate = true;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function fxDust(x, y, n, spread, up, col) { n = Math.ceil(n * QL().pf); for (let i = 0; i < n; i++) emit(poolN, x + rnd(-.3, .3), y + .1, rnd(-.2, .5), rnd(-spread, spread), rnd(.2, up), rnd(0, .8), rnd(.35, .7), rnd(.35, .7), col || '#c9b48a', -.3, 2.2, 1.6); }
function fxSpark(x, y, n, col, speed, z) { n = Math.ceil(n * QL().pf); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = rnd(.3, 1) * speed; emit(poolA, x, y, z === undefined ? .3 : z, Math.cos(a) * s, Math.sin(a) * s + 1, rnd(-.5, .5), rnd(.4, .9), rnd(.25, .55), col, 5, 1.5, -.4); } }
function fxMud(x, y, n, speed, col) { n = Math.ceil(n * QL().pf); for (let i = 0; i < n; i++) emit(poolN, x + rnd(-.4, .4), y, rnd(0, .6), rnd(-1, 1) * speed, rnd(.4, 1) * speed * 1.3, rnd(-.5, .5), rnd(.5, .9), rnd(.3, .55), col || '#4a3322', 14, .8, .5); }
function fxBurst(x, y, n, col, speed) { n = Math.ceil(n * QL().pf); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = rnd(.4, 1) * speed; emit(i % 2 ? poolN : poolA, x, y, rnd(0, .6), Math.cos(a) * s, Math.sin(a) * s + 1.5, rnd(-1, 1), rnd(.5, 1.1), rnd(.4, .8), i % 3 ? col : '#ffe8a0', 6, 1.2, .6); } }
let shake = 0; const addShake = a => { shake = Math.min(1.2, Math.max(shake, a)); };

/* ======================= ART BUILDERS (code-only; any one can be swapped for other art) =======================
   Contract: every builder returns { root: THREE.Group, ...handles }. The per-frame code only touches the handles named in each builder
   (limb pivots, jaw, wings...). Meshes are created with mk(); shadows are on by default. */
function mk(geo, mat, x, y, z, sx, sy, sz, parent, noShadow) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); if (parent) parent.add(m);
  if (!noShadow) { m.castShadow = true; m.receiveShadow = true; } return m;
}
const box = (c, x, y, z, w, h, d, par) => mk(gBox, M(c), x, y, z, w, h, d, par);
const rot = (m, x, y, z) => { m.rotation.set(x || 0, y || 0, z || 0); return m; };
const MV = (hex, flat, side) => { const k = 'mv' + hex + (flat ? 'F' : '') + (side ? 'D' : ''); return matCache[k] || (matCache[k] = reg(new THREE.MeshLambertMaterial({ color: hex, vertexColors: true, flatShading: !!flat, side: side ? THREE.DoubleSide : 0 }))); };

/* ---- approved mudmode art textures (art/tex.js): tileable 256px JPEGs embedded as data URIs, because browsers refuse to
   upload file:// images to WebGL. Each one is projected in world (or object) space with a triplanar blend and multiplied
   into the existing colours, normalised by its average brightness, so the lighting and palette stay as they were. ---- */
const ART = window.JR_TEX || {}, ARTAVG = window.JR_TEXAVG || {}, uArt = { value: 0 }, artU = {};
{ const keys = Object.keys(ART); let n = 0;
  for (const k of keys) { artU[k] = { value: null }; const im = new Image();
    im.onload = () => { const t = new THREE.CanvasTexture(im); t.wrapS = t.wrapT = 1000; t.colorSpace = THREE.SRGBColorSpace;   // 1000 = THREE.RepeatWrapping (not exported by the slim bundle)
      if (renderer) t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); artU[k].value = t; if (++n === keys.length) uArt.value = 1; };
    im.src = ART[k]; } }
const artGain = k => (1 / Math.max(.05, (ARTAVG[k] || [0, 0, 0, .5])[3])).toFixed(3);
const artTri = (u, sc) => 'artTri(' + u + ',vArtP*' + sc + ',vArtW)';
// layers: [{ t: texture key, sc: tiles per world unit, st: strength 0..1, flow: optional 'vec2' GLSL offset, w: optional GLSL weight expr }]
function artify(m, key, layers, objSpace) {
  const prevC = m.onBeforeCompile, prevK = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => { if (prevC) prevC.call(m, sh, r);
    sh.uniforms.uArt = uArt; sh.uniforms.uTime = uTime; layers.forEach((L, i) => { sh.uniforms['tArt' + i] = artU[L.t] || { value: null }; });
    const attr = layers.some(L => L.w === 'vPath');
    sh.vertexShader = 'varying vec3 vArtP; varying vec3 vArtN;' + (attr ? ' attribute float aPath; varying float vPath;' : '') + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vec4 aP=vec4(position,1.); vec3 aN=normal;\n' +
      (objSpace ? '' : '#ifdef USE_INSTANCING\n aP=instanceMatrix*aP; aN=mat3(instanceMatrix)*aN;\n#endif\n aP=modelMatrix*aP; aN=mat3(modelMatrix)*aN;\n') + ' vArtP=aP.xyz; vArtN=aN;' + (attr ? ' vPath=aPath;' : ''));
    let f = ' { vec3 vArtW=pow(abs(normalize(vArtN)),vec3(4.)); vArtW/=vArtW.x+vArtW.y+vArtW.z+1e-4; vec3 aD=vec3(1.);\n';
    layers.forEach((L, i) => { const tx = artTri('tArt' + i, L.sc.toFixed(3) + (L.flow ? '+vec3(' + L.flow + ')' : '')), d = 'mix(vec3(1.),' + tx + '*' + artGain(L.t) + ',' + L.st.toFixed(2) + '*uArt)';
      f += L.w ? '  aD=mix(aD,' + d + ',' + L.w + ');\n' : '  aD*=' + d + ';\n'; });
    f += '  diffuseColor.rgb*=aD; }\n';
    sh.fragmentShader = 'uniform float uArt;' + (sh.fragmentShader.includes('uniform float uTime') ? '' : ' uniform float uTime;') + ' varying vec3 vArtP; varying vec3 vArtN;' + (attr ? ' varying float vPath;' : '') + layers.map((L, i) => ' uniform sampler2D tArt' + i + ';').join('') +
      '\nvec3 artTri(sampler2D t,vec3 q,vec3 w){ return texture2D(t,q.zy).rgb*w.x+texture2D(t,q.xz).rgb*w.y+texture2D(t,q.xy).rgb*w.z; }\n' +
      sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + f);
  };
  m.customProgramCacheKey = () => (prevK ? prevK.call(m) : '') + '|art:' + key; return m;
}
const AM = {      // textured materials (separate from the colour caches so untextured props keep their look)
  groundTop: artify(reg(new THREE.MeshLambertMaterial({ vertexColors: true })), 'gt', [{ t: 'leaf', sc: .42, st: .55 }, { t: 'path', sc: .45, st: .72, w: 'vPath' }]),
  bank: artify(reg(new THREE.MeshLambertMaterial({ vertexColors: true })), 'bk', [{ t: 'leaf', sc: .32, st: .5 }]),
  dirt: artify(reg(new THREE.MeshLambertMaterial({ color: '#8a6040', vertexColors: true })), 'dt', [{ t: 'mud', sc: .3, st: .55 }]),
  bark: artify(reg(new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true })), 'bt', [{ t: 'bark', sc: .45, st: .9 }]),
  barkPlain: artify(reg(new THREE.MeshLambertMaterial({ color: '#ffffff' })), 'bp', [{ t: 'bark', sc: .5, st: .9 }]),
  barkBranch: artify(reg(new THREE.MeshLambertMaterial({ color: '#7d5a38', vertexColors: true })), 'bb', [{ t: 'bark', sc: .6, st: .9 }]),
  stone: artify(reg(new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true })), 'st', [{ t: 'stone', sc: .7, st: .85 }]),
  rim: artify(reg(new THREE.MeshLambertMaterial({ color: '#8a8070', flatShading: true })), 'sr', [{ t: 'stone', sc: .7, st: .85 }]),
  bossRock: artify(reg(new THREE.MeshLambertMaterial({ color: '#7a7462', flatShading: true })), 'sb', [{ t: 'stone', sc: .5, st: .85 }]),
  canopy: (() => { const m = []; for (const sd of ['#2f7a3f', '#3d8f45', '#256a48']) m.push(artify(reg(new THREE.MeshLambertMaterial({ color: sd, vertexColors: true, flatShading: true })), 'cp' + sd, [{ t: 'leaf', sc: .5, st: .7 }])); return m; })()
};
artify(mats.leaf, 'lf', [{ t: 'leaf', sc: 1.3, st: .75 }], true);
artify(mats.water, 'sw', [{ t: 'swamp', sc: .22, st: .85, flow: 'uTime*.035,0.,uTime*.02' }]); mats.water.color.set('#3f7f74');
artify(mats.tar, 'md', [{ t: 'mud', sc: .2, st: .45, flow: 'uTime*.01,0.,uTime*.006' }]); mats.tar.color.set('#3a2a1e');
artify(mats.mire, 'mr', [{ t: 'mud', sc: .14, st: .5, flow: 'uTime*.015,0.,uTime*.01' }]); mats.mire.color.set('#6a5238');
const gScarf = new THREE.TorusGeometry(.5, .15, 8, 20); gScarf.rotateX(Math.PI / 2);
const gCirc = new THREE.CircleGeometry(.5, 18);
const blobMat = () => reg(new THREE.MeshBasicMaterial({ map: texGlow, color: '#000000', transparent: true, opacity: .45, depthWrite: false, fog: false })), blobShared = blobMat();   // crawlers + logs share one; the hero's is its own
const blobShadow = (par, y, size, own) => { const m = mk(gFlat, own ? blobMat() : blobShared, 0, y, 0, size, 1, size, par, true); m.userData.blob = true; m.visible = !QL().shadows; return m; };

/* ---- HERO: robot hero (approved design: glass dome, seedling, telescoping pipe arms), low-poly in code. Faces +x. ---- */
function buildHero() {   // robot hero (approved design, adapted to low-poly 3D in code). Faces +x; +z is its right side. Swap this whole function to change the hero art.
  const root = new THREE.Group(), bod = new THREE.Group(); root.add(bod);
  // colours from the approved hero swatch (exact hex values)
  const C = { cu: '#bf5c40', cuD: '#7d3a2a', teal: '#3ca79f', tealD: '#267975', boot: '#bf6247', steel: '#777772', glass: '#ceefee', eye: '#f1de4d', leaf: '#66904b', soil: '#492f29', ink: '#1e1816' };
  // metalness is lower than the swatch notes (.5 / .3): with no environment map, metal just goes dark here
  const SM = (hex, r, m, e) => reg(new THREE.MeshStandardMaterial({ color: hex, roughness: r, metalness: m, emissive: hex, emissiveIntensity: e }));   // a touch of self-light keeps the bold swatch colours readable in the jungle shade
  const copper = SM(C.cu, .5, .12, .16), copperD = SM(C.cuD, .55, .12, .1), teal = SM(C.teal, .6, .08, .14), tealD = SM(C.tealD, .6, .08, .1), steel = SM(C.steel, .45, .3, .08);
  const boot = SM(C.boot, .9, 0, .14), soil = M(C.soil), leaf = M(C.leaf), leafD = M('#4f7339'), mud = M('#4a3226'), tape = M('#e8d9b0'), pad = M('#cdb07a'), worm = M('#d98a8f');
  const glass = reg(new THREE.MeshStandardMaterial({ color: C.glass, transparent: true, opacity: .35, roughness: .1, metalness: 0, depthWrite: false }));
  const lens = reg(new THREE.MeshStandardMaterial({ color: C.eye, emissive: C.eye, emissiveIntensity: 1, roughness: .3, metalness: 0 }));
  const ink = reg(new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide }));
  const crack = reg(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .55, depthWrite: false }));
  const h = { root, bod, eyes: [], lids: [], tails: [], lens, ink: [] };
  const line = (m, t) => { const o = new THREE.Mesh(m.geometry, ink); o.position.copy(m.position); o.rotation.copy(m.rotation);   // inverted-hull ink outline
    o.scale.copy(m.scale).multiplyScalar(1 + t); m.parent.add(o); h.ink.push(o); return m; };
  let sd = 9406; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const onSurf = (mesh, par, dir, r, spin) => { const d = dir.clone().normalize(); mesh.position.copy(d).multiplyScalar(r);   // stick a flat piece onto a curved surface
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d); if (spin) mesh.rotateZ(spin); par.add(mesh); return mesh; };
  // squat copper can: lathe profile with a rounded bottom (hip section)
  const can = new THREE.LatheGeometry([[0, 0], [.3, .015], [.47, .07], [.57, .17], [.62, .32], [.63, .5], [.63, 1.04], [.6, 1.07], [0, 1.07]].map(([r, y]) => new THREE.Vector2(r, y)), 22);
  line(mk(can, copper, 0, .72, 0, 1, 1, 1, bod), .045);
  mk(new THREE.TorusGeometry(.625, .03, 5, 26), copperD, 0, 1.06, 0, 1, 1, 1, bod, true).rotation.x = Math.PI / 2;                                     // hip seam ring
  // front: curved teal chest panel + rivets + diagonal band-aid patch (off-centre, the joke)
  const panel = new THREE.CylinderGeometry(.655, .655, .56, 8, 1, true, Math.PI / 2 - .55, 1.1); mk(panel, teal, 0, 1.36, 0, 1, 1, 1, bod);
  mk(new THREE.CylinderGeometry(.648, .648, .64, 8, 1, true, Math.PI / 2 - .62, 1.24), tealD, 0, 1.36, 0, 1, 1, 1, bod);
  for (const [y, a] of [[1.6, .48], [1.6, -.48], [1.12, .48], [1.12, -.48]]) mk(gSph, copperD, Math.cos(a) * .66, y, Math.sin(a) * .66, .06, .06, .06, bod, true);
  const ba = new THREE.Group(); onSurf(ba, bod, new THREE.Vector3(.95, 0, .3), .67, .6); ba.position.y += 1.4;
  mk(gBox, tape, 0, 0, 0, .34, .11, .02, ba, true); mk(gBox, pad, 0, 0, .012, .11, .1, .02, ba, true);
  // side seam with rivets (right side) and a teal button; back: square plate with a pale diamond
  mk(gBox, copperD, .12, 1.3, .625, .03, .86, .02, bod, true); for (let i = 0; i < 4; i++) mk(gSph, copperD, .16, .98 + i * .2, .62, .05, .05, .05, bod, true);
  mk(gCyl, teal, .3, 1.62, .55, .1, .04, .1, bod, true).rotation.set(Math.PI / 2, 0, -.5);
  mk(gBox, copperD, -.61, 1.35, 0, .05, .5, .5, bod); mk(gBox, tape, -.645, 1.35, 0, .02, .22, .22, bod, true).rotation.x = Math.PI / 4;
  for (const [y, z] of [[1.56, .2], [1.56, -.2], [1.14, .2], [1.14, -.2]]) mk(gSph, copper, -.645, y, z, .05, .05, .05, bod, true);
  for (let i = 0; i < 9; i++) { const a = rr() * 6.28, y = .82 + rr() * .9; mk(gSph, mud, Math.cos(a) * .63, y, Math.sin(a) * .63, .07 + rr() * .07, .05, .07 + rr() * .05, bod, true); }   // mud specks
  mk(gCyl, tealD, 0, 1.79, 0, 1.2, .08, 1.2, bod);                                                                    // collar ring
  // legs: short steel pipes + chunky clay boots (ankle pivots keep the soles flat-ish); a mud worm lives in the left boot
  const leg = z => { const j = new THREE.Group(); j.position.set(0, .8, z); bod.add(j);
    mk(gSph, steel, 0, 0, 0, .17, .17, .17, j); mk(capG(.065, .26), steel, 0, -.2, 0, 1, 1, 1, j);
    const an = new THREE.Group(); an.position.set(0, -.4, 0); j.add(an);
    line(mk(gCyl, boot, 0, -.02, 0, .4, .24, .4, an), .07); line(mk(gSph, boot, .1, -.2, 0, .74, .38, .5, an), .05);
    mk(gSph, boot, .3, -.17, 0, .3, .26, .4, an); mk(gBox, soil, .1, -.37, 0, .62, .04, .36, an, true);
    for (let i = 0; i < 3; i++) mk(gSph, mud, .1 + rr() * .3 - .1, -.2 + rr() * .1, z > 0 ? .24 : -.24, .07, .05, .03, an, true);
    j.userData.an = an; return j; };
  h.legR = leg(.3); h.legL = leg(-.3); h.ankR = h.legR.userData.an; h.ankL = h.legL.userData.an;
  const wm = new THREE.Group(); wm.position.set(-.05, .1, -.12); h.ankL.add(wm); h.worm = [];
  let wp = wm; for (let i = 0; i < 3; i++) { const s = new THREE.Group(); s.position.y = i ? .09 : 0; wp.add(s); mk(capG(.035, .07), worm, 0, .05, 0, 1, 1, 1, s, true); h.worm.push(s); wp = s; }
  mk(gSph, M('#1e1816'), .03, .06, .02, .02, .02, .02, wp, true);
  // arms: copper shoulder sleeve, steel pipe, copper cuff, plain copper ball hand. arm = swing pivot (z), sp = splay (x)
  const arm = z => { const j = new THREE.Group(); j.position.set(0, 1.56, z); bod.add(j); const sp = new THREE.Group(); j.add(sp);
    line(mk(gCyl, copper, 0, 0, 0, .28, .22, .28, sp), .08).rotation.x = Math.PI / 2;
    const pipe = mk(gCyl, steel, 0, -.33, z > 0 ? .04 : -.04, .1, .42, .1, sp);                                      // longer steel pipe; telescopes out on a vine (syncHero)
    const ext = new THREE.Group(); sp.add(ext);
    mk(gCyl, copper, 0, -.56, z > 0 ? .05 : -.05, .2, .1, .2, ext); line(mk(gSph, copper, 0, -.74, z > 0 ? .05 : -.05, .42, .42, .42, ext), .07);
    j.userData.sp = sp; j.userData.pipe = pipe; j.userData.ext = ext; return j; };
  h.armR = arm(.72); h.armL = arm(-.72); h.splR = h.armR.userData.sp; h.splL = h.armL.userData.sp;
  // head: wide teal band, rivet rows, side bolt caps, two big glowing lenses with steel bezels and teal lids
  const head = new THREE.Group(); head.position.set(0, 2.1, 0); bod.add(head); h.head = head;
  line(mk(gCyl, teal, 0, 0, 0, 1.5, .58, 1.5, head), .035);
  mk(gCyl, tealD, 0, .27, 0, 1.53, .06, 1.53, head); mk(gCyl, tealD, 0, -.27, 0, 1.53, .06, 1.53, head);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + .1; for (const y of [.2, -.2]) mk(gSph, copperD, Math.cos(a) * .755, y, Math.sin(a) * .755, .045, .045, .045, head, true); }
  for (const s of [1, -1]) { line(mk(gCyl, copper, 0, 0, s * .76, .3, .1, .3, head), .08).rotation.x = Math.PI / 2; mk(gCyl, copperD, 0, 0, s * .81, .14, .03, .14, head, true).rotation.x = Math.PI / 2; }
  for (const s of [1, -1]) { const a = s * .46, e = new THREE.Group(); e.position.set(Math.cos(a) * .72, -.01, Math.sin(a) * .72); e.rotation.y = -a; head.add(e);
    mk(new THREE.TorusGeometry(.22, .04, 6, 20), steel, .02, 0, 0, 1, 1, 1, e, true).rotation.y = Math.PI / 2; mk(gSph, lens, .03, 0, 0, .14, .42, .42, e, true);
    const lid = new THREE.Group(); lid.position.set(.09, 0, 0); e.add(lid);
    const ld = mk(new THREE.CircleGeometry(.25, 14, 0, Math.PI), tealD, 0, 0, 0, 1, 1, 1, lid, true); ld.rotation.y = Math.PI / 2; ld.material = reg(new THREE.MeshStandardMaterial({ color: C.tealD, roughness: .6, metalness: .3, side: THREE.DoubleSide }));
    lid.userData.s = s; h.eyes.push(e); h.lids.push(lid); }
  // crack in the band on the back-left (darker humour: it has been through things)
  mk(gBox, M(C.ink), -.4, .05, -.62, .02, .2, .02, head, true).rotation.set(0, .6, .5);
  // glass dome with a soil heap and the two-leaf seedling; a taped crack on the right-front
  mk(gCyl, soil, 0, .3, 0, 1.5, .06, 1.5, head, true);
  const heap = new THREE.IcosahedronGeometry(.5, 1); { const p = heap.attributes.position; for (let i = 0; i < p.count; i++) { const k = .85 + (Math.sin(p.getX(i) * 31 + p.getZ(i) * 17) * .5 + .5) * .3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } heap.computeVertexNormals(); }
  mk(heap, MS(C.soil, 1, 0, 0, true), 0, .36, 0, 1.25, .5, 1.25, head);
  const sp = new THREE.Group(); sp.position.set(-.05, .5, -.05); sp.scale.setScalar(1.75); head.add(sp); h.sprout = sp;
  mk(capG(.03, .3), leaf, 0, .17, 0, 1, 1, 1, sp); const lg = s => { const g = new THREE.Group(); g.position.set(0, .36, 0); g.rotation.x = s * .9; sp.add(g);
    line(mk(gSph, s > 0 ? leaf : leafD, 0, .02, s * .19, .32, .06, .36, g, true), .025); return g; };
  h.leafR = lg(1); h.leafL = lg(-1);
  const dome = new THREE.SphereGeometry(.77, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);   // a little bigger than before so the bigger seedling fits
  mk(dome, glass, 0, .3, 0, 1, 1.3, 1, head, true); mk(new THREE.TorusGeometry(.775, .035, 5, 28), steel, 0, .3, 0, 1, 1, 1, head, true).rotation.x = Math.PI / 2;
  const up = (a, b) => new THREE.Vector3(Math.cos(b) * Math.cos(a), Math.sin(b) * 1.3, Math.cos(b) * Math.sin(a));
  for (const [a, b, l, sp_] of [[.75, .6, .24, .4], [.95, .45, .18, -.7], [.6, .35, .16, 1.2], [2.6, .5, .2, .3]]) { const c = onSurf(new THREE.Mesh(gBox, crack), head, up(a, b), .78, sp_); c.scale.set(.012, l, .005); c.position.y += .3; }
  for (const sp_ of [.7, -.7]) { const t = onSurf(new THREE.Mesh(gBox, tape), head, up(.78, .52), .785, sp_); t.scale.set(.06, .24, .006); t.position.y += .3; }
  h.shadow = blobShadow(scene, .06, 1.6, true);                                                         // low-quality contact shadow (also a faint one on high)
  return h;
}

/* ---- CRAWLER: shiny dome beetle on six legs, stalk eyes. Faces +x. ---- */
function buildCrawler() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); const h = { root, body, legs: [], ant: [] };
  mk(gHalf, MS('#6b4023', .4, .15), 0, .12, 0, 1.75, 1.5, 1.5, body);
  mk(gDisc, M('#2a1c13'), 0, .13, 0, 1.7, 1, 1.45, body, true);
  [[-.35, -.25], [-.1, .3], [.15, -.3], [.3, .28], [-.45, .25], [.05, .02]].forEach(([x, z]) => { const y = .12 + .75 * Math.sqrt(Math.max(0, 1 - (x / .87) ** 2 - (z / .75) ** 2)); mk(gSph, M('#e0903f'), x, y - .03, z, .24, .12, .24, body, true); });
  mk(gSph, M('#43301f'), .82, .28, 0, .58, .5, .62, body);
  for (const s of [1, -1]) { mk(gSph, M('#f3e6c4'), .88, .52, s * .2, .22, .24, .2, body, true); mk(gSph, M('#2a1c13'), .97, .54, s * .21, .11, .13, .11, body, true); rot(mk(gCone, M('#d9d0b0'), 1.12, .14, s * .13, .1, .26, .1, body), 0, 0, -Math.PI / 2);
    const a = new THREE.Group(); a.position.set(.95, .52, s * .14); body.add(a); mk(capG(.025, .5), M('#2a1c13'), .18, .22, 0, 1, 1, 1, a).rotation.z = -.5; h.ant.push(a); }
  [-.45, 0, .45].forEach(x => { for (const s of [1, -1]) { const p = new THREE.Group(); p.position.set(x, .22, s * .55); body.add(p); const l = new THREE.Group(); l.rotation.x = s * -.8; p.add(l); mk(capG(.055, .38), M('#2a1c13'), 0, -.25, 0, 1, 1, 1, l); h.legs.push({ p, ph: (x > 0) !== (s > 0) ? 0 : Math.PI }); } });
  h.shadow = blobShadow(root, .05, 1.9);
  return h;
}

/* ---- LOG: bark-noise cylinder with ring-pattern end caps, a knot and a moss patch. Rolls around z. ---- */
function buildLog() {
  const root = new THREE.Group(); const h = { root };
  mk(gLogBody, MV('#8c5d33'), 0, 0, 0, 1.4, 1.4, 2.4, root);
  for (const s of [1, -1]) [[1.28, '#c9a06a'], [1.06, '#a97c4a'], [.84, '#c9a06a'], [.6, '#a97c4a'], [.36, '#c9a06a'], [.14, '#8c5d33']].forEach(([r, c], i) => {
    const d = mk(gCirc, M(c), 0, 0, s * (1.2 + .004 * (i + 1)), r, r, 1, root, true); if (s < 0) d.rotation.y = Math.PI; });
  rot(mk(gCyl, M('#6f4624'), .1, .72, .35, .28, .34, .28, root), .3, 0, .2);
  mk(gBlob, MV('#5a9a3e', true), -.1, .62, -.45, .8, .34, .7, root);
  h.shadow = blobShadow(root, -.66, 2.6);
  return h;
}

/* ---- SNAPPER: swamp jaws (lower jaw, hinged upper jaw with teeth + eye bumps); w = slot width in world units ---- */
function buildSnapper(w) {
  const root = new THREE.Group(), L = w - .5, h = { root };
  rot(mk(capG(.34, L - .7), MS('#4d5a2b', .6, 0), 0, .2, 0, 1, 1, 2.5, root), 0, 0, Math.PI / 2);
  mk(gFlat, M('#b4443c'), 0, .5, 0, L * .9, 1, 1.45, root, true);
  for (let j = 0; j < 4; j++) mk(gCone, M('#f3e6c4'), -L * .36 + j * L * .24, .6, .78, .17, .34, .17, root);
  const jaw = new THREE.Group(); jaw.position.set(-L / 2, .5, 0); root.add(jaw); h.jaw = jaw;
  rot(mk(capG(.3, L - .7), MS('#6a7a3a', .6, 0), L / 2, .22, 0, 1, 1, 2.4, jaw), 0, 0, Math.PI / 2);
  for (let j = 0; j < 4; j++) { const t = mk(gCone, M('#f3e6c4'), L * .14 + j * L * .24, -.04, .74, .17, .34, .17, jaw); t.rotation.z = Math.PI; }
  for (const s of [1, -1]) { mk(gSph, M('#6a7a3a'), L * .3, .55, s * .55, .5, .42, .46, jaw); mk(gSph, M('#f3e6c4'), L * .3 + .12, .6, s * .6, .3, .3, .3, jaw, true); }
  h.pa = mk(gSph, M('#2a1c13'), L * .3 + .24, .62, .6, .15, .2, .15, jaw, true); h.pb = mk(gSph, M('#2a1c13'), L * .3 + .24, .62, -.6, .15, .2, .15, jaw, true);
  return h;
}

/* ---- GEM: faceted gem, halo and orbiting sparkles (animated in sync) ---- */
function buildGem(kind) {
  const root = new THREE.Group(), col = P.gem[kind], h = { root, stars: [] };
  h.core = mk(gOct, MS(col, .18, .25, col, true), 0, 0, 0, 1.0, 1.6, .9, root); h.core.material = h.core.material.clone(); h.core.material.emissiveIntensity = .45;
  h.halo = new THREE.Mesh(gQuad, matCache['gh' + col] || (matCache['gh' + col] = reg(new THREE.MeshBasicMaterial({ map: texGlow, color: col, transparent: true, opacity: .55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })))); h.halo.scale.set(3.4, 3.4, 1); h.halo.position.z = -.3; h.halo.renderOrder = 4;
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(gQuad, matCache.gemStar || (matCache.gemStar = reg(new THREE.MeshBasicMaterial({ map: texStar, color: '#fff4c8', transparent: true, opacity: .9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })))); s.renderOrder = 4; h.stars.push(s); }
  return h;
}

/* ---- BOSSES: 1 BOGJAW (mire beast, faces +x), 2 GLOOMWING (canopy flyer, faces +x), 3 MUDTOTEM (mud golem, faces -x). ----
   Art redo to the hero's quality, in code (Michael t32u/t45u). Layout, colours (the approved swatch hex values) and every animated handle
   are kept; the look is new: hero-style ink outline, Standard shading with soft self-light and a rim light, procedural textures.
   How: parts are still placed with mk(), but with a paint BP(hex, layer, ink) instead of a material. bossBake() then merges every static
   part under one pivot into ONE vertex-coloured mesh plus ONE inverted-hull ink mesh (the hero's outline, baked: each part pushed out
   along its smoothed normals), so detail goes up while draw calls go down. Paint layer = texture slot of bossMat (0-2), 3 plain, 4 glowing. */
const bossInk = reg(new THREE.MeshBasicMaterial({ color: '#1e1816', side: THREE.BackSide }));   // the hero's ink colour; one shared material for all bosses
const paintCache = {};
const BP = (hex, layer, ink) => { const k = hex + '|' + layer + '|' + ink; return paintCache[k] || (paintCache[k] = { bk: true, color: new THREE.Color(hex), layer, ink }); };
function bossTex(draw) {      // tileable 256px canvas texture, gain = 1 / mean linear brightness so it only adds detail, not a tint
  const t = mkTex(256, 256, (g, w, h) => { let sd = 1234; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const wrap = fn => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } }; draw(g, w, h, rr, wrap); });
  t.wrapS = t.wrapT = 1000; const d = t.image.getContext('2d').getImageData(0, 0, 256, 256).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += Math.pow((d[i] + d[i + 1] + d[i + 2]) / 765, 2.2);
  t.userData.gain = 65536 / Math.max(1, s); return t;
}
const texScales = bossTex((g, w, h, rr, wrap) => {   // BOGJAW: rows of flat scutes with thin dark wet gaps, pale specks
  g.fillStyle = '#505050'; g.fillRect(0, 0, w, h); const cw = w / 6, ch = h / 8;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) { const cx = (c + (r % 2) * .5 + .5) * cw + (rr() - .5) * 8, cy = (r + .5) * ch + (rr() - .5) * 6, l = 150 + rr() * 50 | 0, rx = cw * (.36 + rr() * .1), ry = ch * (.34 + rr() * .1);
    wrap(() => { const gr = g.createLinearGradient(0, cy - ry, 0, cy + ry); gr.addColorStop(0, `rgb(${l + 18},${l + 18},${l + 18})`); gr.addColorStop(1, `rgb(${l - 28},${l - 28},${l - 28})`);
      g.fillStyle = gr; g.beginPath(); if (g.roundRect) g.roundRect(cx - rx, cy - ry, rx * 2, ry * 2, rx * .6); else g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); }); }
  for (let i = 0; i < 320; i++) { const x = rr() * w, y = rr() * h, s = .5 + rr() * 1.3, l = rr() < .5 ? 225 : 70; wrap(() => { g.fillStyle = `rgba(${l},${l},${l},.45)`; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }); }
});
const texFeather = bossTex((g, w, h, rr, wrap) => {   // GLOOMWING: overlapping scalloped feathers with a quill and fine barbs
  g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, w, h); const cw = w / 6, ch = h / 8;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) { const cx = (c + (r % 2) * .5 + .5) * cw, cy = (r + .5) * ch, l = 165 + rr() * 50 | 0;
    wrap(() => { const gr = g.createLinearGradient(0, cy - ch * .6, 0, cy + ch * .75); gr.addColorStop(0, `rgb(${l + 30},${l + 30},${l + 30})`); gr.addColorStop(.75, `rgb(${l},${l},${l})`); gr.addColorStop(1, `rgb(${l * .55 | 0},${l * .55 | 0},${l * .55 | 0})`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(cx - cw * .55, cy - ch * .7); g.lineTo(cx - cw * .55, cy + ch * .1); g.quadraticCurveTo(cx - cw * .5, cy + ch * .8, cx, cy + ch * .85);
      g.quadraticCurveTo(cx + cw * .5, cy + ch * .8, cx + cw * .55, cy + ch * .1); g.lineTo(cx + cw * .55, cy - ch * .7); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,40,40,.55)'; g.lineWidth = 1.4; g.stroke();
      g.strokeStyle = 'rgba(250,250,250,.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, cy - ch * .6); g.lineTo(cx, cy + ch * .75); g.stroke();
      g.strokeStyle = 'rgba(30,30,30,.18)'; g.lineWidth = 1; for (let k = 1; k < 6; k++) { const y = cy - ch * .5 + k * ch * .2; g.beginPath(); g.moveTo(cx, y); g.lineTo(cx - cw * .45, y + ch * .2); g.moveTo(cx, y); g.lineTo(cx + cw * .45, y + ch * .2); g.stroke(); } }); }
});
// boss material: Standard + vertex colour, object-space triplanar texture per paint layer, soft self-light (like the hero's SM) and a rim light
// so the silhouette reads against the jungle. One per boss per room (flashSkins drives its emissive); disposed with the room, never in allMats.
function bossMat(key, layers, o) {   // layers: [{ t: canvas texture or art key, sc: tiles per unit, st: strength, rough?: override }]
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.rough, metalness: 0 });
  const U = { uRimC: { value: new THREE.Color(o.rim) }, uRimK: { value: o.rimK }, uSelf: { value: o.self }, uAn: { value: { x: 0, y: 0, z: 0, w: 0 } }, uDt: { value: new THREE.Vector3() } }; m.userData.U = U;
  layers.forEach((L, i) => { const art = typeof L.t === 'string'; U['tB' + i] = art ? (artU[L.t] || { value: null }) : { value: L.t }; U['gB' + i] = art ? (artU[L.t] ? uArt : { value: 0 }) : { value: 1 }; });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
    sh.vertexShader = BANIM_D + 'attribute float aBt; varying float vBt; varying vec3 vBP; varying vec3 vBN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBt=aBt; vBP=position; vBN=normal;\n' + BANIM);
    let f = ' { vec3 bw=pow(abs(normalize(vBN)),vec3(4.)); bw/=bw.x+bw.y+bw.z+1e-4; vec3 bd=vec3(1.);\n', r = '';
    layers.forEach((L, i) => { const gain = typeof L.t === 'string' ? artGain(L.t) : L.t.userData.gain.toFixed(3);
      f += '  if(abs(vBt-' + i + '.)<.5) bd=mix(vec3(1.),bTri(tB' + i + ',vBP*' + L.sc.toFixed(3) + ',bw)*' + gain + ',' + L.st.toFixed(2) + '*gB' + i + ');\n';
      if (L.rough !== undefined) r += ' if(abs(vBt-' + i + '.)<.5) roughnessFactor=' + L.rough.toFixed(2) + ';'; });
    f += '  diffuseColor.rgb*=bd; }\n';
    sh.fragmentShader = 'uniform vec3 uRimC; uniform float uRimK; uniform float uSelf; varying float vBt; varying vec3 vBP; varying vec3 vBN;' + layers.map((L, i) => ' uniform sampler2D tB' + i + '; uniform float gB' + i + ';').join('') +
      '\nvec3 bTri(sampler2D t,vec3 q,vec3 w){ return texture2D(t,q.zy).rgb*w.x+texture2D(t,q.xz).rgb*w.y+texture2D(t,q.xy).rgb*w.z; }\n' +
      sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + f)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + r)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*(uSelf+step(3.5,vBt)*.9)+uRimC*uRimK*pow(1.-clamp(dot(normalize(normal),normalize(vViewPosition)),0.,1.),3.);');
  };
  m.customProgramCacheKey = () => 'boss:' + key; return m;
}
const _bkM = new THREE.Matrix4(), _bkI = new THREE.Matrix4(), _bkC = new THREE.Color(), _bkV = new THREE.Vector3(), _bkW = new THREE.Vector3();
// ---- depth + character pass (Michael t53u): sculpted forms (vertex displacement on denser shapes), bevelled stone, contact shading baked
// into the vertex colour, varied ink weight, and idle face animation done in the vertex shader. Everything still bakes to the same meshes,
// so the draw calls stay as they were; the extra cost is triangles. ----
const gSphH = new THREE.SphereGeometry(.5, 28, 18), gSphM = new THREE.SphereGeometry(.5, 18, 12), gHalfL = new THREE.SphereGeometry(.5, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2), gConeH = new THREE.ConeGeometry(.5, 1, 14, 4);
const capHC = {}, capH = (r, len) => capHC[r + '_' + len] || (capHC[r + '_' + len] = new THREE.CapsuleGeometry(r, len, 7, 22));
const boxHC = {}, boxHG = (sx, sy, sz) => { const s = v => Math.max(2, Math.round(v * 2.6)), k = s(sx) + '_' + s(sy) + '_' + s(sz);   // subdivided unit box (enough vertices to bevel and carve), shared
  if (!boxHC[k]) { boxHC[k] = new THREE.BoxGeometry(1, 1, 1, s(sx), s(sy), s(sz)); boxHC[k].userData.box = true; } return boxHC[k]; };
gBox.userData.box = true;
const bH = (a, b, c) => { let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function bN(x, y, z) {   // value noise, -1..1
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), s = t => t * t * (3 - 2 * t), u = s(x - xi), v = s(y - yi), w = s(z - zi), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(bH(xi, yi, zi), bH(xi + 1, yi, zi), u), L(bH(xi, yi + 1, zi), bH(xi + 1, yi + 1, zi), u), v),
    L(L(bH(xi, yi, zi + 1), bH(xi + 1, yi, zi + 1), u), L(bH(xi, yi + 1, zi + 1), bH(xi + 1, yi + 1, zi + 1), u), v), w) * 2 - 1;
}
const bF = (x, y, z) => bN(x, y, z) * .55 + bN(x * 2.03 + 5.1, y * 2.03, z * 2.03) * .3 + bN(x * 4.1, y * 4.1 + 9.3, z * 4.1) * .15;
function bW(x, y, z) {   // cellular noise: distance to the nearest and second nearest jittered point
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let d1 = 9, d2 = 9;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const cx = xi + i, cy = yi + j, cz = zi + k;
    const dx = cx + .15 + bH(cx, cy, cz) * .7 - x, dy = cy + .15 + bH(cy + 7, cz, cx) * .7 - y, dz = cz + .15 + bH(cz + 3, cx, cy + 5) * .7 - z, d = dx * dx + dy * dy + dz * dz;
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return [Math.sqrt(d1), Math.sqrt(d2)];
}
const SCULPT = {   // displacement shapes, about -1..1 (times the part's amplitude), sampled in the boss's own space so they run on across parts
  bump: (x, y, z, f) => bF(x * f, y * f, z * f),
  scale: (x, y, z, f) => { const w = bW(x * f, y * f * 1.2, z * f); return Math.min(1, (w[1] - w[0]) * 2.6) * 2 - 1 + bN(x * f * 3, y * f * 3, z * f * 3) * .2; },   // raised plates, sunk wet gaps
  bands: (x, y, z, f) => 1 - 2 * Math.pow(1 - Math.abs(Math.sin(y * f * Math.PI)), 12) + bN(x * 3, y * 3, z * 3) * .15,   // belly plates with sunk seams
  stone: (x, y, z, f) => { const r = 1 - Math.abs(bN(x * f * .8 + 3, y * f * .8, z * f * .8)); return bF(x * f, y * f, z * f) * .7 - Math.pow(r, 7) * 1.6 + .25; },   // lumpy, with sharp cracks
  feather: (x, y, z, f, o) => { const c = o.c || [0, 0], u = Math.atan2(z - c[1], x - c[0]) * (o.ur || 1.5), t = y * f + .32 * Math.abs(Math.sin(u * f * 1.1 + Math.floor(y * f) * 1.9)) + bN(x * 2, y * 2, z * 2) * .22;
    return 1 - 2 * (t - Math.floor(t)); }   // tiers of overlapping feathers: each tip sits proud of the row below
};
const gSphL = new THREE.SphereGeometry(.5, 8, 5), gFeat = new THREE.ConeGeometry(.5, 1, 7, 1); gFeat.rotateX(Math.PI / 2);   // gFeat: a pointed feather tile, tip down the skin
function bShingle(par, paint, c, r, rows, cols, th0, th1, ph0, ph1, sz, o) {   // overlapping tiles (feathers, scutes) laid over an ellipsoid; each tile's lower edge is lifted, like a roof
  o = o || {};
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const ph = ph0 + (ph1 - ph0) * (rows > 1 ? i / (rows - 1) : .5), th = th0 + (th1 - th0) * (j + (i % 2) * .5) / cols, cp = Math.cos(ph), sp = Math.sin(ph), ct = Math.cos(th), st = Math.sin(th);
    const n = new THREE.Vector3(cp * ct / r[0], sp / r[1], cp * st / r[2]).normalize(), t = new THREE.Vector3(0, -1, 0).addScaledVector(n, n.y).normalize();
    const up = n.clone().addScaledVector(t, o.lift === undefined ? .35 : o.lift).normalize(), bx = new THREE.Vector3().crossVectors(up, t).normalize(), tz = new THREE.Vector3().crossVectors(bx, up), k = 1 + (bH(i, j, 9) - .5) * .25;
    const m = mk(o.geo || gSphL, typeof paint === 'function' ? paint(i, j) : paint, c[0] + r[0] * cp * ct + n.x * (o.out || 0) + t.x * sz[2] * .2, c[1] + r[1] * sp + n.y * (o.out || 0) + t.y * sz[2] * .2, c[2] + r[2] * cp * st + n.z * (o.out || 0) + t.z * sz[2] * .2, sz[0] * k, sz[1], sz[2] * k, par);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, up, tz)); }
}
const bSc = (m, o) => { m.userData.sc = o; return m; };            // sculpt a part: { k: shape, a: amplitude, f: frequency, bev: stone bevel, dent: [[x, y, z, r, depth]] }
const bAn = (m, grp, w) => { m.userData.an = [grp, w]; return m; };  // idle animation group: 1 breathe, 2/3 brows, 4 lids (blink), 5 eyes (dart); w = travel
function bevelBox(g, s, r) {   // round off a unit box's edges in its scaled space (a chiselled chamfer on the subdivided boxes)
  const p = g.attributes.position, hx = Math.max(0, s.x / 2 - r), hy = Math.max(0, s.y / 2 - r), hz = Math.max(0, s.z / 2 - r), cl = (v, h) => Math.max(-h, Math.min(h, v));
  for (let i = 0; i < p.count; i++) { const qx = p.getX(i) * s.x, qy = p.getY(i) * s.y, qz = p.getZ(i) * s.z, ix = cl(qx, hx), iy = cl(qy, hy), iz = cl(qz, hz), dx = qx - ix, dy = qy - iy, dz = qz - iz, l = Math.hypot(dx, dy, dz);
    if (l > 1e-6) p.setXYZ(i, (ix + dx / l * r) / s.x, (iy + dy / l * r) / s.y, (iz + dz / l * r) / s.z); }
}
const BANIM_D = 'attribute float aAn; attribute float aAw; uniform vec4 uAn; uniform vec3 uDt;\n';
const BANIM = ' { float bg=floor(aAn+.5); if(bg==1.) transformed+=normal*(uAn.x*aAw); else if(bg==2.) transformed.y+=uAn.y*aAw; else if(bg==3.) transformed.y+=uAn.z*aAw; else if(bg==4.) transformed.y-=uAn.w*aAw; else if(bg==5.) transformed+=uDt*aAw; }\n';
function bossInkMat(key, mat) {   // the hero's ink, per boss so the outline follows the breathing / brows / blinks (shares the boss's animation uniforms)
  const U = mat.userData.U, m = new THREE.MeshBasicMaterial({ color: '#1e1816', side: THREE.BackSide });
  m.onBeforeCompile = sh => { sh.uniforms.uAn = U.uAn; sh.uniforms.uDt = U.uDt; sh.vertexShader = BANIM_D + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + BANIM); };
  m.customProgramCacheKey = () => 'bink:' + key; return m;
}
const AO_D = [.09, .24, .5], AO_W = [.45, .35, .2];
// merge the painted meshes under root (skipping the stop pivots, which are baked on their own) into one mesh + one ink hull; returns the mesh.
// Per part: optional bevel + sculpt (displaced along the normal averaged per spot, so box corners stay closed), smooth normals of the new
// surface, then contact shading (is the point a little way out along the normal inside another part?), cavity shading from the sculpt, top light.
function bossBake(root, mat, own, stops, ink) {
  root.updateMatrixWorld(true); _bkI.copy(root.matrixWorld).invert();
  const parts = [], walk = o => { for (const c of o.children) { if (stops && stops.includes(c)) continue; if (c.isMesh && c.material && c.material.bk) parts.push(c); walk(c); } };
  walk(root);
  const recs = [];
  for (const m of parts) {
    const pt = m.material, sc = m.userData.sc, g0 = m.geometry; if (!g0.boundingBox) g0.computeBoundingBox();
    const g = g0.clone(); if (sc && sc.bev) bevelBox(g, m.scale, sc.bev);
    const mw = new THREE.Matrix4().multiplyMatrices(_bkI, m.matrixWorld); g.applyMatrix4(mw);
    const p = g.attributes.position, n = g.attributes.normal, vc = g.attributes.color, N = p.count, ix = g.index ? g.index.array : null, cnt = ix ? ix.length : N;
    const P = new Float32Array(N * 3), Nn = new Float32Array(N * 3), Av = new Float32Array(N * 3), D = new Float32Array(N), keys = new Array(N), acc = new Map();
    for (let i = 0; i < N; i++) { P[i * 3] = p.getX(i); P[i * 3 + 1] = p.getY(i); P[i * 3 + 2] = p.getZ(i);
      const kk = keys[i] = Math.round(P[i * 3] * 500) + ',' + Math.round(P[i * 3 + 1] * 500) + ',' + Math.round(P[i * 3 + 2] * 500), a = acc.get(kk) || [0, 0, 0];
      a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(kk, a); }
    for (let i = 0; i < N; i++) { const a = acc.get(keys[i]), l = Math.hypot(a[0], a[1], a[2]) || 1; Av[i * 3] = a[0] / l; Av[i * 3 + 1] = a[1] / l; Av[i * 3 + 2] = a[2] / l; }
    if (sc && (sc.k || sc.dent || sc.bev)) {
      const fn = SCULPT[sc.k], amp = sc.a || 0, f = sc.f || 1;
      for (let i = 0; i < N; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; let d = fn ? fn(x, y, z, f, sc) * amp : 0; if (sc.lo) d += bF(x * sc.lo[1] + 11, y * sc.lo[1], z * sc.lo[1]) * sc.lo[0];   // lo: [amp, freq] big lumps that break the silhouette
        if (sc.dent) for (const q of sc.dent) { const t = Math.hypot(x - q[0], y - q[1], z - q[2]) / q[3]; if (t < 1) d -= q[4] * (1 - t * t) * (1 - t * t); }
        D[i] = d; P[i * 3] += Av[i * 3] * d; P[i * 3 + 1] += Av[i * 3 + 1] * d; P[i * 3 + 2] += Av[i * 3 + 2] * d; }
      const fa = new Map();   // smooth normals of the carved surface, merged per spot
      for (let t = 0; t < cnt; t += 3) { const a = ix ? ix[t] : t, b = ix ? ix[t + 1] : t + 1, c = ix ? ix[t + 2] : t + 2;
        const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        for (const v of [a, b, c]) { const s = fa.get(keys[v]) || [0, 0, 0]; s[0] += cx; s[1] += cy; s[2] += cz; fa.set(keys[v], s); } }
      for (let i = 0; i < N; i++) { const s = fa.get(keys[i]), l = s ? Math.hypot(s[0], s[1], s[2]) : 0;
        if (l > 1e-9) { Nn[i * 3] = s[0] / l; Nn[i * 3 + 1] = s[1] / l; Nn[i * 3 + 2] = s[2] / l; } else { Nn[i * 3] = Av[i * 3]; Nn[i * 3 + 1] = Av[i * 3 + 1]; Nn[i * 3 + 2] = Av[i * 3 + 2]; } }
    } else for (let i = 0; i < N; i++) { Nn[i * 3] = n.getX(i); Nn[i * 3 + 1] = n.getY(i); Nn[i * 3 + 2] = n.getZ(i); }
    const bb = g0.boundingBox, c = bb.getCenter(new THREE.Vector3()), hs = bb.getSize(new THREE.Vector3()).multiplyScalar(.5);
    recs.push({ pt, sc, an: m.userData.an, P, Nn, Av, D, N, ix, cnt, vc, inv: mw.clone().invert(), box: !!g0.userData.box, c0: c, hs, c: c.clone().applyMatrix4(mw), r: hs.length() * mw.getMaxScaleOnAxis() });
    g.dispose(); m.parent.remove(m);
  }
  const pos = [], nor = [], col = [], lay = [], aan = [], aaw = [], idx = [], inkPos = [], inkN = [], inkA = [], inkW = [], ii = [];
  for (const R of recs) {
    const pt = R.pt, glow = pt.layer === 4, cand = glow ? [] : recs.filter(o => o !== R && o.pt.layer !== 4 && o.r > .1 && o.c.distanceTo(R.c) < R.r + o.r + .6);
    const amp = R.sc && R.sc.a ? R.sc.a : 0, base = pos.length / 3, grp = R.an ? R.an[0] : 0, gw = R.an ? R.an[1] : 0;
    for (let i = 0; i < R.N; i++) { const x = R.P[i * 3], y = R.P[i * 3 + 1], z = R.P[i * 3 + 2], nx = R.Nn[i * 3], ny = R.Nn[i * 3 + 1], nz = R.Nn[i * 3 + 2];
      let occ = 0;
      for (let s = 0; s < 3 && cand.length; s++) { const d = AO_D[s]; _bkV.set(x + nx * d, y + ny * d, z + nz * d);
        for (const o of cand) { if (_bkV.distanceTo(o.c) > o.r) continue; const q = _bkW.copy(_bkV).applyMatrix4(o.inv), ux = (q.x - o.c0.x) / o.hs.x, uy = (q.y - o.c0.y) / o.hs.y, uz = (q.z - o.c0.z) / o.hs.z;
          if (o.box ? Math.max(Math.abs(ux), Math.abs(uy), Math.abs(uz)) < 1 : ux * ux + uy * uy + uz * uz < 1) { occ += AO_W[s]; break; } } }
      const cav = amp ? 1 + Math.max(-1, Math.min(1, R.D[i] / amp)) * .17 : 1, mot = R.sc && R.sc.mot ? 1 + bF(x * .7 + 4, y * .7, z * .7) * R.sc.mot : 1, k = (.74 + .34 * (ny * .5 + .5)) * (1 - .52 * occ) * cav * mot;   // top light, contact shade, cavity, mottling
      pos.push(x, y, z); nor.push(nx, ny, nz); _bkC.copy(pt.color); if (R.vc) _bkC.multiply(_bkC.clone().setRGB(R.vc.getX(i), R.vc.getY(i), R.vc.getZ(i)));
      col.push(_bkC.r * k, _bkC.g * k, _bkC.b * k); lay.push(pt.layer); aan.push(grp); aaw.push(gw); }
    for (let i = 0; i < R.cnt; i++) idx.push(base + (R.ix ? R.ix[i] : i));
    if (pt.ink > 0) {   // ink hull along the per-spot normal; heavier under the forms and a little uneven, like a brush line
      const ib = inkPos.length / 3;
      for (let i = 0; i < R.N; i++) { const x = R.P[i * 3], y = R.P[i * 3 + 1], z = R.P[i * 3 + 2], ax = R.Av[i * 3], ay = R.Av[i * 3 + 1], az = R.Av[i * 3 + 2];
        const w = pt.ink * (.8 + .45 * Math.max(0, -ay) + .3 * bN(x * 1.7, y * 1.7, z * 1.7));
        inkPos.push(x + ax * w, y + ay * w, z + az * w); inkN.push(ax, ay, az); inkA.push(grp); inkW.push(gw); }
      for (let i = 0; i < R.cnt; i++) ii.push(ib + (R.ix ? R.ix[i] : i)); }
  }
  const F = (a, s) => new THREE.Float32BufferAttribute(a, s);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', F(pos, 3)); geo.setAttribute('normal', F(nor, 3)); geo.setAttribute('color', F(col, 3));
  geo.setAttribute('aBt', F(lay, 1)); geo.setAttribute('aAn', F(aan, 1)); geo.setAttribute('aAw', F(aaw, 1)); geo.setIndex(idx); own.push(geo);
  const mesh = mk(geo, mat, 0, 0, 0, 1, 1, 1, root);
  if (ii.length) { const ig = new THREE.BufferGeometry(); ig.setAttribute('position', F(inkPos, 3)); ig.setAttribute('normal', F(inkN, 3)); ig.setAttribute('aAn', F(inkA, 1)); ig.setAttribute('aAw', F(inkW, 1));
    ig.setIndex(ii); own.push(ig); mk(ig, ink || bossInk, 0, 0, 0, 1, 1, 1, root, true); }
  return mesh;
}
// idle personality, visual only (breathing, brow twitches, blinks, glances). Reads the boss state to pick a mood; never writes game state.
function bossIdle(bm, b, tele) {
  const U = bm.an; if (!U) return; const t = VT + bm.idSeed, a = U.uAn.value, daze = b.state === 'stun' || b.state === 'dazed' || b.state === 'rest';
  const tw = s => Math.pow(Math.max(0, Math.sin(t * 1.1 + s) * Math.sin(t * 2.9 + s * 1.7)), 8);   // a rare quick twitch
  a.x = Math.sin(t * (daze ? 3.4 : 2.0)) * (daze ? 1.6 : 1);
  const fu = tele ? -1 : 0; a.y = tw(0) * .9 + fu + (daze ? .7 : 0); a.z = tw(2.3) * .9 + fu * 1.25 + (daze ? .35 : 0);   // lopsided: one brow works harder
  const bp = (t * .23) % 1; a.w = daze ? .55 : bp < .035 ? Math.sin(bp / .035 * Math.PI) : 0;
  const j = Math.floor(t * .8), d = bm.dart; let tx = (bH(j, 3, 7) - .5) * 2, ty = (bH(j, 5, 1) - .5) * 1.4; if (tele) tx = ty = 0;   // glances; a fixed stare on the tell
  d[0] += (tx - d[0]) * .2; d[1] += (ty - d[1]) * .2; bm.look(d[0], d[1]);
}
const _up0 = new THREE.Vector3(0, 1, 0);
function buildBoss1(g, skins, own) {   // croc rearing out of the mire (its hitbox is a tall column): huge head, slit orange eyes, fangs, mud drips, ridged back, an old clay boot in its jaws
  const h = {};
  const C = { body: '#887a37', hi: '#a99b57', dk: '#61523c', belly: '#bcb191', deep: '#383027', drip: '#7e6f5c', tooth: '#f7f7f3', eye: '#ec8736', ink: '#0a0a0a' };
  // wet scaly skin (procedural scutes, glossy), belly plates (same scutes, bigger, softer), matte mud (in-repo mud art); thick ink + warm rim so it reads half-sunk in the mire
  const mat = bossMat('b1', [{ t: texScales, sc: .55, st: .32 }, { t: 'mud', sc: .5, st: .5, rough: .95 }, { t: texScales, sc: .22, st: .35, rough: .6 }], { rough: .34, rim: '#ffe2a8', rimK: .32, self: .1 });
  skins.push(mat); const ink = bossInkMat('b1', mat); own.push(ink);
  const sk = BP(C.body, 0, .12), skS = BP(C.body, 0, .05), hi = BP(C.hi, 0, .1), hiS = BP(C.hi, 0, .04), dk = BP(C.dk, 0, .05), dkS = BP(C.dk, 0, .03), be = BP(C.belly, 2, .07), seam = BP('#6f6448', 3, 0);
  const mud = BP(C.drip, 1, .05), mudS = BP(C.drip, 1, .025), mudW = BP('#5a4632', 1, .05), tooth = BP(C.tooth, 3, .022), gum = BP('#6e3b30', 3, 0), throat = BP('#3a1d18', 3, 0), tongue = BP('#b8545a', 3, 0), deep = BP(C.deep, 3, 0);
  const scar = BP('#c9b98c', 3, .015), stitch = BP('#3a2c22', 3, 0);
  const onBody = (th, y, sx, sz) => [-.15 + Math.cos(th) * sx, y, Math.sin(th) * sz];   // a point on the body's skin at angle th (0 = belly side)
  bAn(bSc(mk(capH(1.0, 2.9), sk, -.15, 2.1, 0, 1, 1, 1.15, g), { k: 'scale', a: .07, f: 2.0, lo: [.13, .6], mot: .35 }), 1, .035);         // upright body: real raised scutes, breathing
  bAn(bSc(mk(capH(.62, 2.5), be, .5, 2.0, 0, 1, 1, 1.25, g), { k: 'bands', a: .05, f: 2.22 }), 1, .07);           // pale belly plates with sunk seams (breathes most)
  for (let k = 0; k < 6; k++) mk(gBox, seam, 1.08 - Math.abs(k - 2.5) * .03, .9 + k * .45, 0, .04, .05, 1.2, g);    // seam lines in the grooves
  for (let k = 0; k < 7; k++) for (const s of [1, -1]) rot(mk(gCone, dk, -1.08 + k * .02, .95 + k * .52, s * .42, .5, .85 - (k % 2) * .25, .3, g), s * .45, 0, Math.PI / 2 - .45);   // ridged back: two rows of keeled scutes, splayed out so they break the outline from behind
  for (let k = 0; k < 8; k++) rot(mk(gCone, dk, -1.14 + k * .02, 1.05 + k * .48, 0, .55, .45 + (k % 2) * .2, .14, g), 0, 0, Math.PI / 2 - .6);   // saw-tooth crest down the spine
  for (let k = 0; k < 3; k++) rot(mk(capG(.2, 1.45 - k * .25), skS, -.84 + k * .08, 3.0 + k * .3, 0, 1, 1, 1, g), Math.PI / 2, 0, 0);   // skin folds across the back of the neck
  for (const s of [1, -1]) bSc(mk(gSphM, sk, -.35, 1.05, s * .92, 1.35, 1.25, .95, g), { k: 'scale', a: .05, f: 2.4 });   // heavy haunches (the body narrows to the neck)
  for (const th of [Math.PI - .62, Math.PI + .62, Math.PI - 1.1, Math.PI + 1.1]) for (let k = 0; k < 7; k++) {   // osteoderm domes over the back and flanks (relief, not paint)
    const y = .95 + k * .45 + (Math.abs(th - Math.PI) > 1 ? .22 : 0), [x, , z] = onBody(th, y, .97, 1.1), m = mk(gHalfL, k % 3 ? skS : dkS, x, y, z, .58, .28, .44, g);
    m.quaternion.setFromUnitVectors(_up0, _bkV.set(Math.cos(th), .15, Math.sin(th) / 1.15).normalize()); }
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; mk(gBlob, k % 2 ? mud : mudW, -.15 + Math.cos(a) * 1.0, .45 + (k % 3) * .12, Math.sin(a) * 1.15, .95, .5, .8, g); }   // mud collar where it breaks the mire
  [[-1.05, .72, .15, .62], [-1.6, .5, .34, .53], [-2.13, .34, .53, .45], [-2.62, .23, .71, .37], [-3.07, .15, .87, .3], [-3.47, .1, 1.0, .23], [-3.8, .07, 1.1, .16]].forEach(([x, y, z, r], i) => {   // tail: tapering scaly segments with a double crest that joins into one
    rot(bSc(mk(gSphM, i % 2 ? skS : sk, x, y, z, r * 2.5, r * 1.55, r * 1.8, g), { k: 'scale', a: .045, f: 2.3, mot: .25 }), 0, .35, 0);
    for (const s of i < 4 ? [1, -1] : [0]) rot(mk(gCone, dk, x + .05, y + r * .78, z + s * r * .36, .18 + r * .1, .3 + r * .5, .16, g), s * .2, 0, .45); });
  for (const s of [1, -1]) { const a = new THREE.Group(); a.position.set(.5, 2.7, s * 1.05); g.add(a);              // stubby fore-legs, scaly elbows, knuckles, pale claws
    rot(bSc(mk(capH(.32, .7), sk, .35, -.2, 0, 1, 1, 1, a), { k: 'scale', a: .03, f: 3 }), 0, 0, -1.1); bSc(mk(gSphM, hi, .85, -.5, 0, .75, .45, .6, a), { k: 'bump', a: .04, f: 4 }); mk(gSph, dk, .05, .1, s * .12, .34, .28, .32, a);
    for (let c = 0; c < 3; c++) { mk(gSph, hiS, 1.08, -.5, (c - 1) * .2, .18, .15, .17, a); rot(mk(gCone, tooth, 1.22, -.6, (c - 1) * .2, .1, .3, .1, a), 0, 0, -Math.PI / 2 - .3); } }
  bSc(mk(gSphH, sk, .95, 4.35, 0, 2.5, 1.85, 2.25, g), { k: 'scale', a: .07, f: 1.5, dent: [[.5, 3.75, 1.05, .45, .12], [.5, 3.75, -1.05, .45, .12]] });   // big skull: scaly relief, sunk cheeks behind the jaw hinge
  for (const [x, y, z] of [[.25, 5.08, .38], [-.05, 4.85, .32], [-.3, 4.55, .26]]) for (const s of [1, -1]) bSc(mk(gSph, dk, x, y, s * z, .34, .24, .32, g), { k: 'bump', a: .03, f: 5 });   // skull knobs
  for (const s of [1, -1]) { bSc(mk(gSphM, hi, 1.7, 4.2, s * .96, .95, .42, .48, g), { k: 'bump', a: .03, f: 3 });   // cheekbones under the eyes
    bSc(mk(gSphM, sk, .15, 4.0, s * 1.0, 1.0, .95, .62, g), { k: 'scale', a: .04, f: 2.4 }); }                    // jaw muscles
  rot(bSc(mk(capH(.6, 1.3), hi, 2.2, 3.95, 0, 1, 1, 1.5, g), { k: 'bump', a: .035, f: 3 }), 0, 0, Math.PI / 2);   // upper snout (to x ~3.5), lumpy
  for (const x of [1.75, 2.25, 2.75]) for (const s of [1, -1]) mk(gHalfL, hiS, x, 4.48, s * .36, .3, .16, .26, g);  // snout scutes (raised domes)
  for (const s of [1, -1]) { mk(gSph, hiS, 3.3, 4.5, s * .27, .36, .28, .32, g); mk(gSph, deep, 3.44, 4.6, s * .27, .14, .1, .12, g); }   // nostril bumps + holes
  mk(gFlat, gum, 2.0, 3.42, 0, 2.6, 1, 1.5, g).rotation.x = Math.PI;                                                 // roof of the mouth
  bAn(mk(gSph, throat, .95, 3.4, 0, 1.0, .5, 1.2, g), 1, .05);                                                       // dark throat (the open mouth reads deep), gulping
  for (let j = 0; j < 6; j++) for (const s of [1, -1]) { const f = j === 1 || j === 4, br = j === 4 && s === 1;     // upper teeth; one big fang snapped off
    mk(gCone, tooth, 1.05 + j * .44, br ? 3.3 : 3.34, s * .76, f ? .26 : .17, br ? .26 : f ? .62 : .34, f ? .26 : .17, g).rotation.z = Math.PI;
    if (br) mk(gIco, tooth, 1.05 + j * .44, 3.17, s * .76, .17, .07, .17, g); }
  { const sc = new THREE.Group(); sc.position.set(.55, 4.75, 1.0); sc.rotation.set(-.35, .2, .6); g.add(sc);           // old claw scar across one cheek, stitched
    mk(capG(.055, 1.1), scar, 0, 0, 0, 1, 1, 1, sc); for (let k = 0; k < 4; k++) mk(gBox, stitch, 0, -.42 + k * .28, 0, .3, .04, .06, sc); }
  h.jaw = new THREE.Group(); h.jaw.position.set(.5, 3.45, 0); g.add(h.jaw);                                          // lower jaw (syncBoss opens it)
  rot(bSc(mk(capH(.42, 1.6), hi, 1.35, -.42, 0, 1, 1, 1.8, h.jaw), { k: 'scale', a: .04, f: 2.2 }), 0, 0, Math.PI / 2); bSc(mk(gSphM, be, 1.1, -.65, 0, 2.4, .45, 1.3, h.jaw), { k: 'bands', a: .03, f: 3 });
  mk(gFlat, gum, 1.4, -.04, 0, 2.5, 1, 1.3, h.jaw); mk(gSph, tongue, 1.0, -.08, 0, 1.6, .22, .7, h.jaw);
  for (let j = 0; j < 5; j++) for (const s of [1, -1]) mk(gCone, tooth, .75 + j * .46, .1, s * .68, .17, j === 2 && s < 0 ? .22 : .38, .17, h.jaw);   // one worn-down tooth
  { const bt = new THREE.Group(); bt.position.set(2.1, .15, .15); bt.rotation.set(.3, .5, -.45); h.jaw.add(bt);        // the old clay boot it is chewing on (bitten: tooth dents)
    const clay = BP('#a05a3c', 3, .05); mk(gCyl, clay, 0, .42, 0, .5, .85, .5, bt); bSc(mk(gSphM, clay, .32, 0, 0, .95, .42, .56, bt), { k: 'bump', a: .02, f: 6 });
    mk(gBox, BP(C.deep, 3, .03), .2, -.19, 0, .95, .09, .54, bt); mk(gCyl, BP('#6e3b2a', 3, .03), 0, .86, 0, .56, .09, .56, bt);
    for (let k = 0; k < 3; k++) mk(gBox, BP('#e8d9b0', 3, 0), .26, .3 + k * .17, 0, .04, .04, .5, bt).rotation.x = (k % 2 - .5) * .7; }   // laces
  for (const [x, z, l] of [[.9, .55, .5], [1.9, -.5, .7], [2.6, .35, .4]]) mk(capG(.09, l), mudS, x, -.8 - l / 2, z, 1, 1, 1, h.jaw);   // drool-mud
  const pg = new THREE.Group(); g.add(pg);                                                                            // pupils: one mesh, syncBoss swaps its colour on the tell; glances in idle
  for (const s of [1, -1]) {                                                                                          // eye bumps, glowing slit eyes, blinking lids, heavy lopsided brows
    bSc(mk(gSphM, hi, .75, 5.2, s * .8, .95, .8, .8, g), { k: 'bump', a: .03, f: 4 });
    mk(gSph, BP(C.eye, 4, 0), .98, 5.28, s * 1.0, .64, .58, .54, g); mk(gSph, BP('#fff6d8', 4, 0), 1.16, 5.44, s * 1.25, .1, .1, .08, g);   // eyes sit on the sides of the skull bumps, so they read from the side-on game camera
    bAn(rot(mk(gSph, hiS, .92, 5.6, s * .96, .74, .3, .66, g), 0, 0, -.3), 4, .3);                                     // grumpy upper lid (blinks)
    mk(gSph, BP(C.ink, 3, 0), 1.1, 5.28, s * 1.2, .14, .46, .14, pg);
    bAn(rot(bSc(mk(capH(.19, .78), BP(C.deep, 0, .05), .95, s > 0 ? 5.82 : 5.74, s * .95, 1, 1, 1.35, g), { k: 'bump', a: .03, f: 5 }), 0, 0, Math.PI / 2 - (s > 0 ? .75 : .5)), s > 0 ? 2 : 3, .13); }
  for (const [x, y, z, l] of [[.9, 1.6, .8, .6], [-.5, 1.4, -1.05, .5], [.75, 2.9, -.9, .45], [-.9, 2.3, 1.0, .5], [1.6, 3.3, 1.0, .4]]) mk(capG(.12, l), mudS, x, y - l / 2, z, 1, 1, 1, g);   // mud drips
  for (const [x, y, z, s] of [[-.6, 3.2, 1.0, .5], [.3, 2.5, -1.15, .45], [-1.0, 1.6, -.8, .4], [1.4, 5.2, .1, .35], [-.2, 3.4, -.95, .4]]) mk(gBlob, mud, x, y, z, s * 1.4, s * .7, s, g);
  for (const s of [1, -1]) mk(gBlob, mud, .1, 3.15, s * 1.05, .85, .45, .7, g);                                       // mud slopped on the shoulders
  bossBake(h.jaw, mat, own, null, ink); h.pupils = [bossBake(pg, M('#2a1c13'), own)]; h.pupils[0].castShadow = false; bossBake(g, mat, own, [h.jaw, pg], ink);
  h.an = mat.userData.U; h.idSeed = 0; h.dart = [0, 0]; h.look = (x, y) => h.pupils[0].position.set(x * .07, y * .05, 0);
  return h;
}
function buildBoss2(g, skins, own) {   // round orange bird: cream belly, hooked yellow beak, grumpy brows, leaf crest, layered teal wings, seed bombs in its talons, bandaged tail
  const h = {};
  const C = { wing: '#4c8f91', wingL: '#94bfb5', wingD: '#36584c', leaf: '#678b54', seed: '#9db66f', body: '#eb9c4f', rust: '#ab5832', belly: '#e5d29e', eye: '#ef8b3b', ink: '#141614' };
  // feathers: fine procedural feather texture on the body, a bigger one on wing and tail feathers, the in-repo leaf art on the crest and seed pods
  const mat = bossMat('b2', [{ t: texFeather, sc: .8, st: .5 }, { t: 'leaf', sc: 1.4, st: .6 }, { t: texFeather, sc: .9, st: .4 }], { rough: .78, rim: '#fff0c8', rimK: .2, self: .1 });
  skins.push(mat); const ink = bossInkMat('b2', mat); own.push(ink);
  const bo = BP(C.body, 0, .1), boS = BP(C.body, 0, .03), ru = BP(C.rust, 0, .08), ruS = BP(C.rust, 0, .03), be = BP(C.belly, 0, .07), beS = BP('#d9bf86', 0, .02), wi = BP(C.wing, 2, .05), wl = BP(C.wingL, 2, .05), wd = BP(C.wingD, 2, .04), wdS = BP(C.wingD, 2, 0);
  const lf = BP(C.leaf, 1, .04), lfS = BP('#55743f', 1, 0), beak = BP('#efc23a', 3, .055), beakD = BP('#b8861e', 3, 0), white = BP(C.belly, 3, .035), ink3 = BP(C.ink, 3, 0);
  const fe = (k, f, a) => ({ k: 'feather', f, a, c: [k, 0], mot: .12 });
  const ruF = BP(C.rust, 0, .025), ruF2 = BP('#9a4c2a', 0, .025), boF = BP(C.body, 0, .025), boF2 = BP('#dc8c44', 0, .025);   // feather tiles: thin ink so they read as feathers, not armour                                                     // feather tiers wrapped round a centre
  bAn(bSc(mk(gSphH, bo, -.2, 0, 0, 3.6, 3.0, 3.0, g), fe(-.2, 1.7, .12)), 1, .04); bSc(mk(gSphH, ru, -.9, .55, 0, 2.4, 2.0, 2.6, g), fe(-.9, 1.9, .11));   // body + rust back, layered feather tiers
  bAn(bSc(mk(gSphH, be, .55, -.6, 0, 2.5, 2.2, 2.4, g), fe(.55, 2.4, .08)), 1, .09);                                  // cream belly, puffs as it breathes
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - (r === 2 ? 1 : 0); k++) { const z = (k - (r === 2 ? 1 : 1.5)) * .5, y = -.15 - r * .5, x = 1.62 - r * .05 - Math.abs(z) * .25;   // chest feather chevrons
    bAn(rot(mk(gSph, beS, x, y, z, .16, .44, .36, g), 0, 0, -.25), 1, .09); }
  bSc(mk(gSphH, bo, 1.35, 1.05, 0, 2.1, 2.0, 2.05, g), fe(1.35, 2.8, .06)); bSc(mk(gSphM, ru, 1.1, 1.75, 0, 1.4, .7, 1.5, g), fe(1.1, 4, .04));   // head + rust cap
  bShingle(g, (i, j) => (i + j) % 3 ? ruF : ruF2, [-.9, .55, 0], [1.2, 1.0, 1.3], 4, 9, Math.PI - 1.4, Math.PI + 1.4, -.1, 1.0, [.62, .12, .95], { out: -.07, lift: .14, geo: gFeat });   // overlapping rust feathers over the back
  bShingle(g, (i, j) => (i * 3 + j) % 4 ? boF : boF2, [-.2, 0, 0], [1.8, 1.5, 1.5], 3, 11, Math.PI - 1.65, Math.PI + 1.65, -.95, -.3, [.66, .12, 1.0], { out: -.08, lift: .14, geo: gFeat });   // and over the lower back and flanks
  for (let k = 0; k < 4; k++) rot(mk(gCone, ruS, .25 - k * .12, 1.95 + k * .06, (k - 1.5) * .28, .28, .9, .2, g), (k - 1.5) * .3, 0, 1.25 + k * .08);   // ruffled nape feathers
  rot(mk(gCone, ruS, 1.55, 2.2, .3, .16, .7, .12, g), .5, 0, -.6); rot(mk(gCone, ruS, 1.7, 2.15, .38, .12, .5, .1, g), .7, 0, -1.1);   // a stubborn cowlick
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) rot(mk(gCone, bo, 1.0 - k * .1, .35 - k * .12, s * (.95 - k * .05), .24, .62, .17, g), s * .5, 0, 2.3 + k * .15);   // cheek fluff
  for (const s of [1, -1]) bSc(mk(gSphM, bo, 1.75, .78, s * .75, .9, .55, .5, g), { k: 'bump', a: .03, f: 4 });  // puffed cheeks under the eyes
  rot(bSc(mk(gConeH, beak, 2.75, .85, 0, .7, 1.4, .62, g), { k: 'bump', a: .025, f: 5, dent: [[3.25, .7, .15, .14, .06]] }), 0, 0, -Math.PI / 2); rot(mk(gCone, beak, 3.35, .62, 0, .24, .55, .22, g), 0, 0, Math.PI * .82);   // hooked beak, one old chip
  rot(mk(capG(.07, .9), BP('#f6d460', 3, .02), 2.7, 1.15, 0, 1, 1, 1, g), 0, 0, Math.PI / 2 + .32);                    // ridge along the top of the beak
  rot(mk(gCone, BP('#d9a52a', 3, .04), 2.55, .55, 0, .42, .9, .38, g), 0, 0, -Math.PI / 2 - .12);                    // lower mandible
  mk(gBox, beakD, 2.7, .72, 0, 1.1, .05, .5, g); for (const s of [1, -1]) mk(gSph, beakD, 2.95, .98, s * .16, .1, .06, .07, g);   // gape line + nostrils
  for (const s of [1, -1]) {                                                                                         // big eyes: white, glowing iris, pupil + glint (glance), blinking lids, lopsided angry brows
    mk(gSph, white, 2.1, 1.3, s * .62, .55, .62, .45, g); mk(gSph, BP(C.eye, 4, 0), 2.22, 1.28, s * .7, .45, .5, .32, g);
    bAn(mk(gSph, ink3, 2.34, 1.26, s * .78, .2, .26, .14, g), 5, 1); bAn(mk(gSph, BP('#ffffff', 4, 0), 2.36, 1.38, s * .84, .08, .08, .06, g), 5, 1);
    bAn(rot(mk(gSph, boS, 2.08, 1.62, s * .62, .62, .3, .52, g), 0, 0, -.35), 4, .34);
    bAn(rot(bSc(mk(capH(.13, .62), BP('#7a3a20', 0, .035), 2.05, s > 0 ? 1.8 : 1.72, s * .66, 1, 1, 1.5, g), { k: 'bump', a: .02, f: 6 }), 0, 0, Math.PI / 2 - (s > 0 ? .3 : .55)), s > 0 ? 2 : 3, .12); }
  for (let i = 0; i < 6; i++) { const a = (i - 2.5) * .28; rot(mk(gCone, lf, .8 - Math.abs(i - 2.5) * .12, 2.35, a * 1.4, .42, (1.4 - Math.abs(i - 2.5) * .15) * (i === 4 ? .6 : 1), .14, g), a * 1.2, 0, .55 + Math.abs(a) * .3); }   // leaf crest (one leaf torn short)
  h.wings = [1, -1].map(s => { const w = new THREE.Group(); w.position.set(-.4, .9, s * 1.25); g.add(w); bSc(mk(gSphM, wd, 0, 0, s * .35, 1.4, .55, 1.2, w), { k: 'bump', a: .03, f: 4 });
    for (let k = 0; k < 4; k++) mk(gSph, ruS, .35 - k * .3, .18, s * (.75 + k * .1), .55, .17, .7, w);           // rust covert feathers at the wing root
    for (let k = 0; k < 5; k++) mk(gSph, wdS, .2 - k * .32, .12, s * (1.15 + (k % 2) * .1), .4, .12, .5, w);       // a second row of small coverts
    for (let i = 0; i < 6; i++) { const L = (2.7 - i * .22) * (s > 0 && i === 3 ? .72 : 1), x = .3 - i * .42, z = s * (L / 2 + .25);   // one primary broken short
      mk(gSph, i % 2 ? wl : wi, x, -.02 + i * .03, z, .6, .15, L, w); mk(gSph, wdS, x - .1, -.08, z * .8, .5, .1, L * .7, w);
      mk(gBox, BP('#e8efe6', 3, 0), x + .02, .07 + i * .03, z, .035, .025, L * .8, w);                                 // feather quill
      mk(gSph, lfS, x - .05, .03, s * (L + .1), .42, .1, .5, w); }
    bossBake(w, mat, own, null, ink); return w; });
  for (let i = 0; i < 4; i++) { rot(mk(gSph, i % 2 ? wl : wi, -3.3, -.25 + (i - 1.5) * .08, (i - 1.5) * .42, 2.4, .17, .55, g), 0, (i - 1.5) * .25, .3);   // tail + dark tips
    rot(mk(gSph, wdS, -4.25 - Math.abs(i - 1.5) * .05, -.55 + (i - 1.5) * .08, (i - 1.5) * .62, .7, .14, .45, g), 0, (i - 1.5) * .25, .3); }
  rot(mk(gTorus, BP('#f4f1e6', 3, .03), -2.6, -.05, 0, 1.0, 1.0, 1.15, g), 0, Math.PI / 2, .3);                        // white bandage on the tail
  rot(mk(gBox, BP('#d8cfb8', 3, 0), -2.62, .2, .5, .06, .3, .3, g), 0, 0, .3);                                          // its tucked end
  for (const s of [1, -1]) {                                                                                         // scaly legs, knuckled three-toed talons, spiky seed bombs
    rot(mk(capG(.15, .7), beak, .35, -1.75, s * .65, 1, 1, 1, g), 0, 0, .2); for (let k = 0; k < 3; k++) mk(gCyl, beakD, .37 - k * .04, -1.55 - k * .2, s * .65, .32, .04, .32, g);   // leg scale rings
    for (let k = 0; k < 3; k++) { const z = s * .65 + (k - 1) * .22; mk(gSph, beak, .55 + (k === 1 ? .08 : 0), -2.02, z, .16, .14, .16, g);
      rot(mk(gCone, BP(C.ink, 3, .02), .66 + (k === 1 ? .1 : 0), -2.14, z, .1, .34, .1, g), (k - 1) * .5, 0, Math.PI * .72); }
    const sb = new THREE.Group(); sb.position.set(.55, -2.45, s * .7); g.add(sb); mk(gIco, BP(C.seed, 1, .04), 0, 0, 0, .95, .95, .95, sb);
    for (let k = 0; k < 10; k++) { const v = new THREE.Vector3(Math.sin(k * 2.4) * Math.cos(k * 1.3), Math.cos(k * 2.4), Math.sin(k * 2.4) * Math.sin(k * 1.3)).normalize();
      const c = mk(gCone, BP('#6f8a3a', 3, 0), v.x * .45, v.y * .45, v.z * .45, .12, .24, .12, sb); c.quaternion.setFromUnitVectors(_up0, v); }
    for (const [dx, dz] of [[.3, 0], [-.3, .15], [0, -.3]]) rot(mk(gCone, ink3, dx, .38, dz, .07, .3, .07, sb), 0, 0, Math.PI - dx * 2); }
  bossBake(g, mat, own, h.wings, ink);
  const U = mat.userData.U; h.an = U; h.idSeed = 1.7; h.dart = [0, 0]; h.look = (x, y) => U.uDt.value.set(x * .07, y * .05, 0);
  return h;
}
function buildBoss3(g, skins, own) {   // stacked stone golem: head slab with a sapling, chest block with a carved angry face, slab belly with a band-aid, mossy shoulders, boulder fists
  const h = {}; const body = new THREE.Group(); g.add(body); h.body = body;
  const C = { stone: '#a18c78', clay: '#946a48', pale: '#b9b093', bone: '#d2cdb9', dk: '#605044', moss: '#6a806e', ochre: '#b39a52', eye: '#e09523', char: '#33302c', ink: '#090a0d' };
  // the scenery's stone art on the slabs and fists, the mud art on the clay, the leaf art on the moss; stone is matte, the sapling sways on its own pivot
  const mat = bossMat('b3', [{ t: 'stone', sc: .5, st: .6 }, { t: 'mud', sc: .5, st: .45 }, { t: 'leaf', sc: 1.2, st: .6 }], { rough: .9, rim: '#ffe6b0', rimK: .18, self: .08 });
  skins.push(mat); const ink = bossInkMat('b3', mat); own.push(ink);
  const st = BP(C.stone, 0, .1), stS = BP(C.stone, 0, .04), cl = BP(C.clay, 1, .09), pa = BP(C.pale, 0, .1), bn = BP(C.bone, 0, .09), bnS = BP(C.bone, 0, .04), dk = BP(C.dk, 0, .05), mo = BP(C.moss, 2, .06), moS = BP(C.moss, 2, .02);
  const oc = BP(C.ochre, 1, .025), ch = BP(C.char, 3, 0), crack = BP('#1c1712', 3, 0), fang = BP(C.bone, 3, .03);
  const SB = (paint, x, y, z, sx, sy, sz, par, o) => bSc(mk(boxHG(sx, sy, sz), paint, x, y, z, sx, sy, sz, par), Object.assign({ k: 'stone', a: .1, f: .9, bev: .16 }, o));   // carved stone block
  const ST = { k: 'stone', a: .09, f: 1.1 };
  for (const s of [1, -1]) { SB(cl, .1, .95, s * 1.15, 1.3, 1.7, 1.35, body, { k: 'bump', a: .06, f: 1.6, bev: .25 }); bSc(mk(gSphH, st, -.35, .35, s * 1.2, 2.4, .95, 1.75, body), ST);   // stubby legs, big feet with stone toes
    for (let k = 0; k < 3; k++) bSc(mk(gSphM, stS, -1.45, .25, s * 1.2 + (k - 1) * .5, .52, .47, .47, body), { k: 'stone', a: .05, f: 2 });
    mk(gBlob, mo, -.2, 1.6, s * 1.6, .9, .7, .6, body); }
  rot(SB(pa, 0, 2.2, 0, 3.0, 1.15, 3.4, body, { dent: [[-1.5, 2.75, -1.6, .45, .2]] }), 0, .05, 0); rot(SB(bn, -.05, 3.15, 0, 3.3, .9, 3.7, body, { dent: [[1.6, 3.6, 1.85, .5, .22]] }), 0, -.05, 0);   // stacked slab belly, chipped corners
  SB(bn, -1.55, 2.3, -1.0, .6, .7, 1.1, body, { bev: .1 }); SB(bnS, 1.3, 3.55, 1.5, .7, .4, .6, body, { bev: .1 });     // loose blocks
  for (const [x, z] of [[-1.2, 1.72], [.4, 1.72], [1.0, -1.72]]) mk(gIco, BP('#8d8272', 0, .03), x, 1.95, z, .35, .3, .3, body);   // pebbles stuck in the slab
  { const ba = new THREE.Group(); ba.position.set(-1.72, 2.85, .5); ba.rotation.x = .55; body.add(ba);              // band-aid over a crack
    mk(gBox, BP('#e8d9b0', 3, .02), 0, 0, 0, .06, .4, 1.3, ba); mk(gBox, BP('#cdb07a', 3, 0), -.02, 0, 0, .06, .36, .4, ba); }
  for (const [y, z, r, l] of [[2.5, .2, .9, .8], [2.1, -.4, -.6, .6], [3.3, -.9, .3, .5]]) mk(gBox, crack, -1.56, y, z, .03, .05, l, body).rotation.x = r;
  const gash = [[-1.0, 6.3], [-.55, 5.7], [-.75, 5.2], [-.1, 4.6], [.35, 4.1]];                                        // a deep crack carved across the chest (camera side)
  SB(st, 0, 5.0, 0, 3.4, 2.9, 3.9, body, { a: .08, bev: .2, dent: [...gash.map(([x, y]) => [x, y, 1.95, .34, .2]), [1.7, 6.45, -1.95, .55, .3], [-1.75, 6.4, 1.95, .4, .2]] });   // chest block
  for (let i = 0; i < gash.length - 1; i++) { const [x0, y0] = gash[i], [x1, y1] = gash[i + 1]; mk(gBox, crack, (x0 + x1) / 2, (y0 + y1) / 2, 1.8, Math.hypot(x1 - x0, y1 - y0) + .05, .07, .05, body).rotation.z = Math.atan2(y1 - y0, x1 - x0); }
  for (const [x, y, r, l] of [[-.8, 5.6, .5, 1.1], [.3, 4.4, -.4, .9], [.9, 5.9, 1.1, .7]]) mk(gBox, BP('#5a4c40', 3, 0), x + .5, y, 1.93, l, .07, .03, body).rotation.z = r;   // carved rune lines (camera side)
  for (const [x, y] of [[-1.4, 6.2], [1.45, 3.95], [1.4, 6.25]]) SB(stS, x, y, 1.75, .5, .5, .5, body, { bev: .08, a: .04 });   // chipped corner stones
  const eg = new THREE.Group(); body.add(eg);                                                                         // glowing eyes: one mesh, one material (syncBoss dims it when dazed; glances in idle)
  for (const s of [1, -1]) {                                                                                         // carved angry face on the -x side: lopsided grinding brows, cheekbones, deep sockets
    bAn(rot(SB(dk, -1.85, s > 0 ? 6.08 : 5.98, s * .72, .52, .44, 1.45, body, { a: .05, f: 2, bev: .1 }), s * (s > 0 ? .55 : .36), 0, 0), s > 0 ? 2 : 3, .12);
    mk(gSphM, ch, -1.68, 5.4, s * .72, .62, .82, 1.0, body);                                                           // deep socket
    mk(gSphM, BP(C.eye, 3, 0), -1.82, 5.42, s * .72, .46, .6, .72, eg);
    bAn(mk(gSph, BP(C.ink, 3, 0), -2.05, 5.4, s * .72, .14, .22, .2, body), 5, 1);
    bAn(mk(gSph, BP('#fff2c0', 4, 0), -2.06, 5.58, s * .84, .08, .08, .08, body), 5, 1);                               // glint
    SB(stS, -1.84, 4.88, s * 1.15, .45, .32, .75, body, { bev: .08, a: .04 });                                         // cheekbones
    mk(gBox, crack, -1.72, 4.6, s * 1.3, .03, .4, .05, body).rotation.x = s * .5; }                                  // cheek cracks
  SB(st, -1.85, 4.85, 0, .42, .55, .55, body, { bev: .08, a: .03 }); SB(stS, -2.0, 4.65, 0, .3, .2, .5, body, { bev: .06, a: .02 });   // nose
  mk(gBox, ch, -1.72, 4.2, 0, .24, .66, 2.2, body); mk(gBox, BP('#4a2c22', 3, 0), -1.76, 4.0, 0, .2, .2, 1.8, body);  // mouth + dark gum
  for (const z of [.6, -.6]) mk(gCone, fang, -1.86, 4.05, z, .26, z > 0 ? .55 : .3, .26, body);                       // fangs up (one broken)
  for (const z of [.25, -.25, .95, -.95]) mk(gCone, fang, -1.86, 4.38, z, .17, .3, .17, body).rotation.z = Math.PI;
  for (const [x, z, l] of [[-1.72, 1.4, .9], [-1.72, -.2, .6], [-1.0, 1.96, .8], [.5, -1.96, .7], [.9, 1.96, .55]]) mk(capG(.1, l), oc, x, 3.6 - l / 2, z, 1, 1, 1, body);   // ochre mud drips
  for (const s of [1, -1]) { bAn(bSc(mk(gBlob, mo, 0, 6.5, s * 1.85, 1.9, .9, 1.4, body), { k: 'bump', a: .1, f: 2.5 }), 1, .03);   // mossy shoulders, hanging moss
    for (const dx of [-.6, .4, -.1]) mk(capG(.12, .5 + (dx + .6) * .3), moS, dx, 5.85, s * 2.05, 1, 1, 1, body); }
  SB(pa, 0, 7.25, 0, 2.6, 1.6, 2.9, body, { dent: [[1.25, 8.0, 1.4, .55, .3]] }); mk(gBox, crack, -1.31, 7.25, .2, .03, 1.5, .05, body);   // head slab (a corner knocked off) + seam
  SB(bn, -.2, 7.0, -1.0, 2.2, .8, .95, body, { bev: .12 }); mk(gBlob, mo, -.6, 7.8, 1.2, 1.1, .5, .7, body);
  rot(bSc(mk(gConeH, st, -.3, 8.55, -1.05, .55, 1.1, .55, body), ST), -.45, 0, .15);                                   // stone horns: one whole,
  rot(bSc(mk(gConeH, st, -.3, 8.3, 1.05, .6, .55, .6, body), { k: 'stone', a: .06, f: 1.6, dent: [[-.3, 8.62, 1.05, .32, .14]] }), .4, 0, .15);   // one snapped off
  mk(capG(.1, .55), oc, -1.3, 6.85, -.6, 1, 1, 1, body);
  mk(gCyl, BP(C.dk, 1, .03), 0, 8.1, 0, 2.3, .16, 2.5, body);                                                          // soil on top
  h.core = new THREE.Group(); h.core.position.set(-.2, 8.15, .1); body.add(h.core);                                  // the sapling (sways; replaces the old gold core)
  { const stem = BP('#7a5a38', 1, .025), lf = BP('#5fa04a', 2, .025); rot(mk(capG(.07, .9), stem, 0, .5, 0, 1, 1, 1, h.core), 0, 0, .12);
    rot(mk(gSph, lf, -.35, 1.05, .25, .75, .1, .4, h.core), .3, .4, .5); rot(mk(gSph, lf, .35, 1.15, -.2, .8, .1, .42, h.core), -.3, .4, -.5); mk(gSph, lf, 0, 1.05, 0, .35, .25, .3, h.core); }
  bossBake(h.core, mat, own, null, ink);
  // arms hang behind the face (pivot x +.85, z 2.75): from the game camera the near fist used to cover the face. Visual only, the slam logic is unchanged.
  h.arms = [1, -1].map(s => { const a = new THREE.Group(); a.position.set(.85, 5.3, s * 2.75); body.add(a); bSc(mk(gSphM, cl, 0, 0, 0, 1.3, 1.3, 1.3, a), { k: 'bump', a: .06, f: 2 });
    bSc(mk(capH(.55, 2.2), cl, 0, -1.7, 0, 1, 1, 1, a), { k: 'bump', a: .06, f: 1.8 }); for (const y of [-1.2, -2.2]) mk(gCyl, BP(C.dk, 1, .02), 0, y, 0, 1.2, .14, 1.2, a);   // clay arm with mud bands
    bSc(mk(gSphH, st, 0, -3.35, 0, 2.0, 1.8, 2.0, a), { k: 'stone', a: .1, f: 1.2 });                                  // boulder fists
    for (let k = 0; k < 4; k++) bSc(mk(gSphM, stS, -.82, -2.85 - k * .1, (k - 1.5) * .42, .5, .44, .42, a), { k: 'stone', a: .04, f: 2.5 });   // knuckles
    mk(gBlob, moS, .2, .55, 0, .9, .45, .9, a);
    bossBake(a, mat, own, null, ink); return a; });
  h.eyes = [bossBake(eg, reg(new THREE.MeshStandardMaterial({ color: C.eye, emissive: C.eye, emissiveIntensity: 1.2, roughness: .4 })), own)];
  h.eyes[0].castShadow = false; bossBake(body, mat, own, [h.core, eg, ...h.arms], ink);
  const U = mat.userData.U; h.an = U; h.idSeed = 3.3; h.dart = [0, 0]; h.look = (x, y) => { U.uDt.value.set(0, y * .06, x * .08); h.eyes[0].position.set(0, y * .03, x * .04); };
  return h;
}

/* ======================= per-room scene =======================
   Room geometry: ground plane (vertex colours + gentle displacement outside the lane), strata dirt box, back bank with hills, instanced foliage. */
const roomGroup = new THREE.Group(); scene.add(roomGroup);
const pl = buildHero(); pl.root.visible = false; scene.add(pl.root);
// physical shield (plan items 1-3, 8, 9). Look (Michael t31u): something a robot would build from scrap. Built in code (no art file):
// mismatched steel / rust / galvanized plates (one instanced mesh), hex bolts, a bent uneven hoop, a pipe-cap boss and weld beads.
// It hangs on the hero's back, swings round his right side to the front when he blocks, and lies on the ground when dropped.
// A tight cool glow runs along the bent hoop and the weld beads, plus a ring card behind; its brightness follows his stamina
// (TUNE.GLOW_MIN at empty .. GLOW_MAX at full). Look only: no gameplay number lives here. About 8 draw calls, low poly (fine on ?q=low).
function buildShield() {
  const root = new THREE.Group(), face = new THREE.Group(); root.add(face);       // the face points along local +x
  const glowM = reg(new THREE.MeshStandardMaterial({ color: '#8b9096', emissive: '#9fe3ff', emissiveIntensity: 1, roughness: .45, metalness: .5, flatShading: true }));
  const dm = new THREE.Object3D(), inst = (geo, mat, list, colors, shadow) => {   // list: [x, y, z, sx, sy, sz, rx, ry, rz]
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => { dm.position.set(t[0], t[1], t[2]); dm.scale.set(t[3], t[4], t[5]); dm.rotation.set(t[6] || 0, t[7] || 0, t[8] || 0); dm.updateMatrix(); m.setMatrixAt(i, dm.matrix); if (colors) m.setColorAt(i, new THREE.Color(colors[i])); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.castShadow = m.receiveShadow = !!shadow; face.add(m); return m; };
  // scrap plates: different metals, a little crooked, stacked at slightly different depths so they overlap like patches
  const plates = [
    [0,    0,    0,    .07, .84, .74,  0,   0,   0  ],   // backing sheet (worn steel)
    [.03,  .25, -.23,  .05, .46, .44,  .14, .04, 0  ],   // rusty patch, upper left
    [.034,-.25,  .22,  .05, .48, .44, -.1, -.03, .03],   // dark steel, lower right
    [.027, .28,  .24,  .04, .36, .38, -.2,  0,  -.04],   // galvanized scrap, upper right
    [.032,-.27, -.21,  .045,.42, .4,   .09, .03, .02],   // orange rust, lower left
    [.052, .01,  .0,   .03, .13, .92,  .05, 0,   0  ]];  // steel bar riveted across the middle
  inst(gBox, reg(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .62, metalness: .18, flatShading: true })), plates,
    ['#9aa1a8', '#b05a30', '#6d747b', '#c9c4ae', '#cf7536', '#7f878e'], true);
  // hex bolts / rivets on the plate corners and along the bar
  const boltG = new THREE.CylinderGeometry(.034, .038, .03, 6); boltG.rotateZ(Math.PI / 2);
  const bolts = [[.07, .44, -.4], [.07, .07, -.06], [.068, .45, .07], [.07, .1, .4], [.075, -.06, -.07], [.074, -.44, .41], [.075, -.08, .41],
    [.066, -.45, -.38], [.066, -.1, -.39], [.075, .02, -.36], [.075, .02, .36], [.075, .02, .12], [.075, .02, -.12], [.06, .43, -.03]];
  inst(boltG, MS('#5d6266', .45, .35, 0, true), bolts.map(b => [b[0], b[1], b[2], 1, 1, 1, (b[1] * 7 + b[2] * 5) % 1]), null, false);
  // weld beads along two seams (they carry the stamina glow)
  const beadG = new THREE.SphereGeometry(.5, 6, 4), beads = [];
  for (let i = 0; i < 7; i++) beads.push([.05, -.02 - i * .062, .015 + Math.sin(i * 2.3) * .02, .05, .045, .07, 0, 0, i * .7]);   // vertical seam, lower half
  for (let i = 0; i < 6; i++) beads.push([.045, .07 + Math.sin(i * 1.9) * .015, -.38 + i * .062, .045, .07, .05, 0, 0, i * .9]); // short seam, upper left
  inst(beadG, glowM, beads, null, false);
  // bent hoop: a 9-sided square-section ring, pushed in and out and bowed so it looks hammered from scrap
  const rimG = new THREE.TorusGeometry(.58, .045, 4, 9); rimG.rotateY(Math.PI / 2); rimG.rotateX(.2);
  { const pa = rimG.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const a = Math.atan2(v.y, v.z), f = 1 + .055 * Math.sin(3 * a + 1) + .03 * Math.sin(5 * a + 2);
      pa.setXYZ(i, v.x + .04 * Math.sin(2 * a + .5), v.y * f, v.z * f); }
    rimG.computeVertexNormals(); }
  mk(rimG, glowM, .01, 0, 0, 1, 1, 1, face, true);
  // pipe-cap boss with a brass nut, and a pipe handle on the back
  const capGeo = new THREE.CylinderGeometry(.13, .16, .07, 8); capGeo.rotateZ(-Math.PI / 2);
  mk(capGeo, MS('#565b60', .45, .35, 0, true), .085, .01, 0, 1, 1, 1, face, true);
  mk(boltG, MS('#d39a4a', .4, .35, 0, true), .13, .01, 0, 1.6, 1.6, 1.6, face, true).rotation.x = .3;
  mk(gBox, MS('#2e2b28', .6, .5), -.07, 0, 0, .04, .5, .07, face, true);
  // tight glow: a ring-shaped glow card just behind the plates, so it hugs the hoop (texRing peaks at the hoop radius)
  const texRing = mkTex(64, 64, (c, w) => { const r = c.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(.58, 'rgba(255,255,255,0)'); r.addColorStop(.72, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, w, w); });
  const haloM = reg(new THREE.MeshBasicMaterial({ map: texRing, color: '#9fe3ff', transparent: true, opacity: .6, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const halo = new THREE.Mesh(gQuad, haloM); halo.rotation.y = Math.PI / 2; halo.position.x = -.06; halo.scale.set(1.7, 1.7, 1); halo.renderOrder = 5; face.add(halo);
  return { root, face, glowM, haloM, halo };
}
const shield = buildShield(); pl.bod.add(shield.root);
// buddy companion: the picked buddy drawing (art/buddy.webp) on an upright quad that turns to the camera and trails the hero.
// Visual only (no gameplay effect). Not shown when the page is opened from file://, where browsers block image upload to WebGL.
const BUDDY_H = 1.9, BUDDY_W = BUDDY_H * 247 / 320, BUDDY_ART_FACE = -1;   // the drawing's 3/4 view looks to the viewer's left
const buddyGeo = new THREE.PlaneGeometry(1, 1); buddyGeo.translate(0, .5, 0);   // origin at the feet
const buddyMat = reg(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, alphaTest: .5, side: THREE.DoubleSide, fog: false, toneMapped: false }));
const buddy = { root: new THREE.Group(), mesh: new THREE.Mesh(buddyGeo, buddyMat), on: false, init: false, x: 0, y: 0, face: 1, ph: 0 };
buddy.root.add(buddy.mesh); buddy.root.visible = false; scene.add(buddy.root);
if (location.protocol !== 'file:') { const im = new Image(); im.onload = () => { const t = new THREE.CanvasTexture(im); t.colorSpace = THREE.SRGBColorSpace; buddyMat.map = t; buddyMat.needsUpdate = true; buddy.on = true; }; im.src = 'art/buddy.webp'; }
function syncBuddy(p, dt) {
  const b = buddy; if (!b.on || !p || G.state === 'title') { b.root.visible = false; b.init = false; return; }
  const tx = X(p.x) - p.face * 1.9, ty = Math.max(0, Y(p.y)) * .55;   // a step behind the hero; half-height hops when the hero jumps
  if (!b.init || Math.abs(tx - b.x) > 8) { b.x = tx; b.y = ty; b.init = true; }   // first frame, respawn or room change: appear in place
  b.x = hold(b.x, tx, dt, 3.2); b.y = hold(b.y, ty, dt, 5);
  const gap = Math.abs(tx - b.x); b.ph += dt * (5 + gap * 4);
  if (gap > .25) b.face = tx > b.x ? 1 : -1; else b.face = p.face;
  const hop = b.y < .05 ? Math.abs(Math.sin(b.ph)) * Math.min(.3, gap * .3) : 0, br = 1 + Math.sin(VT * 2.6) * .025;
  b.root.visible = true; b.root.position.set(b.x, b.y + hop, -.7);
  b.root.rotation.y = Math.atan2(camera.position.x - b.x, camera.position.z + .7);
  b.mesh.scale.set(BUDDY_W * b.face * BUDDY_ART_FACE, BUDDY_H * br, 1);
}
pl.sq = 0; pl.tailB = 0; pl.dustT = 0; pl.wasAir = false; pl.wasGround = true; pl.vyMax = 0; pl.wasDead = false; pl.lastInv = 0; pl.lastLives = -1; pl.lastRoom = -1; pl.runPh = 0; pl.hurtT = 0; pl.smokeT = 0; pl.lid = .13; pl.slant = 0;
const Z_BACK = -6, Z_FRONT = 9;
const frontH = (x, z) => { const m = z >= 0 ? sstep(2.4, 4.4, z) * (1 - sstep(7.4, Z_FRONT, z)) : sstep(2.4, 4.4, -z) * (1 - sstep(4.2, -Z_BACK, -z)); return m * (.15 + fbm(x * .33, z * .33) * .75); };
const bankH = (x, z) => sstep(6, 16, -z) * (fbm(x * .16, z * .16) * 3.6 - .3);
const TAU = Math.PI * 2;
function groundTop(x0, x1, poolsPx) {
  const w = x1 - x0, g = new THREE.PlaneGeometry(w, Z_FRONT - Z_BACK, Math.max(1, Math.ceil(w / 1.3)), 26); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), pth = new Float32Array(p.count), cx = (x0 + x1) / 2, cz = (Z_BACK + Z_FRONT) / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx, z = p.getZ(i) + cz; let pm = 0; for (const q of poolsPx) pm = Math.max(pm, 1 - sstep(.5, 1.5, Math.max(q[0] - x, x - q[1], 0)));
    const ef = sstep(0, .9, x - x0) * sstep(0, .9, x1 - x), y = .03 + frontH(x, z) * ef * (1 - pm);
    p.setXYZ(i, x, y, z);
    const n = fbm(x * .22, z * .22), n2 = vn(x * 1.9, z * 1.9), az = Math.abs(z), pw = 1 - sstep(1.5, 2.5 + (n2 - .5) * 1.3, az);
    _c.set('#2f7a3f').lerp(_c2.set('#5ba84e'), sstep(.25, .8, n)).lerp(_c2.set('#8dbb5a'), sstep(.62, .95, n2) * .25).lerp(_c2.set('#1f5a38'), sstep(3, 8, z < 0 ? -z * 1.4 : z * .35) * .5);
    _c.lerp(_c2.set('#b69661').lerp(_c.set('#9d7b4a'), n2 * .5), pw * .9); pth[i] = pw;
    if (ef < 1) _c.multiplyScalar(.6 + .4 * ef);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aPath', new THREE.BufferAttribute(pth, 1)); g.computeVertexNormals(); return g;
}
function dirtBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / 2)), 4, 1);
  return paintVC(g, (x, y, z) => { const band = .8 + .2 * Math.sin((y + h / 2) * 3.3 + vn(x * .4, y) * 5), s = lerp(1, .22, sstep(0, 5.6, -(y - h / 2))) * band * (.88 + .24 * vn(x * 1.2, y * 2)); return [s * 1.05, s * .92, s * .85]; });
}
function bankGeo() {
  const g = new THREE.PlaneGeometry(76, 38, 46, 24); g.rotateX(-Math.PI / 2); const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 16, z = p.getZ(i) - 25; p.setXYZ(i, x, bankH(x, z), z);
    const n = fbm(x * .2, z * .2); _c.set('#256a3c').lerp(_c2.set('#4f9a4e'), sstep(.3, .85, n)).lerp(_c2.set('#17432e'), sstep(10, 30, -z) * .6); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
const TRUNK_COL = ['#7a5a3c', '#6b4f38', '#85664a', '#5e4a38'], LEAF_COL = ['#2f7a3f', '#3d8f45', '#256a48', '#5aa347', '#2c7a58', '#4a9a3c'];
function instFrom(list, geo, mat, R, v, cast) {
  if (!list.length) return null; const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((o, i) => { _o.position.set(o.x, o.y, o.z); _o.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); _o.scale.set(o.sx, o.sy === undefined ? o.sx : o.sy, o.sz === undefined ? o.sx : o.sz); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); m.setColorAt(i, _c.set(o.c || '#ffffff')); });
  m.castShadow = !!cast; m.receiveShadow = true; R.add(m); v.own.push(m); return m;
}
let view = null, builtKey = '', forceRebuild = false;
function disposeView() { if (!view) return; for (const o of view.own) { o.dispose(); if (o.isMaterial) allMats.delete(o); } }   // per-room geometry, instanced meshes and materials
function buildRoom(room) {
  disposeView(); roomGroup.clear();
  const R = roomGroup, q = QL(), v = { vines: [], snaps: [], logs: [], crawlers: [], gem: null, bubbles: [], tarFlag: room.holeKind === 'tar', own: [], pools: {}, bev: {}, qi: Qi, rays: [], gemGot: G.got.has(gid(room.i)) };
  const rr = mulberry(hash(G.seed + '|deco|' + room.i)), rt = mulberry(hash(G.seed + '|trees|' + room.i)), rd = mulberry(hash(G.seed + '|decor|' + room.i));
  const poolsPx = room.pools.map(pp => [X(pp.x0), X(pp.x1)]), holesU = room.holes.map(h => [X(h.x0), X(h.x1)]);
  const nearHole = (x, m) => holesU.some(h => x > h[0] - m && x < h[1] + m), nearPool = (x, m) => poolsPx.some(h => x > h[0] - m && x < h[1] + m);
  const groundY = (x, z) => z < -6 ? bankH(x, z) : frontH(x, z) * (nearPool(x, 1) ? 0 : 1) + .03;
  // ground in solid runs (holes cut out), extended past the room edges so the chase camera never sees the end of the world
  const cuts = room.holes.map(h => [h.x0, h.x1]).sort((a, b) => a[0] - b[0]);
  let cur = -160; const runs = [];
  for (const c of cuts) { runs.push([cur, c[0]]); cur = c[1]; } runs.push([cur, 480]);
  for (const [a, b] of runs) {
    const w = (b - a) * S, cx = X((a + b) / 2), g1 = dirtBox(w, 5.6, Z_FRONT - Z_BACK), g2 = groundTop(X(a), X(b), poolsPx); v.own.push(g1, g2);
    mk(g1, AM.dirt, cx, -2.8, (Z_FRONT + Z_BACK) / 2, 1, 1, 1, R).receiveShadow = true;
    const top = mk(g2, AM.groundTop, 0, 0, 0, 1, 1, 1, R, true); top.receiveShadow = true;
  }
  { const g = bankGeo(), g1 = dirtBox(76, 5.6, 36); v.own.push(g, g1); mk(g, AM.bank, 0, 0, 0, 1, 1, 1, R, true).receiveShadow = true; mk(g1, AM.dirt, 16, -2.85, -24, 1, 1, 1, R, true); }
  for (const h of room.holes) {
    const w = (h.x1 - h.x0) * S, cx = X((h.x0 + h.x1) / 2);
    if (room.holeKind === 'tar') {
      mk(gFlat, M('#0d0907'), cx, -4.5, 3, w, 1, 15, R, true);
      const t = mk(gFlat, mats.tar, cx, -.18, 1.5, w, 1, Z_FRONT - Z_BACK, R, true); t.receiveShadow = true;
      for (let x = h.x0 + 8; x < h.x1 - 6; x += 14) { const b = mk(gSph, M('#4a3a30'), X(x), -.12, (rr() - .5) * 4, .5, .3, .5, R, true); v.bubbles.push(b); }
    } else mk(gFlat, M('#0d0907'), cx, -5.7, 1.5, w, 1, 15, R, true);
  }
  for (const pool of room.pools) {                                   // snapper pools: shimmering water, rim stones, jaws
    const pw = (pool.x1 - pool.x0) * S, pcx = X((pool.x0 + pool.x1) / 2);
    mk(gFlat, mats.water, pcx, .06, 0, pw + .2, 1, 5.6, R, true).receiveShadow = true;
    for (let k = 0; k < 7; k++) { const sx = pcx + (rr() - .5) * (pw + 1), sz = (rr() < .5 ? -1 : 1) * (2.9 + rr() * .5); mk(gRock, AM.rim, sx, .1, sz, .8 + rr() * .9, .8 + rr() * .5, .7 + rr() * .6, R); }
    const w = pw / pool.n;
    for (let k = 0; k < pool.n; k++) { const sn = buildSnapper(w); sn.root.position.x = X(pool.x0) + (k + .5) * w; R.add(sn.root); v.snaps.push({ jaw: sn.jaw, pa: sn.pa, pb: sn.pb, pool, k }); }
  }
  const leafCard = matCache.leafCard || (matCache.leafCard = reg(new THREE.MeshLambertMaterial({ color: '#8fc04a', side: THREE.DoubleSide }))), vineMat = M(P.vine), knobMat = M('#8a5a30');
  for (const vn_ of room.vines) {
    const bx = X(vn_.ax), by = Y(VINE_Y);
    rot(mk(capG(.42, 5.2), AM.barkBranch, bx, by + .4, 0, 1, 1, 1, R), Math.PI / 2, 0, 0);                              // branch the vine hangs from
    mk(gBlob, AM.canopy[0], bx, by + 1.3, -1, 4.6, 2.2, 3.2, R); mk(gBlob, AM.canopy[1], bx + 1.8, by + 1.1, .8, 3.0, 1.7, 2.4, R); mk(gBlob, AM.canopy[2], bx - 1.9, by + 1.4, -.6, 3.2, 1.9, 2.6, R);
    const seg = new THREE.InstancedMesh(gCyl, vineMat, 9); seg.castShadow = true; seg.frustumCulled = false; R.add(seg); v.own.push(seg);
    const knob = mk(gSph, knobMat, 0, 0, 0, .65, .65, .65, R); const leaves = [.25, .45, .65, .85].map(s => ({ s, m: mk(gLeafCard, leafCard, 0, 0, 0, .9, .55, .9, R, true) }));
    v.vines.push({ vn: vn_, seg, knob, leaves });
  }
  // ---- trees (instanced): trunk + layered crowns + side branch clusters; room trees stand behind the lane, extra far trees fade into the fog ----
  const trunks = [], crowns = [], branches = [];
  const tree = (x, z, d, hgt, ci) => {
    const gy = groundY(x, z) - .2; trunks.push({ x, y: gy, z, sx: d, sy: hgt, sz: d, ry: rt() * TAU, c: TRUNK_COL[ci % 4] });
    const top = gy + hgt, lc = k => LEAF_COL[(ci + k) % LEAF_COL.length];
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + rt() * .8, r = d * (1.3 + rt() * 1.2); crowns.push({ x: x + Math.cos(a) * r, y: top - .6 + rt() * 1.8, z: z + Math.sin(a) * r * .8, sx: d * (3.2 + rt() * 1.4), sy: 2.4 + rt() * .9, sz: d * (3.2 + rt() * 1.4), ry: rt() * 6, c: lc(k) }); }
    crowns.push({ x, y: top + 1.2, z, sx: d * 3.6, sy: 2.6, sz: d * 3.6, ry: rt() * 6, c: lc(5) });
    for (const s of [-1, 1]) { const by = gy + hgt * (.55 + rt() * .2), len = d * (2.2 + rt() * 1.5); branches.push({ x: x + s * len * .5, y: by + len * .25, z, sx: .5 * d + .25, sy: len * 1.1, sz: .5 * d + .25, rz: -s * 1.05, c: TRUNK_COL[ci % 4] });
      crowns.push({ x: x + s * len * 1.05, y: by + len * .55 + .4, z: z + rt() - .5, sx: d * 2.4 + 1.2, sy: 1.8 + rt(), sz: d * 2.4 + 1.2, ry: rt() * 6, c: lc(s + 2) }); }
  };
  room.trees.forEach((t, k) => tree(X(t.x + t.w / 2), -7.5 - k * 1.6 - rr() * 1.5, t.w * S * .95, 16, t.c * 2 + k));
  for (let k = 0; k < 14; k++) tree(-12 + rr() * 56, -16 - rr() * 22, 1 + rr() * 1.4, 17, Math.floor(rr() * 4));
  for (let k = 0; k < q.far; k++) tree(-10 + rt() * 52, -9.5 - rt() * 7, .8 + rt() * .9, 13 + rt() * 4, Math.floor(rt() * 4));      // extra mid-ground trees (visual only)
  if (room.i === 0) trunks.push({ x: -1.4, y: -.2, z: 0, sx: 2.8, sy: 18, sz: 2.8, c: TRUNK_COL[0] });                  // outer walls: big trunks
  if (room.i === ROOMS - 1) trunks.push({ x: 33.4, y: -.2, z: 0, sx: 2.8, sy: 18, sz: 2.8, c: TRUNK_COL[0] });
  instFrom(trunks, gTrunk, AM.bark, R, v, true); instFrom(crowns, gBlob, mats.leaf, R, v, true); instFrom(branches, gCyl, AM.barkPlain, R, v, true);
  // far silhouettes (hills in the haze)
  const hills = []; for (let k = 0; k < 9; k++) hills.push({ x: -16 + k * 8.5 + rd() * 4, y: 2 + rd() * 5, z: -52 - rd() * 20, sx: 26 + rd() * 20, sy: 10 + rd() * 12, sz: 16, c: rd() < .5 ? '#3f7f6a' : '#4a8a6a' });
  instFrom(hills, gBlob, MV('#ffffff'), R, v, false);
  // ground cover: grass tufts, ferns, flowers, rocks, pebbles (all instanced; counts depend on quality)
  const grass = [], ferns = [], flowers = [], rocks = [], pebbles = [], FL = ['#f0b6c8', '#f3e18a', '#ffffff', '#f0956a'];
  const okPos = (x, z) => !nearHole(x, .5) && !(z > -2.2 && z < 3.4);
  for (let k = 0, n = 0; n < q.grass && k < q.grass * 4; k++) { const x = -7 + rd() * 46, z = -5.6 + rd() * 14.2; if (!okPos(x, z)) continue; n++;
    grass.push({ x, y: groundY(x, z) - .02, z, sx: .8 + rd() * .8, sy: (.7 + rd() * 1.1) * (z > 0 ? .55 : 1), sz: .8 + rd() * .8, ry: rd() * 6, c: rd() < .25 ? '#c4d86a' : rd() < .5 ? '#88c860' : '#5cae52' }); }
  for (let k = 0, n = 0; n < q.fern && k < q.fern * 4; k++) { const x = -7 + rd() * 46, z = rd() < .5 ? -6 - rd() * 7 : 5.5 + rd() * 3.5; if (nearHole(x, .5) && z > -6) continue; n++;
    ferns.push({ x, y: groundY(x, z) - .02, z, sx: 1.1 + rd() * 1.2, sy: .9 + rd() * 1.0, sz: 1.1 + rd() * 1.2, ry: rd() * 6, c: rd() < .5 ? '#4fa04c' : '#2f8a4a' }); }
  for (let k = 0, n = 0; n < q.flower && k < q.flower * 4; k++) { const x = -7 + rd() * 46, z = 2.5 + rd() * 6; if (nearHole(x, .5) || nearPool(x, 0)) continue; n++; const hh = .35 + rd() * .3;
    flowers.push({ x, y: groundY(x, z) + hh, z, sx: .17 + rd() * .08, sy: .12, sz: .17 + rd() * .08, c: FL[Math.floor(rd() * 4)] }); }
  for (let k = 0, n = 0; n < q.rock && k < q.rock * 4; k++) { const x = -7 + rd() * 46, z = rd() < .6 ? 4.5 + rd() * 4.5 : -6 - rd() * 6; if (nearHole(x, .8) || nearPool(x, 0)) continue; n++; const s = .5 + rd() * 1.4;
    rocks.push({ x, y: groundY(x, z) + s * .18, z, sx: s * 1.3, sy: s * (.7 + rd() * .5), sz: s * 1.1, ry: rd() * 6, c: rd() < .4 ? '#8a8174' : rd() < .5 ? '#6f7a6a' : '#9a8f7e' }); }
  for (let k = 0, n = 0; n < q.pebble && k < q.pebble * 4; k++) { const x = -7 + rd() * 46, z = (rd() - .5) * 4.4; if (nearHole(x, .5) || nearPool(x, .3)) continue; n++; const s = .12 + rd() * .2;
    pebbles.push({ x, y: .03 + s * .2, z, sx: s * 1.2, sy: s * .7, sz: s, ry: rd() * 6, c: rd() < .5 ? '#a89a80' : '#8b8070' }); }
  instFrom(grass, gTuft, mats.grass, R, v, false); instFrom(ferns, gFern, mats.fern, R, v, false);
  instFrom(flowers, gIco, M('#ffffff'), R, v, false); instFrom(rocks, gRock, AM.stone, R, v, true); instFrom(pebbles, gRock, AM.stone, R, v, false);
  // hanging lianas from the canopy (sway in the wind)
  const lians = []; for (let k = 0; k < q.lian; k++) { const x = -6 + rd() * 44, len = 5 + rd() * 8; lians.push({ x, y: 18, z: -5.5 - rd() * 3, sx: .16 + rd() * .1, sy: len, sz: .16 + rd() * .1, c: rd() < .5 ? '#3f7a3a' : '#5c9a3e' }); }
  instFrom(lians, gLian, mats.lian, R, v, false);
  // foreground bushes in front of the lane
  for (let k = 0; k < 8; k++) { const x = -6 + rr() * 44, z = 7.5 + rr() * 1.4; mk(gBlob, MV(rr() < .5 ? '#2f8a4a' : '#3d7f5c', true), x, .35, z, 2 + rr() * 1.6, 1.2 + rr(), 1.6, R); }
  if (room.treasure) { const t = room.treasure, gem = buildGem(t.kind); gem.root.position.set(X(t.x), Y(t.y), 0); R.add(gem.root, gem.halo, ...gem.stars); gem.root.userData.id = gid(room.i); gem.t = t; v.gem = gem; v.own.push(gem.core.material); }
  // sunlit god-ray cards (additive, slowly breathing) and drifting motes
  for (let k = 0; k < q.rays; k++) { const m = new THREE.Mesh(gQuad, new THREE.MeshBasicMaterial({ map: texRay, transparent: true, opacity: .2, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.renderOrder = 3;
    m.userData = { ox: -15 + k * (30 / Math.max(1, q.rays - 1)) + (rd() - .5) * 3, oz: -3.5 - rd() * 8, w: 2.2 + rd() * 3, ph: rd() * 6, base: .1 + rd() * .1 }; R.add(m); v.rays.push(m); v.own.push(m.material); }
  if (q.motes) { const mm = new THREE.InstancedMesh(gQuad, matCache.motes || (matCache.motes = reg(new THREE.MeshBasicMaterial({ map: texGlow, color: '#ffeab0', transparent: true, opacity: .55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }))), q.motes); mm.frustumCulled = false; mm.renderOrder = 4; R.add(mm); v.own.push(mm);
    v.motes = { mesh: mm, d: Array.from({ length: q.motes }, () => ({ x: rd() * 34 - 17, y: 1 + rd() * 9, z: -6 + rd() * 12, p: rd() * 6, s: .08 + rd() * .1 })) }; }
  if (BOSS_DEF[room.kind]) buildBossModel(room, R, v);
  view = v;
}
function ensureLog(i) {
  while (view.logs.length <= i) { const l = buildLog(); roomGroup.add(l.root); view.logs.push(l); l.root.traverse(o => { if (o.userData && o.userData.blob) o.visible = !QL().shadows; }); }
}
function ensureCrawlers(n) {
  while (view.crawlers.length < n) { const c = buildCrawler(); roomGroup.add(c.root); c.root.traverse(o => { if (o.userData && o.userData.blob) o.visible = !QL().shadows; }); view.crawlers.push(c); }
}

/* ---- boss models + per-frame sync ---- */
function buildBossModel(room, R, v) {
  const mkGate = x => { const gr = new THREE.Group(); gr.position.set(x, 0, 0); R.add(gr);
    for (let k = 0; k < 5; k++) { const z = -2.4 + k * 1.2, hh = 11 + (k % 2) * 1.4; mk(gTrunk, MV('#8a5a30'), 0, -.2, z, 1.3, hh, 1.3, gr); mk(gCone, M('#7a4a26'), 0, hh - .2 + .7, z, 1.3, 1.5, 1.3, gr); }
    [3, 8].forEach(y => mk(gBox, M('#3f2616'), 0, y, 0, 1.5, .4, 6.2, gr));
    return gr; };
  v.gates = [mkGate(X(1)), mkGate(X(W - 1))];
  const wk = new THREE.Group(); R.add(wk); mk(gOct, MS('#ffb347', .3, .2, '#ff8a30', true), 0, 0, 0, 1.1, 1.6, 1.1, wk); wk.visible = false; v.weak = wk;
  v.weakHalo = new THREE.Mesh(gQuad, new THREE.MeshBasicMaterial({ map: texGlow, color: '#ffb347', transparent: true, opacity: .6, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); v.weakHalo.scale.set(4.5, 4.5, 1); v.weakHalo.renderOrder = 4; v.weakHalo.visible = false; R.add(v.weakHalo); v.own.push(v.weakHalo.material);
  const mkMark = () => { const m = new THREE.Group(); const d = mk(gDisc, MB('#d9534f', .5), 0, .09, 0, 1, 1, 1, m, true); const r = mk(gRing, MB('#ff7a5a', .9), 0, .1, 0, 1.0, 1, 1.0, m, true); m.visible = false; m.disc = d; R.add(m); return m; };
  v.mark = mkMark();
  const g = new THREE.Group(); R.add(g); const bm = { kind: room.kind, g, skins: [] };
  if (room.kind === 'boss1') {
    mk(gFlat, mats.mire, X(160), .07, 0, 21, 1, 8.4, R, true).receiveShadow = true;                                    // the mire
    Object.assign(bm, buildBoss1(g, bm.skins, v.own));
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, x = X(160) + Math.cos(a) * 11.5, z = Math.sin(a) * 4.8; mk(gRock, AM.bossRock, x, .15, z, 1.2 + (k % 3) * .4, 1.0, 1.0, R); }
  } else if (room.kind === 'boss2') Object.assign(bm, buildBoss2(g, bm.skins, v.own));
  else Object.assign(bm, buildBoss3(g, bm.skins, v.own));
  g.traverse(o => { if (o.isMesh) { o.userData.bossPart = true; } });
  v.own.push(...bm.skins); if (bm.eyes) for (const e of bm.eyes) v.own.push(e.material);
  bm.g = g; v.bm = bm;
}
function pget(key, i, mkf) { const a = view.pools[key] || (view.pools[key] = []); while (a.length <= i) { const m = mkf(); roomGroup.add(m); a.push(m); } return a[i]; }

const _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _vD = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const qprev = new WeakMap(); let VT = 0;
function flashSkins(bm, b, tele) {
  const f = b.flash > 0 ? (Math.floor(VT * 22) % 2 ? .85 : .35) : 0, t = tele ? (.5 + .5 * Math.sin(VT * 18)) * .3 : 0;
  for (const m of bm.skins) m.emissive.setRGB(f + t * 1.0, f * .85 + t * .08, f * .7 + t * .04);
}
function bossFx(b, bev, prev) {
  const bx = X(b.x);
  if (bev.hp !== undefined && b.hp < bev.hp) { const y = b.kind === 'boss2' ? Y(b.y) : b.kind === 'boss1' ? b.h * S + 3.5 : b.h * S * .6 + 2; fxBurst(bx, y, 16, '#ffd37a', 7); fxSpark(bx, y, 10, '#ffffff', 9, .8); addShake(.55); }
  bev.hp = b.hp;
  if (prev !== undefined && prev !== b.state) {
    if (b.kind === 'boss1' && b.state === 'lunge') { fxMud(X(b.cx), .2, 20, 9); fxDust(X(b.cx), .1, 8, 4, 3, '#5a4630'); addShake(.4); }
    else if (b.kind === 'boss1' && b.state === 'spit') fxMud(X(b.cx), 3, 8, 6);
    else if (b.kind === 'boss2' && b.state === 'land') { fxDust(bx, Y(b.y) - 2, 18, 7, 2.5); addShake(.5); }
    else if (b.kind === 'boss2' && b.state === 'swoop') fxDust(bx, Y(b.y), 6, 3, 1, '#d8e8c0');
    else if (b.kind === 'boss3' && b.state === 'dazed') { fxDust(bx - 3, .1, 14, 9, 3); fxDust(bx + 3, .1, 14, 9, 3); fxMud(bx, 1, 6, 6, '#7a5233'); addShake(.85); }
    else if (b.kind === 'boss3' && b.state === 'volley') fxMud(bx - 2.2, 4.5, 8, 5, '#8a5a30');
    else if (b.state === 'dying') { const y = b.kind === 'boss2' ? Y(b.y) : b.kind === 'boss1' ? b.h * S + 3 : 5; fxBurst(bx, y, 30, '#ffd37a', 11); fxDust(bx, y, 14, 6, 4, '#d8c9a0'); addShake(1.0); }
  }
  bev.state = b.state;
}
function syncBoss() {
  const v = view; if (!v.bm) return;
  const b = G.rs && G.rs.boss, bm = v.bm, g = bm.g, p = G.p, used = {};
  const use = (key, mkf) => { const i = used[key] || 0; used[key] = i + 1; const m = pget(key, i, mkf); m.visible = true; return m; };
  const locked = isLocked(); v.gates.forEach(x => { x.visible = locked; });
  g.visible = !!b; v.weak.visible = false; v.weakHalo.visible = false; v.mark.visible = false;
  if (b) {
    const tele = ['tele', 'stele', 'btele', 'stel', 'vtele'].includes(b.state), sh = tele ? Math.sin(VT * 60) * .06 : 0;
    bossFx(b, v.bev, v.bev.state);
    flashSkins(bm, b, tele);
    const wk = (x, y) => { v.weak.visible = true; v.weak.position.set(x, y, 0); v.weak.rotation.y = VT * 3; v.weakHalo.visible = true; v.weakHalo.position.set(x, y, 1); v.weakHalo.quaternion.copy(camera.quaternion); const s = 4.2 + Math.sin(VT * 6) * .5; v.weakHalo.scale.set(s, s, 1); };
    if (b.kind === 'boss1') {
      g.position.set(X(b.x) + sh, (b.h - 50) * S, 0); g.rotation.y += ((p && p.x < b.x ? Math.PI : 0) - g.rotation.y) * .15;
      g.rotation.z = Math.sin(VT * 1.7) * .03; bm.jaw.rotation.z = -b.mouth * .9;
      const pm = tele ? M('#ff4a3a', '#c02818') : M('#2a1c13'); bm.pupils.forEach(x => { x.material = pm; });
      if (b.state === 'tele' || b.state === 'stele') { const q = 3.2 + Math.sin(VT * 12) * .5; v.mark.visible = true; v.mark.position.x = X(b.cx); v.mark.scale.set(q, 1, q); v.mark.disc.material.opacity = .35 + .25 * Math.sin(VT * 14); }
      if (b.state === 'stun') wk(X(b.x), b.h * S + 1.3 + Math.sin(VT * 5) * .2);
      if (b.state === 'sink' && b.h > 3 && Math.random() < .4) fxMud(X(b.x), .2, 1, 3);
    } else if (b.kind === 'boss2') {
      g.position.set(X(b.x) + sh, Y(b.y) + (b.state === 'hover' ? Math.sin(VT * 3) * .2 : Math.sin(VT * 2) * .06), 0);
      g.rotation.y += ((p && p.x < b.x ? Math.PI : 0) - g.rotation.y) * .12;
      const folded = b.state === 'rest' || b.state === 'land', fl = folded ? .15 : Math.sin(VT * (b.state === 'swoop' ? 22 : 12)) * .7;
      bm.wings[0].rotation.x = fl; bm.wings[1].rotation.x = -fl; g.rotation.z = b.state === 'swoop' ? -.35 : Math.sin(VT * 2.2) * .04;
      if (b.state === 'rest') wk(X(b.x), Y(b.y) + 2.4 + Math.sin(VT * 5) * .2);
    } else {
      bm.body.scale.y = Math.max(.05, b.h / 78) * (1 + Math.sin(VT * 2) * .008); g.position.set(X(b.x) + sh, 0, 0);
      const arm = b.state === 'stele' ? b.arm : (b.state === 'dazed' ? 0 : b.arm);
      bm.arms[0].rotation.z = bm.arms[1].rotation.z = -arm * 2.9 - (b.state === 'dazed' ? .5 : 0);
      const on = b.state !== 'dazed'; bm.eyes.forEach(x => { x.material.emissiveIntensity = on ? 1.1 + Math.sin(VT * 5) * .25 + (tele ? .8 : 0) : .04; x.material.color.set(on ? '#e09523' : '#33302c'); });
      bm.core.rotation.z = Math.sin(VT * 2.2) * .12 + (b.state === 'dazed' ? .35 : 0); bm.core.rotation.x = Math.sin(VT * 1.7) * .08;   // sapling sway
      if (b.state === 'stele') { const q = 1 + Math.sin(VT * 14) * .15; v.mark.visible = true; v.mark.position.x = X(b.x); v.mark.scale.set(7 * q, 1, 2.4 * q); v.mark.disc.material.opacity = .35 + .25 * Math.sin(VT * 14); }
      if (b.state === 'dazed') wk(X(b.x), b.h * S + 1.5 + Math.sin(VT * 5) * .2);
    }
    bossIdle(bm, b, tele);                                                                                          // idle face/breathing (visual only)
    if (b.state === 'dying') { const f = Math.max(.01, 1 - b.t / 1.4); g.scale.setScalar(f); g.position.y -= (1 - f) * 2; g.rotation.z = (1 - f) * .8; if (Math.random() < .5) fxBurst(g.position.x, g.position.y + 2, 1, '#ffd37a', 5); } else g.scale.setScalar(1);
    for (const q of b.proj) {
      if (q.t === 'ball' && b.kind === 'boss1') { const m = use('ball', () => { const gr = new THREE.Group(); mk(gSph, M('#5e3d25'), 0, 0, 0, 1.1, 1.0, 1.0, gr); mk(gSph, M('#46301d'), .3, .25, .2, .5, .5, .5, gr); mk(gSph, M('#46301d'), -.25, -.2, .3, .4, .4, .4, gr); return gr; }); m.position.set(X(q.x), Y(q.y), 0); m.rotation.z = VT * 8; if (Math.random() < .6) emit(poolN, X(q.x), Y(q.y), .3, rnd(-.5, .5), rnd(0, 1), 0, .45, .45, '#4a3322', 2, .5, .4); }
      else if (q.t === 'puddle') { const m = use('pud', () => { const gr = new THREE.Group(); mk(gDisc, mats.mire, 0, .1, 0, 2.6, 1, 2.6, gr, true); mk(gRing, MB('#7a5a38', .8), 0, .14, 0, 2.7, 1, 2.7, gr, true); return gr; }); m.position.set(X(q.x), 0, 0); const k = 1 + Math.sin(VT * 18) * .06; m.scale.set(k, 1, k);
        if (!qprev.has(q)) { qprev.set(q, 1); fxMud(X(q.x), .3, 10, 6); } }
      else if (q.t === 'ball') { const m = use('mball', () => { const gr = new THREE.Group(); mk(gSph, MS('#7a5233', .6, 0, '#ff8a30'), 0, 0, 0, 1.3, 1.3, 1.3, gr).material.emissiveIntensity = .5; const h = new THREE.Mesh(gQuad, MB('#ffb347', .6, true)); h.scale.set(3.4, 3.4, 1); h.position.z = .3; gr.add(h); gr.halo = h; return gr; }); m.position.set(X(q.x), Y(q.y), 0); m.rotation.z = VT * 6; m.halo.quaternion.copy(camera.quaternion).premultiply(_q.copy(m.quaternion).invert());
        if (Math.random() < .7) emit(poolA, X(q.x) + 1, Y(q.y) + rnd(-.3, .3), .2, 1.5, rnd(-.5, .5), 0, .4, .4, '#ffb347', 0, 2, -.5); }
      else if (q.t === 'wave') { const m = use('wave', () => mk(gWave, M('#8a5a30'), 0, 0, 0, .9, 1.3, 3)); m.position.set(X(q.x), .65, 0); if (Math.random() < .7) fxDust(X(q.x), .1, 1, 1, 1.5, '#b49a6a'); }
      else if (q.t === 'bomb') {
        const m = use('bomb', () => { const gr = new THREE.Group(); mk(gIco, M('#9db66f', '', true), 0, 0, 0, 1.15, 1.15, 1.15, gr);   // spiky seed bomb (boss-2 sheet)
          for (let k = 0; k < 12; k++) { const v = new THREE.Vector3(Math.sin(k * 2.4) * Math.cos(k * 1.3), Math.cos(k * 2.4), Math.sin(k * 2.4) * Math.sin(k * 1.3)).normalize(); const c = mk(gCone, M('#6f8a3a'), v.x * .55, v.y * .55, v.z * .55, .14, .3, .14, gr, true); c.quaternion.setFromUnitVectors(_up0, v); }
          mk(gBox, MS('#ffb347', .4, 0, '#ff8a30'), 0, .62, 0, .22, .22, .22, gr, true); gr.boom = mk(gSph, MB('#ffb347', .6, true), 0, 0, 0, 1, 1, 1, gr, true); return gr; });
        m.position.set(X(q.x), Y(q.y) + .55, 0); m.boom.visible = q.st === 'boom'; if (q.st === 'boom') { const r = 4 * Math.min(1, q.tt / .12 + .3); m.boom.scale.set(r, r, r); if (!qprev.has(q)) { qprev.set(q, 1); fxBurst(X(q.x), Y(q.y) + .5, 22, '#ffb347', 9); addShake(.45); } }
        m.scale.setScalar(q.st === 'fuse' && Math.floor(VT * 12) % 2 ? 1.25 : 1);
        if (q.st === 'fuse' && Math.random() < .6) emit(poolA, X(q.x), Y(q.y) + 1.2, .3, rnd(-1, 1), rnd(1, 2.5), 0, .35, .3, '#ffd37a', 0, 1, -.4);
        if (q.st !== 'boom') { const k = use('bmark', () => mkMarkDisc()); k.position.set(X(q.x), .09, 0); k.scale.set(3.6, 1, 3.6); }
      }
    }
  }
  (G.burst || []).forEach(q => { const m = use('gem', () => { const gm = buildGem(0); const gr = new THREE.Group(); gr.add(gm.core); gm.core.scale.set(.6, .9, .5); gr.core = gm.core; return gr; }); m.core.material = MS(P.gem[q.kind], .2, .25, P.gem[q.kind], true); m.core.material.emissiveIntensity = .5; m.position.set(X(q.x), Y(q.y), 0); m.rotation.y = VT * 4; if (Math.random() < .25) emit(poolA, X(q.x), Y(q.y), .3, rnd(-1, 1), rnd(-1, 1), 0, .4, .35, '#fff4c8', 0, 2, -.3); });
  for (const key in v.pools) for (let i = used[key] || 0; i < v.pools[key].length; i++) v.pools[key][i].visible = false;
}
const gWave = (() => { const g = new THREE.CapsuleGeometry(.5, 1, 4, 8); g.rotateX(Math.PI / 2); return g; })();
function mkMarkDisc() { const m = new THREE.Group(); mk(gDisc, MB('#d9534f', .5), 0, .09, 0, 1, 1, 1, m, true); mk(gRing, MB('#ff7a5a', .9), 0, .1, 0, 1, 1, 1, m, true); return m; }

/* ---- camera (follows the hero; small shake on boss slams and hits) ---- */
const cam = { x: 16, y: 3.2, dir: 1, lastRoom: -1, lastSeed: '' };
function resize() {
  if (!renderer) return;
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QL().pr)); renderer.setSize(w, h, false);
  const asp = w / h; camera.aspect = asp;
  camera.fov = Math.min(80, 2 * Math.atan(Math.tan(25 * Math.PI / 180) * Math.max(1, 1.75 / asp)) * 180 / Math.PI);   // keep ~the same width on tall phone screens
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
let photoCam = null;   // screenshot hook: {d, h, yaw} frames the hero close up (visual only, never set in play)
function setCamera(dt) {
  if (photoCam && G.p) { const hx = X(G.p.x), hy = Y(G.p.y), d = photoCam.d || 7, a = photoCam.yaw || 0; camera.position.set(hx + Math.sin(a) * d, hy + (photoCam.h || 1.6) + 1, Math.cos(a) * d); camera.lookAt(hx, hy + (photoCam.h || 1.6), 0); return; }
  const p = G.p, k = 1 - Math.exp(-dt * 4.5); let px_, py_, pz_, lx, ly, lz;
  if (G.state === 'title' || !p) {
    const a = VT * .35; cam.x = 16 + Math.sin(a) * 5;
    px_ = cam.x + Math.sin(a * .7) * 3; py_ = 8.5; pz_ = 21; lx = cam.x; ly = 4.2; lz = 0;
  } else {
    const hh = Math.max(-1.5, Math.min(4, Y(p.y)));
    cam.dir += (p.face - cam.dir) * (1 - Math.exp(-dt * 2.5));
    const tx = Math.max(11.5, Math.min(20.5, X(p.x) + cam.dir * 2.2));
    cam.x += (tx - cam.x) * k; cam.y += (3.2 + hh * .3 - cam.y) * k;
    px_ = cam.x - cam.dir * 2.4; py_ = cam.y + 5.6; pz_ = 21; lx = cam.x + cam.dir * .5; ly = cam.y + 1.6; lz = 0;
  }
  shake = Math.max(0, shake - dt * 2.4);
  const sa = shake * shake * .5, sx = (Math.sin(VT * 71) + Math.sin(VT * 53 + 1)) * .5 * sa, sy = (Math.sin(VT * 63 + 2) + Math.sin(VT * 47)) * .5 * sa;
  camera.position.set(px_ + sx, py_ + sy, pz_); camera.lookAt(lx + sx * .6, ly + sy * .6, lz);
}

/* ---- HUD / panels (DOM, system font only) ---- */
const $ = id => document.getElementById(id);
const hudEl = $('hud'), panel = $('panel'), msgEl = $('msg'), bossHud = $('bosshud'), bossFill = $('bfill'), qbtn = $('qbtn');
const cache = {};
const setTxt = (id, s) => { if (cache[id] !== s) { cache[id] = s; $(id).textContent = s; } };
const setHTML = (id, s) => { if (cache[id] !== s) { cache[id] = s; $(id).innerHTML = s; } };
const ICON = n => '<img class="ic" src="art/icons/' + n + '.png" alt="">', sysb = $('sysb');
const BADGE = '<img id="badge" src="art/badge.png" alt="Made with mudmode">';
function drawUI() {
  const st = G.state;
  hudEl.style.display = (st === 'play' || st === 'paused' || st === 'end') ? 'flex' : 'none';
  const m = Math.floor(G.timeLeft / 60), s = Math.floor(G.timeLeft % 60);
  setTxt('h-time', 'TIME ' + m + ':' + String(s).padStart(2, '0')); $('h-time').className = G.timeLeft < 30 ? 'warn' : '';
  setHTML('h-gems', ICON('gem') + G.got.size + '/' + TREASURES);
  const nl = Math.max(0, G.lives), chip = G.p && nl > 0 ? Math.max(0, Math.min(1, G.p.chip)) : 0, full = chip > 0 ? nl - 1 : nl;   // a hand block takes part of the current heart
  setHTML('h-lives', ICON('heart').repeat(full) + (chip > 0 ? '<span class="hc">' + ICON('heart').replace('"ic"', '"ic lost"') + ICON('heart').replace('"ic"', '"ic hf" style="clip-path:inset(0 ' + Math.round(chip * 100) + '% 0 0)"') + '</span>' : '') + ICON('heart').replace('"ic"', '"ic lost"').repeat(Math.max(0, LIVES - nl)));
  $('h-lives').title = (nl - chip) + ' lives';
  { const sp = G.p ? Math.max(0, G.p.stam) : STAM_MAX, pct = 100 * sp / STAM_MAX, has = !G.p || G.p.shield, sk = Math.round(pct) + '|' + has;   // stamina meter next to the hearts
    if (cache.stam !== sk) { cache.stam = sk; $('h-sfill').style.width = pct + '%'; $('h-stam').className = (pct <= 0 ? 'out' : '') + (has ? '' : ' noshield');
      $('h-stam').title = 'Stamina ' + Math.round(pct) + '%' + (has ? '' : ' (shield on the ground: walk over it)'); } }
  syncTouchDim(st);
  sysb.style.display = (st === 'play' || st === 'paused') ? 'flex' : 'none'; setTxt('h-room', 'ROOM ' + (G.room + 1) + '/' + ROOMS); setTxt('h-score', String(G.score));
  const bb = G.rs && G.rs.boss, showBar = bb && !bb.dead && (st === 'play' || st === 'paused');
  bossHud.style.display = showBar ? 'block' : 'none';
  if (showBar) { setTxt('bname', bb.name + '   ' + '\u25C6'.repeat(Math.max(0, bb.hp)) + '\u25C7'.repeat(Math.max(0, bb.max - bb.hp))); bossFill.style.width = (100 * Math.max(0, bb.hp) / bb.max) + '%'; }
  const nb = nextBoss(), nr = nb - G.room;
  setTxt('h-next', (bb && !bb.dead) ? 'BOSS FIGHT' : nb < 0 ? '' : 'NEXT BOSS IN ' + nr + (nr === 1 ? ' ROOM' : ' ROOMS'));
  msgEl.style.display = (G.msgT > 0 && st === 'play') ? 'block' : (st === 'paused' ? 'block' : 'none');
  setTxt('msg', st === 'paused' ? 'PAUSED' : G.msg);
  let key = st + '|' + G.seed + '|' + G.best + '|' + G.result + '|' + G.score + '|' + G.got.size + '|' + blockMode;
  if (st === 'title' || st === 'end') {
    panel.style.display = 'block';
    if (cache.panel !== key) { cache.panel = key;
      panel.className = st === 'title' ? 'title' : 'endp ' + (G.result === 'win' ? 'win' : 'over');
      const tch = document.body.classList.contains('touch');
      panel.innerHTML = st === 'title'
        ? '<h1>MUDPITY</h1><div class="sub">(early access)</div>' +
          '<p class="goal">Beat the 3 bosses (rooms 4, 8 and 12) before the 3:00 timer ends</p>' +
          '<div class="how">' +
            '<b>Move</b><span>' + (tch ? 'left / right buttons' : 'Arrows or A D') + '</span>' +
            '<b>Jump</b><span>' + (tch ? 'jump button' : 'Space, W or Up') + '</span>' +
            '<b>Vines</b><span>hit one mid-air to grab it; jump to let go</span>' +
            '<b>Bosses</b><span>weak spots glow: jump on them, kick with a vine release, or roll a log in</span>' +
            '<b>Block</b><span>' + (tch ? 'shield button' : 'S or Down') + ': swing the shield off your back to stop logs, mud and boss hits. Each block costs stamina (bigger hits cost more) and it refills slowly. Out of stamina = the shield drops: walk over it to pick it up. No shield: block with your hands (' + Math.round((1 - TUNE.HAND_BLOCK_DAMAGE) * 100) + '% less damage). Unblocked hits cost a heart</span>' +
          '</div>' +
          '<div class="setb" id="set-block">Block button: <b' + (blockMode === 'press' ? ' class="sel"' : '') + '>PRESS</b> / <b' + (blockMode === 'hold' ? ' class="sel"' : '') + '>HOLD</b> &nbsp;<small>' + (tch ? 'tap here to change' : '[B] or click to change') + '</small></div>' +
          '<div class="seedbox">Seed <b>' + esc(G.seed) + '</b> &nbsp; best <b>' + G.best + '</b><br><small>' + (tch ? 'add ?seed=name to the address for a set world' : '[N] random seed &nbsp; [D] daily seed &nbsp; or add ?seed=name to the address') + '</small></div>' +
          '<div class="go">' + (tch ? 'TAP TO START' : 'PRESS ENTER / TAP TO START') + '</div>' + BADGE
        : '<div class="top"><h1>' + (G.result === 'win' ? 'ALL BOSSES DOWN!' : G.result === 'time' ? 'TIME UP' : 'OUT OF LIVES') + '</h1>' +
          '<p>Score ' + G.score + ' &nbsp; gems ' + G.got.size + '/' + TREASURES + ' &nbsp; best ' + G.best + ' &nbsp; seed ' + esc(G.seed) + '</p>' +
          '<div class="go">ENTER / TAP: play again &nbsp; [H] title &nbsp; [N] new seed</div></div>' +
          '<img class="ib" id="e-restart" src="art/icons/restart.png" alt="Play again" title="Play again (Enter)"><img class="ib" id="e-home" src="art/icons/home.png" alt="Title" title="Back to the title (H)">' + BADGE;
    }
  } else panel.style.display = 'none';
}
/* touch buttons dim when their action can't do anything right now (menus, pause, falling, staggered by a blocked hit, between lives) */
const tbEls = { left: $('bl'), right: $('br'), jump: $('bj'), block: $('bk') };
function syncTouchDim(st) {
  const p = G.p, live = st === 'play' && p && p.dead <= 0, free = live && p.react <= 0;
  const on = { left: !!free, right: !!free, jump: (st === 'title' || st === 'end') || !!(free && (p.onGround || p.coyote > 0 || p.vine)), block: !!(live && !p.vine) };
  for (const k in tbEls) { const d = !on[k], ck = 'dim' + k; if (cache[ck] !== d) { cache[ck] = d; tbEls[k].classList.toggle('dim', d); } }
  const bo = st === 'play' && wantBlock(); if (cache.bkon !== bo) { cache.bkon = bo; tbEls.block.classList.toggle('on', bo); }   // lit while the block is up (press mode stays lit)
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---- quality toggle (Q key or the small button): LOW = no shadow maps, fewer instances, lower pixel ratio ---- */
function applyQuality() {
  const q = QL();
  if (renderer) { renderer.shadowMap.enabled = q.shadows; sun.castShadow = q.shadows; allMats.forEach(m => { m.needsUpdate = true; }); resize(); }
  qbtn.textContent = 'QUALITY: ' + q.name + ' [Q]'; qbtn.className = q.shadows ? 'hi' : 'lo';
  pl.shadow.visible = true; pl.shadow.material.opacity = q.shadows ? .18 : .45; forceRebuild = true;
}
function setQuality(i, save) { Qi = i; applyQuality(); if (save) { try { localStorage.setItem('jr3d-quality', QL().name.toLowerCase()); } catch (e) {} } }
qbtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); setQuality(1 - Qi, true); });

/* ---- per-frame scene sync ---- */
let fps = 0, fpsN = 0, fpsT = 0;
const hold = (cur, tgt, dt, rate) => cur + (tgt - cur) * (1 - Math.exp(-dt * rate));
const HS = 1.08;   // hero display scale (visual only; the hitbox is unchanged)
/* shield: on his back -> swings round his right side to the front while blocking -> on the ground when dropped */
const SH_R = .8;   // distance from the hero's middle to the shield face
function syncShield(p, dt) {
  const sh = shield, k = Math.max(0, Math.min(1, p.stam / STAM_MAX)), glow = TUNE.GLOW_MIN + (TUNE.GLOW_MAX - TUNE.GLOW_MIN) * k;
  if (G.blocks !== pl.lastBlocks) { if (pl.lastBlocks !== undefined && G.blocks > pl.lastBlocks && G.lastBlock && !G.lastBlock.hand) { pl.blkFlash = .25; const w = sh.halo.getWorldPosition(_vA); fxSpark(w.x, w.y, 8, '#dff6ff', 5); } pl.lastBlocks = G.blocks; }
  pl.blkFlash = Math.max(0, (pl.blkFlash || 0) - dt);
  if (pl.hadShield && !p.shield) { const w = sh.root.getWorldPosition(_vA); fxBurst(w.x, w.y, 14, '#9fe3ff', 6); addShake(.25); }
  pl.hadShield = p.shield;
  sh.glowM.emissiveIntensity = .05 + 1.1 * glow + pl.blkFlash * 2; sh.haloM.opacity = Math.min(1, glow + pl.blkFlash * 2);
  const hs = 1.62 + .14 * glow + Math.sin(VT * 6) * .03 * glow; sh.halo.scale.set(hs, hs, 1);
  if (p.shield) {
    if (sh.root.parent !== pl.bod) { pl.bod.add(sh.root); pl.shE = 0; }
    sh.root.visible = true;
    const tgt = p.blocking && p.dead <= 0 ? 1 : 0;
    pl.shE = tgt > (pl.shE || 0) ? Math.min(1, (pl.shE || 0) + dt / TUNE.RAISE_TIME) : Math.max(0, (pl.shE || 0) - dt / TUNE.LOWER_TIME);
    const e = pl.shE * pl.shE * (3 - 2 * pl.shE), th = Math.PI * (1 - e);           // th: pi = on his back, pi/2 = his right side, 0 = in front
    sh.root.position.set(Math.cos(th) * SH_R, 1.28 + Math.sin(th) * .12, Math.sin(th) * SH_R);
    sh.root.rotation.set(0, -th, (1 - e) * .12); sh.root.scale.setScalar(1);
  } else {
    const d = G.drop, here = d && d.room === G.room && G.state !== 'title';
    if (sh.root.parent !== scene) scene.add(sh.root);
    sh.root.visible = !!here;
    if (here) { sh.root.position.set(X(d.x), .1 + Math.max(0, Math.sin(VT * 3)) * .04, .2); sh.root.rotation.set(0, .3, Math.PI / 2); sh.root.scale.setScalar(HS); }
  }
}
function syncHero(room, p, dt) {
  const g = pl.root, bod = pl.bod;
  if (!p || G.state === 'title') { g.visible = false; pl.shadow.visible = false; pl.lastLives = -1; return; }
  g.visible = true; g.position.set(X(p.x), Y(p.y), 0);
  g.rotation.y = photoCam && photoCam.hy !== undefined ? photoCam.hy : hold(g.rotation.y, p.face > 0 ? -.62 : Math.PI + .62, dt, 16);   // 3/4 view: the face turns a little toward the camera
  const vine = !!p.vine, run = p.onGround && Math.abs(p.vx) > 1, air = !p.onGround && !vine, ph = p.step * .45, spd = Math.min(1, Math.abs(p.vx) / 70);
  // events from state changes: take-off, landing, death, hit
  if (pl.wasGround && air && p.vy < 0) { fxDust(g.position.x, g.position.y, 4, 2.5, 1.2); pl.sq = -.3; }
  if (air) pl.vyMax = Math.max(pl.vyMax, p.vy);
  if (pl.wasAir && p.onGround && !vine) { const imp = Math.min(1, pl.vyMax / 190); fxDust(g.position.x, g.position.y, 5 + imp * 9, 3 + imp * 3, 1.5 + imp, '#c9b48a'); pl.sq = .18 + .4 * imp; if (imp > .5) addShake(.18 * imp); pl.vyMax = 0; }
  if (p.onGround || vine) pl.vyMax = 0;
  pl.wasAir = air; pl.wasGround = p.onGround && !vine;
  if (p.dead > 0 && !pl.wasDead) { fxBurst(g.position.x, g.position.y + 1.2, 18, '#d6a577', 7); fxDust(g.position.x, g.position.y + 1, 8, 4, 3, '#8d6544'); addShake(.5); }
  pl.wasDead = p.dead > 0;
  syncShield(p, dt);
  if (pl.lastLives >= 0 && G.lives < pl.lastLives) { pl.hurtT = 1.1; if (p.dead <= 0) addShake(.4); }
  pl.lastLives = G.lives;
  if (p.inv > 0 && pl.lastInv <= 0 && p.dead <= 0) fxSpark(g.position.x, g.position.y + 1.6, 7, '#ffffff', 5);
  pl.lastInv = p.inv;
  pl.dustT -= dt; if (run && pl.dustT <= 0) { pl.dustT = .17; fxDust(g.position.x - p.face * .5, g.position.y, 1, 1.2, .5); }
  // squash & stretch spring (positive = squashed, negative = stretched)
  const tgt = air ? (p.vy < 0 ? -.2 : -.08) : 0; pl.sq = hold(pl.sq, tgt, dt, 14);
  bod.scale.set(1 + pl.sq * .55, 1 - pl.sq * .6, 1 + pl.sq * .55);
  // procedural poses, after the approved pose sheet: run (lean in, big strides, scowl), jump (one fist up, legs tucked),
  // vine (both arms up, legs kicking with the swing), hurt (slumped, sleepy lids, drooping leaf, smoke), idle (breathing, glances)
  if (p.dead > 0) pl.hurtT = Math.max(pl.hurtT, .3);
  pl.hurtT = Math.max(0, pl.hurtT - dt); const hurt = pl.hurtT > 0;
  let ll = 0, lr = 0, al = 0, ar = 0, sl = 0, sr = 0, lean = 0, bob = 0, hd = 0, tw = 0, lid = .13, slant = 0, ka = 0, kr = 0;
  if (hurt) { const w = Math.sin(VT * 7) * .06; ll = .25; lr = -.2; al = .35 + w; ar = .25 - w; sl = sr = .35; lean = .12; bob = -.06; hd = -.12; lid = .0; slant = -.18;
    pl.smokeT -= dt; if (pl.smokeT <= 0) { pl.smokeT = .12; fxDust(g.position.x + rnd(-.9, .9), g.position.y + 2.5, 1, .3, .9, '#bdb8ae'); } }
  else if (vine) { const vv = vineVel(p.vine, G.t) * (p.face > 0 ? 1 : -1); al = ar = 2.9; sl = sr = .28; ll = .35 + vv * .35; lr = -.15 + vv * .45; ka = -ll * .4; kr = -lr * .4; lean = -vv * .08; lid = .15; hd = .1; }
  else if (air) { const upw = p.vy < 0; ar = upw ? 3.0 : 2.5; al = upw ? .9 : 1.4; sr = .1; sl = upw ? .7 : .9; ll = upw ? 1.0 : .5; lr = upw ? -.35 : -.1; ka = -ll * .7; kr = upw ? .5 : .2; lean = upw ? -.12 : .05; lid = .22; hd = upw ? .1 : -.04; }
  else if (run) { const s = Math.sin(ph); ll = s * 1.05; lr = -s * 1.05; ka = -ll * .55 + Math.max(0, s) * .3; kr = -lr * .55 + Math.max(0, -s) * .3; al = -s * 1.1; ar = s * 1.1; sl = sr = .22;
    bob = Math.abs(Math.cos(ph)) * .13; lean = -.16 - .07 * spd; hd = .06 + Math.sin(ph * 2) * .03; tw = s * .14; lid = .07; slant = .3; }
  else { const br = Math.sin(VT * 2.4); al = br * .06; ar = -al; sl = sr = .12; bob = br * .02 + .02; tw = Math.sin(VT * .7) * .18 * (Math.sin(VT * .23) > .6 ? 1 : 0); }
  // block pose: the right arm reaches back for the shield, then both arms hold it out front; with no shield both hands come up
  if (p.blocking && !vine && p.dead <= 0) {
    if (p.shield) { if (pl.shE < .55) { ar = -1.35; sr = .35; } else { ar = 1.45; al = 1.1; sr = .45; sl = .25; } lean = Math.min(lean, -.06); }
    else { al = ar = 1.75; sl = sr = -.25; lean = -.1; }
  }
  const R = (o, k, v, r) => { o.rotation[k] = hold(o.rotation[k], v, dt, r || 30); };
  R(pl.legL, 'z', ll); R(pl.legR, 'z', lr); R(pl.ankL, 'z', ka); R(pl.ankR, 'z', kr);
  R(pl.armL, 'z', al); R(pl.armR, 'z', ar); R(pl.splL, 'x', sl); R(pl.splR, 'x', -sr);
  { const e = pl.armE = hold(pl.armE || 0, vine ? 1.05 : 0, dt, 12); for (const a of [pl.armL, pl.armR]) { const u = a.userData; u.pipe.scale.y = .42 + e; u.pipe.position.y = -.12 - (.42 + e) / 2; u.ext.position.y = -e; } }   // telescoping arms reach the vine above the dome
  R(bod, 'z', lean, 12); R(bod, 'y', tw, 12); bod.position.y = bob; R(pl.head, 'z', hd + (air ? (p.vy < 0 ? .08 : -.05) : 0), 18);
  pl.lid = hold(pl.lid, lid, dt, 14); pl.slant = hold(pl.slant, slant, dt, 14);
  pl.lids.forEach(o => { o.position.y = pl.lid; o.scale.y = Math.max(.01, (.25 - pl.lid) / .25); o.rotation.x = pl.slant * o.userData.s; });   // lid top stays at the lens rim
  const blink = (VT % 3.4) < .1 && !hurt && !photoCam; pl.eyes.forEach(e => { e.scale.y = blink ? .15 : 1; });
  pl.lens.emissiveIntensity = (hurt ? .55 + Math.sin(VT * 20) * .25 : 1.05 + Math.sin(VT * 3.1) * .3) + (p.inv > 0 && !hurt ? .4 : 0);
  pl.sprout.position.y = .5 + Math.sin(VT * 4.2 + (run ? ph * 2 : 0)) * (run ? .045 : .02) + (air ? .03 : 0); pl.sprout.rotation.z = Math.sin(VT * 3.3) * .12 + (run ? Math.sin(ph * 2) * .12 : 0) - (air ? .12 : 0) + (hurt ? .35 : 0); pl.sprout.scale.y = 1.75 * (1 + Math.sin(VT * 4.2 + 1) * .05);
  R(pl.leafR, 'x', hurt ? 2.4 : .9 + Math.sin(VT * 3) * .08, 8); R(pl.leafL, 'x', -.9 - Math.sin(VT * 3 + 1) * .08 - (air && p.vy < 0 ? .3 : 0), 8);
  pl.worm.forEach((s, i) => { s.rotation.z = Math.sin(VT * (air ? 14 : 5) - i * 1.3) * (air ? .9 : .45) + (i ? 0 : -.3); s.rotation.x = Math.sin(VT * 3.1 - i) * .3; });
  if (p.dead > 0) { const f = p.dead / .8; g.rotation.z = (1 - f) * 1.5 * -(p.face > 0 ? 1 : -1); g.scale.setScalar(Math.max(.01, f) * HS); } else { g.rotation.z = 0; g.scale.setScalar(HS); }
  g.visible = !(p.inv > 0 && Math.floor(VT * 12) % 2);
  const sh = pl.shadow, hole = holeAt(room, p.x), hh = Math.max(0, (GY - p.y) * S), onG = p.y <= GY + 1;
  sh.visible = !hole && p.dead <= 0 && onG; sh.position.set(X(p.x), .07, 0); const ss = 1.6 / (1 + hh * .16); sh.scale.set(ss, 1, ss);
}
function render(dtReal) {
  const dt = Math.min(0.1, dtReal || STEP); VT += dt; uTime.value = VT;
  const room = G.world.rooms[G.room || 0], key = G.seed + '#' + (G.room || 0);
  if (key !== builtKey || forceRebuild) {
    if (key !== builtKey && G.p && cam.lastSeed === G.seed && G.state !== 'title') {      // keep the camera continuous across a room change
      if (G.room === cam.lastRoom + 1) cam.x -= 32; else if (G.room === cam.lastRoom - 1) cam.x += 32; else cam.x = X(G.p.x);
    }
    buildRoom(room); builtKey = key; forceRebuild = false; cam.lastRoom = G.room || 0; cam.lastSeed = G.seed;
  }
  const rs = G.rs, T = G.t, p = G.p, q = QL();
  // vines: rope drawn as 9 bent segments (bow is zero at both ends so the grab point still matches the logic line), leaves ride along
  for (const e of view.vines) {
    const pts = []; for (let i = 0; i <= 9; i++) { const s = i / 9, c = vinePt(e.vn, T, s), bow = Math.sin(s * Math.PI); pts.push(new THREE.Vector3(X(c.x) + bow * .1 * Math.sin(VT * 1.9 + e.vn.ax), Y(c.y), bow * .35 * Math.sin(VT * 1.3 + e.vn.ax * .1))); }
    for (let i = 0; i < 9; i++) { _vA.copy(pts[i]); _vB.copy(pts[i + 1]); _vD.subVectors(_vB, _vA); const L = _vD.length();
      _o.position.copy(_vA).add(_vB).multiplyScalar(.5); _o.quaternion.setFromUnitVectors(_up, _vD.normalize()); _o.scale.set(.2 - i * .006, L * 1.04, .2 - i * .006); _o.updateMatrix(); e.seg.setMatrixAt(i, _o.matrix); }
    e.seg.instanceMatrix.needsUpdate = true; e.knob.position.copy(pts[9]);
    for (const l of e.leaves) { const i = Math.round(l.s * 9), c = pts[i]; l.m.position.set(c.x + .25, c.y, c.z + .1); l.m.rotation.set(.4, l.s * 9, (l.s * 7) % 1.5 - .5); }
  }
  // snappers
  for (const s of view.snaps) {
    const open = snapOpen(s.pool, s.k, T), warn = snapWarn(s.pool, s.k, T);
    s.jaw.rotation.z = hold(s.jaw.rotation.z, open ? .85 : warn ? .18 + Math.sin(VT * 30) * .05 : 0, dt, 24);
    const pm = warn ? M('#ff4a3a', '#c02818') : M('#2a1c13'); s.pa.material = pm; s.pb.material = pm;
  }
  if (view.tarFlag) view.bubbles.forEach((b, i) => { const k = .5 + .5 * Math.sin(VT * 3 + i * 2); b.scale.set(.5 * k + .1, .3 * k + .05, .5 * k + .1); });
  // gem: spin, bob, pulse, sparkle; pickup burst
  if (view.gem) { const gm = view.gem, t = gm.t, got = G.got.has(gm.root.userData.id);
    gm.root.visible = !got; gm.halo.visible = !got; gm.stars.forEach(s => { s.visible = !got; });
    if (got && !view.gemGot) { fxSpark(X(t.x), Y(t.y), 18, '#fff4c8', 8); fxBurst(X(t.x), Y(t.y), 8, P.gem[t.kind], 6); }
    view.gemGot = got;
    if (!got) { const y = Y(t.y) + Math.sin(VT * 3.2) * .22, x = X(t.x); gm.root.position.y = y; gm.root.rotation.y = VT * 2.2; const pu = 1 + Math.sin(VT * 5) * .05; gm.root.scale.set(pu, pu, pu);
      gm.core.material.emissiveIntensity = .45 + Math.sin(VT * 4) * .2; gm.halo.position.set(x, y, -.3); gm.halo.quaternion.copy(camera.quaternion); const hs = 3.4 + Math.sin(VT * 4) * .4; gm.halo.scale.set(hs, hs, 1);
      gm.stars.forEach((s, i) => { const a = VT * 1.6 + i * 2.1, r = 1.05 + .2 * Math.sin(VT * 2 + i); s.position.set(x + Math.cos(a) * r, y + Math.sin(a * 1.3) * .8, .5); s.quaternion.copy(camera.quaternion); const k = .35 + .55 * Math.max(0, Math.sin(VT * 3 + i * 2.4)); s.scale.set(k, k, 1); s.rotation.z += VT; }); } }
  // logs / crawlers
  const logs = rs ? rs.logs : [];
  for (let i = 0; i < logs.length; i++) { ensureLog(i); const l = view.logs[i]; l.root.visible = true; l.root.position.set(X(logs[i].x), .7, 0); l.root.rotation.z = logs[i].rot; l.shadow.rotation.z = -logs[i].rot;
    if (Math.random() < .35) fxDust(X(logs[i].x), .05, 1, 1, 1, '#b49a6a'); }
  for (let i = logs.length; i < view.logs.length; i++) view.logs[i].root.visible = false;
  const crs = room.crawlers; ensureCrawlers(crs.length);
  crs.forEach((c, k) => { const s = rs && rs.crawlers[k]; const cr = view.crawlers[k]; if (!s) { cr.root.visible = false; return; }
    cr.root.visible = true; cr.root.position.set(X(s.x), 0, 0); cr.body.rotation.y = hold(cr.body.rotation.y, s.d > 0 ? 0 : Math.PI, dt, 14);
    cr.body.position.y = Math.abs(Math.sin(VT * 9 + k)) * .06; cr.body.scale.set(1, 1 + Math.sin(VT * 5 + k) * .03, 1);
    cr.legs.forEach(l => { l.p.rotation.z = Math.sin(VT * 14 + l.ph) * .5; }); cr.ant.forEach((a, i) => { a.rotation.z = Math.sin(VT * 4 + i) * .2; }); });
  syncBoss();
  syncHero(room, p, dt);
  syncBuddy(p, dt);
  // ambient: god-rays + motes follow the camera, camera shake, sky + sun follow
  for (const r of view.rays) { const u = r.userData; r.position.set(cam.x + u.ox * .85, 9, u.oz); r.scale.set(u.w, 26, 1); r.rotation.z = .42; r.material.opacity = u.base * (.65 + .35 * Math.sin(VT * .5 + u.ph)); }
  if (view.motes) { const mm = view.motes; mm.d.forEach((m, i) => { _o.position.set(cam.x + m.x + Math.sin(VT * m.s * 4 + m.p) * 1.2, m.y + Math.sin(VT * m.s * 3 + m.p * 2) * .7, m.z); _o.quaternion.copy(camera.quaternion); const s = .14 + .08 * Math.sin(VT * 2 + m.p); _o.scale.set(s, s, s); _o.updateMatrix(); mm.mesh.setMatrixAt(i, _o.matrix); }); mm.mesh.instanceMatrix.needsUpdate = true; }
  setCamera(dt); camera.updateMatrixWorld(); camQ.copy(camera.quaternion);
  sky.position.copy(camera.position);
  if (q.shadows) { sun.target.position.set(Math.round(cam.x * 2) / 2, 3, 0); sun.position.copy(sun.target.position).add(SUNOFF); } else { sun.target.position.set(cam.x, 3, 0); sun.position.copy(sun.target.position).add(SUNOFF); }
  updatePool(poolN, dt); updatePool(poolA, dt);
  if (renderer) renderer.render(scene, camera);
  drawUI();
  fpsN++; fpsT += dtReal || 0; if (fpsT >= 1) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; if (fpsEl) fpsEl.textContent = fps.toFixed(0) + ' fps' + (fpsEl.dataset.q ? ' ' + QL().name : ''); }
}
const fpsEl = qs.get('fps') ? $('fps') : null; if (fpsEl) { fpsEl.style.display = 'block'; fpsEl.dataset.q = '1'; }
applyQuality(); pl.shadow.visible = false;

/* ---------- input ---------- */
const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump' };
// end screen: ignore restart presses for END_LOCK ms after it appears (mashing jump / tapping no longer skips it); then a fresh press is needed
const END_LOCK = 1000; let endShownAt = -1e9, wasEnd = false;
function noteEnd() { const e = G.state === 'end'; if (e && !wasEnd) endShownAt = performance.now(); wasEnd = e; }
function startOrRestart() { noteEnd(); if (G.state === 'end' && performance.now() - endShownAt < END_LOCK) return; if (G.state === 'title' || G.state === 'end') { G.p = null; startRun(); } }
function setSeed(s) { G.seed = s; G.world = genWorld(s); G.best = 0; try { G.best = +localStorage.getItem(BEST_KEY(s)) || 0; } catch (e) {} }
const dailySeed = () => { const d = new Date(); return 'daily-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
addEventListener('keydown', e => {
  const menu = G.state === 'title' || G.state === 'end';
  if (e.code === 'KeyQ' && !e.repeat) { setQuality(1 - Qi, true); return; }
  if (menu && e.code === 'KeyD') { setSeed(dailySeed()); G.state = 'title'; return; }
  const k = keyMap[e.code];
  if (k) { e.preventDefault(); if (k === 'jump' && !keys.jump) jumpQ = 0.12; keys[k] = true; return; }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); if (!e.repeat && G.state === 'play') blockInput(true); return; }
  if (e.code === 'KeyB' && menu && !e.repeat) { setBlockMode(blockMode === 'press' ? 'hold' : 'press'); return; }
  if (e.code === 'Enter') { e.preventDefault(); if (!(e.repeat && G.state === 'end')) startOrRestart(); }
  else if (e.code === 'KeyP' && (G.state === 'play' || G.state === 'paused')) { G.state = G.state === 'play' ? 'paused' : 'play'; }
  else if (e.code === 'KeyN' && menu) { setSeed(Math.random().toString(36).slice(2, 8)); G.state = 'title'; }
  else if (e.code === 'KeyM' && !e.repeat) toggleMute();
  else if (e.code === 'KeyH' && G.state === 'end') goHome();
});
/* sound on/off (M or the speaker button): wraps the logic's sfx() so no logic line changes */
let muted = false; try { muted = localStorage.getItem('jr3d-mute') === '1'; } catch (e) {}
{ const _sfx = sfx; sfx = function () { if (!muted) _sfx.apply(null, arguments); }; }
function toggleMute() { muted = !muted; try { localStorage.setItem('jr3d-mute', muted ? '1' : '0'); } catch (e) {} syncSnd(); }
function syncSnd() { const b = $('b-snd'); b.src = 'art/icons/' + (muted ? 'sound_off' : 'sound_on') + '.png'; b.alt = muted ? 'Sound off' : 'Sound on'; }
function togglePause() { if (G.state === 'play' || G.state === 'paused') G.state = G.state === 'play' ? 'paused' : 'play'; }
function goHome() { if (G.state === 'end') { G.state = 'title'; } }
syncSnd();
[['b-pause', togglePause], ['b-snd', toggleMute]].forEach(([id, f]) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); f(); }));
addEventListener('keyup', e => { const k = keyMap[e.code]; if (k) keys[k] = false; if (e.code === 'ArrowDown' || e.code === 'KeyS') blockInput(false); });
// leaving the tab / window: drop held input and pause (the existing P pause, so the timer stops); a pause made this way resumes on return
let autoPaused = false;
function pauseOnLeave() { keys.left = keys.right = keys.jump = keys.block = false; blockLatch = false; jumpQ = 0; if (G.state === 'play') { G.state = 'paused'; autoPaused = true; } }
function resumeOnReturn() { if (autoPaused && G.state === 'paused') G.state = 'play'; autoPaused = false; }
addEventListener('blur', pauseOnLeave);
addEventListener('focus', () => { if (!document.hidden) resumeOnReturn(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseOnLeave(); else if (document.hasFocus()) resumeOnReturn(); });
if ('ontouchstart' in window || matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
document.querySelectorAll('.tb').forEach(b => { const k = b.dataset.k;
  if (k === 'block') {   // block button: press mode toggles, hold mode blocks while the finger is down (lit state set in syncTouchDim)
    const bd = e => { e.preventDefault(); if (G.state === 'play') blockInput(true); try { b.setPointerCapture(e.pointerId); } catch (_) {} }, bu = e => { e.preventDefault(); blockInput(false); };
    b.addEventListener('pointerdown', bd); b.addEventListener('pointerup', bu); b.addEventListener('pointercancel', bu); b.addEventListener('lostpointercapture', bu); return; }
  const down = e => { e.preventDefault(); if (k === 'jump' && !keys.jump) { jumpQ = 0.12; startOrRestart(); } keys[k] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
  const up = e => { e.preventDefault(); keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
});
cv.addEventListener('pointerdown', () => { startOrRestart(); });
panel.addEventListener('pointerdown', e => { e.preventDefault(); if (e.target && e.target.id === 'e-home') { goHome(); return; } if (e.target && e.target.closest && e.target.closest('#set-block')) { setBlockMode(blockMode === 'press' ? 'hold' : 'press'); return; } startOrRestart(); });

/* ---------- loop ---------- */
let last = performance.now(), acc = 0;
function frame(now) {
  const dtr = Math.min(0.1, (now - last) / 1000); acc += dtr; last = now;
  while (acc >= STEP) { update(STEP); if (G.state === 'title') G.t += STEP; acc -= STEP; }
  noteEnd();
  render(dtr); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hook (read/steer only; no network)
window.__jr = { G, keys, genWorld, update, render, press(k, d) { if (k === 'block') { blockInput(d); return; } keys[k] = d; if (k === 'jump' && d) jumpQ = 0.12; },
  fingerprint(seed) { return JSON.stringify(genWorld(seed).rooms); }, startRun, setSeed, ROOMS, TREASURES, GY, enterRoom, hurtBoss, isLocked, nextBoss, BOSS_ROOMS, BOSS_DEF,
  setQuality, quality: () => QL().name, harm, BEST_KEY, STAM_MAX, TUNE, setBlockMode, blockMode: () => blockMode, wantBlock, blockReady: () => !!(G.p && blockReady(G.p)),
  shieldView: () => { const w = shield.root.getWorldPosition(new THREE.Vector3()); return { parent: shield.root.parent === pl.bod ? 'hero' : 'ground', visible: shield.root.visible, e: pl.shE || 0, x: w.x, y: w.y, z: w.z, heroX: G.p ? X(G.p.x) : null, glow: shield.glowM.emissiveIntensity, halo: shield.haloM.opacity }; },
  buddy: () => ({ on: buddy.on, visible: buddy.root.visible, x: buddy.root.position.x, y: buddy.root.position.y, face: buddy.face, heroX: G.p ? X(G.p.x) : null }), photo(o) { photoCam = o || null; },
  mats: () => ({ all: allMats.size, cached: Object.keys(matCache).length }), endLockMs: END_LOCK,
  info: () => renderer ? { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, fps, rev: THREE.REVISION, quality: QL().name } : null };
})();
