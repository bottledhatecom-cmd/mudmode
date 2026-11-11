(function(){
 /* Mascot extras (optional): the page and the mascot's bubble work with this file turned off. No storage, no cookies, no network. */
 var m=document.querySelector('.mascot');if(!m)return;
 var roomAd=m.classList.contains('room-ad');
 var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 var fine=!(window.matchMedia&&matchMedia('(hover: none)').matches);
 var say=m.querySelector('.say'),T;
 /* Room ad owns its bubble. Do not rotate those lines or build the SVG balloon over them. */
 if(!roomAd&&say&&say.children.length>1){var k=Math.floor(Math.random()*say.children.length);while(k--)say.appendChild(say.firstElementChild)}
 function once(c,ms){m.classList.remove(c);void m.offsetWidth;m.classList.add(c);setTimeout(function(){m.classList.remove(c)},ms)}
 /* 5: dozes after 60 s without movement, key or touch; wakes on any of them */
 var idle;function wake(){if(m.classList.contains('zz'))m.classList.remove('zz');clearTimeout(idle);idle=setTimeout(function(){m.classList.add('zz')},60000)}
 ['pointermove','pointerdown','keydown','touchstart','wheel','scroll'].forEach(function(e){addEventListener(e,wake,{passive:true})});wake();
 /* 2: wave hello once on load */
 if(!rm)setTimeout(function(){once('wave',1700)},700);
 /* 1: head follows the mouse (mouse only, rAF-throttled, subtle) */
 if(!rm&&fine){var px,py,raf=0;addEventListener('pointermove',function(e){if(e.pointerType&&e.pointerType!=='mouse')return;px=e.clientX;py=e.clientY;if(!raf)raf=requestAnimationFrame(function(){raf=0;
   var r=m.getBoundingClientRect(),dx=px-(r.left+r.width/2),dy=py-(r.top+r.height/2),d=Math.max(1,Math.sqrt(dx*dx+dy*dy)),f=Math.min(1,d/400);
   m.style.setProperty('--lx',(dx/d*3*f).toFixed(2));m.style.setProperty('--ly',(dy/d*2*f).toFixed(2));m.style.setProperty('--lr',(dx/d*6*f).toFixed(2))})},{passive:true})}
 /* 3: cheer when Copy is pressed */
 document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){
   m.classList.add('is-cheer');clearTimeout(T);T=setTimeout(function(){m.classList.remove('is-cheer')},2600);if(!rm)once('cheer',1000);requestAnimationFrame(shells)})});
 /* 4: lean toward a section when it opens */
 document.querySelectorAll('details.win').forEach(function(d){d.addEventListener('toggle',function(){if(!d.open||rm)return;
   var a=m.getBoundingClientRect(),b=d.getBoundingClientRect(),dx=b.left+b.width/2-(a.left+a.width/2);
   m.style.setProperty('--nx',(dx>0?3:-3));m.style.setProperty('--ny',4);m.style.setProperty('--nr',(dx>0?7:-7));once('lean',1600)})});
 /* One-piece balloon: the tail is part of the same path as the face, not a diamond stuck on. */
 var NS="http://www.w3.org/2000/svg";
 function stops(g,list){list.forEach(function(st){var n=document.createElementNS(NS,"stop");n.setAttribute("offset",st[0]);n.setAttribute("stop-color",st[1]);if(st[2]!=null)n.setAttribute("stop-opacity",st[2]);g.appendChild(n);});}
 function grad(id,op){var g=document.createElementNS(NS,"linearGradient");g.setAttribute("id",id);g.setAttribute("gradientUnits","objectBoundingBox");g.setAttribute("x1",op.x1||"0");g.setAttribute("y1","0");g.setAttribute("x2",op.x2||"0.18");g.setAttribute("y2","1");stops(g,op.stops);return g;}
 function balloonPath(w,h,side){
  var R=Math.max(12,Math.min(20,Math.round(Math.min(w,h)/2)-10));
  var tl=16,bw=12,path,vb,sw,sh;
  if(side==="right"){
   var ay=Math.max(R+bw,Math.min(h-R-bw,Math.round(h/2)));
   path="M"+R+" 0H"+(w-R)+"A"+R+" "+R+" 0 0 1 "+w+" "+R+"V"+(ay-bw)+"Q"+(w+tl*0.45)+" "+(ay-bw*0.2)+" "+(w+tl)+" "+ay+"Q"+(w+tl*0.45)+" "+(ay+bw*0.2)+" "+w+" "+(ay+bw)+"V"+(h-R)+"A"+R+" "+R+" 0 0 1 "+(w-R)+" "+h+"H"+R+"A"+R+" "+R+" 0 0 1 0 "+(h-R)+"V"+R+"A"+R+" "+R+" 0 0 1 "+R+" 0Z";
   vb="0 0 "+(w+tl)+" "+h;sw=w+tl;sh=h;
  }else{
   var ax=Math.max(R+bw,Math.min(w-R-bw,Math.round(w*0.28)));
   path="M"+R+" 0H"+(w-R)+"A"+R+" "+R+" 0 0 1 "+w+" "+R+"V"+(h-R)+"A"+R+" "+R+" 0 0 1 "+(w-R)+" "+h+"H"+(ax+bw)+"Q"+(ax+bw*0.2)+" "+(h+tl*0.42)+" "+ax+" "+(h+tl)+"Q"+(ax-bw*0.2)+" "+(h+tl*0.42)+" "+(ax-bw)+" "+h+"H"+R+"A"+R+" "+R+" 0 0 1 0 "+(h-R)+"V"+R+"A"+R+" "+R+" 0 0 1 "+R+" 0Z";
   vb="0 0 "+w+" "+(h+tl);sw=w;sh=h+tl;
  }
  return {path:path,vb:vb,sw:sw,sh:sh,side:side};
 }
 function shell(el,id){
  if(!el)return;
  el.classList.add("has-shell");
  var shown=el.style.display;
  if(!el.offsetWidth)el.style.display="grid";
  var w=el.offsetWidth,h=el.offsetHeight;
  el.style.display=shown;
  if(w<16||h<16)return;
  var side=(window.matchMedia&&matchMedia("(min-width:1300px)").matches)?"right":"down";
  var shape=balloonPath(w,h,side);
  var svg=el.querySelector("svg.mascot-shell");
  if(!svg){
   svg=document.createElementNS(NS,"svg");
   svg.setAttribute("class","tb-say-tail mascot-shell");
   svg.setAttribute("focusable","false");
   svg.setAttribute("aria-hidden","true");
   var defs=document.createElementNS(NS,"defs");
   var gid=id+"-g",sid=id+"-s",hid=id+"-h",cid=id+"-c";
   defs.appendChild(grad(gid,{stops:[["0%","#ffffff"],["28%","#ffe6c4"],["100%","#e4ae62"]]}));
   defs.appendChild(grad(sid,{x1:"0",x2:"0",stops:[["0%","#7a3e10","0"],["58%","#7a3e10","0"],["100%","#6a320c","0.42"]]}));
   defs.appendChild(grad(hid,{stops:[["0%","#ffffff","0.95"],["20%","#ffffff","0.42"],["46%","#ffffff","0"]]}));
   var cp=document.createElementNS(NS,"clipPath");cp.setAttribute("id",cid);
   var cpath=document.createElementNS(NS,"path");cpath.setAttribute("class","clip");cp.appendChild(cpath);defs.appendChild(cp);
   [["f",gid],["sd",sid],["sh",hid]].forEach(function(pair){
    var p=document.createElementNS(NS,"path");p.setAttribute("class",pair[0]);p.style.fill="url(#"+pair[1]+")";svg.appendChild(p);
   });
   var hi=document.createElementNS(NS,"path");hi.setAttribute("class","h");hi.style.clipPath="url(#"+cid+")";
   var ink=document.createElementNS(NS,"path");ink.setAttribute("class","s");
   svg.insertBefore(defs,svg.firstChild);svg.appendChild(hi);svg.appendChild(ink);
   el.insertBefore(svg,el.firstChild);
  }
  svg.setAttribute("viewBox",shape.vb);
  svg.style.left="0";svg.style.top="0";svg.style.width=shape.sw+"px";svg.style.height=shape.sh+"px";
  svg.querySelectorAll("path").forEach(function(p){if(p.getAttribute("class")!=="clip"||true)p.setAttribute("d",shape.path);});
 }
 function shells(){
  if(roomAd)return;
  shell(say,"ms-say");shell(m.querySelector(".say-cheer"),"ms-cheer");
 }
 if(!roomAd){
  shells();
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(shells);
  addEventListener("resize",shells,{passive:true});
  m.addEventListener("mouseenter",function(){requestAnimationFrame(shells);});
  m.addEventListener("focus",function(){requestAnimationFrame(shells);});
 }
})();
