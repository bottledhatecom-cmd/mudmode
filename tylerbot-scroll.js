/* tylerbot-scroll ts3: a copy of the Tylerbot hero robot rides the side of the page once the hero scrolls away.
   He goes head-first in the direction of travel (a dive going down, a climb going up), flipping on a spring through the shortest path, and eases upright at idle.
   Scroll speed (smoothed) drives motion-blur streaks, afterimages and embers that stream from behind him (his feet); fast enough and he heats from gold to white-hot,
   then breaks the sound barrier (shockwave ring, vapor cone, edge flash), once per burst, and cools down.
   His teal cape is a live cloth mesh, cut from the still (new assets; the shared still is not edited): it trails opposite travel with follow-through, flutters and stretches with speed, whips and overshoots on a flip, drapes at idle, and picks up the heat glow.
   The body also has secondary rigging: squash/stretch, flip anticipation and wobble, lean into acceleration, a lag when slowing, a tuck/splay, a near-barrier shake and a recoil after the burst.
   Optional extra: the page works with this file turned off. No sound, no storage, no cookies, no network.
   Reads nothing from the hero's markup except its position, and never touches the hero or its scripts. Off for reduced motion. */
(function(){
 'use strict';
 var d=document,w=window,perf=w.performance||Date;
 if(!d.body||!w.requestAnimationFrame||!d.createElement('canvas').getContext)return;
 var mq=w.matchMedia?w.matchMedia('(prefers-reduced-motion: reduce)'):null;
 if(mq&&mq.matches)return;

 /* ---- thresholds (px of page scroll per second, after smoothing) ---- */
 var T={trail:200,full:3800,heat0:2200,heat1:5000,barrier:5200,rearm:2400,cool:1700,flip:500,idle:160};
 var STILL='img/tylerbot/tylerbot-flare-still.webp?v=f468';
 var BODY='img/tylerbot/tylerbot-scroll-body.webp?v=ts3';
 var CAPE='img/tylerbot/tylerbot-scroll-cape.webp?v=ts3';
 var CMSK='img/tylerbot/tylerbot-scroll-cape-mask.png?v=ts3';
 var DBG=/[?&]tbs=debug/.test(w.location.search);
 var IW=468,IH=480,CNX=14,CNY=9;

 var hero=d.querySelector('[data-tyler-play]')||d.querySelector('.tylerbot')||d.getElementById('start');
 var src=BODY;

 /* ---- DOM (all aria-hidden, click-through) ---- */
 var root=d.createElement('div');root.className='tbs';root.setAttribute('aria-hidden','true');
 var cv=d.createElement('canvas');cv.className='tbs-fx';
 var cvb=d.createElement('canvas');cvb.className='tbs-cape tbs-cape-b';
 var cvf=d.createElement('canvas');cvf.className='tbs-cape tbs-cape-f';
 var live=d.createElement('div');live.className='tbs-live';
 var bot=d.createElement('div');bot.className='tbs-bot';
 var rig=d.createElement('div');rig.className='tbs-rig';
 function mk(c){var i=d.createElement('img');i.className='tbs-i '+c;i.alt='';i.setAttribute('aria-hidden','true');i.decoding='async';i.draggable=false;i.src=src;return i}
 var l0=mk('tbs-l0'),l1=mk('tbs-l1'),l2=mk('tbs-l2');
 rig.appendChild(l0);rig.appendChild(l1);rig.appendChild(l2);bot.appendChild(rig);
 var fl=d.createElement('div');fl.className='tbs-flash';
 live.appendChild(cvb);live.appendChild(bot);live.appendChild(cvf);
 root.appendChild(cv);root.appendChild(live);root.appendChild(fl);
 d.body.appendChild(root);
 var ctx=cv.getContext('2d'),ctxb=cvb.getContext('2d'),ctxf=cvf.getContext('2d');

 /* ---- geometry (measured on load/resize only, never per frame) ---- */
 var vw=0,vh=0,dpr=1,docH=1,S=150,SH=160,vis=150,left=0,yMin=70,yMax=500,narrow=false;
 var sprites=null,img=new Image(),capeImg=new Image(),mskImg=new Image();
 function sizeCv(c,g){c.width=Math.round(vw*dpr);c.height=Math.round(vh*dpr);g.setTransform(dpr,0,0,dpr,0,0);return g}
 function measure(){
  vw=w.innerWidth;vh=w.innerHeight;dpr=Math.min(w.devicePixelRatio||1,2);
  docH=Math.max(d.documentElement.scrollHeight,vh+1);
  var win=d.querySelector('main .win')||d.querySelector('main');
  var r=win?win.getBoundingClientRect():null,gut=r?Math.max(0,vw-r.right):0;
  var bar=d.querySelector('.bar'),bb=bar?bar.getBoundingClientRect().bottom:60;
  if(gut>=92){narrow=false;S=Math.min(150,gut-14);vis=S;left=vw-gut/2-S/2}
  else{narrow=true;S=64;vis=Math.min(S,gut+14);left=vw-vis}   /* peeks in from the edge, over the margin and window padding only */
  SH=Math.round(S*480/450);
  yMin=Math.round(bb+14);yMax=Math.max(yMin,vh-SH-(narrow?96:24));
  bot.style.width=S+'px';bot.style.height=SH+'px';
  sizeCv(cv,ctx);sizeCv(cvb,ctxb);sizeCv(cvf,ctxf);
  capeDirty=true;buildSprites();wake();
 }
 /* tinted silhouettes of the same still, for the soft afterimages (gold, orange, white-hot) */
 function buildSprites(){
  if(!img.complete||!img.naturalWidth)return;
  var cols=['rgba(243,201,105,.8)','rgba(255,138,40,.85)','rgba(255,246,228,.9)'],o=[];
  for(var i=0;i<3;i++){var c=d.createElement('canvas');c.width=Math.round(S*dpr);c.height=Math.round(SH*dpr);var g=c.getContext('2d');
   g.drawImage(img,0,0,c.width,c.height);g.globalCompositeOperation='source-atop';g.fillStyle=cols[i];g.fillRect(0,0,c.width,c.height);o.push(c)}
  sprites=o;
 }
 img.onload=function(){buildSprites();wake()};img.src=STILL;

 /* ---- cape cloth (grid mesh warped from the extracted cape texture) ---- */
 var cverts=[],cquads=[],clinks=[],capeReady=false,capeDirty=true,capeBusy=0,capeInit=false;
 var CX=0,CY=0,rotDraw=0,SXd=1,SYd=1,shX=0,shY=0;
 function buildCape(){
  if(!capeImg.complete||!capeImg.naturalWidth||!mskImg.complete||!mskImg.naturalWidth)return;
  IW=capeImg.naturalWidth;IH=capeImg.naturalHeight;
  var c=d.createElement('canvas');c.width=IW;c.height=IH;var g=c.getContext('2d');
  g.drawImage(mskImg,0,0);var pix=g.getImageData(0,0,IW,IH).data;
  var x0=IW,y0=IH,x1=0,y1=0,i,x,y,p,r,gc,bc;
  for(y=0;y<IH;y++)for(x=0;x<IW;x++){if(pix[(y*IW+x)*4]>20){if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y}}
  if(x1<=x0)return;
  x0=Math.max(0,x0-2);y0=Math.max(0,y0-2);x1=Math.min(IW-1,x1+2);y1=Math.min(IH-1,y1+2);
  var pins=[[155,198],[314,198],[234,186],[200,200],[268,200]];
  cverts=[];cquads=[];clinks=[];
  function sample(ix,iy){
   ix=ix<0?0:ix>IW-1?IW-1:ix;iy=iy<0?0:iy>IH-1?IH-1:iy;p=(iy*IW+ix)*4;return[pix[p],pix[p+1],pix[p+2],pix[p+3]]
  }
  function pinW(lx,ly){
   var pn=0,k,dx,dy,ds;
   if(ly<200)pn=.98;else if(ly<230&&lx>130&&lx<340)pn=.78;else pn=Math.max(0,1-(ly-200)/200)*0.28;
   for(k=0;k<pins.length;k++){dx=lx-pins[k][0];dy=ly-pins[k][1];ds=Math.sqrt(dx*dx+dy*dy);if(ds<48)pn=Math.max(pn,1-ds/48)}
   if(ly>330)pn=Math.min(pn,.08);
   return pn>1?1:pn;
  }
  var col,row,nx=CNX,ny=CNY,grid=[],v;
  for(row=0;row<=ny;row++){
   grid[row]=[];
   for(col=0;col<=nx;col++){
    x=x0+col*(x1-x0)/nx;y=y0+row*(y1-y0)/ny;
    v={lx:x,ly:y,x:0,y:0,px:0,py:0,pin:pinW(x,y),alive:sample(x|0,y|0)[0]>10};
    grid[row][col]=cverts.length;cverts.push(v);
   }
  }
  function at(rr,cc){return sample((x0+cc*(x1-x0)/nx)|0,(y0+rr*(y1-y0)/ny)|0)}
  for(row=0;row<ny;row++)for(col=0;col<nx;col++){
   var a=at(row,col),b=at(row,col+1),c4=at(row+1,col),e=at(row+1,col+1);
   if(a[0]<12&&b[0]<12&&c4[0]<12&&e[0]<12)continue;
   var fr=(a[1]+b[1]+c4[1]+e[1])>200,bk=(a[2]+b[2]+c4[2]+e[2])>200;
   if(!fr&&!bk)bk=true;
   cquads.push({a:grid[row][col],b:grid[row][col+1],c:grid[row+1][col+1],d:grid[row+1][col],fr:fr,bk:bk||!fr});
   cverts[grid[row][col]].alive=true;cverts[grid[row][col+1]].alive=true;
   cverts[grid[row+1][col+1]].alive=true;cverts[grid[row+1][col]].alive=true;
  }
  function link(ia,ib){
   var va=cverts[ia],vb=cverts[ib];if(!va.alive||!vb.alive)return;
   var dx=va.lx-vb.lx,dy=va.ly-vb.ly;clinks.push({a:ia,b:ib,len:Math.sqrt(dx*dx+dy*dy)})
  }
  for(row=0;row<=ny;row++)for(col=0;col<=nx;col++){
   if(col<nx)link(grid[row][col],grid[row][col+1]);
   if(row<ny)link(grid[row][col],grid[row+1][col]);
  }
  capeReady=true;capeInit=false;capeDirty=true;
 }
 capeImg.onload=function(){buildCape();wake()};capeImg.src=CAPE;
 mskImg.onload=function(){buildCape();wake()};mskImg.src=CMSK;

 function imgToBox(lx,ly){
  var fit=Math.min(S/IW,SH/IH),dw=IW*fit,dh=IH*fit;
  return{x:(S-dw)/2+lx*fit,y:(SH-dh)/2+ly*fit}
 }
 function localToWorld(lx,ly){
  var p=imgToBox(lx,ly),ox=S*.5,oy=SH*.55;
  var dx=(p.x-ox)*SXd,dy=(p.y-oy)*SYd,th=rotDraw*Math.PI/180,c=Math.cos(th),s=Math.sin(th);
  return{x:left+ox+shX+c*dx-s*dy,y:CY+oy+shY+s*dx+c*dy}
 }

 /* ---- state ---- */
 var dbgShow=false,run=false,raf=0,last=0,py=w.pageYOffset||0,vs=0,vForce=null,heat=0,op=0,heroIn=true,armed=true,coolUntil=0,shown=false;
 var Y={x:0,v:0,init:false},R={x:0,v:0},P={x:0,v:0},bang=null,ember=[],emAcc=0,seeds=[],clean=true;
 var lastOp=-1,lastH1=-1,lastH2=-1,dbg={n:0,sum:0,max:0,over:0,fr:[]};
 var head=0,rTg=0; /* committed heading: 0 = upright / climb (head up), 180 = dive (head down) */
 var SX={x:1,v:0},SY={x:1,v:0},lean={x:0,v:0},splay={x:0,v:0},ant={x:0,v:0},wob={x:0,v:0};
 var headWas=0,wobDone=true,vsP=0,accS=0,prevAv=0,capeClear=true;
 for(var s=0;s<24;s++)seeds.push({o:Math.random()*1.1-.55,l:.45+Math.random()*.55,w:.8+Math.random()*1.8,p:Math.random()*6.28,k:.6+Math.random()});
 function clamp(x,a,b){return x<a?a:x>b?b:x}
 function sm(x,a,b){x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)}
 function spring(o,tg,k,c,dt){var n=Math.ceil(dt/.008),h=dt/n,i,a;for(i=0;i<n;i++){a=k*(tg-o.x)-c*o.v;o.v+=a*h;o.x+=o.v*h}}
 /* shortest signed turn in (-180, 180], so a flip never takes the long way or snaps */
 function turnTo(from,to){return from+(((to-from)%360+540)%360-180)}
 /* heat ramp: gold -> orange -> white-hot */
 function ramp(h){var r,g,b;if(h<.5){var u=h/.5;r=243+12*u;g=201-61*u;b=105-65*u}else{var u2=(h-.5)/.5;r=255;g=140+106*u2;b=40+190*u2}return[r|0,g|0,b|0]}
 function rgba(c,a){return'rgba('+c[0]+','+c[1]+','+c[2]+','+(a<0?0:a>1?1:a).toFixed(3)+')'}
 /* heading basis: forward is his head, back is his feet. 0deg = head up, 180deg = head down. */
 function basis(deg){var th=deg*Math.PI/180;return{fx:Math.sin(th),fy:-Math.cos(th),bx:-Math.sin(th),by:Math.cos(th),px:-Math.cos(th),py:-Math.sin(th),th:th}}

 function wake(){if(!run&&!d.hidden&&!(mq&&mq.matches)){run=true;last=0;raf=w.requestAnimationFrame(tick)}}
 function progress(){return clamp((w.pageYOffset||0)/(docH-vh),0,1)}

 /* sound barrier: crisp ring + vapor cone + edge flash, once per burst */
 function fire(dir){
  var b=basis(R.x);bang={t:perf.now(),dir:dir,fx:b.fx,fy:b.fy,bx:b.bx,by:b.by,px:b.px,py:b.py,th:b.th};P.v-=dir*7;R.v+=dir*140;
  SY.v-=.35;SX.v+=.2;wob.v+=dir*28;
  if(fl.animate)fl.animate([{opacity:0},{opacity:.9,offset:.14},{opacity:0}],{duration:620,easing:'cubic-bezier(.2,.7,.3,1)'});
  var i,n=46;for(i=0;i<n&&ember.length<150;i++)spawn(dir,1,true);
 }
 function spawn(dir,hc,burst){
  var a=Math.random()*6.283,sp=burst?120+Math.random()*320:60+Math.random()*200*Math.min(1,Math.abs(vs)/4000);
  var b=basis(R.x),back=Math.random()*SH*.3;
  ember.push({x:cx+b.bx*back+(Math.random()-.5)*S*.7,y:cy+b.by*back,
   vx:burst?Math.cos(a)*sp:b.bx*(50+Math.random()*(60+260*Math.abs(vs)/5000))+(Math.random()-.5)*70+(hc>.5?25:0),
   vy:burst?Math.sin(a)*sp:b.by*(50+Math.random()*(60+260*Math.abs(vs)/5000)),
   life:0,max:.5+Math.random()*.9,r:.9+Math.random()*1.9*(.6+hc),hc:clamp(hc*(.7+Math.random()*.4),0,1)});
 }

 var cx=0,cy=0;
 function tick(t){
  raf=0;if(!run)return;
  var c0=DBG?perf.now():0;
  var dt=last?Math.min(.05,(t-last)/1000):1/60;if(dt<=0)dt=1/60;
  if(DBG&&last){dbg.fr.push(t-last);if(dbg.fr.length>600)dbg.fr.shift()}
  last=t;
  /* velocity: sampled per frame (no scroll-handler work), asymmetric EMA so it ramps in fast and fades out slowly */
  var y=w.pageYOffset||0,jump=Math.abs(y-py)>vh*1.5,raw=vForce!==null?vForce:(jump?0:clamp((y-py)/dt,-12000,12000));py=y; /* an instant jump (not a scroll) is ignored */
  var tau=Math.abs(raw)>Math.abs(vs)?.07:.3;vs+=(raw-vs)*(1-Math.exp(-dt/tau));
  var av=Math.abs(vs),dir=vs>=0?1:-1,m=sm(av,T.trail,T.full);
  accS+=((vs-vsP)/Math.max(dt,1e-4)-accS)*(1-Math.exp(-dt/.08));vsP=vs;
  var ht=sm(av,T.heat0,T.heat1);heat+=(ht-heat)*(1-Math.exp(-dt*(ht>heat?5:.9)));if(heat<.003&&ht===0)heat=0;
  /* once per burst: re-arms only after he has slowed and cooled */
  if(armed&&av>T.barrier&&t>coolUntil){armed=false;coolUntil=t+T.cool;heat=1;fire(dir)}
  else if(!armed&&av<T.rearm&&t>coolUntil)armed=true;
  /* visibility: only once the hero is out of view */
  var want=(!dbgShow&&(heroIn||(w.pageYOffset||0)<40))?0:1;op+=(want-op)*(1-Math.exp(-dt/.2));if(Math.abs(want-op)<.004)op=want;
  if(op>0&&!shown){shown=true;root.classList.add('tbs-on');Y.init=false;capeInit=false}
  /* springs: position follows scroll progress like a thumb, dives with speed, settles with a little overshoot */
  var base=yMin+progress()*(yMax-yMin),yT=base+clamp(vs/5000,-1,1)*40;
  if(!Y.init){Y.x=yT;Y.v=0;Y.init=true}
  spring(Y,yT,150,15,dt);
  /* heading: dive at ~180 when going down, head-up at 0 when going up; a deadband stops slow wiggle from flipping him; idle eases upright */
  if(av>T.flip)head=vs>0?180:0;
  else if(av<T.idle)head=0;
  if(head!==headWas){ant.v+=(headWas-head)*0.55;wobDone=false;headWas=head}
  spring(ant,0,150,16,dt);if(Math.abs(ant.x)<.05&&Math.abs(ant.v)<.2){ant.x=0;ant.v=0}
  var nr=((R.x%360)+360)%360;
  if(!wobDone&&av>T.idle){
   if(head===180&&nr>78&&nr<150){wob.v+=85;wobDone=true}
   else if(head===0&&nr>210&&nr<282){wob.v-=85;wobDone=true}
  }
  spring(wob,0,72,7.2,dt);if(Math.abs(wob.x)<.05&&Math.abs(wob.v)<.3){wob.x=0;wob.v=0}
  /* lean into acceleration; lag when slowing (acc opposite velocity) */
  spring(lean,clamp(accS/7000,-1,1)*14,62,11,dt);
  /* tuck narrower at speed; splay on a hard stop */
  var splayTg=-.075*m;if(av<T.idle&&prevAv>T.trail&&accS<-1500)splay.v+=.55;
  spring(splay,splayTg,95,12,dt);
  var flipping=av>T.flip||Math.abs(R.v)>40;
  rTg=turnTo(R.x,head+clamp(vs/4500,-1,1)*11);
  spring(R,rTg,flipping?68:80,flipping?13:18,dt);
  if(av<T.idle&&Math.abs(R.v)<8){var nw=((R.x%360)+360)%360;if(nw>180)nw-=360;if(Math.abs(nw)<12)R.x=nw}
  spring(P,0,300,14,dt);
  var near=sm(av,T.barrier-800,T.barrier);
  var shAmp=(heat>.7?1.3*sm(heat,.7,1):0)+near*2.05;
  shX=Math.sin(t*.11)*shAmp;shY=Math.cos(t*.127)*shAmp*.65;
  var shR=Math.sin(t*.15)*shAmp*.4;
  var yy=clamp(Y.x,yMin-6,yMax+10);
  cx=left+S/2;cy=yy+SH/2;CY=yy;
  var stTg=(1+.16*m+.1*sm(av,T.heat1*.7,T.barrier))*(1+P.x);
  var sqTg=(1-.08*m+splay.x)*(1+P.x);
  spring(SY,stTg,130,16,dt);spring(SX,sqTg,130,16,dt);
  SXd=SX.x;SYd=SY.x;rotDraw=R.x+ant.x+wob.x+lean.x+shR;
  bot.style.transform='translate3d('+(left+shX).toFixed(2)+'px,'+(yy+shY).toFixed(2)+'px,0) rotate('+rotDraw.toFixed(2)+'deg)';
  rig.style.transform='scale('+SXd.toFixed(3)+','+SYd.toFixed(3)+')';
  if(Math.abs(op-lastOp)>.003){live.style.opacity=op.toFixed(3);lastOp=op}
  var h1=sm(heat,0,.55),h2=sm(heat,.5,1);
  if(Math.abs(h1-lastH1)>.004){l1.style.opacity=h1.toFixed(3);lastH1=h1}
  if(Math.abs(h2-lastH2)>.004){l2.style.opacity=h2.toFixed(3);lastH2=h2}

  /* ---- cape ---- */
  if(capeReady&&op>.01)stepCape(t,dt,m,av);
  else if(!capeClear&&op<=.01){ctxb.setTransform(dpr,0,0,dpr,0,0);ctxb.clearRect(0,0,vw,vh);ctxf.setTransform(dpr,0,0,dpr,0,0);ctxf.clearRect(0,0,vw,vh);capeClear=true}

  /* ---- canvas fx ---- */
  var wantDraw=op>.01&&(m>.02||heat>.01||ember.length||bang||Math.abs(R.v)>8);
  if(wantDraw){clean=false;ctx.clearRect(0,0,vw,vh);ctx.globalCompositeOperation='lighter';draw(t,dt,m,dir)}
  else if(!clean){ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,vw,vh);clean=true}

  if(shown&&op===0&&want===0){shown=false;root.classList.remove('tbs-on')}
  if(DBG){var e=perf.now()-c0;dbg.n++;dbg.sum+=e;if(e>dbg.max)dbg.max=e;if(e>4)dbg.over++}
  prevAv=av;
  /* keep running only while something is moving */
  var busy=av>2||heat>.004||ember.length||bang||Math.abs(op-want)>0||Math.abs(Y.x-yT)>.3||Math.abs(Y.v)>2||Math.abs(R.v)>.5||Math.abs(R.x-rTg)>.4||Math.abs(P.x)>.002||vForce!==null
   ||Math.abs(SX.v)>.002||Math.abs(SY.v)>.002||Math.abs(SX.x-sqTg)>.004||Math.abs(SY.x-stTg)>.004
   ||Math.abs(lean.x)>.15||Math.abs(lean.v)>.2||Math.abs(ant.x)>.15||Math.abs(wob.x)>.15||Math.abs(splay.v)>.02||capeBusy>.8||shAmp>.05;
  if(busy&&!d.hidden)raf=w.requestAnimationFrame(tick);else run=false;
 }

 function stepCape(t,dt,m,av){
  var i,n=cverts.length,v,rest,b=basis(rotDraw),stiff,damp,fx,fy,vx,vy,nx,ny,pin,stretch,along,fl,k,L,dx,dy,ds,dif,pa,pb,ra,rb,it,mx=0;
  stretch=1+.4*m+.22*sm(av,3000,T.barrier);
  damp=.9-.12*m;if(av<T.idle)damp=.94;
  var air=50+520*m,grav=240*(1-m*.75),flipAmt=clamp(Math.abs(R.v)/420,0,1);
  if(!capeInit){for(i=0;i<n;i++){v=cverts[i];if(!v.alive)continue;rest=localToWorld(v.lx,v.ly);v.x=v.px=rest.x;v.y=v.py=rest.y}capeInit=true}
  for(i=0;i<n;i++){
   v=cverts[i];if(!v.alive)continue;
   rest=localToWorld(v.lx,v.ly);
   /* hem stretches back (toward his feet) with speed */
   along=(1-v.pin)*(stretch-1)*(40+0.12*(v.ly-180));
   rest.x+=b.bx*along;rest.y+=b.by*along;
   pin=v.pin;
   if(pin>.95){v.px=v.x;v.py=v.y;v.x=rest.x;v.y=rest.y;continue}
   vx=v.x-v.px;vy=v.y-v.py;
   fl=(10+90*m)*Math.sin(t*.009+v.ly*.035+v.lx*.02)*(1-pin);
   fx=b.bx*air+b.px*fl;fy=b.by*air+grav+b.py*fl;
   nx=v.x+vx*damp+fx*dt*dt;ny=v.y+vy*damp+fy*dt*dt;
   stiff=(.16+.8*pin)*(1-.5*m*(1-pin))*(1-.45*flipAmt*(1-pin));
   if(av<T.idle)stiff=Math.min(.92,.5+.5*pin);
   var mix=1-Math.pow(1-stiff,dt*60);
   nx+=(rest.x-nx)*mix;ny+=(rest.y-ny)*mix;
   v.px=v.x;v.py=v.y;v.x=nx;v.y=ny;
   var er=Math.abs(v.x-rest.x)+Math.abs(v.y-rest.y)+Math.abs(vx)+Math.abs(vy);if(er>mx)mx=er;
  }
  var hold=1+.28*m,iters=3;
  for(it=0;it<iters;it++){
   for(k=0;k<clinks.length;k++){
    L=clinks[k];pa=cverts[L.a];pb=cverts[L.b];
    if(!pa.alive||!pb.alive)continue;
    dx=pb.x-pa.x;dy=pb.y-pa.y;ds=Math.sqrt(dx*dx+dy*dy)||1e-6;
    var restL=L.len*(S/IW)*((SXd+SYd)*.5)*hold;
    /* convert rest length from image px to world px */
    restL=L.len*Math.min(S/IW,SH/IH)*((SXd+SYd)*.5)*hold;
    dif=(ds-restL)/ds;
    ra=1-pa.pin;rb=1-pb.pin;var den=ra+rb;if(den<.02)continue;
    var shf=dif*.42;pa.x+=dx*shf*(ra/den);pa.y+=dy*shf*(ra/den);pb.x-=dx*shf*(rb/den);pb.y-=dy*shf*(rb/den);
   }
  }
  capeBusy=mx;
  drawCape(t,m);
 }

 function drawTri(g,im,x0,y0,x1,y1,x2,y2,u0,v0,u1,v1,u2,v2){
  /* slightly inflate dest to hide 1px cracks between adjacent triangles */
  var cx3=(x0+x1+x2)/3,cy3=(y0+y1+y2)/3,s=.4;
  x0+=x0>cx3?s:-s;y0+=y0>cy3?s:-s;x1+=x1>cx3?s:-s;y1+=y1>cy3?s:-s;x2+=x2>cx3?s:-s;y2+=y2>cy3?s:-s;
  var den=u0*(v1-v2)+u1*(v2-v0)+u2*(v0-v1);if(Math.abs(den)<1e-5)return;
  var m11=(x0*(v1-v2)+x1*(v2-v0)+x2*(v0-v1))/den;
  var m12=(y0*(v1-v2)+y1*(v2-v0)+y2*(v0-v1))/den;
  var m21=(x0*(u2-u1)+x1*(u0-u2)+x2*(u1-u0))/den;
  var m22=(y0*(u2-u1)+y1*(u0-u2)+y2*(u1-u0))/den;
  var dx=(x0*(u1*v2-u2*v1)+x1*(u2*v0-u0*v2)+x2*(u0*v1-u1*v0))/den;
  var dy=(y0*(u1*v2-u2*v1)+y1*(u2*v0-u0*v2)+y2*(u0*v1-u1*v0))/den;
  g.save();
  g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.lineTo(x2,y2);g.closePath();g.clip();
  g.setTransform(m11*dpr,m12*dpr,m21*dpr,m22*dpr,dx*dpr,dy*dpr);
  g.drawImage(im,0,0);
  g.restore();
 }
 function drawCape(t,m){
  if(!capeReady||!capeImg.naturalWidth)return;
  var hc=ramp(heat),o=op,i,q,a,b,c,e,glow=.18+.55*heat+.2*m;
  function pass(g,front){
   g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,vw,vh);g.globalAlpha=o;
   if(glow>.2&&!front){g.save();g.shadowColor=rgba(hc,.55*o);g.shadowBlur=18+28*heat;g.globalAlpha=o}
   for(i=0;i<cquads.length;i++){
    q=cquads[i];if(front? !q.fr : !q.bk)continue;
    a=cverts[q.a];b=cverts[q.b];c=cverts[q.c];e=cverts[q.d];
    drawTri(g,capeImg,a.x,a.y,b.x,b.y,c.x,c.y,a.lx,a.ly,b.lx,b.ly,c.lx,c.ly);
    drawTri(g,capeImg,a.x,a.y,c.x,c.y,e.x,e.y,a.lx,a.ly,c.lx,c.ly,e.lx,e.ly);
   }
   if(glow>.2&&!front)g.restore();
   if(heat>.04){g.globalCompositeOperation='source-atop';g.globalAlpha=(.22*sm(heat,0,.55)+.55*sm(heat,.5,1))*o;
    g.fillStyle=rgba(hc,1);g.fillRect(0,0,vw,vh);g.globalCompositeOperation='source-over';g.globalAlpha=1}
   else g.globalAlpha=1;
  }
  pass(ctxb,false);pass(ctxf,true);capeClear=false;capeDirty=false;
 }

 function draw(t,dt,m,dir){
  var c,i,n,k,g;
  var hc=ramp(heat),o=op,b=basis(R.x);
  /* bloom + heat shimmer glow behind him (toward his feet) */
  var rad=S*(.55+.9*heat+.35*m),ba=(.10+.5*heat+.18*m)*o*(.92+.08*Math.sin(t*.012));
  var gx=cx+b.bx*S*.12,gy=cy+b.by*S*.12;
  g=ctx.createRadialGradient(gx,gy,0,gx,gy,rad);g.addColorStop(0,rgba(hc,ba));g.addColorStop(.45,rgba(hc,ba*.35));g.addColorStop(1,rgba(hc,0));
  ctx.fillStyle=g;ctx.fillRect(gx-rad,gy-rad,rad*2,rad*2);
  if(heat>.2){ /* faint wavy heat-haze bands streaming off his feet */
   ctx.lineCap='round';
   for(i=0;i<4;i++){var off=(i-1.5)*S*.22,ln=SH*(.5+.7*heat),a=.05+.1*heat;
    ctx.strokeStyle=rgba(hc,a*o*(1-i*.12));ctx.lineWidth=S*.1;ctx.beginPath();
    for(k=0;k<=8;k++){var u=k/8,along=SH*.15+u*ln,wob2=Math.sin(t*.006+u*5+i*1.7)*S*.05*(.4+u);
     var xx=cx+b.bx*along+b.px*(off+wob2),yy2=cy+b.by*along+b.py*(off+wob2);if(k)ctx.lineTo(xx,yy2);else ctx.moveTo(xx,yy2)}
    ctx.stroke()}
  }
  /* layered motion-blur streaks streaming from his feet */
  if(m>.02){
   n=Math.round(6+16*m);ctx.lineCap='round';
   var x0=cx+b.bx*SH*.18,y0b=cy+b.by*SH*.18;
   for(i=0;i<n;i++){var sd=seeds[i],len=(34+330*m*sd.l)*(.88+.12*Math.sin(t*.011*sd.k+sd.p));
    var xs=x0+b.px*sd.o*S*.85,ys=y0b+b.py*sd.o*S*.85,xe=xs+b.bx*len,ye=ys+b.by*len;
    var a1=(.1+.5*m)*sd.l*o,col=ramp(clamp(heat*.9+.1*sd.l*m,0,1));
    g=ctx.createLinearGradient(xs,ys,xe,ye);g.addColorStop(0,rgba(col,a1));g.addColorStop(.5,rgba(col,a1*.35));g.addColorStop(1,rgba(col,0));
    ctx.strokeStyle=g;ctx.lineWidth=sd.w*3.2;ctx.globalAlpha=.32;ctx.beginPath();ctx.moveTo(xs,ys);ctx.lineTo(xe,ye);ctx.stroke();
    ctx.globalAlpha=1;ctx.lineWidth=sd.w;ctx.beginPath();ctx.moveTo(xs,ys);ctx.lineTo(xe,ye);ctx.stroke()}
  }
  /* soft afterimages, trailing from his feet and rotated with him */
  if(sprites&&m>.05){
   n=Math.round(2+5*m);var s1=sm(heat,0,.55),s2=sm(heat,.5,1),wt=[1-s1,s1*(1-s2),s2],gap=14+20*m;
   for(i=1;i<=n;i++){var ga=.24*m*(1-(i-1)/n)*o,stch=1+.05*i*m,ax=cx+b.bx*i*gap,ay=cy+b.by*i*gap;
    ctx.save();ctx.translate(ax,ay);ctx.rotate(b.th);
    for(k=0;k<3;k++){if(wt[k]<.03)continue;ctx.globalAlpha=ga*wt[k];
     ctx.drawImage(sprites[k],-S*stch/2,-SH*stch/2,S*stch,SH*stch)}
    ctx.restore()}
   ctx.globalAlpha=1;
  }
  /* embers that drift off his feet */
  if(m>.12){emAcc+=(8+170*m*(.35+heat))*dt;while(emAcc>=1){emAcc--;if(ember.length<150)spawn(dir,heat,false)}}
  if(ember.length){
   var drag=Math.exp(-1.6*dt);
   for(i=ember.length-1;i>=0;i--){var e=ember[i];e.life+=dt;if(e.life>=e.max){ember[i]=ember[ember.length-1];ember.pop();continue}
    e.vx*=drag;e.vy*=drag;e.vy-=45*dt;e.x+=(e.vx+Math.sin(e.life*9+e.x*.05)*12)*dt;e.y+=e.vy*dt;
    var f=1-e.life/e.max,ea=f*f*o*.95;ctx.fillStyle=rgba(ramp(e.hc),ea);
    if(e.r<1.5)ctx.fillRect(e.x-e.r,e.y-e.r,e.r*2,e.r*2);else{ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,6.2832);ctx.fill()}}
  }
  ctx.globalAlpha=1;
  if(bang)drawBang(t);
 }

 function drawBang(t){
  var a=(t-bang.t)/1000,i,g;
  if(a>1.4){bang=null;return}
  var eo=function(x){x=clamp(x,0,1);return 1-Math.pow(1-x,3)},env=a<.1?a/.1:Math.exp(-(a-.1)*3.1);
  var K=narrow?.5:1,ax=cx+bang.fx*SH*.12,ay=cy+bang.fy*SH*.12; /* nose; the burst is smaller and fainter on narrow screens so it stays out of the text */
  env*=narrow?.75:1;
  /* vapor cone, opening behind him from his feet (Prandtl-Glauert style condensation) */
  var L=(90+330*eo(a/.55))*K,hw=L*Math.tan(.5),tx=ax+bang.bx*L,ty=ay+bang.by*L;
  g=ctx.createLinearGradient(ax,ay,tx,ty);g.addColorStop(0,'rgba(255,244,222,'+(.55*env).toFixed(3)+')');g.addColorStop(.55,'rgba(255,226,170,'+(.2*env).toFixed(3)+')');g.addColorStop(1,'rgba(255,210,140,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(tx-hw*bang.px,ty-hw*bang.py);ctx.lineTo(tx+hw*bang.px,ty+hw*bang.py);ctx.closePath();ctx.fill();
  /* flattened vapor disc, perpendicular to his heading */
  var dr=(40+240*eo(a/.9))*K,dx=ax+bang.bx*SH*.3,dy=ay+bang.by*SH*.3;
  ctx.strokeStyle='rgba(255,240,208,'+(.22*env).toFixed(3)+')';ctx.lineWidth=12*(1-clamp(a/1.2,0,1))+2;
  ctx.beginPath();ctx.ellipse(dx,dy,dr,dr*.27,bang.th,0,6.2832);ctx.stroke();
  ctx.strokeStyle='rgba(255,250,236,'+(.6*env).toFixed(3)+')';ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(dx,dy,dr,dr*.27,bang.th,0,6.2832);ctx.stroke();
  /* crisp shock rings */
  for(i=0;i<2;i++){var p=clamp((a-i*.12)/.85,0,1);if(p<=0||p>=1)continue;
   var rr=((i?210:370)*eo(p)+14)*K,al=Math.pow(1-p,1.6);
   ctx.strokeStyle=i?'rgba(243,201,105,'+(.55*al).toFixed(3)+')':'rgba(255,246,226,'+(.85*al).toFixed(3)+')';
   ctx.lineWidth=(i?3:5.5)*(1-p)+1;ctx.beginPath();ctx.arc(cx,cy,rr,0,6.2832);ctx.stroke();
   ctx.strokeStyle='rgba(243,201,105,'+(.2*al).toFixed(3)+')';ctx.lineWidth=(i?9:16)*(1-p)+2;ctx.beginPath();ctx.arc(cx,cy,rr,0,6.2832);ctx.stroke()}
  /* core flash */
  var fa=Math.exp(-a*8)*.85,fr=S*(.9+1.6*a)*(narrow?.8:1);
  g=ctx.createRadialGradient(cx,cy,0,cx,cy,fr);g.addColorStop(0,'rgba(255,252,240,'+fa.toFixed(3)+')');g.addColorStop(1,'rgba(255,220,150,0)');
  ctx.fillStyle=g;ctx.fillRect(cx-fr,cy-fr,fr*2,fr*2);
 }

 /* ---- wiring ---- */
 if('IntersectionObserver' in w&&hero){
  new IntersectionObserver(function(es){heroIn=es[es.length-1].isIntersecting;wake()},{threshold:0}).observe(hero);
 }else heroIn=false;
 w.addEventListener('scroll',wake,{passive:true});
 w.addEventListener('resize',function(){measure()},{passive:true});
 d.addEventListener('visibilitychange',function(){if(d.hidden){if(raf)w.cancelAnimationFrame(raf);raf=0;run=false}else{py=w.pageYOffset||0;wake()}});
 if(mq&&mq.addEventListener)mq.addEventListener('change',function(){if(mq.matches){run=false;if(raf)w.cancelAnimationFrame(raf);raf=0;root.classList.remove('tbs-on');root.style.display='none'}});
 if('ResizeObserver' in w){var ro=0;new ResizeObserver(function(){if(ro)return;ro=w.requestAnimationFrame(function(){ro=0;measure()})}).observe(d.body)}
 measure();
 if(DBG)w.__tbScroll={
  force:function(v){vForce=v;wake()},show:function(b){dbgShow=!!b;wake()},release:function(){vForce=null;wake()},
  state:function(){return{vs:vs,heat:heat,op:op,armed:armed,bang:!!bang,embers:ember.length,y:Y.x,rot:R.x,rotDraw:rotDraw,head:head,rTg:rTg,left:left,S:S,SH:SH,narrow:narrow,yMin:yMin,yMax:yMax,heroIn:heroIn,running:run,sx:SX.x,sy:SY.x,lean:lean.x,wob:wob.x,ant:ant.x,cape:capeBusy}},
  stats:function(){var f=dbg.fr.slice().sort(function(a,b){return a-b}),s=0;f.forEach(function(x){s+=x});
   return{ticks:dbg.n,cpuAvg:dbg.sum/Math.max(1,dbg.n),cpuMax:dbg.max,cpuOver4:dbg.over,frames:f.length,frameAvg:s/Math.max(1,f.length),frameP95:f[Math.floor(f.length*.95)]||0,frameMax:f[f.length-1]||0}},
  reset:function(){dbg.n=0;dbg.sum=0;dbg.max=0;dbg.over=0;dbg.fr=[]},
  armReset:function(){armed=true;coolUntil=0;heat=0;vs=0}
 };
})();
