(function(){
 /* Optional extras only: the page works with this file turned off. */
 document.documentElement.className+=' js';
 document.querySelectorAll('[data-copy]').forEach(function(b){
  b.addEventListener('click',function(){
   var src=document.getElementById(b.getAttribute('data-copy')),s=b.parentNode.querySelector('.copied'),t=src.textContent,lb=b.textContent;
   function ok(){s.textContent='Copied. Paste it into your AI and send.';b.textContent='Copied';setTimeout(function(){b.textContent=lb},2500)}
   function pick(){var r=document.createRange();r.selectNodeContents(src);var w=getSelection();w.removeAllRanges();w.addRange(r);s.textContent='Selected. Press Ctrl+C or Cmd+C.'}
   if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t).then(ok,pick)}else{pick()}
  });
 });
 function sync(){document.querySelectorAll('.dock [data-open]').forEach(function(b){var d=document.getElementById(b.getAttribute('data-open'));if(d&&d.tagName==='DETAILS')b.setAttribute('aria-expanded',d.open?'true':'false')})}
 document.querySelectorAll('.dock [data-open]').forEach(function(b){
  b.addEventListener('click',function(){
   var d=document.getElementById(b.getAttribute('data-open'));if(!d)return;
   if(d.tagName==='DETAILS'){d.open=!d.open;}
   d.scrollIntoView({block:'start'});sync();
  });
 });
 document.querySelectorAll('details.win').forEach(function(d){d.addEventListener('toggle',sync)});
 function fromHash(){var d=location.hash&&document.getElementById(location.hash.slice(1));if(d&&d.tagName==='DETAILS'){d.open=true;sync()}}
 fromHash();window.addEventListener('hashchange',fromHash);
 /* Dock: show only once the folded windows (#more) are well in view, so it never covers the first screen's cards. */
 var dock=document.querySelector('.dock'),more=document.getElementById('more');
 if(dock&&more){
  if('IntersectionObserver' in window){
   new IntersectionObserver(function(es){var e=es[es.length-1];dock.classList.toggle('on',e.isIntersecting||e.boundingClientRect.top<0)},{rootMargin:'0px 0px -120px 0px'}).observe(more);
  }else{dock.classList.add('on')}
 }
})();
