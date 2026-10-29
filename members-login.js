/* DRAFT wk2pg4. Talks only to the members worker. Cosmetic reveal: real gating is server-side. */
(function(){
 var API='https://mudmode-members.bottledhate-com.workers.dev';
 var f=document.getElementById('ml-form'); if(!f) return;
 var st=document.getElementById('ml-status'), box=document.getElementById('ml-members'), link=document.getElementById('ml-link');
 var MSG={ok:'Signed in.',bad:'That key did not work. Check it and try again.',refunded:'This purchase was refunded or disputed, so it no longer unlocks members.',busy:'Too many tries. Wait a minute.',err:'Could not reach the check. Try again soon.'}; /* brief-review */
 function show(t){ fetch(API+'/download',{headers:{Authorization:'Bearer '+t}}).then(function(r){return r.json();}).then(function(d){
   if(d&&d.ok&&d.link){ link.href=d.link; box.hidden=false; f.hidden=true; } else { sessionStorage.removeItem('mm_t'); box.hidden=true; f.hidden=false; }
 }).catch(function(){ st.textContent=MSG.err; }); }
 f.addEventListener('submit',function(e){ e.preventDefault();
   var k=document.getElementById('ml-key').value.trim(); if(!k) return;
   st.textContent='Checking…';
   fetch(API+'/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({license_key:k})})
   .then(function(r){ return r.json().then(function(d){ return {s:r.status,d:d}; }); })
   .then(function(x){ var d=x.d||{};
     if(d.ok&&d.token){ sessionStorage.setItem('mm_t',d.token); st.textContent=MSG.ok; document.getElementById('ml-key').value=''; show(d.token); }
     else if(d.refunded||d.chargebacked||d.disputed||d.ended) st.textContent=MSG.refunded;
     else if(x.s===429) st.textContent=MSG.busy; else st.textContent=MSG.bad; })
   .catch(function(){ st.textContent=MSG.err; });
 });
 document.getElementById('ml-out').addEventListener('click',function(){ sessionStorage.removeItem('mm_t'); box.hidden=true; f.hidden=false; st.textContent=''; });
 var t=sessionStorage.getItem('mm_t'); if(t) show(t);
})();
