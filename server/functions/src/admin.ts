import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore as adminGetFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp();
}

// Allow `undefined` values in writes so we can spread optional fields (e.g. invite
// metadata's ownerDisplayName, ownerEmail) without manually filtering them out.
// Must be configured before the first Firestore call.
adminGetFirestore().settings({ ignoreUndefinedProperties: true });

export { getAuth } from "firebase-admin/auth";
export { getFirestore, FieldValue } from "firebase-admin/firestore";
export { getDatabase } from "firebase-admin/database";
export { getStorage } from "firebase-admin/storage";
