// Start buttons (the door): the "Which AI do you use?" buttons at the top of the home page
// (owner, OK-LEDGER 2026-10-24 9:12-9:14 PM; the redesign, OK-LEDGER 2026-10-25 7:13 AM). No pop-up.
// No network calls except reading this site's own two prompt files when the page loads (both, always, so the host never
// learns which button you tap). A chat button opens that AI in a new tab at its plain address: no prompt in the link,
// no referrer, no tracking codes. No trackers; nothing stored (no cookies, no localStorage).
// Kept in its own file so the Content-Security-Policy can block all inline scripts.
// Builds on Grok's start-here wizard (start-here/wizard.js and start-here/index.html): its AI picks and open-your-AI links.
(function(){
 var door=document.getElementById('start');
 if(!door||!window.fetch||!window.Promise)return; // old browser: the buttons stay hidden; the 4 lines and the guide still work
 // Each prompt is pinned: if its file changes, its hash here must change too, so a text change is always a visible code change.
 var PROMPTS={
  chat:{url:'first-prompt.md',sha:'sha256-Ku1Mz2eikkC/Dmb8+mkMAnWzcKU1W15+ZAmASIaP8G4='},
  files:{url:'setup-prompt-files.md',sha:'sha256-gXvg1egeOZRXWJ8oY6M5WgoT08CLr0qeQd9/JWeg4Bw='}
 };
 // Fixed links only, plain addresses (no prefill query: not verified for any of them); the page can't add others.
 var AI_LINKS={ChatGPT:'https://chatgpt.com',Claude:'https://claude.ai',Grok:'https://grok.com'};
 var AGAIN_MS=3000; // a second tap on the same AI within 3 s opens no second tab (I-10)
 var FAIL='That didn’t load. Check your connection and try again, or use the step-by-step guide.';
 var HOLD='On a phone: press and hold in the message box, then tap Paste.';
 var KEYS='Press Ctrl+C (or Cmd+C on a Mac) to copy it.';
 var touch=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
 var ready={},cache={},openedAi='',openedAt=0;
 function q(sel){return door.querySelector(sel);}
 var st={chat:q('[data-door-status="chat"]'),files:q('[data-door-status="files"]')};
 var box={chat:q('[data-door-text="chat"]'),files:q('[data-door-text="files"]')};
 var openRow=q('[data-door-open]'),openLink=q('[data-door-open-link]'),openName=q('[data-door-open-name]');
 var chatWrap=q('[data-door-chatbox]'),fold=q('[data-door-fold]'),first=q('[data-door-first]');

 // The copy and the Ctrl+C fallback only ever use the fetched, verified text (never the lines shown in the page's HTML).
 function fill(kind,t){
  box[kind].value=t;
  if(kind==='files'&&first)first.textContent=t.split('\n')[0];
 }
 function load(kind){
  if(cache[kind])return cache[kind];
  var p=PROMPTS[kind];
  cache[kind]=fetch(p.url,{credentials:'omit',cache:'no-cache',integrity:p.sha}).then(function(r){
   if(!r.ok)throw new Error('load');
   return r.text();
  }).then(function(t){t=t.replace(/\s+$/,'');ready[kind]=t;fill(kind,t);return t;});
  cache[kind].catch(function(){delete cache[kind];delete ready[kind];box[kind].value='';}); // a failed load can be tried again
  return cache[kind];
 }
 function clear(){
  st.chat.textContent='';st.files.textContent='';
  openRow.hidden=true;chatWrap.hidden=true;
 }
 function copy(t){
  if(navigator.clipboard&&navigator.clipboard.writeText&&window.isSecureContext)return navigator.clipboard.writeText(t);
  return Promise.reject(new Error('no clipboard'));
 }
 // Copy refused by the browser: select the verified text and say how to copy it. Nothing scrolls.
 function select(kind){
  if(!ready[kind]){fail(kind);return;}
  if(kind==='chat')chatWrap.hidden=false;else if(fold)fold.open=true;
  var ta=box[kind];
  try{ta.focus({preventScroll:true});}catch(e){ta.focus();}
  ta.select();
  st[kind].textContent=KEYS;
 }
 function fail(kind){
  clear();box[kind].value='';
  st[kind].textContent=FAIL;
 }

 function chatGo(ai,url,t){
  clear();
  var copied=copy(t); // the clipboard is written before the tab opens
  if(url){
   window.open(url,'_blank','noopener,noreferrer');
   openLink.setAttribute('href',url);openName.textContent=ai;openRow.hidden=false; // in case a pop-up blocker stopped it
  }
  // With noopener the page can't tell whether a pop-up blocker stopped the tab, so it says "should open" (SB2-1).
  copied.then(function(){
   st.chat.textContent=(url?'Copied. '+ai+' should open in a new tab: paste the 4 lines there, read them, then send.'
    :'Copied. Open your chat app, paste the 4 lines, read them, then send.')+(touch?' '+HOLD:'');
  },function(){select('chat');});
 }
 function chatPick(){
  var ai=this.getAttribute('data-door-ai');
  var url=Object.prototype.hasOwnProperty.call(AI_LINKS,ai)?AI_LINKS[ai]:'';
  if(url&&openedAi===ai&&Date.now()-openedAt<AGAIN_MS)return; // same AI again within 3 s: no second tab, the message stays
  if(url){openedAi=ai;openedAt=Date.now();} // set before the load path too, so two taps while loading can't both open (WS-2)
  if(ready.chat){chatGo(ai,url,ready.chat);return;}
  load('chat').then(function(t){chatGo(ai,url,t);},function(){openedAi='';fail('chat');}); // a failed load can be tried again at once
 }
 function filesGo(t){
  clear();
  copy(t).then(function(){st.files.textContent='Copied. Paste it into your AI. It will ask you one question first.';if(fold)fold.open=true;}, // show what was copied (SB-1)
   function(){select('files');});
 }
 function filesPick(){
  if(ready.files){filesGo(ready.files);return;}
  load('files').then(filesGo,function(){fail('files');});
 }
 // A held Enter repeats: only the first press counts (I-4).
 function noRepeat(e){if(e.repeat&&(e.key==='Enter'||e.key===' '||e.key==='Spacebar'))e.preventDefault();}

 var picks=door.querySelectorAll('[data-door-ai]');
 for(var i=0;i<picks.length;i++){picks[i].addEventListener('click',chatPick);picks[i].addEventListener('keydown',noRepeat);}
 var fb=q('[data-door-files]');
 if(fb){fb.addEventListener('click',filesPick);fb.addEventListener('keydown',noRepeat);}
 var hid=door.querySelectorAll('[data-door-js]');
 for(var h=0;h<hid.length;h++)hid[h].hidden=false;

 function start(){load('chat').catch(function(){});load('files').catch(function(){});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
