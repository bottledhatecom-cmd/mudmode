(function(){
 /* Mascot extras (optional): the page and the mascot's bubble work with this file turned off. No storage, no cookies, no network. */
 var m=document.querySelector('.mascot');if(!m)return;
 var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 var fine=!(window.matchMedia&&matchMedia('(hover: none)').matches);
 var say=m.querySelector('.say'),T;
 /* 6: a different friendly line first on each visit (random, nothing stored) */
 if(say&&say.children.length>1){var k=Math.floor(Math.random()*say.children.length);while(k--)say.appendChild(say.firstElementChild)}
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
   m.classList.add('is-cheer');clearTimeout(T);T=setTimeout(function(){m.classList.remove('is-cheer')},2600);if(!rm)once('cheer',1000)})});
 /* 4: lean toward a section when it opens */
 document.querySelectorAll('details.win').forEach(function(d){d.addEventListener('toggle',function(){if(!d.open||rm)return;
   var a=m.getBoundingClientRect(),b=d.getBoundingClientRect(),dx=b.left+b.width/2-(a.left+a.width/2);
   m.style.setProperty('--nx',(dx>0?3:-3));m.style.setProperty('--ny',4);m.style.setProperty('--nr',(dx>0?7:-7));once('lean',1600)})});
})();
