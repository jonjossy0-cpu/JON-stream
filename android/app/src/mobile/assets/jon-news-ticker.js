(function(){
 const frame=document.getElementById("tvVideoFrame");
 if(!frame)return;
 const bar=document.createElement("div");
 bar.id="jonFullscreenNewsTicker";
 bar.setAttribute("aria-label","Scrolling news ticker");
 const logo=document.createElement("img");
 logo.className="jon-ticker-logo";logo.alt="";logo.referrerPolicy="no-referrer";
 const label=document.createElement("span");
 label.className="jon-ticker-label";label.textContent="NEWS";
 const viewport=document.createElement("div");viewport.className="jon-ticker-viewport";
 const track=document.createElement("span");track.className="jon-ticker-track";
 viewport.appendChild(track);bar.append(logo,label,viewport);frame.appendChild(bar);
 let settings={enabled:false,text:"",logoUrl:"",speed:"5m"};
 function validUrl(value){try{const u=new URL(value);return u.protocol==="https:"||u.protocol==="http:"}catch(_){return false}}
 function premiumAllowed(){const a=window.jonPremiumAccess;return !!(a&&a.ready===true&&a.allowed===true)}
 function render(){
  const active=document.fullscreenElement===frame||document.webkitFullscreenElement===frame;
  const text=String(settings.text||"").trim();
  const show=!!(active&&settings.enabled&&text&&premiumAllowed());
  bar.classList.toggle("jon-ticker-visible",show);
  if(!show)return;
  track.textContent=text+"   •   "+text+"   •   ";
  const minutes=({"1m":1,"2m":2,"3m":3,"5m":5,"8m":8,"10m":10})[settings.speed]||5;
  /* The Admin-selected interval is the full animation cycle, so every speed option has a predictable effect. */
  const duration=minutes*60;
  track.style.animationDuration=duration+"s";
  const url=String(settings.logoUrl||"").trim();
  if(url&&validUrl(url)){if(logo.getAttribute("src")!==url)logo.src=url;logo.style.display="block";logo.onerror=()=>{logo.style.display="none"}}
  else{logo.removeAttribute("src");logo.style.display="none";logo.onerror=null}
 }
 function update(data){const next=data&&data.settings&&data.settings.newsTicker||{};settings={enabled:next.enabled===true,text:typeof next.text==="string"?next.text:"",logoUrl:typeof next.logoUrl==="string"?next.logoUrl:"",speed:["1m","2m","3m","5m","8m","10m"].includes(next.speed)?next.speed:"5m"};render()}
 window.addEventListener("jon-firebase-data",event=>update(event.detail));
 window.addEventListener("jon-premium-access-changed",render);
 document.addEventListener("fullscreenchange",render);
 document.addEventListener("webkitfullscreenchange",render);
 window.addEventListener("jon-tv-channel-changed",render);
 if(window.__JON_FIREBASE_DATA)update(window.__JON_FIREBASE_DATA);else render();
})();
