# Firebase Premium status for Mobile APK

This branch adds a Firebase Cloud Functions alternative for Premium subscription status and entitlement updates. It is not deployed by committing this code.

## Functions
- `subscriptionStatus`: authenticated status lookup; requires a verified email before starting the 3-day trial.
- `updatePremiumEntitlement`: admin-only grant, extend, and revoke actions.
- `subscriptionConfig`: reads public ETB pricing and allows an authorized admin to update it.

## Required setup
1. Use the existing Firebase project `jon-stream`.
2. Ensure the project is on the Blaze plan before deploying Cloud Functions.
3. Install Firebase CLI and run `firebase login`.
4. Create an untracked `.env.jon-stream` file at the repository root containing `JON_ADMIN_UIDS=FIREBASE_ADMIN_UID_1,FIREBASE_ADMIN_UID_2` (replace the examples with real Firebase Authentication **UIDs**; never use email addresses). Do not commit this file.
5. Deploy with `firebase deploy --only functions --project jon-stream`; the deploy command will prompt for the parameter if it is not found.
6. Verify the deployed `subscriptionStatus` callable with a verified test account before releasing the APK.

Do not commit service-account keys or admin UIDs. This implementation uses Firebase Admin on the server; the APK only receives the caller's status response. Telebirr payment verification is not implemented by these functions and must not be represented as completed.
