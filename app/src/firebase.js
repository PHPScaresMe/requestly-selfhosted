// Firebase SDK setup for self-hosted Requestly.
//
// Two self-host topologies are supported:
//   1. Localhost (Docker default) — all five emulator services share the SPA's hostname
//      on distinct ports (9099 auth, 8080 firestore, 9000 RTDB, 9199 storage, 5001
//      functions). This is what `docker compose up` gives you.
//   2. HTTPS subdomains via a reverse proxy (Nginx Proxy Manager, Caddy, etc.) —
//      each service lives at its own subdomain on port 443. Wire it up via the
//      `VITE_FIREBASE_*` env vars below.
//
// The HTTPS path is non-trivial because the Firebase JS SDK's
// `connect<Service>Emulator(...)` helpers all build `http://host:port` URLs
// internally — they have no HTTPS knob. So we sidestep them for the three
// services that need it (Firestore via `initializeFirestore` with `ssl: true`,
// Functions and Storage via direct `emulatorOrigin` assignment) and only use
// the helpers where they do speak HTTPS (Auth takes a full URL; RTDB picks up
// the databaseURL from the app config).
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { getFirestore, initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { isBackendEnvEmulator, isSelfHosted } from "utils/EnvUtils";

const PROJECT_ID = process.env.VITE_REACT_APP_FIREBASE_PROJECT_ID || "requestly-self-hosted";

// Reads `VITE_FIREBASE_<SERVICE>_URL`. Returns an object with the parsed host,
// port, and whether HTTPS is requested, or null if the env var is unset (in
// which case the caller falls back to the legacy `<spaHostname>:<defaultPort>`
// http wiring).
const parseServiceUrl = (envName) => {
  const raw = process.env[envName];
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const isHttps = u.protocol === "https:";
    const port = u.port ? parseInt(u.port, 10) : isHttps ? 443 : 80;
    return { url: raw.replace(/\/$/, ""), host: u.hostname, port, isHttps };
  } catch {
    console.warn(`Invalid value for ${envName}, falling back to localhost:`, raw);
    return null;
  }
};

const SERVICE_URLS = isSelfHosted()
  ? {
      auth: parseServiceUrl("VITE_FIREBASE_AUTH_URL"),
      firestore: parseServiceUrl("VITE_FIREBASE_FIRESTORE_URL"),
      database: parseServiceUrl("VITE_FIREBASE_DATABASE_URL"),
      functions: parseServiceUrl("VITE_FIREBASE_FUNCTIONS_URL"),
      storage: parseServiceUrl("VITE_FIREBASE_STORAGE_URL"),
    }
  : { auth: null, firestore: null, database: null, functions: null, storage: null };

// Default database URL when running in the all-localhost docker topology.
const legacyDatabaseURL = `http://${
  typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost"
}:9000?ns=${PROJECT_ID}`;

const selfHostedConfig = {
  apiKey: "self-hosted-api-key",
  authDomain: SERVICE_URLS.auth?.host ?? "self-hosted.local",
  // RTDB picks up its endpoint from this — it's the one service whose URL
  // belongs in the app config rather than a separate `connect*Emulator` call.
  databaseURL: SERVICE_URLS.database?.url
    ? `${SERVICE_URLS.database.url}?ns=${PROJECT_ID}`
    : process.env.VITE_REACT_APP_FIREBASE_DATABASE_URL || legacyDatabaseURL,
  projectId: PROJECT_ID,
  storageBucket: `${PROJECT_ID}.appspot.com`,
  messagingSenderId: "000000000000",
};

// Firestore needs its host configured *before* `getFirestore()` is first called,
// otherwise the SDK locks in defaults. We initialize it eagerly here when running
// over HTTPS subdomains; the localhost path stays on the legacy `connectFirestoreEmulator`.
const firebaseApp = initializeApp(
  isSelfHosted()
    ? selfHostedConfig
    : {
        apiKey: process.env.VITE_REACT_APP_FIREBASE_API_KEY,
        authDomain: process.env.VITE_REACT_APP_FIREBASE_AUTH_DOMAIN,
        databaseURL: process.env.VITE_REACT_APP_FIREBASE_DATABASE_URL,
        projectId: process.env.VITE_REACT_APP_FIREBASE_PROJECT_ID,
        storageBucket: process.env.VITE_REACT_APP_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.VITE_REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
      }
);

if (isSelfHosted() && SERVICE_URLS.firestore) {
  // HTTPS firestore needs initializeFirestore + ssl=true. The host string must
  // include the explicit port if it isn't 443 — the SDK doesn't infer.
  const fs = SERVICE_URLS.firestore;
  const hostForSdk = fs.port === 443 || fs.port === 80 ? fs.host : `${fs.host}:${fs.port}`;
  initializeFirestore(firebaseApp, { host: hostForSdk, ssl: fs.isHttps });
}

const connectLocalhostEmulators = (host) => {
  const functions = getFunctions(firebaseApp);
  connectFunctionsEmulator(functions, host, 5001);
  const storage = getStorage();
  connectStorageEmulator(storage, host, 9199);
  const FireStoreDb = getFirestore();
  connectFirestoreEmulator(FireStoreDb, host, 8080);
  const db = getDatabase();
  connectDatabaseEmulator(db, host, 9000);
  const auth = getAuth();
  // `disableWarnings` hides the SDK's "Running in emulator mode" banner — in
  // self-host this isn't dev usage, it's the actual backend.
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: isSelfHosted() });
  console.log(`CONNECTED TO EMULATOR at ${host}`);
};

const connectHttpsServices = () => {
  // Auth's emulator-connect helper takes a full URL, so HTTPS works directly.
  if (SERVICE_URLS.auth) {
    const auth = getAuth();
    connectAuthEmulator(auth, SERVICE_URLS.auth.url, { disableWarnings: true });
  }

  // Functions: no public HTTPS API; setting `emulatorOrigin` is the documented
  // workaround and has been stable across SDK versions.
  if (SERVICE_URLS.functions) {
    const functions = getFunctions(firebaseApp);
    functions.emulatorOrigin = SERVICE_URLS.functions.url;
  }

  // Storage: same story as Functions — no HTTPS knob on `connectStorageEmulator`,
  // so we override `host` directly. The internal property is `host`, including
  // the protocol prefix.
  if (SERVICE_URLS.storage) {
    const storage = getStorage();
    // The SDK expects `host` to be just the URL string with protocol.
    storage.host = SERVICE_URLS.storage.url;
    // Some SDK versions split protocol/host/port — set those too if present.
    if ("_protocol" in storage) storage._protocol = SERVICE_URLS.storage.isHttps ? "https" : "http";
    if ("_host" in storage) storage._host = SERVICE_URLS.storage.host;
    if ("_port" in storage) storage._port = SERVICE_URLS.storage.port;
  }

  // Firestore was already wired above via `initializeFirestore`.
  // RTDB was already wired via `databaseURL` in the app config.

  console.log("CONNECTED TO HTTPS EMULATOR SUBDOMAINS");
};

const anyServiceUrlSet = Object.values(SERVICE_URLS).some(Boolean);

if (isSelfHosted()) {
  if (anyServiceUrlSet) {
    connectHttpsServices();
    // Fall back to localhost-style HTTP for any service whose URL wasn't set
    // (useful for mixed setups, e.g. testing the SPA over a proxy while the
    // emulators stay local).
    const fallbackHost = typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost";
    if (!SERVICE_URLS.functions) {
      connectFunctionsEmulator(getFunctions(firebaseApp), fallbackHost, 5001);
    }
    if (!SERVICE_URLS.storage) {
      connectStorageEmulator(getStorage(), fallbackHost, 9199);
    }
    if (!SERVICE_URLS.firestore) {
      connectFirestoreEmulator(getFirestore(), fallbackHost, 8080);
    }
    if (!SERVICE_URLS.database) {
      connectDatabaseEmulator(getDatabase(), fallbackHost, 9000);
    }
    if (!SERVICE_URLS.auth) {
      connectAuthEmulator(getAuth(), `http://${fallbackHost}:9099`, { disableWarnings: true });
    }
  } else {
    // No subdomain env vars set → legacy "everything on the SPA's hostname"
    // wiring. This is the Docker default.
    connectLocalhostEmulators(typeof window !== "undefined" ? window.location.hostname || "localhost" : "localhost");
  }
} else if (isBackendEnvEmulator()) {
  if (window.location.host.includes("localhost") || window.location.host.includes("127.0.0.1")) {
    connectLocalhostEmulators("localhost");
  }
}

export default firebaseApp;
