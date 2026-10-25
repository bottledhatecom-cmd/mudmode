// Start box: the one-step "get started" wizard on the home page (owner, OK-LEDGER 2026-10-24 9:12-9:14 PM).
// No network calls except reading this site's own chat file, no trackers, nothing stored: no cookies, no localStorage.
// Kept in its own file so the Content-Security-Policy can block all inline scripts.
(function(){
 var box=document.getElementById('start-box');
 if(!box||typeof box.showModal!=='function')return; // old browser: the links keep working as plain links
 var PROMPT_URL='starter-kit/FOR-CHAT-APPS/mudmode-chat-lite.md';
 var LAST_LINE='\n\n---\nRead the mudmode text above and set me up.';
 var promptText=null,opener=null,aiName='your AI';
 var copyBtn=document.getElementById('sbox-copy');
 var done=document.getElementById('sbox-done');
 var manual=document.getElementById('sbox-manual');
 var manualText=document.getElementById('sbox-text');

 function show(step){
  var steps=box.querySelectorAll('[data-sbox-step]');
  for(var i=0;i<steps.length;i++)steps[i].hidden=steps[i].getAttribute('data-sbox-step')!==step;
  var h=box.querySelector('[data-sbox-step="'+step+'"] h2');
  if(h)h.focus();
 }
 function load(){
  if(promptText!==null)return Promise.resolve(promptText);
  return fetch(PROMPT_URL,{credentials:'omit',cache:'no-cache'}).then(function(r){
   if(!r.ok)throw new Error('load');
   return r.text();
  }).then(function(t){promptText=t.replace(/\s+$/,'')+LAST_LINE;return promptText;});
 }
 function reset(){
  done.textContent='';manual.hidden=true;manualText.value='';
  copyBtn.disabled=false;copyBtn.textContent='Copy my first prompt';
 }
 function openBox(e){
  e.preventDefault();
  opener=e.currentTarget;reset();show('1');box.showModal();load().catch(function(){});
 }
 var triggers=document.querySelectorAll('[data-start-box]');
 for(var i=0;i<triggers.length;i++)triggers[i].addEventListener('click',openBox);

 var picks=box.querySelectorAll('[data-sbox-ai]');
 for(var j=0;j<picks.length;j++)picks[j].addEventListener('click',function(){
  var kind=this.getAttribute('data-sbox-kind');
  aiName=this.getAttribute('data-sbox-ai');
  var names=box.querySelectorAll('[data-sbox-name]');
  for(var k=0;k<names.length;k++)names[k].textContent=aiName;
  reset();show(kind==='files'?'files':'chat');
 });
 var backs=box.querySelectorAll('[data-sbox-back]');
 for(var b=0;b<backs.length;b++)backs[b].addEventListener('click',function(){show('1');});

 function showManual(text){
  manual.hidden=false;manualText.value=text;
  manualText.focus();manualText.select();
  done.textContent='Your prompt is selected below. Press Ctrl+C (Cmd+C on a Mac) to copy it, or tap and hold it on a phone.';
 }
 copyBtn.addEventListener('click',function(){
  copyBtn.disabled=true;
  load().then(function(text){
   if(navigator.clipboard&&window.isSecureContext){
    return navigator.clipboard.writeText(text).then(function(){
     copyBtn.textContent='Copied';
     done.textContent='Copied. Now open '+aiName+', start a new chat, paste it in and send it. Your AI takes it from there.';
    },function(){showManual(text);});
   }
   showManual(text);
  }).catch(function(){
   done.textContent='That didn’t load. Check your connection and try again, or use the step-by-step guide below.';
  }).then(function(){copyBtn.disabled=false;});
 });

 box.addEventListener('click',function(e){if(e.target===box)box.close();}); // a tap outside the panel closes it
 box.addEventListener('close',function(){if(opener&&opener.focus)opener.focus();});
})();
