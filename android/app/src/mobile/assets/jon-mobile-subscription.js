import { getApp, getApps } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

(() => {
  "use strict";
  const API = "https://jon-stream.vercel.app/api/subscription/status";
  let auth;
  try { auth = getAuth(getApps().length ? getApp() : null); }
  catch (error) { console.error("JON mobile account setup failed", error); return; }

  const button = document.createElement("button");
  button.type = "button";
  button.id = "jonMobileAccountButton";
  button.textContent = "Sign in / Premium";
  button.setAttribute("aria-haspopup", "dialog");
  document.body.appendChild(button);

  const overlay = document.createElement("div");
  overlay.id = "jonMobileAccountOverlay";
  overlay.innerHTML =
    '<section class="jon-mobile-account-dialog" role="dialog" aria-modal="true" aria-labelledby="jonMobileAccountTitle">' +
      '<button type="button" class="jon-mobile-account-close" aria-label="Close">×</button>' +
      '<h2 id="jonMobileAccountTitle">JON Stream Account</h2>' +
      '<p class="jon-mobile-account-subtitle">Sign in to check your Premium subscription.</p>' +
      '<div class="jon-mobile-account-user" hidden></div>' +
      '<form id="jonMobileAccountForm">' +
        '<label for="jonMobileEmail">Email</label>' +
        '<input id="jonMobileEmail" type="email" autocomplete="email" required placeholder="you@example.com">' +
        '<label for="jonMobilePassword">Password</label>' +
        '<input id="jonMobilePassword" type="password" autocomplete="current-password" minlength="6" required placeholder="At least 6 characters">' +
        '<div class="jon-mobile-account-actions"><button type="submit" id="jonMobileSignIn">Sign in</button>' +
        '<button type="button" id="jonMobileCreate">Create account</button></div>' +
        '<button type="button" id="jonMobileReset" class="jon-mobile-account-link">Forgot password?</button>' +
      '</form>' +
      '<div id="jonMobileSubscriptionStatus" role="status" aria-live="polite">Sign in to load subscription status.</div>' +
      '<div class="jon-mobile-plans"><h3>Premium plans</h3><p><strong>Monthly:</strong> 499 ETB</p>' +
      '<p><strong>Yearly:</strong> 6,000 ETB</p>' +
      '<p class="jon-mobile-account-note">Verified accounts may receive a 3-day trial. Free TV and radio channels remain available. Payment activation is not available in this screen yet.</p></div>' +
      '<button type="button" id="jonMobileSignOut" hidden>Sign out</button>' +
    '</section>';
  document.body.appendChild(overlay);

  const $ = id => document.getElementById(id);
  const form = $("jonMobileAccountForm"), email = $("jonMobileEmail"), password = $("jonMobilePassword");
  const status = $("jonMobileSubscriptionStatus"), userLine = overlay.querySelector(".jon-mobile-account-user");
  const signInButton = $("jonMobileSignIn"), createButton = $("jonMobileCreate"), resetButton = $("jonMobileReset"), signOutButton = $("jonMobileSignOut");
  let statusRequest = 0;

  function message(text, kind = "") { status.textContent = text; status.dataset.kind = kind; }
  function friendlyError(error) {
    const known = {
      "auth/invalid-email":"Enter a valid email address.",
      "auth/invalid-credential":"Email or password is incorrect.",
      "auth/user-not-found":"No account was found for this email.",
      "auth/wrong-password":"Email or password is incorrect.",
      "auth/email-already-in-use":"An account already exists for this email. Sign in instead.",
      "auth/weak-password":"Choose a password with at least 6 characters.",
      "auth/too-many-requests":"Too many attempts. Wait a little and try again.",
      "auth/network-request-failed":"Network error. Check your internet connection.",
      "auth/operation-not-allowed":"Email/password sign-in is not enabled in Firebase Authentication."
    };
    return known[String(error?.code || "")] || error?.message || "Something went wrong. Please try again.";
  }
  async function loadSubscription(user) {
    const requestId = ++statusRequest;
    message("Loading subscription status…");
    try {
      const token = await user.getIdToken(true);
      const response = await fetch(API, { method:"GET", headers:{Authorization:"Bearer " + token, Accept:"application/json"}, cache:"no-store" });
      const data = await response.json().catch(() => ({}));
      if (requestId !== statusRequest) return;
      if (!response.ok) throw new Error(data.error || ("Subscription API returned HTTP " + response.status));
      if (data.status === "email_verification_required") {
        message("Verify your email using the link sent to your inbox, then sign in again.", "warning");
      } else if (data.hasPremium) {
        const remaining = data.daysRemaining == null ? "" : " · " + data.daysRemaining + " day(s) remaining";
        message((data.planLabel || "Premium active") + remaining, "success");
      } else if (data.status === "trial") {
        message((data.planLabel || "Free trial") + (data.daysRemaining == null ? "" : " · " + data.daysRemaining + " day(s) remaining"), "success");
      } else {
        message(data.message || "No active Premium subscription. Free channels remain available.", "warning");
      }
    } catch (error) {
      if (requestId !== statusRequest) return;
      console.error("JON subscription status failed", error);
      message(error.message || "Could not load subscription status. Check internet and try again.", "error");
    }
  }
  function openDialog() {
    overlay.classList.add("is-open");
    if (auth.currentUser) loadSubscription(auth.currentUser);
    else setTimeout(() => email.focus(), 80);
  }
  function closeDialog() { overlay.classList.remove("is-open"); }
  button.addEventListener("click", openDialog);
  overlay.querySelector(".jon-mobile-account-close").addEventListener("click", closeDialog);
  overlay.addEventListener("click", event => { if (event.target === overlay) closeDialog(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeDialog(); });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    signInButton.disabled = createButton.disabled = resetButton.disabled = true;
    message("Signing in…");
    try {
      await signInWithEmailAndPassword(auth, email.value.trim(), password.value);
      message("Signed in. Loading subscription…");
    } catch (error) { message(friendlyError(error), "error"); }
    finally { signInButton.disabled = createButton.disabled = resetButton.disabled = false; }
  });
  createButton.addEventListener("click", async () => {
    if (!form.reportValidity()) return;
    signInButton.disabled = createButton.disabled = resetButton.disabled = true;
    message("Creating account…");
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.value.trim(), password.value);
      await sendEmailVerification(credential.user);
      message("Account created. Check your email and verify the address before using the trial.", "success");
    } catch (error) { message(friendlyError(error), "error"); }
    finally { signInButton.disabled = createButton.disabled = resetButton.disabled = false; }
  });
  resetButton.addEventListener("click", async () => {
    const address = email.value.trim();
    if (!address) { email.focus(); message("Enter your email first, then tap Forgot password again.", "warning"); return; }
    resetButton.disabled = true;
    try {
      await sendPasswordResetEmail(auth, address);
      message("If an account exists for that email, a password-reset link has been sent.", "success");
    } catch (error) { message(friendlyError(error), "error"); }
    finally { resetButton.disabled = false; }
  });
  signOutButton.addEventListener("click", async () => {
    try { await signOut(auth); message("Signed out."); }
    catch (error) { message(friendlyError(error), "error"); }
  });
  onAuthStateChanged(auth, user => {
    const signedIn = !!user;
    form.hidden = signedIn; userLine.hidden = !signedIn; signOutButton.hidden = !signedIn;
    userLine.textContent = signedIn ? "Signed in as " + (user.email || "account") : "";
    button.textContent = signedIn ? "Premium / Account" : "Sign in / Premium";
    if (signedIn) loadSubscription(user);
    else { ++statusRequest; message("Sign in to load subscription status."); }
  });
})();
