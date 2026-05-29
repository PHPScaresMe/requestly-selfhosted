# Requestly Self-Hosting Notebook

This file is a working document for the project of making Requestly fully self-hostable. The original
project is open-source-ish — the client (this repo) is MIT, but the entire backend is proprietary
and lives in a separate, non-public repo (`requestly-backend`). The free client also pushes a lot of
sales/sign-up nudges. The goal of this project is to ship a fully open-source self-hosted Requestly
with zero phone-home, zero sales UI, and feature parity for everything except the SaaS-specific
features (team billing, Stripe checkout, the Apollo sales pipeline).

**Read this whole file before doing anything.** Section 7 has the current status / pickup point.

---

## 1. What's in this repo (the client side)

Everything here is client code that runs in a browser, an Electron renderer, or a browser extension.
Nothing here is a server.

```
app/               React SPA — the actual UI
  src/firebase.js  Initializes the Firebase SDK (auth/firestore/RTDB/functions/storage)
  src/backend/     ONLY place that should import firebase/* — abstracts Firestore/Functions
  src/actions/FirebaseActions.js  Auth flows (859 LoC: signUp, signIn, magic link, SSO, password reset)
  src/hooks/AuthHandler.ts        Top-level onAuthStateChanged handler — gates everything else
  src/hooks/featureLimiter/       Feature-quota enforcement (the easiest-to-defeat paywall)
  src/features/pricing/           PremiumFeature wrapper, PricingModal, Stripe checkout
  src/features/workspaces/        Personal / Shared / Local / LocalStorage workspace types
  src/features/apiClient/helpers/modules/sync/  Repository abstraction (cloud / local / localStore)
browser-extension/ Chrome/Firefox/Safari/Edge extension
common/rule-processor/  Shared rule engine (used by extension + desktop + web)
shared/            Common TS types
ee/                Empty except for an "Enterprise Edition" license stub
```

The companion proprietary repos (NOT in here):

- `github.com/requestly/requestly-backend` — Firebase project: ~47 cloud functions, Firestore schema,
  RTDB schema, Stripe integration, Apollo email pipeline. **We need to recreate this** to self-host.
  The `run.sh` script in this repo does `cd firebase/functions && npm run emulator` which implies the
  original devs symlink/clone the backend repo as `./firebase/functions`.
- `requestly-desktop-app` — Electron wrapper. Loads the SPA in a renderer, runs an HTTP/HTTPS proxy
  on the main process for system-wide traffic capture, exposes IPC bridges on `window.RQ.DESKTOP`.
  Out of scope for v1 of self-hosting (web + extension is enough for most users).
- `requestly-mock-server` — Standalone Node service for hosting mock APIs (CDN-style endpoints like
  `requestly.tech/api/...`). Separate concern; doesn't block self-host but should be addressed.

---

## 2. The proprietary surface area — exact inventory

Run `grep -rE "httpsCallable\(" app/src | grep -oE '"[a-zA-Z][-a-zA-Z]*"' | sort -u`
to regenerate this list.

### 2.1 Cloud Functions (47 unique, must reimplement or stub)

Naming convention: `<group>-<functionName>`.

**Auth / SSO** (the SPA hits these during signin)
- `auth-captureSSOInterest` — Apollo lead capture for SSO requests. **Stub no-op**.
- `auth-createAuthToken` — Generates an auth token for desktop deep-link sign-in flow.
- `auth-generateCustomToken` — Used by iframe `?refreshToken=` deep link. Calls
  `admin.auth().createCustomToken()` server-side. **Must reimplement** if we want desktop SSO.

**User / Org**
- `users-getAuthSyncData` — Fetches the user's sync state.
- `users-getOrganizationUsers` — Returns headcount for a given email domain (for the analytics
  attribute `companyUserSerial`). **Stub** returns `{ total: 0, users: [] }`.
- `getEnterpriseAdminDetails` — Returns enterprise admin metadata, mostly used to drive the
  AppNotificationBanner. **Stub** returns `{ enterpriseData: null }`.

**Teams / Invites**
- `teams-createTeam`, `teams-deleteTeam`, `teams-getTeamInfo`, `teams-getTeamUsers`,
  `teams-getPendingUsers`, `teams-getTeamSubscriptionInfo`, `teams-getTeamBillingExclude`,
  `teams-getTeamBillingUsers`, `teams-isTeamAdmin`, `teams-updateTeamUserRole`,
  `teams-getPendingTeamInvites`
- `invites-createTeamInvites`, `invites-createOrganizationTeamInvite`,
  `invites-upsertTeamCommonInvite`, `invites-getTeamPublicInvite`, `invites-verifyInvite`,
  `invites-acceptInvite`, `invites-revokeInvite`
- Legacy: `acceptTeamInvite`, `inviteEmailToTeam`, `getTeamInvite`
- These all need real impls if we want collaboration. **For v1, stub everything except
  createTeam/getTeamUsers** so the basic single-user-with-a-named-workspace flow works.

**Billing / Subscription** — most of these are sales-side; stub to no-ops.
- `subscription-createSubscriptionUsingCheckout`, `subscription-manageSubscription`
- `billing-fetchBillingTeam`, `billing-createBillingTeamInvites`,
  `billing-reviewBillingTeamJoiningRequest`, `billing-revokeBillingTeamInvite`
- `internalNotifications-sendBillingTeamInvoiceRequest`

**Mocks / shared lists / sessions**
- `addMock`, `deleteMock` — Legacy; current code path writes Firestore directly. Stub.
- `sharedLists-create`, `sharedLists-delete`, `sharedLists-sendImportAsEmail`,
  `sharedLists-sendShareEmail` — Sharing-by-link feature (public read-only rules). **Need real
  impls** for sharing to work.
- `sessionRecording-sendRecordingAsEmail`, `sessionRecording-addToApolloSequence` — Stub.

**Notifications / Apollo (pure sales — stub to no-op)**
- `premiumNotifications-addUserToList`, `premiumNotifications-requestAddPlan`,
  `premiumNotifications-requestPlanSwitch`, `premiumNotifications-salesInboundNotification`
- `pricing-addToApolloPricingFiddleSequence`
- `slackConnect-sendSlackInvitation`
- `usageMetrics`

### 2.2 Firestore collections referenced

Collections directly read/written from `app/src`:
- `users/{uid}` — user profile
- `usernames/{username}` — uniqueness index
- `individualSubscriptions/{uid}` — individual Stripe subscription state
- `teams/{teamId}` — workspace doc
- `teams/{teamId}/billing/{?}` — billing subdoc
- `teams/{teamId}/invoices/{?}`
- `mocks/{mockId}` — mock server entries
- `mocks/{mockId}/logs/{?}` — mock invocation logs (subcollection)
- `apis/{apiRecordId}` — saved API requests/collections (cloud workspace mode)
- `apis/{apiRecordId}/examples/{?}` — saved examples
- `environments/{envId}` — API client environments
- `environments/global/{?}` — workspace-level global env
- `templates/{?}` — rule templates (UI samples)
- `sso/{?}` — SSO config
- `appSumoCodes/{?}` — AppSumo redemption — not needed for self-host

### 2.3 Realtime Database (RTDB) paths

Used for live sync (rules, settings, session recording config). Grep for `getDatabase()` and
`ref(db, ...)` in `app/src` to enumerate. Off the top of my head:
- `users/{uid}/...` — sync data for rules/settings (legacy paths)
- `teams/{teamId}/...` — team-scoped sync
- `usersettings/...`
The RTDB schema is sprawling and undocumented — `app/src/utils/db/UserModel.js` and
`app/src/actions/FirebaseActions.js` are the best places to start mapping it.

### 2.4 Firebase Auth

Used as-is. Providers expected: Email/Password, Google, GitHub, SAML, generic OAuth, magic link.
Self-host plan: keep Firebase Auth Emulator since it implements the SDK protocol; or swap to a real
OSS provider (Lucia, Authelia, Keycloak) behind a small adapter. For v1, use the emulator.

### 2.5 Firebase Storage

Used for: session recording uploads (HAR files), user avatars, mock-server file blobs. Storage
emulator handles this fine.

### 2.6 Other external services (must be configurable / removable)

These are all third-party and should be conditionally disabled in self-host mode:

- **GrowthBook** (`https://cdn.growthbook.io`) — feature flags. Most flags default to off; the few
  that control sales UI (`show_upgrade_popovers`, `OVERRIDE_TEAM_SYNC_STATUS`) can be hardcoded.
  In self-host mode, skip `growthbook.loadFeatures()` and let everything use defaults.
- **Stripe** (`pk_test_...` in `.env`) — payment. Already irrelevant in self-host.
- **Sentry** — error tracking. Make optional.
- **Amplitude / Mixpanel / Google Analytics** — analytics. The `modules/analytics` layer should be
  no-op in self-host mode.
- **BrowserStack (EDS)** — eligible-domains check for student plans. Irrelevant in self-host.
- **Apollo.io** — sales sequences via the `premiumNotifications-*` / `pricing-addTo*` functions.
  Stubbing those functions kills the integration.
- **Slack Connect** — `slackConnect-sendSlackInvitation`. Stub.
- **Customer support chat** (Crisp or similar) — should be searchable; disable in self-host.

---

## 3. How the gating actually works (key insight)

The app already has a **fully working local-only fallback** for logged-out users:

- `ApiClientContextService.createRepository()` (`app/src/features/apiClient/slices/workspaceView/helpers/ApiClientContextService/ApiClientContextService.ts:102-127`)
  picks `localStoreRepository` (IndexedDB) when `!user.loggedIn`.
- `WorkspaceType.LOCAL_STORAGE` is wired through `apiClient/slices/workspaceView/thunks.ts`.
- The rules engine uses `services/clientStorageService` which already supports IndexedDB/localStorage.

**The feature limiter is one bit** (`app/src/hooks/featureLimiter/useFeatureLimiter.ts:57`):
```
if (isUserPremium && !premiumPlansToCheckLimit.includes(userPlan)) return Infinity;
```
So flipping `user.details.isPremium = true` opens every limit. The `<PremiumFeature>` popover
(`app/src/features/pricing/components/PremiumFeature/index.tsx`) also gates on
`useFeatureIsOn("show_upgrade_popovers")` — turning that GrowthBook flag off (or hardcoding it to
false in self-host) suppresses the popovers entirely.

This means even in path A (client-only patch), most features work. Path B (chosen) adds team sync,
sharing, and SSO.

---

## 4. The plan (path B = full open-source backend)

Decided: rewrite/reimplement the backend, ship as Docker Compose stack. Sales UI stays in the
codebase but gated behind a `selfHosted` flag (defaults true in self-host builds, false otherwise so
upstream merges aren't a pain).

### 4.1 Architecture

```
┌────────────────────────────────────────────────────────────┐
│  nginx (port 80) — serves static SPA build from app/dist   │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│  Firebase Emulator Suite (in same Docker network)           │
│   - Auth   :9099     (handles all auth SDK calls)           │
│   - Firestore :8080  (Firestore SDK)                        │
│   - RTDB   :9000     (sync)                                 │
│   - Storage :9199    (file uploads)                         │
│   - Functions :5001  (runs our reimplemented funcs)         │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│  server/functions/  — open-source reimpl of all 47 funcs    │
│  Plus optional: bootstrap script that seeds                 │
│  templates collection / rule samples on first run.          │
└────────────────────────────────────────────────────────────┘
```

Why use the Firebase Emulator Suite instead of a true OSS rewrite of Firestore/Auth?
- The emulators run **offline, on-prem, with no Google connectivity required at runtime**.
- They implement the exact wire protocol the SDK uses, so we don't need to touch any of the 130+
  files in `app/src` that import from `firebase/*`.
- This dramatically scopes down the project. We "just" need to write the cloud functions and the
  firestore.rules/database.rules.

**Caveat:** the emulators are not licensed as OSS in the strict sense (they're Google binaries
distributed via `firebase-tools`). For a fully OSS stack, the longer-term move is a swap layer that
implements the Firestore REST/gRPC protocol on top of SQLite (something like `firestore-rs` or
`firebase-server` projects exist). Document this as a v2 follow-up.

### 4.2 Repo layout we're moving to

```
server/                     NEW — backend code
  functions/                Cloud function impls
    src/
      auth/                 auth-*, sso-*
      teams/                teams-*
      invites/              invites-*
      billing/              billing-*, subscription-* (mostly no-op)
      notifications/        premiumNotifications-*, pricing-*, slackConnect-* (no-op)
      mocks/                addMock, deleteMock
      sharedLists/          sharedLists-*
      sessions/             sessionRecording-*
      misc/                 usageMetrics, getEnterpriseAdminDetails
      index.ts              Re-exports all
    package.json
  firestore.rules           Security rules (allow all in self-host mode, or per-user)
  database.rules.json       RTDB rules
  storage.rules
  firebase.json             Emulator + functions config
docker/
  Dockerfile.app            Multi-stage build: vite build → nginx alpine
  Dockerfile.functions      Node + firebase-tools + cloud functions
  nginx.conf
  docker-compose.yml
self-host-docs/             User-facing setup guide
```

### 4.3 Client-side changes needed

1. `app/src/utils/EnvUtils.ts`: add `isSelfHosted()` that returns `process.env.VITE_SELF_HOSTED === "true"`.
2. `app/src/firebase.js`: when `isSelfHosted()`, always connect to the in-cluster emulator regardless
   of host being localhost.
3. `app/src/hooks/AuthHandler.ts`: when `isSelfHosted()`, skip the GrowthBook attribute calls and
   skip the `getEnterpriseAdminDetails` call until the function is implemented (or it errors
   gracefully — currently it does, but spams the console).
4. Sales UI gating — wrap with `if (isSelfHosted()) return null;` at the top:
   - `componentsV2/AppNotificationBanner/OrgNotificationBanner.tsx`
   - `componentsV2/SecondarySidebar/components/BillingTeamsNudge/`
   - `features/pricing/components/PricingModal/`
   - `features/pricing/components/PremiumFeature/` — keep the wrapper but force `isExceedingLimits=false`
   - `features/settings/components/BillingTeam/`
   - Any "Upgrade" button in the header/sidebar — search for `data-tour-id="upgrade"` or "Upgrade now"
5. `app/src/utils/feature-flag/growthbook.js`: when `isSelfHosted()`, return a stub GrowthBook
   instance whose `isOn`/`getFeatureValue`/`useFeatureIsOn` always returns sensible defaults.
6. `app/src/modules/analytics/`: gate `trackEvent` / `submitAttrUtil` behind `isSelfHosted()`.

### 4.4 Sentinel "premium" user

For self-host, the simplest path is: trust the Firebase Auth Emulator. Anyone who can reach the
service is "admin." Set every user to `isPremium=true` on signup. The user-doc / subscription-doc
creation should be done by an `onCreate` auth trigger in our `server/functions`.

---

## 5. Step-by-step plan (in order)

1. **[done — see task #1-3]** Map the proprietary surface.
2. **[in progress]** Document everything (this file).
3. Scaffold `server/functions/` with package.json, tsconfig, index.ts re-export structure.
4. Write `firebase.json`, `firestore.rules` (per-user data only), `database.rules.json`, and a
   one-line `auth-onCreate` trigger that seeds `users/{uid}` and `individualSubscriptions/{uid}`
   with `isPremium=true` equivalent state.
5. Implement no-op functions for: all sales/Apollo/billing/subscription/notification stuff.
   ~15 functions, ~5 LoC each.
6. Implement real functions:
   - `getEnterpriseAdminDetails` returns `{ enterpriseData: null }`
   - `users-getAuthSyncData`, `users-getOrganizationUsers`
   - Team/invite family (full CRUD on Firestore `teams/` and `invites/` collections)
   - `sharedLists-*` (Firestore `sharedLists/` collection + a deterministic shortId generator)
   - `auth-createAuthToken`, `auth-generateCustomToken` (admin.auth().createCustomToken)
7. Patch the client: add `VITE_SELF_HOSTED` flag, gate sales UI, force-premium user, point Firebase
   init at the emulator when flag is on.
8. Build Docker images and `docker-compose.yml`.
9. Smoke test: rules CRUD, API client CRUD with team-workspace sync, mock server, session recording,
   sharing by link.
10. Write `self-host-docs/README.md` covering ports, persistence (mount volumes for emulator data),
    upgrade path, how to bring your own OAuth provider.

---

## 6. Tricky bits / open questions

- **Firestore security rules.** The current schema mixes per-user data (`users/{uid}/...`) with
  shared docs (`apis/{apiId}` where ownership is derived from a field). Rules will need to mirror
  whatever the proprietary backend has — start permissive and tighten.
- **RTDB sync paths.** Undocumented. `actions/FirebaseActions.js` and `actions/TeamWorkspaceActions.js`
  are the main writers. The rules engine sync uses `rules/{ownerId}/...` paths. Need to crawl this
  carefully and write `database.rules.json`.
- **Custom claims on auth tokens.** Some places check `request.auth.token.role`. The custom-claim
  set happens in the legacy backend on team-membership change. Replicate via a Firestore trigger.
- **`@requestly/requestly-core`** (`file:..` in app/package.json) — top-level `index.js` rolls up
  constants. Should not be a self-host blocker but worth confirming.
- **Mock server URLs.** The mock server runs at `requestly.tech/api/...` in prod. Self-host needs
  to either (a) ship `requestly-mock-server` as a fourth container, or (b) wire mock URLs to a
  local path on the same nginx. Address in v2 — for v1, mocks work in-app via the desktop proxy /
  extension webRequest interception.
- **Session recording playback.** Sessions are serialized rrweb dumps stored in Firebase Storage
  + an index doc in Firestore. Storage emulator handles upload; just need to confirm CORS works.
- **Desktop deep-link auth.** When the SPA is opened from the desktop app's "Sign in" button, it
  receives a `refreshToken` via query string and exchanges via `auth-generateCustomToken`. We need
  to implement that function to keep desktop sign-in working — but desktop is v2.

---

## 7. Current status — pickup point

**Last touched:** 2026-05-28 (session 7 — mock server, tracker scrub, HTTPS subdomains, extension hosting)

### TL;DR — self-host is functionally complete

A fresh `docker compose -f docker/docker-compose.yml up --build` gives you a fully
working Requestly instance: sign up, sign in, create rules, run the API client,
serve mocks, create team workspaces, invite by email, accept invites, send/receive
sharing emails, reset passwords via SMTP. Everything works without any phone-home
to requestly.com or third parties. The browser extension is built and served from
the SPA container at `<your-url>/extension.zip`.

The 47 proprietary cloud functions have all been replaced or stubbed in
`server/functions/`. The Firebase emulator suite is the runtime. Data persists in
the `docker_emulator-data` volume across restarts.

### Decision tree (how to think about new work)

When something in the SPA does something the user shouldn't have to deal with in
self-host, the choice is one of:

1. **Suppress at the redux level** when there's a single chokepoint
   (e.g. `pricingModal` open requests blocked in
   `store/slices/global/modals/case-reducers.ts` — one branch, no component edits).
2. **Conditionally render `null`** when the component is the right level of
   granularity (e.g. `RequestBot`, `BillingTeamNudge`, "Ask AI" button in
   `MenuHeader`). Always gate **inside the component before the JSX return** so
   hooks fire consistently.
3. **Render-site gate** when the component tree is shared between modes
   (e.g. `{isSelfHosted() ? null : <X />}` in `DashboardLayout`).
4. **Replace the import via Vite alias** when a package has module-init side
   effects that run before any of our code (`@stripe/stripe-js` — see
   `app/vite.config.ts` and `app/src/stubs/`). This is the only fix that prevents
   eager script injection.
5. **Replace at the SDK call site** when it's a Firebase SDK call that has to
   land somewhere — patch the file that holds the call rather than the SDK itself
   (e.g. `forgotPassword` calls our custom `auth-sendPasswordReset` function
   when `isSelfHosted()`).
6. **Implement the cloud function** when it's something the SPA expects a real
   response from (everything in `server/functions/src/`). The shape the client
   *reads* matters — match it exactly, including which keys are at top level vs.
   nested under `data`. Run a callable, watch the function log, inspect what
   keys the client reads from the response, iterate.
7. **No-op stub** when the function is purely sales/Apollo/Slack — return
   `{success: true}` so the UI doesn't surface an error.

When a feature uses Firestore docs, **check both the write path and the read
path in the SPA** before implementing the cloud function. Several times my first
implementation matched what the function "should" do but missed that the SPA
reads a key at a level the function didn't return. The `invites` rewrite
(session 3 → session 4) is the canonical example.

When a feature involves the **client receiving an email and clicking a link**,
make sure `PUBLIC_APP_URL` (server) is set so the link lands on the user's
deployment rather than `localhost:3005`.

### What's where (files you'll want to know)

**Cloud functions** (`server/functions/src/`):
- `index.ts` — re-exports everything. Cloud function names like `auth-createAuthToken`
  come from `export * as auth from "./auth"` — Firebase functions converts the
  `<group>.<name>` export shape into `<group>-<name>` URLs automatically.
- `helpers/callable.ts` — `callable()` wrapper (uniform error envelope) and
  `noopCallable("label")` for the sales-side stubs.
- `helpers/mailer.ts` — nodemailer wrapper, reads SMTP from env. Falls back to
  logging when `SMTP_HOST` is unset.
- `admin.ts` — initializes `firebase-admin`, sets `ignoreUndefinedProperties: true`
  on Firestore (essential — Firestore otherwise rejects writes containing any
  `undefined` field).
- `mocks/handleMockRequest.ts` + `mocks/firestoreMockSource.ts` — hosts the
  open-source `@requestly/mock-server` npm package, wires it to read mocks from
  Firestore and response bodies from Storage.
- `triggers/userOnCreate.ts` — Auth `beforeUserCreated` trigger that seeds
  `users/{uid}` + `individualSubscriptions/{uid}` with premium state and returns
  `{ emailVerified: true }` so users skip the verify-email step.

**Self-host gating** (`app/src/`):
- `utils/EnvUtils.ts` — `isSelfHosted()` reads `VITE_SELF_HOSTED === "true"` or
  the `window.__rq_self_hosted__` runtime flag.
- `firebase.js` — fully refactored for two topologies. Localhost (default)
  uses `connect<Service>Emulator()` against `window.location.hostname`. HTTPS
  subdomains are driven by `VITE_FIREBASE_*_URL` env vars; Auth uses URL,
  Firestore via `initializeFirestore({host, ssl:true})`, RTDB via
  `databaseURL` in app config, Functions + Storage via direct `emulatorOrigin`/
  `host` patch (no public HTTPS API for those two — documented workaround).
- `features/onboarding/screens/auth/components/SelfHostedAuthForm/` — the
  email+password auth UI for self-host. Replaces the magic-link/BrowserStack flow
  at the top of `AuthScreen.tsx`.
- `store/slices/global/modals/case-reducers.ts` — `pricingModal` is in the
  `SELF_HOSTED_MODAL_BLOCKLIST` so it can never open.
- `hooks/featureLimiter/useFeatureLimiter.ts` — forces `isUserPremium=true` in
  self-host. One line, every paywall opens.
- `actions/FirebaseActions.js` — `forgotPassword` uses our `auth-sendPasswordReset`
  function in self-host; `signUp` skips `sendEmailVerification` in self-host.
- `utils/feature-flag/growthbook.js` — `apiHost` is a dead URL in self-host;
  `loadFeatures()` is skipped from `AppLayout`. All flags default-off.
- `modules/analytics/index.js` + `modules/analytics/integrations/posthog.ts` —
  early returns when `isSelfHosted()`.
- `utils/geoUtils.js` — returns `{loc: "ZZ"}` in self-host (skips Cloudflare
  trace).
- `vite.config.ts` — aliases `@stripe/stripe-js` and `@stripe/react-stripe-js`
  to local stubs in self-host builds. Required to prevent the Stripe SDK's
  module-init side effect from injecting `js.stripe.com/v3`.
- `stubs/stripe-js-stub.ts` + `stubs/react-stripe-js-stub.tsx` — empty
  replacements for the Stripe packages.
- `components/misc/InstallExtensionCTA/supportedBrowserExtensions.js` — in
  self-host, every entry points at `/extension.zip` so the existing CTA cards
  light up with a local download link.
- `config/constants/index.js` — `APP_CONSTANTS.mock_base_url.selfHosted` reads
  `VITE_FIREBASE_FUNCTIONS_URL` at build time; runtime fallback to
  `<window.hostname>:5001` for the docker default.

**Docker stack** (`docker/`):
- `Dockerfile.app` — multi-stage. Builds @requestly/requestly-core, @requestly/shared,
  the SPA, AND the browser extension (zip → `/extension.zip` in nginx html).
  Heap bumped to 6GB for Vite. `apt install zip` for the extension archive.
- `Dockerfile.functions` — Node + OpenJDK + firebase-tools. Uses
  `functions-entrypoint.sh` so SIGTERM reaches firebase-tools (without this,
  `--export-on-exit` never fires and you lose your data on restart).
- `functions-entrypoint.sh` — wipes nothing, only creates `/data/export/` if
  it doesn't exist (critical — the export target can't be the volume root, or
  firebase-tools' `rmdir` on shutdown fails with EBUSY).
- `build-extension.sh` — regenerates
  `browser-extension/config/configs/env/self-hosted.json` from `VITE_PUBLIC_APP_URL`
  (so users edit ONE env var, not two) and runs the extension build.
- `docker-compose.yml` — two services (`app`, `functions`). `stop_grace_period: 45s`
  on functions for the data export. `env_file: ../server/.env` for SMTP creds.
- `nginx.conf` — SPA fallback + `/extension.zip` served with Content-Disposition.

**Env files:**
- `app/.env.self-hosted` — built into the SPA image. Set `VITE_PUBLIC_APP_URL`
  (used everywhere as the public URL) and optionally the five
  `VITE_FIREBASE_*_URL` vars for HTTPS subdomain topology.
- `server/.env` (gitignored) — SMTP creds + `PUBLIC_APP_URL`. Loaded into the
  functions container via `env_file`. See `server/.env.example`.
- `browser-extension/config/configs/env/self-hosted.json` — regenerated at
  Docker build time from `VITE_PUBLIC_APP_URL`. Don't hand-edit unless you're
  side-loading without Docker.

**Docs** (`self-host-docs/`):
- `README.md` — quickstart
- `extension.md` — extension install path (auto-built by Docker + manual)
- `reverse-proxy.md` — NPM subdomain setup for HTTPS deployment

### Session log

**Session 1** — Mapped the proprietary surface, decided path B (Firebase
Emulator Suite + reimplemented functions), scaffolded `server/functions/`,
wrote real impls for auth/teams/invites/sharedLists basics, no-op stubs for
sales functions. Set up Docker stack. Wrote auth trigger (`beforeUserCreated`)
that seeds users as premium. Added `isSelfHosted()` and gated the obvious sales
UI (PricingModal at redux layer, BillingTeamsNudge, AppNotificationBanner).
Untested at end of session.

**Session 2** — First boot. Fixed several build issues (Python for
tree-sitter, root requestly-core needed building, common dep order, Vite OOM,
node-gyp paths). Auth flow: built `SelfHostedAuthForm` because the new
magic-link UI doesn't work without SMTP. Gated the OAuth auto-redirect in
`AuthModal`. Added `auth-sendPasswordReset` cloud function using
`admin.auth().generatePasswordResetLink()` + nodemailer. SMTP plumbing into
`sharedLists-sendShareEmail` and `sessionRecording-sendRecordingAsEmail`.

**Session 3** — Team workspaces end-to-end. Caught the **persistence bug**:
emulator export was failing `EBUSY: rmdir '/data'` because the export target
was the volume mountpoint. Moved to `/data/export` subdir, added `exec`'d
entrypoint script for SIGTERM propagation, bumped `stop_grace_period: 45s`.
Rewrote `invites/index.ts` to match the proprietary `{type: "teams", metadata:
{teamId, teamName, teamRole, ownerEmail, …}, status, usage}` schema. Reshaped
`teams-getTeamSubscriptionInfo` / `-getTeamBillingExclude` / `-getTeamBillingUsers`
and `invites-getTeamPublicInvite` to match the response shapes the client reads.
Removed auth requirement from `verifyInvite` (recipient hasn't signed in yet).
Added `fetchEmailType` (un-namespaced stub). Made `getColorFromString` defensive.
Added `ignoreUndefinedProperties: true` to Firestore admin settings.

**Session 4** — API client smoke test (cloud sync works; firing requests needs
the extension). Templates already work from a local TypeScript constant
(`templateRecords` in `templatesList/components/TemplatesTable/constants/templates.ts`)
— the Firestore `templates` collection is dead code in the current SPA, no
seeding needed.

**Session 5** — Browser extension self-host config. Added
`browser-extension/config/configs/env/self-hosted.json`. Fixed two build bugs:
`build.sh` only read `$1` (so `ENV=self-hosted bash build.sh` was silently
dropped → fixed to accept both forms), and the config generator's
"existing config merge" was poisoning subsequent builds (→ wipe
`config/dist/config.build.json` at the start of every build).

**Session 6** — Workspace sync investigation. End-to-end sync works (RTDB write,
listener fires, IndexedDB hydrates, Redux updates). Minor UI-refresh lag that
requires a tab nav to surface new sync data, but doesn't lose data. Marked as
polish-later.

**Session 7** — Mock server (containerized via @requestly/mock-server npm
package inside our functions container as `handleMockRequest` HTTP function;
no 4th container). FirestoreMockSource adapter reads selectors from
`user-mocks-metadata/{ownerId}.mockSelectors` and full mocks from
`mocks/{mockId}`; bodies hydrated from Storage at `<storagePath>/body/{responseId}`.

External-tracker scrub:
- GoogleTagManager — wrapped in `if (!__isSelfHosted)` in `index.html`
- PostHog — `init()` early return when self-host
- Cloudflare trace — `getUserGeoDetails` short-circuits to `{loc: "ZZ"}`
- Google One Tap (`accounts.google.com/gsi/client`) — gated in both
  `index.html` and `useGoogleOneTapLogin` (URL becomes `""`)
- Botsonic iframe (`writesonic.com`, `geolocation-db.com`) — `RequestBot`
  returns null, "Ask AI" buttons hidden in `MenuHeader` and `SupportPanel`
- **Stripe** — runtime gating insufficient because `@stripe/stripe-js` has a
  module-init side effect. Solution: Vite alias replaces the package with a
  stub in self-host builds. Stripe code no longer in the bundle at all.

HTTPS subdomain refactor (`firebase.js`). Five new `VITE_FIREBASE_*_URL` env
vars. NPM Proxy Hosts (with custom certs that NPM Streams refuses to accept)
work fine. Documented in `self-host-docs/reverse-proxy.md`.

Browser extension hosted by SPA: `docker/Dockerfile.app` now also builds the
extension (auto-deriving its `WEB_URL` from `VITE_PUBLIC_APP_URL` via
`build-extension.sh`), zips it, and nginx serves it at `/extension.zip`. The
existing "install extension" CTA on the Rules page picks up the local URL via
the modified `supportedBrowserExtensions` array.

### Known limitations / future work

- **Workspace rule sync UI refresh lag** (session 6). Data does arrive in
  IndexedDB and Redux but the rules table doesn't auto re-render — a tab nav
  triggers it. `useFetchAndUpdateRules` listens to a `pendingRefresh.rules`
  flag that does get flipped by the sync listener; something between the flag
  flip and the React `useEffect` re-run is being missed. Polish-later.
- **Desktop deep-link auth** — the `auth-generateCustomToken` function is
  implemented but the desktop app isn't packaged with this stack. Out of scope
  for v1 self-host.
- **Google/GitHub/SAML SSO** — Firebase Auth Emulator can be configured with
  provider credentials, but it needs a real HTTPS callback URL. With the
  HTTPS subdomain setup that's now available; just hasn't been wired.
- **The `functions.emulatorOrigin` and `storage.host` overrides** in
  `firebase.js` use internal SDK properties (no public API). They've been
  stable for years but could break in a future Firebase SDK major.
- **Mock server response logs** — `ISink` interface exists in the
  `@requestly/mock-server` package but we don't implement it. Logs aren't
  persisted. Would be a small Firestore-backed `mock-logs/{mockId}/...`
  collection if anyone wants them.
- **The `templates` Firestore collection is dead code** in the SPA but the
  cloud-function reads still go through `getTemplates` for some legacy paths.
  If someone ever flips `getSampleRules(true)`, you'll need to either populate
  Firestore or stub the function. Currently it returns null and the SPA falls
  back to the local constant.

### How to add a new self-host gate / feature

The pattern that has worked repeatedly:
1. **Find every SPA callsite** of the cloud function or feature.
   `grep -rE "httpsCallable\(.+, \"<name>\"" app/src` is the starting point.
2. **Read the callsite to figure out what the SPA reads from the response.**
   This is where most of my early bugs came from — I implemented what the
   function "should" do based on its name instead of what the SPA actually
   pulls out of the response envelope.
3. **Implement the function** in `server/functions/src/`, matching that shape
   exactly. Use `noopCallable("name")` if it's purely sales/Apollo.
4. **Add it to the index re-export** (`src/index.ts`). Grouped functions
   (`export * as group from "./group"`) auto-generate the `group-name` URL.
5. **Rebuild functions container** and tail logs while the user retests:
   `docker compose -f docker/docker-compose.yml logs functions -f`.
6. **The functions container also restarts in <30s** — much faster iteration
   than the app container.

### How to start the stack from scratch on a new machine

```bash
git clone <this fork>
cd requestly-selfhosted
cp server/.env.example server/.env   # fill in SMTP if you want emails to deliver
docker compose -f docker/docker-compose.yml up --build
```

Open `http://localhost:3005`. First sign-up creates the user (Auth Emulator
accepts any email/password). Browse to `/extension.zip` for the browser
extension and load it unpacked.

For HTTPS deployment behind a reverse proxy: see `self-host-docs/reverse-proxy.md`.

### Useful greps

```bash
# Cloud function names the SPA expects
grep -rE 'httpsCallable\(' app/src | grep -oE '"[a-zA-Z][-a-zA-Z]*"' | sort -u

# All Firestore collections referenced
grep -rhE 'collection\([^,]+, *"[^"]+"' app/src | grep -oE '"[a-zA-Z_-]+"' | sort -u
grep -rhE 'doc\([^,]+, *"[^"]+"' app/src | grep -oE '"[a-zA-Z_-]+"' | sort -u

# Anywhere the SPA still calls out to an external host
grep -rEn '://[a-z]+\.[a-z]+\.com|posthog|stripe|amplitude' app/src \
  | grep -v node_modules | grep -v test

# All places the self-host flag is checked
grep -rn 'isSelfHosted\|__isSelfHosted' app/src app/index.html
```

### Reproducing today's success (the short version)

1. The Firebase Emulator Suite IS the self-host backend. It's free, runs
   offline, doesn't phone home. Don't try to reimplement Firestore/Auth/RTDB
   from scratch — the emulators are good enough and they're what we've shipped.
2. **For every proprietary cloud function**, choose between implementing it,
   stubbing it as `noopCallable`, or removing the SPA's call site. Match the
   *response shape the SPA reads* exactly, not what the docs imply.
3. **For every external tracker / SDK**, gate it as close to its callsite as
   possible. If it has module-init side effects (Stripe), use a Vite alias.
4. **Data persistence requires the emulator to export on shutdown** — keep the
   `/data/export` subdir convention, the `exec`'d entrypoint, and the
   45-second grace period. Don't let anyone reset those.
5. **Use the `selfHosted` field in `APP_CONSTANTS.mock_base_url`** + runtime
   hostname fallback for any URL that needs to differ between docker-local and
   subdomain-proxied deployments.

---

## (Historical) Session notes

### Session 3 (verbatim)

End-to-end working: create workspace → invite by email (real SMTP) → invitee opens
link → signs up via SelfHostedAuthForm → accepts → modal dismisses → lands in
workspace → both users see each other in member list. Workspace settings page also
opens cleanly (Members / Workspace settings / Plans & Billings tabs).

Late-session fixes during the team-workspace shakeout:
- `invites/index.ts` rewritten to store invites with the proprietary schema
  (`type: "teams"`, nested `metadata: {teamId, teamName, teamRole, ownerEmail, …}`,
  `status: pending|revoked|accepted`, `usage: once|unlimited`). The SPA accept
  handler reads `res.data.invite.type === "teams"` to decide whether to
  switchWorkspace + redirect; my earlier `"team"`/flat shape silently no-op'd that
  branch and left the modal hanging.
- `teams-getTeamSubscriptionInfo`, `teams-getTeamBillingExclude`,
  `teams-getTeamBillingUsers`, `invites-getTeamPublicInvite` reshaped to match the
  response keys the client reads (`subscriptionStatus`, `billingExclude`,
  `billQuantity/actualBillQuantity`, `public/domains` respectively).
- `verifyInvite` no longer requires auth (otherwise the landing page errors before
  the recipient can sign in). Now returns `{success, error?, data: {invite}}`
  envelope so the SPA routes to `not_logged_in` / `invalid_email` /
  `invite_not_found` / `invite_already_accepted` / `invite_expired` correctly.
- `admin.ts` now sets `ignoreUndefinedProperties: true` on Firestore — without it any
  optional field that's not set on the inviter (e.g. `displayName`) throws a 500
  server-side when writing the invite doc.
- `getColorFromString` defensively coerces non-strings → fixed `Uo.split is not a
  function` in `WorkspaceAvatar` when the workspace object was partially hydrated.
- `fetchEmailType` (un-namespaced callable) added — the SPA hit
  `localhost:5001/.../fetchEmailType` before showing email-domain UI, and the 404
  surfaced as a CORS error. Returns `PERSONAL`.

**Done in session 3:**
- SMTP wired into team-invite emails (`invites-createTeamInvites` and
  `invites-createOrganizationTeamInvite` now send a "join the workspace" mail with a
  link to `<PUBLIC_APP_URL>/invite/<inviteId>`).
- `invites-upsertTeamCommonInvite` now accepts both `publicEnabled` (toggle public link)
  and `domainEnabled` (toggle same-domain auto-accept) — callers in the SPA pass
  either depending on context. Domain toggle persists to the team doc.
- **Persistence fix.** The emulator was failing its `--export-on-exit` with
  `EBUSY: rmdir '/data'` because the export target was the same path as the volume
  mountpoint. Moved export+import to `/data/export` subdirectory, added a proper
  `exec`'d shell entrypoint (`docker/functions-entrypoint.sh`) so SIGTERM reaches
  firebase-tools rather than the wrapping sh, and bumped `stop_grace_period: 45s` in
  docker-compose. Verified end-to-end: sign up, stop, restart, sign in still works.
- Anyone running prior to this fix lost their data on the first compose restart.

**Done in session 2:**
- Auth flow now actually works in self-host: built a `SelfHostedAuthForm` component
  (`app/src/features/onboarding/screens/auth/components/SelfHostedAuthForm/`) with plain
  email + password + a login/signup toggle. Rendered in place of the magic-link UI when
  `isSelfHosted()`.
- Gated the magic-link auto-trigger path in `AuthScreen.handlePostAuthSyncVerification`.
- Gated the OAuth auto-redirect in `AuthModal` (was bouncing every "Sign up" click to
  `/oauth/authorize` which 404s).
- `redirectToOAuthUrl` (`utils/RedirectionUtils.js`) now opens the auth modal in sign-up
  mode in self-host mode rather than navigating away.
- `seedUserDocs` trigger returns `{ emailVerified: true }` so new users skip the
  verify-email rail entirely.
- `BillingTeamNudge`, `AppNotificationBanner`, and `PlanExpiredBanner` are now gated by
  `isSelfHosted()` at their render sites in DashboardLayout / SecondarySidebar.
- SMTP plumbing:
  - Added `nodemailer` + `@types/nodemailer` to `server/functions/package.json`.
  - `server/functions/src/helpers/mailer.ts` reads env vars and exposes `sendMail()` +
    `publicAppUrl()` helpers. Falls back to logging the payload when SMTP_HOST is unset.
  - `server/.env.example` documents the keys; `server/.env` (gitignored) holds the actual
    creds. Wired in via `env_file` in `docker/docker-compose.yml`.
  - `sharedLists-create` rewritten to match the actual `{rules, updatedGroups, sharedListName, …}`
    client payload and return the `{sharedListId, sharedListName, sharedListData, nonRQEmails}`
    shape the client expects.
  - `sharedLists-sendShareEmail` now sends a real email via nodemailer with a link
    to `<PUBLIC_APP_URL>/rules#sharedList/<id>-<slug>`.
  - `sessionRecording-sendRecordingAsEmail` sends a real email with the session URL.
  - `auth-sendPasswordReset` (new): uses `admin.auth().generatePasswordResetLink()` to mint
    an `oobCode`, then SMTPs a link to `<PUBLIC_APP_URL>/emailAction?mode=resetPassword&oobCode=…`.
    The existing EmailAction component routes that to the reset-password flow which uses
    the SDK's `verifyPasswordResetCode` + `confirmPasswordReset` against the emulator.
  - `actions/FirebaseActions.forgotPassword()` calls the new function in self-host mode
    instead of the SDK's `sendPasswordResetEmail`.
  - `actions/FirebaseActions.signUp()` skips `sendEmailVerification` in self-host (the auth
    trigger has already flipped emailVerified=true).

**Browser-extension self-host note** (for whenever we tackle it):
- The extension reads `browser-extension/config/configs/env/<env>.json` for `WEB_URL`,
  `SESSIONS_URL`, `OTHER_WEB_URLS`, `LANDING_PAGE_BASE_URL`. Add a `self-hosted.json` that
  points at the deployment hostname. The extension manifest's `externally_connectable`
  matches will also need the self-hosted hostname pattern.

**Last touched (session 1):** 2026-05-28

**Done in session 1:**
- Mapped the proprietary surface (sections 2-3).
- Wrote the architecture/plan (sections 4-5) and these notes.
- Scaffolded `server/functions/` with TypeScript + firebase-functions@6, firebase-admin@12.
  - `server/firebase.json`, `firestore.rules`, `database.rules.json`, `storage.rules` are all written.
  - All ~50 cloud function names the client expects are exported from `src/index.ts`.
  - **Real implementations** for: `auth-createAuthToken`, `auth-generateCustomToken`,
    `users-getAuthSyncData`, `teams-*` family (CRUD + member roles), `invites-*` family
    (create/accept/revoke/common-link), `sharedLists-create` and `-delete`.
  - **No-op stubs** for everything sales/Apollo/billing/Slack/internal-notifications/legacy
    callables — they return `{ success: true }` so the SPA UI doesn't surface errors.
  - **Auth trigger** at `src/triggers/userOnCreate.ts` seeds `users/{uid}` and
    `individualSubscriptions/{uid}` with an active, never-expiring "self-hosted" plan,
    so the client's `isPremiumUser()` check returns true.
- Client patches:
  - `app/src/utils/EnvUtils.ts`: added `isSelfHosted()`.
  - `app/src/firebase.js`: in self-host, connects to the emulator on `window.location.hostname`
    regardless of host. The default Firebase init args are swapped to dummy values.
  - `app/src/hooks/featureLimiter/useFeatureLimiter.ts`: forces `isUserPremium=true` in self-host.
  - `app/src/utils/feature-flag/growthbook.js`: points `apiHost` at a dead URL so flags fall
    back to local defaults, and `loadFeatures()` is skipped from `AppLayout`.
  - `app/src/hooks/AuthHandler.ts`: skips `getEnterpriseAdminDetails`/`getOrganizationUsers`
    calls in self-host mode (they're stubbed server-side anyway).
  - `app/src/store/slices/global/modals/case-reducers.ts`: silently ignores
    `pricingModal` open requests in self-host mode. The component stays intact for
    upstream merges.
  - `app/.env.self-hosted`: env file for the Docker build.
- Docker stack at `docker/`:
  - `Dockerfile.app` — multi-stage build, outputs an nginx image serving Vite's `app/build/`.
  - `Dockerfile.functions` — Node + OpenJDK + firebase-tools, runs the Emulator Suite.
  - `docker-compose.yml` — wires the two containers; persists emulator data to a named volume.
  - `nginx.conf` — SPA-friendly try_files fallback.
- `self-host-docs/README.md` — user-facing quickstart.

**The build has not been tested end-to-end.** `docker compose up --build` is the next thing
to try. Likely failure points to keep in mind:
- TS compile errors in `server/functions/src/`. I wrote it from memory of the firebase-functions
  v6 API; should mostly be right but expect 2-3 small fixes (e.g., `FieldValue.delete()` import,
  identity-triggers package availability).
- `app/.env.self-hosted` may need fields I missed — the SPA's `config/constants/sub/links.js`
  reads `VITE_BACKEND_BASE_URL`, etc. Currently empty strings; some "open external link" features
  may break but core functionality should be unaffected.
- The Firebase Auth Emulator's `beforeUserCreated` blocking trigger requires Identity Platform.
  If the emulator doesn't support it out of the box, fall back to a Firestore `onCreate` trigger
  on a sentinel collection that the SPA writes after sign-up.
- The browser will hit CORS issues calling `localhost:8080`/`9099`/etc. from the SPA at port 3000
  *unless* the user opens devtools and inspects. The Firebase SDK uses XHR/fetch with
  appropriate CORS, and the emulator sets permissive headers — should be fine but verify.

**Next session, start here:**
1. `cd ./requestly-selfhosted && docker compose -f docker/docker-compose.yml up --build`.
   Fix whatever explodes. Likely:
   - npm install in the build stage may need `--legacy-peer-deps`. The app uses some old
     antd that has peer-dep conflicts with newer React.
   - The `app/package.json` `postinstall` script runs `patch-package` which expects `patches/`
     to exist — it does, so should be OK.
2. Smoke-test the SPA: sign up, create a workspace, create a rule, save it, refresh, confirm
   the rule persisted (Firestore emulator state survives the container restart via the
   `emulator-data` volume).
3. Sweep the remaining sales nudges that I didn't gate. Run:
   `grep -rE "Upgrade|Pricing|paywall|premium" app/src --include="*.tsx" --include="*.jsx"`
   and add `isSelfHosted()` guards to any visual upsell banner. The Redux modal blocklist
   already kills the pricing modal; what remains is inline upgrade-CTAs in lists/sidebars.
4. Wire the mock-server (separate concern; the standalone `requestly-mock-server` project
   isn't in this repo).
5. Document desktop deep-link auth (we won't get to it in v1).

**Useful greps to re-run:**
```bash
# All cloud function names referenced from client
grep -rE "httpsCallable\(" app/src | grep -oE '"[a-zA-Z][-a-zA-Z]*"' | sort -u

# All firestore collections
grep -rhE "collection\([^,]+, *\"[^\"]+\"" app/src | grep -oE '"[a-zA-Z_]+"' | sort -u
grep -rhE "doc\([^,]+, *\"[^\"]+\"" app/src | grep -oE '"[a-zA-Z_]+"' | sort -u

# All firebase imports outside of firebase.js
grep -rE "from \"firebase/" app/src | grep -v "firebase.js"

# All places that check user.isPremium
grep -rE "isPremiumUser|isPremium|getCurrentPlanId" app/src
```

**Existing emulator wiring:** the dev team has `app/.env.dev-emulator` set up to talk to localhost
emulators on the standard ports. Use this as the template for `.env.self-host`. The `run.sh` script
expects a `firebase/functions` directory at the repo root — we're putting ours at `server/functions`
to avoid implying we own that location.

---

## 8. Reference: the original (deprecated) project docs

The original CLAUDE.md had a high-level overview of the directory structure. I've moved that into
the `app/CLAUDE.md` for the React app, and `claude.md` at the root (lower-case) still has the same
content for now. Once we've made enough self-host progress this whole file should be split into:
- `CLAUDE.md` (this) — self-host project notes
- `docs/architecture.md` — the original overview content
- `self-host-docs/` — end-user setup docs
