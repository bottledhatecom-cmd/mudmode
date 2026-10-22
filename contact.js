// Shows the contact email as a clickable link when the page opens.
// The address is not written out in the page source, so simple spam bots that
// read the raw HTML don't pick it up. Without JavaScript, people see the
// "[at] / [dot]" text that is already in the page.
(function(){
 var u='bottledhate'+'.'+'com', d='gmail'+'.'+'com';
 var els=document.querySelectorAll('.js-email');
 for(var i=0;i<els.length;i++){
  var a=document.createElement('a'), m=u+'@'+d;
  a.href='mailto:'+m; a.textContent=m;
  els[i].textContent=''; els[i].appendChild(a);
 }
})();
