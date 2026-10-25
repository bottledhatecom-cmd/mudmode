// Start box: the one-step "get started" wizard on the home page (owner, OK-LEDGER 2026-10-24 9:12-9:14 PM).
// No network calls except reading this site's own two prompt files when the box opens; no trackers; nothing stored
// (no cookies, no localStorage). Kept in its own file so the Content-Security-Policy can block all inline scripts.
// Builds on Grok's start-here wizard (start-here/wizard.js and start-here/index.html): its AI picks and open-your-AI links.
(function(){
 var box=document.getElementById('start-box');
 if(!box||typeof box.showModal!=='function')return; // old browser: the links keep working as plain links
 // Each prompt is pinned: if its file changes, its hash here must change too, so a text change is always a visible code change.
 var PROMPTS={
  chat:{url:'starter-kit/FOR-CHAT-APPS/mudmode-chat-lite.md',sha:'sha256-PBroaBvu7z5LfZ9KcwmCn2VvttVnCIFSVb4GcczPzhU=',
   last:'\n\n---\nRead the mudmode text above and set me up.'},
  files:{url:'setup-prompt-files.md',sha:'sha256-PIhJRDY06qg7aIsg1rFtcnQAlRFNvbLk9qCYdosw9Qk=',last:''}
 };
 // Fixed links only; the page can't add others.
 var AI_LINKS={ChatGPT:'https://chatgpt.com',Claude:'https://claude.ai',Grok:'https://grok.com'};
 var GUARD_MS=450; // a double tap must not answer the next question
 var cache={},opener=null,aiName='your AI',aiUrl='',guardUntil=0,pressOnBackdrop=false;

 function guard(){guardUntil=Date.now()+GUARD_MS;}
 function guarded(){return Date.now()<guardUntil;}
 function show(step){
  var steps=box.querySelectorAll('[data-sbox-step]');
  for(var i=0;i<steps.length;i++)steps[i].hidden=steps[i].getAttribute('data-sbox-step')!==step;
  var h=box.querySelector('[data-sbox-step="'+step+'"] h2');
  if(h){box.setAttribute('aria-labelledby',h.id);h.focus();}
  box.querySelector('.sbox-in').scrollTop=0;
  guard();
 }
 function load(kind){
  if(cache[kind])return cache[kind];
  var p=PROMPTS[kind];
  cache[kind]=fetch(p.url,{credentials:'omit',cache:'no-cache',integrity:p.sha}).then(function(r){
   if(!r.ok)throw new Error('load');
   return r.text();
  }).then(function(t){return t.replace(/\s+$/,'')+p.last;});
  cache[kind].catch(function(){delete cache[kind];}); // a failed load can be tried again
  return cache[kind];
 }
 function stepEl(kind){return box.querySelector('[data-sbox-prompt="'+kind+'"]');}
 function failMsg(el){
  el.querySelector('[data-sbox-done]').textContent='That didn’t load. Check your connection and try again, or use the step-by-step guide below.';
 }
 function reset(){
  var steps=box.querySelectorAll('[data-sbox-prompt]');
  for(var i=0;i<steps.length;i++){
   var s=steps[i],btn=s.querySelector('[data-sbox-copy]'),o=s.querySelector('[data-sbox-open]');
   s.querySelector('[data-sbox-done]').textContent='';
   if(o)o.hidden=true;
   btn.removeAttribute('aria-busy');btn.textContent=btn.getAttribute('data-label');
  }
 }
 function openBox(e){
  e.preventDefault();
  opener=e.currentTarget;reset();box.showModal();show('1');
  load('chat').catch(function(){});load('files').catch(function(){}); // both at open, so the host never learns which path you pick
 }
 var triggers=document.querySelectorAll('[data-start-box]');
 for(var i=0;i<triggers.length;i++)triggers[i].addEventListener('click',openBox);

 var picks=box.querySelectorAll('[data-sbox-ai]');
 for(var j=0;j<picks.length;j++)picks[j].addEventListener('click',function(){
  if(guarded())return;
  var kind=this.getAttribute('data-sbox-kind')==='files'?'files':'chat';
  aiName=this.getAttribute('data-sbox-ai');
  aiUrl=Object.prototype.hasOwnProperty.call(AI_LINKS,aiName)?AI_LINKS[aiName]:'';
  var link=box.querySelector('[data-sbox-open-link]');
  if(aiUrl&&link)link.setAttribute('href',aiUrl);
  var names=box.querySelectorAll('[data-sbox-name]');
  for(var k=0;k<names.length;k++)names[k].textContent=aiName;
  reset();show(kind);
  var el=stepEl(kind),ta=el.querySelector('[data-sbox-text]');
  load(kind).then(function(t){ta.value=t;},function(){ta.value='';failMsg(el);});
 });
 var backs=box.querySelectorAll('[data-sbox-back]');
 for(var b=0;b<backs.length;b++)backs[b].addEventListener('click',function(){if(!guarded())show('1');});

 var copies=box.querySelectorAll('[data-sbox-copy]');
 for(var c=0;c<copies.length;c++){
  copies[c].setAttribute('data-label',copies[c].textContent);
  copies[c].addEventListener('click',function(){
   if(guarded())return;
   var btn=this,el=btn.closest('[data-sbox-prompt]'),kind=el.getAttribute('data-sbox-prompt');
   if(btn.getAttribute('aria-busy')==='true')return; // not disabled, so focus stays on the button
   var ta=el.querySelector('[data-sbox-text]'),done=el.querySelector('[data-sbox-done]'),o=el.querySelector('[data-sbox-open]');
   function showOpen(){if(o)o.hidden=!aiUrl;}
   function into(){done.scrollIntoView({block:'nearest'});}
   function selectText(){
    ta.focus();ta.select();showOpen();
    done.textContent='Your prompt is selected in the box below. Press Ctrl+C (Cmd+C on a Mac) to copy it. On a phone: tap in the box, choose Select all, then Copy.';
    into();
   }
   btn.setAttribute('aria-busy','true');btn.textContent='Getting it ready…';
   load(kind).then(function(t){
    ta.value=t;btn.textContent=btn.getAttribute('data-label');
    if(navigator.clipboard&&window.isSecureContext){
     return navigator.clipboard.writeText(t).then(function(){
      btn.textContent='Copied';showOpen();
      done.textContent=kind==='files'
       ?'Copied. Now paste it into your AI and send it. It tells your AI to ask you one question, then set you up.'
       :'Copied. Now open '+aiName+', start a new chat, paste it in and send it. Your AI takes it from there.';
      into();
     },selectText);
    }
    selectText();
   }).catch(function(){btn.textContent=btn.getAttribute('data-label');failMsg(el);}).then(function(){btn.removeAttribute('aria-busy');guard();});
  });
 }

 // A tap or click closes the box only if it started and ended outside the panel (not on a phone's full-screen box,
 // and not a text drag that ends outside).
 function outside(e){
  var r=box.getBoundingClientRect();
  return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;
 }
 box.addEventListener('pointerdown',function(e){pressOnBackdrop=e.target===box&&outside(e);});
 box.addEventListener('click',function(e){
  if(e.target===box&&pressOnBackdrop&&outside(e)&&!guarded())box.close();
  pressOnBackdrop=false;
 });
 box.addEventListener('close',function(){if(opener&&opener.focus)opener.focus();});
})();
