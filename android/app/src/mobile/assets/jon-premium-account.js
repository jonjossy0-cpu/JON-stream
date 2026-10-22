<script type="module" id="jonFirebasePremiumAccount">
import { getApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, signOut, reload } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
const authPanel=document.getElementById("jonAccountPanel");
const auth=getAuth(getApp());
async function getSubscriptionStatus(user){
 const token=await user.getIdToken(true);
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
  $("jonAccountToggle").textContent=data.status==="premium"?"👤 PAID":data.status==="trial"?"👤 FREE TRIAL":"👤 FREE";message("");
 }catch(e){window.jonPremiumAccess={ready:false,allowed:false,status:"unavailable"};window.dispatchEvent(new CustomEvent("jon-premium-access-changed",{detail:window.jonPremiumAccess}));$("jonProfilePlan").textContent="Subscription status unavailable";$("jonProfileRemaining").textContent="—";$("jonProfilePayment").textContent="—";$("jonAccountMessage").textContent="Subscription status could not be loaded from Vercel. Check your connection and tap Update status.";message(errText(e),true);}
}
onAuthStateChanged(auth,async user=>{if(!user){window.jonPremiumAccess={ready:true,allowed:false,status:"signed_out"};window.dispatchEvent(new CustomEvent("jon-premium-access-changed",{detail:window.jonPremiumAccess}));}
 $("jonAccountState").textContent=user?(user.emailVerified?"Signed in":"Verify email"):"Not signed in";$("jonAccountSignedOut").hidden=!!user;$("jonAccountSignedIn").hidden=!user;
 $("jonAccountToggle").textContent=user?(user.emailVerified?"👤 Free / Paid":"👤 Verify email"):"👤 Free / Paid";if(user)await refreshSubscription(user);
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
 function addBadge(container,tier){
  if(!container)return;
  const premium=String(tier||"free").toLowerCase()==="premium";
  let badge=container.querySelector(".jon-access-tier");
  if(!badge){badge=document.createElement("span");badge.className="jon-access-tier";container.appendChild(badge);}
  badge.className="jon-access-tier "+(premium?"premium":"free");
  badge.textContent=premium?"PREMIUM / PAID":"FREE";
 }
 const oldRadio=window.renderStations;
 if(typeof oldRadio==="function")window.renderStations=function(list){const result=oldRadio.apply(this,arguments);requestAnimationFrame(()=>{document.querySelectorAll("#stations .station").forEach((card,i)=>addBadge(card.querySelector(".station-info"),list&&list[i]&&list[i].accessTier));});return result;};
 const oldTV=window.renderTV;
 if(typeof oldTV==="function")window.renderTV=function(list){const result=oldTV.apply(this,arguments);requestAnimationFrame(()=>{document.querySelectorAll("#tvChannels .tv-card").forEach((card,i)=>addBadge(card.querySelector(".tv-info"),list&&list[i]&&list[i].accessTier));});return result;};
 document.addEventListener("click",function(event){
  const button=event.target&&event.target.closest?event.target.closest(".station-play,.tv-play"):null;
  if(!button)return;
  const card=button.closest(".station,.tv-card"),badge=card&&card.querySelector(".jon-access-tier.premium");
  const access=window.jonPremiumAccess;
  if(badge&&!(access&&access.ready&&access.allowed)){event.preventDefault();event.stopImmediatePropagation();if(typeof window.jonShowPremiumUpgrade==="function")window.jonShowPremiumUpgrade();}
 },true);
})();
</script>
