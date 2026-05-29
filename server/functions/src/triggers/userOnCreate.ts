import { beforeUserCreated } from "firebase-functions/v2/identity";
import { getFirestore } from "../admin";
import { logger } from "firebase-functions";

// Self-host: every newly-created user gets a Firestore `users/{uid}` doc and an
// `individualSubscriptions/{uid}` doc marking them as an active premium user. The
// client checks `isPremium` via these docs to decide whether to show paywalls.
//
// This trigger runs in the Firebase Auth Emulator's beforeUserCreated hook. In a
// real Firebase project this would require Identity Platform; the emulator supports
// it out of the box for local dev / self-host.
export const seedUserDocs = beforeUserCreated(async (event) => {
  const user = event.data;
  if (!user) return;

  const db = getFirestore();
  const batch = db.batch();

  batch.set(
    db.collection("users").doc(user.uid),
    {
      domain: user.email?.split("@")[1] ?? "",
      email: user.email ?? "",
      // Self-host trusts every account on the instance — auto-mark as verified so
      // the client's email-verification banners and gates don't fire.
      isVerified: true,
      photoURL: user.photoURL ?? "",
      signupTs: Date.now(),
      username: "",
    },
    { merge: true },
  );

  batch.set(
    db.collection("individualSubscriptions").doc(user.uid),
    {
      plan: "professional",
      subscriptionStatus: "active",
      subscriptionCurrentPeriodStart: Date.now(),
      subscriptionCurrentPeriodEnd: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000,
      stripeActiveSubscriptionID: "self-hosted",
      type: "individual",
      rqSubscriptionType: "self-hosted",
    },
    { merge: true },
  );

  await batch.commit();
  logger.info("seeded user docs", { uid: user.uid, email: user.email });

  // beforeUserCreated supports response-side mutations — flip the auth account's
  // emailVerified flag to true so `firebase.User.emailVerified` reads true on the
  // very first sign-in, no extra round-trip needed.
  return { emailVerified: true };
});
