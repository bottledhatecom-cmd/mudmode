/* Room-ad bubble: intro popup, hover fade, drag from robot to Try the room. */
(function(){
  var m=document.querySelector("a.mascot.room-ad");
  if(!m)return;
  var hideT, introT, hold=false, dragged=false, sx=0, sy=0;
  var shot=(new URLSearchParams(location.search).get("shot")||"");

  function show(){
    clearTimeout(hideT);
    m.classList.add("is-shown");
  }
  function hideNow(){
    clearTimeout(hideT);
    if(hold)return;
    m.classList.remove("is-shown");
  }
  function hideSoon(){
    clearTimeout(hideT);
    if(hold)return;
    hideT=setTimeout(hideNow, 280);
  }

  if(shot==="shine"){ document.documentElement.classList.add("shot-shine"); hideNow(); return; }
  if(shot==="shown"){ show(); return; }
  if(shot==="hidden"){ hideNow(); return; }

  show();
  introT=setTimeout(function(){
    if(hold || m.matches(":hover") || m.contains(document.activeElement)) return;
    hideNow();
  }, 4500);

  m.addEventListener("pointerenter", function(){
    clearTimeout(introT);
    show();
  });
  m.addEventListener("pointerleave", function(){
    if(hold) return;
    hideSoon();
  });
  m.addEventListener("focusin", function(){ clearTimeout(introT); show(); });
  m.addEventListener("focusout", function(){ if(!hold) hideSoon(); });

  m.addEventListener("pointerdown", function(e){
    if(e.button!=null && e.button!==0) return;
    hold=true;
    dragged=false;
    sx=e.clientX; sy=e.clientY;
    m.classList.add("is-holding");
    clearTimeout(introT);
    show();
  });
  addEventListener("pointermove", function(e){
    if(!hold) return;
    if(Math.hypot(e.clientX-sx, e.clientY-sy)>6) dragged=true;
    show();
  }, {passive:true});
  addEventListener("pointerup", function(e){
    if(!hold) return;
    hold=false;
    m.classList.remove("is-holding");
    var el=document.elementFromPoint(e.clientX, e.clientY);
    var onAd=el && (m===el || m.contains(el));
    if(dragged && onAd){
      var href=m.getAttribute("href");
      if(href) location.href=href;
    }
    if(!onAd) hideSoon();
  });
})();
