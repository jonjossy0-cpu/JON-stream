<script type="module" id="jonFirebasePremiumAccount">
import { getApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, signOut, reload } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
const authPanel=document.getElementById("jonAccountPanel");
const auth=getAuth(getApp());
async function getSubscriptionStatus(user){
 const token=await user.getIdToken(true);
 if(window.JonNativeApi&&typeof window.JonNativeApi.getSubscriptionStatus==="function"){
  window.__jonSubscriptionStatusCallbacks=window.__jonSubscriptionStatusCallbacks||{};
  window.__jonSubscriptionCallbackSeq=(window.__jonSubscriptionCallbackSeq||0)+1;
  const callbackId="jonSubscription_"+window.__jonSubscriptionCallbackSeq;
  return await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{delete window.__jonSubscriptionStatusCallbacks[callbackId];reject(new Error("Subscription status request timed out."));},20000);
   window.__jonSubscriptionStatusCallbacks[callbackId]=(httpStatus,raw)=>{
    clearTimeout(timeout);delete window.__jonSubscriptionStatusCallbacks[callbackId];
    let data={};try{data=JSON.parse(raw||"{}");}catch(_){}
    if(httpStatus>=200&&httpStatus<300)resolve({data});
    else reject(new Error(data.error||data.message||("Subscription API returned HTTP "+httpStatus)));
   };
   window.JonNativeApi.getSubscriptionStatus(token,callbackId);
  });
 }
 const response=await fetch("https://jon-stream.vercel.app/api/subscription/status",{
  method:"GET",
  headers:{Authorization:"Bearer "+token,Accept:"application/json"},
  cache:"no-store"
 });
 let data={};
 try{data=await response.json();}catch(_){}
 if(!response.ok)throw new Error(data.error||data.message||("Subscription API returned HTTP "+response.status));
 return {data};
}
const $=id=>document.getElementById(id);
window.jonPremiumAccess={ready:false,allowed:false,status:"checking"};
window.toggleJonAccountPanel=function(){if(!authPanel)return;authPanel.hidden=!authPanel.hidden;if(!authPanel.hidden){authPanel.scrollIntoView({behavior:"smooth",block:"nearest"});if(auth.currentUser)refreshSubscription(auth.currentUser);}};
window.jonShowPremiumUpgrade=function(){if(authPanel){authPanel.hidden=false;authPanel.scrollIntoView({behavior:"smooth",block:"center"});const e=$("jonAccountError");if(e)e.textContent="This is a Premium channel. Sign in with a verified email and an active trial or Premium entitlement to continue.";}};
function message(t,bad=false){const e=$("jonAccountError");if(e){e.textContent=t||"";e.style.color=bad?"#fca5a5":"#86efac";}}
function busy(v){["jonAccountSignup","jonAccountSignin","jonForgotPassword","jonResendVerification","jonAccountSignout","jonSubscriptionRefresh"].forEach(id=>{const e=$(id);if(e)e.disabled=v;});}
function errText(e){const c=String(e&&e.code||"");const m={"auth/operation-not-allowed":"Enable Email/Password sign-in in Firebase Authentication.","auth/unauthorized-domain":"Authorize this app domain in Firebase Authentication.","auth/email-already-in-use":"This email already has an account. Sign in instead.","auth/invalid-email":"Enter a valid email address.","auth/weak-password":"Choose a password with at least 6 characters.","auth/invalid-credential":"Email or password is incorrect.","auth/user-disabled":"This account has been disabled.","auth/too-many-requests":"Too many attempts. Wait and try again.","auth/network-request-failed":"Network connection failed. Check your connection.","auth/missing-password":"Enter your password."};return m[c]||String(e&&e.message||"Request failed. Please try again.");}
async function refreshSubscription(user){
 window.jonPremiumAccess={ready:false,allowed:false,status:"checking"};
 window.dispatchEvent(new CustomEvent("jon-premium-access-changed",{detail:window.jonPremiumAccess}));
 $("jonProfileEmail").textContent=user.email||"—";$("jonProfileVerified").textContent=user.emailVerified?"Verified":"Not verified";
 $("jonProfilePlan").textContent=user.emailVerified?"Checking subscription…":"Verify email first";$("jonProfileRemaining").textContent="—";$("jonProfilePayment").textContent="—";
 $("jonAccountMessage").textContent=user.emailVerified?"Checking subscription status…":"Verify your email before starting the free trial or using Premium.";
 try{
  await reload(user);
  if(!user.emailVerified){window.jonPremiumAccess={ready:true,allowed:false,status:"email_verification_required"};window.dispatchEvent(new CustomEvent("jon-premium-access-changed",{detail:window.jonPremiumAccess}));$("jonProfileVerified").textContent="Not verified";$("jonProfilePlan").textContent="Email verification required";$("jonProfileRemaining").textContent="0 days";$("jonProfilePayment").textContent="Not active";$("jonAccountMessage").textContent="Verify your email. The 3-day trial begins after verification.";return;}
  const response=await getSubscriptionStatus(user), data=response.data||{};
  window.jonPremiumAccess={ready:true,allowed:data.hasPremium===true,status:String(data.status||"free")};
  window.dispatchEvent(new CustomEvent("jon-premium-access-changed",{detail:window.jonPremiumAccess}));
  $("jonProfilePlan").textContent=data.planLabel||data.status||"Free plan";
  $("jonProfileRemaining").textContent=Number.isFinite(data.daysRemaining)?data.daysRemaining+" day(s)":(data.remainingLabel||"—");
  $("jonProfilePayment").textContent=data.paymentLabel||"—";$("jonAccountMessage").textContent=data.message||"Subscription status updated.";
  message("");
 }catch(e){window.jonPremiumAccess={ready:false,allowed:false,status:"unavailable"};window.dispatchEvent(new CustomEvent("jon-premium-access-changed",{detail:window.jonPremiumAccess}));$("jonProfilePlan").textContent="Subscription status unavailable";$("jonProfileRemaining").textContent="—";$("jonProfilePayment").textContent="—";$("jonAccountMessage").textContent="Subscription status could not be loaded from Vercel. Check your connection and tap Update status.";message(errText(e),true);}
}
onAuthStateChanged(auth,async user=>{if(!user){window.jonPremiumAccess={ready:true,allowed:false,status:"signed_out"};window.dispatchEvent(new CustomEvent("jon-premium-access-changed",{detail:window.jonPremiumAccess}));}
 $("jonAccountState").textContent=user?(user.emailVerified?"Signed in":"Verify email"):"Not signed in";$("jonAccountSignedOut").hidden=!!user;$("jonAccountSignedIn").hidden=!user;
 if(user)await refreshSubscription(user);
});
$("jonPasswordToggle").addEventListener("click",()=>{const i=$("jonAccountPassword"),b=$("jonPasswordToggle"),show=i.type==="password";i.type=show?"text":"password";b.textContent=show?"Hide":"Show";b.setAttribute("aria-pressed",String(show));i.focus();});
$("jonAccountSignup").addEventListener("click",async()=>{const email=$("jonAccountEmail").value.trim(),password=$("jonAccountPassword").value;if(!email||password.length<6){message("Enter a valid email and password with at least 6 characters.",true);return;}busy(true);message("Creating account…");try{const c=await createUserWithEmailAndPassword(auth,email,password);await sendEmailVerification(c.user);message("Account created. Open the verification email and verify your address.");}catch(e){message(errText(e),true);}finally{busy(false);}});
$("jonAccountSignin").addEventListener("click",async()=>{const email=$("jonAccountEmail").value.trim(),password=$("jonAccountPassword").value;if(!email||!password){message("Enter your email and password.",true);return;}busy(true);message("Signing in…");try{const c=await signInWithEmailAndPassword(auth,email,password);await reload(c.user);if(!c.user.emailVerified)message("Verify your email first. Use Resend verification below.");else await refreshSubscription(c.user);}catch(e){message(errText(e),true);}finally{busy(false);}});
$("jonForgotPassword").addEventListener("click",async()=>{const email=$("jonAccountEmail").value.trim();if(!email){message("Enter your email first, then tap Forgot password.",true);return;}busy(true);message("Sending password reset email…");try{await sendPasswordResetEmail(auth,email);message("If the account exists, a reset link was sent. Check Inbox and Spam/Junk.");}catch(e){message(errText(e),true);}finally{busy(false);}});
$("jonResendVerification").addEventListener("click",async()=>{const u=auth.currentUser;if(!u){message("Sign in first.",true);return;}busy(true);try{await sendEmailVerification(u);message("Verification email sent. Check Inbox and Spam/Junk.");}catch(e){message(errText(e),true);}finally{busy(false);}});
$("jonSubscriptionRefresh").addEventListener("click",async()=>{if(auth.currentUser){busy(true);try{await refreshSubscription(auth.currentUser);}finally{busy(false);}}});
$("jonAccountSignout").addEventListener("click",async()=>{busy(true);try{await signOut(auth);message("Signed out.");}catch(e){message(errText(e),true);}finally{busy(false);}});
</script>
<script id="jonMobilePremiumLabelsAndGate">
(function(){
 "use strict";
 function normalized(value){return String(value||"").trim().toLowerCase().replace(/\s+/g," ");}
 function normalizedUrl(value){return String(value||"").trim().replace(/#.*$/,"").replace(/\/$/,"").toLowerCase();}
 function tierFromRecord(record){
  if(!record||typeof record!=="object")return "";
  for(const key of ["accessTier","tier","access","plan","subscriptionType"]){
   const value=record[key];
   if(typeof value==="string"&&value.trim()){
    const tier=value.trim().toLowerCase();
    if(["free","open","public"].includes(tier))return "free";
    if(["premium","paid","subscription","subscriber","pro"].includes(tier))return "premium";
   }
  }
  if(record.isPremium===true||record.premium===true||record.paid===true)return "premium";
  if(record.isFree===true||record.free===true)return "free";
  return "";
 }
 function firebaseChannelRecord(channel,kind){
  const data=window.__JON_FIREBASE_DATA;
  if(!data||typeof data!=="object"||!channel||typeof channel!=="object")return null;
  const names=kind==="radio"?["radio","stations","radioChannels"]:["tv","tvChannels","television"];
  const records=[];
  names.forEach(key=>{if(Array.isArray(data[key]))records.push(...data[key]);});
  if(!records.length)return null;
  const id=normalized(channel.id||channel.channelId||channel.key);
  const url=normalizedUrl(channel.url||channel.streamUrl||channel.stream);
  const name=normalized(channel.name||channel.title);
  // Prefer stable IDs, then exact source URL, then exact channel name.
  if(id){const found=records.find(item=>item&&normalized(item.id||item.channelId||item.key)===id);if(found)return found;}
  if(url){const found=records.find(item=>item&&normalizedUrl(item.url||item.streamUrl||item.stream)===url);if(found)return found;}
  if(name){const found=records.find(item=>item&&normalized(item.name||item.title)===name);if(found)return found;}
  return null;
 }
 function tierValue(channel,kind){
  const localTier=tierFromRecord(channel);
  if(localTier)return localTier;
  const remote=firebaseChannelRecord(channel,kind);
  if(remote){
   // Never assume Free when Firebase has not explicitly classified the channel.
   // Missing/unknown metadata must fail closed so a Premium stream cannot bypass the gate.
   return tierFromRecord(remote)||"unknown";
  }
  // A channel that cannot be matched to Firebase metadata is not safe to classify as Free.
  // Require an explicit Free marker or a matching Firebase record with a recognized tier.
  return "unknown";
 }
 function isPaid(channel,kind){return tierValue(channel,kind)!=="free";}
 function premiumAllowed(){
  const access=window.jonPremiumAccess;
  return !!(access&&access.ready===true&&access.allowed===true);
 }
 function addBadge(container,channel,kind){
  if(!container)return;
  const tier=tierValue(channel,kind);
  const paid=tier!=="free";
  let badge=container.querySelector(".jon-access-tier");
  if(!badge){badge=document.createElement("span");badge.className="jon-access-tier";container.appendChild(badge);}
  badge.className="jon-access-tier "+(paid?"premium":"free")+(tier==="unknown"?" unknown":"");
  badge.textContent=tier==="free"?"FREE":(tier==="unknown"?"VERIFY ACCESS":"PREMIUM / PAID");
 }
 function deny(channel,kind){
  if(!isPaid(channel,kind)||premiumAllowed())return false;
  if(typeof window.jonShowPremiumUpgrade==="function")window.jonShowPremiumUpgrade();
  return true;
 }
 function decorateRadio(list){
  requestAnimationFrame(()=>{
   document.querySelectorAll("#stations .station").forEach((card,i)=>{
    const sourceStations=(typeof stations!=="undefined"&&Array.isArray(stations))?stations:[];
    const station=list&&list[i] || sourceStations[i];
    addBadge(card.querySelector(".station-info"),station,"radio");
   });
  });
 }
 function decorateTV(list){
  requestAnimationFrame(()=>{
   document.querySelectorAll("#tvChannels .tv-card").forEach((card,i)=>{
    addBadge(card.querySelector(".tv-info"),list&&list[i],"tv");
   });
  });
 }
 const oldRadio=window.renderStations;
 if(typeof oldRadio==="function")window.renderStations=function(list){const result=oldRadio.apply(this,arguments);decorateRadio(list);return result;};
 const oldTV=window.renderTV;
 if(typeof oldTV==="function")window.renderTV=function(list){const result=oldTV.apply(this,arguments);decorateTV(list);return result;};
 // Gate the actual playback entry points too, so inline buttons, favorites,
 // remote-number selection and other callers cannot bypass the visible lock.
 const originalSelectStation=window.selectStation;
 if(typeof originalSelectStation==="function")window.selectStation=function(index){
  const sourceStations=(typeof stations!=="undefined"&&Array.isArray(stations))?stations:[];
  const station=sourceStations[index];
  if(deny(station,"radio"))return;
  return originalSelectStation.apply(this,arguments);
 };
 const originalPlayTV=window.playTVStream;
 if(typeof originalPlayTV==="function")window.playTVStream=function(url,name,index){
  const sourceTV=(typeof tvChannels!=="undefined"&&Array.isArray(tvChannels))?tvChannels:[];
  const sourceFiltered=(typeof filteredTV!=="undefined"&&Array.isArray(filteredTV))?filteredTV:[];
  const channel=sourceTV.find(ch=>ch&&ch.url===url) || sourceFiltered[index] || null;
  if(deny(channel,"tv"))return;
  return originalPlayTV.apply(this,arguments);
 };
 // Mobile-only promotion gate: keep this logic out of the shared website/TV HTML.
 // Promotion cards are Premium-only on Mobile. Respect an explicit Admin
 // ON/OFF value if present in the existing Firebase appData settings.
 function promotionEnabled(remote){
  const settings=remote&&remote.settings||{};
  if(typeof settings.promotionEnabled==="boolean")return settings.promotionEnabled;
  if(typeof settings.promotionsEnabled==="boolean")return settings.promotionsEnabled;
  if(typeof settings.promotion==="boolean")return settings.promotion;
  if(settings.promotion&&typeof settings.promotion.enabled==="boolean")return settings.promotion.enabled;
  if(settings.promotions&&typeof settings.promotions.enabled==="boolean")return settings.promotions.enabled;
  return true;
 }
 function applyPromotionGate(){
  const box=document.getElementById("jonLiveUpdates");
  if(!box)return;
  const remote=window.__JON_FIREBASE_DATA||{};
  let userPromotion=true;try{const saved=JSON.parse(localStorage.getItem("jonMobilePremiumFullscreenPreferences")||"{}");userPromotion=saved.promotion!==false;}catch(_){}
  const hidden=!(premiumAllowed()&&promotionEnabled(remote)&&userPromotion);
  box.classList.toggle("jon-mobile-promotion-hidden",hidden);
  if(hidden){box.style.display="none";document.body.classList.remove("jon-ad-visible");}
  else if(box.children.length&&!(window.jonAdClosedUntil&&Date.now()<window.jonAdClosedUntil)){
   box.style.display="flex";document.body.classList.add("jon-ad-visible");
  }
 }
 window.addEventListener("jon-firebase-data",event=>{applyPromotionGate();});
 window.addEventListener("jon-premium-access-changed",applyPromotionGate);
 const liveAds=document.getElementById("jonLiveUpdates");
 if(liveAds&&window.MutationObserver)new MutationObserver(()=>applyPromotionGate()).observe(liveAds,{childList:true,subtree:true});
 applyPromotionGate();
 // Re-check playback at the function boundary and on the card click itself.
 // Premium users can independently hide/show News and Promotion in fullscreen.
 // Choices stay local to Mobile APK and never override the Admin master ON/OFF.
 const prefKey="jonMobilePremiumFullscreenPreferences";
 const fullscreenFrame=document.getElementById("tvVideoFrame");
 const fullscreenControls=document.querySelector("#tvFullscreenOverlay .tv-fullscreen-bottom");
 let fullscreenPrefs={newsTicker:true,promotion:true};
 try{fullscreenPrefs={...fullscreenPrefs,...JSON.parse(localStorage.getItem(prefKey)||"{}")};}catch(_){}
 let fullscreenPanel=null;
 function saveFullscreenPrefs(){try{localStorage.setItem(prefKey,JSON.stringify(fullscreenPrefs));}catch(_){}}
 function applyFullscreenPrefs(){
  const allowed=premiumAllowed();
  if(fullscreenPanel){fullscreenPanel.hidden=!allowed;fullscreenPanel.style.display=allowed?"inline-flex":"none";fullscreenPanel.setAttribute("aria-hidden",String(!allowed));}
  if(fullscreenFrame){
   fullscreenFrame.classList.toggle("jon-hide-news",!allowed||fullscreenPrefs.newsTicker===false);
   fullscreenFrame.classList.toggle("jon-hide-sponsor",!allowed||fullscreenPrefs.promotion===false);
  }
  if(fullscreenPanel)fullscreenPanel.querySelectorAll("button[data-pref]").forEach(button=>{
   const key=button.dataset.pref;
   button.textContent=(key==="newsTicker"?"News: ":"Promotion: ")+(fullscreenPrefs[key]===false?"OFF":"ON");
   button.setAttribute("aria-pressed",String(fullscreenPrefs[key]!==false));
  });
 }
 if(fullscreenControls){
  fullscreenPanel=document.createElement("span");
  fullscreenPanel.id="jonMobilePremiumFullscreenControls";
  fullscreenPanel.hidden=true;
  fullscreenPanel.innerHTML='<button type="button" data-pref="newsTicker">News: ON</button><button type="button" data-pref="promotion">Promotion: ON</button>';
  fullscreenControls.insertBefore(fullscreenPanel,fullscreenControls.lastElementChild||null);
  fullscreenPanel.addEventListener("click",event=>{
   const button=event.target.closest("button[data-pref]");
   if(!button||!premiumAllowed())return;
   const key=button.dataset.pref;
   fullscreenPrefs={...fullscreenPrefs,[key]:fullscreenPrefs[key]===false};
   saveFullscreenPrefs();applyFullscreenPrefs();applyPromotionGate();
  });
 }
 window.addEventListener("jon-premium-access-changed",applyFullscreenPrefs);
 window.addEventListener("jon-firebase-data",applyFullscreenPrefs);
 applyFullscreenPrefs();
 // Capture direct card clicks as a second guard for playback handlers.
 document.addEventListener("click",function(event){
  const button=event.target&&event.target.closest?event.target.closest(".station-play,.tv-play"):null;
  if(!button)return;
  const card=button.closest(".station,.tv-card");
  const badge=card&&card.querySelector(".jon-access-tier:not(.free)");
  if(badge&&!premiumAllowed()){event.preventDefault();event.stopImmediatePropagation();if(typeof window.jonShowPremiumUpgrade==="function")window.jonShowPremiumUpgrade();}
 },true);
 function refreshChannelAccessLabels(){
  decorateRadio((typeof stations!=="undefined"&&Array.isArray(stations))?stations:[]);
  decorateTV((typeof filteredTV!=="undefined"&&Array.isArray(filteredTV))?filteredTV:((typeof tvChannels!=="undefined"&&Array.isArray(tvChannels))?tvChannels:[]));
 }
 window.addEventListener("jon-premium-access-changed",refreshChannelAccessLabels);
 window.addEventListener("jon-firebase-data",refreshChannelAccessLabels);
})();
</script>
