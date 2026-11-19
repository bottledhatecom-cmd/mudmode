/* tylerbot-scroll ts1: a copy of the Tylerbot hero robot rides the side of the page once the hero scrolls away.
   Scroll speed (smoothed) drives motion-blur streaks, afterimages and embers; fast enough and he heats from gold to white-hot,
   then breaks the sound barrier (shockwave ring, vapor cone, edge flash), once per burst, and cools down.
   Optional extra: the page works with this file turned off. No sound, no storage, no cookies, no network.
   Uses the existing still image only. Reads nothing from the hero's markup except its position, and never touches the hero or its scripts. Off for reduced motion. */
(function(){
 'use strict';
 var d=document,w=window,perf=w.performance||Date;
 if(!d.body||!w.requestAnimationFrame||!d.createElement('canvas').getContext)return;
 var mq=w.matchMedia?w.matchMedia('(prefers-reduced-motion: reduce)'):null;
 if(mq&&mq.matches)return;

 /* ---- thresholds (px of page scroll per second, after smoothing) ---- */
 var T={trail:200,full:3800,heat0:2200,heat1:5000,barrier:5200,rearm:2400,cool:1700};
 var STILL='img/tylerbot/tylerbot-flare-still.webp?v=f468';
 var DBG=/[?&]tbs=debug/.test(w.location.search);

 var hero=d.querySelector('[data-tyler-play]')||d.querySelector('.tylerbot')||d.getElementById('start');
 var src=STILL; /* always the existing still, so it looks the same whether the hero shows the still or a video */

 /* ---- DOM (all aria-hidden, click-through) ---- */
 var root=d.createElement('div');root.className='tbs';root.setAttribute('aria-hidden','true');
 var cv=d.createElement('canvas');cv.className='tbs-fx';
 var bot=d.createElement('div');bot.className='tbs-bot';
 var bob=d.createElement('div');bob.className='tbs-bob';
 function mk(c){var i=d.createElement('img');i.className='tbs-i '+c;i.alt='';i.setAttribute('aria-hidden','true');i.decoding='async';i.draggable=false;i.src=src;return i}
 var l0=mk('tbs-l0'),l1=mk('tbs-l1'),l2=mk('tbs-l2');
 bob.appendChild(l0);bob.appendChild(l1);bob.appendChild(l2);bot.appendChild(bob);
 var fl=d.createElement('div');fl.className='tbs-flash';
 root.appendChild(cv);root.appendChild(bot);root.appendChild(fl);
 d.body.appendChild(root);
 var ctx=cv.getContext('2d');

 /* ---- geometry (measured on load/resize only, never per frame) ---- */
 var vw=0,vh=0,dpr=1,docH=1,S=150,SH=160,vis=150,left=0,yMin=70,yMax=500,narrow=false;
 var sprites=null,img=new Image();
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
  cv.width=Math.round(vw*dpr);cv.height=Math.round(vh*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  buildSprites();wake();
 }
 /* tinted silhouettes of the same still, for the soft afterimages (gold, orange, white-hot) */
 function buildSprites(){
  if(!img.complete||!img.naturalWidth)return;
  var cols=['rgba(243,201,105,.8)','rgba(255,138,40,.85)','rgba(255,246,228,.9)'],o=[];
  for(var i=0;i<3;i++){var c=d.createElement('canvas');c.width=Math.round(S*dpr);c.height=Math.round(SH*dpr);var g=c.getContext('2d');
   g.drawImage(img,0,0,c.width,c.height);g.globalCompositeOperation='source-atop';g.fillStyle=cols[i];g.fillRect(0,0,c.width,c.height);o.push(c)}
  sprites=o;
 }
 img.onload=function(){buildSprites();wake()};img.src=src;

 /* ---- state ---- */
 var dbgShow=false,run=false,raf=0,last=0,py=w.pageYOffset||0,vs=0,vForce=null,heat=0,op=0,heroIn=true,armed=true,coolUntil=0,shown=false;
 var Y={x:0,v:0,init:false},R={x:0,v:0},P={x:0,v:0},bang=null,ember=[],emAcc=0,seeds=[],clean=true;
 var lastOp=-1,lastH1=-1,lastH2=-1,dbg={n:0,sum:0,max:0,over:0,fr:[]};
 for(var s=0;s<24;s++)seeds.push({o:Math.random()*1.1-.55,l:.45+Math.random()*.55,w:.8+Math.random()*1.8,p:Math.random()*6.28,k:.6+Math.random()});
 function clamp(x,a,b){return x<a?a:x>b?b:x}
 function sm(x,a,b){x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)}
 function spring(o,tg,k,c,dt){var n=Math.ceil(dt/.008),h=dt/n,i,a;for(i=0;i<n;i++){a=k*(tg-o.x)-c*o.v;o.v+=a*h;o.x+=o.v*h}}
 /* heat ramp: gold -> orange -> white-hot */
 function ramp(h){var r,g,b;if(h<.5){var u=h/.5;r=243+12*u;g=201-61*u;b=105-65*u}else{var u2=(h-.5)/.5;r=255;g=140+106*u2;b=40+190*u2}return[r|0,g|0,b|0]}
 function rgba(c,a){return'rgba('+c[0]+','+c[1]+','+c[2]+','+(a<0?0:a>1?1:a).toFixed(3)+')'}

 function wake(){if(!run&&!d.hidden&&!(mq&&mq.matches)){run=true;last=0;raf=w.requestAnimationFrame(tick)}}
 function progress(){return clamp((w.pageYOffset||0)/(docH-vh),0,1)}

 /* sound barrier: crisp ring + vapor cone + edge flash, once per burst */
 function fire(dir){
  bang={t:perf.now(),dir:dir};P.v-=dir*7;R.v+=dir*140;
  if(fl.animate)fl.animate([{opacity:0},{opacity:.9,offset:.14},{opacity:0}],{duration:620,easing:'cubic-bezier(.2,.7,.3,1)'});
  var i,n=46;for(i=0;i<n&&ember.length<150;i++)spawn(dir,1,true);
 }
 function spawn(dir,hc,burst){
  var a=Math.random()*6.283,sp=burst?120+Math.random()*320:60+Math.random()*200*Math.min(1,Math.abs(vs)/4000);
  ember.push({x:cx+(Math.random()-.5)*S*.7,y:cy-dir*(Math.random()*SH*.3),
   vx:burst?Math.cos(a)*sp:(Math.random()-.5)*70+(hc>.5?25:0),vy:burst?Math.sin(a)*sp:-dir*(50+Math.random()*(60+260*Math.abs(vs)/5000)),
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
  var ht=sm(av,T.heat0,T.heat1);heat+=(ht-heat)*(1-Math.exp(-dt*(ht>heat?5:.9)));if(heat<.003&&ht===0)heat=0;
  /* once per burst: re-arms only after he has slowed and cooled */
  if(armed&&av>T.barrier&&t>coolUntil){armed=false;coolUntil=t+T.cool;heat=1;fire(dir)}
  else if(!armed&&av<T.rearm&&t>coolUntil)armed=true;
  /* visibility: only once the hero is out of view */
  var want=(!dbgShow&&(heroIn||(w.pageYOffset||0)<40))?0:1;op+=(want-op)*(1-Math.exp(-dt/.2));if(Math.abs(want-op)<.004)op=want;
  if(op>0&&!shown){shown=true;root.classList.add('tbs-on');Y.init=false}
  /* springs: position follows scroll progress like a thumb, dives with speed, settles with a little overshoot */
  var base=yMin+progress()*(yMax-yMin),yT=base+clamp(vs/5000,-1,1)*40;
  if(!Y.init){Y.x=yT;Y.v=0;Y.init=true}
  spring(Y,yT,150,15,dt);
  var shake=heat>.7?Math.sin(t*.09)*1.3*sm(heat,.7,1):0;
  spring(R,clamp(vs/4500,-1,1)*11+shake,140,12,dt);
  spring(P,0,300,14,dt);
  var yy=clamp(Y.x,yMin-6,yMax+10);
  cx=left+S/2;cy=yy+SH/2;
  var sy=(1+.14*m)*(1+P.x),sx=(1-.07*m)*(1+P.x);
  bot.style.transform='translate3d('+left.toFixed(2)+'px,'+yy.toFixed(2)+'px,0) rotate('+R.x.toFixed(2)+'deg) scale('+sx.toFixed(3)+','+sy.toFixed(3)+')';
  if(Math.abs(op-lastOp)>.003){bot.style.opacity=op.toFixed(3);lastOp=op}
  var h1=sm(heat,0,.55),h2=sm(heat,.5,1);
  if(Math.abs(h1-lastH1)>.004){l1.style.opacity=h1.toFixed(3);lastH1=h1}
  if(Math.abs(h2-lastH2)>.004){l2.style.opacity=h2.toFixed(3);lastH2=h2}

  /* ---- canvas fx ---- */
  var wantDraw=op>.01&&(m>.02||heat>.01||ember.length||bang);
  if(wantDraw){clean=false;ctx.clearRect(0,0,vw,vh);ctx.globalCompositeOperation='lighter';draw(t,dt,m,dir)}
  else if(!clean){ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,vw,vh);clean=true}

  if(shown&&op===0&&want===0){shown=false;root.classList.remove('tbs-on')}
  if(DBG){var e=perf.now()-c0;dbg.n++;dbg.sum+=e;if(e>dbg.max)dbg.max=e;if(e>4)dbg.over++}
  /* keep running only while something is moving */
  var busy=av>2||heat>.004||ember.length||bang||Math.abs(op-want)>0||Math.abs(Y.x-yT)>.3||Math.abs(Y.v)>2||Math.abs(R.v)>.5||Math.abs(P.x)>.002||vForce!==null;
  if(busy&&!d.hidden)raf=w.requestAnimationFrame(tick);else run=false;
 }

 function draw(t,dt,m,dir){
  var c,i,n,k,g;
  var hc=ramp(heat),o=op;
  /* bloom + heat shimmer glow behind him */
  var rad=S*(.55+.9*heat+.35*m),ba=(.10+.5*heat+.18*m)*o*(.92+.08*Math.sin(t*.012));
  g=ctx.createRadialGradient(cx,cy,0,cx,cy,rad);g.addColorStop(0,rgba(hc,ba));g.addColorStop(.45,rgba(hc,ba*.35));g.addColorStop(1,rgba(hc,0));
  ctx.fillStyle=g;ctx.fillRect(cx-rad,cy-rad,rad*2,rad*2);
  if(heat>.2){ /* faint wavy heat-haze bands rising off him */
   ctx.lineCap='round';
   for(i=0;i<4;i++){var bx=cx+(i-1.5)*S*.22,ln=SH*(.5+.7*heat),a=.05+.1*heat;
    ctx.strokeStyle=rgba(hc,a*o*(1-i*.12));ctx.lineWidth=S*.1;ctx.beginPath();
    for(k=0;k<=8;k++){var u=k/8,yy2=cy-dir*(SH*.15+u*ln),xx=bx+Math.sin(t*.006+u*5+i*1.7)*S*.05*(.4+u);if(k)ctx.lineTo(xx,yy2);else ctx.moveTo(xx,yy2)}
    ctx.stroke()}
  }
  /* layered motion-blur streaks: above him going down, below going up */
  if(m>.02){
   n=Math.round(6+16*m);ctx.lineCap='round';
   var y0b=cy-dir*SH*.18;
   for(i=0;i<n;i++){var sd=seeds[i],len=(34+330*m*sd.l)*(.88+.12*Math.sin(t*.011*sd.k+sd.p)),x=cx+sd.o*S*.85,ye=y0b-dir*len;
    var a1=(.1+.5*m)*sd.l*o,col=ramp(clamp(heat*.9+.1*sd.l*m,0,1));
    g=ctx.createLinearGradient(x,y0b,x,ye);g.addColorStop(0,rgba(col,a1));g.addColorStop(.5,rgba(col,a1*.35));g.addColorStop(1,rgba(col,0));
    ctx.strokeStyle=g;ctx.lineWidth=sd.w*3.2;ctx.globalAlpha=.32;ctx.beginPath();ctx.moveTo(x,y0b);ctx.lineTo(x,ye);ctx.stroke();
    ctx.globalAlpha=1;ctx.lineWidth=sd.w;ctx.beginPath();ctx.moveTo(x,y0b);ctx.lineTo(x,ye-0);ctx.stroke()}
  }
  /* soft afterimages, trailing opposite the scroll */
  if(sprites&&m>.05){
   n=Math.round(2+5*m);var s1=sm(heat,0,.55),s2=sm(heat,.5,1),wt=[1-s1,s1*(1-s2),s2],gap=14+20*m;
   for(i=1;i<=n;i++){var ga=.24*m*(1-(i-1)/n)*o,gy=cy-dir*i*gap,stch=1+.05*i*m;
    for(k=0;k<3;k++){if(wt[k]<.03)continue;ctx.globalAlpha=ga*wt[k];
     ctx.drawImage(sprites[k],cx-S*stch/2,gy-SH*stch/2+(stch-1)*dir*SH*.4,S*stch,SH*stch)}}
   ctx.globalAlpha=1;
  }
  /* embers that drift off */
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
  var a=(t-bang.t)/1000,dir=bang.dir,i,g;
  if(a>1.4){bang=null;return}
  var eo=function(x){x=clamp(x,0,1);return 1-Math.pow(1-x,3)},env=a<.1?a/.1:Math.exp(-(a-.1)*3.1);
  var K=narrow?.5:1,ax=cx,ay=cy+dir*SH*.12; /* nose; the burst is smaller and fainter on narrow screens so it stays out of the text */
  env*=narrow?.75:1;
  /* vapor cone, opening behind him (Prandtl-Glauert style condensation) */
  var L=(90+330*eo(a/.55))*K,hw=L*Math.tan(.5),ty=ay-dir*L;
  g=ctx.createLinearGradient(ax,ay,ax,ty);g.addColorStop(0,'rgba(255,244,222,'+(.55*env).toFixed(3)+')');g.addColorStop(.55,'rgba(255,226,170,'+(.2*env).toFixed(3)+')');g.addColorStop(1,'rgba(255,210,140,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(ax-hw,ty);ctx.lineTo(ax+hw,ty);ctx.closePath();ctx.fill();
  /* flattened vapor disc */
  var dr=(40+240*eo(a/.9))*K,dy=ay-dir*SH*.3;
  ctx.strokeStyle='rgba(255,240,208,'+(.22*env).toFixed(3)+')';ctx.lineWidth=12*(1-clamp(a/1.2,0,1))+2;
  ctx.beginPath();ctx.ellipse(ax,dy,dr,dr*.27,0,0,6.2832);ctx.stroke();
  ctx.strokeStyle='rgba(255,250,236,'+(.6*env).toFixed(3)+')';ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(ax,dy,dr,dr*.27,0,0,6.2832);ctx.stroke();
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
  state:function(){return{vs:vs,heat:heat,op:op,armed:armed,bang:!!bang,embers:ember.length,y:Y.x,rot:R.x,left:left,S:S,SH:SH,narrow:narrow,yMin:yMin,yMax:yMax,heroIn:heroIn,running:run}},
  stats:function(){var f=dbg.fr.slice().sort(function(a,b){return a-b}),s=0;f.forEach(function(x){s+=x});
   return{ticks:dbg.n,cpuAvg:dbg.sum/Math.max(1,dbg.n),cpuMax:dbg.max,cpuOver4:dbg.over,frames:f.length,frameAvg:s/Math.max(1,f.length),frameP95:f[Math.floor(f.length*.95)]||0,frameMax:f[f.length-1]||0}},
  reset:function(){dbg.n=0;dbg.sum=0;dbg.max=0;dbg.over=0;dbg.fr=[]},
  armReset:function(){armed=true;coolUntil=0;heat=0;vs=0}
 };
})();
