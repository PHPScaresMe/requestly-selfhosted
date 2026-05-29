# Self-hosting Requestly

This is an in-progress effort to make Requestly fully self-hostable with no
proprietary backend dependency. The upstream project ships a free MIT-licensed
client (this repo) but the backend (`requestly-backend`) is closed-source — this
fork provides an open-source replacement that runs against the Firebase Emulator
Suite locally.

**Status: alpha.** Auth, rules, API client (single-user), shared lists, and
basic team workspaces are wired. Stripe / Apollo / sales UI is suppressed.
Desktop deep-link sign-in, session-recording cloud upload, and the mock-server
URLs (`requestly.tech`) are not yet covered. See `CLAUDE.md` at the repo root
for the project notebook.

## Quickstart

```bash
git clone <this fork>
cd requestly-selfhosted
docker compose -f docker/docker-compose.yml up --build
```

Open <http://localhost:3000>. The first sign-up creates the user account (the
Firebase Auth Emulator accepts any email/password). Subsequent sign-ins use the
same credentials.

## Ports

| Service             | Host port | Purpose                       |
| ------------------- | --------- | ----------------------------- |
| nginx (SPA)         | 3000      | The Requestly UI              |
| Firebase Emulator UI | 4000     | Browse Firestore/RTDB/Auth    |
| Cloud Functions     | 5001      | Our open-source callable funcs|
| Firestore           | 8080      | Document store                |
| Realtime DB         | 9000      | Live-sync paths               |
| Auth                | 9099      | Sign-in / token issue         |
| Storage             | 9199      | File uploads (sessions, etc.) |

The SPA's Firebase SDK connects to `window.location.hostname` at each of these
ports — for Docker that's `localhost`. If you deploy this stack to a real server,
make sure all these ports are reachable from the browser (or stick all of them
behind a reverse proxy that path-routes by Firebase emulator convention).

## Persistence

Emulator data is exported to a Docker named volume (`emulator-data`) on shutdown
and re-imported on startup. To wipe state, `docker compose down -v`.

## What works / doesn't

**Works:**
- Email/password sign-up and sign-in.
- Rule editor (HTTP rules — redirect, modify headers, response, etc.).
- API client (REST testing — single-user, cloud-synced workspaces, environments).
- Mock server (in-app, served via the desktop proxy / extension webRequest).
- Shared lists (public read-only rule links).
- Workspaces & basic team invites (admin can invite by email).
- Browser extension talking to the SPA.

**Doesn't yet (PRs welcome):**
- Google/GitHub/SAML SSO providers — emulator accepts the SDK calls but you'd
  need to configure provider keys; default password auth is the easy path.
- Desktop app deep-link sign-in — the `auth-generateCustomToken` function works
  but the Electron wrapper isn't part of this repo.
- Cloud session-recording upload — the storage emulator stores blobs fine, but
  the share-by-link page needs an unauthenticated read rule (currently locked
  down).
- `requestly.tech/api/...` mock URLs (the standalone `requestly-mock-server`
  project isn't wrapped here yet).

## What's stubbed

A handful of cloud functions exist only to push leads into the upstream sales
funnel (Apollo email sequences, internal Slack notifications, "request to add a
plan", etc.). These are no-ops in self-host mode. See
`server/functions/src/notifications/` and `server/functions/src/billing/`.

The pricing modal is suppressed at the Redux action layer so it never opens.
The `<PremiumFeature>` paywall popover is suppressed because every self-host
user is treated as premium (see `app/src/hooks/featureLimiter/useFeatureLimiter.ts`).

## Hacking

```bash
# Run the emulator + functions locally without Docker:
cd server/functions && npm install && npm run build
cd .. && npx firebase emulators:start --project requestly-self-hosted

# In another terminal, run the SPA in dev mode against the same emulator:
cd app && cp .env.self-hosted .env.local && npm run dev
```

The dev server runs on whatever port Vite picks (usually 5173); the Firebase SDK
inside the SPA will still hit `localhost:8080` etc.
