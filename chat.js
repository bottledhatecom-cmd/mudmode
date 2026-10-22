// Members chat loader: loads giscus only after the visitor clicks the button.
// Kept in its own file so the Content-Security-Policy can block all inline scripts.
function openMembersChat(){
 if(document.querySelector('#chat script'))return;
 var btn=document.getElementById('chat-load');
 var s=document.createElement('script');s.src='giscus-client.js';s.async=true;
 // Our own pinned copy of giscus client.js (see the note at the top of giscus-client.js). The chat itself still comes from giscus.app.
 s.onerror=function(){var n=document.getElementById('chat-note'),a=document.createElement('a');n.textContent='The members chat could not load here right now. You can still read and post in it on GitHub: ';a.href='https://github.com/bottledhatecom-cmd/mudmode/discussions/2';a.textContent='open the members chat on GitHub';n.appendChild(a);};
 var d={'repo':'bottledhatecom-cmd/mudmode','repo-id':'R_kgDOVSuD8A','category':'Announcements','category-id':'DIC_kwDOVSuD8M4DJSOd','mapping':'number','term':'2','strict':'0','reactions-enabled':'1','emit-metadata':'0','input-position':'bottom','theme':'https://mudmodecrew.com/giscus-theme.css','lang':'en','loading':'lazy'};
 for(var k in d)s.setAttribute('data-'+k,d[k]);
 document.getElementById('chat-note').textContent='Loading the members chat from GitHub...';
 document.getElementById('chat').appendChild(s);if(btn)btn.remove();
}
document.getElementById('chat-load').addEventListener('click',openMembersChat);
// Hide the "Loading..." line once the chat answers (giscus sends messages only from https://giscus.app, and only after it was opened).
window.addEventListener('message',function(e){if(e.origin!=='https://giscus.app')return;var n=document.getElementById('chat-note');if(n&&n.textContent.indexOf('Loading')===0)n.hidden=true;});
// Coming back from "Sign in with GitHub" inside the chat: giscus returns the visitor to this page with ?giscus=...
// They already opened the chat (a click) and chose to sign in, so reopen it to finish the sign-in instead of asking for a second click.
if(/[?&]giscus=/.test(location.search)){openMembersChat();var f=document.getElementById('chat');if(f&&f.scrollIntoView)f.scrollIntoView();}
