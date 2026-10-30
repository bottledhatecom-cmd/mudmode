/* DRAFT wk2pg4. Talks only to the members worker. Cosmetic reveal: real gating is server-side. */
(function(){
 var API='https://mudmode-members.bottledhate-com.workers.dev';
 var f=document.getElementById('ml-form'); if(!f) return;
 /* redteam L9: a meta CSP can't set frame-ancestors on GitHub Pages, so refuse to run the sign-in form inside a frame. */
 if(window.top!==window.self){ f.hidden=true; try{ window.top.location=window.self.location.href; }catch(e){} return; }
 var st=document.getElementById('ml-status'), box=document.getElementById('ml-members'), link=document.getElementById('ml-link');
 var MSG={ok:'Signed in.',bad:'That key did not unlock members. Check it and try again. Refunded, disputed or ended purchases no longer unlock members.',busy:'Too many tries. Wait a minute.',err:'Could not reach the check. Try again soon.'}; /* brief-review */
 function show(t){ fetch(API+'/download',{headers:{Authorization:'Bearer '+t}}).then(function(r){return r.json();}).then(function(d){
   if(d&&d.ok&&d.link){ link.href=d.link; box.hidden=false; f.hidden=true; } else { sessionStorage.removeItem('mm_t'); box.hidden=true; f.hidden=false; }
 }).catch(function(){ st.textContent=MSG.err; }); }
 f.addEventListener('submit',function(e){ e.preventDefault();
   var k=document.getElementById('ml-key').value.trim(); if(!k) return;
   st.textContent='Checking…';
   fetch(API+'/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({license_key:k})})
   .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return {s:r.status,d:d}; }); })
   .then(function(x){ var d=x.d||{};
     /* redteam L7: branch on status first, so a 5xx shows the reach error, not "bad key". */
     if(x.s===200&&d.ok&&d.token){ sessionStorage.setItem('mm_t',d.token); st.textContent=MSG.ok; document.getElementById('ml-key').value=''; show(d.token); }
     else if(x.s===429) st.textContent=MSG.busy;
     else if(x.s>=500) st.textContent=MSG.err;
     else st.textContent=MSG.bad; })
   .catch(function(){ st.textContent=MSG.err; });
 });
 document.getElementById('ml-out').addEventListener('click',function(){ sessionStorage.removeItem('mm_t'); box.hidden=true; f.hidden=false; st.textContent=''; });
 var t=sessionStorage.getItem('mm_t'); if(t) show(t);
})();
