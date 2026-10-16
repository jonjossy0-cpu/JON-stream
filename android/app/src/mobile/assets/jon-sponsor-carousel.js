(function(){
 "use strict";
 const frame=document.getElementById("tvVideoFrame");
 if(!frame)return;
 const box=document.createElement("div");
 box.id="jonSponsorLogoCarousel";
 box.setAttribute("aria-label","Sponsor logos");
 box.setAttribute("aria-live","off");
 const image=document.createElement("img");
 image.alt="Sponsor logo";
 image.referrerPolicy="no-referrer";
 const label=document.createElement("span");
 label.className="jon-sponsor-label";
 label.textContent="SPONSORED";
 box.append(image,label);
 frame.appendChild(box);
 const PHOTO_MS=10000,CYCLE_MS=600000;
 let settings={enabled:false,photos:[]},index=0,photoTimer=null,cycleTimer=null,active=false,token=0;
 const isFullscreen=()=>document.fullscreenElement===frame||document.webkitFullscreenElement===frame;
 function cleanPhotos(value){
  if(!Array.isArray(value))return [];
  const result=[];
  value.slice(0,20).forEach(item=>{
   if(typeof item!=="string")return;
   try{const url=new URL(item.trim());if((url.protocol==="https:"||url.protocol==="http:")&&!result.includes(url.href))result.push(url.href)}catch(_){}
  });
  return result;
 }
 function hide(){box.classList.remove("jon-sponsor-visible");box.style.display="none";image.onload=null;image.onerror=null;image.removeAttribute("src")}
 function clearTimers(){if(photoTimer!==null){clearTimeout(photoTimer);photoTimer=null}if(cycleTimer!==null){clearTimeout(cycleTimer);cycleTimer=null}}
 function showNext(run,attempts=0){
  if(run!==token||!isFullscreen()||!settings.enabled||!settings.photos.length){hide();return}
  // Once every configured logo has had its 10-second slot, hide the card
  // until the 10-minute cycle timer restarts the carousel.
  // index counts logos already attempted in this 10-minute cycle.
  // Do not wrap to logo 1; startCycle() resets index only when the next cycle is due.
  if(index>=settings.photos.length){hide();return}
  const url=settings.photos[index++];
  // Keep the sponsor card and SPONSORED label visible while the next logo loads.
  // Hiding here caused the entire card to disappear between every logo.
  let settled=false;
  image.onload=()=>{
   if(settled||run!==token)return;
   settled=true;
   box.style.display="flex";box.classList.add("jon-sponsor-visible");
   photoTimer=setTimeout(()=>{photoTimer=null;showNext(run)},PHOTO_MS);
  };
  image.onerror=()=>{
   if(settled||run!==token)return;
   settled=true;
   showNext(run,attempts+1);
  };
  image.src=url;
  if(image.complete&&image.naturalWidth>0&&image.naturalHeight>0)image.onload();
 }
 function startCycle(){
  clearTimers();active=false;hide();
  if(!isFullscreen()||!settings.enabled||!settings.photos.length)return;
  active=true;token++;const run=token;index=0;showNext(run);
  cycleTimer=setTimeout(()=>{cycleTimer=null;if(run===token&&isFullscreen())startCycle()},CYCLE_MS);
 }
 function stop(){token++;clearTimers();active=false;hide()}
 function update(data){
  const next=data&&data.settings&&data.settings.sponsorLogoCarousel||{};
  const raw=Array.isArray(next.photos)?next.photos:(typeof next.photos==="string"?next.photos.split(/\r?\n/):[]);
  const fresh={enabled:next.enabled===true,photos:cleanPhotos(raw)};
  const changed=fresh.enabled!==settings.enabled||fresh.photos.join("\n")!==settings.photos.join("\n");
  settings=fresh;
  if(!settings.enabled||!settings.photos.length){stop();return}
  if(isFullscreen()&&(changed||!active))startCycle();else if(!isFullscreen())stop();
 }
 window.addEventListener("jon-firebase-data",event=>update(event.detail));
 document.addEventListener("fullscreenchange",()=>isFullscreen()?startCycle():stop());
 document.addEventListener("webkitfullscreenchange",()=>isFullscreen()?startCycle():stop());
 if(window.__JON_FIREBASE_DATA)update(window.__JON_FIREBASE_DATA);
})();
